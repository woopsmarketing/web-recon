import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ViewportId } from "../observer/types.js";
import {
  ARTIFACTS_DIR,
  CORRECTIONS_DIR,
  CORRECTION_ASSETS_DIR,
  DIFFS_DIR,
  DRIFT_DIR,
  INTERACTIONS_DIR,
  ITERATIONS_DIR,
  PAGES_DIR,
  SCREENSHOTS_DIR,
  UNKNOWNS_DIR,
} from "./types.js";

/**
 * QA output namespace (items 14, 15).
 *
 * Task 06–14 artifacts are IMMUTABLE input. A QA run gets its own directory and
 * cannot name any of them for writing:
 *
 *   data/<host>/site-specs/<run>/          ← read only
 *   data/<host>/reconstructions/<run>/     ← read only (the BASELINE clone)
 *   data/<host>/reconstruction-qa/<run-id>/  ← everything this Task writes
 *     qa-manifest.json · baseline-summary.json · final-summary.json
 *     pages/<pageId>/{desktop,mobile}.json
 *     interactions/<patternId>.json · unknowns/<unknownId>.json
 *     drift/source-drift.json
 *     corrections/{proposed,applied,rejected}.json + assets/
 *     iterations/q000/summary.json · q001/{summary.json,reconstruction/}
 *     artifacts/screenshots/ · artifacts/diffs/
 *
 * A CORRECTED clone is generated inside `iterations/q00N/reconstruction/`, never
 * on top of the Task 14 baseline (item 115).
 */

const DATA_DIR = "data";
const QA_RUNS_DIR = "reconstruction-qa";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/reconstruction-qa/<run-id>`. */
export function qaRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), QA_RUNS_DIR, runId);
}

/** A run id for the OUTPUT directory only — never inside an artifact body. */
export function newQaRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function pageResultFileRelative(
  pageId: string,
  viewport: ViewportId,
): string {
  return path.posix.join(PAGES_DIR, pageId, `${viewport}.json`);
}

export function interactionResultFileRelative(patternId: string): string {
  return path.posix.join(INTERACTIONS_DIR, `${patternId}.json`);
}

export function unknownResultFileRelative(unknownId: string): string {
  return path.posix.join(UNKNOWNS_DIR, `${unknownId}.json`);
}

export function driftFileRelative(name: string): string {
  return path.posix.join(DRIFT_DIR, name);
}

export function correctionFileRelative(name: string): string {
  return path.posix.join(CORRECTIONS_DIR, name);
}

export function correctionAssetFileRelative(name: string): string {
  return path.posix.join(CORRECTIONS_DIR, CORRECTION_ASSETS_DIR, name);
}

export function iterationDirRelative(iterationId: string): string {
  return path.posix.join(ITERATIONS_DIR, iterationId);
}

export function iterationSummaryFileRelative(iterationId: string): string {
  return path.posix.join(ITERATIONS_DIR, iterationId, "summary.json");
}

export function iterationReconstructionDirRelative(iterationId: string): string {
  return path.posix.join(ITERATIONS_DIR, iterationId, "reconstruction");
}

/**
 * `artifacts/screenshots/<pageId>-<viewport>-<which>.png`.
 *
 * `which` is one of `snapshot` / `original` / `clone`, so the three truth
 * sources stay visibly separate on disk as well as in the schema.
 */
export function screenshotFileRelative(
  pageId: string,
  viewport: ViewportId,
  which: "snapshot" | "original" | "clone",
  iterationId?: string,
): string {
  const suffix = iterationId === undefined ? "" : `-${iterationId}`;
  return path.posix.join(
    ARTIFACTS_DIR,
    SCREENSHOTS_DIR,
    `${pageId}-${viewport}-${which}${suffix}.png`,
  );
}

export function diffFileRelative(
  pageId: string,
  viewport: ViewportId,
  pair: string,
  iterationId?: string,
): string {
  const suffix = iterationId === undefined ? "" : `-${iterationId}`;
  return path.posix.join(
    ARTIFACTS_DIR,
    DIFFS_DIR,
    `${pageId}-${viewport}-${pair}${suffix}.png`,
  );
}

export interface WrittenFile {
  relativePath: string;
  bytes: number;
}

/** Write a JSON artifact under the run dir. Two-space indent, trailing newline. */
export async function writeQaJson(
  runDir: string,
  relativePath: string,
  value: unknown,
): Promise<WrittenFile> {
  const file = path.join(runDir, ...relativePath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  const json = JSON.stringify(value, null, 2) + "\n";
  await writeFile(file, json, "utf8");
  return { relativePath, bytes: Buffer.byteLength(json, "utf8") };
}

/** Write a binary artifact (a screenshot or a diff image) under the run dir. */
export async function writeQaBinary(
  runDir: string,
  relativePath: string,
  contents: Buffer,
): Promise<WrittenFile> {
  const file = path.join(runDir, ...relativePath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return { relativePath, bytes: contents.byteLength };
}

/** Path form recorded INSIDE an artifact: working-directory relative, POSIX. */
export function portablePath(candidate: string): string {
  const relative = path.relative(process.cwd(), path.resolve(candidate));
  return (relative === "" ? "." : relative).split(path.sep).join("/");
}
