import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ElementObservationSchema,
  PageObservationSchema,
  type ElementObservation,
  type PageObservation,
  type ViewportId,
} from "../observer/types.js";
import {
  SiteObservationSchema,
  type ObservedSitePage,
  type SiteObservation,
} from "../multi-observer/types.js";
import {
  PageInteractionAnalysisSchema,
  SiteInteractionAnalysisSchema,
  type PageInteractionAnalysis,
  type SiteInteractionAnalysis,
} from "../interaction-detector/types.js";

/**
 * Offline input loading for the Interaction Explorer (Task 11, items 6 & 116).
 *
 * The input root is a Task 10 `interaction-analysis.json`. From there this
 * module follows the provenance already recorded on disk:
 *
 *   interaction-analysis.json          ← given to the CLI
 *     ├ site-observation.json          ← sibling (Task 09 manifest)
 *     └ pages/<id>/interaction-candidates.json   ← relative path in the manifest
 *          └ pages/<id>/observation.json         ← Task 09 page summary
 *               └ viewports/<vp>/dom.json        ← needed for locator descriptors
 *
 * `dom.json` is read for one reason only: a candidate record is an INDEX, not a
 * copy. It carries `elementId`, tag, role and text, but not `aria-label`, not
 * `name`, not the ancestor chain — and those are exactly what a live locator has
 * to be built from. `styles.json` is deliberately NOT read: computed style plays
 * no part in re-identifying an element, and skipping it keeps this stage's load
 * cost to the DOM alone.
 *
 * Everything here is read-only. Task 09 and Task 10 artifacts are immutable
 * input (item 116); this module opens files and never writes one.
 */

/** Thrown for input/invariant violations — exploration must not continue. */
export class ExplorerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplorerInputError";
  }
}

function fail(message: string): never {
  throw new ExplorerInputError(message);
}

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

export interface LoadedInteractionAnalysis {
  analysis: SiteInteractionAnalysis;
  siteObservation: SiteObservation;
  /** Directory holding both manifests — the READ-ONLY Task 09/10 run. */
  sourceRunDir: string;
  /**
   * Provenance recorded in every artifact: the path exactly as the CLI was
   * given it, and its derived sibling. Kept in the caller's own form rather
   * than resolved, because an absolute path leaks the machine layout into a
   * shareable artifact and breaks as soon as the run directory is moved.
   */
  sourceInteractionAnalysisFile: string;
  sourceSiteObservationFile: string;
}

/**
 * Load the two site-level manifests and cross-check that they describe the same
 * run.
 *
 * The sibling `site-observation.json` is located by directory rather than by the
 * `sourceSiteObservationFile` string inside the analysis: that string is the
 * path as typed on someone else's shell (`data/host/...`, relative to whatever
 * their CWD was), and following it would break the moment the run directory is
 * moved. The two files being siblings is a structural fact of Task 10's
 * additive-write policy, so that is what is relied on — and then verified.
 */
export async function loadInteractionAnalysis(
  interactionAnalysisPath: string,
): Promise<LoadedInteractionAnalysis> {
  const resolved = path.resolve(interactionAnalysisPath);
  const sourceRunDir = path.dirname(resolved);

  const analysisJson = await readJson(resolved, "interaction-analysis file");
  const analysisParsed = SiteInteractionAnalysisSchema.safeParse(analysisJson);
  if (!analysisParsed.success) {
    fail(
      `interaction-analysis.json failed schema validation (schemaVersion=${schemaVersionOf(analysisJson)}): ${issueSummary(analysisParsed.error)}`,
    );
  }
  const analysis = analysisParsed.data;
  if (analysis.pages.length === 0) {
    fail("interaction-analysis.json contains no analyzed pages — nothing to explore");
  }

  const siteObservationPath = path.join(sourceRunDir, "site-observation.json");
  const siteJson = await readJson(
    siteObservationPath,
    "sibling site-observation.json",
  );
  const siteParsed = SiteObservationSchema.safeParse(siteJson);
  if (!siteParsed.success) {
    fail(
      `site-observation.json failed schema validation (schemaVersion=${schemaVersionOf(siteJson)}): ${issueSummary(siteParsed.error)}`,
    );
  }
  const siteObservation = siteParsed.data;

  if (siteObservation.rootUrl !== analysis.rootUrl) {
    fail(
      `interaction-analysis.json is for ${analysis.rootUrl} but its sibling site-observation.json is for ${siteObservation.rootUrl}`,
    );
  }

  // Every analyzed page must exist in the observation manifest as a success:
  // exploring a page whose observation is missing would mean the candidates and
  // the locator descriptors came from different runs.
  const observedById = new Map(siteObservation.pages.map((p) => [p.pageId, p]));
  for (const page of analysis.pages) {
    const observed = observedById.get(page.pageId);
    if (!observed) {
      fail(
        `interaction-analysis.json lists page ${page.pageId} which is absent from site-observation.json`,
      );
    }
    if (observed.status !== "success" || !observed.pageObservationFile) {
      fail(
        `page ${page.pageId} was analyzed by Task 10 but is ${observed.status} in site-observation.json`,
      );
    }
    if (observed.url !== page.url) {
      fail(
        `page ${page.pageId} URL disagrees between the two manifests: ${observed.url} vs ${page.url}`,
      );
    }
  }

  return {
    analysis,
    siteObservation,
    sourceRunDir,
    sourceInteractionAnalysisFile: interactionAnalysisPath,
    sourceSiteObservationFile: path.join(
      path.dirname(interactionAnalysisPath),
      "site-observation.json",
    ),
  };
}

/** One viewport's DOM, indexed for locator-descriptor construction. */
export interface LoadedViewportDom {
  viewportId: ViewportId;
  /** Document order, exactly as `dom.json` stores it. */
  elements: ElementObservation[];
  byElementId: Map<string, ElementObservation>;
  /** `elementId` → its children in document order (built in one pass). */
  childrenByParentId: Map<string, ElementObservation[]>;
}

/** Everything one page contributes to planning. */
export interface LoadedCandidatePage {
  pageId: string;
  url: string;
  observedPage: ObservedSitePage;
  candidates: PageInteractionAnalysis;
  observation: PageObservation;
  /** `pages/<id>/interaction-candidates.json`, relative to the source run dir. */
  candidatesFileRelative: string;
  viewports: { desktop: LoadedViewportDom; mobile: LoadedViewportDom };
}

function indexViewportDom(
  viewportId: ViewportId,
  elements: ElementObservation[],
): LoadedViewportDom {
  const byElementId = new Map<string, ElementObservation>();
  const childrenByParentId = new Map<string, ElementObservation[]>();
  for (const element of elements) {
    byElementId.set(element.id, element);
    const parentId = element.parentId ?? "";
    const siblings = childrenByParentId.get(parentId);
    if (siblings) siblings.push(element);
    else childrenByParentId.set(parentId, [element]);
  }
  return { viewportId, elements, byElementId, childrenByParentId };
}

async function loadViewportDom(
  pageDir: string,
  pageId: string,
  viewportId: ViewportId,
  observation: PageObservation,
): Promise<LoadedViewportDom> {
  const viewport = observation.viewports[viewportId];
  if (viewport.profile.id !== viewportId) {
    fail(
      `page ${pageId}: viewport key ${viewportId} holds profile id ${viewport.profile.id}`,
    );
  }

  const domPath = path.join(pageDir, viewport.files.dom);
  const domJson = await readJson(domPath, `dom.json for ${pageId}/${viewportId}`);
  const parsed = ElementArraySchema.safeParse(domJson);
  if (!parsed.success) {
    fail(
      `page ${pageId} (${viewportId}): dom.json failed schema validation: ${issueSummary(parsed.error)}`,
    );
  }
  const elements = parsed.data;

  if (elements.length !== viewport.stats.domElementCount) {
    fail(
      `page ${pageId} (${viewportId}): observation.json claims ${viewport.stats.domElementCount} elements but dom.json holds ${elements.length}`,
    );
  }

  return indexViewportDom(viewportId, elements);
}

/**
 * Load ONE page's candidates plus the DOM they index into.
 *
 * Pages are loaded one at a time and released once their plan entries are built
 * — a site run holds hundreds of megabytes of `dom.json`, and planning needs
 * only a locator descriptor per selected candidate, not the whole tree in
 * memory.
 */
export async function loadCandidatePage(
  loaded: LoadedInteractionAnalysis,
  pageId: string,
): Promise<LoadedCandidatePage> {
  const summary = loaded.analysis.pages.find((p) => p.pageId === pageId);
  if (!summary) fail(`page ${pageId} is not listed in interaction-analysis.json`);
  const observedPage = loaded.siteObservation.pages.find(
    (p) => p.pageId === pageId,
  );
  if (!observedPage?.pageObservationFile) {
    fail(`page ${pageId} has no observation artifact in site-observation.json`);
  }

  const candidatesPath = path.join(
    loaded.sourceRunDir,
    summary.interactionCandidatesFile,
  );
  const candidatesJson = await readJson(
    candidatesPath,
    `interaction-candidates.json for ${pageId}`,
  );
  const candidatesParsed =
    PageInteractionAnalysisSchema.safeParse(candidatesJson);
  if (!candidatesParsed.success) {
    fail(
      `page ${pageId}: interaction-candidates.json failed schema validation (schemaVersion=${schemaVersionOf(candidatesJson)}): ${issueSummary(candidatesParsed.error)}`,
    );
  }
  const candidates = candidatesParsed.data;
  if (candidates.pageId !== pageId) {
    fail(
      `page ${pageId}: interaction-candidates.json declares pageId ${candidates.pageId}`,
    );
  }

  const observationPath = path.join(
    loaded.sourceRunDir,
    observedPage.pageObservationFile,
  );
  const observationJson = await readJson(
    observationPath,
    `observation.json for ${pageId}`,
  );
  const observationParsed = PageObservationSchema.safeParse(observationJson);
  if (!observationParsed.success) {
    fail(
      `page ${pageId}: observation.json failed schema validation (schemaVersion=${schemaVersionOf(observationJson)}): ${issueSummary(observationParsed.error)}`,
    );
  }
  const observation = observationParsed.data;
  const pageDir = path.dirname(observationPath);

  const desktop = await loadViewportDom(pageDir, pageId, "desktop", observation);
  const mobile = await loadViewportDom(pageDir, pageId, "mobile", observation);

  // A candidate that points at an element id `dom.json` does not contain means
  // the two files are from different runs — no locator could be built from it.
  for (const viewportId of ["desktop", "mobile"] as const) {
    const dom = viewportId === "desktop" ? desktop : mobile;
    for (const candidate of candidates.viewports[viewportId].candidates) {
      if (!dom.byElementId.has(candidate.elementId)) {
        fail(
          `page ${pageId} (${viewportId}): candidate ${candidate.id} references ${candidate.elementId}, which is absent from dom.json`,
        );
      }
    }
  }

  return {
    pageId,
    url: summary.url,
    observedPage,
    candidates,
    observation,
    candidatesFileRelative: summary.interactionCandidatesFile,
    viewports: { desktop, mobile },
  };
}
