import path from "node:path";

/**
 * Recon Template output namespace.
 *
 * A template compile gets its OWN directory and never writes a byte into
 * anything it read:
 *
 *   data/<host>/site-specs/<run>/        ← READ ONLY (lineage + constraints)
 *   data/<host>/reconstructions/<run>/   ← READ ONLY (the answer sheet)
 *   data/<host>/recon-templates/<run-id>/ ← everything this Task writes
 *
 * The run directory name carries a timestamp; every file INSIDE it is a pure
 * function of the two inputs, the override file and the run id (the manifest's
 * `createdAt` is derived from the run id, so there is no second clock).
 */

const DATA_DIR = "data";
const RECON_TEMPLATES_DIR = "recon-templates";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/recon-templates/<run-id>`. */
export function reconTemplateRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), RECON_TEMPLATES_DIR, runId);
}

/** A run id for the OUTPUT directory only — never inside a generated file. */
export function newTemplateRunId(now = new Date()): string {
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
