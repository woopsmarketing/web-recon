import type { SlotBinding, SlotDefinition } from "./types.js";

/**
 * Slot catalog report (`report/slot-summary.json`) — the human-review surface.
 *
 * Totals by type / scope / role / editability / section, exclusion evidence,
 * and concrete samples per review area (header/nav, hero, body, footer,
 * images, URLs) with enough fields to judge each slot without opening the
 * artifact files.
 */

export interface SlotSample {
  key: string;
  role: string;
  type: string;
  scope: string;
  route?: string;
  editability: string;
  defaultValue: unknown;
  bindingCount: number;
  surfaces: string[];
  sourceNodes: string[];
  constraints?: unknown;
}

export interface SlotSummary {
  totals: {
    slots: number;
    bindings: number;
    byType: Record<string, number>;
    byScope: Record<string, number>;
    byEditability: Record<string, number>;
    bySection: Record<string, number>;
    bySurface: Record<string, number>;
    byUrlKind: Record<string, number>;
  };
  roleBreakdown: Record<string, number>;
  excludedCandidates: Record<string, number>;
  multiBindingSlots: number;
  crossSurfaceSlots: number;
  samples: {
    headerNav: SlotSample[];
    hero: SlotSample[];
    body: SlotSample[];
    footer: SlotSample[];
    images: SlotSample[];
    urls: SlotSample[];
    review: SlotSample[];
  };
}

function count(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function sectionOf(slot: SlotDefinition): string {
  for (const tag of slot.evidence) {
    if (tag.startsWith("landmark:")) return tag.slice("landmark:".length);
  }
  return "body";
}

function sample(slot: SlotDefinition, bindingsBySlot: Map<string, SlotBinding[]>): SlotSample {
  const bindings = bindingsBySlot.get(slot.id) ?? [];
  const surfaces = [...new Set(bindings.map((b) => b.surface))];
  const sourceNodes = [
    ...new Set(
      bindings.map((b) =>
        b.surface === "static"
          ? `${b.pageId}/${b.viewport}/${b.nodeId}`
          : `${b.pageId}/${b.viewport}/${b.nodeId}@${b.discoveryId}/${b.templateNodeId}`,
      ),
    ),
  ].slice(0, 6);
  return {
    key: slot.key,
    role: slot.role,
    type: slot.type,
    scope: slot.scope,
    route: slot.route,
    editability: slot.editability,
    defaultValue: truncateValue(slot.defaultValue),
    bindingCount: bindings.length,
    surfaces,
    sourceNodes,
    constraints: slot.constraints,
  };
}

function truncateValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 160 ? value.slice(0, 157) + "…" : value;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncateValue(v);
    return out;
  }
  return value;
}

const SAMPLE_LIMIT = 10;

export function buildSlotSummary(
  slots: SlotDefinition[],
  bindings: SlotBinding[],
  excluded: Map<string, number>,
): SlotSummary {
  const bindingsBySlot = new Map<string, SlotBinding[]>();
  for (const binding of bindings) {
    const list = bindingsBySlot.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlot.set(binding.slotId, list);
  }

  const totals = {
    slots: slots.length,
    bindings: bindings.length,
    byType: {} as Record<string, number>,
    byScope: {} as Record<string, number>,
    byEditability: {} as Record<string, number>,
    bySection: {} as Record<string, number>,
    bySurface: {} as Record<string, number>,
    byUrlKind: {} as Record<string, number>,
  };
  const roleBreakdown: Record<string, number> = {};
  let multiBindingSlots = 0;
  let crossSurfaceSlots = 0;

  for (const slot of slots) {
    count(totals.byType, slot.type);
    count(totals.byScope, slot.scope);
    count(totals.byEditability, slot.editability);
    count(totals.bySection, sectionOf(slot));
    count(roleBreakdown, slot.role);
    if (slot.urlKind) count(totals.byUrlKind, slot.urlKind);
    const slotBindings = bindingsBySlot.get(slot.id) ?? [];
    if (slotBindings.length > 1) multiBindingSlots++;
    const surfaces = new Set(slotBindings.map((b) => b.surface));
    if (surfaces.size > 1) crossSurfaceSlots++;
  }
  for (const binding of bindings) count(totals.bySurface, binding.surface);

  const pick = (filter: (slot: SlotDefinition) => boolean): SlotSample[] =>
    slots.filter(filter).slice(0, SAMPLE_LIMIT).map((s) => sample(s, bindingsBySlot));

  return {
    totals,
    roleBreakdown,
    excludedCandidates: Object.fromEntries([...excluded.entries()].sort()),
    multiBindingSlots,
    crossSurfaceSlots,
    samples: {
      headerNav: pick((s) => {
        const section = sectionOf(s);
        return section === "header" || section === "nav";
      }),
      hero: pick((s) => s.role.startsWith("hero.") || s.role.startsWith("cta.")),
      body: pick((s) => {
        const section = sectionOf(s);
        return (section === "main" || section === "body") && s.type === "text" && !s.role.startsWith("hero.");
      }),
      footer: pick((s) => sectionOf(s) === "footer"),
      images: pick((s) => s.type === "image"),
      urls: pick((s) => s.type === "url"),
      review: pick((s) => s.editability === "review"),
    },
  };
}
