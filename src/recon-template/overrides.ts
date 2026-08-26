import { readFile } from "node:fs/promises";
import {
  SlotOverridesSchema,
  TemplateOverrideError,
  type SlotOverrides,
} from "./types.js";
import type { KeyedSlot } from "./assemble.js";

/**
 * Manual override application (Slot V2's operator escape hatch).
 *
 * Runs between automatic extraction and id assignment. Every operation
 * addresses slots by their AUTOMATIC key, every unmatched address is an ERROR
 * (a silently ignored override is worse than a failed compile), and `merge`
 * refuses defaults that differ — merging two slots that render different
 * content would change the default render and break the lossless invariant.
 */

export async function loadOverrides(file: string): Promise<SlotOverrides> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new TemplateOverrideError(`override file could not be read: ${file} (${(error as Error).message})`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new TemplateOverrideError(`override file is not valid JSON: ${file} (${(error as Error).message})`);
  }
  const parsed = SlotOverridesSchema.safeParse(json);
  if (!parsed.success) {
    throw new TemplateOverrideError(`override file failed validation: ${file}\n${parsed.error.message}`);
  }
  return parsed.data;
}

export interface OverrideApplication {
  slots: KeyedSlot[];
  operationsApplied: number;
  excludedByOverride: number;
}

export function applyOverrides(slots: KeyedSlot[], overrides: SlotOverrides): OverrideApplication {
  let list = slots.map((s) => ({ ...s, appliedOverrides: [...s.appliedOverrides] }));
  let operations = 0;

  const find = (key: string, op: string): KeyedSlot => {
    const slot = list.find((s) => s.key === key);
    if (!slot) {
      throw new TemplateOverrideError(`${op} override addresses unknown slot key: ${key}`);
    }
    return slot;
  };

  // 1. exclude
  let excludedByOverride = 0;
  for (const op of overrides.exclude ?? []) {
    find(op.key, "exclude");
    list = list.filter((s) => s.key !== op.key);
    excludedByOverride++;
    operations++;
  }

  // 2. merge (before rename so both sides use automatic keys)
  for (const op of overrides.merge ?? []) {
    const target = find(op.into, "merge");
    for (const fromKey of op.from) {
      if (fromKey === op.into) {
        throw new TemplateOverrideError(`merge override merges ${fromKey} into itself`);
      }
      const source = find(fromKey, "merge");
      if (JSON.stringify(source.defaultValue) !== JSON.stringify(target.defaultValue)) {
        throw new TemplateOverrideError(
          `merge override refused: ${fromKey} and ${op.into} have different default values — ` +
            `merging them would change the default render`,
        );
      }
      if (source.type !== target.type) {
        throw new TemplateOverrideError(
          `merge override refused: ${fromKey} (${source.type}) and ${op.into} (${target.type}) have different types`,
        );
      }
      target.bindings = [...target.bindings, ...source.bindings];
      if (source.scope !== target.scope || source.pageId !== target.pageId) {
        // Cross-page merge widens the slot beyond one page.
        target.scope = "global";
        target.pageId = undefined;
        target.route = undefined;
      }
      list = list.filter((s) => s.key !== fromKey);
    }
    target.appliedOverrides.push(`merge:${op.from.join(",")}`);
    operations++;
  }

  // 3. rename
  for (const op of overrides.rename ?? []) {
    const slot = find(op.from, "rename");
    if (list.some((s) => s.key === op.to)) {
      throw new TemplateOverrideError(`rename override target key already exists: ${op.to}`);
    }
    slot.key = op.to;
    slot.appliedOverrides.push(`rename:${op.from}`);
    operations++;
  }

  // 4. role / 5. scope / 6. label / 7. editability
  for (const op of overrides.role ?? []) {
    const slot = find(op.key, "role");
    slot.role = op.role;
    slot.appliedOverrides.push(`role:${op.role}`);
    operations++;
  }
  for (const op of overrides.scope ?? []) {
    const slot = find(op.key, "scope");
    slot.scope = op.scope;
    if (op.scope === "global") {
      slot.pageId = undefined;
      slot.route = undefined;
    }
    slot.appliedOverrides.push(`scope:${op.scope}`);
    operations++;
  }
  for (const op of overrides.label ?? []) {
    const slot = find(op.key, "label");
    slot.labelText = op.label;
    slot.appliedOverrides.push("label");
    operations++;
  }
  for (const op of overrides.editability ?? []) {
    const slot = find(op.key, "editability");
    slot.editability = op.editability;
    slot.appliedOverrides.push(`editability:${op.editability}`);
    operations++;
  }

  return { slots: list, operationsApplied: operations, excludedByOverride };
}
