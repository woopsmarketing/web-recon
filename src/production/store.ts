/**
 * Path conventions for production artifacts (Task 23).
 *
 * Two new namespaces, both additive (never touching historical runs):
 *   data/<host>/production-specs/<run-id>/   — the reproducible ProductionSpec
 *   data/<host>/production-builds/<run-id>/  — baked app + static site + package
 */
import path from "node:path";

const DATA_DIR = "data";

export function productionSpecDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "production-specs", runId);
}

export function productionBuildDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "production-builds", runId);
}

export function newProductionRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}
