import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  InteractionPatternsArtifactSchema,
  UnknownInteractionsArtifactSchema,
  type InteractionPatternsArtifact,
  type UnknownInteractionsArtifact,
} from "./types.js";
import { AiAnalysisArtifactSchema, type AiAnalysisArtifact } from "./ai/types.js";

/**
 * Interaction model persistence (Task 12, items 8, 62, 106).
 *
 * Pattern modeling gets its OWN namespace and never writes a byte into the Task
 * 11 run it read:
 *
 *   data/<host>/interaction-explorations/<run>/  ← READ ONLY, never touched
 *   data/<host>/interaction-models/<run-id>/     ← everything this Task writes
 *     interaction-patterns.json
 *     unknown-interactions.json
 *     ai-analysis.json                           ← only when --ai actually ran
 *
 * The separation is structural rather than a convention: nothing in this module
 * can name an exploration or observation directory, so a bug here cannot corrupt
 * an input. Task 09, 10 and 11 artifacts are immutable to this stage.
 *
 * `ai-analysis.json` is written ONLY when an AI pass actually produced results
 * (item 62). An empty placeholder would make "did anything infer this?"
 * unanswerable from the directory listing, and would put an `inferred` file next
 * to two `derived` ones for no reason.
 */

const DATA_DIR = "data";
const MODEL_RUNS_DIR = "interaction-models";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/interaction-models/<run-id>`. */
export function modelRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), MODEL_RUNS_DIR, runId);
}

export interface SavedFile {
  filePath: string;
  relativePath: string;
  /** Bytes written (measured, never estimated). */
  bytes: number;
}

async function writeJson(
  runDir: string,
  fileName: string,
  value: unknown,
): Promise<SavedFile> {
  await mkdir(runDir, { recursive: true });
  const json = JSON.stringify(value, null, 2) + "\n";
  const filePath = path.join(runDir, fileName);
  await writeFile(filePath, json, "utf8");
  return {
    filePath,
    relativePath: fileName,
    bytes: Buffer.byteLength(json, "utf8"),
  };
}

/** Validate and write `interaction-patterns.json`. */
export async function saveInteractionPatterns(
  runDir: string,
  artifact: InteractionPatternsArtifact,
): Promise<SavedFile> {
  return writeJson(
    runDir,
    "interaction-patterns.json",
    InteractionPatternsArtifactSchema.parse(artifact),
  );
}

/** Validate and write `unknown-interactions.json`. */
export async function saveUnknownInteractions(
  runDir: string,
  artifact: UnknownInteractionsArtifact,
): Promise<SavedFile> {
  return writeJson(
    runDir,
    "unknown-interactions.json",
    UnknownInteractionsArtifactSchema.parse(artifact),
  );
}

/** Validate and write `ai-analysis.json`. Only called when an AI pass ran. */
export async function saveAiAnalysis(
  runDir: string,
  artifact: AiAnalysisArtifact,
): Promise<SavedFile> {
  return writeJson(runDir, "ai-analysis.json", AiAnalysisArtifactSchema.parse(artifact));
}
