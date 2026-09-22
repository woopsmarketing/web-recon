/**
 * Responsive declaration model — shared types (Responsive Core P0, contract §C2.2 / §C2.3).
 *
 * PURE: types only. No I/O, no clock, no browser.
 *
 * The node-side shapes below are STRUCTURAL views of the landed zod types
 * (REC-I2): `MatchedLayoutRule` (observer/types.ts, §C1.5 fields `sheetIndex` /
 * `ruleOrder` / `specificity` / `layerOrder` / `supportsMatches`), `InlineStyle`
 * and `InlineStyleProvenance` (§C1.2 / §C1.4, incl. `widthEvidence`), and
 * `ElementSpecNode` (sitespec/types.ts). They stay structural so this pure module
 * does not depend on zod; `ElementSpecNode` is assignable to
 * {@link ResponsiveDeclNode} and layout inference passes it directly, so the
 * compiler checks the correspondence on every build.
 *
 * NOTE: `layer` may be an observer PROVENANCE name such as `(anonymous-3)`. It
 * is never a valid CSS identifier and is only ever used as evidence text.
 */

/** `[min, max)` in CSS px. `max` may be `Infinity`. min inclusive, max exclusive. */
export interface Interval {
  readonly min: number;
  readonly max: number;
}

export type ViewportIdLike = "desktop" | "mobile";

export type DeclProvenance =
  | "authored-sheet"
  | "authored-inline"
  | "runtime-inline"
  | "measured"
  | "frozen";

export interface ResponsiveDeclCascade {
  important: boolean;
  layerOrder?: number;
  specificity?: [number, number, number];
  ruleOrder?: number;
  inline?: boolean;
}

/** Contract §C2.2 — one emitted value over one interval. */
export interface ResponsiveDecl {
  pageId: string;
  viewportId: ViewportIdLike;
  nodeId: string;
  property: string;
  value: string;
  interval: Interval;
  sourceCondition?: string;
  provenance: DeclProvenance;
  cascade?: ResponsiveDeclCascade;
  /** Widths at which verification passed (filled by verification, never here). */
  verifiedAt: number[];
}

// ---------------------------------------------------------------------------
// Node-side evidence (local mirrors of contract §C1.2 / §C1.4 / §C1.5)
// ---------------------------------------------------------------------------

/** One matched authored declaration (MatchedLayoutRule + §C1.5 cascade fields). */
export interface AuthoredLayoutRuleLike {
  readonly property: string;
  readonly value: string;
  readonly media?: string;
  readonly supports?: string;
  readonly container?: string;
  readonly layer?: string;
  readonly origin?: "cssom" | "fetched";
  readonly selector?: string;
  readonly important?: boolean;
  // §C1.5 (optional; absent on old artifacts)
  readonly sheetIndex?: number;
  readonly ruleOrder?: number;
  readonly specificity?: readonly [number, number, number] | readonly number[];
  readonly layerOrder?: number;
  readonly supportsMatches?: boolean;
}

/** §C1.2 runtime inline style at the truth capture. */
export interface InlineStyleLike {
  readonly decls: ReadonlyArray<{
    readonly property: string;
    readonly value: string;
    readonly important?: boolean;
  }>;
  readonly raw?: string;
  /** The observer cut declarations away (§C1.2 cap). */
  readonly truncated?: boolean;
}

export type InlineProvenanceClass =
  | "initial-static"
  | "initial-mutated"
  | "runtime-added"
  | "runtime-responsive"
  | "unknown";

/** §C1.4 initial↔runtime provenance. */
export interface InlineStyleProvenanceLike {
  readonly correspondence: "matched" | "ambiguous" | "no-initial-document" | "no-initial-node";
  readonly byProperty: Readonly<
    Record<
      string,
      {
        readonly class: InlineProvenanceClass;
        readonly initialValue?: string;
        readonly runtimeValue: string;
        readonly variesAcrossWidths: boolean;
      }
    >
  >;
  /**
   * Whether per-width `style` evidence (probe `s` arrays) existed. `"absent"`
   * means "does not vary with width" is UNPROVEN for every property.
   */
  readonly widthEvidence?: "probe" | "absent";
  readonly reason?: string;
}

/** The subset of `ElementSpecNode` this module reads. */
export interface ResponsiveDeclNode {
  readonly nodeId: string;
  readonly tagName: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly authoredLayout?: readonly AuthoredLayoutRuleLike[];
  readonly authoredLayoutTruncated?: boolean;
  readonly inlineStyle?: InlineStyleLike;
  readonly inlineStyleProvenance?: InlineStyleProvenanceLike;
}

// ---------------------------------------------------------------------------
// Media → intervals
// ---------------------------------------------------------------------------

/**
 * - `ok`         — fully determined: the condition holds exactly on `intervals`
 *                  (possibly empty, e.g. a contradictory conjunction).
 * - `not-screen` — every alternative is for a non-screen media type: never applies.
 * - `ambiguous`  — holds on `intervals` for sure, and MAY hold on `possible \ intervals`.
 */
export type MediaIntervalStatus = "ok" | "not-screen" | "ambiguous";

export interface MediaIntervals {
  /** Where the condition definitely holds (normalized: sorted, merged, non-empty). */
  readonly intervals: Interval[];
  readonly status: MediaIntervalStatus;
  /** Superset of `intervals`: where it may hold. Equal to `intervals` unless ambiguous. */
  readonly possible: Interval[];
  /** Why it is ambiguous (sorted, deduped). Empty unless ambiguous. */
  readonly reasons: string[];
}

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

export type Relevance = "applies" | "not-applies" | "unknown";

/** One competing declaration for ONE physical property of ONE element. */
export interface CascadeCandidate {
  /** Stable id, unique within one resolution (e.g. `sheet#3`, `inline#0`). */
  readonly id: string;
  /** Physical target property. */
  readonly property: string;
  /**
   * The declared value, verbatim (var() passed through). `undefined` = the
   * candidate exists but its value is not statically known — it can only make
   * a decision ambiguous, never win.
   */
  readonly value: string | undefined;
  readonly valueUnknownReason?: string;
  readonly important: boolean;
  /** Element-attached (style attribute). */
  readonly inline: boolean;
  readonly provenance: DeclProvenance;
  readonly media?: string;
  readonly supports?: string;
  readonly supportsMatches?: boolean;
  readonly container?: string;
  readonly layer?: string;
  readonly layerOrder?: number;
  readonly specificity?: readonly [number, number, number];
  /** Sheet rules: global cascade source order. Inline: index within the style attribute. */
  readonly ruleOrder?: number;
  readonly sheetIndex?: number;
  readonly origin?: "cssom" | "fetched";
  readonly selector?: string;
  /**
   * Relevance cannot be decided for a reason outside the condition fields
   * (e.g. a logical property whose physical mapping is unknown). Forces `unknown`.
   */
  readonly relevanceUnknownReason?: string;
  /** Optional pre-parsed media (avoids re-parsing per width). */
  readonly mediaIntervals?: MediaIntervals;
}

export type CascadeStatus = "resolved" | "no-author-declaration" | "ambiguous";

export interface CascadeResolution {
  readonly status: CascadeStatus;
  readonly winner?: CascadeCandidate;
  /** Single summary reason (first of `reasons`) when not resolved. */
  readonly reason?: string;
  readonly reasons: string[];
  /** Candidates that could still be the winner (resolved: just the winner, or a same-value tie). */
  readonly possibleWinners: CascadeCandidate[];
  /** `true` when several possible winners were left undecided but share one value. */
  readonly tieSameValue?: boolean;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type WidthFamilyProperty =
  | "width"
  | "min-width"
  | "max-width"
  | "margin-left"
  | "margin-right"
  | "flex-basis";

export type PlanPiece =
  | {
      readonly kind: "winner";
      readonly interval: Interval;
      readonly decl: ResponsiveDecl;
      readonly usesVar: boolean;
      readonly containsIntegerWidth: boolean;
      /** Adjacent sub-intervals with the same value and provenance merged into this one. */
      readonly mergedFrom: number;
      readonly tieSameValue?: boolean;
    }
  | {
      readonly kind: "no-author-declaration";
      readonly interval: Interval;
      /** The property's CSS initial value (applies when nothing is emitted). */
      readonly initialValue: string;
      /** UA/presentational fallback (contract §C2.3): constant frozen truth value to emit. */
      readonly frozen?: ResponsiveDecl;
      readonly containsIntegerWidth: boolean;
      readonly mergedFrom: number;
    }
  | {
      readonly kind: "ambiguous";
      readonly interval: Interval;
      readonly reasons: string[];
      readonly containsIntegerWidth: boolean;
      readonly mergedFrom: number;
    };

export interface PiecewisePlan {
  readonly pageId: string;
  readonly viewportId: ViewportIdLike;
  readonly nodeId: string;
  readonly property: WidthFamilyProperty;
  readonly served: Interval;
  /** `ok` = no ambiguous piece covers any part of `served`. */
  readonly status: "ok" | "ambiguous";
  /** Cover `served` exactly, sorted, non-overlapping. */
  readonly pieces: PlanPiece[];
  /** Union of every ambiguous piece's reasons (sorted, deduped). */
  readonly reasons: string[];
  readonly evidence: {
    readonly sheetCandidates: number;
    readonly inlineCandidates: number;
    /** `complete` = every sheet candidate has specificity + ruleOrder. */
    readonly cascadeMetadata: "complete" | "partial" | "absent" | "no-sheet-candidates";
    readonly inlineStyle: "present" | "absent-or-not-captured";
    readonly edges: number[];
  };
}
