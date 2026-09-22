/**
 * Five-width responsive QA — types, thresholds and errors (Task 28.6, lane W3).
 *
 * WHY THIS SUBSYSTEM EXISTS
 * -------------------------
 * `src/reconstruction-qa/` measures the clone at exactly two widths, because
 * that is what the Observer recorded: desktop 1440 and mobile 390
 * (`run-qa.ts`, the two `ViewportProfile`s). Everything between those two
 * numbers has never been measured by the engine at all, and Task 28.5C found
 * real, shipped defects living in that gap.
 *
 * 28.5C also found something worse: the metric that WAS available lied by
 * omission. The clip metric reported `offscreen: 0` at 1440 for a build whose
 * navigation was ~280 px out of position, because "does any box begin past the
 * right edge" is a threshold question and a 280 px misplacement inside the
 * viewport answers "no". The labels BLOCKER / MAJOR / MINOR were then assigned
 * BY HAND in a throwaway script
 * (`tmp/wr-responsive-investigation/agent-d/scripts/write-handoff.mjs`), so the
 * verdicts were not reproducible and not auditable.
 *
 * This module answers both problems:
 *
 *   1. Every width in the sweep is measured, on BOTH sides, by the SAME code.
 *   2. A DISTRIBUTION channel (per-node horizontal deltas, summarised as
 *      median/p90/max) runs alongside the old threshold channel, so a
 *      misplacement that never crosses an edge still shows up as a number.
 *   3. The rubric is CODE. Every threshold below is a named exported constant
 *      with the reason it has that value written next to it.
 *
 * TWO RULES THE 28.5C EVIDENCE FORCES ON THE RUBRIC
 * -------------------------------------------------
 *   (a) Every threshold is measured RELATIVE to the source's own value at the
 *       same width. Real sites have their own overflow, their own offscreen
 *       nodes and their own overlapping boxes; an absolute threshold would fire
 *       on the source itself and would therefore be measuring the web, not the
 *       clone.
 *   (b) A passing scalar never suppresses a finding. `channels` on every
 *       classification records the measured value of EVERY channel, including
 *       the ones that did not fire, so a reader can disagree with the rubric
 *       using the same run's numbers — and the composite image is always
 *       written, so a screenshot can overrule the arithmetic.
 *
 * Nothing here is site-specific. There is no host branch, no per-site constant
 * and no selector naming any site's markup anywhere in this directory.
 */

/** The five widths Task 28.6 requires. Ascending; the CLI may override. */
export const DEFAULT_WIDTHS: readonly number[] = [390, 700, 1024, 1100, 1440];

/**
 * Viewport height for every capture. Fixed on purpose: the metric that matters
 * is horizontal, and a varying height would move `largestEmptyBandRatio` and
 * the fold-dependent lazy-loading behaviour between widths for no reason.
 * 900 is the height Task 05's desktop profile uses.
 */
export const CAPTURE_VIEWPORT_HEIGHT = 900;

/**
 * Device scale factor for every capture, both sides. DPR 1 keeps the two
 * screenshots pixel-comparable without a resize step — `compareImages` never
 * resizes, so a DPR mismatch would silently reduce the comparison to its
 * top-left corner.
 */
export const CAPTURE_DEVICE_SCALE_FACTOR = 1;

// ---------------------------------------------------------------------------
// Capture policy — scroll-to-settle before probing (Task 28.6, item C3.2)
// ---------------------------------------------------------------------------

/**
 * WHY THE PROBE NOW SCROLLS.
 *
 * The first cut of this harness probed the page where it loaded — at scroll
 * position 0 — while `page.screenshot({ fullPage: true })` scrolls the whole
 * document as a side effect of stitching. The consequence was a measuring
 * instrument that disagreed with its own evidence: lazy-revealed content
 * appeared in the PNG a human reviews and in NO numeric channel, on either
 * side. One 28.6 pilot candidate carries 101 of its 102 images behind
 * `loading="lazy"`, so on that site nearly the entire page would have been
 * outside every channel.
 *
 * The fix is symmetric and deterministic: the SAME stepped scroll, the SAME
 * fixed waits and the SAME cap run on the source and on the clone, and the page
 * returns to the top before the screenshot so the capture geometry is unchanged.
 * Every parameter below is written into `capturePolicy`, and every capture
 * reports how far it actually scrolled, how long it waited, whether it reached
 * the bottom, whether it hit the step cap, and how much content the scroll
 * revealed.
 */
export const SCROLL_BEFORE_PROBE = true;

/** One step, in CSS px. 90 % of the viewport height keeps a one-viewport
 *  overlap band so an IntersectionObserver with a small root margin cannot be
 *  stepped over. */
export const SCROLL_STEP_PX = Math.round(CAPTURE_VIEWPORT_HEIGHT * 0.9);

/**
 * Hard cap on steps. 60 × 810 px = 48,600 px of document. A page longer than
 * that is scrolled as far as the cap allows and the capture RECORDS
 * `scrollStepsCapped: true` with the position it stopped at — a cap that is
 * reported is a measurement; a cap that is not is a lie.
 */
export const SCROLL_MAX_STEPS = 60;

/** Fixed wait after each step. Fixed, not adaptive: an adaptive wait would make
 *  the two sides wait for different lengths of time and manufacture a
 *  difference out of network luck. */
export const SCROLL_STEP_WAIT_MS = 150;

/** Extra settle once the bottom (or the cap) is reached. */
export const SCROLL_BOTTOM_SETTLE_MS = 600;

/** Settle after returning to the top, before probing and screenshotting. */
export const SCROLL_TOP_SETTLE_MS = 400;

// ---------------------------------------------------------------------------
// Rubric thresholds — BLOCKER
// ---------------------------------------------------------------------------

/**
 * Source visible text absent from the clone, as a fraction of the source's own
 * visible characters. 0.10 = a tenth of the page's words are gone; at that
 * point a section, a column or a table is missing, which is the task's
 * "important content missing" / "major section missing".
 */
export const MISSING_TEXT_BLOCKER_RATIO = 0.1;

/**
 * The MAJOR band for the same channel. 0.02 of a 3,000-character page is ~60
 * characters — a heading, a plan name or a nav item — visible to a reader but
 * not fatal to the page.
 */
export const MISSING_TEXT_MAJOR_RATIO = 0.02;

/**
 * Characters carried by boxes that START at or past the right edge, IN EXCESS
 * of the source's own count at that width. Such content cannot be scrolled to
 * when `scrollWidth === innerWidth`, so it is unreachable, not merely ugly.
 * 80 characters ≈ one full sentence or one pricing column's label set; 28.5C's
 * accepted BLOCKERs at 1024/1100 measured 305 and 250.
 */
export const OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS = 80;

/** The MAJOR band for the same channel: a word or two lost off the edge. */
export const OFFSCREEN_TEXT_MAJOR_EXCESS_CHARS = 10;

/**
 * Clone visible characters as a fraction of the source's at the same width.
 * Below 0.6 the clone is rendering a substantially smaller page than the
 * source — a whole section did not render. Deliberately generous: the clone
 * legitimately ships BOTH viewport subtrees, so the ratio is normally ≥ 1.
 */
export const VISIBLE_TEXT_BLOCKER_RATIO = 0.6;

/**
 * SOURCE visible characters as a fraction of the CLONE's — the mirror of the
 * channel above, and the one the first cut of this harness did not have.
 *
 * A live public source does not always render. On this harness's own
 * self-check run, one capture of linear.app/ @1100 came back HTTP 200 with 185
 * elements, 65 visible characters and a 900 px document, while the capture 8
 * seconds later came back with 4,704 elements and 8,980 characters. In a CLONE
 * run that failure points the dangerous way: with almost no source text to be
 * missing, `missing-text-ratio` reads ~0 and the pair scores as if the clone
 * were excellent. A false BLOCKER wastes an hour; a false PASS ships.
 *
 * 0.1 is deliberately far below anything a real reconstruction produces. A
 * clone legitimately carries MORE text than the source at a given width (it
 * ships both viewport subtrees), so this ratio is normally at or above 1; the
 * lowest reading over the 30 measured pairs of the 28.6 evidence runs was 1.03,
 * and the degenerate capture read 0.007.
 */
export const SOURCE_UNDER_RENDER_RATIO = 0.1;

/**
 * Overlapping area between visible leaf boxes, as a fraction of the viewport
 * area, in excess of the source's. 0.10 of a viewport is a collision a reader
 * cannot miss (text over text, card over card).
 */
export const OVERLAP_BLOCKER_EXCESS_RATIO = 0.1;

/** The MAJOR band: 2% of the viewport — visible, but local rather than fatal. */
export const OVERLAP_MAJOR_EXCESS_RATIO = 0.02;

/**
 * The smallest overlap excess the rubric will call a MINOR finding. Stated as a
 * constant rather than repeated as a literal because WP-C's demotion accounting
 * has to answer "would this have fired before the demotion?", and that question
 * has no meaning unless the lowest band is a single named number.
 */
export const OVERLAP_MINOR_EXCESS_RATIO = 0.001;

// ---------------------------------------------------------------------------
// WP-C GUARD 3 — duplicate image layers are not a layout collapse
// ---------------------------------------------------------------------------

/**
 * Two IMAGE leaves count as one duplicated layer rather than a layout collapse
 * when they carry the SAME key and every edge of their two boxes agrees to
 * within this many CSS pixels.
 *
 * The key alone is not enough and must never be: two genuinely different
 * repeated components — the same card rendered twice, the same icon in two
 * slots — also share a key, and a real layout bug that piles them on top of
 * each other is exactly the defect this instrument exists to find. What
 * separates a `<picture>` placeholder/full-res pair or a crossfade layer from
 * that bug is that the two boxes are the SAME box: same left, same right, same
 * top, same bottom. 2px absorbs the sub-pixel rounding in
 * `getBoundingClientRect` and nothing else.
 */
export const DUPLICATE_IMAGE_LAYER_TOLERANCE_PX = 2;

/**
 * Excess image leaves whose asset FAILED to paint (clone minus source) that
 * raises a MAJOR finding.
 *
 * One broken image is a visible defect, so the band is 1. It is deliberately
 * not a BLOCKER band: this channel was added to stop a failed asset being
 * double-counted as a layout collapse, and a guard that removes one finding
 * while inventing a more severe one has not made the instrument more honest.
 */
export const IMAGE_LAYER_FAILURE_MAJOR_EXCESS = 1;

// ---------------------------------------------------------------------------
// WP-C GUARD 2 — a source capture that will not hold still
// ---------------------------------------------------------------------------

/**
 * How far one width's SOURCE node population must sit from BOTH of its
 * neighbours' before that capture is called unstable, as a fraction of the
 * neighbour it is being compared against.
 *
 * 0.5 — half again as many elements as the width either side of it. A genuine
 * responsive breakpoint moves the population too, which is why deviation alone
 * can never be the test; see {@link SOURCE_POPULATION_REVERSION_RATIO}.
 */
export const SOURCE_POPULATION_SPIKE_RATIO = 0.5;

/**
 * How close the two NEIGHBOURS must be to each other for the middle width to
 * count as a spike rather than a step.
 *
 * This is the whole discriminator. A breakpoint at 1024 gives 1200 / 1200 /
 * 2400 / 2450: the population jumps once and STAYS, so the neighbours of the
 * jump are 1200 and 2450 — nowhere near each other — and nothing fires. A
 * capture that caught a page mid-render gives 1200 / 1200 / 4200 / 1260: the
 * population jumps and then REVERTS, so the neighbours are 1200 and 1260,
 * within 5% of each other, and the middle reading is the odd one out.
 */
export const SOURCE_POPULATION_REVERSION_RATIO = 0.25;

/**
 * Visible header/nav links, clone as a fraction of source. Half the navigation
 * gone is "unusable navigation". Only applied when the source itself shows at
 * least `NAV_LINK_MIN_SOURCE_LINKS`, because a source that collapses its nav
 * into a menu button at that width has nothing to lose.
 */
export const NAV_LINK_BLOCKER_RATIO = 0.5;
export const NAV_LINK_MIN_SOURCE_LINKS = 3;

/**
 * The largest horizontal band of the page containing NO visible content, as a
 * fraction of scroll height, in excess of the source's. A quarter of the page
 * blank is the task's "pathological whitespace".
 */
export const EMPTY_BAND_BLOCKER_EXCESS_RATIO = 0.25;

/**
 * Visible image/SVG leaves, clone as a fraction of source. Half the imagery
 * gone is "important image or video missing". Guarded by a minimum source
 * count so a page with two icons cannot trip it.
 */
export const IMAGE_PRESENCE_BLOCKER_RATIO = 0.5;
export const IMAGE_PRESENCE_MIN_SOURCE_IMAGES = 4;

// ---------------------------------------------------------------------------
// Rubric thresholds — MAJOR
// ---------------------------------------------------------------------------

/**
 * Difference in the widest structural column count found on the page (see
 * `columns` in the probe). A delta of 2 or more is a responsive MODE flip —
 * four cards in a row against one card per row. A delta of 1 is a wrapping
 * difference and stays MINOR.
 */
export const COLUMN_MODE_MAJOR_DELTA = 2;

/**
 * Unused right gutter (viewport width minus the rightmost content edge) as a
 * fraction of viewport width, in excess of the source's. This is exactly how
 * the 28.5C 700 px defect presents: a ~390 px-wide mobile subtree frozen inside
 * a 700 px viewport leaves ~44% of the width empty. 0.15 is well above normal
 * centred-container gutters, which are symmetric and small.
 */
export const RIGHT_GUTTER_MAJOR_EXCESS_RATIO = 0.15;

/**
 * 90th percentile of the per-node right-edge delta between matched source and
 * clone boxes, in CSS px. 48 px is four times a typical 12 px grid step: past
 * that, a reader sees cards and columns that do not line up. This is the
 * channel the 28.5C audit found missing — it fires on the 280 px navigation
 * misplacement that the offscreen threshold could not see.
 */
export const DISTRIBUTION_MAJOR_P90_PX = 48;

/** The MINOR band for the same channel: sub-pixel to a few px of drift. */
export const DISTRIBUTION_MINOR_P90_PX = 8;

/**
 * A distribution number computed over a minority of the page is not a
 * measurement of the page. Below this matched fraction the distribution
 * channel is RECORDED but cannot raise severity, and the classification says
 * so in its reason string.
 */
export const MIN_TRUSTWORTHY_MATCH_FRACTION = 0.35;

/**
 * Horizontal document overflow (`scrollWidth − innerWidth`) in excess of the
 * source's, in CSS px. 16 px is past any scrollbar/rounding artefact and means
 * the clone made the page horizontally scrollable where the source did not.
 */
export const HORIZONTAL_OVERFLOW_MAJOR_EXCESS_PX = 16;

/**
 * Logo-row bunching. A horizontal group of sibling images whose extent
 * collapses to less than 60% of the source group's extent ratio is "visibly
 * bunched"; any negative gap between consecutive items is an outright overlap.
 */
export const LOGO_ROW_BUNCH_EXTENT_FACTOR = 0.6;

/** A group whose items span less than this fraction of their container and sit
 *  centred in it is reported as piled toward the centre. */
export const LOGO_ROW_PILE_EXTENT_RATIO = 0.6;

// ---------------------------------------------------------------------------
// BLANK REGIONS (Task 28.75) — "the source paints a region here and the clone
// paints nothing in the corresponding one"
// ---------------------------------------------------------------------------
//
// THE GAP THIS CLOSES. On `gs.severance.healthcare /gs/index.do @1440` the
// rubric reported `image-presence-ratio 1.0`, `missing-text-ratio 0.0` and
// `visible-text-ratio 1.0` on a clone whose hero photograph is a white
// rectangle, whose NEWS row carries zero of the source's four cards and whose
// promotional carousel carries none of its four. Every existing channel is a
// PAGE TOTAL: the characters and the images are all still somewhere on the
// clone (`left-edge-delta-median-px 1542`, `p90 5397` — they are displaced, not
// dropped), so every total balances and the page grades MINOR while a human
// calls it broken. A page total cannot see a hole; only a channel that asks
// "what is inside THIS rectangle" can.
//
// TWO MECHANISMS, ONE CHANNEL. `displaced` is the severance case above — the
// clone container still holds its DOM subtree, and that subtree paints
// somewhere else. `absent` is `seoultone.kr /` — the doctor-credential block is
// simply not in the clone at all (`missing-text-ratio 0.278` at 1440). The
// channel fires on both and names which one it saw, because the repair is
// different: displaced is a layout fault, absent is a content fault.

/**
 * REGION SELECTION, part 1 of 4: how wide a box must be, as a fraction of the
 * viewport, before it is a "region" at all.
 *
 * 0.2 — a fifth of the viewport is the narrowest thing a reader would call a
 * column rather than a control. Below it live buttons, badges, avatars and
 * icon wells, none of which is a place content lives; above it live heroes,
 * card rows, sidebars and the halves of a two-up section, which is exactly the
 * population the severance and seoultone defects live in. The census counts
 * every box it rejects for this, so the number is falsifiable from any run.
 */
export const REGION_MIN_WIDTH_RATIO = 0.2;

/**
 * REGION SELECTION, part 2 of 4: minimum box height in CSS px.
 *
 * 60 — two lines of body text plus their leading. A full-width strip shorter
 * than this is a rule, a progress bar or a spacer, and a reader does not
 * experience it as a place where content is missing.
 */
export const REGION_MIN_HEIGHT_PX = 60;

/**
 * REGION SELECTION, part 3 of 4: minimum box area as a fraction of ONE
 * viewport (`innerWidth × innerHeight`), not of the page.
 *
 * 0.02 — 2 % of a viewport, ~26,000 px² at 1440×900. Normalising by the
 * VIEWPORT rather than by the page is deliberate: a 4,900px-tall page and a
 * 900px-tall page make the same hole equally visible to a reader, and dividing
 * by page height would have made seoultone's missing credential block — 0.6 %
 * of that page — indistinguishable from noise.
 */
export const REGION_MIN_VIEWPORT_AREA_RATIO = 0.02;

/**
 * REGION SELECTION, part 4 of 4: two boxes within this many px on all four
 * edges are the SAME region.
 *
 * Real markup wraps one visual section in three or four nested divs with
 * identical geometry. Without this the census would report the same rectangle
 * four times, the union arithmetic would be unaffected but every per-region
 * count would be inflated fourfold, and the rejection histogram would hide it.
 * 4px absorbs sub-pixel layout and a hairline border without merging a section
 * with its genuinely inset child.
 */
export const REGION_BOX_DEDUPE_PX = 4;

/**
 * Regions kept per side. Beyond this the census records `truncated`, the
 * rejection histogram carries `cap-reached`, and the blank-region channel is
 * held INELIGIBLE for the pair.
 *
 * 400, and the number is evidence-driven. At 120 the clone side of
 * `hobbang.net / @390` — a page a human auditor graded excellent at every
 * width — hit the cap with 51 candidates still to go, so 19 source regions
 * found no counterpart, and three of them were reported blank. A cap that
 * truncates in DOCUMENT ORDER manufactures missing counterparts at the BOTTOM
 * of the page, which is the false-positive direction, so the cap is set well
 * clear of the largest real page measured (171 on that clone) and truncation
 * additionally disarms the channel rather than only annotating it.
 */
export const MAX_REGIONS = 400;

/**
 * Paint occupancy is measured on a GRID this many cells on a side, laid over
 * the region's own box (so cells are anisotropic on a wide, short region).
 *
 * 32×32 = 1,024 cells. Why a grid and not an exact rectangle union: a region
 * can contain thousands of leaf boxes and an exact union is O(n²) in the worst
 * case, which at 120 regions × 2 sides × 10 pairs is not affordable. The
 * quantisation ROUNDS COVERAGE UP — a 1px rule marks a whole cell row — and
 * that is the safe direction here, because the test that decides whether to
 * FIRE is "the clone painted almost nothing", and over-reporting the clone's
 * paint can only suppress a finding. The source-populated test is deliberately
 * NOT left to the grid alone; it also demands unquantised leaf and character
 * counts (below).
 */
export const REGION_PAINT_GRID = 32;

/**
 * BACKDROPS. A leaf whose own box is more than this many times the region's
 * area is not content OF the region; it is something the region is drawn on top
 * of, and it is left out of the region's paint occupancy on BOTH sides.
 *
 * 2. THE MEASUREMENT THAT FORCED IT: on `seoultone.kr / @1440` the clone paints
 * a decorative full-bleed `<svg>` 3,600 x 3,240px — 11.7M px², forty times the
 * area of the 542x529 doctor-credential block that is missing beneath it. With
 * that one leaf counted, the empty block read 21.9 % painted with ZERO leaves
 * in it and the channel refused to fire on the fixture it exists for. The rule
 * is applied identically to the source, so it cannot manufacture a finding:
 * a source region whose only paint is a backdrop simply stops being POPULATED,
 * and an unpopulated region can never produce one.
 */
export const REGION_BACKDROP_AREA_FACTOR = 2;

/**
 * SOURCE-POPULATED, evidence 1 of 4: the source region's paint occupancy.
 *
 * 0.06 — 6 % of the region's own box carries a painted leaf. A heading plus a
 * paragraph in a half-viewport panel clears this comfortably; a section that
 * is mostly deliberate whitespace with one caption in a corner does not, and
 * MUST not, because intentional whitespace is exactly what this channel is
 * forbidden to grade.
 */
export const REGION_SOURCE_PAINT_RATIO = 0.06;

/** SOURCE-POPULATED, evidence 2 of 4: painted leaves inside the box. 3 —
 *  fewer than three is a caption or a single control, not a populated region,
 *  and one stray leaf must never make a rectangle "content". */
export const REGION_SOURCE_MIN_LEAVES = 3;

/** SOURCE-POPULATED, evidence 3 of 4: either real prose or a real picture.
 *  20 characters is about four Korean or three English words — below it the
 *  "text" is a label or a page number. An image leaf substitutes for it, so a
 *  photo gallery with no words is still a populated region. */
export const REGION_SOURCE_MIN_CHARS = 20;

/** SOURCE-POPULATED, evidence 4 of 4: DOM-visible element descendants. 3 —
 *  the structural echo of evidence 2, read from the DOM instead of from the
 *  geometry, so a region that is one giant painted box is not mistaken for a
 *  populated container. */
export const REGION_SOURCE_MIN_DESCENDANTS = 3;

/**
 * CLONE-BLANK, evidence 1 of 3: absolute paint occupancy in the clone's
 * corresponding box.
 *
 * 0.02 — 2 % of the region. Not 0: an empty hero routinely keeps one 24px
 * chat-launcher or a single 1px divider, and a channel that demanded literal
 * zero would be defeated by a scrollbar arrow. At 2 % of a 1440×486 hero that
 * is a 14,000px² allowance, roughly a 120×120 badge.
 */
export const REGION_CLONE_BLANK_PAINT_RATIO = 0.02;

/**
 * CLONE-BLANK, evidence 2 of 3: paint RETAINED relative to the source's.
 *
 * 0.15 — the clone must have lost at least 85 % of the region's occupancy.
 * The absolute test alone would fire on a source region that is itself only
 * 6 % painted; requiring both means a sparse source region can only fire when
 * the clone is emptier still, by a wide margin.
 */
export const REGION_CLONE_BLANK_RETAINED_RATIO = 0.15;

/**
 * CLONE-BLANK, evidence 3 of 3: leaves left in the clone's box, as a fraction
 * of the source's, floored so a small source region is not held to an
 * impossible standard.
 *
 * 0.1 with a floor of 2 — a region the source fills with 40 leaves may keep
 * 4; a region the source fills with 5 may keep 2.
 */
export const REGION_CLONE_BLANK_LEAF_RETAINED_RATIO = 0.1;
export const REGION_CLONE_BLANK_MIN_LEAF_ALLOWANCE = 2;

/**
 * A blanked region must cover at least this fraction of ONE viewport to be
 * reported at all.
 *
 * 0.02, the same floor the census itself applies. Stated separately because
 * the two answer different questions — "is this a region" and "is this hole
 * worth a reader's attention" — and a later change to one must not silently
 * move the other.
 */
export const REGION_BLANK_MIN_VIEWPORT_AREA_RATIO = 0.02;

/**
 * Minimum shared tag-path suffix segments for two regions, one per side, to be
 * the same region.
 *
 * 2, matching `compareColumns`'s container matcher rather than the leaf
 * matcher's 3. A region path's last segment is a structural tag (`div`,
 * `section`, `ul`) and the second-to-last is its position among its siblings,
 * which together are already far more specific than a leaf's trailing `svg` or
 * `img`. The FULL path cannot be the key — item C3.4 measured that at a 0 %
 * hit rate, because the generator bolts its own shell on to the front of every
 * clone path — and the experiment in Task 28.75 re-measured it on regions and
 * got the same answer.
 */
export const MIN_REGION_SUFFIX_SEGMENTS = 2;

/**
 * The clone's page height must be within this fraction of the source's before
 * the LAST-RESORT fallback — measure the clone's paint inside the SOURCE's raw
 * rectangle, for a source region that pairs with no clone region AND has no
 * paired ancestor to anchor to — may be used at all. 0.15: beyond a 15 %
 * height difference the same y coordinate is a different part of the page.
 *
 * EQUAL HEIGHT IS NOT ENOUGH, and that had to be measured. `hobbang.net / @390`
 * has source 17,167px and clone 17,230px — a 0.4 % difference — and its clone's
 * `<main>` still begins 8,011px lower than the source's, so a raw source
 * rectangle read on that clone lands most of a page away. The raw fallback is
 * therefore gated on BOTH this height test and a MEASURED alignment: see
 * {@link REGION_ALIGNMENT_TOLERANCE_PX}.
 */
export const REGION_FALLBACK_HEIGHT_TOLERANCE = 0.15;

/**
 * How far the two sides' paired regions may sit apart, at the MEDIAN, before
 * their coordinate systems are declared incomparable and the raw-rectangle
 * fallback is refused.
 *
 * 16px, on both axes, over at least {@link REGION_ALIGNMENT_MIN_PAIRS} pairs.
 * The median is the right statistic because one displaced carousel must not
 * disqualify a page, and because the failure this guards against — a constant
 * whole-page offset — moves every pair at once. Measured: severance 0px median
 * (aligned, fallback allowed), seoultone 1,164px, hobbang @390 8,600px (both
 * refused, and both then rely on ancestor-anchored mapping instead).
 */
export const REGION_ALIGNMENT_TOLERANCE_PX = 16;

/** Paired regions needed before their median offset is a statistic at all. */
export const REGION_ALIGNMENT_MIN_PAIRS = 3;

/**
 * ANCESTOR-ANCHORED MAPPING: how far the two sides' copies of one container may
 * differ in size before a coordinate mapped through it is refused.
 *
 * 1.35 in either direction. THE MEASUREMENT THAT FORCED THIS MECHANISM: on
 * `seoultone.kr / @1440` the two pages are the same height (4,892px both) and
 * every section of the clone is still 1,164px LOWER than the source's, because
 * the source overlays its event popup and the clone lays it out inline. A raw
 * source rectangle read on the clone therefore lands a screen and a half away
 * and reported the missing doctor-credential block as populated — a false PASS
 * on the very fixture the channel exists for. Mapping the box through the
 * nearest PAIRED ancestor region instead cancels the offset exactly, because
 * both sides' copies of that ancestor are the same container.
 */
export const REGION_MAP_SCALE_TOLERANCE = 1.35;

// ---------------------------------------------------------------------------
// The INK leg (Task 28.75, wave 2)
// ---------------------------------------------------------------------------
//
// WHY THE DOM IS NOT ENOUGH, MEASURED. The `gs.severance.healthcare` hero is a
// white rectangle to a reader and PERFECT to every DOM census: the clone's hero
// sits at exactly the source geometry (-240, 215, 1920x500), `opacity: 1`, its
// image decoded (`complete && naturalWidth > 0`), its headline text present and
// counted. It is invisible because the `<body>` background is emitted as an
// ordinary in-flow block background instead of being propagated to the document
// canvas, so it paints OVER the hero (z-index: -1) and the white headline is
// then white on white. Visible-descendant count, character count, image-leaf
// count, geometry and correspondence all read NORMAL. Only the pixels see it.
//
// So the channel has a second, independent leg: region-level INK occupancy read
// off the two full-page screenshots. Ink and DOM are ORed — either can report a
// region — because they fail in different places: the DOM leg is blind to
// colour, and the ink leg is blind to a region that is off the bottom of a
// short screenshot or painted in a colour that happens to be the region's own
// modal.

/**
 * A region's INK is the fraction of its sampled pixels whose CIE ΔE*76
 * distance from the region's OWN modal (background) colour exceeds the JND.
 *
 * The modal colour is taken per REGION rather than per page on purpose: a
 * coloured band's background is not the page's background, and a page-level
 * modal would score the whole band as ink and never see a hole in it.
 */
export const REGION_INK_SAMPLE_BUDGET = 40_000;

/** Colour cube resolution for the modal-colour histogram: 5 bits per channel,
 *  32,768 bins. Fine enough to separate text from its background, coarse enough
 *  that a photographic gradient still has one dominant bin. */
export const REGION_INK_HISTOGRAM_BITS = 5;

/** A region smaller than this many sampled pixels has no trustworthy modal
 *  colour and its ink reading is reported unavailable rather than guessed. */
export const REGION_INK_MIN_SAMPLES = 400;

/**
 * SOURCE-POPULATED by ink: the source region must be drawn on.
 *
 * 0.03 — 3 % of the region's pixels differ from its own background. A page of
 * body text is 5-15 %; a heading in a large panel is 3-6 %; a panel holding
 * nothing but its background colour is < 0.5 %.
 */
export const REGION_SOURCE_INK_RATIO = 0.03;

/**
 * CLONE-BLANK by ink: the clone region is drawn on almost not at all.
 *
 * 0.05, and the number is measured rather than guessed. On
 * `gs.severance.healthcare /gs/index.do @1440` the hero band `div/article/div`
 * reads 96.8 % ink on the source (a photograph) and 3.3 % on the clone — a flat
 * white rectangle with one blue phone-number pill and a round patient badge
 * left in it. Its inner box reads 1.7 %. Every HEALTHY region on the same page
 * reads within a hair of its source: 12.25 %→13.00 %, 76.09 %→76.20 %,
 * 81.08 %→81.08 %. So the population is bimodal and the threshold has a wide
 * corridor; 5 % sits above the leftover furniture in a blanked band and an
 * order of magnitude below any region that still carries its content.
 *
 * It is never read alone — {@link REGION_CLONE_BLANK_INK_RETAINED_RATIO} must
 * agree — because 5 % of a large region is a lot of pixels in absolute terms.
 */
export const REGION_CLONE_BLANK_INK_RATIO = 0.05;

/**
 * …and it must also have lost most of the source's ink, for the same reason the
 * DOM leg has a retained-ratio test: an absolute floor alone would fire on a
 * source region that was barely drawn on either.
 *
 * 0.15 — an 85 % loss. Measured on the same page: the hero retains 3.4 %, the
 * NEWS band 5.1 %, the NEWS card row 0.0 %, and every healthy region retains
 * between 94 % and 100 %. Nothing on that page lands between 15 % and 94 %.
 */
export const REGION_CLONE_BLANK_INK_RETAINED_RATIO = 0.15;

/**
 * THE CORROBORATION FLOOR for an INK-ONLY blank region (Task 28.8 FAST, item 1).
 *
 * `cloneRegionIsBlankByInk` answers "are the clone's pixels flat where the
 * source's are not?". That question is necessary — it is the only way the
 * severance hero, whose DOM is perfect and whose headline lands white-on-white,
 * can be seen at all — and it is NOT sufficient, because it compares the clone
 * to the SOURCE and never to the clone's own claim about itself.
 *
 * THE FALSE POSITIVE IT LETS THROUGH, measured. `seoultone.kr / @1440` fired
 * `blank-region-ratio` at BLOCKER (0.5767) on two regions:
 *
 *   div/footer  source paint 12 %/17 leaves → clone 12 %/17, ink 47.2 % → 3.3 %
 *   div/header  source paint 22 %/10 leaves → clone 19 %/10, ink 38.0 % → 4.3 %
 *
 * Both clone regions carry every leaf the source carries, at the same box
 * coverage. A human auditor looked at the pixels and found no missing section
 * anywhere on the page — the largest blank band at 1440 is 183 px of ordinary
 * section padding below a certificate carousel, and the doctor biography the
 * band precedes is MORE complete on the clone than on the source. The two
 * source regions ink high because the source draws a coloured panel and a
 * photographic band there; the clone draws plain text on plain ground, which is
 * a THEME difference and is graded by the pixel channels, not a hole.
 *
 * THE TEST THIS CONSTANT ADDS. Ink alone becomes corroborating evidence of
 * ABSENT CONTENT only when the clone's ink also falls short of what the CLONE's
 * OWN DOM says it paints there — `cloneInk.inkRatio < clonePaint.paintRatio ×
 * this`. It asks the question the source comparison cannot: not "does the clone
 * ink like the source did" but "does the clone ink like something that painted
 * the boxes it claims to have painted".
 *
 * 0.1, with a wide measured corridor on either side:
 *
 *   severance hero   clone ink 3.3 % against a box a photograph fills
 *                    (paint ≈ 1.0)              → 0.03   CORROBORATED
 *   seoultone footer clone ink 3.3 %, paint 12 % → 0.275  not corroborated
 *   seoultone header clone ink 4.3 %, paint 19 % → 0.226  not corroborated
 *
 * Glyphs cover roughly a quarter of the line boxes that hold them, so a text
 * block that paints normally lands near 0.25 and a rectangle whose declared
 * paint did not arrive lands near 0. Nothing measured falls between 0.04 and
 * 0.22.
 *
 * An uncorroborated region is still REPORTED and still counted in the channel's
 * value. It only loses the ability to carry the finding to BLOCKER — see
 * `blankRegionSeverityCap` in `classify.ts`.
 */
export const REGION_INK_ONLY_CORROBORATION_PAINT_RATIO = 0.1;

/**
 * A source region must carry something a reader would miss before its
 * disappearance can corroborate anything: at least one text or image LEAF whose
 * centre lies in the rectangle. A region of pure whitespace, padding or
 * decoration has nothing to be absent.
 */
export const REGION_MEANINGFUL_SOURCE_LEAVES = 1;

/*
 * ---------------------------------------------------------------------------
 * TASK 28.8 FAST, ITEM 2 — LOCAL TEXT COLLISION INSIDE A CRITICAL REGION
 * ---------------------------------------------------------------------------
 *
 * `overlap-excess-ratio` is an AREA channel divided by ONE VIEWPORT, summed
 * over the whole document. Two glyph boxes piling on top of each other are a
 * few thousand px² on a page that is tens of millions, so the one defect a
 * reader cannot work around — text printed over text in the block they came to
 * read — is arithmetically invisible to it.
 *
 * Measured, docs/result/28.8/09-final-visual-audit.md § D2, the single most
 * widespread class in the 18-pair corpus (1 blocker, 4 majors):
 *
 *   seoultone 진료시간   every closing time displaced down and left onto the
 *                        following row's LABEL — "8:00" lands on 토요일, "4:00"
 *                        on 점심시간 — so a clinic visitor cannot tell what time
 *                        the clinic shuts. Graded MAJOR by a human.
 *   hobbang footer       a compact inline link list wraps mid-word and the
 *                        wrapped tails collide with the row beneath; at 390 it
 *                        is a partly illegible pile. Graded BLOCKER.
 *
 * So the channel is a COUNT OF ROWS inside COMPACT CRITICAL REGIONS, never an
 * area over a page height, and it is scored against the SOURCE's own count at
 * the same width like every other channel here.
 */

/**
 * The regions this channel looks inside, by TAG ALONE.
 *
 * Generic HTML structure, never a hostname and never a class name: a footer, a
 * header, a nav, a table, a definition list, an address block and a form are
 * the surfaces where a collision destroys information rather than merely
 * looking untidy, on every site in every language. A collision in the middle of
 * a long prose section is ugly; a collision in an opening-hours table means the
 * reader gets the wrong answer.
 */
export const CRITICAL_REGION_TAGS: ReadonlySet<string> = new Set([
  "footer",
  "header",
  "nav",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "dl",
  "form",
  "address",
  "fieldset",
]);

/**
 * …and only while the region is COMPACT: at most this fraction of one viewport
 * tall. A `<form>` that is the whole page, or a `<table>` used for layout and
 * running for four screens, is not the dense information block this channel is
 * about, and counting rows across it would reintroduce exactly the averaging
 * the channel exists to avoid.
 *
 * 0.75 — a footer, a header, a nav bar and an opening-hours table all fit
 * inside three quarters of a screen at every width in the corpus.
 */
export const CRITICAL_REGION_MAX_VIEWPORT_HEIGHT_RATIO = 0.75;

/**
 * How much of the SMALLER of two glyph boxes the intersection must cover before
 * the pair counts as a collision.
 *
 * 0.25. Two line boxes in a healthy layout do not intersect at all; a shared
 * edge, a 1px rounding overlap and a descender clipping the line below all land
 * far under a quarter. A quarter of a line box covered by another line's glyphs
 * is the "clearly unreadable" case and nothing else reaches it.
 */
export const TEXT_COLLISION_MIN_INTERSECTION_RATIO = 0.25;

/**
 * Rows in excess of the SOURCE's own count, inside compact critical regions.
 *
 *   MAJOR   1  the seoultone 진료시간 block: one collided row is one fact the
 *              reader gets wrong, and a human graded that pair MAJOR on it.
 *   BLOCKER 4  the hobbang footer: enough rows that the block reads as a pile
 *              rather than as a list, which a human graded BLOCKER.
 */
export const CRITICAL_TEXT_COLLISION_MAJOR_ROWS = 1;
export const CRITICAL_TEXT_COLLISION_BLOCKER_ROWS = 4;

/** Comparisons per leaf inside one critical region, so a pathological block
 *  cannot turn the sweep into a hang. Recorded when it bites. */
export const MAX_TEXT_COLLISION_COMPARISONS_PER_LEAF = 200;

/** Collided rows listed as worst offenders. The COUNT is over every pair. */
export const MAX_TEXT_COLLISION_SAMPLES = 8;

/**
 * THE INK LEG'S PRECONDITION: does this side's DOM census describe the same
 * layout its screenshot shows?
 *
 * The DOM leg compares a DOM to a DOM and cannot be fooled by a stale capture —
 * both readings come from the same census. The INK leg does not have that
 * protection: it reads a rectangle measured by the DOM out of a picture taken
 * separately, and if the page moved between the two, the rectangle points at
 * the wrong pixels. That failure is silent and it manufactures holes.
 *
 * MEASURED, on `hobbang.net / @1440` and `/@390` — a page a human graded
 * excellent at every width, and the false positive that forced this rule. The
 * source's deepest painted leaf sits at y=5,574 on a page whose own
 * `scrollHeight` is 10,863 (51 %; at 390 it is 8,544 of 17,167, 50 %), because
 * the bottom half of the page had not revealed itself when the probe ran and
 * had by the time the screenshot was taken. `main/section[10]`'s DOM box says
 * y=1,140-2,194 while its content is painted at y=6,409 in that side's OWN
 * screenshot. Ink then compared a card grid against a text list and reported
 * 47.6 % → 4.7 %: a BLOCKER-sized hole in a page with no hole in it. Every
 * other measured side lands at 0.98-1.00: severance 0.98 source / 1.00 clone,
 * seoultone 0.98 / 1.00, linear 1.00 / 1.00. Nothing measured falls between
 * 0.51 and 0.98.
 *
 * 0.8 — the bottom fifth of a page may legitimately hold nothing a leaf census
 * counts (a footer that is one background image, a full-bleed media block), so
 * the gate is set below any honest shortfall and far above the 0.51 that a
 * stale capture produced.
 *
 * When it fails, the ink leg is switched off for the WHOLE pair and said so in
 * the report. The DOM leg still runs; the channel becomes DOM-only, which is
 * the configuration that cannot see paint occlusion — so this is a real loss of
 * sensitivity, deliberately taken, because the alternative is a false BLOCKER.
 */
export const REGION_INK_DOM_COVERAGE_MIN = 0.8;

/**
 * The screenshot must also BE this side's page. `CAPTURE_DEVICE_SCALE_FACTOR`
 * is 1, so a full-page capture of a page H px tall is an H px tall image and a
 * CSS-px box indexes it directly.
 *
 * HEIGHT is checked to this tolerance and WIDTH is only checked for being at
 * least the viewport's, because the two axes fail differently. A full-page
 * capture starts at the document origin and extends to the full SCROLL width,
 * so a page that overflows horizontally is photographed wider than its viewport
 * with the origin unmoved — `gs.severance.healthcare @1100` is a 1,100 px
 * viewport photographed 1,280 px wide, and every box in it still indexes the
 * right columns. A capture NARROWER than the viewport, or of a different
 * height, is a different page and ink is withheld rather than silently scaled
 * by a factor nobody measured.
 *
 * 0.02 — 2 %, enough for a scrollbar's worth of rounding, not enough for a
 * different viewport.
 */
export const REGION_INK_IMAGE_SCALE_TOLERANCE = 0.02;

/**
 * `blank-region-ratio` bands: blanked source-region area, unioned so nesting
 * cannot double-count it, divided by ONE viewport's area.
 *
 * The unit is "viewport-fulls of hole", which is what a reader scrolling the
 * page actually experiences, and it is why the value can exceed 1.
 *
 *   BLOCKER 0.25  a quarter of a screen is blank where the source is full.
 *                 severance @1440 measures 1.05 against it — the hero, the
 *                 NEWS row and the carousel between them are a full screen of
 *                 nothing — and seoultone @1440 measures 0.44.
 *   MAJOR   0.10  a tenth of a screen: a missing card row or a missing column.
 *   MINOR   0.02  the census floor. One small container that came out empty is
 *                 worth recording and is never worth a BLOCKER, which is what
 *                 keeping the bands three-deep guarantees.
 */
export const BLANK_REGION_BLOCKER_RATIO = 0.25;
export const BLANK_REGION_MAJOR_RATIO = 0.1;
export const BLANK_REGION_MINOR_RATIO = 0.02;

/**
 * Clone scroll height as a fraction of the source's. Outside this band the
 * clone is not laying the page out the same way at all — content stacked that
 * should be side by side (too tall) or collapsed that should be stacked (too
 * short).
 */
export const SCROLL_HEIGHT_MAJOR_MIN_RATIO = 0.6;
export const SCROLL_HEIGHT_MAJOR_MAX_RATIO = 1.7;

/**
 * Fraction of the compared pixel overlap whose ΔE*76 exceeds the
 * clearly-visible threshold (10). Half the compared area visibly repainted is
 * "very obvious typography / colour mismatch". This channel can only ADD a
 * finding; it never removes one.
 */
export const PIXEL_VISIBLE_MAJOR_RATIO = 0.5;

/**
 * The MINOR band for pixels: any measurable difference above the just-
 * noticeable ΔE*76 threshold. This is where antialiasing, tracking, shadow and
 * animation-timing differences land, exactly as the task's MINOR definition
 * describes.
 */
export const PIXEL_JND_MINOR_RATIO = 0.01;

// ---------------------------------------------------------------------------
// Pixel gate — separating the noise floor from the real difference (item C3.1)
// ---------------------------------------------------------------------------

/**
 * WHAT THE RAW ΔE CHANNEL COULD NOT SAY.
 *
 * `deltaE76AboveJndRatio` counts every pixel whose colour moved, and on a real
 * reconstruction that number never approaches zero: the harness's own evidence
 * run read 1.72 % on linear.app/pricing @1440, a pair with no other finding at
 * all, which made MINOR the floor of the scale and PASS unreachable in
 * practice. A class whose best value is never awarded carries no information.
 *
 * Rather than move the threshold until the number behaved, the channel is now
 * SPLIT, and the split is a physical one:
 *
 *   SUB-PIXEL part — a difference that disappears when the comparison is
 *   allowed to look `PIXEL_GATE_RADIUS_PX` away in either image. Glyph
 *   antialiasing, a half-pixel baseline, a rounded border, an image resampled
 *   one pixel over: the SAME colour is present, just not under the same
 *   coordinate. This part is reported and can never raise severity.
 *
 *   RESIDUAL part — a difference that survives that search. The colour is not
 *   there at all within a pixel in any direction: something is a different
 *   colour, a different weight, a different size, or absent. This is what the
 *   rubric now reads.
 *
 * The residual is additionally attributed, because "1.5 % of the page is
 * repainted" means different things depending on WHERE: a residual sitting on a
 * high-contrast edge of the SOURCE is a glyph or icon rendered differently,
 * while a residual in a flat region is a fill, a gap or a moved block. Both are
 * real; they are not the same defect, and the artifact reports them separately.
 */

/**
 * Local search radius, in px, for the displacement-tolerant comparison. 1 px is
 * deliberately the smallest useful value: it is exactly the scale at which
 * "the renderer put this at a slightly different subpixel offset" lives, and
 * nothing larger, so a genuine 2 px misalignment is still counted in full.
 */
export const PIXEL_GATE_RADIUS_PX = 1;

/**
 * Luminance range (0–255) across the SOURCE's 3×3 neighbourhood above which a
 * residual pixel is attributed to an EDGE — a glyph, an icon or a border —
 * rather than to a flat region. 20 is well above 8-bit dithering and well below
 * body-text contrast.
 */
export const TEXT_EDGE_LUMINANCE_RANGE = 20;

/**
 * MINOR band for the residual channel. Held at 1 % of the compared area, the
 * same number the raw channel used, because the honest change here is WHAT is
 * measured, not how much of it is tolerated: a full percent of a page whose
 * colour is not present within a pixel in the other image is a difference a
 * reader can see. Whether PASS is reachable is then an empirical question, and
 * `--self-check` answers it by running this same rubric on the SOURCE against a
 * second capture of ITSELF and writing the result into the artifact.
 */
export const PIXEL_RESIDUAL_MINOR_RATIO = 0.01;

/**
 * TASK 28.75, item L3. When the uncompared HORIZONTAL band's ink reaches this
 * fraction of the compared canvas, the pixel comparison did not look at the
 * region under investigation and that is reported as a MAJOR finding.
 *
 * THE NUMBER IS DERIVED, NOT CHOSEN. It is {@link PIXEL_RESIDUAL_MINOR_RATIO}
 * — the smallest pixel difference this rubric is willing to report at all —
 * restated over the region the min-crop removes. The reasoning is one line: if
 * the strip that was never compared carries at least as much ink as the
 * smallest difference the pixel channels would have fired on, then that strip
 * could by itself have carried a pixel finding, and a clean pixel reading over
 * the remainder is not evidence about the page. Moving this constant
 * independently of `PIXEL_RESIDUAL_MINOR_RATIO` would break that derivation,
 * which is why it is defined in terms of it.
 *
 * WHY MAJOR AND NOT MINOR. This channel does not report a DIFFERENCE; it
 * reports that the instrument did not look. MINOR is the band for "a reader
 * might notice this", and grading a hole in the evidence as a small defect of
 * the clone misdescribes it. WP-C guard 4 already fixed the repo's rule for
 * this case — measurement failure is never green — and this is that rule
 * applied to a partial measurement.
 *
 * WHY ONLY THE HORIZONTAL BAND FIRES. A height difference between two captures
 * is already a first-class finding on `scroll-height-ratio-high` / `-low`, and
 * the strip it leaves uncompared is the bottom of a longer page, which no
 * channel is investigating. A WIDTH difference means the two captures do not
 * describe the same viewport width at all, and the strip it leaves uncompared
 * is exactly the offscreen band the frozen-width defect produces. The vertical
 * band is measured and recorded; only the horizontal band is graded.
 */
export const PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO = PIXEL_RESIDUAL_MINOR_RATIO;

/**
 * TASK 28.75, item B7. Where the QA capture files the page-state normalizer's
 * before/after PNGs and per-attempt records.
 *
 * Deliberately OUTSIDE `docs/result/`: permanently-enabled production code must
 * not write into a frozen wave's artifact directory. This mirrors the observer
 * lane's own `PAGE_STATE_EVIDENCE_ROOT_DEFAULT` and keeps the QA sweep's
 * evidence separable from the observer's.
 */
export const QA_PAGE_STATE_EVIDENCE_ROOT = "data/page-state-evidence/responsive-qa";

/**
 * The version of the RUBRIC — the set of channels and the bands on them —
 * written into every run artifact (item C3.13).
 *
 * Bump it whenever a channel is added, removed, renamed or re-banded. It is the
 * only way a consumer holding two artifacts can tell whether their verdicts may
 * be compared or summed. `schemaVersion` cannot do that job: it describes the
 * JSON shape, and a roster can change without the shape changing.
 *
 * 1 — Task 28.6 wave 2/3, 38 channels.
 * 2 — Task 28.6 wave 4 (items C3.10-C3.13): adds `missing-text-absent-ratio`,
 *     `missing-text-boundary-only-chars`, `pixel-residual-ink-ratio`,
 *     `pixel-source-ink-ratio`, `scroll-depth-ratio` and
 *     `shadow-text-chars-source`; re-bases `missing-text-ratio` on occurrence
 *     counts and token-boundary matching, and `matched-fraction-content-keyed`
 *     on the content-keyed passes alone.
 * 3 — Task 28.6 wave 6 (items G1-G3): adds `opacity-hidden-text-chars`,
 *     `opacity-hidden-nodes`, `missing-text-script-relaxed-chars`,
 *     `position-delta-offviewport-pairs`, `position-delta-offviewport-p90-px`
 *     and `position-delta-p90-all-pairs-px`; re-bases the visible-text census
 *     on the box census's opacity test, the token boundary on the script of the
 *     characters at the edge, and `position-delta-p90-px` on the pairs whose
 *     SOURCE box begins inside the viewport. Every one of the three re-basings
 *     removes a FALSE PASS, so a rubric-3 verdict can be WORSE than the
 *     rubric-2 verdict of the same pair on the same clone.
 * 4 — WP-C, the four honesty guards: adds `clone-route-missing`,
 *     `duplicate-image-stack`, `duplicate-image-stack-area-ratio`,
 *     `image-layer-state`, `overlap-excess-ratio-undemoted` and
 *     `source-capture-unstable`; re-bases `overlap-excess-ratio` on the TRUE
 *     overlap (duplicate image layers and overlaps on a failed image asset
 *     demoted out of it) and makes a pair whose clone route 404s produce ONE
 *     finding instead of a dozen. Unlike 1→3, every one of these re-basings can
 *     REMOVE a finding, so a rubric-4 verdict can be BETTER than the rubric-3
 *     verdict of the same pair on the same clone — which is why every removal
 *     is counted in `summary.coverage` and the totals are conserved there.
 * 5 — Task 28.75, the blank-region channel: adds `blank-region-ratio` (fires),
 *     `blank-region-count`, `blank-region-largest-viewport-ratio`,
 *     `blank-region-displaced-count`, `blank-region-absent-count`,
 *     `blank-region-source-populated-count` and `region-census-selected`
 *     (recorded). It is the first channel in the roster that reads a
 *     RECTANGLE rather than a page total, so it can see a hole that every
 *     total balances over: a hero, a card row or a carousel that the source
 *     fills and the clone leaves empty. It only ever ADDS findings — no
 *     existing channel is re-based — so a rubric-5 verdict can be WORSE than
 *     the rubric-4 verdict of the same pair on the same clone and can never be
 *     better.
 * 6 - Task 28.75, the three QA honesty defects (items L1, L3, B7). Adds
 *     `overlap-demoted-excess-ratio` (FIRES), `pixel-uncompared-band-ink-ratio`
 *     (FIRES), `pixel-uncompared-vertical-band-ink-ratio`,
 *     `pixel-compared-area-ratio`, `page-state-source-overlays-dismissed`,
 *     `page-state-clone-overlays-dismissed` and `page-state-comparable`
 *     (recorded). It also RE-BASES two things that already existed:
 *
 *       L1  `classifyOverlapPair` consults geometry and ownership BEFORE the
 *           image load flag. A broken image asset can no longer, on its own,
 *           move a collision between two different visual owners out of the
 *           BLOCKER-capable `overlap-excess-ratio` into the MAJOR-only
 *           `image-layer-state`. This can only ADD findings; a rubric-6 verdict
 *           can be WORSE than the rubric-5 verdict of the same clone and, on
 *           this channel, never better. The area the guard does still demote is
 *           now itself graded relative to the source's own demoted area, so the
 *           demotion is falsifiable per pair instead of unconditional.
 *
 *       B7  `missing-text-ratio` and `visible-text-ratio` are held INELIGIBLE
 *           when the SOURCE capture still carries an entry overlay that
 *           qualified for dismissal and did not close. This can only REMOVE
 *           findings, and only on pairs whose two sides are in different page
 *           states — the case in which the finding was measuring the harness
 *           rather than the clone. The QA capture now runs the observer's own
 *           two-call page-state contract on BOTH sides, so the ordinary case is
 *           that both sides reach the same state and nothing is held.
 *
 *     L3 adds a channel and re-bases nothing: the pixel comparison still runs
 *     on the same top-left min-crop and returns the same numbers over it. What
 *     is new is that the region the crop REMOVES is measured, in area and in
 *     ink, and a strip carrying at least as much ink as the smallest pixel
 *     difference this rubric will report is a MAJOR measurement failure rather
 *     than silence.
 *
 *     NET EFFECT ON COMPARABILITY: a rubric-6 verdict may be worse (L1), better
 *     (B7) or unchanged than the rubric-5 verdict of the same pair on the same
 *     clone, so rubric-5 and rubric-6 verdicts must NOT be compared, summed or
 *     used as each other's floor. `floorFrom` already refuses a floor whose
 *     `rubricVersion` differs, and this is the bump that makes it refuse.
 *
 * 7 — TASK 28.8 FAST. `blank-region-ratio` may now reach BLOCKER only where the
 *     absence of meaningful content is corroborated (uncorroborated blanked
 *     area caps at MINOR), and `critical-text-collision-rows` /
 *     `critical-text-collision-regions` are new. Both a verdict change and a
 *     roster change, so rubric-6 and rubric-7 runs must not be compared.
 */
export const RUBRIC_VERSION = 8;

// ---------------------------------------------------------------------------
// Probe limits (artifact size, not measurement policy)
// ---------------------------------------------------------------------------

/** A normalized text key longer than this is truncated. Long keys do not
 *  improve matching and they dominate the artifact's size. */
export const TEXT_KEY_MAX_CHARS = 120;

/** Leaf boxes recorded per side. Beyond this the page is pathological and the
 *  distribution is computed over the first N in document order; the artifact
 *  records that it was truncated. */
export const MAX_LEAF_BOXES = 6000;

/** Overlapping pairs listed as worst offenders (the TOTAL area is summed over
 *  all pairs regardless). */
export const MAX_OVERLAP_SAMPLES = 8;

/** Missing-text samples kept, longest first. */
export const MAX_MISSING_TEXT_SAMPLES = 12;

/**
 * Minimum shared tag-path segments for the structural (third) correspondence
 * pass to pair two unlabelled image leaves (item C3.4).
 *
 * The generator wraps the source subtree in its own layout shell, so a clone
 * path is the source path with a fixed prefix bolted on; matching on the path
 * SUFFIX is what survives that, and it is the same key `compareColumns` already
 * uses successfully for flex/grid containers. Three segments rather than the
 * container matcher's two, because a leaf path's last segment is often just
 * `svg` or `img` and two segments would pair almost anything.
 */
export const MIN_LEAF_SUFFIX_SEGMENTS = 3;

/**
 * Comparison budget for the structural pass, which is |source| × |clone| within
 * a tag group. When a page exceeds it the pass stops and the correspondence
 * result records `structuralPassTruncated: true` — a budget that is reported is
 * a measurement.
 */
export const MAX_STRUCTURAL_PAIR_COMPARISONS = 400_000;

/** Grid/flex containers reported, largest visible child count first. */
export const MAX_COLUMN_CONTAINERS = 8;

/** Row-clustering tolerance in CSS px: two children are on the same row when
 *  their box tops are within this distance. */
export const ROW_CLUSTER_TOLERANCE_PX = 12;

/** Minimum visible element children for a container to be considered a
 *  candidate for column-mode measurement. */
export const MIN_COLUMN_CONTAINER_CHILDREN = 3;

/** Minimum sibling images for a horizontal group to count as a logo row. */
export const MIN_LOGO_ROW_ITEMS = 3;

/** Vertical band resolution, in CSS px, for the empty-band sweep. */
export const EMPTY_BAND_ROW_PX = 8;

/**
 * A box wider than this many viewports is a full-bleed wrapper for the purposes
 * of the `contentMaxRight` / landmark `maxRight` statistics. It is EXCLUDED
 * from those two statistics and COUNTED everywhere it is excluded (item C3.3);
 * it is never excluded from an overflow or clipping test.
 */
export const WIDE_ELEMENT_VIEWPORT_FACTOR = 1.5;

/** Composite images are scaled down (BOTH sides by the same factor) so a very
 *  tall page still fits in one reviewable PNG. */
export const COMPOSITE_MAX_SIDE_HEIGHT_PX = 3600;

/** Contact-sheet thumbnail width per composite. */
export const CONTACT_SHEET_THUMB_WIDTH_PX = 560;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Bad operator input: missing app, unreadable route map, empty route list. */
export class ResponsiveQaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponsiveQaInputError";
  }
}

/** The browser, the clone server or the network failed. Not a verdict. */
export class ResponsiveQaInfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponsiveQaInfrastructureError";
  }
}

// ---------------------------------------------------------------------------
// Measurement records — one per SIDE, produced in-page by `probe.ts`
// ---------------------------------------------------------------------------

/** One visible leaf box, the unit of cross-side correspondence. */
export interface LeafBox {
  /** Structural key; see `probe.ts` for the construction rules. */
  key: string;
  /** `text` | `image` — which key namespace produced it. */
  kind: "text" | "image";
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Visible characters this leaf carries (0 for images). */
  chars: number;
  /**
   * WP-C guard 3. For an IMAGE leaf backed by a real raster resource: did the
   * asset actually decode and paint (`complete && naturalWidth > 0`)?
   *
   * `undefined` means the question does not apply or cannot be answered from
   * script — an inline `<svg>`, a `<canvas>`, an `<iframe>` — and is NOT the
   * same as `false`. Optional on purpose: an artifact written before this field
   * existed still parses, and every consumer must treat "absent" as "unknown",
   * never as "failed".
   */
  loaded?: boolean;
  /**
   * WP-C guard 3. The OUTERMOST image element enclosing this one, as a tag
   * path — the "visual owner". A `<picture>` and the `<img>` inside it are two
   * leaves with the same box and different keys (different tags), and they are
   * one picture on screen; both carry the `<picture>`'s path here, which is how
   * the duplicate-layer test recognises them as one layer. A standalone image
   * owns itself, so its owner is its own path and it can never share an owner
   * with anything else.
   *
   * Set on image leaves only, and optional: an artifact written before this
   * field existed still parses, and "absent" means "unknown", never "shared".
   */
  ownerKey?: string;
}

/**
 * One candidate visual REGION on ONE side (Task 28.75).
 *
 * A region is a CONTAINER, selected by geometry and structure alone — never by
 * what it contains. That is the invariant that makes the channel work: the
 * clone's counterpart of a populated source region is, by definition, empty,
 * so a content-sensitive predicate would refuse to select exactly the boxes the
 * channel exists to find. Everything content-shaped in this record is a
 * MEASUREMENT of the selected box, not a condition of its selection.
 */
export interface RegionBox {
  /** Tag chain + sibling ordinals from `<body>`; same construction as a leaf's
   *  `p:` key, so the two share the suffix-matching rules. */
  path: string;
  /** Lowercased tag name, the first thing region pairing keys on. */
  tag: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /**
   * Elements inside this subtree that the box census calls visible. This is a
   * DOM fact and it is what separates the channel's two mechanisms: a clone
   * region with descendants and no paint inside its own box is DISPLACED; one
   * with no descendants is ABSENT.
   */
  visibleDescendants: number;
  /** Visible text characters this subtree paints, from the same census that
   *  produces `visibleTextChars`. Also a DOM fact, also displacement-blind. */
  textChars: number;
  /** Visible image-tag elements in this subtree. */
  imageElements: number;
}

/**
 * What the region census examined and what it refused, with the reason
 * (Task 28.75).
 *
 * `selected + rejected === examined` and `sum(rejectedByReason) === rejected`,
 * both asserted by the suite. A selector that silently drops candidates is a
 * selector nobody can argue with, and the whole point of this channel is that
 * its region choice is falsifiable from the artifact alone.
 */
export interface RegionAccounting {
  /** Every element the census looked at: `body.querySelectorAll("*")`. */
  examined: number;
  selected: number;
  rejected: number;
  /** One entry per reason that actually occurred, sorted by reason. */
  rejectedByReason: { reason: string; count: number }[];
  /** `MAX_REGIONS` was reached; later candidates are counted as `cap-reached`
   *  and the census is a prefix of the page in document order. */
  truncated: boolean;
}

/**
 * What an overlapping pair of leaf boxes actually is (WP-C guard 3).
 *
 * `true-overlap`        two different things landing on top of each other: the
 *                       layout collapse the rubric exists to catch.
 * `duplicate-image-stack`
 *                       the SAME image key occupying the SAME box twice — a
 *                       `<picture>` placeholder under its full-res source, a
 *                       crossfade holding two layers, a poster under a video.
 *                       One visual owner, one thing on screen, no collapse.
 * `failed-image-layer`  at least one side of the pair is an image whose asset
 *                       did not paint. The resource failure is the defect and
 *                       `image-layer-state` reports it; counting the same
 *                       square pixels again as a layout collapse is double
 *                       counting.
 */
export type OverlapPairKind =
  | "true-overlap"
  | "duplicate-image-stack"
  | "failed-image-layer";

export interface ColumnContainer {
  /** Tag-only path from `body`, e.g. `div/section/div`. Advisory, not a key. */
  path: string;
  display: string;
  /** Visible element children. */
  childCount: number;
  /** Distinct row clusters those children fall into. */
  rowCount: number;
  /** Modal children-per-row across the clusters: the container's column count. */
  modalPerRow: number;
  containerWidth: number;
}

export interface LogoRowGroup {
  path: string;
  itemCount: number;
  /** Gaps between consecutive items, left to right. Negative = overlap. */
  gaps: number[];
  minGap: number;
  medianGap: number;
  maxGap: number;
  anyOverlap: boolean;
  /** Rightmost right − leftmost left. */
  groupExtent: number;
  containerWidth: number;
  /** `groupExtent / containerWidth`. */
  extentRatio: number;
  /** Group centred in its container AND spanning < LOGO_ROW_PILE_EXTENT_RATIO. */
  piledTowardCentre: boolean;
}

export interface LandmarkMeasure {
  /** Visible landmark elements found (0 = the landmark is absent or hidden). */
  elementCount: number;
  visibleLinkCount: number;
  visibleTextChars: number;
  /**
   * Largest right edge of any visible box inside the landmark, EXCLUDING boxes
   * wider than `WIDE_ELEMENT_VIEWPORT_FACTOR` × the viewport. The exclusion
   * keeps a legitimately full-bleed wrapper from making `maxRight` say nothing;
   * it is a statistic, and the excluded boxes are counted below rather than
   * dropped.
   */
  maxRight: number;
  /**
   * The same quantity with NOTHING excluded. Item C3.3: the exclusion used to
   * point the wrong way — the worse the horizontal overflow, the more likely
   * the offending box was silently dropped — so the unfiltered number is now
   * reported next to the filtered one.
   */
  maxRightIncludingWide: number;
  /**
   * True when EVERY visible box inside the landmark, wide ones included, ends
   * inside the viewport. Computed WITHOUT the width exclusion on purpose: a box
   * wider than 1.5 viewports is the strongest possible evidence of a clipped
   * landmark and must never be the thing that hides one.
   */
  fullyInsideViewport: boolean;
  /** Boxes excluded from `maxRight` for being wider than the factor. Counted,
   *  never silently skipped. */
  wideElementsExcluded: number;
  /** Widest excluded box, in px (0 when none was excluded). */
  widestExcludedWidth: number;
}

export interface OverlapSample {
  aKey: string;
  bKey: string;
  area: number;
  /** WP-C guard 3. Absent on artifacts written before the split existed; read
   *  an absent value as `true-overlap`, which is what it meant then. */
  kind?: OverlapPairKind;
}

/**
 * One distinct normalized visible string, with how much of the page it is
 * (item C3.10).
 *
 * `key` is lowercased, whitespace-collapsed and truncated to
 * `TEXT_KEY_MAX_CHARS`; `chars` is the sum of the UNTRUNCATED lengths of every
 * text node that produced it. Keeping both is the whole point: the key is what
 * can be matched across two DOMs, the character count is what the page actually
 * painted, and a channel that divides one by the other is measuring nothing.
 */
export interface VisibleTextEntry {
  key: string;
  /** Text nodes that normalized to this key. */
  occurrences: number;
  /** Sum of those nodes' untruncated normalized lengths. */
  chars: number;
  /** At least one occurrence was longer than `TEXT_KEY_MAX_CHARS`, so `key` is
   *  a prefix of it and any containment test runs on that prefix. */
  truncated: boolean;
}

/** Everything one side reports at one width. Pure data; no verdicts. */
export interface SideMeasurement {
  // --- structural ---------------------------------------------------------
  totalNodes: number;
  visibleNodes: number;
  displayNoneNodes: number;
  /** Elements whose OWN computed `opacity` is exactly 0 (item G1). */
  zeroOpacityNodes: number;
  /**
   * Elements that are laid out (`display`, `visibility` and a non-zero rect all
   * fine) but paint nothing because `opacity: 0` sits on them or on an
   * ancestor. They are OUT of `visibleNodes`, `leaves`, the overlap sweep and
   * every gutter/landmark statistic — and counted here so that exclusion is a
   * number rather than a silent skip (item G1).
   */
  opacityHiddenNodes: number;
  /**
   * The subset of {@link opacityHiddenNodes} whose own opacity is NOT 0: they
   * are hidden purely by an ancestor. `opacity` does not inherit, so the old
   * self-only box test counted exactly this population as VISIBLE.
   */
  opacityHiddenByAncestorNodes: number;
  visibleTextChars: number;
  /**
   * The visible-text census, one entry per DISTINCT normalized key, each
   * carrying how many text nodes produced it and how many UNTRUNCATED
   * characters those nodes painted between them (item C3.10).
   *
   * The old field was a bare `string[]` of distinct truncated keys, and that
   * shape is what made `missingText` under-report by up to 40x: its numerator
   * summed unique truncated keys while its denominator, `visibleTextChars`,
   * counted every occurrence at full length. Numerator and denominator now come
   * out of the same census: `sum(entry.chars) === visibleTextChars` by
   * construction.
   *
   * STRIPPED before the artifact is written — see
   * {@link PersistedSideMeasurement}.
   */
  visibleTextEntries: VisibleTextEntry[];
  /** Open shadow roots the text census descended into (item C3.10). A CLOSED
   *  shadow root is not reachable from script at all and cannot be counted;
   *  see the `text-census-shadow-and-generated-content` limitation. */
  shadowRootsTraversed: number;
  /** Text nodes the census found INSIDE those shadow roots. */
  shadowTextNodes: number;
  /** Characters those shadow text nodes contributed to `visibleTextChars`. */
  shadowTextChars: number;
  /**
   * Text nodes the census STOPPED counting once it began asking the box
   * census's opacity question too (item G1): displayed and not
   * `visibility: hidden`, but under an `opacity: 0` subtree and therefore blank
   * to a reader.
   */
  opacityHiddenTextNodes: number;
  /**
   * Characters behind {@link opacityHiddenTextNodes}. This is exactly what the
   * pre-G1 census added to `visibleTextChars` on both sides — so a reader can
   * reconstruct the old number by adding it back, and a clone that bakes a
   * source's scroll-reveal pre-reveal state can no longer score 0.0000 on the
   * primary BLOCKER channel while painting whole blocks blank.
   */
  opacityHiddenTextChars: number;

  // --- geometry (the 28.5C continuity channel) -----------------------------
  scrollWidth: number;
  innerWidth: number;
  innerHeight: number;
  horizontalOverflow: number;
  scrollHeight: number;
  overflowingNodes: number;
  overflowingTextChars: number;
  offscreenNodes: number;
  offscreenTextChars: number;

  // --- correspondence ------------------------------------------------------
  /** STRIPPED before the artifact is written — thousands of boxes per side per
   *  width would dominate the JSON without adding anything a reader can use. */
  leaves: LeafBox[];
  leavesTruncated: boolean;
  textLeafCount: number;
  imageLeafCount: number;

  // --- regions (Task 28.75, the blank-region channel) ----------------------
  /** Candidate visual containers, in document order. STRIPPED before the
   *  artifact is written — 120 boxes per side per width would dominate the JSON
   *  and the accounting below is what a reader needs. */
  regions: RegionBox[];
  /** What the census examined, selected and refused, and why. PERSISTED. */
  regionAccounting: RegionAccounting;

  // --- overlap -------------------------------------------------------------
  /** TOTAL overlapping area over every overlapping leaf pair. Meaning unchanged
   *  since rubric 3: it still counts duplicate image layers. The rubric no
   *  longer reads it — see {@link trueOverlapArea} — and it is kept so a reader
   *  can compare a rubric-4 run against a rubric-3 one. */
  overlapArea: number;
  overlapAreaRatio: number;
  overlapPairCount: number;
  worstOverlaps: OverlapSample[];
  /** The O(n²) overlap sweep hit its per-leaf comparison cap on this page. */
  overlapComparisonsTruncated: boolean;

  // --- overlap, split three ways (WP-C guard 3) ----------------------------
  //
  // The three sub-totals partition the total exactly: area and pair count both
  // sum back to `overlapArea` / `overlapPairCount`. That is asserted by the
  // suite, because a split whose parts do not add up is a place for findings to
  // go missing.
  /** Overlap between two DIFFERENT things: what `overlap-excess-ratio` reads. */
  trueOverlapArea: number;
  trueOverlapAreaRatio: number;
  trueOverlapPairCount: number;
  /** The same image key occupying the same box twice. Demoted, never dropped. */
  duplicateImageStackArea: number;
  duplicateImageStackAreaRatio: number;
  duplicateImageStackPairCount: number;
  /** Overlap involving an image whose asset failed to paint. Demoted because
   *  `image-layer-state` already owns that defect. */
  failedImageLayerOverlapArea: number;
  failedImageLayerOverlapAreaRatio: number;
  failedImageLayerOverlapPairCount: number;
  /** Image leaves whose backing asset was determinably loaded / determinably
   *  broken. Leaves whose load state cannot be answered from script (inline
   *  SVG, canvas, iframe) are in NEITHER count; the two do not sum to
   *  `imageLeafCount` and are not meant to. */
  loadedImageLeafCount: number;
  failedImageLeafCount: number;

  // --- whitespace ----------------------------------------------------------
  contentMaxRight: number;
  /** `contentMaxRight` with the full-bleed exclusion NOT applied (item C3.3). */
  contentMaxRightIncludingWide: number;
  /** Leaf boxes excluded from `contentMaxRight` for being wider than
   *  `WIDE_ELEMENT_VIEWPORT_FACTOR` viewports. Counted, never silently skipped. */
  wideLeavesExcluded: number;
  /** Widest excluded leaf, in px (0 when none was excluded). */
  widestExcludedLeafWidth: number;
  contentMinLeft: number;
  rightGutter: number;
  rightGutterRatio: number;
  largestEmptyBand: number;
  largestEmptyBandRatio: number;
  largestEmptyBandTop: number;

  // --- landmarks -----------------------------------------------------------
  header: LandmarkMeasure;
  footer: LandmarkMeasure;

  // --- layout mode ---------------------------------------------------------
  columnContainers: ColumnContainer[];
  /** Largest `modalPerRow` over all qualifying containers. */
  maxColumns: number;

  // --- logo rows -----------------------------------------------------------
  logoRows: LogoRowGroup[];

  // --- media ---------------------------------------------------------------
  videoCount: number;
  videosPinned: number;
}

/**
 * What actually reaches the run artifact. `leaves` and `visibleTextEntries` are
 * the two unbounded fields; they are consumed by `correspondence.ts` and then
 * dropped, with their sizes kept so a reader can see what was measured over.
 */
export type PersistedSideMeasurement = Omit<
  SideMeasurement,
  "leaves" | "visibleTextEntries" | "regions"
> & {
  leafCount: number;
  /** Regions the census selected. The boxes themselves are dropped; the
   *  `regionAccounting` block that survives says how they were chosen and what
   *  was refused, which is the part a reader can argue with. */
  regionCount: number;
  /** Distinct normalized keys in the census. */
  visibleTextStringCount: number;
  /** Text nodes the census counted, over all keys. `visibleTextChars` is the
   *  sum of their untruncated lengths. */
  visibleTextOccurrences: number;
  /** Keys whose longest occurrence exceeded `TEXT_KEY_MAX_CHARS`, so the key is
   *  a prefix and the containment test ran on that prefix. Counted, never
   *  silent. */
  visibleTextTruncatedKeys: number;
};

// ---------------------------------------------------------------------------
// Cross-side derived metrics
// ---------------------------------------------------------------------------

export interface DeltaDistribution {
  /** Matched pairs the distribution was computed over. */
  samples: number;
  median: number;
  p90: number;
  max: number;
}

export interface CorrespondenceResult {
  sourceLeaves: number;
  cloneLeaves: number;
  matchedPairs: number;
  /**
   * `matchedPairs / sourceLeaves`. Kept so runs before and after item C3.4 stay
   * comparable, but it is NOT the number the trust gate reads: it counts every
   * unlabelled image leaf in its denominator, and an unlabelled leaf carries no
   * content key, so a page with many unlabelled icons depresses this number for
   * a reason that has nothing to do with reconstruction quality.
   */
  matchedFraction: number;
  /**
   * Source leaves that carry a CONTENT key — visible text (`t:`) or a labelled
   * image (`i:`). These are the leaves a reconstruction can be held to.
   */
  contentKeyedSourceLeaves: number;
  /** Source leaves with no content key: unlabelled images, SVGs and canvases
   *  (`p:`). Reported so the reader can see the size of the population the
   *  overall `matchedFraction` is diluted by. */
  unlabelledSourceLeaves: number;
  /**
   * Pairs produced by passes 1 and 2 ONLY — the content-keyed passes. This is
   * the numerator of {@link matchedFractionOfContentKeyed} (item C3.11).
   */
  contentKeyedMatchedPairs: number;
  /**
   * `contentKeyedMatchedPairs / contentKeyedSourceLeaves`. THIS is the number
   * `trustworthy` reads (item C3.4): how much of the page's content the
   * distribution is actually computed over.
   *
   * ITEM C3.11. It used to be `min(1, matchedPairs / contentKeyedSourceLeaves)`
   * — a cross-namespace ratio whose numerator included the pass-3 STRUCTURAL
   * pairs while its denominator counted content-keyed leaves only. That made
   * the trust gate readable UP by unlabelled-icon pairings that say nothing
   * about content coverage (on this harness's own evidence run it turned 166 of
   * 492 = 0.3374 into 0.3841 and flipped `trustworthy` from false to true past
   * a 0.35 gate), and it made the `min(1, …)` cap fire silently on 4 of 10
   * pairs. Both numerator and denominator are now content-keyed, so the ratio
   * cannot exceed 1 and no cap is needed.
   */
  matchedFractionOfContentKeyed: number;
  /** Unlabelled source leaves the structural pass 3 managed to pair. */
  unlabelledMatchedPairs: number;
  /**
   * Pairs produced by a key that occurred MORE THAN ONCE on a side, matched in
   * document order. They are real correspondences far more often than not, but
   * they are the part of the number a sceptic should discount first.
   */
  ambiguousPairs: number;
  trustworthy: boolean;
  /** Every matched pair, on-viewport and parked alike. Kept unchanged so a
   *  pre-G3 artifact stays comparable on this field. */
  leftDelta: DeltaDistribution;
  rightDelta: DeltaDistribution;
  /** Pairs whose SOURCE box begins inside the viewport. This is the population
   *  the rubric fires on (item G3). */
  onViewportLeftDelta: DeltaDistribution;
  onViewportRightDelta: DeltaDistribution;
  /** Pairs whose SOURCE box begins at or past the viewport's right edge —
   *  content the source itself parks off-screen, typically a carousel track's
   *  non-active slides. Measured and reported, never fired on. */
  offViewportLeftDelta: DeltaDistribution;
  offViewportRightDelta: DeltaDistribution;
  /** The viewport width the off-viewport test was taken against, so the split
   *  can be re-derived from the artifact. */
  sourceInnerWidth: number;
  onViewportMatchedPairs: number;
  /** Matched pairs excluded from the firing channel by the off-viewport test.
   *  COUNTED, never a silent skip. */
  offViewportMatchedPairs: number;
  /**
   * The single positional channel the rubric fires on (items C3.9, G3):
   * `max(onViewportLeftDelta.p90, onViewportRightDelta.p90)`. The two edges move
   * together on almost every real defect — a displaced block moves both — so
   * firing on each separately reported one defect twice.
   *
   * ITEM G3. It used to be taken over EVERY matched pair, which put two
   * populations in one number: a bounded frozen-px tail from boxes a reader can
   * see, and the source's own off-screen carousel-track geometry. Measured on
   * gs.severance.healthcare, the second population alone moved this channel to
   * 4,623-5,232 px on the homepage while the carousel-free route on the same
   * clone read 0-943 px with a median of 0.
   */
  positionDeltaP90: number;
  /** The pre-G3 reading — the same statistic over ALL matched pairs. Recorded,
   *  never fired on, so the two rubric versions remain comparable. */
  positionDeltaP90AllPairs: number;
  /** The same statistic over the parked-off-viewport population alone. */
  offViewportPositionDeltaP90: number;
  /** Matching passes, in the order they ran, with what each contributed. */
  passes: { namespace: string; pass: string; matched: number }[];
  /** The structural pass hit its comparison budget and stopped early. */
  structuralPassTruncated: boolean;
}

export interface MissingTextResult {
  /** Every visible character the source painted, occurrences counted, at full
   *  untruncated length. The denominator of every ratio below. */
  sourceVisibleChars: number;
  /** Text-node occurrences behind `sourceVisibleChars`. */
  sourceOccurrences: number;
  /** Distinct normalized keys behind `sourceVisibleChars`. */
  sourceStringCount: number;
  /**
   * Source characters that are NOT painted by the clone at a token boundary,
   * occurrences counted, at full untruncated length (item C3.10). The numerator
   * of `missingRatio`, and the same population as `sourceVisibleChars`.
   */
  missingChars: number;
  missingRatio: number;
  /** Occurrences behind `missingChars`. */
  missingOccurrences: number;
  /** Distinct keys behind `missingChars`. */
  missingStringCount: number;
  /**
   * The strictly LOOSER reading of the same test: characters whose key does not
   * appear in the clone even as a raw substring. `absentChars <= missingChars`
   * always, and the difference is {@link boundaryOnlyChars}.
   */
  absentChars: number;
  absentRatio: number;
  absentOccurrences: number;
  absentStringCount: number;
  /**
   * `missingChars − absentChars`: keys the clone DOES contain as a raw
   * substring but never at a token boundary — the `US` in `customers` class.
   * Counted separately because it is also where a source that splits a word
   * across text nodes (a per-digit odometer component, say) lands, and a reader
   * who wants the looser reading must be able to compute it.
   */
  boundaryOnlyChars: number;
  boundaryOnlyStringCount: number;
  /**
   * Characters PRESENT under the shipped script-aware boundary rule that the
   * pre-G2, English-only rule would have called missing: a source key found
   * inside a longer clone string at an edge in a script with no orthographic
   * word boundary (Han, Hangul, Kana, Thai, Lao, Khmer, Myanmar).
   *
   * This is the size of the correction, in the same units as every other number
   * here, so the two readings stay separable: `missingChars + scriptRelaxedChars`
   * is what the English-only rule would have reported. On a Latin-script source
   * it is 0 by construction, because no Latin edge is boundaryless.
   */
  scriptRelaxedChars: number;
  scriptRelaxedRatio: number;
  scriptRelaxedStringCount: number;
  /** Source keys longer than `TEXT_KEY_MAX_CHARS`, whose containment test
   *  therefore ran on a prefix. Counted, never silent. */
  truncatedSourceKeys: number;
  /** Longest missing strings first. */
  samples: string[];
}

/**
 * The displacement-tolerant split of the raw ΔE difference (item C3.1).
 *
 * Every count below is over the SAME overlap the raw channels use, and
 * `subpixelAboveJndPixels + residualAboveJndPixels === aboveJndPixels` by
 * construction — nothing is dropped, the population is partitioned.
 */
export interface PixelGateChannels {
  radiusPx: number;
  textEdgeLuminanceRange: number;
  overlapPixels: number;
  /** Pixels whose plain per-pixel ΔE*76 exceeds the JND threshold. Recomputed
   *  here and expected to equal the raw channel's count. */
  aboveJndPixels: number;
  /** Of those, the ones whose colour IS present within `radiusPx` in the other
   *  image, in both directions: rasterisation, antialiasing, subpixel offset. */
  subpixelAboveJndPixels: number;
  subpixelAboveJndRatio: number;
  /** Of those, the ones whose colour is NOT present within `radiusPx`. */
  residualAboveJndPixels: number;
  residualAboveJndRatio: number;
  /** The residual restricted to the clearly-visible ΔE*76 threshold. */
  residualAboveVisiblePixels: number;
  residualAboveVisibleRatio: number;
  /** Residual pixels sitting on a high-contrast edge of the SOURCE: glyphs,
   *  icons, borders — typography and shape differences. */
  residualOnEdgePixels: number;
  /** Residual pixels in a flat region of the SOURCE: fills, gaps, moved blocks. */
  residualOnFlatPixels: number;
  /** `residualOnEdgePixels / residualAboveJndPixels`, or 0 when there is no
   *  residual. Reported so "1.5 % of the page differs" can be read as
   *  "…and 89 % of it is on glyph edges". */
  residualEdgeFraction: number;
  /**
   * INK CALIBRATION (item C3.12). Every ratio above normalises by the TOTAL
   * overlap area, and a page is mostly background: on linear.app/pricing @1440
   * the ENTIRE page erased to its own background colour yields a residual of
   * only 0.0284 of the area, so a 1 % area threshold is 35 % of everything
   * drawn on the page, and a full-width 1440x400 band of erased content reads
   * 0.0032 and is silent.
   *
   * `sourceInkPixels` is the count of overlap pixels whose SOURCE colour
   * differs from the source's own modal (background) colour by more than the
   * JND threshold — i.e. everything the source actually drew.
   */
  sourceInkPixels: number;
  /** `sourceInkPixels / overlapPixels`: how much of the page is ink at all. */
  sourceInkRatio: number;
  /** `residualAboveJndPixels / sourceInkPixels`. The area-normalised
   *  `residualAboveJndRatio` is what the rubric fires on; THIS is what the same
   *  residual is as a fraction of what the page draws. */
  residualOverInkRatio: number;
  /** `subpixelAboveJndPixels / sourceInkPixels`. */
  subpixelOverInkRatio: number;
  /**
   * True when `residualAboveJndPixels > 0` but `residualAboveJndRatio` rounded
   * to zero. A rounded zero is not a measured zero (item C3.12) and this field
   * is the difference between the two.
   */
  residualRatioRoundedToZero: boolean;
  /**
   * TASK 28.75, item L3 — THE BAND THE DIFF NEVER LOOKED AT.
   * -----------------------------------------------------------------------
   * Every ratio above is computed over a TOP-LEFT-ANCHORED MIN-CROP:
   * `min(sourceWidth, cloneWidth) x min(sourceHeight, cloneHeight)`. When the
   * two captures are not the same size, the remainder of the larger image is
   * not compared at all — and on a horizontally overflowing page the remainder
   * is EXACTLY the offscreen band the frozen-width defect produces. Measured on
   * the real corpus: `linear.app / @700` pairs a 700px source with an 862px
   * clone; `gs.severance.healthcare /gs/index.do @1100` pairs a 1280px source
   * with an 1100px clone; `interiorbay.co.kr / @390` pairs a 1525px source with
   * a 390px clone and drops 77 % of the source's area.
   *
   * The crop is kept — a comparison needs a common canvas — but it is no longer
   * SILENT. The band is measured on both sides, in area and in INK, and graded
   * on its own in `pixel-uncompared-band-ink-ratio`.
   *
   * The two bands PARTITION the uncompared area exactly, per side:
   *   horizontal = x in [comparedWidth, imageWidth) x y in [0, imageHeight)
   *   vertical   = y in [comparedHeight, imageHeight) x x in [0, comparedWidth)
   */
  comparedWidth: number;
  comparedHeight: number;
  /** Actual capture sizes, restated here so the gate's own record is complete
   *  without a reader having to join it to `PixelChannels`. */
  sourceImageWidth: number;
  sourceImageHeight: number;
  cloneImageWidth: number;
  cloneImageHeight: number;
  /** `|sourceImageWidth - cloneImageWidth|` — the width of the strip that could
   *  not be compared at all. 0 when the two captures agree. */
  widthMismatchPx: number;
  /** `|sourceImageHeight - cloneImageHeight|`. */
  heightMismatchPx: number;
  /** Pixels in the horizontal (right-hand) uncompared strip, per side. */
  sourceHorizontalBandPixels: number;
  cloneHorizontalBandPixels: number;
  /** Pixels in the vertical (bottom) uncompared strip, per side. */
  sourceVerticalBandPixels: number;
  cloneVerticalBandPixels: number;
  /**
   * INK in each strip, measured the same way `sourceInkPixels` is: a pixel is
   * ink when its colour differs by more than the JND from its OWN side's modal
   * colour over the compared canvas. Ink is the quantity that matters — a
   * 162px strip of page background hides nothing, a 162px strip of content
   * hides a finding.
   */
  sourceHorizontalBandInkPixels: number;
  cloneHorizontalBandInkPixels: number;
  sourceVerticalBandInkPixels: number;
  cloneVerticalBandInkPixels: number;
  /**
   * `(sourceHorizontalBandInkPixels + cloneHorizontalBandInkPixels) /
   * overlapPixels` — the uncompared HORIZONTAL band's ink, expressed on the
   * same denominator every other ratio in this record uses, so it can be read
   * directly against `residualAboveJndRatio` and its band.
   */
  horizontalBandInkRatio: number;
  /** The same for the vertical band. Recorded and NOT graded: a height
   *  difference is already a first-class finding on `scroll-height-ratio-high`
   *  / `-low`, and its uncompared strip is the bottom of a longer page rather
   *  than a region any channel is investigating. */
  verticalBandInkRatio: number;
  /** `overlapPixels / max(sourceArea, cloneArea)` — the share of the larger
   *  capture that was compared at all. 1 when the captures agree. */
  comparedAreaRatio: number;
}

export interface PixelChannels {
  available: boolean;
  unavailableReason?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  cloneWidth?: number;
  cloneHeight?: number;
  overlapPixels?: number;
  /** @1 — any channel differs at all. */
  changedPixelRatio?: number;
  /** @16 — a channel differs by ≥ 16/255. */
  changedRatioAt16?: number;
  deltaE76Mean?: number;
  deltaE76Max?: number;
  deltaE76AboveJndRatio?: number;
  deltaE76AboveVisibleRatio?: number;
  commonAreaRatio?: number;
  /** The C3.1 split. Absent only when the pixel channels are unavailable. */
  gate?: PixelGateChannels;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type Severity = "BLOCKER" | "MAJOR" | "MINOR";
export type Verdict = Severity | "PASS";

/** One rubric channel's measured value, whether or not it fired. */
export interface ChannelReading {
  channel: string;
  /** The clone-side (or cross-side) number the rubric read. */
  value: number;
  /** The source's own value for the same quantity, when the channel is
   *  relative. `null` for cross-side quantities that have no source analogue. */
  sourceValue: number | null;
  /** The threshold that would have fired, and at what severity. */
  threshold: number | null;
  firedAt: Severity | null;
  /** Human-readable statement of what was measured. Never a verdict. */
  note: string;
  /**
   * WP-C. Why this channel could not raise severity on this pair, when it could
   * not. Present exactly when the channel was held ineligible — by its own
   * precondition (too few source links to grade navigation), or by a
   * pair-level gate (guard 1's missing clone route), or by a post-hoc guard
   * (guard 2's unstable source capture).
   *
   * Before this field the reason lived only in `Classification.caveats`, a flat
   * sorted list with no pointer back to the channel it qualified, so a reader
   * could see a large value with `firedAt: null` and no way to tell whether the
   * rubric had judged it or ducked it.
   */
  ineligibleReason?: string;
}

export interface Finding {
  severity: Severity;
  channel: string;
  summary: string;
  value: number;
  sourceValue: number | null;
  threshold: number;
}

/**
 * What a POST-HOC guard did to a classification the per-pair rubric had already
 * produced (WP-C guard 2).
 *
 * `classifyPair` is a pure function of one (route, width) instant and has no
 * way to know that the instant it was handed is not reproducible. That can only
 * be seen across widths, after the sweep. When it is seen, the classification
 * is rewritten — and a rewritten verdict that does not say so is a lie, so the
 * rewrite carries the original verdict, the findings it removed verbatim, and
 * the evidence that justified the removal.
 */
export interface ClassificationOverride {
  guard: "source-capture-unstable";
  /** True when findings were actually demoted. False in a self-check run, where
   *  instability is the thing being MEASURED and suppressing it would flatter
   *  the floor — the pair is labelled and left exactly as graded. */
  demoted: boolean;
  /** The verdict the rubric produced before this guard touched the pair. */
  originalVerdict: Verdict;
  /** What the evidence was, in numbers from this same run. */
  reason: string;
  /** Every finding removed from {@link Classification.findings}, kept whole.
   *  Nothing is deleted; it is moved here and counted. */
  demotedFindings: Finding[];
}

/** Findings WP-C's guards removed from a pair, so a falling count can be told
 *  apart from an improving clone. Summed into `summary.coverage`. */
export interface ClassificationDemotions {
  /** Overlapping leaf pairs re-attributed to `duplicate-image-stack`, both
   *  sides summed. */
  duplicateImageStackPairs: number;
  /** Overlapping leaf pairs re-attributed to `image-layer-state`, both sides
   *  summed. */
  failedImageLayerOverlapPairs: number;
  /** True when `overlap-excess-ratio` WOULD have fired on the undemoted total
   *  and does not fire on the true overlap. The single number that says this
   *  guard changed a verdict rather than only a note. */
  overlapFindingDemoted: boolean;
  /**
   * TASK 28.75, item L1. The demoted area net of the SOURCE's own demoted area,
   * as a fraction of the viewport — the value `overlap-demoted-excess-ratio`
   * grades. Optional: an artifact written before this field existed still
   * parses, and "absent" means "not measured", never "zero".
   */
  demotedOverlapExcessRatio?: number;
  /**
   * TASK 28.75, item L1. True when that demoted area was large enough, relative
   * to the source's own, to raise a finding of its own. `overlapFindingDemoted:
   * true` with this `true` means the finding MOVED CHANNEL rather than
   * disappeared; with this `false` it means the source corroborates the guard's
   * explanation.
   */
  demotedOverlapRegraded?: boolean;
}

export interface Classification {
  verdict: Verdict;
  findings: Finding[];
  /** EVERY channel, fired or not — rule (b) above. */
  channels: ChannelReading[];
  blockerCount: number;
  majorCount: number;
  minorCount: number;
  /** Caveats that limit how much the numbers can be trusted. */
  caveats: string[];
  /** WP-C guard 3's accounting for this pair. */
  demotions?: ClassificationDemotions;
  /** WP-C guard 2's rewrite, when one happened. Absent means the verdict above
   *  is the rubric's own, untouched. */
  override?: ClassificationOverride;
}

/**
 * What happened to one (route, width) pair, as one word (WP-C guard 4).
 *
 * A layout verdict and a measurement failure are different kinds of fact and
 * the harness has always kept them apart — `FAILED` predates this work package.
 * `UNSTABLE` is the third kind: the capture completed and the rubric ran, but
 * the source was not holding still, so the numbers describe an instant that
 * does not reproduce. None of the three is green and none of them is a PASS.
 */
export type PairOutcome = Verdict | "FAILED" | "UNSTABLE";

/**
 * The coverage bucket a pair falls in. Exactly one per pair, and the four
 * buckets partition the sweep — see {@link CoverageAccounting}.
 *
 * Priority when a pair qualifies for more than one: `measurement-failed` (there
 * is nothing to grade), then `clone-route-missing` (it rests on the two HTTP
 * statuses alone and no source content measurement, so source instability
 * cannot undermine it), then `source-capture-unstable`, then `graded`.
 */
export type CoverageBucket =
  | "graded"
  | "clone-route-missing"
  | "source-capture-unstable"
  | "measurement-failed";

/**
 * WHERE THE FINDINGS WENT (WP-C guard 4).
 *
 * Every guard in this work package can REMOVE a finding, and a measuring
 * instrument whose blocker count falls has told the reader nothing unless the
 * reader can also see how many pairs stopped being measured. `limitations` is
 * prose and cannot be summed. This block can: the four pair buckets partition
 * the sweep exactly, `conserved` states that they do, and the demotion counters
 * say how many findings the overlap split moved rather than found.
 */
export interface CoverageAccounting {
  /** Every (route, width) the sweep attempted. `routes.length × widths.length`. */
  pairsTotal: number;
  /** Fully graded: every channel eligible unless its own precondition said no. */
  pairsGraded: number;
  /** Graded as ONE `clone-route-missing` BLOCKER, every content channel held
   *  ineligible. These pairs DO carry a verdict and DO count in the verdict
   *  tallies — the missing route is a real clone defect, not a measurement
   *  hole. */
  pairsCloneRouteMissing: number;
  /** Source capture would not hold still. Excluded from the verdict tallies and
   *  from every floor comparison; never green, never PASS. */
  pairsSourceCaptureUnstable: number;
  /** The capture itself threw. No classification exists at all. */
  pairsMeasurementFailed: number;
  /** The four buckets, added up. */
  pairsAccountedFor: number;
  /** `pairsAccountedFor === pairsTotal`. THE assertion this block exists for:
   *  false means findings went somewhere nobody counted. */
  conserved: boolean;
  /** `pairsGraded + pairsCloneRouteMissing`. What
   *  `blockerPairs + majorPairs + minorPairs + passPairs` sums to. */
  pairsVerdicted: number;
  /**
   * Pairs the 3-point stability rule could not test: the lowest and the highest
   * width of every route have only one neighbour, and a route swept at fewer
   * than three widths has none. Counted rather than assumed stable — see the
   * `source-stability-untested-at-edge-widths` limitation.
   */
  pairsStabilityUntested: number;
  /** Overlapping leaf pairs re-attributed to `duplicate-image-stack` over the
   *  whole run, both sides of every pair summed. */
  duplicateImageStackPairsDemoted: number;
  /** Overlapping leaf pairs re-attributed to `image-layer-state`. */
  failedImageLayerOverlapPairsDemoted: number;
  /** Pairs on which `overlap-excess-ratio` would have fired before guard 3 and
   *  does not after it. Findings removed, stated as a number. */
  overlapFindingsDemoted: number;
  /**
   * TASK 28.75, item L1. Pairs on which the area guard 3 demoted was large
   * enough, NET OF THE SOURCE'S OWN, to raise `overlap-demoted-excess-ratio`.
   * Read beside `overlapFindingsDemoted`: a finding that moved channel is not a
   * finding that vanished.
   */
  overlapDemotionsRegraded: number;
  /** Findings guard 2 moved out of `findings[]` into
   *  `classification.override.demotedFindings`, over the whole run. */
  unstableFindingsDemoted: number;
}

// ---------------------------------------------------------------------------
// Run artifact
// ---------------------------------------------------------------------------

export interface CapturePolicy {
  /** Always true here, and always recorded: the Observer's own snapshots are
   *  NOT pinned, so the two must never be silently mixed. */
  pinned: true;
  animationsDisabled: boolean;
  videosPaused: boolean;
  reducedMotion: string;
  colorScheme: string;
  locale: string;
  timezone: string;
  deviceScaleFactor: number;
  viewportHeight: number;
  waits: string;
  /**
   * TASK 28.75, item B7. Whether both sides ran the observer's page-state
   * normalization. Recorded whether on or off, for the same reason
   * `scrollBeforeProbe` is: an artifact must never be readable without knowing
   * which page STATE its numbers describe.
   */
  pageStateNormalized: boolean;
  pageStateNote: string;
  /** Item C3.2. The policy is recorded whether it is on or off, so an artifact
   *  can never be read without knowing whether lazy content was in scope. */
  scrollBeforeProbe: boolean;
  scrollStepPx: number;
  scrollMaxSteps: number;
  scrollStepWaitMs: number;
  scrollBottomSettleMs: number;
  scrollTopSettleMs: number;
  scrollNote: string;
}

/** What one side's scroll-to-settle pass actually did (item C3.2). */
export interface ScrollReport {
  applied: boolean;
  /** Steps taken, each `SCROLL_STEP_PX` apart. */
  steps: number;
  /** Deepest `scrollY` reached, in CSS px. */
  scrolledToPx: number;
  /**
   * The document bottom was reached BY SCROLLING, before the step cap.
   *
   * ITEM C3.13. This used to be asserted from `scrollY + innerHeight >=
   * scrollHeight − 1`, which is trivially true on the very first step of a
   * document shorter than the viewport — so a page that never rendered
   * (scrollHeight 900, 65 visible characters, `scrolledToPx` 0) recorded
   * `reachedBottom: true` and was indistinguishable from a completed scroll.
   * It is now asserted only when the document was scrollable at all; when it
   * was not, {@link documentScrollable} is false and this is false, and the two
   * fields together say which case it was.
   */
  reachedBottom: boolean;
  /** `scrollHeightBefore > viewportHeight + 1`: there WAS something to scroll.
   *  False here with `reachedBottom` false means "nothing to scroll", never
   *  "stopped early". */
  documentScrollable: boolean;
  /** The viewport height the scroll ran against, so the floor above can be
   *  re-derived from the artifact. */
  viewportHeight: number;
  /** The step cap was hit BEFORE the bottom on a document that WAS scrollable.
   *  A capped scroll is a partially measured page and says so; it is never
   *  silent. */
  stepsCapped: boolean;
  /** Total time deliberately spent waiting during the pass, in ms. */
  waitedMs: number;
  scrollHeightBefore: number;
  scrollHeightAfter: number;
  visibleElementsBefore: number;
  visibleElementsAfter: number;
  /** `visibleElementsAfter − visibleElementsBefore`. Negative is possible and
   *  is left signed: a scroll-away animation removes elements too. */
  elementsRevealed: number;
  visibleTextCharsBefore: number;
  visibleTextCharsAfter: number;
  textCharsRevealed: number;
  imagesLoadedBefore: number;
  imagesLoadedAfter: number;
  imagesRevealed: number;
}

/**
 * What page-state normalization did to ONE side of ONE pair (Task 28.75,
 * item B7).
 *
 * WHY THIS IS IN THE ARTIFACT AND NOT ONLY IN A LOG. Before 28.75 the QA source
 * capture did not normalize at all while the OBSERVER did, so the two rendered
 * the same URL into two different page states. On `seoultone.kr / @390` the
 * source screenshot shows the site's entry popup and the clone correctly shows
 * the hero underneath it, and the clone was charged `missing-text-ratio` for
 * content the engine had deliberately removed. The diagnostic lane took that
 * apart: of the 393 characters (30.54 %) the clone was missing at 390, the
 * popup accounts for 37 characters over 4 strings and real content loss for 356
 * (27.66 %) — and at 1440, where the popup stands on BOTH sides, missing is 356
 * characters, the same number.
 *
 * A reader must be able to make that attribution from the artifact alone, which
 * means the artifact has to say, per side: did normalization run, was the
 * initial-paint census available, what did it dismiss, and is anything still
 * standing. `qualifiedNotDismissed > 0` on the SOURCE is the condition under
 * which the text channels are held NOT COMPARABLE rather than charged.
 *
 * `normalizePageState` never throws and never removes a node; see
 * `docs/result/28.75/page-state-api-contract.md`.
 */
export interface PageStateRecord {
  /** The phase executed. `false` only when a caller opted out. */
  ran: boolean;
  /**
   * CALL 1 of the two-call contract was made after `load` and completed.
   * When false, `appeared-after-initial-paint` — the only time-based
   * discriminator the normalizer has — could not contribute, and a popup whose
   * ONLY strong evidence was "it was not there at first paint" is not dismissed.
   */
  initialPaintCensusAvailable: boolean;
  /** `available` | `absent` | `partial` | `unreadable`. */
  initialPaintCensusStatus: string;
  /** Elements the initial-paint census reached (0 when it did not run). */
  initialPaintCensusElements: number;
  /** True when the census stopped at its element cap and is therefore PARTIAL. */
  initialPaintCensusCapHit: boolean;
  /** Shape matches that cleared the evidence bar. */
  qualified: number;
  /** Overlays actually dismissed. */
  dismissed: number;
  /**
   * Overlays that QUALIFIED and are still standing when the phase finished —
   * the number that decides comparability. Non-zero on the SOURCE means the
   * capture kept an entry overlay the clone has no reason to carry.
   */
  qualifiedNotDismissed: number;
  /** The 2-dismissal cap stopped further work while something still qualified. */
  attemptCapHit: boolean;
  /** One line per attempt: what was clicked, and what happened. */
  attempts: {
    domPath: string;
    shapeClass: string;
    method: string;
    outcome: string;
    signals: string[];
    closeControlLabel?: string;
  }[];
  /** Plain-language reasons the phase records about itself. */
  limitations: string[];
}

export interface SideProvenance {
  url: string;
  finalUrl: string;
  capturedAt: string;
  networkIdleReached: boolean;
  fontsReadyReached: boolean;
  screenshotFile: string;
  screenshotBytes: number;
  httpStatus: number | null;
  consoleErrors: number;
  pageErrors: number;
  scroll: ScrollReport;
  /**
   * TASK 28.75, item B7. Optional so an artifact written before the QA capture
   * normalized still parses; "absent" means "this capture predates the shared
   * page-state contract", never "nothing was found".
   */
  pageState?: PageStateRecord;
}

export interface PairResult {
  index: number;
  route: string;
  width: number;
  ok: boolean;
  error?: string;
  source?: PersistedSideMeasurement;
  clone?: PersistedSideMeasurement;
  sourceProvenance?: SideProvenance;
  cloneProvenance?: SideProvenance;
  correspondence?: CorrespondenceResult;
  columns?: ColumnComparisonRecord;
  missingText?: MissingTextResult;
  /**
   * The SAME containment test run the other way round: clone visible text that
   * appears nowhere in the source. Recorded, never fired on — it is not a
   * defect for a reconstruction to render a string the source does not have at
   * that instant. Its purpose is to make the missing-text channel's floor
   * measurable: the forward direction alone is asymmetric, so a self-check can
   * read 0.00 % purely because the second capture happened to be a superset of
   * the first.
   */
  missingTextReverse?: MissingTextResult;
  pixels?: PixelChannels;
  classification?: Classification;
  compositeFile?: string;
  diffFile?: string;
  /**
   * WP-C guard 4. Which of the four coverage buckets this pair was counted in.
   * Always set by a rubric-4 run; absent on older artifacts, where every `ok`
   * pair was implicitly `graded`.
   */
  coverageBucket?: CoverageBucket;
  /**
   * WP-C guard 4. The one-word outcome this pair contributes to
   * `summary.verdictByRouteWidth`. `FAILED` and `UNSTABLE` are measurement
   * facts, not layout verdicts.
   */
  outcome?: PairOutcome;
  /**
   * WP-C guard 2. The source node population at each width of THIS pair's
   * route, in ascending width order, with this pair's own reading marked. The
   * evidence for `outcome === "UNSTABLE"`, carried on the pair it condemns so
   * the judgement can be checked without re-deriving it.
   */
  sourceStability?: SourceStabilityReading;
}

/** WP-C guard 2. One width's place in its route's source-population profile. */
export interface SourceStabilityReading {
  /** `source.totalNodes` at this width. */
  population: number;
  /** The neighbouring widths' populations, `null` at an edge width. */
  previousPopulation: number | null;
  nextPopulation: number | null;
  /** `false` at the lowest and highest width of a route, and on any route swept
   *  at fewer than three widths: the 3-point rule needs two neighbours. */
  testable: boolean;
  unstable: boolean;
  /** |population − neighbour| / neighbour, both sides. `null` at an edge. */
  deviationFromPrevious: number | null;
  deviationFromNext: number | null;
  /** |next − previous| / previous: how far the population REVERTED. Small means
   *  the two neighbours agree with each other and this width is the outlier. */
  neighbourDisagreement: number | null;
}

/**
 * A limitation of THIS artifact, stated in a field a script can read.
 *
 * The 28.6 verifier's finding was not that the harness had limitations — every
 * instrument does — but that they lived in prose a reader had to be told about.
 * Each entry names itself, states the limitation plainly, and cites the numbers
 * in this same artifact that establish it.
 */
export interface ArtifactLimitation {
  id: string;
  statement: string;
  evidence: string;
}

/**
 * `clone`      — the clone is measured against the live source. The normal run.
 * `self-check` — the live source is measured against a SECOND capture of
 *                ITSELF. Nothing is being graded; this run measures the
 *                INSTRUMENT plus the source's own instability, and its verdicts
 *                are the floor below which no clone verdict can be trusted.
 */
export type ResponsiveQaMode = "clone" | "self-check";

/**
 * THE GRADING FLOOR, carried by the run it grades (item G4).
 *
 * A clone verdict means nothing without the number below which no verdict on
 * this source can go. That floor is not a constant: measured on the four Task
 * 28.6 pilots against a second capture of each source itself, it was 7 PASS /
 * 3 MINOR / 0 BLOCKER on hobbang.net, 9 PASS / 1 MAJOR on
 * gs.severance.healthcare and 4 PASS / 6 MINOR / 0 BLOCKER on seoultone.kr —
 * three different floors on three sites, from one instrument.
 *
 * Before this field the floor lived in a SEPARATE run that a reader had to know
 * to go and look for, and nothing in the graded artifact said so. Now the
 * verdict table cannot be read without it: every row of
 * `summary.verdictByRouteWidth` carries its own `floorVerdict`, and when there
 * is no floor at all this object says so in `status` and in a limitation whose
 * id a script can match on.
 */
export interface SelfCheckFloor {
  /**
   * `measured`        — a self-check sweep ran in THIS invocation
   *                     (`--with-self-check`) and is referenced below.
   * `referenced`      — an existing self-check artifact was named
   *                     (`--self-check-run`) and read.
   * `is-the-floor`    — this run IS a self-check; it has no floor above itself.
   * `absent`          — NO floor. Every verdict in this artifact is
   *                     unadjudicated: it cannot be told apart from the
   *                     instrument's own noise plus the live source's movement.
   */
  status: "measured" | "referenced" | "is-the-floor" | "absent";
  /** One sentence stating what the reader may and may not conclude. */
  statement: string;
  runId: string | null;
  runDir: string | null;
  artifactFile: string | null;
  rubricVersion: number | null;
  channelRoster: string[] | null;
  /**
   * The floor was produced by the SAME rubric, roster, widths, routes and site.
   * `false` means the two artifacts are not comparable and the floor below is
   * indicative only. `null` when there is no floor.
   */
  comparable: boolean | null;
  /** Every reason `comparable` is false, named. Empty when it is true. */
  incomparableReasons: string[];
  summary: {
    pairsMeasured: number;
    pairsFailed: number;
    blockerPairs: number;
    majorPairs: number;
    minorPairs: number;
    passPairs: number;
  } | null;
  verdictByRouteWidth: { route: string; width: number; verdict: PairOutcome }[] | null;
}

export interface ResponsiveQaRunArtifact {
  /**
   * 3 since items G1/G2/G3/G4. A version-2 artifact carries the pre-G1 text
   * census (which counted `opacity: 0` text as painted on both sides), the
   * English-only token-boundary rule, a `position-delta-p90-px` taken over
   * on- and off-viewport boxes together, and no self-check floor field. A
   * version-1 artifact additionally carries the pre-repair `missingText`
   * arithmetic, the cross-namespace trust fraction and the un-floored
   * `reachedBottom`. Numbers are NOT comparable across these versions.
   */
  schemaVersion: 3;
  /**
   * The RUBRIC the pairs in this artifact were graded by (item C3.13).
   *
   * `schemaVersion` says what shape the JSON has; it says nothing about which
   * channels ran. Across Task 28.6's own wave the channel roster grew 28 -> 36
   * -> 37 -> 38 while `schemaVersion` stayed 1, so four runs whose PASS counts
   * were added together had in fact been graded by four different rubrics. This
   * field plus {@link channelRoster} makes that legible: two runs are only
   * comparable when both match.
   */
  rubricVersion: number;
  /** Every channel name the rubric actually emitted on this run, sorted and
   *  de-duplicated. `channelRoster.length` is the roster size. */
  channelRoster: string[];
  runId: string;
  mode: ResponsiveQaMode;
  site: string;
  sourceOrigin: string;
  appDir: string;
  manifestFile: string | null;
  routeSource: string;
  widths: number[];
  routes: string[];
  capturePolicy: CapturePolicy;
  cloneBaseUrl: string;
  cloneBuildMs: number;
  startedAt: string;
  finishedAt: string;
  pairs: PairResult[];
  summary: {
    pairsMeasured: number;
    pairsFailed: number;
    blockerPairs: number;
    majorPairs: number;
    minorPairs: number;
    passPairs: number;
    /**
     * WP-C guard 4. Where every pair went, as numbers a script can add up.
     * The four buckets partition `pairsTotal`; the verdict counts above sum to
     * `coverage.pairsVerdicted`, NOT to `pairsMeasured`, because an
     * `UNSTABLE` pair is measured and not verdicted.
     */
    coverage: CoverageAccounting;
    /** `FAILED` means the capture did not complete and `UNSTABLE` means the
     *  source would not hold still — NEITHER is a layout verdict. */
    verdictByRouteWidth: {
      route: string;
      width: number;
      verdict: PairOutcome;
      /**
       * The SAME pair's verdict in this run's self-check floor (item G4).
       * `null` means no floor was supplied and the verdict beside it is
       * unadjudicated; see {@link ResponsiveQaRunArtifact.selfCheckFloor}.
       */
      floorVerdict: PairOutcome | null;
    }[];
  };
  images: ImageManifestEntry[];
  contactSheet: string | null;
  notes: string[];
  /**
   * The floor this run's verdicts must be read against (item G4). Never
   * optional: when no floor exists, `status` is `absent` and says so.
   */
  selfCheckFloor: SelfCheckFloor;
  /** Machine-readable limitations of this run. See {@link ArtifactLimitation}. */
  limitations: ArtifactLimitation[];
}

/**
 * Structural type mirror of `correspondence.ts`'s `ColumnComparison`, declared
 * here so the run artifact's shape lives with every other persisted type.
 */
export interface ColumnComparisonRecord {
  sourceMaxColumns: number;
  cloneMaxColumns: number;
  maxColumnsDelta: number;
  sourceContainers: number;
  cloneContainers: number;
  matchedContainers: number;
  worstModeDelta: number;
  mismatches: {
    path: string;
    sourceModalPerRow: number;
    cloneModalPerRow: number;
    sourceRowCount: number;
    cloneRowCount: number;
    sourceChildCount: number;
    cloneChildCount: number;
    sourceContainerWidth: number;
    cloneContainerWidth: number;
    delta: number;
  }[];
}

export interface ImageManifestEntry {
  file: string;
  kind: "composite" | "source" | "final" | "diff" | "contact-sheet";
  route: string | null;
  width: number | null;
  verdict: Verdict | null;
  blockerCount: number;
  majorCount: number;
}
