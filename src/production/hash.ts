/**
 * Lineage hashing (Task 23).
 *
 * Hash method `dir-sha256-v1`, computed over the ACTUAL artifact files:
 *
 *   1. walk the directory recursively, collecting every regular file
 *      (excluded subtrees skipped — build byproducts like node_modules/.next
 *      are not part of an artifact's identity);
 *   2. sha256 each file's bytes;
 *   3. build a manifest text of lines `<posix-relative-path>\t<sha256>\n`,
 *      sorted bytewise by path;
 *   4. the directory hash is the sha256 of that manifest text (utf8).
 *
 * Deterministic across machines and mtimes: only paths and bytes count.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

export const HASH_METHOD = "dir-sha256-v1";
export const HASH_METHOD_DESCRIPTION =
  "per-file sha256 over file bytes; manifest lines '<relpath>\\t<sha256>' sorted by path; directory hash = sha256(manifest utf8). Excluded subtrees are recorded alongside the hash.";

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

export interface DirHashResult {
  hash: string;
  fileCount: number;
  byteCount: number;
  excluded: string[];
}

async function collectFiles(
  root: string,
  relDir: string,
  excluded: Set<string>,
  out: string[],
): Promise<void> {
  const entries = await readdir(path.join(root, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
    if (excluded.has(rel) || excluded.has(entry.name)) continue;
    if (entry.isDirectory()) {
      await collectFiles(root, rel, excluded, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
    // symlinks and other specials are deliberately NOT hashed — artifacts
    // contain none, and following links could escape the artifact directory.
  }
}

/**
 * Hash a directory per dir-sha256-v1.
 *
 * `exclude` entries match either a full relative posix path ("app/out") or a
 * bare directory name at any depth ("node_modules").
 */
export async function hashDirectory(
  root: string,
  exclude: string[] = [],
): Promise<DirHashResult> {
  const excluded = new Set(exclude);
  const files: string[] = [];
  await collectFiles(root, "", excluded, files);
  files.sort();
  let manifest = "";
  let byteCount = 0;
  const { stat } = await import("node:fs/promises");
  for (const rel of files) {
    const filePath = path.join(root, rel);
    manifest += `${rel}\t${await hashFile(filePath)}\n`;
    byteCount += (await stat(filePath)).size;
  }
  return {
    hash: createHash("sha256").update(manifest, "utf8").digest("hex"),
    fileCount: files.length,
    byteCount,
    excluded: [...excluded].sort(),
  };
}
