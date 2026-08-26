/**
 * Path conventions for asset-independence artifacts.
 *
 * Two new namespaces, both additive (never touching historical runs):
 *   data/<host>/asset-inventories/<run-id>/       — Task 22 A/E/F (inventory + classification + fonts)
 *   data/<host>/asset-materializations/<run-id>/  — Task 22 B/C/D/I/J (fetched media, rewrite map, QA)
 */
import path from "node:path";

const DATA_DIR = "data";

export function assetInventoryDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "asset-inventories", runId);
}

export function assetMaterializationDir(host: string, runId: string): string {
  return path.join(DATA_DIR, host, "asset-materializations", runId);
}

export function newAssetRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function createdAtFromRunId(runId: string): string {
  const match = runId.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
  );
  if (!match) {
    throw new Error(`not an asset run id: ${runId}`);
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
}
