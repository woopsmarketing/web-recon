import type { SlotDefinition } from "../recon-template/types.js";
import {
  contentUnitId,
  type ContentUnit,
  type ContentUnitKind,
  type ContentUnitSlot,
} from "./types.js";
import type { LoadedReconTemplate } from "./load-template.js";

/**
 * Deterministic Content Unit Builder (Task 19 §8–§10).
 *
 * The single most important boundary of this Task: the LLM never sees the raw
 * slot inventory. Related low-level slots are grouped into bounded WRITING
 * units by rules that read only what Slot V2 already records — groupId, role,
 * scope, route, and the section token of the slot key. There is no AI
 * clustering, no similarity score, and no text analysis anywhere here.
 *
 * Grouping rules, in order:
 *   1. Slots sharing a groupId (a link/CTA/nav item's label + href) → one unit.
 *   2. hero.headline + hero.description on the same page & section → one unit
 *      (the certain structural hero context Task 18 already established).
 *   3. Every other slot → its own unit.
 *
 * The kind vocabulary is deliberately small (navigation / hero / content /
 * cta / image / footer / group); anything uncertain is `group` (multi-slot)
 * or `content` (single slot).
 */

export interface BuiltUnits {
  units: ContentUnit[];
  /** Review-flagged slot keys in scope — listed, never auto-written by default. */
  reviewSlotKeys: string[];
  editableSlotCount: number;
}

/** Section token of a slot key: `home.header.nav.products` → `header`. */
export function sectionOfKey(key: string): string {
  const parts = key.split(".");
  return parts.length >= 2 ? parts[1] : "body";
}

function unitKind(slots: SlotDefinition[]): ContentUnitKind {
  if (slots.every((s) => s.type === "image")) return "image";
  if (slots.some((s) => s.role.startsWith("hero."))) return "hero";
  if (slots.some((s) => s.role.startsWith("cta."))) return "cta";
  if (slots.some((s) => s.role.startsWith("navigation."))) return "navigation";
  if (slots.some((s) => s.role === "footer.text" || sectionOfKey(s.key) === "footer")) {
    return "footer";
  }
  return slots.length > 1 ? "group" : "content";
}

const PURPOSE_BY_KIND: Record<ContentUnitKind, string> = {
  hero: "primary-message",
  navigation: "navigation-item",
  cta: "call-to-action",
  image: "image-content",
  footer: "footer-content",
  content: "supporting-content",
  group: "grouped-content",
};

function toUnitSlot(slot: SlotDefinition): ContentUnitSlot {
  return {
    key: slot.key,
    role: slot.role,
    type: slot.type,
    editability: slot.editability,
    ...(slot.urlKind !== undefined ? { urlKind: slot.urlKind } : {}),
    currentValue: slot.defaultValue,
    ...(slot.constraints !== undefined ? { constraints: slot.constraints } : {}),
  };
}

export function buildContentUnits(
  template: LoadedReconTemplate,
  scopedRoutes: string[],
  includeReview: boolean,
): BuiltUnits {
  const routeSet = new Set(scopedRoutes);
  const indexBySlotId = new Map<string, number>();
  template.slotsFile.slots.forEach((slot, index) => indexBySlotId.set(slot.id, index));

  const inScope = template.slotsFile.slots.filter(
    (slot) => slot.scope === "global" || (slot.route !== undefined && routeSet.has(slot.route)),
  );

  const reviewSlotKeys = inScope
    .filter((slot) => slot.editability === "review")
    .map((slot) => slot.key);

  const eligible = inScope.filter(
    (slot) => slot.editability === "editable" || (includeReview && slot.editability === "review"),
  );

  // Group assembly. A map key identifies the deterministic group a slot joins.
  const groups = new Map<string, SlotDefinition[]>();
  const scopeKeyOf = (slot: SlotDefinition): string =>
    slot.scope === "global" ? "global" : `page|${slot.pageId ?? ""}|${slot.route ?? ""}`;
  for (const slot of eligible) {
    let groupKey: string;
    if (slot.groupId !== undefined) {
      groupKey = `g|${scopeKeyOf(slot)}|${slot.groupId}`;
    } else if (slot.role === "hero.headline" || slot.role === "hero.description") {
      groupKey = `hero|${scopeKeyOf(slot)}|${sectionOfKey(slot.key)}`;
    } else {
      groupKey = `s|${slot.id}`;
    }
    const list = groups.get(groupKey) ?? [];
    list.push(slot);
    groups.set(groupKey, list);
  }

  // Deterministic unit order: by the first member's position in slots.json
  // (which is itself deterministically sorted: global → route → section →
  // document order).
  const grouped = [...groups.values()];
  for (const slots of grouped) {
    slots.sort((a, b) => (indexBySlotId.get(a.id) ?? 0) - (indexBySlotId.get(b.id) ?? 0));
  }
  grouped.sort(
    (a, b) => (indexBySlotId.get(a[0].id) ?? 0) - (indexBySlotId.get(b[0].id) ?? 0),
  );

  const units: ContentUnit[] = grouped.map((slots, i) => {
    const first = slots[0];
    const kind = unitKind(slots);
    return {
      unitId: contentUnitId(i + 1),
      scope: first.scope,
      ...(first.scope === "page" && first.route !== undefined ? { route: first.route } : {}),
      section: sectionOfKey(first.key),
      kind,
      purpose: PURPOSE_BY_KIND[kind],
      slots: slots.map(toUnitSlot),
    };
  });

  return { units, reviewSlotKeys, editableSlotCount: eligible.length };
}
