# 01 — Changes

Presentation only. Release 1.3.1 differs from `interior-01-1.3.0-74a70c276f35` in exactly three files. `platform/test/polish.test.ts` R2/R3 enforces this.

| File | Change |
|---|---|
| `templates/interior-01/v1/styles/template.css` | All visual changes below |
| `templates/interior-01/v1/sections/FloatingCta.tsx` | Doc comment only (the seat and the future chat-launcher seam) |
| `templates/interior-01/v1/template.ts` | `version: "1.3.1"` and a header comment |

Built output: every file of every fixture package except the one stylesheet is byte-identical to its 1.3.0 package once the build id and stylesheet name are normalised. That covers all HTML, JS chunks and RSC payloads (polish test P2). The markup, content, settings, slots and behaviour are unchanged.

## A. Mobile footer

- **Below 900px** it is a single column: brand, summary, then a label-over-value stack for "Company" and "Email".
  - Padding is 48px; the inner gap is 32px; the facts gap is 16px.
  - Values are 14px; labels are 12px at 0.6 opacity.
  - The email link has 2px vertical padding for a taller hit area. A matching −2px margin keeps the value as close to its label as "Company" is.
- **Long values wrap.** The brand name and every `dd` use `overflow-wrap: anywhere` and `min-width: 0`, so long names and emails wrap inside the viewport.
- **At 900px and up**, the 1.3.0 look is restored: label beside value, 64px label column, 13px.
- The semantic `<footer>` (contentinfo) and its `dl` are unchanged.

## B. Floating CTA: one viewport-fixed seat

- **Tokens.**
  - `:root { --i1-float-right: 16px; --i1-float-bottom: 16px; --i1-float-height: 48px }`.
  - At 900px and up: 24 / 50 / 56 (the 1.3.0 desktop offsets).
- **The seat.**
  - `.i1-fcta { position: fixed; right: calc(var(--i1-float-right) + env(safe-area-inset-right, 0px)); bottom: calc(var(--i1-float-bottom) + env(safe-area-inset-bottom, 0px)); z-index: 20 }`.
  - This is the only rule that positions it; R4 enforces that.
- **Footer clearance** is derived from the same tokens: `body:has(.i1-fcta) .i1-footer { padding-bottom: calc(bottom + height + 32px + safe-area) }`. That gives 96px on mobile and 138px on desktop, so the button never covers footer text at the end of the page.
  - This replaces the 1.3.0 fixed values of 152 / 112.
- **The footer stays a plain box** (no transform, filter or contain), so it never re-anchors the fixed button. The smoke walks every ancestor at runtime.
- **The pill shape and label are kept.** The comment names the future seam: a chat launcher takes the same seat and replaces the href with an action. Nothing is implemented.

## C. Reviews and showcase tracks

- `.i1-track[data-scrollable="false"] .i1-track__bar { display: none }` replaces `visibility: hidden`.
  - A track that fits reserves no rail and no control row and leaves no gap.
  - A track that scrolls keeps its rail, prev/next and behaviour.
  - **Trade-off.** This supersedes the Step 5 "no layout shift" line (`recon-template-platform-step5-homepage/03-interactions-responsive.md:89`).
    - SSR renders every track as scrollable, so a track that fits drops its bar once after hydration.
    - Measured layout shift: 0 on every load from the top. When fixture-small's fitting reviews track is already in view while the page hydrates, it is 0.0156 at 1440 and 0.0132 at 1920.
    - The smoke pins it: 0 from the top, and ≤ 0.05 in view.
- **600–899px:** the reviews list uses `grid-template-rows: auto` (one row), so the reading order is 01 → 02 → 03 instead of 01/03 over 02.
- **Desktop reviews padding** is 64px / 112px (was 64 / 120), to match the showcase rhythm.

## D. Portfolio list top

CSS only, so the HTML stays byte-identical.

- **One grid cell.** `.i1-plist:has(> .i1-plist__hero)` becomes a one-column grid. The banner and the page head share one cell, and the head is `align-self: end`, so the title and intro sit on the banner's lower edge.
  - `.i1-container` becomes `display: contents`, and its children keep the container's width, max-width and gutters.
- **Scrim.** The head's own background is a gradient: black at .60 at the bottom, .55 up to its padding top, and 0 at the top of its 120px padding. So the scrim is anchored to the copy, not to the image.
  - Worst-pixel contrast: title 6.33–6.58:1, intro 6.33–6.63:1.
- **Banner min-height**: 280 below 1281px, 320 from 1281.
  - On phones the head's short-copy box is ~244px, so a band of photo shows above the scrim (final visual review, finding 1).
- **Bottom padding**: 28 / 40 / 48.
- **Space before the filters or grid**: 28 / 40.
- **First card:** 1125 → 876 at 1440.
- **Without a banner** (fixture-small), the page is unchanged: the plain head as in 1.3.0.
- **Filter panel.** Hairline rules above and below replace the rounded box, so it reads as part of the page rather than a card.
  - Filter markup, query semantics and behaviour are untouched.
- **Result scroll target.** `.i1-pbrowse__results { scroll-margin-top: 72px / 88px }`, so the results `scrollIntoView` lands below the header.

## E. Consistency

- **Card title.** One scale everywhere: 17px/700 (18px at ≥900) with 14/16px top margin. The portfolio-grid override was removed, so home showcase cards and portfolio cards match.
- **Pagination.**
  - Buttons are 40×40.
  - The current page is filled with the primary action colour and weight 700.
  - Disabled steps use the muted colour at .35.
- **Rhythm.**
  - Two showcases in a row (A → B) read as one section: the second one's top padding is 24 / 48px.
  - Inner pages end with 96px before the footer at ≥900.
- **Page column tokens.**
  - `--i1-page-max` (1440px) and `--i1-gutter` (20px, 40px at ≥900) now drive `.i1-container`, the portfolio banner layout and the hero inset clamp.
  - These were copied literals before (final visual review, finding 3).
  - Every desktop screenshot is pixel-identical before and after.
- **Radius.** The two literal `999px` radii (hero pager and arrow) use `var(--decoration-radius-pill)`. The output is identical for every fixture today, but a site theme with a non-round pill token now also shapes these two controls; the theme validator allows a pill radius of `0`.

## Tests and tools

- **`platform/test/step5.test.ts`** is generalised the way `step41.test.ts` was at Step 5: its invariants must hold for 1.3.0 **and every later release**.
  - B: the pin is ≥ 1.3.0 and equals the template version.
  - C: 1.3.0 is added to the unchanged, read-only releases.
  - Rollback: previous is an older release, and exactly 1.2.0 while 1.3.0 is current.
  - AC: previous release hash ≠ current.
  - AD/AE: compare against the previous package.
  - Compat: the 1.2.0 buildInputId comes from `history.jsonl` once the 1.2.0 package is pruned.
  - No assertion was removed or loosened.
- **`platform/test/polish.test.ts`** (new, 7 checks):
  - exactly one 1.3.1 release exists, and its diff is limited to the three files;
  - the stylesheet contract;
  - the stylesheet-only package output;
  - current documents re-pinned to 1.3.0 reproduce each site's 1.3.0 buildInputId.
  - `package.json` `test:platform` runs it last.
- **`scripts/template-platform-polish-visual-smoke.ts`** is the new browser smoke (see [02](02-validation.md)).
