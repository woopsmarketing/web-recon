import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TelemetryUsage } from "../telemetry/index.js";
import type { ContentGenerationInput, ContentGenerator } from "./providers.js";
import {
  AuthoringDeltaSchema,
  ContentGenerationResultSchema,
  ContentInputError,
  type AuthoringDelta,
  type ContentGenerationResult,
  type SlotValueSource,
  type UnresolvedSlot,
} from "./types.js";

/**
 * A HAND-AUTHORED result, made REPRODUCIBLE (Task 28 Phase 9).
 *
 * There is no LLM API key in this repo — `src/config/env.ts` declares only
 * FIRECRAWL_API_KEY — and the program explicitly sanctions the overnight agent
 * authoring the structured generation result itself through the manual seam.
 * The risk that creates is a large JSON that nobody can tell apart from a live
 * model call, and whose individual value decisions have no stated reason.
 *
 * An AUTHORING DELTA closes exactly that gap:
 *
 *   - it NAMES the base result it starts from, with its sha256, so the input
 *     is pinned and the composition is re-derivable byte for byte;
 *   - it states who authored it, by what procedure, and asserts
 *     `liveModelCall: false` in the schema itself;
 *   - it carries ONLY the values this authoring pass decided, each with a
 *     rationale, so the hand-authored surface is small and reviewable;
 *   - it SEPARATES resolutions (keys the base left needs-input) from rewrites
 *     (keys the base already valued) and REJECTS a delta that mislabels one,
 *     so "we cleared 117 blockers" can never be a relabelling exercise.
 *
 * The composed result goes through the SAME zod schema, the SAME validator and
 * the SAME truth mode as any provider output. Nothing here is a privileged path.
 */

export function sha256OfFile(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function loadAuthoringDelta(file: string): Promise<AuthoringDelta> {
  let raw: string;
  try {
    raw = await readFile(path.resolve(file), "utf8");
  } catch {
    throw new ContentInputError(`cannot read authoring delta ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
  const delta = AuthoringDeltaSchema.safeParse(parsed);
  if (!delta.success) {
    throw new ContentInputError(
      `${file} is not a content authoring delta: ${delta.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return delta.data;
}

export interface ComposedAuthoredResult {
  result: ContentGenerationResult;
  /** What the composition actually did — measured, not asserted by the delta. */
  applied: {
    resolutions: number;
    rewrites: number;
    keptUnresolved: number;
    syntheticKeys: number;
    baseSlotValues: number;
    composedSlotValues: number;
    baseUnresolved: number;
    composedUnresolved: number;
  };
}

/**
 * base + delta → one generation result. Deterministic and total: every rule the
 * delta breaks throws, so a composition either reproduces exactly or fails.
 */
export function composeAuthoredResult(
  base: ContentGenerationResult,
  delta: AuthoringDelta,
  baseRaw?: string,
): ComposedAuthoredResult {
  if (baseRaw !== undefined) {
    const actual = sha256OfFile(baseRaw);
    if (actual !== delta.base.sha256) {
      throw new ContentInputError(
        `authoring delta pins base sha256 ${delta.base.sha256} but ${delta.base.file} hashes to ${actual}`,
      );
    }
  }
  if (Object.keys(base.slotValues).length !== delta.base.slotValues) {
    throw new ContentInputError(
      `authoring delta says the base holds ${delta.base.slotValues} slot value(s); it holds ${Object.keys(base.slotValues).length}`,
    );
  }
  if (base.unresolved.length !== delta.base.unresolved) {
    throw new ContentInputError(
      `authoring delta says the base holds ${delta.base.unresolved} unresolved entr(ies); it holds ${base.unresolved.length}`,
    );
  }

  const slotValues: Record<string, unknown> = { ...base.slotValues };
  const sources: Record<string, SlotValueSource> = { ...base.sources };
  const unresolvedByKey = new Map<string, UnresolvedSlot>();
  for (const entry of base.unresolved) unresolvedByKey.set(entry.slotKey, entry);
  const synthetic = new Set(base.synthetic ?? []);

  const seen = new Set<string>();
  const claim = (slotKey: string, kind: string): void => {
    if (seen.has(slotKey)) {
      throw new ContentInputError(`authoring delta decides ${slotKey} more than once (${kind})`);
    }
    seen.add(slotKey);
  };

  for (const item of delta.resolutions) {
    claim(item.slotKey, "resolution");
    if (!unresolvedByKey.has(item.slotKey)) {
      throw new ContentInputError(
        `authoring delta lists ${item.slotKey} as a RESOLUTION but the base never left it unresolved — ` +
          "a value the base already had is a rewrite, and calling it a resolution would inflate the " +
          "number of needs-input entries this pass actually cleared",
      );
    }
    unresolvedByKey.delete(item.slotKey);
    slotValues[item.slotKey] = item.value;
    sources[item.slotKey] = item.source;
    if (item.synthetic === true) synthetic.add(item.slotKey);
  }
  for (const item of delta.rewrites) {
    claim(item.slotKey, "rewrite");
    if (base.slotValues[item.slotKey] === undefined) {
      throw new ContentInputError(
        `authoring delta lists ${item.slotKey} as a REWRITE but the base held no value for it`,
      );
    }
    slotValues[item.slotKey] = item.value;
    sources[item.slotKey] = item.source;
    if (item.synthetic === true) synthetic.add(item.slotKey);
  }
  for (const item of delta.keepUnresolved) {
    claim(item.slotKey, "keepUnresolved");
    if (!unresolvedByKey.has(item.slotKey)) {
      throw new ContentInputError(
        `authoring delta keeps ${item.slotKey} unresolved but the base never left it unresolved`,
      );
    }
    unresolvedByKey.set(item.slotKey, { slotKey: item.slotKey, reason: item.reason });
  }

  const composed = ContentGenerationResultSchema.parse({
    ...base,
    generator: delta.generator,
    ...(delta.sitePlan !== undefined ? { sitePlan: delta.sitePlan } : {}),
    slotValues,
    sources,
    unresolved: [...unresolvedByKey.values()],
    ...(synthetic.size > 0 ? { synthetic: [...synthetic].sort() } : {}),
    notes: [
      ...(base.notes ?? []),
      `authoring delta applied: ${delta.resolutions.length} resolution(s), ${delta.rewrites.length} rewrite(s), ` +
        `${delta.keepUnresolved.length} kept needs-input — authored by ${delta.authoredBy.agent} ` +
        `(${delta.authoredBy.procedure}), liveModelCall=false`,
      ...delta.notes,
    ],
  });

  return {
    result: composed,
    applied: {
      resolutions: delta.resolutions.length,
      rewrites: delta.rewrites.length,
      keptUnresolved: delta.keepUnresolved.length,
      syntheticKeys: synthetic.size,
      baseSlotValues: Object.keys(base.slotValues).length,
      composedSlotValues: Object.keys(composed.slotValues).length,
      baseUnresolved: base.unresolved.length,
      composedUnresolved: composed.unresolved.length,
    },
  };
}

/**
 * The authored result served through the SAME `ContentGenerator` interface a
 * remote provider would implement.
 *
 * This is what keeps the seam honest. Before this, `--result` was a bypass: a
 * hand-authored file went straight to the ingest while only `--provider` ran
 * the packet's batches. Now an authored result is a PROVIDER — it answers one
 * `generate()` call per batch with the slice of values that batch's units asked
 * for, is merged by the same first-writer-wins merger, and is counted by the
 * same telemetry. No vendor SDK is imported anywhere in this module or its
 * dependencies; a future remote provider replaces this class and nothing else.
 */
export class AuthoredResultGenerator implements ContentGenerator {
  readonly name: string;
  private readonly authored: ContentGenerationResult;
  /** Keys no batch ever asked for. A silent drop would be a lost value. */
  private servedKeys = new Set<string>();

  constructor(authored: ContentGenerationResult) {
    this.authored = authored;
    this.name = authored.generator.name;
  }

  async generate(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    const wanted = new Set<string>();
    for (const unit of input.units) for (const slot of unit.slots) wanted.add(slot.key);
    const slotValues: Record<string, unknown> = {};
    const sources: Record<string, SlotValueSource> = {};
    for (const [key, value] of Object.entries(this.authored.slotValues)) {
      if (!wanted.has(key)) continue;
      slotValues[key] = value;
      const source = this.authored.sources[key];
      if (source !== undefined) sources[key] = source;
      this.servedKeys.add(key);
    }
    const unresolved = this.authored.unresolved.filter((entry) => wanted.has(entry.slotKey));
    for (const entry of unresolved) this.servedKeys.add(entry.slotKey);
    const imageBriefs = this.authored.imageBriefs.filter((brief) => wanted.has(brief.slotKey));
    const synthetic = (this.authored.synthetic ?? []).filter((key) => wanted.has(key));
    return ContentGenerationResultSchema.parse({
      ...this.authored,
      slotValues,
      sources,
      unresolved,
      imageBriefs,
      ...(synthetic.length > 0 ? { synthetic } : { synthetic: undefined }),
    });
  }

  /** No usage is reported: an out-of-process author measures none (Task 27 §7). */
  lastUsage(): TelemetryUsage | undefined {
    return undefined;
  }

  /**
   * Keys the authored result carries that NO batch asked for. Non-empty means
   * the batched path would silently lose them, so the caller must fail rather
   * than ship a quietly smaller site.
   */
  unservedKeys(): string[] {
    const all = new Set<string>([
      ...Object.keys(this.authored.slotValues),
      ...this.authored.unresolved.map((entry) => entry.slotKey),
    ]);
    return [...all].filter((key) => !this.servedKeys.has(key)).sort();
  }
}
