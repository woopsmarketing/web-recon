import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryResult, RawDiscovery } from "./types.js";

/** Root directory for persisted discovery output (gitignored). */
const DATA_DIR = "data";

export interface SavedDiscovery {
  runId: string;
  dir: string;
  rawPath: string;
  resultPath: string;
}

/**
 * Filesystem-safe run id derived from a timestamp, e.g.
 * `2026-08-13T15-30-00-123Z`. Monotonic and unique enough for a POC; no random
 * component so a single run is fully reproducible on disk.
 */
export function makeRunId(at: Date = new Date()): string {
  return at.toISOString().replace(/[:.]/g, "-");
}

/** Derive a stable, filesystem-safe folder name from the root URL's host. */
function siteFolder(rootUrl: string): string {
  try {
    const host = new URL(rootUrl).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/**
 * Persist both the raw provider output and the normalized result under
 * `data/<host>/<run-id>/`. Raw is kept so a future re-analysis never has to
 * re-run the Map call.
 */
export async function saveDiscovery(
  raw: RawDiscovery,
  result: DiscoveryResult,
  runId: string = makeRunId(),
): Promise<SavedDiscovery> {
  const dir = path.join(DATA_DIR, siteFolder(result.rootUrl), runId);
  await mkdir(dir, { recursive: true });

  const rawPath = path.join(dir, "discovery.raw.json");
  const resultPath = path.join(dir, "discovery.json");

  await writeFile(rawPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
  await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n", "utf8");

  return { runId, dir, rawPath, resultPath };
}
