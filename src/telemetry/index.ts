/**
 * Provider-neutral generation telemetry (Task 27 §7) — public API.
 *
 *   TelemetryRecorder     append-only JSONL recorder, optional everywhere
 *   TelemetryEvent        what was called, for what, how long, with what outcome
 *   TelemetryUsage        provider-reported usage ONLY — never estimated
 */
export * from "./types.js";
export { TelemetryRecorder, parseTelemetryLines, type TelemetryRecorderOptions } from "./recorder.js";
