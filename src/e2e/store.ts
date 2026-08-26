import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { siteFolder } from "../interaction-patterns/store.js";
import { E2E_MANIFEST_FILE, E2E_RUNS_DIR, E2eManifestSchema, type E2eManifest } from "./types.js";

/**
 * The E2E run namespace (Task 16, item 34).
 *
 * `data/<host>/e2e-runs/<run-id>/e2e-manifest.json`, and that is the ONLY file
 * this stage writes. Every stage artifact stays in the namespace its own Task
 * owns — `site-observations/`, `site-specs/`, `reconstructions/`,
 * `reconstruction-qa/` — and the manifest REFERENCES them.
 *
 * The alternative, copying every stage's output under the E2E run, was rejected
 * for two reasons: it would duplicate hundreds of megabytes per run, and it
 * would make the E2E manifest a second source of truth for artifacts that
 * already have one. A reference cannot drift from what it points at.
 */

const DATA_DIR = "data";

export function e2eRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), E2E_RUNS_DIR, runId);
}

/** Timestamp-based uniqueness id for the OUTPUT namespace only. */
export function newE2eRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface SavedE2eManifest {
  manifestPath: string;
  bytes: number;
}

export async function saveE2eManifest(
  runDir: string,
  manifest: E2eManifest,
): Promise<SavedE2eManifest> {
  const validated = E2eManifestSchema.parse(manifest);
  await mkdir(runDir, { recursive: true });
  const manifestPath = path.join(runDir, E2E_MANIFEST_FILE);
  const json = `${JSON.stringify(validated, null, 2)}\n`;
  await writeFile(manifestPath, json, "utf8");
  return { manifestPath, bytes: Buffer.byteLength(json, "utf8") };
}
