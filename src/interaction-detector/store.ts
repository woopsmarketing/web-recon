import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PageInteractionAnalysisSchema,
  SiteInteractionAnalysisSchema,
  type PageInteractionAnalysis,
  type SiteInteractionAnalysis,
} from "./types.js";

/**
 * Interaction-analysis persistence (Task 10, items 57–59).
 *
 * Task 10 is purely ADDITIVE. It writes two new kinds of file into the existing
 * Task 09 site run and modifies nothing that is already there:
 *
 *   data/<host>/site-observations/<run-id>/
 *     site-observation.json                    ← Task 09, untouched
 *     interaction-analysis.json                ← NEW (site manifest)
 *     pages/<page-id>/
 *       observation.json                       ← Task 09, untouched
 *       interaction-candidates.json            ← NEW (per-page index)
 *       viewports/…                            ← Task 09, untouched
 *
 * The original observation is treated as an immutable input: no file is
 * rewritten, no field is back-filled into `observation.json`, and re-running the
 * detector only replaces the two derived files. Both are zod-validated before
 * they reach disk, so a malformed result fails loudly instead of being stored.
 *
 * Desktop and mobile share ONE page file. The per-page index is small (kilobytes
 * against a multi-megabyte observation), and splitting it would force every
 * reader to open two files to answer "what can be interacted with on this page?".
 */

/** `pages/<pageId>/interaction-candidates.json`, relative to the run directory. */
export function interactionCandidatesFileRelative(pageId: string): string {
  return path.posix.join("pages", pageId, "interaction-candidates.json");
}

export interface SavedPageInteractionAnalysis {
  /** Path on disk. */
  filePath: string;
  /** Path relative to the site run directory (what the manifest records). */
  relativePath: string;
  /** Bytes written (measured, not estimated). */
  bytes: number;
}

/** Validate and write ONE page's `interaction-candidates.json`. */
export async function savePageInteractionAnalysis(
  runDir: string,
  analysis: PageInteractionAnalysis,
): Promise<SavedPageInteractionAnalysis> {
  const relativePath = interactionCandidatesFileRelative(analysis.pageId);
  const filePath = path.join(runDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });

  const json =
    JSON.stringify(PageInteractionAnalysisSchema.parse(analysis), null, 2) + "\n";
  await writeFile(filePath, json, "utf8");

  return { filePath, relativePath, bytes: Buffer.byteLength(json, "utf8") };
}

export interface SavedSiteInteractionAnalysis {
  filePath: string;
  analysis: SiteInteractionAnalysis;
}

/**
 * Validate and write `interaction-analysis.json`.
 *
 * `stats.interactionAnalysisJsonBytes` and `stats.totalAddedBytes` describe the
 * file that contains them, so they are iterated to a fixpoint where the recorded
 * numbers equal the file's real on-disk size — the same technique the Observer
 * and multi-observer stores use (converges in 1–2 steps).
 */
export async function saveSiteInteractionAnalysis(
  runDir: string,
  analysis: SiteInteractionAnalysis,
): Promise<SavedSiteInteractionAnalysis> {
  await mkdir(runDir, { recursive: true });

  const draft: SiteInteractionAnalysis = {
    ...analysis,
    stats: { ...analysis.stats },
  };

  let json = "";
  let guess = 0;
  for (let i = 0; i < 8; i++) {
    draft.stats.interactionAnalysisJsonBytes = guess;
    draft.stats.totalAddedBytes = draft.stats.interactionCandidatesBytes + guess;
    json =
      JSON.stringify(SiteInteractionAnalysisSchema.parse(draft), null, 2) + "\n";
    const actual = Buffer.byteLength(json, "utf8");
    if (actual === guess) break;
    guess = actual;
  }

  const filePath = path.join(runDir, "interaction-analysis.json");
  await writeFile(filePath, json, "utf8");

  return { filePath, analysis: SiteInteractionAnalysisSchema.parse(draft) };
}
