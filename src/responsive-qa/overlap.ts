import {
  DUPLICATE_IMAGE_LAYER_TOLERANCE_PX,
  type LeafBox,
  type OverlapPairKind,
  type OverlapSample,
} from "./types.js";

/**
 * Overlap accounting for one side, split three ways (WP-C, guard 3).
 *
 * WHY THIS IS ITS OWN MODULE, AND WHY IT IS PURE.
 * ----------------------------------------------
 * The sweep used to live inside `probeInBrowser`, serialized into the page. It
 * had to, when the only thing it produced was a single total. It does not have
 * to now, and keeping it there would have made the one judgement in this file
 * — "are these two boxes the same picture twice, or two different things piled
 * on top of each other?" — reachable only through a real browser against a real
 * fixture site.
 *
 * The probe already returns every leaf box across the CDP boundary; `leaves` is
 * the same array either way, so moving the sweep out changes no number, keeps
 * the two sides measured by literally the same code, and turns the judgement
 * into an ordinary function with an ordinary test. The probe goes back to being
 * what it should be: a DOM reader that computes nothing it does not have to.
 *
 * WHAT THE SPLIT IS FOR.
 * ----------------------
 * `overlap-excess-ratio` is a BLOCKER channel, and on a real page a large share
 * of its area is not a layout collapse at all:
 *
 *   - a `<picture>` renders a low-res placeholder and its full-res source in
 *     the same box, both visible to `getBoundingClientRect`;
 *   - a crossfade holds two layers of the same image for the length of a
 *     transition;
 *   - a video sits under its own poster.
 *
 * All three are ONE thing on screen. Counting them as a collision manufactures
 * blockers, and it does so in the direction that makes a clone look worse than
 * it is — which is just as dishonest as the other direction, because a reader
 * who learns the channel over-reports starts discounting it everywhere.
 *
 * The discriminant is NOT the key on its own. Two genuinely different repeated
 * components — the same card twice, the same icon in two slots — also share a
 * key, and a layout bug piling them on top of each other is exactly the defect
 * this channel exists to catch. What separates a duplicated LAYER from that bug
 * is that the two boxes are the SAME BOX: same left, same right, same top, same
 * bottom, within {@link DUPLICATE_IMAGE_LAYER_TOLERANCE_PX}. Both conditions are
 * required, and the demoted pairs are counted, never dropped.
 */

export interface OverlapOptions {
  /** Overlapping pairs listed as worst offenders. The TOTALS are summed over
   *  every pair regardless of this cap. */
  maxOverlapSamples: number;
  /** Hard cap on comparisons per leaf; keeps a pathological page from turning
   *  an O(n²) sweep into a hang. Recorded when it bites. */
  maxOverlapComparisonsPerLeaf: number;
  /** Viewport area denominator for the ratios. */
  innerWidth: number;
  innerHeight: number;
}

export interface OverlapAccounting {
  overlapArea: number;
  overlapAreaRatio: number;
  overlapPairCount: number;
  worstOverlaps: OverlapSample[];
  overlapComparisonsTruncated: boolean;
  trueOverlapArea: number;
  trueOverlapAreaRatio: number;
  trueOverlapPairCount: number;
  duplicateImageStackArea: number;
  duplicateImageStackAreaRatio: number;
  duplicateImageStackPairCount: number;
  failedImageLayerOverlapArea: number;
  failedImageLayerOverlapAreaRatio: number;
  failedImageLayerOverlapPairCount: number;
  loadedImageLeafCount: number;
  failedImageLeafCount: number;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Do these two boxes occupy the same rectangle, to within `tolerancePx` on
 * every edge?
 *
 * Every edge, not the area and not an intersection-over-union: two boxes of
 * equal area in different places, or one box containing another, are NOT the
 * same layer and must keep firing.
 */
export function sameBoxWithin(a: LeafBox, b: LeafBox, tolerancePx: number): boolean {
  return (
    Math.abs(a.left - b.left) <= tolerancePx &&
    Math.abs(a.right - b.right) <= tolerancePx &&
    Math.abs(a.top - b.top) <= tolerancePx &&
    Math.abs(a.bottom - b.bottom) <= tolerancePx
  );
}

/**
 * What an overlapping pair actually is. The single judgement of this module.
 *
 * ORDER MATTERS AND IS DELIBERATE — AND THE ORDER CHANGED IN 28.75 (item L1).
 * ---------------------------------------------------------------------------
 * It used to read:
 *
 *     if (a.loaded === false || b.loaded === false) return "failed-image-layer";
 *     …then the duplicate-layer test…
 *     …then true-overlap
 *
 * i.e. a single broken image asset, on EITHER leaf, decided the pair BEFORE any
 * geometry or ownership was consulted. The consequence was a false negative in
 * the one direction this rubric must never take: a genuine layout collapse —
 * two DIFFERENT visual owners landing on top of each other — was re-attributed
 * to `image-layer-state` (MAJOR-capable) and removed from `overlap-excess-ratio`
 * (BLOCKER-capable) purely because one of the two colliding things happened to
 * be an image whose asset did not decode. A broken image is the NORMAL early
 * failure mode of a fresh public site, so the guard fired hardest exactly where
 * the instrument is least able to afford a false negative.
 *
 * THE EVIDENCE COMES FIRST NOW. The only thing that makes an overlap "not a
 * collapse" is that the two boxes are ONE PICTURE DRAWN TWICE, and that is a
 * statement about ownership and geometry, not about a load flag:
 *
 *   1. same visual owner (or the same key) AND the same box on every edge to
 *      within {@link DUPLICATE_IMAGE_LAYER_TOLERANCE_PX}, both leaves images
 *      → ONE LAYER. Only such a pair can be demoted at all.
 *   2. within that population, a leaf whose asset did not decode makes the
 *      resource the fault that owns it → `failed-image-layer`, so one fault is
 *      still never reported under two names.
 *   3. everything else → `true-overlap`.
 *
 * WHY STEP 1 IS THE RIGHT GATE, STATED AS A FALSIFIABLE CLAIM. The demotion
 * asserts "these two boxes are one thing on screen, so their intersection is
 * not extra area". That assertion is self-evident for a `<picture>` under its
 * own `<img>`, a placeholder under its full-res source, or a crossfade holding
 * two layers of the same image — same owner, same rectangle. It is simply FALSE
 * for two different components in the same place, and a failed asset does not
 * make it true: whether a resource decoded is a fact about the network, whether
 * two different owners occupy one rectangle is a fact about layout, and the
 * second is not evidence about the first. A broken `<img>` keeps the box its
 * CSS gives it, so the collision it participates in is the same collision it
 * would have participated in had the bytes arrived.
 *
 * WHAT THE CHANGE COSTS. `failed-image-layer` is now a strictly narrower
 * population: it can only claim pairs that would otherwise have been
 * `duplicate-image-stack`. That is intended — it is the population where the
 * "counted twice" argument actually holds — and it is the reason the demoted
 * area is now itself graded, relative to the source, one channel down in
 * `classify.ts` (`overlap-demoted-excess-ratio`).
 */
export function classifyOverlapPair(
  a: LeafBox,
  b: LeafBox,
  tolerancePx: number = DUPLICATE_IMAGE_LAYER_TOLERANCE_PX,
): OverlapPairKind {
  // -- 1. GEOMETRY AND OWNERSHIP, BEFORE ANY LOAD STATE --------------------
  const sameVisualOwner =
    a.key === b.key ||
    (a.ownerKey !== undefined && a.ownerKey.length > 0 && a.ownerKey === b.ownerKey);
  const oneLayer =
    a.kind === "image" &&
    b.kind === "image" &&
    sameVisualOwner &&
    sameBoxWithin(a, b, tolerancePx);
  if (!oneLayer) return "true-overlap";
  // -- 2. within ONE LAYER, a failed asset is the fault that owns it -------
  if (a.loaded === false || b.loaded === false) return "failed-image-layer";
  return "duplicate-image-stack";
}

/**
 * The O(n·k) sweep, moved verbatim out of the in-page probe and then split.
 *
 * The traversal, the sort, the early `break` on `b.top >= a.bottom` and the
 * per-leaf comparison cap are unchanged, so the TOTAL this returns is the same
 * number the same page produced before the split existed. What is new is that
 * every counted pair is also attributed, and the three sub-totals add back up
 * to the total exactly.
 */
export function computeOverlapAccounting(
  leaves: readonly LeafBox[],
  options: OverlapOptions,
): OverlapAccounting {
  const sorted = leaves.slice().sort((a, b) => a.top - b.top || a.left - b.left);
  let overlapArea = 0;
  let overlapPairCount = 0;
  let overlapComparisonsTruncated = false;
  let trueOverlapArea = 0;
  let trueOverlapPairCount = 0;
  let duplicateImageStackArea = 0;
  let duplicateImageStackPairCount = 0;
  let failedImageLayerOverlapArea = 0;
  let failedImageLayerOverlapPairCount = 0;
  const overlapSamples: OverlapSample[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    let comparisons = 0;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.top >= a.bottom) break;
      comparisons++;
      if (comparisons > options.maxOverlapComparisonsPerLeaf) {
        overlapComparisonsTruncated = true;
        break;
      }
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (width <= 0) continue;
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (height <= 0) continue;
      const area = width * height;
      overlapArea += area;
      overlapPairCount++;
      const kind = classifyOverlapPair(a, b);
      if (kind === "duplicate-image-stack") {
        duplicateImageStackArea += area;
        duplicateImageStackPairCount++;
      } else if (kind === "failed-image-layer") {
        failedImageLayerOverlapArea += area;
        failedImageLayerOverlapPairCount++;
      } else {
        trueOverlapArea += area;
        trueOverlapPairCount++;
      }
      overlapSamples.push({ aKey: a.key, bKey: b.key, area, kind });
    }
  }
  overlapSamples.sort((x, y) => y.area - x.area || (x.aKey < y.aKey ? -1 : 1));

  let loadedImageLeafCount = 0;
  let failedImageLeafCount = 0;
  for (const leaf of leaves) {
    if (leaf.kind !== "image") continue;
    if (leaf.loaded === true) loadedImageLeafCount++;
    else if (leaf.loaded === false) failedImageLeafCount++;
  }

  const viewportArea = Math.max(1, options.innerWidth * options.innerHeight);
  return {
    overlapArea: Math.round(overlapArea),
    overlapAreaRatio: round4(overlapArea / viewportArea),
    overlapPairCount,
    worstOverlaps: overlapSamples.slice(0, options.maxOverlapSamples),
    overlapComparisonsTruncated,
    trueOverlapArea: Math.round(trueOverlapArea),
    trueOverlapAreaRatio: round4(trueOverlapArea / viewportArea),
    trueOverlapPairCount,
    duplicateImageStackArea: Math.round(duplicateImageStackArea),
    duplicateImageStackAreaRatio: round4(duplicateImageStackArea / viewportArea),
    duplicateImageStackPairCount,
    failedImageLayerOverlapArea: Math.round(failedImageLayerOverlapArea),
    failedImageLayerOverlapAreaRatio: round4(
      failedImageLayerOverlapArea / viewportArea,
    ),
    failedImageLayerOverlapPairCount,
    loadedImageLeafCount,
    failedImageLeafCount,
  };
}
