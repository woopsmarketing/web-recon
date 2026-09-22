# 04 — Open items

## Carry-forwards (recorded, not solved)

| | Item | When |
|---|---|---|
| A | Korean area basis: "34평" is not automatically exclusive floor area (`areaBasis`: exclusive / supply / unknown) | before BoostChat / NL filter links |
| B | Direct filtered-URL hydration flash on `/portfolio?…` | before the public Demo or BoostChat filtered links |
| C | Builder pinning / hardening | Pre-Demo |
| D | Rollback runbook (the 1.3.0 packages are the retained rollback packages today) | Pre-Demo |
| E | Full SEO QA | Pre-Demo |
| F | Slot vs localization review | before Template 2 |
| G | Navigation: re-evaluate a hamburger / mobile drawer once real Demo or customer sites have enough real menu routes. No dead navigation items now. | with real navigation |

Step 5 carry-forward 7 (**filter UX on `/portfolio/page/2+`**) stays open. The static page routes have no filter bar, and adding one changes pagination and filter semantics, which this pass must not touch. Revisit it together with B.

## New in this pass

1. **No `viewport-fit=cover`.**
   - The floating seat adds `env(safe-area-inset-right/bottom, 0px)` to its offsets. The smoke emulates insets over CDP and proves they add, and that zero returns the button to the seat.
   - Without `viewport-fit=cover`, iOS reports zero insets, so the seat sits 16px above the layout viewport's bottom edge.
   - Whether that clears the home indicator in every Safari toolbar state has not been checked on a device; all proof is Chromium.
   - Opting into `cover` is a site-wide change that also needs safe-area padding on every full-bleed container.
   - Decide it with the chat launcher, which takes the same seat.
2. **The floating seat is homepage-only** (the Step 5 `site.floating-cta` rule; inner pages keep the header, footer and detail contact links). Whether the chat launcher appears site-wide is a BoostChat product decision. The seat's tokens (`--i1-float-*`) already hold at every width.
3. **The pill is kept** (the spec allows it). Hit-testing found no real control it blocks: 21–36 controls per visit, 0 blocked. Like any fixed element, it passes over the ends of text lines while scrolling. It takes 2.75% of the viewport at 320 and 1.71% at 390.
4. **The mobile filter panel is tall when open.** At 390 it is 628px (four chip groups), and results start at y ≈ 1109. It is collapsed by default and its markup is unchanged from 1.3.0; this pass only replaced its box with hairline rules. Denser chips or a sheet are Demo-content-era work.
5. **The track bar's SSR state.** A track renders `data-scrollable="true"` until hydration measures it, and a track that fits then drops its bar (`display: none`).
   - Measured layout shift: 0 on every load from the top. When a fitting reviews track is already in view while the page hydrates (mid-page reload or deep link), it is 0.0156 at 1440 and 0.0132 at 1920. The smoke pins it at 0 and ≤ 0.05.
   - The alternative, reserving the space forever, was the Step 5 residual this pass fixed.
   - A CSS rule that hides the bar by item count was **declined**. It would copy each breakpoint's per-view count into a second source of truth, and if the two ever disagree, a track that really scrolls loses its controls.
   - The real fix is an SSR initial state derived from the item count, in `SnapTrack`. That is a component change for a later, non-presentation release.
6. **Card titles wrap more on phones.** 17px/700 titles wrap to two lines more often at 390, so summaries in neighbouring cards start at different heights. Accepted (final visual review NIT); `text-wrap: balance` is optional.
7. **Two "Contact" controls on the first mobile screen** (header button and floating seat). Pre-existing; the seat becomes the chat launcher.
8. **The portfolio banner title needs `:has()`.** Chromium, Safari 15.4+ and Firefox 121+ support it. Without it, the page falls back to the 1.3.0 layout (banner, then a plain heading), which is valid, just less composed. This joins the Pre-Demo cross-engine check (Step 5 residual 10).

## Step 5 visual residuals — where they stand

| Step 5 residual | Now |
|---|---|
| 600–899 band is stretched mobile | **Partly addressed.** The reviews list is one row (reading order 01 → 02 → 03), and the footer stacks. The hero and intro keep the mobile layout (bounded pass). |
| ~200px blank space after reviews when all fit | **Fixed.** No bar, no reserved space (C). |
| Floating pill overlap | **Addressed by contract.** One tokenised seat plus a proven reachability hit-test; the pill is kept (B). |
| Projects A/B "View all" → `/portfolio` | Unchanged (waits on B). |
| Solid header | Accepted decision, unchanged. |
| Hero copy inset at 900–1576 | Accepted decision, unchanged. No collision found. |
| Maximum-length hero copy on phones | Unchanged (copy guidance, Demo). |
| Tab order, reviews tab stop, browser coverage, font swap, warning wording, reduced-motion `aria-live`, CSS-driven autoplay | Unchanged. |
