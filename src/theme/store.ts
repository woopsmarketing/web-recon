import path from "node:path";

/**
 * Theme namespaces.
 *
 * A theme extraction and a theme run each get their OWN directory and never
 * write a byte into anything they read:
 *
 *   data/<host>/recon-templates/<run>/     ← READ ONLY (frozen substrate)
 *   data/<host>/content-runs/<run>/        ← READ ONLY (optional composition input)
 *   data/<host>/theme-extractions/<id>/    ← original theme + adapter + groups
 *   data/<host>/theme-runs/<id>/           ← selected theme + overlay + compat + QA
 */

const DATA_DIR = "data";

export function themeExtractionDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "theme-extractions", runId);
}

export function themeRunDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "theme-runs", runId);
}

/** A run id for the OUTPUT directory only — never inside a generated file. */
export function newThemeRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** `createdAt` recovered FROM the run id — one clock reading per artifact. */
export function createdAtFromRunId(runId: string): string {
  const match = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return runId;
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}
