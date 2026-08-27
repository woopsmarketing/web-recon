import { CONTENT_POLICY } from "./policy.js";
import type { ContentGenerator } from "./providers.js";
import {
  BATCH_UNIT_LIMIT,
} from "./packet.js";
import {
  BatchExecutionReportSchema,
  CONTENT_SCHEMA_VERSION,
  ContentGenerationResultSchema,
  ContentValidationError,
  GenerationRequestSchema,
  type BatchCallRecord,
  type BatchExecutionReport,
  type BatchKeyConflict,
  type ContentGenerationResult,
  type ContentIntent,
  type ContentPolicy,
  type ContentUnit,
  type ContentUnitsFile,
  type GenerationBatch,
  type GenerationRequest,
  type ImageBrief,
  type PageContentPlan,
  type UnresolvedSlot,
} from "./types.js";
import type { TelemetryRecorder } from "../telemetry/index.js";

/**
 * Deterministic batch EXECUTION (Task 27 §1).
 *
 * `buildBatches()` (packet.ts) has produced correctly shaped batches since
 * Task 19 and until now nothing ever ran them: `src/cli-content-generate.ts`
 * passed `run.unitsFile.units` — the WHOLE set — to a single `generate()`
 * call, contradicting `GenerationRequestSchema`'s own comment that "one
 * request never carries the whole site" (on linear that was all 1,202 units in
 * one call). This module is the missing executor. It does NOT re-plan the
 * batches: it consumes the ones already persisted in `generation-request.json`
 * so a prepared packet and its execution can never disagree.
 *
 * Guarantees:
 *   - ORDER: the request's batch order, which is global first (site-wide
 *     consistency) then page batches in packet route order. Same input →
 *     same batch ids, same call order, byte-identical merged output.
 *   - BOUND: each call carries only its own batch's units, at most
 *     BATCH_UNIT_LIMIT of them, and a request narrowed to that one batch.
 *   - NO LAST-WRITE-WINS: a key produced by two batches is a recorded
 *     conflict. The first writer's value is kept so the merge stays
 *     deterministic, and the caller FAILS the run on any conflict.
 */

export interface BatchExecutionOptions {
  runId: string;
  intent: ContentIntent;
  policy?: ContentPolicy;
  unitsFile: ContentUnitsFile;
  request: GenerationRequest;
  generator: ContentGenerator;
  /** Optional, provider-neutral. No recorder → no telemetry file. */
  telemetry?: TelemetryRecorder;
  log?: (line: string) => void;
}

export interface BatchExecutionOutcome {
  result: ContentGenerationResult;
  report: BatchExecutionReport;
}

/** One executed batch and what it produced. Exposed for deterministic tests. */
export interface BatchResultEntry {
  batch: GenerationBatch;
  result: ContentGenerationResult;
}

export const BATCH_ORDERING_RULE =
  "global batches first, then page batches in packet route order; unit ids within a batch keep slots.json order; batch ids are assigned once at prepare time";

function conflict(
  kind: BatchKeyConflict["kind"],
  slotKey: string,
  batchIds: string[],
  identical: boolean,
  detail: string,
): BatchKeyConflict {
  return { kind, slotKey, batchIds, identical, detail };
}

/**
 * Recombine batch results into ONE generation result.
 *
 * Merge validation, in order: a key may only come from the batch that owns its
 * unit; a key may only be produced once; a key may not be assigned by one
 * batch and marked needs-input by another. Nothing is silently reconciled.
 */
export function mergeBatchResults(
  entries: readonly BatchResultEntry[],
  unitsFile: ContentUnitsFile,
): { merged: ContentGenerationResult; conflicts: BatchKeyConflict[] } {
  const unitById = new Map(unitsFile.units.map((unit) => [unit.unitId, unit] as const));
  const conflicts: BatchKeyConflict[] = [];

  const slotValues: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  const unresolved: UnresolvedSlot[] = [];
  const imageBriefs: ImageBrief[] = [];
  const synthetic: string[] = [];
  const notes: string[] = [];

  const valueOwner = new Map<string, string>();
  const unresolvedOwner = new Map<string, string>();
  const briefOwner = new Map<string, string>();

  for (const entry of entries) {
    const ownedKeys = new Set<string>();
    for (const unitId of entry.batch.unitIds) {
      const unit = unitById.get(unitId);
      if (!unit) continue;
      for (const slot of unit.slots) ownedKeys.add(slot.key);
    }
    const outOfBatch = (key: string): void => {
      if (ownedKeys.has(key)) return;
      conflicts.push(
        conflict(
          "out-of-batch-key",
          key,
          [entry.batch.batchId],
          false,
          `batch ${entry.batch.batchId} produced a key that belongs to no unit it was given`,
        ),
      );
    };

    for (const [key, value] of Object.entries(entry.result.slotValues)) {
      outOfBatch(key);
      const owner = valueOwner.get(key);
      if (owner !== undefined) {
        conflicts.push(
          conflict(
            "duplicate-slot-value",
            key,
            [owner, entry.batch.batchId],
            JSON.stringify(slotValues[key]) === JSON.stringify(value),
            "two batches produced a value for the same slot key; the first writer was kept and the run fails",
          ),
        );
        continue;
      }
      valueOwner.set(key, entry.batch.batchId);
      slotValues[key] = value;
      const source = entry.result.sources[key];
      if (source !== undefined) sources[key] = source;
    }

    for (const item of entry.result.unresolved) {
      outOfBatch(item.slotKey);
      const owner = unresolvedOwner.get(item.slotKey);
      if (owner !== undefined) {
        conflicts.push(
          conflict(
            "duplicate-unresolved",
            item.slotKey,
            [owner, entry.batch.batchId],
            unresolved.some((u) => u.slotKey === item.slotKey && u.reason === item.reason),
            "two batches marked the same slot needs-input",
          ),
        );
        continue;
      }
      unresolvedOwner.set(item.slotKey, entry.batch.batchId);
      unresolved.push(item);
    }

    for (const brief of entry.result.imageBriefs) {
      const owner = briefOwner.get(brief.slotKey);
      if (owner !== undefined) {
        conflicts.push(
          conflict(
            "duplicate-image-brief",
            brief.slotKey,
            [owner, entry.batch.batchId],
            JSON.stringify(imageBriefs.find((b) => b.slotKey === brief.slotKey)) === JSON.stringify(brief),
            "two batches produced an image brief for the same slot",
          ),
        );
        continue;
      }
      briefOwner.set(brief.slotKey, entry.batch.batchId);
      imageBriefs.push(brief);
    }

    for (const key of entry.result.synthetic ?? []) {
      if (!synthetic.includes(key)) synthetic.push(key);
    }
    for (const note of entry.result.notes ?? []) {
      if (!notes.includes(note)) notes.push(note);
    }
  }

  for (const [key, owner] of valueOwner) {
    const other = unresolvedOwner.get(key);
    if (other === undefined) continue;
    conflicts.push(
      conflict(
        "assigned-and-unresolved-across-batches",
        key,
        [owner, other],
        false,
        "one batch assigned a value and another marked the same slot needs-input",
      ),
    );
  }

  // Site plan: identity from the first batch that produced one (the global
  // batch, when there is one); page plans merged by route, first writer wins.
  const first = entries[0]?.result;
  if (first === undefined) {
    throw new ContentValidationError("batch recombination received no batch results");
  }
  const pagePlans: PageContentPlan[] = [];
  const plannedRoutes = new Set<string>();
  for (const entry of entries) {
    for (const plan of entry.result.sitePlan.pagePlans) {
      if (plannedRoutes.has(plan.route)) continue;
      plannedRoutes.add(plan.route);
      pagePlans.push(plan);
    }
  }

  const merged = ContentGenerationResultSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contractVersion: first.contractVersion,
    generator: first.generator,
    sitePlan: { ...first.sitePlan, pagePlans },
    slotValues,
    sources,
    unresolved,
    imageBriefs,
    ...(synthetic.length > 0 ? { synthetic } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  });
  return { merged, conflicts };
}

/** The request a single batch is given: the same packet, narrowed to one batch. */
function narrowRequest(request: GenerationRequest, batch: GenerationBatch): GenerationRequest {
  return GenerationRequestSchema.parse({ ...request, batches: [batch] });
}

export async function executeGenerationBatches(
  options: BatchExecutionOptions,
): Promise<BatchExecutionOutcome> {
  const { request, unitsFile, generator } = options;
  if (request.batches.length === 0) {
    throw new ContentValidationError("generation request carries no batches to execute");
  }
  const unitById = new Map(unitsFile.units.map((unit) => [unit.unitId, unit] as const));
  const entries: BatchResultEntry[] = [];
  const calls: BatchCallRecord[] = [];

  let callIndex = 0;
  for (const batch of request.batches) {
    const units: ContentUnit[] = batch.unitIds
      .map((unitId) => unitById.get(unitId))
      .filter((unit): unit is ContentUnit => unit !== undefined);
    const slotCount = units.reduce((total, unit) => total + unit.slots.length, 0);
    const routes = [...new Set(units.map((unit) => unit.route).filter((r): r is string => r !== undefined))];
    const startedAt = Date.now();
    let result: ContentGenerationResult;
    try {
      result = await generator.generate({
        mode: "initial",
        intent: options.intent,
        policy: options.policy ?? CONTENT_POLICY,
        units,
        request: narrowRequest(request, batch),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      calls.push({
        callIndex,
        batchId: batch.batchId,
        scope: batch.scope,
        ...(batch.route !== undefined ? { route: batch.route } : {}),
        unitCount: units.length,
        slotCount,
        assignedKeys: 0,
        unresolvedKeys: 0,
        imageBriefs: 0,
        outcome: "error",
        error: message,
      });
      await options.telemetry?.record({
        seamId: "content.generate.batch",
        stage: "initial",
        callIndex,
        provider: generator.name,
        batchIds: [batch.batchId],
        unitCount: units.length,
        slotCount,
        routes,
        elapsedMs: Date.now() - startedAt,
        retryCount: 0,
        outcome: "error",
        error: message,
      });
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    entries.push({ batch, result });
    calls.push({
      callIndex,
      batchId: batch.batchId,
      scope: batch.scope,
      ...(batch.route !== undefined ? { route: batch.route } : {}),
      unitCount: units.length,
      slotCount,
      assignedKeys: Object.keys(result.slotValues).length,
      unresolvedKeys: result.unresolved.length,
      imageBriefs: result.imageBriefs.length,
      outcome: "ok",
    });
    const usage = generator.lastUsage?.();
    await options.telemetry?.record({
      seamId: "content.generate.batch",
      stage: "initial",
      callIndex,
      provider: generator.name,
      ...(result.generator.model !== undefined ? { model: result.generator.model } : {}),
      batchIds: [batch.batchId],
      unitCount: units.length,
      slotCount,
      routes,
      elapsedMs,
      retryCount: 0,
      outcome: "ok",
      // ABSENT when the provider reports nothing — never zero-filled (§7).
      ...(usage !== undefined ? { usage } : {}),
    });
    options.log?.(
      `[content:generate] batch ${batch.batchId} (${batch.scope}${batch.route ? ` ${batch.route}` : ""}): ` +
        `${units.length} unit(s), ${Object.keys(result.slotValues).length} value(s)`,
    );
    callIndex++;
  }

  const { merged, conflicts } = mergeBatchResults(entries, unitsFile);
  const report = BatchExecutionReportSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-batch-execution-v1",
    runId: options.runId,
    executed: true,
    batchUnitLimit: request.batchUnitLimit ?? BATCH_UNIT_LIMIT,
    orderingRule: BATCH_ORDERING_RULE,
    calls,
    conflicts,
    sitePlanFromBatchId: entries[0].batch.batchId,
    mergedSlotValues: Object.keys(merged.slotValues).length,
    mergedUnresolved: merged.unresolved.length,
    provenance: "derived",
  });
  return { result: merged, report };
}

/** The failure a conflicting merge must raise — never a silent last-write-wins. */
export function assertNoBatchConflicts(report: BatchExecutionReport): void {
  if (report.conflicts.length === 0) return;
  const sample = report.conflicts
    .slice(0, 5)
    .map((c) => `${c.slotKey} (${c.kind}, batches ${c.batchIds.join("+")})`)
    .join("; ");
  throw new ContentValidationError(
    `batch recombination found ${report.conflicts.length} key conflict(s): ${sample}`,
  );
}
