# apartmentary.com Clone — Wide/Fluid Desktop Responsive Fix

**Date**: 2026-09-14
**Target**: `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app`
**Sub-reports**: `docs/result/apartmentary-fluid-desktop/` (root-cause
investigation, fix implementation, verification measurements — each with
more detail and raw data than this synthesis)

## 1. Root cause

The recon engine only ever observed two viewports (390 mobile, 1440
desktop), so every desktop layout node's generated CSS class carries a
**literal captured pixel value** for width/height/position. A partial,
already-shipped "relax the literal width" override pass (`width: auto` /
`max-width: 100%` per `[data-wr-page][data-wr-viewport] [data-wr-node]`
selector) already made most containers correctly fluid **between** 801px and
1440px — but it left three distinct gaps that only show up **above** 1440px
(and, for two elements, at every width):

1. **42 nodes** (on `/` and `/service`) had only `max-width: 100%` with no
   companion `width` declaration. `max-width` alone can shrink a fixed
   `width` down, but can never grow it past itself — so these nodes,
   including the single top-level wrapper (`n000005`) that contains the
   header, floating button, main content, and footer on both pages, stayed
   glued to exactly 1440px at any wider viewport.
2. **Two `position:fixed` elements** (the modal backdrop overlay and the
   floating "상담 신청" button) were over-constrained (`left`+`right`+`width`,
   or all four insets + explicit `width`/`height`, set simultaneously) and
   had **no** override at all — the backdrop never covered more than a
   literal 1440×900 box, and the button never actually tracked the right
   edge, just sat frozen 1360px from the left.
3. **Hero banners** combined a real `aspect-ratio` with a frozen literal
   `height`, which drives `width` *from* height (backwards) instead of the
   other way around, defeating an otherwise-correct `width:auto` fix.

A fourth issue was found and fixed mid-task: making the hero frame correctly
fluid unmasked a **pre-existing** (not introduced by this task) inconsistency
in two image carousels, where a JS-computed slide-position `transform` was
frozen at its 1440-capture value while some (not all) of the carousel's own
width overrides had already been made fluid by the original generator —
producing garbled, overlapping slide content once the outer frame grew past
1440. Fixed by making the whole carousel track+slides subtree internally
consistent again (frozen at the literal capture size, matching how it always
rendered at ≤1440) rather than attempting to recompute carousel positioning,
which would mean implementing new interactive behavior — explicitly out of
scope for this task.

## 2. Files modified

**One file, only**:
`data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app/public/wr/generated-styles.css`

A static asset served as-is by `next start` — no rebuild required. No file
under `app/`, `src/runtime/`, `next.config.mjs`, or anywhere in the repo-root
engine (`src/reconstruction/`, `src/observer/`, `src/sitespec/`) was touched;
verified by file modification timestamps (only this file's mtime moved).

## 3. Which CSS/layout rules were changed and how

All changes are additive `[data-wr-page="pNNNNNN"][data-wr-viewport="desktop"]
[data-wr-node="nNNNNNN"]` overrides (specificity beats the base
`.wr-stNNNNNN` class regardless of source order) or, for two elements shared
byte-identically across all 7 recon pages, plain `.wr-stNNNNNN{}` rules —
appended at the end of the file, nothing deleted from the original shipped
content:

- **42 existing `max-width:100%`-only overrides completed** with the correct
  companion `width` declaration — `width:100%` when the node's parent is a
  flex container (so `flex-basis:auto` resolves against a value that fills
  the container instead of hugging content), `width:auto` when the parent is
  a normal block container (matching the convention already used by ~300
  other, already-correct rules in this same file).
- **`.wr-st000129`** (backdrop overlay): `width:auto; height:auto;` added,
  resolving an over-constrained inset+width/height conflict so it now
  genuinely covers the viewport.
- **`.wr-st000132`** (floating button): `left:auto;` added, clearing the
  stale literal left offset so the already-present `right:0` now actually
  drives its position.
- **Hero banners**: `height:auto;` added alongside the existing `width:auto;`
  on both pages' hero wrapper (`n000050`), fixing the `aspect-ratio`
  direction; plus two brand-new overrides for `/service`'s bare `<img>` hero
  (`n000051`, `n000052`) which had no override at all.
- **`/service` hero CTA text box** (`n000053`): `left:60%; right:auto;` —
  reverse-engineered from the source's own measured behavior (always exactly
  60% of the hero's width), and mathematically identical to the original
  literal `left:864px` at the unchanged 1440 capture width.
- **Two carousel tracks** (`n000053` on `/`, `n000101` on `/service`): their
  pre-existing `width:auto`/`width:100%` overrides were removed entirely
  (and this task's own short-lived `width:100%` addition to one carousel
  slide, `n000054`, was reverted) so the whole track+slides subtree renders
  at one consistent, literal-1440 size again instead of a partially-fluid,
  transform-desynced one.

Full before/after CSS snippets and the reasoning behind each choice are in
`docs/result/apartmentary-fluid-desktop/02-fix-implementation.md`.

## 4. Results at 390 / 1024 / 1100 / 1440 / 1920 (both `/` and `/service`)

| width | `/` | `/service` |
|---|---|---|
| 390 | unchanged (desktop subtree not rendered here; mobile untouched) | unchanged |
| 1024 | matches source exactly (already worked before this fix) | matches source exactly |
| 1100 | matches source exactly (already worked before this fix) | matches source exactly |
| 1440 | matches source exactly, byte-identical to pre-fix state | matches source exactly, byte-identical to pre-fix state |
| 1920 | **fixed** — full-bleed header/footer/hero frame, floating button right-anchored, all match source | **fixed** — same, plus hero CTA text box now tracks correctly |

56/56 landmark geometry checks (7 landmarks × 4 widths × 2 pages) matched the
live source within 1px, including the previously-broken 1920 width. No
horizontal overflow and no console errors at any of the 10 width×route
combinations tested against the production build. Full table in report 03.

## 5. Source-vs-clone geometry comparison for major top-level sections

Measured via `getBoundingClientRect()`, x / width / right in px, at every
tested width on both pages, for: modal backdrop, outer app wrapper, header,
floating action button, main content region, a repeating divider/spacer
section, and the footer.

Representative sample (full 56-row table in report 03):

| route | width | landmark | source (x, w, right) | clone (x, w, right) |
|---|---|---|---|---|
| / | 1920 | header | 0, 1920, 1920 | 0, 1920, 1920 |
| / | 1920 | floatBtn | 1840, 80, 1920 | 1840, 80, 1920 |
| / | 1920 | footer | 0, 1920, 1920 | 0, 1920, 1920 |
| /service | 1920 | header | 0, 1920, 1920 | 0, 1920, 1920 |
| /service | 1920 | footer | 0, 1920, 1920 | 0, 1920, 1920 |

Hero geometry (the actual previously-broken surface):

| page | width | element | source w×h | clone w×h |
|---|---|---|---|---|
| / | 1920 | hero frame | 1920×1091 | 1920×1091 |
| /service | 1920 | hero `<img>` | 1920×700 | 1920×700 |

## 6. Remaining responsive differences (honest, not hidden)

- **Both hero carousels' internal slide content is capped at their literal
  1440px capture width**, left-aligned/cropped within the now-correctly-fluid
  full-bleed frame, rather than growing past 1440. This is a deliberate
  trade-off, not an oversight: the carousels use a captured, frozen
  `transform: translateX(...)` to show the active slide, computed once from
  1440-width slide geometry. Making the slide content itself grow past 1440
  without also recalculating that transform produces visibly garbled,
  overlapping slide images (discovered and screenshotted mid-task, see
  report 02 §5) — and correctly recalculating it would mean implementing
  live carousel positioning logic, which this task is explicitly scoped to
  avoid ("Do NOT implement... hero carousel"). The frame around the
  carousel (background, header, overall hero height) is fully fluid; only
  the carousel's own picture content stops growing at 1440.
- **`/service` hero CTA text box width** stays at its captured `303.484px`
  rather than the source's own slightly-varying width (303px at 1440px vs.
  313px at 1920px on the live source) — that small drift on the source
  appears to come from internal text reflow inside the box, which this
  static clone does not reconstruct. Position (`left: 60%`) is fixed and
  verified exact.
- **Deep sub-component elements were deliberately left untouched** where
  they looked like intentionally fixed-size design tokens rather than
  top-level sections — e.g. 14 repeating testimonial thumbnail photos
  (`413×270px`, uniform across all cards) on the home page, and one small
  absolutely-positioned decorative image box inside the service page's
  content grid. These did not appear broken relative to the source's own
  card-grid pattern (thumbnails commonly stay a fixed size while the grid
  reflows), and touching them was outside the "top-level section" scope of
  this task.
- **390 mobile view has pre-existing content/asset gaps** unrelated to this
  fix (a placeholder box instead of a photo, an icon glyph rendering
  differently) — present before this task started, not touched or affected
  by it, confirmed via structural/positional comparison in report 03 §3.

## 7. Exact command to verify

```
cd data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app
pnpm start --port 3212
```

Confirmed working end-to-end: cold `next start` on port 3212 (no `pnpm build`
run beforehand — only a `public/` static asset was changed), then measured
against the live source at 390/1024/1100/1440/1920 on both `/` and
`/service`. All 56 landmark geometry checks passed; 1440 and 390 are
unchanged from the pre-fix state.
