import type { SlotValue } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import type { ContentGenerationResult } from "./types.js";

/**
 * Slot-values overlay assembly (Task 19 §22).
 *
 * A content run NEVER edits the Recon Template. Its whole output toward the
 * site is ONE overlay file (`slot-values.json`, `{ slotKey: value }`) applied
 * through the template app's official injection path (`WR_SLOT_VALUES_FILE`).
 * Template immutable; preview = template + overlay. Determinism boundary
 * (§36): the same valid overlay always renders the same site — the LLM's
 * nondeterminism ends at the validated JSON.
 */

/** Build the overlay: assigned values only. `needs-input` slots stay default. */
export function buildOverlayValues(result: ContentGenerationResult): Record<string, SlotValue> {
  const overlay: Record<string, SlotValue> = {};
  for (const [key, value] of Object.entries(result.slotValues)) {
    overlay[key] = value;
  }
  return overlay;
}

/**
 * Effective values after overlay application — what the injected site will
 * actually render, used by the brand-leak scan and the operator report.
 */
export function effectiveSlotValues(
  template: LoadedReconTemplate,
  overlay: Record<string, SlotValue>,
): Map<string, SlotValue> {
  const effective = new Map<string, SlotValue>();
  for (const [key, value] of Object.entries(template.defaultContent.values)) {
    effective.set(key, value);
  }
  for (const [key, value] of Object.entries(overlay)) {
    effective.set(key, value);
  }
  return effective;
}

/** Keys whose effective value differs from the template default. */
export function changedKeys(
  template: LoadedReconTemplate,
  overlay: Record<string, SlotValue>,
): Set<string> {
  const changed = new Set<string>();
  for (const [key, value] of Object.entries(overlay)) {
    const original = template.defaultContent.values[key];
    if (JSON.stringify(value) !== JSON.stringify(original)) changed.add(key);
  }
  return changed;
}
