import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DiscoveryResultSchema,
  type DiscoveryResult,
} from "../discovery/index.js";
import {
  VerificationResultSchema,
  VerifiedUrlSetSchema,
  type VerificationResult,
  type VerifiedUrlSet,
} from "./types.js";

/**
 * Verifier persistence (Task 06).
 *
 * Verification EXTENDS the existing discovery run directory rather than creating
 * a new run id, so `discovery → verification` provenance stays inside one run:
 *
 *   data/<host>/<run-id>/
 *     discovery.raw.json
 *     discovery.json         ← input
 *     verification.json      ← detailed output (this task)
 *     verified-urls.json     ← compact Deep-Observation candidate set (this task)
 */

export interface LoadedDiscovery {
  discovery: DiscoveryResult;
  /** Absolute run directory that contained discovery.json. */
  runDir: string;
  /** The discovery.json path as provided (for provenance metadata). */
  sourceDiscoveryFile: string;
}

/**
 * Load and validate a discovery.json. Fails loudly with a clear message on
 * unreadable/invalid JSON or a schema/version mismatch — the verifier must never
 * run on malformed discovery input.
 */
export async function loadDiscovery(
  discoveryPath: string,
): Promise<LoadedDiscovery> {
  let text: string;
  try {
    text = await readFile(discoveryPath, "utf8");
  } catch {
    throw new Error(`Cannot read discovery file: ${discoveryPath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${discoveryPath}: ${reason}`);
  }

  const parsed = DiscoveryResultSchema.safeParse(json);
  if (!parsed.success) {
    const version =
      json && typeof json === "object" && "schemaVersion" in json
        ? String((json as { schemaVersion: unknown }).schemaVersion)
        : "(missing)";
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `discovery.json failed schema validation (schemaVersion=${version}): ${issues}`,
    );
  }

  return {
    discovery: parsed.data,
    runDir: path.dirname(path.resolve(discoveryPath)),
    sourceDiscoveryFile: discoveryPath,
  };
}

export interface SavedVerification {
  verificationPath: string;
  verifiedUrlsPath: string;
}

/**
 * Validate (zod) and persist verification.json + verified-urls.json into the
 * discovery run directory. Both are re-parsed against their schemas before
 * writing so a malformed result fails loudly rather than reaching disk.
 */
export async function saveVerification(
  runDir: string,
  result: VerificationResult,
  verifiedUrls: VerifiedUrlSet,
): Promise<SavedVerification> {
  const validatedResult = VerificationResultSchema.parse(result);
  const validatedUrls = VerifiedUrlSetSchema.parse(verifiedUrls);

  const verificationPath = path.join(runDir, "verification.json");
  const verifiedUrlsPath = path.join(runDir, "verified-urls.json");

  await writeFile(
    verificationPath,
    JSON.stringify(validatedResult, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    verifiedUrlsPath,
    JSON.stringify(validatedUrls, null, 2) + "\n",
    "utf8",
  );

  return { verificationPath, verifiedUrlsPath };
}
