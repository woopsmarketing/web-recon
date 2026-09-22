# 04 — Source Swiper and responsive behaviour

**The carousels are constructed by the preserved source React/Swiper runtime.** The harness never
constructs, initialises or drives an instance. The only interaction was one real click on a control the
source rendered.

## Evidence that these are source instances

- **Before release:** all 4 containers exist only as frozen Phase 2 markup, with `instancePresent: false`
  and 0 synthetic slides.
- **At settle:** all 4 have `el.swiper` (the Swiper instance property) with `initialized: true`, and
  every slide carries fixture text or fixture image paths (`slidesWithSyntheticMarker` = slide count).
- Checks:
  - `instances.harnessConstructsNoComponent`: no constructor, init or slide call in harness code;
  - `instances.beforeRelease … had no live instance`.

## Desktop 1440 (settle)

| carousel | slides | loop duplicates | slidesPerView | visible | slide width | loop | autoplay | images loaded |
|---|---|---|---|---|---|---|---|---|
| hero | 9 | 0 | 1 | 1 | 1440 | true | running | 9/9 |
| portfolio area 1 | 10 | 0 | 3 | 3 | 413 | false | — | 10/10 |
| portfolio area 2 | 4 | 0 | 3 | 3 | 413 | false | — | 4/4 |
| reviews | 6 | 0 | 3 | 3 | 375 | false | — | (no images) |

These match the bundle literals in `01`: hero 1 per view with loop and autoplay; carousel wrapper
`md ? 3 : 1`; `spaceBetween` 50.

**Source-driven behaviour observed:**
- **Hero autoplay:** after about 6 s, `realIndex` 0 → 1 and the wrapper moved `translate3d(0)` →
  `translate3d(-1440px)`. It had advanced to index 2 by the next probe.
- **Click on the portfolio area-1 next arrow**, a button rendered by the source next to the carousel
  (sc0028 @12675 box, `onClick → swiperRef.current.slideNext()`):
  - `activeIndex` 0 → 1;
  - wrapper `translate3d(-463.333px)` = slide 413 + `spaceBetween` 50;
  - area 2 unchanged (`instances.otherPortfolioUnaffectedByClick`).

## One resize: 1440×900 → 390×844

| carousel | slides | slidesPerView | visible | slide width | state kept |
|---|---|---|---|---|---|
| hero | 9 | 1 | 1 | 390 | index 2, translate −780 px (recalculated) |
| portfolio area 1 | 10 | **1** | 1 | 350 | index 1, translate −400 px (recalculated) |
| portfolio area 2 | 4 | **1** | 1 | 350 | index 0 |
| reviews | **3** | **1** | 1 | 350 | 6 reviews re-grouped into 3 two-card slides |

- **0 fatal errors** during resize; still mounted: 601 root elements, React root and router present.
- **Swiper recalculated:** slide widths and translations were recomputed for the kept active indexes;
  slidesPerView switched 3 → 1.
- **Reviews re-rendered by React:** 6 slides → 3 (`ceil(6/2)`), matching the below-md branch in `01`.
- **Mutations:** 1,552 records, 27 subtrees removed and 23 inserted. The desktop header navigation
  (`css-1xoxi4k`, 25 descendants) was removed, and slide content boxes were re-created
  (`css-0` → `css-fqkw33`).
- **Counts equal the Phase 2 mobile capture:** 35 carousel-class nodes and 21 buttons at 390, the same as
  the Phase 2 mobile clone. That is a count match, not a pixel claim.
- **Header** switched to the mobile header (logo plus menu icon in `mobile-synthetic.png`).
- **Hero** now uses the fixture mobile images (`FIXTURE HERO 03 (MOBILE)` visible; all 46 fixture images
  requested and served locally, including `-mobile` variants).
- **Footer at 390** is also wrong. See `05`.

No width sweep was run, and no generic breakpoint constant is inferred. The `(min-width:900px)` literal
is this build's MUI default.
