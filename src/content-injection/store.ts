import path from "node:path";

/**
 * Content run output namespace.
 *
 * A content run gets its OWN directory and never writes a byte into anything
 * it read:
 *
 *   data/<host>/recon-templates/<run>/  ← READ ONLY (the application substrate)
 *   data/<host>/content-runs/<run-id>/  ← everything this Task writes
 *
 * The Recon Template stays immutable; a run's `slot-values.json` is an
 * OVERLAY applied through the template app's official injection path
 * (`WR_SLOT_VALUES_FILE`), never by editing the template artifact.
 */

const DATA_DIR = "data";
const CONTENT_RUNS_DIR = "content-runs";

/** `data/<host>/content-runs/<run-id>`. */
export function contentRunDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, CONTENT_RUNS_DIR, runId);
}

/** A run id for the OUTPUT directory only — never inside a generated file. */
export function newContentRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/**
 * The manifest's `createdAt`, recovered FROM the run id so the artifact holds
 * exactly one clock reading. `2026-08-18T10-11-12-345Z` → ISO string.
 */
export function createdAtFromRunId(runId: string): string {
  const m = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return runId;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}
