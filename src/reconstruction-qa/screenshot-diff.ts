import { PNG } from "pngjs";
import type { ScreenshotMetric } from "./types.js";

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
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Compare two decoded images over their overlapping area. Never resizes. */
export function compareImages(a: DecodedImage, b: DecodedImage): ImageComparison {
  const overlapWidth = Math.min(a.width, b.width);
  const overlapHeight = Math.min(a.height, b.height);
  const overlapPixels = overlapWidth * overlapHeight;

  let changedPixels = 0;
  let totalDelta = 0;
  let maxChannelDelta = 0;

  for (let y = 0; y < overlapHeight; y++) {
    const rowA = y * a.width * 4;
    const rowB = y * b.width * 4;
    for (let x = 0; x < overlapWidth; x++) {
      const ia = rowA + x * 4;
      const ib = rowB + x * 4;
      const alphaA = a.data[ia + 3]!;
      const alphaB = b.data[ib + 3]!;
      const dr = Math.abs(overWhite(a.data[ia]!, alphaA) - overWhite(b.data[ib]!, alphaB));
      const dg = Math.abs(
        overWhite(a.data[ia + 1]!, alphaA) - overWhite(b.data[ib + 1]!, alphaB),
      );
      const db = Math.abs(
        overWhite(a.data[ia + 2]!, alphaA) - overWhite(b.data[ib + 2]!, alphaB),
      );
      if (dr !== 0 || dg !== 0 || db !== 0) changedPixels++;
      totalDelta += (dr + dg + db) / 3;
      if (dr > maxChannelDelta) maxChannelDelta = dr;
      if (dg > maxChannelDelta) maxChannelDelta = dg;
      if (db > maxChannelDelta) maxChannelDelta = db;
    }
  }

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const largest = Math.max(areaA, areaB);

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
}

/** Measure one pair, returning an `available: false` record when a side is missing. */
export function measurePair(input: MeasurePairInput): {
  metric: ScreenshotMetric;
  decoded?: { a: DecodedImage; b: DecodedImage };
} {
  if (!input.a || !input.b) {
    const missing = !input.a ? input.aLabel : input.bLabel;
    return {
      metric: {
        pair: input.pair,
        available: false,
        unavailableReason: `${missing} screenshot unavailable`,
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
    },
    decoded: { a, b },
  };
}
