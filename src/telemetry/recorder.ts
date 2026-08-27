import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  TELEMETRY_SCHEMA_NAME,
  TELEMETRY_SCHEMA_VERSION,
  TelemetryEventSchema,
  type TelemetryEvent,
  type TelemetryEventInput,
} from "./types.js";

/**
 * Append-only telemetry recorder.
 *
 * One JSON object per line (JSONL), appended — never rewritten — so a run that
 * crashes mid-generation still leaves every call it did make on disk, and two
 * stages writing to the same file cannot lose each other's records.
 *
 * The recorder is OPTIONAL everywhere it is used: a caller that passes no
 * recorder produces no file, and the pipeline behaves exactly as before.
 */
export interface TelemetryRecorderOptions {
  /** Absolute or repo-relative path of the `.jsonl` file. */
  file: string;
  engine: string;
  runId: string;
}

export class TelemetryRecorder {
  readonly file: string;
  private readonly engine: string;
  private readonly runId: string;
  private nextIndex = 0;
  private readonly written: TelemetryEvent[] = [];

  constructor(options: TelemetryRecorderOptions) {
    this.file = options.file;
    this.engine = options.engine;
    this.runId = options.runId;
  }

  /** Every event recorded by THIS recorder instance, in write order. */
  get events(): readonly TelemetryEvent[] {
    return this.written;
  }

  async record(input: TelemetryEventInput): Promise<TelemetryEvent> {
    const event = TelemetryEventSchema.parse({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      schemaName: TELEMETRY_SCHEMA_NAME,
      engine: this.engine,
      runId: this.runId,
      callIndex: input.callIndex ?? this.nextIndex,
      ...input,
    });
    this.nextIndex = event.callIndex + 1;
    await mkdir(path.dirname(path.resolve(this.file)), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(event)}\n`, "utf8");
    this.written.push(event);
    return event;
  }
}

/** Parse a telemetry file back into events (tests, reports). */
export function parseTelemetryLines(raw: string): TelemetryEvent[] {
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => TelemetryEventSchema.parse(JSON.parse(line) as unknown));
}
