# Task 28.75 — "JS-dependent content" regions that reconstruct as empty: root cause

**Status: ROOT-CAUSED. All four regions are mechanically explained, each cause reproduced and each
proposed fix demonstrated at runtime on the served clone. None of the four needs a JavaScript
framework emulator.**

Read-only diagnostic lane. Nothing under `src/` or `scripts/` was modified. No git operations.

## Runs inspected (pinned)

| Site | Artifact | Run id |
|---|---|---|
| gs.severance.healthcare | site-observation | `2026-09-04T18-13-50-154Z` |
| gs.severance.healthcare | site-spec | `2026-09-04T18-14-45-426Z` |
| gs.severance.healthcare | reconstruction | `2026-09-04T18-14-47-300Z` |
| gs.severance.healthcare | responsive-qa | `2026-09-04T18-15-04-161Z` (floor `…-162Z`) |
| seoultone.kr | site-observation | `2026-09-04T18-13-50-161Z` |
| seoultone.kr | site-spec | `2026-09-04T18-17-20-905Z` |
| seoultone.kr | reconstruction | `2026-09-04T18-17-23-059Z` |
| seoultone.kr | responsive-qa | `2026-09-04T18-18-47-244Z` |

The two reconstructions were served from their **existing `.next` builds** (`next start`, ports
53991 / 53992) and probed with Playwright. No rebuild was triggered by this lane. Live source pages
were opened read-only for ground truth. Scratch scripts and evidence PNGs: `tmp/wr2875/js-content/`.

## Executive summary — the four regions are THREE mechanisms, and none is "JS content"

| # | Region | Category | Owner | One-line mechanism |
|---|---|---|---|---|
| 1 | severance HERO | **C** | reconstruction | The observed `<body>` is re-emitted as an in-flow `<div>` that keeps `background-color: #fff`; a normal block background paints ABOVE `z-index:-1`, so the hero photo (which is `z-index:-1`) is buried and its white headline is left white-on-white. |
| 2 | severance NEWS row | **C** | observer | `float` is not in the Observer's computed-style whitelist, so slick's `.slick-slide { float: left }` is lost; the slides stack vertically at the track's origin, which the track's `translateX(-981px)` puts at x = −543, and `.slick-list { overflow: hidden }` clips them away. |
| 3 | severance promo carousel | **C** | observer | Identical to #2 on a second slick track (`translateX(-777px)`, slides land at x = −560). Not a separate defect. |
| 4 | seoultone doctor bio + 4 headings | **A** | observer | The Observer's preparation auto-scroll advances **0 px** on this page because `html { scroll-behavior: smooth }` makes `window.scrollBy` asynchronous and `runScrollPass` reads `window.scrollY` synchronously; ScrollReveal therefore never fires below ~1,600 px and the collector records `opacity: 0`, which the SiteSpec and the clone faithfully bake in. |

**The brief's decisive fact is half right and I am refuting the other half.** On severance the content
IS present and displaced by thousands of pixels — but only for the NEWS row and the promo carousel
(regions 2 and 3). The HERO (region 1) is present at *exactly the right geometry* (`x = −240, y = 215,
1920×500`, `opacity: 1`, `visibility: visible`, image decoded, `naturalWidth 1920`) and is invisible
purely because of **paint order**. No QA channel in the roster measures paint occlusion, which is why
the instrument says the page is perfect.

---

# REGION 1 — gs.severance.healthcare `/gs/index.do`, the HERO

Widths affected: **1100 and 1440 only.** 390 is correct, and that asymmetry is itself the proof
(see the control below).

## Evidence chain

| Stage | What is there | Where | Conclusion |
|---|---|---|---|
| Source browser (live, 1440) | `img.img-visual.d-up-lg` `src=/_res/yuhs/gs/img/home/main1.png`, `position:absolute; left:720px; margin-left:-960px; width:1920px; height:500px; z-index:-1`, rect `(-240, 215, 1920, 500)`. Headline `color: rgb(255,255,255)`. | `tmp/wr2875/js-content/probe-sev.mjs` output | Content present after settle. **No carousel, no JS mount.** A static `<img>` + `<span class=slogan>`. |
| Observation DOM | `e001001` img, `localVisible/effectiveVisible: true`, bb `(-240, 215, 1920, 500)`; `e001004 span.slogan` "이웃병원", `e001005 strong` "어려운 병 잘 치료하는", bb `(80, 367.5, …)` | `data/gs.severance.healthcare/site-observations/2026-09-04T18-13-50-154Z/pages/p000001/viewports/desktop/dom.json` | Captured correctly, geometry exact. |
| Observation styles | `s`-token for `e001001`: `z-index: -1`, `position: absolute`, `left: 720px`, `margin-left: -960px`. `e001004/5/7`: `color: rgb(255,255,255)`. `e000002 body`: `background-color: rgb(255,255,255)`. All ancestors between: `background-color: rgba(0,0,0,0)`, `z-index: auto`, `transform: none`, `opacity: 1`, `isolation: auto`. | `…/viewports/desktop/styles.json` | Nothing filtered. The negative z-index and the white text are both faithfully recorded. |
| SiteSpec | style tokens preserved verbatim | `data/gs.severance.healthcare/site-specs/2026-09-04T18-14-45-426Z/style-catalog.json` | Not a compilation drop. |
| Generated DOM | `n002542` `<img src=".../main1.png">` inside `n002541`; text `n002546/n002547` present | `…/reconstructions/2026-09-04T18-14-47-300Z/app/reconstruction-data/pages/p000001.json` | Present. |
| Generated CSS | `.wr-st000277 { … z-index:-1; position:absolute; left:720px; margin-left:-960px; width:1920px; height:500px }`; `.wr-doc-st000142 { background-color: rgb(255,255,255); display:block; position:static }` | `…/app/public/wr/generated-styles.css:272` and the `wr-doc-st000142` rule | The observed `<body>` became an ordinary in-flow `<div>` **carrying an opaque background**. |
| Emitter | `<html>`/`<body>` are re-emitted as `div`s with `data-wr-doc-tag`; only `width/height/min-*/max-*` are dropped from the doc class | `src/reconstruction/compile-node.ts:561-598` (`compileDocumentRoot`), `src/reconstruction/style-generator.ts:110-122` (`documentRootClassName`, `DOCUMENT_ROOT_DROPPED_PROPERTIES`), applied at `src/reconstruction/style-generator.ts:168` (`DOC_SKIP`) and `:175-205` (`generateStylesheet`) | **This is the defect site.** `background-*` is not dropped and not re-homed. |
| Final browser (served clone, 1440) | `n002542`: rect `(-240, 215, 1920, 500)`, `opacity 1`, `visibility visible`, `z-index -1`, `complete: true`, `naturalWidth 1920`. `n002547`: rect `(80, 366, 573, 78)`. `elementsFromPoint(400, 460)` = `n002546, n002545, n002541, n002539, n002521, n000031` — every one `background-color: rgba(0,0,0,0)`. | `tmp/wr2875/js-content/probe-clone-sev.mjs` | The image is present, correct and loaded; the white the reviewer sees comes from `n000003` (`data-wr-doc-tag="body"`, `.wr-doc-st000142`) painting over it. |

## Where the content actually IS in the clone

Nowhere else. Node `n002542`, geometry `(-240, 215, 1920, 500)`, opacity 1, no clip, no transform,
z-index −1 — occupying precisely the source's box and painted underneath the body-div's white block
background. The headline `n002547` is at `(80, 366, 573, 78)` in `rgb(255,255,255)` on white.

## Why the paint order flips

In the source, `<body>`'s background is **propagated to the canvas** (CSS Backgrounds §2.11.2): the
canvas is painted before everything, so a `z-index:-1` child of a non-stacking-context ancestor paints
*above* it. In the clone that same background is on a plain `<div>`, whose background paints in step 3
of the stacking order (in-flow block backgrounds) — **above** step 2 (negative-z-index children).

Isolated reproduction, both directions:

* `tmp/wr2875/js-content/repro-zindex.html` → `repro-zindex.png` — with `.src-body{background:#fff}`: **entirely white.**
* `tmp/wr2875/js-content/repro-zindex-control.html` → `repro-zindex-control.png` — same markup, background removed: image and headline both render.

Runtime proof on the actual served clone: moving `getComputedStyle(bodyDiv).backgroundColor` to
`document.documentElement.style.backgroundColor` and setting the body-div transparent restores the
photo, the headline and the sub-headline instantly —
`tmp/wr2875/js-content/hero-bodybg-experiment.png` (top = before, bottom = after).

## Control that rules out every other hypothesis

At 390 the same clone renders the hero correctly. The mobile subtree's hero image `e001002` is
`position: static; z-index: auto` (`…/viewports/mobile/dom.json`), so it paints in normal flow and the
body-div background is behind it. **The defect appears exactly where and only where `z-index < 0`.**
A page-wide scan of the served clone found exactly two negative-z-index nodes: `n002542` (the hero,
`display:block`) and `n002543` (its mobile twin, `display:none`).

## Killed hypotheses

* *Asset failed to load* — killed: `naturalWidth 1920`, `complete true`, and the QA channel
  `image-layer-state` records `clone 0 failed / 27 loaded of 27`.
* *Displacement* — killed: geometry is identical to the source to the pixel.
* *Carousel* — killed: `.visual-slider` has one visible `<img>` and a text block; there is no track,
  no transform and no slide list.
* *Opacity/scroll-reveal* — killed: `opacity-hidden-text-chars` is **0 on both sides** at 1440.

**REGION severance-hero — CATEGORY C — OWNER reconstruction — the observed `<body>`'s background is emitted as an in-flow block background instead of being propagated to the document canvas, so it paints over the `z-index:-1` hero image and the hero's white text is left white-on-white.**

---

# REGION 2 — gs.severance.healthcare `/gs/index.do`, the NEWS row

## Evidence chain

| Stage | What is there | Where | Conclusion |
|---|---|---|---|
| Source browser (live, 1440) | `.article-latest-slider` is a **slick** carousel. `.slick-list{overflow:hidden; width:1032px}` at x=408; `.slick-track{width:50000px; transform: matrix(1,0,0,1,-981,0)}`; every `.slick-slide` has **`float: left`**, `position: static`, `width: 327px`. | `tmp/wr2875/js-content/probe-sev.mjs` | Content present after settle; layout is float-driven. |
| Observation DOM | `e001220 .article-latest-slider.slick-initialized`, `e001222 .slick-list`, `e001223 .slick-track` (bb width 50000, `transform: matrix(1,0,0,1,-981,0)`), 23 `.slick-slide` children, `e001253 strong.subject` "[강남세브란스] '뇌경색'…" at bb `(438, 1617.5, 237, 56)`, `localVisible/effectiveVisible: true` | `…/viewports/desktop/dom.json` | Every card captured, at the right place. Nothing dropped. |
| Observation styles | `float` **is not recorded**. The whitelist runs `display … z-index` with no `float` and no `clear`. | `src/observer/types.ts:430-582` (`STYLE_WHITELIST`) | **This is the defect site.** The property that produces the row does not exist in the artifact. |
| QA is blind too | `QA_STYLE_PROPERTIES` mirrors the Observer list plus a QA-only tail; `float`/`clear` are in neither. | `src/reconstruction-qa/capture-page.ts:150-330` | No channel can name this. |
| SiteSpec | carries what the Observer recorded — no `float` | `…/site-specs/2026-09-04T18-14-45-426Z/style-catalog.json` (0 occurrences of `float`) | Faithful; not a compilation drop. |
| Generated DOM | all 23 slides and all card text present (`n002964` track, children `n002965, n002984, n003003, n003022, …`) | `…/reconstruction-data/pages/p000001.json` | Present. |
| Generated CSS | `.wr-st…` for the track: `width:50000px; transform: matrix(1,0,0,1,-981,0); position:relative`. Slides: `display:block; position:static; width:327px` — **no float.** | `…/app/public/wr/generated-styles.css` | Reproduces the bug. |
| Final browser (served clone, 1440) | track `n002964` at `width 50000px`, `translateX(-981px)`; its 23 element children are stacked **vertically** at `x = −573`, `y = 1581, 1832, 2083, 2334, …` (+251 px each). Card headline `n003031` at `(-543, 2371, 237, 56)`. Source is `(438, 1617.5)`. | `tmp/wr2875/js-content/probe-clone-float.mjs` | Present, off to the left by exactly the track's `-981 px`, and clipped by `.slick-list{overflow:hidden}` whose box is x∈[408, 1440]. |

## Where the content actually IS in the clone

Node `n003031` (and its 22 siblings) at `x = −543`, stepping down `y = 1581 + 251·n`, `opacity 1`,
`visibility visible`, no clip on the node itself — clipped out of view by the ancestor
`.slick-list` (`overflow: hidden`).

## Runtime proof

Injecting nothing but `float: left` on the three tracks' element children moves `n003031` to
**`x = 438, y = 1618`** — the source geometry to the pixel — and the second (slick-cloned) copy to
`x = 3708`, matching source `e001333` at `x = 3708`. Screenshot: `tmp/wr2875/js-content/clone-float-after-crop.png`.

## What the QA already recorded and could not interpret

* `missing-text-ratio: 0` (0 of 2,644 chars), `visible-text-ratio: 1`, `matched-fraction: 1` (202/202) —
  the cards are all in the clone's DOM.
* `offscreen-nodes`: **source 259, clone 0**; `offscreen-text-excess-chars`: **−1508**. The source
  parks 1,508 characters off the right edge (the inactive slides); the clone parks none — because they
  are stacked at negative x instead. The channel only fires on *excess*, so a clone that drags the
  source's off-screen track on-screen-and-clipped scores as an improvement.
* `contentMaxRight`: source **6888**, clone **1680**.
* `overlap-excess-ratio` fired BLOCKER at 0.3425 (clone 111 overlapping leaf pairs / 50.41% of the
  viewport vs source 31 / 16.16%) — that is the stacked slides piling onto one x.
* `left-edge-delta-median-px 1542`, `left-edge-delta-p90-px 5397`, `position-delta-offviewport-p90-px
  6213` over 92 off-viewport pairs.

**REGION severance-news — CATEGORY C — OWNER observer — `float` is absent from the Observer's computed-style whitelist, so slick's `float:left` slides stack vertically at the track origin, land at x = −543 under the track's `translateX(-981px)`, and are clipped away by `.slick-list{overflow:hidden}`.**

---

# REGION 3 — gs.severance.healthcare `/gs/index.do`, the promo carousel

Same mechanism, second instance. Reported separately because the brief asked for four regions, but
**one property fixes both.**

| Stage | What is there | Where | Conclusion |
|---|---|---|---|
| Source browser | third slick track: `width 50000px`, `transform matrix(1,0,0,1,-633.254,0)`, slides `float: left` | `tmp/wr2875/js-content/probe-sev.mjs` (`allSlickTracks`) | Same construct. |
| Observation | track and all slides captured with geometry | `…/viewports/desktop/dom.json` | Present. |
| Generated DOM | track `n003413`, 21 element children | `…/reconstruction-data/pages/p000001.json` | Present. |
| Final browser | `n003413` `width 50000px`, `translateX(-777px)`; children stacked at `x = −560`, `y = 1937, 2354, 2771, 3188, …` (+417 px each) | `tmp/wr2875/js-content/probe-clone-float.mjs` | Off-screen left, clipped. The blurred background and the dot pager survive because neither is inside the track. |
| Runtime proof | `float:left` restores all four oval cards over the blurred lobby photo | `tmp/wr2875/js-content/clone-float-after-crop.png` | Cured by the same one-property fix. |

A **third** instance exists on the same page and was not in the brief: the "건강정보" mini-carousel
(track `n002714`, `width 5397px`, `translateX(-771px)`, children stacked at `x = −342`, +113.75 px).
It is the white box with the stray "Pre Nex" glyphs in the reviewed composite. It is cured by the
same fix. Expect this defect on **every slick/float-based carousel in the corpus**.

**REGION severance-promo-carousel — CATEGORY C — OWNER observer — the same missing `float:left` on a second slick track (`translateX(-777px)`) stacks its cards at x = −560 where the track's clipping ancestor removes them; the background and dot pager survive because they sit outside the track.**

---

# REGION 4 — seoultone.kr `/`, the doctor biography block and four headings

## Evidence chain

| Stage | What is there | Where | Conclusion |
|---|---|---|---|
| Source browser, at rest (live) | `<html class="sr">` — **ScrollReveal.js**. At scroll 0, **36** elements sit at `opacity: 0` with `transform: translateY(-25px)`, carrying **3,642** characters. Among them all five `div.text` reveal wrappers at y = 934, **1735 (the doctor bio)**, 2518, 3007, 3536, plus the closing `h1` at 4236. | `tmp/wr2875/js-content/probe-st.mjs`, `probe-st-fix.mjs` | The content is in the DOM; it is opacity-hidden until scrolled to. |
| Source browser, after a real scroll | Scroll to the bottom and back to the top: zero-opacity drops 36 → 20 → **16**. ScrollReveal is `reset: false` — **once revealed, it stays revealed.** | `probe-st.mjs` (`AT TOP` / `AT BOTTOM` / `BACK AT TOP`) | A correct preparation scroll would have captured the revealed state. |
| Observer preparation scroll | `"prepareScroll": true, "scrollSteps": 1, "scrollDistancePx": 0, "prepareScrollStatus": "prepare-scroll-complete"` at **both** viewports (desktop docH 4892, mobile docH 5632). `scrollReveal.samples: 1`. | `data/seoultone.kr/site-observations/2026-09-04T18-13-50-161Z/pages/p000001/observation.json` | **The page was never scrolled.** For contrast, severance recorded 3 steps / 1800 px and 5 steps / 3081 px. |
| Why 0 px | `html { scroll-behavior: smooth }` (measured live). `runScrollPass` issues `window.scrollBy(0, step)` and reads `window.scrollY` **in the same evaluate**; with smooth scrolling the animation has not started, so `moved === 0` and `if (m.moved <= 0) break;` fires on step 1. Replayed exactly: step 0 reports `moved: 0` while `scrollY` is 714 after the 250 ms wait; steps 1 and 2 likewise report 0 while the page is at 1412 and 2112. | mechanism: `src/observer/layout-probe.ts:313` (`runScrollPass`), `:326-336` (scrollBy + synchronous read), `:370` (`if (m.moved <= 0) break;`); replay: `tmp/wr2875/js-content/probe-st-scroll.mjs` | **Root cause.** |
| Why the reveal metric said nothing | `regressedAfterReturn: 0` counts elements the probe *saw reach* a visible opacity and then found re-hidden. Candidates are only seeded by a `MutationObserver` on `class`/`style` (`layout-probe.ts:129-138`), so an element that **never revealed** never mutates, never becomes a candidate, and can never be counted. The metric is correct and answers a different question. | `src/observer/layout-probe.ts:100-144`, `:169-252` | The 0 is honest, not a bug — but it is not evidence of health. |
| The Observer DID record the symptom | `paintSuppression: { sizedElements: 450, suppressedElements: 88, suppressedByOpacity: 30, suppressedByAncestor: 81, suppressedBelowFold: 78, scrollRevealMarked: 0 }` | same `observation.json` | 78 sized elements below the fold paint nothing and **0 are explained by a reveal mark**. Nothing consumes this. |
| Observation DOM | `e000261 div.text` (bio) `opacity: 0`, `transform: matrix(1,0,0,1,0,-25)`, `localVisible: false`; children `e000262` "피부과전문의", `e000265 h1` "김진용 대표원장", the credential `<li>`s, all `localVisible: true` / `effectiveVisible: **false**`. Same for `e000308`, `e000314`, `e000390`, and `e000467` (the closing headline, opacity 0 on itself). | `…/viewports/desktop/dom.json`, `styles.json` | Content is in the artifact, recorded as invisible. Nothing was filtered out. |
| SiteSpec | `.wr-st000750`, `.wr-st000531`, `.wr-st000413` all carry `opacity: 0; transform: matrix(1,0,0,1,0,-25)` | `…/site-specs/2026-09-04T18-17-20-905Z/style-catalog.json` → `…/reconstructions/2026-09-04T18-17-23-059Z/app/public/wr/generated-styles.css` | Faithful. Not a compilation or reconstruction defect. |
| Final browser (served clone, 1440) | 69 zero-opacity nodes (matches QA `clone.zeroOpacityNodes: 69`). Desktop subtree: `n000569` (bio wrapper, 684 chars) at `(701, 1735, 542, 529)`; `n000691` (처음으로 만나보는, 57 chars) at `(720, 2518, 720, 155)`; `n000707` (서울톤피부과의 약속, 270 chars) at `(0, 3007, 720, 329)`; `n000813` (고객센터, 1,072 chars) at `(792, 3536, 256, 493)`; `n001011` (closing headline, 22 chars) at `(0, 4236, 1440, 38)`; plus 20 individually-revealed `<li>`s (`n000585…n000628`, `n000717…n000733`, `n000820…n000868`). Every one: `opacity: 0`, `transform: translateY(-25px)`, **geometry correct**, no clip. | `tmp/wr2875/js-content/probe-clone-st2.mjs` | Present, laid out, transparent. |

## Where the content actually IS in the clone

At the correct coordinates, at `opacity: 0`, translated up 25 px. It is not offscreen, not clipped,
not missing. The full node list with per-node geometry and character counts is in
`tmp/wr2875/js-content/probe-clone-st2.mjs` output.

## Runtime proof that a generic scroll fix recovers it

On the **live source**, replaying the Observer's scroll loop with the one change
`window.scrollTo({top: y + step, behavior: 'instant'})`:

| Scroll policy | zero-opacity elements | zero-opacity text chars | the five `div.text` wrappers |
|---|---|---|---|
| Observer today (`scrollBy` + synchronous read) | 36 | 3,642 | all `opacity: 0` |
| `behavior:'instant'`, 0.85 vh step, 250 ms dwell | 19 | 1,131 | **all `opacity: 1`** |
| `behavior:'instant'`, 0.5 vh step, 700 ms dwell | **5** | **69** | all `opacity: 1` |

Scripts: `probe-st-fix.mjs`, `probe-st-remain.mjs`, `probe-st-dwell.mjs`. The 5 survivors at the slow
policy are two empty `span.swiper-notification` aria live regions and one inactive `swiper-slide` —
legitimately hidden carousel state, correctly left alone. The intermediate row shows what dwell time
buys: at 250 ms the wrappers reveal but ScrollReveal's per-item stagger on the credential `<li>`s has
not finished, leaving 16 items / ~1,090 chars behind.

## The QA capture does NOT have this bug — a direct contrast

`src/responsive-qa/capture.ts:271-289` uses `window.scrollTo(0, window.scrollY + stepPx)` and **never
breaks on lack of progress**; it simply steps up to `SCROLL_MAX_STEPS = 60` with a 150 ms wait. On the
same page it reached the bottom in 11 steps / 3,992 px at 1440 and 13 steps / 4,779 px at 390
(`sourceProvenance.scroll` in the QA artifact). So the QA measures a well-scrolled source against a
clone baked from a never-scrolled observation. The two capture paths do not share a scroll policy.

## The seoultone popup / content-loss split, quantified

The source's entry popup (`section#popup_slider`, `position:absolute; z-index:999999`) is a
**source-capture asymmetry at 390 only**:

* Observation, desktop: popup present and visible (`e000007` bb `(470, 80, 500, 813.36)`); its visible
  text is 41 chars over 7 leaves — `가을이벤트`(5), `자세히보기`(5), `압토스`(3), `리프팅센터`(5),
  `시간 동안 다시 열람하지 않습니다.`(19), `24`(2), `닫기`(2).
* Observation, mobile: the whole `#popup_slider` is `display: none` (bb `0,0,0,0`), so the clone's
  mobile subtree correctly renders nothing.
* QA source capture at 390: the popup **is** on screen (`images/01-seoultone-kr-root-390-source.png`).
  At 1440 it is on screen in **both** source and clone, so it contributes nothing there.

Quantification, from the QA artifact:

| | @390 | @1440 |
|---|---|---|
| `sourceVisibleChars` | 1287 | 1282 |
| `missingChars` / `missingStringCount` | 393 / 25 | 356 / 21 |
| `missingRatio` | 0.3054 | 0.2777 |
| popup-attributed chars / strings | **37 / 4** | 0 / 0 |
| real content-loss chars | **356** | **356** |
| **realContentLossRatio** | **0.2766** | **0.2777** |

The subtraction is self-checking: removing the width-to-width delta (37 chars, 4 strings) from @390
lands exactly on @1440's 356 chars, and @1440 has no popup asymmetry. The popup therefore accounts
for **1.63–3.19 pp** of the 30.54 pp headline number (lower bound = the two black-bar labels visible
in the screenshot, 19 + 2 = 21 chars; upper bound = the whole popup subtree, 41 chars; the artifact's
own delta of 37 sits inside that band). **The remaining 27.7 pp is real content loss at both widths.**

I could **not** reproduce the popup on a fresh Playwright load of `http://seoultone.kr/` on
2026-09-05 at either width, so which of the 7 popup strings the QA's 390 capture actually painted is
**unknown**; the bounded range above is the honest answer.

Two further honesty notes on the seoultone numbers:

* The **source's own** QA capture still carried `zeroOpacityNodes: 18/19` and
  `opacityHiddenTextChars: 521/535` — the same ScrollReveal stagger my 250 ms replay left behind.
  Those characters are excluded from the missing-text census on **both** sides (item G1), so the true
  content loss is **understated** by roughly that amount.
* `visible-text-ratio` is 0.69 @390 and 0.7496 @1440 — the clone paints 888 / 961 characters against
  the source's 1287 / 1282. That channel saw the whole defect and does not fire.

**REGION seoultone-doctor-bio — CATEGORY A — OWNER observer — `html{scroll-behavior:smooth}` makes `window.scrollBy` asynchronous, `runScrollPass` reads `window.scrollY` synchronously and breaks on `moved <= 0` after one step (0 px travelled), so ScrollReveal never fires below the fold and the collector records `opacity: 0` for the bio block and four headings.**

---

# Fix proposals, prioritized

Scoped to what a *generic* mechanism can do. Each has been demonstrated at runtime.

## P0 — `float` and `clear` in the Observer's computed-style whitelist  *(regions 2, 3, and every float carousel in the corpus)*

* **File / symbol:** `src/observer/types.ts:430` — `STYLE_WHITELIST`.
* **Change:** add `"float"` and `"clear"` in the Layout block, next to `position`/`display`.
* **Mirror (required by the 28.5B superset invariant that `smoke-qa-independence` asserts):**
  `src/reconstruction-qa/capture-page.ts` — `QA_STYLE_PROPERTIES`, same two names, so QA does not go
  blind to the property it must verify. (28.6 W6 O5 already left this invariant red once; do not
  repeat that.)
* **Downstream:** none. `ALLOWED_CSS_PROPERTIES` in `src/reconstruction/style-generator.ts` is derived
  from `STYLE_WHITELIST`, so the generator starts emitting `float` with no further change.
* **Cost:** two strings per element in `styles.json`; both dedupe to near-zero after the shared style
  table.
* **Evidence it is sufficient:** injecting only `float:left` on the three tracks' children restored
  `n003031` from `(-543, 2371)` to `(438, 1618)` — source geometry to the pixel — and rendered all
  four NEWS cards and all four promo cards (`tmp/wr2875/js-content/clone-float-after-crop.png`).
* **Also worth adding while the list is open** (measured on this page, not speculative):
  `text-indent`. slick's arrows use `text-indent: -9999px; overflow: hidden`; without it the clone
  renders literal "Previous"/"Next" inside the 60 px circles — exactly the artefact in the review
  pack. `text-indent` is already in the QA-only tail (`capture-page.ts` `QA_ONLY_STYLE_PROPERTIES`),
  which is the artifact-driven promotion path that tail exists for. It also explains
  `contentMinLeft: -9999` on both sides of the severance census.

## P0 — propagate the document root's background to the canvas  *(region 1)*

* **File / symbol:** `src/reconstruction/style-generator.ts` — `DOCUMENT_ROOT_DROPPED_PROPERTIES`
  (`:115`), `DOC_SKIP` (`:168`), `generateStylesheet` (`:175`).
* **Change:** introduce `DOCUMENT_ROOT_CANVAS_PROPERTIES = ["background-color", "background-image",
  "background-size", "background-position", "background-repeat"]`. Add them to `DOC_SKIP` so a
  `.wr-doc-*` class never paints them as an in-flow block background, and in `generateStylesheet`
  emit **one** extra rule — `html{…}` — carrying the propagating element's background, chosen by the
  CSS rule: the observed `<html>`'s background if it is not fully transparent with
  `background-image: none`, otherwise the observed `<body>`'s.
* **Why not "just drop it":** dropping alone is right for a white-bodied site and wrong for a
  dark-bodied one; the background must be *moved*, not deleted.
* **Blast radius:** this is a two-element rule (`html`, `body`) that CSS already defines
  unconditionally; no site can legitimately depend on the body background painting as a block above a
  negative-z-index child, because in a real browser it never does.
* **Evidence it is sufficient:** on the served clone, re-homing that one declaration restored the
  photo, the headline and the sub-headline with no other change
  (`tmp/wr2875/js-content/hero-bodybg-experiment.png`).
* **Caveat found while testing:** with the hero visible, the clone's header — which wraps to two rows
  and is ~45 px taller than the source's — visibly overlaps the top of the photo. That is a
  pre-existing header-height defect the white band was hiding, **not** a regression from this fix.

## P0 — make the Observer's preparation scroll immune to `scroll-behavior: smooth`  *(region 4)*

* **File / symbol:** `src/observer/layout-probe.ts:313` — `runScrollPass`.
* **Change, two parts, both required:**
  1. `:326-336` — issue the scroll as `window.scrollTo({ top: window.scrollY + step, behavior: "instant" })`
     instead of `window.scrollBy(0, step)`. `behavior:"instant"` overrides an author's
     `scroll-behavior: smooth` per CSSOM-View and needs no page mutation.
  2. `:338-370` — stop deciding progress from a value read in the *same* task. Compute `moved` from a
     second `page.evaluate` taken **after** the existing `SCROLL_STEP_SETTLE_MS` wait, and only then
     apply `if (moved <= 0) break;`. This also protects against sites that animate scroll themselves.
     The QA capture already behaves this way (`src/responsive-qa/capture.ts:271-289`, which never
     breaks on non-progress) and reaches the bottom of this exact page in 11 steps.
* **Second, smaller change — dwell:** `SCROLL_STEP_FRACTION` 0.85 / `SCROLL_STEP_SETTLE_MS` 250
  (`src/observer/types.ts:264,268`) leaves per-item staggered reveals unfinished. Measured on this
  page: 0.85 vh / 250 ms leaves 19 elements and 1,131 chars at `opacity: 0`; 0.5 vh / 700 ms leaves 5
  elements and 69 chars, all of them legitimately hidden carousel/aria nodes. Either lower the
  fraction and raise the dwell, or add a bounded second slow pass. `SCROLL_MAX_TOTAL_MS = 15_000`
  already caps the cost.
* **Third change — make the blind spot visible:** the reveal probe
  (`layout-probe.ts:100-144`) seeds candidates only from `class`/`style` mutations, so it can only
  ever report *revealed-then-re-hidden*. Add a companion census of **never-revealed** elements —
  elements that are `opacity < threshold` at finish, have a nonzero laid-out box, and were never
  candidates — and publish it beside `regressedAfterReturn`. The raw material already exists:
  `paintSuppression.suppressedBelowFold: 78` with `scrollRevealMarked: 0` is precisely this
  population, and nothing reads it. A hard signal here would have caught this in 28.7.

## P1 — a QA channel for paint occlusion

Nothing in the 40-channel roster can see region 1. `image-presence-ratio` counts image *leaves* with a
box, so a fully buried image counts as present; `missing-text-ratio` counts text at token boundaries,
so white-on-white counts as painted. A minimal honest channel: for each visible leaf, sample
`document.elementsFromPoint` at its centre and record whether the leaf itself, or a descendant, is the
topmost paint — or, cheaper, flag leaves whose computed `z-index < 0` that have an opaque in-flow
ancestor background. Recorded, not fired on, until it is calibrated.

## What must NOT be built

* **No React/Vue/jQuery/slick/ScrollReveal runtime emulator.** All four regions are cured by
  recording two CSS properties, re-homing one declaration, and fixing one scroll loop. Not one of them
  needs the source's JavaScript re-executed in the clone.
* **No universal responsive solver.** Every geometry in all four regions is already exact at the
  observed widths; nothing here is a breakpoint or a layout-inference problem.
* **No per-site special cases.** No `.slick-slide` rule, no `html.sr` detection, no
  `seoultone`/`severance` branch. Each fix is a property list, a CSS-spec-mandated propagation, or a
  scroll primitive.
* **No "reveal-everything" hack.** Do not force `opacity: 1` on captured elements, and do not strip
  `opacity: 0` in the compiler. The correct fix observes the source in its revealed state; anything
  else fabricates a state the source never had and would un-hide genuinely hidden carousel slides.

---

# Recovery feasibility

| Region | Feasible with a generic mechanism? | Basis |
|---|---|---|
| 1 — severance hero | **Yes, fully.** | Demonstrated at runtime: one declaration re-homed restores photo + headline + sub-headline exactly. |
| 2 — severance NEWS | **Yes, fully.** | Demonstrated: `float:left` alone reproduces source geometry to the pixel on the active slide and on the slick clone. |
| 3 — severance promo carousel | **Yes, fully.** | Same injection restores all four oval cards; the dot pager and background were never lost. Which slide is active is frozen at whatever the observation captured — that is category-E carousel state and the existing behaviour is safe. |
| 4 — seoultone bio + headings | **Yes, essentially fully.** | Demonstrated on the live source: a correct scroll takes zero-opacity text from 3,642 chars to 69 chars, and the 69 that remain are an inactive carousel slide and two empty aria live regions, which *should* stay hidden. |

Combined runtime demonstration of the two severance fixes on the served clone:
`tmp/wr2875/js-content/sev-bothfix-sbs.png` (left = live source @1440, right = clone with both patches
applied in the page). The clone goes from three blank regions to near-parity. Remaining visible gaps in
that image — header nav wrapping to two rows and overlapping the hero, "Previous"/"Next" arrow labels,
a broken footer link row, and a different active slide in the mini-carousel — are separate defects
outside this lane's four regions.

**No region in this lane is a source-specific limitation.** Nothing here needs to be written off as
"not professionally usable"; the four defects are three engine bugs.

---

# Unknowns — stated, not guessed

1. **Which popup strings the QA's 390 source capture actually painted.** The popup did not appear on
   any fresh load of `http://seoultone.kr/` on 2026-09-05 at 390 or 1440, so the split is given as a
   bounded range (21–41 chars) with the artifact's own width-delta (37 chars) as the point estimate.
   Why the popup fires for some loads and not others was not determined.
2. **Whether `float`'s absence causes further defects elsewhere in the corpus.** Three tracks on one
   severance page are proven. The corpus was not swept; a `float`-dependent legacy layout (multi-column
   float grids, float-based nav) would fail the same way and nothing in the artifacts would say so.
3. **How much of severance's remaining 33% pixel residual the two fixes remove.** Not measured — that
   needs a rerun of the responsive-QA sweep after the code change, which is out of this read-only
   lane's scope.
4. **Whether the 28.7 A4 reveal-regression policy interacts badly with a corrected scroll.** With the
   scroll fixed, far more elements will become reveal candidates and `regressedAfterReturn` will
   become nonzero on pages that use `reset: true`. That path exists (`dedupe-styles.ts:210-256`) but
   has not been exercised at that volume.
5. **The exact dwell time that finishes ScrollReveal's stagger generically.** 0.5 vh / 700 ms works on
   seoultone; the right value is a corpus question, not a one-page one.
6. **Why the clone's severance header wraps to two rows** (visible once the hero is restored). Not
   investigated — out of scope for these four regions.
