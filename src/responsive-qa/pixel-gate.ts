import {
  DELTA_E76_JND_THRESHOLD,
  DELTA_E76_VISIBLE_THRESHOLD,
  srgbToLab,
  type DecodedImage,
} from "../reconstruction-qa/screenshot-diff.js";
import {
  PIXEL_GATE_RADIUS_PX,
  TEXT_EDGE_LUMINANCE_RANGE,
  type PixelGateChannels,
} from "./types.js";

/**
 * The displacement-tolerant pixel gate (Task 28.6, item C3.1).
 *
 * THE PROBLEM THIS SOLVES, IN THE HARNESS'S OWN NUMBERS. The 28.6 evidence run
 * read `deltaE76AboveJndRatio` 0.0172 on linear.app/pricing @1440 — a pair on
 * which every other channel was silent. With a MINOR band at 0.01 that pair
 * could not be anything but MINOR, and neither could any other real page, so
 * PASS was unreachable and the clean end of the scale said nothing.
 *
 * The reflex fix — raise the threshold until the number behaves — hides real
 * defects, and on that very pair there ARE real defects inside the 1.72 %: the
 * clone renders body text in a heavier face than the source, drops the `US`
 * currency prefix from `US$10`, and paints the secondary price line white where
 * the source paints it grey. None of those is visible to any other pixel
 * channel.
 *
 * BE PRECISE ABOUT WHAT THE THRESHOLD IS HOLDING (item C3.12). Of those three,
 * exactly ONE is large enough to cross a 1 % area threshold on its own: the
 * typeface, because it touches every glyph on the page. The dropped `US` prefix
 * and the mis-coloured price line together occupy 8,075 residual pixels =
 * 0.088 % of that page, 11.3x UNDER the band. A clone that fixed only the
 * typeface would read PASS on this pair while still dropping the currency
 * prefix. The area-normalised ratio is therefore reported beside an
 * INK-normalised one (`residualOverInkRatio`), because on this page the entire
 * document erased to its own background colour is only 0.0284 of the area — so
 * "1 % of the page" is 35 % of everything the page draws.
 *
 * So the channel is SPLIT instead, along a line that means something physically:
 *
 *   Is the colour that changed PRESENT NEARBY IN THE OTHER IMAGE?
 *
 * For every pixel whose plain ΔE*76 exceeds the JND threshold, the gate takes
 * the two-sided minimum over a ±`PIXEL_GATE_RADIUS_PX` window —
 *
 *     gated(p) = max( min_q ΔE(A[p], B[q]) , min_q ΔE(A[q], B[p]) )
 *
 * — which is a one-pixel Hausdorff distance between the two colour fields. It
 * is deliberately TWO-sided: a one-sided minimum would let the clone paint an
 * extra glyph stroke into a background region and score zero, because the
 * background colour it replaced is still all around it.
 *
 * A pixel whose gated distance falls back under the JND threshold is
 * SUB-PIXEL: the same colour is there, one pixel over. Antialiasing, hinting, a
 * half-pixel baseline, a resampled image edge. It is counted and reported and
 * can never raise severity.
 *
 * A pixel whose gated distance survives is RESIDUAL: within a pixel in every
 * direction, that colour is simply not in the other image. That is the number
 * the rubric reads.
 *
 * MEASURED SEPARATION (baseline PNGs, run 2026-09-02T07-41-19-985Z): the gate
 * removes 12.3 % of the above-JND pixels on linear.app/pricing @1440 and 4.6 %
 * on linear.app/ @1440. The floor on that pricing pair is therefore NOT
 * antialiasing — it survives the gate, and it survives it because the typeface
 * really is different. The gate's value is that it now SAYS so instead of
 * leaving a reader to guess what the 1.72 % was made of.
 *
 * WHAT THE GATE CANNOT DO. It is blind, by construction, to any difference
 * whose whole extent is one pixel. That is the stated price of the instrument
 * and the reason `deltaE76AboveJndRatio` is still recorded in full beside it.
 *
 * THE MIN-CROP, AND WHY IT IS NO LONGER SILENT (Task 28.75, item L3).
 * ---------------------------------------------------------------------------
 * The comparison runs on `min(widths) x min(heights)`, anchored top-left. That
 * is unavoidable — two images of different sizes have no other common canvas
 * that does not resize one of them, and resizing would delete the very finding
 * a size difference IS. What was not defensible is that the remainder was then
 * dropped without a word. On a horizontally overflowing page the remainder is
 * precisely the offscreen band the frozen-width defect produces, so the region
 * under investigation was the one region guaranteed to be excluded from the
 * pixel evidence. Real magnitudes from the corpus:
 *
 *     linear.app / @700                    source  700 px | clone  862 px
 *     gs.severance.healthcare /gs @1100    source 1280 px | clone 1100 px
 *     interiorbay.co.kr / @390             source 1525 px | clone  390 px
 *                                          (commonAreaRatio 0.2259)
 *
 * So the crop stays and the BAND IS MEASURED: both actual capture sizes, both
 * strips' areas, and — the quantity that decides whether the omission matters —
 * both strips' INK, using each side's own modal colour. `classify.ts` grades
 * the horizontal strip's ink in `pixel-uncompared-band-ink-ratio`; the vertical
 * strip is recorded and left to the scroll-height channels.
 */

export interface PixelGateOptions {
  radiusPx?: number;
  textEdgeLuminanceRange?: number;
}

/** sRGB relative luminance in 0–255, used only for the edge attribution. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite one RGBA sample over white — the same rule `compareImages` uses,
 *  so the two agree pixel for pixel on what colour is being compared. */
function overWhite(value: number, alpha: number): number {
  return alpha === 255 ? value : Math.round(value * (alpha / 255) + 255 * (1 - alpha / 255));
}

/**
 * Six places, not four (item C3.12).
 *
 * At four places anything under 0.005 % of the overlap read as EXACTLY 0.0000 —
 * up to ~534 residual pixels at 1100 px width, ~458 at 1440 — and a rounded
 * zero was published as if it were a measured zero. Six places pushes that
 * floor under ten pixels, and `residualRatioRoundedToZero` names the case where
 * even six is not enough.
 */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * A packed-RGB → L*a*b* memo.
 *
 * A full-page screenshot uses a few thousand distinct colours out of the 16.7 M
 * possible, so memoising the conversion turns the gate's inner loop into
 * arithmetic on a small palette. Nothing image-sized is allocated: the gate
 * must be able to run on a 1440×20000 page beside a browser and a Next server.
 */
class LabPalette {
  private readonly index = new Map<number, number>();
  private l: number[] = [];
  private a: number[] = [];
  private b: number[] = [];

  slot(r: number, g: number, bl: number): number {
    const key = (r << 16) | (g << 8) | bl;
    const found = this.index.get(key);
    if (found !== undefined) return found;
    const [ll, aa, bb] = srgbToLab(r, g, bl);
    const slot = this.l.length;
    this.l.push(ll);
    this.a.push(aa);
    this.b.push(bb);
    this.index.set(key, slot);
    return slot;
  }

  distance(p: number, q: number): number {
    const dl = this.l[p]! - this.l[q]!;
    const da = this.a[p]! - this.a[q]!;
    const db = this.b[p]! - this.b[q]!;
    return Math.sqrt(dl * dl + da * da + db * db);
  }
}

/** One image's composited RGB read, kept as a closure over its own stride. */
function reader(image: DecodedImage): (x: number, y: number) => [number, number, number] {
  const { width, data } = image;
  return (x, y) => {
    const i = (y * width + x) * 4;
    const alpha = data[i + 3]!;
    return [
      overWhite(data[i]!, alpha),
      overWhite(data[i + 1]!, alpha),
      overWhite(data[i + 2]!, alpha),
    ];
  };
}

/**
 * Split the above-JND difference between two screenshots into its sub-pixel and
 * residual parts, over the top-left-anchored overlap the raw channels use.
 */
export function gatePixels(
  source: DecodedImage,
  clone: DecodedImage,
  options: PixelGateOptions = {},
): PixelGateChannels {
  const radius = options.radiusPx ?? PIXEL_GATE_RADIUS_PX;
  const edgeRange = options.textEdgeLuminanceRange ?? TEXT_EDGE_LUMINANCE_RANGE;
  // ITEM L3. The crop is the common canvas and it is REPORTED, not assumed:
  // every field below that names a "band" describes what this crop removes.
  const width = Math.min(source.width, clone.width);
  const height = Math.min(source.height, clone.height);
  const overlapPixels = width * height;

  const palette = new LabPalette();
  const readSource = reader(source);
  const readClone = reader(clone);

  // -- ink calibration (item C3.12) -----------------------------------------
  //
  // Every ratio this function returns is normalised by the TOTAL overlap area,
  // and a web page is mostly background: on linear.app/pricing @1440 the whole
  // document erased to its own background colour moves only 2.84 % of the area.
  // A 1 % area threshold is therefore 35 % of everything drawn, and a
  // full-width 1440x400 band of erased content reads 0.32 % and is silent. The
  // fix is not to move the threshold — it is to publish what the threshold is
  // worth, so INK is measured here and every residual is reported against it as
  // well as against the area.
  //
  // "Ink" = an overlap pixel whose SOURCE colour is further than the JND from
  // the source's own MODAL colour. The modal colour is the background by
  // definition of a page; ties go to the lowest palette slot, and palette slots
  // are assigned in raster order, so this is deterministic.
  const sourceSlotCounts: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = readSource(x, y);
      const slot = palette.slot(r, g, b);
      sourceSlotCounts[slot] = (sourceSlotCounts[slot] ?? 0) + 1;
    }
  }
  let modalSlot = -1;
  let modalCount = -1;
  for (let slot = 0; slot < sourceSlotCounts.length; slot++) {
    const count = sourceSlotCounts[slot] ?? 0;
    if (count > modalCount) {
      modalCount = count;
      modalSlot = slot;
    }
  }
  let sourceInkPixels = 0;
  if (modalSlot >= 0) {
    for (let slot = 0; slot < sourceSlotCounts.length; slot++) {
      const count = sourceSlotCounts[slot] ?? 0;
      if (count === 0) continue;
      if (palette.distance(slot, modalSlot) > DELTA_E76_JND_THRESHOLD) {
        sourceInkPixels += count;
      }
    }
  }

  // -- ITEM L3: the uncompared band ----------------------------------------
  //
  // The clone's own modal colour, over the SAME compared canvas. It is derived
  // in a SEPARATE pass, after the source's modal is already resolved, on
  // purpose: the palette assigns slots in raster order and the modal tie-break
  // is "lowest slot wins", so interleaving the clone's colours into the first
  // pass could change which slot the source's modal is on. Every number this
  // function returned before this block is therefore bit-identical.
  const cloneSlotCounts: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = readClone(x, y);
      const slot = palette.slot(r, g, b);
      cloneSlotCounts[slot] = (cloneSlotCounts[slot] ?? 0) + 1;
    }
  }
  let cloneModalSlot = -1;
  let cloneModalCount = -1;
  for (let slot = 0; slot < cloneSlotCounts.length; slot++) {
    const count = cloneSlotCounts[slot] ?? 0;
    if (count > cloneModalCount) {
      cloneModalCount = count;
      cloneModalSlot = slot;
    }
  }

  // Ink inside one axis-aligned rectangle of ONE image, against that image's
  // own modal colour. The rectangle is always outside the compared canvas, so
  // this never re-reads a pixel the comparison already saw.
  const bandInk = (
    image: DecodedImage,
    read: (x: number, y: number) => [number, number, number],
    modal: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
  ): { pixels: number; ink: number } => {
    const left = Math.max(0, x0);
    const right = Math.min(image.width, x1);
    const top = Math.max(0, y0);
    const bottom = Math.min(image.height, y1);
    if (right <= left || bottom <= top) return { pixels: 0, ink: 0 };
    let pixels = 0;
    let ink = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        pixels++;
        if (modal < 0) continue;
        const [r, g, b] = read(x, y);
        if (palette.distance(palette.slot(r, g, b), modal) > DELTA_E76_JND_THRESHOLD) {
          ink++;
        }
      }
    }
    return { pixels, ink };
  };

  const sourceHorizontal = bandInk(
    source,
    readSource,
    modalSlot,
    width,
    source.width,
    0,
    source.height,
  );
  const cloneHorizontal = bandInk(
    clone,
    readClone,
    cloneModalSlot,
    width,
    clone.width,
    0,
    clone.height,
  );
  const sourceVertical = bandInk(
    source,
    readSource,
    modalSlot,
    0,
    width,
    height,
    source.height,
  );
  const cloneVertical = bandInk(
    clone,
    readClone,
    cloneModalSlot,
    0,
    width,
    height,
    clone.height,
  );

  // Palette slots for the current band of rows, so the neighbourhood search
  // reads array elements rather than re-deriving colours. The band is
  // (2 * radius + 1) rows tall and scrolls down the image, so the memory cost is
  // bounded by the image WIDTH, never by its height.
  const bandRows = 2 * radius + 1;
  const sourceBand = new Int32Array(bandRows * width).fill(-1);
  const cloneBand = new Int32Array(bandRows * width).fill(-1);
  const sourceLum = new Float32Array(bandRows * width);
  const bandRowIndex = new Int32Array(bandRows).fill(-1);

  // `y` never goes negative in this scan, so the slot is a plain modulo.
  const baseOf = (y: number): number => (y % bandRows) * width;
  const loadRow = (y: number): void => {
    const slot = y % bandRows;
    if (bandRowIndex[slot] === y) return;
    const base = slot * width;
    for (let x = 0; x < width; x++) {
      const [sr, sg, sb] = readSource(x, y);
      const [cr, cg, cb] = readClone(x, y);
      sourceBand[base + x] = palette.slot(sr, sg, sb);
      cloneBand[base + x] = palette.slot(cr, cg, cb);
      sourceLum[base + x] = luminance(sr, sg, sb);
    }
    bandRowIndex[slot] = y;
  };

  let aboveJnd = 0;
  let subpixel = 0;
  let residual = 0;
  let residualVisible = 0;
  let residualOnEdge = 0;

  for (let y = 0; y < height; y++) {
    // Keep the band [y - radius, y + radius] resident.
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < height) loadRow(yy);
    }
    const rowBase = baseOf(y);
    for (let x = 0; x < width; x++) {
      const sourceSlot = sourceBand[rowBase + x]!;
      const cloneSlot = cloneBand[rowBase + x]!;
      if (sourceSlot === cloneSlot) continue;
      const raw = palette.distance(sourceSlot, cloneSlot);
      if (raw <= DELTA_E76_JND_THRESHOLD) continue;
      aboveJnd++;

      let minSourceToClone = raw;
      let minCloneToSource = raw;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) {
        const nearBase = baseOf(yy);
        for (let xx = x0; xx <= x1; xx++) {
          const nearbyClone = cloneBand[nearBase + xx]!;
          if (nearbyClone === sourceSlot) {
            minSourceToClone = 0;
          } else {
            const d = palette.distance(sourceSlot, nearbyClone);
            if (d < minSourceToClone) minSourceToClone = d;
          }
          const nearbySource = sourceBand[nearBase + xx]!;
          if (nearbySource === cloneSlot) {
            minCloneToSource = 0;
          } else {
            const d = palette.distance(nearbySource, cloneSlot);
            if (d < minCloneToSource) minCloneToSource = d;
          }
        }
      }
      const gated = Math.max(minSourceToClone, minCloneToSource);
      if (gated <= DELTA_E76_JND_THRESHOLD) {
        subpixel++;
        continue;
      }
      residual++;
      if (gated > DELTA_E76_VISIBLE_THRESHOLD) residualVisible++;
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let yy = y0; yy <= y1; yy++) {
        const nearBase = baseOf(yy);
        for (let xx = x0; xx <= x1; xx++) {
          const value = sourceLum[nearBase + xx]!;
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        }
      }
      if (hi - lo > edgeRange) residualOnEdge++;
    }
  }

  const ratio = (count: number): number =>
    overlapPixels === 0 ? 0 : round6(count / overlapPixels);
  const inkRatio = (count: number): number =>
    sourceInkPixels === 0 ? 0 : round6(count / sourceInkPixels);

  return {
    radiusPx: radius,
    textEdgeLuminanceRange: edgeRange,
    overlapPixels,
    aboveJndPixels: aboveJnd,
    subpixelAboveJndPixels: subpixel,
    subpixelAboveJndRatio: ratio(subpixel),
    residualAboveJndPixels: residual,
    residualAboveJndRatio: ratio(residual),
    residualAboveVisiblePixels: residualVisible,
    residualAboveVisibleRatio: ratio(residualVisible),
    residualOnEdgePixels: residualOnEdge,
    residualOnFlatPixels: residual - residualOnEdge,
    residualEdgeFraction: residual === 0 ? 0 : round6(residualOnEdge / residual),
    sourceInkPixels,
    sourceInkRatio: ratio(sourceInkPixels),
    residualOverInkRatio: inkRatio(residual),
    subpixelOverInkRatio: inkRatio(subpixel),
    residualRatioRoundedToZero: residual > 0 && ratio(residual) === 0,
    // -- ITEM L3: what the crop removed, stated -----------------------------
    comparedWidth: width,
    comparedHeight: height,
    sourceImageWidth: source.width,
    sourceImageHeight: source.height,
    cloneImageWidth: clone.width,
    cloneImageHeight: clone.height,
    widthMismatchPx: Math.abs(source.width - clone.width),
    heightMismatchPx: Math.abs(source.height - clone.height),
    sourceHorizontalBandPixels: sourceHorizontal.pixels,
    cloneHorizontalBandPixels: cloneHorizontal.pixels,
    sourceVerticalBandPixels: sourceVertical.pixels,
    cloneVerticalBandPixels: cloneVertical.pixels,
    sourceHorizontalBandInkPixels: sourceHorizontal.ink,
    cloneHorizontalBandInkPixels: cloneHorizontal.ink,
    sourceVerticalBandInkPixels: sourceVertical.ink,
    cloneVerticalBandInkPixels: cloneVertical.ink,
    horizontalBandInkRatio: ratio(sourceHorizontal.ink + cloneHorizontal.ink),
    verticalBandInkRatio: ratio(sourceVertical.ink + cloneVertical.ink),
    comparedAreaRatio: (() => {
      const largest = Math.max(source.width * source.height, clone.width * clone.height);
      return largest === 0 ? 0 : round6(overlapPixels / largest);
    })(),
  };
}
