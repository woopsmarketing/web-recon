import type { ElementObservation } from "../observer/types.js";
import {
  normalizeAttributes,
  type ElementIndex,
  type ElementSignals,
} from "./classify-signals.js";
import {
  CONTAINER_ROLES,
  CONTROL_RELATION_ORDER,
  TARGET_REASON_ORDER,
  type InteractionControlRelation,
  type InteractionTarget,
  type InteractionTargetReason,
} from "./types.js";

/**
 * Interaction targets and trigger → target relations (Task 10, items 41–46).
 *
 * A trigger alone is half a finding. `aria-expanded=false` says a state exists;
 * `aria-controls="menu-1"` says WHERE it lives, and the target's stored
 * `effectiveVisible:false` is the "before" that makes Task 11's "after" testable:
 *
 *     hamburger button   effectiveVisible: true      ← candidate
 *     controlled menu    effectiveVisible: false     ← target, before state
 *
 * Two id spaces are involved and are never confused: the author's HTML `id`
 * (`menu-1`) is what resolution matches on, and the Observer's element id
 * (`e000456`) is what the result stores. Both are kept when both are known.
 */

/**
 * Split an IDREF list (`aria-controls="panel1 panel2"`) into ids.
 * Order is preserved and duplicates are dropped, so the relation list is
 * deterministic for a given attribute value.
 */
export function parseIdRefs(value: string): string[] {
  const out: string[] = [];
  for (const token of value.trim().split(/\s+/)) {
    if (token === "") continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * Whether an element is an unmistakable stateful CONTAINER: a region whose
 * visibility/selection some control is expected to change.
 *
 * Deliberately narrow. Making every `<div>` a target would turn the inventory
 * into a second copy of `dom.json` and tell a reader nothing (item 44), so the
 * list is exactly: `<dialog>`, the ARIA container roles, and an element carrying
 * the HTML Popover API `popover` attribute.
 */
export function isStatefulContainer(
  element: ElementObservation,
  role: string | undefined,
  attrs: Readonly<Record<string, string>>,
): boolean {
  if (element.tagName === "dialog") return true;
  if (role !== undefined && CONTAINER_ROLES.includes(role)) return true;
  if ("popover" in attrs) return true;
  return false;
}

/**
 * Accumulates the target inventory for ONE viewport.
 *
 * An element can be reached several ways (a dialog that is also `aria-controls`
 * -referenced by two buttons); it appears once, with every reason recorded.
 */
export class TargetCollector {
  private readonly reasons = new Map<string, Set<InteractionTargetReason>>();

  constructor(private readonly index: ElementIndex) {}

  /** Record `element` as a target for `reason`. */
  add(element: ElementObservation, reason: InteractionTargetReason): void {
    let set = this.reasons.get(element.id);
    if (!set) {
      set = new Set<InteractionTargetReason>();
      this.reasons.set(element.id, set);
    }
    set.add(reason);
  }

  /** Number of distinct elements in the inventory. */
  get size(): number {
    return this.reasons.size;
  }

  /**
   * Materialize the inventory, sorted by element id — i.e. document order,
   * because ids are zero-padded and assigned during the document-order walk.
   */
  build(): InteractionTarget[] {
    const out: InteractionTarget[] = [];
    for (const [elementId, reasonSet] of this.reasons) {
      const element = this.index.byElementId.get(elementId);
      if (!element) continue;
      const attrs = normalizeAttributes(element);
      const roleRaw = attrs.role;
      const role = roleRaw
        ? roleRaw.trim().split(/\s+/)[0].toLowerCase() || undefined
        : undefined;

      out.push({
        elementId,
        ...(attrs.id ? { domId: attrs.id } : {}),
        tagName: element.tagName,
        ...(role ? { role } : {}),
        localVisible: element.localVisible,
        effectiveVisible: element.effectiveVisible,
        ...(attrs["aria-hidden"] !== undefined
          ? { ariaHidden: attrs["aria-hidden"] }
          : {}),
        ...(attrs.hidden !== undefined ? { hiddenAttribute: attrs.hidden } : {}),
        ...(attrs.open !== undefined ? { openAttribute: attrs.open } : {}),
        ...(attrs.popover !== undefined ? { popoverAttribute: attrs.popover } : {}),
        reasons: [...reasonSet].sort(
          (a, b) => TARGET_REASON_ORDER.indexOf(a) - TARGET_REASON_ORDER.indexOf(b),
        ),
      });
    }
    return out.sort((a, b) => a.elementId.localeCompare(b.elementId));
  }
}

/**
 * Resolve every declared trigger → target relation for one element.
 *
 * `aria-owns` is intentionally not resolved into a relation: it re-parents the
 * accessibility tree rather than declaring "this control opens that region".
 * It is recorded as evidence by the candidate builder and nothing more.
 *
 * An unresolved id is a normal result, not an error (item 42): a dialog or menu
 * may simply not be mounted in the initial static DOM. Losing that fact would
 * hide exactly the case Task 11 must handle, so the relation is kept with
 * `resolved:false` and the author's id.
 */
export function resolveControlRelations(
  signals: ElementSignals,
  index: ElementIndex,
  targets: TargetCollector,
): InteractionControlRelation[] {
  const relations: InteractionControlRelation[] = [];

  const addIdRefRelation = (
    relation: "aria-controls" | "popovertarget",
    rawValue: string,
  ): void => {
    for (const domId of parseIdRefs(rawValue)) {
      const target = index.byDomId.get(domId);
      if (target) {
        targets.add(target, relation);
        relations.push({
          relation,
          targetDomId: domId,
          targetElementId: target.id,
          resolved: true,
        });
      } else {
        relations.push({ relation, targetDomId: domId, resolved: false });
      }
    }
  };

  if (signals.ariaControls !== undefined) {
    addIdRefRelation("aria-controls", signals.ariaControls);
  }
  if (signals.popoverTarget !== undefined) {
    addIdRefRelation("popovertarget", signals.popoverTarget);
  }

  // Native <details>/<summary>: the DOM tree carries the relation, so no id is
  // involved and it can never be "unresolved" — either the parent is a <details>
  // or this <summary> is not a disclosure trigger at all.
  if (signals.tagName === "summary" && signals.element.parentId) {
    const parent = index.byElementId.get(signals.element.parentId);
    if (parent && parent.tagName === "details") {
      targets.add(parent, "details-content");
      relations.push({
        relation: "details",
        targetElementId: parent.id,
        resolved: true,
      });
    }
  }

  return sortRelations(relations);
}

/** Deterministic relation ordering: by relation kind, then by target id. */
export function sortRelations(
  relations: readonly InteractionControlRelation[],
): InteractionControlRelation[] {
  return [...relations].sort((a, b) => {
    const byKind =
      CONTROL_RELATION_ORDER.indexOf(a.relation) -
      CONTROL_RELATION_ORDER.indexOf(b.relation);
    if (byKind !== 0) return byKind;
    const byDomId = (a.targetDomId ?? "").localeCompare(b.targetDomId ?? "");
    if (byDomId !== 0) return byDomId;
    return (a.targetElementId ?? "").localeCompare(b.targetElementId ?? "");
  });
}
