/**
 * The producer's own source files as a build input (06 A5, freeze review MAJOR-1).
 *
 * The bytes the builder writes into a package's site/_integration/ are a function of the site
 * snapshot, the release's declared routes, the site's integration.json — and of THIS code. The first
 * three are already in buildInputId; this module hashes the producer files themselves so that a
 * changed emitter/validator can never be reported "up-to-date" for a package built by the old one,
 * and never replaces bytes under an unchanged build identity. PRODUCER_VERSION stays the
 * human-readable signal; correctness does not depend on remembering to bump it.
 *
 * Paths are resolved relative to this module (never the repo root being built), so throwaway
 * roots and fresh clones hash the same files.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hashJson, sha256 } from "../util/hash";

/** relative to platform/, sorted; every file whose change can alter an emitted byte or a verdict */
export const PRODUCER_SOURCE_FILES = [
  "build/declared-routes.ts",
  "integration/config.ts",
  "integration/contract.ts",
  "integration/emit.ts",
  "integration/sources.ts",
  "integration/validate.ts",
] as const;

export interface ProducerSources {
  files: { path: string; sha256: string }[];
  /** hashJson(files) */
  hash: string;
}

export async function producerSources(): Promise<ProducerSources> {
  const files: ProducerSources["files"] = [];
  for (const rel of PRODUCER_SOURCE_FILES) {
    const abs = fileURLToPath(new URL(`../${rel}`, import.meta.url));
    files.push({ path: rel, sha256: sha256(await readFile(abs)) });
  }
  return { files, hash: hashJson(files) };
}
