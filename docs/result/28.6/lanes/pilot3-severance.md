# Task 28.6 — PILOT-3 lane report: `gs.severance.healthcare`

- **Lane**: PILOT-3 (site lane, measurement only — no engine edits)
- **Host**: `gs.severance.healthcare` (강남세브란스병원 / Gangnam Severance Hospital, Yonsei University College of Medicine)
- **Routes in scope**: `/gs/index.do` (homepage; `https://gs.severance.healthcare/` → 302 → `/index.do` → `/gs/index.do`) and `/gs/news/news/notice.do` (notice board)
- **Date**: 2026-09-02 20:18 → 20:29 UTC
- **Status**: COMPLETE — every stage ran, every planned measurement was taken, 10/10 responsive pairs graded plus a 10/10 self-check floor.
- **Verdict**: **4 BLOCKER pairs / 5 MAJOR / 1 MINOR / 0 PASS** against a measured instrument floor of **9/10 PASS**.

> **Content note.** This is a hospital in a regulated category whose pages carry third-party accreditation marks. This was a local fidelity test. Nothing was deployed, nothing was redistributed, no identity was reused. Surfaces are described structurally below (header, nav, footer, carousel band), never as brand or identity assets.

---

## 0. Policy constraint, and how it was honoured

`robots.txt` (fetched once, 1,444 bytes, 37 `Disallow` lines) allows both target pages for `*` and disallows `/_res/` and `/_share/` — which is the site's entire CSS, JS, font and image tree.

The decision recorded for this pilot was: load the two named pages in a browser (which fetches their subresources exactly as any visitor's browser does), and run **no** asset inventory crawl, **no** `assets:materialize`, and **no** traversal of the site's 123-URL route graph.

What that forced, and what it cost:

| Constraint | Consequence for this run |
| --- | --- |
| No discovery / verification / selection | `pnpm e2e:reconstruct` could not be used: its first stage is a Firecrawl discovery crawl over the route graph. The pipeline was driven **stage by stage** from a hand-written 2-route `selected-pages.json`. This is the reason the lane did not use the end-to-end command. |
| No `assets:inventory` / `assets:materialize` | The reconstruction ran in **reference mode: 0 asset downloads**. All 74 `img src` values in the generated homepage are origin-absolute `https://gs.severance.healthcare/_res/...` URLs. |
| No route-graph traversal | 2 of the site's 123 same-host URLs were observed. Family/route coverage of the real IA is therefore **not measured** by this lane. |

**Honest disclosure about `/_res/` traffic.** Because the reconstruction is reference-mode, the *clone* hot-links `/_res/` images. When `qa:responsive` rendered the clone 10 times, the browser re-requested those images from the origin. That is a browser loading a page's own subresources, not a crawler enumerating URLs — no `/_res/` URL was ever fetched by this lane outside a page render, and no URL was discovered by crawling — but it is repeated traffic to the disallowed prefix and the orchestrator should know it happened. An asset-independent build would have removed it, and an asset-independent build is precisely what the pilot policy forbade. **No pipeline stage that would have started an asset or route crawl was invoked.**

Two supporting fetches were made outside a page render, both to allowed paths: `GET /robots.txt` and two `HEAD`-equivalent status checks on the two in-scope page URLs.

---

## 1. What was run, in order

All commands from repo root `/Users/woops/projects/web-recon`. Logs in `tmp/wr286/pilot-severance/`.

| # | Command | Elapsed | Output run id / directory |
| --- | --- | --- | --- |
| 0 | hand-written 2-route selection (see §1.1) | — | `data/gs.severance.healthcare/286-pilot3-selection/` |
| 1 | `pnpm observe:site data/gs.severance.healthcare/286-pilot3-selection/selected-pages.json --concurrency 2` | 41.0 s | `data/gs.severance.healthcare/site-observations/2026-09-02T20-18-25-207Z` |
| 2 | `pnpm detect:interactions .../site-observation.json` | 302 ms | written into the observation run (`interaction-analysis.json`) |
| 3 | `pnpm explore:interactions .../interaction-analysis.json --plan-only` | <1 s | `data/gs.severance.healthcare/interaction-explorations/2026-09-02T20-21-19-380Z` |
| 4 | `pnpm explore:interactions .../interaction-analysis.json --concurrency 2` | 10.0 s | `data/gs.severance.healthcare/interaction-explorations/2026-09-02T20-21-26-135Z` |
| 5 | `pnpm model:interactions .../interaction-exploration.json` | 27 ms | `data/gs.severance.healthcare/interaction-models/2026-09-02T20-21-40-378Z` |
| 6 | `pnpm compile:sitespec .../interaction-patterns.json` | 989 ms | `data/gs.severance.healthcare/site-specs/2026-09-02T20-22-33-705Z` |
| 7 | `pnpm reconstruct .../site-spec.json` | 3.04 s generate + 2.66 s `next build` | `data/gs.severance.healthcare/reconstructions/2026-09-02T20-22-39-166Z` |
| 8 | `pnpm qa:responsive .../reconstruction-manifest.json --widths 390,700,1024,1100,1440` | 98.9 s | `data/gs.severance.healthcare/responsive-qa/2026-09-02T20-23-29-169Z` |
| 9 | same, `--self-check --quiet` (instrument floor) | 108.2 s | `data/gs.severance.healthcare/responsive-qa/2026-09-02T20-25-23-675Z` |
| 10 | `tmp/wr286/pilot-severance/import-depth-probe.mjs` (lane-local, read-only) | 4.9 s | `tmp/wr286/pilot-severance/import-graph.json` |
| 11 | `tmp/wr286/pilot-severance/import-rulecount-probe.mjs` (lane-local, read-only) | ~5 s | `tmp/wr286/pilot-severance/import-rulecount.json` |

Steps 10–11 exist because **the engine records no `@import` depth**, and the brief asks for it. They load each in-scope page once in Chromium and enumerate the CSSOM. They fetch nothing themselves.

### 1.1 The hand-written selection, and an engine inconsistency it exposed

`observe:site` accepts a `selected-pages.json` whose sibling files are **optional by design** (`src/multi-observer/load-selection.ts:279-306` — "Siblings are OPTIONAL by design: a selection copied elsewhere is still observable"). The run started cleanly with only `selected-pages.json` present, printing three skipped cross-checks.

`compile:sitespec` then refused:

```
[compile:sitespec] INPUT ERROR — cannot locate page-families.json (Task 08) recorded as
"data/gs.severance.healthcare/286-pilot3-selection/page-families.json".
Tried 9 location(s) relative to the working directory and the referring artifacts.
```

`src/sitespec/load-inputs.ts:353-373` **hard-requires** both `page-families.json` and `verified-urls.json`. So the two stages disagree about whether those files are optional, and the disagreement surfaces four stages and ~4 minutes of browser work after the point where it could have been caught. Recorded as an engine defect (§5, D6). Workaround used: a matching `page-families.json` + `verified-urls.json` were written next to the selection, describing exactly the two singleton families that were actually observed. No count, URL or hash was invented beyond what the two observed pages already establish.

---

## 2. Responsive grade table

`pnpm qa:responsive --widths 390,700,1024,1100,1440`, both routes. Run `2026-09-02T20-23-29-169Z`.

| Route | Width | Verdict | B/M/m | Deciding channel | Value vs source |
| --- | ---: | --- | --- | --- | --- |
| `/gs/index.do` | 390 | **BLOCKER** | 1/1/1 | `overlap-excess-ratio` | 41.91% more viewport overlap than source (source's own 31.6%; threshold 10%) |
| `/gs/index.do` | 700 | **BLOCKER** | 1/3/2 | `overlap-excess-ratio` | 24.82% excess (source 16.14%; threshold 10%) |
| `/gs/index.do` | 1024 | **BLOCKER** | 2/4/4 | `footer-clipped` | clone footer max right **1440** in a 1024 viewport; source 1024 |
| `/gs/index.do` | 1100 | MAJOR | 0/3/2 | `horizontal-overflow-excess-px` | clone scrollWidth 1440−1100=340 vs source 1280−1100=180 → excess **160 px** (threshold 16) |
| `/gs/index.do` | 1440 | MAJOR | 0/1/2 | `position-delta-p90-px` | p90 **5,232 px**, max 7,194 px over 202 matched boxes (threshold 48) |
| `/gs/news/news/notice.do` | 390 | MINOR | 0/0/1 | `pixel-residual-difference-ratio` | 13.96% of compared pixels (threshold 1%); `position-delta-p90 = 0 px` |
| `/gs/news/news/notice.do` | 700 | MAJOR | 0/2/2 | `right-gutter-excess-ratio` | clone content ends at **390 px** in a 700 px viewport → 310 px dead gutter = 44.3% excess (threshold 15%) |
| `/gs/news/news/notice.do` | 1024 | **BLOCKER** | 2/3/6 | `footer-clipped` | clone footer max right **1440** in a 1024 viewport; source 1024 |
| `/gs/news/news/notice.do` | 1100 | MAJOR | 0/2/2 | `horizontal-overflow-excess-px` | excess **160 px** (clone 340, source 180) |
| `/gs/news/news/notice.do` | 1440 | MAJOR | 0/1/2 | `position-delta-p90-px` | p90 **442 px**, max 1,114 px over 59 matched boxes; **median 0 px** |

`pairs: 10 measured, 0 failed | BLOCKER 4 MAJOR 5 MINOR 1 PASS 0`

### 2.1 The instrument floor — source measured against itself

Run `2026-09-02T20-25-23-675Z`, `--self-check`, same widths, same routes:

| Route | Width | Floor verdict | `position-delta-p90` | `pixel-residual` | `overlap-excess` |
| --- | ---: | --- | ---: | ---: | ---: |
| `/gs/index.do` | 390 | MAJOR | 320 px | 5.37% | 0 |
| `/gs/index.do` | 700 / 1024 / 1100 / 1440 | **PASS** | 0 px | 0.00% | 0 |
| `/gs/news/news/notice.do` | 390 / 700 / 1024 / 1100 / 1440 | **PASS** | 0 px | 0.00% | 0 |

`pairs: 10 measured | BLOCKER 0 MAJOR 1 MINOR 0 PASS 9`

**This is the single most important calibration in the lane.** The source is deterministic under the capture policy: 9 of 10 pairs reach a literal-zero floor on every geometry and pixel channel. Therefore **every BLOCKER and MAJOR on those 9 pairs is a genuine clone defect, not source instability or instrument noise.** The one exception is `/gs/index.do @390`, where the source's own two captures differ (49 offscreen characters, 320 px position p90) — that is the four `slick` carousels landing on different slides between captures, exactly as the scout predicted. The clone's 390 numbers (4,950 px p90, 41.91% overlap excess) are an order of magnitude above that floor, so the carousel drift explains only a small fraction of them, but the 390 homepage pair is the one pair whose numbers should not be read as purely the clone's fault.

---

## 3. BLOCKERs and MAJORs, diagnosed

The nine non-MINOR verdicts reduce to **three** distinct engine causes plus one source-shape effect.

### D1 — BLOCKER — the document tier switch is still a midpoint guess (915 px), not an authored breakpoint

**Fires on**: `/gs/index.do @1024` and `/gs/news/news/notice.do @1024` (2 BLOCKER pairs, 4 blocker findings), and contributes to both `@1100` MAJORs and both `@700` findings.

**What the engine observed.** The site authors a full Bootstrap-style ladder. Measured in the observation artifact (`pages/p000001/observation.json → viewports.desktop.stylesheetCoverage.authoredMediaConditions`): 12 distinct media conditions, dominated by `(max-width: 1024.98px)` with **275** matched declarations and `(min-width: 1025px)` with **158**. The probe pass then derived widths from those very breakpoints and sampled `1024` and `1025` as an adjacent pair (`layout-probe.json → widthProvenance.origins`: `1024 source=floor alsoAuthored=true breakpointPx=1024 kind=max`, `1025 source=authored-above`).

**What the engine emitted.** `app/app/globals.css` lines 26–35:

```css
@media (max-width: 914.98px) { [data-wr-viewport="desktop"] { display: none; } }
@media (min-width: 915px)    { [data-wr-viewport="mobile"]  { display: none; } }
```

915 = `Math.floor((390 + 1440) / 2)` — `src/reconstruction/responsive-plan.ts:77`, `method: "observed-endpoint-midpoint"`. The function reads only `siteSpec.responsiveModel.observedViewports` and never consults the authored-breakpoint histogram the same run collected.

**Why that is wrong.** The clone carries two complete DOM trees — one captured at 390 and one at 1440 — and this query decides which is displayed. At a 1024 px viewport the clone shows the **1440-captured desktop tree** (1024 ≥ 915) while the source is still inside `(max-width: 1024.98px)`. Measured consequences at 1024, identical on both routes:

- clone `scrollWidth` **1440** vs source **1024** → `horizontal-overflow-excess-px = 416` (exactly 1440−1024)
- `footer-clipped`: clone footer max right 1440 > 1024, source 1024 → **BLOCKER**
- `nav-link-ratio`: source shows 3 visible header links (its ≤1024.98 header), the clone shows **1 of 3** because the desktop header is laid out at 1440 and its links fall outside the 1024 viewport → **BLOCKER**
- `/gs/index.do @1024` additionally: `column-container-mode-delta = 3` — "a matched container lays its children out as 1 row of 5 where the source uses 3 rows of 2"

**The contrast that makes this a clean finding.** The *same generated stylesheet* contains 99 banded rules and **all 99** are emitted at `@media (max-width: 1024.98px)` — the site's real authored value, snapped, not guessed (`grep -oh "@media[^{]*" app/public/wr/generated-styles.css | sort | uniq -c` → `99 @media (max-width: 1024.98px)`). So Wave-4a band-edge snapping demonstrably works, and the document-level tier switch was never routed through it. Two responsive mechanisms, one snapped and one guessed, in one stylesheet.

**Location**: `src/reconstruction/responsive-plan.ts:73-80` (and the docstring at :14 which states the rule as "the midpoint of the two observed widths … the same rule for every site — no per-site table, no 768, no 1024").

### D2 — BLOCKER/MAJOR — between the two captured widths, box widths stay frozen at the capture width

**Fires on**: `/gs/index.do @390` and `@700` (`overlap-excess-ratio` BLOCKER), `/gs/news/news/notice.do @700` (`right-gutter-excess-ratio` MAJOR), and both `@1100` MAJORs.

**Measured.** At a 700 px viewport the clone shows the mobile tree (700 < 915) whose boxes carry their 390-captured pixel widths:

- `/gs/news/news/notice.do @700`: "unused right gutter: clone **310 px of 700** (content ends at 390); source **0 px of 700** (content ends at 700)" → 44.3% excess, threshold 15%
- `/gs/index.do @700`: clone content ends at 540 px in a 700 px viewport → 22.9% excess; `scroll-height-ratio-high 1.33×`
- `/gs/index.do @1100`, `/gs/news @1100`: the clone shows the 1440-frozen desktop tree → `scrollWidth 1440` at a 1100 viewport (excess 160 px over the source's own 180 px of overflow)

**Why the recovered-rule system did not fix it.** The reconstruction recovered 184 layout rules over **3,005 nodes carrying probe data** — 6.1%. Of those 184: `fullWidth 68`, `centered 15`, `percentage 2`, `responsiveHidden 99`, `gridTrack 0`. So only **85 of 3,005 nodes (2.8%)** received any inline-size rule at all; everything else keeps its captured px. On a page whose layout is 134 flex containers deep, that leaves the overwhelming majority of boxes rigid between the two capture widths.

This is the same root cause 28.5C named ("frozen px"), reproduced on a site nobody tuned against, and it is now the dominant residual once D1 is set aside.

### D3 — MAJOR — `position-delta-p90-px` fires on all 10 pairs; on the homepage it is dominated by off-screen carousel track geometry

**Measured, homepage** (`/gs/index.do`): p90 4,950 / 4,623 / 4,703 / 5,152 / 5,232 px at 390/700/1024/1100/1440. Those exceed the viewport by 3–13×, so they are horizontal displacements of boxes that live off-screen. The channel notes give the mechanism: at 390 the **source's** unfiltered content right edge is **6,100 px** while the **clone's** is **540 px**; at 1440, source 6,888 px vs clone 1,680 px. The source's four `slick` tracks lay their non-active slides out to the right of the viewport; the clone does not reproduce those off-screen track offsets, so every matched slide box is displaced by thousands of px.

**The carousel-free control confirms it.** `/gs/news/news/notice.do` has no carousel: p90 = **0 / 310 / 943 / 362 / 442 px** at the five widths, with **median 0 px** at 390, 1100 and 1440. At 390 the notice board is reproduced with a p90 of 0 px and a max of 10 px — the engine renders a plain 73-container flex CMS page at its capture width essentially exactly.

So `position-delta-p90-px` is one finding with two very different populations: a genuine but bounded frozen-px tail on the carousel-free page, and a large carousel-track artifact on the homepage. Do not read the homepage's 5,000 px as a whole-page displacement.

### D4 — MAJOR — `missing-text-ratio` 2.37% at `/gs/news/news/notice.do @1024`

The clone drops 2.37% of the source's visible text at 1024 (threshold 2.00%), and 0.80% at `/gs/index.do @1024` (MINOR there). Both are at 1024 only; at 390, 700, 1100 and 1440 the channel does not fire on either route. That width-locality is the whole of the evidence, and it points at D1 — 1024 is the one graded width where the two sides are in different authored tiers. **I did not identify which characters are missing**, so "the two tiers render different text" is an inference from the width-locality, not a measurement. Treat it as a symptom of D1 until someone diffs the text census at that pair.

### D5 — not a clone defect — `/gs/index.do @390` carousel slide desync

The self-check floor at this pair is MAJOR (49 offscreen characters, 320 px p90, 5.37% pixel residual). The source's two captures of itself disagree because the `slick` instances autorotate. Any grade at this one pair carries that floor.

---

## 4. Engine-change measurements

### 4.1 `@import` expansion — the brief's headline question

The engine's own counters, read from `pages/<id>/observation.json → viewports.<vp>.stylesheetCoverage`:

| Field | `/gs/index.do` desktop | `/gs/index.do` mobile | `/gs/news/.../notice.do` desktop | mobile |
| --- | ---: | ---: | ---: | ---: |
| `stylesheetsTotal` | 5 | 5 | 7 | 7 |
| `cssomReadable` | 5 | 5 | 7 | 7 |
| `cssomBlocked` | **0** | 0 | 0 | 0 |
| `fallbackRecovered` / `fallbackMissed` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| `importsExpanded` | **0** | 0 | 0 | 0 |
| `importsUnresolved` | **0** | 0 | 0 | 0 |
| `importRulesVisited` | **5** | 5 | 5 | 5 |
| `rulesIndexed` | **4,126** | 4,126 | 4,162 | 4,162 |
| `ruleIndexCapHit` | false | false | false | false |
| `elementsWithAuthoredRules` | 1,674 (all) | 1,658 (all) | 1,335 (all) | 1,335 (all) |
| `bytesCaptured` | 927,932 | 927,932 | 934,179 | 934,179 |
| `bytesBridged` | 0 | 0 | 0 | 0 |
| distinct `authoredMediaConditions` | **12** | 12 | **16** | 16 |

**Read this carefully: `importsExpanded: 0` does not mean no `@import` was expanded.** On this site every `@import` was followed, five of them, through the CSSOM at `src/observer/collect-dom.ts:1013-1053` — counted as `importRulesVisited: 5`. The fields *named* `importsExpanded` / `importsUnresolved` count only the **Node-side text-inlining** path, which runs solely for CORS-blocked sheets; with `cssomBlocked: 0` that path structurally cannot fire. See §5 D7.

**Independent measurement of the graph** (`tmp/wr286/pilot-severance/import-graph.json`, `import-rulecount.json`):

| Measurement | `/gs/index.do` | `/gs/news/.../notice.do` |
| --- | ---: | ---: |
| `document.styleSheets` roots | 5 | 7 |
| `@import` rules found | **5** | **5** |
| **Maximum `@import` depth** | **1** | **1** |
| Nested (`depth ≥ 2`) imports | **0** | **0** |
| **Unresolved imports** | **0** | **0** |
| Unreadable sheets anywhere in the graph | 0 | 0 |

The graph is flat: `cms.css` imports 3 sheets, `style.css` imports 2, and none of those five import anything further.

**What the five imports are worth** (style rules counted recursively, descending into `@media`):

| | Directly enumerable (no import following) | Behind an `@import` | Behind-import share |
| --- | ---: | ---: | ---: |
| Style rules (`/gs/index.do`) | 310 | **4,748** | **93.9%** |
| `@media` rules | 1 | **493** | **99.8%** |
| `@font-face` rules | 0 | **5** | **100%** |
| `@keyframes` rules | 0 | **6** | **100%** |
| Style rules (`/gs/news/.../notice.do`) | 365 | 4,748 | 92.9% |

Per-import breakdown (identical on both routes):

| Depth | Imported sheet | Rules |
| ---: | --- | ---: |
| 1 | `/_res/_common/_plugin/froala-editor/latest/css/froala_style.min.css` | 81 |
| 1 | `/_res/_common/css/define.min.css` | 153 |
| 1 | `/_res/_common/css/row-col.min.css` | 59 |
| 1 | `/_res/yuhs/_share/css/common.css` | **1,402** |
| 1 | `/_res/yuhs/_share/css/hospital.css` | **1,236** |

**Conclusion.** This is the cleanest available confirmation of the non-CORS `@import` path. The pre-28.6 walker saw 310 style rules, 1 media rule and 0 `@font-face` on this page — which is exactly what the domain scout recorded and flagged as implausible. Following the five imports recovers **4,748 style rules, 493 media rules, 5 `@font-face` and 6 `@keyframes`**, and 11 of the homepage's 12 distinct media conditions exist *only* behind an import. Nothing went unresolved, nothing went deeper than one level, and the CSSOM read every sheet without needing the response-body bridge.

### 4.2 Probe widths derived from authored breakpoints (Wave-3 change #3)

`layout-probe.json → widthProvenance`:

| | `/gs/index.do` desktop | `/gs/index.do` mobile | `/gs/news` desktop | `/gs/news` mobile |
| --- | ---: | ---: | ---: | ---: |
| floor widths | 7 | 5 | 7 | 5 |
| `conditionsRead` | 12 | 12 | 16 | 16 |
| `breakpointsFolded` | 9 | 9 | 12 | 12 |
| `breakpointsAdopted` | 6 | 3 | 6 | 6 |
| `breakpointsAlreadyBracketed` | 3 | 2 | 3 | 2 |
| `breakpointsOutOfRange` | 0 | 4 | 0 | 4 |
| **`breakpointsDroppedByCap`** | 0 | 0 | **3** | 0 |
| `capHit` | false | false | **true** | false |
| `widthsAdded` | 9 | 4 | 9 | 8 |
| `queriesEmptyInterval` | 1 | 1 | 1 | 1 |
| final widths | 16 | 9 | 16 | 13 |

Homepage desktop probe widths: `390, 574, 575, 576, 700, 767, 768, 991, 992, 1024, 1025, 1100, 1440, 1920` (plus floors) — every authored edge bracketed on both sides. This works, and it is what makes §4.3's snap shift tiny.

**But the cap bites.** On `/gs/news/news/notice.do` desktop the 16-width cap was reached and **3 real authored breakpoints were refused**: `768/max`, `992/min`, `1200/min` (`breakpointsRefused[].reason = "cap"`). The cap is spent floor-first — `src/observer/probe-widths.ts:218-221` seeds `chosen` with all 7 floor widths *before* any authored bracket is considered, and `:267-271` then refuses authored brackets once `chosen.size + missing.length > cap`. The result is that un-authored floor widths (700, 1100, 1920) survived while three of the site's own breakpoints did not. That inverts the stated intent of the change. It is **counted, not silent** — `breakpointsRefused` itemises all three — which is the right honesty behaviour, but the priority order is wrong. See §5 D8.

The `queriesEmptyInterval: 1` on all four probes is the site's own authored nonsense: `(min-width: 1025px) and (max-width: 1024.98px)`, an empty interval, correctly refused rather than turned into a band.

### 4.3 Band edges snapped to authored breakpoints (Wave-4a change #4)

`reconstruction-manifest.json → layout`:

| Field | Value |
| --- | ---: |
| `bandEdgesConsidered` | 99 |
| **`bandEdgesSnapped`** | **99 (100%)** |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 |
| `bandEdgeSnapShiftPx` (total, all 99 edges) | **99 px** |
| `authoredBreakpointEntries` | 10 |
| `authoredBreakpointDeclarations` | 77,596 |
| `authoredBreakpointUnparsedDeclarations` | 0 |
| `authoredBreakpointTruncatedNodes` | 630 |

Verified at the output, not just the counter: all 99 banded rules in `app/public/wr/generated-styles.css` are emitted at `@media (max-width: 1024.98px)` — the site's own authored value. **Zero midpoint fallbacks.**

The total shift of 99 px across 99 edges (≈1 px each) is not a weak result — it is §4.2 working. Because the probe already sampled `1024` and `1025` adjacently, the midpoint guess was 1024.5 and the authored edge 1024.98, so there was under a pixel to correct. The two changes compose: authored-derived probe widths make the gap tiny, snapping then places the edge exactly.

Caveat recorded honestly: `authoredBreakpointTruncatedNodes: 630` means 630 nodes' authored-declaration lists were truncated at observation time, so the histogram those snaps were drawn from is incomplete for those nodes. It still produced 10 entries from 77,596 declarations with 0 unparsed.

### 4.4 Bidirectional inline-size recovery (Wave-4a change #5) on a 134-container flex hierarchy

The site's flex census, measured from the observation (`dom.json` + `styles.json` + `layout-probe.json` parent array):

| | `/gs/index.do` | `/gs/news/.../notice.do` |
| --- | ---: | ---: |
| Elements | 1,674 | 1,335 |
| **Flex containers** (`display:flex\|inline-flex`) | **134** | 73 |
| **Grid containers** | **0** | **0** |
| Flex items (children of a flex container) | 187 | 130 |
| …of which the parent is `row`/`row-reverse` (inline = main axis) | **133** | 106 |

The inline-size decision split, both pages combined (`reconstruction-manifest.json → layout`):

| Decision | Count |
| --- | ---: |
| Nodes carrying probe data | 3,005 |
| Inline-size candidates evaluated | ~86 |
| `widthModeStretch` (`width:auto`, observed-stretch box) | **83** |
| `widthModeFillPercentage` (percentage) | **0** |
| `widthModeRefusals` | **3** |
| — reason `flex-item-main-axis` | **3** |
| `rejectedByGuard` | 10 |
| — `abs-containing-block-not-parent` | 6 |
| — `flex-item-basis-governed` | 4 |
| `rejectedByTruthCheck` | **0** |
| `rejectedUnverifiable` / `acceptedUnchecked` / `acceptedRegressed` | 0 / 0 / 0 |
| `gridTrackColumns` / `gridTrackRefusals` | 0 / 0 |

**The brief predicted refusals would concentrate here. They did not, and the reason is the finding.** 239 of the two pages' 317 flex items sit on a row-direction main axis, which is the exact shape `src/reconstruction/layout-inference.ts:684` refuses — yet only **3** refusals were recorded. The refusal is not reached because `inlineSizeBehaviour` is consulted only for nodes that already became inline-size *candidates*, and only ~86 of 3,005 probed nodes (2.9%) ever do. The other ~236 row-axis flex items are never asked the question; they simply keep their captured pixel width.

So on the deepest flex site in the pool, the `flex-item-main-axis` refusal channel is **effectively dormant (3 of ~239 candidates it could have judged)**, and the un-asked majority is precisely the population that produces D2's frozen-width gutters. The refusal counter is honest about what it saw; it is not a measure of how many flex items went unhandled.

Two positives worth stating plainly: `widthModeFillPercentage: 0` and `widthValueRefusals: 0` mean the engine never fell back to a percentage it could not justify, and **`rejectedByTruthCheck: 0` with `truthCheckConverged: true` over 2 rounds** means all 184 accepted rules survived truth-width verification.

### 4.5 In-band and truth-width verification (Wave-4a change #6)

| Field | Value |
| --- | ---: |
| `candidateRules` / `acceptedRules` | 184 / 184 |
| `rejectedByGuard` | 10 |
| `rejectedByTruthCheck` | **0** |
| `bandCheckable` | 99 |
| `rejectedByBandCheck` | **0** |
| `bandSampleMismatches` | **0** |
| `bandIndependentlyDiscriminated` | 99 |
| `bandHiddenByAncestorAtBandWidth` | 87 |
| `bandExactTierHidesAtBandWidth` | 0 |
| `bandTruthBaselineNotInLayout` | 0 |
| `truthCheckStatus` | `verified` |
| `truthCheckable` / rounds / pages rendered | 85 / 2 / 2 (2,677 ms) |
| `acceptedButRegressing` | 0 |

Every banded rule was verifiable and none was rejected. Note `bandHiddenByAncestorAtBandWidth: 87` — 87 of the 99 bands were discriminable only because an ancestor hides at the band width, which is a weaker form of evidence than the element hiding on its own; it is counted and not hidden.

### 4.6 Mobile-context layout probe with its own element identity (Wave-3 change #2)

Exercised and coherent. `layout-probe-mobile.json` exists for both pages with its own element census (`elementCount 1,658` on the homepage vs the desktop probe's `1,674`; `1,335` on the notice page for both), its own floor set (`390,480,700,768,914`), and its own provenance — including 4 `out-of-range` refusals per page for the desktop-only breakpoints (`1024/max`, `1025/min`, `992/min`, `1200/min`), which is the correct behaviour for a probe whose envelope tops out at 914.

The 16-element DOM difference between the two contexts is the site's genuine per-viewport content difference (the scout recorded a quick-link tile present at 390 and absent at 1440), so the separate identity is doing real work here rather than duplicating the desktop tree.

### 4.7 Cross-origin CSS recovery (Wave-1 change #1) — NOT EXERCISED

`cssomBlocked: 0`, `fallbackRecovered: 0`, `fallbackMissed: 0`, `bytesBridged: 0` on all four viewport captures. Every stylesheet is same-origin and CSSOM-readable. **This lane produces no evidence for or against the cross-origin recovery path.** Any claim about it must come from a lane whose site actually blocks.

### 4.8 Is the responsive behaviour authored through media queries at all?

**Yes, emphatically — the "fixed-width desktop CMS with no breakpoints" case the brief asked about is NOT what this site is, and this lane therefore does NOT test the band builder's no-breakpoint path.**

Measured: 494 `@media` rules on the homepage (493 behind an `@import`), 12 distinct conditions there and 16 on the notice page, with 6 distinct breakpoint pixels adopted into the probe (574/575, 767/768, 991/992, 1024/1025, 1199/1200, and 320/321 + 480/481 on the notice page). The authored ladder in descending rule weight:

| Condition | Matched declarations (homepage) |
| --- | ---: |
| `(max-width: 1024.98px)` | 275 |
| `(min-width: 1025px)` | 158 |
| `(max-width: 767.98px)` | 45 |
| `(min-width: 768px)` | 4 |
| `(min-width: 768px) and (max-width: 1024.98px)` | 4 |
| `(max-width: 574.98px)` | 2 |
| `(min-width: 992px)` | 1 |
| `(min-width: 1200px)` | 1 |
| `(min-width: 576px) and (max-width: 1024.98px)` | 1 |
| `(max-width: 575.98px)` | 1 |
| `(min-width: 1025px) and (min-width: 1025px)` | 1 |
| `(min-width: 1025px) and (max-width: 1024.98px)` — empty interval | 1 |

The notice page adds four more, all directly enumerable rather than behind an import: `screen and (max-width: 1024px / 768px / 480px / 320px)`.

The clone reproduces **one** of these six-plus breakpoints (`1024.98`, on 99 hidden/shown rules) and replaces the tier switch with a guessed 915.

### 4.9 Interaction stages, for completeness

114 candidates detected (0 P1); the safe planner reduced them to **3 executable actions** (111 skipped: 65 hidden, 22 shape-duplicate, 12 priority, 10 capability, 2 form-submit guard). 3/3 executed, 1 changed, 0 patterns confirmed, 3 unknowns (2 `style-only-change`, 1 `insufficient-evidence`). Zero navigations, popups, downloads, write-requests or dialogs were triggered. Nothing was implemented in the clone from an unknown. This is the polite-client behaviour working as intended; it is also why the four carousels are never driven.

---

## 5. Engine defects recorded (measured, generic, NOT fixed)

| ID | Severity | Defect | Evidence |
| --- | --- | --- | --- |
| D1 | **BLOCKER** | Document tier switch is a midpoint of the two observed viewport widths and ignores the authored-breakpoint histogram collected in the same run. 915 px emitted where the site authors 1024.98/1025 with 433 matched declarations. | `src/reconstruction/responsive-plan.ts:73-80`; `app/app/globals.css:26-35`; 2 BLOCKER pairs at @1024, `horizontal-overflow-excess-px = 416` on both routes |
| D2 | **BLOCKER** | Between the two capture widths, box inline sizes stay frozen: only 85 of 3,005 probed nodes (2.8%) receive any inline-size rule. | `reconstruction-manifest.json → layout` (`recoveredRules 184`, `nodesWithProbe 3005`); `right-gutter-excess-ratio` 0.4429 at `/gs/news @700` (clone content ends at 390 px in a 700 px viewport) |
| D3 | MAJOR | `position-delta-p90-px` conflates a bounded frozen-px tail with off-screen carousel-track displacement; the homepage's 5,232 px p90 is not a whole-page displacement and the channel does not separate the two populations. | homepage p90 4,623–5,232 px with source content right edge 6,100–6,888 px vs clone 540–1,680 px; carousel-free route p90 0–943 px |
| D8 | MAJOR | Probe-width cap is spent floor-first, so un-authored floor widths displace the site's own authored breakpoints. On `/gs/news` desktop, 3 authored breakpoints (`768/max`, `992/min`, `1200/min`) were refused for `cap` while floor widths 700/1100/1920 — none of them authored — were kept. | `src/observer/probe-widths.ts:218-221` and `:267-271`; `layout-probe.json → widthProvenance.breakpointsDroppedByCap = 3`, `capHit = true` |
| D6 | MAJOR | `observe:site` documents its sibling files as optional and runs without them; `compile:sitespec` hard-requires `page-families.json` and `verified-urls.json`. The contradiction is discovered four stages and minutes of browser work later. | `src/multi-observer/load-selection.ts:279-306` vs `src/sitespec/load-inputs.ts:353-373`; exact error in §1.1 |
| D7 | MAJOR | `stylesheetCoverage.importsExpanded` / `importsUnresolved` are named as if they describe all `@import` handling, but they count only the CORS text-inlining path. A same-origin `@import` whose `styleSheet` is `null` and whose body was not captured is skipped with **no counter at all**, so `importsUnresolved: 0` cannot be read as "no import went unresolved". | `src/observer/collect-dom.ts:1047-1053` (`if (imported) { visit(...) } continue;` — no else, no counter); this run reports `importsExpanded: 0, importsUnresolved: 0` while `importRulesVisited: 5` and my independent probe confirms 5 expanded / 0 unresolved |
| D9 | MINOR | `bandHiddenByAncestorAtBandWidth: 87` of 99 — most band evidence is ancestor-mediated rather than the element's own hiding. Counted, not hidden, but it weakens the band evidence and no channel grades that weakness. | `reconstruction-manifest.json → layout` |
| D10 | MINOR | `authoredBreakpointTruncatedNodes: 630` — the breakpoint histogram is built from truncated declaration lists on 630 nodes; the truncation happens at observation time and is not attributable to a named cap in the reconstruction record. | `reconstruction-manifest.json → layout` |

None of these were fixed. No file under `src/` or `scripts/` was modified by this lane.

---

## 6. What I could NOT measure, and why

Stated bluntly, because an unmeasured thing presented as measured is the worst outcome available here.

1. **Cross-origin CSS recovery (Wave-1 change #1) — zero evidence either way.** `cssomBlocked: 0` on all four captures. The bridge never ran. Do not count this lane toward that change.
2. **Asset independence, font licensing, fallback cost.** `assets:inventory` and `assets:materialize` were forbidden by the pilot policy. The clone hot-links 74 origin-absolute `/_res/` images. The site's two self-hosted Korean webfonts (NanumSquare / NanumGothic, 5 `@font-face` rules recovered behind the imports) were **not** licence-reviewed and **no** hangul fallback-metric cost was measured. `font-source-binding-unverified` is carried in the manifest limitations.
3. **Route/family coverage of the real IA.** 2 of 123 same-host URLs. No discovery, no verification, no family formation actually ran — the families in `page-families.json` are two hand-written singletons matching what was observed, not a measured grouping. Nothing in this lane says how the engine handles this site's 98-path navigation graph.
4. **The "no authored breakpoints" case the brief asked about.** This site authors 494 media rules. The band builder's behaviour when a site ships a fixed-width desktop layout with no breakpoints is **not exercised here** and remains untested by this lane.
5. **`@import` depth beyond 1.** The site's import graph is flat (max depth 1). Whether the walker handles nested imports, import cycles or a `@import` inside `@media` correctly is **not** tested by this site. It also means the engine's unbounded import recursion (no depth counter in `visit`) was never stressed.
6. **Carousel state.** Four `slick` instances were captured frozen at whatever slide they were on. No stage pins slide state. `/gs/index.do @390` carries that as a measured floor (49 chars, 320 px); at the other nine pairs the source was byte-stable, so the effect is bounded but not eliminated.
7. **Downstream stages.** No template compile, content injection, theme, SEO, production build or release stage was run. This lane measured observation → SiteSpec → reconstruction → responsive grade only.
8. **Whether D1's fix would clear the @1024 BLOCKERs.** I did not re-run with `--breakpoint 1025`, because re-running to make something pass is exactly what the brief forbids. The causal chain is measured (clone `scrollWidth` 1440 at a 1024 viewport, clone in its ≥915 tier, source in its ≤1024.98 tier); the counterfactual is not.
9. **The 1 uncaught page error** the domain scout recorded on both viewports. Not investigated; not visible in any pipeline artifact this lane produced.

---

## 7. Cost — wall clock and artifacts

**Lane wall clock**: 2026-09-02 20:18:23Z → 20:29:07Z ≈ **10 min 44 s**, of which machine time is **≈ 4 min 25 s**; the rest is artifact analysis.

| Stage | Elapsed |
| --- | ---: |
| `observe:site` (2 pages × 2 viewports + 2 layout probes) | 41.0 s |
| `detect:interactions` | 0.3 s |
| `explore:interactions` (plan + 3 live actions) | 10.0 s |
| `model:interactions` | 0.03 s |
| `compile:sitespec` | 1.0 s |
| `reconstruct` (generate 3.0 s + `next build` 2.7 s) | 5.7 s |
| `qa:responsive` (10 pairs, clone mode) | 98.9 s |
| `qa:responsive --self-check` (10 pairs) | 108.2 s |
| two lane-local CSSOM probes | ~10 s |

| Artifact | Size |
| --- | ---: |
| `site-observations/2026-09-02T20-18-25-207Z` | 45 MB |
| `site-specs/2026-09-02T20-22-33-705Z` | 45 MB |
| `reconstructions/2026-09-02T20-22-39-166Z` | 34 MB |
| `responsive-qa/2026-09-02T20-23-29-169Z` (clone) | 29 MB |
| `responsive-qa/2026-09-02T20-25-23-675Z` (self-check) | 33 MB |
| `interaction-explorations` (2 runs) + `interaction-models` + selection | 0.2 MB |
| **`data/gs.severance.healthcare/` total** | **186 MB** |
| `tmp/wr286/pilot-severance/` (logs + probes + JSON) | 0.1 MB |

**Planning note for the remaining pilots.** A 2-route, 1,674-element site costs ~4.5 minutes of machine time and ~186 MB, and roughly half of both is the two `qa:responsive` sweeps. The self-check sweep costs as much as the graded sweep and was worth every second here: without it, nine of these ten verdicts could not have been attributed to the clone with confidence.

---

## 8. Files

- Selection inputs (hand-written, see §1.1): `data/gs.severance.healthcare/286-pilot3-selection/{selected-pages,page-families,verified-urls}.json`
- Logs, probes and extracted findings: `tmp/wr286/pilot-severance/` (`01-observe.log` … `10-import-rulecount.log`, `findings.txt`, `import-graph.json`, `import-rulecount.json`, `robots.txt`)
- Graded run: `data/gs.severance.healthcare/responsive-qa/2026-09-02T20-23-29-169Z/responsive-qa.json` + `contact-sheet.png`
- Floor run: `data/gs.severance.healthcare/responsive-qa/2026-09-02T20-25-23-675Z/responsive-qa.json`
