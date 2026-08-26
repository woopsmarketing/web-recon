import path from "node:path";

/**
 * Reconstruction output namespace (items 6, 10).
 *
 * A reconstruction gets its OWN directory and never writes a byte into anything
 * it read:
 *
 *   data/<host>/site-specs/<run>/          ← READ ONLY, never touched
 *   data/<host>/site-observations/<run>/   ← not even opened
 *   data/<host>/reconstructions/<run-id>/  ← everything this Task writes
 *     reconstruction-manifest.json
 *     app/
 *
 * The run directory name carries a timestamp. That is a run-tracking id, not
 * content: every file INSIDE it is a pure function of the SiteSpec and the
 * config, so two reconstructions of the same input land in two directories
 * holding byte-identical files (item 12).
 */

const DATA_DIR = "data";
const RECONSTRUCTIONS_DIR = "reconstructions";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/reconstructions/<run-id>`. */
export function reconstructionRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), RECONSTRUCTIONS_DIR, runId);
}

/** A filesystem-safe slug for the generated package name. */
export function siteSlug(rootUrl: string): string {
  return (
    siteFolder(rootUrl)
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "site"
  );
}
