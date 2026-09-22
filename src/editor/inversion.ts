/**
 * DOM → Slot inversion (Task 28 Phase 4).
 *
 * THE EDITOR HAS NO DOM IDENTITY OF ITS OWN. There is no `data-wr-slot`, and
 * there never will be: three suites assert its absence. What the preview
 * bridge reports is exactly what the reconstruction already emits —
 * `data-wr-node` / `data-wr-dyn-node`, plus the addressing context
 * (`data-wr-page`, `data-wr-viewport`) — and this module inverts
 * `slot-bindings.json` on that identity.
 *
 * TWO KEYS, NOT ONE:
 *
 *   static / paint-twin   `pageId | viewport | nodeId`
 *   dynamic-template      `pageId | viewport | TRIGGER nodeId | templateNodeId`
 *
 * The second key is not an optimisation. A mounted template element carries
 * `data-wr-dyn-node` and NO `data-wr-node`, and one `templateNodeId` is
 * legitimately reused by several triggers on the same page and viewport (the
 * linear.app header portal menu and the /plan page's own dynamic region share
 * `t000014`). Resolving on `templateNodeId` alone silently returns the wrong
 * slot there. Measured on the real linear.app template: templateNodeId alone
 * resolves 168/262 dynamic bindings uniquely (64.1%); with the recovered
 * trigger, 262/262 (100%).
 *
 * WHEN THE TRIGGER CANNOT BE RECOVERED the resolver does NOT guess. It falls
 * back to the templateNodeId-only key, returns every candidate, and marks the
 * result `triggerRecovered: false` / `ambiguous: true` so the UI shows a
 * picker instead of a decision nobody made.
 *
 * ELEMENT GRANULARITY IS REAL, TOO. 1,492 of 7,935 rendered element
 * occurrences on linear.app carry 2–5 slots (1,016 of them a `link.label` +
 * `link.href` pair on one anchor), so a click resolves to a LIST. That list is
 * the product, not a failure mode.
 */
import type {
  SlotBinding,
  SlotDefinition,
} from "../recon-template/types.js";
import type { LoadedReconTemplate } from "../content-injection/load-template.js";

/** What the preview bridge reports for a hovered / clicked element. */
export interface BridgeElementReport {
  node: string | null;
  dynNode: string | null;
  /** Trigger nodeId recovered in-page; null when neither recovery path hit. */
  dynTrigger?: string | null;
  pageId: string | null;
  viewport: string | null;
  route?: string | null;
  tag?: string | null;
  text?: string | null;
}

export interface ResolvedBinding {
  bindingId: string;
  slotId: string;
  slotKey: string;
  role: string;
  type: string;
  editability: string;
  surface: string;
  target: string;
  attributeName?: string;
  childIndex?: number;
  textSegment?: number;
  svgTextIndex?: number;
  field?: string;
  expectedValue: string;
  groupId?: string;
}

export interface ResolveResult {
  /** "static" | "dynamic-template" | "none" */
  kind: "static" | "dynamic-template" | "none";
  /** Every binding on the addressed element, deterministic order. */
  bindings: ResolvedBinding[];
  /** Distinct slot keys, in binding order. */
  slotKeys: string[];
  /** Dynamic only: did the in-page trigger recovery produce an id? */
  triggerRecovered: boolean | null;
  /** More than one distinct slot on the addressed element. */
  ambiguous: boolean;
  /** groupIds present on the resolved slots (CTA / link groups). */
  groupIds: string[];
  /** Honest note when the answer is a candidate list rather than an answer. */
  note: string | null;
}

const DYNAMIC_SURFACE = "dynamic-template";

export function staticKey(pageId: string, viewport: string, nodeId: string): string {
  return `${pageId}|${viewport}|${nodeId}`;
}
export function dynamicKey(
  pageId: string,
  viewport: string,
  trigger: string,
  templateNodeId: string,
): string {
  return `${pageId}|${viewport}|${trigger}|${templateNodeId}`;
}

/**
 * The FULL occurrence key — every axis a binding addresses.
 *
 * Used by the suite to prove the inversion is exactly invertible on the real
 * template (9,929 bindings → 9,929 distinct keys, 0 collisions). It is not
 * used for lookup: the editor only ever knows the element, not the segment.
 */
export function occurrenceKey(binding: SlotBinding): string {
  const where =
    binding.surface === DYNAMIC_SURFACE
      ? `dyn:${binding.nodeId}:${binding.discoveryId ?? ""}:${binding.templateNodeId ?? ""}`
      : binding.nodeId;
  const what =
    binding.target === "attribute"
      ? `attr:${binding.attributeName ?? ""}`
      : binding.target === "svg-text"
        ? `svg#${binding.svgTextIndex ?? 0}`
        : `text#${binding.childIndex ?? 0}`;
  return `${binding.pageId}|${binding.viewport}|${where}|${what}|${binding.field ?? ""}`;
}

export class SlotInversionIndex {
  readonly template: LoadedReconTemplate;
  readonly slotById: Map<string, SlotDefinition>;
  readonly slotByKey: Map<string, SlotDefinition>;
  readonly bindingById: Map<string, SlotBinding>;
  readonly bindingsBySlotId: Map<string, SlotBinding[]>;
  readonly slotsByGroupId: Map<string, SlotDefinition[]>;
  private readonly staticIndex: Map<string, SlotBinding[]>;
  private readonly dynamicIndex: Map<string, SlotBinding[]>;
  private readonly dynamicFallback: Map<string, SlotBinding[]>;

  constructor(template: LoadedReconTemplate) {
    this.template = template;
    this.slotById = new Map(template.slotsFile.slots.map((slot) => [slot.id, slot]));
    this.slotByKey = template.slotByKey;
    this.bindingById = new Map();
    this.bindingsBySlotId = template.bindingsBySlotId;
    this.slotsByGroupId = new Map();
    this.staticIndex = new Map();
    this.dynamicIndex = new Map();
    this.dynamicFallback = new Map();

    for (const slot of template.slotsFile.slots) {
      if (slot.groupId === undefined) continue;
      const list = this.slotsByGroupId.get(slot.groupId) ?? [];
      list.push(slot);
      this.slotsByGroupId.set(slot.groupId, list);
    }

    const push = (map: Map<string, SlotBinding[]>, key: string, binding: SlotBinding): void => {
      const list = map.get(key);
      if (list === undefined) map.set(key, [binding]);
      else list.push(binding);
    };

    for (const binding of template.bindingsFile.bindings) {
      this.bindingById.set(binding.bindingId, binding);
      if (binding.surface === DYNAMIC_SURFACE) {
        const templateNodeId = binding.templateNodeId ?? "";
        push(
          this.dynamicIndex,
          dynamicKey(binding.pageId, binding.viewport, binding.nodeId, templateNodeId),
          binding,
        );
        push(this.dynamicFallback, staticKey(binding.pageId, binding.viewport, templateNodeId), binding);
      } else {
        push(this.staticIndex, staticKey(binding.pageId, binding.viewport, binding.nodeId), binding);
      }
    }
  }

  get slotCount(): number {
    return this.template.slotsFile.slots.length;
  }
  get bindingCount(): number {
    return this.template.bindingsFile.bindings.length;
  }

  private decorate(binding: SlotBinding): ResolvedBinding {
    const slot = this.slotById.get(binding.slotId);
    return {
      bindingId: binding.bindingId,
      slotId: binding.slotId,
      slotKey: slot?.key ?? binding.slotId,
      role: slot?.role ?? "unknown",
      type: slot?.type ?? "text",
      editability: slot?.editability ?? "review",
      surface: binding.surface,
      target: binding.target,
      ...(binding.attributeName !== undefined ? { attributeName: binding.attributeName } : {}),
      ...(binding.childIndex !== undefined ? { childIndex: binding.childIndex } : {}),
      ...(binding.textSegment !== undefined ? { textSegment: binding.textSegment } : {}),
      ...(binding.svgTextIndex !== undefined ? { svgTextIndex: binding.svgTextIndex } : {}),
      ...(binding.field !== undefined ? { field: binding.field } : {}),
      expectedValue: binding.expectedValue,
      ...(slot?.groupId !== undefined ? { groupId: slot.groupId } : {}),
    };
  }

  private finish(
    kind: ResolveResult["kind"],
    bindings: SlotBinding[],
    triggerRecovered: boolean | null,
    note: string | null,
  ): ResolveResult {
    const decorated = bindings.map((binding) => this.decorate(binding));
    const slotKeys: string[] = [];
    const groupIds: string[] = [];
    for (const item of decorated) {
      if (!slotKeys.includes(item.slotKey)) slotKeys.push(item.slotKey);
      if (item.groupId !== undefined && !groupIds.includes(item.groupId)) groupIds.push(item.groupId);
    }
    return {
      kind,
      bindings: decorated,
      slotKeys,
      triggerRecovered,
      ambiguous: slotKeys.length > 1,
      groupIds,
      note,
    };
  }

  /** Invert one bridge report into the slot(s) rendered by that element. */
  resolve(report: BridgeElementReport): ResolveResult {
    const pageId = report.pageId ?? "";
    const viewport = report.viewport ?? "";
    if (pageId === "" || viewport === "") {
      return this.finish("none", [], null, "the element reported no pageId/viewport wrapper");
    }
    if (report.dynNode !== null && report.dynNode !== undefined && report.dynNode !== "") {
      const trigger = report.dynTrigger ?? null;
      if (trigger !== null && trigger !== "") {
        const exact = this.dynamicIndex.get(dynamicKey(pageId, viewport, trigger, report.dynNode)) ?? [];
        if (exact.length > 0) return this.finish("dynamic-template", exact, true, null);
        return this.finish(
          "dynamic-template",
          this.dynamicFallback.get(staticKey(pageId, viewport, report.dynNode)) ?? [],
          true,
          `no binding is keyed on trigger ${trigger} + template node ${report.dynNode}; showing every candidate on that template node`,
        );
      }
      const fallback = this.dynamicFallback.get(staticKey(pageId, viewport, report.dynNode)) ?? [];
      return this.finish(
        "dynamic-template",
        fallback,
        false,
        "the trigger could not be recovered from the DOM — every candidate on this template node is listed, none is chosen",
      );
    }
    if (report.node === null || report.node === "") {
      return this.finish("none", [], null, "the element carries neither data-wr-node nor data-wr-dyn-node");
    }
    const bindings = this.staticIndex.get(staticKey(pageId, viewport, report.node)) ?? [];
    return this.finish("static", bindings, null, bindings.length === 0 ? "no slot binds this element" : null);
  }

  /** Bindings of one slot that render in one (pageId, viewport) — the badge. */
  bindingsInView(slotKey: string, pageId: string, viewport: string): SlotBinding[] {
    const slot = this.slotByKey.get(slotKey);
    if (slot === undefined) return [];
    return (this.bindingsBySlotId.get(slot.id) ?? []).filter(
      (binding) => binding.pageId === pageId && binding.viewport === viewport,
    );
  }
}
