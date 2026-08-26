import {
  E2eError,
  FATAL_FAILURES,
  type E2eFailure,
  type StageName,
  type StageRecord,
  type StageStatus,
} from "./types.js";
import type { E2eRunContext } from "./run-context.js";

/**
 * The one place a stage is run (Task 16, items 37, 38, 113).
 *
 * Every stage goes through here so that four things are true of ALL of them and
 * not just the ones somebody remembered:
 *
 *  - **elapsed time is recorded even when the stage throws.** A run that died
 *    nine minutes into observation and one that died two seconds in are
 *    different reports.
 *  - **a failure has a NAME.** `E2eFailure` is a closed vocabulary, so
 *    "verification found nothing" and "the browser crashed" cannot collapse
 *    into one `failed`. The whole point of item 37.
 *  - **fatality is a property of the failure, not of the call site.** A page
 *    that failed to observe costs one page; zero verified routes costs
 *    everything downstream. That decision lives in `FATAL_FAILURES`, in one
 *    place, rather than in thirteen `if` statements.
 *  - **a partial stage still records what it produced.** `observation-partial`
 *    carries the successful pages' artifact path, because the run continues on
 *    them.
 */

export interface StageOutcome {
  status?: StageStatus;
  artifact?: string;
  runDir?: string;
  counts?: Record<string, number>;
  warnings?: string[];
  /** A non-fatal failure the stage survived; recorded, run continues. */
  failure?: E2eFailure;
  bytes?: number;
}

export interface ExecuteStageInput<T> {
  context: E2eRunContext;
  stage: StageName;
  /** The failure name to use when the stage throws something unclassified. */
  onError: E2eFailure;
  run: () => Promise<{ outcome: StageOutcome; value: T }>;
}

export interface StageResult<T> {
  record: StageRecord;
  value?: T;
}

export async function executeStage<T>(
  input: ExecuteStageInput<T>,
): Promise<StageResult<T>> {
  const { context, stage } = input;
  context.log(`[e2e] ▶ ${stage}`);
  const startedAt = Date.now();

  try {
    const { outcome, value } = await input.run();
    const elapsedMs = Date.now() - startedAt;
    /*
     * A stage can legitimately run twice: family escalation recompiles the
     * SiteSpec, regenerates, rebuilds and re-measures. The manifest keeps the
     * LATEST result — that is the one the final reconstruction came from — but
     * ACCUMULATES elapsed time and says out loud that it ran again, because a
     * timing table that silently reports only the second pass under-reports the
     * run by however long the first one took.
     */
    const previous = context.stages.get(stage);
    const warnings = [...(outcome.warnings ?? [])];
    if (previous) {
      warnings.unshift(
        `stage ran ${countRuns(previous) + 1} times in this run ` +
          `(family escalation recompiles and re-measures); ` +
          `elapsedMs is the total across all passes`,
      );
    }
    const record: StageRecord = {
      stage,
      status: outcome.status ?? (outcome.failure ? "partial" : "ok"),
      ...(outcome.artifact !== undefined ? { artifact: outcome.artifact } : {}),
      ...(outcome.runDir !== undefined ? { runDir: outcome.runDir } : {}),
      counts: outcome.counts ?? {},
      warnings,
      ...(outcome.failure !== undefined ? { failure: outcome.failure } : {}),
      elapsedMs: elapsedMs + (previous?.elapsedMs ?? 0),
    };
    context.stages.set(stage, record);
    context.timings[stage] = record.elapsedMs;
    if (outcome.bytes !== undefined) context.storageBytes[stage] = outcome.bytes;
    for (const warning of record.warnings) {
      context.log(`[e2e]   ! ${stage}: ${warning}`);
    }

    if (record.failure !== undefined && FATAL_FAILURES.includes(record.failure)) {
      record.status = "failed";
      throw new E2eError(`${stage} failed: ${record.failure}`, record.failure);
    }
    context.log(`[e2e] ✔ ${stage} (${elapsedMs} ms) — ${record.status}`);
    return { record, value };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const failure = err instanceof E2eError ? err.failure : input.onError;
    const existing = context.stages.get(stage);
    const record: StageRecord = {
      stage,
      status: "failed",
      ...(existing?.artifact !== undefined ? { artifact: existing.artifact } : {}),
      ...(existing?.runDir !== undefined ? { runDir: existing.runDir } : {}),
      counts: existing?.counts ?? {},
      warnings: existing?.warnings ?? [],
      failure,
      error: {
        name: err instanceof Error ? err.name : typeof err,
        // First line only: a stack trace in an artifact is noise that also leaks
        // the machine's directory layout (the Task 09 rule, kept).
        message: firstLine(err),
      },
      elapsedMs,
    };
    context.stages.set(stage, record);
    context.timings[stage] = elapsedMs;
    context.log(`[e2e] ✖ ${stage} (${elapsedMs} ms) — ${failure}: ${record.error?.message}`);
    throw err instanceof E2eError
      ? err
      : new E2eError(record.error?.message ?? String(err), failure);
  }
}

/** Record a stage that was deliberately not run (item 37: skipped ≠ failed). */
export function recordSkipped(
  context: E2eRunContext,
  stage: StageName,
  reason: string,
): void {
  context.stages.set(stage, {
    stage,
    status: "skipped",
    counts: {},
    warnings: [reason],
    elapsedMs: 0,
  });
  context.timings[stage] = 0;
}

/** How many passes a stage record already represents, read from its own note. */
function countRuns(record: StageRecord): number {
  const note = record.warnings.find((warning) => warning.startsWith("stage ran "));
  if (!note) return 1;
  const match = /^stage ran (\d+) times/.exec(note);
  return match ? Number(match[1]) : 1;
}

const MAX_MESSAGE_LEN = 600;

/**
 * A bounded, single-line rendering of an error — WITHOUT throwing away the
 * reason.
 *
 * The first version of this kept only the text before the first newline, which
 * is fine for a one-line message and useless for the ones that matter:
 * `GeneratedAppValidationError` puts its headline on line one and every actual
 * problem on the lines after it, so a real stripe.com failure was recorded as
 * `generated app failed validation:` with nothing after the colon. Lines are
 * joined instead of cut, and the whole thing is capped.
 */
function firstLine(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const joined = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ")
    .replace(/\s+/g, " ");
  return joined.length > MAX_MESSAGE_LEN
    ? `${joined.slice(0, MAX_MESSAGE_LEN)}…`
    : joined;
}
