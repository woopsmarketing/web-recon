import type {
  ControlRelationType,
  InteractionCapability,
  InteractionPriority,
} from "../interaction-detector/types.js";
import type { ViewportId } from "../observer/types.js";
import {
  DIFF_CATEGORY_ORDER,
  EXECUTED_STATUSES,
  SAFETY_EVENT_ORDER,
  type ActionStatus,
  type DiffCategory,
  type SafetyEventType,
  type StateChange,
} from "../interaction-explorer/types.js";
import type { LoadedAction } from "./load-exploration.js";
import {
  NAVIGATION_BLOCKING_EVENTS,
  NAVIGATION_TAINT_EVENTS,
  type MutationCategory,
  type ObservedTargetRecord,
} from "./types.js";

/**
 * One Task 11 action, reduced to the facts a rule may reason about (Task 12).
 *
 * This is the single place that reads the raw exploration artifact. Every rule
 * in `rules/` sees ONLY this structure, which buys three things:
 *
 *  - a rule cannot quietly reach for something it should not (page HTML, a class
 *    string, geometry, a mutation VALUE);
 *  - "what evidence exists" is answered once, deterministically, instead of ten
 *    rules each re-deriving it slightly differently;
 *  - a fixture can build `ActionFacts` directly, so a rule is testable without
 *    inventing a whole exploration run.
 *
 * Nothing here interprets. `ariaExpandedTransition` is a fact; "this is an
 * accordion" is a rule's conclusion.
 */

export interface ValueTransition {
  before?: string;
  after?: string;
}

/** A declared controlled region, before and after, as one comparable record. */
export interface TargetFacts {
  relation: ControlRelationType;
  targetDomId?: string;
  existedBefore: boolean;
  existsAfter: boolean;
  mounted: boolean;
  unmounted: boolean;
  visibleBefore?: boolean;
  visibleAfter?: boolean;
  visibilityChanged: boolean;
  becameVisible: boolean;
  tagName?: string;
  role?: string;
  openBefore?: boolean;
  openAfter?: boolean;
  /** Whether Task 11 saw the region's `open` property flip. */
  openChanged: boolean;
  interactiveDescendantsAfter?: number;
  /** Distinct roles counted inside the region after the action, sorted. */
  descendantRolesAfter: string[];
  optionCountAfter: number;
  menuitemCountAfter: number;
  tabCountAfter: number;
}

export interface MutationFacts {
  recordCount: number;
  addedNodeCount: number;
  removedNodeCount: number;
  truncated: boolean;
  classCount: number;
  styleCount: number;
  ariaCount: number;
  stateAttributeCount: number;
  /** Deterministic categories, in {@link MUTATION_CATEGORY_ORDER}. */
  categories: MutationCategory[];
}

export interface ActionFacts {
  actionId: string;
  pageId: string;
  url: string;
  viewport: ViewportId;
  sourceCandidateId: string;
  sourceElementId: string;
  observationFile: string;

  status: ActionStatus;
  /** The physical click really happened. */
  executed: boolean;
  priority: InteractionPriority;
  capabilities: InteractionCapability[];

  trigger: {
    tagName: string;
    role?: string;
    inputType?: string;
    text?: string;
    ariaLabel?: string;
  };

  /** Task 11's own verdict. `true` implies `!urlChanged` by its own rule. */
  meaningfulChange: boolean;
  urlChanged: boolean;
  urlBefore?: string;
  urlAfter?: string;

  /** Present categories, in {@link DIFF_CATEGORY_ORDER}. */
  diffCategories: DiffCategory[];

  /** Candidate attribute transitions, keyed by attribute name. */
  attributeTransitions: Record<string, ValueTransition>;
  /** Candidate boolean-state transitions (`checked` / `selected` / `open`). */
  stateTransitions: Record<string, ValueTransition>;

  candidateRemoved: boolean;
  candidateReplaced: boolean;
  candidateVisibilityChanged: boolean;

  /** Candidate state as captured before / after (stateful vocabulary only). */
  beforeAttributes: Record<string, string>;
  afterAttributes: Record<string, string>;
  beforeState: Record<string, boolean>;
  afterState: Record<string, boolean>;
  beforeExists: boolean;
  afterExists: boolean;
  beforeVisible?: boolean;
  afterVisible?: boolean;

  targets: TargetFacts[];

  /**
   * Task 17 §4 — the explorer's generic user-visible target discovery, reduced
   * to the persisted carriage shape. No RULE reads this (rules keep their
   * closed evidence vocabulary); it rides through to the pattern instance so
   * the SiteSpec compiler can reconstruct what the user actually saw.
   */
  observedTargets: ObservedTargetRecord[];

  /**
   * The native `<details>` open flip this action caused, when there is one.
   * Resolved from the declared `details` relation first, and only then from a
   * container `open-change` under a `<summary>` trigger — so the strongest
   * available anchoring always wins.
   */
  nativeDetailsTransition?: ValueTransition & { source: string };

  containerAdded: number;
  containerRemoved: number;
  containerVisibilityChanged: number;

  mutation: MutationFacts;

  /** Present event types, in {@link SAFETY_EVENT_ORDER}. */
  safetyEvents: SafetyEventType[];
  /** The document moved under the click — no pattern may be built (item 24). */
  navigationTainted: boolean;
  /** A guard stopped the click's real effect (item 32). */
  navigationBlocked: boolean;
}

function transitionsFor(
  changes: readonly StateChange[],
  categories: readonly DiffCategory[],
  subject: StateChange["subject"],
): Record<string, ValueTransition> {
  const out: Record<string, ValueTransition> = {};
  for (const change of changes) {
    if (change.subject !== subject) continue;
    if (!categories.includes(change.category)) continue;
    if (!change.field) continue;
    out[change.field] = {
      ...(change.before !== undefined ? { before: change.before } : {}),
      ...(change.after !== undefined ? { after: change.after } : {}),
    };
  }
  return out;
}

function boolOf(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function buildMutationFacts(action: LoadedAction): MutationFacts {
  const summary = action.observation.mutationSummary;
  const counts = summary?.attributeNameCounts ?? {};
  const classCount = counts["class"] ?? 0;
  const styleCount = counts["style"] ?? 0;
  let ariaCount = 0;
  let stateAttributeCount = 0;
  for (const [name, n] of Object.entries(counts)) {
    if (name === "class" || name === "style") continue;
    if (name.startsWith("aria-")) ariaCount += n;
    else stateAttributeCount += n;
  }
  const addedNodeCount = summary?.addedNodeCount ?? 0;
  const removedNodeCount = summary?.removedNodeCount ?? 0;

  const categories: MutationCategory[] = [];
  if (classCount > 0) categories.push("class");
  if (styleCount > 0) categories.push("style");
  if (ariaCount > 0) categories.push("aria");
  if (stateAttributeCount > 0) categories.push("state-attribute");
  if (addedNodeCount > 0) categories.push("nodes-added");
  if (removedNodeCount > 0) categories.push("nodes-removed");

  return {
    recordCount: summary?.recordCount ?? 0,
    addedNodeCount,
    removedNodeCount,
    truncated: summary?.truncated ?? false,
    classCount,
    styleCount,
    ariaCount,
    stateAttributeCount,
    categories,
  };
}

function buildTargetFacts(action: LoadedAction): TargetFacts[] {
  const before = action.observation.before?.targets ?? [];
  const after = action.observation.after?.targets ?? [];
  // Positional pairing is exact: both snapshots are built from the SAME stored
  // `controls[]` array, in the same order (Task 11 `diff-state.ts`).
  const count = Math.max(before.length, after.length);
  const facts: TargetFacts[] = [];
  for (let i = 0; i < count; i++) {
    const b = before[i];
    const a = after[i];
    if (!b && !a) continue;
    const rel = (a ?? b)!;
    const existedBefore = b?.resolved ?? false;
    const existsAfter = a?.resolved ?? false;
    const visibleBefore = b?.element.visible;
    const visibleAfter = a?.element.visible;
    const openBefore = b?.element.state?.open;
    const openAfter = a?.element.state?.open;
    const descendants = a?.descendants;
    const roles = new Set<string>();
    for (const sample of descendants?.samples ?? []) {
      if (sample.role) roles.add(sample.role);
    }
    facts.push({
      relation: rel.relation,
      ...(rel.targetDomId !== undefined ? { targetDomId: rel.targetDomId } : {}),
      existedBefore,
      existsAfter,
      mounted: !existedBefore && existsAfter,
      unmounted: existedBefore && !existsAfter,
      ...(visibleBefore !== undefined ? { visibleBefore } : {}),
      ...(visibleAfter !== undefined ? { visibleAfter } : {}),
      visibilityChanged:
        existedBefore && existsAfter && visibleBefore !== visibleAfter,
      becameVisible:
        (!existedBefore && existsAfter && visibleAfter === true) ||
        (existedBefore && existsAfter && visibleBefore === false && visibleAfter === true),
      ...(a?.element.tagName !== undefined
        ? { tagName: a.element.tagName }
        : b?.element.tagName !== undefined
          ? { tagName: b.element.tagName }
          : {}),
      ...(a?.element.role !== undefined
        ? { role: a.element.role }
        : b?.element.role !== undefined
          ? { role: b.element.role }
          : {}),
      ...(openBefore !== undefined ? { openBefore } : {}),
      ...(openAfter !== undefined ? { openAfter } : {}),
      openChanged:
        openBefore !== undefined && openAfter !== undefined && openBefore !== openAfter,
      ...(descendants ? { interactiveDescendantsAfter: descendants.total } : {}),
      descendantRolesAfter: [...roles].sort(),
      optionCountAfter: descendants?.optionCount ?? 0,
      menuitemCountAfter: descendants?.menuitemCount ?? 0,
      tabCountAfter: descendants?.tabCount ?? 0,
    });
  }
  return facts;
}

/** Task 17 §4 — reduce discovered targets to the persisted carriage shape. */
function buildObservedTargetRecords(action: LoadedAction): ObservedTargetRecord[] {
  const discovered = action.observation.discoveredTargets ?? [];
  return discovered.map((target) => ({
    discoveryId: target.discoveryId,
    kind: target.kind,
    direction: target.direction,
    descriptor: { ...target.descriptor },
    relationEvidence: target.relationEvidence.map((entry) => ({ ...entry })),
    before: { ...target.before },
    after: { ...target.after },
    mountedDescendantCount: target.mountedDescendantCount,
    ...(target.textSample !== undefined ? { textSample: target.textSample } : {}),
    textLength: target.textLength,
    hasCapturedSubtree: target.capturedSubtree !== undefined,
    ...(target.capturedSubtree?.expanded ? { captureExpanded: true } : {}),
    provenance: "observed",
  }));
}

/** Reduce one loaded action to the deterministic fact set rules may read. */
export function buildActionFacts(action: LoadedAction): ActionFacts {
  const { observation } = action;
  const diff = observation.diff;
  const changes = diff?.changes ?? [];
  const descriptor = observation.locatorResolution.locatorDescriptor;

  const diffCategories = DIFF_CATEGORY_ORDER.filter(
    (category) => (diff?.categoryCounts[category] ?? 0) > 0,
  );
  const safetyEvents = SAFETY_EVENT_ORDER.filter((type) =>
    observation.safetyEvents.some((event) => event.type === type),
  );

  const targets = buildTargetFacts(action);

  // Native `<details>`: anchor on the DECLARED relation first. Only when the
  // trigger is a real `<summary>` (whose `<details>` Task 10 always records as a
  // relation) is a container-level `open-change` accepted instead, so a stray
  // `<details>` flipping elsewhere on the page can never be attributed here.
  let nativeDetailsTransition: ActionFacts["nativeDetailsTransition"];
  const detailsTarget = targets.find((t) => t.relation === "details" && t.openChanged);
  if (detailsTarget) {
    nativeDetailsTransition = {
      before: String(detailsTarget.openBefore),
      after: String(detailsTarget.openAfter),
      source: "diff.changes[open-change:target:details]",
    };
  } else if (descriptor.tagName === "summary") {
    const containerOpen = changes.filter(
      (c) => c.category === "open-change" && c.subject === "container",
    );
    if (containerOpen.length === 1 && containerOpen[0]!.before !== containerOpen[0]!.after) {
      nativeDetailsTransition = {
        ...(containerOpen[0]!.before !== undefined
          ? { before: containerOpen[0]!.before }
          : {}),
        ...(containerOpen[0]!.after !== undefined ? { after: containerOpen[0]!.after } : {}),
        source: "diff.changes[open-change:container]",
      };
    }
  }

  const beforeCandidate = observation.before?.candidate;
  const afterCandidate = observation.after?.candidate;

  const countCategory = (category: DiffCategory): number =>
    diff?.categoryCounts[category] ?? 0;

  const navigationTainted =
    (diff?.urlChanged ?? false) ||
    safetyEvents.some((type) => NAVIGATION_TAINT_EVENTS.includes(type));

  return {
    actionId: observation.actionId,
    pageId: observation.pageId,
    url: observation.url,
    viewport: observation.viewportId,
    sourceCandidateId: observation.sourceCandidateId,
    sourceElementId: observation.sourceElementId,
    observationFile: action.observationFile,

    status: observation.status,
    executed: EXECUTED_STATUSES.includes(observation.status),
    priority: observation.priority,
    capabilities: [...observation.capabilities],

    trigger: {
      tagName: descriptor.tagName,
      ...(descriptor.role !== undefined ? { role: descriptor.role } : {}),
      ...(descriptor.inputType !== undefined ? { inputType: descriptor.inputType } : {}),
      ...(descriptor.text !== undefined ? { text: descriptor.text } : {}),
      ...(descriptor.ariaLabel !== undefined ? { ariaLabel: descriptor.ariaLabel } : {}),
    },

    meaningfulChange: diff?.meaningfulChange ?? false,
    urlChanged: diff?.urlChanged ?? false,
    ...(observation.before?.url !== undefined ? { urlBefore: observation.before.url } : {}),
    ...(observation.after?.url !== undefined ? { urlAfter: observation.after.url } : {}),

    diffCategories,

    attributeTransitions: transitionsFor(
      changes,
      ["candidate-attribute-change"],
      "candidate",
    ),
    stateTransitions: transitionsFor(
      changes,
      ["checked-change", "selected-change", "open-change"],
      "candidate",
    ),

    candidateRemoved: countCategory("candidate-removed") > 0,
    candidateReplaced: countCategory("candidate-replaced") > 0,
    candidateVisibilityChanged: countCategory("candidate-visibility-change") > 0,

    beforeAttributes: { ...(beforeCandidate?.attributes ?? {}) },
    afterAttributes: { ...(afterCandidate?.attributes ?? {}) },
    beforeState: { ...(beforeCandidate?.state ?? {}) } as Record<string, boolean>,
    afterState: { ...(afterCandidate?.state ?? {}) } as Record<string, boolean>,
    beforeExists: beforeCandidate?.exists ?? false,
    afterExists: afterCandidate?.exists ?? false,
    ...(beforeCandidate?.visible !== undefined ? { beforeVisible: beforeCandidate.visible } : {}),
    ...(afterCandidate?.visible !== undefined ? { afterVisible: afterCandidate.visible } : {}),

    targets,
    observedTargets: buildObservedTargetRecords(action),
    ...(nativeDetailsTransition ? { nativeDetailsTransition } : {}),

    containerAdded: countCategory("container-added"),
    containerRemoved: countCategory("container-removed"),
    containerVisibilityChanged: countCategory("container-visibility-change"),

    mutation: buildMutationFacts(action),

    safetyEvents,
    navigationTainted,
    navigationBlocked: safetyEvents.some((type) =>
      NAVIGATION_BLOCKING_EVENTS.includes(type),
    ),
  };
}

/** True/false transition helper shared by the rules. */
export function booleanTransition(
  transition: ValueTransition | undefined,
): { before: boolean; after: boolean } | undefined {
  if (!transition) return undefined;
  const before = boolOf(transition.before);
  const after = boolOf(transition.after);
  if (before === undefined || after === undefined || before === after) return undefined;
  return { before, after };
}
