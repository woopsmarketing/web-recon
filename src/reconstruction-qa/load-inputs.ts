import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  PageObservationSchema,
  type PageObservation,
} from "../observer/types.js";
import {
  SiteObservationSchema,
  type SiteObservation,
} from "../multi-observer/types.js";
import {
  InteractionExplorationSchema,
  InteractionObservationSchema,
  type InteractionExploration,
  type InteractionObservation,
} from "../interaction-explorer/types.js";
import {
  InteractionPatternsArtifactSchema,
  UnknownInteractionsArtifactSchema,
  type InteractionPatternsArtifact,
  type UnknownInteractionsArtifact,
} from "../interaction-patterns/types.js";
import {
  loadSiteSpec,
  SiteSpecLoadError,
  type LoadedSiteSpec,
} from "../sitespec/index.js";
import {
  ReconstructionManifestSchema,
  type ReconstructionManifest,
} from "../reconstruction/types.js";
import { QaInputError } from "./types.js";

/**
 * The QA input chain (items 12, 13).
 *
 * Task 14's runtime reads the SiteSpec and nothing else, and that stays true:
 * NOTHING in this module is imported by the generated app or by
 * `src/reconstruction/`. The QA RUNNER is a different consumer with a different
 * need — it has to compare the clone against the evidence the clone was built
 * from — so it walks the provenance chain deliberately:
 *
 *   reconstruction-manifest.json           (Task 14 — the primary input)
 *     ├─ app/                              the clone to serve
 *     └─ rootUrl + version triple → the SiteSpec that produced it
 *          └─ siteSpec.source.*            (audit strings, followed HERE only)
 *               ├─ site-observation.json           (Task 09)
 *               │    └─ pages/<id>/observation.json + viewports/<v>/screenshot.png
 *               ├─ interaction-exploration.json    (Task 11)
 *               │    └─ pages/<id>/<v>/<action>.json  (locator descriptors)
 *               ├─ interaction-patterns.json       (Task 12)
 *               └─ unknown-interactions.json       (Task 12)
 *
 * The SiteSpec does not record which reconstruction consumed it and the manifest
 * does not record which SiteSpec produced it (adding that field to a baseline
 * manifest would break Task 14's byte-identical output, item 114). So a baseline
 * manifest resolves its SiteSpec by scanning the site's `site-specs/` runs for
 * one whose root URL and version triple match, newest first. `--site-spec`
 * overrides that, and a CORRECTED manifest records the path outright.
 */

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function fail(message: string): never {
  throw new QaInputError(message);
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    fail(`cannot read ${label}: ${file} (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${label} is not valid JSON: ${file} (${err instanceof Error ? err.message : String(err)})`);
  }
}

function parseWith<T>(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      data?: T;
      error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
    };
  },
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    const issues = (parsed.error?.issues ?? [])
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    fail(`${label} failed schema validation: ${issues}`);
  }
  return parsed.data;
}

/**
 * Resolve a path recorded inside an artifact.
 *
 * Same policy as Task 13's loader: try the working directory, then each anchor
 * and its ancestors, so a relocated `data/` tree still resolves without any
 * fuzzy searching.
 */
async function resolveRecordedPath(
  recorded: string,
  anchors: readonly string[],
  label: string,
): Promise<string> {
  const candidates: string[] = [];
  if (path.isAbsolute(recorded)) {
    candidates.push(recorded);
  } else {
    candidates.push(path.resolve(process.cwd(), recorded));
    for (const anchor of anchors) {
      candidates.push(path.resolve(anchor, recorded));
      let dir = anchor;
      for (let i = 0; i < 6; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        candidates.push(path.resolve(dir, recorded));
      }
    }
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await exists(candidate)) return candidate;
  }
  fail(
    `cannot locate ${label} recorded as "${recorded}". Tried ${seen.size} location(s) ` +
      `relative to the working directory and the referring artifacts.`,
  );
}

/**
 * A corrected manifest carries its provenance; a baseline one does not (and must
 * not, item 114). Read the optional fields without widening the Task 14 schema.
 */
interface ManifestProvenance {
  sourceQaRun?: string;
  correctionSet?: string;
  sourceSiteSpec?: string;
  correctionCount?: number;
}

function readManifestProvenance(raw: unknown): ManifestProvenance {
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const out: ManifestProvenance = {};
  if (typeof record.sourceQaRun === "string") out.sourceQaRun = record.sourceQaRun;
  if (typeof record.correctionSet === "string") out.correctionSet = record.correctionSet;
  if (typeof record.sourceSiteSpec === "string") out.sourceSiteSpec = record.sourceSiteSpec;
  if (typeof record.correctionCount === "number") out.correctionCount = record.correctionCount;
  return out;
}

/**
 * Find the SiteSpec a baseline manifest was generated from.
 *
 * Deterministic by construction: the candidate set is every `site-spec.json`
 * under the site's `site-specs/` directory whose `rootUrl` and version triple
 * match the manifest, and the winner is the lexically greatest run directory
 * (run ids are ISO timestamps, so that is the newest). If nothing matches, this
 * fails rather than guessing — a QA run against the wrong SiteSpec would produce
 * confident nonsense.
 */
async function findSiteSpecForManifest(
  manifest: ReconstructionManifest,
  manifestDir: string,
): Promise<string> {
  const anchors: string[] = [];
  let dir = path.resolve(manifestDir);
  for (let i = 0; i < 6; i++) {
    anchors.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const roots = new Set<string>();
  for (const anchor of anchors) {
    roots.add(path.join(anchor, "site-specs"));
  }
  const host = (() => {
    try {
      return new URL(manifest.rootUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host) roots.add(path.resolve(process.cwd(), "data", host, "site-specs"));

  const matches: string[] = [];
  for (const root of [...roots].sort()) {
    if (!(await isDirectory(root))) continue;
    let entries: string[];
    try {
      entries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(root, entry, "site-spec.json");
      if (!(await exists(file))) continue;
      let parsed: {
        rootUrl?: unknown;
        schemaVersion?: unknown;
        siteSpecVersion?: unknown;
        compilerVersion?: unknown;
      };
      try {
        parsed = JSON.parse(await readFile(file, "utf8"));
      } catch {
        continue;
      }
      if (parsed.rootUrl !== manifest.rootUrl) continue;
      if (parsed.schemaVersion !== manifest.sourceSchemaVersion) continue;
      if (parsed.siteSpecVersion !== manifest.sourceSiteSpecVersion) continue;
      if (parsed.compilerVersion !== manifest.sourceCompilerVersion) continue;
      matches.push(file);
    }
  }
  if (matches.length === 0) {
    fail(
      `no SiteSpec found for ${manifest.rootUrl} with schema ${manifest.sourceSchemaVersion} / ` +
        `siteSpec ${manifest.sourceSiteSpecVersion} / compiler ${manifest.sourceCompilerVersion}. ` +
        `Pass --site-spec <path-to-site-spec.json> explicitly.`,
    );
  }
  matches.sort();
  return matches[matches.length - 1]!;
}

/** One deep-observed page's Task 09 artifacts, resolved on disk. */
export interface ObservedPageArtifacts {
  pageId: string;
  url: string;
  /** Absolute directory holding `observation.json` and `viewports/`. */
  dir: string;
  observation: PageObservation;
  /** viewport id → absolute path, present only when the file exists. */
  screenshotFiles: Partial<Record<"desktop" | "mobile", string>>;
  renderedHtmlFiles: Partial<Record<"desktop" | "mobile", string>>;
}

export interface QaInputs {
  manifestFile: string;
  manifestDir: string;
  manifest: ReconstructionManifest;
  manifestProvenance: ManifestProvenance;
  /** `<manifestDir>/app` — the clone to serve. */
  appDir: string;

  siteSpecFile: string;
  siteSpec: LoadedSiteSpec;

  siteObservationFile: string;
  siteObservation: SiteObservation;
  /** pageId → resolved Task 09 artifacts, only for pages that succeeded. */
  observedPages: Map<string, ObservedPageArtifacts>;

  explorationFile: string;
  exploration: InteractionExploration;
  /** actionId → absolute path of the Task 11 action observation. */
  actionFiles: Map<string, string>;

  patternsFile: string;
  patterns: InteractionPatternsArtifact;
  unknownsFile: string;
  unknowns: UnknownInteractionsArtifact;
}

export interface LoadQaInputsOptions {
  manifestFile: string;
  /** Explicit SiteSpec, when the deterministic scan should not decide. */
  siteSpecFile?: string;
}

/** Load and cross-validate everything the QA runner reads. */
export async function loadQaInputs(
  options: LoadQaInputsOptions,
): Promise<QaInputs> {
  const manifestFile = path.resolve(options.manifestFile);
  if (!(await exists(manifestFile))) {
    fail(`reconstruction-manifest.json not found: ${options.manifestFile}`);
  }
  const manifestDir = path.dirname(manifestFile);
  const manifestRaw = await readJson(manifestFile, "reconstruction-manifest.json");
  const manifest = parseWith(
    ReconstructionManifestSchema,
    manifestRaw,
    "reconstruction-manifest.json",
  );
  const manifestProvenance = readManifestProvenance(manifestRaw);

  const appDir = path.join(manifestDir, "app");
  if (!(await isDirectory(appDir))) {
    fail(
      `the reconstruction has no app/ directory next to its manifest (${appDir}). ` +
        `QA needs a generated app to serve.`,
    );
  }

  // --- SiteSpec -------------------------------------------------------------
  const siteSpecFile = options.siteSpecFile
    ? path.resolve(options.siteSpecFile)
    : manifestProvenance.sourceSiteSpec
      ? await resolveRecordedPath(
          manifestProvenance.sourceSiteSpec,
          [manifestDir],
          "site-spec.json recorded in the corrected manifest",
        )
      : await findSiteSpecForManifest(manifest, manifestDir);
  if (!(await exists(siteSpecFile))) {
    fail(`site-spec.json not found: ${siteSpecFile}`);
  }
  let siteSpec: LoadedSiteSpec;
  try {
    siteSpec = await loadSiteSpec(siteSpecFile, { validate: true });
  } catch (err) {
    if (err instanceof SiteSpecLoadError) fail(err.message);
    throw err;
  }
  if (siteSpec.siteSpec.rootUrl !== manifest.rootUrl) {
    fail(
      `rootUrl mismatch: the reconstruction says ${manifest.rootUrl}, ` +
        `${siteSpecFile} says ${siteSpec.siteSpec.rootUrl}`,
    );
  }
  if (siteSpec.siteSpec.routes.length !== manifest.stats.routes) {
    fail(
      `route-count mismatch: the reconstruction generated ${manifest.stats.routes} routes but ` +
        `${siteSpecFile} holds ${siteSpec.siteSpec.routes.length}. These artifacts do not belong together.`,
    );
  }
  const siteSpecDir = path.dirname(siteSpecFile);

  // --- Task 09 --------------------------------------------------------------
  const siteObservationFile = await resolveRecordedPath(
    siteSpec.siteSpec.source.siteObservation,
    [siteSpecDir, manifestDir],
    "site-observation.json (Task 09)",
  );
  const siteObservation = parseWith(
    SiteObservationSchema,
    await readJson(siteObservationFile, "site-observation.json"),
    "site-observation.json",
  );
  if (siteObservation.rootUrl !== manifest.rootUrl) {
    fail(
      `rootUrl mismatch: Task 09 says ${siteObservation.rootUrl}, the reconstruction says ${manifest.rootUrl}`,
    );
  }
  const siteObservationDir = path.dirname(siteObservationFile);

  const observedPages = new Map<string, ObservedPageArtifacts>();
  for (const page of siteObservation.pages) {
    if (page.status !== "success" || !page.pageObservationFile) continue;
    const observationFile = path.resolve(siteObservationDir, page.pageObservationFile);
    if (!(await exists(observationFile))) continue;
    const observation = parseWith(
      PageObservationSchema,
      await readJson(observationFile, `${page.pageId}/observation.json`),
      `${page.pageId}/observation.json`,
    );
    const dir = path.dirname(observationFile);
    const screenshotFiles: ObservedPageArtifacts["screenshotFiles"] = {};
    const renderedHtmlFiles: ObservedPageArtifacts["renderedHtmlFiles"] = {};
    for (const viewport of ["desktop", "mobile"] as const) {
      const files = observation.viewports[viewport].files;
      const shot = path.resolve(dir, files.screenshot);
      if (await exists(shot)) screenshotFiles[viewport] = shot;
      const rendered = path.resolve(dir, files.rendered);
      if (await exists(rendered)) renderedHtmlFiles[viewport] = rendered;
    }
    observedPages.set(page.pageId, {
      pageId: page.pageId,
      url: page.url,
      dir,
      observation,
      screenshotFiles,
      renderedHtmlFiles,
    });
  }

  // --- Task 11 --------------------------------------------------------------
  const explorationFile = await resolveRecordedPath(
    siteSpec.siteSpec.source.interactionExploration,
    [siteSpecDir, siteObservationDir, manifestDir],
    "interaction-exploration.json (Task 11)",
  );
  const exploration = parseWith(
    InteractionExplorationSchema,
    await readJson(explorationFile, "interaction-exploration.json"),
    "interaction-exploration.json",
  );
  const explorationDir = path.dirname(explorationFile);
  const actionFiles = new Map<string, string>();
  for (const action of exploration.actions) {
    const file = path.resolve(explorationDir, action.observationFile);
    if (await exists(file)) actionFiles.set(action.actionId, file);
  }

  // --- Task 12 --------------------------------------------------------------
  const patternsFile = await resolveRecordedPath(
    siteSpec.siteSpec.source.interactionPatterns,
    [siteSpecDir, explorationDir, manifestDir],
    "interaction-patterns.json (Task 12)",
  );
  const patterns = parseWith(
    InteractionPatternsArtifactSchema,
    await readJson(patternsFile, "interaction-patterns.json"),
    "interaction-patterns.json",
  );
  const unknownsFile = await resolveRecordedPath(
    siteSpec.siteSpec.source.unknownInteractions,
    [path.dirname(patternsFile), siteSpecDir, manifestDir],
    "unknown-interactions.json (Task 12)",
  );
  const unknowns = parseWith(
    UnknownInteractionsArtifactSchema,
    await readJson(unknownsFile, "unknown-interactions.json"),
    "unknown-interactions.json",
  );
  if (patterns.rootUrl !== manifest.rootUrl || unknowns.rootUrl !== manifest.rootUrl) {
    fail(
      `rootUrl mismatch in the Task 12 artifacts (${patterns.rootUrl} / ${unknowns.rootUrl}) ` +
        `versus the reconstruction (${manifest.rootUrl})`,
    );
  }

  return {
    manifestFile,
    manifestDir,
    manifest,
    manifestProvenance,
    appDir,
    siteSpecFile,
    siteSpec,
    siteObservationFile,
    siteObservation,
    observedPages,
    explorationFile,
    exploration,
    actionFiles,
    patternsFile,
    patterns,
    unknownsFile,
    unknowns,
  };
}

/** Read ONE Task 11 action observation (the locator descriptor lives here). */
export async function loadActionObservation(
  file: string,
): Promise<InteractionObservation> {
  return parseWith(
    InteractionObservationSchema,
    await readJson(file, path.basename(file)),
    path.basename(file),
  );
}
