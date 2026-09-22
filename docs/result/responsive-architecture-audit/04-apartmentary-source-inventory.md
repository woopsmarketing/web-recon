# 04 — apartmentary.com Live Source Inventory (Read-Only)

- Target: `https://apartmentary.com/` (homepage)
- Method: Playwright/Chromium, live network fetch, DOM/CSSOM inspection. No mutation, no form submit, no POST.
- Evidence dir: `/Users/woops/projects/web-recon/tmp/wr-resp-audit/live-inventory/`
- Scripts: `measure.cjs` (static CSS/DOM inventory @1440 and @390 + direct fetch/parse), `sweep2.cjs` (continuous resize sweep), `jump-analyze.cjs` (discontinuity detection), `analyze.cjs` (fluid-form + media-condition + breakpoint-impact analysis)

## 1. Stylesheets inventory

`document.styleSheets` total = **9** (both viewports identical — CSS is static, doesn't depend on viewport).

| # | href | owner | origin | CSSOM readable | rules | `crossorigin` attr |
|---|------|-------|--------|-----------------|-------|----------------------|
| 0 | (inline) | STYLE | same | yes | 20 | – |
| 1 | (inline) | STYLE | same | yes | 107 | – |
| 2 | (inline) | STYLE | same | yes | 157 | – |
| 3 | `https://apartmentary.com/_next/static/css/80139ea3111436a9.css` | LINK | same | yes | 214 | `false` (absent) |
| 4 | `https://apartmentary.com/_next/static/css/d7c08271dabb56dd.css` | LINK | same | yes | 40 | `false` (absent) |
| 5 | (inline) | STYLE | same | yes | 40 | – |
| 6 | (inline) | STYLE | same | yes | 4 | – |
| 7 | (inline) | STYLE | same | yes | 0 | – |
| 8 | (inline) | STYLE | same | yes | 14 | – |

- Same-origin: 9/9. Cross-origin: 0. SecurityError (unreadable CSSOM): 0.
- Every `<link rel=stylesheet>` is same-origin `_next/static/css/*` (Next.js build output) — there is no third-party/cross-origin stylesheet on the homepage, so the CORS/SecurityError case this audit was designed to catch does not occur here.

### Direct HTTP GET of each `<link rel=stylesheet>` href

| href | status | bytes | content-type |
|---|---|---|---|
| `.../80139ea3111436a9.css` | 200 | 29,372 | text/css; charset=UTF-8 |
| `.../d7c08271dabb56dd.css` | 200 | 7,384 | text/css; charset=UTF-8 |

Both fetched directly with `fetch()` and independently re-parsed via `new CSSStyleSheet().replaceSync(text)` in a blank page. Parsed rule counts (214 and 40) match the live CSSOM `cssRules.length` exactly — confirms the live-page CSSOM view is complete and not truncated/masked.

Raw JSON: `static-1440.json` (`.sheets`), `fetched-stylesheets-meta.json`, `fetched-stylesheets-parsed.json`.

## 2. Style mechanisms

| Mechanism | @1440 | @390 |
|---|---|---|
| `<link rel=stylesheet>` count | 2 | 2 |
| `<style>` element count | 7 | 7 |
| `<style>` empty textContent but nonzero CSSOM rules (Emotion/MUI "speedy" `insertRule`) | **2** (idx with 157 rules, idx with 14 rules) | 2 |
| Elements with `data-emotion` attr | 4 | 4 |
| `css-xxxxxx` (Emotion-generated) class names, unique | 105 | 91 |
| `Mui*` class names, unique | 29 | 27 |
| styled-components markers (`sc-*` class / `data-styled`) | 0 | 0 |
| Elements with inline `style=""` attribute | 255 | 235 |
| `.swiper-wrapper` elements | 4 | 4 |

**Framework identification:** Next.js (`window.__NEXT_DATA__` present, `#__next` root div, 10 `<script src="_next/static/...">` tags) + MUI v5 (Emotion CSS-in-JS: `data-emotion` cache tags, `Mui*` classes, "speedy" insertRule sheets with empty textContent). No styled-components.

**Inline style attribute — top properties (@1440, n=255 elements):**

| property | count |
|---|---|
| font-weight | 125 |
| white-space | 114 |
| word-break | 113 |
| width | 78 |
| max-width | 42 |
| height | 30 |
| object-fit | 26 |
| margin-right | 20 |
| padding | 17 |
| aspect-ratio | 15 |
| max-height | 15 |
| border-radius | 14 |
| cursor | 14 |
| min-width | 12 |
| transform | 7 |

At @390 the same top properties recur (font-weight 120, white-space 109, word-break 108, width 62, max-width 35 …) but total inline-styled element count drops 255→235, and `cssXxxxClassesCount` drops 105→91 — both are consequences of conditional rendering (fewer/different elements get Emotion `sx`-generated classes at different breakpoints), not a change in the stylesheets themselves.

**JS-computed geometry (swiper) — direct evidence of runtime, non-CSS responsive behavior:**

| viewport | wrapper transform | first slide inline style |
|---|---|---|
| 1440 | `translate3d(-4320px, 0px, 0px)` | `width: 1440px` (full-bleed hero) |
| 1440 (2nd swiper) | `translate3d(0px, 0px, 0px)` | `width: 413.333px; margin-right: 50px` |
| 390 | `translate3d(-1170px, 0px, 0px)` | `width: 390px` |
| 390 (2nd swiper) | `translate3d(0px, 0px, 0px)` | `width: 350px; margin-right: 50px` |

Swiper.js recomputes slide width and translate offset in JS on every resize — these values live only in the inline `style` attribute, not in any CSS rule, and are invisible to a purely-CSSOM-based responsive audit.

Raw JSON: `static-1440.json`, `static-390.json` (`.styleElInfo`, `.inlinePropTally`, `.swiperInfo`).

## 3. Responsive CSS surface (all readable CSSOM, native + independently re-parsed fetched sheets)

| Rule type | count |
|---|---|
| `@media` rules | 43 |
| unique media condition texts | 8 |
| `@container` | 0 |
| `@supports` | 0 |
| nested rules inside `@media` blocks | 79 |

### All 8 unique media conditions (with occurrence count)

| count | condition |
|---|---|
| 18 | `(hover: none)` |
| 13 | `print` |
| 3 | `screen and (min-width: 900px)` |
| 2 | `(min-width: 600px)` |
| 2 | `(min-width: 900px)` |
| 2 | `(min-width: 1200px)` |
| 2 | `(min-width: 1536px)` |
| 1 | `screen` |

**Numeric breakpoints extracted, sorted:** `600, 900, 1200, 1536` (all px, all `min-width`, no `max-width`-only breakpoints, no em/rem-based media breakpoints). These are exactly MUI's default theme breakpoints (`sm/md/lg/xl` = 600/900/1200/1536).

**Do the authored breakpoints affect layout-relevant properties** (display/width/max-width/grid-template-columns/flex-direction/padding/margin/position/font-size)?

| breakpoint | rules in this @media | rules touching a layout property | properties touched |
|---|---|---|---|
| 600 | 2 | 2 | `max-width` |
| 900 | 5 | 2 | `max-width` |
| 1200 | 2 | 2 | `max-width` |
| 1536 | 2 | 2 | `max-width` |

**Finding:** every layout-relevant declaration inside the 4 numeric `@media` breakpoints only sets `max-width` (this is MUI's `<Container maxWidth>` behavior). None of the 43 `@media` rules change `display`, `flex-direction`, `grid-template-columns`, or `position`. `(hover: none)` (18 rules, presumably touch-vs-pointer affordance) and `print` (13 rules) are the two largest media buckets by rule count, not the numeric breakpoints.

Raw JSON: `unique-media-conditions.json`, `authored-breakpoints.json`, `breakpoint-layout-impact.json`.

## 4. Authored fluid-form declarations

Scanned all 569 leaf style rules (all readable sheets, base + inside `@media`), split base vs. media:

| pattern | base | media | total |
|---|---|---|---|
| `%` values | 63 | 20 | 83 |
| `fr` (grid track) | 0 | 0 | 0 |
| `vw` | 5 | 0 | 5 |
| `vh` | 0 | 0 | 0 |
| `clamp(` | 0 | 0 | 0 |
| `calc(` | 4 | 0 | 4 |
| `min(` (function) | 1 | 0 | 1 |
| `max(` (function) | 0 | 0 | 0 |
| `min-width` / `max-width` (property) | 30 | 8 | 38 |
| `margin*: auto` | 8 | 0 | 8 |
| `repeat(` (grid) | 0 | 0 | 0 |

No `clamp()`, no `fr` units, no `repeat()` anywhere in the authored CSS — i.e. no CSS Grid fluid-sizing idiom and no fluid typography idiom is used at all. Fluidity is close to 100% just `%`, a handful of `vw`, and `max-width` caps.

**Examples (top, per category — full lists in `fluid-forms-report.json`):**

- `%`: `html { text-size-adjust: 100% }`, `.css-8atqhb { width: 100% }`, `.css-w22of0 { border-radius: 50% }`, `.css-sbzp1 { max-width: 100% }`
- `vw`: `.css-1lixjtn { top: 15.5vw }`, `.css-1wjxezk { height: 0.4vw }`, `.css-7v0zo8 { top: calc(8vw) }`, `html { width: 100vw }`
- `calc(`: `.css-7v0zo8 { top: calc(8vw) }`, `.ch-desk-messenger { width: calc(100% - 20px) !important }`, `.ch-desk-messenger { height: calc(100% - 86px) !important }`
- `min(`: `.css-myyl9c .MuiPaper-root { max-width: min(90%, 1280px) }`
- `min-width`/`max-width`: `.css-ufcztx { max-width: 1920px }`, `.css-7e3bvq { min-width: 64px }`, `.css-1ho082a { max-width: 50% }` (base) / `50%` again inside `(min-width:600px)`
- `margin auto`: `.css-ufcztx { margin: 0px auto }`, `.css-13o6z6d { margin: 0px auto }`, `.swiper-container { margin: 0px auto }`

Raw JSON: `fluid-forms-report.json`.

## 5. Framework / library fingerprint

- **Next.js:** confirmed — `window.__NEXT_DATA__` present, `<div id="__next">` root, 10 `<script src=".../_next/static/...">`.
- **MUI:** confirmed — `Mui*` classes (29 unique @1440), default MUI breakpoints (600/900/1200/1536) present verbatim in `@media`, MUI `Container`/`Backdrop`/`Paper`/`Box` component classes visible.
- **Emotion (MUI's CSS-in-JS engine):** confirmed — `data-emotion` cache tags, `css-xxxxxx` hashed class names (105 unique @1440), 2 "speedy" `<style>` tags with empty `textContent` but populated `cssRules` (rules inserted via `CSSOM insertRule`, invisible to any tool that reads `<style>.textContent` instead of `.sheet.cssRules`).
- **styled-components:** not present (0 `sc-*` classes, 0 `data-styled`).
- **Swiper.js:** confirmed via `.swiper-wrapper`/`.swiper-container` classes and JS-set inline `transform: translate3d(...)` + inline slide widths (see §2).
- Third-party widget: Channel.io (`.ch-desk-messenger` with `!important` calc() sizing) is loaded and injects its own CSS independent of the Next.js bundle.

## 6. Continuous resize sweep (authored vs. observed breakpoints)

Swept viewport width 390→1920px in 10px steps (163 samples total, plus ±1px around each authored breakpoint: 599/600/601, 899/900/901, 1199/1200/1201, 1535/1536/1537), each sample after a settle delay, measuring `document.documentElement.scrollWidth` vs `window.innerWidth` (horizontal-overflow check) and the bounding boxes of the real content sections (`#__next`'s non-backdrop child's direct children — header/hero row, floating action button, main content column, two footer blocks).

- **Horizontal overflow:** 0/163 samples had `scrollWidth > innerWidth` — no horizontal-scroll bug anywhere in 390–1920px.
- **Discontinuity detection** (section height changing far more than a proportional resize step would explain, comparing matched sections by class name between adjacent samples): **3 genuine discontinuities found**, all far larger than the smooth ~11–25px/10px-step baseline seen everywhere else:

| from → to width | Δheight (main content column) | note |
|---|---|---|
| 899 → 900 | +678px | lands exactly on the authored `900px` breakpoint |
| 900 → 901 | +819px | still resolving within the 900px transition (1px past it) |
| 930 → 940 | +388px | **no authored CSS breakpoint here** |

**Authored vs. observed comparison:**

| authored (CSS, static) | observed (live resize behavior) |
|---|---|
| 600, 900, 1200, 1536 (MUI defaults, `max-width` only) | Only **900** produced a measurable layout discontinuity in the sweep. 600, 1200, and 1536 produced no detectable jump beyond the smooth baseline — consistent with §3's finding that those three only ever set a `Container`'s `max-width` cap, which doesn't change the content column's *height*. |
| — | An **unauthored** jump exists at **~930–940px**, close to but not aligned with any CSS `@media` breakpoint. Given the swiper JS evidence in §2, this is most likely a JS-side breakpoint (e.g. a slides-per-view / layout config keyed to `window.innerWidth` inside Swiper or a component's own resize handler) rather than anything expressible in the CSSOM. This is a blind spot for any CSS-only responsive-breakpoint extraction. |

Raw JSON: `resize-sweep-raw-v2.json` (163 samples × section boxes), `resize-sweep-jumps-v2.json` (3 flagged discontinuities with full deltas). (`resize-sweep-raw.json` / `resize-sweep-jumps.json` are a superseded first pass that measured the wrong DOM level — `document.querySelector('main')` doesn't exist on this page, so its "sections" collapsed to a single full-bleed wrapper div; v2 drills into `#__next`'s real content root and is the authoritative sweep.)

## Evidence file index

All under `/Users/woops/projects/web-recon/tmp/wr-resp-audit/live-inventory/`:

- `static-1440.json`, `static-390.json` — full per-viewport DOM/CSSOM snapshot (sheets, style mechanisms, all rule records, media conditions raw)
- `fetched-stylesheets-meta.json`, `fetched-stylesheets-parsed.json` — direct-fetch status/bytes + independent CSSOM re-parse
- `unique-media-conditions.json`, `authored-breakpoints.json`, `breakpoint-layout-impact.json` — §3 derived data
- `fluid-forms-report.json` — §4 derived data (counts + up to 20 examples per pattern)
- `resize-sweep-raw-v2.json`, `resize-sweep-jumps-v2.json` — §6 sweep + discontinuity detection (authoritative)
- `resize-sweep-raw.json`, `resize-sweep-jumps.json` — §6 first-pass sweep (superseded, kept for reference)
- `measure.cjs`, `sweep2.cjs`, `jump-analyze.cjs`, `analyze.cjs` — scripts used to produce the above
