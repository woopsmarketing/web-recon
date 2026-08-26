import type { SlotValue } from "../recon-template/types.js";
import {
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
  MAX_REPAIR_ITERATIONS,
  RepairRequestSchema,
  type ContentUnit,
  type ContentUnitsFile,
  type LayoutQaReport,
  type RepairItem,
  type RepairRequest,
} from "./types.js";

/**
 * Bounded content repair loop (Task 19 §27).
 *
 * When layout QA produces evidence against specific slots, the repair input
 * carries ONLY: the current sentence, its observed reference constraints, the
 * actual line counts, and the overflow evidence. The generator (any provider)
 * may rewrite CONTENT — never CSS, never layout, never other slots. At most
 * MAX_REPAIR_ITERATIONS (2) rounds; after that the remaining evidence goes to
 * the operator report instead of an endless auto-fix loop.
 */

export { MAX_REPAIR_ITERATIONS };

export function buildRepairRequest(
  runId: string,
  iteration: number,
  layoutQa: LayoutQaReport,
  unitsFile: ContentUnitsFile,
  currentValues: Map<string, SlotValue>,
): RepairRequest | undefined {
  if (iteration < 1 || iteration > MAX_REPAIR_ITERATIONS) return undefined;
  if (layoutQa.repairCandidates.length === 0) return undefined;

  const slotByKey = new Map(unitsFile.units.flatMap((u) => u.slots).map((s) => [s.key, s]));
  const items: RepairItem[] = [];
  for (const candidate of layoutQa.repairCandidates) {
    // A stale-twin desync cannot be repaired by rewriting the sentence — the
    // unslotted duplicate would still show the old text. Operator decision
    // (revert, or Task 19.1 paint-twin co-binding), never a text rewrite.
    // The same holds for a far-away decorative remnant (19.1): rewriting the
    // slot again changes nothing about the unbound copy.
    if (
      candidate.reason === "unslotted-duplicate-text-desync" ||
      candidate.reason === "stale-duplicate-text-remnant"
    ) {
      continue;
    }
    const unitSlot = slotByKey.get(candidate.slotKey);
    const current = currentValues.get(candidate.slotKey) ?? unitSlot?.currentValue;
    if (current === undefined) continue;
    const lineCounts = layoutQa.slotObservations
      .filter((obs) => obs.slotKey === candidate.slotKey)
      .map((obs) => ({
        viewport: `${obs.viewport}@${obs.width}`,
        ...(obs.referenceLineCount !== undefined ? { reference: obs.referenceLineCount } : {}),
        ...(obs.injectedLineCount !== undefined ? { actual: obs.injectedLineCount } : {}),
      }));
    items.push({
      slotKey: candidate.slotKey,
      currentValue: current,
      ...(unitSlot?.constraints !== undefined ? { constraints: unitSlot.constraints } : {}),
      ...(lineCounts.length > 0 ? { observedLineCounts: lineCounts } : {}),
      overflowEvidence: candidate.evidence,
    });
  }
  if (items.length === 0) return undefined;

  return RepairRequestSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
    runId,
    iteration,
    items,
  });
}

/** Units containing at least one repair-item slot (the bounded repair scope). */
export function unitsForRepair(unitsFile: ContentUnitsFile, request: RepairRequest): ContentUnit[] {
  const keys = new Set(request.items.map((item) => item.slotKey));
  return unitsFile.units.filter((unit) => unit.slots.some((slot) => keys.has(slot.key)));
}

/**
 * Merge repaired values over the current overlay. Only keys named in the
 * repair request may change — a repair that wanders outside its scope is a
 * validation error upstream, and this merge enforces the boundary again.
 */
export function mergeRepairValues(
  currentOverlay: Record<string, SlotValue>,
  request: RepairRequest,
  repairedValues: Record<string, SlotValue>,
): { merged: Record<string, SlotValue>; ignoredKeys: string[] } {
  const allowed = new Set(request.items.map((item) => item.slotKey));
  const merged: Record<string, SlotValue> = { ...currentOverlay };
  const ignoredKeys: string[] = [];
  for (const [key, value] of Object.entries(repairedValues)) {
    if (!allowed.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    merged[key] = value;
  }
  return { merged, ignoredKeys };
}
