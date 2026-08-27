import type { SlotValue } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  SLOT_DISPOSITIONS,
  SLOT_ORIGINS,
  SlotAccountingFileSchema,
  CONTENT_SCHEMA_VERSION,
  type ContentRunManifest,
  type ContentTruthMode,
  type ContentUnitsFile,
  type SlotAccountingEntry,
  type SlotAccountingFile,
  type SlotDisposition,
  type SlotOrigin,
  type TruthModeDecision,
  type UnresolvedSlot,
} from "./types.js";

/**
 * Total slot accounting (Task 27 §2/§3).
 *
 * The question this artifact answers is not "how many slots did we fill?" but
 * "what happened to EVERY in-scope customer-facing slot?". Task 19 could not
 * answer it: `sources` recorded provenance for written keys only, `unresolved`
 * recorded a state for a different subset, and nothing tied either back to the
 * full in-scope population — so a slot that was simply never mentioned
 * appeared in no number at all.
 *
 * TWO ORTHOGONAL AXES, never one mixed enum:
 *
 *   origin       where the value that will RENDER here came from
 *   disposition  what happened to the slot in THIS run
 *
 * Every in-scope slot carries exactly one of each, and `reconciliation` proves
 * it inside the artifact: unique keys == in-scope count, and each axis's totals
 * sum to the same number, with the names of anything missing or double-counted.
 *
 * The artifact is a SIBLING of `slot-values.json` and never changes it —
 * the overlay stays a bare `{ slotKey: value }` map, which is what the release
 * orchestrator reads.
 */

/** The in-scope population: everything `buildContentUnits` saw for the run. */
export function inScopeSlotKeys(unitsFile: ContentUnitsFile): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const unit of unitsFile.units) {
    for (const slot of unit.slots) {
      if (seen.has(slot.key)) continue;
      seen.add(slot.key);
      keys.push(slot.key);
    }
  }
  // Review-flagged slots are in scope even when they were never opted in:
  // they are the honest ambiguity bucket, not an absence.
  for (const key of unitsFile.reviewSlotKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function isEmptyValue(value: SlotValue): boolean {
  if (typeof value === "string") return value.trim() === "";
  return typeof value === "object" && value !== null && String(value.src ?? "").trim() === "";
}

export interface SlotAccountingInput {
  manifest: ContentRunManifest;
  template: LoadedReconTemplate;
  unitsFile: ContentUnitsFile;
  /** The overlay that will actually be written (bare slotKey → value). */
  overlay: Record<string, SlotValue>;
  /** Per-key provenance from the generation result, when there is one. */
  sources: Record<string, string>;
  unresolved: readonly UnresolvedSlot[];
  truthMode: ContentTruthMode;
  truthDecisions: readonly TruthModeDecision[];
  /** Keys whose value is an accepted invention (synthetic-allowed only). */
  syntheticKeys?: ReadonlySet<string>;
  /** True when the operator hand-edited the overlay (§29): unmarked = theirs. */
  manualEdits?: boolean;
}

interface Classified {
  origin: SlotOrigin;
  disposition: SlotDisposition;
  detail: string;
}

function classify(input: SlotAccountingInput, key: string, unitKeys: Set<string>): Classified {
  const { overlay, sources, template } = input;
  const value = overlay[key];
  if (value !== undefined) {
    const declaredSource = sources[key];
    const origin: SlotOrigin = input.syntheticKeys?.has(key)
      ? "synthetic-fact"
      : declaredSource === "user-provided"
        ? "user-provided"
        : declaredSource === "derived-copy"
          ? "derived-copy"
          : declaredSource === "generated-marketing"
            ? "generated-marketing"
            : // No provenance recorded: only the §29 manual path can produce
              // that, and there the operator typed the value themselves.
              "user-provided";
    if (isEmptyValue(value)) {
      return { origin, disposition: "removed", detail: "value written as empty — the content was removed on purpose" };
    }
    const original = template.defaultContent.values[key];
    if (JSON.stringify(value) === JSON.stringify(original)) {
      return { origin, disposition: "preserved", detail: "written value is identical to the source default" };
    }
    return { origin, disposition: "applied", detail: "new value differs from the source default and is in the overlay" };
  }
  const refused = input.unresolved.find((item) => item.slotKey === key);
  if (refused !== undefined) {
    return { origin: "source-preserved", disposition: "unresolved", detail: refused.reason };
  }
  if (!unitKeys.has(key)) {
    return {
      origin: "source-preserved",
      disposition: "human-required",
      detail: "review-flagged slot outside the generation scope; a human decides it (never auto-written)",
    };
  }
  return {
    origin: "source-preserved",
    disposition: "preserved",
    detail: "in scope but no value was produced; the source default still renders",
  };
}

export function buildSlotAccounting(input: SlotAccountingInput): SlotAccountingFile {
  const { manifest, template, unitsFile } = input;
  const unitKeys = new Set<string>();
  for (const unit of unitsFile.units) for (const slot of unit.slots) unitKeys.add(slot.key);

  const keys = inScopeSlotKeys(unitsFile);
  const entries: SlotAccountingEntry[] = [];
  const byOrigin: Record<string, number> = Object.fromEntries(SLOT_ORIGINS.map((o) => [o, 0]));
  const byDisposition: Record<string, number> = Object.fromEntries(SLOT_DISPOSITIONS.map((d) => [d, 0]));
  const seen = new Set<string>();
  const doubleCounted: string[] = [];

  for (const key of keys) {
    if (seen.has(key)) {
      doubleCounted.push(key);
      continue;
    }
    seen.add(key);
    const slot = template.slotByKey.get(key);
    if (slot === undefined) continue;
    const { origin, disposition, detail } = classify(input, key, unitKeys);
    byOrigin[origin] = (byOrigin[origin] ?? 0) + 1;
    byDisposition[disposition] = (byDisposition[disposition] ?? 0) + 1;
    entries.push({
      slotKey: key,
      scope: slot.scope,
      ...(slot.route !== undefined ? { route: slot.route } : {}),
      type: slot.type,
      editability: slot.editability,
      origin,
      disposition,
      customerFacing: slot.editability === "editable" ? "confirmed" : "ambiguous",
      detail,
    });
  }

  // The DENOMINATOR is the in-scope population, not the rows we managed to
  // produce: a key that fell out is a `missing` name, never a smaller total.
  const accounted = new Set(entries.map((entry) => entry.slotKey));
  const missing = keys.filter((key) => !accounted.has(key));
  const originTotal = Object.values(byOrigin).reduce((a, b) => a + b, 0);
  const dispositionTotal = Object.values(byDisposition).reduce((a, b) => a + b, 0);
  const inScopeSlots = keys.length;
  const ambiguousSlots = entries.filter((entry) => entry.customerFacing === "ambiguous").length;

  return SlotAccountingFileSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-slot-accounting-v1",
    runId: manifest.runId,
    templateId: manifest.templateId,
    truthMode: input.truthMode,
    scopedRoutes: manifest.scopedRoutes,
    originValues: [...SLOT_ORIGINS],
    dispositionValues: [...SLOT_DISPOSITIONS],
    entries,
    totals: { inScopeSlots, byOrigin, byDisposition },
    reconciliation: {
      inScopeSlots,
      uniqueSlotKeys: accounted.size,
      originTotal,
      dispositionTotal,
      missing,
      doubleCounted,
      reconciled:
        missing.length === 0 &&
        doubleCounted.length === 0 &&
        originTotal === inScopeSlots &&
        dispositionTotal === inScopeSlots,
    },
    scopeHonesty: {
      editableSlots: accounted.size - ambiguousSlots,
      reviewSlots: unitsFile.reviewSlotKeys.length,
      ambiguousSlots,
      templateExcludedCandidates: template.manifest.counts.excludedCandidates,
      note:
        "customer-facing detection is NOT claimed to be complete. `confirmed` means the Slot V2 compiler " +
        "classified the slot editable; `ambiguous` means it flagged the slot for review and this run did not " +
        "resolve it. templateExcludedCandidates counts text/image/anchor candidates the compiler's exclusions " +
        "suppressed before slotting, which never reach this account at all.",
    },
    truthDecisions: [...input.truthDecisions],
    provenance: "derived",
  });
}
