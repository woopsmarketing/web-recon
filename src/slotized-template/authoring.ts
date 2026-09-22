import type { RuntimeRouteMap } from "../reconstruction/index.js";
import {
  SLOTIZED_AUTHORING_SCHEMA,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  type AuthoringFile,
  type AuthoringGroup,
  type AuthoringPage,
  type AuthoringRepeater,
  type AuthoringSlot,
  type Binding,
  type GroupDefinition,
  type RepeaterDefinition,
  type SlotDefinition,
  type Variant,
} from "./types.js";

/**
 * Authoring projection — a DERIVED VIEW, never a source of truth.
 *
 * `slots.json` / `groups.json` are flat and id-addressed because that is what
 * a renderer needs; a human needs the opposite (page → section → card → field,
 * with the value and its fit hints in front of them). This file is that view,
 * regenerated on every compile. Editing it changes nothing.
 */

export interface AuthoringInput {
  templateId: string;
  templateVersion: string;
  slots: readonly SlotDefinition[];
  groups: readonly GroupDefinition[];
  repeaters?: readonly RepeaterDefinition[];
  bindingsBySlot: Map<string, Binding[]>;
  routeMap: RuntimeRouteMap;
}

export function buildAuthoring(input: AuthoringInput): AuthoringFile {
  const slotById = new Map(input.slots.map((s) => [s.id, s] as const));
  const groupById = new Map(input.groups.map((g) => [g.id, g] as const));
  const repeaterById = new Map((input.repeaters ?? []).map((r) => [r.id, r] as const));
  const childIds = new Set(input.groups.flatMap((g) => g.childGroupIds));

  const projectSlot = (slotId: string): AuthoringSlot | undefined => {
    const slot = slotById.get(slotId);
    if (!slot) return undefined;
    const bindings = input.bindingsBySlot.get(slotId) ?? [];
    const variants = [...new Set(bindings.map((b) => b.variant).filter((v): v is Variant => !!v))].sort();
    return {
      id: slot.id,
      key: slot.key,
      ...(slot.label === undefined ? {} : { label: slot.label }),
      type: slot.type,
      ...(slot.role === undefined ? {} : { role: slot.role }),
      scope: slot.scope,
      value: slot.defaultValue,
      ...(slot.fitHints === undefined ? {} : { fitHints: slot.fitHints }),
      ...(slot.constraints === undefined ? {} : { constraints: slot.constraints }),
      bindingCount: bindings.length,
      variants,
    };
  };

  /**
   * A repeater is shown as ONE editable block (its fields, with the prototype
   * item's values) plus the operations the growth policy allows — never as N
   * copies of the same field list, which is what the flat slot view would be.
   */
  const projectRepeater = (repeaterId: string): AuthoringRepeater | undefined => {
    const repeater = repeaterById.get(repeaterId);
    if (!repeater) return undefined;
    return {
      id: repeater.id,
      key: repeater.key,
      ...(repeater.label === undefined ? {} : { label: repeater.label }),
      ...(repeater.patternHint === undefined ? {} : { patternHint: repeater.patternHint }),
      itemCount: repeater.itemCount ?? repeater.defaultItems.length,
      growthPolicy: repeater.growthPolicy,
      minItems: repeater.minItems,
      ...(repeater.maxItems === undefined ? {} : { maxItems: repeater.maxItems }),
      operations: repeater.operations,
      variants: [...(repeater.variants ?? [])].sort(),
      paired: repeater.paired === true,
      fields: repeater.itemSlots
        .map(projectSlot)
        .filter((s): s is AuthoringSlot => s !== undefined),
    };
  };

  const projectGroup = (groupId: string, seen: Set<string>): AuthoringGroup | undefined => {
    if (seen.has(groupId)) return undefined;
    seen.add(groupId);
    const group = groupById.get(groupId);
    if (!group) return undefined;
    return {
      id: group.id,
      key: group.key,
      ...(group.label === undefined ? {} : { label: group.label }),
      kind: group.kind,
      ...(group.patternHint === undefined ? {} : { patternHint: group.patternHint }),
      slots: group.slotIds
        .map(projectSlot)
        .filter((s): s is AuthoringSlot => s !== undefined)
        // Repeater FIELDS live under `repeaters`, not in the flat slot list.
        .filter((s) => s.scope !== "repeater-item")
        .sort((a, b) => a.key.localeCompare(b.key)),
      ...((group.repeaterIds ?? []).length === 0
        ? {}
        : {
            repeaters: (group.repeaterIds ?? [])
              .map(projectRepeater)
              .filter((r): r is AuthoringRepeater => r !== undefined)
              .sort((a, b) => a.key.localeCompare(b.key)),
          }),
      groups: group.childGroupIds
        .map((id) => projectGroup(id, seen))
        .filter((g): g is AuthoringGroup => g !== undefined)
        .sort((a, b) => a.key.localeCompare(b.key)),
    };
  };

  const seen = new Set<string>();
  const globals = input.groups
    .filter((g) => g.kind === "global" && !childIds.has(g.id))
    .map((g) => projectGroup(g.id, seen))
    .filter((g): g is AuthoringGroup => g !== undefined);

  const routeByPage = new Map<string, { path: string; title?: string }>();
  for (const route of input.routeMap.routes) {
    if (!routeByPage.has(route.pageSourceId)) {
      routeByPage.set(route.pageSourceId, { path: route.path, ...(route.title ? { title: route.title } : {}) });
    }
  }

  const pages: AuthoringPage[] = [];
  for (const group of input.groups) {
    if (group.kind !== "page" || group.pageId === undefined) continue;
    const projected = projectGroup(group.id, seen);
    if (!projected) continue;
    const route = routeByPage.get(group.pageId);
    pages.push({
      pageId: group.pageId,
      ...(route?.path === undefined ? {} : { route: route.path }),
      ...(route?.title === undefined ? {} : { title: route.title }),
      groups: [projected],
    });
  }

  return {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: SLOTIZED_AUTHORING_SCHEMA,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    globals,
    pages: pages.sort((a, b) => a.pageId.localeCompare(b.pageId)),
  };
}
