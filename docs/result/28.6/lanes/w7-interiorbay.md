# Task 28.6 — Lane P5 (W7) — interiorbay.co.kr

**Host:** `interiorbay.co.kr` (nginx, Sitecook-family Korean site builder, jQuery 1.8.3, **server-side UA-branched desktop/mobile templates**)
**Routes in scope:** `/` and `/kwa-38941-515`
**Status:** PARTIAL — the root pipeline ran end to end and produced a clone; the second pipeline, seeded on `/kwa-38941-515`, **failed** at `interaction-modeling` (§5.1). 10 clone pairs graded, 0 failed: **7 BLOCKER, 3 MAJOR, 0 MINOR, 0 PASS**. Self-check floor on the identical 10 pairs: **0 BLOCKER, 3 MAJOR, 1 MINOR, 6 PASS** — the cleanest floor in the programme so far, and 5/5 PASS on `/kwa-38941-515`.
**Why this lane is load-bearing:** this is the corpus's first *table-shaped*, *zero-breakpoint*, *dual-document* site. 155 `<table>` elements against 0 grid containers and 1 flex container; **zero authored `@media` width conditions in the entire desktop stylesheet set** (16 sheets, 7 925 declarations, measured by `curl` before the pipeline ran); and a server that serves a **different HTML document to a mobile UA at the same URL**. Every prior pilot was flex/grid-shaped and breakpoint-driven, so every number below is a first measurement, not a regression check.

---

## 0. Independent ground truth, taken with `curl` before the pipeline ran

All fetched into `tmp/wr286/w7-interiorbay/`. This is the yardstick every engine number below is read against.

| Probe | Result |
|---|---|
| `https://interiorbay.co.kr/` | `200`, 114 465 B |
| `https://www.interiorbay.co.kr/` | `200`, 114 465 B (identical bytes) |
| `https://interiorbay.co.kr/kwa-38941-515` | `200`, 43 742 B |
| `http://www.interiorbay.co.kr/kwa-38940` | `302 → https://interiorbay.co.kr:54306/kwa-38940`, then `200` — **a non-standard port** |
| Same two URLs with an iPhone UA | `/` → 97 450 B (**different document**), `/kwa-38941-515` → 46 094 B (**larger than the desktop one**) |

**Table census in the raw HTML** (`<table>` / `<tr>` / `<td>` / `<th>`):

| Document | tables | tr | td | th | colspan | rowspan |
|---|---|---|---|---|---|---|
| `/` desktop UA | **119** | 131 | 273 | 4 | 0 | 0 |
| `/` mobile UA | **11** | 11 | 12 | 0 | 0 | 0 |
| `/kwa-38941-515` desktop UA | **2** | 10 | 15 | 0 | 0 | 0 |
| `/kwa-38941-515` mobile UA | **0** | 0 | 0 | 0 | 0 | 0 |

115 of the 119 homepage tables carry `cellspacing="0" cellpadding="0" border="0"` presentational attributes; 0 carry `colspan`/`rowspan`.

**Authored CSS census** — 16 desktop stylesheets, all `200`, 358 kB, fetched individually:

| Measure | Value |
|---|---|
| `@media` conditions containing a `min-width`/`max-width` | **0** |
| Total declarations (`;` inside blocks) | 7 925 |
| `border-collapse:` declarations | 7 (all `collapse`, all under `#estimate_board`, `#bid_details`, `.ui-datepicker`) |
| `border-spacing:` declarations | 16 (all `0`) |
| `table-layout:` / `empty-cells:` / `caption-side:` declarations | 0 / 0 / 0 |
| `vertical-align:` declarations | 109 |
| `@import` rules | 3 in `/works/css/main_css.css` (1 same-origin, 2 Google Fonts) |
| Inline `<style>` blocks with a width `@media` | 0 of 4 documents |

`#estimate_board`, `#bid_details` and `.ui-datepicker` appear **0 times** in either graded route's HTML, so the only correct computed `border-collapse` on these two routes is `separate`. That is what makes the capture check in §6 falsifiable.

---
## 1. What I ran, in order — exact commands

| # | Command | Wall clock (UTC) | Output |
|---|---|---|---|
| 0 | `curl` of both routes at desktop and mobile UA + all 16 desktop stylesheets | 23:13:04 → 23:13:20 | `tmp/wr286/w7-interiorbay/{apex,www,sub,apex-mobile,sub-mobile}.html`, `tmp/wr286/w7-interiorbay/css/d01..d16.css` |
| 1 | `pnpm e2e:reconstruct https://interiorbay.co.kr/ --max-urls 20 --concurrency 2 --family-escalation 4 --prepare-scroll` | 23:13:13 → 23:32:06 (**18 m 53 s**) | run ids below |
| 2 | `pnpm qa:responsive data/interiorbay.co.kr/reconstructions/2026-09-02T23-22-34-449Z/reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes /` | 23:32:44 → 23:35:33 (**2 m 49 s**) | `data/interiorbay.co.kr/responsive-qa/2026-09-02T23-32-44-435Z` |
| 3 | Same manifest, `--widths 390,700,1024,1100,1440 --routes '/,/kwa-38941-515' --self-check --no-diff-images` | 23:35:46 → 23:40:07 (**4 m 21 s**) | `data/interiorbay.co.kr/responsive-qa/2026-09-02T23-35-46-720Z` (**the floor**) |
| 4 | `pnpm e2e:reconstruct https://interiorbay.co.kr/kwa-38941-515 --max-urls 12 --concurrency 2 --family-escalation 4 --prepare-scroll` | 23:40:5x → see §1.2 | run ids below |
| 5 | `pnpm qa:responsive <run-4 manifest> --widths 390,700,1024,1100,1440 --routes /kwa-38941-515` | see §1.2 | see §1.2 |

I used the end-to-end command, never individual stages.

**Why there are TWO pipelines.** The brief's second route is `/kwa-38941-515`. Discovery (firecrawl) returned 20 URLs for the root and **not one of them was in the `/kwa-38941-*` family** — it returned `/kwa-38940`, `/kwa-39007`, `/kwa-39039`, `/kwa-39060`, `/kwa-39061`, `/kwa-39068`, `/kwa-39072` and eight `?category_2=` variants. The route is nevertheless linked twice from the homepage (`href="kwa-38941-515?category_3=03"`, measured in the raw HTML), so this is a discovery-recall fact, not a site fact. Run 1's `route-map.json` has 20 routes and `/kwa-38941-515` is not among them, so grading it against run 1's clone would have measured "route not generated", not fidelity. Run 4 is seeded on the sub-page so it becomes a root-protected, exactly-observed route. `--max-urls 12` rather than 20 because run 4's whole verified set is 7 URLs — the cap never bound.

`--prepare-scroll` is on for both runs, matching pilot 1's orchestrator note so the runs stay comparable. It is a generic pipeline flag.

**Engine stability during this lane.** Newest mtime under `src/` or `scripts/` when I started: `src/observer/types.ts`, 2026-09-02T23:02:55Z. My first pipeline command started 2026-09-02T23:13:13Z. This lane wrote nothing under `src/` or `scripts/` and read no engine file with intent to modify.

### 1.1 Run 1 run ids (root)

| Stage | Directory / file |
|---|---|
| e2e manifest | `data/interiorbay.co.kr/e2e-runs/2026-09-02T23-13-13-927Z/e2e-manifest.json` |
| discovery / verify / select | `data/interiorbay.co.kr/2026-09-02T23-13-25-801Z/` |
| observation | `data/interiorbay.co.kr/site-observations/2026-09-02T23-14-14-300Z/` |
| interaction exploration | `data/interiorbay.co.kr/interaction-explorations/2026-09-02T23-19-49-333Z/` |
| interaction models | `data/interiorbay.co.kr/interaction-models/2026-09-02T23-22-31-913Z/` |
| SiteSpec | `data/interiorbay.co.kr/site-specs/2026-09-02T23-22-33-086Z/` |
| reconstruction | `data/interiorbay.co.kr/reconstructions/2026-09-02T23-22-34-449Z/` |
| reconstruction QA | `data/interiorbay.co.kr/reconstruction-qa/2026-09-02T23-23-59-735Z/` |
| **responsive QA (graded, `/`)** | `data/interiorbay.co.kr/responsive-qa/2026-09-02T23-32-44-435Z/` |
| **responsive QA (self-check floor, both routes)** | `data/interiorbay.co.kr/responsive-qa/2026-09-02T23-35-46-720Z/` |
| my scratch | `tmp/wr286/w7-interiorbay/` |

Stage results from the e2e manifest, verbatim: discovery raw=20 normalized=20 duplicates=0 invalid=0 externalFiltered=0 rootSeeded=1; verification candidates=21 validHtml=21 verified=20 httpErrors=0 navigationErrors=0 blocked=0; selection families=8 selected=8 reduced=12 largestFamily=13; observation plannedPages=9 observedPages=9 failedPages=0 assetOccurrences=1461 uniqueAssetIdentities=977 scrollContainers=6; interaction-detection candidates=514 targets=32; interaction-exploration planned=13 executed=9 changed=7 noChange=2 skipped=485; interaction-modeling patterns=3 unknowns=10 aiCalls=0; sitespec routes=20 pages=9 styleTokens=1427 assets=408 imageNodes=1000 assetBoundImageNodes=1000; reconstruction routes=20 elementNodes=17780 textNodes=7574 styleRules=1404 layoutRecoveredRules=1367; build exitCode=0 buildMs=2673; qa pageViewports=18 completed=17 routesChecked=20 routesRendered=20 runtimeJsErrors=0; family-escalation candidates=0; final-validation files=28 bytes=5 996 496 originalScripts=0 originalStylesheets=0 originStackDependencies=0. **No stage crashed or refused.** Final status `complete-with-known-limitations`.

Stage wall clock (ms): discovery 11 876, verification 48 483, selection 8, observation 334 459, interaction-detection 439, interaction-exploration 162 687, interaction-modeling 41, sitespec 1 917, reconstruction 82 842, build 2 673, qa 487 231, family-escalation 0, final-validation 24.

Artifact bytes written by run 1: observation 84 623 723, interaction-exploration 2 645 148, interaction-modeling 42 049, sitespec 57 981 112, reconstruction 6 009 026, qa 72 079 476 — **223.4 MB**.

---

## 2. Engine-change measurements (run 1, root)

### 2.1 Stylesheet coverage — blocked / recovered / missed

From `data/interiorbay.co.kr/site-observations/2026-09-02T23-14-14-300Z/pages/p000001/observation.json`, `viewports.<vp>.stylesheetCoverage`:

| Field | desktop | mobile |
|---|---|---|
| `stylesheetsTotal` | 17 | 19 |
| `cssomReadable` | **17** | **19** |
| `cssomBlocked` | **0** | **0** |
| `fallbackRecovered` | 0 | 0 |
| `fallbackMissed` | **0** | **0** |
| `bytesCaptured` | 1 004 099 | 1 096 003 |
| `bytesBridged` | 0 | 0 |
| `sheetsRedirectResponses` | **0** | **0** |
| `sheetsRedirectAliasesKeyed` / `sheetsRedirectChainsTruncated` | 0 / 0 | 0 / 0 |
| `rulesIndexed` | 1 690 | 2 391 |
| `ruleIndexCapHit` | false | false |
| `elementsWithAuthoredRules` | 1 202 | 1 804 |
| `importRulesVisited` / `Followed` / `Recovered` / `Unresolved` | 3 / 1 / 0 / **2** | 6 / 3 / 0 / **3** |
| `fontFaceUrlsHarvested` | 23 | 31 |
| `fontFaceUrlsSheetResolved` | **23** | **31** |
| `fontFaceUrlsDocumentResolved` | 0 | 0 |
| `fontFaceUrlsAbsolute` | 0 | 0 |

**Stylesheet coverage is 100 %: 0 blocked, 0 missed, 0 bridged, 0 recovered because nothing needed recovering.** The "redirected stylesheet is recovered instead of lost" change is **untested by this site** — `sheetsRedirectResponses` is 0 on both viewports, so the recovery path never ran. I could not measure it; I am not reporting it as working.

**The `@font-face` URL change fired and is fully exercised:** 23 desktop / 31 mobile `@font-face` URLs harvested, **every one of them resolved against its own sheet** (`fontFaceUrlsSheetResolved` = `fontFaceUrlsHarvested`), `fontFaceUrlsDocumentResolved` = 0. All 23/31 are relative URLs inside `/fonts/NotoSansKR/NotoSanskr.css` and the slick theme sheets, which sit at a different directory depth from the document — under document-relative resolution every one of them would have resolved to a wrong path. This site is a clean positive for that fix.

**Measured coverage gap, generic:** `importRulesUnresolved` is 2 (desktop) and 3 (mobile) while `importRulesRecovered` is 0. The unresolved ones are the two cross-origin Google Fonts sheets `@import`ed from `/works/css/main_css.css` (`Noto+Sans+JP`, `Roboto+Condensed`). A cross-origin `<link>` stylesheet gets the fetch-fallback that produced `fallbackRecovered`; a cross-origin `@import` does **not** — it is counted `importRulesUnresolved` and dropped. Both faces' `@font-face` blocks are therefore absent from the 23 harvested URLs. The counter is honest; the recovery is asymmetric between the two ways a site can reference a sheet.

### 2.2 Authored declarations and the derived probe width set

`layoutProbe.widthProvenance` and `layoutProbeMobile.widthProvenance`, page `p000001`:

| Field | desktop pass | mobile pass |
|---|---|---|
| `floorWidths` | 390, 700, 768, 1024, 1100, 1440, 1920 | 390, 480, 700, 768, 914 |
| **widths actually sampled** | **390, 700, 768, 1024, 1100, 1440, 1920** (7) | **359, 360, 390, 480, 600, 601, 639, 640, 700, 768, 914** (11) |
| `conditionsRead` | 1 | 4 |
| `conditionsWeight` | 12 | 16 |
| `conditionsWidthIrrelevant` | **12** | 13 |
| `conditionsUnsupported` / `conditionsUnparsed` | 0 / 0 | 0 / 0 |
| `breakpointsFolded` / `Adopted` | **0 / 0** | **3 / 3** |
| `widthsAdded` | **0** | **6** |
| `breakpointsDroppedByCap` / `breakpointsRefused` | 0 / `[]` | 0 / `[]` |
| `capHit` | false | false |
| `floorWidthsEvicted` / `breakpointsAdoptedByEviction` | `[]` / 0 | `[]` / 0 |
| `degradedToFloor` | **true** | false |
| `degradedReason` | **`no-width-breakpoints`** | — |
| `guaranteedFloorWidths` | 390, 1024, 1920 | 390, 700, 914 |

**Provenance, in full: every one of the 7 desktop probe widths is `{"source":"floor"}`.** The desktop document authors exactly one `@media` condition — `screen and (-webkit-min-device-pixel-ratio: 0)`, weight 12 — and it carries no width bound, so `conditionsWidthIrrelevant` is 12 and `breakpointsFolded` is 0. The site-derived probe machinery therefore contributed **nothing** on the desktop pass, and `degradedToFloor: true` + `degradedReason: "no-width-breakpoints"` says so out loud rather than letting a floor-only set read as a derived one. That is correct behaviour and it is the honest-degradation property working.

**The mobile pass is the opposite and it is the finding.** The *mobile document* — a different HTML file with 19 different stylesheets — authors 4 conditions and 3 real width breakpoints: `(min-width: 360px)`, `(max-width: 600px)`, `(min-width: 640px)`. All three were folded, all three adopted whole, 6 widths added, cap never hit. So **this site authors breakpoints and the desktop pass cannot see any of them, because they live in a document only a mobile user agent is served.** §2.4 is where that costs something.

### 2.3 Band edges snapped versus midpoint-kept

| Counter | Value |
|---|---|
| `responsiveHidden` (banded rules shipped) | **0** |
| `bandEdgesOpen` | 0 |
| `bandEdgesConsidered` | **0** |
| `bandEdgesSnapped` | 0 |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 |
| `bandEdgeSnapShiftPx` | 0 |
| `bandSampleMismatches` | 0 |
| `bandCheckable` / `rejectedByBandCheck` / `bandWidthsRendered` | 0 / 0 / 0 |

**The band-edge snapper is untested by this site.** Not one responsive-hide band was built, so 0 edges were offered to it and every "kept the midpoint" channel is 0 for the same reason. This is the expected consequence of a source with no width media queries in the tree that gets probed: nothing is hidden at one width and shown at another, so there are no bands. Reported as a measurement I could not take, not as a pass.

The supporting authored-breakpoint accounting *did* run: `authoredBreakpointPages: {"spec-field": 16}` (all 16 viewport passes read the histogram from the SiteSpec field, none from a fallback), `authoredBreakpointEntries: 8`, `authoredBreakpointDeclarations: 125 415`, `authoredBreakpointUnparsedDeclarations: 0`, `authoredBreakpointTruncatedNodes: 25`. **125 415 authored declarations were examined and 0 failed to parse**; 25 nodes had their authored-declaration list truncated by the observation, so the histograms are incomplete by that much and any "the source authored nothing here" verdict carries that caveat.

### 2.4 The tree switch — chosen value, method, provenance

`config.inferredBreakpoint` in `reconstruction-manifest.json`:

```
value                             915
provenance                        inferred
method                            observed-endpoint-midpoint
fallbackReason                    empty-histogram
mobileObservedWidth / desktop     390 / 1440
candidateCount                    0
ambiguous                         false
candidatesOutsideObservedInterval 0
candidatesOmitted                 0
candidates                        []
pagesRead                         9
pagesWithHistogram                9
pagesWithUsableProbe              8
treeDivergence                    dual-dom
pagesIdenticalWalk                0
pagesDivergentWalk                9
pagesWalkNotComparable            0
domSwitchWidthObserved            false
```

**The C1 change made no difference on this site: 915 shipped again, by the midpoint, with `fallbackReason: "empty-histogram"`.** The emitted `app/app/globals.css` says so in its own comment — *"Breakpoint 915px, inferred — observed-endpoint-midpoint, from observed widths 390 and 1440"* — and emits `@media (max-width: 914.98px){[data-wr-viewport="desktop"]{display:none}}` / `@media (min-width: 915px){[data-wr-viewport="mobile"]{display:none}}`.

**The divergence classifier got it exactly right: `dual-dom`, 9 of 9 pages divergent, 0 identical, 0 not-comparable.** I corroborated it independently: the two element walks of `p000001` diverge at **element index 6** (desktop `div`, mobile `a`), and the walks are 2 622 vs 2 211 elements with 155 vs 31 `<table>` elements. The `<table>` counts alone are a 5× structural difference between the two documents at one URL.

**`domSwitchWidthObserved: false` is present and correct, and the limitation is DECLARED, not papered over.** `reconstruction-manifest.json → limitations` contains `tree-switch-dom-width-not-observed` alongside `breakpoint-inferred`, and `sourceLimitations` contains `breakpoints-not-inferred` and `cross-viewport-node-matching-not-performed`. The grader declares the same thing from the other side: `src/responsive-qa/capture.ts:55-64` states in code that every width uses one desktop-shaped context and that *"at 390 the SOURCE may serve its desktop UA branch, and the CLONE — whose subtree choice is width-only — will render its mobile subtree below the generated breakpoint. That is the thing to measure, not something to work around."* Both halves of the engine name this limitation before it happens. §4 is what it costs.

### 2.5 Desktop / mobile recovered-rule split

| Counter | Value |
|---|---|
| `viewportPasses` | `{desktop: 9, mobile: 9}` |
| `viewportPassesUsed` | `{desktop: 8, mobile: 8}` |
| `viewportPassRefusals` | `{"desktop:probe-not-attached": 1, "mobile:probe-not-attached": 1}` |
| `rulesByViewport` | `{desktop: 162, mobile: **1 207**}` |
| `shippedRulesByViewport` | `{desktop: 162, mobile: **1 205**}` |
| `recoveredRules` (total shipped) | 1 367 |
| by kind | `full-width` 1 244, `percentage-width` 85, `centered-max-width` 38, `responsive-hidden` 0, `grid-track-columns` 0 |
| `widthModeStretch` / `widthModeFillPercentage` | 1 221 / 61 |
| `widthModeRefusals` | 0 |

**This is the headline change, and it fired hard: 1 205 of the 1 367 shipped layout rules (88.2 %) are MOBILE-subtree rules, on a site whose mobile subtree previously received exactly zero.** Both refusals are the same one page (`p000009`, the validation sample) whose probe was not attached, counted on both viewports rather than silently skipped.

Corroborated in the emitted stylesheet: `app/public/wr/generated-styles.css` carries 1 265 selectors of the form `[data-wr-page="…"][data-wr-viewport="mobile"] [data-wr-node="…"]` against 302 desktop ones (selector counts, not rule counts — one rule can carry several page selectors — so read the manifest's 1 205 / 162 as the rule split and this only as corroboration that the mobile pass reached the CSS).

### 2.6 The inline-size outcome partition, including `no-branch-matched`

| Population | Count |
|---|---|
| `nodesWithProbe` | **17 266** |
| `inlineSizePreStageDrops.display-not-blockish` | 6 408 |
| `inlineSizePreStageDrops.hidden-at-truth-width` | 6 332 |
| `inlineSizePreStageDrops.truth-sanity-mismatch` | 38 |
| `inlineSizeCandidates` | **4 488** |
| → `emitted-full-width` | 1 244 |
| → `emitted-percentage-width` | 87 |
| → `emitted-centered-max-width` | 38 |
| → `refused-containing-block-guard` | 186 |
| → **`no-branch-matched`** | **2 933** |
| `inlineSizeOutcomeDoubleCounts` | 0 |

The partition closes exactly: 6 408 + 6 332 + 38 = 12 778 pre-stage drops, 12 778 + 4 488 = 17 266 = `nodesWithProbe`; and 1 244 + 87 + 38 + 186 + 2 933 = 4 488 = `inlineSizeCandidates`. No double counts.

**2 933 probed nodes — 65.4 % of every candidate — matched no branch and therefore ship their exact computed width, frozen at the truth viewport, at every viewport width.** That is the population the pre-28.6 artifact had no field for, and on this site it is the majority. It is directly visible in the emitted CSS: `generated-styles.css` contains **115 style tokens carrying an absolute `width ≥ 1000px` and zero `@media` conditions of any kind** —

| Frozen width | Style tokens |
|---|---|
| 1440 px | 89 |
| 1800 px | 8 |
| 1030 px | 7 |
| 1000 px | 2 |
| 3285 px | 2 |
| 2997 px | 2 |
| 22663.4 px | 1 |
| 9270 px | 1 |
| 7760 px | 1 |
| 2448 px | 1 |
| 1525 px | 1 |
| **total** | **115** |

`@media` count in `generated-styles.css`: **0**. Every media query in the app is the two-line variant switch in `globals.css`.

**Accounting gap I measured, and it is generic.** `no-branch-matched` is a single terminal outcome with no sub-reason. `InlineSizeOutcome` (`src/reconstruction/layout-inference.ts:274-301`) lists nine specific outcomes plus this one, and the artifact carries the count and nothing else. So for 2 933 of 4 488 candidates the manifest can say *that* every predicate was evaluated and none held, but not *which one came closest* — a `width: 1440px` box and a `width: 22663.4px` slick track are the same number in the artifact. The refusals (`refused-containing-block-guard` 186) are broken out by reason; the largest population is not.

### 2.7 Guard refusals and the parent content box

| Counter | Value |
|---|---|
| `rejectedByGuard` | 186 |
| `guardRefusalsByReason.abs-containing-block-not-parent` | 98 |
| `guardRefusalsByReason.parent-padding-not-constant` | **64** |
| `guardRefusalsByReason.fixed-position` | 24 |
| `widthValueRefusals` | 0 |
| `gridTrackColumns` / `gridTrackRefusals` | 0 / 0 |

`parent-padding-not-constant` fired 64 times, which is the guard the "parent content box is now MEASURED per width from sibling geometry" change exists to relieve — and **I could not measure how often the measurement relieved it**, because the counters that would say so never reach any artifact. See §6, defect E1.

`gridTrackColumns: 0` and `gridTrackRefusals: 0` are the expected reading of a site with 0 grid containers: the grid-track recovery kind had nothing to work on. Its absence is a fact about the site, not a defect.

### 2.8 Truth-check accounting, every drop explained

| Counter | Value |
|---|---|
| `truthCheckStatus` | `verified` |
| `truthCheckable` | 1 369 |
| `candidateRules` | 1 369 |
| `acceptedRules` | **1 367** |
| `rejectedByTruthCheck` | **2** |
| `rejectedUnverifiable` | **0** |
| `acceptedUnchecked` | **0** |
| `acceptedRegressed` | **0** |
| `rejectedByBandCheck` | 0 |
| `truthCheckRounds` / `truthCheckPagesRendered` / `truthCheckConverged` | 18 / 16 / true |

1 369 candidates → 1 367 shipped. The two drops are both `rejectedByTruthCheck`; nothing shipped unverified (`acceptedUnchecked` 0), nothing shipped after regressing (`acceptedRegressed` 0), and nothing was dropped for being unmeasurable (`rejectedUnverifiable` 0). **The accounting closes with no residue.** 186 further candidates never reached the truth check because a guard refused them first (§2.7), which is a separate, itemised population.

---

## 3. The grading floor — `--self-check`, run `2026-09-02T23-35-46-720Z`

Source against a second capture of itself, same 2 routes × 5 widths, same rubric. **This is the floor every clone verdict below must be read against.**

| Route | Width | Floor verdict | B/M/m | Channel that fired | Number |
|---|---|---|---|---|---|
| `/` | 390 | **MAJOR** | 0/1/1 | `overlap-excess-ratio` | 4.30 % over itself (thr 2.00 %); pixel residual 5.13 % |
| `/` | 700 | **MINOR** | 0/0/1 | `pixel-residual-difference-ratio` | 6.87 % (thr 1 %) |
| `/` | 1024 | **PASS** | 0/0/0 | — | pixel residual 0.25 % |
| `/` | 1100 | **MAJOR** | 0/1/0 | `overlap-excess-ratio` | 2.09 % over itself (thr 2.00 %) |
| `/` | 1440 | **MAJOR** | 0/1/0 | `overlap-excess-ratio` | 7.38 % over itself (thr 2.00 %) |
| `/kwa-38941-515` | 390 | **PASS** | 0/0/0 | — | pixel residual **0.00 %** |
| `/kwa-38941-515` | 700 | **PASS** | 0/0/0 | — | 0.00 % |
| `/kwa-38941-515` | 1024 | **PASS** | 0/0/0 | — | 0.00 % |
| `/kwa-38941-515` | 1100 | **PASS** | 0/0/0 | — | 0.00 % |
| `/kwa-38941-515` | 1440 | **PASS** | 0/0/0 | — | 0.00 % |

**Floor: 0 BLOCKER, 3 MAJOR, 1 MINOR, 6 PASS over 10 pairs.** This is the *cleanest* floor measured in the programme so far (prior floors: 7 PASS on hobbang.net, 9 on gs.severance.healthcare, 4 on seoultone.kr, all over 10 pairs). **PASS is empirically reachable on this source, and on `/kwa-38941-515` it is reachable at every one of the five widths with a 0.00 % pixel residual** — that route is a completely static document. So every BLOCKER I report on that route is 100 % attributable to the clone, with no instrument noise to hide behind.

The homepage floor is noisy for a reason I measured: the three MAJORs are all `overlap-excess-ratio`, on a page with slick and swiper carousels and three live per-request content tables. The source overlaps its own boxes differently between two captures 30 seconds apart.

**One fact from the floor run reframes everything else in this report:** the source's document geometry is `1525 × 5402` on `/` at 390, 700, 1024 and 1100, and `1620 × 5402` at 1440; and `1525 × 12706` on `/kwa-38941-515` at **all five widths**. **The source does not reflow. At all.** It is a fixed-width desktop document with `body { min-width: 970px }`, zero width media queries, and horizontal overflow at every viewport narrower than 1525 px. Responsive behaviour on this site exists only as a *different document served to a different user agent*.

---

## 4. Verdict tables — the clone

### 4.1 `/` — run `2026-09-02T23-32-44-435Z` (5 pairs, 2 m 37 s)

| Route | Width | Verdict | B/M/m | Floor at same pair | Headline channel | Deciding number |
|---|---|---|---|---|---|---|
| `/` | 390 | **BLOCKER** | 2/3/2 | MAJOR | `missing-text-ratio` | **63.26 %** of the source's visible text is absent from the clone (thr 10 %) — 2 237 of 3 536 chars |
| `/` | 700 | **BLOCKER** | 2/4/2 | MINOR | `missing-text-ratio` | **63.26 %** (thr 10 %) |
| `/` | 1024 | **MAJOR** | 0/2/2 | PASS | `missing-text-ratio` | 4.44 % (thr 2 %) — 157 of 3 536 chars |
| `/` | 1100 | **MAJOR** | 0/2/2 | MAJOR | `missing-text-ratio` | 4.44 % (thr 2 %) |
| `/` | 1440 | **MAJOR** | 0/2/2 | MAJOR | `missing-text-ratio` | 4.44 % (thr 2 %) |

**5 measured, 0 failed. BLOCKER 2, MAJOR 3, MINOR 0, PASS 0.**

Every channel that fired, per pair:

| Width | BLOCKER | MAJOR | MINOR |
|---|---|---|---|
| 390 | `missing-text-ratio` 0.6326; `overlap-excess-ratio` 0.3137 (src 0.8035) | `column-mode-delta` 6; `pixel-visible-difference-ratio` 0.5827; `position-delta-p90-px` 494 | `pixel-residual-difference-ratio` 0.6639; `scroll-height-ratio-low` 0.8832 |
| 700 | `missing-text-ratio` 0.6326; `overlap-excess-ratio` 0.1507 (src 0.4716) | `column-mode-delta` 6; `logo-row-bunching` 1; `pixel-visible-difference-ratio` 0.5336; `position-delta-p90-px` 761 | `pixel-residual-difference-ratio` 0.6326; `scroll-height-ratio-low` 0.8832 |
| 1024 | — | `missing-text-ratio` 0.0444; `position-delta-p90-px` 960 | `empty-band-excess-ratio` 0.0652 (src 0.0222); `pixel-residual-difference-ratio` 0.2651 |
| 1100 | — | `missing-text-ratio` 0.0444; `position-delta-p90-px` 964 | `empty-band-excess-ratio` 0.0652 (src 0.0222); `pixel-residual-difference-ratio` 0.2505 |
| 1440 | — | `missing-text-ratio` 0.0444; `position-delta-p90-px` 970 | `empty-band-excess-ratio` 0.0593 (src 0.0281); `pixel-residual-difference-ratio` 0.2158 |

### 4.2 `/kwa-38941-515` — run `2026-09-02T23-45-03-997Z` (5 pairs, 1 m 3 s)

| Route | Width | Verdict | B/M/m | Floor | Headline channel | Deciding number |
|---|---|---|---|---|---|---|
| `/kwa-38941-515` | 390 | **BLOCKER** | 4/2/1 | PASS | `empty-band-excess-ratio` | 73.8 % of the page is one empty band vs the source's 1.76 % (thr 25 %) |
| `/kwa-38941-515` | 700 | **BLOCKER** | 4/2/1 | PASS | `empty-band-excess-ratio` | 80.0 % (thr 25 %) |
| `/kwa-38941-515` | 1024 | **BLOCKER** | 4/3/1 | PASS | `empty-band-excess-ratio` | 80.0 % (thr 25 %) |
| `/kwa-38941-515` | 1100 | **BLOCKER** | 4/3/1 | PASS | `empty-band-excess-ratio` | 80.0 % (thr 25 %) |
| `/kwa-38941-515` | 1440 | **BLOCKER** | 4/2/1 | PASS | `empty-band-excess-ratio` | 80.0 % (thr 25 %) |

**5 measured, 0 failed. BLOCKER 5, MAJOR 0, MINOR 0, PASS 0**, against a floor of **5 PASS with a 0.00 % pixel residual**.

All four BLOCKER channels fire identically at every width, and they all describe one fact: `missing-text-ratio` **1.0**, `visible-text-ratio` **0.1307**, `image-presence-ratio` **0** (source 32 images), `empty-band-excess-ratio` 0.738–0.800. `cloneProvenance.httpStatus` = **404**, clone document `390 × 900`, **8 nodes, 143 characters**. The clone serves its Next.js `not-found.tsx` because **the route does not exist in the generated app**. This measures route *presence*, not layout fidelity — see §5.1 for why, and §7 for what that means I could not measure.

**Combined clone total across both routes: 10 pairs measured, 0 failed — 7 BLOCKER pairs, 3 MAJOR pairs, 0 MINOR, 0 PASS.** Against a floor of 0 BLOCKER, 3 MAJOR, 1 MINOR, 6 PASS on the identical 10 pairs.

---

## 5. BLOCKERs and MAJORs, diagnosed

### B1 — `/` @390 and @700: 63.26 % of the source's text is missing, because the clone mounts the MOBILE document where the source serves the DESKTOP one

**Measured, both sides, same pair:**

| | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| source `scrollW × scrollH` | 1525 × 5402 | 1525 × 5402 | 1525 × 5402 | 1525 × 5402 | 1620 × 5402 |
| source visible chars / nodes | 3 536 / 2 624 | 3 536 / 2 624 | 3 536 / 2 624 | 3 536 / 2 624 | 3 536 / 2 624 |
| clone `scrollW × scrollH` | **390 × 4771** | **700 × 4771** | 1024 × 5402 | 1100 × 5402 | 1440 × 5402 |
| clone visible chars | **2 902** | **2 902** | 3 434 | 3 434 | 3 434 |
| `matchedFraction` | **0.3627** | **0.3627** | 0.9951 | 0.9951 | 0.9951 |
| missing chars | **2 237** | **2 237** | 157 | 157 | 157 |

`4771` is the mobile observation's `documentHeight` exactly (`responsiveSummary.mobile.documentHeight` = 4 771); `5402` is the desktop observation's exactly. So at 390 and 700 the clone is rendering the **mobile** subtree and the source is serving the **desktop** document, and the two disagree about 2 237 characters — the whole desktop-only press strip, portfolio grid, corporate footer and business-registration block. Sample missing strings at 390: `"[인천 연수구 라멘집 인테리어] …"`, `"※ 인테리어베이는 통신판매중개자로서 …"`, `"서울본사 주소 : 서울시 서초구 방배천로4안길 32 …"`, `"copyright©인테리어베이 all rights reserved."`.

**Cause, at file:line.** Two engine facts meet here and neither is a bug on its own:

1. `src/reconstruction/responsive-plan.ts` ships one width-only switch (`breakpointMediaQueries`, 915 px here) and `src/reconstruction/tree-switch.ts` states in its own header that it **cannot** observe where a two-DOM source swaps its DOM (`domSwitchWidthObserved: false`, present in this manifest).
2. `src/responsive-qa/capture.ts:55-64` deliberately uses one desktop-shaped, non-touch, desktop-UA context at every width, and predicts this exact outcome in prose.

The observation, by contrast, uses Task 05's mobile profile (DPR 3, touch, Android UA — visible in the exploration config) to capture the "mobile" tree. So the clone's mobile subtree is a *UA-branch artefact* being switched on *width*. **On a UA-branched source there is no width at which mounting the mobile subtree is correct**, and the graded consequence is 2 BLOCKER pairs.

**This is DECLARED, not papered over.** `limitations` carries `tree-switch-dom-width-not-observed` and `breakpoint-inferred`; `sourceLimitations` carries `breakpoints-not-inferred` and `cross-viewport-node-matching-not-performed`; `config.inferredBreakpoint` carries `treeDivergence: "dual-dom"`, `pagesDivergentWalk: 9`, `pagesIdenticalWalk: 0` and `domSwitchWidthObserved: false`. Nothing in the artifact claims the 915 is measured.

**What the D1 change could have done here and structurally cannot.** `aggregateAuthoredCandidates()` in `src/reconstruction/tree-switch.ts` reads `page.viewports.desktop?.authoredBreakpoints` and only that. The desktop document authors **zero** width breakpoints (§2.2), so the histogram is empty and `fallbackReason: "empty-histogram"` with `candidateCount: 0` and `candidatesOutsideObservedInterval: 0` — which reads as *"the source authored no usable breakpoint"*. **That reading is false at the site level:** the mobile document authors three (`min-width:360`, `max-width:600`, `min-width:640`), two of which (601 and 640) sit inside the switch's own observed interval `(390, 1440]`, and the probe folded and adopted all three on the mobile pass. On a UA-branched site every authored breakpoint lives in the branch the desktop-only aggregation cannot see. Neither 601 nor 640 would be *right* — the server switches on UA, not width — but the artifact should not be able to say "no candidate" when the site authored three and the pipeline measured them 40 lines away.

### B2 — `/` @390 and @700: `overlap-excess-ratio` 31.37 % and 15.07 %

Clone overlapping-leaf area exceeds the source's by 31.37 pp at 390 (source's own 80.35 %) and 15.07 pp at 700 (source's own 47.16 %), thresholds 10 %. The floor at the same pairs is 4.30 pp and 0 — an order of magnitude smaller. The overlap is a direct consequence of B1: two different documents' box trees are being compared, and the mobile document at 700 px is a 390-px-designed layout stretched to 700 with its absolutely-positioned quick-menu and slick tracks piled on top of each other.

### M1 — `/` @1024, @1100, @1440: `missing-text-ratio` 4.44 %, 157 chars

At and above 915 the clone mounts the desktop subtree and the correspondence is essentially perfect: **`matchedFraction` 0.9951, 406 of 408 leaves matched, median left-edge delta 2 px, and clone `scrollHeight` 5402 = the source's to the pixel.** The 157 missing characters are 5 strings, and the samples name them: `"231㎡ 공용오피스 인테리어"`, `"132㎡ 요가원 인테리어"`, `"82㎡ 아파트 인테리어"`, `"견적문의드립니다"` — the live per-request 실시간견적리스트 / 견적대기리스트 rows — plus one literal `"<img src='http://gtp4.acecounter.com:8080/…'>"` string that the source itself emits as *text*. The reverse channel agrees: `missing-text-reverse-ratio` 1.6 % with samples `"간편견적 신청이 접수되었습니.."`, `"99㎡ 단독주택 인테리어"`, `"0902"`.

**This MAJOR is mostly source churn, and the floor proves the harness knows it:** at 1024 the source-vs-itself pair is PASS with 0.00 % missing text, so the *specific* 157 chars did not change between the floor's two captures but did change between the observation (23:16 UTC) and the grading capture (23:34 UTC) 18 minutes later. I am recording it as a MAJOR because the rubric fired, and naming the cause as source non-determinism rather than clone loss. A `content-review` classification (the Task 26 carry-forward) is exactly what this population needs.

### M2 — `/` at every width ≥ 1024: `position-delta-p90-px` 960 / 964 / 970 px

With `matchedFraction` 0.9951 and **median left-edge delta 2 px**, the p90 of 970 is a tail, not a shift. `correspondence` at 1440: `leftDelta {median 2, p90 970, max 3600}`, `offViewportMatchedPairs: 4` with `offViewportLeftDelta {median 2132, p90 3600, max 3600}`. Those are the slick/swiper carousel slides: the source's track is transformed to one slide and the clone's frozen track puts the same labelled leaves 3 600 px away. Corroborated by the emitted CSS, which carries a `width: 22663.4px` and a `width: 9270px` token with no media condition (§2.6). **90 % of the desktop clone's matched geometry is within a few pixels of the source; the whole p90 is carousel tracks.**

### M3 — `/` @390 and @700: `column-mode-delta` 6

Source `sourceMaxColumns` 6 / clone 6 at 1440 with `worstModeDelta` 0, but 6 at 390/700 — again a two-document artefact, not a column-inference failure: the desktop document's 6-column portfolio grid is being compared against the mobile document's stacked list.

### M4 — `/` at every width ≥ 1024: `empty-band-excess-ratio`, and the one visible defect the rubric only ranks MINOR

`largestEmptyBandRatio` is **0.0874 on the clone at 1024, 1100 and 1440** — the same number at all three widths — against the source's 0.0222 / 0.0222 / 0.0281. The excess (6.52, 6.52, 5.93 pp against a 2 pp MINOR threshold) fires MINOR only, but it is the most obvious difference a human sees in the desktop pairs after the carousel slide: wide white gaps where the source paints its second estimate table (견적대기리스트) and its two 인테리어 트렌드 cards. The clone's *text* for those regions is present — only 157 characters are missing site-wide — and `offscreenTextChars` on the clone is **0** at both widths against the source's 27 and 4, so the content is neither missing nor pushed off-document; it is laid out into a band that paints nothing. I did not isolate the mechanism, and I am not guessing at one.

Two related numbers for whoever does: the clone's `scrollWidth` is exactly the viewport at every width (390/700/1024/1100/1440) while the source's is 1525/1525/1525/1525/1620, and the harness names 4 of the 5 pairs as having **clipped** overflow (`/ @390: clone content reaches x=640px in a 390px viewport while scrollWidth stays 390`). `horizontal-overflow-excess-px` is `direction: "higher"` on `clone − source` (`src/responsive-qa/classify.ts:608-619`), so a clone that overflows *less* than the source can never fire it. On a fixed-width source that never reflows, that is the whole failure mode and the rubric is blind to its sign.

### B3 — `/kwa-38941-515` at all five widths: the route does not exist in the clone

`cloneProvenance.httpStatus` **404**; clone document 390 × 900 with **8 elements and 143 characters** against a source of 521 elements, 1 094 characters and 12 706 px of height. `missing-text-ratio` 1.0, `visible-text-ratio` 0.1307, `image-presence-ratio` 0 against 32 source images, `empty-band-excess-ratio` 0.738–0.800. Every width identical, because the clone response is identical.

**Cause: discovery recall, then a hard pipeline stop.** Firecrawl returned 20 URLs for the root and none in the `/kwa-38941-*` family, though the homepage links `kwa-38941-515?category_3=03` twice in its raw HTML (measured in §0). Run 1's `route-map.json` therefore has 20 routes and not this one, and `routeMode: "catch-all"` answers with `not-found.tsx`. The dedicated pipeline I ran to fix that (run 4) **failed before it could generate anything** — §5.1.

---

## 5.1 PIPELINE FAILURE — run 4 died at `interaction-modeling` on a page set with nothing safe to click

**Command:** `pnpm e2e:reconstruct https://interiorbay.co.kr/kwa-38941-515 --max-urls 12 --concurrency 2 --family-escalation 4 --prepare-scroll`
**Run:** `data/interiorbay.co.kr/e2e-runs/2026-09-02T23-40-30-277Z/e2e-manifest.json` — `finalStatus: failed`, 23:40:30 → 23:43:20 (2 m 50 s).

Stage results, verbatim:

```
discovery               ok     6871 ms  raw=7 normalized=7 rootSeeded=0
verification            ok     6161 ms  candidates=7 validHtml=7 verified=7 httpErrors=0 blocked=0
selection               ok        5 ms  families=4 selected=4 reduced=3
observation             ok   156983 ms  plannedPages=5 observedPages=5 failedPages=0
interaction-detection   ok      142 ms  pages=5 candidates=60 p1=0 p2=36 p3=24 targets=0
interaction-exploration ok      123 ms  plannedActions=0 executedActions=0 skipped=60
interaction-modeling    FAILED    1 ms  interaction-failure
```

Error text: `exploration run 2026-09-02T23-43-20-481Z has no executed actions (status: completed). Task 12 models observed transitions; run 'pnpm explore:interactions' without --plan-only first.`

**The explorer did not fail. It succeeded and correctly found nothing to do.** `interaction-plan.json` for that run records `siteCandidateCount: 60`, `eligibleCandidates: 0`, `skippedByPolicy: 60`, `skippedByBudget: 0`, and `skipReasonCounts: {priority: 24, capability: 16, hidden: 12, guard: 8}` — the 8 guard skips are all `form-submit`, i.e. the explorer's own write-safety policy. `interaction-exploration.json` records `"status": "completed"` and `"plannedActions": 0`.

**The defect, at file:line.** `src/interaction-patterns/load-exploration.ts:135-139`:

```ts
if (manifest.status === "plan-only" || manifest.actions.length === 0) {
  fail(
    `exploration run ${runId} has no executed actions (status: ${manifest.status}). ` +
      `Task 12 models observed transitions; run \`pnpm explore:interactions\` without --plan-only first.`,
  );
}
```

The condition conflates two states that are not the same: `status === "plan-only"` (the operator skipped execution — genuine misuse, and the error text is written for it) and `actions.length === 0` on a run whose status is `completed` (the explorer ran and its safety policy legitimately skipped every candidate — a **property of the page set**). The second is a normal outcome for a static content or detail page, and the error message printed for it is actively misleading: it tells the operator to re-run without a flag they did not pass.

`src/e2e/stage-registry.ts:83-90` marks `interaction-modeling` `optional: false`, so the throw stops the whole run: **no SiteSpec, no reconstruction, no build, no QA, `routes generated / rendered 0 / 0`.** A site whose pages have no clickable, non-form, visible, P1-or-P2-eligible element cannot be reconstructed at all by the end-to-end command.

**Severity:** BLOCKER for the pipeline. It cost this lane the only clone that could have measured `/kwa-38941-515`'s layout fidelity, on the one route whose instrument floor is a perfect 5/5 PASS.

**I did not work around it.** I did not raise `--max-urls` to fish for a page with a clickable element (discovery returned only 7 URLs for that root, so the cap was never binding anyway), I did not hand-write an `interaction-patterns.json`, and I did not run the stages with different policy flags to make the explorer plan something. The run failed; that is the result.

---

## 6. The table probe — what 155 `<table>` elements against 0 grid containers actually showed

This lane exists partly to find residual Stripe/Linear (flex/grid) bias. **I found none in the table path.** Every table-formatting property added to the computed-style whitelist was captured, on every document, with values that check out against the source.

### 6.0 The layout-mode census I measured myself

Every element of the observed desktop homepage, joined to its computed `display` (`dom.json` × `styles.json`, page `p000001`):

| `display` | nodes |
|---|---|
| `block` | 946 |
| `inline` | 626 |
| `table-cell` | **391** |
| `table-row` | **167** |
| `table` | **155** |
| `table-row-group` | **155** |
| `inline-block` | 115 |
| `none` | 36 |
| `list-item` | 30 |
| `flex` | **1** |
| `grid` | **0** |

**868 of 2 622 elements — 33 % of the document — are table-formatting boxes, against one flex container and zero grid containers.** This is the shape the layout inference was asked to handle, and it is the inverse of every prior pilot.

### 6.1 Capture

`viewports/<vp>/styles.json`, counted over deduplicated style groups:

| Document | style groups | `border-collapse` | `border-spacing` | `table-layout` | `empty-cells` | `caption-side` |
|---|---|---|---|---|---|---|
| `/` desktop | 415 | 407 (`separate`) | 407 (`0px`) | 407 (`auto`) | 407 (`show`) | 407 (`top`) |
| `/` mobile | 381 | 372 | 372 | 372 | 372 | 372 |
| `/kwa-38941-515` desktop | 188 | 185 | 185 | 185 | 185 | 185 |
| `/kwa-38941-515` mobile | 187 | 185 | 185 | 185 | 185 | 185 |

**All five properties are present on 98 %+ of every document's style groups, and every captured value is verifiably correct.** `border-spacing: 0px` is right because all 115 homepage tables carry `cellspacing="0"` and the only 16 authored `border-spacing` declarations say `0`. `border-collapse: separate` is right because the only 7 authored `collapse` declarations are scoped to `#estimate_board`, `#bid_details` and `.ui-datepicker`, none of which appears anywhere in either graded route's HTML (grep count 0). `table-layout: auto`, `empty-cells: show` and `caption-side: top` are the initial values and nothing authors otherwise. **Zero table-formatting values were guessed, dropped or defaulted-in-error.**

The `display` census confirms the boxes are real tables, not divs: `/` desktop carries `display: table` ×14, `table-row-group` ×13, `table-row` ×15, `table-cell` ×35 among its style groups (the remaining tables share deduplicated groups).

### 6.2 Emission

`app/public/wr/generated-styles.css` carries **1 404 declarations each** of `border-collapse`, `border-spacing`, `table-layout`, `empty-cells` and `caption-side` — one per style token, matching `stats.styleRules: 1 404` — plus **187 `display: table*` rules**. The properties round-trip from computed style into the clone's stylesheet with no loss.

### 6.3 Table geometry drift

**None attributable to tables.** At every width where the clone mounts the desktop subtree (1024, 1100, 1440) the clone's `scrollHeight` is 5 402 px — the source's value to the pixel — with `matchedFraction` 0.9951 and a **median matched-leaf left-edge delta of 2 px**. A 155-table document reproduced to within 2 px of median horizontal placement and 0 px of total height is not a layout engine with table bias; the residual p90 is carousels (§M2), and the sub-1024 failure is the UA branch (§B1).

The one table-adjacent number worth flagging is the **absence** of a channel rather than a drift: the source's `scrollWidth` is 1525–1620 px at every width, the clone's is exactly the viewport width, and **no channel fires on a clone that overflows LESS than the source.** `horizontal-overflow-excess-px` is one-directional by design (it asks whether the clone scrolls *further* than the source). So the clone silently clips 485 px of the source's own horizontal overflow at 1024 and 180 px at 1440 and the rubric records it only indirectly, through `position-delta-p90-px` and the run-level `[composite-cannot-show-clipped-overflow]` note (`4 measured pairs have clipped overflow; e.g. / @390: clone content reaches x=640px in a 390px viewport while scrollWidth stays 390`).

---

## 7. Engine defects I MEASURED (all generic — no host-specific remedy is proposed anywhere in this report)

### E1 — the "measured parent content box" counters exist and reach no artifact

`src/reconstruction/layout-inference.ts` declares five counters for the change that replaced the assumed-constant padding denominator with a per-width measurement — `contentBoxMeasured` (line 482), `contentBoxAssumedConstant` (484), `contentBoxMeasuredDisagreed` (491), `contentBoxMaxDisagreementPx` (493), `parentPaddingNotConstant` (499) — and increments all five in the hot path (lines 2094, 2103, 2104, 2110, 2140).

`grep -rn "contentBoxMeasured" src/` returns hits in **that file only**. `src/reconstruction/generate-app.ts` builds `manifest.layout` from ~50 named counters and carries **none of these five**. Nothing else in `src/` reads them either.

**Consequence, measured here:** this run refused 64 candidates with `guardRefusalsByReason["parent-padding-not-constant"]`, and there is no artifact field anywhere that says how many candidates got a *measured* content box, how many fell back to the assumed-constant one, how many the measurement actually moved, or by how many pixels. The headline change ships with zero observability, and a lane cannot report on it. This is precisely the reporting gap that `no-branch-matched` was added to close, reappearing one stage earlier.

### E2 — `aggregateAuthoredCandidates()` reads only the desktop histogram, so a UA-branched site reports "no authored breakpoint" while authoring three

`src/reconstruction/tree-switch.ts`, in `aggregateAuthoredCandidates()`: `const histogram = page.viewports.desktop?.authoredBreakpoints;`. The mobile viewport's histogram is never read.

**Measured here:** desktop histogram empty (`conditionsRead: 1`, all width-irrelevant, `breakpointsFolded: 0`, `degradedReason: "no-width-breakpoints"`); mobile histogram non-empty (`conditionsRead: 4`, `breakpointsFolded: 3`, `breakpointsAdopted: 3` → 360 / 600 / 640, `widthsAdded: 6`). The shipped decision reads `fallbackReason: "empty-histogram"`, `candidateCount: 0`, `candidatesOutsideObservedInterval: 0` — three fields that together assert the source offered nothing, when 2 of its 3 authored breakpoints (601 and 640) sit inside the decision's own `(390, 1440]` interval and were folded by the probe in the same run.

The *decision* to keep the midpoint may well be right on a UA-branched site (no width is correct). The *accounting* is not: "the source authored nothing" and "the source authored three, none of them in the branch I look at" must not produce the same three numbers. A `mobile-histogram-not-read` or `candidatesInOtherViewportBranch` counter would separate them.

### E3 — `no-branch-matched` is the largest outcome and the only one with no sub-reason

`inlineSizeOutcomes["no-branch-matched"] = 2 933` of 4 488 candidates (65.4 %). Every refusal outcome in `InlineSizeOutcome` (`layout-inference.ts:274-301`) names *why*; the majority outcome names only *that*. The 115 zero-media absolute `width ≥ 1000px` tokens in the emitted stylesheet (89 of them `1440px`, one `22663.4px`) all come from this bucket and the artifact cannot distinguish a page-wrapper from a carousel track inside it.

### E4 — an exploration that completes with zero eligible actions is fatal to the whole pipeline

`src/interaction-patterns/load-exploration.ts:135` — `manifest.status === "plan-only" || manifest.actions.length === 0`. Full diagnosis in §5.1. Measured cost: one complete pipeline run lost (`finalStatus: failed`, `routes generated / rendered 0 / 0`) after 156 983 ms of successful observation and 507 MB of written artifacts.

### E5 — a cross-origin `@import` is counted unresolved but never offered to the fetch fallback that rescues a cross-origin `<link>`

`stylesheetCoverage` on `/` desktop: `cssomBlocked 0`, `fallbackRecovered 0`, `fallbackMissed 0`, but `importRulesVisited 3 / importRulesFollowed 1 / importRulesRecovered 0 / importRulesUnresolved 2`. The 2 are the Google Fonts sheets `@import`ed from `/works/css/main_css.css`. Mobile: 6 / 3 / 0 / 3. A site that references a cross-origin sheet with `<link>` gets a recovery path; the same sheet referenced with `@import` gets a counter and a drop. The counters are honest; the asymmetry is the defect. (`importRulesRecovered` exists as a field and was 0 on all four documents, so a recovery path is at least contemplated.)

### E6 — discovery returned only `http://www.` URLs for an `https://` apex root, and the pipeline observed 7 of 9 pages through a `:54306` redirect

Firecrawl's 20 links are all `http://www.interiorbay.co.kr/...`; the root `https://interiorbay.co.kr/` had to be seeded by the Root URL Invariant (`rootSeeded: 1`), and `externalFilteredCount` is 0, so the scheme/host change was accepted as same-site. `http://` on this host `302`s to **`https://interiorbay.co.kr:54306/...`**, and `selected-pages.json` shows 7 of the 8 selected representatives carry that non-standard port while the root does not. `route-map.json` therefore mixes two origins for one site. Nothing downstream broke in this run, but the corpus is now keyed on an origin the operator never named. Discovery recall is the second half of the same defect: `/kwa-38941-515` is linked twice from the homepage and was not returned (§B3).

---

## 8. What I could NOT measure, and why

| Not measured | Why |
|---|---|
| **Layout fidelity of `/kwa-38941-515`** | The only pipeline that could have produced a clone for it (run 4) failed at `interaction-modeling` (§5.1). The 5 BLOCKER pairs I did grade measure route *presence* against run 1's clone (HTTP 404), not layout. This is the single biggest hole in this lane, and it lands on the one route whose instrument floor is a perfect 5/5 PASS with a 0.00 % pixel residual — i.e. the route where a clone verdict would have been most trustworthy. |
| **The redirected-stylesheet recovery path** | `sheetsRedirectResponses: 0` on all four observed documents. Nothing redirected, so nothing was recovered and nothing was lost. The change is untested by this site; I am not reporting it as working. |
| **Band-edge snapping (snapped vs midpoint-kept)** | `bandEdgesConsidered: 0`, `responsiveHidden: 0`. The site builds no responsive-hide band, so no edge was ever offered to the snapper. All eight band counters are 0 *for the same reason*, which is exactly the confusion the split channels exist to prevent — and here they correctly report "nothing was offered" rather than "nothing snapped". |
| **How often the measured parent content box changed a verdict** | The counters are computed and never written to any artifact (§E1). |
| **Grid-track recovery** | `gridTrackColumns: 0`, `gridTrackRefusals: 0` on a site with 0 grid containers. Nothing to recover. |
| **Whether 601 or 640 would have been a better tree switch** | The switch cannot see the mobile histogram (§E2), and no observation in this pipeline locates the width at which a UA-branched server swaps documents (`domSwitchWidthObserved: false` — and the server in fact swaps on user agent, not width, so no such width exists). |
| **The two Google Fonts faces' `@font-face` blocks** | `importRulesUnresolved` 2 (desktop) / 3 (mobile); the sheets are cross-origin `@import`s and were not fetched (§E5). |
| **Whether the 157 missing chars at ≥1024 are clone loss or source churn** | Strongly indicated as source churn (the strings are live 실시간견적 rows; the floor scores 0.00 % missing text at 1024), but the engine has no `content-review` classification to record that, so the rubric fires `missing-text-ratio` MAJOR on all three pairs. |
| **CJK webfont fallback cost** | Out of this lane's scope; not measured, not reported. |

---

## 9. Wall clock and artifact size

| Item | Value |
|---|---|
| Lane start → last measurement | 2026-09-02T23:13:04Z → 2026-09-02T23:46:07Z (**33 m 03 s**) |
| Run 1 e2e (root) | 18 m 53 s (observation 5 m 34 s, interaction-exploration 2 m 43 s, reconstruction 1 m 23 s, QA 8 m 07 s) |
| Run 2 responsive QA, `/` clone | 2 m 37 s |
| Run 3 responsive QA, self-check floor, 10 pairs | 4 m 21 s |
| Run 4 e2e (sub-page) — **failed** | 2 m 50 s |
| Run 5 responsive QA, `/kwa-38941-515` clone | 1 m 03 s |
| `data/interiorbay.co.kr/` total on disk | **1.1 GB** |
| — site-observations | 573 MB (run 1: 84.6 MB; **run 4: 507.1 MB for 5 pages**) |
| — responsive-qa | 377 MB |
| — reconstruction-qa | 73 MB |
| — site-specs | 55 MB |
| — reconstructions | 37 MB (run 1's app: 5 996 496 B over 28 files; `generated-styles.css` alone is 3 567 138 B) |
| `tmp/wr286/w7-interiorbay/` | 852 KB |
| `docs/result/28.6/review/interiorbay/` | **34 MB**, 14 PNGs |

**Resource note.** Run 4's observation wrote **507 MB for 5 pages** — 100 MB per page, against run 1's 9.4 MB per page — because `/kwa-38941-515` is a 12 706 px-tall document with 32 large images and `--prepare-scroll` renders and screenshots the whole thing at two viewports. On a machine shared by seven browser-driving lanes this is worth knowing before anyone raises `--max-urls` on an image-heavy Korean portfolio site.

**Concurrency caveat, stated once.** Seven lanes shared this machine. No stage in this lane timed out, no capture failed (`pairsFailed: 0` on all three grading runs, `failedPages: 0` on both observations), and the one pipeline failure has a deterministic cause pinned to a source line, not a clock. Nothing in this report is attributed to contention.

---

## 10. Review images

`docs/result/28.6/review/interiorbay/` — 14 PNGs, 34 MB, plus `README.md` naming each pair, its verdict, the deciding channel and what to look at.

Every BLOCKER and MAJOR pair is represented. **Source images omitted, and why:** `home_700_source.png` (the source capture at 700 is the same 1525 × 5402 document as at 390, and the two PNGs differ by 15 bytes) and `home_1100_source.png` (same document as at 1024, 1.8 % byte difference from live content only); for `/kwa-38941-515` the source is 18.9 MB per capture and is the *identical* 1525 × 12706 document at all five widths, so one source image (`sub_1440_source.png`) stands for all five pairs. No BLOCKER or MAJOR *clone* image was dropped; all ten are present. Nothing was resized or recompressed.
