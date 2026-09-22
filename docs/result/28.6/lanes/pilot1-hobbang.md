# Task 28.6 — Lane PILOT-1 — hobbang.net

**Host:** `hobbang.net` (Astro static, nginx, zero first-party JS)
**Routes in scope:** `/` and `/링크모음/검색/` (`/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`)
**Status:** COMPLETE — pipeline ran end to end with no stage failure; grading found 2 BLOCKER, 5 MAJOR, 3 MINOR, 0 PASS over 10 route×width pairs.
**Why this lane is load-bearing:** the scout measured this site's DOM byte-identical (884 elements) at 390 and 1440, and I re-measured 852 walked elements identical in both probe contexts. Every responsive finding below is therefore the engine's doing, not a site property.

---

## 1. What I ran, in order

| # | Command | Wall clock | Output |
|---|---|---|---|
| 0 | Independent ground truth: `curl` of `/`, `/_astro/index.DHadyNxt.css`, the Google Fonts sheet and the Pretendard sheet | — | `tmp/wr286/pilot-hobbang/{home,astro,hahmlet,pretendard}.css/html` |
| 1 | `pnpm e2e:reconstruct https://hobbang.net/ --max-urls 20 --concurrency 2 --family-escalation 4 --prepare-scroll` | 20:17:36Z → 20:25:03Z (**7 m 27 s**) | see run ids below |
| 2 | `pnpm qa:responsive data/hobbang.net/reconstructions/2026-09-02T20-20-51-270Z/reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes '/,/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/'` | 20:25:26Z → 20:27:50Z (**2 m 24 s**) | `data/hobbang.net/responsive-qa/2026-09-02T20-25-26-393Z` |
| 3 | Same command with `--self-check --no-diff-images --quiet` (instrument floor) | 20:36:33Z → 20:38:2xZ (**~2 min**) | `data/hobbang.net/responsive-qa/2026-09-02T20-36-34-345Z` |
| 4 | Three read-only Playwright probes of my own, into `tmp/wr286/pilot-hobbang/`, serving a **copy** of the built app on port 47811 (`font-metrics.mjs`, `clone-probe.mjs` / `glyph-probe.mjs`, `table-overflow2.mjs`) | ~3 min | `*.json` in the same directory |

I used the end-to-end command, not individual stages. `--prepare-scroll` is on because the scout measured 5 of the 6 `<img>` elements as `loading="lazy"`; without it the observation records collapsed boxes for them. It is a generic pipeline flag, not a host-specific hack. **Orchestrator note: the other five pilots should use the same flag or the runs are not comparable.**

Step 4 exists because three questions in my brief (does the clone actually load the webfonts, do the `<table>` elements render as tables, what does a hangul font substitution cost in advance width) cannot be answered from the graded artifacts alone. No file under `src/` or `scripts/` was read-modified; the app I served is a copy under `tmp/`.

**Engine stability during this lane:** the newest mtime under `src/` or `scripts/` is 04:21:10 local; my first pipeline command started at 05:17:36 local (20:17:36Z). No engine source file changed while any measurement in this report was running, and this lane wrote nothing under `src/` or `scripts/`.

### Run ids

| Stage | Directory |
|---|---|
| e2e manifest | `data/hobbang.net/e2e-runs/2026-09-02T20-17-38-430Z/e2e-manifest.json` |
| discovery / verify / select | `data/hobbang.net/2026-09-02T20-17-45-984Z/` |
| observation | `data/hobbang.net/site-observations/2026-09-02T20-18-03-342Z/` |
| interaction exploration | `data/hobbang.net/interaction-explorations/…` (18 patterns, all `disclosure`) |
| SiteSpec | `data/hobbang.net/site-specs/2026-09-02T20-20-50-544Z/` |
| reconstruction (final, baseline) | `data/hobbang.net/reconstructions/2026-09-02T20-20-51-270Z/` |
| reconstruction QA | `data/hobbang.net/reconstruction-qa/2026-09-02T20-21-15-063Z/` |
| **responsive QA (graded)** | `data/hobbang.net/responsive-qa/2026-09-02T20-25-26-393Z/` |
| my scratch | `tmp/wr286/pilot-hobbang/` |

Pipeline stage results (from the e2e manifest): discovery 20→20, verification 20 valid-html / 0 errors, selection 8 families, observation 11/11 pages, interaction 18 planned / 18 executed / 18 changed / 0 unknown, SiteSpec 20 routes, reconstruction 20 routes / 7 444 element nodes, `next build` exit 0 in 2 656 ms, QA 22/22 pairs, `runtimeJsErrors=0`, final-validation `originalScripts=0 originalStylesheets=0 originStackDependencies=0`. **No stage crashed or refused.** Final status: `complete-with-known-limitations`.

---

## 2. Responsive grade table

`pnpm qa:responsive`, 2 routes × 5 widths. Verdict = worst channel that fired; "headline channel" is the one the harness printed as the reason.

| Route | Width | Verdict | B/M/m | Headline channel | Deciding number |
|---|---|---|---|---|---|
| `/` | 390 | **MAJOR** | 0/1/1 | `overlap-excess-ratio` | clone overlaps 5.15 pp more of the viewport than the source (51 overlapping leaf pairs vs 24); threshold 2.00 % |
| `/` | 700 | **MAJOR** | 0/5/2 | `column-mode-delta` / `column-container-mode-delta` | clone lays a matched container out as 3 rows of 7 where the source uses 2 rows of 13 (delta 6, threshold 2) |
| `/` | 1024 | **BLOCKER** | 1/5/1 | `footer-clipped` | clone footer max-right 1053 px > 1024 px viewport; source's does not clip |
| `/` | 1100 | **MAJOR** | 0/2/4 | `horizontal-overflow-excess-px` | clone scrolls 28 px further horizontally than the source (threshold 16 px) |
| `/` | 1440 | **MINOR** | 0/0/2 | `overlap-excess-ratio` | +1.92 pp over source (threshold 0.10 %) |
| `/링크모음/검색/` | 390 | **MINOR** | 0/0/3 | `overlap-excess-ratio` | +0.42 pp over source |
| `/링크모음/검색/` | 700 | **MAJOR** | 0/4/2 | `column-mode-delta` | 3 rows of 5 vs source 2 rows of 9 (delta 4, threshold 2) |
| `/링크모음/검색/` | 1024 | **BLOCKER** | 1/2/4 | `footer-clipped` | clone footer max-right 1053 px > 1024 px |
| `/링크모음/검색/` | 1100 | **MAJOR** | 0/1/3 | `horizontal-overflow-excess-px` | 28 px (threshold 16 px) |
| `/링크모음/검색/` | 1440 | **MINOR** | 0/0/3 | `overlap-excess-ratio` | +0.98 pp over source |

**10 measured, 0 failed. BLOCKER 2, MAJOR 5, MINOR 3, PASS 0.**

Missing-content was **0.00 % on all ten pairs**, both directions, and structural correspondence matched 100 % on content. Nothing is lost; everything is mis-laid-out.

### The one number that explains most of the table

Document dimensions I measured directly in a browser (my `clone-probe.mjs`, both sides, same context, `fonts.ready` awaited):

| Route | Width | Source `scrollW × scrollH` | Clone `scrollW × scrollH` |
|---|---|---|---|
| `/` | 390 | 390 × 17 230 | 390 × 17 230 |
| `/` | 700 | 700 × **14 748** | 700 × **17 230** |
| `/` | 1024 | 1024 × 10 922 | **1128** × 10 863 |
| `/` | 1100 | 1100 × 10 926 | **1128** × 10 863 |
| `/` | 1440 | 1440 × 10 860 | 1440 × 10 863 |
| `/링크모음/검색/` | 390 | 390 × 5 817 | 390 × 5 817 |
| `/링크모음/검색/` | 700 | 700 × **3 726** | 700 × **5 817** |
| `/링크모음/검색/` | 1024 | 1024 × 3 317 | **1128** × 3 317 |
| `/링크모음/검색/` | 1100 | 1100 × 3 317 | **1128** × 3 317 |
| `/링크모음/검색/` | 1440 | 1440 × 3 317 | 1440 × 3 317 |

The clone has exactly **two** layouts. Below 915 px it is the 390 px observation, unchanged, to the pixel. At and above 915 px it is the 1440 px observation, with a document that is 1128 px wide no matter how narrow the viewport is. Both facts are engine behaviour and both are diagnosed below.

---

## 3. BLOCKERs and MAJORs, diagnosed

### B1 — `footer-clipped` at 1024 on both routes; MAJOR `horizontal-overflow-excess-px` at 1024 (104 px) and 1100 (28 px)

**Observed:** clone `scrollWidth` = **1128 px** at a 1024 px viewport and at a 1100 px viewport; `contentMaxRight` 1128 vs the source's 1000 at 1024. Source `horizontalOverflow` 0 at every width.

**Emitted:** `data/hobbang.net/reconstructions/2026-09-02T20-20-51-270Z/app/public/wr/generated-styles.css` contains **153 style tokens carrying an absolute `width` ≥ 1000 px** with **no media condition on any of them**:

| Frozen width | Style tokens |
|---|---|
| 1440 px | 44 |
| 1104 px | 44 |
| 1152 px | 34 |
| 1102 px | 22 |
| 1062 px | 6 |
| 1054 px | 2 |
| 1020 px | 1 |
| **total** | **153** |

These are the 1440 px observation's computed styles, which the generator documents as "the exact computed style remains the fallback for every element without one" (limitation `layout-rule-inferred`). A 1104 px box inside a 24 px-padded parent lands its right edge at exactly 1128 px, which is what the browser reports at both 1024 and 1100.

**Why that is wrong:** the layout inference is supposed to replace exactly these. It replaced 876 of them (864 `width:auto` + 12 percentage — see §4.5) and refused **zero** (`widthModeRefusals: 0`, `widthValueRefusals: 0`). The 153 survivors were never offered as candidates at all, so no refusal counter records them. **The artifact has no channel that says "this box kept a frozen px width and nobody looked at it."** That is the reporting gap; the 104 px overflow is its consequence.

**File:line:** `src/reconstruction/layout-inference.ts` (candidate selection — the counters at `LayoutInferenceCounters` account only for candidates that were *examined*); emitted evidence in `app/public/wr/generated-styles.css`.

### B2 / M1 — the whole clone is width-frozen below 915 px (`column-mode-delta` MAJOR at 700 on both routes)

**Observed:** clone `scrollHeight` at 700 is **identical to its own value at 390** — 17 230 px on `/`, 5 817 px on `/링크모음/검색/` — while the source reflows to 14 748 and 3 726. `column-container-mode-delta` 6 and 4 (threshold 2), `position-delta-p90-px` 310 and 342 px, `right-gutter-excess-ratio` 16.14 % vs source 2.29 %.

**Emitted:** `app/app/globals.css:13-34`

```
 * Breakpoint 915px, inferred —
 * observed-endpoint-midpoint, from observed widths 390 and 1440.
@media (max-width: 914.98px) { [data-wr-viewport="desktop"] { display: none } }
@media (min-width: 915px)    { [data-wr-viewport="mobile"]  { display: none } }
```

**Why that is wrong, given what the engine already knew:** the observation read this site's authored breakpoints correctly and completely — `conditionsRead: 5`, `breakpointsFolded: 3` → **640 / 768 / 1024** — and the SiteSpec carried them (`authoredBreakpointPages: {"spec-field": 11}`). The band-edge snapper then used them for **every one of its 187 band edges** (§4.4). But the variant switch, which decides *which entire DOM tree you see*, never consults them:

- `src/reconstruction/responsive-plan.ts:77-82` — `value: Math.floor((mobile.width + desktop.width) / 2)`, `method: "observed-endpoint-midpoint"`, with the standing comment "no per-site table, no 768, no 1024 (item 114)".

Task 28.6 D1 snapped one of the two places a width edge is decided and left the other guessing the midpoint of two observation viewports. On this site the guess lands at 915, which is 275 px above the source's first breakpoint, so widths 640–914 render the 390 tree.

### B3 — the mobile-context probe produces no rules at all

**Observed:** the mobile probe ran, on every page, in the mobile browser context, with its own element identity: `layout-probe-mobile.json`, **852 elements**, widths **390 / 480 / 639 / 640 / 700 / 767 / 768 / 914**, 1 209 637 bytes over 11 pages. It sampled the 640 and 768 breakpoints on both sides.

**Emitted:** I classified every layout rule in `generated-styles.css` by the viewport its selector targets:

| Selector viewport | Layout-rule selectors | Properties |
|---|---|---|
| `desktop` | 1 114 | `width` 888, `display` 195, `margin-left/right` 88 each, `max-width` 88, `grid-template-columns` 39 |
| `mobile` | 266 | `height` 258, `width` 258, `transform-origin` 250, `min-height`/`min-width` 143 each, `opacity`/`visibility` 16 — these are the **interaction reveal-state** rules (`[data-wr-reveal…]` selectors), not layout recovery |

**Zero recovered layout rules target the mobile variant**, and all 187 `@media (max-width: 1023.98px)` blocks contain only `[data-wr-viewport="desktop"]` selectors.

**File:line:** `src/sitespec/compile-page.ts:182` reads `observation.layoutProbe` (the desktop probe) and nothing else. `grep -rn "layoutProbeMobile" src/` returns hits only in `src/observer/{observe-page,store,types}.ts` and one CLI print at `src/cli-observe.ts:241`. **No stage under `src/sitespec/` or `src/reconstruction/` references it.** The mobile probe is a dead-end artifact: it costs one extra page load plus eight resizes per page and 1.2 MB of storage per run, and delivers nothing.

This compounds B2. Even if the variant switch were fixed to 640, the mobile tree has no width evidence in the emitted CSS to reflow with.

### M2 — `<table>` loses `border-collapse`, and the tables then overflow their frozen-height wrappers (this is the `overlap-excess-ratio` MAJOR at 390)

**Observed** (my `clone-probe.mjs` / `table-overflow2.mjs`, `/` @390, visible tables only):

| Table | Source `border-collapse` | Clone `border-collapse` | Source h | Clone h | Δ | Wrapper `height` (both sides, frozen px) | Clone table overflows wrapper by |
|---|---|---|---|---|---|---|---|
| 1 (10×5 data) | collapse | **separate** | 839 | 865.5 | +26.5 | 841 px | **+25 px** |
| 2 (4×6 log) | collapse | **separate** | 324 | 336.5 | +12.5 | 326 px | **+11 px** |
| 3 (4×3 checklist) | collapse | **separate** | 284 | 336 | +52 | 286 px | **+50 px** |
| 4 (3-col compare) | collapse | **separate** | 425 | 439.5 | +14.5 | 427 px | **+13 px** |
| 5 (9×5 ✓/✗/△) | collapse | **separate** | 547 | 605.5 | +58.5 | 549 px | **+57 px** |

Source overflows its wrapper by −2 px on all five (it fits). Every wrapper is `overflow-x: auto; overflow-y: visible`, so the extra height is **painted over the content below** — 156 px of it across the five tables.

**Why:** `STYLE_WHITELIST` (`src/observer/types.ts:303-441`, 96 properties) contains **no table-formatting property at all** — no `border-collapse`, no `border-spacing`, no `table-layout`, no `caption-side`, no `empty-cells`. `vertical-align` is the only entry that touches a cell. So the clone falls back to the UA default `separate`, every `<td>`/`<th>` border is doubled, and every table grows. At 1440 the same defect costs +82 / +12.5 / +12.5 / +14.5 / +18.5 = **140 px** across the five tables, which is where the reconstruction QA's `geometryMaxDelta: 82.5` came from.

This is the untested-table path the brief predicted, and it is fully generic: any site with a `<table>` hits it.

### M3 — `column-mode-delta` MAJOR at 1024, MINOR at 1100 on `/`

Clone shows 12 column-containers at 1024/1100/1440; source shows 10/11/12. Same root cause as B1: the desktop tree carries the 1440 layout, and the 153 frozen wide widths plus the absence of any band below 1024 (§4.4) mean the desktop tree does not reflow at all between 915 and 1440 — only the 187 responsive-hidden rules can act, and their band is `max-width: 1023.98px`, so they only discriminate inside the 109 px window [915, 1024).

---

## 4. Engine-change measurements

### 4.1 CORS negative control — **PASS, and the numbers are bit-exact**

Independent ground truth I fetched myself before the run:

| Sheet | Reachable via CSSOM? | Why | Bytes | `@media` | `@font-face` | unique font URLs |
|---|---|---|---|---|---|---|
| `/_astro/index.DHadyNxt.css` | readable | same origin | 22 058 | 7 | 0 | 0 |
| inline `<style>` | readable | inline | 1 762 | 2 | 0 | 0 |
| `cdn.jsdelivr.net/…/pretendardvariable-dynamic-subset.min.css` | readable | `<link crossorigin="">` + `ACAO: *` | 53 513 | **0** | 92 | 92 |
| `fonts.googleapis.com/css2?family=Hahmlet…` | **BLOCKED** | `<link>` has **no** `crossorigin`, so the request is no-cors and `cssRules` throws — *even though the response carries `ACAO: *`* | 168 411 | **0** | 276 | **92** |

What the engine recorded (`site-observation.json → viewports.{desktop,mobile}.stylesheetCoverage`, identical on both viewports):

| Field | Value | Verdict |
|---|---|---|
| `stylesheetsTotal` | 4 | matches |
| `cssomReadable` | 3 | matches |
| `cssomBlocked` | 1 | matches |
| `sheetsOffered` | 1 | the blocked sheet was offered to the bridge |
| **`fallbackRecovered`** | **1** | **it was found** |
| `fallbackMissed` | 0 | nothing lost |
| `bytesBridged` | **168 411** | **byte-exact against my own `curl`** |
| `bytesCaptured` | 243 982 | = 22 058 + 53 513 + 168 411, exactly |
| `sheetsMediaUnreadable` | 0 | — |
| `mediaConditionsDistributed` | **0** | **no condition invented** |
| `mediaConditionsNegated` | **0** | **no condition invented** |
| `authoredMediaConditionsDropped` | 0 | nothing silently discarded |
| `authoredMediaConditions` | `(hover: hover)`×3, `(min-width: 48rem)`×2, `(min-width: 64rem)`×2, `(min-width: 40rem)`×1, `(prefers-reduced-motion: reduce)`×1 = **9** | exactly the 9 rules in the two readable sheets; **none attributed to the recovered sheet** |

And the recovery is not inert: **92 of 92** unique `fonts.gstatic.com` Hahmlet URLs appear in the observation's `assets.json`, and they exist *only* in the CORS-blocked sheet. Before W1.1 they were unobservable.

**Verdict: recovery found the blocked sheet, bridged it byte-for-byte, harvested its 92 font URLs, and fabricated zero media conditions for it.** The negative control passes on every axis the brief named.

### 4.2 Probe widths derived from the site's own authored breakpoints — **PASS**

`site-observations/…/pages/p000001/layout-probe.json → widthProvenance`:

| | Desktop probe | Mobile probe |
|---|---|---|
| Floor widths | 390, 700, 768, 1024, 1100, 1440, 1920 | 390, 480, 700, 768, 914 |
| `conditionsRead` (width-relevant) | **5** | 5 |
| `conditionsWeight` (all `@media`) | **9** | 9 |
| `conditionsWidthIrrelevant` | **4** | 4 |
| `conditionsUnparsed` / `conditionsUnsupported` / `conditionsDroppedByCollector` | 0 / 0 / 0 | 0 / 0 / 0 |
| `breakpointsFolded` | **3** (640, 768, 1024) | 3 |
| `breakpointsAdopted` | **3** | 2 |
| `breakpointsOutOfRange` | 0 | **1** — 1024, refused with `reason: "out-of-range"` because it is outside the mobile envelope |
| `widthsAdded` | 4 | 3 |
| `degradedToFloor` | false | false |
| Widths actually sampled | **390, 639, 640, 700, 767, 768, 1023, 1024, 1100, 1440, 1920** | **390, 480, 639, 640, 700, 767, 768, 914** |

My independent `curl` count of the two readable sheets: 9 `@media` rules total, of which 5 are width-conditioned (`40rem`, `48rem`×2, `64rem`×2) and 4 are not (`hover:hover`×3, `prefers-reduced-motion`×1), root font size 16 px → 640 / 768 / 1024. **The engine's numbers match mine exactly, field for field.** It brackets each authored breakpoint on both sides (639/640, 767/768, 1023/1024) and records the refusal it had to make on the mobile side instead of silently dropping it.

### 4.3 Mobile-context layout probe with its own element identity — **RAN, ARTIFACT CORRECT, CONSUMED BY NOTHING**

| | Desktop probe | Mobile probe |
|---|---|---|
| `initialWidth` | 1440 | **390** |
| Elements walked | 852 | 852 |
| Widths | 11 | 8 |
| Artifact | `layout-probe.json`, 380 431 B (p000001) | `layout-probe-mobile.json`, 278 147 B (p000001); **1 209 637 B over 11 pages** |
| Downstream consumers under `src/sitespec/` or `src/reconstruction/` | `compile-page.ts:182` | **none** |

The two probes walk the same 852 elements here *because* this site serves one DOM to both viewports — so this run cannot test whether the separate element identity is correct on a site that serves different DOMs. It can and does show that the artifact is produced and then thrown away. See B3.

### 4.4 Band edges snapped to authored breakpoints — **PASS on its own terms, but the scope is 187 hidden-rules only**

`reconstruction-manifest.json → layout`:

| Counter | Value |
|---|---|
| `authoredBreakpointPages` | `{"spec-field": 11}` — all 11 pages got the histogram from the SiteSpec field |
| `authoredBreakpointEntries` | 33 (= 3 breakpoints × 11 pages) |
| `authoredBreakpointDeclarations` | 45 815 |
| `authoredBreakpointUnparsedDeclarations` | **0** |
| `authoredBreakpointTruncatedNodes` | **0** |
| `bandEdgesConsidered` | 187 |
| **`bandEdgesSnapped`** | **187 (100 %)** |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 |
| `bandEdgeSnapShiftPx` | **187** — exactly 1 px per edge |
| `bandEdgesOpen` | 187 (the other side of each band is open) |

The 1 px-per-edge shift is the two changes working together: because the probe now samples 1023 and 1024, the midpoint guess was 1023 and snapping moved it to 1024. Every emitted band in the stylesheet is `@media (max-width: 1023.98px)` — 187 of them, one condition, the authored `lg` breakpoint.

**Caveat that limits the win:** only the `responsiveHidden` rule kind carries a band (187 of them; `responsiveHidden` in the counters is also 187). The `centered` (88), `fullWidth` (788), `percentage` (4) and `grid-track-columns` (39) rules are emitted **unconditionally**. And because every banded rule targets the desktop variant, which is itself hidden below 915 px, the bands can only discriminate in [915, 1024) — a 109 px window.

### 4.5 Bidirectional inline-size recovery — **PASS, 0 refusals, 0 undecidables**

| Counter | Value |
|---|---|
| `widthModeStretch` (emitted `width: auto`) | **864** |
| `widthModeFillPercentage` (emitted `100%` / `calc(100% − Npx)`) | **12** |
| `widthModeRefusals` | **0** |
| `widthValueRefusals` (28.6 V2, unreadable subtrahend) | **0** |
| `guardRefusals` | 144, **all** `grid-item` — no `parent-padding-unreadable`, so no denominator was ever guessed |
| `gridTrackColumns` recovered | 39 |
| `gridTrackRefusals` | 45 (`container-width-constant` 15, `no-computed-tracks` 11, `tracks-not-px` 11, `tracks-not-reproducible-at-every-width` 6, `child-count-not-multiple-of-tracks` 2) |

In the emitted stylesheet: 935 `width: auto` and 12 `width: 100%`. The mechanism decided every case it was offered. **What it did not do is get offered the 153 boxes that kept a ≥1000 px frozen width** (§3/B1) — and no counter reports that, which is the reporting hole worth closing.

### 4.6 In-band and truth-width verification of every banded rule — **PASS, no exemptions**

| Counter | Value |
|---|---|
| `truthCheckStatus` | **`verified`** |
| `truthCheckable` | 919 |
| `truthCheckRounds` / `truthCheckPagesRendered` | 11 / 11 |
| `truthCheckConverged` | **true** |
| `candidateRules` → `acceptedRules` | 1 106 → **1 106** |
| `rejectedByTruthCheck` | **0** |
| `rejectedUnverifiable` | **0** |
| `acceptedUnchecked` | **0** |
| `acceptedRegressed` | **0** |
| `bandCheckable` | 187 |
| `rejectedByBandCheck` | **0** |
| `bandWidthsRendered` | 11 |
| `bandIndependentlyDiscriminated` | **187 / 187** |
| `bandHiddenByAncestorAtBandWidth` | 176 |
| `bandExactTierHidesAtBandWidth` | 0 |
| `bandTruthBaselineNotInLayout` | 0 |
| `bandSampleMismatches` | 0 |

Every rule the generator emitted was re-rendered and verified, nothing was accepted unchecked, and nothing was exempted. **This machinery is sound. It is also the reason the defects above are so cleanly attributable: everything that shipped was verified, so what went wrong went wrong upstream of it — in what was never made a candidate (B1), and in a switch that never consulted the authored breakpoints at all (B2).**

### 4.7 Percent-encoded hangul route — **SURVIVES EVERY STAGE**

| Stage | Value |
|---|---|
| Site's own HTML | `href="/링크모음/검색/"` (raw UTF-8, unencoded) |
| Discovery | `url: https://hobbang.net/링크모음/검색` → `normalizedUrl: …/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89` |
| Verification | `httpStatus 200`, `redirected: true`, `redirectCount: 1` (the site 301s the no-trailing-slash form), `finalUrl: …/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/` |
| Selection | selected as `f000002` representative, `memberCount 2`, `routeScope "링크모음"` |
| Observation | `p000002` — the **first** page observed, both viewports, no error |
| SiteSpec | `r000002`, `url` and `pathname` percent-encoded with trailing slash, `coverage: exact-observed` |
| Route map | `key: "/링크모음/검색"` (decoded, trailing slash stripped), `path: "/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/"` |
| Generated file path | catch-all `app/app/[[...slug]]/page.tsx` — **no per-route file, so no filename encoding is ever attempted** |
| Built app serving it | **yes** — I loaded `http://127.0.0.1:47811/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/` at 5 widths and got the real page every time (5 817 px tall at 390, 1 `<table>`, 8 053 visible chars matched to the source) |
| Graded | 5 pairs, 0 capture failures |

**No stage mangled it.** One latent hazard I could not test on this site: `routeKeyFromSlug` (`app/src/runtime/route-key.ts`) says "slug segments are already decoded by Next.js, so they are used as-is" and then calls `normalizePathname`, which percent-decodes them **again**. Hangul is unaffected because decoded hangul contains no `%`. A route containing a literal `%25` would be corrupted. **I did not measure this** — no such route exists here.

### 4.8 Hangul glyph metrics through a unicode-range dynamic-subset variable font

**The clone loads zero webfonts.** Measured in a browser, both sides, `fonts.ready` awaited:

| | Loaded `FontFace` entries |
|---|---|
| Source `/` | Hahmlet **20**, Pretendard Variable **16** |
| Source `/링크모음/검색/` | Hahmlet **22**, Pretendard Variable **14** |
| **Clone, both routes, all 5 widths** | **{} — none** |

Structural cause, also measured: `app/app/layout.tsx` emits exactly one `<link rel="stylesheet">`, to `generated-styles.css`. That file carries **1 440 `font-family` declarations** naming `"Pretendard Variable"` (1 462 occurrences) and `Hahmlet` (77), and **0 `@font-face` rules and 0 font URLs**. The e2e final-validation confirms `originalStylesheets=0`. There is no path by which the clone can load either family. This is a *declared* limitation (`font-source-binding-unverified`, `source-head-not-reconstructed`), not a new defect — but nobody had measured its cost on a non-latin script.

**Measured cost** (`glyph-probe.mjs`: 200 hangul text runs per side, 200 matched, single-line runs only, live source vs served clone at 1440):

| Family | Matched single-line runs | Median advance-width delta | Min | Max |
|---|---|---|---|---|
| **Hahmlet** (display serif, from the CORS-blocked sheet) | 19 | **+10.24 %** | +5.10 % | +14.28 % |
| **Pretendard Variable** (body, 797 of 884 elements) | 95 | **+0.37 %** | −4.94 % | +1.35 % |

Worst individual cases: `링크모음·주소모음 자주 묻는 질문` 396.6 → 453.2 px (+14.28 %, 28 px); `최근 연결 경로 확인 기록` 288.9 → 324.5 px (+12.34 %). **33 of the 200 matched text runs changed line count.**

A cross-check with `canvas.measureText` on the live source, comparing the full stack against the same stack with the webfont families removed, gives the same shape: Hahmlet → generic `serif` is +5.66 % to +7.42 % at 32 px; Pretendard → `-apple-system` is −0.42 % to +0.43 %.

**Interpretation:** Pretendard Variable is close to metric-compatible with the macOS system Korean face, so the body copy — 797 of 884 elements — survives substitution almost unchanged. That is *why* the clone's document heights track the source so closely at 1440 (10 863 vs 10 860). The display serif does not survive: every headline is ~10 % wider. And exactly as the brief predicted, **none of this appears as a missing-text finding — `missingText` was 0.00 % on all ten pairs.** It appears in the pixel residual (5.42 %–64.17 %) and in the 33 line-count changes.

**One caveat that matters for the responsive verdicts:** `generated-styles.css` carries **1 567 explicit `height: Npx`** declarations and frozen `width` on the same nodes. I measured 8 headings on `/` at both 390 and 1440 whose clone box width and height match the source's to **0.0 px** while their inner glyph advances differ by 10 %. **The geometry channels are structurally blind to font substitution on this clone**, because the boxes are pinned. Only the pixel channel and the overflow/overlap channels can see it. That is a property of the clone, not of the grader, and it should be stated whenever a "geometry matches" claim is made about a web-recon clone.

### 4.9 `<table>` elements

Structure is **exact**. Counts in the generated page document (`p000001`) against the source HTML I fetched myself:

| Tag | Source HTML | Generated doc (desktop) | Generated doc (mobile) |
|---|---|---|---|
| `table` | 5 | 5 | 5 |
| `thead` | 5 | 5 | 5 |
| `tbody` | 5 | 5 | 5 |
| `tr` | 36 | 36 | 36 |
| `th` | 22 | 22 | 22 |
| `td` | 142 | 142 | 142 |

In the browser, the clone renders 5 visible `<table>` elements at every width on `/` and 1 on `/링크모음/검색/`, matching the source, with `display: table`, `table-layout: auto`, and the `overflow-x: auto` wrapper preserved (the 390 px horizontal-scroll case reproduces: tables 1, 2 and 5 are `clipped: true` on both sides). **The rendering, presentation and formatting are correct except for `border-collapse`, which is not observed at all — see M2.** I also found 61 whitespace-only text nodes emitted as direct children of `<table>` (15), `<thead>` (10) and `<tbody>` (36) in the page JSON; whitespace-only character data is legal in table insertion modes and I measured no layout consequence from it, so I am recording it, not claiming it.

### 4.10 An unrelated defect I found while measuring fonts: `@font-face` URLs are resolved against the wrong base

The Pretendard sheet is served from `cdn.jsdelivr.net` and its `src` is **relative**: `url(../../../packages/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.0.woff2)`. CSS resolves that against the **stylesheet's** URL. The engine resolves it against the **document's**:

| | URL | HTTP |
|---|---|---|
| Correct (sheet-relative) | `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/…/subset.0.woff2` | **200**, 34 568 B, `font/woff2` |
| What the engine recorded | `https://hobbang.net/packages/…/subset.0.woff2` | **404**, 146 B, `text/html` |

**Scale:** 92 of the 184 font assets in the observation's `assets.json` — and **92 of the 184 font entries carried into `site-specs/…/asset-catalog.json`** (`kindCounts.font: 184`, hosts `fonts.gstatic.com` 92 / `hobbang.net` 92) — are dead URLs. That is the entire body font family, the one on 797 of 884 elements.

**File:line:** `src/observer/collect-dom.ts:1927` builds `const entry: RawFontUrl = { url: m[2] }` from the raw `url()` text, and `RawFontUrl` (`src/observer/collect-dom.ts:226-229`) has only `{ url, family? }` — **the owning sheet's href is discarded at collection time**, so the correct base is not available later. `src/observer/collect-assets.ts:229` then does `resolve(font.url, baseUri)` with the document's base URI.

Note the asymmetry, which is what makes this generic rather than incidental: the Hahmlet URLs recovered from the *CORS-bridged* sheet are absolute in the source CSS and therefore correct (92/92), while the URLs from the *readable* third-party sheet are relative and therefore all wrong. A site whose webfont CSS uses relative `src` on any cross-origin host loses that entire family.

**What I did not measure:** the downstream effect. This run never called `assets:inventory` / `assets:materialize`, and `src/assets/fonts.ts:143` builds its font inventory from `head.fontPreloads` and live-fetched font CSS rather than from these entries. So I have measured a wrong value in two artifacts and **not** measured whether any consumer acts on it.

---

## 5. What I could NOT measure

1. **The instrument floor for most of this report.** I ran `--self-check` (§6) *after* the graded run, so the graded verdicts in §2 were classified without a floor in hand. The harness itself says PASS-reachability against this source is an open empirical question.
2. **Whether the mobile-context probe's separate element identity is correct.** This site serves one DOM to both viewports (852 elements walked in both contexts), so the case the change exists for — a site that serves a *different* DOM to mobile — is not exercised here. All I proved is that the artifact is produced and never read.
3. **Whether the double-decode in `routeKeyFromSlug` / `normalizePathname` is harmful.** No route on this site contains a literal `%`, so the hazard is unexercised. §4.7.
4. **Any downstream consequence of the font-URL base defect (§4.10).** Measured wrong in the observation and in the SiteSpec asset catalog; not traced to a consumer that acts on it, because this lane did not run the asset pipeline.
5. **The 8 rejected corrections.** The e2e proposed 2 corrections and rejected 8 on re-measurement (`correctionsProposed=2 correctionsAccepted=0 correctionsRejected=8`), so the baseline reconstruction stands. I did not open the correction records to see what they were, and I did not run `--auto-fix`.
6. **Whether `border-collapse` is the only missing table property.** I measured that property because it changed the rendering. I confirmed by reading `STYLE_WHITELIST` that `border-spacing`, `table-layout`, `caption-side` and `empty-cells` are also absent, but on this site they all happen to be at their default values, so I measured no consequence from them.
7. **The FAQ accordion's opened state.** 18 disclosure patterns were explored and all 18 came back `behaviorEquivalent`, but the scout's "empty right-hand panel" observation was not something I probed; `visibleTargetNotDeclared` is 8, meaning 8 of the 18 have no declared visible target.
8. **Licence status of Pretendard and Hahmlet.** Named as a risk by the scout; outside this lane and not investigated.

---

## 6. Instrument floor (`--self-check`)

Run id `data/hobbang.net/responsive-qa/2026-09-02T20-36-34-345Z`, same 2 routes × 5 widths, source measured against a second capture of itself. The clone is not built or served in this mode and nothing is graded — these verdicts are the floor produced by the instrument plus the live source's own instability.

| Route | Width | Floor verdict | Headline |
|---|---|---|---|
| `/` | 390 | MINOR | empty vertical band covers 3.6 % more than the source's largest (threshold 2.0 %) |
| `/` | 700 | MINOR | overlap +0.58 pp (threshold 0.10 %) |
| `/` | 1024 | **PASS** | no rubric channel fired |
| `/` | 1100 | MINOR | empty vertical band +3.5 % |
| `/` | 1440 | **PASS** | no rubric channel fired |
| `/링크모음/검색/` | 390 / 700 / 1024 / 1100 / 1440 | **PASS** ×5 | no rubric channel fired |

**Floor: BLOCKER 0, MAJOR 0, MINOR 3, PASS 7.** Lowest pixel residual against itself: **0.00 %** on `/` @1100.

This is the single most useful control in the lane. **PASS is reachable against this source at 7 of 10 pairs, and no channel above MINOR fires when the source is compared to itself.** Therefore:

- Both **BLOCKER**s and all five **MAJOR**s in §2 are the clone. None of them is instrument noise or source drift.
- `/` @1024 and `/` @1440 score PASS against themselves and BLOCKER / MINOR against the clone — so the 1024 BLOCKER in particular has a completely clean floor beneath it.
- The three MINORs in the graded run (`/` @1440, `/링크모음/검색/` @390, `/링크모음/검색/` @1440) sit above a floor of PASS on those exact pairs, so they are also real, just small.
- The graded run's pixel residuals (5.42 %–64.17 %) must be read against a self-comparison residual of 0.00 %–, not against the bare 1 % threshold.

---

## 7. Cost

| | |
|---|---|
| `e2e:reconstruct` wall clock | **7 m 27 s** (20:17:36Z → 20:25:03Z) for 20 discovered / 20 verified / 8 families / 11 observed pages / 20 generated routes |
| ↳ dominant stage | observation **132.7 s** (11 pages × 2 viewports × 2 probes), then QA **213.6 s**, interaction exploration 33.6 s, reconstruction 21.2 s, `next build` 2.7 s |
| `qa:responsive` graded, 10 pairs | **2 m 24 s** (`cloneBuildMs: 0` — the app was already built) |
| `qa:responsive --self-check`, 10 pairs | **~2 m** |
| My own probes (3 Playwright scripts + a served copy of the app) | **~3 min** |
| **Lane total** | **~16 min** of machine time |

| Artifact | Size |
|---|---|
| `data/hobbang.net/` total | **223 MB** |
| ↳ reconstruction QA | 60 MB |
| ↳ site observation | 54 MB |
| ↳ responsive QA (graded, with diff images) | 40 MB |
| ↳ reconstruction (incl. 31 MB `.next`) | 35 MB |
| ↳ SiteSpec | 32 MB |
| ↳ e2e manifest | 16 KB |
| `tmp/wr286/pilot-hobbang/` (incl. a 35 MB copy of the app I served) | 36 MB |
| Generated stylesheet | 3 543 469 B for 852 elements × 2 viewports × 11 pages |
| Mobile probe artifacts (see B3 — currently unused) | 1 209 637 B |

**Planning note for the remaining five pilots:** ~16 min and ~225 MB per pilot at 11 observed pages and 2 graded routes. `--no-diff-images` on the responsive run saves most of the 40 MB if disk is a constraint. The QA stage inside `e2e:reconstruct` is 213 s of the 447 s total and is largely redundant with `qa:responsive` for this lane's purposes.

---

## 8. Bottom line

The site did what it was chosen to do: it is a clean control, and it separated the six engine changes into three that work and three problems that had been hiding behind sites nobody could attribute.

**Working, measured:**
- Cross-origin CSS recovery found the one blocked sheet, bridged 168 411 bytes byte-exact, harvested 92/92 font URLs that were previously invisible, and invented **zero** media conditions for it (§4.1). The negative control passes on every axis.
- Probe-width derivation read 5 width conditions out of 9 `@media` rules, folded 3 authored breakpoints (640/768/1024) matching my independent `curl` exactly, and bracketed each one at ±1 px (§4.2).
- Band-edge snapping moved 187/187 edges onto the authored 1024 px breakpoint, 1 px each, 0 ambiguous, 0 midpoints kept (§4.4).
- In-band and truth-width verification: 1 106 candidates, 1 106 accepted, **0 unchecked, 0 regressed, 0 unverifiable, 0 rejected**, converged, 187/187 bands independently discriminated (§4.6).
- Bidirectional inline-size recovery decided 876 boxes (864 stretch, 12 percentage) and refused 0 (§4.5).
- Structure and content are perfect: 0 missing text on all 10 pairs, `contentExactRatio` 1.0 over 7 444 nodes, 5/5 tables and 36/22/142 `tr`/`th`/`td` reproduced exactly, the percent-encoded hangul route intact through every stage and served by the built app (§4.7, §4.9).

**Broken, measured, generic:**
1. The **desktop/mobile variant switch still guesses the midpoint of the two observation viewports** (`responsive-plan.ts:77`, 915 px here) while the site's authored breakpoints (640/768/1024) sit read and unused two artifacts away. Everything from 640 to 914 renders the 390 tree: clone `scrollHeight` at 700 is identical to its own value at 390 on both routes.
2. The **mobile-context probe is consumed by nothing.** 852 elements × 8 widths × 11 pages, 1.2 MB, and `grep` finds no reader under `src/sitespec/` or `src/reconstruction/`. Zero recovered layout rules target the mobile variant.
3. **153 boxes kept an absolute width ≥ 1000 px with no media condition**, giving the clone a 1128 px-wide document at 1024 and 1100 px viewports — both BLOCKERs. No refusal counter reports them, because they were never made candidates.
4. **`STYLE_WHITELIST` observes no table-formatting property at all.** `border-collapse` is lost on all 5 tables, they grow 2.6 %–18.3 %, and they overflow their frozen-height wrappers by 11–57 px, which is the 390 px overlap MAJOR.
5. **`@font-face` `url()` is resolved against the document base, not the stylesheet's** (`collect-dom.ts:226` discards the owning sheet's href; `collect-assets.ts:229` uses `baseUri`). 92 of 184 font assets in the SiteSpec catalog 404.
6. Independently of the engine, the reconstruct-only clone loads **no webfonts at all** (a declared limitation), which on hangul costs **+10.2 % median advance width on the display serif** and changes the line count of **33 of 200** text runs — and is invisible to every geometry channel because the clone pins 1 567 explicit heights.

The self-check floor (BLOCKER 0 / MAJOR 0 / MINOR 3 / PASS 7) means none of that is instrument noise.
