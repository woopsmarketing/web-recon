import type { ElementObservation, StyleTable, ViewportId } from "../observer/types.js";
import {
  buildElementIndex,
  extractSignals,
  hasAriaStateSignal,
  hasPointerCursor,
  isPointerOperable,
  sortEvidence,
  type ElementIndex,
  type ElementSignals,
} from "./classify-signals.js";
import {
  isStatefulContainer,
  resolveControlRelations,
  TargetCollector,
} from "./detect-targets.js";
import {
  BUTTON_INPUT_TYPES,
  CANDIDATE_TEXT_MAX_LEN,
  CAPABILITY_ORDER,
  CLICK_HANDLER_ATTRIBUTES,
  EDITABLE_INPUT_TYPES,
  GUARD_FLAG_ORDER,
  HASPOPUP_DIALOG_VALUES,
  HASPOPUP_MENU_VALUES,
  NATIVE_INTERACTIVE_TAGS,
  ROLE_CAPABILITIES,
  SUBMIT_INPUT_TYPES,
  TOGGLE_INPUT_TYPES,
  type CandidateInitialState,
  type GuardFlag,
  type InteractionCandidate,
  type InteractionCapability,
  type InteractionEvidence,
  type InteractionPriority,
  type PriorityCounts,
  type ViewportInteractionAnalysis,
  type ViewportInteractionStats,
} from "./types.js";

/**
 * Candidate detection for ONE viewport (Task 10, items 9–40, 54–56).
 *
 * The whole stage is a pure function of stored data:
 *
 *   dom.json + styles.json  →  candidates[] + targets[] + stats
 *
 * No browser, no network, no AI, and no mutation of the input. Running it twice
 * on the same observation produces byte-identical output — element ids are
 * assigned in document order by the Observer, and every list here is sorted by a
 * fixed vocabulary rather than by iteration order.
 *
 * ## Element → at most ONE candidate
 *
 * A `<button role="button" aria-expanded aria-controls onclick>` with
 * `cursor:pointer` is FIVE signals and exactly ONE candidate, carrying all five
 * as evidence and the highest priority any of them justifies (item 87). Emitting
 * one candidate per signal would make every count meaningless.
 *
 * ## The `cursor:pointer` inheritance trap
 *
 * `cursor` is an INHERITED CSS property. A single `cursor:pointer` on a card
 * gives every `<span>`, `<div>` and `<svg>` inside it the same computed value,
 * and every `<a>` gets it from the UA stylesheet — so a naive
 * "cursor:pointer ⇒ candidate" rule turns one clickable card into forty
 * candidates and buries the real controls (item 98).
 *
 * The heuristic therefore fires only on the **pointer-cursor root**: an element
 * whose nearest observed ancestor does NOT also compute to `cursor:pointer`.
 * That is the element the author actually made clickable; its descendants merely
 * inherited the look. This is a global CSS fact, not a per-site threshold.
 */

/** Everything one viewport needs to be analyzed. */
export interface ViewportDetectionInput {
  viewportId: ViewportId;
  elements: readonly ElementObservation[];
  styleTable: StyleTable;
  /** Paths relative to the page directory, echoed into the artifact. */
  domFile: string;
  stylesFile: string;
  /** Observed final URL — used only to classify a link as external. */
  pageUrl: string;
}

/** Round to 4 decimals, like every other rate in this codebase. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** `ic000001…`, deterministic within one viewport. */
function candidateId(index: number): string {
  return "ic" + String(index).padStart(6, "0");
}

/** Whether a resolved href points at a different host than the page. */
function isExternalHref(href: string, pageUrl: string): boolean {
  try {
    const target = new URL(href, pageUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;
    return target.host !== new URL(pageUrl).host;
  } catch {
    return false;
  }
}

/** Accumulates a candidate's capabilities without duplicates. */
class CapabilitySet {
  private readonly set = new Set<InteractionCapability>();

  add(...capabilities: readonly InteractionCapability[]): void {
    for (const capability of capabilities) this.set.add(capability);
  }

  get size(): number {
    return this.set.size;
  }

  /** Sorted by the canonical vocabulary order, never by insertion order. */
  build(): InteractionCapability[] {
    return CAPABILITY_ORDER.filter((capability) => this.set.has(capability));
  }
}

/**
 * Capabilities implied by a native `<input>`'s type.
 *
 * `hidden` never reaches here — it is excluded from candidacy entirely (item 12)
 * because there is nothing to interact with. An unrecognized `type` maps to the
 * editable set, which is what browsers do with an invalid `type`.
 */
function inputCapabilities(inputType: string): InteractionCapability[] {
  if (TOGGLE_INPUT_TYPES.includes(inputType)) return ["click", "toggle"];
  if (inputType === "range") return ["click", "range-adjust", "drag"];
  if (inputType === "file") return ["click"];
  if (BUTTON_INPUT_TYPES.includes(inputType)) {
    if (SUBMIT_INPUT_TYPES.includes(inputType)) return ["click", "submit"];
    if (inputType === "reset") return ["click", "reset"];
    return ["click"];
  }
  if (EDITABLE_INPUT_TYPES.includes(inputType)) return ["click", "edit", "focus"];
  return ["click"];
}

/** Capabilities implied by an inline handler attribute name. */
function handlerCapabilities(handler: string): InteractionCapability[] {
  if (CLICK_HANDLER_ATTRIBUTES.includes(handler)) return ["click"];
  if (handler === "oninput" || handler === "onchange") return ["edit"];
  if (handler === "onsubmit") return ["submit"];
  if (handler === "ondragstart" || handler === "ondragend") return ["drag"];
  if (
    handler === "onfocus" ||
    handler === "onblur" ||
    handler === "onkeydown" ||
    handler === "onkeyup"
  ) {
    return ["focus"];
  }
  // Hover handlers (onmouseenter/leave/over/out) are real evidence of behavior
  // but name no action this taxonomy models, so they contribute evidence only.
  return [];
}

/** The result of applying every rule to one element. */
interface CandidateAssessment {
  include: boolean;
  priority: InteractionPriority;
  capabilities: InteractionCapability[];
  evidence: InteractionEvidence[];
  submitCapable: boolean;
}

/**
 * Decide whether one element is a candidate, and if so at what tier, with which
 * capabilities and on what evidence. Pure; the only context it reads is the
 * element index (ancestors and the pointer-cursor map).
 */
function assessElement(
  signals: ElementSignals,
  index: ElementIndex,
  pointerCursorById: ReadonlyMap<string, boolean>,
): CandidateAssessment {
  const { element, tagName } = signals;
  const evidence: InteractionEvidence[] = [];
  const capabilities = new CapabilitySet();

  const observed = (
    type: InteractionEvidence["type"],
    value?: string,
  ): void => {
    evidence.push({
      type,
      ...(value !== undefined ? { value } : {}),
      provenance: "observed",
    });
  };
  const derived = (type: InteractionEvidence["type"], value?: string): void => {
    evidence.push({
      type,
      ...(value !== undefined ? { value } : {}),
      provenance: "derived",
    });
  };

  // ---------------------------------------------------------------- native tag
  const isHiddenInput = tagName === "input" && signals.inputType === "hidden";
  const nativeInteractive =
    NATIVE_INTERACTIVE_TAGS.includes(tagName) && !isHiddenInput;

  const detailsParent =
    tagName === "summary" && element.parentId
      ? index.byElementId.get(element.parentId)
      : undefined;
  const isNativeDisclosure = detailsParent?.tagName === "details";

  if (nativeInteractive) {
    observed("native-element", tagName);
    if (tagName === "input" && signals.inputType) {
      observed("input-type", signals.inputType);
      capabilities.add(...inputCapabilities(signals.inputType));
    } else if (tagName === "button") {
      capabilities.add("click");
    } else if (tagName === "select") {
      capabilities.add("click", "select", "open-options");
    } else if (tagName === "textarea") {
      capabilities.add("click", "edit", "focus");
    } else if (tagName === "summary") {
      capabilities.add("click");
      if (isNativeDisclosure && detailsParent) {
        capabilities.add("disclosure-trigger", "state-toggle");
        derived("native-disclosure", detailsParent.id);
        const open = detailsParent.attributes.open;
        if (open !== undefined) observed("details-open", open);
      }
    }
  } else if (isHiddenInput && signals.inputType) {
    // Recorded for the reader of this code, not for the artifact: a hidden input
    // is never a candidate, so nothing below will include it.
    observed("input-type", signals.inputType);
  }

  // ---------------------------------------------------------------- role
  const roleCapabilities = signals.role
    ? ROLE_CAPABILITIES[signals.role]
    : undefined;
  if (signals.role !== undefined) observed("role", signals.role);
  if (roleCapabilities) capabilities.add(...roleCapabilities);

  // ---------------------------------------------------------------- ARIA state
  if (signals.ariaExpanded !== undefined) {
    observed("aria-expanded", signals.ariaExpanded);
    capabilities.add("click", "state-toggle", "disclosure-trigger");
  }
  if (signals.ariaPressed !== undefined) {
    observed("aria-pressed", signals.ariaPressed);
    capabilities.add("click", "state-toggle", "toggle");
  }
  if (signals.ariaSelected !== undefined) {
    observed("aria-selected", signals.ariaSelected);
    capabilities.add("click", "state-toggle");
  }
  if (signals.ariaChecked !== undefined) {
    observed("aria-checked", signals.ariaChecked);
    capabilities.add("click", "state-toggle", "toggle");
  }
  if (signals.ariaHaspopup !== undefined) {
    observed("aria-haspopup", signals.ariaHaspopup);
    const value = signals.ariaHaspopup.trim().toLowerCase();
    capabilities.add("click");
    if (HASPOPUP_MENU_VALUES.includes(value)) capabilities.add("menu-trigger");
    if (HASPOPUP_DIALOG_VALUES.includes(value)) capabilities.add("dialog-trigger");
  }
  if (signals.ariaControls !== undefined) {
    observed("aria-controls", signals.ariaControls);
    capabilities.add("click");
  }
  if (signals.ariaDisabled !== undefined) {
    observed("aria-disabled", signals.ariaDisabled);
  }
  if (signals.ariaReadonly !== undefined) {
    observed("aria-readonly", signals.ariaReadonly);
  }
  if (signals.ariaValueNow !== undefined) {
    observed("aria-valuenow", signals.ariaValueNow);
  }
  if (signals.ariaValueMin !== undefined) {
    observed("aria-valuemin", signals.ariaValueMin);
  }
  if (signals.ariaValueMax !== undefined) {
    observed("aria-valuemax", signals.ariaValueMax);
  }
  // `aria-owns` re-parents the a11y tree; it is NOT a "controls" relation and is
  // recorded as evidence only (item 43).
  if (signals.ariaOwns !== undefined) observed("aria-owns", signals.ariaOwns);

  // ---------------------------------------------------------------- editable / drag
  if (signals.contentEditable !== undefined) {
    observed("contenteditable", signals.contentEditable);
    capabilities.add("click", "edit", "focus");
  }
  if (signals.draggable) {
    observed("draggable", "true");
    capabilities.add("drag");
  }

  // ---------------------------------------------------------------- popover API
  if (signals.popover !== undefined) observed("popover", signals.popover);
  if (signals.popoverTarget !== undefined) {
    observed("popovertarget", signals.popoverTarget);
    capabilities.add("click", "popover-trigger");
  }
  if (signals.popoverTargetAction !== undefined) {
    observed("popovertargetaction", signals.popoverTargetAction);
  }

  // ---------------------------------------------------------------- handlers
  for (const handler of signals.inlineHandlers) {
    // NAME only — the handler's JavaScript source is never copied (item 26).
    observed("inline-handler", handler);
    capabilities.add(...handlerCapabilities(handler));
  }

  const javascriptHref =
    tagName === "a" &&
    signals.href !== undefined &&
    signals.href.trim().toLowerCase().startsWith("javascript:");
  if (javascriptHref) {
    // Scheme only, never the script body — same reasoning as inline handlers.
    observed("javascript-href", "javascript:");
    capabilities.add("click");
  }

  // ---------------------------------------------------------------- weak signals
  const focusable = signals.tabIndex !== undefined && signals.tabIndex >= 0;
  if (signals.tabIndex !== undefined) {
    observed("tabindex", String(signals.tabIndex));
  }
  for (const name of signals.stateHintAttributes) {
    // NAME only — arbitrary `data-*` values are never re-dumped (item 35/51).
    observed("state-hint-attribute", name);
  }

  const pointerCursor = hasPointerCursor(signals);
  if (pointerCursor) observed("computed-cursor", "pointer");
  const pointerOperable = isPointerOperable(signals);
  if (!pointerOperable) observed("computed-pointer-events", "none");

  // ---------------------------------------------------------------- state attributes
  if (signals.disabledAttribute) observed("disabled-attribute");
  if (signals.readonlyAttribute) observed("readonly-attribute");
  if (signals.checkedAttribute !== undefined) {
    observed("checked-attribute", signals.checkedAttribute);
  }
  if (signals.selectedAttribute !== undefined) {
    observed("selected-attribute", signals.selectedAttribute);
  }
  if (signals.openAttribute !== undefined) {
    observed("open-attribute", signals.openAttribute);
  }
  if (signals.hiddenAttribute !== undefined) {
    observed("hidden-attribute", signals.hiddenAttribute);
  }
  if (signals.inertAttribute) observed("inert-attribute");

  // ---------------------------------------------------------------- priority
  //
  // P1 — the markup DECLARES a state relationship.
  const p1 =
    hasAriaStateSignal(signals) ||
    signals.role === "tab" ||
    signals.role === "switch" ||
    isNativeDisclosure ||
    signals.popoverTarget !== undefined;

  // `role="link"` on an `<a href>` merely restates the element's native
  // semantics. Treating it as an admitting signal would let ordinary navigation
  // anchors back in through the ARIA door and defeat the whole link policy —
  // nextjs.org alone declares it on 24 header/footer links (item 27). On a
  // non-anchor (`<div role="link">`) it IS meaningful and still counts.
  const redundantAnchorRole = signals.isNavigationAnchor && signals.role === "link";

  // P2 — a native/explicit interaction affordance with no declared state.
  const p2 =
    nativeInteractive ||
    (roleCapabilities !== undefined && !redundantAnchorRole) ||
    signals.contentEditable !== undefined ||
    signals.draggable ||
    signals.inlineHandlers.length > 0 ||
    javascriptHref;

  // P3 — heuristic. Requires the element to look clickable AND be currently
  // interactable AND not be ordinary navigation, and fires only on the
  // pointer-cursor root (see the module header).
  const parentPointerCursor = element.parentId
    ? (pointerCursorById.get(element.parentId) ?? false)
    : false;
  const pointerCursorRoot = pointerCursor && !parentPointerCursor;
  const disabled =
    signals.disabledAttribute ||
    (signals.ariaDisabled ?? "").trim().toLowerCase() === "true";
  const p3 =
    !signals.isNavigationAnchor &&
    element.effectiveVisible &&
    pointerOperable &&
    !disabled &&
    (pointerCursorRoot ||
      (focusable && signals.stateHintAttributes.length > 0));

  let priority: InteractionPriority = "P3";
  let include = true;
  if (p1) priority = "P1";
  else if (p2) priority = "P2";
  else if (p3) priority = "P3";
  else include = false;

  // A hidden `<input type=hidden>` can still pick up a role or an ARIA state in
  // pathological markup; item 12 says it is never a candidate, full stop.
  if (isHiddenInput) include = false;

  // An ordinary navigation anchor is covered by links.json and is only admitted
  // when it carries a non-navigation signal — i.e. P1 or P2 (item 27).
  if (include && signals.isNavigationAnchor && !p1 && !p2) include = false;

  if (include) {
    if (focusable) capabilities.add("focus");
    if (priority === "P3") capabilities.add("generic-pointer");
    // Every included candidate must name at least one capability. Evidence-only
    // signals (a hover handler, an `aria-valuenow`) land here.
    if (capabilities.size === 0) capabilities.add("generic-pointer");

    // Supplementary evidence only — a transition/animation NEVER creates a
    // candidate (item 34); CSS motion is not user interaction.
    if (signals.hasTransition) observed("has-transition");
    if (signals.hasAnimation) observed("has-animation");
  }

  // ---------------------------------------------------------------- submit
  const formElementId = index.formAncestorId.get(element.id);
  const insideForm = formElementId !== undefined;
  const explicitType = (signals.attrs.type ?? "").trim().toLowerCase();
  let submitCapable = false;
  if (tagName === "button") {
    if (explicitType === "submit") submitCapable = true;
    else if (explicitType === "" && insideForm) {
      // HTML's default: a <button> with no type inside a form IS a submit button.
      submitCapable = true;
      derived("implicit-submit");
    }
  } else if (tagName === "input" && signals.inputType) {
    submitCapable = SUBMIT_INPUT_TYPES.includes(signals.inputType);
  }
  if (submitCapable) capabilities.add("submit");
  if (include && insideForm && formElementId) derived("inside-form", formElementId);
  if (include && index.inertAncestor.get(element.id) && !signals.inertAttribute) {
    derived("inert-ancestor");
  }

  return {
    include,
    priority,
    capabilities: capabilities.build(),
    evidence: sortEvidence(evidence),
    submitCapable,
  };
}

/** Derive the recorded initial state of a candidate element. */
function buildInitialState(
  signals: ElementSignals,
  index: ElementIndex,
): CandidateInitialState {
  const disabled =
    signals.disabledAttribute ||
    (signals.ariaDisabled ?? "").trim().toLowerCase() === "true";
  const readonly =
    signals.readonlyAttribute ||
    (signals.ariaReadonly ?? "").trim().toLowerCase() === "true";
  const inertAncestor = index.inertAncestor.get(signals.element.id) ?? false;
  const pointerOperable = isPointerOperable(signals);

  return {
    localVisible: signals.element.localVisible,
    effectiveVisible: signals.element.effectiveVisible,
    disabled,
    readonly,
    inertAncestor,
    pointerOperable,
    initiallyOperable:
      signals.element.effectiveVisible &&
      !disabled &&
      !readonly &&
      !inertAncestor &&
      pointerOperable,
  };
}

/** Deterministic guard flags for one candidate. */
function buildGuardFlags(
  signals: ElementSignals,
  state: CandidateInitialState,
  submitCapable: boolean,
  pageUrl: string,
): GuardFlag[] {
  const flags = new Set<GuardFlag>();
  if (submitCapable) flags.add("form-submit");
  if (signals.tagName === "input" && signals.inputType === "file") {
    flags.add("file-input");
  }
  if (signals.isNavigationAnchor) {
    flags.add("navigation");
    if (signals.href && isExternalHref(signals.href, pageUrl)) {
      flags.add("external-navigation");
    }
  }
  if (state.disabled) flags.add("disabled");
  if (state.readonly) flags.add("readonly");
  if (!state.effectiveVisible) flags.add("hidden");
  if (!state.pointerOperable) flags.add("pointer-disabled");
  if (state.inertAncestor) flags.add("inert");
  return GUARD_FLAG_ORDER.filter((flag) => flags.has(flag));
}

/** Tally a count map in canonical order, keeping only non-zero entries. */
function tally(
  order: readonly string[],
  counts: ReadonlyMap<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of order) {
    const value = counts.get(key);
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Detect every candidate and target in ONE viewport.
 *
 * Desktop and mobile go through this function separately and never see each
 * other's data (item 8): element ids are viewport-local, so any cross-viewport
 * identification would be a fabrication.
 */
export function detectViewportCandidates(
  input: ViewportDetectionInput,
): ViewportInteractionAnalysis {
  const index = buildElementIndex(input.elements, input.styleTable);
  const targets = new TargetCollector(index);

  // Pass 1: signals for every element, plus the pointer-cursor map the P3 rule
  // needs (a child must know whether its parent already computes to `pointer`).
  const signalsById = new Map<string, ElementSignals>();
  const pointerCursorById = new Map<string, boolean>();
  for (const element of input.elements) {
    const signals = extractSignals(element, index);
    signalsById.set(element.id, signals);
    pointerCursorById.set(element.id, hasPointerCursor(signals));
  }

  // Pass 2: stateful containers enter the inventory whether or not any observed
  // trigger points at them (item 44) — an unreferenced dialog is still a region
  // whose state can change.
  for (const element of input.elements) {
    const signals = signalsById.get(element.id);
    if (!signals) continue;
    if (isStatefulContainer(element, signals.role, signals.attrs)) {
      targets.add(element, "stateful-container");
    }
  }

  // Pass 3: candidates, in document order.
  const candidates: InteractionCandidate[] = [];
  const priorityCounts: PriorityCounts = { P1: 0, P2: 0, P3: 0 };
  const capabilityCounts = new Map<string, number>();
  const guardCounts = new Map<string, number>();
  let visible = 0;
  let operable = 0;
  let controlRelationCount = 0;
  let resolvedControlCount = 0;

  for (const element of input.elements) {
    const signals = signalsById.get(element.id);
    if (!signals) continue;

    const assessment = assessElement(signals, index, pointerCursorById);
    if (!assessment.include) continue;

    const initialState = buildInitialState(signals, index);
    const controls = resolveControlRelations(signals, index, targets);
    const guardFlags = buildGuardFlags(
      signals,
      initialState,
      assessment.submitCapable,
      input.pageUrl,
    );
    const formElementId = index.formAncestorId.get(element.id);

    const candidate: InteractionCandidate = {
      id: candidateId(candidates.length + 1),
      elementId: element.id,
      tagName: element.tagName,
      // The Observer already normalized and capped this text; it is reused
      // verbatim rather than re-derived from rendered HTML (item 50).
      ...(element.text
        ? { text: element.text.slice(0, CANDIDATE_TEXT_MAX_LEN) }
        : {}),
      ...(signals.role ? { role: signals.role } : {}),
      ...(signals.inputType ? { inputType: signals.inputType } : {}),
      priority: assessment.priority,
      capabilities: assessment.capabilities,
      initialState,
      guardFlags,
      evidence: assessment.evidence,
      controls,
      insideForm: formElementId !== undefined,
      ...(formElementId ? { formElementId } : {}),
      submitCapable: assessment.submitCapable,
      styleId: element.styleId,
    };
    candidates.push(candidate);

    priorityCounts[candidate.priority]++;
    if (initialState.effectiveVisible) visible++;
    if (initialState.initiallyOperable) operable++;
    for (const capability of candidate.capabilities) {
      capabilityCounts.set(capability, (capabilityCounts.get(capability) ?? 0) + 1);
    }
    for (const flag of candidate.guardFlags) {
      guardCounts.set(flag, (guardCounts.get(flag) ?? 0) + 1);
    }
    controlRelationCount += controls.length;
    resolvedControlCount += controls.filter((c) => c.resolved).length;
  }

  const effectiveVisibleElementCount = input.elements.filter(
    (e) => e.effectiveVisible,
  ).length;

  const stats: ViewportInteractionStats = {
    domElementCount: input.elements.length,
    effectiveVisibleElementCount,
    candidateCount: candidates.length,
    priorityCounts,
    visibleCandidateCount: visible,
    hiddenCandidateCount: candidates.length - visible,
    operableCandidateCount: operable,
    nonOperableCandidateCount: candidates.length - operable,
    targetCount: targets.size,
    controlRelationCount,
    resolvedControlCount,
    unresolvedControlCount: controlRelationCount - resolvedControlCount,
    capabilityCounts: tally(CAPABILITY_ORDER, capabilityCounts),
    guardCounts: tally(GUARD_FLAG_ORDER, guardCounts),
    candidateDensity:
      effectiveVisibleElementCount === 0
        ? 0
        : round4(candidates.length / effectiveVisibleElementCount),
  };

  return {
    viewportId: input.viewportId,
    sourceDomFile: input.domFile,
    sourceStylesFile: input.stylesFile,
    candidates,
    targets: targets.build(),
    stats,
  };
}
