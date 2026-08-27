import { createHash } from "node:crypto";
import type { SlotValue } from "../recon-template/types.js";
import {
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
  MAX_REPAIR_ITERATIONS,
  RepairRequestSchema,
  RepairStopSchema,
  type ContentUnit,
  type ContentUnitsFile,
  type LayoutQaReport,
  type RepairItem,
  type RepairRequest,
  type RepairStop,
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

// ---------------------------------------------------------------------------
// GED-D — bounded NO-PROGRESS detection (Task 27 §6)
// ---------------------------------------------------------------------------

/**
 * The loop above is bounded by MAX_REPAIR_ITERATIONS but has no notion of
 * PROGRESS, so a repair that cannot possibly change anything still burns every
 * iteration. The reproduction is a micro-slot: a slot whose
 * `sourceCharacterCount` is <= 3 meets `Math.max(4, target)` in
 * `providers.ts:75`, so the "shortened" value comes back byte-identical to the
 * value that failed. Two on-disk runs show it — iteration 1 and 2 of
 * `data/domainchecker.co.kr/content-runs/2026-08-19T07-18-26-879Z/report/repair/`
 * and of `data/nextjs.org/content-runs/2026-08-19T07-13-56-376Z/report/repair/`
 * are the same bytes.
 *
 * ONLY the guard is taken here. The provider half of GED-D (making the fake
 * generator length-aware) is deliberately out of scope: `fakeText` decides
 * every generated string in the repo and smoke:seo, smoke:release and
 * smoke:production all pin its literal output.
 *
 * A stop always RECORDS WHY, as a `RepairStop` — machine-readable, persisted
 * to `report/repair/repair-stop.json` and to the run manifest, never a log line.
 */

/**
 * A deterministic fingerprint of the FAILURE the repair is answering: the
 * repair candidates with their reasons and evidence, plus the failing pages.
 * Two iterations with the same signature learned nothing between them.
 */
export function failureSignatureOf(layoutQa: LayoutQaReport): string {
  const candidates = layoutQa.repairCandidates
    .map((c) => `${c.slotKey}|${c.reason}|${[...c.evidence].sort().join(",")}`)
    .sort();
  const pages = layoutQa.pages
    .filter((page) => !page.pass)
    .map((page) => `${page.route}@${page.width}|${[...page.notes].sort().join(",")}`)
    .sort();
  return createHash("sha256")
    .update(`repair-failure-v1\n${candidates.join("\n")}\n--\n${pages.join("\n")}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/** Keys whose repaired value actually differs from the value already in place. */
export function changedRepairKeys(
  currentOverlay: Record<string, SlotValue>,
  repairedValues: Record<string, SlotValue>,
): string[] {
  return Object.keys(repairedValues)
    .filter((key) => JSON.stringify(repairedValues[key]) !== JSON.stringify(currentOverlay[key]))
    .sort();
}

/** One repair round, described in the terms the guard reasons about. */
export interface RepairAttempt {
  iteration: number;
  /** Slot keys the repair request asked about, sorted. */
  candidateKeys: string[];
  /** `failureSignatureOf()` of the layout QA report that triggered this round. */
  failureSignature: string;
  /** What the generator returned for those keys. */
  repairedValues: Record<string, SlotValue>;
  /** The overlay the repair would be merged onto. */
  currentOverlay: Record<string, SlotValue>;
}

/**
 * Bounded no-progress guard. Stateful across iterations of ONE loop; the caller
 * feeds each attempt before applying it and stops on any returned RepairStop.
 */
export class RepairProgressGuard {
  private previous:
    | { repairedValues: string; failureSignature: string; candidateKeys: string }
    | undefined;

  /**
   * Checks, in order of specificity:
   *   1. the repair changes NOTHING that is not already in the overlay,
   *   2. the repaired values are identical to the previous iteration's,
   *   3. the failure signature (and candidate set) repeats.
   * Any of them means another iteration cannot help.
   */
  evaluate(attempt: RepairAttempt): RepairStop | undefined {
    const repairedValues = JSON.stringify(attempt.repairedValues);
    const candidateKeys = attempt.candidateKeys.join(",");
    const changed = changedRepairKeys(attempt.currentOverlay, attempt.repairedValues);
    const unchanged = attempt.candidateKeys.filter((key) => !changed.includes(key));

    const stop = (reason: RepairStop["reason"], detail: string): RepairStop =>
      RepairStopSchema.parse({
        reason,
        iteration: attempt.iteration,
        detail,
        unchangedSlotKeys: unchanged,
      });

    let result: RepairStop | undefined;
    if (changed.length === 0) {
      result = stop(
        "no-candidate-keys-changed",
        `iteration ${attempt.iteration} produced no value different from the current overlay for any of its ${attempt.candidateKeys.length} candidate slot(s)`,
      );
    } else if (this.previous?.repairedValues === repairedValues) {
      result = stop(
        "repair-values-identical",
        `iteration ${attempt.iteration} returned byte-identical values to iteration ${attempt.iteration - 1}`,
      );
    } else if (
      this.previous?.failureSignature === attempt.failureSignature &&
      this.previous?.candidateKeys === candidateKeys
    ) {
      result = stop(
        "failure-signature-repeated",
        `iteration ${attempt.iteration} is answering failure signature ${attempt.failureSignature} for the second time with the same candidate set`,
      );
    }

    this.previous = { repairedValues, failureSignature: attempt.failureSignature, candidateKeys };
    return result;
  }
}

/** The terminal reasons the loop records when the guard never fired. */
export function repairStopFromLoop(
  iteration: number,
  reason: RepairStop["reason"],
  detail: string,
): RepairStop {
  return RepairStopSchema.parse({ reason, iteration, detail, unchangedSlotKeys: [] });
}

/**
 * `no-repair-candidates` covers two DIFFERENT facts and the record must say
 * which: `completedIterations === 0` means no repair iteration ever ran (the
 * first layout QA report had nothing repairable in it), while any higher
 * number means the loop ran that many and then found nothing left. Iteration 0
 * is not an iteration, so the detail never calls it one.
 */
export function noRepairCandidatesStop(completedIterations: number): RepairStop {
  return repairStopFromLoop(
    completedIterations,
    "no-repair-candidates",
    completedIterations === 0
      ? "never started: the first layout QA report produced no repairable slot (every candidate is an operator decision)"
      : `stopped after ${completedIterations} completed iteration(s): no repairable slot remained (every candidate left is an operator decision)`,
  );
}
