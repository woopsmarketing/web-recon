import type {
  ComputedStyleObservation,
  ElementObservation,
  StyleTable,
} from "../observer/types.js";
import {
  ARIA_STATE_ATTRIBUTES,
  ARIA_VALUE_ATTRIBUTES,
  CLICK_HANDLER_ATTRIBUTES,
  EVIDENCE_TYPE_ORDER,
  INLINE_HANDLER_ATTRIBUTES,
  isMeaninglessHref,
  isStateHintAttribute,
  normalizeInputType,
  type InteractionEvidence,
  type InteractionEvidenceType,
} from "./types.js";

/**
 * Signal extraction (Task 10, items 10–36).
 *
 * This module turns ONE stored element into a flat record of *observed facts*.
 * It makes no decision about candidacy, priority, or capability — that is
 * `detect-candidates.ts`. Keeping the two apart is what makes the rules
 * reviewable: everything here can be checked against `dom.json` by eye, and
 * everything there is a pure function of what is here.
 *
 * Nothing in this file is site-specific or framework-specific. There is no
 * `if (framework === …)`, no class-name matching (`class~="accordion"` proves
 * nothing — class names are free text), and no library token. The vocabulary is
 * HTML, ARIA, and computed style, which is the same on every site.
 *
 * ## What the stored data can and cannot say
 *
 * The Observer stores a whitelisted attribute set plus EVERY `aria-*` and
 * `data-*` attribute. Task 10 does not extend it (item 5), so a signal that is
 * not in that set can be *implemented* here but will never fire on Task 09 data:
 * `onclick` and friends, `disabled`, `readonly`, `contenteditable`, `open`,
 * `hidden`, `inert`, `checked`, `selected`, `popover`, `popovertarget`. They are
 * implemented anyway — the rules are part of the contract, the fixtures exercise
 * them, and the day the Observer whitelist grows they start producing candidates
 * with no change here. The Task 10 report names this limitation explicitly
 * rather than letting a silent zero look like an absence of such controls.
 */

/** Everything one element says about itself, normalized. */
export interface ElementSignals {
  element: ElementObservation;
  tagName: string;
  /** Attribute names lower-cased (HTML attributes are case-insensitive). */
  attrs: Readonly<Record<string, string>>;
  style: ComputedStyleObservation;

  /** First token of `role`, lower-cased (ARIA: the first valid token wins). */
  role?: string;
  /** Normalized `<input>` type; undefined for non-inputs. */
  inputType?: string;

  ariaExpanded?: string;
  ariaPressed?: string;
  ariaSelected?: string;
  ariaChecked?: string;
  ariaHaspopup?: string;
  ariaControls?: string;
  ariaDisabled?: string;
  ariaReadonly?: string;
  ariaValueNow?: string;
  ariaValueMin?: string;
  ariaValueMax?: string;
  ariaOwns?: string;
  ariaHidden?: string;

  /** Inline handler attribute NAMES present, in the canonical order. */
  inlineHandlers: string[];
  /** True when at least one of those handlers is a pointer/click handler. */
  hasClickHandler: boolean;

  /** Normalized `contenteditable` value when the element IS editable. */
  contentEditable?: string;
  draggable: boolean;
  /** Parsed `tabindex`, when it is a valid integer. */
  tabIndex?: number;
  /** `data-*` attribute NAMES that look like UI state hints (values never read). */
  stateHintAttributes: string[];

  popover?: string;
  popoverTarget?: string;
  popoverTargetAction?: string;

  disabledAttribute: boolean;
  readonlyAttribute: boolean;
  checkedAttribute?: string;
  selectedAttribute?: string;
  openAttribute?: string;
  hiddenAttribute?: string;
  inertAttribute: boolean;

  href?: string;
  /** An `<a>` with a real href — i.e. ordinary navigation, already in links.json. */
  isNavigationAnchor: boolean;

  cursor?: string;
  pointerEvents?: string;
  /** A transition with a non-zero duration (a `0s` default is not a signal). */
  hasTransition: boolean;
  /** A named animation (`animation-name` other than `none`). */
  hasAnimation: boolean;
}

/** Fast lookups shared by every element of one viewport. */
export interface ElementIndex {
  elements: readonly ElementObservation[];
  byElementId: Map<string, ElementObservation>;
  /** HTML `id` attribute → element. First occurrence wins (duplicate ids are invalid HTML). */
  byDomId: Map<string, ElementObservation>;
  styleTable: StyleTable;
  /** Element id → nearest ancestor `<form>` element id (derived, one pass). */
  formAncestorId: Map<string, string>;
  /** Element id → true when the element or an ancestor carries `inert`. */
  inertAncestor: Map<string, boolean>;
}

/** Lower-case an element's attribute names once, so lookups are unambiguous. */
export function normalizeAttributes(
  element: ElementObservation,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(element.attributes)) {
    out[name.toLowerCase()] = value;
  }
  return out;
}

/** Any comma-separated CSS time list with at least one non-zero entry. */
function hasNonZeroTime(value: string | undefined): boolean {
  if (!value) return false;
  return value.split(",").some((part) => {
    const trimmed = part.trim();
    if (trimmed === "") return false;
    const seconds = trimmed.endsWith("ms")
      ? parseFloat(trimmed) / 1000
      : parseFloat(trimmed);
    return Number.isFinite(seconds) && seconds > 0;
  });
}

/**
 * Build the per-viewport index.
 *
 * Ancestry is resolved in ONE forward pass rather than by walking up from every
 * element: `dom.json` is in document order, so a parent is always earlier in the
 * array than its children and its answer is already known. That keeps the whole
 * detector O(n) instead of O(n × depth) — see item 108. The fallback loop exists
 * only for the (schema-legal but never observed) case of a forward reference,
 * and is bounded by a visited set so a cyclic `parentId` cannot hang the run.
 */
export function buildElementIndex(
  elements: readonly ElementObservation[],
  styleTable: StyleTable,
): ElementIndex {
  const byElementId = new Map<string, ElementObservation>();
  const byDomId = new Map<string, ElementObservation>();
  const formAncestorId = new Map<string, string>();
  const inertAncestor = new Map<string, boolean>();

  for (const element of elements) {
    byElementId.set(element.id, element);
    const attrs = normalizeAttributes(element);
    const domId = attrs.id;
    if (domId !== undefined && domId !== "" && !byDomId.has(domId)) {
      byDomId.set(domId, element);
    }
  }

  const isInertSelf = (element: ElementObservation): boolean =>
    "inert" in normalizeAttributes(element);

  for (const element of elements) {
    const parentId = element.parentId;
    const parent = parentId ? byElementId.get(parentId) : undefined;

    // --- nearest ancestor <form> ---
    if (parent) {
      const inherited =
        parent.tagName === "form"
          ? parent.id
          : (formAncestorId.get(parent.id) ?? resolveFormAncestor(parent));
      if (inherited) formAncestorId.set(element.id, inherited);
    }

    // --- self-or-ancestor `inert` ---
    const parentInert = parent
      ? (inertAncestor.get(parent.id) ?? resolveInert(parent))
      : false;
    inertAncestor.set(element.id, parentInert || isInertSelf(element));
  }

  /** Bounded walk-up fallback (only reachable on out-of-order input). */
  function resolveFormAncestor(from: ElementObservation): string | undefined {
    const seen = new Set<string>([from.id]);
    let current: ElementObservation | undefined = from;
    while (current) {
      if (current.tagName === "form") return current.id;
      const next: ElementObservation | undefined = current.parentId
        ? byElementId.get(current.parentId)
        : undefined;
      if (!next || seen.has(next.id)) return undefined;
      seen.add(next.id);
      current = next;
    }
    return undefined;
  }

  function resolveInert(from: ElementObservation): boolean {
    const seen = new Set<string>([from.id]);
    let current: ElementObservation | undefined = from;
    while (current) {
      if (isInertSelf(current)) return true;
      const next: ElementObservation | undefined = current.parentId
        ? byElementId.get(current.parentId)
        : undefined;
      if (!next || seen.has(next.id)) return false;
      seen.add(next.id);
      current = next;
    }
    return false;
  }

  return {
    elements,
    byElementId,
    byDomId,
    styleTable,
    formAncestorId,
    inertAncestor,
  };
}

/** Extract every observed signal from one element. Pure. */
export function extractSignals(
  element: ElementObservation,
  index: ElementIndex,
): ElementSignals {
  const attrs = normalizeAttributes(element);
  const style = index.styleTable[element.styleId] ?? {};

  const roleRaw = attrs.role;
  const role = roleRaw
    ? roleRaw.trim().split(/\s+/)[0].toLowerCase() || undefined
    : undefined;

  const inputType =
    element.tagName === "input" ? normalizeInputType(attrs.type) : undefined;

  const inlineHandlers = INLINE_HANDLER_ATTRIBUTES.filter((name) => name in attrs);

  const stateHintAttributes = Object.keys(attrs)
    .filter(isStateHintAttribute)
    .sort();

  // `contenteditable` is editable when it is "", "true", or "plaintext-only";
  // "false" (and the `inherit` keyword) explicitly is not.
  let contentEditable: string | undefined;
  if ("contenteditable" in attrs) {
    const raw = attrs.contenteditable.trim().toLowerCase();
    if (raw === "" || raw === "true" || raw === "plaintext-only") {
      contentEditable = raw === "" ? "" : raw;
    }
  }

  let tabIndex: number | undefined;
  if (attrs.tabindex !== undefined) {
    const parsed = Number.parseInt(attrs.tabindex.trim(), 10);
    if (Number.isFinite(parsed)) tabIndex = parsed;
  }

  const href = attrs.href;
  const isNavigationAnchor =
    element.tagName === "a" && href !== undefined && !isMeaninglessHref(href);

  return {
    element,
    tagName: element.tagName,
    attrs,
    style,
    ...(role ? { role } : {}),
    ...(inputType ? { inputType } : {}),

    ...(attrs["aria-expanded"] !== undefined
      ? { ariaExpanded: attrs["aria-expanded"] }
      : {}),
    ...(attrs["aria-pressed"] !== undefined
      ? { ariaPressed: attrs["aria-pressed"] }
      : {}),
    ...(attrs["aria-selected"] !== undefined
      ? { ariaSelected: attrs["aria-selected"] }
      : {}),
    ...(attrs["aria-checked"] !== undefined
      ? { ariaChecked: attrs["aria-checked"] }
      : {}),
    ...(attrs["aria-haspopup"] !== undefined
      ? { ariaHaspopup: attrs["aria-haspopup"] }
      : {}),
    ...(attrs["aria-controls"] !== undefined
      ? { ariaControls: attrs["aria-controls"] }
      : {}),
    ...(attrs["aria-disabled"] !== undefined
      ? { ariaDisabled: attrs["aria-disabled"] }
      : {}),
    ...(attrs["aria-readonly"] !== undefined
      ? { ariaReadonly: attrs["aria-readonly"] }
      : {}),
    ...(attrs["aria-valuenow"] !== undefined
      ? { ariaValueNow: attrs["aria-valuenow"] }
      : {}),
    ...(attrs["aria-valuemin"] !== undefined
      ? { ariaValueMin: attrs["aria-valuemin"] }
      : {}),
    ...(attrs["aria-valuemax"] !== undefined
      ? { ariaValueMax: attrs["aria-valuemax"] }
      : {}),
    ...(attrs["aria-owns"] !== undefined ? { ariaOwns: attrs["aria-owns"] } : {}),
    ...(attrs["aria-hidden"] !== undefined
      ? { ariaHidden: attrs["aria-hidden"] }
      : {}),

    inlineHandlers,
    hasClickHandler: inlineHandlers.some((name) =>
      CLICK_HANDLER_ATTRIBUTES.includes(name),
    ),

    ...(contentEditable !== undefined ? { contentEditable } : {}),
    draggable: (attrs.draggable ?? "").trim().toLowerCase() === "true",
    ...(tabIndex !== undefined ? { tabIndex } : {}),
    stateHintAttributes,

    ...(attrs.popover !== undefined ? { popover: attrs.popover } : {}),
    ...(attrs.popovertarget !== undefined
      ? { popoverTarget: attrs.popovertarget }
      : {}),
    ...(attrs.popovertargetaction !== undefined
      ? { popoverTargetAction: attrs.popovertargetaction }
      : {}),

    disabledAttribute: "disabled" in attrs,
    readonlyAttribute: "readonly" in attrs,
    ...(attrs.checked !== undefined ? { checkedAttribute: attrs.checked } : {}),
    ...(attrs.selected !== undefined ? { selectedAttribute: attrs.selected } : {}),
    ...(attrs.open !== undefined ? { openAttribute: attrs.open } : {}),
    ...(attrs.hidden !== undefined ? { hiddenAttribute: attrs.hidden } : {}),
    inertAttribute: "inert" in attrs,

    ...(href !== undefined ? { href } : {}),
    isNavigationAnchor,

    ...(style.cursor !== undefined ? { cursor: style.cursor } : {}),
    ...(style["pointer-events"] !== undefined
      ? { pointerEvents: style["pointer-events"] }
      : {}),
    hasTransition: hasNonZeroTime(style["transition-duration"]),
    hasAnimation:
      (style["animation-name"] ?? "none").trim().toLowerCase() !== "none",
  };
}

/** True when ANY ARIA state attribute is present (the P1 trigger set). */
export function hasAriaStateSignal(signals: ElementSignals): boolean {
  return ARIA_STATE_ATTRIBUTES.some((name) => name in signals.attrs);
}

/** True when the element declares an ARIA value (slider/spin evidence). */
export function hasAriaValueSignal(signals: ElementSignals): boolean {
  return ARIA_VALUE_ATTRIBUTES.some((name) => name in signals.attrs);
}

/** Whether the element carries `cursor: pointer`. */
export function hasPointerCursor(signals: ElementSignals): boolean {
  return (signals.cursor ?? "").trim().toLowerCase() === "pointer";
}

/** Whether pointer interaction is currently possible (`pointer-events` ≠ none). */
export function isPointerOperable(signals: ElementSignals): boolean {
  return (signals.pointerEvents ?? "auto").trim().toLowerCase() !== "none";
}

/** Sort evidence into the canonical order so output never depends on Map order. */
export function sortEvidence(
  evidence: readonly InteractionEvidence[],
): InteractionEvidence[] {
  const rank = (type: InteractionEvidenceType): number => {
    const i = EVIDENCE_TYPE_ORDER.indexOf(type);
    return i === -1 ? EVIDENCE_TYPE_ORDER.length : i;
  };
  return [...evidence].sort((a, b) => {
    const byType = rank(a.type) - rank(b.type);
    if (byType !== 0) return byType;
    return (a.value ?? "").localeCompare(b.value ?? "");
  });
}
