import {
  QA_CLASSIFICATION_ORDER,
  QA_DIMENSION_ORDER,
  qaDiffId,
  type AutoFixEligibility,
  type QaClassification,
  type QaDiff,
  type QaDimension,
  type QaEvidence,
  type QaRecommendation,
  type QaUpstreamStage,
} from "./types.js";

/**
 * Diff collection, precedence and routing (items 81–84, 166, 167).
 *
 * ## Precedence is an explicit policy, not an accident of code order (item 82)
 *
 * Several causes are true of the same node at once, and one of them EXPLAINS the
 * others. Left implicit, the report double-counts: a page whose live original
 * drifted would be charged once for the drift and again for every node where the
 * clone "disagrees with the live site" — which it does precisely because the
 * live site moved.
 *
 * The policy, in words:
 *
 *  1. **The snapshot is the contract.** A clone difference from the SiteSpec is a
 *     clone defect whether or not the live site drifted, because the SiteSpec is
 *     what the clone was built to reproduce (item 4).
 *  2. **Drift suppresses the LIVE comparison only.** Once a node is known to have
 *     drifted, no live-original mismatch on that node is also reported as a
 *     generator defect. `sourceDrift: true` is stamped on the clone-side diff so
 *     the two facts stay visible together.
 *  3. **An unstable measurement outranks everything on that page.** If two
 *     captures a moment apart disagree, geometry and visual findings there are
 *     `environment-unstable`, because attribution needs a stable measurement
 *     (item 21).
 *  4. **A grouped cause replaces its symptoms.** A layout cascade replaces the N
 *     geometry diffs it explains; an inherited-style group replaces the N
 *     descendants carrying it; a font-binding finding explains the font-family
 *     mismatches that evidence it. The replaced nodes are counted in
 *     `affectedNodeCount`, never dropped.
 *  5. **No fuzzy score decides anything** (item 83). Every classification is an
 *     evidence predicate that either holds or does not; when none holds the
 *     answer is `unclassified`, which is a finding rather than a shrug.
 *
 * One documented EXCEPTION to rule 1, for assets only. When the snapshot recorded
 * an `<img>` as decoded, the clone does not decode it, AND the live original does
 * not decode it either, the clone is reproducing the site's own current behavior —
 * so the finding is `asset-source-drift` (reported under `source-content-drift`,
 * the nearest taxonomy code) rather than a reconstruction defect. This is item
 * 53's explicit requirement to keep `asset-source-drift` apart from the four
 * clone-side asset causes, and it is narrow on purpose: it needs a POSITIVE
 * observation that the live original fails the same way, which is direct evidence
 * about the site rather than an absence of evidence about the clone. It fired 9
 * times on domainchecker, all of them lazily-loaded blog thumbnails.
 *
 * ## Routing (item 166)
 *
 * Every diff carries a `recommendation` and an `upstreamStage`, so "we cannot
 * auto-fix this" is always accompanied by who can. Those two fields are what the
 * report's routing table is built from.
 */

/** Individual per-node diffs kept per dimension per page/viewport. */
export const MAX_NODE_DIFFS_PER_DIMENSION = 25;

/** The default routing for each classification (item 166). */
const ROUTING: Readonly<
  Record<QaClassification, { recommendation: QaRecommendation; upstream: QaUpstreamStage }>
> = {
  "source-structural-drift": { recommendation: "requires-reobserve", upstream: "source-site" },
  "source-content-drift": { recommendation: "requires-reobserve", upstream: "source-site" },
  "source-style-drift": { recommendation: "requires-reobserve", upstream: "source-site" },
  "route-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "content-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "structure-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "geometry-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "layout-cascade": { recommendation: "none", upstream: "reconstruction" },
  // The clone's own restoration failed, so this belongs to reconstruction — NOT
  // to observation, which did its job the moment `scrollState` was recorded.
  "nested-scroll-state-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "style-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "font-binding-missing": {
    recommendation: "requires-font-binding-observation",
    upstream: "observation",
  },
  "asset-missing": { recommendation: "requires-exact-observation", upstream: "sitespec" },
  "asset-load-failure": {
    recommendation: "requires-asset-materialization",
    upstream: "reconstruction",
  },
  "asset-hotlink-blocked": {
    recommendation: "requires-asset-materialization",
    upstream: "reconstruction",
  },
  "canvas-background-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "responsive-variant-mismatch": { recommendation: "none", upstream: "reconstruction" },
  "responsive-variant-runtime-error": { recommendation: "none", upstream: "reconstruction" },
  "inferred-breakpoint-runtime-defect": { recommendation: "none", upstream: "reconstruction" },
  "interaction-state-mismatch": {
    recommendation: "requires-new-interaction-observation",
    upstream: "reconstruction",
  },
  "interaction-visible-target-mismatch": {
    recommendation: "requires-new-interaction-observation",
    upstream: "reconstruction",
  },
  "interaction-target-style-mismatch": {
    recommendation: "requires-new-interaction-observation",
    upstream: "reconstruction",
  },
  "dynamic-target-content-unobserved": {
    recommendation: "requires-new-interaction-observation",
    upstream: "interaction-exploration",
  },
  "unknown-behavior-gap": {
    recommendation: "requires-pattern-modeling",
    upstream: "pattern-modeling",
  },
  "family-representation-gap": {
    recommendation: "requires-exact-observation",
    upstream: "selection",
  },
  "runtime-error": { recommendation: "none", upstream: "reconstruction" },
  "environment-unstable": { recommendation: "none", upstream: "qa" },
  unclassified: { recommendation: "none", upstream: "none" },
};

/** The default auto-fix answer for each classification (items 100, 108–112). */
const DEFAULT_ELIGIBILITY: Readonly<Record<QaClassification, AutoFixEligibility>> = {
  "source-structural-drift": "not-eligible-source-drift",
  "source-content-drift": "not-eligible-source-drift",
  "source-style-drift": "not-eligible-source-drift",
  "route-mismatch": "not-eligible-no-correction-type",
  "content-mismatch": "not-eligible-no-correction-type",
  "structure-mismatch": "not-eligible-no-correction-type",
  "geometry-mismatch": "not-eligible-no-correction-type",
  "layout-cascade": "not-eligible-no-correction-type",
  "nested-scroll-state-mismatch": "not-eligible-no-correction-type",
  "style-mismatch": "not-eligible-no-correction-type",
  "font-binding-missing": "not-eligible-requires-font-binding",
  "asset-missing": "not-eligible-no-correction-type",
  "asset-load-failure": "not-eligible-requires-materialization",
  "asset-hotlink-blocked": "not-eligible-requires-materialization",
  "canvas-background-mismatch": "not-eligible-no-correction-type",
  "responsive-variant-mismatch": "not-eligible-no-correction-type",
  "responsive-variant-runtime-error": "not-eligible-no-correction-type",
  "inferred-breakpoint-runtime-defect": "not-eligible-no-correction-type",
  "interaction-state-mismatch": "not-eligible-no-correction-type",
  "interaction-visible-target-mismatch": "not-eligible-no-correction-type",
  "interaction-target-style-mismatch": "not-eligible-no-observed-target-state",
  "dynamic-target-content-unobserved": "not-eligible-no-correction-type",
  "unknown-behavior-gap": "not-eligible-unknown-behavior",
  "family-representation-gap": "not-eligible-family-representation",
  "runtime-error": "not-eligible-no-correction-type",
  "environment-unstable": "not-eligible-unstable-measurement",
  unclassified: "not-eligible-no-correction-type",
};

export interface DiffDraft {
  pageId?: string;
  viewport?: "desktop" | "mobile";
  route?: string;
  dimension: QaDimension;
  classification: QaClassification;
  nodeId?: string;
  patternId?: string;
  unknownId?: string;
  property?: string;
  snapshotExpected?: string;
  liveOriginal?: string;
  cloneActual?: string;
  evidence?: QaEvidence[];
  sourceDrift?: boolean;
  affectedNodeCount?: number;
  autoFixEligibility?: AutoFixEligibility;
  correctionType?: string;
  recommendation?: QaRecommendation;
  upstreamStage?: QaUpstreamStage;
  limitations?: string[];
}

/**
 * Accumulates drafts and assigns `qd######` ids only after a stable sort.
 *
 * Ids are assigned last on purpose (item 17): if they were assigned as diffs
 * arrived, a page finishing in a different order — which it will, at concurrency
 * 2 — would renumber every diff after it and make two runs over the same
 * evidence produce different artifacts.
 */
export class DiffCollector {
  private readonly drafts: DiffDraft[] = [];

  add(draft: DiffDraft): void {
    this.drafts.push(draft);
  }

  /** How many drafts exist so far (used for per-dimension caps). */
  get size(): number {
    return this.drafts.length;
  }

  /** Finalize: stable sort, then deterministic ids. */
  build(): QaDiff[] {
    const sorted = [...this.drafts].sort(compareDrafts);
    return sorted.map((draft, index) => {
      const routing = ROUTING[draft.classification];
      return {
        id: qaDiffId(index + 1),
        ...(draft.pageId !== undefined ? { pageId: draft.pageId } : {}),
        ...(draft.viewport !== undefined ? { viewport: draft.viewport } : {}),
        ...(draft.route !== undefined ? { route: draft.route } : {}),
        dimension: draft.dimension,
        classification: draft.classification,
        ...(draft.nodeId !== undefined ? { nodeId: draft.nodeId } : {}),
        ...(draft.patternId !== undefined ? { patternId: draft.patternId } : {}),
        ...(draft.unknownId !== undefined ? { unknownId: draft.unknownId } : {}),
        ...(draft.property !== undefined ? { property: draft.property } : {}),
        ...(draft.snapshotExpected !== undefined
          ? { snapshotExpected: draft.snapshotExpected }
          : {}),
        ...(draft.liveOriginal !== undefined ? { liveOriginal: draft.liveOriginal } : {}),
        ...(draft.cloneActual !== undefined ? { cloneActual: draft.cloneActual } : {}),
        evidence: draft.evidence ?? [],
        sourceDrift: draft.sourceDrift ?? false,
        affectedNodeCount: draft.affectedNodeCount ?? 1,
        autoFixEligibility:
          draft.autoFixEligibility ?? DEFAULT_ELIGIBILITY[draft.classification],
        ...(draft.correctionType !== undefined ? { correctionType: draft.correctionType } : {}),
        recommendation: draft.recommendation ?? routing.recommendation,
        upstreamStage: draft.upstreamStage ?? routing.upstream,
        limitations: [...new Set(draft.limitations ?? [])].sort(),
      };
    });
  }
}

/** The stable sort of item 17: page → viewport → dimension → node → property → pattern. */
function compareDrafts(a: DiffDraft, b: DiffDraft): number {
  const page = (a.pageId ?? "￿").localeCompare(b.pageId ?? "￿");
  if (page !== 0) return page;
  const viewport = (a.viewport ?? "￿").localeCompare(b.viewport ?? "￿");
  if (viewport !== 0) return viewport;
  const dimension =
    QA_DIMENSION_ORDER.indexOf(a.dimension) - QA_DIMENSION_ORDER.indexOf(b.dimension);
  if (dimension !== 0) return dimension;
  const classification =
    QA_CLASSIFICATION_ORDER.indexOf(a.classification) -
    QA_CLASSIFICATION_ORDER.indexOf(b.classification);
  if (classification !== 0) return classification;
  const node = (a.nodeId ?? "").localeCompare(b.nodeId ?? "");
  if (node !== 0) return node;
  const property = (a.property ?? "").localeCompare(b.property ?? "");
  if (property !== 0) return property;
  const pattern = (a.patternId ?? "").localeCompare(b.patternId ?? "");
  if (pattern !== 0) return pattern;
  const unknown = (a.unknownId ?? "").localeCompare(b.unknownId ?? "");
  if (unknown !== 0) return unknown;
  return (a.route ?? "").localeCompare(b.route ?? "");
}
