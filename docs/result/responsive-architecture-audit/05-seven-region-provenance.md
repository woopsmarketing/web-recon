# 05 — Seven-region provenance trace (apartmentary.com `/`)

READ-ONLY. Nothing under `src/`, `data/`, existing docs, the generated app or git was modified.
Work dir (scripts + raw JSON): `tmp/wr-resp-audit/provenance/`.

Pinned runs:

| stage | artifact |
|---|---|
| observation | `data/apartmentary.com/site-observations/2026-09-14T04-22-26-242Z` (`pages/p000001/viewports/desktop/{dom,styles}.json`, `layout-probe.json`) |
| site spec | `data/apartmentary.com/site-specs/2026-09-14T04-58-45-517Z` (`pages/p000001.json`, `style-catalog.json`) |
| reconstruction | `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z` (`reconstruction-manifest.json`, `app/public/wr/generated-styles.css`) |

## 0. Method and how PIPELINE vs MANUAL-PATCH was separated

1. **Live source** (`source_probe.mjs`, Playwright, viewport h=1000, lazy-scroll): every node addressed by its structural child-index path under `.css-8atqhb`. Authored CSS = every `CSSStyleRule` in `document.styleSheets` (walked into `@media`), filtered by `element.matches(selectorText)`, layout properties only; inline `style` attribute captured per width. All 9 sheets were CSSOM-readable (0 SecurityError), so no text fallback was needed. Raw: `source-probe.json`, `source-probe-extra.json`.
   - Observation: **no Emotion rule on this page carries an `@media` condition**. MUI desktop/mobile differences are produced by React re-rendering the same elements with different classes (`css-1uvs8q8` @≥900 vs `css-1dibfmr` @<900). The only media-scoped authored layout on the chosen nodes is the MUI Grid item (`n000700`). Swiper widths/transforms/paddings are **JS-written inline styles** recomputed on resize.
2. **Observer / SiteSpec**: read straight from the pinned JSON (`extract_chain.py` → `chain.json`, `chain-summary.txt`). Node mapping is exact: SiteSpec `nodeId` = clone `data-wr-node`, `sourceElementId` = observer `e…`, `styleTokenId stNNNNNN` = `.wr-stNNNNNN`.
3. **PIPELINE CSS** — no untouched copy exists. Rebuilt as `generated-styles.PIPELINE-reconstructed.css` (`build_pipeline_css.py`) from the backup taken between the two manual passes (`…/cc86e2ff…/scratchpad/generated-styles.before.css`): cut the appended "Fluid-desktop supplement", removed the in-place `width:` insertions inside `max-width:100%` blocks (26 on p000001, 15 on p000006) and the two `n000050 height:auto` insertions, and restored the two deleted carousel rules (`p000001 n000053 { width:auto }`, `p000006 n000101 { width:100% }`). Two `max-width:100%; width:auto` blocks (`p000001 n000700`, `p000006 n000398`) were kept because the in-memory re-derivation (step 4) shows them as pipeline-native `authored-inline-size` rules. **Result: 4,109,264 bytes = the size the manifest records for `app/public/wr/generated-styles.css` (0-byte difference).**
4. **RECONSTRUCTION decisions** — the manifest only keeps aggregate counters plus a truncated `residualFrozenNodes` list (24 of p000001's desktop nodes). Per-node decisions were recovered by calling `inferLayoutRules()` in memory on the pinned SiteSpec (`infer_inmemory2.ts`; nothing written to data/). With the served breakpoint (801, from `route-map.json`) it reproduces the manifest exactly: 3,142 candidates and the identical `inlineSizeOutcomes` histogram (2369 full-width / 107 damage-clamp / 14 percentage / 1797 no-branch-matched / 182 guard / 79 width-mode / 1 centered). Candidates minus the 37 truth-check rejections = shipped rules. A counterfactual run with the authored 900px breakpoint was also saved. Raw: `inmemory-rules-p000001-bp801.json`, `inmemory-rules-p000001-bp900.json`.
5. **Clone geometry** (`clone_probe.mjs`): the existing build was served with `next start -p 3291` (no rebuild, no file changes; server stopped afterwards). `/wr/generated-styles.css` was replaced at request level by Playwright route interception with three variants: **P** = PIPELINE (reconstructed), **F** = after the fluid-desktop manual pass only, **C** = CURRENT (fluid-desktop + LAYOUT-MODE PROTOTYPE). Raw: `clone-probe.json`, `clone-probe-extra.json`. At 390/700 the clone serves the mobile tree (`<801`), so desktop nodes are not rendered there (`n/a`).

Geometry cells are `x/width` in CSS px. "Line" references are to the file named in the column (P = reconstructed pipeline CSS, C = current CSS).

---

## 0.5 Shared ancestor that gates every region in the pipeline: page root `n000005` (`.css-8atqhb`, path `R`)

| stage | value |
|---|---|
| SOURCE | `.css-8atqhb { width:100% }`. Parent `n000003` is `display:flex` (row). |
| SOURCE geometry | 0/390 · 0/700 · 0/1024 · 0/1100 · 0/1440 · 0/1920 |
| OBSERVER | computed `width:1440px`. `layoutRules`: `width:100%` (`.css-8atqhb`). Probe: fills viewport at all 15 widths. |
| SITE SPEC | `authoredLayout` identical (`width:100%`), token `st000952` `width:1440px`, `attributes:{}` (class dropped, selector kept in authoredLayout) |
| RECONSTRUCTION | `full-width` refused (flex row item: `flex-item-main-axis`) → **damage clamp** `{max-width:100%}`. The authored `width:100%` is then skipped as `already-recovered`. |
| GENERATED PIPELINE | `.wr-st000952 { width:1440px }` (L1605) + node rule `max-width:100%` (L2550) |
| GENERATED MANUAL | fluid-desktop: `width:100%` added in the same block (C L2550) |
| CLONE P / F / C | 1024: 0/1024 · 0/1024 · 0/1024 — 1920: **0/1440** · 0/1920 · 0/1920 |
| → LOSS POINT | RECONSTRUCTION — `layout-inference.ts:1455` (`inlineSizeBehaviour` refuses flex-row items) → `damageClampWidth` `layout-inference.ts:2456` (`tryDamageClamp` 5984) → `inlineSizeAnswered` `6644-6653` + `alreadyRecovered` `6690` → `authoredInlineSizeIntent` returns `already-recovered` at `4949`. In the pipeline this one frozen 1440px ancestor caps **every** region at >1440. |

---

## Region 1 — Hero

| node | path | SOURCE x/w 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P / F / C @1024 | @1920 |
|---|---|---|---|---|
| `n000050` hero box | R.2.0 | 0/390 · 0/700 · 0/1024 · 0/1100 · 0/1440 · 0/1920 (h 630 · 630 · 581.8 · 625 · 818.2 · 1090.9) | **0/1440 (h 818)** · 0/1024 · 0/1024 | **0/1440** · 0/1920 · 0/1920 |
| `n000051` swiper-container | R.2.0.0 | 0/vw at every width | **0/1440** · 0/1024 · 0/1024 | **0/1440** · 0/1920 · 0/1920 |
| `n000053` swiper track | R.2.0.0.0.0 | x = −3·vw (−3072 @1024 … −5760 @1920), w = vw | **−6820/1440** · −6820/1440 · −3072/1024 | **−6820/1440** · −6820/1440 · −5760/1920 |

**`n000050` — hero aspect-ratio box**
- SOURCE: `.css-1uvs8q8 { position:relative; top:-120px }` + inline `style="aspect-ratio: 1.76 / 1;"` (desktop); width comes from block flow (auto).
- OBSERVER: computed `width:1440px; height:818.172px; aspect-ratio:1.76 / 1; top:-120px`. `layoutRules` = only `position`, `top`. The inline `style` attribute is not stored (`attributes` = class only).
- SITE SPEC: same; token `st000176`.
- RECONSTRUCTION: `full-width {width:auto}`, shipped. Residual audit (manifest) records clone width **1439.97 at 899/1100/1200/1440/1920**, consequence `offscreen`, reason `inline-size:emitted-full-width`.
- GENERATED PIPELINE: `.wr-st000176 { width:1440px; height:818.172px; aspect-ratio:1.76 / 1 }` (L353) + `n000050 { width:auto }` (L2566). A definite height plus aspect-ratio makes the width follow the height (818.172 × 1.76).
- GENERATED MANUAL: fluid-desktop adds `height:auto` (C L2567). The layout-modes pass adds `n000051,n000052 {height:auto}` (C L12598).
- → LOSS POINT: the observer drops the inline `style` attribute (`src/observer/types.ts:477` `ATTR_WHITELIST` has no `style`; `collect-dom.ts:1280` `collectMatchedLayoutRules` only walks the stylesheet index). The computed aspect-ratio survives anyway. **The actual loss is in RECONSTRUCTION**: only the inline-size family is ever unfrozen (`AUTHORED_INTENT_PROPERTIES`, `layout-inference.ts:4582`, residual families = `width` only, `layout-inference.ts:2828`), so the frozen `height` in the `.wr-st` class (`style-generator.ts:471`) stays.

**`n000051` — swiper-container**
- SOURCE: `.swiper-container { width:100%; margin:0 auto }`.
- OBSERVER / SITE SPEC: `layoutRules`/`authoredLayout` include `width:100%` and `margin-left/right:auto`. Computed `width:1440px; height:813px`.
- RECONSTRUCTION: `full-width {width:auto}`, shipped (P L2569).
- GENERATED PIPELINE: fluid in principle, but its parent `n000050` is frozen at 1440 → 0/1440 everywhere.
- → LOSS POINT: none on this node; it inherits the `n000050` height freeze and the `n000005` clamp.

**`n000053` — swiper track (transform)**
- SOURCE: `.swiper-wrapper { display:flex; width:100%; height:100% }` + JS inline `transform: translate3d(-3·vw px,0,0)` (active index 3).
- OBSERVER: computed `transform: matrix(1,0,0,1,-6820.31,0)`. This was captured mid-autoplay, so it is not −4320 = −3×1440. The inline transform is not stored.
- SITE SPEC: token `st000579` carries the frozen matrix.
- RECONSTRUCTION: `full-width {width:auto}`. No transform inference exists.
- GENERATED PIPELINE: `.wr-st000579 { transform:matrix(1,0,0,1,-6820.31,0); width:1440px }` (L1021) + `width:auto` (L2575).
- GENERATED MANUAL: fluid-desktop **deleted** the pipeline `width:auto`. Layout-modes adds `n000053 { width:auto; height:auto; transform:translateX(-300%) }` (C L12608) plus child rules (C L12613-12627).
- → LOSS POINT: OBSERVER. JS-authored inline transform: `ATTR_WHITELIST` has no `style`, and the computed matrix is a time-sampled px value. RECONSTRUCTION never re-derives transforms (frozen in `.wr-st`).

---

## Region 2 — Experience section (+ content wrapper that bounds regions 2-5)

| node | path | SOURCE 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1100 | @1440 | @1920 |
|---|---|---|---|---|---|---|
| `n000166` content wrapper | R.2.1 | 0/vw at all widths | 0/1024 · 0/1024 · 0/1024 | = | = | **0/1440** · 0/1920 · 0/1920 |
| `n000169` exp outer | R.2.1.1.0 | 0/vw | 0/1024 ×3 | = | = | **0/1440** · 0/1920 · 0/1920 |
| `n000170` exp group | R.2.1.1.0.0 | 20/350 · 95/510 · 16.1/991.8 · 54.1/991.8 · 224.1/991.8 · 464.1/991.8 | 16.1/991.8 · **0/1024** · 16.1/991.8 | 54.1/991.8 · **0/1100** · 54.1/991.8 | 224.1/991.8 · **0/1440** · 224.1/991.8 | **224.1/991.8** · **0/1920** · 464.1/991.8 |
| `n000174` exp text | R.2.1.1.0.0.2 | 20/350 · 95/510 · 606.1/401.8 · 644.1/401.8 · 814.1/401.8 · 1054.1/401.8 | 606.1 · **590** · 606.1 | 644.1 · **590** · 644.1 | 814.1 · **590** · 814.1 | **814.1** · **590** · 1054.1 |

**`n000166` — content wrapper**
- SOURCE: `.css-ufcztx { max-width:1920px; margin:0 auto }`.
- OBSERVER: computed `width:1440px; max-width:1920px; margin-left:0px`. The auto margin resolved to 0 at 1440. `layoutRules` keep `max-width:1920px`, `margin:0px auto`, `margin-left:auto`, `margin-right:auto`. Probe tops out at 1920 (`widthProvenance.guaranteedFloorWidths [390,1024,1920]`), so the cap never visibly engages.
- SITE SPEC: `authoredLayout` identical. Token `st000859` has `max-width:1920px; margin-left:0px`.
- RECONSTRUCTION: `full-width {width:auto}` (fills the parent at every probe width). The centered-max-width branch needs the cap engaged at ≥2 probe widths, which never happens at ≤1920. The authored `margin-left/right:auto` is then refused as `already-recovered`.
- GENERATED PIPELINE: `.wr-st000859 { max-width:1920px; margin-left:0px; margin-right:0px; width:1440px }` (L1461) + `n000166 { width:auto }` (L2617). The 1920 cap survives, but left-pinned.
- GENERATED MANUAL: layout-modes `n000166, n000623 { margin-left:auto; margin-right:auto }` (C L12479).
- CLONE: P is 1440 wide at 1920 only because `n000005` is clamped.
- → LOSS POINT: RECONSTRUCTION. The full-width branch emits only `{width}` (`layout-inference.ts:6376-6390`), then the authored-intent pass is gated off (`6690` → `4949 already-recovered`). Contributing: the OBSERVER probe has no width above the cap (`src/observer/probe-widths.ts`, floor max 1920).

**`n000170` — content-sized centered group**
- SOURCE: `.css-1xhj18k { display:flex; flex-direction:row }`. Width is content-sized (510 image + 80 gap + 402 text = 991.77). The parent `n000169` `.css-e3kkrk { display:flex; justify-content:center }` centers it.
- OBSERVER: computed `width:991.766px`. `layoutRules` hold `display`/`flex-direction` only. Probe: 991.77 constant for ≥1024, 900 @900, 510 @≤899 (mobile render).
- SITE SPEC: same; token `st001147`.
- RECONSTRUCTION: `damage-clamped-width {max-width:100%}` (evidence: "overhangs … by 92.77px at 899px").
- GENERATED PIPELINE: `.wr-st001147 { width:991.766px }` (L1994) + `max-width:100%` (L2629). Parent `.wr-st000107 { justify-content:center }` (L238) + `n000169 { width:auto }` (L2626).
- GENERATED MANUAL: fluid-desktop changed it to `width:100%`, which broke centering (F: x=0, w=vw). Layout-modes changed that to `width:auto` (C L2628), which restores the pipeline behaviour.
- CLONE: **P is correct at 1024/1100/1440.** At 1920 it only fails through the `n000005` clamp.
- → LOSS POINT: none in the pipeline (the semantic lives in the parent's computed `justify-content:center`, which survives). **The MANUAL fluid-desktop patch introduced the regression, and layout-modes undid it.**

---

## Region 3 — Portfolio section 1

| node | path | SOURCE 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1100 | @1440 | @1920 |
|---|---|---|---|---|---|---|
| `n000192` heading row | R.2.1.3.0.0.0 | 20/350 · 20/660 · 40/944 · 40/1020 · 40/1360 · 40/1840 | **40/1360** · **40/1360** · 40/944 | **40/1360** · **40/1360** · 40/1020 | 40/1360 ×3 | **40/1360** · **40/1360** · 40/1840 |
| `n000196` CTA button | R.2.1.3.0.0.0.2 | – · – · 754.3/229.7 · 830.3/229.7 · 1170.3/229.7 · 1650.3/229.7 | **1170.3** · **1170.3** · 754.3 | **1170.3** · **1170.3** · 830.3 | 1170.3 ×3 | **1170.3** · **1170.3** · 1650.3 |
| `n000208` card slide 0 | R.2.1.3.0.2.0.0.0.0 | 20/350 · 20/660 · 50/274.7 · 50/300 · 50/413.3 · 50/573.3 | **50/413.3** · **50/413.3** · 50/274.7 | **413.3** · **413.3** · 300 | 413.3 ×3 | **413.3** · **413.3** · 573.3 |

**`n000192` — heading row (container width = parent content box)**
- SOURCE: `.css-69i1ev { display:flex; justify-content:space-between; align-items:center }`. Width comes from block flow inside `n000191` `.css-… { padding-left:40px; padding-right:40px }`.
- OBSERVER: computed `width:1360px`. Probe `w` = parent − 80 at every desktop width (820 @900 … 1840 @1920), but 859 @899 (mobile render: 20px padding).
- SITE SPEC: identical `authoredLayout` (no width declaration), token `st000108`.
- RECONSTRUCTION: **no candidate (`no-branch-matched`)**. The residual audit records clone width 1360 at 899/1100/1200/1440/1920, consequence `offscreen`. The full-width predicate must hold at every served desktop probe width. The served desktop range is `[801,∞)` (product policy), so the 899 sample (mobile render, 20px padding) breaks it. **Counterfactual with the source's own 900 breakpoint: `full-width {width:auto}` is emitted.**
- GENERATED PIPELINE: `.wr-st000108 { width:1360px; justify-content:space-between }` (L240). No node rule.
- GENERATED MANUAL: layout-modes `n000192, n000418 { width:auto }` (C L12499).
- → LOSS POINT: RECONSTRUCTION, breakpoint policy. `responsive-plan.ts:89` (`desktopMinPx: 801`, manifest `inferredAuthoredPx: 900` recorded but not served) → probe split `layout-inference.ts:4529-4530` (`resolveViewportProbe`: `width >= breakpoint`) → `fullWidthEverywhere` fails (`6357-6361`) → fall-through `outcome("no-branch-matched")` `6487`.

**`n000196` — CTA (space-between anchored)**
- SOURCE: `.css-pqgi1 { display:inline-flex; min-width:64px; height:70px; padding:0 30px }` + inline `width: inherit`.
- OBSERVER / SITE SPEC: `min-width:64px` etc. kept. Computed `width:229.734px`.
- RECONSTRUCTION: `authored-inline-size {min-width:64px; width:auto}`, shipped (P L2656).
- CLONE: correct size. The position is wrong in P/F because it is anchored to the frozen `n000192` (x stays 1170 → overflows at 1024/1100).
- → LOSS POINT: inherited from `n000192` (breakpoint policy).

**`n000208` — card slide (3 per view, JS-sized)**
- SOURCE: swiper.css `.swiper-slide { width:100%; flex-shrink:0 }`, **overridden by JS inline** `style="width: 274.667px; margin-right: 50px"` @1024 / `300px` @1100 / `413.333px` @1440 / `573.333px` @1920 (= (wrapper − 100)/3).
- OBSERVER: computed `width:413.328px; margin-right:50px`. `layoutRules` say `width:100%`, which is **misleading**: the stylesheet rule is recorded while the winning inline declaration is not. Probe records the true per-width sizes.
- SITE SPEC: same; token `st000562`.
- RECONSTRUCTION: no rule. It is a flex-row item of `n000207` → `flex-item-main-axis`. The authored `width:100%` is inconsistent with truth (413/1340). The residual audit lists sibling slides `n000246/247/248/252/253` frozen at 413.31, `offscreen`.
- GENERATED PIPELINE: `.wr-st000562 { width:413.328px; margin-right:50px; flex-shrink:0 }` (L993).
- GENERATED MANUAL: layout-modes `n000207 > *, n000433 > * { width:calc((100% - 100px) / 3) }` (C L12511), plus image/height rules (C L12515-12520, L12670-12678).
- → LOSS POINT: OBSERVER. The semantic "slidesPerView 3, spacing 50" is JS config, visible only as inline px per width; `ATTR_WHITELIST` (`types.ts:477`) has no `style`. RECONSTRUCTION also refuses flex-row items by design (`layout-inference.ts:1455`) and has no carousel/track model.

---

## Region 4 — Portfolio section 2 (mirror of region 3)

| node | path | SOURCE 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1920 |
|---|---|---|---|---|
| `n000418` heading row | R.2.1.4.0.0.0 | 40/944 · 40/1020 · 40/1360 · 40/1840 | **40/1360** · **40/1360** · 40/944 | **40/1360** · **40/1360** · 40/1840 |
| `n000433` swiper-wrapper | R.2.1.4.0.2.0.0.0 | 50/924 · 50/1000 · 50/1340 · 50/1820 | 50/924 · 50/924 · 50/924 | **50/1340** · 50/1820 · 50/1820 |
| `n000434` card slide 0 | R.2.1.4.0.2.0.0.0.0 | 50/274.7 · 50/300 · 50/413.3 · 50/573.3 | **413.3** · **413.3** · 274.7 | **413.3** · **413.3** · 573.3 |

- `n000418`: identical chain to `n000192`. The residual audit records clone 1360 @899…1920 `no-branch-matched`. PIPELINE = `.wr-st000108 width:1360px` only. MANUAL layout-modes `width:auto` (C L12499). → LOSS POINT: RECONSTRUCTION breakpoint policy (`responsive-plan.ts:89` → `layout-inference.ts:4529` → `6487`). With bp=900 it becomes `full-width {width:auto}`.
- `n000433` — SOURCE `.swiper-wrapper { width:100% }` (parent cardrow has inline `padding: 0 50px`). OBSERVER/SITE SPEC keep `width:100%`. RECONSTRUCTION: `authored-inline-size {width:100%}`, shipped (P L3132). **The pipeline preserved the authored semantic** (correct at ≤1440). The 1920 miss is the `n000005` clamp. MANUAL adds child rules (C L12512-12521). Note: with bp=900 this becomes `full-width {width:auto}` instead (equivalent).
- `n000434` — same as `n000208`: JS inline width, OBSERVER loss plus the flex-row refusal. MANUAL `calc((100% - 100px)/3)` (C L12511).
- Cardrow `n000432`: SOURCE inline `padding:0 50px` (≥900) / `0 20px` (<900). The OBSERVER computed padding is kept, but `layoutRules` show `.swiper { padding:0px }`, again stylesheet-only. RECONSTRUCTION `full-width {width:auto}` shipped (P L3129). MANUAL `height:auto` (C L12508).

---

## Region 5 — Testimonials

| node | path | SOURCE 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1100 | @1440 | @1920 |
|---|---|---|---|---|---|---|
| `n000528` 85% column | R.2.1.5.0 | 0/390 · 0/700 · 113.6/870.4 · 125/935 · 176/1224 · 248/1632 | **0/1024** · **0/1024** · 113.6/870.4 | **0/1100** · **0/1100** · 125/935 | 176/1224 · **0/1440** · 176/1224 | **176/1224** · **0/1920** · 248/1632 |
| `n000530` banner img | R.2.1.5.0.0.0 | 20/350 · 20/660 · 113.6/870.4 · 125/935 · 176/1224 · 248/1632 (h 154.8 @1024, 290.3 @1920) | **0/1024 h217.7** · **0/1024** · 113.6/870.4 h154.8 | **0/1100** · **0/1100** · 125/935 | 176/1224 · **0/1224** · 176/1224 | **176/1224 h217.7** · **0/1224** · 248/1632 h290.3 |
| `n000547` slide 0 | R.2.1.5.0.2.0.0.0 | 20/350 · 20/660 · 113.6/256.7 · 125/278.3 · 176/374.7 · 248/510.7 | **0/374.6** · **0/374.6** · 113.6/256.8 | **0/374.6** · **0/374.6** · 125/278.3 | 176/374.6 · **0/374.6** · 176/374.7 | **176/374.6** · **0/374.6** · 248/510.7 |

**`n000528` — `width:85%` column**
- SOURCE: `.css-a35cbc { width:85% }`. Parent `n000527` `.css-1bvc4cc { display:flex; justify-content:flex-end }`, followed by the 40px gutter `n000617 { width:40px }`.
- OBSERVER: computed `width:1224px`. `layoutRules`: `width:85%` (no media). Probe ratio exactly 0.85 at 900…1920. At 899 (mobile render, class `css-8atqhb`) the width is 899 = 100%.
- SITE SPEC: `authoredLayout` keeps `width:85%` verbatim. Token `st000981` `width:1224px`.
- RECONSTRUCTION (served bp 801): `damage-clamped-width {max-width:100%}` (evidence "overhangs by 325px at 899px"). The `authoredInlineSizeIntent` pass then skips the `85%` as `already-recovered`. **Counterfactual bp 900: `percentage-width {width:85%}` is emitted.**
- GENERATED PIPELINE: `.wr-st000981 { width:1224px }` (L1649) + `n000528 { max-width:100% }` (L3318). The column shrinks with max-width below 1440 (fills 100%, not 85%) and is frozen above 1440.
- GENERATED MANUAL: fluid-desktop `width:100%` (F: x=0 at all widths, a regression at 1440). Layout-modes `width:85%` (C L3333) + `n000617 { flex-shrink:0; height:auto }`.
- → LOSS POINT: RECONSTRUCTION. Breakpoint policy `responsive-plan.ts:89` puts the 899 sample in the desktop range → the percentage ratio is not constant (`layout-inference.ts:6404-6410`) → fall-through to `tryDamageClamp` (`5984`/`2456`) → `inlineSizeAnswered` (`6644-6653`) → `already-recovered` (`6690`→`4949`). Survives observer: yes. SiteSpec: yes. Pipeline CSS: no.

**`n000530` — banner `<img>`**
- SOURCE: no stylesheet layout rule. Inline `style="object-fit:cover; width:100%; max-width:100%"` (+ `min-height:160px` <900).
- OBSERVER: `attributes` = `src` only (inline style dropped). `layoutRules` = []. Computed `width:1224px; max-width:100%; height:217.688px`.
- SITE SPEC: same; token `st001196`.
- RECONSTRUCTION: no rule (`display:inline` → dropped before inline-size, `node-display-inline`).
- GENERATED PIPELINE: `.wr-st001196 { display:inline; width:1224px; max-width:100%; height:217.688px }` (L2071).
- GENERATED MANUAL: layout-modes `n000530 { width:100%; height:auto }` (C L12552).
- → LOSS POINT: OBSERVER (inline `width:100%` never recorded: `types.ts:477`, `collect-dom.ts:1280`). RECONSTRUCTION also freezes `height` (no height family).

**`n000547` — testimonial slide**: same pattern as `n000208`. JS inline `width: 374.667px; margin-right:50px` @1440 = (column − 100)/3. OBSERVER drops the inline value; RECONSTRUCTION gives flex-row items no rule (residual lists sibling `n000569` frozen 374.66, `offscreen`). PIPELINE `.wr-st000549 { width:374.656px }` (L969). MANUAL `n000546 > * { width:calc((100% - 100px) / 3) }` (C L12559). `n000546` (wrapper): PIPELINE `max-width:100%` (damage clamp, P L3339); fluid-desktop added `width:auto` (C L3355).

---

## Region 6 — Bottom media / footer

| node | path | SOURCE 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1100 | @1440 | @1920 |
|---|---|---|---|---|---|---|
| `n000621` bottom `<img>` | R.4.0.0 | 0/390 · 0/700 · 0/1024 · 0/1100 · 0/1440 · 0/1920 (h 499 · 760 · 405.6 · 435.7 · 570.4 · 760) | 0/1024 **h570.4** · 0/1024 **h570.4** · 0/1024 h405.6 | same pattern | 0/1440 ×3 | **0/1440** · **0/1440** · 0/1920 h760 |
| `n000623` footer container | R.4.1.0 | 0/vw at all (cap 1920) | 0/1024 ×3 | = | = | **0/1440** · 0/1920 · 0/1920 |
| `n000628` link row | R.4.1.0.1.0.0 | – · – · 307.2/616.8 · 330/670 · 432/908 · 576/1244 | **110.8/908** · 307.2/616.8 · 307.2/616.8 | **164.1/908** · 330/670 · 330/670 | 432/908 ×3 | **432/908** · 576/1244 · 576/1244 |
| `n000700` link column 3 | R.4.1.0.1.0.0.2 | – · – · 718.4/205.6 · 776.7/223.3 · 1037.3/302.7 · 1405.3/414.7 | **716.1/302.7** · **307.2/302.6** · 718.4/205.6 | **769.4/302.7** · **330/302.6** · 776.7/223.3 | 1037.3/302.7 ×3 | **1037.3/302.7** · 1405.3/414.7 · 1405.3/414.7 |

**`n000621` — full-bleed bottom image**
- SOURCE: no stylesheet rule. Inline `style="max-height:760px; width:100%; object-fit:cover; object-position:center; max-width:100%"` (+ `min-height:480px` <900).
- OBSERVER: `attributes` = `src` only. `layoutRules` = []. Computed `width:1440px; max-width:100%; max-height:760px; height:570.375px`.
- SITE SPEC: same; token `st001214`.
- RECONSTRUCTION: no rule (inline display).
- GENERATED PIPELINE: `.wr-st001214 { display:inline; width:1440px; max-width:100%; height:570.375px }` (L2089). The image shrinks via max-width below 1440 but keeps its height; it never grows above 1440.
- GENERATED MANUAL: layout-modes `n000621 { width:100%; height:auto }` (C L12574) + `n000620 height:auto`.
- → LOSS POINT: OBSERVER (inline `width:100%` dropped, `types.ts:477`/`collect-dom.ts:1280`). RECONSTRUCTION: inline-display gate and no height unfreeze.

**`n000623` — footer container**
- SOURCE: `.css-1qi39fj { display:flex; max-width:1920px; margin:0 auto; padding:120px 0 }`.
- OBSERVER / SITE SPEC: `authoredLayout` keeps `max-width:1920px`, `margin-left/right:auto`. Computed `margin-left:0px`.
- RECONSTRUCTION: `full-width {width:auto}` shipped (P L3368). Authored auto margins skipped as `already-recovered`.
- GENERATED PIPELINE: `.wr-st000194 { max-width:1920px; margin-left:0px; width:1440px }` (L376) + `width:auto`.
- GENERATED MANUAL: layout-modes `margin-left/right:auto` (C L12479).
- → LOSS POINT: RECONSTRUCTION (`layout-inference.ts:6376-6390` full-width emits `{width}` only; `6690`→`4949`). Beyond 1920 the centering is also unobservable (probe max 1920).

**`n000628` / `n000700` — MUI Grid: 3 columns ≥900**
- SOURCE: `n000628 .css-1d3bbye { display:flex; width:100%; flex-wrap:wrap }`. `n000700 .css-19egsyp { flex-basis:100%; max-width:100% }` plus `@media (min-width:600px) 100%`, `@media (min-width:900px) { flex-basis:33.3333%; max-width:33.3333% }`, same at 1200/1536.
- OBSERVER: `n000700 layoutRules` keep all media-scoped declarations **with their `media` strings**. Computed `flex-basis:33.3333%; max-width:33.3333%; width:302.656px`.
- SITE SPEC: `authoredLayout` verbatim, incl. `media`. Token `st000645`.
- RECONSTRUCTION: `n000628` gets `damage-clamped-width {max-width:100%}` (its authored `width:100%` is `already-recovered`). `n000700` gets `authored-inline-size {max-width:100%; width:auto}`. The `(min-width:900px) 33.3333%` declarations are refused `media-partial-range` because the served range starts at 801. With bp=900 the candidate becomes `{max-width:33.3333%; width:auto}`. `flex-basis` is not an authored-intent property at all.
- GENERATED PIPELINE: `.wr-st001168 { width:908px }` + `n000628 { max-width:100% }` (L3377). `.wr-st000645 { flex-basis:33.3333%; max-width:33.3333%; width:302.656px }` (L1120) + `n000700 { max-width:100%; width:auto }` (L3448). The row stays 908 because the frozen descendant widths keep the flex parents at min-content (P x=110.8 @1024 → overflow).
- GENERATED MANUAL: fluid-desktop `n000628 { width:100% }` (C L3395), which already fixes it (F correct). Layout-modes adds `n000628 > * { max-width:33.3333% }` (C L12654).
- → LOSS POINT: RECONSTRUCTION. `damageClampWidth`+`already-recovered` for the row (`2456`, `6690`→`4949`). For the column, `authoredMediaHolds` → `media-partial-range` (`layout-inference.ts:5016-5022`) caused by the 801 policy (`responsive-plan.ts:89`).

---

## Region 7 — Floating CTA

| node | path | SOURCE 390 · 700 · 1024 · 1100 · 1440 · 1920 | CLONE P · F · C @1024 | @1100 | @1440 | @1920 |
|---|---|---|---|---|---|---|
| `n000039` fixed wrapper | R.1 | 332/58 · 642/58 · 944/80 · 1020/80 · 1360/80 · 1840/80 | **1360/80** · 944/80 · 944/80 | **1360** · 1020 · 1020 | 1360 ×3 | **1360** · 1840 · 1840 |
| `n000040` button | R.1.0 | 332/44 · 642/44 · 944/56 · 1020/56 · 1360/56 · 1840/56 | **1360/56** · 944 · 944 | **1360** · 1020 · 1020 | 1360 ×3 | **1360** · 1840 · 1840 |

Vertical (from `03-geometry-source-vs-clone.md`): source y = viewport h − 216 (`bottom:50px`). Clone BEFORE layout-modes (F) y = 684 fixed. P has the same frozen `top:684px`.

- SOURCE: `.css-wkl4sw { position:fixed; right:0; bottom:50px; display:flex; flex-direction:column; align-items:flex-end; padding:0 24px 42px 0 }`. No left/top/width authored.
- OBSERVER: `layoutRules` keep `position:fixed`, `right:0px`, `bottom:50px`. Computed insets are **all four resolved**: `left:1360px; right:0px; top:684px; bottom:50px; width:80px; height:166px`. Probe: right edge = vw at every width.
- SITE SPEC: `authoredLayout` identical. Token `st000132` carries all four px insets.
- RECONSTRUCTION: no rule. `position:fixed` → `node-out-of-flow` in authored intent (`layout-inference.ts:4963-4966`). Inline size: out-of-flow shrink-to-fit/width constant (`insetResolved` refusals `width-constant` 337, manifest).
- GENERATED PIPELINE: `.wr-st000132 { position:fixed; left:1360px; right:0px; top:684px; bottom:50px; width:80px }` (L287). This is over-constrained, so left and top win.
- GENERATED MANUAL: fluid-desktop `.wr-st000132 { left:auto }` (C L12438). Layout-modes `.wr-st000132 { top:auto }` (C L12683) and `.wr-st000131 { top:auto; left:auto }` (mobile).
- → LOSS POINT: RECONSTRUCTION / style generation. The authored insets (`right`, `bottom`) are in SiteSpec, but `generateStylesheet` (`style-generator.ts:471`) ships the resolved computed `left`/`top` too, and no inference branch handles inset properties of fixed boxes (`AUTHORED_INTENT_PROPERTIES` `4582` has no insets; `authoredInlineSizeIntent` exits `node-out-of-flow` `4963-4966`; `inlineSizeBehaviour` out-of-flow branch `1433-1441`).

---

## Summary table

"Survives" = the authored responsive semantic is still present in a usable form at that stage.

| # | node | authored responsive semantic | survives observer? | SiteSpec? | generated (pipeline)? | loss stage | manual patch |
|---|---|---|---|---|---|---|---|
| 0 | `n000005` page root | `width:100%` (flex item) | yes (layoutRules) | yes | no (`max-width:100%` clamp on frozen 1440) | RECON: flex-row refusal → damage clamp → already-recovered | fluid-desktop `width:100%` → restored |
| 1 | `n000050` hero box | inline `aspect-ratio:1.76/1`, width auto | partial (computed aspect-ratio; inline attr dropped) | partial | partial (`width:auto`, but frozen height → 1439.97 everywhere) | RECON: height/aspect-ratio never unfrozen | fluid-desktop `height:auto` → restored |
| 1 | `n000053` hero track | JS inline `translate3d(−3·vw)` | no (inline dropped; time-sampled matrix) | no | no (frozen `matrix(…,-6820.31)`) | OBSERVER | layout-modes `translateX(-300%)` static pin → approximated |
| 2 | `n000166` content wrapper | `max-width:1920px; margin:0 auto` | yes | yes | partial (cap yes, `margin:auto` no) | RECON: full-width emits width only + already-recovered (probe max 1920) | layout-modes `margin:auto` → restored |
| 2 | `n000170` exp group | content-sized, centered by parent `justify-content:center` | yes (computed) | yes | **yes** (correct ≤1440) | — (pipeline OK; >1440 only via `n000005`) | fluid-desktop **broke** it (`width:100%`); layout-modes reverted |
| 3 | `n000192` pf1 heading row | fills parent content (40px padding), space-between | yes (probe) | yes | no (frozen 1360) | RECON: 801 breakpoint policy → 899 sample → no-branch-matched | layout-modes `width:auto` → restored |
| 3 | `n000196` pf1 CTA | `min-width:64px`, auto width | yes | yes | yes (position inherits `n000192` loss) | inherited | — |
| 3 | `n000208` pf1 slide | JS inline width = (wrapper−100)/3 | no (inline dropped; layoutRules show overridden `width:100%`) | probe only | no (frozen 413.3) | OBSERVER (+ RECON flex-row refusal, no carousel model) | layout-modes `calc((100% - 100px)/3)` → reintroduced (hand-derived) |
| 4 | `n000418` pf2 heading row | same as `n000192` | yes | yes | no | RECON: 801 policy | layout-modes → restored |
| 4 | `n000433` pf2 swiper-wrapper | `width:100%` | yes | yes | **yes** (`authored-inline-size`) | — | child rules only |
| 4 | `n000434` pf2 slide | JS inline width | no | probe only | no | OBSERVER (+RECON) | layout-modes calc → reintroduced |
| 5 | `n000528` ts column | `width:85%` | yes | yes | no (`max-width:100%` on frozen 1224) | RECON: 801 policy → damage clamp → already-recovered | fluid-desktop `width:100%` (regression) → layout-modes `85%` → restored |
| 5 | `n000530` ts banner img | inline `width:100%` | no (inline dropped) | no | no (frozen 1224×217.7) | OBSERVER (+RECON height freeze) | layout-modes `width:100%; height:auto` → restored |
| 5 | `n000547` ts slide | JS inline width | no | probe only | no | OBSERVER (+RECON) | layout-modes calc → reintroduced |
| 6 | `n000621` bottom img | inline `width:100%; max-height:760px` | partial (computed max-width 100%, max-height; inline width dropped) | partial | partial (shrinks ≤1440 with frozen h, no growth) | OBSERVER (+RECON height freeze) | layout-modes `width:100%; height:auto` → restored |
| 6 | `n000623` footer container | `max-width:1920px; margin:0 auto` | yes | yes | partial (cap yes, margin no) | RECON: full-width + already-recovered | layout-modes margin auto → restored |
| 6 | `n000700` footer link col | `@media (min-width:900px) flex-basis/max-width:33.3333%` | yes (with media) | yes | partial (`max-width:100%; width:auto`; 33.33% refused) | RECON: `media-partial-range` via 801 policy; parent `n000628` damage clamp | fluid-desktop `n000628 width:100%` + layout-modes `> * max-width:33.3333%` → restored |
| 7 | `n000039` floating CTA | `position:fixed; right:0; bottom:50px` | yes (layoutRules) but computed left/top also stored | yes | no (left:1360 / top:684 win) | RECON/style-gen: resolved insets frozen, fixed boxes skipped | fluid-desktop `left:auto` + layout-modes `top:auto` → restored |

### Loss-stage histogram (18 node rows; 2 rows had no pipeline loss)

| loss stage | count | nodes |
|---|---|---|
| RECONSTRUCTION — breakpoint policy 801 vs authored 900 (the 899 probe sample poisons desktop predicates) | 4 | `n000192`, `n000418`, `n000528`, `n000700` |
| RECONSTRUCTION — flex-row refusal / damage clamp, authored intent then gated `already-recovered` (same mechanism also finishes `n000528` and `n000628`) | 1 | `n000005` |
| RECONSTRUCTION — full-width branch drops `margin:auto` (cap unobservable ≤1920) | 2 | `n000166`, `n000623` |
| RECONSTRUCTION — non-width families frozen (height/aspect-ratio, fixed insets) | 2 | `n000050`, `n000039` |
| OBSERVER — inline `style` attribute (JS/React-authored) not captured | 6 | `n000053`, `n000208`, `n000434`, `n000547`, `n000530`, `n000621` |
| SITE SPEC | **0** | `compile-viewport.ts:302-304` copies `layoutRules` → `authoredLayout` verbatim (only the class attribute is absent from `attributes`, the selector stays in authoredLayout) |
| no pipeline loss / inherited only | 3 | `n000170`, `n000433`, `n000196` |

Totals: **RECONSTRUCTION 9, OBSERVER 6, SITE SPEC 0.** Every OBSERVER-lost node except the hero track also hits a RECONSTRUCTION limit (height freeze or flex-row refusal), so fixing capture alone would not restore them.

Counterfactual check (in memory, same SiteSpec, breakpoint 900 = the source's own authored breakpoint that the manifest records as `inferredAuthoredPx`): `n000192`/`n000418` → `full-width width:auto`, `n000528` → `percentage-width 85%`, `n000546` → `full-width`, `n000700` → `max-width:33.3333%; width:auto`. The 801 product policy alone accounts for 4 of the 9 reconstruction losses on these nodes. Truth-check acceptance of these counterfactual rules was not run.

## Did the manual patch reintroduce semantics the pipeline dropped?

- **Yes, for every pipeline loss in the 7 regions**, but by hand, as literal source-specific rules scoped to `p000001` desktop node ids (or shared `.wr-st` classes for the floating button). No generator change was made. Reintroduced: root fluidity (`n000005 width:100%`), hero height/aspect (`height:auto`), centered caps (`margin:auto` on `n000166`/`n000623`), heading rows (`width:auto`), `85%` column, 3-per-view track math (`calc((100% - 100px)/3)`), image `width:100%; height:auto`, footer `max-width:33.3333%`, fixed-button `left/top:auto`.
- **Two of them are not the authored semantic but a hand-derived equivalent**: the carousel slide widths (swiper JS config expressed as a calc) and the hero track (`translateX(-300%)` pins a static slide; source autoplay/transform is not reproduced).
- **The fluid-desktop pass also introduced regressions the pipeline did NOT have**: `n000170` (experience group) and `n000528` (testimonial column) were correct in PIPELINE at ≤1440 and broken by `width:100%` in F (x=0, w=vw). It also deleted the pipeline-native `n000053 width:auto`. Layout-modes repaired both.
- Net CURRENT geometry matches source at 1024/1100/1440/1920 for all probed nodes (± text-glyph width). None of this is reproducible by re-running the pipeline.

## Caveats

- PIPELINE CSS is reconstructed, not an original file. It is validated by exact byte size against the manifest and by the in-memory rule set; content equality beyond byte count is inferred.
- In-memory `inferLayoutRules()` output is pre-truth-check. "Shipped" was decided by presence in the reconstructed pipeline CSS.
- Source 390/700 cells come from the same DOM elements re-rendered with mobile classes (React swaps classes/children below 900). The clone serves its separate mobile tree below 801, so desktop-node clone cells are n/a there.
- The source hero autoplay makes transform values time-dependent. The observer's −6820.31 is one sample.
