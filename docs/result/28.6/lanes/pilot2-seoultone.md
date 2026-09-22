# Task 28.6 — PILOT 2 / SITE LANE: seoultone.kr

**Host:** `http://seoultone.kr` (the pool's only http-only origin)
**Routes in scope:** `/` and `/page/intro04.php`
**Status:** COMPLETE — pipeline ran end to end with no stage crash; the responsive grade is BLOCKER-dominated.
**Lane scratch:** `/Users/woops/projects/web-recon/tmp/wr286/pilot-seoultone/`
**Engine untouched:** no file under `src/` or `scripts/` was read-modified. Every number below comes from
artifacts on disk or from read-only scripts in the lane scratch directory.

> Content note. This is a Korean dermatology clinic — a regulated advertising category. The
> reconstruction is a local fidelity test that was never deployed, and every screenshot is of an
> already-public page. No screenshots are redistributed here, and no practitioner name, licence
> number or business registration number is reproduced. Where a surface carries such data it is
> described by its role ("the practitioner-credential block"), never by its content.

---

## 0. Headline

Six engine changes were under test. Four of them fired on this site and are measurably correct.
Two never got the chance, and the reason they never got the chance is itself the biggest finding:

- **Cross-origin CSS recovery works and is verifiable.** 5 of 13 sheets CSSOM-blocked, 4 recovered,
  650,631 bytes bridged, and **607 of 607 recovered declarations match the bytes the servers actually
  serve** (sha-verified against my own fetches). Zero disagreements.
- **One blocked sheet is missed on every single page and viewport (28/28).** Cause is precise and
  generic: a stylesheet delivered via an HTTP **redirect** is captured under its post-redirect URL, but
  looked up by the pre-redirect `<link href>` the CSSOM reports. See BLOCKER-2.
- **Probe-width derivation from authored breakpoints works** — the site's 7 authored breakpoints are
  read (0 unparsed) and bracketed. The desktop probe then **hits its 16-width cap and drops a real
  authored breakpoint** on both measured pages (honestly counted, but dropped).
- **Band-edge snapping never ran.** `bandEdgesConsidered: 0`. The engine emitted **zero `@media`
  rules** into a 4.37 MB stylesheet.
- The clone's entire responsive model is **two frozen documents** switched at **915 px**, a number
  produced by `Math.floor((390+1440)/2)` — the exact midpoint guess Wave 3 was meant to replace.
  915 matches **none** of the site's 7 authored breakpoints. This is the direct cause of 4 of the
  5 BLOCKERs.
- **The scheme was never upgraded.** `https://seoultone.kr` appears **0 times** in 289 artifact files.
- **The Korean text census behaved correctly** — `boundaryOnlyChars: 0` on all 10 pairs. But the
  hangul hazard in the boundary matcher is **real and I reproduced it in isolation**; it simply did
  not fire because this clone reproduces text nodes 1:1. Reported loudly in §7.
- A **separate grader defect** did fire: the missing-text census reports **0.00 %** on pairs where
  whole content blocks are painted `opacity: 0` in the clone and blank to a reader. See BLOCKER-5.

---

## 1. What I ran, in order

| # | Command | Wall | Output |
|---|---|---|---|
| 1 | `curl` × 13 — homepage (desktop UA / mobile UA / repeat), `/page/intro04.php`, all 11 `<link>` stylesheets, kakaocdn roughmap CSS | ~40 s | `tmp/wr286/pilot-seoultone/*.html`, `truth-css/*.css` |
| 2 | `npx tsx tmp/wr286/pilot-seoultone/sheet-audit.ts http://seoultone.kr/ desktop` | ~25 s | `sheet-audit-desktop.json` |
| 3 | `npx tsx tmp/wr286/pilot-seoultone/sheet-audit.ts http://seoultone.kr/ mobile` | ~25 s | `sheet-audit-mobile.json` |
| 4 | `pnpm e2e:reconstruct http://seoultone.kr/ --max-urls 20 --concurrency 2` | **7 m 49.6 s** | run id `2026-09-02T20-18-00-919Z` |
| 5 | `npx tsx tmp/wr286/pilot-seoultone/hangul-boundary-probe.ts` (imports the shipped `missingText()`) | ~4 s | stdout, §7 |
| 6 | `python3 tmp/wr286/pilot-seoultone/spotcheck*.py <dom.json>` | ~10 s | §5.2 |
| 7 | `pnpm qa:responsive .../reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes "/,/page/intro04.php"` | **2 m 07.6 s** | run id `2026-09-02T20-36-13-342Z` |
| 8 | same command **`--self-check --quiet`** (instrument floor) | **2 m 17.1 s** | run id `2026-09-02T20-42-28-342Z` |

The end-to-end command was used for the whole pipeline. **I never dropped to individual stages** —
`--max-urls 20` was enough for both in-scope routes to survive discovery → verification → selection
as their own families (`f000001` and `f000007`), so no hand-built `selected-pages.json` was needed.
Steps 2, 3, 5, 6 are read-only instruments of mine; they do not feed the pipeline.

### Run ids / directories produced

| Stage | Path |
|---|---|
| e2e manifest | `data/seoultone.kr/e2e-runs/2026-09-02T20-18-00-919Z/e2e-manifest.json` |
| discovery / verify / select | `data/seoultone.kr/2026-09-02T20-18-06-299Z/` |
| observation (14 pages × 2 viewports) | `data/seoultone.kr/site-observations/2026-09-02T20-18-18-932Z/` |
| interaction exploration | `data/seoultone.kr/interaction-explorations/` (4 candidates, 2 changed) |
| SiteSpec | `data/seoultone.kr/site-specs/` |
| reconstruction | `data/seoultone.kr/reconstructions/2026-09-02T20-21-29-718Z/` |
| reconstruction QA | `data/seoultone.kr/reconstruction-qa/2026-09-02T20-21-43-765Z/` |
| responsive QA (clone) | `data/seoultone.kr/responsive-qa/2026-09-02T20-36-13-342Z/` |
| responsive QA (self-check floor) | `data/seoultone.kr/responsive-qa/2026-09-02T20-42-28-342Z/` |

Pipeline stage timings (ms), from the e2e manifest:
`discovery 5,381 · verification 12,622 · selection 6 · observation 176,002 · interaction-detection 424 ·
interaction-exploration 12,216 · interaction-modeling 11 · sitespec 1,671 · reconstruction 11,625 ·
build 2,507 · qa 246,754 · family-escalation 0 · final-validation 23`.
Final status: **`complete-with-known-limitations`**. 20 discovered → 20 verified → 12 families →
14 pages observed (0 failures) → 20 routes generated, 20 rendered.

---

## 2. The responsive grade

`pnpm qa:responsive` at 390/700/1024/1100/1440 on both routes. Verdicts, the channel that decided
each, and — in the last two columns — the **self-check floor** for the identical pair, which is the
same source measured against a second capture of itself.

| Route | Width | Verdict | Deciding channel (value / threshold) | Floor verdict | Floor px-residual |
|---|---:|---|---|---|---:|
| `/` | 390 | **BLOCKER** | `overlap-excess-ratio` 0.1457 / 0.10 | MINOR | 0.00 % |
| `/` | 700 | **MAJOR** | `position-delta-p90-px` 381 / 48 | MINOR | 2.10 % |
| `/` | 1024 | **BLOCKER** | `footer-clipped` 1 / 1 (clone max right **1296** > 1024) | MINOR | 2.24 % |
| `/` | 1100 | **BLOCKER** | `footer-clipped` 1 / 1 (clone max right **1296** > 1100) | **PASS** | 0.00 % |
| `/` | 1440 | MINOR | `pixel-residual-difference-ratio` 0.1877 / 0.01 | MINOR | 0.00 % |
| `/page/intro04.php` | 390 | MINOR | `pixel-residual-difference-ratio` 0.4763 / 0.01 | MINOR | 0.00 % |
| `/page/intro04.php` | 700 | **MAJOR** | `position-delta-p90-px` 439 / 48 | **PASS** | 0.00 % |
| `/page/intro04.php` | 1024 | **BLOCKER** | `footer-clipped` 1 / 1 (clone max right **1296** > 1024) | **PASS** | 0.00 % |
| `/page/intro04.php` | 1100 | **BLOCKER** | `footer-clipped` 1 / 1 (clone max right **1296** > 1100) | MINOR | 2.12 % |
| `/page/intro04.php` | 1440 | MINOR | `pixel-residual-difference-ratio` 0.2675 / 0.01 | **PASS** | 0.00 % |

**Clone run: 5 BLOCKER, 2 MAJOR, 3 MINOR, 0 PASS.**
**Floor run: 0 BLOCKER, 0 MAJOR, 6 MINOR, 4 PASS**, worst pixel residual 2.24 %.

The floor is the important half of this table. PASS **is** reachable against this source — 4 of 10
pairs reached it with the source graded against itself — so **not one BLOCKER or MAJOR in the clone
run can be attributed to instrument noise or to source instability**. The clone's pixel residuals
(18.77 %–65.78 %) are 8×–30× the floor's worst (2.24 %).

### Every channel that fired, per pair

```
/ @390    BLOCKER overlap-excess-ratio 0.1457/0.10 · MAJOR position-delta-p90-px 88/48 · MINOR pixel-residual 0.3940
/ @700    MAJOR position-delta-p90-px 381/48 · MINOR pixel-residual 0.5348 · MINOR scroll-height-ratio-low 0.88/0.90
/ @1024   BLOCKER footer-clipped · BLOCKER overlap-excess-ratio 0.3533 · MAJOR column-container-mode-delta 4/2
          · MAJOR position-delta-p90-px 699 · MINOR missing-text-ratio 0.0049 · MINOR pixel-residual 0.6578
          · MINOR scroll-height-ratio-low 0.7957
/ @1100   BLOCKER footer-clipped · MAJOR column-container-mode-delta 4/2 · MAJOR position-delta-p90-px 894
          · MINOR missing-text-ratio 0.0049 · MINOR pixel-residual 0.6078
/ @1440   MINOR pixel-residual 0.1877 · MINOR position-delta-p90-px 10/8
intro04 @390   MINOR pixel-residual 0.4763
intro04 @700   MAJOR position-delta-p90-px 439 · MAJOR right-gutter-excess-ratio 0.1671/0.15 · MINOR pixel-residual 0.5489
intro04 @1024  BLOCKER footer-clipped · BLOCKER overlap-excess-ratio 0.3258 · MAJOR column-container-mode-delta 4/2
               · MAJOR pixel-visible-difference-ratio 0.507/0.50 · MAJOR position-delta-p90-px 823
               · MINOR missing-text-ratio 0.0096 · MINOR pixel-residual 0.6310 · MINOR scroll-height-ratio-low 0.8992
intro04 @1100  BLOCKER footer-clipped · BLOCKER overlap-excess-ratio 0.1297 · MAJOR column-container-mode-delta 4/2
               · MAJOR position-delta-p90-px 907 · MINOR missing-text-ratio 0.0096 · MINOR pixel-residual 0.5503
intro04 @1440  MINOR pixel-residual 0.2675 · MINOR position-delta-p90-px 10/8
```

---

## 3. BLOCKERS

### BLOCKER-1 — The clone has two layouts. The source has a continuum. The switch is a midpoint guess.

**What the engine emitted.** The generated app's entire responsive behaviour is two rules in
`app/globals.css:26-36`:

```css
@media (max-width: 914.98px) { [data-wr-viewport="desktop"] { display: none } }
@media (min-width: 915px)    { [data-wr-viewport="mobile"]  { display: none } }
```

`src/generated/generated-config.ts` → `BREAKPOINT = 915`, `BREAKPOINT_PROVENANCE = "inferred"`.
The 4,367,986-byte `public/wr/generated-styles.css` contains **`@media` count: 0**. Of its 1,281
style blocks, **1,177 (91.9 %) carry a literal `width:<n>px`** — 1,144 of them a non-zero one —
against **86 (6.7 %) with `width:auto`** and **14 (1.1 %) with `width:<n>%`**. (Counting raw
declarations across the whole file, including pseudo-element and document-level rules, gives 3,708
`width:<n>px` against 1,611 `width:auto` and 79 `width:<n>%`; the per-block figures above are the
ones that describe the element style table.)

**Where the number comes from.** `src/reconstruction/responsive-plan.ts:76-80`:

```ts
return {
  value: Math.floor((mobile.width + desktop.width) / 2),
  provenance: "inferred",
  method: "observed-endpoint-midpoint",
```

`(390 + 1440) / 2 = 915`. The file's own header (`responsive-plan.ts:13-15`) states the rule:
*"the midpoint of the two observed widths, rounded down, and it is the same rule for every site —
no per-site table, no 768, no 1024."*

**Why that is wrong here, measured.** The site authors **7** viewport breakpoints. The observation
read all of them with zero parse failures (`stylesheetCoverage.authoredMediaConditions`, homepage
desktop):

| condition | matched decls |
|---|---:|
| `(max-width: 768px)` | 3 |
| `(max-width: 1024px)` | 2 |
| `(max-width: 500px)` | 2 |
| `(min-width: 1921px)` | 2 |
| `(max-width: 1200px)` | 1 |
| `(max-width: 1280px)` | 1 |
| `(max-width: 1600px)` | 1 |

**915 is not one of them, and it sits inside the source's narrow-layout band `≤1024`.** So between
915 and 1024 the clone shows its *desktop* tree while the source is still in its *narrow* layout.
The desktop tree's containers are literally `width:1296px` (style classes `wr-st000010`,
`wr-st000014`, `wr-st000049`, `wr-st000062`, `wr-st000063`, … — 53 occurrences of `1296px`), so at a
1024-px viewport the footer's right edge lands at 1296. That is `footer-clipped`, verbatim:
*"the footer extends past the viewport's right edge (clone max right 1296 > 1024) while the source's does not."*

**The step-function signature.** `contentMaxRight` (px), from `responsive-qa.json` → `pairs[].source` / `pairs[].clone`:

| Route | 390 | 700 | 1024 | 1100 | 1440 |
|---|---:|---:|---:|---:|---:|
| `/` source | 5605 | 5764 | 5918 | 5949 | 6165 |
| `/` clone | 5693 | **5693** | 5957 | 5995 | 6165 |
| `intro04` source | 583 | 1022 | 1495 | 1606 | 1607 |
| `intro04` clone | **583** | **583** | **1607** | **1607** | **1607** |

The clone's `intro04` value takes exactly **two** values across the whole sweep — 583 and 1607 — while
the source's moves continuously through 583 → 1022 → 1495 → 1606 → 1607. The source is **fluid**
(a max-width container that shrinks with the viewport), not breakpoint-stepped. Snapping a band edge
to 1024 would move the step; it would not make the clone fluid. What this site needs is inline-size
recovery on the containers that carry the 1296 px, which is exactly the Wave-4a change — see
BLOCKER-3 for why it did not reach them.

**Corroborating channel.** `columns.mismatches`, `/` @1024: `div/header/div/nav/ul` —
`sourceModalPerRow: 1, sourceRowCount: 4, sourceContainerWidth: 410` vs
`cloneModalPerRow: 4, cloneRowCount: 1, cloneContainerWidth: 713`. The source's header nav has
already collapsed to a stacked narrow menu at 1024; the clone is still showing the horizontal
desktop bar. Same mismatch at 1100 on both routes. And `intro04` @1024 `div/div/section/ul`:
`sourceModalPerRow: 2` vs `cloneModalPerRow: 4` in an identically-1024-wide container — a
`grid-template-columns` change the source authors under `@media (max-width: 1024px)` and the clone,
having no `@media` at all, cannot express.

---

### BLOCKER-2 — A redirected stylesheet is captured under one URL and looked up under another. Missed on 28/28 observations.

**Measured, every page and every viewport of the run — 28 of 28 (14 pages x 2 contexts):** `fallbackMissed: 1`,
`sheetsBodyUnavailable: 1`. Never zero, never two. That is not a flake; it is one deterministic sheet.

**Which sheet.** From my independent audit (`sheet-audit-desktop.json`, `sheet-audit-mobile.json`),
the homepage's 13 sheets and the network responses behind them:

```
[9] readable=false  <link href="https://unpkg.com/swiper/swiper-bundle.min.css?ver=03015-1">
...
302  bodyOk=FALSE  https://unpkg.com/swiper/swiper-bundle.min.css?ver=03015-1
200  bodyOk=true   https://unpkg.com/swiper@14.2.0/swiper-bundle.min.css?ver=03015-1   14612 B
```

unpkg 302-redirects the unversioned URL to the pinned one. Playwright models that as two
`Response` objects.

**The mechanism, at file:line.** `src/observer/observe-page.ts:272-299` keys the captured body by
exactly two strings:

```ts
responseUrl = response.url();
requestUrl  = response.request().url();
...
if (!bodies.has(responseUrl)) bodies.set(responseUrl, text);
if (!bodies.has(requestUrl))  bodies.set(requestUrl, text);
```

For the 302, `response.text()` throws → `stats.bodyUnavailable++` (line 286) and **nothing is
stored**. For the 200, both URLs are the *post-redirect* URL. Neither call ever walks
`response.request().redirectedFrom()`, so the *pre-redirect* URL is never a key.

`src/observer/observe-page.ts:491-499` then looks the body up by the href the CSSOM reports, which
for a `<link>` is the pre-redirect URL:

```ts
for (const href of [...blockedHrefs].sort()) {
  const text = bodies.get(href);
```

Miss. `fallbackMissed++`.

**Byte-exact confirmation.** `bytesBridged = 650,631` on the homepage. The four recovered sheets, as
I fetched them myself:

| sheet | bytes |
|---|---:|
| `fonts.googleapis.com` Nanum Myeongjo | 174,955 |
| `fonts.googleapis.com` IBM Plex Sans KR + Montserrat | 425,624 |
| `t1.kakaocdn.net` roughmapLander.css | 35,440 |
| `cdn.jsdelivr.net/npm/swiper` (no redirect) | 14,612 |
| **total** | **650,631** |

Identical to `bytesBridged` to the byte. The fifth blocked sheet — the redirected unpkg swiper — is
the missing 14,612.

**Blast radius on THIS site is zero, and that is luck.** The redirected sheet is byte-identical
(sha256 prefix `d3bd7ac4a5cb1eb7`) to the jsdelivr swiper that *was* recovered, so no declaration was
actually lost here. On any site whose redirected sheet is unique, this loses the whole sheet.
Redirected CDN stylesheets are ordinary (`unpkg.com/<pkg>/...`, `cdn.example/latest/...`).

**Generic, not site-specific.** Nothing about the fix mentions unpkg or swiper: key the captured body
under every URL in the redirect chain.

---

### BLOCKER-3 — 93 % of the clone's boxes carry a frozen pixel width; the inline-size recovery reached 575 of them.

`reconstruction-manifest.json → layout`:

```
recoveredRules 595 · candidateRules 595 · acceptedRules 595
rejectedByGuard 20 · rejectedByTruthCheck 0 · rejectedUnverifiable 0 · acceptedUnchecked 0
widthModeStretch 562 · widthModeFillPercentage 13 · widthModeRefusals 6
widthModeRefusalsByReason { flex-item-main-axis: 5, out-of-flow-auto-margin: 1 }
guardRefusalsByReason    { fixed-position: 14, flex-item-basis-governed: 6 }
truthCheckStatus "verified" · truthCheckable 595 · truthCheckRounds 14 · truthCheckConverged true
bandSampleMismatches 0
```

The Wave-4a machinery behaves exactly as specified: it refuses when undecidable, it counts the
refusals with reasons, and every accepted rule survived truth-width verification with **zero**
exemptions and zero rejections. That is a clean result for the change itself.

The problem is coverage, not correctness. 595 rules were recovered over 4,566 probed nodes across 14
pages, against a style table of 1,281 blocks of which **1,177 carry a literal `width:<n>px`**. The five
`width:1296px` containers that produce `footer-clipped` are **not** among the 595. The recovery is a
narrow overlay on top of a stylesheet that is still a frozen 1440-px snapshot.

I did not determine *why* those specific containers were not candidates — see §8.

---

### BLOCKER-4 — `overlap-excess-ratio` fires at 390 on the homepage, where the clone is on its own frozen tree.

`/` @390: clone `overlapAreaRatio` 2.906 vs source 2.7603 → excess **0.1457** against a 0.10
threshold; `position-delta-p90-px` 88 px against 48. The self-check floor for this pair is
`position-delta-p90-px` **12 px** and **0.00 %** pixel residual, so 88 px is clone-side.

This is the mobile tree rendered at the width it was observed at, so a frozen-pixel explanation does
not cover it. `intro04` @390 does *not* fire it (MINOR only). Undiagnosed beyond the numbers — see §8.

---

### BLOCKER-5 (grader defect) — the missing-text census counts `opacity:0` text as painted, so the primary BLOCKER channel reads 0.00 % on blank content.

**What the clone does.** The source loads ScrollReveal (`<script src="https://unpkg.com/scrollreveal">`),
which holds its targets at `opacity: 0` until they scroll into view. The observation captured
computed styles at one instant, and the generated stylesheet bakes that instant permanently:
**124 of the 1,281 style blocks (9.7 %) carry `opacity:0`**; the file has 2,644 `opacity:0`
declarations and **0** `visibility:hidden`.

**What a reader sees.** In the `/ @1440` composite — the width where the clone's document height
matches the source's exactly (4892 = 4892) — several whole blocks are blank on the clone side,
including the practitioner-credential block, a section heading + body pair, and a contact column.

**What the grader says about that pair.** `missing-text-ratio: 0.0000`. `missingChars: 0`.
`absentChars: 0`. The only channel that sees it at all is the pixel residual —
`residualAboveJndRatio 0.187664`, of which `residualEdgeFraction` is **0.1729**, i.e. **83 % of the
residual sits on flat pixels, not on glyph edges**: whole blocks blank, not text re-shaped.

**The defect, at file:line.** `src/responsive-qa/probe.ts` runs two visibility tests that disagree.
The box census, line 111-116:

```ts
const visible =
  cs.display !== "none" &&
  cs.visibility !== "hidden" &&
  Number(cs.opacity) !== 0 &&      // <- opacity honoured
  rect.width > 0 && rect.height > 0;
```

The **text** census's `isDisplayed()`, lines 122-142:

```ts
if (cs.display === "none" || cs.visibility === "hidden") { answer = false; break; }
```

No opacity test. So a text node inside an `opacity: 0` subtree is counted as visible text on both
sides, and a clone that paints it invisibly scores identically to one that paints it. This is the
false-PASS direction on the channel the rubric describes as *"the primary BLOCKER signal"*.

Generic: nothing about it is Korean or gnuboard-specific. Any source using a scroll-reveal library —
AOS, ScrollReveal, WOW.js, framer-motion's `initial={{opacity:0}}` — lands here.

---

## 4. MAJORs

**MAJOR-1 — `position-delta-p90-px` 381–907 px at 700/1024/1100.** Downstream of BLOCKER-1. At 700 the
clone is on the mobile tree frozen at 390; at 1024/1100 on the desktop tree frozen at 1440. Floor for
the same pairs: 0–26 px.

**MAJOR-2 — `column-container-mode-delta` 4 (threshold 2) on all four 1024/1100 pairs.** Downstream of
the zero-`@media` stylesheet; evidence quoted in BLOCKER-1.

**MAJOR-3 — the desktop probe's 16-width cap drops a real authored breakpoint.** `layout-probe.json →
widthProvenance`, per page:

| page | context | derived widths | `capHit` | `breakpointsAdopted` | `breakpointsDroppedByCap` | refused |
|---|---|---|---|---:|---:|---|
| `/` (p000001) | desktop | 15: 390,500,501,700,768,769,1024,1025,1100,1200,1201,1280,1281,1440,1920 | **true** | 5 | **1** | `{1921 min, out-of-range}`, `{1600 max, cap}` |
| `/` | mobile | 8: 390,480,500,501,700,768,769,914 | false | 2 | 0 | 5 × out-of-range |
| `intro04` (p000007) | desktop | 16: 390,499,500,501,700,768,769,1024,1025,1100,1280,1281,1440,1600,1601,1920 | **true** | 6 | **1** | `{1921 min, out-of-range}`, `{1200 max, cap}` |
| `intro04` | mobile | 9: 390,480,499,500,501,700,768,769,914 | false | 3 | 0 | 5 × out-of-range |

`conditionsUnparsed: 0`, `conditionsDroppedByCollector: 0`, `degradedToFloor: false` on all four.
The derivation is working. But 7 floor widths + 2 widths per breakpoint × 7 breakpoints = 21 > the
cap of 16, so a breakpoint **inside** the 390–1920 envelope (1600 on `/`, 1200 on `intro04`) is
never sampled. It is counted (`breakpointsDroppedByCap`, with the reason `"cap"`), so the loss is
honest — but a site with more than ~4 breakpoints will always lose some, and 7 is not an unusual
number for a CMS theme.

**MAJOR-4 — `right-gutter-excess-ratio` 0.1671 (thr 0.15), `intro04` @700**, and
**`pixel-visible-difference-ratio` 0.507 (thr 0.50), `intro04` @1024.** Both downstream of BLOCKER-1.

---

## 5. Engine-change measurements

### 5.1 Cross-origin CSS recovery — coverage, all 28 page × viewport observations (14 pages × 2 contexts)

| page | route | tot | readable | blocked | recovered | **missed** | offered | bodyUnavail | bytesCaptured | **bytesBridged** | rulesIndexed | elemsWithAuthored |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| p000001 | `/` | 13 | 8 | **5** | **4** | **1** | 4 | 1 | 776,787 | **650,631** | 804 | 524 / 517 |
| p000007 | `/page/intro04.php` | 12 | 8 | **4** | **3** | **1** | 3 | 1 | 823,598 | **636,019** | 1,163 | 292 / 280 |
| p000002 | `/bbs/board.php?bo_table=Event` | 12 | 9 | 3 | 2 | **1** | 2 | 1 | 816,012 | 600,579 | 1,217 | 221 |
| p000003–p000014 (11 pages) | `/page/*.php` | 11–12 | 8–9 | 3 | 2 | **1** | 2 | 1 | 788,158 | 600,579 | 977–998 | 239–497 |

Desktop and mobile values are identical on every page (the two contexts differ only in
`elementsWithAuthoredRules`, and only on p000001 and p000007). `sheetsSkippedBySizeCap: 0`,
`importsExpanded: 0`, `importsUnresolved: 0`, `ruleIndexCapHit: false`,
`authoredMediaConditionsDropped: 0`, `authoredMediaConditionsCapHit: false` — everywhere.

**Independent ground truth (`sheet-audit-desktop.json`, homepage, 13 sheets):**

| # | sheet | blocked? | why |
|---|---|---|---|
| 0 | `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/…` | readable (1 rule) | `<link crossorigin>` + jsdelivr `ACAO` ⇒ CSSOM-readable |
| 1 | `fonts.googleapis.com/css2?family=Nanum+Myeongjo…` | **blocked** | recovered, 174,955 B |
| 2–3, 5–8 | six same-origin `http://seoultone.kr/…` sheets | readable (223/713/53/103/76/237 rules) | same origin |
| 4 | `fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR…&Montserrat…` | **blocked** | recovered, 425,624 B |
| 9 | `unpkg.com/swiper/swiper-bundle.min.css?ver=…` | **blocked** | **MISSED** — 302 → `swiper@14.2.0`, BLOCKER-2 |
| 10 | `t1.kakaocdn.net/…/roughmapLander.css` (JS-injected) | **blocked** | recovered, 35,440 B |
| 11 | inline `<style>` | readable (12 rules) | — |
| 12 | `cdn.jsdelivr.net/npm/swiper/swiper-bundle.min.css` | **blocked** | recovered, 14,612 B |

Two of the five blocked sheets are **injected at runtime by scripts** (kakaocdn roughmap via
`roughmapLoader.js`), so they are invisible in the served HTML — recovery reaches them anyway.

### 5.2 Spot-check: do recovered declarations match what the server serves?

I fetched `cdn.jsdelivr.net/npm/swiper/swiper-bundle.min.css` and
`t1.kakaocdn.net/…/roughmapLander.css` myself. Both are **byte-identical to what the browser
received** (sha256 prefixes `d3bd7ac4a5cb1eb7` and `926b599d55dccabd`, matching the audit). I then
parsed both served files and compared every `origin: "fetched"` record in
`site-observations/…/p000001/viewports/desktop/dom.json`.

| | count |
|---|---:|
| `origin: "fetched"` declaration records on the page | **607** |
| matched to a served rule (direct property) | 342 |
| matched via CSS shorthand expansion (`margin:0 auto` → `margin-right:auto`) | 254 |
| **value agrees with the served bytes** | **596** |
| **value disagrees** | **0** |
| unmatched by my parser | 11 (8 distinct) |

The 11 unmatched are a limitation of **my** comparator, not the engine: the served files are minified
and write combinators without spaces (`.swiper-free-mode>.swiper-wrapper`), while the CSSOM
re-serializes them with spaces, and my selector index did not normalise around `>`. I checked all 8
by hand against the served text and every value is right — e.g. served
`.swiper-free-mode>.swiper-wrapper{margin:0 auto}` vs recovered `margin: 0px auto`; served
`left:0` vs recovered `left: 0px`. **Effectively 607/607 agree, 0 disagreements.**

Corroborating: the observation's `customProperties` for the homepage include
`--swiper-navigation-size: 44px`, a `:root` variable that exists **only** in the cross-origin swiper
bundle. Before recovery its name was undiscoverable.

### 5.3 Mobile-context layout probe with its own identity

Present and populated on all 14 observed pages: `layout-probe-mobile.json`, its own `profile` block, its own
`floorWidths` `[390, 480, 700, 768, 914]` (capped below the 915 desktop/mobile switch, as designed),
its own derived width set and its own provenance. It measurably differs from the desktop probe at
the same nominal width — p000001 x-coordinates at width 390: desktop-context `360.8 / 375.8 / 570.58`
vs mobile-context `390 / 405 / 573.5`. Two identities, not one probe run twice.

### 5.4 Probe widths derived from the site's own breakpoints

See MAJOR-3 for the table. Working, instrumented, cap-limited.

### 5.5 Band-edge snapping — **completely unexercised on this site**

```
responsiveHidden 0 · bandEdgesOpen 0 · bandEdgesConsidered 0 · bandEdgesSnapped 0
bandEdgesSnappedAmbiguous 0 · bandEdgeSnapShiftPx 0
bandEdgesKeptMidpointNoAuthoredInGap 0 · …EmptyHistogram 0 · …NoHistogram 0
bandCheckable 0 · rejectedByBandCheck 0 · bandWidthsRendered 0
bandIndependentlyDiscriminated 0 · bandHiddenByAncestorAtBandWidth 0
bandExactTierHidesAtBandWidth 0 · bandTruthBaselineNotInLayout 0
```

Every band counter is zero because `responsiveHidden` is zero: the engine found no element that
appears at one probe width and disappears at another, so there was no band to place an edge on.
**This lane provides no evidence about band-edge snapping in either direction.** The one edge the
clone actually has — 915 — is produced by a different code path
(`responsive-plan.ts:76`) that the snapping work does not touch. That gap is BLOCKER-1.

### 5.6 Bidirectional inline-size recovery + truth-width verification

See BLOCKER-3. Correct where it ran, verified with no exemptions, honest about refusals, too narrow
in coverage to save this site.

### 5.7 Scheme: was `http://` ever silently upgraded?

**No. Zero occurrences of `https://seoultone.kr` in any artifact this lane produced.**

| surface | `http://seoultone.kr` | `https://seoultone.kr` |
|---|---:|---:|
| `discovery.json` / `discovery.raw.json` | 41 / 21 | **0 / 0** |
| `verification.json` / `verified-urls.json` | 61 / 41 | **0 / 0** |
| `page-families.json` / `selected-pages.json` | 73 / 29 | **0 / 0** |
| generated Next.js app (`*.ts`, `*.tsx`, `*.css`, `*.mjs`) | 61 | **0** |
| **all files under `data/seoultone.kr/`** | **289 files** | **0 files** |

`responsive-qa.json → sourceOrigin` is `http://seoultone.kr`. `generated-config.ts → SOURCE_ROOT_URL`
is `"http://seoultone.kr/"`. `observation.json → target.finalUrl` is `http://seoultone.kr/`. The
scheme survives discovery, verification, selection, observation, SiteSpec, reconstruction and both QA
runs intact.

---

## 6. Does the server branch on User-Agent?

**No.** The engine's "one document at N viewports" model is valid for this site.

| probe | desktop | mobile |
|---|---|---|
| `curl` homepage, md5 | `ddb97b0910c588493a9a85f4118b6115` | **identical** |
| `curl` bytes | 48,195 | **48,195** |
| Playwright document, sha256 | `18fd271678549875a100b692309d34c2…` | **identical** |
| response headers | no `Vary: User-Agent` | no `Vary: User-Agent` |
| gnuboard switch | `var g5_is_mobile = "";` (line 38) | `var g5_is_mobile = "";` |
| `<html>` / `<body>` | `<html lang="ko">` / `<body>` — no device class | identical |

Mobile UA used: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 …) Safari/604.1` — the string gnuboard's own
`is_mobile` detection keys on. The g5 mobile theme is **disabled** on this install; there is one
document and one theme.

The only desktop/mobile difference is **client-side**: post-load DOM element count 592 (desktop
context) vs 585 (mobile context), `documentElement.outerHTML.length` 64,884 vs 61,754 — produced by
Swiper/ScrollReveal/roughmap building different nodes at different widths. That is exactly what a
one-document-N-viewports model is built to represent. Stylesheet set is identical in both contexts
(13 sheets, same 5 blocked, same 302).

---

## 7. The Korean text census — READ THIS SECTION

Two separate things. One is good news. One is a live hazard that happened not to fire.

### 7.1 What actually happened: the census behaved correctly on hangul

The corpus is genuinely Korean-dominant — **1,231 of 1,679 non-space characters in the rendered
homepage (73.3 %) are hangul syllables**.

| Route | Width | src chars | missChars | strict % | loose % | **boundaryOnlyChars** | truncatedKeys |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 390 | 1808 | 0 | 0.00 | 0.00 | **0** | 0 |
| `/` | 700 | 1808 | 0 | 0.00 | 0.00 | **0** | 0 |
| `/` | 1024 | 1826 | 9 | 0.49 | 0.49 | **0** | 0 |
| `/` | 1100 | 1826 | 9 | 0.49 | 0.49 | **0** | 0 |
| `/` | 1440 | 1817 | 0 | 0.00 | 0.00 | **0** | 0 |
| `intro04` | 390 | 936 | 0 | 0.00 | 0.00 | **0** | 0 |
| `intro04` | 700 | 936 | 0 | 0.00 | 0.00 | **0** | 0 |
| `intro04` | 1024 | 936 | 9 | 0.96 | 0.96 | **0** | 0 |
| `intro04` | 1100 | 936 | 9 | 0.96 | 0.96 | **0** | 0 |
| `intro04` | 1440 | 927 | 0 | 0.00 | 0.00 | **0** | 0 |

`boundaryOnlyChars = 0` on **all ten pairs**; strict ratio equals loose ratio everywhere; zero
truncated keys. The only text the census calls missing is the single character **`"+"`** — 9
occurrences of a one-character UI affordance glyph, present in the source and genuinely absent from
the clone at 1024 and 1100 only (`absentStringCount: 1`). Not hangul, not a boundary artefact.

The reason it behaved: the clone reproduces the source's text nodes **1:1**, so census keys match
exactly and the boundary rule is never consulted.

### 7.2 The hazard is real, and I reproduced it against the shipped code

`src/responsive-qa/correspondence.ts:348-376`:

```ts
const WORD_CHAR = /[\p{L}\p{N}]/u;              // line 348
function containsAtBoundary(haystack, needle) {  // line 360
  const needsLeft  = isWordChar(needle.charAt(0));
  const needsRight = isWordChar(needle.charAt(needle.length - 1));
  ...
  if ((!needsLeft || !isWordChar(before)) && (!needsRight || !isWordChar(after))) return true;
```

`\p{L}` includes every Hangul syllable. The rule assumes a *word* ends where a non-letter begins —
true in English, **false in Korean**, where particles (조사) and compounding attach with no space.

I called the shipped, exported `missingText()` directly
(`tmp/wr286/pilot-seoultone/hangul-boundary-probe.ts`). Measured output:

| case | source key | clone key | **strict** | loose | boundaryOnly |
|---|---|---|---:|---:|---:|
| EN — the case the rule exists for | `us` | `customers` | **100.00 %** | 0.00 % | 2 |
| EN — clone adds a word | `start building` | `start building today` | **0.00 %** | 0.00 % | 0 |
| **KO — clone adds a particle** | `서울톤` | `서울톤은` | **100.00 %** | 0.00 % | 3 |
| **KO — clone adds a compound head** | `피부과` | `서울톤피부과` | **100.00 %** | 0.00 % | 3 |
| **KO — clone adds a noun suffix** | `진료시간` | `진료시간안내` | **100.00 %** | 0.00 % | 4 |
| **KO — clone adds a verbaliser** | `예약` | `예약하기` | **100.00 %** | 0.00 % | 2 |
| KO — same shape, but spaced | `진료 시간` | `진료 시간 안내` | 0.00 % | 0.00 % | 0 |
| KO — identical strings | `서울톤피부과의원` | same | 0.00 % | 0.00 % | 0 |

**The asymmetry is stark.** The exact clone behaviour that scores 0.00 % in English —
"the clone rendered a longer string containing the source's" — scores **100.00 % missing** in
Korean, purely because Korean does not put a space there. The rubric fires on the strict number.

**Mitigations that already exist, and their limit.** Every one of these lands in
`boundaryOnlyChars`, the run publishes `missing-text-absent-ratio` (the loose reading) beside the
strict one, and `run.ts:386-395` raises the `missing-text-boundary-only-population` limitation
whenever `boundaryOnlyChars > 0`. So the population is *separable* and *visible*. But
`missing-text-ratio` — the strict one — is what produces the BLOCKER, and on a CCJK source any clone
whose text-node segmentation differs from the source's will inflate it with no fidelity loss at all.

**Recommendation for the orchestrator, generic:** treat a pair with
`boundaryOnlyChars > 0` on a CJK-heavy source as unadjudicated on the missing-text channel until the
loose reading is checked, and consider making the boundary requirement script-aware (a Han/Hangul/Kana
edge has no word boundary to require). **I am not proposing a per-site rule and I did not change any
code.** I could not test this against a real firing case because none occurred — see §8.

---

## 8. What I could NOT measure

Blunt list. None of these is presented as measured anywhere above.

1. **Band-edge snapping.** Zero evidence, in either direction. Every band counter in the manifest is
   0 because `responsiveHidden` is 0. This site produced no responsive-hidden element for a band edge
   to be placed on. Another lane must carry this change.
2. **Whether the hangul boundary hazard changes any real verdict.** It did not fire here
   (`boundaryOnlyChars = 0`, 10/10 pairs). §7.2 is a controlled probe of the shipped function, not a
   pipeline observation. I do not know its real-world rate.
3. **Why the five `width:1296px` containers were not inline-size-recovery candidates.** I measured
   that 595 rules were recovered, that all 595 passed truth-width verification, and that these
   containers are not among them. I did **not** trace `layout-inference.ts` to find which predicate
   excluded them. That is the single highest-value follow-up from this lane.
4. **BLOCKER-4 root cause** (`/` @390 overlap-excess 0.1457, position p90 88 px). I established it is
   clone-side (floor: 12 px, 0.00 %) and that `intro04` @390 does not have it. I did not isolate the
   element.
5. **What fraction of the 18.77 %/26.75 % residual at 1440 is the baked `opacity:0` versus other
   causes.** I measured `residualEdgeFraction 0.1729` (83 % flat, consistent with blank blocks not
   re-shaped glyphs), 124 `opacity:0` style blocks, and the source's ScrollReveal script. I did not
   re-render the clone with those declarations removed to attribute the residual quantitatively.
6. **Web-font substitution cost.** Measured: the clone's stylesheet has **0** `@font-face`, no font
   link tags and no font files in `public/`, while the source loads 944 `@font-face` rules across
   three Google-Fonts families plus Pretendard. The manifest names this
   (`font-source-binding-unverified`, `source-head-not-reconstructed`). I did **not** measure how much
   of the pixel residual it accounts for; the 83 %-flat split argues it is not the dominant term.
7. **The 18 other routes.** The clone generates 20 routes; I graded 2 × 5 widths as briefed. The e2e's
   own reconstruction QA covered 28 page/viewport pairs and reported
   `style-mismatch 116 · environment-unstable 28 · source-style-drift 27 · visual-coverage-truncated 5 ·
   unknown-behavior-gap 1`, which I did not investigate.
8. **`--auto-fix`.** Not run. `correctionsProposed: 0` on the baseline pass, so the final
   reconstruction is `kind: "baseline"`, *"no correction was eligible."*
9. **`unresolvedInternalLinks: 744`** (against 694 rewritten). Recorded from the manifest, not
   investigated.
10. **Encoding.** `assets/css/common.css` is served as ISO-8859/EUC-KR rather than UTF-8 (5,101 B by
    curl, 5,320 B as Chromium decodes it). Noted; I did not test whether any pipeline stage mis-decodes
    it, and no artifact showed mojibake.

---

## 9. Wall clock and artifact size

**Machine time, first fetch to last run: ≈ 28 minutes.**

| Stage | Wall |
|---|---|
| Pre-flight curl + 2 independent Playwright audits | ≈ 1 m 30 s |
| `pnpm e2e:reconstruct` (13 stages) | **7 m 49.6 s** (20:18:00.919Z → 20:25:50.553Z) |
| `pnpm qa:responsive` (10 pairs) | **2 m 07.6 s** (20:36:13.343Z → 20:38:20.931Z) |
| `pnpm qa:responsive --self-check` (10 pairs) | **2 m 17.1 s** (20:42:28.343Z → 20:44:45.464Z) |

Within the e2e, two stages dominate: **observation 176.0 s** (14 pages × 2 contexts × up to 16 probe
widths) and **reconstruction QA 246.8 s** (28 page/viewport pairs). Everything offline is trivial:
sitespec 1.7 s, reconstruction 11.6 s, `next build` 2.5 s, final validation 23 ms.

**Disk: `data/seoultone.kr` = 409 MB** for one 12-family site.

| Directory | Size | Note |
|---|---:|---|
| `site-observations/` | 138 MB | 139,362,995 B per the manifest; screenshots dominate (one 1440 PNG is 2.6 MB, one 390 PNG 4.7 MB) |
| `responsive-qa/` | 115 MB | **2 runs**, 57 MB + 58 MB — 40 PNGs plus a contact sheet each |
| `site-specs/` | 70 MB | 73,743,164 B |
| `reconstruction-qa/` | 48 MB | 50,593,488 B |
| `reconstructions/` | 36 MB | 5,938,276 B is the app itself; `generated-styles.css` alone is 4,367,986 B |
| `tmp/wr286/pilot-seoultone/` | 1.5 MB | this lane's scratch |

**Planning note for the orchestrator.** ~11 min of machine time and ~410 MB per site, of which the
responsive-QA self-check is 2 m 17 s and 58 MB. The self-check earned its cost here — without it,
"5 BLOCKERs" is an unfalsifiable number; with it, the floor is 0 BLOCKER / 0 MAJOR / 4 PASS and every
clone BLOCKER is provably clone-side. Budget it for every lane. `--no-diff-images` would cut the
responsive-QA footprint substantially if disk becomes the constraint.

---

## 10. Files a reader may want

- Lane scratch, all read-only instruments and ground truth:
  `/Users/woops/projects/web-recon/tmp/wr286/pilot-seoultone/`
  - `sheet-audit.ts`, `sheet-audit-desktop.json`, `sheet-audit-mobile.json` — independent sheet enumeration
  - `hangul-boundary-probe.ts` — §7.2, calls the shipped `missingText()`
  - `spotcheck.py` / `spotcheck2.py` — §5.2
  - `truth-css/` — all 12 stylesheets fetched independently, sha-matched to the browser's copies
  - `e2e-run.log`, `qa-responsive.log`, `qa-responsive-selfcheck.log`
- Engine artifacts: run ids in §1.
- Composite images: `data/seoultone.kr/responsive-qa/2026-09-02T20-36-13-342Z/images/`
  (**not for redistribution** — see the content note).
