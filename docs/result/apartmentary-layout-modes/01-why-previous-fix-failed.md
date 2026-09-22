# 01 — Why the previous wide-desktop fix was insufficient

Target: `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app` (route `/`)
Previous report: `docs/result/apartmentary-fluid-desktop-2026-09-14.md` (56/56 landmark PASS)

## 1. The verification was measuring the wrong things

The previous pass measured 7 top-level landmarks (backdrop, outer wrapper, header,
floating button, main, divider, footer) × 4 widths × 2 pages. All 7 are **full-bleed
boxes**: at any width their correct answer is `x=0, width=viewport`. Such a check
passes for any CSS that stretches outer boxes, and says nothing about what is laid out
*inside* them. None of the section content groups, card rows, CTAs or tracks was in the
check set, and no check covered height, visible column count or margin symmetry.

Re-measuring the BEFORE state with a 36-region harness (this task) found **139
x/width failures** — including at 1440, the capture width the previous report called
"byte-identical, matches source exactly":

| width | BEFORE failures (x/width/track/text) | examples |
|---|---|---|
| 1024 | 25 | portfolio heading row 1360px wide in a 1024 viewport → CTA at x=1170 (off-screen); 2 cards instead of 3; testimonial at x=0 instead of 114 |
| 1100 | 25 | same as 1024 |
| 1440 | 14 | experience group x=0 (source 224, centered); testimonial x=0 width 1440 (source x=176, 85%) |
| 1920 | 21 | experience group left-pinned; 4 portfolio cards (source 3); 5 testimonials (source 3); bottom media 1440 wide |
| 2560 | 33 | whole content not centered under the 1920 cap |

## 2. What was structurally wrong

### 2a. "1440 frozen px → viewport-proportional expansion" was applied to the wrong nodes
The previous pass completed 42 `max-width:100%` overrides with `width:100%` whenever the
parent was a flex container. Two of those nodes are *not* fill-the-parent boxes in the
source:

| node | role | source rule | previous rule | effect |
|---|---|---|---|---|
| `n000170` | experience image+text group | content-sized (≈992px), centered by `justify-content:center` on its parent | `width:100%` | group spans viewport; image pinned to x=0, text beside it, empty right side (user issue #2) — broken at **every** desktop width incl. 1440 |
| `n000528` | testimonial content column | `width:85%` + 40px gutter sibling in a `flex-end` row | `width:100%` | column at x=0 full-width, 40px gutter squashed to 0 (user issue #5) |

### 2b. The inner layers were left at literal 1440 capture values
Once the outer frame became fluid, everything that is *also* fluid in the source but was
not touched stayed frozen, so the frame and its content diverged:

- portfolio heading rows `n000192`/`n000418`: `width:1360px` → CTA stuck at x≈1170–1400
  regardless of viewport (user issues #3, #4, #6)
- portfolio slides: `width:413.328px` (= (1440−200)/3) → 2 columns at 1024, 4+ at 1920
- portfolio next-arrow, progress rail/thumb: literal `left:1340px`, `width:1340px`/`167.5px`
- testimonial slides: `width:374.656px` (= (1224−100)/3) → 5 visible at 1920
- testimonial banner, bottom media `<img>`: `width:1224px`/`1440px`
- header row `n000008`: `width:1440px`
- content wrapper `n000166` and footer `n000623`: `max-width:1920px` but `margin:0`
  → not centered above 1920
- **min-height from the 1440 text capture** (`.wr-tx { height:auto; min-height:Npx }`)
  on cards, swiper wrappers and every section ancestor → sections can grow but never
  shrink, so the page was 843px (1024) / 790px (1100) too tall
- floating 상담 button: correct `bottom:50px` but also a frozen `top:684px` (desktop) /
  `top:683px` (mobile), which wins → it never followed the viewport bottom edge (mode E)
  — the previous pass only cleared `left`

### 2c. The hero was not actually fixed
The hero carousel was captured **mid-autoplay**: track `transform: translateX(-6820.31px)`
= 4.74 slides of 1440px. The previous pass froze the track at 1440px, so the visible hero
was two stitched slides at a fixed 813px height at every width (source: one slide,
height = width / 1.771 → 1084px at 1920). The frame was full-bleed, but the picture
inside it left a ~270px white band at 1920 and overflowed at 1024.

### 2d. Source breakpoints that the 1440-only capture never saw
Probed on the live source, not present in the clone at all:
- < 1200px: card title 24/36 → 16/28, card body 16/28 → 14/23, card spacer 20 → 16;
  header logo→nav spacer 100 → 30px
- ≥ 1920px: header nav button side padding 25 → 20px

## 3. Correction of a premise in the user's description

The live source was measured, and it differs in one respect from the problem statement:
at **1920** the portfolio sections are *not* a narrow centered box — the heading row is
full-width with 40px side padding (`x=40, width=1840`), CTA right edge at 1880, and 3
fluid cards of 573px. The "centered bounded container" behavior is real but engages
**above 1920**: the whole content wrapper is `max-width:1920px; margin:0 auto`, so at
2560 everything sits in a centered 1920 box (320px margins). The clone now reproduces
both regimes (fluid up to 1920, centered cap beyond), verified at 2560 as an extra width.
The experience section *is* a centered content-sized group at every width, as described.
