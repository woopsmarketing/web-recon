# Task 28.6 — SITE LANE P3 report: `gs.severance.healthcare`

- **Lane**: P3 (site lane, measurement only — no engine edits, no `src/`/`scripts/` writes)
- **Host**: `gs.severance.healthcare` (강남세브란스병원 / Gangnam Severance Hospital, Yonsei University College of Medicine) — enterprise Java CMS
- **Routes in scope**: `/gs/index.do` (site root; `https://gs.severance.healthcare/` → 302 → `/index.do` → `/gs/index.do`) and `/gs/news/news/notice.do` (notice board)
- **Window**: 2026-09-02 23:12:27Z → 23:35:31Z UTC — **23 min 04 s wall clock**
- **Status**: COMPLETE — every planned stage ran, 10/10 clone pairs graded, 10/10 self-check pairs graded, every engine-change measurement taken.
- **Verdict**: **2 BLOCKER pairs / 7 MAJOR / 1 MINOR / 0 PASS**, against a measured instrument floor of **6 PASS / 3 MAJOR / 1 BLOCKER**.
- **Review images**: `/Users/woops/projects/web-recon/docs/result/28.6/review/severance/` (17 MB, 20 source/clone PNGs + 2 BLOCKER composites)

> **Content note.** A hospital in a regulated category whose pages carry third-party accreditation marks. This was an isolated local fidelity test. Nothing was deployed, nothing redistributed, no identity reused. Surfaces are described structurally (header, nav, card grid, carousel band, footer), never as brand or identity assets.

---

## 0. Policy constraint, and how it was honoured

`robots.txt` re-fetched once this run (`GET /robots.txt`, 200, 1,444 bytes, 37 `Disallow` lines — unchanged from the previous pilot). For `User-agent: *` it disallows `/_res/` and `/_share/` — the site's entire CSS, JS, font and image tree — while allowing both target pages.

What I therefore did and did not run:

| Constraint | What I did |
| --- | --- |
| No discovery crawl | **`pnpm e2e:reconstruct` was NOT invoked.** Its first stage is a Firecrawl discovery crawl over the route graph. The pipeline was driven **stage by stage** from the existing hand-written 2-route selection at `data/gs.severance.healthcare/286-pilot3-selection/`. No stage I ran started a crawl; none printed a discovery/verification/selection phase. |
| No asset crawl | `assets:inventory` and `assets:materialize` were **not run**. The reconstruction ran in `assetMode: "reference"`, `assetDownloads: 0`. |
| No route-graph traversal | 2 of the site's ~123 same-host URLs were observed. Route/family coverage of the real IA is **not measured** by this lane. |
| Browser-as-visitor only | The two pages were loaded in a browser, which fetches their own subresources exactly as any visitor's browser does. |

**Honest disclosure about `/_res/` traffic.** The clone is reference-mode, so it hot-links 23 distinct `/_res/` URLs (86 references: 74 on the homepage, 12 on the notice board). Rendering the clone 10 times in the grader re-requested those from the origin. That is a browser loading a page's own subresources, never a crawler enumerating URLs, and no `/_res/` URL was ever fetched outside a page render. An asset-independent build would remove this, and an asset-independent build is exactly what the policy forbids here.

Fetches made outside a page render: **one**, `GET /robots.txt`.

Four lane-local read-only probes each load an in-scope page in a browser and read the CSSOM/DOM; they fetch nothing themselves. They exist because the engine records no `@import` depth and no UA/resize divergence, and because the brief asks for those numbers.

---

## 1. What I ran, in order

Repo root `/Users/woops/projects/web-recon`. Logs in `tmp/wr286/w7-severance/`.

| # | Command | Elapsed | Run id / output |
| --- | --- | ---: | --- |
| 0 | `curl https://gs.severance.healthcare/robots.txt` | <1 s | `tmp/wr286/w7-severance/robots.txt` |
| 1 | `pnpm observe:site data/gs.severance.healthcare/286-pilot3-selection/selected-pages.json --concurrency 2` | 55 s | `site-observations/2026-09-02T23-12-35-974Z` |
| 2 | `pnpm detect:interactions <obs>/site-observation.json` | 1 s | written into the observation run |
| 3 | `pnpm explore:interactions <obs>/interaction-analysis.json --concurrency 2` | 31 s | `interaction-explorations/2026-09-02T23-13-41-012Z` |
| 4 | `pnpm model:interactions <exp>/interaction-exploration.json` | 1 s | `interaction-models/2026-09-02T23-14-14-907Z` |
| 5 | `pnpm compile:sitespec <mod>/interaction-patterns.json` | 3 s | `site-specs/2026-09-02T23-14-20-394Z` |
| 6 | `pnpm reconstruct <spec>/site-spec.json` | 43 s (38.9 s generate + 3.0 s `next build`) | `reconstructions/2026-09-02T23-14-26-447Z` |
| 7 | `pnpm qa:responsive <recon>/reconstruction-manifest.json --widths 390,700,1024,1100,1440` | 242 s | `responsive-qa/2026-09-02T23-15-14-631Z` |
| 8 | same `--self-check --quiet` (instrument floor) | 306 s | `responsive-qa/2026-09-02T23-19-24-311Z` |
| 9 | `npx tsx tmp/wr286/w7-severance/import-depth-probe.mjs` | 11 s | `import-graph.json` |
| 10 | `npx tsx tmp/wr286/w7-severance/import-rulecount-probe.mjs` | 10 s | `import-rulecount.json` |
| 11 | `npx tsx tmp/wr286/w7-severance/fontface-probe.mjs` (new this lane) | ~10 s | `fontface.json` |
| 12 | `npx tsx tmp/wr286/w7-severance/ua-divergence-probe.mjs` (new this lane) | ~60 s | `ua-divergence.json` |
| 13 | `npx tsx tmp/wr286/w7-severance/resize-vs-load-probe.mjs` (new this lane) | ~90 s | `resize-vs-load.json` |

`--with-self-check` was **not** used: the floor was measured as a separate invocation so it gets its own run id. Consequence recorded honestly — the clone artifact carries `selfCheckFloor.status: absent` and its own `[no-self-check-floor]` limitation, and §3 adjudicates it by hand against run `…T23-19-24-311Z`, which is comparable (same site, rubric, channel roster, widths, routes) but was captured **4 minutes later**.

### Artifact sizes

| Artifact | Size |
| --- | ---: |
| site-observations | 45 MB |
| interaction-explorations | 180 KB |
| interaction-models | 20 KB |
| site-specs | 47 MB |
| reconstructions (incl. built app) | 34 MB |
| responsive-qa (clone) | 29 MB |
| responsive-qa (self-check) | 33 MB |
| **total under `data/`** | **~188 MB** |
| review images | 17 MB |
| lane scratch | 960 KB |

---

## 2. The verdict table

`pnpm qa:responsive --widths 390,700,1024,1100,1440`, both routes. Run **`2026-09-02T23-15-14-631Z`** (mode: clone).

| Route | Width | Verdict | B/M/m | Deciding channel | Measured value vs source |
| --- | ---: | --- | --- | --- | --- |
| `/gs/index.do` | 390 | MAJOR | 0/1/1 | `position-delta-p90-px` | 550 px p90 over 86 on-viewport matched boxes, max 1,205 px (threshold 48) |
| `/gs/index.do` | 700 | **BLOCKER** | 2/2/3 | `missing-text-ratio` | **52.17%** — 1,286 of 2,465 source visible characters unpainted, 19 of 88 distinct strings (threshold 10%) |
| `/gs/index.do` | 1024 | **BLOCKER** | 3/4/2 | `image-presence-ratio` | clone renders **6 of 27** visible image leaves (22%, threshold 50%); plus `missing-text-ratio` 53.43%, `visible-text-ratio` 46.1% |
| `/gs/index.do` | 1100 | MAJOR | 0/3/2 | `horizontal-overflow-excess-px` | clone scrollWidth 1440−1100=340 vs source 1280−1100=180 → excess **160 px** (threshold 16) |
| `/gs/index.do` | 1440 | MAJOR | 0/1/2 | `position-delta-p90-px` | 1,285 px p90 over 113 boxes, max 1,962 px |
| `/gs/news/news/notice.do` | 390 | MINOR | 0/0/1 | `pixel-residual-difference-ratio` | 13.96% of compared pixels; `position-delta-p90 = 0 px` |
| `/gs/news/news/notice.do` | 700 | MAJOR | 0/1/2 | `position-delta-p90-px` | 310 px p90 over 41 boxes (left p90 10 px, right p90 310 px) |
| `/gs/news/news/notice.do` | 1024 | MAJOR | 0/1/3 | `position-delta-p90-px` | 634 px p90 over 41 boxes, max 645 px; `scroll-height-ratio-high 1.52×` |
| `/gs/news/news/notice.do` | 1100 | MAJOR | 0/2/2 | `horizontal-overflow-excess-px` | excess **160 px** (clone 340, source 180) |
| `/gs/news/news/notice.do` | 1440 | MAJOR | 0/1/2 | `position-delta-p90-px` | 442 px p90 over 59 boxes, max 1,114 px |

`pairs: 10 measured, 0 failed | BLOCKER 2 MAJOR 7 MINOR 1 PASS 0`

### 2.1 Delta against the previous run of this site (v5 engine, `…T20-23-29-169Z`)

| | previous | this run |
| --- | ---: | ---: |
| BLOCKER pairs | 4 | **2** |
| MAJOR pairs | 5 | **7** |
| MINOR / PASS | 1 / 0 | 1 / 0 |
| self-check floor PASS | 9 / 10 | **6 / 10** |

The two BLOCKER pairs are not the same two. **Four old BLOCKERs were fixed and two new ones were created**, on different routes and channels:

| Old BLOCKER (v5) | Status now | Cause |
| --- | --- | --- |
| `/gs/index.do @390` `overlap-excess-ratio` 41.91% | **GONE** (now 0.0 minor) | tree switch + mobile probe |
| `/gs/index.do @700` `overlap-excess-ratio` 24.82% | **GONE** | as above |
| `/gs/index.do @1024` `footer-clipped` (clone footer right 1440 in a 1024 viewport) | **GONE** — `footer-clipped 0`, both sides 1024/1024 | tree switch snapped 915 → 1025 |
| `/gs/news/… @1024` `footer-clipped` | **GONE** — both sides 1024/1024 | as above |
| — | **NEW** `/gs/index.do @700` missing-text 52.17% | mobile-probe band rules (§4) |
| — | **NEW** `/gs/index.do @1024` image-presence 22% / missing-text 53.43% | mobile-probe band rules (§4) |

So the tree-switch change did exactly what it was built to do on this site, and the viewport-parameterised mobile inference introduced a strictly worse defect on the same page.

---

## 3. The instrument floor — source measured against itself

Run **`2026-09-02T23-19-24-311Z`**, `--self-check`, same widths, same routes, same rubric and channel roster.

| Route | Width | Floor verdict | `offscreen-text-excess-chars` | `position-delta-p90` | `pixel-residual` | `missing-text` |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `/gs/index.do` | 390 | MAJOR | 38 | 320 px | 5.49% | 0 |
| `/gs/index.do` | 700 | **PASS** | 0 | **0 px** | **0.00%** | 0 |
| `/gs/index.do` | 1024 | MAJOR | 23 | 256 px | 6.81% | 0 |
| `/gs/index.do` | 1100 | **BLOCKER** | **109** (threshold 80) | 829 px | 5.32% | 0 |
| `/gs/index.do` | 1440 | MAJOR | 23 | 257 px | 8.63% | 0 |
| `/gs/news/news/notice.do` | 390 / 700 / 1024 / 1100 / 1440 | **PASS ×5** | 0 | **0 px** | **0.00%** | 0 |

`pairs: 10 measured | BLOCKER 1 MAJOR 3 MINOR 0 PASS 6`

**How to read every verdict in §2 against this floor:**

1. **`/gs/news/news/notice.do` is a literal-zero instrument at all five widths.** 0 px position delta, 0.00% pixel residual, 0 offscreen excess, PASS. **Every finding on the notice route in §2 is a genuine clone defect**, with no source instability and no instrument noise in it.
2. **`/gs/index.do @700` also floors at literal zero and PASS.** The 52.17% missing-text BLOCKER there is therefore **100% clone defect**. This is the single most important calibration in the lane.
3. `/gs/index.do @390 / @1024 / @1440` floor at MAJOR on `offscreen-text-excess-chars` (23–38 chars) and `position-delta-p90` (256–320 px). The clone's numbers at those pairs are 2–5× the floor on position and add channels the floor never touches (`missing-text 53.43%`, `image-presence 22%` at 1024), so the 1024 BLOCKER survives the floor comfortably. The 390 and 1440 MAJORs are `position-delta-p90` only, at 550 px and 1,285 px against a floor of 320 px and 257 px — real but only 1.7× and 5× above noise.
4. **`/gs/index.do @1100` is UNADJUDICABLE.** The floor at that pair is itself a BLOCKER (109 offscreen chars). The clone's verdict there is MAJOR — *better* than the floor. Nothing can be concluded about the clone at 1100 on the homepage from this run.

**Why the floor fell from 9 PASS to 6 PASS.** All four non-PASS floor pairs are the homepage; the notice board is 5/5 PASS in both runs. All four are driven by `offscreen-text-excess-chars` + `position-delta-p90` and none by `missing-text` (0 on every pair). That is the signature of the four `slick` carousels autorotating between the pair's two captures: the source disagrees with itself about which slide is on-screen and where the off-screen track sits. The floor moved because **the source moved**, on a page whose instability was already named in the previous run at @390 and this time happened to catch four widths instead of one. I did not measure a change in the instrument itself, and I cannot separate "the rubric got stricter" from "the carousels landed differently" from a single pair of runs — stated as a limit, not a conclusion.

**PASS is not the grading criterion.** 0 of 10 clone pairs reached PASS; 4 of 10 *source-against-itself* pairs did not reach it either. Grade on blockerPairs and majorPairs.

---

## 4. BLOCKER diagnosis — the mobile probe reports DOM replacement as responsive hiding

This is one defect and it produces both BLOCKER pairs. It is measured end to end, at file:line, with a carousel-free control on the same site.

### 4.1 What ships

`app/public/wr/generated-styles.css` contains exactly **195** banded `display: none` rules. Every one of them targets the **homepage mobile subtree**:

```css
@media (min-width: 576px) {
  [data-wr-page="p000001"][data-wr-viewport="mobile"] [data-wr-node="n002961"] { display: none; }
}
```

| Band | Rules | Selector scope |
| --- | ---: | --- |
| `@media (min-width: 576px)` | **112** | `[data-wr-page="p000001"][data-wr-viewport="mobile"]` |
| `@media (min-width: 768px)` | **83** | `[data-wr-page="p000001"][data-wr-viewport="mobile"]` |
| total | **195** | — |
| `/gs/news/news/notice.do` (p000002) | **0** | — |

Both bands are **open on the right** (`bandEdgesOpen: 195`), and `app/app/globals.css:26-35` removes the mobile subtree only at `@media (min-width: 1025px)`. So over **[576, 1025)** the homepage mobile tree loses 112 nodes and over **[768, 1025)** it loses 195.

That interval is exactly where the two BLOCKERs sit, and exactly where nothing else fires:

| Width | Bands in force | `missing-text-ratio` | `image-presence-ratio` |
| ---: | ---: | ---: | ---: |
| 390 | 0 | not fired | 1.00 (27/27) |
| 700 | 112 | **52.17%** | 1.00 (27/27) |
| 1024 | 195 | **53.43%** | **0.222 (6/27)** |
| 1100 | 0 (desktop tree) | not fired | 1.00 |
| 1440 | 0 (desktop tree) | not fired | 1.00 |

### 4.2 What those 195 nodes are

I resolved all 195 node ids inside `app/reconstruction-data/pages/p000001.json` (195 of 195 located). They are the homepage's **news / medical-report card carousel**: 111 under `div>div>div`, 33 under `div>a>div`, 32 under `div>div>a`, 8 under `div>ul>li`, plus a `button` labelled `Previous` — a slider arrow. Together they carry **7,139 characters** of card titles, category labels and dates.

The grader's independent `missingText` sample at both BLOCKER pairs is the same content, string for string: the ten news/medical-report headlines plus `"2026-08-24"`, `"2026-08-25"`. Two independent measurements, one from the emitted CSS and one from the rendered page, name the same nodes.

### 4.3 The source hides none of it

Two lane-local read-only probes (`resize-vs-load-probe.mjs`, `ua-divergence-probe.mjs`), mobile emulation, homepage:

| | 390 | 480 | 574 | 575 | **576** | 700 | 767 | **768** | 914 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| source visible chars | 3443 | 3443 | 3443 | 3443 | **3500** | 3500 | 3500 | 3500 | 3500 |
| source elements at `display:none` | 108 | 108 | 108 | 108 | **108** | 108 | 108 | **108** | 108 |
| source elements not at `display:none` | 1553 | 1553 | 1553 | 1553 | **1561** | 1561 | 1561 | 1561 | 1561 |

The real page's `display:none` census is **flat at 108 across the whole 390…914 range**. Between 390 and 576 it *gains* 8 elements and 57 visible characters. It hides nothing. Fresh loads at 390/576/700/768/914 reproduce the resize ladder exactly, so this is not a resize artifact of my probe either.

A second probe confirms the site is **not** UA-switched: desktop-UA and mobile-UA loads at 390, 700 and 1024 return identical `visibleChars`, element counts, `scrollWidth` and `scrollHeight` (3443/3500/3543 chars; 1661/1669/1677 elements). The engine's `treeDivergence: "dual-dom"` with `pagesDivergentWalk: 1` describes a *width*-driven DOM difference between the 390 and 1440 captures, not a UA-served one.

### 4.4 The cause, at file:line, in the engine's own artifact

`src/observer/layout-probe.ts:416-435` — the per-width visibility signal:

```ts
for (const el of state?.elements ?? []) {
  if (!el.isConnected) { disconnected++; x.push(0); w.push(0); v.push(0); continue; }
  ...
  v.push(style.display !== "none" && style.visibility !== "hidden"
      && style.visibility !== "collapse" && rect.width > 0 && rect.height > 0 ? 1 : 0);
}
```

`state.elements` is a snapshot of Element references taken **once**, before the resize ladder. This site's `slick` carousels destroy and rebuild their slide DOM at their own 576 and 768 settings, so every replaced node becomes `isConnected === false` and is written `v = 0` — indistinguishable from "authored CSS hides this here".

The engine measures the exact quantity that proves it, and writes it into the artifact. `pages/p000001/layout-probe-mobile.json`:

| probe width | `v = 0` count | **`disconnected`** | Δ`v=0` | Δ`disconnected` |
| ---: | ---: | ---: | ---: | ---: |
| 390 | 1113 | **0** | — | — |
| 480 | 1113 | 0 | 0 | 0 |
| 574 | 1113 | 0 | 0 | 0 |
| 575 | 1113 | 0 | 0 | 0 |
| **576** | 1225 | **112** | **+112** | **+112** |
| 700 | 1225 | 112 | 0 | 0 |
| 767 | 1225 | 112 | 0 | 0 |
| **768** | 1312 | **199** | **+87** | **+87** |
| 914 | 1312 | 199 | 0 | 0 |

**Every single newly-"hidden" node is a newly-disconnected node. 112 = 112; 87 = 87.** Not one element on this page changed its computed `display` between 390 and 914 (§4.3), and the engine's own `disconnected` counter says so on the same row it says `v=0`.

`src/reconstruction/layout-inference.ts:1946-2020` then reads those zeros as an authored responsive hide, and `snapBandEdges` snaps the band edges onto the site's *real* authored `576` and `768` breakpoints — which makes the fabricated rule look **more** credible, not less. 195 rules ship at a total snap shift of 195 px (1 px per edge).

Two corroborating facts:

- **The carousel-free control on the same site.** `/gs/news/news/notice.do` has no `slick` instance: its mobile probe records `disconnected: 0` at all 13 widths and `v = 0` flat at 1183. It emits **zero** band rules and has **zero** missing-text findings at any width. Same engine, same run, same site, no carousel, no defect.
- **The desktop probe is hit by the same mechanism earlier.** `pages/p000001/layout-probe.json` reports `disconnected: 222` at the *first* sample and at every width including the truth width 1440 — 222 of 1,674 nodes (13.3%) were already stale before the ladder began. Those read `v=0` everywhere, so they fall into `hidden-at-truth-width` and are dropped rather than mis-banded. Different outcome, same root cause. `/gs/news/…` desktop: 28 of 1,335 (2.1%).

### 4.5 Why the truth check passed it

`rejectedByBandCheck: 0`, `bandCheckable: 195`, `bandIndependentlyDiscriminated: 195`, `bandExactTierHidesAtBandWidth: 0` ⇒ by the counter's own stated arithmetic (`layout-truth-check.ts:275-288`) all 195 rules were independently discriminated. They were — **against the clone**. The check re-renders the generated app at each band's verify width and reads the node's own computed `display`; the clone's copy of the same rule hides it there, so the check agrees with itself. Nothing in the loop ever re-asks the **source** whether the node is visible at 576 or 768. `bandHiddenByAncestorAtBandWidth: 190` of 195 shows how much of that subtree was answered for by an ancestor.

**This is a truth check that cannot fail on a fabricated band**, because its ground truth is the same probe sample that fabricated it.

### 4.6 What a human sees

`docs/result/28.6/review/severance/index_0700_source.png` vs `index_0700_clone.png`: the source's `NEWS` heading is followed by three news cards with Korean headlines and dates; the clone's `NEWS` heading is followed by **empty blue space**. At 1024 the same section is empty and the page's promo tiles collapse from a 2-column grid into one narrow column occupying the left 843 px of a 1024 px viewport.

---

## 5. MAJOR diagnosis — frozen px between the two captured widths

`position-delta-p90-px` fires on **all 10 pairs** and `horizontal-overflow-excess-px` on both `@1100` pairs. This is the residual named by 28.5C, still present, and now the dominant defect once §4 is set aside.

**Measured, `/gs/news/news/notice.do`** (the carousel-free control, whose floor is 0 px at every width, so every number is clone):

| Width | `position-delta-p90` | tree shown | what it is |
| ---: | ---: | --- | --- |
| 390 | **0 px** | mobile (capture width) | exact |
| 700 | 310 px | mobile (frozen at 390) | cards keep their 390 px width in a 700 px viewport |
| 1024 | 634 px | mobile (frozen at 390) | one narrow column where the source lays out two; `scroll-height-ratio 1.52×` |
| 1100 | 362 px | desktop (frozen at 1440) | `scrollWidth 1440` vs source `1280` → 160 px excess overflow |
| 1440 | 442 px | desktop (capture width) | residual |

The clone is exact at each capture width (390 p90 = 0 px, max 10 px on a 73-flex-container CMS page) and degrades monotonically with distance from it. The `@1100` `horizontal-overflow-excess-px = 160 px` on both routes is arithmetically the frozen desktop width: clone `1440 − 1100 = 340`, source `1280 − 1100 = 180` (the site's own `min-width: 1280px` container, visible in the desktop probe as `documentWidth` snapping to 1280 for every width in 1025…1199).

**Why inline-size recovery does not close it** — the partition, from `reconstruction-manifest.json → layout`:

| | count | of 972 |
| --- | ---: | ---: |
| `emitted-full-width` | 245 | 25.2% |
| `emitted-centered-max-width` | 21 | 2.2% |
| **`no-branch-matched`** | **693** | **71.3%** |
| `refused-containing-block-guard` | 11 | 1.1% |
| `refused-width-mode` | 2 | 0.2% |

**266 of 972 candidate nodes (27.4%) received an inline-size rule.** The other 71.3% keep their captured pixel width. On a page that is 134 flex containers deep with 0 grid containers, that leaves the overwhelming majority of boxes rigid between 390 and 1440.

`percentage: 0` and `gridTrack: 0` — neither branch fired anywhere on this site.

---

## 6. Engine-change measurements

### 6.1 The tree switch — **snapped, and it worked**

`reconstruction-manifest.json → config.inferredBreakpoint`:

| Field | Value |
| --- | --- |
| `value` | **1025** |
| `provenance` | `inferred` |
| **`method`** | **`authored-breakpoint`** (previous run: `observed-endpoint-midpoint`, value 915) |
| `mobileObservedWidth` / `desktopObservedWidth` | 390 / 1440 |
| `candidateCount` | 4 |
| `ambiguous` | **true** |
| `candidatesOutsideObservedInterval` / `candidatesOmitted` | 0 / 0 |
| `pagesRead` / `pagesWithHistogram` / `pagesWithUsableProbe` | 2 / 2 / 2 |
| `treeDivergence` | `dual-dom` |
| `pagesIdenticalWalk` / `pagesDivergentWalk` / `pagesWalkNotComparable` | 1 / 1 / 0 |
| `domSwitchWidthObserved` | false |

Candidates and how the winner won:

| px | `authoredWeight` | `authoredPages` | `observedChange` | `observedChangePages` | `observedChangeUnattributablePages` |
| ---: | ---: | ---: | ---: | ---: | ---: |
| **1025** | **8,986** | 2 | **576** | 2 | 0 |
| 768 | 297 | 2 | 8 | 1 | 1 |
| 576 | 50 | 1 | 124 | 2 | 0 |
| 575 | 9 | 1 | 117 | 2 | 0 |

1025 wins on both signals simultaneously and by 30× on authored weight. `app/app/globals.css` emits `@media (max-width: 1024.98px)` / `@media (min-width: 1025px)` — the site's own authored ladder, which the source stylesheet carries with 275 and 158 matched declarations respectively. **This change is correct on this site and it removed 4 BLOCKER findings** (both `footer-clipped` pairs, both `nav-link-ratio` pairs). `ambiguous: true` is reported honestly and did not mislead.

**Carry-forward risk, measured not speculated:** the mobile probe's width ladder is still hard-capped at 914 (`src/observer/types.ts:1837-1839`, `MOBILE_LAYOUT_PROBE_WIDTHS = [390, 480, 700, 768, 914]`, whose docstring says "the set stays BELOW the desktop/mobile switch"). 914 is the old midpoint minus one. With the switch now at 1025, the mobile tree is displayed over **[0, 1025)** but is probed only over **[390, 914]** — 111 px of the mobile tier is never sampled, and `probe-widths.ts:216-217` derives `maxWidth` from the largest floor width so `:308` refuses every authored bracket above it. On this site the mobile probe therefore refused the two heaviest conditions the page authors:

| Refused authored breakpoint | matched declarations | reason |
| --- | ---: | --- |
| `1024 / max` | **280** | `out-of-range` |
| `1025 / min` | **159** | `out-of-range` |
| `992 / min` | 1 | `out-of-range` |
| `1200 / min` | 1 | `out-of-range` |

Counted, itemised, never silent — but the constant and the snapped switch now disagree with each other.

### 6.2 Probe widths derived from authored breakpoints

| | p1 desktop | p1 mobile | p2 desktop | p2 mobile |
| --- | ---: | ---: | ---: | ---: |
| floor widths | 7 | 5 | 7 | 5 |
| `conditionsRead` | 12 | 12 | 16 | 16 |
| `conditionsWeight` | 494 | 494 | 498 | 498 |
| `breakpointsFolded` | 9 | 9 | 12 | 12 |
| `breakpointsAdopted` | 6 | 3 | 8 | 6 |
| `breakpointsAlreadyBracketed` | 3 | 2 | 3 | 2 |
| `breakpointsOutOfRange` | 0 | **4** | 0 | **4** |
| `breakpointsDroppedByCap` | 0 | 0 | **1** | 0 |
| `capHit` | false | false | **true** | false |
| `floorWidthsEvicted` | — | — | **700, 768, 1100** | — |
| `breakpointsAdoptedByEviction` | 0 | 0 | **2** | 0 |
| `widthsAdded` | 9 | 4 | 12 | 8 |
| `queriesEmptyInterval` | 1 | 1 | 1 | 1 |
| final width count | 16 | 9 | 16 | 13 |

Derived width sets:

- **p1 desktop**: `390, 574, 575, 576, 700, 767, 768, 991, 992, 1024, 1025, 1100, 1199, 1200, 1440, 1920` — every authored edge bracketed on both sides.
- **p1 mobile**: `390, 480, 574, 575, 576, 700, 767, 768, 914`
- **p2 desktop**: `320, 321, 390, 480, 481, 574, 575, 576, 767, 769, 991, 992, 1024, 1025, 1440, 1920`
- **p2 mobile**: `320, 321, 390, 480, 481, 574, 575, 576, 700, 767, 768, 769, 914`

**The floor-eviction rule (W6 O3) now works and I measured it working.** On p2 desktop the 16-width cap was hit; the previous run refused three real authored breakpoints (`768/max`, `992/min`, `1200/min`) to keep un-authored floor widths. This run evicted the floor widths `700, 768, 1100` instead and adopted 2 more authored brackets, leaving exactly **one** refusal (`1200/min`, `reason: "cap"`). The guaranteed floor `[390, 1024, 1920]` survived. This is a clean, measured improvement.

`queriesEmptyInterval: 1` on all four probes is the site's own authored nonsense — `(min-width: 1025px) and (max-width: 1024.98px)` — correctly refused rather than turned into a band.

### 6.3 Band edges snapped versus midpoint-kept

| Field | Value |
| --- | ---: |
| `bandEdgesConsidered` | 195 |
| **`bandEdgesSnapped`** | **195 (100%)** |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | **0** |
| `bandEdgesKeptMidpointEmptyHistogram` | **0** |
| `bandEdgesKeptMidpointNoHistogram` | **0** |
| `bandEdgesOpen` | **195** |
| `bandEdgeSnapShiftPx` (total, 195 edges) | **195 px** (1.0 px/edge) |
| `bandSampleMismatches` | 0 |
| `authoredBreakpointEntries` | 20 |
| `authoredBreakpointDeclarations` | **154,796** |
| `authoredBreakpointUnparsedDeclarations` | **0** |
| `authoredBreakpointTruncatedNodes` | **1,256** |
| `authoredBreakpointPages` | `{ "spec-field": 4 }` |

Verified at the output, not just the counter: all 195 emitted bands read `min-width: 576px` or `min-width: 768px`, both real authored edges on this site. Zero midpoint fallbacks.

**The uncomfortable finding**: this mechanism worked perfectly and made §4 worse. 100% snap onto the site's own numbers is what turned 195 DOM-replacement artifacts into rules that look authored. `bandEdgesOpen: 195` — every band is open on the right, so the fabricated hide runs to the tree switch. And `authoredBreakpointTruncatedNodes: 1,256` (up from 630) means the histogram those snaps drew on is incomplete for 1,256 nodes.

### 6.4 Desktop/mobile recovered-rule split — **the headline change, and it fired**

| | desktop | mobile |
| --- | ---: | ---: |
| `viewportPasses` | 2 | 2 |
| `viewportPassesUsed` | 2 | 2 |
| `viewportPassRefusals` | — (none) | — (none) |
| **`rulesByViewport`** | **35** | **426** |
| **`shippedRulesByViewport`** | **35** | **426** |

Previous run: mobile received **exactly zero** rules. It now receives 426 of 461 (92.4%). All four viewport passes ran and none was refused. Of the 426 mobile rules, **195 are the `display:none` bands of §4** and 231 are inline-size rules.

So the change did what it says. On this site it is net-negative: it removed the frozen-390 `overlap-excess-ratio` BLOCKERs at 390 and 700 and replaced them with two larger missing-content BLOCKERs, because the probe feeding it cannot distinguish a replaced node from a hidden one.

### 6.5 Inline-size outcome partition, including `no-branch-matched` by reason

**Brief's question: did `no-branch-matched` fall from 693 of 972? — NO. It is 693 of 972, identical to the wave6-core measurement on this host, to the digit.**

Pre-stage drops (`inlineSizePreStageDrops`) and the surviving partition:

| Stage | Reason | Count |
| --- | --- | ---: |
| nodes with probe data | — | **5,994** |
| pre-stage drop | `hidden-at-truth-width` | 4,497 |
| pre-stage drop | `display-not-blockish` | 306 |
| pre-stage drop | `truth-sanity-mismatch` | 219 |
| **= `inlineSizeCandidates`** | | **972** |
| outcome | `emitted-full-width` | 245 |
| outcome | `emitted-centered-max-width` | 21 |
| outcome | **`no-branch-matched`** | **693** |
| outcome | `refused-containing-block-guard` | 11 |
| outcome | `refused-width-mode` | 2 |
| `inlineSizeOutcomeDoubleCounts` | | **0** |

**The partition is exact in both directions.** 5,994 − (4,497 + 306 + 219) = 972, and 245 + 21 + 693 + 11 + 2 = 972. No node is unaccounted and none is double-counted. The counter change delivers what it promised: the previously invisible 693 are now named. It did not reduce them.

Related refusal counters: `widthModeRefusals: 2` (`flex-item-main-axis` 1, `out-of-flow-auto-margin` 1), `widthValueRefusals: 0`, `gridTrackRefusals: 0`, `guardRefusalsByReason: { abs-containing-block-not-parent: 11 }`.

**Caveat on the 4,497.** §4.4 shows 222 of 1,674 homepage desktop nodes read `v = 0` at *every* width because their Element references were stale before the ladder started. Those land in `hidden-at-truth-width`. So an unmeasured part of the largest bucket is DOM churn, not hiding, and the bucket's name overstates its certainty.

### 6.6 Truth-check accounting, every drop explained

| Field | Value | Explanation |
| --- | ---: | --- |
| `truthCheckStatus` | `verified` | Chromium available, check ran |
| `candidateRules` | 461 | rules proposed |
| `acceptedRules` | **461** | all shipped |
| `rejectedByGuard` | 11 | `abs-containing-block-not-parent` — the only drop |
| `rejectedByTruthCheck` | **0** | no geometry rule regressed |
| `rejectedUnverifiable` | **0** | every rule had a rect and a page |
| `acceptedUnchecked` | **0** | nothing shipped blind |
| `acceptedRegressed` | **0** | — |
| `truthCheckable` | 266 | the geometry rules (245 full-width + 21 centered) |
| `truthCheckRounds` / `truthCheckPagesRendered` | 4 / 4 | |
| `truthCheckConverged` | **true** | settled inside `MAX_ROUNDS` |
| `bandCheckable` | 195 | the banded rules |
| `rejectedByBandCheck` | **0** | — |
| `bandWidthsRendered` | 2 | 576 and 768 |
| `bandIndependentlyDiscriminated` | 195 | presence count |
| `bandExactTierHidesAtBandWidth` | **0** | ⇒ discriminated = 195 − 0 = **195** |
| `bandHiddenByAncestorAtBandWidth` | 190 | an ancestor would have answered for 97.4% of them |
| `bandTruthBaselineNotInLayout` | 0 | — |
| `bandSampleMismatches` | 0 | bands reproduce the probe samples exactly |

Reconciliation: 461 candidates = 266 geometry + 195 banded. 461 accepted, 11 guard-rejected before candidacy. Every number is explained; nothing is dropped without a reason.

**And every one of those green numbers is compatible with §4.** The check is self-consistent and externally wrong: `bandSampleMismatches: 0` says the bands reproduce *the probe*, and the probe is what fabricated them.

### 6.7 Stylesheet coverage — blocked / recovered / missed

| Field | p1 desktop | p1 mobile | p2 desktop | p2 mobile |
| --- | ---: | ---: | ---: | ---: |
| `stylesheetsTotal` | 5 | 5 | 7 | 7 |
| `cssomReadable` | 5 | 5 | 7 | 7 |
| **`cssomBlocked`** | **0** | 0 | 0 | 0 |
| **`fallbackRecovered`** | **0** | 0 | 0 | 0 |
| **`fallbackMissed`** | **0** | 0 | 0 | 0 |
| `sheetsRedirectResponses` / `sheetsRedirectAliasesKeyed` / `sheetsRedirectChainsTruncated` | 0 / 0 / 0 | 0 | 0 | 0 |
| `sheetsSkippedBySizeCap` / `sheetsBodyUnavailable` / `sheetsOffered` | 0 / 0 / 0 | 0 | 0 | 0 |
| `bytesCaptured` | 927,932 | 927,932 | 934,179 | 934,179 |
| `bytesBridged` | 0 | 0 | 0 | 0 |
| `rulesIndexed` | 4,126 | 4,126 | 4,162 | 4,162 |
| `ruleIndexCapHit` | false | false | false | false |
| `nestedRulesVisited` | 0 | 0 | 0 | 0 |
| `groupingRulesSkipped` | 0 | 0 | 0 | 0 |
| `elementsWithAuthoredRules` | 1,674 (all) | 1,658 (all) | 1,335 (all) | 1,335 (all) |
| distinct `authoredMediaConditions` | 12 | 12 | 16 | 16 |
| `authoredMediaConditionsDropped` / `CapHit` | 0 / false | 0 / false | 0 / false | 0 / false |
| `sheetsMediaScoped` / `Trivial` / `Unreadable` | 0 / 0 / 0 | 0 | 0 | 0 |
| `mediaConditionsDistributed` / `Negated` | 0 / 0 | 0 | 0 | 0 |
| **`fontFaceUrlsHarvested`** | **0** | **0** | **0** | **0** |
| `fontFaceUrlsAbsolute` / `SheetResolved` / `DocumentResolved` | 0 / 0 / 0 | 0 | 0 | 0 |

**Coverage is complete: 0 blocked, 0 recovered, 0 missed, every element carrying authored rules, no cap hit anywhere.** The redirected-stylesheet recovery change is **not exercised** on this site — `sheetsRedirectResponses: 0`, so there was nothing to recover. Not evidence for or against it.

Top authored media conditions by matched declarations (identical on both routes): `(max-width: 1024.98px)` **275**, `(min-width: 1025px)` **158**, `(max-width: 767.98px)` 45, `(min-width: 768px)` 4, `(min-width: 768px) and (max-width: 1024.98px)` 4, then singles. `authoredBreakpointDeclarations` over the whole reconstruction: **154,796**, `authoredBreakpointUnparsedDeclarations: 0`.

### 6.8 `@import` expansion — the brief's headline question

**Engine counters** (per page/viewport, identical desktop and mobile):

| Field | `/gs/index.do` | `/gs/news/.../notice.do` |
| --- | ---: | ---: |
| `importRulesVisited` | **5** | 5 |
| `importRulesFollowed` | **5** | 5 |
| `importRulesRecovered` | 0 | 0 |
| `importRulesUnresolved` | **0** | 0 |
| `importsResolvedTotal` | **5** | 5 |
| `importsUnresolvedTotal` | **0** | 0 |
| `importsExpanded` (Node-side text-inlining path) | 0 | 0 |
| `importsUnresolved` (same path) | 0 | 0 |

The previous run's ambiguity is gone: the CSSOM-follow path and the Node-side text-inlining path are now counted separately, and `importRulesFollowed: 5` says plainly that all five imports were followed. `importsExpanded: 0` is correct and no longer misleading — that path runs only for CORS-blocked sheets, and `cssomBlocked` is 0.

**Independent measurement** (`tmp/wr286/w7-severance/import-graph.json`, `import-rulecount.json`):

| | `/gs/index.do` | `/gs/news/.../notice.do` |
| --- | ---: | ---: |
| `document.styleSheets` roots | 5 | 7 |
| `@import` rules found | **5** | **5** |
| **max `@import` depth** | **1** | **1** |
| nested (depth ≥ 2) imports | **0** | **0** |
| **unresolved imports** | **0** | **0** |
| unreadable sheets anywhere in the graph | 0 | 0 |
| total non-import rules across graph | 3,241 | 3,288 |

Flat graph: `cms.css` imports 3, `style.css` imports 2, none of the five imports anything further.

**What the five imports carry** (style rules counted recursively, descending into `@media`):

| | directly enumerable | behind an `@import` | behind-import share |
| --- | ---: | ---: | ---: |
| style rules (`/gs/index.do`) | 310 | **4,748** | **93.9%** |
| `@media` rules | 1 | **493** | **99.8%** |
| `@font-face` rules | 0 | **5** | **100%** |
| `@keyframes` rules | 0 | **6** | **100%** |
| style rules (`/gs/news/…`) | 365 | 4,748 | **92.9%** |

Per-import (identical on both routes):

| depth | imported sheet | rules |
| ---: | --- | ---: |
| 1 | `/_res/_common/_plugin/froala-editor/latest/css/froala_style.min.css` | 81 |
| 1 | `/_res/_common/css/define.min.css` | 153 |
| 1 | `/_res/_common/css/row-col.min.css` | 59 |
| 1 | `/_res/yuhs/_share/css/common.css` | **1,402** |
| 1 | `/_res/yuhs/_share/css/hospital.css` | **1,236** |

11 of the homepage's 12 distinct media conditions exist **only** behind an import, including both of the two that dominate (`(max-width: 1024.98px)` 274 of 275 behind-import; `(min-width: 1025px)` 158 of 158). **This is the cleanest available confirmation of the non-CORS `@import` follow path: 93.9% of the page's CSS, and effectively the entire responsive ladder that §6.1 depends on, exists only because those five imports were followed.**

### 6.9 Text census — opacity agreement and the Korean token boundary

Both changes are exercised on this Korean-language site and both behave honestly:

| Channel | `/gs/index.do @700` | `/gs/index.do @1024` |
| --- | ---: | ---: |
| `missing-text-ratio` (strict, fires) | 52.17% (1,286 / 2,465 chars) | 53.43% (1,340 / 2,508) |
| `missing-text-absent-ratio` (loose) | 52.17% | 53.03% |
| `missing-text-boundary-only-chars` | **0** | **10** over 9 strings |
| **`missing-text-script-relaxed-chars`** | **0** | **0** |
| `missing-text-reverse-ratio` | 0 (0 of 1,167 clone chars) | 0 (0 of 1,156) |

`missing-text-script-relaxed-chars: 0` on every pair — the script-aware boundary rule reports **zero** Korean strings that the clone paints and an English-only boundary rule would have called missing. The strict and loose readings differ by 10 characters of 1,340 (0.75%) at the worst pair. **The BLOCKERs in §2 are not a token-boundary artifact.** `missing-text-reverse-ratio: 0` everywhere confirms the clone paints nothing the source does not.

`offscreen-text-excess-chars` is **negative on both BLOCKER pairs** (−1,493 at 700, −1,415 at 1024): the source has 1,493 / 1,415 characters in boxes past the right edge (the carousel tracks) and the clone has 0, because it hid the carousel entirely. The channel that would normally catch a carousel mismatch is pointing the wrong way here.

---

## 7. What I could NOT measure, and why

1. **Route/IA coverage.** 2 of ~123 same-host URLs. The 123-URL route graph was not traversed — policy. Family coverage of the real IA is unmeasured by this lane.
2. **Asset independence.** No `assets:inventory`, no `assets:materialize` — policy. The clone hot-links 23 `/_res/` URLs and its independence from the origin is therefore **not** measured.
3. **The redirected-stylesheet recovery change.** Not exercised: `sheetsRedirectResponses: 0` on all four observations. No evidence either way.
4. **Which 21 of 27 images the clone drops at `/gs/index.do @1024`.** I measured the ratio (6/27) and established that the 195 banded nodes contain the news-card subtree, but I did not enumerate the individual dropped `img` elements.
5. **Whether the floor regression (9 PASS → 6 PASS) is rubric drift or source drift.** All four non-PASS floor pairs are the carousel page and all are `offscreen-text` + `position-delta`, which is the carousel signature; but one pair of runs cannot separate "the rubric got stricter" from "the carousels landed differently". Stated as a limit.
6. **`/gs/index.do @1100` clone quality.** The floor at that pair is itself a BLOCKER, so the pair is unadjudicable this run.
7. **Nothing timed out and nothing was retried.** No stage was lost to machine contention; every planned measurement was taken. The two `qa:responsive` runs (242 s and 306 s) ran roughly 2.5–3× the previous run's 99 s / 108 s on the same site, which is consistent with seven browser-driving lanes sharing one machine — a resource fact, not a site or engine property.

---

## 8. Engine defects, measured

| # | Severity | Defect | Evidence |
| --- | --- | --- | --- |
| **E1** | **BLOCKER** | The layout probe writes `v = 0` for an Element whose reference was **replaced by the page's own JS during the resize ladder**, making DOM churn indistinguishable from responsive hiding. 195 fabricated `display:none` rules ship, costing 52–53% of the homepage's visible text and 21 of 27 images. | `src/observer/layout-probe.ts:416-422`. `layout-probe-mobile.json` p000001: Δ`v=0` = Δ`disconnected` exactly (+112 at 576, +87 at 768); independent probe shows the source's `display:none` census flat at 108 across 390…914. Control: `/gs/news/…` has `disconnected: 0` and emits 0 bands. |
| **E2** | **MAJOR** | The band-edge snap makes E1 **harder to detect**, not easier: all 195 fabricated edges snapped 100% onto the site's real authored 576/768 breakpoints (`bandEdgeSnapShiftPx: 195` over 195 edges). A fabricated rule that carries the source's own numbers reads as authored. | `reconstruction-manifest.json → layout.bandEdgesSnapped: 195`, `bandEdgesKeptMidpoint*: 0`. |
| **E3** | **MAJOR** | The band truth check **cannot fail a fabricated band**: it re-renders the clone and reads the node's own computed `display`, which the clone's copy of the same rule sets. `rejectedByBandCheck: 0`, `bandSampleMismatches: 0`, `bandIndependentlyDiscriminated: 195`. Ground truth is the probe sample that produced the rule. | `src/reconstruction/layout-truth-check.ts:275-309`; counters above. |
| **E4** | **MAJOR** | The mobile probe's ceiling is a frozen `914` while the tree switch now snaps to an authored breakpoint (1025 here). The mobile tree is displayed over [0, 1025) and probed over [390, 914]; `maxWidth` derives from the largest floor width, so the mobile probe refused the site's two heaviest authored conditions as `out-of-range` (**280** and **159** matched declarations). | `src/observer/types.ts:1837-1839` (docstring at :1831-1834 states the now-false premise); `src/observer/probe-widths.ts:216-217`, `:308`. `layout-probe-mobile.json → widthProvenance.breakpointsRefused`. |
| **E5** | **MAJOR** | The `@font-face` URL harvester iterates only the **top-level** rules of `document.styleSheets` and never follows a `CSSImportRule`, although the rule indexer in the same file does (`importRulesFollowed: 5`). All 5 of this site's `@font-face` rules sit one import down with relative `src` URLs — exactly the sheet-relative case the change was built for — and **0 of 5** were harvested. | `src/observer/collect-dom.ts:1997-2001` (`resolvedSheets` built at `:831` from `document.styleSheets` only) vs the recursive `visit()` at `:1234-1244`. `fontFaceUrlsHarvested: 0` on all four observations; `tmp/wr286/w7-severance/fontface.json` lists all 5 with `src: url("../../_share/fonts/Nanum*.woff")` from `/_res/yuhs/_share/css/common.css`. |
| **E6** | **MINOR** | `hidden-at-truth-width` (4,497 of 5,994) silently absorbs stale-reference nodes: the homepage desktop probe reports `disconnected: 222` at the **first** sample and at every width including the truth width, so 13.3% of that tree contributes nothing and the bucket's name overstates its certainty. | `layout-probe.json` p000001, `disconnected: 222` at all 16 widths; `layout-probe.json` p000002, 28 of 1,335. |
| — | (not a defect) | `no-branch-matched` **did not fall**: 693 of 972, identical to the wave6-core measurement. The counter change made it visible and exact (both partitions sum to 972, `inlineSizeOutcomeDoubleCounts: 0`); it did not reduce it. | `reconstruction-manifest.json → layout.inlineSizeOutcomes`. |
| — | (works) | Tree switch snapped 915 → **1025** by `authored-breakpoint`, removing 4 BLOCKER findings. Floor eviction now prefers authored breakpoints over un-authored floor widths (p2 desktop evicted `700, 768, 1100`, adopted 2, refused 1). Korean-script boundary rule reports 0 false-missing. `@import` follow recovers 93.9% of the page CSS. | §6.1, §6.2, §6.8, §6.9. |

**No host-specific remedy is proposed and none was applied.** E1's shape is generic: any site whose JS rebuilds DOM on resize (carousels, masonry, tab strips) produces it. The engine already records `disconnected` per width; the inference stage does not read it.

---

## 9. Review images

`docs/result/28.6/review/severance/` — 20 PNGs (source + clone for all 10 pairs) plus the 2 BLOCKER composites, 17 MB total. No pair was dropped. See the README in that directory for per-pair verdicts and what to look at.
