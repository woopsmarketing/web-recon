import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ViewportId } from "../observer/types.js";
import {
  InteractionExplorationSchema,
  InteractionObservationSchema,
  InteractionPlanSchema,
  type InteractionExploration,
  type InteractionObservation,
  type InteractionPlan,
} from "./types.js";

/**
 * Interaction exploration persistence (Task 11, items 7–8, 116).
 *
 * A live exploration gets its OWN namespace and never writes a byte into the
 * Task 09 / Task 10 run it read:
 *
 *   data/<host>/site-observations/<old-run>/       ← READ ONLY, never touched
 *   data/<host>/interaction-explorations/<run-id>/ ← everything this Task writes
 *     interaction-plan.json         deterministic, timestamp-free
 *     interaction-exploration.json  the live manifest
 *     pages/<page-id>/<viewport>/<action-id>.json
 *
 * The separation is structural, not a convention: nothing in this module can
 * name the source directory, so a bug here cannot corrupt an observation. It
 * also keeps the honesty of item 8 — a live run is a NEW observation at a NEW
 * moment. Mixing it into the site-observation run would quietly imply the click
 * and the DOM snapshot came from the same instant, which they did not.
 *
 * Every artifact is zod-validated before it reaches disk, so a malformed result
 * fails loudly instead of being stored and believed later.
 */

const DATA_DIR = "data";
const EXPLORATION_RUNS_DIR = "interaction-explorations";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/interaction-explorations/<run-id>`. */
export function explorationRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), EXPLORATION_RUNS_DIR, runId);
}

/**
 * `pages/<page-id>/<viewport>/<action-id>.json`, relative to the run directory.
 *
 * Desktop and mobile are separate directories because item 102 forbids matching
 * a desktop control to a mobile one: they are independent explorations of
 * independent renders, and a shared folder would invite exactly that mistake.
 */
export function actionObservationFileRelative(
  pageId: string,
  viewportId: ViewportId,
  actionId: string,
): string {
  return path.posix.join("pages", pageId, viewportId, `${actionId}.json`);
}

export interface SavedFile {
  filePath: string;
  relativePath: string;
  /** Bytes written (measured, never estimated). */
  bytes: number;
}

/** Validate and write `interaction-plan.json`. */
export async function saveInteractionPlan(
  runDir: string,
  plan: InteractionPlan,
): Promise<SavedFile> {
  await mkdir(runDir, { recursive: true });
  const json = JSON.stringify(InteractionPlanSchema.parse(plan), null, 2) + "\n";
  const filePath = path.join(runDir, "interaction-plan.json");
  await writeFile(filePath, json, "utf8");
  return {
    filePath,
    relativePath: "interaction-plan.json",
    bytes: Buffer.byteLength(json, "utf8"),
  };
}

/** Validate and write ONE action's observation. */
export async function saveInteractionObservation(
  runDir: string,
  observation: InteractionObservation,
): Promise<SavedFile> {
  const relativePath = actionObservationFileRelative(
    observation.pageId,
    observation.viewportId,
    observation.actionId,
  );
  const filePath = path.join(runDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const json =
    JSON.stringify(InteractionObservationSchema.parse(observation), null, 2) + "\n";
  await writeFile(filePath, json, "utf8");
  return { filePath, relativePath, bytes: Buffer.byteLength(json, "utf8") };
}

export interface SavedExploration {
  manifestPath: string;
  exploration: InteractionExploration;
}

/**
 * Validate and write `interaction-exploration.json`.
 *
 * `storageSummary.manifestBytes` and `.totalBytes` describe the file that
 * contains them, so they are iterated to a fixpoint where the recorded numbers
 * equal the file's real on-disk size — the same technique the Observer,
 * multi-observer and detector stores use (converges in 1–2 steps).
 */
export async function saveExplorationManifest(
  runDir: string,
  manifest: InteractionExploration,
): Promise<SavedExploration> {
  await mkdir(runDir, { recursive: true });

  const draft: InteractionExploration = {
    ...manifest,
    storageSummary: { ...manifest.storageSummary },
  };

  let json = "";
  let guess = 0;
  for (let i = 0; i < 8; i++) {
    draft.storageSummary.manifestBytes = guess;
    draft.storageSummary.totalBytes =
      draft.storageSummary.planBytes +
      draft.storageSummary.actionArtifactBytes +
      guess;
    json =
      JSON.stringify(InteractionExplorationSchema.parse(draft), null, 2) + "\n";
    const actual = Buffer.byteLength(json, "utf8");
    if (actual === guess) break;
    guess = actual;
  }

  const manifestPath = path.join(runDir, "interaction-exploration.json");
  await writeFile(manifestPath, json, "utf8");

  return {
    manifestPath,
    exploration: InteractionExplorationSchema.parse(draft),
  };
}
