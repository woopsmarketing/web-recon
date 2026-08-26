import { readFile } from "node:fs/promises";
import path from "node:path";
// Leaf imports, not the verifier barrel: that barrel loads Playwright, and this
// module is pure input validation — it must be usable without a browser.
import {
  VerificationResultSchema,
  VerifiedUrlSetSchema,
} from "../verifier/types.js";
import {
  PageFamilySetSchema,
  PageSelectionSchema,
  type PageFamilySet,
  type PageSelection,
} from "../selector/types.js";

/**
 * Load and hard-validate the ONLY input a site observation run accepts
 * (Task 09, items 5 & 6): an existing `selected-pages.json`.
 *
 * Nothing is re-derived here. Firecrawl is not called, discovery is not run,
 * candidates are not re-verified, and families are not re-selected —
 * "Explore Once → Reuse Data". If the selection on disk is stale, the fix is to
 * re-run `pnpm verify` / `pnpm select`, not to have this stage quietly redo it.
 *
 * Validation is fail-fast and happens BEFORE any browser launches. A site run
 * costs minutes of rendering and hundreds of megabytes; discovering halfway
 * through that the input was inconsistent is the expensive way to find out. Two
 * layers:
 *
 *   1. Schema     — the real Selector zod schema (`PageSelectionSchema`).
 *   2. Provenance — internal consistency (counts, duplicate ids, coverage) and,
 *                   when the sibling files are present, agreement with
 *                   `page-families.json` / `verified-urls.json` /
 *                   `verification.json` from the same run directory.
 *
 * Siblings are OPTIONAL by design: a selection copied elsewhere is still
 * observable. But a sibling that IS present and disagrees is a hard error — a
 * mismatched pair is exactly the situation this check exists to catch.
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

/** Read a sibling file, or `undefined` when it simply is not there. */
async function readOptionalJson(filePath: string): Promise<unknown | undefined> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${filePath}: ${reason}`);
  }
}

/** Format the first few zod issues into a single readable line. */
function issueSummary(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): string {
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

/** Thrown for input/system invariant violations — the run must not start. */
export class SelectionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionInputError";
  }
}

function fail(message: string): never {
  throw new SelectionInputError(message);
}

export interface LoadedSiteSelection {
  selection: PageSelection;
  /** Present only when a sibling `page-families.json` was found and matched. */
  families?: PageFamilySet;
  /** Directory holding `selected-pages.json` (the Task 06/07 run directory). */
  runDir: string;
  /** Paths in the caller's own form, recorded as provenance in the manifest. */
  sourceSelectedPagesFile: string;
  sourcePageFamiliesFile?: string;
  /** Consistency checks that were skipped because a sibling was absent. */
  skippedChecks: string[];
}

/**
 * Internal consistency of `selected-pages.json` alone (item 6).
 *
 * These are not paranoia: `pageId` assignment, family provenance, and the
 * coverage arithmetic in the manifest all assume them, so a violation would
 * produce a plausible-looking but wrong site manifest rather than an error.
 */
function assertSelectionConsistent(
  selection: PageSelection,
  label: string,
): void {
  const where: (msg: string) => never = (msg) => fail(`${label}: ${msg}`);

  if (selection.pages.length !== selection.selectedCount) {
    where(
      `selectedCount (${selection.selectedCount}) != pages.length (${selection.pages.length})`,
    );
  }
  if (selection.familyCount !== selection.pages.length) {
    where(
      `familyCount (${selection.familyCount}) != pages.length (${selection.pages.length}) — selection must hold exactly one representative per family`,
    );
  }

  const seenFamilies = new Set<string>();
  const seenUrls = new Set<string>();
  for (const page of selection.pages) {
    if (seenFamilies.has(page.familyId)) {
      where(`duplicate familyId in pages[]: ${page.familyId}`);
    }
    seenFamilies.add(page.familyId);
    if (seenUrls.has(page.url)) where(`duplicate URL in pages[]: ${page.url}`);
    seenUrls.add(page.url);
    if (!/^https?:\/\//i.test(page.url)) {
      where(`selected page is not an http(s) URL: ${page.url}`);
    }
  }

  // Every skipped URL must name a family that exists and the representative
  // that actually covers it — this is the link that lets the manifest claim
  // "this one page stood in for N URLs".
  const representativeByFamily = new Map(
    selection.pages.map((p) => [p.familyId, p.url]),
  );
  for (const skipped of selection.unselected) {
    const representative = representativeByFamily.get(skipped.familyId);
    if (!representative) {
      where(
        `unselected URL ${skipped.url} names family ${skipped.familyId}, which has no representative`,
      );
    }
    if (representative !== skipped.representativeUrl) {
      where(
        `unselected URL ${skipped.url} claims representative ${skipped.representativeUrl}, but family ${skipped.familyId} is represented by ${representative}`,
      );
    }
    if (seenUrls.has(skipped.url)) {
      where(`URL appears as both selected and unselected: ${skipped.url}`);
    }
  }

  const unselectedUrls = new Set(selection.unselected.map((u) => u.url));
  if (unselectedUrls.size !== selection.unselected.length) {
    where("duplicate URL in unselected[]");
  }

  const covered = selection.pages.length + selection.unselected.length;
  if (covered !== selection.verifiedUrlCount) {
    where(
      `verifiedUrlCount (${selection.verifiedUrlCount}) != selected + unselected (${covered})`,
    );
  }

  // memberCount drives the coverage arithmetic and the sampling policy, so it
  // has to match the member list actually present in the file.
  const skippedPerFamily = new Map<string, number>();
  for (const skipped of selection.unselected) {
    skippedPerFamily.set(
      skipped.familyId,
      (skippedPerFamily.get(skipped.familyId) ?? 0) + 1,
    );
  }
  for (const page of selection.pages) {
    const actual = 1 + (skippedPerFamily.get(page.familyId) ?? 0);
    if (page.memberCount !== actual) {
      where(
        `family ${page.familyId} declares memberCount ${page.memberCount} but the file lists ${actual} member(s)`,
      );
    }
  }
}

/** Cross-check the sibling `page-families.json` (same run, same conclusions). */
function assertFamiliesAgree(
  selection: PageSelection,
  families: PageFamilySet,
  label: string,
): void {
  const where: (msg: string) => never = (msg) => fail(`${label}: ${msg}`);

  if (families.rootUrl !== selection.rootUrl) {
    where(
      `rootUrl mismatch — selected-pages.json ${selection.rootUrl} vs page-families.json ${families.rootUrl}`,
    );
  }
  if (
    families.sourceVerifiedUrlsFile !== selection.sourceVerifiedUrlsFile ||
    families.sourceVerificationFile !== selection.sourceVerificationFile
  ) {
    where(
      "page-families.json and selected-pages.json were derived from different verification inputs",
    );
  }
  if (families.familyCount !== selection.familyCount) {
    where(
      `familyCount mismatch — selection ${selection.familyCount} vs families ${families.familyCount}`,
    );
  }

  const byId = new Map(families.families.map((f) => [f.id, f]));
  for (const page of selection.pages) {
    const family = byId.get(page.familyId);
    if (!family) where(`family ${page.familyId} is missing from page-families.json`);
    if (family.representativeUrl !== page.url) {
      where(
        `family ${page.familyId} representative mismatch — selection ${page.url} vs families ${family.representativeUrl}`,
      );
    }
    if (family.members.length !== page.memberCount) {
      where(
        `family ${page.familyId} member count mismatch — selection ${page.memberCount} vs families ${family.members.length}`,
      );
    }
    if (family.type !== page.familyType) {
      where(
        `family ${page.familyId} type mismatch — selection ${page.familyType} vs families ${family.type}`,
      );
    }
  }
}

/**
 * Load `selected-pages.json` and everything needed to trust it.
 *
 * The sibling files are looked for next to it, mirroring how `pnpm select`
 * itself resolves `verification.json` next to `verified-urls.json`.
 */
export async function loadSiteSelection(
  selectedPagesPath: string,
): Promise<LoadedSiteSelection> {
  const runDir = path.dirname(path.resolve(selectedPagesPath));
  const siblingDir = path.dirname(selectedPagesPath);
  const skippedChecks: string[] = [];

  const selectionJson = await readJson(selectedPagesPath, "selected-pages file");
  const parsed = PageSelectionSchema.safeParse(selectionJson);
  if (!parsed.success) {
    fail(
      `selected-pages.json failed schema validation (schemaVersion=${schemaVersionOf(selectionJson)}): ${issueSummary(parsed.error)}`,
    );
  }
  const selection = parsed.data;
  assertSelectionConsistent(selection, "selected-pages.json");

  if (selection.pages.length === 0) {
    fail("selected-pages.json selects no pages — nothing to observe");
  }

  // --- sibling: page-families.json (optional, strict when present) ---
  const familiesPath = path.join(siblingDir, "page-families.json");
  const familiesJson = await readOptionalJson(familiesPath);
  let families: PageFamilySet | undefined;
  if (familiesJson === undefined) {
    skippedChecks.push("page-families.json not found — family cross-check skipped");
  } else {
    const familiesParsed = PageFamilySetSchema.safeParse(familiesJson);
    if (!familiesParsed.success) {
      fail(
        `page-families.json failed schema validation (schemaVersion=${schemaVersionOf(familiesJson)}): ${issueSummary(familiesParsed.error)}`,
      );
    }
    families = familiesParsed.data;
    assertFamiliesAgree(selection, families, "page-families.json");
  }

  // --- sibling: verified-urls.json (optional, strict when present) ---
  const verifiedPath = path.join(siblingDir, "verified-urls.json");
  const verifiedJson = await readOptionalJson(verifiedPath);
  if (verifiedJson === undefined) {
    skippedChecks.push(
      "verified-urls.json not found — verified-count cross-check skipped",
    );
  } else {
    const verifiedParsed = VerifiedUrlSetSchema.safeParse(verifiedJson);
    if (!verifiedParsed.success) {
      fail(
        `verified-urls.json failed schema validation (schemaVersion=${schemaVersionOf(verifiedJson)}): ${issueSummary(verifiedParsed.error)}`,
      );
    }
    const verified = verifiedParsed.data;
    if (verified.rootUrl !== selection.rootUrl) {
      fail(
        `verified-urls.json: rootUrl mismatch — selection ${selection.rootUrl} vs verified ${verified.rootUrl}`,
      );
    }
    if (verified.count !== selection.verifiedUrlCount) {
      fail(
        `verified-urls.json: count mismatch — selection claims ${selection.verifiedUrlCount} verified URLs, file holds ${verified.count}`,
      );
    }
    // Every selected URL must be a URL verification actually cleared: this stage
    // may only observe pages an earlier stage confirmed are real and usable.
    const verifiedUrls = new Set(verified.urls.map((u) => u.url));
    for (const page of selection.pages) {
      if (!verifiedUrls.has(page.url)) {
        fail(
          `selected page is not present in verified-urls.json: ${page.url}`,
        );
      }
    }
  }

  // --- sibling: verification.json (optional, strict when present) ---
  const verificationPath = path.join(siblingDir, "verification.json");
  const verificationJson = await readOptionalJson(verificationPath);
  if (verificationJson === undefined) {
    skippedChecks.push(
      "verification.json not found — verification cross-check skipped",
    );
  } else {
    const verificationParsed =
      VerificationResultSchema.safeParse(verificationJson);
    if (!verificationParsed.success) {
      fail(
        `verification.json failed schema validation (schemaVersion=${schemaVersionOf(verificationJson)}): ${issueSummary(verificationParsed.error)}`,
      );
    }
    if (verificationParsed.data.rootUrl !== selection.rootUrl) {
      fail(
        `verification.json: rootUrl mismatch — selection ${selection.rootUrl} vs verification ${verificationParsed.data.rootUrl}`,
      );
    }
  }

  return {
    selection,
    ...(families ? { families } : {}),
    runDir,
    sourceSelectedPagesFile: selectedPagesPath,
    ...(families ? { sourcePageFamiliesFile: familiesPath } : {}),
    skippedChecks,
  };
}
