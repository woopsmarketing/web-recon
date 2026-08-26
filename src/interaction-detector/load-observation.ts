import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ElementObservationSchema,
  PageObservationSchema,
  StyleTableSchema,
  type ElementObservation,
  type PageObservation,
  type StyleTable,
  type ViewportId,
} from "../observer/types.js";
// Leaf import: `assertStyleReferencesResolve` is pure (type-only imports), so it
// costs nothing at runtime and re-uses the Observer's own invariant instead of a
// second, subtly different copy of it.
import { assertStyleReferencesResolve } from "../observer/dedupe-styles.js";
import {
  SiteObservationSchema,
  type ObservedSitePage,
  type SiteObservation,
} from "../multi-observer/types.js";

/**
 * Offline input loading for Interaction Candidate Detection (Task 10, item 6).
 *
 * Everything this module touches is a file Task 09 already wrote. There is no
 * Firecrawl client, no Playwright import, no `fetch`, and no browser anywhere in
 * this module's import graph — deliberately verified from the CLI entry point,
 * the same way Task 07's offline property was checked.
 *
 * Validation is fail-fast and layered, because a detector fed a corrupt
 * observation would happily emit plausible-looking candidates for a page that
 * was never really observed:
 *
 *   1. `site-observation.json`      → the real Task 09 zod schema
 *   2. `pages/<id>/observation.json`→ the real Task 05 zod schema
 *   3. `dom.json` / `styles.json`   → the real Observer element/style schemas
 *   4. cross-file invariants        → manifest ↔ artifact agreement, viewport id
 *                                     match, and no dangling `styleId`
 *
 * The one thing that is NOT fatal is a Task 09 page that FAILED to be observed:
 * those are skipped and counted (item 7). A *successful* page whose artifacts
 * are missing or broken IS fatal — that is pipeline corruption, not a site fact.
 */

/** Thrown for input/invariant violations — analysis must not continue. */
export class InteractionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionInputError";
  }
}

function fail(message: string): never {
  throw new InteractionInputError(message);
}

/** Read + JSON.parse a file, failing with a message that names the path. */
async function readJson(filePath: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    fail(`Cannot read ${label}: ${filePath}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail(`Invalid JSON in ${filePath}: ${reason}`);
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

const ElementArraySchema = z.array(ElementObservationSchema);

export interface LoadedSiteObservation {
  siteObservation: SiteObservation;
  /** Directory containing `site-observation.json` — where Task 10 writes too. */
  runDir: string;
  /** The path exactly as the caller gave it (recorded as provenance). */
  sourceSiteObservationFile: string;
}

/**
 * Load and validate the site run manifest. Nothing is re-observed and nothing is
 * re-derived: if the manifest is stale, the fix is to re-run `pnpm observe:site`.
 */
export async function loadSiteObservation(
  siteObservationPath: string,
): Promise<LoadedSiteObservation> {
  const runDir = path.dirname(path.resolve(siteObservationPath));
  const json = await readJson(siteObservationPath, "site-observation file");
  const parsed = SiteObservationSchema.safeParse(json);
  if (!parsed.success) {
    fail(
      `site-observation.json failed schema validation (schemaVersion=${schemaVersionOf(json)}): ${issueSummary(parsed.error)}`,
    );
  }

  const siteObservation = parsed.data;
  if (siteObservation.pages.length === 0) {
    fail("site-observation.json contains no pages — nothing to analyze");
  }

  // A success page without its artifact path is a manifest that contradicts
  // itself; catching it here is much cheaper than a confusing ENOENT later.
  for (const page of siteObservation.pages) {
    if (page.status === "success" && !page.pageObservationFile) {
      fail(
        `page ${page.pageId} is marked success but has no pageObservationFile in the manifest`,
      );
    }
  }

  return {
    siteObservation,
    runDir,
    sourceSiteObservationFile: siteObservationPath,
  };
}

/** One viewport's raw observation data, validated and ready to analyze. */
export interface LoadedViewportObservation {
  viewportId: ViewportId;
  /** Document-order elements, exactly as `dom.json` stores them. */
  elements: ElementObservation[];
  styleTable: StyleTable;
  /** Paths relative to the PAGE directory, as recorded by the Observer. */
  domFile: string;
  stylesFile: string;
}

/** One page's observation plus both viewports' DOM/style data. */
export interface LoadedPageObservation {
  page: ObservedSitePage;
  observation: PageObservation;
  /** Page directory, relative to the site run dir (`pages/p000003`). */
  pageDirRelative: string;
  /** `pages/p000003/observation.json`, relative to the site run dir. */
  observationFileRelative: string;
  viewports: {
    desktop: LoadedViewportObservation;
    mobile: LoadedViewportObservation;
  };
}

/** Load + validate ONE viewport's `dom.json` and `styles.json`. */
async function loadViewport(
  pageDir: string,
  pageId: string,
  viewportId: ViewportId,
  observation: PageObservation,
): Promise<LoadedViewportObservation> {
  const viewport = observation.viewports[viewportId];

  // The stored profile id and the key it is stored under must agree, or every
  // "desktop" number in this run would silently describe the mobile render.
  if (viewport.profile.id !== viewportId) {
    fail(
      `page ${pageId}: viewport key ${viewportId} holds profile id ${viewport.profile.id}`,
    );
  }

  const domFile = viewport.files.dom;
  const stylesFile = viewport.files.styles;

  const domJson = await readJson(
    path.join(pageDir, domFile),
    `dom.json for ${pageId}/${viewportId}`,
  );
  const domParsed = ElementArraySchema.safeParse(domJson);
  if (!domParsed.success) {
    fail(
      `page ${pageId} (${viewportId}): dom.json failed schema validation: ${issueSummary(domParsed.error)}`,
    );
  }

  const stylesJson = await readJson(
    path.join(pageDir, stylesFile),
    `styles.json for ${pageId}/${viewportId}`,
  );
  const stylesParsed = StyleTableSchema.safeParse(stylesJson);
  if (!stylesParsed.success) {
    fail(
      `page ${pageId} (${viewportId}): styles.json failed schema validation: ${issueSummary(stylesParsed.error)}`,
    );
  }

  const elements = domParsed.data;
  const styleTable = stylesParsed.data;

  // The Observer guarantees this on write; if it does not hold on read, the
  // observation on disk is corrupt and no candidate derived from it can be
  // trusted (item 90). Fail rather than analyze a broken page.
  try {
    assertStyleReferencesResolve(elements, styleTable);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail(`page ${pageId} (${viewportId}): ${reason}`);
  }

  // The manifest's element count is what every Task 09 report was written from;
  // a mismatch means dom.json and observation.json are from different runs.
  if (elements.length !== viewport.stats.domElementCount) {
    fail(
      `page ${pageId} (${viewportId}): observation.json claims ${viewport.stats.domElementCount} elements but dom.json holds ${elements.length}`,
    );
  }

  return { viewportId, elements, styleTable, domFile, stylesFile };
}

/**
 * Load ONE successful page: its `observation.json` plus both viewports' DOM and
 * style tables.
 *
 * Pages are loaded one at a time on purpose. A site run holds hundreds of
 * megabytes; keeping every page's `dom.json` in memory at once would trade a
 * bounded, streaming analysis for an unbounded one with no benefit — each page's
 * candidates are independent of every other page's.
 */
export async function loadPageObservation(
  runDir: string,
  page: ObservedSitePage,
): Promise<LoadedPageObservation> {
  const observationFileRelative = page.pageObservationFile;
  if (!observationFileRelative) {
    fail(`page ${page.pageId} has no pageObservationFile`);
  }

  const observationPath = path.join(runDir, observationFileRelative);
  const pageDir = path.dirname(observationPath);

  const json = await readJson(
    observationPath,
    `observation.json for ${page.pageId}`,
  );
  const parsed = PageObservationSchema.safeParse(json);
  if (!parsed.success) {
    fail(
      `page ${page.pageId}: observation.json failed schema validation (schemaVersion=${schemaVersionOf(json)}): ${issueSummary(parsed.error)}`,
    );
  }
  const observation = parsed.data;

  const desktop = await loadViewport(pageDir, page.pageId, "desktop", observation);
  const mobile = await loadViewport(pageDir, page.pageId, "mobile", observation);

  return {
    page,
    observation,
    pageDirRelative: path.posix.dirname(observationFileRelative),
    observationFileRelative,
    viewports: { desktop, mobile },
  };
}
