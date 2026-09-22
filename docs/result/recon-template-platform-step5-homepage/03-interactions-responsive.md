# 03 — Interactions and responsive behaviour

The layout has one DOM for every width and two bands:
- **base = mobile**;
- **≥ 900px = desktop**, the observed home breakpoint of the design.

Nothing depends on JavaScript viewport branching; every width difference is CSS. There are two client components: `components/HeroCarousel.tsx` and `components/SnapTrack.tsx`. Everything else is server-rendered static HTML.

## Hero carousel (`HeroCarousel`, "use client")

**Markup.**
- All slides are stacked in one server-rendered tree, and slide 1 is active in the HTML. The HTML is deterministic; nothing depends on client state.
- **The hero is its design height and grows only for its copy.**
  - Slide images are out of flow (`position: absolute; inset: 0; object-fit: cover`), so an image's natural height never sizes the hero. That was a defect found during verification: at 1440×700 the slide grew to the image height and pushed the bottom-anchored copy out of view.
  - The copy block is in flow, bottom-anchored in a flex column. The slides grid has one `minmax(0, 1fr)` track and a `min-height` equal to the design height.
  - The hero is therefore exactly the design height for normal copy. When the tallest slide's copy (at the schema maximum: 80-char headline, 160-char text, CTA) needs more room, the hero grows instead of clipping the copy at the top.
  - Every slide shares the one track, so the height never jumps during rotation.
  - The slides box uses `overflow: clip` (with an `overflow: hidden` fallback), so it is not a scroll container. With classic scrollbars the scrim's 100vw can overhang by half a scrollbar; that overhang can never be scrolled by script or find-in-page.
  - The hero CTA pill wraps inside the copy column (`max-width: 100%`, `overflow-wrap: anywhere`), so a 32-character label cannot overflow sideways.
  - A single-slide hero has no pager, so its copy sits 40px (mobile) / 64px (desktop) above the bottom instead of 72 / 104px.
- The controls come **before** the slides in the DOM (they are absolutely positioned). Tab order is therefore pause/play → dots → arrows → the slide link.
- Slides crossfade over 0.7s.
- Inactive slides are `aria-hidden` + `inert` (not focusable and not announced).
- Slide 1's image is `loading="eager" fetchpriority="high"`; the others are lazy.

**Autoplay without timers.**
- The Template gate bans `setTimeout`, `setInterval`, `Date` and `performance`, and Step 5 did not widen it.
- Instead, the active pagination dot's fill runs a CSS animation (`i1-hero-timer 5s linear`), and its **`animationend`** advances the slide.
- The timer class is applied only **after hydration** (a `ready` state set in `useEffect`), so a slow hydration can never miss the end event and stall autoplay.
- Everything else follows from that:
  - **Mouse hover pauses** via `animation-play-state: paused` (`[data-paused]`). It uses pointer events filtered to `pointerType === "mouse"`; a tap is not a hover, so tapping never leaves the slideshow stuck.
  - The **pause/play toggle** removes or restores the animation.
  - **`prefers-reduced-motion`** sets `animation: none`, so no end event fires, nothing rotates, and the toggle is hidden (it would do nothing). The slides stay fully visible and manually navigable.
- This is a recorded Template decision: timing lives in CSS and is observable in the DOM (`data-rotating`, `.is-timing`).

**Rotation stops for good** on any manual navigation (arrow, dot, swipe, keyboard) and on keyboard focus entering the carousel (`:focus-visible` only, so a mouse click on "pause" does not immediately resume). Only the play button restarts it.

**Controls** (rendered only when there is more than one slide):
- prev/next arrows (**desktop only**, left/right 40px, vertically centred).
  - At ≥ 900px the copy of a multi-slide hero (`.i1-hero:not([data-slides="1"])`, keyed on the slide count and not on an ARIA attribute) is inset `clamp(40px, 108px − (100% − 1440px)/2, 108px)`.
  - The text therefore starts at 108px up to 1440px wide. Beyond that it relaxes to the page's usual 40px edge inside the centred 1440px column (x = 280 at 1920, the same as other sections).
  - The copy never touches an arrow at any hero height or copy length. The smoke checks this at 900×600, 1000, 1440×700, 1440 and 1920, including with maximum-length copy.
- a pill pager with the pause/play toggle and one dot per slide (24×28 hit area, 36×28 when active; `aria-current` on the active one; the label comes from `slideLabelFormat`, and every `{n}`/`{total}` is replaced);
- ArrowLeft/ArrowRight inside the controls;
- horizontal touch/pen swipe of ≥ 48px on the slides (mouse drags are ignored; `touch-action: pan-y pinch-zoom` keeps vertical page scrolling and pinch-zoom).

**Accessibility.**
- `section[aria-label]` with `aria-roledescription="carousel"`; each slide is `role="group"`, `aria-roledescription="slide"` and labelled "Slide n of total".
- `aria-live` is off while rotating and polite after the user takes over.
- **The scrim belongs to the copy block** (`.i1-hero__copy::before`, full slide width).
  - It is `.6` black at the hero bottom and `.55` at the copy's top edge, then fades to transparent over the 200px above it.
  - However tall the copy grows, every line has the dark part behind it. The headline also has a soft text-shadow.
- **Measured** (worst pixel, text colour and shadow removed; 3 fixtures × 7 viewports from 390×600 to 1920×1080 × every slide = 49 boxes per element):

  | Copy | Headline | Text |
  |---|---|---|
  | Normal fixture copy | ≥ 5.16:1 | ≥ 5.93:1 |
  | Maximum-length copy (80 / 160 chars, Korean worst case) | ≥ 5.08:1 | ≥ 6.10:1 |

  The first review measured 1.9–2.9:1 with the original percentage gradient.

**One slide** gives a plain image section: no carousel role, no dots/arrows/toggle, no rotation (fixture-empty). **Zero slides** means no section.

**Heights** (design minimums; the copy can only make the hero taller):
- Mobile: `max(380px, min(150vw, 80svh))`.
- Desktop: `max(480px, min(56.8vw, 100svh − 72px))`.

The image covers the box. Maximum-length copy measured in the smoke:
- 511 → 722px at 900×600;
- 585 → 761px at 390;
- 480 → 784px at 320;
- unchanged at 1440×700 and 1920.

## Showcase and review tracks (`SnapTrack`, "use client")

**Layout.**
- A native horizontal scroller: CSS grid `grid-auto-flow: column` with `scroll-snap-type: x mandatory`.
- Desktop shows 3 columns per view (`(100% − 100px)/3`, gap 50px). Mobile shows 84% columns (one card plus a peek).
- Reviews on mobile use 2 rows per column (`.i1-track--reviews`).

**Bar.**
- A 2px rail with a thumb (position and width = the scroll fraction) plus prev/next buttons (44×44, `aria-controls` = the list id).
- At the ends the buttons are `aria-disabled="true"` (not `disabled`), so keyboard focus stays on the button. The click is then a no-op.
- Buttons page by one viewport of the list (`scrollBy(clientWidth)`).
- Below 900px the buttons show only for a fine hovering pointer (`(hover: hover) and (pointer: fine)`: a narrow or zoomed desktop window). Touch devices swipe the list itself.
- The reviews list, whose items contain nothing focusable, is itself a tab stop (`tabIndex=0`, labelled) **while it is scrollable**, so keyboard users can scroll it in every browser. When everything fits, the tab stop is removed.
- 600–899px shows two items per view instead of one stretched card.

**Measurement.** The client measures state with a `scroll` listener plus a `ResizeObserver`, both removed on unmount. When everything fits (for example fixture-small's 3 reviews at 1440), `data-scrollable="false"` hides the bar with `visibility: hidden`, so there is no layout shift.

**No-JS behaviour.** The server HTML is a normal scrollable list; the bar only adds affordance.

## Other sections

| Section | Mobile | ≥ 900px |
|---|---|---|
| Intro | Media above copy | Row, media 510px, gap 80px. Without media: text-only column |
| Projects A/B | Head · track · "view all" pill below (DOM order = visual order) | Head (title + description) with the pill top-right (grid area), full-width track below |
| Reviews | Optional banner + title + 2-row track | With a banner: 85% right-anchored column, banner `clamp(220px, 20vw, 290px)`. Without one: the page's normal left edge |
| Image band | Full width, 280–760px tall, cover | Same |
| Floating CTA | Fixed right 16 / bottom 16 (+ safe-area), 48px tall | Fixed right 24 / bottom 50, 56px tall |

**Other rules.**
- In-page anchors (`#projects`, `#reviews`, …) land below the sticky header (`scroll-margin-top` 72 / 88px).
- An intro that is the last section keeps its own bottom padding before the footer (fixture-empty).

**Floating CTA details.**
- It is a plain wrapper rendered as the **footer's last child**, so it sits in the contentinfo landmark and comes last in tab order.
- The footer must therefore stay a plain box: no `position` + `z-index`, `transform`, `filter`, `contain`, `will-change` or `content-visibility`, any of which would trap or re-anchor the fixed button. This is noted in the CSS. The smoke hit-tests the button at the top of the page, where it overlaps the hero, so a trapped button fails `floating-cta-on-top`.
- It holds a crawlable `<a href="mailto:…">`, with a 2px canvas-coloured ring so it separates from any section colour, and a two-tone focus ring.
- While the CTA exists, the footer gains bottom padding (112px mobile, 152px desktop) so the fixed button never covers footer content at the end of the page.

**Korean.** `:lang(ko) body` sets `word-break: keep-all` with `overflow-wrap: break-word` site-wide, so lines break between eojeol and never mid-word, in the footer too. It was checked at 390 and 1440, and the step41 portfolio smoke still shows 0 overflow.

## Motion summary

| Motion | Default | Reduced motion |
|---|---|---|
| Hero autoplay | 5s per slide, pauses on hover/focus/toggle | none |
| Hero crossfade | 0.7s opacity | instant |
| Track paging | smooth scroll | instant |
| Track thumb | 0.2s | instant |

Browser proof lives in 04 (smoke checks):
- hero: autoplay, mouse-hover pause, a tap never pausing, arrows, dots, keyboard, pause/play, swipe, the single-slide static hero;
- copy inside the visible hero, and arrows clear of the copy (900×600, 1000, 1440×700, 1440, 1920);
- the maximum-length copy stress (320, 390, 900×600, 1440×700, 1920) fills headline 80, text 160 and CTA label 32 characters, then checks:
  - the copy stays inside the hero, and no child overflows sideways;
  - the scrim spans the full slide width, from 200px above the copy to the hero's bottom edge;
  - the arrows stay clear;
  - there is no page or hero overflow;
- the floating CTA is on top at the top of the page;
- tracks: paging at 1440/1000/390, focus kept at a track's end, "view all" after the track;
- in-page anchors below the header;
- reduced-motion runs at 1440 and 390.
