import {
  DELTA_E76_JND_THRESHOLD,
  srgbToLab,
  type DecodedImage,
} from "../reconstruction-qa/screenshot-diff.js";
import {
  BLANK_REGION_BLOCKER_RATIO,
  MIN_REGION_SUFFIX_SEGMENTS,
  REGION_BLANK_MIN_VIEWPORT_AREA_RATIO,
  REGION_BOX_DEDUPE_PX,
  REGION_CLONE_BLANK_LEAF_RETAINED_RATIO,
  REGION_CLONE_BLANK_MIN_LEAF_ALLOWANCE,
  REGION_CLONE_BLANK_INK_RATIO,
  REGION_CLONE_BLANK_INK_RETAINED_RATIO,
  REGION_CLONE_BLANK_PAINT_RATIO,
  REGION_CLONE_BLANK_RETAINED_RATIO,
  REGION_FALLBACK_HEIGHT_TOLERANCE,
  REGION_MAP_SCALE_TOLERANCE,
  REGION_ALIGNMENT_MIN_PAIRS,
  REGION_ALIGNMENT_TOLERANCE_PX,
  REGION_BACKDROP_AREA_FACTOR,
  REGION_INK_HISTOGRAM_BITS,
  REGION_INK_DOM_COVERAGE_MIN,
  REGION_INK_IMAGE_SCALE_TOLERANCE,
  REGION_INK_MIN_SAMPLES,
  REGION_INK_ONLY_CORROBORATION_PAINT_RATIO,
  REGION_MEANINGFUL_SOURCE_LEAVES,
  REGION_INK_SAMPLE_BUDGET,
  REGION_PAINT_GRID,
  REGION_SOURCE_INK_RATIO,
  REGION_SOURCE_MIN_CHARS,
  REGION_SOURCE_MIN_DESCENDANTS,
  REGION_SOURCE_MIN_LEAVES,
  REGION_SOURCE_PAINT_RATIO,
  type LeafBox,
  type RegionBox,
  type SideMeasurement,
} from "./types.js";

/**
 * THE BLANK-REGION DETECTOR (Task 28.75).
 *
 * THE QUESTION IT ASKS, WHICH NO OTHER CHANNEL ASKS. Every channel in the
 * rubric before this one is a PAGE TOTAL — characters painted, images present,
 * boxes overlapping, pixels differing. A total cannot see a hole. On
 * `gs.severance.healthcare /gs/index.do @1440` the clone's hero photograph is a
 * white rectangle, its NEWS row carries none of the source's four cards and its
 * promotional carousel carries none of its four, and the rubric reported
 * `image-presence-ratio 1.0`, `missing-text-ratio 0.0`, `visible-text-ratio
 * 1.0`. Every total balanced because the content is all still SOMEWHERE on the
 * clone — `left-edge-delta-median-px 1542` — just not where a reader looks for
 * it. This module asks the one question that finds that: for each meaningful
 * container the source fills, does the clone's counterpart paint anything?
 *
 * PURE. It takes two `SideMeasurement`s and returns numbers. No DOM, no
 * browser, no screenshot — which is why every rule below is testable from a
 * literal in the suite, and why the discriminating twin (the same geometry with
 * an EMPTY source region, which must be refused) can be written at all.
 *
 * IT NEVER RESTS ON ONE HEURISTIC. Seven independent measurements decide a
 * single finding, and each one can veto it:
 *
 *   source side   1  paint occupancy of the region's own box  (geometry)
 *                 2  painted leaves whose centre is in it     (count)
 *                 3  characters, or at least one image leaf   (content)
 *                 4  DOM-visible element descendants          (structure)
 *   clone side    5  absolute paint occupancy of its box      (geometry)
 *                 6  occupancy RETAINED against the source's  (relative)
 *                 7  leaves retained against the source's     (count)
 *
 * plus an eighth, `corroborated`: when the two pages are the same height, the
 * SOURCE's rectangle is re-measured on the clone and must agree that it is
 * empty. That is what stops a mis-paired region — the one real failure mode of
 * structural correspondence — from inventing a hole.
 *
 * TWO MECHANISMS, NAMED. `displaced` — the clone container still holds a
 * visible DOM subtree and that subtree paints somewhere else (severance).
 * `absent` — there is no subtree to paint (`seoultone.kr`'s doctor-credential
 * block, which `missing-text-ratio` DOES see, at 0.278). They are the same
 * defect to a reader and different repairs to an engineer, so the finding says
 * which one it measured.
 */

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What one side paints inside one rectangle. */
export interface RegionPaint {
  /** Fraction of the rectangle's `REGION_PAINT_GRID`² cells a leaf box touches.
   *  Quantised, and quantised UPWARD — see `REGION_PAINT_GRID`. */
  paintRatio: number;
  /** Leaves whose CENTRE lies in the rectangle. Unquantised. A leaf that merely
   *  clips the edge contributes to `paintRatio` and not to these counts: a
   *  full-bleed background overlapping a section is paint in it, not content of
   *  it. */
  leafCount: number;
  textLeaves: number;
  imageLeaves: number;
  chars: number;
}

/** One region the source fills and the clone does not. */
export interface BlankRegion {
  /** The SOURCE region's structural path. */
  path: string;
  tag: string;
  box: Box;
  areaPx: number;
  /** `areaPx` over ONE viewport's area. */
  viewportAreaRatio: number;
  /** Does the region begin within the first viewport? Reported, not banded. */
  aboveFold: boolean;
  /** How the clone counterpart was found, in the order the detector tries:
   *  `path-suffix`     a clone region paired by shared tag-path suffix.
   *  `ancestor-mapped` no counterpart element, so the source box is mapped
   *                    through the nearest PAIRED ancestor region — the only
   *                    reading that survives a whole-page vertical offset.
   *  `source-rect`     no paired ancestor either; the raw source rectangle,
   *                    allowed only when the two pages are the same height. */
  correspondence: "path-suffix" | "ancestor-mapped" | "source-rect";
  /** The clone region's path, when one was paired. */
  clonePath: string | null;
  /** Which of the two failures this is. */
  mechanism: "displaced" | "absent";
  /** Was a `path-suffix` finding confirmed by a SECOND, independent reading —
   *  the source box mapped into clone coordinates — agreeing that the clone
   *  paints nothing there? False when no such reading was available; the
   *  finding then rests on the paired box alone and says so. */
  corroborated: boolean;
  source: RegionPaint;
  clone: RegionPaint;
  /** Region-level INK, the second evidence leg: the fraction of sampled pixels
   *  that differ from the region's own modal colour. Unavailable when no
   *  screenshot was supplied or the box lies outside it. */
  sourceInk: RegionInk;
  cloneInk: RegionInk;
  /** Which leg (or legs) reported this region. `ink` alone is the only way the
   *  severance hero — perfect DOM, white-on-white pixels — can be seen. */
  evidence: "dom" | "ink" | "dom+ink";
  /** Visible DOM element descendants of the paired clone region (0 when none
   *  was paired). The `displaced` / `absent` discriminator. */
  cloneVisibleDescendants: number;
  /** Visible characters in that subtree, wherever on the page they land. */
  cloneSubtreeTextChars: number;
  /**
   * TASK 28.8 FAST item 1. Is there evidence that MEANINGFUL SOURCE CONTENT is
   * actually absent or unpainted here, over and above the rectangle reading
   * emptier than the source's?
   *
   * A region is reported either way. This flag is what decides whether it may
   * carry `blank-region-ratio` to BLOCKER — see
   * {@link regionCorroboratesContentAbsence} and `blankRegionSeverityCap`.
   */
  contentAbsenceCorroborated: boolean;
}

export interface BlankRegionResult {
  /** Regions the source census selected. */
  sourceRegions: number;
  cloneRegions: number;
  /** Source regions that cleared all four source-populated tests. */
  populatedSourceRegions: number;
  /** Their unioned area over one viewport — the denominator a reader needs to
   *  read `ratio` against. */
  populatedViewportRatio: number;
  /** Source regions paired to a clone region by tag-path suffix. */
  pairedRegions: number;
  /** Populated source regions that paired with nothing and were measured by a
   *  mapped rectangle instead. */
  fallbackRegions: number;
  /** Populated source regions no mechanism could place on the clone at all:
   *  no pair, no usable paired ancestor and two pages of different heights.
   *  They are counted, never guessed at, and they make the ratio a LOWER
   *  bound — which is why the classifier raises a caveat when this is > 0. */
  unjudgedRegions: number;
  /** The blanked regions, maximal (a blanked region wholly inside another is
   *  dropped so the union cannot double-count it), largest first. */
  regions: BlankRegion[];
  /** Exact union area of `regions`, px². */
  blankedAreaPx: number;
  /** `blankedAreaPx` over ONE viewport's area. The channel's value. Can exceed
   *  1: a long page can hold more than a screen of holes. */
  ratio: number;
  /** The largest single blanked region, over one viewport's area. */
  largestViewportRatio: number;
  displacedCount: number;
  absentCount: number;
  /** Blanked regions whose emptiness is corroborated as MISSING CONTENT rather
   *  than as whitespace or a colour change (Task 28.8 FAST item 1). */
  corroboratedCount: number;
  /** Union area of those regions, px². Always ≤ `blankedAreaPx`. */
  corroboratedAreaPx: number;
  /** `corroboratedAreaPx` over ONE viewport's area — the quantity that is
   *  allowed to set the channel's severity band. */
  corroboratedRatio: number;
  /** Blanked regions the INK leg reported and the DOM leg did not, and the
   *  reverse. A channel whose two legs never disagree is one leg. */
  inkOnlyCount: number;
  domOnlyCount: number;
  /** Were screenshots supplied AND trusted? When false the ink leg is absent
   *  from every reading on this pair and the channel is DOM-only — which is
   *  exactly the configuration that reported the severance hero as healthy. */
  inkAvailable: boolean;
  /** Why the ink leg was withheld, when it was: no screenshot, a screenshot
   *  that is not this page's size, or a DOM census that does not describe the
   *  layout the screenshot shows. `null` when ink ran. */
  inkWithheldReason: string | null;
  /** Each side's deepest painted leaf, clamped to its own page height, over
   *  that page height. The ink leg's precondition — see
   *  {@link REGION_INK_DOM_COVERAGE_MIN}. */
  sourceDomPixelCoverage: number;
  cloneDomPixelCoverage: number;
  /** Either side's leaf census hit `MAX_LEAF_BOXES`, so paint is a lower bound
   *  on that side and a late region can look emptier than it is. */
  leavesTruncated: boolean;
  /** Either side's region census hit `MAX_REGIONS`. A census truncated in
   *  DOCUMENT ORDER loses counterparts at the bottom of the page, which is the
   *  false-positive direction, so the classifier refuses to fire on it. */
  regionsTruncated: boolean;
  /** Median top / left offset of the paired regions, px. A constant whole-page
   *  offset shows up here and nowhere else. */
  medianTopOffset: number;
  medianLeftOffset: number;
  /** Did those medians (and the page heights) agree closely enough for a raw
   *  source rectangle to be read on the clone at all? */
  alignedGeometry: boolean;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function areaOf(box: Box): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * What `leaves` paint inside `box`.
 *
 * Coverage is a `REGION_PAINT_GRID`² grid laid over the box, so the cost is
 * O(leaves) with a small constant instead of the O(leaves²) an exact rectangle
 * union would cost on a region holding thousands of boxes. The quantisation
 * rounds coverage UP, which can only suppress a blank-region finding.
 */
export function paintInsideBox(
  leaves: readonly LeafBox[],
  box: Box,
  grid: number = REGION_PAINT_GRID,
  backdropFactor: number = REGION_BACKDROP_AREA_FACTOR,
): RegionPaint {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0 || grid <= 0) {
    return { paintRatio: 0, leafCount: 0, textLeaves: 0, imageLeaves: 0, chars: 0 };
  }
  const backdropArea = width * height * backdropFactor;
  const cells = new Uint8Array(grid * grid);
  let covered = 0;
  let leafCount = 0;
  let textLeaves = 0;
  let imageLeaves = 0;
  let chars = 0;
  for (const leaf of leaves) {
    // A leaf far bigger than the region is a backdrop, not its content. Applied
    // identically to both sides — see `REGION_BACKDROP_AREA_FACTOR`.
    if (
      (leaf.right - leaf.left) * (leaf.bottom - leaf.top) > backdropArea &&
      backdropFactor > 0
    ) {
      continue;
    }
    const left = Math.max(leaf.left, box.left);
    const right = Math.min(leaf.right, box.right);
    const top = Math.max(leaf.top, box.top);
    const bottom = Math.min(leaf.bottom, box.bottom);
    if (right <= left || bottom <= top) continue;
    const centreX = (leaf.left + leaf.right) / 2;
    const centreY = (leaf.top + leaf.bottom) / 2;
    if (
      centreX >= box.left &&
      centreX <= box.right &&
      centreY >= box.top &&
      centreY <= box.bottom
    ) {
      leafCount++;
      if (leaf.kind === "text") {
        textLeaves++;
        chars += leaf.chars;
      } else {
        imageLeaves++;
      }
    }
    const c0 = clamp(Math.floor(((left - box.left) / width) * grid), 0, grid - 1);
    const c1 = clamp(Math.ceil(((right - box.left) / width) * grid) - 1, 0, grid - 1);
    const r0 = clamp(Math.floor(((top - box.top) / height) * grid), 0, grid - 1);
    const r1 = clamp(Math.ceil(((bottom - box.top) / height) * grid) - 1, 0, grid - 1);
    for (let r = r0; r <= r1; r++) {
      const rowBase = r * grid;
      for (let c = c0; c <= c1; c++) {
        if (cells[rowBase + c] === 0) {
          cells[rowBase + c] = 1;
          covered++;
        }
      }
    }
  }
  return {
    paintRatio: round4(covered / (grid * grid)),
    leafCount,
    textLeaves,
    imageLeaves,
    chars,
  };
}

/**
 * A region's INK: the fraction of its sampled pixels that differ from the
 * region's own modal (background) colour by more than the CIE ΔE*76 JND.
 *
 * WHY THIS LEG EXISTS AT ALL. The `gs.severance.healthcare` hero is a white
 * rectangle to a reader and PERFECT to every DOM census — right geometry, right
 * opacity, image decoded, headline text present and counted — because the
 * clone paints the body background OVER it and its white headline then sits on
 * white. Nothing structural is wrong. Only the pixels know.
 *
 * The modal colour is computed PER REGION, not per page: a coloured band's
 * background is not the document's background, and a page-level modal would
 * score the whole band as ink and never see a hole inside it.
 *
 * Sampling is strided so a region costs at most `REGION_INK_SAMPLE_BUDGET`
 * pixels regardless of its size; the stride is derived from the box, so the two
 * sides of one region are sampled at the same density whenever their boxes are
 * the same size, and the stride is reported.
 */
export interface RegionInk {
  available: boolean;
  /** Pixels actually sampled. */
  samples: number;
  /** Sampled pixels further than the JND from the region's modal colour. */
  inkPixels: number;
  /** `inkPixels / samples`, 0 when nothing was sampled. */
  inkRatio: number;
  /** One in every `stride` pixels was read on each axis. */
  stride: number;
  /** Why the reading is unavailable, when it is. */
  reason?: string;
}

const NO_INK: RegionInk = {
  available: false,
  samples: 0,
  inkPixels: 0,
  inkRatio: 0,
  stride: 0,
  reason: "no screenshot was supplied for this side",
};

export function inkInsideBox(
  image: DecodedImage | undefined,
  box: Box,
  budget: number = REGION_INK_SAMPLE_BUDGET,
): RegionInk {
  if (!image) return NO_INK;
  const left = Math.max(0, Math.floor(box.left));
  const top = Math.max(0, Math.floor(box.top));
  const right = Math.min(image.width, Math.ceil(box.right));
  const bottom = Math.min(image.height, Math.ceil(box.bottom));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return {
      ...NO_INK,
      reason: "the region lies outside the screenshot (a shorter page than the box)",
    };
  }
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / Math.max(1, budget))));
  const shift = 8 - REGION_INK_HISTOGRAM_BITS;
  // Each bin keeps the SUM of the colours that fell in it, not just how many.
  //
  // THE BUG THAT FORCED THIS, measured on `hobbang.net / @1440`: with the bin's
  // geometric CENTRE used as the modal colour, a region whose background is
  // rgb(246,247,249) got a modal of rgb(244,244,252) — the centre of the 5-bit
  // cell it lands in — and ΔE*76 from its own background to that centre is 2.5,
  // just over the 2.3 JND. Every pixel of a flat background then counted as
  // INK, the region read 100.0 % inked, its healthy clone read 4.7 %, and a
  // page a human graded excellent produced two BLOCKER-sized holes. The mean of
  // the pixels actually in the bin cannot drift from them by construction.
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  const pixels: number[] = [];
  for (let y = top; y < bottom; y += stride) {
    const rowBase = y * image.width * 4;
    for (let x = left; x < right; x += stride) {
      const offset = rowBase + x * 4;
      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      pixels.push(offset);
      const bin = ((r >> shift) << (2 * REGION_INK_HISTOGRAM_BITS)) |
        ((g >> shift) << REGION_INK_HISTOGRAM_BITS) |
        (b >> shift);
      const slot = bins.get(bin);
      if (slot) {
        slot.count++;
        slot.r += r;
        slot.g += g;
        slot.b += b;
      } else {
        bins.set(bin, { count: 1, r, g, b });
      }
    }
  }
  if (pixels.length < REGION_INK_MIN_SAMPLES) {
    return {
      ...NO_INK,
      samples: pixels.length,
      stride,
      reason: `only ${pixels.length} pixels sampled, under the ${REGION_INK_MIN_SAMPLES} a modal colour needs`,
    };
  }
  // Deterministic modal bin: highest count, lowest bin index on a tie. The
  // modal COLOUR is that bin's mean, so it is a colour the region actually
  // contains rather than the centre of a quantisation cell.
  let modal: { count: number; r: number; g: number; b: number } | null = null;
  for (const [, slot] of Array.from(bins.entries()).sort((a, b) => a[0] - b[0])) {
    if (modal === null || slot.count > modal.count) modal = slot;
  }
  // ROUNDED, and it matters: `srgbToLab` indexes a 256-entry lookup table, so a
  // fractional channel reads `undefined`, every distance comes back NaN, every
  // `NaN > JND` is false and the region reports 0 % ink — a photograph included.
  const [ml, ma, mb] = srgbToLab(
    Math.round(modal!.r / modal!.count),
    Math.round(modal!.g / modal!.count),
    Math.round(modal!.b / modal!.count),
  );
  let inkPixels = 0;
  for (const offset of pixels) {
    const [l, a, b] = srgbToLab(
      image.data[offset]!,
      image.data[offset + 1]!,
      image.data[offset + 2]!,
    );
    const distance = Math.sqrt((l - ml) ** 2 + (a - ma) ** 2 + (b - mb) ** 2);
    if (distance > DELTA_E76_JND_THRESHOLD) inkPixels++;
  }
  return {
    available: true,
    samples: pixels.length,
    inkPixels,
    inkRatio: round4(inkPixels / pixels.length),
    stride,
  };
}

/**
 * EXACT union area of a set of boxes, by coordinate compression.
 *
 * Exact here and quantised in `paintInsideBox` for one reason: the input is at
 * most a few dozen region boxes, so 2N × 2N cells × N boxes is affordable and
 * there is no reason to accept error in the number the channel's band is read
 * against.
 */
export function unionArea(boxes: readonly Box[]): number {
  if (boxes.length === 0) return 0;
  const xs = Array.from(new Set(boxes.flatMap((b) => [b.left, b.right]))).sort(
    (a, b) => a - b,
  );
  const ys = Array.from(new Set(boxes.flatMap((b) => [b.top, b.bottom]))).sort(
    (a, b) => a - b,
  );
  let total = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    for (let j = 0; j + 1 < ys.length; j++) {
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      for (const box of boxes) {
        if (midX > box.left && midX < box.right && midY > box.top && midY < box.bottom) {
          total += (x1 - x0) * (y1 - y0);
          break;
        }
      }
    }
  }
  return total;
}

function segmentsOf(path: string): string[] {
  return path.length === 0 ? [] : path.split("/");
}

/** Shared trailing segments of two structural paths. */
export function sharedPathSuffix(a: readonly string[], b: readonly string[]): number {
  let shared = 0;
  let i = a.length - 1;
  let j = b.length - 1;
  while (i >= 0 && j >= 0 && a[i] === b[j]) {
    shared++;
    i--;
    j--;
  }
  return shared;
}

export interface RegionPairing {
  /** Index into the source census, index into the clone census. */
  source: number;
  clone: number;
  /** Shared trailing path segments that justified the pair. */
  suffix: number;
}

/** Intersection over union of two boxes; 0 when they do not touch. */
export function boxIoU(a: Box, b: Box): number {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const union = areaOf(a) + areaOf(b) - intersection;
  return union <= 0 ? 0 : intersection / union;
}

/**
 * Pair source regions to clone regions by TAG-PATH SUFFIX.
 *
 * WHY THE SUFFIX AND NOT THE PATH. The generator wraps the source subtree in
 * its own layout shell, so every clone path is a source path with a fixed
 * prefix bolted on and the FULL path matches nothing — item C3.4 measured that
 * at 0 hits on ten pairs for leaves, and the Task 28.75 experiment re-measured
 * it on regions with the same answer. The suffix is the part of the path the
 * shell cannot touch.
 *
 * Greedy, longest suffix first, one-to-one, deterministic: ties break on
 * document-order distance (a region near the top of the source pairs with a
 * region near the top of the clone before it pairs with one at the bottom) and
 * then on the two indices, so the result never depends on Map iteration order.
 */
export function pairRegions(
  sourceRegions: readonly RegionBox[],
  cloneRegions: readonly RegionBox[],
  minSuffix: number = MIN_REGION_SUFFIX_SEGMENTS,
): RegionPairing[] {
  const sourcePaths = sourceRegions.map((region) => segmentsOf(region.path));
  const clonePaths = cloneRegions.map((region) => segmentsOf(region.path));
  const candidates: (RegionPairing & { iou: number; ordinalDelta: number })[] = [];
  for (let i = 0; i < sourceRegions.length; i++) {
    for (let j = 0; j < cloneRegions.length; j++) {
      if (sourceRegions[i]!.tag !== cloneRegions[j]!.tag) continue;
      const suffix = sharedPathSuffix(sourcePaths[i]!, clonePaths[j]!);
      if (suffix < minSuffix) continue;
      candidates.push({
        source: i,
        clone: j,
        suffix,
        iou: boxIoU(sourceRegions[i]!, cloneRegions[j]!),
        ordinalDelta: Math.abs(i - j),
      });
    }
  }
  candidates.sort(
    (a, b) =>
      b.suffix - a.suffix ||
      // THE TIE-BREAK, AND WHY IT IS GEOMETRIC. A source path only two segments
      // long — `div/div[1]` — matches every clone path that happens to end that
      // way. On `seoultone.kr /` the experiment measured a document-order
      // tie-break picking a 470x707 nav panel over the 1440x4060 page body,
      // which then poisoned every coordinate mapped through it. Overlap is the
      // fact that separates them. It is only ever a TIE-break: a longer shared
      // suffix always wins first, so a genuinely displaced container still pairs
      // with its structural counterpart rather than with whatever now sits in
      // its old place.
      b.iou - a.iou ||
      a.ordinalDelta - b.ordinalDelta ||
      a.source - b.source ||
      a.clone - b.clone,
  );
  const usedSource = new Set<number>();
  const usedClone = new Set<number>();
  const pairs: RegionPairing[] = [];
  for (const candidate of candidates) {
    if (usedSource.has(candidate.source) || usedClone.has(candidate.clone)) continue;
    usedSource.add(candidate.source);
    usedClone.add(candidate.clone);
    pairs.push({ source: candidate.source, clone: candidate.clone, suffix: candidate.suffix });
  }
  pairs.sort((a, b) => a.source - b.source);
  return pairs;
}

/** Is this source region a place content lives, by the DOM alone? Four tests. */
export function sourceRegionIsPopulated(region: RegionBox, paint: RegionPaint): boolean {
  if (paint.paintRatio < REGION_SOURCE_PAINT_RATIO) return false;
  if (paint.leafCount < REGION_SOURCE_MIN_LEAVES) return false;
  if (paint.chars < REGION_SOURCE_MIN_CHARS && paint.imageLeaves < 1) return false;
  if (region.visibleDescendants < REGION_SOURCE_MIN_DESCENDANTS) return false;
  return true;
}

/** …or by INK: the source region is visibly drawn on, whatever the DOM says.
 *  The structural test is kept — a region is still a container, not a picture. */
export function sourceRegionHasInk(region: RegionBox, ink: RegionInk): boolean {
  if (!ink.available) return false;
  if (ink.inkRatio < REGION_SOURCE_INK_RATIO) return false;
  if (region.visibleDescendants < REGION_SOURCE_MIN_DESCENDANTS) return false;
  return true;
}

/** Is the clone's counterpart empty or near-empty, by the DOM alone? Three
 *  tests: absolute occupancy, occupancy retained, leaves retained. */
export function cloneRegionIsBlank(source: RegionPaint, clone: RegionPaint): boolean {
  if (clone.paintRatio > REGION_CLONE_BLANK_PAINT_RATIO) return false;
  if (clone.paintRatio > source.paintRatio * REGION_CLONE_BLANK_RETAINED_RATIO) return false;
  const leafAllowance = Math.max(
    REGION_CLONE_BLANK_MIN_LEAF_ALLOWANCE,
    Math.floor(source.leafCount * REGION_CLONE_BLANK_LEAF_RETAINED_RATIO),
  );
  if (clone.leafCount > leafAllowance) return false;
  return true;
}

/**
 * …or by INK: the clone region's pixels are near-uniform where the source's are
 * not. Both readings must be available — an unavailable ink reading is not
 * evidence of emptiness — and the source must itself be inked, so the test can
 * never fire on a pair of blank rectangles.
 *
 * The two legs are ORed, NEVER vetoed against each other. The severance
 * promotional carousel proves why: its clone region still paints the section's
 * photographic background, so its ink is HIGH, and all four of its cards are
 * gone — the DOM leg is right and an ink veto would have silenced it. The hero
 * one band above proves the converse.
 */
export function cloneRegionIsBlankByInk(source: RegionInk, clone: RegionInk): boolean {
  if (!source.available || !clone.available) return false;
  if (source.inkRatio < REGION_SOURCE_INK_RATIO) return false;
  if (clone.inkRatio > REGION_CLONE_BLANK_INK_RATIO) return false;
  if (clone.inkRatio > source.inkRatio * REGION_CLONE_BLANK_INK_RETAINED_RATIO) return false;
  return true;
}

/**
 * TASK 28.8 FAST, ITEM 1 — IS THIS A HOLE, OR IS IT WHITESPACE?
 *
 * `blank-region-ratio` is a BLOCKER channel and BLOCKER means "a reader would
 * call this page broken". The two tests above answer a narrower question than
 * that: they compare the clone's rectangle to the SOURCE's and fire when it
 * reads emptier. Extra padding, a taller intentional gap, and a section drawn
 * on plain ground where the source drew a coloured panel all read emptier, and
 * none of them is missing content.
 *
 * This predicate is the second question, asked of the same evidence the
 * detector already collected. It never removes a finding; it decides whether
 * one may raise the pair's verdict to BLOCKER.
 *
 *   PRECONDITION  the source rectangle must carry a text or image LEAF. A
 *                 region of pure whitespace has nothing to be absent, so it can
 *                 never corroborate anything.
 *
 *   Then any ONE of:
 *
 *   DOM LEG       `evidence` includes "dom": the clone's box lost the source's
 *                 leaves outright. That IS content absence, measured.
 *   NO COUNTERPART `mechanism === "absent"`: no clone element paired at all, or
 *                 one with no visible subtree left to paint.
 *   UNPAINTED     ink-only, AND the clone's ink also falls short of what the
 *                 CLONE's OWN DOM claims it paints there
 *                 ({@link REGION_INK_ONLY_CORROBORATION_PAINT_RATIO}). This is
 *                 the severance hero: a photograph's worth of declared paint
 *                 arriving as a flat rectangle. It is NOT seoultone's footer,
 *                 which declares 12 % box coverage of text and inks at 3.3 %,
 *                 exactly what text that painted normally looks like.
 */
export function regionCorroboratesContentAbsence(
  region: Pick<BlankRegion, "mechanism" | "evidence" | "source" | "clone" | "cloneInk">,
): boolean {
  const meaningfulSourceLeaves = region.source.textLeaves + region.source.imageLeaves;
  if (meaningfulSourceLeaves < REGION_MEANINGFUL_SOURCE_LEAVES) return false;
  if (region.evidence === "dom" || region.evidence === "dom+ink") return true;
  if (region.mechanism === "absent") return true;
  if (!region.cloneInk.available) return false;
  // The clone declares no paint here at all; there is nothing for its ink to be
  // consistent with, and the DOM leg would have fired had it been measurable.
  if (region.clone.paintRatio <= 0) return true;
  return (
    region.cloneInk.inkRatio <
    region.clone.paintRatio * REGION_INK_ONLY_CORROBORATION_PAINT_RATIO
  );
}

/** `inner` sits wholly inside `outer` (with the census's own box tolerance). */
function evidenceOf(domBlank: boolean, inkBlank: boolean): "dom" | "ink" | "dom+ink" {
  return domBlank && inkBlank ? "dom+ink" : inkBlank ? "ink" : "dom";
}

function containedIn(inner: Box, outer: Box, tolerance = REGION_BOX_DEDUPE_PX): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

export type BlankRegionSide = Pick<
  SideMeasurement,
  "regions" | "leaves" | "leavesTruncated" | "regionAccounting" | "innerWidth" | "innerHeight" | "scrollHeight"
> & {
  /** This side's full-page screenshot, decoded. OPTIONAL: the detector works
   *  without it and says so (`inkAvailable: false`), because a caller measuring
   *  two DOMs need not fabricate a picture. `CAPTURE_DEVICE_SCALE_FACTOR` is 1,
   *  so a region box in CSS px indexes this image directly. */
  image?: DecodedImage;
};

/** Whether one side's screenshot may be read at that side's DOM coordinates. */
export interface InkTrust {
  ok: boolean;
  /** The deepest painted leaf, clamped to the page, over the page height.
   *  1 when the side has no leaves and no height to disagree about. */
  domPixelCoverage: number;
  /** Why not, when `ok` is false. */
  reason: string | null;
}

/**
 * THE INK LEG'S PRECONDITION, measured per side.
 *
 * Ink reads a rectangle that the DOM census measured out of a screenshot that
 * was taken separately. Three things must hold for that to mean anything, and
 * all three are checked here rather than assumed:
 *
 *   1  there is a screenshot at all;
 *   2  it is a picture of THIS page — the same height, and at least as wide
 *      as the viewport, within {@link REGION_INK_IMAGE_SCALE_TOLERANCE} (a full-
 *      page capture of a horizontally overflowing page is WIDER than its
 *      viewport with the origin unmoved, which indexes correctly);
 *   3  the census and the screenshot agree about the layout, tested by how far
 *      down the page the census found anything painted at all
 *      ({@link REGION_INK_DOM_COVERAGE_MIN}).
 *
 * Test 3 is the one that matters and the one that was learned the hard way: see
 * the constant for the hobbang.net measurement that forced it. It is a page-
 * level test on purpose. A per-region version was tried first and rejected —
 * region-level "does the DOM paint here agree with the pixels here" scores a
 * healthy dark-theme linear.app page between 0.30 and 0.74 and the misaligned
 * hobbang page at 0.93, i.e. it separates nothing.
 */
export function inkTrustOf(side: BlankRegionSide): InkTrust {
  const height = Math.max(1, side.scrollHeight);
  let deepest = 0;
  for (const leaf of side.leaves) {
    if (leaf.bottom > deepest) deepest = leaf.bottom;
  }
  const domPixelCoverage =
    side.leaves.length === 0 ? 1 : round4(Math.min(deepest, height) / height);
  if (!side.image) {
    return { ok: false, domPixelCoverage, reason: "no screenshot was supplied for this side" };
  }
  const scaleX = side.image.width / Math.max(1, side.innerWidth);
  const scaleY = side.image.height / height;
  const tolerance = REGION_INK_IMAGE_SCALE_TOLERANCE;
  // Wider than the viewport is legal and common — a full-page capture runs to
  // the document's SCROLL width from an unmoved origin, so a horizontally
  // overflowing page is photographed wide and still indexed correctly.
  // Narrower is not, and a different height never is.
  if (scaleX < 1 - tolerance || Math.abs(scaleY - 1) > tolerance) {
    return {
      ok: false,
      domPixelCoverage,
      reason:
        `the screenshot is ${side.image.width}x${side.image.height} for a ` +
        `${side.innerWidth}x${height} page, so a CSS-px box does not index it`,
    };
  }
  // The census must have found paint most of the way down the page. When it has
  // not, the page rendered more after the probe than it had during it, and
  // every box below that point names the wrong pixels.
  if (side.leaves.length > 0 && domPixelCoverage < REGION_INK_DOM_COVERAGE_MIN) {
    return {
      ok: false,
      domPixelCoverage,
      reason:
        `the DOM census reaches only ${(domPixelCoverage * 100).toFixed(0)}% down a ` +
        `${height}px page (floor ${(REGION_INK_DOM_COVERAGE_MIN * 100).toFixed(0)}%), so ` +
        `it and the screenshot describe different layouts`,
    };
  }
  return { ok: true, domPixelCoverage, reason: null };
}

/**
 * The whole channel, as one pure function of two side measurements.
 */
export function detectBlankRegions(
  source: BlankRegionSide,
  clone: BlankRegionSide,
): BlankRegionResult {
  const viewportArea = Math.max(1, source.innerWidth * source.innerHeight);
  // ONE DECISION FOR THE WHOLE PAIR. Ink is either trustworthy on both sides or
  // it is withheld from every region: a comparison needs two readings, and a
  // half-trusted one is worse than none.
  const sourceInkTrust = inkTrustOf(source);
  const cloneInkTrust = inkTrustOf(clone);
  const inkTrusted = sourceInkTrust.ok && cloneInkTrust.ok;
  const sourceImage = inkTrusted ? source.image : undefined;
  const cloneImage = inkTrusted ? clone.image : undefined;
  const inkWithheldReason = inkTrusted
    ? null
    : sourceInkTrust.ok
      ? `clone: ${cloneInkTrust.reason}`
      : `source: ${sourceInkTrust.reason}`;
  const pairs = pairRegions(source.regions, clone.regions);
  const cloneOf = new Map<number, number>();
  for (const pair of pairs) cloneOf.set(pair.source, pair.clone);

  // ARE THE TWO COORDINATE SYSTEMS THE SAME ONE? Only then may a raw source
  // rectangle be read on the clone. Equal page height is necessary and NOT
  // sufficient — `hobbang.net / @390` matches to 0.4 % and still puts its
  // <main> 8,011px lower — so the second half of the test is MEASURED: the
  // median offset of the regions that did pair.
  const heightRatio =
    source.scrollHeight > 0 ? clone.scrollHeight / source.scrollHeight : 1;
  const comparableHeight =
    Math.abs(heightRatio - 1) <= REGION_FALLBACK_HEIGHT_TOLERANCE;
  const topOffsets: number[] = [];
  const leftOffsets: number[] = [];
  for (const pair of pairs) {
    topOffsets.push(clone.regions[pair.clone]!.top - source.regions[pair.source]!.top);
    leftOffsets.push(clone.regions[pair.clone]!.left - source.regions[pair.source]!.left);
  }
  const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  };
  const medianTopOffset = median(topOffsets);
  const medianLeftOffset = median(leftOffsets);
  const alignedGeometry =
    comparableHeight &&
    pairs.length >= REGION_ALIGNMENT_MIN_PAIRS &&
    Math.abs(medianTopOffset) <= REGION_ALIGNMENT_TOLERANCE_PX &&
    Math.abs(medianLeftOffset) <= REGION_ALIGNMENT_TOLERANCE_PX;

  // ANCESTOR ANCHORS. For every source region, the index of its nearest
  // ENCLOSING source region that is itself paired to a clone region. A box
  // mapped through that pair is expressed in the clone's own coordinates, which
  // is the only reading that survives a whole-page vertical offset.
  const pathOfIndex = source.regions.map((region) => region.path);
  const anchorOf = new Map<number, number>();
  for (let i = 0; i < source.regions.length; i++) {
    let best = -1;
    let bestLength = -1;
    for (let a = 0; a < source.regions.length; a++) {
      if (a === i) continue;
      if (!cloneOf.has(a)) continue;
      const candidate = pathOfIndex[a]!;
      if (!pathOfIndex[i]!.startsWith(`${candidate}/`)) continue;
      if (candidate.length > bestLength) {
        bestLength = candidate.length;
        best = a;
      }
    }
    if (best >= 0) anchorOf.set(i, best);
  }

  /** Map a source box into clone coordinates through one paired ancestor. */
  const mapThroughAnchor = (box: Box, sourceIndex: number): Box | null => {
    const anchorIndex = anchorOf.get(sourceIndex);
    if (anchorIndex === undefined) return null;
    const anchor = source.regions[anchorIndex]!;
    const mate = clone.regions[cloneOf.get(anchorIndex)!]!;
    const sourceWidth = anchor.right - anchor.left;
    const sourceHeight = anchor.bottom - anchor.top;
    const cloneWidth = mate.right - mate.left;
    const cloneHeight = mate.bottom - mate.top;
    if (sourceWidth <= 0 || sourceHeight <= 0 || cloneWidth <= 0 || cloneHeight <= 0) {
      return null;
    }
    const scaleX = cloneWidth / sourceWidth;
    const scaleY = cloneHeight / sourceHeight;
    const limit = REGION_MAP_SCALE_TOLERANCE;
    if (scaleX > limit || scaleX < 1 / limit || scaleY > limit || scaleY < 1 / limit) {
      return null;
    }
    return {
      left: mate.left + (box.left - anchor.left) * scaleX,
      right: mate.left + (box.right - anchor.left) * scaleX,
      top: mate.top + (box.top - anchor.top) * scaleY,
      bottom: mate.top + (box.bottom - anchor.top) * scaleY,
    };
  };

  const blanked: BlankRegion[] = [];
  const populatedBoxes: Box[] = [];
  let populatedSourceRegions = 0;
  let fallbackRegions = 0;
  let unjudgedRegions = 0;

  for (let i = 0; i < source.regions.length; i++) {
    const region = source.regions[i]!;
    const box: Box = {
      left: region.left,
      right: region.right,
      top: region.top,
      bottom: region.bottom,
    };
    const sourcePaint = paintInsideBox(source.leaves, box);
    const sourceInk = inkInsideBox(sourceImage, box);
    // TWO LEGS, EACH SELF-CONSISTENT. A region populated only by INK is judged
    // only by ink, and one populated only by the DOM only by the DOM. Crossing
    // them manufactures findings: at @1100 four 257x113 cards on severance are
    // DOM-populated by 2 leaves (under the 3 the DOM leg requires) and INK-
    // populated at 87 %, and judging their DOM emptiness against an ink-only
    // population reported four holes the clone demonstrably paints (clone ink
    // 79.6 %, 54.5 %, 19.8 %, 52.0 %).
    const domPopulated = sourceRegionIsPopulated(region, sourcePaint);
    const inkPopulated = sourceRegionHasInk(region, sourceInk);
    if (!domPopulated && !inkPopulated) continue;
    populatedSourceRegions++;
    populatedBoxes.push(box);

    const areaPx = areaOf(box);
    if (areaPx < viewportArea * REGION_BLANK_MIN_VIEWPORT_AREA_RATIO) continue;

    // THE SECOND, INDEPENDENT READING. Where does this rectangle land on the
    // clone? Preferably through a paired ancestor (offset- and scale-corrected);
    // failing that, the raw rectangle, and only when the two pages are the same
    // height. It corroborates a paired finding and IS the finding when no
    // counterpart element exists.
    const mapped = mapThroughAnchor(box, i);
    const projected = mapped ?? (alignedGeometry ? box : null);
    const projectedPaint = projected ? paintInsideBox(clone.leaves, projected) : null;
    const projectedInk = projected ? inkInsideBox(cloneImage, projected) : NO_INK;
    const projectedDomBlank =
      projectedPaint !== null && domPopulated && cloneRegionIsBlank(sourcePaint, projectedPaint);
    const projectedInkBlank =
      inkPopulated && cloneRegionIsBlankByInk(sourceInk, projectedInk);
    const projectedBlank = projectedDomBlank || projectedInkBlank;

    const cloneIndex = cloneOf.get(i);
    const cloneRegion = cloneIndex === undefined ? null : clone.regions[cloneIndex]!;

    if (!cloneRegion) {
      fallbackRegions++;
      if (projected === null || projectedPaint === null) {
        unjudgedRegions++;
        continue;
      }
      if (!projectedBlank) continue;
      blanked.push({
        path: region.path,
        tag: region.tag,
        box,
        areaPx,
        viewportAreaRatio: round4(areaPx / viewportArea),
        aboveFold: region.top < source.innerHeight,
        correspondence: mapped ? "ancestor-mapped" : "source-rect",
        clonePath: null,
        // No counterpart element on the clone at all: there is nothing there to
        // be displaced.
        mechanism: "absent",
        corroborated: true,
        source: sourcePaint,
        clone: projectedPaint,
        sourceInk,
        cloneInk: projectedInk,
        evidence: evidenceOf(projectedDomBlank, projectedInkBlank),
        cloneVisibleDescendants: 0,
        cloneSubtreeTextChars: 0,
        contentAbsenceCorroborated: regionCorroboratesContentAbsence({
          mechanism: "absent",
          evidence: evidenceOf(projectedDomBlank, projectedInkBlank),
          source: sourcePaint,
          clone: projectedPaint,
          cloneInk: projectedInk,
        }),
      });
      continue;
    }

    const cloneBox: Box = {
      left: cloneRegion.left,
      right: cloneRegion.right,
      top: cloneRegion.top,
      bottom: cloneRegion.bottom,
    };
    const clonePaint = paintInsideBox(clone.leaves, cloneBox);
    const cloneInk = inkInsideBox(cloneImage, cloneBox);
    const domBlank = domPopulated && cloneRegionIsBlank(sourcePaint, clonePaint);
    const inkBlank = inkPopulated && cloneRegionIsBlankByInk(sourceInk, cloneInk);
    if (!domBlank && !inkBlank) continue;
    // THE MIS-PAIRING VETO. When a second reading is available at all, it must
    // agree. A pair that led us to some other part of a healthy page fails this
    // immediately, because the place the region SHOULD be is still painted.
    //
    // It applies to the DOM leg only. An INK finding is a statement about
    // COLOUR — the severance hero's DOM is intact and correct, which is the
    // whole point of it — and the projected rectangle's DOM reading has nothing
    // to say about that. An ink finding is instead corroborated by the pair
    // itself: `cloneBox` is the clone's own copy of this container.
    if (!inkBlank && projectedPaint !== null && !projectedBlank) continue;
    blanked.push({
      path: region.path,
      tag: region.tag,
      box,
      areaPx,
      viewportAreaRatio: round4(areaPx / viewportArea),
      aboveFold: region.top < source.innerHeight,
      correspondence: "path-suffix",
      clonePath: cloneRegion.path,
      mechanism:
        cloneRegion.visibleDescendants >= REGION_SOURCE_MIN_DESCENDANTS &&
        (cloneRegion.textChars > 0 || cloneRegion.imageElements > 0)
          ? "displaced"
          : "absent",
      corroborated: projectedPaint !== null,
      source: sourcePaint,
      clone: clonePaint,
      sourceInk,
      cloneInk,
      evidence: evidenceOf(domBlank, inkBlank),
      cloneVisibleDescendants: cloneRegion.visibleDescendants,
      cloneSubtreeTextChars: cloneRegion.textChars,
      contentAbsenceCorroborated: regionCorroboratesContentAbsence({
        mechanism:
          cloneRegion.visibleDescendants >= REGION_SOURCE_MIN_DESCENDANTS &&
          (cloneRegion.textChars > 0 || cloneRegion.imageElements > 0)
            ? "displaced"
            : "absent",
        evidence: evidenceOf(domBlank, inkBlank),
        source: sourcePaint,
        clone: clonePaint,
        cloneInk,
      }),
    });
  }

  // MAXIMAL ONLY. A blanked hero and the blanked column inside it are one hole
  // to a reader; keeping both would let nesting depth, rather than the size of
  // what is missing, drive the channel's value.
  const maximal = blanked.filter(
    (candidate, index) =>
      !blanked.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.areaPx >= candidate.areaPx &&
          !(other.areaPx === candidate.areaPx && otherIndex > index) &&
          containedIn(candidate.box, other.box),
      ),
  );
  maximal.sort((a, b) => b.areaPx - a.areaPx || (a.path < b.path ? -1 : 1));

  const blankedAreaPx = unionArea(maximal.map((region) => region.box));
  // The corroborated SUBSET, unioned the same way, so the two ratios are
  // measured on the same scale and `corroborated ≤ blanked` by construction.
  const corroborated = maximal.filter((region) => region.contentAbsenceCorroborated);
  const corroboratedAreaPx = unionArea(corroborated.map((region) => region.box));
  const largest = maximal.length > 0 ? maximal[0]!.areaPx : 0;

  return {
    sourceRegions: source.regions.length,
    cloneRegions: clone.regions.length,
    populatedSourceRegions,
    populatedViewportRatio: round4(unionArea(populatedBoxes) / viewportArea),
    pairedRegions: pairs.length,
    fallbackRegions,
    unjudgedRegions,
    regions: maximal,
    blankedAreaPx: Math.round(blankedAreaPx),
    ratio: round4(blankedAreaPx / viewportArea),
    largestViewportRatio: round4(largest / viewportArea),
    displacedCount: maximal.filter((r) => r.mechanism === "displaced").length,
    absentCount: maximal.filter((r) => r.mechanism === "absent").length,
    corroboratedCount: corroborated.length,
    corroboratedAreaPx: Math.round(corroboratedAreaPx),
    corroboratedRatio: round4(corroboratedAreaPx / viewportArea),
    inkOnlyCount: maximal.filter((r) => r.evidence === "ink").length,
    domOnlyCount: maximal.filter((r) => r.evidence === "dom").length,
    inkAvailable: sourceImage !== undefined && cloneImage !== undefined,
    inkWithheldReason,
    sourceDomPixelCoverage: sourceInkTrust.domPixelCoverage,
    cloneDomPixelCoverage: cloneInkTrust.domPixelCoverage,
    leavesTruncated: source.leavesTruncated || clone.leavesTruncated,
    regionsTruncated:
      source.regionAccounting.truncated || clone.regionAccounting.truncated,
    medianTopOffset,
    medianLeftOffset,
    alignedGeometry,
  };
}

/** A short, stable description of the worst blanked regions, for the finding. */
export function describeBlankRegions(result: BlankRegionResult, limit = 4): string {
  if (result.regions.length === 0) return "none";
  return result.regions
    .slice(0, limit)
    .map(
      (region) =>
        `${region.path} (${Math.round(region.box.right - region.box.left)}×${Math.round(
          region.box.bottom - region.box.top,
        )} at y=${Math.round(region.box.top)}, ${(region.viewportAreaRatio * 100).toFixed(0)}% of a viewport, ${region.mechanism}, seen by ${region.evidence}, source paint ${(region.source.paintRatio * 100).toFixed(0)}%/${region.source.leafCount} leaves → clone ${(region.clone.paintRatio * 100).toFixed(0)}%/${region.clone.leafCount}, source ink ${(region.sourceInk.inkRatio * 100).toFixed(1)}% → clone ink ${region.cloneInk.available ? `${(region.cloneInk.inkRatio * 100).toFixed(1)}%` : "n/a"})`,
    )
    .join("; ");
}

/** True when the result reaches the channel's most severe band. Exported so the
 *  suite can assert the band without re-deriving it from the classifier. */
export function reachesBlocker(result: BlankRegionResult): boolean {
  return result.ratio >= BLANK_REGION_BLOCKER_RATIO;
}
