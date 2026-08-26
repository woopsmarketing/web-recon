import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  saveObservationIntoDir,
  type ObservedPage,
  type PageObservation,
} from "../observer/index.js";
import { SiteObservationSchema, type SiteObservation } from "./types.js";

/**
 * Site observation persistence (Task 09, items 7 & 32).
 *
 * A site run gets its OWN directory tree and never writes into the
 * discovery/verification/selection run directory it read from — deep observation
 * data (hundreds of MB) must not be mixed into the small, re-runnable JSON of the
 * earlier stages:
 *
 *   data/<host>/site-observations/<run-id>/
 *     site-observation.json      — manifest: pages, provenance, coverage, stats
 *     pages/<page-id>/
 *       observation.json         — EXACTLY the Task 05 single-page layout
 *       viewports/desktop/…      —   rendered.html / dom.json / styles.json /
 *       viewports/mobile/…       —   assets.json / links.json / frames.json /
 *                                     screenshot.png
 *
 * Each page directory is written by the Observer's own
 * {@link saveObservationIntoDir} — the same function `pnpm observe` uses — so
 * every Task 04/05 invariant (zod validation before write, no dangling
 * `styleId`, per-viewport style tables) holds here unchanged. Multi-page
 * orchestration adds a manifest around the pages; it does not weaken or reshape
 * what a page is.
 */

const DATA_DIR = "data";
const SITE_RUNS_DIR = "site-observations";

/** Hostname folder, mirroring the single-page store's convention. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/**
 * `data/<host>/site-observations/<run-id>` for a site run. Separate from the
 * single-page `data/<host>/<run-id>` namespace so a site run can never be
 * mistaken for (or collide with) a single-page run.
 */
export function siteRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), SITE_RUNS_DIR, runId);
}

/** `pages/<page-id>` relative to the site run directory. */
export function pageDirRelative(pageId: string): string {
  return path.posix.join("pages", pageId);
}

/**
 * Relative path recorded in the manifest (item 33). POSIX separators and always
 * relative — an absolute local path would leak the machine layout into a
 * shareable artifact and break the moment the directory is moved.
 */
export function pageObservationFileRelative(pageId: string): string {
  return path.posix.join(pageDirRelative(pageId), "observation.json");
}

export interface SavedSitePage {
  /** The validated summary the Observer's store produced. */
  observation: PageObservation;
  /** `pages/<page-id>/observation.json`, relative to the run directory. */
  relativePath: string;
}

/** Persist ONE page into `pages/<page-id>/` using the Observer's own writer. */
export async function saveSitePage(
  runDir: string,
  pageId: string,
  observed: ObservedPage,
): Promise<SavedSitePage> {
  const dir = path.join(runDir, "pages", pageId);
  const observation = await saveObservationIntoDir(dir, observed);
  return { observation, relativePath: pageObservationFileRelative(pageId) };
}

export interface SavedSiteObservation {
  manifestPath: string;
  siteObservation: SiteObservation;
}

/**
 * Validate (zod) and write `site-observation.json`.
 *
 * `stats.siteObservationJsonBytes` and `stats.totalBytes` describe the file that
 * contains them, so they are iterated to a fixpoint where the recorded numbers
 * equal the file's real on-disk size — the same technique the single-page store
 * uses (converges in 1–2 steps).
 */
export async function saveSiteObservation(
  runDir: string,
  manifest: SiteObservation,
): Promise<SavedSiteObservation> {
  await mkdir(runDir, { recursive: true });

  const draft: SiteObservation = {
    ...manifest,
    stats: { ...manifest.stats },
  };

  let json = "";
  let guess = 0;
  for (let i = 0; i < 8; i++) {
    draft.stats.siteObservationJsonBytes = guess;
    draft.stats.totalBytes = draft.stats.pageBytes + guess;
    json = JSON.stringify(SiteObservationSchema.parse(draft), null, 2) + "\n";
    const actual = Buffer.byteLength(json, "utf8");
    if (actual === guess) break;
    guess = actual;
  }

  const manifestPath = path.join(runDir, "site-observation.json");
  await writeFile(manifestPath, json, "utf8");

  return { manifestPath, siteObservation: SiteObservationSchema.parse(draft) };
}
