import path from "node:path";

/**
 * Slotized Template output namespace.
 *
 * Compilation NEVER writes into anything it reads:
 *   data/<host>/recon-templates/<run>/     ← READ ONLY (Slot V2 contract)
 *   data/<host>/reconstructions/<run>/     ← READ ONLY (the accepted answer)
 *   data/<host>/slotized-templates/<run>/  ← definitions this module writes
 *   data/<host>/slotized-renders/<run>/    ← rendered app copies
 */

const DATA_DIR = "data";
const SLOTIZED_TEMPLATES_DIR = "slotized-templates";
const SLOTIZED_RENDERS_DIR = "slotized-renders";

export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

export function slotizedTemplateRunDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, SLOTIZED_TEMPLATES_DIR, runId);
}

export function slotizedRenderRunDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, SLOTIZED_RENDERS_DIR, runId);
}

/** Run id for the OUTPUT directory only — never inside a definition file. */
export function newSlotizedRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** The manifest's `createdAt`, recovered FROM the run id (one clock reading). */
export function createdAtFromRunId(runId: string): string {
  const m = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return runId;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}
