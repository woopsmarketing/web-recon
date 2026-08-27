import { z } from "zod";

/**
 * Provider-neutral generation telemetry (Task 27 §7).
 *
 * NO REAL SDK OR REMOTE PROVIDER EXISTS IN THIS REPO YET, so nothing here
 * fabricates a token count or a dollar figure. The recorder writes what it can
 * actually observe — who was called, for which batch, over how many units,
 * how long it took, and whether it worked. The `usage` block is the only place
 * provider-reported numbers may appear and it is OMITTED ENTIRELY whenever the
 * caller did not supply one. The manual out-of-process seam
 * (`--result <file>`) therefore leaves it ABSENT, which is the correct record:
 * an absent measurement is information, a zero is a lie.
 */

export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_SCHEMA_NAME = "generation-telemetry-v1" as const;

/**
 * Provider-reported usage. Every field optional — a provider that reports only
 * output tokens records only output tokens.
 */
export const TelemetryUsageSchema = z
  .object({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    cacheReadInputTokens: z.number().nonnegative().optional(),
    cacheCreationInputTokens: z.number().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  })
  .strict();
export type TelemetryUsage = z.infer<typeof TelemetryUsageSchema>;

export const TelemetryEventSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    schemaName: z.literal(TELEMETRY_SCHEMA_NAME),
    /** The engine that owns the seam, e.g. natural-language-content-injection. */
    engine: z.string(),
    runId: z.string(),
    /** Stable identifier of the CALL SITE, e.g. `content.generate.batch`. */
    seamId: z.string(),
    /** The stage within that seam, e.g. `initial` | `repair` | `manual`. */
    stage: z.string(),
    /** 0-based index of this call within the run's seam. */
    callIndex: z.number().int().nonnegative(),
    provider: z.string(),
    model: z.string().optional(),
    batchIds: z.array(z.string()),
    unitCount: z.number().int().nonnegative(),
    slotCount: z.number().int().nonnegative(),
    routes: z.array(z.string()),
    elapsedMs: z.number().int().nonnegative(),
    retryCount: z.number().int().nonnegative(),
    outcome: z.enum(["ok", "error"]),
    error: z.string().optional(),
    /** ABSENT unless the provider actually reported usage. Never estimated. */
    usage: TelemetryUsageSchema.optional(),
  })
  .strict();
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

/** What a caller supplies; the recorder fills in the envelope fields. */
export type TelemetryEventInput = Omit<
  TelemetryEvent,
  "schemaVersion" | "schemaName" | "engine" | "runId" | "callIndex"
> & { callIndex?: number };
