import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic naming and output paths (Task 28.6, lane W3).
 *
 * File names are a function of (index, site, route, width, kind) and nothing
 * else — no clock, no counter that depends on completion order, no hash of
 * content. Two runs of the same sweep produce the same file names, so a
 * reviewer can diff two runs directory-for-directory.
 */

const DATA_DIR = "data";
const RUNS_DIR = "responsive-qa";

export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/responsive-qa/<run-id>`. */
export function responsiveRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), RUNS_DIR, runId);
}

/** ISO-8601 with `:` and `.` replaced, the run-id convention this repo uses. */
export function newResponsiveRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** `/` → `root`, `/a/b` → `a-b`. Lowercase, `[a-z0-9-]` only. */
export function routeSlug(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  if (trimmed.length === 0) return "root";
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? "root" : slug;
}

export type ImageKind = "source" | "final" | "composite" | "diff";

/** `03-linear-app-pricing-1024-composite.png` — sortable and self-describing. */
export function imageFileName(
  index: number,
  site: string,
  route: string,
  width: number,
  kind: ImageKind,
): string {
  const siteSlug = site.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${String(index).padStart(2, "0")}-${siteSlug}-${routeSlug(route)}-${width}-${kind}.png`;
}

export const RUN_ARTIFACT_FILE = "responsive-qa.json";
export const IMAGE_MANIFEST_FILE = "images-manifest.json";
export const CONTACT_SHEET_FILE = "contact-sheet.png";
export const IMAGES_SUBDIR = "images";

export interface WrittenFile {
  relativePath: string;
  bytes: number;
}

export async function writeRunJson(
  runDir: string,
  relativePath: string,
  value: unknown,
): Promise<WrittenFile> {
  const file = path.join(runDir, ...relativePath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(file, json, "utf8");
  return { relativePath, bytes: Buffer.byteLength(json, "utf8") };
}

export async function writeRunBinary(
  runDir: string,
  relativePath: string,
  contents: Buffer,
): Promise<WrittenFile> {
  const file = path.join(runDir, ...relativePath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return { relativePath, bytes: contents.length };
}
