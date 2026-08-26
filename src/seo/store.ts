import path from "node:path";

/**
 * web-recon SEO — directory namespaces + run-id helpers (Task 21).
 *
 * Two SEPARATE namespaces, one per data model — Source SEO evidence and
 * Production SEO plans never share a directory, a schema, or a run id:
 *
 *   data/<host>/source-seo-snapshots/<run-id>/   source-seo-snapshot-v1
 *   data/<host>/production-seo-plans/<run-id>/   production-seo-plan-v1
 *
 * READ ONLY siblings (immutable inputs, never written by this module):
 *   data/<host>/site-observations/  data/<host>/recon-templates/
 *   data/<host>/content-runs/       data/<host>/<discovery-run>/
 */

const DATA_DIR = "data";

export function sourceSeoSnapshotDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "source-seo-snapshots", runId);
}

export function productionSeoPlanDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "production-seo-plans", runId);
}

/** One clock reading per artifact: `2026-08-19T04-07-11-123Z`. */
export function newSeoRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

const RUN_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;

export function createdAtFromRunId(runId: string): string {
  const match = RUN_ID_PATTERN.exec(runId);
  if (!match) throw new Error(`not a run id: ${runId}`);
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}
