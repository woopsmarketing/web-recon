import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// Leaf import, not the verifier barrel: that barrel loads Playwright, and
// selection must never launch — or even load — a browser.
import {
  VerificationResultSchema,
  VerifiedUrlSetSchema,
  type VerificationResult,
  type VerifiedUrlSet,
} from "../verifier/types.js";
import {
  PageFamilySetSchema,
  PageSelectionSchema,
  type PageFamilySet,
  type PageSelection,
} from "./types.js";

/**
 * Selector persistence (Task 07).
 *
 * Selection EXTENDS the existing discovery/verification run directory — it never
 * creates a new run id — so `discovery → verification → selection` provenance
 * stays inside one run:
 *
 *   data/<host>/<run-id>/
 *     discovery.raw.json
 *     discovery.json
 *     verification.json      ← input (sibling)
 *     verified-urls.json     ← input (the CLI argument)
 *     page-families.json     ← output (this task)
 *     selected-pages.json    ← output (this task)
 *
 * Reading is strict: both inputs are re-validated with the Task 06 zod schemas,
 * and they must belong to the same run. Selection must never silently run on a
 * mismatched pair (e.g. yesterday's verification against today's verified URLs).
 */

/** Read + JSON.parse a file, failing with a message that names the path. */
async function readJson(filePath: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Cannot read ${label}: ${filePath}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${filePath}: ${reason}`);
  }
}

/** Format the first few zod issues into a single readable line. */
function issueSummary(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function schemaVersionOf(json: unknown): string {
  return json && typeof json === "object" && "schemaVersion" in json
    ? String((json as { schemaVersion: unknown }).schemaVersion)
    : "(missing)";
}

export interface LoadedSelectionInput {
  verifiedUrls: VerifiedUrlSet;
  verification: VerificationResult;
  /** Absolute run directory that contained verified-urls.json. */
  runDir: string;
  /** Paths as provided/resolved (recorded as provenance in both outputs). */
  sourceVerifiedUrlsFile: string;
  sourceVerificationFile: string;
}

/**
 * Load `verified-urls.json` plus its sibling `verification.json`.
 *
 * The sibling is found in the same run directory by default; an explicit path
 * may be supplied, but the simple form stays `pnpm select <verified-urls.json>`.
 */
export async function loadSelectionInput(
  verifiedUrlsPath: string,
  verificationPathOverride?: string,
): Promise<LoadedSelectionInput> {
  const runDir = path.dirname(path.resolve(verifiedUrlsPath));
  // Recorded provenance keeps the caller's own path form (Task 06 does the same
  // with `sourceDiscoveryFile`), so the sibling is resolved next to the argument
  // rather than through the absolute run directory.
  const verificationPath =
    verificationPathOverride ??
    path.join(path.dirname(verifiedUrlsPath), "verification.json");

  const verifiedJson = await readJson(verifiedUrlsPath, "verified-urls file");
  const verifiedParsed = VerifiedUrlSetSchema.safeParse(verifiedJson);
  if (!verifiedParsed.success) {
    throw new Error(
      `verified-urls.json failed schema validation (schemaVersion=${schemaVersionOf(verifiedJson)}): ${issueSummary(verifiedParsed.error)}`,
    );
  }

  const verificationJson = await readJson(verificationPath, "verification file");
  const verificationParsed = VerificationResultSchema.safeParse(verificationJson);
  if (!verificationParsed.success) {
    throw new Error(
      `verification.json failed schema validation (schemaVersion=${schemaVersionOf(verificationJson)}): ${issueSummary(verificationParsed.error)}`,
    );
  }

  const verifiedUrls = verifiedParsed.data;
  const verification = verificationParsed.data;

  if (verifiedUrls.rootUrl !== verification.rootUrl) {
    throw new Error(
      `Input mismatch: verified-urls.json rootUrl (${verifiedUrls.rootUrl}) != verification.json rootUrl (${verification.rootUrl})`,
    );
  }
  if (verifiedUrls.sourceDiscoveryFile !== verification.sourceDiscoveryFile) {
    throw new Error(
      "Input mismatch: verified-urls.json and verification.json were derived from different discovery files",
    );
  }

  return {
    verifiedUrls,
    verification,
    runDir,
    sourceVerifiedUrlsFile: verifiedUrlsPath,
    sourceVerificationFile: verificationPath,
  };
}

export interface SavedSelection {
  familiesPath: string;
  selectionPath: string;
}

/**
 * Validate (zod) and persist page-families.json + selected-pages.json into the
 * run directory. Both are re-parsed against their schemas before writing, so a
 * malformed result fails loudly instead of reaching disk.
 */
export async function saveSelection(
  runDir: string,
  familySet: PageFamilySet,
  selection: PageSelection,
): Promise<SavedSelection> {
  const validatedFamilies = PageFamilySetSchema.parse(familySet);
  const validatedSelection = PageSelectionSchema.parse(selection);

  const familiesPath = path.join(runDir, "page-families.json");
  const selectionPath = path.join(runDir, "selected-pages.json");

  await writeFile(
    familiesPath,
    JSON.stringify(validatedFamilies, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    selectionPath,
    JSON.stringify(validatedSelection, null, 2) + "\n",
    "utf8",
  );

  return { familiesPath, selectionPath };
}
