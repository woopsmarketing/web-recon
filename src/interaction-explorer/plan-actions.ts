import type { ViewportId } from "../observer/types.js";
import {
  GUARD_FLAG_ORDER,
  type GuardFlag,
  type InteractionCandidate,
  type InteractionTarget,
  type SiteInteractionAnalysis,
  type ValidationInteractionComparison,
  type ViewportInteractionAnalysis,
} from "../interaction-detector/types.js";
import { buildLocatorDescriptor } from "./build-locator.js";
import type { LoadedCandidatePage, LoadedInteractionAnalysis } from "./load-analysis.js";
import {
  ELIGIBLE_P1_CAPABILITIES,
  ELIGIBLE_P1_EVIDENCE,
  ELIGIBLE_P2_INPUT_TYPES,
  EXCLUDED_GUARD_FLAGS,
  ICON_CONTROL_TEXT_MAX_LEN,
  MAX_ACTIONS_PER_PAGE,
  MAX_ACTIONS_PER_SITE,
  MAX_ACTIONS_PER_VIEWPORT,
  MAX_VALIDATION_PAGES_PER_SITE,
  PRIORITY_RANK,
  SKIP_REASON_ORDER,
  type InteractionActionPlan,
  type SkipReason,
  type SkippedCandidate,
} from "./types.js";

/**
 * Deterministic offline action planning (Task 11, items 9–19).
 *
 * Task 10 was a stage that threw nothing away — 3,106 candidates across four
 * sites, on purpose. This stage cannot behave that way: every action is a real
 * page load and a real click on somebody else's site, so it must choose. The
 * whole of that choice happens here, before a browser exists, and it is written
 * down in `interaction-plan.json` so it can be argued with:
 *
 *   candidates
 *     → eligibility     guards, hidden, priority, capability   (items 11–14)
 *     → shape dedup     one representative per interaction shape (item 16)
 *     → budget          per viewport / per page / per site      (item 18)
 *     → actionId        assigned after a stable sort            (item 63)
 *
 * Four properties this module is built around:
 *
 *  - **Nothing is discarded.** Every non-planned candidate lands in `skipped[]`
 *    with a reason. "3,106 → N actions" must be a traceable reduction, not a
 *    number that appeared.
 *  - **No timestamps.** A plan is a pure function of its input (item 9), so two
 *    runs against the same analysis produce byte-identical plans.
 *  - **No site-specific rule.** There is no host check, no framework check and
 *    no class-name check in this file. A conservative allowance exists for
 *    icon-only native buttons (item 11) because mobile hamburgers are a global
 *    HTML shape, not because two of the test sites have one.
 *  - **Input order cannot matter.** Candidates are sorted by their own id before
 *    anything is decided (item 90).
 */

// ---------------------------------------------------------------------------
// Eligibility (items 11–14)
// ---------------------------------------------------------------------------

export type EligibilityVerdict =
  | { eligible: true; reason: string }
  | { eligible: false; skip: SkipReason; guardFlags?: GuardFlag[] };

/**
 * A native `<button>` with no meaningful text, no submit semantics and no
 * navigation guard — the shape a hamburger, a close button or a theme switch
 * takes when its label is an inline `<svg>`.
 *
 * This is the ONE conservative widening of P2 (item 11). Without it, seoworld's
 * mobile menu (a bare `<button>` with an empty text node and no ARIA at all)
 * could never be explored, and the explorer would silently under-report mobile
 * navigation on every site built that way. It is expressed purely in terms of
 * HTML: tag, text length, and the absence of the dangerous guards.
 */
function isIconControlButton(candidate: InteractionCandidate): boolean {
  if (candidate.tagName !== "button") return false;
  if (candidate.submitCapable) return false;
  const text = candidate.text?.trim() ?? "";
  return text.length <= ICON_CONTROL_TEXT_MAX_LEN;
}

/**
 * Decide whether ONE stored candidate may be clicked live.
 *
 * The order of the tests is part of the policy: the dangerous guards are
 * checked first so a `form-submit` candidate can never be reported as merely
 * "hidden", and P3 is refused before any capability reasoning so the heuristic
 * tier has exactly one recorded reason (item 13).
 */
export function candidateEligibility(
  candidate: InteractionCandidate,
): EligibilityVerdict {
  const excluded = GUARD_FLAG_ORDER.filter(
    (g) => EXCLUDED_GUARD_FLAGS.includes(g) && candidate.guardFlags.includes(g),
  );
  if (excluded.length > 0) {
    return { eligible: false, skip: "guard", guardFlags: excluded };
  }

  // Hidden candidates are preserved, never executed (item 14). A control that
  // is `display:none` right now may well become operable after some OTHER
  // interaction — that is a later stage's problem, not a reason to forget it.
  if (
    !candidate.initialState.effectiveVisible ||
    candidate.guardFlags.includes("hidden")
  ) {
    return { eligible: false, skip: "hidden" };
  }

  if (candidate.priority === "P3") {
    return { eligible: false, skip: "priority" };
  }

  if (candidate.priority === "P1") {
    const byCapability = candidate.capabilities.some((c) =>
      ELIGIBLE_P1_CAPABILITIES.includes(c),
    );
    const byEvidence = candidate.evidence.some((e) =>
      ELIGIBLE_P1_EVIDENCE.includes(e.type),
    );
    if (byCapability) {
      const named = candidate.capabilities.filter((c) =>
        ELIGIBLE_P1_CAPABILITIES.includes(c),
      );
      return { eligible: true, reason: `P1 ${named.join("+")}` };
    }
    if (byEvidence) {
      const named = candidate.evidence
        .filter((e) => ELIGIBLE_P1_EVIDENCE.includes(e.type))
        .map((e) => e.type);
      return { eligible: true, reason: `P1 evidence ${named.join("+")}` };
    }
    return { eligible: false, skip: "capability" };
  }

  // P2 is deliberately narrow (item 11): checkboxes, radios, and icon buttons.
  if (
    candidate.inputType !== undefined &&
    ELIGIBLE_P2_INPUT_TYPES.includes(candidate.inputType)
  ) {
    return { eligible: true, reason: `P2 input[type=${candidate.inputType}]` };
  }
  if (isIconControlButton(candidate)) {
    return { eligible: true, reason: "P2 icon-only native button" };
  }
  return { eligible: false, skip: "capability" };
}

// ---------------------------------------------------------------------------
// Interaction shape (items 16–17)
// ---------------------------------------------------------------------------

const ARIA_STATE_EVIDENCE: readonly string[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
];

/**
 * The ARIA state VALUES, not just their presence.
 *
 * This is what makes `aria-expanded=false` and `aria-expanded=true` two
 * different shapes (item 17): an accordion page usually has both a closed and an
 * open item, and clicking one of each observes the opening AND the closing
 * transition for the price of two actions. Collapsing them would halve the
 * evidence and hide the asymmetric cases where only one direction works.
 */
function ariaStateSignature(candidate: InteractionCandidate): string {
  const parts: string[] = [];
  for (const name of ARIA_STATE_EVIDENCE) {
    const evidence = candidate.evidence.find((e) => e.type === name);
    if (evidence) parts.push(`${name}=${evidence.value ?? ""}`);
  }
  return parts.length > 0 ? parts.join(",") : "-";
}

/**
 * The trigger→target relationship, described by what the target IS rather than
 * by which id it has. Ids are generated on many sites, so keying on them would
 * turn twenty identical Radix menu triggers into twenty distinct shapes.
 */
function controlSignature(
  candidate: InteractionCandidate,
  targetsByElementId: Map<string, InteractionTarget>,
): string {
  if (candidate.controls.length === 0) return "none";
  return [...candidate.controls]
    .map((relation) => {
      const target = relation.targetElementId
        ? targetsByElementId.get(relation.targetElementId)
        : undefined;
      return [
        relation.relation,
        relation.resolved ? "resolved" : "unresolved",
        target?.tagName ?? "",
        target?.role ?? "",
        target ? (target.effectiveVisible ? "visible" : "hidden") : "",
      ].join(":");
    })
    .sort()
    .join(";");
}

/**
 * The deterministic interaction shape (item 16).
 *
 * MDN's `<summary>` elements are the reason this exists: one reference page can
 * hold seventy of them, structurally identical, all closed. Clicking all
 * seventy would be seventy page loads to learn one fact. One representative per
 * shape learns the same thing; the other sixty-nine are recorded as
 * `shape-duplicate` and point at the representative that stood in for them.
 */
export function shapeKeyOf(
  candidate: InteractionCandidate,
  targetsByElementId: Map<string, InteractionTarget>,
): string {
  return [
    candidate.priority,
    candidate.tagName,
    candidate.role ?? "-",
    candidate.inputType ?? "-",
    candidate.capabilities.join("+"),
    ariaStateSignature(candidate),
    controlSignature(candidate, targetsByElementId),
    candidate.guardFlags.length > 0 ? candidate.guardFlags.join("+") : "-",
  ].join("|");
}

// ---------------------------------------------------------------------------
// Page selection (item 19)
// ---------------------------------------------------------------------------

export interface PlannedPageSelection {
  pageId: string;
  selectionReason: string;
}

function comparisonDiffers(
  comparison: ValidationInteractionComparison,
): boolean {
  for (const viewport of [comparison.desktop, comparison.mobile]) {
    if (
      viewport.totalDifference !== 0 ||
      viewport.p1Difference !== 0 ||
      viewport.p2Difference !== 0 ||
      viewport.p3Difference !== 0 ||
      Object.keys(viewport.capabilityDifferences).length > 0
    ) {
      return true;
    }
  }
  return false;
}

function describeComparison(
  comparison: ValidationInteractionComparison,
): string {
  const part = (label: string, v: ValidationInteractionComparison["desktop"]): string =>
    `${label} Δtotal ${v.totalDifference >= 0 ? "+" : ""}${v.totalDifference}` +
    ` ΔP1 ${v.p1Difference >= 0 ? "+" : ""}${v.p1Difference}` +
    ` ΔP2 ${v.p2Difference >= 0 ? "+" : ""}${v.p2Difference}` +
    ` ΔP3 ${v.p3Difference >= 0 ? "+" : ""}${v.p3Difference}` +
    ` Δcapabilities ${Object.keys(v.capabilityDifferences).length}`;
  return `${part("desktop", comparison.desktop)}; ${part("mobile", comparison.mobile)}`;
}

/**
 * Which pages the plan covers.
 *
 * Every Task 09 `representative` is explored — that is the production output.
 * A `validation-sample` is explored ONLY when Task 10 already measured a
 * difference between it and its representative: if the two pages produced the
 * same priority counts and the same capability vector, a live run would spend
 * browser time re-confirming a number that is already on disk. The rule is
 * exact equality on the measurement, never a threshold, and it is capped at
 * {@link MAX_VALIDATION_PAGES_PER_SITE} per site (item 19).
 */
export function selectPlanPages(
  analysis: SiteInteractionAnalysis,
): PlannedPageSelection[] {
  const selected: PlannedPageSelection[] = analysis.pages
    .filter((p) => p.role === "representative")
    .map((p) => ({
      pageId: p.pageId,
      selectionReason: `representative of ${p.familyId} (${p.familyType})`,
    }));

  const analyzedIds = new Set(analysis.pages.map((p) => p.pageId));
  const eligible = [...analysis.validationInteractionComparisons]
    .filter((c) => analyzedIds.has(c.samplePageId) && comparisonDiffers(c))
    .sort((a, b) => (a.familyId < b.familyId ? -1 : a.familyId > b.familyId ? 1 : 0))
    .slice(0, MAX_VALIDATION_PAGES_PER_SITE);

  for (const comparison of eligible) {
    selected.push({
      pageId: comparison.samplePageId,
      selectionReason:
        `validation-sample: interaction signature differs from ` +
        `${comparison.representativePageId} (${describeComparison(comparison)})`,
    });
  }

  return selected.sort((a, b) =>
    a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0,
  );
}

// ---------------------------------------------------------------------------
// Per-viewport planning
// ---------------------------------------------------------------------------

/** A planned action before ids and site-level budgets are applied. */
interface DraftAction {
  pageId: string;
  viewportId: ViewportId;
  candidate: InteractionCandidate;
  shapeKey: string;
  shapeMemberCount: number;
  reason: string;
  page: LoadedCandidatePage;
}

const VIEWPORT_ORDER: readonly ViewportId[] = ["desktop", "mobile"];

function compareCandidateIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Eligibility → shape dedup → per-viewport budget, for ONE viewport.
 *
 * Candidates are sorted by id first so the outcome cannot depend on the order
 * they happen to sit in the file (item 90); the representative of a shape is
 * always the lowest candidate id in it (item 16).
 */
function planViewport(
  page: LoadedCandidatePage,
  viewportId: ViewportId,
  viewport: ViewportInteractionAnalysis,
  skipped: SkippedCandidate[],
): { actions: DraftAction[]; eligibleCount: number; shapeGroups: number; dedupedCount: number } {
  const targetsByElementId = new Map(
    viewport.targets.map((t) => [t.elementId, t]),
  );
  const candidates = [...viewport.candidates].sort((a, b) =>
    compareCandidateIds(a.id, b.id),
  );

  const eligible: { candidate: InteractionCandidate; reason: string; shapeKey: string }[] = [];
  for (const candidate of candidates) {
    const verdict = candidateEligibility(candidate);
    if (!verdict.eligible) {
      skipped.push({
        pageId: page.pageId,
        viewportId,
        candidateId: candidate.id,
        elementId: candidate.elementId,
        priority: candidate.priority,
        reason: verdict.skip,
        ...(verdict.guardFlags ? { guardFlags: verdict.guardFlags } : {}),
      });
      continue;
    }
    eligible.push({
      candidate,
      reason: verdict.reason,
      shapeKey: shapeKeyOf(candidate, targetsByElementId),
    });
  }

  // Group by shape, keeping first-seen order (= lowest candidate id first).
  const groups = new Map<string, typeof eligible>();
  for (const entry of eligible) {
    const group = groups.get(entry.shapeKey);
    if (group) group.push(entry);
    else groups.set(entry.shapeKey, [entry]);
  }

  let dedupedCount = 0;
  const representatives: DraftAction[] = [];
  for (const [shapeKey, group] of groups) {
    const [first, ...rest] = group;
    representatives.push({
      pageId: page.pageId,
      viewportId,
      candidate: first.candidate,
      shapeKey,
      shapeMemberCount: group.length,
      reason: first.reason,
      page,
    });
    for (const duplicate of rest) {
      dedupedCount++;
      skipped.push({
        pageId: page.pageId,
        viewportId,
        candidateId: duplicate.candidate.id,
        elementId: duplicate.candidate.elementId,
        priority: duplicate.candidate.priority,
        reason: "shape-duplicate",
        representativeCandidateId: first.candidate.id,
      });
    }
  }

  representatives.sort((a, b) => {
    const rank = PRIORITY_RANK[a.candidate.priority] - PRIORITY_RANK[b.candidate.priority];
    if (rank !== 0) return rank;
    return compareCandidateIds(a.candidate.id, b.candidate.id);
  });

  const kept = representatives.slice(0, MAX_ACTIONS_PER_VIEWPORT);
  for (const overflow of representatives.slice(MAX_ACTIONS_PER_VIEWPORT)) {
    skipped.push({
      pageId: page.pageId,
      viewportId,
      candidateId: overflow.candidate.id,
      elementId: overflow.candidate.elementId,
      priority: overflow.candidate.priority,
      reason: "budget",
    });
  }

  return {
    actions: kept,
    eligibleCount: eligible.length,
    shapeGroups: groups.size,
    dedupedCount,
  };
}

// ---------------------------------------------------------------------------
// Site planning
// ---------------------------------------------------------------------------

export interface PlanPageResult {
  pageId: string;
  url: string;
  desktopActions: number;
  mobileActions: number;
}

export interface PlannedSite {
  actions: InteractionActionPlan[];
  skipped: SkippedCandidate[];
  totalCandidates: number;
  eligibleCandidates: number;
  shapeGroups: number;
  deduplicatedByShape: number;
  pageActionCounts: Map<string, { desktop: number; mobile: number }>;
}

/**
 * Turn every loaded page into the final, id-assigned action list.
 *
 * Budgets are applied in three layers with distinct jobs. The per-viewport cap
 * stops one enormous page from consuming a site's whole allowance. The per-page
 * cap is a defensive backstop (with a viewport cap of 8 it can only bind if that
 * constant is raised). The site cap is applied to a list sorted by PRIORITY
 * first, so when a site is truncated it loses its weakest evidence rather than
 * its last pages: every P1 in the site is planned before any P2 anywhere.
 *
 * Action ids are then assigned by a completely separate, stable sort — page,
 * viewport, candidate id — so `ia000007` means the same action whether or not
 * the budget bound (item 63).
 */
export function planSiteActions(
  loadedPages: readonly LoadedCandidatePage[],
): PlannedSite {
  const skipped: SkippedCandidate[] = [];
  const perPage: { pageId: string; drafts: DraftAction[] }[] = [];

  let totalCandidates = 0;
  let eligibleCandidates = 0;
  let shapeGroups = 0;
  let deduplicatedByShape = 0;

  for (const page of loadedPages) {
    const drafts: DraftAction[] = [];
    for (const viewportId of VIEWPORT_ORDER) {
      const viewport = page.candidates.viewports[viewportId];
      totalCandidates += viewport.candidates.length;
      const result = planViewport(page, viewportId, viewport, skipped);
      eligibleCandidates += result.eligibleCount;
      shapeGroups += result.shapeGroups;
      deduplicatedByShape += result.dedupedCount;
      drafts.push(...result.actions);
    }

    // Per-page cap (item 18): desktop first, then mobile, both already in
    // (priority, candidateId) order within their viewport.
    const kept = drafts.slice(0, MAX_ACTIONS_PER_PAGE);
    for (const overflow of drafts.slice(MAX_ACTIONS_PER_PAGE)) {
      skipped.push({
        pageId: overflow.pageId,
        viewportId: overflow.viewportId,
        candidateId: overflow.candidate.id,
        elementId: overflow.candidate.elementId,
        priority: overflow.candidate.priority,
        reason: "budget",
      });
    }
    perPage.push({ pageId: page.pageId, drafts: kept });
  }

  // Site cap (item 18) — priority first, so truncation costs the weakest
  // evidence rather than the alphabetically-last pages.
  const all = perPage.flatMap((p) => p.drafts);
  const byPriority = [...all].sort((a, b) => {
    const rank = PRIORITY_RANK[a.candidate.priority] - PRIORITY_RANK[b.candidate.priority];
    if (rank !== 0) return rank;
    if (a.pageId !== b.pageId) return a.pageId < b.pageId ? -1 : 1;
    const viewport =
      VIEWPORT_ORDER.indexOf(a.viewportId) - VIEWPORT_ORDER.indexOf(b.viewportId);
    if (viewport !== 0) return viewport;
    return compareCandidateIds(a.candidate.id, b.candidate.id);
  });

  const selected = new Set(byPriority.slice(0, MAX_ACTIONS_PER_SITE));
  for (const overflow of byPriority.slice(MAX_ACTIONS_PER_SITE)) {
    skipped.push({
      pageId: overflow.pageId,
      viewportId: overflow.viewportId,
      candidateId: overflow.candidate.id,
      elementId: overflow.candidate.elementId,
      priority: overflow.candidate.priority,
      reason: "budget",
    });
  }

  // Final ordering + ids: stable, and independent of how the budget landed.
  const ordered = all
    .filter((draft) => selected.has(draft))
    .sort((a, b) => {
      if (a.pageId !== b.pageId) return a.pageId < b.pageId ? -1 : 1;
      const viewport =
        VIEWPORT_ORDER.indexOf(a.viewportId) - VIEWPORT_ORDER.indexOf(b.viewportId);
      if (viewport !== 0) return viewport;
      return compareCandidateIds(a.candidate.id, b.candidate.id);
    });

  const pageActionCounts = new Map<string, { desktop: number; mobile: number }>();
  const actions: InteractionActionPlan[] = ordered.map((draft, index) => {
    const counts = pageActionCounts.get(draft.pageId) ?? { desktop: 0, mobile: 0 };
    counts[draft.viewportId]++;
    pageActionCounts.set(draft.pageId, counts);

    const dom = draft.page.viewports[draft.viewportId];
    const candidate = draft.candidate;
    return {
      actionId: `ia${String(index + 1).padStart(6, "0")}`,
      pageId: draft.pageId,
      url: draft.page.url,
      pageRole: draft.page.candidates.role,
      familyId: draft.page.candidates.familyId,
      familyType: draft.page.candidates.familyType,
      viewportId: draft.viewportId,

      sourceCandidateId: candidate.id,
      sourceElementId: candidate.elementId,
      sourceInteractionCandidatesFile: draft.page.candidatesFileRelative,

      priority: candidate.priority,
      capabilities: candidate.capabilities,
      guardFlags: candidate.guardFlags,

      actionType: "click" as const,
      planReason:
        `${draft.reason}; representative of ${draft.shapeMemberCount} ` +
        `candidate(s) with this interaction shape`,
      shapeKey: draft.shapeKey,
      shapeMemberCount: draft.shapeMemberCount,

      locatorDescriptor: buildLocatorDescriptor(candidate, dom),
      controls: candidate.controls.map((relation) => ({
        relation: relation.relation,
        ...(relation.targetDomId !== undefined
          ? { targetDomId: relation.targetDomId }
          : {}),
        storedResolved: relation.resolved,
      })),
      storedInitialState: {
        effectiveVisible: candidate.initialState.effectiveVisible,
        disabled: candidate.initialState.disabled,
        readonly: candidate.initialState.readonly,
        initiallyOperable: candidate.initialState.initiallyOperable,
      },
    };
  });

  skipped.sort((a, b) => {
    if (a.pageId !== b.pageId) return a.pageId < b.pageId ? -1 : 1;
    const viewport =
      VIEWPORT_ORDER.indexOf(a.viewportId) - VIEWPORT_ORDER.indexOf(b.viewportId);
    if (viewport !== 0) return viewport;
    return compareCandidateIds(a.candidateId, b.candidateId);
  });

  return {
    actions,
    skipped,
    totalCandidates,
    eligibleCandidates,
    shapeGroups,
    deduplicatedByShape,
    pageActionCounts,
  };
}

/** Non-zero skip counts, in fixed vocabulary order (never Map order). */
export function skipReasonCounts(
  skipped: readonly SkippedCandidate[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of SKIP_REASON_ORDER) {
    const n = skipped.filter((s) => s.reason === reason).length;
    if (n > 0) counts[reason] = n;
  }
  return counts;
}

/** Skips caused by policy rather than by a budget ceiling (item 64 stats). */
export function skippedByPolicyCount(
  skipped: readonly SkippedCandidate[],
): number {
  return skipped.filter((s) => s.reason !== "budget").length;
}

export type { LoadedInteractionAnalysis };
