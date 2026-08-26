import { z } from "zod";
import { ViewportProfileSchema } from "../observer/types.js";
import { PageFamilyTypeSchema } from "../selector/types.js";
import { SitePageRoleSchema } from "../multi-observer/types.js";

/**
 * Interaction Candidate Detection types & schemas (Task 10).
 *
 * Task 09 left a whole site's desktop+mobile DOM, computed styles and geometry
 * on disk. This layer answers exactly one question from that data:
 *
 *   > WHICH elements is there stored evidence for interacting with?
 *
 * and deliberately not the next one ("what happens when you do?"), which needs a
 * browser and belongs to the Rule-Based Interaction Explorer (Task 11).
 *
 * **Offline deterministic processing.** No Firecrawl, no Playwright, no browser,
 * no network request, no AI/LLM. The only inputs are files Task 09 already wrote,
 * and they are treated as immutable: this stage only ADDS derived artifacts.
 *
 * A *candidate* is a claim about EVIDENCE, not about behavior:
 *
 *   > "this element carries a signal that justifies attempting an interaction"
 *
 * It is never a claim that the element works, is safe, has a JavaScript handler,
 * or is an accordion. Pattern names (Accordion / Tabs / Modal / Carousel) are
 * therefore absent by design — only ARIA/native-derived *trigger* capabilities
 * (`tab-trigger`, `dialog-trigger`, …) are asserted, because those follow from
 * the markup itself rather than from observed behavior.
 *
 * Data levels:
 *  - `observed`: read verbatim out of `dom.json` / `styles.json` (tag name,
 *    attributes, computed `cursor`, visibility flags, …).
 *  - `derived` : computed here from observed values with no AI — priority,
 *    capabilities, `initiallyOperable`, form-ancestor and `<details>` relations.
 *
 * There is no third level. Nothing in this module is inferred, guessed, or
 * scored; every candidate can be traced back to stored evidence.
 */

/** Bumped when any persisted interaction-analysis shape changes. */
export const SCHEMA_VERSION = 1 as const;

/** Recorded in artifacts so a reader can tell what produced them. */
export const DETECTOR_ENGINE = "offline-deterministic";

/** Max characters of element text copied into a candidate (Observer already caps at 200). */
export const CANDIDATE_TEXT_MAX_LEN = 200;

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/**
 * Deterministic exploration tiers, NOT a probability or a confidence score.
 *
 *  - `P1` — an EXPLICIT stateful relationship is declared in the markup
 *           (`aria-expanded` / `aria-controls` / `aria-haspopup` / `aria-pressed`
 *           / `aria-selected` / `aria-checked`, `role=tab`, `role=switch`,
 *           `<summary>`, `popovertarget`). The page itself says a state change
 *           is what this control is for.
 *  - `P2` — a NATIVE or explicit interaction affordance with no declared state
 *           relationship (`<button>`, `<input>`, `<select>`, `<textarea>`,
 *           `contenteditable`, `draggable`, an inline handler, `role=button`, …).
 *  - `P3` — a HEURISTIC candidate: a non-interactive tag that merely looks
 *           clickable (`cursor:pointer`, optionally plus `tabindex`/state hints).
 *
 * An element with several signals takes the HIGHEST tier it qualifies for
 * (`<button aria-expanded>` is P1, a bare `<button>` is P2). The next stage uses
 * this to order exploration, not to decide truth.
 */
export const InteractionPrioritySchema = z.enum(["P1", "P2", "P3"]);
export type InteractionPriority = z.infer<typeof InteractionPrioritySchema>;

/** Fixed order used by every summary/table so output never depends on Map order. */
export const PRIORITY_ORDER: readonly InteractionPriority[] = ["P1", "P2", "P3"];

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

/**
 * What a next stage could *attempt* on the element. One element yields at most
 * ONE candidate carrying MANY capabilities — never one candidate per signal.
 *
 * The taxonomy deliberately mixes two levels and says so out loud:
 *
 *  - physical actions      : `click`, `focus`, `edit`, `toggle`, `select`,
 *                            `drag`, `range-adjust`, `submit`, `reset`
 *  - ARIA/native semantics : `state-toggle`, `disclosure-trigger`,
 *                            `menu-trigger`, `dialog-trigger`, `tab-trigger`,
 *                            `popover-trigger`, `open-options`
 *
 * The second group is still deterministic — every member is read straight off a
 * `role` / `aria-*` / native tag, never guessed from a class name — but it names
 * an INTENT the markup declares, not a proven behavior. `generic-pointer` is the
 * weakest member: it means only "this looks clickable" (`cursor:pointer`).
 */
export const InteractionCapabilitySchema = z.enum([
  "click",
  "state-toggle",
  "disclosure-trigger",
  "menu-trigger",
  "dialog-trigger",
  "tab-trigger",
  "popover-trigger",
  "toggle",
  "select",
  "open-options",
  "edit",
  "focus",
  "range-adjust",
  "drag",
  "submit",
  "reset",
  "generic-pointer",
]);
export type InteractionCapability = z.infer<typeof InteractionCapabilitySchema>;

/** Canonical capability order — used for sorting inside a candidate AND in summaries. */
export const CAPABILITY_ORDER: readonly InteractionCapability[] = [
  "click",
  "state-toggle",
  "disclosure-trigger",
  "menu-trigger",
  "dialog-trigger",
  "tab-trigger",
  "popover-trigger",
  "toggle",
  "select",
  "open-options",
  "edit",
  "focus",
  "range-adjust",
  "drag",
  "submit",
  "reset",
  "generic-pointer",
];

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Why a candidate exists. Every entry is a small, named fact — never a copy of
 * the page.
 *
 * Two hard rules:
 *  1. An inline event handler contributes its ATTRIBUTE NAME only
 *     (`inline-handler: onclick`). The JavaScript source is never copied into an
 *     artifact — it is untrusted page content, it can be kilobytes long, and the
 *     name alone is the whole signal.
 *  2. A `data-*` state hint contributes its ATTRIBUTE NAME only, for the same
 *     reason plus one more: the value space is arbitrary and framework-specific,
 *     and this detector must stay framework-agnostic.
 */
export const InteractionEvidenceTypeSchema = z.enum([
  // --- observed: the element itself ---
  "native-element",
  "input-type",
  "role",
  "tabindex",
  "draggable",
  "contenteditable",
  "javascript-href",
  "inline-handler",
  "popover",
  "popovertarget",
  "popovertargetaction",
  "state-hint-attribute",
  // --- observed: ARIA state / relationship ---
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
  "aria-controls",
  "aria-disabled",
  "aria-readonly",
  "aria-valuenow",
  "aria-valuemin",
  "aria-valuemax",
  "aria-owns",
  // --- observed: state attributes ---
  "disabled-attribute",
  "readonly-attribute",
  "checked-attribute",
  "selected-attribute",
  "open-attribute",
  "hidden-attribute",
  "inert-attribute",
  // --- observed: computed style ---
  "computed-cursor",
  "computed-pointer-events",
  "has-transition",
  "has-animation",
  // --- derived: from the DOM graph or from HTML default semantics ---
  "native-disclosure",
  "details-open",
  "inside-form",
  "implicit-submit",
  "inert-ancestor",
]);
export type InteractionEvidenceType = z.infer<typeof InteractionEvidenceTypeSchema>;

/**
 * Deterministic evidence ordering (§49 provenance stays readable): observed
 * element facts, then ARIA, then state attributes, then computed style, then the
 * derived entries last. Also the sort key inside every candidate.
 */
export const EVIDENCE_TYPE_ORDER: readonly InteractionEvidenceType[] = [
  "native-element",
  "input-type",
  "role",
  "tabindex",
  "draggable",
  "contenteditable",
  "javascript-href",
  "inline-handler",
  "popover",
  "popovertarget",
  "popovertargetaction",
  "state-hint-attribute",
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
  "aria-controls",
  "aria-disabled",
  "aria-readonly",
  "aria-valuenow",
  "aria-valuemin",
  "aria-valuemax",
  "aria-owns",
  "disabled-attribute",
  "readonly-attribute",
  "checked-attribute",
  "selected-attribute",
  "open-attribute",
  "hidden-attribute",
  "inert-attribute",
  "computed-cursor",
  "computed-pointer-events",
  "has-transition",
  "has-animation",
  "native-disclosure",
  "details-open",
  "inside-form",
  "implicit-submit",
  "inert-ancestor",
];

/**
 * `observed` — read directly out of `dom.json` / `styles.json`.
 * `derived`  — computed here (DOM-graph relations, HTML default semantics).
 * There is no `inferred` level: no AI, no heuristic guessing of meaning.
 */
export const EvidenceProvenanceSchema = z.enum(["observed", "derived"]);
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const InteractionEvidenceSchema = z.object({
  type: InteractionEvidenceTypeSchema,
  /**
   * The observed value when it is short and meaningful (`false` for
   * `aria-expanded`, `menu` for `aria-haspopup`, `pointer` for the cursor). For
   * `inline-handler` and `state-hint-attribute` this is the attribute NAME, and
   * the attribute's value is deliberately never stored.
   */
  value: z.string().optional(),
  provenance: EvidenceProvenanceSchema,
});
export type InteractionEvidence = z.infer<typeof InteractionEvidenceSchema>;

// ---------------------------------------------------------------------------
// Control relations & targets
// ---------------------------------------------------------------------------

/**
 * How a trigger points at the region it controls.
 *  - `aria-controls`  : an IDREF list the author declared.
 *  - `popovertarget`  : the HTML Popover API attribute.
 *  - `details`        : the native `<summary>` → parent `<details>` relation,
 *                       which needs no id because the DOM tree carries it.
 *
 * `aria-owns` is deliberately NOT here: it re-parents the accessibility tree and
 * is not a "this trigger opens that region" statement. It is recorded as
 * evidence only.
 */
export const ControlRelationTypeSchema = z.enum([
  "aria-controls",
  "popovertarget",
  "details",
]);
export type ControlRelationType = z.infer<typeof ControlRelationTypeSchema>;

export const CONTROL_RELATION_ORDER: readonly ControlRelationType[] = [
  "aria-controls",
  "popovertarget",
  "details",
];

/**
 * One trigger → target edge.
 *
 * `resolved: false` is a normal, expected outcome and never an error: a
 * declared target may legitimately not exist in the initial static DOM yet (a
 * dialog mounted on first open, a menu rendered lazily). Losing that fact would
 * be worse than recording it — it is exactly the case Task 11 has to handle.
 */
export const InteractionControlRelationSchema = z.object({
  relation: ControlRelationTypeSchema,
  /** The HTML `id` as written by the author (absent for the `details` relation). */
  targetDomId: z.string().optional(),
  /** The Observer element id (`e000456`) the id resolved to, when it resolved. */
  targetElementId: z.string().optional(),
  resolved: z.boolean(),
});
export type InteractionControlRelation = z.infer<
  typeof InteractionControlRelationSchema
>;

/**
 * Why an element is in the target inventory.
 *  - `aria-controls` / `popovertarget` : a candidate points at it.
 *  - `details-content`                 : it is a `<details>` with a `<summary>`.
 *  - `stateful-container`              : an unmistakable stateful container
 *                                        (`<dialog>`, `role=dialog|alertdialog|
 *                                        tabpanel|menu|listbox`, `popover`)
 *                                        even when nothing observed points at it.
 */
export const InteractionTargetReasonSchema = z.enum([
  "aria-controls",
  "popovertarget",
  "details-content",
  "stateful-container",
]);
export type InteractionTargetReason = z.infer<typeof InteractionTargetReasonSchema>;

export const TARGET_REASON_ORDER: readonly InteractionTargetReason[] = [
  "aria-controls",
  "popovertarget",
  "details-content",
  "stateful-container",
];

/**
 * A region whose state a candidate may change. The point of the record is the
 * BEFORE state: a controlled menu that is `effectiveVisible:false` right now is
 * what makes "after the click, is it visible?" a testable question in Task 11.
 */
export const InteractionTargetSchema = z.object({
  elementId: z.string(),
  /** HTML `id` attribute, when the element has one. */
  domId: z.string().optional(),
  tagName: z.string(),
  role: z.string().optional(),
  localVisible: z.boolean(),
  effectiveVisible: z.boolean(),
  ariaHidden: z.string().optional(),
  hiddenAttribute: z.string().optional(),
  /** `<details open>` / `<dialog open>` initial state, when the attribute is stored. */
  openAttribute: z.string().optional(),
  /** The HTML Popover API `popover` attribute value, when present. */
  popoverAttribute: z.string().optional(),
  /** Sorted, deduplicated reasons this element is in the inventory. */
  reasons: z.array(InteractionTargetReasonSchema).min(1),
});
export type InteractionTarget = z.infer<typeof InteractionTargetSchema>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Deterministic risk/《do not blindly fire this》 markers consumed by Task 11.
 *
 * These are NOT a safety guarantee — this stage cannot prove an interaction is
 * safe, and no `safe: true` field exists anywhere for that reason. They are the
 * risk signals that ARE derivable from stored data:
 *
 *  - `form-submit`         : firing this may submit a form (explicit
 *                            `type=submit`/`image`, or HTML's default submit
 *                            semantics for a typeless `<button>` inside a form).
 *  - `file-input`          : `input[type=file]` — an OS file dialog, never to be
 *                            driven automatically without an explicit decision.
 *  - `navigation`          : the candidate is an anchor with a real href, so
 *                            interacting may leave the page.
 *  - `external-navigation` : …and that href points at another host.
 *  - `disabled` / `readonly` / `hidden` / `pointer-disabled` / `inert` :
 *                            initial-state blockers, recorded rather than used
 *                            to delete the candidate (a later interaction may
 *                            enable/reveal it).
 */
export const GuardFlagSchema = z.enum([
  "form-submit",
  "file-input",
  "navigation",
  "external-navigation",
  "disabled",
  "readonly",
  "hidden",
  "pointer-disabled",
  "inert",
]);
export type GuardFlag = z.infer<typeof GuardFlagSchema>;

export const GUARD_FLAG_ORDER: readonly GuardFlag[] = [
  "form-submit",
  "file-input",
  "navigation",
  "external-navigation",
  "disabled",
  "readonly",
  "hidden",
  "pointer-disabled",
  "inert",
];

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

/**
 * The element's initial state, as stored — the "before" half of any future
 * before/after diff.
 *
 * `initiallyOperable` is the one derived judgement, and it is intentionally
 * conservative: visible AND not disabled AND not readonly AND not inside an
 * `inert` subtree AND `pointer-events` is not `none`. A readonly text field can
 * still be focused in a browser; it is marked non-operable here because the
 * interaction a next stage would want (typing) cannot succeed.
 */
export const CandidateInitialStateSchema = z.object({
  localVisible: z.boolean(),
  effectiveVisible: z.boolean(),
  disabled: z.boolean(),
  readonly: z.boolean(),
  inertAncestor: z.boolean(),
  pointerOperable: z.boolean(),
  initiallyOperable: z.boolean(),
});
export type CandidateInitialState = z.infer<typeof CandidateInitialStateSchema>;

/**
 * One interaction candidate. Compact by design: this file is an INDEX into
 * `dom.json`, not a second copy of it. The full attribute set, geometry and
 * computed styles stay in the observation — only the evidence that produced the
 * candidate is repeated here.
 */
export const InteractionCandidateSchema = z.object({
  /** `ic000001…`, assigned in element (document) order within ONE viewport. */
  id: z.string(),
  /** The Observer element id — viewport-local, never comparable across viewports. */
  elementId: z.string(),
  tagName: z.string(),
  /** The Observer's already-normalized direct text, reused verbatim (never re-derived). */
  text: z.string().optional(),
  /** First token of the `role` attribute, lower-cased. */
  role: z.string().optional(),
  /** Normalized `<input>` type (see {@link normalizeInputType}). */
  inputType: z.string().optional(),

  priority: InteractionPrioritySchema,
  /** Sorted by {@link CAPABILITY_ORDER}; never empty. */
  capabilities: z.array(InteractionCapabilitySchema).min(1),

  initialState: CandidateInitialStateSchema,
  /** Sorted by {@link GUARD_FLAG_ORDER}; may be empty. */
  guardFlags: z.array(GuardFlagSchema),
  /** Sorted by {@link EVIDENCE_TYPE_ORDER}; never empty. */
  evidence: z.array(InteractionEvidenceSchema).min(1),
  /** Declared trigger → target edges (may be empty). */
  controls: z.array(InteractionControlRelationSchema),

  /** True when an ancestor `<form>` exists in the observed DOM. */
  insideForm: z.boolean(),
  formElementId: z.string().optional(),
  /** Derived: interacting with this control may submit a form. */
  submitCapable: z.boolean(),

  /** Reference into the viewport's `styles.json` (kept for cross-checking). */
  styleId: z.string(),
});
export type InteractionCandidate = z.infer<typeof InteractionCandidateSchema>;

// ---------------------------------------------------------------------------
// Per-viewport / per-page analysis
// ---------------------------------------------------------------------------

/** Counts keyed by capability / guard name. Only non-zero keys, in canonical order. */
export const CountMapSchema = z.record(z.string(), z.number().int().nonnegative());
export type CountMap = z.infer<typeof CountMapSchema>;

export const PriorityCountsSchema = z.object({
  P1: z.number().int().nonnegative(),
  P2: z.number().int().nonnegative(),
  P3: z.number().int().nonnegative(),
});
export type PriorityCounts = z.infer<typeof PriorityCountsSchema>;

/**
 * Per-viewport figures. `candidateDensity` is a DIAGNOSTIC ratio
 * (`candidates / effectiveVisibleElements`), never a quality score: a docs page
 * legitimately has a low one and an app shell a high one.
 */
export const ViewportInteractionStatsSchema = z.object({
  domElementCount: z.number().int().nonnegative(),
  effectiveVisibleElementCount: z.number().int().nonnegative(),

  candidateCount: z.number().int().nonnegative(),
  priorityCounts: PriorityCountsSchema,

  visibleCandidateCount: z.number().int().nonnegative(),
  hiddenCandidateCount: z.number().int().nonnegative(),
  operableCandidateCount: z.number().int().nonnegative(),
  nonOperableCandidateCount: z.number().int().nonnegative(),

  targetCount: z.number().int().nonnegative(),
  controlRelationCount: z.number().int().nonnegative(),
  resolvedControlCount: z.number().int().nonnegative(),
  unresolvedControlCount: z.number().int().nonnegative(),

  capabilityCounts: CountMapSchema,
  guardCounts: CountMapSchema,

  /** `candidateCount / effectiveVisibleElementCount`, 4 decimals (0 when empty). */
  candidateDensity: z.number(),
});
export type ViewportInteractionStats = z.infer<
  typeof ViewportInteractionStatsSchema
>;

/**
 * ONE viewport's result. Desktop and mobile are detected completely
 * independently and stored side by side: element ids are viewport-local (Task
 * 05), so desktop `e000050` and mobile `e000050` are unrelated and this Task
 * implements NO cross-viewport matching. Candidate ids restart at `ic000001` per
 * viewport for the same reason.
 */
export const ViewportInteractionAnalysisSchema = z.object({
  viewportId: ViewportProfileSchema.shape.id,
  /** Relative to the page directory, e.g. `viewports/desktop/dom.json`. */
  sourceDomFile: z.string(),
  sourceStylesFile: z.string(),
  candidates: z.array(InteractionCandidateSchema),
  targets: z.array(InteractionTargetSchema),
  stats: ViewportInteractionStatsSchema,
});
export type ViewportInteractionAnalysis = z.infer<
  typeof ViewportInteractionAnalysisSchema
>;

/** Compact page-level roll-up (both viewports). */
export const PageInteractionSummarySchema = z.object({
  desktopCandidateCount: z.number().int().nonnegative(),
  mobileCandidateCount: z.number().int().nonnegative(),
  totalCandidateCount: z.number().int().nonnegative(),
  priorityCounts: PriorityCountsSchema,
  targetCount: z.number().int().nonnegative(),
  unresolvedControlCount: z.number().int().nonnegative(),
});
export type PageInteractionSummary = z.infer<typeof PageInteractionSummarySchema>;

/** One page's interaction artifact (`pages/<pageId>/interaction-candidates.json`). */
export const PageInteractionAnalysisSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engine: z.string(),
  pageId: z.string(),
  url: z.string(),
  role: SitePageRoleSchema,
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  /** Relative to the site run directory (`pages/p000003/observation.json`). */
  sourceObservationFile: z.string(),
  analyzedAt: z.string(),
  viewports: z.object({
    desktop: ViewportInteractionAnalysisSchema,
    mobile: ViewportInteractionAnalysisSchema,
  }),
  summary: PageInteractionSummarySchema,
});
export type PageInteractionAnalysis = z.infer<typeof PageInteractionAnalysisSchema>;

// ---------------------------------------------------------------------------
// Site-level analysis
// ---------------------------------------------------------------------------

/** Per-viewport candidate figures for one page, as listed in the site manifest. */
export const SitePageViewportSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  p1: z.number().int().nonnegative(),
  p2: z.number().int().nonnegative(),
  p3: z.number().int().nonnegative(),
  visible: z.number().int().nonnegative(),
  operable: z.number().int().nonnegative(),
  targets: z.number().int().nonnegative(),
  candidateDensity: z.number(),
});
export type SitePageViewportSummary = z.infer<
  typeof SitePageViewportSummarySchema
>;

/**
 * One analyzed page in the site manifest. Compact on purpose (item 60): the
 * candidate arrays live in the page artifact and are referenced by relative
 * path, never embedded twice.
 */
export const SitePageInteractionSummarySchema = z.object({
  pageId: z.string(),
  url: z.string(),
  role: SitePageRoleSchema,
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  /** `pages/<pageId>/interaction-candidates.json`, relative to the run dir. */
  interactionCandidatesFile: z.string(),
  desktop: SitePageViewportSummarySchema,
  mobile: SitePageViewportSummarySchema,
});
export type SitePageInteractionSummary = z.infer<
  typeof SitePageInteractionSummarySchema
>;

/** A Task 09 page that was NOT analyzed, and why (never silently dropped). */
export const SkippedPageSchema = z.object({
  pageId: z.string(),
  url: z.string(),
  /** The Task 09 page status that caused the skip (`navigation-error`, …). */
  status: z.string(),
});
export type SkippedPage = z.infer<typeof SkippedPageSchema>;

/** Desktop / mobile / combined counts for a named dimension. */
export const ViewportSplitCountsSchema = z.object({
  desktop: CountMapSchema,
  mobile: CountMapSchema,
  total: CountMapSchema,
});
export type ViewportSplitCounts = z.infer<typeof ViewportSplitCountsSchema>;

export const PrioritySplitCountsSchema = z.object({
  desktop: PriorityCountsSchema,
  mobile: PriorityCountsSchema,
  total: PriorityCountsSchema,
});
export type PrioritySplitCounts = z.infer<typeof PrioritySplitCountsSchema>;

/**
 * Interaction-side comparison of one Task 09 representative ↔ validation-sample
 * pair. Both pages were already deep-observed in Task 09, so this costs zero
 * extra browser work.
 *
 * Measurements only — no verdict, and the family algorithm is NOT changed on the
 * strength of these numbers (that would be Task 08's decision to revisit).
 */
export const ValidationInteractionViewportComparisonSchema = z.object({
  representativeTotal: z.number().int().nonnegative(),
  sampleTotal: z.number().int().nonnegative(),
  /** `sample - representative`. */
  totalDifference: z.number().int(),
  p1Difference: z.number().int(),
  p2Difference: z.number().int(),
  p3Difference: z.number().int(),
  /** `sample - representative` per capability; only non-zero differences. */
  capabilityDifferences: z.record(z.string(), z.number().int()),
});
export type ValidationInteractionViewportComparison = z.infer<
  typeof ValidationInteractionViewportComparisonSchema
>;

export const ValidationInteractionComparisonSchema = z.object({
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  familyMemberCount: z.number().int().positive(),
  representativePageId: z.string(),
  samplePageId: z.string(),
  representativeUrl: z.string(),
  sampleUrl: z.string(),
  desktop: ValidationInteractionViewportComparisonSchema,
  mobile: ValidationInteractionViewportComparisonSchema,
});
export type ValidationInteractionComparison = z.infer<
  typeof ValidationInteractionComparisonSchema
>;

/** Run counts, byte totals and wall time. */
export const SiteInteractionStatsSchema = z.object({
  analyzedPages: z.number().int().nonnegative(),
  skippedFailedPages: z.number().int().nonnegative(),

  /** Every element read across every analyzed viewport (the real work unit). */
  domElementsAnalyzed: z.number().int().nonnegative(),

  desktopCandidateCount: z.number().int().nonnegative(),
  mobileCandidateCount: z.number().int().nonnegative(),
  totalCandidateCount: z.number().int().nonnegative(),

  p1Count: z.number().int().nonnegative(),
  p2Count: z.number().int().nonnegative(),
  p3Count: z.number().int().nonnegative(),

  visibleCandidateCount: z.number().int().nonnegative(),
  hiddenCandidateCount: z.number().int().nonnegative(),
  operableCandidateCount: z.number().int().nonnegative(),
  nonOperableCandidateCount: z.number().int().nonnegative(),

  controlledTargetCount: z.number().int().nonnegative(),
  controlRelationCount: z.number().int().nonnegative(),
  resolvedControlCount: z.number().int().nonnegative(),
  unresolvedControlCount: z.number().int().nonnegative(),

  /** `P3 / total` across the site, 4 decimals — a noise diagnostic (item 98). */
  p3Ratio: z.number(),

  /** Sum of every `interaction-candidates.json` written by this run. */
  interactionCandidatesBytes: z.number().int().nonnegative(),
  interactionAnalysisJsonBytes: z.number().int().nonnegative(),
  /** Every byte Task 10 added to the run directory. */
  totalAddedBytes: z.number().int().nonnegative(),

  elapsedMs: z.number().int().nonnegative(),
});
export type SiteInteractionStats = z.infer<typeof SiteInteractionStatsSchema>;

/**
 * The site-level manifest (`interaction-analysis.json`), written NEXT TO the
 * Task 09 `site-observation.json` it was derived from. The observation artifacts
 * themselves are never modified — Task 10 only adds.
 */
export const SiteInteractionAnalysisSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engine: z.string(),
  rootUrl: z.string(),
  /** Provenance: the site observation this was derived from (path as given). */
  sourceSiteObservationFile: z.string(),
  analyzedAt: z.string(),

  stats: SiteInteractionStatsSchema,

  /** Sorted by `pageId`. */
  pages: z.array(SitePageInteractionSummarySchema),
  /** Task 09 pages excluded from analysis (failed observations). */
  skippedPages: z.array(SkippedPageSchema),

  capabilitySummary: ViewportSplitCountsSchema,
  prioritySummary: PrioritySplitCountsSchema,
  guardSummary: ViewportSplitCountsSchema,

  /** Sorted by `familyId`; empty when the run had no validation samples. */
  validationInteractionComparisons: z.array(ValidationInteractionComparisonSchema),
});
export type SiteInteractionAnalysis = z.infer<
  typeof SiteInteractionAnalysisSchema
>;

// ---------------------------------------------------------------------------
// Signal vocabularies (ONE global policy — never per-site, never per-framework)
// ---------------------------------------------------------------------------

/**
 * Native controls that are interaction candidates on sight.
 *
 * `<option>` is deliberately absent: it is not independently operable, it is
 * changed *through* its `<select>`, and including it would add one candidate per
 * option (hundreds on a country picker) for no new interaction. The `<select>`
 * carries `select` / `open-options` on its behalf.
 *
 * `<a>` is absent too and has its own policy — see {@link NAVIGATION_ANCHOR_NOTE}.
 */
export const NATIVE_INTERACTIVE_TAGS: readonly string[] = [
  "button",
  "input",
  "select",
  "textarea",
  "summary",
];

/**
 * Why a plain `<a href>` is not a candidate: Task 06's link collection already
 * records every anchor and its resolved URL, so re-listing them here would
 * duplicate an existing artifact AND bury the real interaction candidates —
 * a documentation site produces hundreds of navigation anchors and a handful of
 * actual controls. An anchor is admitted only when it carries a NON-navigation
 * interaction signal (role, ARIA state, handler, popovertarget, …).
 */
export const NAVIGATION_ANCHOR_NOTE =
  "normal navigation anchors are covered by links.json, not by interaction candidates";

/** `<input>` types recognized by name; anything else normalizes to `unknown`. */
export const KNOWN_INPUT_TYPES: readonly string[] = [
  "text",
  "search",
  "email",
  "url",
  "tel",
  "number",
  "password",
  "checkbox",
  "radio",
  "range",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "file",
  "button",
  "submit",
  "reset",
  "image",
  "hidden",
];

/** Types whose interaction is "type into it". */
export const EDITABLE_INPUT_TYPES: readonly string[] = [
  "text",
  "search",
  "email",
  "url",
  "tel",
  "number",
  "password",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "unknown", // an invalid `type` renders as a text field in every browser
];

/** Types whose interaction is "flip it". */
export const TOGGLE_INPUT_TYPES: readonly string[] = ["checkbox", "radio"];

/** Types that press like a button. */
export const BUTTON_INPUT_TYPES: readonly string[] = [
  "button",
  "submit",
  "reset",
  "image",
];

/** Types that submit their form when activated. */
export const SUBMIT_INPUT_TYPES: readonly string[] = ["submit", "image"];

/**
 * Normalize an `<input>`'s `type`.
 *  - absent      → `text` (the HTML default)
 *  - known value → itself, lower-cased
 *  - other value → `unknown` (browsers render these as text; the capability
 *                  mapping follows that, but the artifact stays honest about not
 *                  recognizing the token)
 */
export function normalizeInputType(raw: string | undefined): string {
  if (raw === undefined) return "text";
  const value = raw.trim().toLowerCase();
  if (value === "") return "text";
  return KNOWN_INPUT_TYPES.includes(value) ? value : "unknown";
}

/**
 * ARIA roles this detector recognizes, mapped to the capabilities they justify.
 *
 * Scope discipline: a role gives a TRIGGER capability at most. `role=tab` means
 * "this is a tab trigger", never "this page implements the Tabs pattern" — that
 * claim needs an observed state transition, which is Task 11's job.
 */
export const ROLE_CAPABILITIES: Readonly<
  Record<string, readonly InteractionCapability[]>
> = {
  button: ["click"],
  link: ["click"],
  tab: ["click", "tab-trigger"],
  switch: ["click", "toggle", "state-toggle"],
  checkbox: ["click", "toggle"],
  radio: ["click", "toggle"],
  menuitem: ["click"],
  menuitemcheckbox: ["click", "toggle"],
  menuitemradio: ["click", "toggle"],
  combobox: ["click", "open-options", "select"],
  listbox: ["click", "select"],
  option: ["click", "select"],
  slider: ["range-adjust", "drag"],
  spinbutton: ["click", "range-adjust"],
  searchbox: ["click", "edit", "focus"],
  textbox: ["click", "edit", "focus"],
  treeitem: ["click"],
  gridcell: ["click"],
};

/**
 * Roles that name a stateful CONTAINER rather than a trigger. They go into the
 * target inventory, not the candidate list — `role=tablist`, `role=menu` and
 * friends are not things you click, they are things that change.
 */
export const CONTAINER_ROLES: readonly string[] = [
  "dialog",
  "alertdialog",
  "tabpanel",
  "menu",
  "menubar",
  "listbox",
  "tablist",
  "tree",
  "grid",
];

/**
 * Roles admitted as candidates. `listbox` appears in BOTH this list and
 * {@link CONTAINER_ROLES} on purpose: it is a container that is also directly
 * operable, and item 56 explicitly allows an element to be a candidate and a
 * target at once.
 */
export const CANDIDATE_ROLES: readonly string[] = Object.keys(ROLE_CAPABILITIES);

/** ARIA attributes that declare an interactive STATE (each a P1 signal). */
export const ARIA_STATE_ATTRIBUTES: readonly string[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
  "aria-controls",
];

/** ARIA value attributes — evidence for slider/spin controls, never a candidate on their own. */
export const ARIA_VALUE_ATTRIBUTES: readonly string[] = [
  "aria-valuenow",
  "aria-valuemin",
  "aria-valuemax",
];

/** `aria-haspopup` values that name what pops up. */
export const HASPOPUP_MENU_VALUES: readonly string[] = ["true", "menu", "listbox", "tree", "grid"];
export const HASPOPUP_DIALOG_VALUES: readonly string[] = ["dialog"];

/**
 * Inline event-handler attributes recognized as strong evidence. Only the NAME
 * is ever stored (see {@link InteractionEvidenceTypeSchema}).
 */
export const INLINE_HANDLER_ATTRIBUTES: readonly string[] = [
  "onclick",
  "onchange",
  "oninput",
  "onfocus",
  "onblur",
  "onkeydown",
  "onkeyup",
  "onmousedown",
  "onmouseup",
  "onmouseenter",
  "onmouseleave",
  "onmouseover",
  "onmouseout",
  "onpointerdown",
  "onpointerup",
  "ontouchstart",
  "ontouchend",
  "ondragstart",
  "ondragend",
  "onsubmit",
];

/** Handlers whose presence justifies a `click` attempt (vs. focus/keyboard only). */
export const CLICK_HANDLER_ATTRIBUTES: readonly string[] = [
  "onclick",
  "onmousedown",
  "onmouseup",
  "onpointerdown",
  "onpointerup",
  "ontouchstart",
  "ontouchend",
];

/**
 * Keyword vocabulary for generic `data-*` state hints (item 35).
 *
 * A keyword match is the WEAKEST signal in the system and can never create a
 * candidate on its own — it must combine with a real signal (native element,
 * role, ARIA state, inline handler, `tabindex >= 0`, `cursor:pointer`). Matching
 * is on the attribute NAME only, and the value is never stored.
 *
 * This list is generic HTML/UI vocabulary. It contains no framework or library
 * token (`data-radix-*`, `data-headlessui-*`, …) and no site name — those would
 * make the detector's output a property of the framework rather than of the
 * page, which is exactly what this Task forbids.
 */
export const STATE_HINT_KEYWORDS: readonly string[] = [
  "state",
  "open",
  "expanded",
  "selected",
  "active",
  "toggle",
  "trigger",
  "target",
  "controls",
  "dialog",
  "modal",
  "menu",
  "tab",
  "accordion",
  "carousel",
  "slide",
];

/**
 * Attribute names that must never count as a `data-*` state hint even though
 * they contain a keyword: they are ordinary content/analytics attributes.
 * Kept tiny — a long exclusion list would be site-specific tuning by the back
 * door.
 */
export const STATE_HINT_EXCLUDED: readonly string[] = ["data-state-of-the-art"];

/** Whether a `data-*` attribute name looks like a UI state hint. */
export function isStateHintAttribute(name: string): boolean {
  if (!name.startsWith("data-")) return false;
  if (STATE_HINT_EXCLUDED.includes(name)) return false;
  const rest = name.slice("data-".length);
  return STATE_HINT_KEYWORDS.some((keyword) => rest.includes(keyword));
}

/** Href values that are not navigation (`#`, empty, `javascript:` URLs). */
export function isMeaninglessHref(href: string | undefined): boolean {
  if (href === undefined) return true;
  const value = href.trim();
  if (value === "" || value === "#") return true;
  return value.toLowerCase().startsWith("javascript:");
}
