# Task 28.6 — Site lane **P1** — hobbang.net

**Host:** `hobbang.net` (Astro static, nginx, zero first-party JS)
**Routes in scope:** `/` and `/링크모음/검색/` (`/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`)
**Status:** COMPLETE — every pipeline stage ran to `ok`, 10/10 graded pairs measured, 0 capture failures.
**Grade:** **BLOCKER 2 / MAJOR 5 / MINOR 3 / PASS 0** over 10 route×width pairs.
**Self-check floor (the number that makes those verdicts meaningful):** **BLOCKER 0 / MAJOR 0 / MINOR 2 / PASS 8.**

> Because the source serves ONE byte-identical DOM to both viewport probes (measured this run:
> `treeDivergence: "single-dom"`, `pagesIdenticalWalk: 10`, `pagesDivergentWalk: 0`, 852 elements walked in
> both probe contexts), every responsive finding below is the engine's doing and not a site property.

---

## 0. Headline — did the two carried BLOCKERs clear?

| Carried item | Previous run | This run | Cleared? |
|---|---|---|---|
| Tree switch = 915 (`observed-endpoint-midpoint`) | 915 | **768**, `method: "authored-breakpoint"`, `snapped`, `authoredWeight 142` on 10/10 pages | **YES** |
| BLOCKER: 1128 px document at 1024 and 1100 | `contentMaxRight` 1128 @1024, @1100 | **`contentMaxRight` 1128 @1024, @1100 — unchanged**, and now also at **768** | **NO** |
| 153 boxes shipping absolute `width ≥ 1000px` with no media condition | 153 style tokens | **147 style tokens**, on **163 nodes** that no layout rule covers (448 further nodes with the same tokens ARE covered) | **NO** |
| 5 tables rendering `border-collapse: separate` against source `collapse` | 5/5 wrong | **5/5 `collapse`**, table heights byte-for-byte equal to the source at 390 | **YES** |
| 92 of 184 `@font-face` URLs 404 | 92 × `hobbang.net/...` → **404** | **184/184 → HTTP 200**; `fontFaceUrlsSheetResolved: 92`, `fontFaceUrlsDocumentResolved: 0` | **YES** |
| Percent-encoded hangul route | intact | **intact through all 13 stages, served by the built app at 9 widths** | n/a (stayed good) |

Three of the four named regressions cleared. The one that did not is the one that carries both BLOCKERs, and
moving the tree switch down from 915 to 768 **widened the band it damages** from `[915, 1128)` to `[768, 1128)`.
Diagnosis to file:line in §3.

---

## 1. What I ran

Engine stability: I hashed all 433 `.ts` files under `src/` and `scripts/` before my first command and after my
last one. **`diff` is empty — the engine did not change while any measurement in this report was taken**, and
this lane wrote nothing under `src/` or `scripts/`. Snapshots: `tmp/wr286/w7-hobbang/engine-snapshot-{start,end}.txt`.
Newest engine mtime at lane start: `src/observer/types.ts` @ 08:02:55 local; my first pipeline command started
08:12:40 local.

| # | Exact command | Wall clock | Output |
|---|---|---|---|
| 0 | Independent ground truth by `curl`: `/`, `/링크모음/검색/`, `/_astro/index.DHadyNxt.css`, the jsDelivr Pretendard sheet, the Google Fonts Hahmlet sheet, plus 184 `HEAD`-equivalent font fetches | ~1 min | `tmp/wr286/w7-hobbang/{home,search}.html`, `{astro,pretendard,hahmlet}.css`, `font-status.txt` |
| 1 | `pnpm e2e:reconstruct https://hobbang.net/ --max-urls 20 --concurrency 2 --family-escalation 4 --prepare-scroll` | 23:12:41.967Z → 23:23:08.025Z (**10 m 26 s**) | run ids below |
| 2 | `pnpm qa:responsive data/hobbang.net/reconstructions/2026-09-02T23-17-29-154Z/reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes '/,/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/'` | 23:24:17.536Z → 23:27:25.922Z (**3 m 08 s**) | `data/hobbang.net/responsive-qa/2026-09-02T23-24-17-536Z/` |
| 3 | Same command + `--self-check --no-diff-images` | 23:35:55.821Z → 23:38:45.132Z (**2 m 49 s**) | `data/hobbang.net/responsive-qa/2026-09-02T23-35-55-821Z/` |
| 4 | Seven read-only Playwright probes of my own (`probe.mjs` … `probe7.mjs`), serving the built clone through the repo's own `startClone()` on an OS-assigned port | ~11 min | `tmp/wr286/w7-hobbang/probe*.json`, `probe*.log` |

I used the **end-to-end** command, not individual stages; no stage had to be dropped to. `--prepare-scroll` is on
because 5 of 6 `<img>` on this site are `loading="lazy"`; it is a generic pipeline flag, and it is the same flag
the previous hobbang run used, so the two runs are comparable.

Step 4 exists because five questions in my brief — does the clone load the webfonts, what does hangul font
substitution cost in advance width, do the tables render as tables, *which element* is 1128 px wide, and *which
boxes* are the extra overlaps — cannot be answered from the graded artifacts. Those probes only **read**: they import `startClone` from `src/` and drive
Playwright. No file under `src/` or `scripts/` was modified.

### Run ids

| Stage | Directory / file |
|---|---|
| e2e manifest | `data/hobbang.net/e2e-runs/2026-09-02T23-12-41-967Z/e2e-manifest.json` |
| discovery / verification / selection | `data/hobbang.net/2026-09-02T23-12-46-745Z/` |
| observation | `data/hobbang.net/site-observations/2026-09-02T23-13-10-260Z/` |
| interaction exploration | `data/hobbang.net/interaction-explorations/2026-09-02T23-16-22-138Z/` |
| interaction model | `data/hobbang.net/interaction-models/2026-09-02T23-17-27-736Z/` |
| SiteSpec | `data/hobbang.net/site-specs/2026-09-02T23-17-28-412Z/` |
| **reconstruction (final, baseline)** | `data/hobbang.net/reconstructions/2026-09-02T23-17-29-154Z/` |
| reconstruction QA | `data/hobbang.net/reconstruction-qa/2026-09-02T23-18-08-397Z/` |
| **responsive QA — graded** | `data/hobbang.net/responsive-qa/2026-09-02T23-24-17-536Z/` |
| **responsive QA — self-check floor** | `data/hobbang.net/responsive-qa/2026-09-02T23-35-55-821Z/` |
| review images | `docs/result/28.6/review/hobbang/` |
| scratch | `tmp/wr286/w7-hobbang/` |

### Pipeline stage results (from the e2e manifest)

| Stage | ms | Result |
|---|---|---|
| discovery | 4 780 | raw 20 / normalized 20 / duplicates 0 / invalid 0 |
| verification | 23 501 | candidates 20, validHtml **19**, httpErrors 0, navigationErrors 0, nonHtml 1 (`sitemap.xml`) |
| selection | 6 | 19 verified → **7 families**, 7 selected, largestFamily 6 |
| observation | 191 536 | planned 10 / observed **10** / failed 0, 3 790 asset occurrences, 10 scroll containers |
| interaction-detection | 273 | 56 candidates → 36 targets |
| interaction-exploration | 65 636 | 16 planned / 16 executed / **16 changed** / 0 no-change |
| interaction-modeling | 42 | 16 patterns, **0 unknowns**, 0 AI calls |
| sitespec | 1 088 | 19 routes, 1 396 style tokens, 197 assets, 16 patterns |
| reconstruction | 35 340 | 19 routes, 6 996 element nodes, **2 033 recovered layout rules**, 0 rejected by truth check |
| build | 3 711 | `next build` exit 0 |
| qa | 300 009 | 20/20 page-viewport pairs, 19/19 routes rendered, behaviorEquivalent **16/16**, `runtimeJsErrors=0`, corrections proposed 2 / **accepted 0** / rejected 7 |
| family-escalation | 2 | 0 candidates |
| final-validation | 32 | `originalScripts=0 originalStylesheets=0 originStackDependencies=0`, 29 files / 4 854 909 B |

Final status `complete-with-known-limitations` (`source-content-drift ×4`, `source-style-drift ×1` — both are
source-side classifications, not clone defects). **No stage crashed, timed out or refused.**

---

## 2. Verdict table

`pnpm qa:responsive`, rubric v3, 2 routes × 5 widths. "Headline channel" = the worst finding the harness printed.

| Route | Width | Verdict | B/M/m | Headline channel | Deciding number |
|---|---|---|---|---|---|
| `/` | 390 | **MAJOR** | 0/1/1 | `overlap-excess-ratio` | clone overlaps 2.18 pp more of the viewport than the source (42 overlapping leaf pairs vs 20); threshold 2.00 % |
| `/` | 700 | **MAJOR** | 0/3/3 | `column-container-mode-delta` | a matched container is 3 rows of 7 where the source uses 2 rows of 13 (delta 6, threshold 2) |
| `/` | 1024 | **BLOCKER** | 1/5/1 | `footer-clipped` | clone footer max-right **1053 > 1024**; the source's is 1024/1024 |
| `/` | 1100 | **MAJOR** | 0/2/4 | `horizontal-overflow-excess-px` | clone scrolls **28 px** further horizontally than the source (threshold 16 px) |
| `/` | 1440 | **MINOR** | 0/0/2 | `overlap-excess-ratio` | +1.89 pp over source (threshold 0.10 %) |
| `/링크모음/검색/` | 390 | **MINOR** | 0/0/2 | `pixel-residual-difference-ratio` | 8.93 % of compared pixels differ; 86 % of it on source edges |
| `/링크모음/검색/` | 700 | **MAJOR** | 0/3/3 | `column-container-mode-delta` | 3 rows of 5 vs source 2 rows of 9 (delta 4, threshold 2) |
| `/링크모음/검색/` | 1024 | **BLOCKER** | 1/2/4 | `footer-clipped` | clone footer max-right **1053 > 1024** |
| `/링크모음/검색/` | 1100 | **MAJOR** | 0/1/3 | `horizontal-overflow-excess-px` | **28 px** (threshold 16 px) |
| `/링크모음/검색/` | 1440 | **MINOR** | 0/0/3 | `overlap-excess-ratio` | +0.16 pp over source (threshold 0.10 %) |

**10 measured, 0 failed. BLOCKER 2, MAJOR 5, MINOR 3, PASS 0.**

`missingText` and `missingTextReverse` are **0.00 % on all ten pairs, both directions**, and
`visibleTextChars` is **identical on both sides of every pair** (8 025/8 025 and 8 053/8 053 on `/`;
2 392/2 392 and 2 420/2 420 on the search route). Nothing is lost. Everything is mis-laid-out.

### Pixel residual, area- and ink-normalised

| Route | Width | area-ratio | ink-ratio | edge-fraction |
|---|---|---|---|---|
| `/` | 390 | 18.39 % | 33.96 % | 47.1 % |
| `/` | 700 | 62.35 % | 121.38 % | 16.2 % |
| `/` | 1024 | 26.99 % | 52.41 % | 25.9 % |
| `/` | 1100 | 26.90 % | 52.19 % | 24.7 % |
| `/` | 1440 | 5.34 % | 10.83 % | 64.9 % |
| `/링크모음/검색/` | 390 | 8.93 % | 17.70 % | 85.6 % |
| `/링크모음/검색/` | 700 | 58.09 % | 100.93 % | 16.7 % |
| `/링크모음/검색/` | 1024 | 7.79 % | 16.97 % | 70.4 % |
| `/링크모음/검색/` | 1100 | 7.41 % | 16.38 % | 70.9 % |
| `/링크모음/검색/` | 1440 | 5.13 % | 13.62 % | 77.1 % |

Read against the self-check residuals in §6: **0.00 % on 5 of 10 pairs and never above 0.88 %**.

### The one table that explains most of the grade — document geometry I measured myself

Independent Playwright probe (`tmp/wr286/w7-hobbang/probe.json`), both sides, same code, `document.fonts.ready`
awaited, at nine widths including the tree switch itself:

| Route | Width | Source `scrollW × scrollH` | Clone `scrollW × scrollH` |
|---|---|---|---|
| `/` | 390 | 390 × 17 230 | 390 × 17 230 |
| `/` | 639 | 639 × **15 950** | 639 × **17 230** |
| `/` | 640 | 640 × **14 934** | 640 × **17 230** |
| `/` | 700 | 700 × 14 748 | 700 × **17 230** |
| `/` | 767 | 767 × 14 913 | 767 × **17 230** |
| `/` | **768** | 768 × 12 849 | **1128** × 10 863 |
| `/` | 1024 | 1024 × 10 922 | **1128** × 10 863 |
| `/` | 1100 | 1100 × 10 926 | **1128** × 10 863 |
| `/` | 1440 | 1440 × 10 860 | 1440 × 10 863 |
| `/링크모음/검색/` | 390 | 390 × 5 817 | 390 × 5 817 |
| `/링크모음/검색/` | 639 | 639 × **4 413** | 639 × **5 817** |
| `/링크모음/검색/` | 640 | 640 × **3 769** | 640 × **5 817** |
| `/링크모음/검색/` | 700 | 700 × 3 726 | 700 × **5 817** |
| `/링크모음/검색/` | 767 | 767 × 3 658 | 767 × **5 817** |
| `/링크모음/검색/` | **768** | 768 × 3 616 | **1128** × 3 317 |
| `/링크모음/검색/` | 1024 | 1024 × 3 317 | **1128** × 3 317 |
| `/링크모음/검색/` | 1100 | 1100 × 3 317 | **1128** × 3 317 |
| `/링크모음/검색/` | 1440 | 1440 × 3 317 | 1440 × 3 317 |

**The clone still has exactly two layouts, and only the switch point moved.** Below 768 it is the 390 px
observation to the pixel; at and above 768 it is the 1440 px observation, in a document that is 1128 px wide no
matter how narrow the viewport is. The document height is **invariant inside each band** — 17 230 / 5 817 below,
10 863 / 3 317 above — despite 2 033 recovered layout rules.

Caveat, measured, that keeps this honest: recovered rules are **not** inert. `contentMaxRight` in the clone tracks
the source exactly on the mobile side (573 @390 → 684 @700, identical on both sides), so containers *do* stretch.
What does not move is the **height**: the exact tier carries **1 518 `height: Npx`** and **1 158 `min-height: Npx`**
declarations, so reflowed text inside a pinned box overflows or leaves whitespace instead of changing the page.

---

## 3. Every BLOCKER and MAJOR, diagnosed

### B1 — `footer-clipped` @1024 on both routes; `horizontal-overflow-excess-px` 104 px @1024 and 28 px @1100 — TWO distinct engine causes

The clone's document is 1128 px wide at every viewport in `[768, 1128)`. I found the offending boxes with
`probe2.mjs` (all elements whose right edge exceeds the viewport, clone side, at 768/1024/1100):

| Route | Overflowing boxes @1024 | Widest right edge | The box that sets it |
|---|---|---|---|
| `/` | 107 | 1128 px | `article` `n000494`, `display:block`, `width: 264px` — a **grid item** |
| `/링크모음/검색/` | 31 | 1128 px | `li` `n000505`, **`display: list-item`**, `width: 1104px` |

**Cause 1 — grid tracks frozen because the recovery must hold at every width in the band (`/`).**

The ancestor chain of `n000494` on `p000001/desktop` is recovered *correctly* down to the grid container:

```
n000264 main     exact width 1440px  → layout rule: width: auto
n000417 section  exact width 1440px  → layout rule: width: auto
n000419 div      exact width 1152px  → layout rule: margin-left/right: auto; max-width: 1152px; width: auto
n000430 div      exact width 1104px, display:grid,
                 exact grid-template-columns: 264px 264px 264px 264px
                                  → layout rule: width: auto      ← NO grid-template-columns rule
n000494 article  exact width  264px  → NO rule (grid item, guard-refused)
```

The container is made fluid; its **tracks are not**. 4 × 264 + 3 × 16 gap = **1104**, plus the 24 px page
padding = **1128**. At a 1024 px viewport the container is 976 px wide and the frozen tracks overflow it by
exactly **1128 − 1024 = 104 px** — the number the `horizontal-overflow-excess-px` channel reports.

Why the tracks were not recovered: I measured the **source's** tracks on that container across the desktop
band (`probe4.mjs`): `352px 352px` @768, `232px×4` @1024, `251px×4` @1100, `264px×4` @1440 and @1920. The track
**count changes inside the band**, so the single unbanded rule the recovery is allowed to emit cannot hold at
every width and the container is refused. Artifact field:
`layout.gridTrackRefusalsByReason["tracks-not-reproducible-at-every-width"] = 18` (previous run: 6, over 11
pages and a desktop-only pass — **the counter is not split by viewport, so the two numbers are not directly
comparable**).

And the items themselves: `layout.guardRefusalsByReason = { "grid-item": 222 }`, i.e. every one of the 222 grid
items keeps its frozen px width because the containing-block guard cannot reason about a grid track as a
containing block.

**Cause 2 — `display: list-item` is not "blockish", so the box never reaches the inline-size stage (`/링크모음/검색/`).**

```
n000496 div  → margin auto; max-width: 1152px; width: auto     (fluid)
n000504 ul   → width: auto;  grid-template-columns: minmax(0, 1fr)   (fluid, tracks recovered)
n000505 li   → NO rule.  Ships exact  width: 1104px,  display: list-item
```

The `li` is dropped before the inline-size stage by
**`src/reconstruction/layout-inference.ts:2034-2036`**, whose gate is
**`src/reconstruction/layout-inference.ts:552`**:

```ts
const BLOCKISH_DISPLAY = new Set(["block", "flex", "grid", "flow-root", "table"]);
```

`list-item`, `table-row`, `table-row-group` and `table-header-group` are all outside that set. Counted this run:
`layout.inlineSizePreStageDrops["display-not-blockish"] = 2750`.

**The generic scale of the survivor population, measured across all 10 pages × 2 viewports:** 147 style tokens
carry an unconditional `width ≥ 1000px`; they are worn by **611 nodes**, of which **448 are overridden by a
recovered layout rule and 163 are not**:

| Uncovered by `display` | count | frozen width |
|---|---|---|
| `table-row` (`tr`) | 88 | 1102 px |
| `list-item` (`li`) | 49 | 1104 / 1062 px |
| `table-header-group` (`thead`) | 11 | 1102 px |
| `table-row-group` (`tbody`) | 11 | 1102 px |
| `block` (`div`, `aside`) | 4 | 1062 px |
| **total** | **163** | — |

All 163 are on the **desktop** variant; none on mobile. Every one of the 159 non-`block` cases is a
`display-not-blockish` drop.

**Evidence file:** `data/hobbang.net/reconstructions/2026-09-02T23-17-29-154Z/app/public/wr/generated-styles.css`
— 308 declarations of `width`/`max-width` ≥ 1000 px, **0 of them inside any `@media` block**.

**Visually confirmed.** The graded run's own full-page PNGs make this legible without any metric: at 1024 the
clone's screenshot is **1128 px wide** and the source's is 1024. In the footer the source lays 18 nav links out
as two tidy rows inside the dark band; the clone crushes them into one row whose labels break mid-word
(`주소모`/`음`, `검색`/`현황`) and **runs off the right end of the dark background onto white**, which is exactly
what `footer-clipped` (max-right 1053 > 1024) and `column-container-mode-delta` (clone 2 rows of 12 vs source 2
rows of 10) are reporting. See `docs/result/28.6/review/hobbang/03_root_1024_{source,clone}.png`.

### B2 (cleared as stated, but re-scoped) — the tree switch

The switch is now correct and fully provenanced. `reconstruction-manifest.json → config.inferredBreakpoint`:

```json
{ "value": 768, "provenance": "inferred", "method": "authored-breakpoint",
  "mobileObservedWidth": 390, "desktopObservedWidth": 1440,
  "candidateCount": 3, "ambiguous": true, "candidatesOutsideObservedInterval": 0,
  "candidates": [ {"px":768,"authoredWeight":142,"authoredPages":10,"observedChange":2348,"observedChangePages":10,"observedChangeUnattributablePages":0},
                  {"px":1024,"authoredWeight":39,"authoredPages":10,"observedChange":400,"observedChangePages":10},
                  {"px":640,"authoredWeight":22,"authoredPages":10,"observedChange":311,"observedChangePages":10} ],
  "chosen": {"px":768,"authoredWeight":142,...},
  "pagesRead": 10, "pagesWithHistogram": 10, "pagesWithUsableProbe": 10,
  "treeDivergence": "single-dom", "pagesIdenticalWalk": 10, "pagesDivergentWalk": 0,
  "domSwitchWidthObserved": false }
```

`app/app/globals.css` emits `@media (max-width: 767.98px)` / `@media (min-width: 768px)` with the comment
"Breakpoint 768px, inferred — authored-breakpoint". 768 is the heaviest authored breakpoint by a factor of 3.6
over 1024, corroborated by the probe on all 10 pages, and it matches my own `curl` of the two readable sheets.
**This change did what it was built to do.**

**But it is not a net win on this site, and that is the measurement that matters.** Because the desktop tree
cannot fit below ~1128 px (B1), moving the switch from 915 to 768 hands the broken tree **147 px more of the
width axis**: the clone now ships a 1128 px document at 768 px, a 360 px overflow, where before 768–914 got the
(also-wrong, but not overflowing) mobile tree. 768 was not graded in the standard sweep, so this does not appear
in the verdict table; my own probe found it.

### M1 — `column-container-mode-delta` / `column-mode-delta` / `position-delta-p90-px` MAJOR @700 on both routes

Clone `scrollHeight` @700 is **identical to its own value @390** on both routes (17 230 and 5 817) while the
source reflows to 14 748 and 3 726. `position-delta-p90-px` is 310 px on `/` and 342 px on the search route.

The mobile tree now *has* rules — 932 of them, where the previous run had **zero** — but it still does not
reflow, for the same structural reason as B1 in the other direction: the mobile band is `[0, 768)` and it
contains the source's authored **640 px** breakpoint. The recovered rules carry no band, so any box whose source
layout changes at 640 is refused and keeps its 390-observed geometry. Measured on the source: the search route's
`ul` goes 1 column → the grid changes at 640, and the clone's height is flat across 390/639/640/700/767.

Only the `responsiveHidden` rule kind carries a band (170 of them, all `@media (max-width: 1023.98px)`, all
targeting `[data-wr-viewport="desktop"]`), so **no banded rule exists anywhere on the mobile side**.

### M2 — `overlap-excess-ratio` MAJOR @390 on `/` (2.18 pp)

**Not the tables any more.** Measured at 390 with `probe.mjs`, all five visible tables:

| Table | Source h | Clone h | Δ | Wrapper h | Clone overflows wrapper by |
|---|---|---|---|---|---|
| 1 (12 rows, 60 cells) | 839 | **839** | 0 | 841 | −2 px (fits) |
| 2 (5 rows, 25 cells) | 324 | **324** | 0 | 326 | −2 px |
| 3 (5 rows, 15 cells) | 284 | **284** | 0 | 286 | −2 px |
| 4 (6 rows, 24 cells) | 425 | **425** | 0 | 427 | −2 px |
| 5 (8 rows, 40 cells) | 547 | **547** | 0 | 549 | −2 px |

Previously +26.5 / +12.5 / +52 / +14.5 / +58.5 with 11–57 px of wrapper overflow. **Fully cleared.**

**What the remaining 2.18 pp actually is — measured, not inferred.** I re-ran the overlap detection myself on
both sides at 390 (`probe6.mjs`: visible leaf boxes, pairwise intersection > 1 px in both axes) and diffed the
pair sets: **clone 41 overlapping pairs, source 23, and 21 of the clone's are not in the source's.** Every one of
the top clone-only pairs is a **category-card title overprinting its own description**, at y = 2 574–3 902 px:

```
y=2574 area=831  t:검색·포털      X  t:웹검색과 종합 포털을 한곳에서 확인할 수 있습니다.
y=2722 area=1039 t:뉴스·미디어    X  t:주요 뉴스 및 언론 사이트를 분야별로 확인할 수 있습니다.
y=3164 area=831  t:쇼핑·직구      X  t:온라인 쇼핑몰과 해외직구 사이트 주소입니다.
… 21 pairs in all
```

The mechanism, measured on both sides at 390 (`probe7.mjs`):

| | Source | Clone |
|---|---|---|
| `h3` computed box (`검색·포털`, y ≈ 2 542) | `65.6094px × 24px` | `65.6094px × 24px` |
| text box inside it | 65.61 × **24** px — one line | 63.94 × **43** px — **two lines** |
| `line-height` | 24 px | 24 px |

The source's heading is shrink-to-fit at exactly the advance width its Hahmlet text needs. The clone has no
Hahmlet, its fallback needs ~22 % more advance, the text wraps to a second line — and the `h3` still computes to
`height: 24px` with 43 px of content inside it, which is only possible because the exact tier sets an **explicit**
height (a `height: auto` block would have grown to 43 px). So the 19 px of extra line paints **outside the box,
over the description**. This is `font substitution × frozen height`, and it is visible at a glance in
`docs/result/28.6/review/hobbang/01_root_0390_{source,clone}.png`.

The FAQ accordion is **not** the cause: I measured the three FAQ question/answer boxes the graded artifact lists
in `worstOverlaps` and they sit at **identical coordinates on both sides** (9578–9685 / 9579–9635 / 9636–9692),
and the stored top-8 overlap list is identical between clone and source at this width.

### M3 — `overlap-excess-ratio` MAJOR @1024 on `/` (9.67 pp), MINOR @1440

Same root cause as B1: the desktop tree carries the 1440 layout, so at 1024 the frozen grid overlaps its
neighbours. At 1440, one residual: table 1 is **558 px** in the clone against **502 px** in the source (+56 px)
and overflows its 504 px wrapper by 54 px. The other four tables match to 0.0 px. That +56 px is the **font
substitution** (§4.8), not the table machinery — cells wrap to more lines with the fallback face.

---

## 4. Engine-change measurements

### 4.1 Stylesheet coverage: blocked / recovered / missed — **PASS, byte-exact against my own `curl`**

Independent ground truth I fetched before the run:

| Sheet | CSSOM readable? | Why | Bytes | `@media` | `@font-face` |
|---|---|---|---|---|---|
| `/_astro/index.DHadyNxt.css` | yes | same origin | 22 058 | 7 | 0 |
| inline `<style>` | yes | inline | 1 762 | 2 | 0 |
| jsDelivr Pretendard sheet | yes | `<link crossorigin="">` | 53 513 | 0 | 92 |
| `fonts.googleapis.com/css2?family=Hahmlet…` | **BLOCKED** | `<link>` has no `crossorigin`, so `cssRules` throws | 168 411 | 0 | 276 |

What the engine recorded, per viewport (identical desktop/mobile), and summed over 20 passes (10 pages × 2):

| Field | Per pass | × 20 | Verdict |
|---|---|---|---|
| `stylesheetsTotal` | 4 | 80 | matches |
| `cssomReadable` | 3 | 60 | matches |
| `cssomBlocked` | 1 | 20 | matches |
| `sheetsOffered` | 1 | 20 | the blocked sheet was offered to the bridge |
| **`fallbackRecovered`** | **1** | **20** | **recovered on every pass** |
| **`fallbackMissed`** | **0** | **0** | nothing lost |
| `bytesBridged` | **168 411** | 3 368 220 | **byte-exact against my `curl`** |
| `bytesCaptured` | 243 982 | 4 879 640 | = 22 058 + 53 513 + 168 411, exactly |
| `sheetsBodyUnavailable` / `sheetsSkippedBySizeCap` / `importsUnresolved` | 0 | 0 | — |
| `sheetsMediaUnreadable` | 0 | 0 | — |
| `mediaConditionsDistributed` / `mediaConditionsNegated` | **0 / 0** | 0 / 0 | **no condition invented for the recovered sheet** |
| `authoredMediaConditionsDropped` | 0 | 0 | nothing silently discarded |
| `rulesIndexed` | 133 | 2 660 | `ruleIndexCapHit: false` |
| `elementsWithAuthoredRules` | 852 | 6 996 | every walked element |

**Redirected-stylesheet recovery (28.6 W6 O1) — exercised, and it reported honestly that it had nothing to do:**
`sheetsRedirectResponses 0`, `sheetsRedirectAliasesKeyed 0`, `sheetsRedirectChainsTruncated 0` on all 20 passes.
This site serves no 3xx stylesheet, so **the change is untested here**; the counters exist and are zero, which is
the correct reading of "no redirect happened", not evidence that the fix works.

### 4.2 Authored declarations and probe-width derivation — **PASS, matches my `curl` field for field**

`site-observations/…/pages/p000001/layout-probe.json → widthProvenance`:

| | Desktop probe | Mobile probe |
|---|---|---|
| Floor widths | 390, 700, 768, 1024, 1100, 1440, 1920 | 390, 480, 700, 768, 914 |
| `conditionsWeight` (all `@media`) | **9** | 9 |
| `conditionsRead` (width-relevant) | **5** | 5 |
| `conditionsWidthIrrelevant` | 4 | 4 |
| `conditionsUnparsed` / `conditionsUnsupported` / `conditionsDroppedByCollector` | 0 / 0 / 0 | 0 / 0 / 0 |
| `queriesNonScreenSkipped` / `queriesEmptyInterval` | 0 / 0 | 0 / 0 |
| `rootFontSizePx` | 16 | 16 |
| `breakpointsFolded` | **3** (640, 768, 1024) | 3 |
| `breakpointsAdopted` | **3** | 2 |
| `breakpointsOutOfRange` | 0 | **1** — `{px: 1024, kind: "min", count: 2, reason: "out-of-range"}` |
| `breakpointsDroppedByCap` / `capHit` / `degradedToFloor` | 0 / false / false | 0 / false / false |
| `widthsAdded` | 4 | 3 |
| **Widths sampled** | **390, 639, 640, 700, 767, 768, 1023, 1024, 1100, 1440, 1920** | **390, 480, 639, 640, 700, 767, 768, 914** |

My independent count from the two readable sheets: 9 `@media` rules, of which 5 are width-conditioned
(`40rem`, `48rem` ×2, `64rem` ×2) and 4 are not (`hover:hover` ×3, `prefers-reduced-motion` ×1); at 16 px root
that is 640 / 768 / 1024. **The engine's numbers are mine, exactly.** Each authored breakpoint is bracketed on
both sides (639/640, 767/768, 1023/1024), and the one refusal the mobile envelope forces is recorded with a
reason instead of dropped.

**Authored declarations reaching the generator:** `layout.authoredBreakpointPages = {"spec-field": 20}` (all 20
passes read the histogram from the SiteSpec field), `authoredBreakpointEntries 60` (3 breakpoints × 20 passes),
**`authoredBreakpointDeclarations 86 066`**, `authoredBreakpointUnparsedDeclarations 0`,
`authoredBreakpointTruncatedNodes 0`.

### 4.3 Tree switch — method and provenance: **PASS**

See §3/B2 for the full artifact block. Summary: **768 px**, `method: "authored-breakpoint"`, `snapped`,
chosen over 1024 and 640 by authored weight (142 vs 39 vs 22) with probe corroboration on 10/10 pages,
`candidatesOutsideObservedInterval: 0`, `ambiguous: true` (3 candidates, honestly flagged),
`domSwitchWidthObserved: false` on every path. Emitted at `app/app/globals.css` as
`max-width: 767.98px` / `min-width: 768px`, with the provenance in the comment.

### 4.4 Band edges snapped versus midpoint-kept — **PASS, 100 % snapped**

| Counter | Value |
|---|---|
| `bandEdgesConsidered` | 170 |
| **`bandEdgesSnapped`** | **170 (100 %)** |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | **0** |
| `bandEdgesKeptMidpointEmptyHistogram` | **0** |
| `bandEdgesKeptMidpointNoHistogram` | **0** |
| `bandEdgeSnapShiftPx` | **170** — exactly 1 px per edge |
| `bandEdgesOpen` | 170 |
| `bandCheckable` / `rejectedByBandCheck` | 170 / **0** |
| `bandWidthsRendered` | 10 |
| `bandIndependentlyDiscriminated` | **170 / 170** |
| `bandHiddenByAncestorAtBandWidth` | 160 |
| `bandExactTierHidesAtBandWidth` / `bandTruthBaselineNotInLayout` / `bandSampleMismatches` | 0 / 0 / 0 |

Every emitted band in the stylesheet is `@media (max-width: 1023.98px)` — 170 of them, one condition, the
authored `lg` breakpoint. **Scope caveat, unchanged from the previous run and now the dominant limitation:**
only `responsiveHidden` carries a band. The `centered` (82), `fullWidth` (1 707) and `grid-track-columns` (74)
rules are emitted **unconditionally**, which is precisely why the two BLOCKERs survive (§3).

### 4.5 Desktop / mobile recovered-rule split — **the change landed; 932 rules where there were 0**

| | Desktop | Mobile |
|---|---|---|
| `viewportPasses` | 10 | 10 |
| `viewportPassesUsed` | **10** | **10** |
| `viewportPassRefusals` | — | **{} (none)** |
| `rulesByViewport` (candidates) | 1 101 | **932** |
| `shippedRulesByViewport` | 1 101 | **932** |

Classified straight out of the emitted stylesheet (`generated-styles.css`, "Recovered layout rules" section,
210 046 B):

| Property | Desktop selectors | Mobile selectors |
|---|---|---|
| `width: auto` | 881 | **894** |
| `width: 100%` | 12 | **2** |
| `max-width` + `margin-left/right: auto` | 82 | 0 |
| `display` (responsive-hide) | 170 | 0 |
| `grid-template-columns` | 38 | **36** |
| **total** | **1 101** | **932** |

Previous run: **266 mobile selectors, all of them interaction reveal-state, and zero recovered layout rules.**
This run the mobile subtree receives real inline-size and grid recovery from the mobile probe. The
element-identity question the change exists for is still **not** exercised here — this site serves one DOM to
both viewports (`pagesIdenticalWalk 10 / pagesDivergentWalk 0`), so all I proved is that the artifact is now
produced *and consumed*.

The remaining mobile-side gap is that **none of the 932 rules carries a band**, and the mobile band `[0, 768)`
contains the source's authored 640 px breakpoint — which is M1.

### 4.6 Inline-size outcome partition, including `no-branch-matched` — **the funnel is now visible and it balances**

| | |
|---|---|
| `nodesWithProbe` | **6 956** |
| `inlineSizePreStageDrops["display-not-blockish"]` | 2 750 |
| `inlineSizePreStageDrops["hidden-at-truth-width"]` | 1 602 |
| pre-stage drops total | 4 352 |
| `inlineSizeCandidates` | **2 604** |
| ⟹ 4 352 + 2 604 | **= 6 956 ✓ exact** |

| Outcome | Count |
|---|---|
| `emitted-full-width` | 1 707 |
| `emitted-centered-max-width` | 82 |
| `refused-containing-block-guard` | 222 (`guardRefusalsByReason: {grid-item: 222}`) |
| **`no-branch-matched`** | **593** |
| sum | **2 604 ✓ exact**, `inlineSizeOutcomeDoubleCounts: 0` |

`widthModeRefusals 0`, `widthModeRefusalsByReason {}`, `widthValueRefusals 0`, `widthValueRefusalsByReason {}`,
`widthModeStretch 1 775`, `widthModeFillPercentage 14`.

**This is the biggest reporting win of the run.** The previous artifact said "0 refusals" and was
indistinguishable from a run that found nothing to examine; it now names **593 boxes that ship a frozen width**
and **2 750 that never reached the stage because their `display` is not blockish**. Those two numbers are the
BLOCKERs, stated in the artifact for the first time.

**The one thing the partition still cannot say:** `no-branch-matched` is a single terminal bucket with **no
by-reason breakdown** (`InlineSizeOutcome` at `src/reconstruction/layout-inference.ts:274-301`; the bucket is set
at line 2521). For 593 boxes the artifact says "no predicate held" and cannot say which predicate came closest.
Neither can `display-not-blockish` say *which* display value it rejected — I had to reconstruct that (49 `li`,
88 `tr`, 11 `thead`, 11 `tbody`) by joining the emitted CSS to the page JSON myself.

### 4.7 Parent content box measured per width — **I COULD NOT MEASURE THIS**

`src/reconstruction/layout-inference.ts:481-493` declares `contentBoxMeasured`, `contentBoxAssumedConstant`,
`contentBoxMeasuredDisagreed` and `contentBoxMaxDisagreementPx`, and lines 2094-2110 increment them.
`grep -rn "contentBoxMeasured" src/` returns hits **only inside `layout-inference.ts`**. There is no such field
in `src/reconstruction/types.ts`, and the four counters do not appear in
`reconstruction-manifest.json → layout`. **The measurement is taken and then discarded**, so this lane cannot
report how often the per-width sibling measurement was available, how often it fell back to the constant-padding
assumption, or how far the two disagreed. That is a reporting hole in one of the six changes this task is
supposed to be evaluating.

### 4.8 Truth-check accounting, with every drop explained — **PASS, no exemptions**

| Counter | Value |
|---|---|
| `truthCheckStatus` | **`verified`** |
| `candidateRules` → `acceptedRules` | 2 033 → **2 033** |
| `rejectedByTruthCheck` | **0** |
| `rejectedUnverifiable` | **0** |
| `acceptedUnchecked` | **0** |
| `acceptedRegressed` | **0** |
| `truthCheckable` | 1 863 |
| `bandCheckable` | 170 |
| **1 863 + 170** | **= 2 033 ✓ every candidate was either truth-checked or band-checked; none was exempt** |
| `truthCheckRounds` / `truthCheckPagesRendered` | 20 / 20 |
| `truthCheckConverged` | **true** |
| `rejectedByGuard` | 222, **all** `grid-item` |
| `gridTrackColumns` recovered | 74 (38 desktop + 36 mobile) |
| `gridTrackRefusals` | 84 — `no-computed-tracks` 30, `container-width-constant` 22, **`tracks-not-reproducible-at-every-width` 18**, `tracks-not-px` 10, `child-count-not-multiple-of-tracks` 4 |

Recovered rule kinds: `fullWidth` 1 707, `responsiveHidden` 170, `centered` 82, `gridTrack` 74, `percentage` 0.

Everything that shipped was re-rendered and verified. **That is exactly why the surviving defects are so cleanly
attributable: nothing wrong got through the checker, so what is wrong was never made a candidate** — 2 750
`display-not-blockish` drops, 593 `no-branch-matched`, 222 `grid-item` guard refusals, 18 grid-track refusals.

### 4.9 Percent-encoded hangul route — **SURVIVES EVERY STAGE**

| Stage | Value |
|---|---|
| Site's own HTML | `href="/링크모음/검색/"` (raw UTF-8) |
| Discovery | `url: …/링크모음/검색` → `normalizedUrl: …/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89` |
| Verification | `httpStatus 200`, `redirected: true`, `redirectCount 1` (301 to the trailing-slash form), `finalUrl` percent-encoded, `title "검색사이트 주소모음 …"`, `canonicalSameSite: true` |
| Selection | family `f000002` representative |
| Observation | `p000002`, both viewports, `status: success`, no error |
| SiteSpec | `r000002`, `pathname: "/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/"`, `coverage: exact-observed` |
| Route map | `key: "/링크모음/검색"` (decoded, slash stripped), `path` percent-encoded, `pageFile: pages/p000002.json` |
| Generated file path | catch-all `app/app/[[...slug]]/page.tsx` — no per-route filename encoding is ever attempted |
| Built app | **serves it** — I loaded it at 390/639/640/700/767/768/1024/1100/1440 and got the real page every time (5 817 px tall @390, matching the source to the pixel) |
| Graded | 5 pairs, 0 capture failures, `visibleTextChars` identical to the source at every width |

**No stage mangled it.** The latent hazard the previous run named is still latent: `routeKeyFromSlug`
(`app/src/runtime/route-key.ts`) percent-decodes an already-decoded slug. Hangul is unaffected because decoded
hangul contains no `%`. **I did not measure this** — no route on this site contains a literal `%25`.

### 4.10 Hangul glyph metrics through a unicode-range dynamic-subset variable font

**The clone loads zero webfonts.** Measured in a browser, both sides, `document.fonts.ready` awaited:

| | Loaded `FontFace` entries |
|---|---|
| Source `/` and `/링크모음/검색/` | Hahmlet **20**, Pretendard Variable **16** |
| **Clone, both routes, all widths** | **{} — none** |

That is the declared `font-source-binding-unverified` / `source-head-not-reconstructed` limitation
(`final-validation: originalStylesheets = 0`), not a new defect. Its **cost on hangul**, measured
(`probe.mjs`, matched text runs by exact string, single-line runs only, at 1440):

| Route | Matched runs | Line-count changed | Family | n | median Δ advance | min | max |
|---|---|---|---|---|---|---|---|
| `/` | 204 | **22** | Hahmlet (display serif) | 30 | **+10.12 %** | +0.33 % | +21.83 % |
| | | | Pretendard Variable (body) | 132 | **+0.35 %** | −15.84 % | +1.35 % |
| `/링크모음/검색/` | 67 | **9** | Hahmlet | 19 | **+15.04 %** | +7.41 % | +21.81 % |
| | | | Pretendard Variable | 39 | **+0.08 %** | −5.50 % | +1.01 % |

Worst individual cases, all Hahmlet section headings: `쇼핑·직구` 73.81 → 89.92 px (+21.83 %),
`웹툰·만화` 65.61 → 79.92 px (+21.81 %), `스포츠·중계` 80.48 → 95.91 px (+19.17 %).

**Interpretation.** Pretendard Variable is close to metric-compatible with the macOS system Korean face, so body
copy survives substitution almost unchanged — which is why the clone's desktop document height tracks the source
so closely at 1440 (10 863 vs 10 860). The display serif does not survive: every section heading is 10–22 %
wider. And exactly as the brief predicted, **none of this appears as a missing-text finding** —
`missingText` is 0.00 % on all ten pairs and `visibleTextChars` is identical on both sides of every pair. It
appears only in the pixel residual, in 31 of 271 changed line counts, and in the +56 px table 1 at 1440.

One caveat that limits every geometry claim about this clone: `generated-styles.css` carries **1 518 explicit
`height: Npx`** and **1 520 `width: Npx`** declarations in its exact tier. The geometry channels are structurally
partly blind to font substitution on a clone that pins its boxes.

### 4.11 `@font-face` URLs resolved against their own sheet — **PASS, 184/184 return 200**

The Pretendard sheet is served from `cdn.jsdelivr.net` and its `src` is **relative**:
`url(../../../packages/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.0.woff2)`.

| | URL | HTTP |
|---|---|---|
| Correct (sheet-relative) | `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/…/subset.0.woff2` | **200**, 34 568 B, `font/woff2` |
| What the engine recorded **before** | `https://hobbang.net/packages/…/subset.0.woff2` | **404**, 146 B, `text/html` |

New counters, per pass: **`fontFaceUrlsHarvested 368`, `fontFaceUrlsAbsolute 276`,
`fontFaceUrlsSheetResolved 92`, `fontFaceUrlsDocumentResolved 0`** (×20 passes: 7 360 / 5 520 / 1 840 / 0).
The fix is `sheetHref` carried on `RawFontUrl` (`src/observer/collect-dom.ts:226-246`, set at 2022) and consumed
at `src/observer/collect-assets.ts:245` as `resolve(font.url, font.sheetHref ?? baseUri)`.

**Verified end to end, not just in the counter.** I extracted all 184 `woff2` URLs from
`site-observations/…/p000001/viewports/desktop/assets.json` and fetched every one:

```
184 200
 92 200 cdn.jsdelivr.net
 92 200 fonts.gstatic.com
```

`site-specs/…/asset-catalog.json` carries the same 184 (`kindCounts.font: 184`, hosts jsDelivr 92 /
gstatic 92, **zero `hobbang.net`**). **The 92 dead URLs are gone.**

### 4.12 Text census agrees with the box census about opacity; script-aware token boundary

| Field | Source | Clone | On every one of the 10 pairs |
|---|---|---|---|
| `visibleTextChars` | 8 025 / 8 053 / 2 392 / 2 420 | **identical** | ✓ |
| `zeroOpacityNodes` | 1 | 2 | the clone mounts two trees, so one extra |
| `opacityHiddenNodes` | 0 | 0 | ✓ |
| `opacityHiddenByAncestorNodes` | 0 | 0 | ✓ |
| `opacityHiddenTextNodes` / `opacityHiddenTextChars` | 0 / 0 | 0 / 0 | ✓ |
| `shadowRootsTraversed` / `shadowTextChars` | 0 / 0 | 1 / 0 | ✓ |
| `missingText.scriptRelaxedChars` / `scriptRelaxedStringCount` | — | **0 / 0** | on all 10 pairs |

Both changes are **exercised and report zero divergence on this site**. The opacity agreement has nothing to
disagree about (one zero-opacity node, carrying no text). The script-aware boundary rule
(`src/responsive-qa/correspondence.ts:442`, Han/Hangul/Kana/Thai/Lao/Khmer/Myanmar) relaxed **0 characters over
0 strings**, because this clone's text census matches the source's exactly, so there was nothing for the
English-only rule to have mis-scored. On a Korean site with no missing text, **0 is the correct result and it is
not evidence that the rule works** — it is evidence that the rule was not needed here.

---

## 5. What I could NOT measure, and why

1. **The parent-content-box change (§4.7).** Its four counters never leave `layout-inference.ts`. Not in the
   manifest schema, not in the manifest. Nothing about it is observable from this run's artifacts.
2. **The redirected-stylesheet recovery (§4.1).** `sheetsRedirectResponses = 0` on all 20 passes — this site
   serves no 3xx stylesheet, so the fix is untested here.
3. **Whether the mobile probe's separate element identity is correct.** One DOM for both viewports
   (`pagesIdenticalWalk 10`, 852 elements walked in both contexts). The case the change exists for — a site that
   serves a *different* DOM to mobile — is not exercised. All I proved is that the mobile probe is now consumed.
4. **Which predicate failed for each of the 593 `no-branch-matched` boxes.** The bucket has no by-reason
   breakdown, and I will not instrument `src/`.
5. **`routeKeyFromSlug`'s double percent-decode.** No route here contains a literal `%`.
6. **The 7 rejected corrections.** `correctionsProposed 2, correctionsAccepted 0, correctionsRejected 7`, so the
   baseline reconstruction stands. I did not open the correction records and did not run `--auto-fix`.
7. **Whether the four other table properties matter.** `border-collapse` changed the rendering and is now
   correct. `border-spacing`, `table-layout`, `caption-side` and `empty-cells` are now in `STYLE_WHITELIST`
   (`src/observer/types.ts:433-437`) and I measured them as matching (`border-spacing: 2px`,
   `table-layout: auto` on both sides), but on this site they sit at their defaults, so I measured no
   consequence from them.
8. **The FAQ accordion's opened state.** 16 disclosure patterns explored, 16/16 `behaviorEquivalent`, but
   `visibleTargetNotDeclared = 7`. I measured that the FAQ is *not* the source of the overlap excess (§3/M2);
   I did not probe what its opened state looks like.
9. **768 px as a graded width.** It is not in the standard sweep. I measured a 1128 px document at a 768 px
   viewport with my own probe; that pair carries no rubric verdict.

---

## 6. Instrument floor (`--self-check`)

Run `data/hobbang.net/responsive-qa/2026-09-02T23-35-55-821Z/`, same 2 routes × 5 widths, source against a second
capture of itself. Nothing is graded; the clone is neither built nor served.

| Route | Width | Floor verdict | Headline | Floor px residual |
|---|---|---|---|---|
| `/` | 390 | **PASS** | no channel fired | 0.000 % |
| `/` | 700 | **PASS** | no channel fired | 0.000 % |
| `/` | 1024 | **PASS** | no channel fired | 0.877 % |
| `/` | 1100 | **PASS** | no channel fired | 0.000 % |
| `/` | 1440 | MINOR | overlap +0.70 pp (threshold 0.10 %) | 0.765 % |
| `/링크모음/검색/` | 390 | MINOR | empty vertical band +2.3 % (threshold 2.0 %) | 0.000 % |
| `/링크모음/검색/` | 700 | **PASS** | no channel fired | 0.000 % |
| `/링크모음/검색/` | 1024 | **PASS** | no channel fired | 0.267 % |
| `/링크모음/검색/` | 1100 | **PASS** | no channel fired | 0.645 % |
| `/링크모음/검색/` | 1440 | **PASS** | no channel fired | 0.000 % |

**FLOOR: BLOCKER 0 / MAJOR 0 / MINOR 2 / PASS 8.** (Previous run's floor was 7 PASS / 3 MINOR; this one is
cleaner still.) Therefore:

- Both **BLOCKER**s and all five **MAJOR**s in §2 are the clone. None is instrument noise or source drift.
- `/` @1024 and `/` @1100 score **PASS against themselves** and **BLOCKER / MAJOR** against the clone. The 1024
  BLOCKER in particular sits on a completely clean floor.
- `/` @700 scores PASS against itself and MAJOR against the clone, so the frozen mobile band is real.
- The graded pixel residuals (5.13 %–62.35 % of area) must be read against a self-comparison residual of
  **0.00 %–0.88 %**, not against the bare 1 % threshold.
- The three graded MINORs are above a floor of PASS on two of their three pairs, so they are small but real.
- **PASS is reachable against this source at 8 of 10 pairs and the clone reached it at 0.**

---

## 7. Cost

| | |
|---|---|
| `e2e:reconstruct` | **10 m 26 s** (20 discovered / 19 verified / 7 families / 10 observed pages / 19 generated routes) |
| ↳ dominant stages | reconstruction-QA **300.0 s**, observation **191.5 s**, interaction exploration 65.6 s, reconstruction 35.3 s, verification 23.5 s, `next build` 3.7 s |
| `qa:responsive` graded, 10 pairs | **3 m 08 s** (`cloneBuildMs: 0`) |
| `qa:responsive --self-check`, 10 pairs | **2 m 49 s** |
| my 7 Playwright probes | ~11 min |
| **Lane total** | **≈ 28 min** of machine time |

| Artifact (this run only) | Size |
|---|---|
| reconstruction QA | 60 MB |
| site observation | 51 MB |
| responsive QA (graded, with diff images) | 40 MB |
| reconstruction (incl. `.next`) | 35 MB |
| SiteSpec | 33 MB |
| responsive QA (self-check, `--no-diff-images`) | 33 MB |
| e2e manifest | 32 KB |
| **this run's total** | **≈ 252 MB** |
| `data/hobbang.net/` after this run (includes the previous lane's run) | 558 MB |
| `docs/result/28.6/review/hobbang/` | **25 MB** |
| `tmp/wr286/w7-hobbang/` | 1.5 MB |
| `generated-styles.css` | 3 704 606 B (exact tier 3 494 560 + layout tier 210 046) |
| mobile probe artifacts | 278 286 B for p000001, now **consumed** |

Note for the orchestrator: the reconstruction-QA stage inside `e2e:reconstruct` is 300 s of the 626 s total and
is largely redundant with `qa:responsive` for a lane whose deliverable is the responsive grade.

---

## 8. Bottom line

**Cleared, measured:**
1. **Tree switch 915 → 768**, `authored-breakpoint`, chosen by weight 142 over 39 and 22, probe-corroborated on
   10/10 pages, with full candidate provenance and `domSwitchWidthObserved: false`. The guess is gone.
2. **`border-collapse` is observed.** All 5 tables render `collapse`, and their heights equal the source's to
   **0.0 px** at 390. The 156 px of wrapper overflow that used to be the 390 MAJOR is gone; that MAJOR is now
   2.18 pp of font-substitution overprint (21 card titles) instead of 5.15 pp of table overflow.
3. **`@font-face` URLs resolve against their own sheet.** `fontFaceUrlsSheetResolved 92 / documentResolved 0`,
   and I fetched all **184/184 → HTTP 200**. The 92 dead URLs are gone from both the observation and the
   SiteSpec asset catalog.
4. **The mobile subtree gets rules.** 932 recovered rules where the previous run had **zero**.
5. **The inline-size funnel is visible and balances exactly**: 4 352 pre-stage drops + 2 604 candidates = 6 956
   probed nodes; 1 707 + 82 + 222 + **593 `no-branch-matched`** = 2 604, double-counts 0.
6. CORS recovery, probe-width derivation, band-edge snapping (170/170, 0 midpoints kept) and truth/band checking
   (2 033 candidates, 2 033 accepted, 0 unchecked, 0 regressed, 0 exempt) all pass on every axis.

**Not cleared, measured, generic:**
1. **A recovered rule is a single unbanded value that must hold across its whole variant band, so any box whose
   source layout changes at an authored breakpoint inside that band is refused and keeps its frozen geometry.**
   Only `responsiveHidden` carries a band (170/170). The desktop band `[768, ∞)` straddles the authored 1024;
   the mobile band `[0, 768)` straddles the authored 640. **Both trees are therefore frozen**, which is
   simultaneously both BLOCKERs, both 700 MAJORs and both 1100 MAJORs.
2. **`BLOCKISH_DISPLAY` excludes `list-item` and every table-internal display**
   (`src/reconstruction/layout-inference.ts:552`, gate at 2034). 2 750 pre-stage drops; 159 of the 163
   uncovered frozen-width nodes are `li`/`tr`/`thead`/`tbody`. This is what makes the search route 1128 px wide.
3. **Grid items are guard-refused wholesale** (`grid-item` ×222) while their container is made fluid, so a
   4×264 px track set inside a 976 px container overflows by exactly 104 px. `tracks-not-reproducible-at-every-width`
   refused **18** containers this run (previous run: 6 — **not directly comparable**, that run had 11 pages and a
   desktop-only pass, this one has 10 pages and both viewports; the counter is not split by viewport).
4. **Moving the switch down to 768 enlarged the damaged band** from `[915, 1128)` to `[768, 1128)`. At 768 the
   clone ships a 1128 px document into a 768 px viewport — a 360 px overflow that the standard sweep does not grade.
5. **`no-branch-matched` has no by-reason breakdown**, and `display-not-blockish` does not record which display
   value it rejected. Both had to be reconstructed by hand from the emitted CSS and the page JSON.
6. **The parent-content-box counters never reach the manifest.** One of the six changes under evaluation is
   unmeasurable from its own artifact.
7. Independently of the engine, the reconstruct-only clone loads **no webfonts**, which on hangul costs
   **+10.1 % to +15.0 % median advance width on the display serif** and changes the line count of **31 of 271**
   matched text runs — invisible to every geometry channel because the clone pins 1 518 heights.

**The self-check floor of BLOCKER 0 / MAJOR 0 / MINOR 2 / PASS 8 means none of that is instrument noise.**
