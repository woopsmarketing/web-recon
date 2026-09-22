import { PNG } from "pngjs";
import type { ScreenshotCoverage, ScreenshotMetric, ScreenshotSide } from "./types.js";

/**
 * Deterministic screenshot comparison (items 28–33).
 *
 * Three images exist for every exact-observed page/viewport:
 *
 *   S  the Task 09 `screenshot.png` saved with the observation
 *   O  the live original, captured NOW with the same screenshot policy
 *   C  the clone
 *
 * and three pairs are measured — S↔C, S↔O, O↔C — because a single similarity
 * number cannot distinguish "the clone is wrong" from "the site changed"
 * (item 28). The interpretation of the triple is done by the classifier; this
 * module only measures.
 *
 * ## Rules that are easy to get wrong
 *
 *  - **Never resize** (items 29, 30). A clone that is 40 px shorter than the
 *    original is a finding; scaling it to match would delete the finding and
 *    then blur every remaining pixel comparison. Differing dimensions produce
 *    `widthDelta` / `heightDelta` plus metrics over the OVERLAPPING area only,
 *    and `commonAreaRatio` says how much of the larger image that was.
 *  - **No threshold, no antialiasing heuristic.** A pixel differs when any of
 *    its R/G/B channels differs by a single unit. `pixelmatch`-style
 *    antialiasing detection would introduce a tunable this Task must not have
 *    (item 31), so the metrics are computed directly from the decoded buffers.
 *  - **No single scalar is visual truth** (Task 28.5B change 6). 28.5A measured
 *    that the @1 ratio above — any channel off by 1/255 — reports ~1.0 for two
 *    renders a human calls identical, because sub-perceptual rasterization
 *    noise covers the page. It is KEPT UNCHANGED for continuity with every
 *    historical artifact, and three further channels are reported ALONGSIDE it:
 *    an amplitude-gated ratio (`changedRatioAt16`, max channel ≥ 16/255), the
 *    perceptual CIELab ΔE*76 fractions above the 2.3 JND and above 10 (clearly
 *    visible), and the mean ΔE76 / mean max-channel delta. A reader who sees
 *    @1 = 0.98 with ΔE76>2.3 = 0.004 is looking at noise; a reader who sees
 *    both high is looking at a real visual regression. Reporting one number
 *    would have to choose which of those two stories to tell, so all of them
 *    are reported and none is called the verdict (item 31 still holds: no PASS
 *    score is produced anywhere in this file).
 *  - **No PASS score** (item 31). Nothing here returns a verdict. The numbers are
 *    for ranking, diagnosis and before/after improvement.
 *  - **Alpha is composited, not compared.** PNG screenshots from Chromium are
 *    opaque, but a transparent pixel would otherwise read as a huge RGB delta
 *    against whatever noise sat in its channels, so both sides are composited
 *    over white before comparison.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Buffer;
}

export function decodePng(buffer: Buffer): DecodedImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

/**
 * Read a PNG's dimensions from its IHDR without decoding the pixels
 * (Task 28.6, C5).
 *
 * `decodePng` above allocates width x height x 4 bytes, which is 342 MB for one
 * side of a 1170x57000 mobile capture. Coverage accounting needs the dimensions
 * of every screenshot including the ones no pair ever decodes, so it reads the
 * 8-byte signature and the IHDR length/width/height and stops.
 *
 * Returns `undefined` for anything that is not a PNG, rather than throwing —
 * the caller records that as an uncaptured side, which is the honest answer.
 */
export function readPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  // 8-byte signature + 4-byte length + "IHDR" + 4-byte width + 4-byte height.
  if (buffer.byteLength < 24) return undefined;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index++) {
    if (buffer[index] !== signature[index]) return undefined;
  }
  if (buffer.toString("latin1", 12, 16) !== "IHDR") return undefined;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) return undefined;
  return { width, height };
}

export function encodePng(image: DecodedImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  image.data.copy(png.data);
  return PNG.sync.write(png);
}

/** Composite one RGBA pixel over white. */
function overWhite(value: number, alpha: number): number {
  if (alpha === 255) return value;
  return Math.round(value * (alpha / 255) + 255 * (1 - alpha / 255));
}

/**
 * Amplitude gate for the second changed-pixel channel (Task 28.5B change 6).
 *
 * 16/255 ≈ 6 % of the channel range. Below it a solid fill re-rendered by a
 * different compositing path, a font re-rasterized at a different smoothing
 * setting and a genuinely identical pixel are indistinguishable in bulk; above
 * it the difference survives being looked at.
 */
export const CHANGED_PIXEL_AMPLITUDE_THRESHOLD = 16;

/** CIE just-noticeable difference for ΔE*76 under ideal conditions. */
export const DELTA_E76_JND_THRESHOLD = 2.3;
/** ΔE*76 at which a difference is clearly visible side by side, not merely detectable. */
export const DELTA_E76_VISIBLE_THRESHOLD = 10;

/**
 * sRGB 8-bit → linear-light, precomputed.
 *
 * Both sides are composited over white first and `overWhite` rounds to an
 * integer, so every channel entering the conversion is one of 256 values and a
 * table removes the per-pixel `Math.pow`.
 */
const SRGB_TO_LINEAR = (() => {
  const table = new Float64Array(256);
  for (let value = 0; value < 256; value++) {
    const channel = value / 255;
    table[value] =
      channel <= 0.040_45 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }
  return table;
})();

/** D65 reference white, 2° observer — the white point sRGB is defined against. */
const D65_X = 95.047;
const D65_Y = 100.0;
const D65_Z = 108.883;

function labF(t: number): number {
  return t > 0.008_856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** sRGB (0–255, opaque) → CIE L*a*b* under D65. Implemented here; no dependency. */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = SRGB_TO_LINEAR[r]! * 100;
  const gl = SRGB_TO_LINEAR[g]! * 100;
  const bl = SRGB_TO_LINEAR[b]! * 100;
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / D65_X;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / D65_Y;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / D65_Z;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE*76 — the plain Euclidean distance in L*a*b*. */
export function deltaE76(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export interface ImageComparison {
  aWidth: number;
  aHeight: number;
  bWidth: number;
  bHeight: number;
  widthDelta: number;
  heightDelta: number;
  overlapPixels: number;
  changedPixels: number;
  changedPixelRatio: number;
  commonAreaRatio: number;
  meanAbsoluteRgbDelta: number;
  maxChannelDelta: number;

  // --- Task 28.5B change 6: reported ALONGSIDE the @1 channel above ---------
  /** Pixels whose largest channel delta is ≥ `CHANGED_PIXEL_AMPLITUDE_THRESHOLD`. */
  changedPixelsAt16: number;
  /** `changedPixelsAt16 / overlapPixels`, 4 decimals. */
  changedRatioAt16: number;
  /** Mean of the per-pixel MAX channel delta over the overlap (the @1 metric's mean is per-channel). */
  meanMaxChannelDelta: number;
  /** Mean ΔE*76 over the overlap. */
  deltaE76Mean: number;
  /** Largest ΔE*76 anywhere in the overlap. */
  deltaE76Max: number;
  /** Overlap pixels with ΔE76 > 2.3 (JND). */
  deltaE76AboveJndPixels: number;
  /** `deltaE76AboveJndPixels / overlapPixels`, 4 decimals. */
  deltaE76AboveJndRatio: number;
  /** Overlap pixels with ΔE76 > 10 (clearly visible). */
  deltaE76AboveVisiblePixels: number;
  /** `deltaE76AboveVisiblePixels / overlapPixels`, 4 decimals. */
  deltaE76AboveVisibleRatio: number;

  // --- Task 28.8 FAST change 3: the canvas the min-crop LEAVES OUT ---------------
  /**
   * Every field above is computed over `min(a,b)` in each axis. That crop was
   * silent: two captures of different widths produced a perfectly well-formed
   * set of numbers describing only the columns they shared, and nothing said
   * how much was dropped or whether anything was in it.
   *
   * The crop STAYS — resizing would invent pixels, and the responsive lane
   * measured why a top-left-anchored comparison is the honest one — and the
   * band is now MEASURED. `uncompared` is a pure function of the same two
   * inputs, like everything else in this file.
   */
  uncompared: UncomparedBand;
}

/**
 * What the min-crop removed, per axis and per side.
 *
 * INK, not just area, is the quantity that decides whether the omission
 * matters: a strip of plain page background reads 0 and hides nothing, while a
 * strip carrying a nav's last three links reads high. It is measured against
 * each image's OWN modal colour over its compared canvas, so a dark page and a
 * light page are read on the same terms.
 */
export interface UncomparedBand {
  /** Columns the wider image has and the comparison never read. */
  widthPx: number;
  /** Rows the taller image has and the comparison never read. */
  heightPx: number;
  /** Pixels outside the compared canvas on the `a` side, and on the `b` side.
   *  Exact areas; their sampled ink is `aInkSampled` / `bInkSampled`. */
  aPixels: number;
  bPixels: number;
  /** `aPixels + bPixels` — EXACT, never sampled: this is the quantity that says
   *  how much canvas was dropped. */
  pixels: number;
  /** Pixels actually READ for the ink figures. Equal to `pixels` until the band
   *  exceeds the sample budget; smaller after that, and the ratios below are
   *  then a sample. */
  sampledPixels: number;
  /** Sampled pixels further than the ΔE*76 JND from their own image's modal
   *  colour, per side and in total. */
  aInkSampled: number;
  bInkSampled: number;
  inkPixels: number;
  /** `inkPixels / sampledPixels`, 4 decimals. 0 when the two images are the
   *  same size, which is also the only case where 0 means "nothing was
   *  dropped" — read `pixels` first. */
  inkRatio: number;
  /** Was a modal colour resolvable on each side? False when the compared canvas
   *  is empty; ink is then reported as 0 and this says why it cannot be read as
   *  a measured zero. */
  measured: boolean;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Bits per channel for the modal-colour histogram: 5 → 32³ = 32,768 bins.
 * Enough to separate a page background from anything drawn on it, small enough
 * that the table is one allocation.
 */
const MODAL_HISTOGRAM_BITS = 5;

/**
 * Pixels either the modal-colour pass or the band's ink pass may read, per side.
 *
 * The comparison loop above is already O(overlap); a full-page capture is
 * 1440x20000, and reading the band and its reference background exhaustively
 * would multiply the cost of every unequal-sized pair by four. The AREA of the
 * band is exact arithmetic and never sampled — it is the quantity that says how
 * much was dropped. Only the INK RATIO is sampled, which is what a ratio is for,
 * and the stride is reported so a reader knows the density it was read at.
 */
const BAND_SAMPLE_BUDGET = 250_000;

/** One in every `stride` pixels on each axis, so `area / stride²` ≤ the budget. */
function strideFor(area: number): number {
  if (area <= BAND_SAMPLE_BUDGET) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(area / BAND_SAMPLE_BUDGET)));
}

/**
 * The MEAN colour of the most populated bin over one image's COMPARED canvas —
 * the page background, as that image itself draws it.
 *
 * The bin's mean and not its centre: a background of rgb(246,247,249) lands in
 * a bin whose centre is several units away, and comparing every pixel against a
 * colour the image does not actually contain would report the background itself
 * as ink.
 *
 * Returns null when nothing could be sampled.
 */
function modalColourOf(
  image: DecodedImage,
  width: number,
  height: number,
  stride: number,
): [number, number, number] | null {
  if (width <= 0 || height <= 0) return null;
  const shift = 8 - MODAL_HISTOGRAM_BITS;
  const counts = new Int32Array(1 << (3 * MODAL_HISTOGRAM_BITS));
  const binOf = (r: number, g: number, b: number): number =>
    ((r >> shift) << (2 * MODAL_HISTOGRAM_BITS)) | ((g >> shift) << MODAL_HISTOGRAM_BITS) | (b >> shift);
  for (let y = 0; y < height; y += stride) {
    const row = y * image.width * 4;
    for (let x = 0; x < width; x += stride) {
      const i = row + x * 4;
      const alpha = image.data[i + 3]!;
      counts[
        binOf(
          overWhite(image.data[i]!, alpha),
          overWhite(image.data[i + 1]!, alpha),
          overWhite(image.data[i + 2]!, alpha),
        )
      ]!++;
    }
  }
  let modal = -1;
  let best = -1;
  for (let bin = 0; bin < counts.length; bin++) {
    if (counts[bin]! > best) {
      best = counts[bin]!;
      modal = bin;
    }
  }
  if (modal < 0 || best <= 0) return null;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = 0; y < height; y += stride) {
    const row = y * image.width * 4;
    for (let x = 0; x < width; x += stride) {
      const i = row + x * 4;
      const alpha = image.data[i + 3]!;
      const r = overWhite(image.data[i]!, alpha);
      const g = overWhite(image.data[i + 1]!, alpha);
      const b = overWhite(image.data[i + 2]!, alpha);
      if (binOf(r, g, b) !== modal) continue;
      sr += r;
      sg += g;
      sb += b;
      n++;
    }
  }
  if (n === 0) return null;
  return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
}

/**
 * Pixels in one axis-aligned rectangle of one image, and how many of them sit
 * further than the ΔE*76 JND from that image's modal colour. The rectangle is
 * always OUTSIDE the compared canvas, so this never re-reads a pixel the
 * comparison already saw.
 */
function bandInk(
  image: DecodedImage,
  modal: [number, number, number] | null,
  stride: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { pixels: number; sampled: number; ink: number } {
  const left = Math.max(0, x0);
  const right = Math.min(image.width, x1);
  const top = Math.max(0, y0);
  const bottom = Math.min(image.height, y1);
  if (right <= left || bottom <= top) return { pixels: 0, sampled: 0, ink: 0 };
  const modalLab = modal === null ? null : srgbToLab(modal[0], modal[1], modal[2]);
  // The AREA is exact arithmetic; only the ink is sampled.
  const pixels = (right - left) * (bottom - top);
  let sampled = 0;
  let ink = 0;
  for (let y = top; y < bottom; y += stride) {
    const row = y * image.width * 4;
    for (let x = left; x < right; x += stride) {
      sampled++;
      if (modalLab === null) continue;
      const i = row + x * 4;
      const alpha = image.data[i + 3]!;
      const r = overWhite(image.data[i]!, alpha);
      const g = overWhite(image.data[i + 1]!, alpha);
      const b = overWhite(image.data[i + 2]!, alpha);
      if (deltaE76(srgbToLab(r, g, b), modalLab) > DELTA_E76_JND_THRESHOLD) ink++;
    }
  }
  return { pixels, sampled, ink };
}

/**
 * The band, for ONE side: the right-hand strip past `overlapWidth` over the
 * full image height, plus the bottom strip past `overlapHeight` over the
 * compared width. The two are disjoint by construction, so their pixels add.
 */
function sideBand(
  image: DecodedImage,
  overlapWidth: number,
  overlapHeight: number,
): { pixels: number; sampled: number; ink: number; measured: boolean } {
  if (image.width <= overlapWidth && image.height <= overlapHeight) {
    return { pixels: 0, sampled: 0, ink: 0, measured: true };
  }
  const modalStride = strideFor(overlapWidth * overlapHeight);
  const modal = modalColourOf(image, overlapWidth, overlapHeight, modalStride);
  const bandArea =
    Math.max(0, image.width - overlapWidth) * image.height +
    overlapWidth * Math.max(0, image.height - overlapHeight);
  const stride = strideFor(bandArea);
  const right = bandInk(image, modal, stride, overlapWidth, image.width, 0, image.height);
  const bottom = bandInk(image, modal, stride, 0, overlapWidth, overlapHeight, image.height);
  return {
    pixels: right.pixels + bottom.pixels,
    sampled: right.sampled + bottom.sampled,
    ink: right.ink + bottom.ink,
    measured: modal !== null,
  };
}

/** Compare two decoded images over their overlapping area. Never resizes. */
export function compareImages(a: DecodedImage, b: DecodedImage): ImageComparison {
  const overlapWidth = Math.min(a.width, b.width);
  const overlapHeight = Math.min(a.height, b.height);
  const overlapPixels = overlapWidth * overlapHeight;

  let changedPixels = 0;
  let changedPixelsAt16 = 0;
  let totalDelta = 0;
  let totalMaxChannelDelta = 0;
  let maxChannelDelta = 0;
  let totalDeltaE76 = 0;
  let maxDeltaE76 = 0;
  let aboveJnd = 0;
  let aboveVisible = 0;

  for (let y = 0; y < overlapHeight; y++) {
    const rowA = y * a.width * 4;
    const rowB = y * b.width * 4;
    for (let x = 0; x < overlapWidth; x++) {
      const ia = rowA + x * 4;
      const ib = rowB + x * 4;
      const alphaA = a.data[ia + 3]!;
      const alphaB = b.data[ib + 3]!;
      const ra = overWhite(a.data[ia]!, alphaA);
      const ga = overWhite(a.data[ia + 1]!, alphaA);
      const ba = overWhite(a.data[ia + 2]!, alphaA);
      const rb = overWhite(b.data[ib]!, alphaB);
      const gb = overWhite(b.data[ib + 1]!, alphaB);
      const bb = overWhite(b.data[ib + 2]!, alphaB);
      const dr = Math.abs(ra - rb);
      const dg = Math.abs(ga - gb);
      const db = Math.abs(ba - bb);
      if (dr !== 0 || dg !== 0 || db !== 0) changedPixels++;
      totalDelta += (dr + dg + db) / 3;
      const pixelMax = dr > dg ? (dr > db ? dr : db) : dg > db ? dg : db;
      totalMaxChannelDelta += pixelMax;
      if (pixelMax >= CHANGED_PIXEL_AMPLITUDE_THRESHOLD) changedPixelsAt16++;
      if (pixelMax > maxChannelDelta) maxChannelDelta = pixelMax;
      // Identical pixels are ΔE76 = 0 by construction, and they are the vast
      // majority of a full-page screenshot — skipping the conversion there is
      // what keeps this loop affordable on a 1440×20000 page.
      if (pixelMax !== 0) {
        const distance = deltaE76(srgbToLab(ra, ga, ba), srgbToLab(rb, gb, bb));
        totalDeltaE76 += distance;
        if (distance > maxDeltaE76) maxDeltaE76 = distance;
        if (distance > DELTA_E76_JND_THRESHOLD) aboveJnd++;
        if (distance > DELTA_E76_VISIBLE_THRESHOLD) aboveVisible++;
      }
    }
  }

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const largest = Math.max(areaA, areaB);

  // TASK 28.8 FAST change 3 — what the crop above left out, measured rather than
  // dropped in silence.
  const bandA = sideBand(a, overlapWidth, overlapHeight);
  const bandB = sideBand(b, overlapWidth, overlapHeight);
  const bandPixels = bandA.pixels + bandB.pixels;
  const bandSampled = bandA.sampled + bandB.sampled;
  const bandInkPixels = bandA.ink + bandB.ink;

  return {
    aWidth: a.width,
    aHeight: a.height,
    bWidth: b.width,
    bHeight: b.height,
    widthDelta: b.width - a.width,
    heightDelta: b.height - a.height,
    overlapPixels,
    changedPixels,
    changedPixelRatio: overlapPixels === 0 ? 0 : round4(changedPixels / overlapPixels),
    commonAreaRatio: largest === 0 ? 0 : round4(overlapPixels / largest),
    meanAbsoluteRgbDelta: overlapPixels === 0 ? 0 : round4(totalDelta / overlapPixels),
    maxChannelDelta,
    changedPixelsAt16,
    changedRatioAt16: overlapPixels === 0 ? 0 : round4(changedPixelsAt16 / overlapPixels),
    meanMaxChannelDelta:
      overlapPixels === 0 ? 0 : round4(totalMaxChannelDelta / overlapPixels),
    deltaE76Mean: overlapPixels === 0 ? 0 : round4(totalDeltaE76 / overlapPixels),
    deltaE76Max: round4(maxDeltaE76),
    deltaE76AboveJndPixels: aboveJnd,
    deltaE76AboveJndRatio: overlapPixels === 0 ? 0 : round4(aboveJnd / overlapPixels),
    deltaE76AboveVisiblePixels: aboveVisible,
    deltaE76AboveVisibleRatio:
      overlapPixels === 0 ? 0 : round4(aboveVisible / overlapPixels),
    uncompared: {
      widthPx: Math.abs(a.width - b.width),
      heightPx: Math.abs(a.height - b.height),
      aPixels: bandA.pixels,
      bPixels: bandB.pixels,
      pixels: bandPixels,
      sampledPixels: bandSampled,
      aInkSampled: bandA.ink,
      bInkSampled: bandB.ink,
      inkPixels: bandInkPixels,
      inkRatio: bandSampled === 0 ? 0 : round4(bandInkPixels / bandSampled),
      measured: bandA.measured && bandB.measured,
    },
  };
}

/**
 * A diff image over the overlapping area: the `a` side desaturated to a light
 * grey, changed pixels painted opaque red.
 *
 * Written by hand rather than taken from a library so the output is a pure
 * function of the two inputs with no threshold, no antialiasing pass and no
 * version-dependent behavior — the same property every other artifact in this
 * pipeline has.
 */
export function renderDiffImage(a: DecodedImage, b: DecodedImage): DecodedImage {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const io = (y * width + x) * 4;
      const alphaA = a.data[ia + 3]!;
      const alphaB = b.data[ib + 3]!;
      const ra = overWhite(a.data[ia]!, alphaA);
      const ga = overWhite(a.data[ia + 1]!, alphaA);
      const ba = overWhite(a.data[ia + 2]!, alphaA);
      const rb = overWhite(b.data[ib]!, alphaB);
      const gb = overWhite(b.data[ib + 1]!, alphaB);
      const bb = overWhite(b.data[ib + 2]!, alphaB);
      if (ra !== rb || ga !== gb || ba !== bb) {
        out[io] = 255;
        out[io + 1] = 32;
        out[io + 2] = 32;
      } else {
        const grey = Math.round(255 - (255 - (ra * 0.299 + ga * 0.587 + ba * 0.114)) * 0.25);
        out[io] = grey;
        out[io + 1] = grey;
        out[io + 2] = grey;
      }
      out[io + 3] = 255;
    }
  }
  return { width, height, data: out };
}

export type ScreenshotPair = ScreenshotMetric["pair"];

export interface MeasurePairInput {
  pair: ScreenshotPair;
  a?: Buffer;
  b?: Buffer;
  aLabel: string;
  bLabel: string;
  /*
   * Task 28.6 C5. Optional so the pure-function tests that only care about
   * pixels can keep calling this with two buffers, but supplied by the real QA
   * for every pair, because a pair measured over a truncated side must not
   * present its numbers as a whole-page result.
   */
  aCoverage?: ScreenshotCoverage;
  bCoverage?: ScreenshotCoverage;
}

/**
 * The coverage fields for one pair (Task 28.6, C5).
 *
 * `coveredFraction` is the MINIMUM of the two sides, not the average and not
 * either side alone: a pair can only speak for the part of the document BOTH
 * sides contain, so the weaker side is the honest denominator.
 *
 * A PAIR HAS TWO SIDES, ALWAYS. The first version took the minimum over
 * whichever records it was handed, so a pair with one side missing reported the
 * KNOWN side's coverage as the pair's — measured: `pairCoverage(fullyCovered,
 * undefined)` returned `coveredFraction: 1, coverageTruncated: false`, which is
 * the function's own documented rule inverted, and the same shape the rest of
 * this Task exists to remove (absence must never render as full coverage). The
 * same hole let a pair containing an UNMEASURABLE-document record report
 * `coveredFraction: 0` with `coverageTruncated: false` — a record that
 * contradicts itself.
 *
 * So a side counts toward the fraction only when it is present AND its document
 * was measured. Any side that is neither is counted in `coverageUnknownSides`,
 * the fraction becomes `undefined` (unknown, not 0 and not 1), and
 * `coverageTruncated` is true because the pair demonstrably did not inspect the
 * whole page.
 *
 * Both sides absent is the one case that still returns `{}`: nothing was
 * measured at all, which is a pre-28.6 artifact or a pure-pixel unit test, and
 * absence of every field is how that reads.
 */
export function pairCoverage(
  aCoverage?: ScreenshotCoverage,
  bCoverage?: ScreenshotCoverage,
): {
  coveredFraction?: number;
  coverageTruncated?: boolean;
  truncatedSides?: ScreenshotSide[];
  coverageUnknownSides?: number;
} {
  const provided = [aCoverage, bCoverage].filter(
    (value): value is ScreenshotCoverage => value !== undefined,
  );
  if (provided.length === 0) return {};
  const known = provided.filter((side) => side.documentMeasured);
  // Two sides in a pair; anything not present-and-measured is an unknown side.
  const coverageUnknownSides = 2 - known.length;
  const truncatedSides = provided
    .filter((side) => side.truncated || !side.captured)
    .map((side) => side.side)
    .sort();
  return {
    ...(coverageUnknownSides === 0
      ? { coveredFraction: Math.min(...known.map((side) => side.coveredFraction)) }
      : {}),
    coverageTruncated: truncatedSides.length > 0 || coverageUnknownSides > 0,
    truncatedSides,
    coverageUnknownSides,
  };
}

/** Measure one pair, returning an `available: false` record when a side is missing. */
export function measurePair(input: MeasurePairInput): {
  metric: ScreenshotMetric;
  decoded?: { a: DecodedImage; b: DecodedImage };
} {
  const coverage = pairCoverage(input.aCoverage, input.bCoverage);
  if (!input.a || !input.b) {
    const missing = !input.a ? input.aLabel : input.bLabel;
    return {
      metric: {
        pair: input.pair,
        available: false,
        unavailableReason: `${missing} screenshot unavailable`,
        ...coverage,
      },
    };
  }
  let a: DecodedImage;
  let b: DecodedImage;
  try {
    a = decodePng(input.a);
    b = decodePng(input.b);
  } catch (err) {
    return {
      metric: {
        pair: input.pair,
        available: false,
        unavailableReason: `png decode failed: ${err instanceof Error ? err.message : String(err)}`,
        ...coverage,
      },
    };
  }
  const comparison = compareImages(a, b);
  return {
    metric: {
      pair: input.pair,
      available: true,
      aWidth: comparison.aWidth,
      aHeight: comparison.aHeight,
      bWidth: comparison.bWidth,
      bHeight: comparison.bHeight,
      widthDelta: comparison.widthDelta,
      heightDelta: comparison.heightDelta,
      meanAbsoluteRgbDelta: comparison.meanAbsoluteRgbDelta,
      maxChannelDelta: comparison.maxChannelDelta,
      changedPixelRatio: comparison.changedPixelRatio,
      commonAreaRatio: comparison.commonAreaRatio,
      overlapPixels: comparison.overlapPixels,
      changedPixels: comparison.changedPixels,
      // Task 28.5B change 6 — reported together, never reduced to one number.
      changedPixelsAt16: comparison.changedPixelsAt16,
      changedRatioAt16: comparison.changedRatioAt16,
      meanMaxChannelDelta: comparison.meanMaxChannelDelta,
      deltaE76Mean: comparison.deltaE76Mean,
      deltaE76Max: comparison.deltaE76Max,
      deltaE76AboveJndPixels: comparison.deltaE76AboveJndPixels,
      deltaE76AboveJndRatio: comparison.deltaE76AboveJndRatio,
      deltaE76AboveVisiblePixels: comparison.deltaE76AboveVisiblePixels,
      deltaE76AboveVisibleRatio: comparison.deltaE76AboveVisibleRatio,
      // Task 28.8 FAST change 3 — the canvas the min-crop left out, printed beside
      // the numbers that were computed without it.
      uncomparedWidthPx: comparison.uncompared.widthPx,
      uncomparedHeightPx: comparison.uncompared.heightPx,
      uncomparedPixels: comparison.uncompared.pixels,
      uncomparedSampledPixels: comparison.uncompared.sampledPixels,
      uncomparedInkPixels: comparison.uncompared.inkPixels,
      uncomparedInkRatio: comparison.uncompared.inkRatio,
      uncomparedMeasured: comparison.uncompared.measured,
      // Task 28.6 C5 — printed beside the pixel numbers, never instead of them.
      ...coverage,
    },
    decoded: { a, b },
  };
}
