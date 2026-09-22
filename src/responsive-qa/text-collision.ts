import {
  CRITICAL_REGION_MAX_VIEWPORT_HEIGHT_RATIO,
  CRITICAL_REGION_TAGS,
  MAX_TEXT_COLLISION_COMPARISONS_PER_LEAF,
  TEXT_COLLISION_MIN_INTERSECTION_RATIO,
  type LeafBox,
  type RegionBox,
} from "./types.js";

/**
 * TASK 28.8 FAST, ITEM 2 — text printed over text, counted where it matters.
 *
 * WHY THIS IS NOT `overlap-excess-ratio`. That channel is honest and it is
 * blind here by construction: it sums intersection AREA over the whole document
 * and divides by ONE VIEWPORT. Two collided line boxes are a few thousand px²;
 * a real page is tens of millions. The most widespread defect in the 28.8
 * corpus — CJK text overprinting the row beneath, 1 blocker and 4 majors across
 * two unrelated sites — cannot move that number and never did.
 *
 * WHY IT IS NOT A NEW SUBSYSTEM EITHER. Everything it needs already exists:
 * `overlap.ts` established that a pairwise sweep over `leaves` is an ordinary
 * pure function, and the region census already publishes the containers. This
 * module is that sweep, restricted two ways — to TEXT-vs-TEXT pairs, and to the
 * inside of one COMPACT CRITICAL REGION — so the result is a count of rows in a
 * block a reader is trying to read, not an area averaged over a page height.
 *
 * WHAT IT REFUSES TO DO. It identifies critical regions by TAG ALONE
 * ({@link CRITICAL_REGION_TAGS}) — generic HTML structure that means the same
 * thing on every site in every language. No hostname, no class name, no copy
 * matching. A rule tuned to the site that motivated it measures that site and
 * nothing else.
 */

/** One collided pair: two DIFFERENT text nodes with substantially intersecting
 *  glyph boxes, inside one critical region. */
export interface TextCollisionRow {
  regionPath: string;
  regionTag: string;
  aKey: string;
  bKey: string;
  /** Intersection area, px². */
  area: number;
  /** `area` over the SMALLER of the two boxes — how much of the smaller line is
   *  printed on. This, not the absolute area, is what "unreadable" means. */
  coverage: number;
  /** Top of the intersection, so a reader can find it in the composite. */
  top: number;
}

export interface TextCollisionAccounting {
  /** Regions that qualified as compact and critical. The denominator a reader
   *  needs: zero here means the page has no such block, not that it is clean. */
  criticalRegions: number;
  /** Collided PAIRS. The channel's raw quantity. */
  collidingRows: number;
  /** Distinct critical regions holding at least one collided pair. */
  collidingRegions: number;
  /** Worst offenders by coverage, largest first. */
  worst: TextCollisionRow[];
  /** The per-leaf comparison cap bit somewhere, so the count is a LOWER bound. */
  comparisonsTruncated: boolean;
}

export interface TextCollisionOptions {
  innerHeight: number;
  maxSamples: number;
}

/** Compact AND critical, by generic structure only. */
export function isCriticalRegion(region: RegionBox, innerHeight: number): boolean {
  if (!CRITICAL_REGION_TAGS.has(region.tag)) return false;
  const height = region.bottom - region.top;
  if (height <= 0) return false;
  return height <= innerHeight * CRITICAL_REGION_MAX_VIEWPORT_HEIGHT_RATIO;
}

/** A leaf's CENTRE inside the region — the same containment rule the region
 *  paint census uses, so a full-bleed rule crossing a footer is not "in" it. */
function centreInside(leaf: LeafBox, region: RegionBox): boolean {
  const cx = (leaf.left + leaf.right) / 2;
  const cy = (leaf.top + leaf.bottom) / 2;
  return (
    cx >= region.left && cx <= region.right && cy >= region.top && cy <= region.bottom
  );
}

/**
 * Do these two glyph boxes collide badly enough that a reader loses a word?
 *
 * Both must be TEXT, both must carry characters, and they must be DIFFERENT
 * nodes — a leaf never collides with itself, and two leaves sharing a key are
 * one node measured twice. The threshold is on the SMALLER box, because a short
 * label buried under a long line is exactly the seoultone 진료시간 failure and
 * an intersection-over-union would score it as small.
 */
export function textLeavesCollide(a: LeafBox, b: LeafBox): boolean {
  if (a.kind !== "text" || b.kind !== "text") return false;
  if (a.key === b.key) return false;
  if (a.chars <= 0 || b.chars <= 0) return false;
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  if (width <= 0) return false;
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (height <= 0) return false;
  const smaller = Math.min(
    Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top),
    Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top),
  );
  if (smaller <= 0) return false;
  return (width * height) / smaller >= TEXT_COLLISION_MIN_INTERSECTION_RATIO;
}

/** The sweep, per critical region. `leaves` and `regions` are one side's own. */
export function detectTextCollisions(
  regions: readonly RegionBox[],
  leaves: readonly LeafBox[],
  options: TextCollisionOptions,
): TextCollisionAccounting {
  const critical = regions.filter((region) =>
    isCriticalRegion(region, options.innerHeight),
  );
  const rows: TextCollisionRow[] = [];
  const collidingRegionPaths = new Set<string>();
  let comparisonsTruncated = false;

  for (const region of critical) {
    const inside = leaves
      .filter((leaf) => leaf.kind === "text" && centreInside(leaf, region))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    for (let i = 0; i < inside.length; i++) {
      const a = inside[i]!;
      let comparisons = 0;
      for (let j = i + 1; j < inside.length; j++) {
        const b = inside[j]!;
        if (b.top >= a.bottom) break;
        if (++comparisons > MAX_TEXT_COLLISION_COMPARISONS_PER_LEAF) {
          comparisonsTruncated = true;
          break;
        }
        if (!textLeavesCollide(a, b)) continue;
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const smaller = Math.min(
          (a.right - a.left) * (a.bottom - a.top),
          (b.right - b.left) * (b.bottom - b.top),
        );
        rows.push({
          regionPath: region.path,
          regionTag: region.tag,
          aKey: a.key,
          bKey: b.key,
          area: Math.round(width * height),
          coverage: Math.round(((width * height) / smaller) * 10_000) / 10_000,
          top: Math.round(Math.max(a.top, b.top)),
        });
        collidingRegionPaths.add(region.path);
      }
    }
  }
  rows.sort((x, y) => y.coverage - x.coverage || x.top - y.top);
  return {
    criticalRegions: critical.length,
    collidingRows: rows.length,
    collidingRegions: collidingRegionPaths.size,
    worst: rows.slice(0, options.maxSamples),
    comparisonsTruncated,
  };
}

/** One line per offender, for the channel note. */
export function describeTextCollisions(
  accounting: TextCollisionAccounting,
  limit = accounting.worst.length,
): string {
  if (accounting.worst.length === 0) return "none";
  return accounting.worst
    .slice(0, limit)
    .map(
      (row) =>
        `${row.regionTag} ${row.regionPath} at y=${row.top}: ${row.aKey} over ${row.bKey}, ${(row.coverage * 100).toFixed(0)}% of the smaller line box`,
    )
    .join("; ");
}
