# Task 28.6 — SITE LANE P2: seoultone.kr

**Host:** `http://seoultone.kr` — the pool's only http-only origin. gnuboard g5 CMS, Korean dermatology clinic.
**Routes graded:** `/` and `/page/intro04.php`, at 390 / 700 / 1024 / 1100 / 1440.
**Status:** COMPLETE — the pipeline ran end to end with no stage failure, and both grader runs measured
all 10 pairs with 0 failures.
**Lane scratch:** `/Users/woops/projects/web-recon/tmp/wr286/w7-seoultone/`
**Review images:** `/Users/woops/projects/web-recon/docs/result/28.6/review/seoultone/` (20 PNGs, 28 MB, no pair dropped)
**Engine untouched:** see §10.

> **Content note.** Korean dermatology clinic — a regulated advertising category. Everything here is a
> local fidelity test against already-public pages. Nothing was deployed, nothing is redistributed
> outside this repo, and no practitioner name, licence number or business-registration number is
> transcribed. Surfaces are described by role ("the practitioner-credential block", "the
> clinic-location column"), never by content.

---

## 0. Headline

**Clone: 6 BLOCKER / 4 MAJOR / 0 MINOR / 0 PASS. Self-check floor: 0 BLOCKER / 1 MAJOR / 6 MINOR /
3 PASS.** The headline count is worse than the previous run's 5 / 2 / 3 and the clone is
substantially better; the composition is the finding, not the count.

- **The tree switch snapped: 915 → 1025**, `method: "authored-breakpoint"`, chosen from the site's own
  seven breakpoints and corroborated by the probe (2,688 observed changes across all 13 pages, the
  highest of nine candidates). **Four of the previous run's five BLOCKERs were that switch and they
  are gone**; `footer-clipped` and `column-container-mode-delta` no longer fire at 1024 at all.
- **The step function is gone horizontally and intact vertically.** `intro04`'s clone
  `contentMaxRight` went from two values (583, 1607) to four (583, 681, 1005, 1607) against a fluid
  source. Its `scrollHeight` is still two values, because the recovered tier holds 1,359 `width:`
  declarations and **zero** `height:` ones against 4,508 frozen `height: <n>px` in the exact tier.
- **The generated stylesheet went from 0 `@media` rules to 8** — 5 snapped onto the site's authored
  `max-width: 768px`, 3 keeping a midpoint with `no-authored-in-gap` recorded as the reason.
- **The mobile subtree went from 0 inferred rules to 813** (59.5 % of 1,367 shipped), verified in the
  shipped CSS and not just the counter.
- **The redirected Swiper stylesheet is recovered: blocked 5, recovered 5, missed 0**, on 26 of 26
  observations. `bytesBridged` 650,631 → **665,243**, and 665,243 is exactly the sum of the five
  sheets as I fetched them myself. The +14,612 delta is the previously-missed sheet, to the byte.
- **The new dominant BLOCKER is `missing-text-ratio` 32.5–48.8 % on the homepage — a channel that read
  0.0000 on the same pairs last run.** The grader's text census now honours opacity, and the clone
  bakes ~900 characters at `opacity: 0`. `clone − source opacityHiddenTextChars` matches `missingChars`
  within 7 % on all five pairs: the missing text *is* the opacity-hidden text.
- **The Korean census is clean and the script-aware rule fired.** `boundaryOnlyChars = 0` on all ten
  pairs; `scriptRelaxedChars = 6` over one string on three pairs — small, real, and separately counted.
- **The scheme was never rewritten.** `https://seoultone.kr` appears in **0** files across the
  discovery, observation and reconstruction run directories.
- **Four engine defects measured** (§6), the sharpest being that floor-width eviction can evict the
  **desktop truth width** and silently cost a page its entire desktop pass — it did, on 2 of 13 pages.
- **What I could not measure** (§7): the parent-content-box counters never reach the manifest, and
  this site has no `<table>` at all, so the table-formatting capture is untested here in either
  direction.
## 1. What I ran

| # | Command (exact) | Wall | Run id / output |
|---|---|---|---|
| 1 | `curl` × 13 — homepage, `/page/intro04.php`, all 11 `<link>` stylesheets, the unpkg redirect probe, the Pretendard font URL | ~50 s | `tmp/wr286/w7-seoultone/*.html`, `truth-css/*.css` |
| 2 | `pnpm e2e:reconstruct http://seoultone.kr/ --max-urls 20 --concurrency 2` | **13 m 17.6 s** (23:12:16.418Z → 23:25:34.046Z) | e2e run `2026-09-02T23-12-16-418Z` |
| 3 | `pnpm qa:responsive <manifest> --widths 390,700,1024,1100,1440 --routes "/,/page/intro04.php" --self-check` | see §9 | run `2026-09-02T23-24-44-987Z` |
| 4 | `pnpm qa:responsive <manifest> --widths 390,700,1024,1100,1440 --routes "/,/page/intro04.php" --self-check-run 2026-09-02T23-24-44-987Z` | see §9 | run id in §2 |

`<manifest>` = `data/seoultone.kr/reconstructions/2026-09-02T23-17-40-791Z/reconstruction-manifest.json`.

**I never dropped to individual stages.** The end-to-end command carried both in-scope routes through
discovery → verification → selection as their own families, so no hand-built `selected-pages.json` was
needed. `/` is `p000001`; `/page/intro04.php` is `p000006`.

I used `--self-check-run` (new in this wave) rather than `--with-self-check` so the floor is a
separately-addressable run **and** the grader's own comparability check (site, rubric, roster, widths,
routes) runs against it. That check is evidence in itself: it is the engine confirming the two runs
are commensurable rather than me asserting it.

**I did NOT pass `--prepare-scroll`.** Consequence, measured: `paintSuppression.scrollRevealAvailable`
is `false` on every observation, so 97 of 450 sized elements on the homepage (21.6 %) were captured
while paint-suppressed. See §7.

### Run ids and directories

| Stage | Path |
|---|---|
| e2e manifest | `data/seoultone.kr/e2e-runs/2026-09-02T23-12-16-418Z/e2e-manifest.json` |
| discovery / verification / selection | `data/seoultone.kr/2026-09-02T23-12-19-842Z/` |
| observation (13 pages × 2 contexts) | `data/seoultone.kr/site-observations/2026-09-02T23-12-31-237Z/` |
| interaction exploration | `data/seoultone.kr/interaction-explorations/2026-09-02T23-17-08-168Z/` |
| SiteSpec | `data/seoultone.kr/site-specs/2026-09-02T23-17-39-498Z/` |
| reconstruction | `data/seoultone.kr/reconstructions/2026-09-02T23-17-40-791Z/` |
| reconstruction QA (e2e's own) | `data/seoultone.kr/reconstruction-qa/2026-09-02T23-19-26-196Z/` |
| responsive QA — self-check floor | `data/seoultone.kr/responsive-qa/2026-09-02T23-24-44-987Z/` |
| responsive QA — clone grade | see §2 |

Pipeline stage timings (ms), from the e2e manifest:
`discovery 3,424 · verification 11,383 · selection 7 · observation 276,352 · interaction-detection 416 ·
interaction-exploration 30,637 · interaction-modeling 11 · sitespec 1,644 · **reconstruction 102,633** ·
build 2,852 · qa 368,040 · family-escalation 0 · final-validation 29`.
Final status **`complete-with-known-limitations`**; 20 discovered → 19 verified (1 non-HTML) →
11 families → 13 pages observed, 0 failures → 19 routes generated, 19 rendered.

Reconstruction went from 11.6 s (previous run) to **102.6 s**, an 8.8× rise. That is the price of the
R3 in-band verification and the per-viewport passes: `truthCheckPagesRendered 24`, `truthCheckRounds 24`,
`bandWidthsRendered 2`. It is a real cost and it is bought with a real result (§4).

---

## 2. The responsive grade

Both runs: `pnpm qa:responsive` at 390 / 700 / 1024 / 1100 / 1440 on `/` and `/page/intro04.php`.

- **Clone run `2026-09-02T23-29-55-193Z`: 6 BLOCKER · 4 MAJOR · 0 MINOR · 0 PASS.**
- **Self-check floor `2026-09-02T23-24-44-987Z`: 0 BLOCKER · 1 MAJOR · 6 MINOR · 3 PASS.**
- The clone artifact carries the floor by reference: `selfCheckFloor.status = "referenced"`,
  `comparable: true`, `incomparableReasons: []`, rubric version 3 on both, identical 50-channel roster.
  **The engine itself certifies the two runs are commensurable.** I did not have to assert it.

| Route | Width | **Clone** | Floor | Deciding channel (value / threshold) | Distance above floor |
|---|---:|---|---|---|---|
| `/` | 390 | **BLOCKER** | MINOR | `missing-text-ratio` 0.3307 / 0.10 | floor 0.0000 on the same channel |
| `/` | 700 | **BLOCKER** | MAJOR | `missing-text-ratio` 0.3492 / 0.10 | floor 0.0307 — clone is 11.4× |
| `/` | 1024 | **BLOCKER** | MINOR | `missing-text-ratio` 0.3438 / 0.10 | floor 0.0000 |
| `/` | 1100 | **BLOCKER** | MINOR | `footer-clipped` 1 / 1 (clone footer right 1296 > 1100) | floor 0 |
| `/` | 1440 | **BLOCKER** | MINOR | `missing-text-ratio` 0.3253 / 0.10 | floor 0.0000 |
| `/page/intro04.php` | 390 | MAJOR | **PASS** | `missing-text-ratio` 0.0224 / 0.02 | floor 0.0000 |
| `/page/intro04.php` | 700 | MAJOR | **PASS** | `pixel-visible-difference-ratio` 0.5011 / 0.50 | floor: channel did not fire |
| `/page/intro04.php` | 1024 | MAJOR | **PASS** | `position-delta-p90-px` 634 / 48 | floor 0 px |
| `/page/intro04.php` | 1100 | **BLOCKER** | MINOR | `footer-clipped` 1 / 1 (1296 > 1100) | floor 0 |
| `/page/intro04.php` | 1440 | MAJOR | MINOR | `missing-text-ratio` 0.0227 / 0.02 | floor 0.0000 |

**Not one clone BLOCKER or MAJOR is at its floor.** Three of the ten pairs reached PASS with the
source graded against itself, so PASS is reachable against this source and every verdict above is a
clone-side statement.

**The floor moved between runs and that matters.** The previous lane's floor on this host was
0 BLOCKER / 0 MAJOR / 6 MINOR / 4 PASS with a worst pixel residual of 2.24 %. Mine is
0 BLOCKER / **1 MAJOR** / 6 MINOR / 3 PASS with a worst residual of 8.05 %, and the MAJOR is
`missing-text-ratio 3.07 %` on `/ @700` — the **source losing 3.07 % of its own text between two
captures four seconds apart**. Seven lanes were driving browsers on this machine. That is a resource
fact, not a property of the site or the engine, and it is exactly why the floor has to be measured in
the same session as the grade rather than borrowed from an earlier run.

### Every channel that fired, per pair

```
/ @390    BLOCKER missing-text-ratio 0.3307/0.10 · MAJOR position-delta-p90-px 340/48
          · MINOR pixel-residual 0.3938
/ @700    BLOCKER missing-text-ratio 0.3492/0.10 · MAJOR position-delta-p90-px 779/48
          · MINOR pixel-residual 0.6268 · MINOR scroll-height-ratio-low 0.88/0.90
/ @1024   BLOCKER missing-text-ratio 0.3438/0.10 · MAJOR pixel-visible-difference-ratio 0.5044/0.50
          · MAJOR position-delta-p90-px 657/48 · MINOR pixel-residual 0.6441
/ @1100   BLOCKER footer-clipped · BLOCKER missing-text-ratio 0.4877 · BLOCKER visible-text-ratio 0.4802/0.60
          · MAJOR column-container-mode-delta 4/2 · MAJOR position-delta-p90-px 446/48
          · MINOR pixel-residual 0.6060
/ @1440   BLOCKER missing-text-ratio 0.3253/0.10 · MINOR pixel-residual 0.1669 · MINOR position-delta-p90-px 11/8
intro04 @390   MAJOR missing-text-ratio 0.0224/0.02 · MINOR pixel-residual 0.4728
intro04 @700   MAJOR missing-text-ratio 0.0224 · MAJOR pixel-visible-difference-ratio 0.5011/0.50
               · MAJOR position-delta-p90-px 310/48 · MINOR pixel-residual 0.6014
intro04 @1024  MAJOR missing-text-ratio 0.0224 · MAJOR position-delta-p90-px 634/48 · MINOR pixel-residual 0.6149
intro04 @1100  BLOCKER footer-clipped · MAJOR column-container-mode-delta 4/2 · MAJOR missing-text-ratio 0.0321
               · MAJOR overlap-excess-ratio 0.0811/0.02 · MAJOR position-delta-p90-px 598/48
               · MINOR pixel-residual 0.5531
intro04 @1440  MAJOR missing-text-ratio 0.0227/0.02 · MINOR pixel-residual 0.2909 · MINOR position-delta-p90-px 10/8
```

---

## 2b. Is the step function gone? **Yes, horizontally. No, vertically.**

This is the question the brief asked, and `contentMaxRight` answers it directly. Previous run against
this run, `/page/intro04.php`:

| width | 390 | 700 | 1024 | 1100 | 1440 | distinct values |
|---|---:|---:|---:|---:|---:|---|
| source | 583 | 1022 | 1495 | 1606 | 1607 | fluid |
| clone, **previous** run | 583 | **583** | **1607** | **1607** | 1607 | **2** |
| clone, **this** run | 583 | **681** | **1005** | 1607 | 1607 | **4** |

**The two-value step function is gone.** The clone now moves at every width the source moves at,
in the same direction, and it is monotone. It still *undershoots* — 681 against 1022 at 700, 1005
against 1495 at 1024 — so the recovered rules bend the layout the right way without reaching the
source's own curve. That undershoot is what `position-delta-p90-px` 310 and 634 are measuring.

The homepage tells the same story less cleanly (its `contentMaxRight` is dominated by an off-screen
carousel track): previous clone `5693, 5693, 5957, 5995, 6165` — with a repeat at 390/700 — against
this run's `5710, 5865, 6027, 6083, 6253`, five distinct strictly-increasing values.

**Vertically nothing changed, and I can say exactly why.** `scrollHeight` on `/`: source
`5679 / 6400 / 6148 / 4945 / 4892`, clone `5632 / 5632 / 5632 / 4892 / 4892` — **two values, one per
tree**. The recovered tier contains **1,359 `width:` declarations and 0 `height:` declarations**,
while the exact tier carries **4,508 `height: <n>px`**. Inline-size recovery is inline-size only by
construction; block-size is still a frozen snapshot of the truth viewport. That is the honest reading
of "the step function is gone": it is gone on the axis the wave worked on and untouched on the other.

### `@media` in the generated stylesheet: **0 → 8**

`public/wr/generated-styles.css` (4,375,667 B) previously contained **zero** `@media` rules. It now
contains **8**, all in the recovered tier:

```
5 × @media (min-width: 769px)      <- snapped onto the source's authored max-width: 768px
3 × @media (min-width: 490px)      <- kept the midpoint; no authored breakpoint in that gap
```

Plus the two tree-switch queries in `app/globals.css`, now `max-width: 1024.98px` / `min-width: 1025px`
instead of `max-width: 914.98px` / `min-width: 915px`.

The width-declaration mix also moved, though less than the verdicts do:
`width: <n>px` 3,708 → **3,553**; `width: auto` 1,611 → **2,784** (+73 %); `width: <n>%` 79 → **157**.
`1296px` still appears 49 times (was 53) and is the direct cause of both remaining `footer-clipped`
BLOCKERs.
## 3. The http-only question — was the scheme ever rewritten?

**No. Zero occurrences of `https://seoultone.kr` in any artifact this lane produced.**

Independent check first: `curl -sSI http://seoultone.kr/` returns `HTTP/1.1 200 OK` with **no
`Location` header** — the origin does not redirect to https itself, so any https in an artifact would
be the engine's doing.

| Surface | files containing `http://seoultone.kr` | files containing `https://seoultone.kr` |
|---|---:|---:|
| discovery / verification / selection run dir | 6 | **0** |
| observation run dir | 184 | **0** |
| reconstruction run dir (incl. generated app) | 18 | **0** |

`generated-config.ts → SOURCE_ROOT_URL = "http://seoultone.kr/"`. The scheme survives discovery,
verification, selection, observation, SiteSpec, reconstruction and both QA runs intact.

---

## 4. Engine-change measurements

### 4.1 Stylesheet coverage — blocked / recovered / missed

**The redirected Swiper stylesheet is recovered. 0 missed, on all 26 page × viewport observations.**

Homepage (`p000001`), both contexts identical:

| | previous run | **this run** |
|---|---:|---:|
| stylesheets total | 13 | 13 |
| CSSOM-readable | 8 | 8 |
| CSSOM-blocked | 5 | 5 |
| offered to the fallback | 4 | **5** |
| **recovered** | 4 | **5** |
| **missed** | **1** | **0** |
| `sheetsBodyUnavailable` | 1 | **0** |
| `sheetsRedirectResponses` | — | 1 |
| `sheetsRedirectAliasesKeyed` | — | **1** |
| `sheetsRedirectChainsTruncated` | — | 0 |
| `bytesBridged` | 650,631 | **665,243** |
| `rulesIndexed` | 804 | **889** |

`fallbackMissed: 0` and `sheetsBodyUnavailable: 0` on **every one of the 26** page × viewport
observations. Previously it was `1` on all 28.

**Byte-exact independent confirmation.** I fetched every stylesheet the homepage links, myself:

| sheet | my fetch, bytes |
|---|---:|
| `fonts.googleapis.com` Nanum Myeongjo | 174,955 |
| `fonts.googleapis.com` IBM Plex Sans KR + Montserrat | 425,624 |
| `unpkg.com/swiper/swiper-bundle.min.css` (**the 302**) | 14,612 |
| `cdn.jsdelivr.net/npm/swiper/swiper-bundle.min.css` | 14,612 |
| `t1.kakaocdn.net` roughmapLander.css (JS-injected; by difference) | 35,440 |
| **total** | **665,243** |

**Identical to `bytesBridged` to the byte.** The delta from the previous run is exactly 14,612 — the
sheet that used to be missed. `curl` confirms the redirect is still live:
`https://unpkg.com/swiper/swiper-bundle.min.css?ver=03015-1` → `302 → /swiper@14.2.0/…`, so the fix
is genuinely exercised rather than the CDN having stopped redirecting. The two swiper copies are
byte-identical (sha256 `d3bd7ac4a5cb1eb7…`), which is why the previous run's *blast radius* was zero;
the *mechanism* is fixed regardless.

Per-page coverage, all 13 pages × 2 contexts: `fallbackMissed 0`, `sheetsSkippedBySizeCap 0`,
`importsExpanded 0`, `importsUnresolved 0`, `ruleIndexCapHit false`, `authoredMediaConditionsDropped 0`,
`authoredMediaConditionsCapHit false` — everywhere. Blocked/recovered is 5/5 on `/`, 4/4 on
`/page/intro04.php`, 3/3 on the other eleven.

### 4.2 `@font-face` URLs resolved against their own sheet

`fontFaceUrlsHarvested 948 · fontFaceUrlsAbsolute 944 · fontFaceUrlsSheetResolved 4 ·
fontFaceUrlsDocumentResolved 0` — identical on all 26 observations.

The four are the Pretendard variable font, whose sheet
(`cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css`)
writes `src: url('../../../packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2')`.
I verified both readings myself:

| resolution | URL | result |
|---|---|---|
| **sheet-relative (shipped)** | `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/…/PretendardVariable.woff2` | **200, 2,057,688 B** |
| document-relative (pre-fix) | `http://seoultone.kr/packages/…/PretendardVariable.woff2` | **404** |

So on this site the change converts a dead URL into a live one, 4 times per observation.
`fontFaceUrlsDocumentResolved: 0` — the fallback never fired.

### 4.3 Table-formatting properties — captured, and nothing here to apply them to

All five new properties are present on all **1,237** style blocks:
`border-collapse 1237 · border-spacing 1237 · table-layout 1237 · caption-side 1237 · empty-cells 1237`.

**But every captured value is the CSS initial value.** `border-collapse: separate` × 1,237,
`table-layout: auto` × 1,237, no other value anywhere. Cause, measured: **there is not one `<table>`
element** on `/`, on `/page/intro04.php`, or even in the rendered `/bbs/board.php?bo_table=Event`
capture (this g5 theme builds its board with `<div>`s). **This lane provides no evidence about the
table-formatting change in either direction** — it is captured, it costs five properties per block,
and it changed nothing here.

### 4.4 Probe widths — derivation, provenance, and the cap

`conditionsUnparsed 0 · conditionsDroppedByCollector 0 · degradedToFloor false` on all four probes below.

| page | ctx | derived widths | `capHit` | adopted | **droppedByCap** | `floorWidthsEvicted` | adoptedByEviction |
|---|---|---|---|---:|---:|---|---:|
| `/` | desktop | 390,500,501,768,769,1024,1025,1100,1200,1201,1280,1281,1440,1600,1601,1920 | false | 6 | **0** | `[700]` | 1 |
| `/` | mobile | 390,480,500,501,700,768,769,914 | false | 2 | 0 | `[]` | 0 |
| `intro04` | desktop | 390,499,500,501,769,1024,1025,1100,1200,1201,1280,1281,1440,1600,1601,1920 | false | 7 | **0** | `[700, 768]` | 1 |
| `intro04` | mobile | 390,480,499,500,501,700,768,769,914 | false | 3 | 0 | `[]` | 0 |

**Provenance of the width set:** the site's own `@media` conditions, folded per page.
`breakpointsRefused` on `/` desktop is exactly one entry — `{px: 1921, kind: min, count: 2, reason: out-of-range}`.
Nothing else was refused, and nothing was dropped by the cap.

**This fixes the previous run's MAJOR-3.** Then: `capHit true`, `breakpointsDroppedByCap 1` on both
measured pages — a real authored breakpoint (1600 on `/`, 1200 on `intro04`) was never sampled. Now
the cap is met by **evicting a floor width instead of an authored breakpoint**, and every in-range
authored breakpoint is bracketed on both sides.

**Independent ground truth.** I fetched the two stylesheets that carry `@media` and counted the
declarations under each condition myself:

| condition | my count, declarations | SiteSpec `boundaries[].count`, `/` desktop |
|---|---:|---:|
| `max-width: 500px` | 78 | 23 |
| `max-width: 768px` | 56 | 23 |
| `max-width: 1024px` | 62 | 38 |
| `max-width: 1200px` | 56 | 39 |
| `max-width: 1280px` | 11 | 5 |
| `max-width: 1600px` | 7 | 3 |
| `min-width: 1921px` | 24 | 26 |

Seven authored breakpoints, exactly as the engine reads them (`distinctConditions 7`,
`distinctRawConditions 7`, `unparsedDeclarations 0`, `unparsedConditions []`). The two columns are not
the same quantity and should not match: mine counts declarations **in the served file**, the engine's
counts declarations **matched to a node it walked**. The set of breakpoints agrees exactly, which is
the claim that matters.

### 4.5 The tree switch — 915 → **1025**, snapped, corroborated

`config.inferredBreakpoint` in the reconstruction manifest:

```
value 1025 · provenance "inferred" · method "authored-breakpoint"
mobileObservedWidth 390 · desktopObservedWidth 1440
candidateCount 9 · ambiguous true · candidatesOutsideObservedInterval 26 · candidatesOmitted 0
pagesRead 13 · pagesWithHistogram 13 · pagesWithUsableProbe 13
treeDivergence "dual-dom" · pagesIdenticalWalk 11 · pagesDivergentWalk 2 · pagesWalkNotComparable 0
domSwitchWidthObserved false
chosen { px 1025, authoredWeight 418, authoredPages 13, observedChange 2688,
         observedChangePages 13, observedChangeUnattributablePages 0 }
```

The full ranked candidate list:

| px | authoredWeight | authoredPages | observedChange | observedChangePages | unattributablePages |
|---:|---:|---:|---:|---:|---:|
| **1025** | 418 | 13 | **2688** | **13** | **0** |
| 501 | 213 | 13 | 1820 | 13 | 0 |
| 1201 | **507** | 13 | 1482 | 12 | 1 |
| 1281 | 5 | 1 | 410 | 13 | 0 |
| 500 | 115 | 7 | 322 | 12 | 1 |
| 769 | 352 | 13 | 286 | 1 | 12 |
| 681 | 12 | 1 | 219 | 1 | 12 |
| 401 | 3 | 1 | 16 | 1 | 12 |
| 901 | 12 | 1 | 0 | 0 | 13 |

Two things are worth naming. First, 1025 is **not** the heaviest candidate in the stylesheet — 1201
carries more authored weight — so the ranking's probe-first ordering is what chose it, and the probe
was decisive: 2,688 observed changes across all 13 pages against 1,482 on 12. Second, the emitted
switch is `1025`, i.e. the *above* side of the site's `max-width: 1024px`, which is the correct
translation of a `max-width` boundary into a `min-width` switch.

`app/globals.css` now reads `@media (max-width: 1024.98px)` / `@media (min-width: 1025px)`;
`generated-config.ts → BREAKPOINT = 1025`. The 915 midpoint is gone.

### 4.6 Band edges — snapped versus midpoint-kept

The previous run had **zero** evidence here (`responsiveHidden 0`). It now has some:

```
responsiveHidden 8
bandEdgesOpen 8 · bandEdgesConsidered 8
bandEdgesSnapped 5 · bandEdgesSnappedAmbiguous 0
bandEdgesKeptMidpointNoAuthoredInGap 3
bandEdgesKeptMidpointEmptyHistogram 0 · bandEdgesKeptMidpointNoHistogram 0
bandEdgeSnapShiftPx 5
bandCheckable 8 · rejectedByBandCheck 0 · bandWidthsRendered 2
bandIndependentlyDiscriminated 8 · bandHiddenByAncestorAtBandWidth 4 · bandExactTierHidesAtBandWidth 0
bandTruthBaselineNotInLayout 0 · bandSampleMismatches 0
authoredBreakpointPages { "spec-field": 24 } · authoredBreakpointEntries 163
authoredBreakpointDeclarations 204,464 · authoredBreakpointUnparsedDeclarations 0
authoredBreakpointTruncatedNodes 2,807
```

The partition closes: 8 = 5 snapped + 3 kept-midpoint-no-authored-in-gap + 0 + 0.
The five snapped edges are all in the stylesheet as `@media (min-width: 769px)` — the site's
`max-width: 768px` boundary — and the three that kept their midpoint are `@media (min-width: 490px)`.
Total shift **5 px**, i.e. the midpoint the snapper replaced was 764 and the authored edge is 769.

Reading `bandIndependentlyDiscriminated` honestly, as the field's own doc insists: 8 checkable,
8 present in the document, **4 already removed from layout by an ancestor** at the band width, 0
already hidden by the exact tier ⇒ **4 genuinely discriminated by their own cascade**, not 8.

**Sample size is 8.** That is enough to say the machinery runs, produces `@media` output, and closes
its partition. It is not enough to characterise the change. Another lane must carry it.

### 4.7 Desktop / mobile split — the mobile subtree finally has rules

```
viewportPasses        { desktop: 13, mobile: 13 }
viewportPassesUsed    { desktop: 11, mobile: 13 }
viewportPassRefusals  { "desktop:truth-width-not-probed": 2 }
rulesByViewport       { desktop: 554, mobile: 813 }
shippedRulesByViewport{ desktop: 554, mobile: 813 }
```

**Previously the mobile subtree carried exactly zero inferred rules. It now carries 813 — 59.5 % of
the 1,367 shipped.** I confirmed this in the shipped stylesheet rather than trusting the counter:
the recovered tier of `public/wr/generated-styles.css` (from its `/* Recovered layout rules */`
marker at line 3934 to EOF, 132,801 B) contains exactly 554 selectors with
`data-wr-viewport="desktop"` and 813 with `data-wr-viewport="mobile"`, and 1,359 `width:` + 11
`max-width:` + 11 `margin-left`/`margin-right` + 8 `display:` declarations.

On my two graded routes: `/` gets 79 desktop + 106 mobile rules; `/page/intro04.php` gets 129 + 142.
(The desktop/mobile counts per page do not divide evenly because the two trees have different node
counts and different probe evidence.)

### 4.8 The inline-size funnel — the previously invisible population

```
nodesWithProbe 7,929
inlineSizePreStageDrops { display-not-blockish 3,856 · hidden-at-truth-width 1,042 · truth-sanity-mismatch 50 }
inlineSizeCandidates 2,981
inlineSizeOutcomes {
  emitted-full-width               1,287
  no-branch-matched                1,490     <-- the count that had no field before
  refused-containing-block-guard      94
  emitted-percentage-width            61
  emitted-centered-max-width          10
  refused-width-mode                  38
  emitted-centered-max-width-capped-fill 1
}
inlineSizeOutcomeDoubleCounts 0
```

**Both partitions close exactly**, which is the property the change exists to provide:
`3,856 + 1,042 + 50 + 2,981 = 7,929 = nodesWithProbe`, and
`1,287 + 1,490 + 94 + 61 + 10 + 38 + 1 = 2,981 = inlineSizeCandidates`.

**The headline number is `no-branch-matched: 1,490` — 50.0 % of every candidate.** Those nodes ship
their exact computed width, frozen at 1440, at every width the clone renders. On the previous run
this population had no field at all; the artifact reported "6 refusals" over the same kind of
population and a reader had no way to see the other half. This is the single most valuable number
the wave added on this site.

Refusal detail: `widthModeRefusals 38 { flex-item-main-axis 29, out-of-flow-auto-margin 9 }`;
`rejectedByGuard 94 { fixed-position 24, parent-padding-not-constant 70 }`;
`widthValueRefusals 0`; `gridTrackColumns 0`, `gridTrackRefusals 0`.

### 4.9 The parent content box, measured per width

**I could not measure this from the artifacts, and that is a finding.** The five counters that prove
the change — `contentBoxMeasured`, `contentBoxAssumedConstant`, `contentBoxMeasuredDisagreed`,
`contentBoxMaxDisagreementPx`, `parentPaddingNotConstant` — are declared at
`src/reconstruction/layout-inference.ts:482-499`, incremented at `layout-inference.ts:2094-2109`, and
asserted by `scripts/smoke-layout-safety.ts:3887-3894` — but `generate-app.ts:380-455`, which copies
every neighbouring counter into the manifest, **does not emit any of them**. A production run
therefore cannot say how often the measured box was available or how far it moved the answer.

What I *can* measure is the change's shadow. `guardRefusalsByReason` carries
**`parent-padding-not-constant: 70`**, and `layout-inference.ts:2143-2146` only produces that reason
when the measured content box was **absent** *and* the parent's authored padding is not one constant
number. So: 70 nodes on this site where the pre-28.6 code would have divided by a padding it assumed
constant and shipped a rule, and this build refuses instead. The population where the measurement
*succeeded* is exactly what is not published.

### 4.10 Truth-check accounting — every drop explained

```
truthCheckStatus "verified" · truthCheckable 1,359 · truthCheckRounds 24
truthCheckPagesRendered 24 · truthCheckConverged true
candidateRules 1,367 · acceptedRules 1,367 · recoveredRules 1,367
rejectedByTruthCheck 0 · rejectedUnverifiable 0 · acceptedUnchecked 0 · acceptedRegressed 0
bandCheckable 8 · rejectedByBandCheck 0 · bandTruthBaselineNotInLayout 0
```

`truthCheckable 1,359 + bandCheckable 8 = 1,367 = candidateRules`. Nothing shipped unverified
(`acceptedUnchecked 0`, which under R3 is the number that used to hide bad bands), nothing shipped
still regressing (`acceptedRegressed 0`), and nothing was dropped for being unmeasurable
(`rejectedUnverifiable 0`). By kind: `fullWidth 1,287 · percentage 61 · centered 11 ·
responsiveHidden 8 · gridTrack 0`.

### 4.11 The Korean text census, now that the boundary rule is script-aware

See §5 for the per-pair numbers. The shipped rule is at
`src/responsive-qa/correspondence.ts:442`, which exempts
`\p{Script=Han} \p{Script=Hangul} \p{Script=Hiragana} \p{Script=Katakana} \p{Script=Thai} \p{Script=Lao}
\p{Script=Khmer} \p{Script=Myanmar}` edges from the word-boundary requirement, and the pre-G2
English-only reading is kept alongside it (`edgeSatisfiedSpacedOnly`, line 473) purely so the run can
publish `scriptRelaxedChars` / `scriptRelaxedStringCount` — the size of the difference between the two
readings. That is the right shape: the number moved and the move is counted rather than silent.

The corpus is genuinely Korean-dominant, so this is a real test bed rather than a theoretical one.
## 5. Every BLOCKER and MAJOR, diagnosed

### BLOCKER-A — `missing-text-ratio` 32.5 – 48.8 % on `/`, at all five widths. **The clone bakes ~900 characters at `opacity: 0`.**

Pairs: `/ @390` 0.3307 · `/ @700` 0.3492 · `/ @1024` 0.3438 · `/ @1100` 0.4877 · `/ @1440` 0.3253.
Threshold 0.10. Floor on the same channel: 0.0000 at four of the five widths, 0.0307 at 700.

**This channel read `0.0000` on these same pairs in the previous run.** It reads a third of the page
now because the grader's text census was changed to honour opacity the way its box census already
did (`src/responsive-qa/probe.ts:115-131`, `:156`, `:241-249`). The change did not invent a defect; it
made a defect that had always been there scoreable.

**The attribution is arithmetic, not inference.** The run publishes the opacity-hidden population on
both sides:

| pair | source `opacityHiddenTextChars` | clone `opacityHiddenTextChars` | **clone − source** | `missingChars` |
|---|---:|---:|---:|---:|
| `/ @390` | 438 | 897 | **459** | 453 |
| `/ @700` | 399 | 897 | **498** | 492 |
| `/ @1024` | 424 | 897 | **473** | 482 |
| `/ @1100` | 81 | 979 | **898** | 851 |
| `/ @1440` | 535 | 979 | **444** | 417 |

Every row agrees within 7 %. **The missing text is the opacity-hidden text.** `boundaryOnlyChars: 0`
and `absentChars == missingChars` on all five pairs, so none of it is a matching artefact — the
strings simply are not in the clone's painted text.

**Cause, at artifact field.** The source uses a scroll-reveal library that holds blocks at
`opacity: 0` until they enter the viewport. The observation recorded one instant of that —
`paintSuppression` on `/` desktop: `sizedElements 450 · suppressedElements 97 (21.6 %) ·
suppressedByOpacity 32 · suppressedByAncestor 88 · suppressedBelowFold 82 · opacityThreshold 0.05 ·
scrollRevealAvailable false` — and the generated stylesheet bakes it permanently: **2,455
`opacity: 0` declarations** in the exact tier of `generated-styles.css`.

`scrollRevealAvailable: false` because I did not pass `--prepare-scroll`
(`src/observer/observe-page.ts:684`, the whole reveal pass is behind that flag). So this is a run
configuration I chose for comparability, not an engine failure — but the clone's behaviour is a real
defect regardless: a clone that permanently hides a third of a page's words is broken for a reader
whichever capture produced it.

**Human evidence:** `docs/result/28.6/review/seoultone/root_1440_BLOCKER_{source,clone}.png`. The two
documents are the same height to the pixel (4892 = 4892) and `position-delta-p90-px` is 11 px, and
the practitioner-credential block, two section headings and the CTA copy are **blank** on the clone
side. Layout right, paint wrong.

### BLOCKER-B — `footer-clipped` at 1100 on both routes. **The residual frozen 1296 px, now isolated to one band.**

`/ @1100` and `intro04 @1100`: clone footer `maxRight` **1296** in a 1100 px viewport; source's footer
fits. Same channel, same number, as the previous run.

**What changed is where it fires.** Previously: 1024 **and** 1100 on both routes — four pairs, because
the 915 tree switch put the clone on its desktop tree from 915 px up. Now the switch is 1025, so at
1024 the clone is on the *mobile* tree, and `footer-clipped` does not fire there at all. It fires only
at 1100, where the clone is correctly on the desktop tree and that tree's containers are still frozen
at their 1440-px used widths.

So this BLOCKER is no longer a tree-switch fault. It is the plain frozen-width fault, confined to the
band **1025 ≤ w < ~1296**. The source's own next authored breakpoint below 1440 is `max-width: 1200px`;
between 1025 and 1200 the source narrows its container fluidly and the clone does not.

The 1296 px containers are still not among the recovered rules: `1296px` occurs 49 times in the exact
tier and 0 times in the recovered tier. The relevant style block (`.wr-st000011`) carries
`max-width: 1400px` alongside `width: 1296px` — a fluid, capped container whose used width was frozen
— which is exactly the shape `emitted-centered-max-width` exists for, and that branch fired only
**10 times in the entire site**. I did not trace which predicate declined these particular nodes
(§7.5).

**Corroborating channel at the same pair:** `column-container-mode-delta` 4 (threshold 2) on both
1100 pairs — *"a matched container lays its children out as 1 row of 5 where the source uses 5 rows of
1"*. The source has already stacked its footer/nav column list at 1100; the clone still has it
horizontal.

**Human evidence:** `page-intro04-php_1100_BLOCKER_clone.png` — the nav bar runs off the right edge
and the clinic-location column prints two address lines on top of each other.

### BLOCKER-C — `visible-text-ratio` 0.4802 (threshold 0.60) at `/ @1100`

*"the clone renders only 48.0 % of the source's visible text — a major section did not render."*
Source visible chars 1745 at this pair against 1370–1409 at the other widths: the source's capture at
1100 caught the page **after** more of its scroll-reveal had fired, so the denominator is larger.
Clone 838. This is BLOCKER-A measured against a luckier source capture, not a separate fault; the
floor at the same pair had `sourceVisibleChars 1745` and `opacityHiddenTextChars 81`, i.e. the source
had revealed nearly everything and the clone had revealed nothing.

### MAJOR-A — `position-delta-p90-px` 310 – 779 px at 700 / 1024 / 1100

`/ @700` 779 · `/ @1024` 657 · `/ @1100` 446 · `intro04 @700` 310 · `intro04 @1024` 634 ·
`intro04 @1100` 598. Threshold 48. Floor: **0 px** on every one of these pairs.

This is the undershoot named in §2b: the clone's inline sizes now move with the viewport but do not
move far enough, so boxes land hundreds of pixels from their source positions in the middle of the
range. At 1440 — the truth width the whole tier is fitted at — the same channel reads **11 px** and
**10 px**, one notch over an 8 px MINOR threshold. The error is smallest where the evidence is
densest and grows with distance from it.

### MAJOR-B — `missing-text-ratio` 2.24 – 3.21 % on `/page/intro04.php`, all five widths

`missingChars` is **21** at four widths and 30 at 1100, against `sourceVisibleChars` 927–936.
The clone's `opacityHiddenTextChars` is **exactly 21** and its `opacityHiddenNodes` is **exactly 1**,
against 0 and 0 on the source side. **One baked `opacity: 0` node accounts for 100 % of this MAJOR**,
and it is what moves four intro04 pairs from a floor of PASS to MAJOR. Same mechanism as BLOCKER-A,
three orders of magnitude smaller.

### MAJOR-C — `pixel-visible-difference-ratio` 0.5044 / 0.5011 (threshold 0.50) at `/ @1024` and `intro04 @700`

Both a hair over the line, both downstream of the undershoot plus the missing web fonts (the
generated stylesheet has **0** `@font-face`; the source loads 948 `@font-face` URLs). Read them with
the run's own calibration limitation: on the least-inked pair the 1 % area band is 3 % of the page's
ink.

### MAJOR-D — `overlap-excess-ratio` 0.0811 (threshold 0.02) at `intro04 @1100`

Clone boxes overlap 8.11 % more of the viewport than the source's do. Visible in
`page-intro04-php_1100_BLOCKER_clone.png` as two lines of the clinic-location address printed over
one another — the frozen desktop-tree column widths are narrower than the text they must hold at
1100. Downstream of BLOCKER-B.

### MAJOR-E — `column-container-mode-delta` 4 (threshold 2) at both 1100 pairs

Quoted in BLOCKER-B. Note it **no longer fires at 1024**, where it fired on all four 1024/1100 pairs
in the previous run. That is a direct, measured win for the 1025 tree switch.
## 5b. The Korean text census under the script-aware boundary rule

The corpus is genuinely Korean-dominant, so this is a real test of the change rather than a
theoretical one.

| Route | Width | srcVisibleChars | missingChars | strict ratio | absentChars | **boundaryOnlyChars** | **scriptRelaxedChars / strings** | truncatedKeys |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 390 | 1370 | 453 | 0.3307 | 453 | **0** | **6 / 1** | 0 |
| `/` | 700 | 1409 | 492 | 0.3492 | 492 | **0** | **6 / 1** | 0 |
| `/` | 1024 | 1402 | 482 | 0.3438 | 482 | **0** | **6 / 1** | 0 |
| `/` | 1100 | 1745 | 851 | 0.4877 | 851 | **0** | 0 / 0 | 0 |
| `/` | 1440 | 1282 | 417 | 0.3253 | 417 | **0** | 0 / 0 | 0 |
| `intro04` | 390 | 936 | 21 | 0.0224 | 21 | **0** | 0 / 0 | 0 |
| `intro04` | 700 | 936 | 21 | 0.0224 | 21 | **0** | 0 / 0 | 0 |
| `intro04` | 1024 | 936 | 21 | 0.0224 | 21 | **0** | 0 / 0 | 0 |
| `intro04` | 1100 | 936 | 30 | 0.0321 | 30 | **0** | 0 / 0 | 0 |
| `intro04` | 1440 | 927 | 21 | 0.0227 | 21 | **0** | 0 / 0 | 0 |

Four things, measured:

1. **`boundaryOnlyChars = 0` on all ten pairs.** Not one character was called missing for a
   boundary reason. `missingChars == absentChars` everywhere, so every missing string is genuinely
   absent from the clone's painted text. The strict ratio and the loose ratio are the same number
   here, which is what makes BLOCKER-A unambiguous.
2. **The script-aware rule fired.** `scriptRelaxedChars = 6` over **1 string** on `/` at 390, 700
   and 1024 — one short Korean string that the shipped rule accepts as present and the pre-G2
   English-only rule (`edgeSatisfiedSpacedOnly`, `correspondence.ts:473`) would have reported as
   **missing**. Six characters out of 1,370–1,409 is 0.4 % of the census, and it did not change any
   verdict on this site. But it is a **non-zero, first real firing** of the change on a Korean corpus,
   and it is separately counted rather than silently folded in — which was the whole ask.
3. **The rule's own asymmetry is visible in the counters.** On `/ @1100` and `/ @1440`, where the
   source capture had revealed more text, `scriptRelaxedChars` drops to 0: the relaxation only
   matters where a clone string properly contains a source string with no space at the seam, and that
   configuration happens to occur three times in this corpus, not zero and not everywhere.
4. **The `missing-text-script-relaxed-chars` channel is in the roster** (all 50 channels are listed
   identically in both runs' `channelRoster`), so a reader can find the number without knowing to
   look for it.

**What this lane does NOT establish:** that the script-aware rule changes real verdicts on CJK
sources. It moved 6 characters on a page where 453 were genuinely missing. A corpus where the clone's
text-node segmentation differs from the source's would exercise it properly; this clone reproduces
text nodes 1:1, so the boundary rule is rarely consulted at all.
## 6. Engine defects MEASURED in this run

None of these is site-specific and none of the proposed directions names this host.

### ED-1 — Floor-width eviction can evict the DESKTOP TRUTH WIDTH, and the whole desktop pass for that page is then refused

**Measured.** `reconstruction-manifest.json → layout.viewportPassRefusals = { "desktop:truth-width-not-probed": 2 }`.
Two of thirteen desktop passes ran no inference at all.

**Which two, and why.** The desktop probe's floor set is `[390, 700, 768, 1024, 1100, 1440, 1920]`
and the desktop observation — the truth viewport every geometry rule is anchored to — is **1440**.
`pickGuaranteedFloor()` (`src/observer/probe-widths.ts:174-187`) protects floor widths **by position**,
picking evenly spaced indices 0, 3, 6 ⇒ `guaranteedFloorWidths = [390, 1024, 1920]`. 1440 sits at
index 5 and is evictable. On two pages the authored-breakpoint set was rich enough that eviction
reached it:

| page | route | `floorWidthsEvicted` | probe contains 1440? |
|---|---|---|---|
| p000002 | `/bbs/board.php?bo_table=Event` | `[700, 768, 1100, **1440**]` | **no** |
| p000004 | `/page/intro02.php` | `[700, 768, 1100, **1440**]` | **no** |
| the other 11 | — | `[700]` or `[700, 768]` | yes |

`inferLayout` then refuses the pass at `src/reconstruction/layout-inference.ts:1668`
(`if (truthEntry === undefined) return { ok: false, reason: "truth-width-not-probed" }`).

**Confirmed in the shipped stylesheet, not just the counter.** In the recovered tier of
`public/wr/generated-styles.css` there are **0** selectors matching
`[data-wr-page="p000002"][data-wr-viewport="desktop"]` and **0** matching `p000004` + desktop, against
79–161 for every other page. Those two routes ship a desktop tree with no inline-size recovery at all.

**Blast radius here:** neither page is in my graded scope, so this costs my verdicts nothing. On a site
whose homepage authors enough breakpoints, it would cost the homepage.

**Generic direction:** the truth width is not one floor width among seven, it is the width the whole
tier is anchored to. Guarantee it the way `MIN_GUARANTEED_FLOOR_WIDTHS` guarantees the narrowest and
the widest. Counted honestly today (`viewportPassRefusals`), so this is a correctness gap, not an
honesty gap.

### ED-2 — The MOBILE probe's width ceiling is a frozen constant; it no longer reaches the tree switch it was derived from

**Measured.** `MOBILE_LAYOUT_PROBE_WIDTHS = [390, 480, 700, 768, 914]`
(`src/observer/types.ts:1838`). Its own doc comment at lines 1832-1836 explains the choice:
*"The set stays BELOW the desktop/mobile switch … 914 is the widest sample kept"* — 914 is 915 − 1,
the old `floor((390+1440)/2)` midpoint.

**The switch is no longer 915.** On this site it snapped to **1025** (§4.5). The mobile tree is
therefore the rendered tree over `[0, 1024]`, while the mobile probe samples only `[390, 914]`.
**The band 915–1024 — 110 px, 10.7 % of the mobile tree's rendered range — carries no mobile probe
sample on any page of this run.**

**It is not hypothetical: 1024 is a graded width.** At 1024 the clone renders the mobile tree, and
every mobile inline-size rule applied there was fitted on evidence that stops 110 px short. The
observed mobile probe sets are `[390,480,500,501,700,768,769,914]` on `/` and
`[390,480,499,500,501,700,768,769,914]` on `/page/intro04.php`; neither contains any width above 914.

**Generic direction:** the mobile ceiling should be derived from the same authored-breakpoint evidence
that now derives the tree switch, not frozen at the midpoint the tree switch stopped using. The two
numbers were consistent when both were 915 and silently diverged when only one of them was fixed.

### ED-3 — The parent-content-box counters never reach the manifest, so the C3 change is unmeasurable in production

**Measured.** `contentBoxMeasured`, `contentBoxAssumedConstant`, `contentBoxMeasuredDisagreed`,
`contentBoxMaxDisagreementPx` and `parentPaddingNotConstant` are declared at
`src/reconstruction/layout-inference.ts:482-499` and incremented at `layout-inference.ts:2094-2109`.
`src/reconstruction/generate-app.ts:380-455` copies **every** neighbouring layout counter into the
manifest — including all seven band-edge counters and the whole inline-size funnel — and copies
**none** of these five. `scripts/smoke-layout-safety.ts:3887-3894` asserts them, so they are proven in
a fixture and invisible in a run.

**Consequence, concretely:** the brief asks me to report "the parent content box … MEASURED per width
from sibling geometry". I cannot, from any artifact. The only production-visible trace is the guard
reason `parent-padding-not-constant: 70`, which by construction counts only the cases where the
measurement was **absent** (`layout-inference.ts:2143-2146`).

### ED-4 — `MAX_MATCHED_RULES_PER_ELEMENT = 32` truncates the authored-declaration list on a third of this theme's nodes

**Measured.** `authoredBreakpointTruncatedNodes: 2,807` across the run;
`authoredBreakpoints.truncatedNodeCount` is 179 on `/` desktop against 524 walked elements — **34.2 %**
— and 90 of 292 on `/page/intro04.php` (30.8 %). The cap is `src/observer/types.ts:569`.

The authored-breakpoint histogram that the tree switch and the band snapper both read is built from
those lists, so on this theme it is fitted on a third-truncated input. It is **counted**, which is the
right behaviour and is why I can report it — but 32 matched rules is not a generous budget for a CMS
theme that stacks a framework reset, a theme sheet, a layout sheet and a page sheet on the same node,
and nothing in the artifact says which declarations were lost or whether they were `@media`-scoped.

### ED-5 (grader) — the pixel channels' own limitation text says the thresholds are not calibrated to ink, and this run demonstrates it

Not a new defect — the run publishes it as a limitation itself
(`pixel-thresholds-are-area-normalised-not-ink-normalised`) — but it is load-bearing for reading my
table, so it is recorded here as measured rather than assumed. The floor run's own evidence line:
*"least-inked measured pair: 41.71 % of 4,480,000 compared pixels are non-background, so the 1 % area
band equals 2 % of that page's ink"*.
## 7. What I could NOT measure, and why

Blunt list. Nothing in this report claims any of these as measured.

1. **The parent content box, measured per width.** ED-3: the five counters exist in the engine, are
   asserted by a smoke test, and are never written to the manifest. I have one indirect number
   (`parent-padding-not-constant: 70`) and it counts only the failures.
2. **Table-formatting properties.** §4.3: all five are captured on all 1,237 style blocks and every
   value is the CSS initial value, because this site has **no `<table>` element** on either graded
   route or in the board-page capture. No evidence in either direction.
3. **Band-edge snapping, characterised.** §4.6: 8 edges is enough to prove the machinery runs and
   closes its partition; it is not a sample from which to judge the change. Another lane must carry it.
4. **Whether `--prepare-scroll` would remove the missing-text BLOCKER on `/`.** I did not run it,
   deliberately, to keep this run comparable with the previous one on the same host. The relevant
   measurement I *do* have: `paintSuppression.scrollRevealAvailable: false`,
   `suppressedElements 97 / 450 sized (21.6 %)`, `suppressedByOpacity 32`, `suppressedByAncestor 88`,
   `suppressedBelowFold 82` on the homepage desktop observation. Whether re-observing with the scroll
   pass would move the 32-35 % missing-text number is untested.
5. **Why `no-branch-matched` is 50.0 %.** I measured the partition (1,490 of 2,981) and that the
   partition closes. I did not trace which predicate each of those 1,490 nodes fell past — the field
   records the outcome, not the branch condition that declined it. This is the highest-value follow-up
   from this lane and it needs an engine-side change (an outcome sub-reason), not more site runs.
6. **How much of the pixel residual is the missing web fonts.** Measured: the generated stylesheet
   contains **0** `@font-face` and no font files ship, while the source loads 948 `@font-face` URLs
   across three Google-Fonts families plus Pretendard. The manifest names this
   (`font-source-binding-unverified`, `source-head-not-reconstructed`). I did not re-render with the
   fonts present to attribute the residual quantitatively.
7. **The other 17 routes.** The clone generates 19; I graded 2 × 5 widths as briefed. The e2e's own
   reconstruction QA covered 26 page/viewport pairs and reported `style-mismatch 112 ·
   environment-unstable 26 · source-style-drift 26 · visual-coverage-truncated 5 ·
   unknown-behavior-gap 1`, which I did not investigate.
8. **`--auto-fix`.** Not run. The final reconstruction is `kind: "baseline"` — *"no correction was
   eligible"*.
9. **`unresolvedInternalLinks: 756`** (against 582 rewritten) and **`unresolvedIdrefTokens: 80`**.
   Recorded from the manifest, not investigated.
10. **Whether the two pages that lost their desktop pass (ED-1) render worse for it.** Neither is in
    my graded scope and I did not grade them.
## 8. Against the previous run on this host — what actually moved

| | previous | **this run** | verdict |
|---|---|---|---|
| tree switch | 915, `observed-endpoint-midpoint` | **1025, `authored-breakpoint`** | fixed |
| `footer-clipped` BLOCKERs | 4 pairs (1024 and 1100, both routes) | **2 pairs (1100 only)** | halved; residual is frozen width, not the switch |
| `column-container-mode-delta` MAJOR | 4 pairs (1024 and 1100) | **2 pairs (1100 only)** | halved |
| `@media` in `generated-styles.css` | **0** | **8** | band snapper now emits |
| mobile-subtree inferred rules | **0** | **813** | the change's headline |
| total recovered rules | 595 | **1,367** | +130 % |
| `fallbackMissed` (redirected sheet) | 1 on 28/28 observations | **0 on 26/26** | fixed, byte-verified |
| `breakpointsDroppedByCap` | 1 on both graded pages | **0 everywhere** | fixed, by floor-width eviction |
| `intro04` clone `contentMaxRight` | 2 distinct values | **4 distinct values** | step function gone horizontally |
| `missing-text-ratio` on `/` | **0.0000** at 1440 | **0.3253** at 1440 | grader defect fixed; real defect exposed |
| clone verdicts | 5 B / 2 M / 3 m / 0 PASS | **6 B / 4 M / 0 m / 0 PASS** | *worse on paper* |
| floor | 0 B / 0 M / 6 m / 4 PASS | 0 B / **1 M** / 6 m / 3 PASS | noisier machine |

**The headline number got worse and the clone got better.** Four of the previous five BLOCKERs were
the tree switch and they are gone. Their replacement is a single new BLOCKER channel that fires on
five pairs because it stopped scoring blank text as painted. A reader who compares only
`blockerPairs` between the two runs will draw the wrong conclusion; the composition is the finding.

---

## 9. Wall clock and artifact size

**Lane wall clock, first command to last grade: 21 m 34 s** (23:12:00 → 23:33:34 UTC), on a machine
running seven browser-driving lanes at load average 7–14. The three long stages are strictly
sequential; the independent `curl` probes ran alongside the e2e and cost no extra wall time.

| Stage | Wall |
|---|---|
| `pnpm e2e:reconstruct` (13 stages) | **13 m 17.6 s** |
| `pnpm qa:responsive --self-check` (10 pairs) | **3 m 48.2 s** (23:24:44.988 → 23:28:33.145) |
| `pnpm qa:responsive --self-check-run …` (10 pairs) | **3 m 38.8 s** (23:29:55.193 → 23:33:33.971) |

Inside the e2e, three stages dominate: **reconstruction QA 368.0 s**, **observation 276.4 s** and
**reconstruction 102.6 s**. Observation went 176 s → 276 s and reconstruction 11.6 s → 102.6 s
against the previous run on this host; the observation rise is machine contention plus 16 probe
widths, the reconstruction rise is the R3 in-band verification (24 truth-check pages rendered,
24 rounds, 2 extra band widths).

**Disk.** This run wrote **255.5 MB** by the manifest's own accounting
(`observation 128.6 · sitespec 72.1 · reconstruction 5.8 · reconstruction-qa 48.5 ·
interaction-exploration 0.4`), plus **113 MB** for my two responsive-QA runs (57 + 56 MB). The host
directory `data/seoultone.kr` now holds **1.0 GB** across this run and the two that preceded it.
Lane scratch `tmp/wr286/w7-seoultone` is 5.2 MB; the review pack is **28 MB** (20 full-page PNGs,
no pair dropped).

The generated app is 36 MB, of which `public/wr/generated-styles.css` is **4,375,667 B** — essentially
unchanged from the previous run's 4,367,986 B, because the 1,367 recovered rules add only 132,801 B
of the total.

**Budget note for the orchestrator.** `--no-diff-images` would cut ~40 % off each responsive-QA run.
The self-check is not optional overhead: without it, "6 BLOCKERs" is unfalsifiable, and with it the
floor's own MAJOR at `/ @700` is visible as machine noise rather than mistaken for a clone defect.

---

## 10. Engine integrity

No file under `src/` or `scripts/` was written by this lane.

```
sorted hash of every *.ts under src/ and scripts/, after the last command:
  76adca3051960183aa5458a4010f1adc996cd8b0
files under src/ or scripts/ modified since the run began (08:12 local, 2026-09-03): 0
```

(My first baseline used an unsorted `find … -exec … \;` pipeline whose output order is not stable, so
its digest is not comparable; the `-newermt` check above is the authoritative one and it is empty.)

Everything this lane wrote is under `data/seoultone.kr/**` (new run directories only),
`tmp/wr286/w7-seoultone/**`, `docs/result/28.6/lanes/w7-seoultone.md`, and
`docs/result/28.6/review/seoultone/**`. No git operation of any kind was run.

---

## 11. Files a reader may want

- **Report:** `/Users/woops/projects/web-recon/docs/result/28.6/lanes/w7-seoultone.md`
- **Review pack (20 PNGs + README):** `/Users/woops/projects/web-recon/docs/result/28.6/review/seoultone/`
- **Clone grade:** `/Users/woops/projects/web-recon/data/seoultone.kr/responsive-qa/2026-09-02T23-29-55-193Z/`
- **Self-check floor:** `/Users/woops/projects/web-recon/data/seoultone.kr/responsive-qa/2026-09-02T23-24-44-987Z/`
- **Reconstruction manifest:** `/Users/woops/projects/web-recon/data/seoultone.kr/reconstructions/2026-09-02T23-17-40-791Z/reconstruction-manifest.json`
- **Generated stylesheet:** `…/2026-09-02T23-17-40-791Z/app/public/wr/generated-styles.css` (recovered tier starts at line 3934)
- **Lane scratch** (independently fetched stylesheets, extraction scripts, all three run logs):
  `/Users/woops/projects/web-recon/tmp/wr286/w7-seoultone/`
