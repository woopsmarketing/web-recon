/**
 * Continuous Responsive QA (Responsive Core P0, stream QA — contract §C3).
 *
 * Acceptance is NOT "390 PASS / 1440 PASS". It is: the source and the clone
 * exhibit the same responsive BEHAVIOUR over every SOURCE-defined width
 * interval. Probe widths are sample points, never layout modes. Implements
 * docs/result/responsive-architecture-forensic-audit-2026-09-14.md §14.
 *
 * Everything here is generic: no host names, no source selectors, no site
 * constants. The only markup conventions read are the generator's own
 * (`.wr-variant[data-wr-viewport][data-wr-page]`, `[data-wr-node]`,
 * `/wr/generated-styles.css`).
 */

export const CONTINUOUS_QA_SCHEMA_VERSION = 1;

/** Default sweep range (CSS px, inclusive). */
export const DEFAULT_MIN_WIDTH = 390;
export const DEFAULT_MAX_WIDTH = 1920;
/** Extrapolation probes beyond the swept range. */
export const DEFAULT_EXTRAPOLATE: readonly number[] = [1921, 2560];
/** Fixed viewport height for both sides. */
export const VIEWPORT_HEIGHT = 1000;

/** Coarse in-place sweep step for boundary discovery. */
export const COARSE_STEP_PX = 10;
/** Fixed sampling grid step. */
export const GRID_STEP_PX = 40;
/** Seeded widths drawn per interval. */
export const SEEDED_PER_INTERVAL = 3;
/** Bisection budget per discontinuity (a 10px gap needs 4). */
export const MAX_BISECTION_STEPS = 10;
/** Extra wait before each reproducibility re-measurement (debounced reflows settle). */
export const REPRODUCE_EXTRA_SETTLE_MS = 350;

/** Discontinuity detector thresholds (audit §14 step 1). */
export const DISCONTINUITY_XW_PX = 8;
export const DISCONTINUITY_PAGE_H_PX = 24;
export const DISCONTINUITY_PAGE_H_RATIO = 0.05;
export const DISCONTINUITY_RENDERED_RATIO = 0.05;
export const DISCONTINUITY_RENDERED_MIN = 8;

/** G6: a clone discontinuity is explained by a source boundary within ±this. */
export const G6_EXPLAINED_WITHIN_PX = 2;

/** Tracked-node selection. */
export const MAX_TRACKED_PER_VARIANT = 220;
export const TRACK_BLOCK_MIN_WIDTH_RATIO = 0.25;
export const TRACK_BLOCK_MIN_HEIGHT_PX = 40;
export const TRACK_CTA_MIN_WIDTH_PX = 24;
export const TRACK_CTA_MIN_HEIGHT_PX = 16;
export const TRACK_MEDIA_MIN_AREA_PX2 = 4000;
export const TRACK_PARAGRAPH_MIN_CHARS = 40;

/** Signature corroboration. */
export const SIGNATURE_TEXT_CHARS = 40;
export const SIGNATURE_CLASS_JACCARD = 0.5;
/** Clone text probed against source page text for H8 (unmatched nodes). */
export const H8_TEXT_CHARS = 200;

/** Page-level variant vote: the rendered tree is decided by this margin. */
export const VARIANT_VOTE_MARGIN = 0.15;
export const VARIANT_VOTE_MIN_SHARE = 0.5;

/** Motion detection at the load width. */
export const MOTION_WAIT_MS = 600;
export const MOTION_TOLERANCE_PX = 1;

/** Settle after each resize: 2×rAF + this + fonts.ready. */
export const SETTLE_MS = 150;

/** Hard / relation check tolerances. */
export const H2_EXCESS_PX = 2;
export const H4_MIN_INTERSECTION_PX2 = 16;
export const H5_EXCESS_PX = 2;
export const EDGE_PX = 2;
export const FULL_BLEED_PX = 2;
export const CENTERED_PX = 2;
export const CENTERED_CLONE_RATIO = 0.01;
export const ASPECT_RATIO_TOLERANCE = 0.02;
export const COLUMN_BUCKET_PX = 4;
export const FLUID_MIN_SLOPE = 0.05;
export const FLUID_SLOPE_TOLERANCE = 0.05;

/**
 * Coverage floor (review B1). Per interval, compared node-samples (source AND
 * clone correspondence established, so every check could be evaluated) divided
 * by tracked node-samples of the served variant(s) in non-tree-mismatch samples
 * must be ≥ this, and compared must be > 0; otherwise the interval FAILs with
 * `insufficient-coverage`. An interval that looked at too few nodes proves
 * nothing and is never PASS.
 */
export const MIN_COMPARED_RATIO = 0.6;
/** STEP behaviour: source and clone step locations must agree within ±this (review m5). */
export const STEP_LOCATION_PX = 2;

/** Raw violations persisted per route (the histogram is never capped). */
export const MAX_RAW_VIOLATIONS = 2000;
export const WORST_NODES = 10;

/** Relation tolerance T = max(8px, 2%·W). */
export function relationTolerance(width: number): number {
  return Math.max(8, 0.02 * width);
}

/** CSS injected identically on both sides before any measurement. */
export const MOTION_FREEZE_CSS =
  "*,*::before,*::after{transition:none!important;animation-duration:0s!important;" +
  "animation-delay:0s!important;animation-play-state:paused!important;caret-color:transparent}";

/** Same skip set as the observer (src/observer/types.ts SKIP_TAGS). */
export { SKIP_TAGS } from "../../observer/types.js";

export type VariantId = "desktop" | "mobile";
export const VARIANT_IDS: readonly VariantId[] = ["desktop", "mobile"];

/** Tracked-node categories, in selection priority order a>b>c>e>d>f. */
export type TrackCategory = "a" | "b" | "c" | "d" | "e" | "f";
export const CATEGORY_PRIORITY: readonly TrackCategory[] = ["a", "b", "c", "e", "d", "f"];

export class ContinuousQaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContinuousQaInputError";
  }
}

// ---------------------------------------------------------------------------
// Correspondence references
// ---------------------------------------------------------------------------

/** Structural reference into the SOURCE document (resolved live per width). */
export interface SourceRef {
  /** Element-child index path from <body>, skipping SKIP_TAGS. */
  path: number[];
  tag: string;
  classes: string[];
  /** First SIGNATURE_TEXT_CHARS of descendant text, whitespace removed. */
  text: string;
  /** Element-child tag sequence; `null` when the observation did not descend. */
  childTags: string[] | null;
  /**
   * Signature of the element at every path prefix (anc[i] ↔ path[0..i]); the
   * last entry is the target itself. Optional: enables anchored re-resolution
   * (±1 sibling drift) when the strict path fails. Absent → strict only.
   */
  anc?: AncestorSig[];
  /**
   * Element-child count (SKIP_TAGS skipped) of the target's parent in the
   * observation. Optional: when the live parent has the same count, repeated
   * look-alike siblings around the recorded index cannot have shifted, so the
   * recorded index is trusted (M4 count guard). Absent → no guard.
   */
  sib?: number;
}

export interface AncestorSig {
  tag: string;
  /** Class tokens, capped at MAX_ANCESTOR_CLASS_TOKENS. */
  classes: string[];
  id?: string;
  /** Element-child count of this element's parent in the observation (M4 count guard). */
  n?: number;
}

/** Anchored re-resolution budget. */
export const MAX_ANCESTOR_CLASS_TOKENS = 6;
export const MAX_SIBLING_DRIFT_STEPS = 3;

export interface TrackedNode {
  /** `<variant>:<nodeId>` — stable across runs. */
  key: string;
  variant: VariantId;
  nodeId: string;
  tag: string;
  /** Primary category (highest priority) and every category it satisfies. */
  category: TrackCategory;
  categories: TrackCategory[];
  documentOrder: number;
  /** Source ref from THIS variant's observation; null when unresolvable. */
  primary: SourceRef | null;
  /** The OTHER variant's observation element at the same path (tree-mismatch probe). */
  alt: SourceRef | null;
  refSource: "dom-json" | "sitespec-tree" | "none";
  hasText: boolean;
  isMedia: boolean;
  truthBox: { x: number; y: number; width: number; height: number };
}

export interface TrackedVariant {
  variant: VariantId;
  truthWidth: number;
  nodes: TrackedNode[];
  candidates: number;
  capped: boolean;
  dedupedWrappers: number;
}

// ---------------------------------------------------------------------------
// In-page measurement shapes (kept terse: they cross the CDP boundary)
// ---------------------------------------------------------------------------

export interface InPageTarget {
  k: string;
  vp: VariantId;
  n: string;
  p: SourceRef | null;
  a: SourceRef | null;
  /** want line count / column count / media aspect / text for H8 */
  wl: boolean;
  wc: boolean;
  wm: boolean;
  wt: boolean;
}

export type MatchStatus = "matched" | "tree-mismatch" | "unmatched" | "ambiguous";

export interface NodeReading {
  k: string;
  st: MatchStatus;
  why?: string;
  v: 0 | 1;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Heavy fields (sample mode only). */
  pos?: string;
  flow?: 0 | 1;
  tx?: 0 | 1;
  md?: 0 | 1;
  lines?: number;
  cols?: number;
  ar?: number;
  fit?: string;
  mxw?: number | null;
  clip?: 0 | 1;
  h2?: number;
  h5?: number | null;
  dp?: number[];
  txt?: string;
}

export interface PageReading {
  vw: number;
  vh: number;
  sw: number;
  sh: number;
  rendered: number;
  /** Clone: variants whose wrapper is not display:none. */
  served: VariantId[];
  /** Source: which H8 probe texts were found in visible page text. */
  found?: boolean[];
  nodes: NodeReading[];
}

export interface MeasureArgs {
  mode: "source" | "clone";
  pageId: string;
  heavy: boolean;
  skipTags: string[];
  targets: InPageTarget[];
  findTexts: string[];
  cfg: {
    textChars: number;
    jaccard: number;
    columnBucket: number;
    h8Chars: number;
    /** Anchored re-resolution: max ±1 sibling drifts per path (0 disables). */
    maxDrift: number;
    /** MAX_ANCESTOR_CLASS_TOKENS, passed into the page. */
    ancClassCap: number;
  };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface SweepSample {
  width: number;
  reading: PageReading;
}

export type DiscontinuityReason =
  | "visibility"
  | "x"
  | "w"
  | "page-height"
  | "rendered-count"
  | "served-variant";

export interface Discontinuity {
  lo: number;
  hi: number;
  reasons: DiscontinuityReason[];
  /** Keys whose features triggered it (sorted, capped). */
  keys: string[];
}

export interface BisectedBoundary {
  /** First width of the new state (the 1px bracket's `hi`). */
  width: number;
  lo: number;
  hi: number;
  steps: number;
  converged: boolean;
  /** Bisection steps whose votes tied (tie → moved `hi`). */
  ties: number;
  /**
   * The 1px bracket REPRODUCES: fresh lo,hi,lo,hi re-measurement shows the jump
   * on ≥1 triggering feature, above within-width repeat noise.
   */
  confirmed: boolean;
  reproducedFeatures: number;
  noisyFeatures: number;
  reasons: DiscontinuityReason[];
  keys: string[];
}

export interface StylesheetScan {
  sheets: number;
  unreadableSheets: number;
  conditions: Array<{ kind: "media" | "container"; text: string }>;
}

export interface AuthoredBoundarySet {
  /** Boundary widths (first width of the high side), sorted, deduped. */
  media: number[];
  container: number[];
  fromSiteSpec: number[];
  fromLiveScan: number[];
  conditionsParsed: number;
  unsupportedConditions: number;
  nonScreenSkipped: number;
  unreadableSheets: number;
}

export interface Interval {
  /** Inclusive. */
  min: number;
  /** Exclusive. */
  max: number;
  extrapolated: boolean;
  sourceEvidence: {
    lower: BoundaryEvidence;
    upper: BoundaryEvidence;
  };
}

export interface BoundaryEvidence {
  width: number;
  kinds: Array<"range-edge" | "extrapolation-edge" | "authored-media" | "authored-container" | "observed">;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type CheckId =
  | "H1"
  | "H2"
  | "H3"
  | "H4"
  | "H5"
  | "H7"
  | "H7m"
  | "H8"
  | "R9"
  | "R10"
  | "R11"
  | "R12"
  | "R13"
  | "R14"
  | "R15"
  | "tree-mismatch"
  | "behavior-class"
  | "clone-only-discontinuity"
  | "insufficient-coverage";

export interface Violation {
  width: number;
  check: CheckId;
  key: string | null;
  source: number | string | null;
  clone: number | string | null;
  detail?: string;
  minor?: true;
}

export type WidthClass =
  | "FIXED"
  | "FULL_BLEED"
  | "FLUID"
  | "CAPPED"
  | "HIDDEN"
  | "STEP"
  | "MIXED";
export type AnchorClass = "CENTERED" | "LEFT" | "RIGHT" | "NONE";

export interface BehaviorFit {
  widthClass: WidthClass;
  anchor: AnchorClass;
  samples: number;
  /** FIXED: mean w; FLUID: slope a and intercept b at interval min; CAPPED: cap. */
  params: {
    w?: number;
    a?: number;
    b?: number;
    cap?: number;
    /** STEP: number of steps, first step bracket [stepFrom, stepAt], w (0 when hidden) before/after it. */
    stepCount?: number;
    stepFrom?: number;
    stepAt?: number;
    before?: number;
    after?: number;
    vBefore?: 0 | 1;
    vAfter?: 0 | 1;
  };
}
