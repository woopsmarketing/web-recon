import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  InteractionPatternsArtifactSchema,
  UnknownInteractionsArtifactSchema,
  type InteractionPatternsArtifact,
  type UnknownInteractionsArtifact,
} from "../interaction-patterns/types.js";
import {
  AiAnalysisArtifactSchema,
  type AiAnalysisArtifact,
} from "../interaction-patterns/ai/types.js";
import {
  InteractionExplorationSchema,
  InteractionObservationSchema,
  type CapturedSubtree,
  type InteractionExploration,
} from "../interaction-explorer/types.js";
import { actionObservationFileRelative } from "../interaction-explorer/store.js";
import {
  SiteObservationSchema,
  type SiteObservation,
} from "../multi-observer/types.js";
import {
  PageFamilySetSchema,
  PageSelectionSchema,
  type PageFamilySet,
  type PageSelection,
} from "../selector/types.js";
import {
  VerifiedUrlSetSchema,
  type VerifiedUrlSet,
} from "../verifier/types.js";

/**
 * SiteSpec input loading and fail-fast validation (Task 13, items 4, 5).
 *
 * The CLI takes ONE path — a Task 12 `interaction-patterns.json` — and this
 * module walks the provenance chain backwards to everything a SiteSpec needs:
 *
 *   interaction-patterns.json      (Task 12)
 *     ├─ unknown-interactions.json (sibling, Task 12)
 *     └─ sourceExploration → interaction-exploration.json     (Task 11)
 *          └─ sourceSiteObservation → site-observation.json   (Task 09)
 *               ├─ sourceSelectedPagesFile → selected-pages.json  (Task 07)
 *               │    └─ sourceVerifiedUrlsFile → verified-urls.json (Task 06)
 *               └─ sourcePageFamiliesFile  → page-families.json    (Task 08)
 *
 * Every file is parsed with its OWN Task's zod schema, never a local
 * re-declaration, so a schema change upstream fails loudly at this seam instead
 * of silently parsing a subset.
 *
 * `ai-analysis.json` is NEVER picked up implicitly, even when it is sitting
 * right next to the two files that ARE (item 5). Task 12 validation runs write
 * `provider: "fake"` artifacts into exactly that directory, and a compiler that
 * absorbed them automatically would put invented behavior into a production IR.
 * It is loaded only when `--ai-analysis <path>` names it.
 *
 * Strictly offline: `node:fs` only. No Playwright, no Firecrawl, no network.
 */

/** Input is broken or unreachable. Never thrown for an empty-but-valid result. */
export class SiteSpecInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteSpecInputError";
  }
}

function fail(message: string): never {
  throw new SiteSpecInputError(message);
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a path recorded inside an artifact.
 *
 * Stored paths are relative to whatever shell wrote them (`data/<host>/…` from
 * the repo root), which breaks the moment a run directory is moved or the
 * compiler is invoked from elsewhere. So a stored path is tried against the
 * working directory first and then against each supplied anchor — the
 * directories of the artifacts that referenced it — before giving up. That makes
 * a relocated `data/` tree work without inventing a fuzzy search.
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
      // A relocated tree keeps the tail of the path but loses its head, so also
      // try the recorded path anchored at each ancestor of the anchor.
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
    `cannot locate ${label} recorded as "${recorded}". ` +
      `Tried ${seen.size} location(s) relative to the working directory and the ` +
      `referring artifacts. Pass an explicit override if the run tree was moved.`,
  );
}

/**
 * The form a path is RECORDED in.
 *
 * Provenance has to survive being shared, so an absolute path is never written
 * into an artifact — it leaks the machine layout and means nothing on anybody
 * else's disk (the same rule Task 09 and Task 11 apply to their own outputs).
 * Everything is expressed relative to the working directory instead, with
 * forward slashes, which is exactly the `data/<host>/…` shape the pipeline
 * already writes.
 */
function portablePath(candidate: string): string {
  const relative = path.relative(process.cwd(), path.resolve(candidate));
  return (relative === "" ? "." : relative).split(path.sep).join("/");
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    fail(
      `cannot read ${label}: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(
      `${label} is not valid JSON: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

function parseWith<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
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

/** Everything the compiler reads, already validated and cross-checked. */
export interface SiteSpecInputs {
  rootUrl: string;

  patterns: InteractionPatternsArtifact;
  unknowns: UnknownInteractionsArtifact;
  exploration: InteractionExploration;
  siteObservation: SiteObservation;
  selectedPages: PageSelection;
  pageFamilies: PageFamilySet;
  verifiedUrls: VerifiedUrlSet;
  /** Present only when `--ai-analysis` explicitly named a file. */
  aiAnalysis?: AiAnalysisArtifact;

  /**
   * `actionId` → the bounded after-state subtree Task 11 captured for a region
   * that action MOUNTED (Task 16, item 75).
   *
   * Loaded from the exploration run's per-action files, and ONLY for the handful
   * of patterns whose target is dynamic — nine of them in the whole four-site
   * corpus. This is the one place the compiler opens a Task 11 per-action
   * artifact, and it is deliberate: the contents of a mounted region are
   * structure, and assembling structure is what this stage is for. Putting them
   * in Task 12's model instead would have made an interpretation artifact carry
   * a DOM, which is exactly what Task 12's `ActionFacts` boundary forbids.
   *
   * A missing or unreadable action file is NOT an error: the pattern keeps its
   * `dynamic: true` target with no template and the reconstruction mounts an
   * empty region, which is the pre-Task-16 behavior.
   */
  dynamicTargetSubtrees: Map<string, CapturedSubtree>;

  /**
   * Task 17 §4 — bounded after-state captures of DISCOVERED user-visible
   * target regions, keyed `actionId|discoveryId`. Same missing-is-not-an-error
   * policy as `dynamicTargetSubtrees`.
   */
  discoveredTargetSubtrees: Map<string, CapturedSubtree>;

  /** Resolved absolute directory of the Task 09 site run — pages live here. */
  siteObservationDir: string;

  /**
   * The paths AS RECORDED (or as the caller typed them), for the SiteSpec's
   * audit-only `source` block. Deliberately not the resolved absolute paths: an
   * absolute path leaks the machine layout into a shareable artifact.
   */
  sourcePaths: {
    interactionPatterns: string;
    unknownInteractions: string;
    interactionExploration: string;
    siteObservation: string;
    selectedPages: string;
    pageFamilies: string;
    verifiedUrls: string;
    verification: string;
    aiAnalysis?: string;
  };
}

export interface LoadInputsOptions {
  /** Path to a Task 12 `interaction-patterns.json`. */
  patternsFile: string;
  /** Optional override when a relocated tree hides the recorded path. */
  siteObservationFile?: string;
  /** Opt-in ONLY. Nothing here is discovered implicitly (item 5). */
  aiAnalysisFile?: string;
}

/**
 * Load and cross-validate the whole chain.
 *
 * The cross-checks matter as much as the schemas: a SiteSpec assembled from a
 * Task 12 run and an unrelated Task 09 run would validate perfectly and be
 * complete nonsense, so `rootUrl` agreement and page-id membership are verified
 * at every seam.
 */
export async function loadInputs(
  options: LoadInputsOptions,
): Promise<SiteSpecInputs> {
  const patternsPath = path.resolve(options.patternsFile);
  if (!(await exists(patternsPath))) {
    fail(`interaction-patterns.json not found: ${options.patternsFile}`);
  }
  const modelDir = path.dirname(patternsPath);

  const patterns = parseWith(
    InteractionPatternsArtifactSchema,
    await readJson(patternsPath, "interaction-patterns.json"),
    "interaction-patterns.json",
  );

  // The unknown artifact is a structural sibling of the pattern artifact (Task
  // 12's store writes both into one run dir), so it is found that way and then
  // cross-checked rather than trusted.
  const unknownsPath = path.join(modelDir, "unknown-interactions.json");
  if (!(await exists(unknownsPath))) {
    fail(
      `unknown-interactions.json is missing next to ${options.patternsFile}. ` +
        `A SiteSpec must carry Task 12's unknown cases, not just its patterns.`,
    );
  }
  const unknowns = parseWith(
    UnknownInteractionsArtifactSchema,
    await readJson(unknownsPath, "unknown-interactions.json"),
    "unknown-interactions.json",
  );
  if (unknowns.rootUrl !== patterns.rootUrl) {
    fail(
      `rootUrl mismatch: interaction-patterns.json says ${patterns.rootUrl}, ` +
        `unknown-interactions.json says ${unknowns.rootUrl}`,
    );
  }
  if (unknowns.sourceExploration !== patterns.sourceExploration) {
    fail(
      `interaction-patterns.json and unknown-interactions.json were modeled from ` +
        `different Task 11 runs (${patterns.sourceExploration} vs ${unknowns.sourceExploration})`,
    );
  }

  // --- Task 11 --------------------------------------------------------------
  const explorationPath = await resolveRecordedPath(
    patterns.sourceExploration,
    [modelDir],
    "interaction-exploration.json (Task 11)",
  );
  const exploration = parseWith(
    InteractionExplorationSchema,
    await readJson(explorationPath, "interaction-exploration.json"),
    "interaction-exploration.json",
  );
  if (exploration.rootUrl !== patterns.rootUrl) {
    fail(
      `rootUrl mismatch: Task 12 says ${patterns.rootUrl}, Task 11 says ${exploration.rootUrl}`,
    );
  }

  // --- Task 09 --------------------------------------------------------------
  const recordedSiteObservation =
    options.siteObservationFile ?? exploration.sourceSiteObservation;
  const siteObservationPath = options.siteObservationFile
    ? path.resolve(options.siteObservationFile)
    : await resolveRecordedPath(
        recordedSiteObservation,
        [path.dirname(explorationPath), modelDir],
        "site-observation.json (Task 09)",
      );
  if (!(await exists(siteObservationPath))) {
    fail(`site-observation.json not found: ${recordedSiteObservation}`);
  }
  const siteObservation = parseWith(
    SiteObservationSchema,
    await readJson(siteObservationPath, "site-observation.json"),
    "site-observation.json",
  );
  if (siteObservation.rootUrl !== patterns.rootUrl) {
    fail(
      `rootUrl mismatch: Task 12 says ${patterns.rootUrl}, Task 09 says ${siteObservation.rootUrl}`,
    );
  }
  const siteObservationDir = path.dirname(siteObservationPath);

  // --- Task 07 / 08 / 06 ----------------------------------------------------
  const selectedPagesPath = await resolveRecordedPath(
    siteObservation.sourceSelectedPagesFile,
    [siteObservationDir],
    "selected-pages.json (Task 07)",
  );
  const selectedPages = parseWith(
    PageSelectionSchema,
    await readJson(selectedPagesPath, "selected-pages.json"),
    "selected-pages.json",
  );

  const recordedFamilies =
    siteObservation.sourcePageFamiliesFile ??
    path.join(path.dirname(siteObservation.sourceSelectedPagesFile), "page-families.json");
  const pageFamiliesPath = await resolveRecordedPath(
    recordedFamilies,
    [path.dirname(selectedPagesPath), siteObservationDir],
    "page-families.json (Task 08)",
  );
  const pageFamilies = parseWith(
    PageFamilySetSchema,
    await readJson(pageFamiliesPath, "page-families.json"),
    "page-families.json",
  );

  const verifiedUrlsPath = await resolveRecordedPath(
    selectedPages.sourceVerifiedUrlsFile,
    [path.dirname(selectedPagesPath), siteObservationDir],
    "verified-urls.json (Task 06)",
  );
  const verifiedUrls = parseWith(
    VerifiedUrlSetSchema,
    await readJson(verifiedUrlsPath, "verified-urls.json"),
    "verified-urls.json",
  );

  // --- cross-file invariants -------------------------------------------------
  if (pageFamilies.rootUrl !== selectedPages.rootUrl) {
    fail(
      `rootUrl mismatch between page-families.json (${pageFamilies.rootUrl}) and ` +
        `selected-pages.json (${selectedPages.rootUrl})`,
    );
  }
  if (verifiedUrls.rootUrl !== selectedPages.rootUrl) {
    fail(
      `rootUrl mismatch between verified-urls.json (${verifiedUrls.rootUrl}) and ` +
        `selected-pages.json (${selectedPages.rootUrl})`,
    );
  }
  if (verifiedUrls.count !== verifiedUrls.urls.length) {
    fail(
      `verified-urls.json declares count ${verifiedUrls.count} but holds ${verifiedUrls.urls.length} urls`,
    );
  }
  if (pageFamilies.verifiedUrlCount !== verifiedUrls.urls.length) {
    fail(
      `page-families.json was built from ${pageFamilies.verifiedUrlCount} verified URLs ` +
        `but verified-urls.json holds ${verifiedUrls.urls.length}`,
    );
  }

  const observedPageIds = new Set(siteObservation.pages.map((p) => p.pageId));
  for (const page of patterns.pages) {
    if (!observedPageIds.has(page.pageId)) {
      fail(
        `Task 12 references page ${page.pageId}, which is not in this Task 09 run. ` +
          `The interaction model and the site observation do not belong together.`,
      );
    }
  }

  // --- dynamic target subtrees (Task 16, item 75) ----------------------------
  // Only for patterns whose target the interaction MOUNTED. Everything else
  // already lives in the static tree, and opening 161 action files to find nine
  // regions would make the compile slower for no gain.
  const dynamicTargetSubtrees = new Map<string, CapturedSubtree>();
  const explorationDir = path.dirname(explorationPath);
  for (const pattern of patterns.patterns) {
    const target = pattern.target;
    if (!target?.mounted || target.existedBefore) continue;
    const actionFile = path.join(
      explorationDir,
      actionObservationFileRelative(
        pattern.source.pageId,
        pattern.source.viewport,
        pattern.source.actionId,
      ),
    );
    if (!(await exists(actionFile))) continue;
    let observation;
    try {
      observation = InteractionObservationSchema.parse(
        await readJson(actionFile, "interaction action observation"),
      );
    } catch {
      // A pre-Task-16 action file has no subtree to find; an unparsable one is
      // reported by the fact that the pattern ends up with no template.
      continue;
    }
    const captured = observation.after?.targets.find(
      (t) => t.capturedSubtree !== undefined,
    )?.capturedSubtree;
    if (captured) dynamicTargetSubtrees.set(pattern.source.actionId, captured);
  }

  // --- discovered user-visible target subtrees (Task 17 §4) -------------------
  // Keyed `actionId|discoveryId`. Only patterns that CARRY an observed target
  // needing content open their action file; a v1/v2 exploration simply yields
  // nothing here.
  const discoveredTargetSubtrees = new Map<string, CapturedSubtree>();
  for (const pattern of patterns.patterns) {
    // `existing-visibility` captures are loaded too: their subtree is not
    // mounted as content (the static tree already holds it) but it is the only
    // OPEN-state style evidence the region has (Task 17 §5 style graft).
    const wanted = (pattern.observedTargets ?? []).filter(
      (record) => record.hasCapturedSubtree,
    );
    if (wanted.length === 0) continue;
    const actionFile = path.join(
      explorationDir,
      actionObservationFileRelative(
        pattern.source.pageId,
        pattern.source.viewport,
        pattern.source.actionId,
      ),
    );
    if (!(await exists(actionFile))) continue;
    let observation;
    try {
      observation = InteractionObservationSchema.parse(
        await readJson(actionFile, "interaction action observation"),
      );
    } catch {
      continue;
    }
    for (const record of wanted) {
      const discovered = observation.discoveredTargets?.find(
        (t) => t.discoveryId === record.discoveryId,
      );
      if (discovered?.capturedSubtree) {
        discoveredTargetSubtrees.set(
          `${pattern.source.actionId}|${record.discoveryId}`,
          discovered.capturedSubtree,
        );
      }
    }
  }

  // --- optional AI artifact (opt-in only) ------------------------------------
  let aiAnalysis: AiAnalysisArtifact | undefined;
  let aiRecordedPath: string | undefined;
  if (options.aiAnalysisFile) {
    aiRecordedPath = options.aiAnalysisFile;
    const aiPath = path.resolve(options.aiAnalysisFile);
    if (!(await exists(aiPath))) {
      fail(`--ai-analysis file not found: ${options.aiAnalysisFile}`);
    }
    aiAnalysis = parseWith(
      AiAnalysisArtifactSchema,
      await readJson(aiPath, "ai-analysis.json"),
      "ai-analysis.json",
    );
    if (aiAnalysis.rootUrl !== patterns.rootUrl) {
      fail(
        `--ai-analysis rootUrl ${aiAnalysis.rootUrl} does not match this site (${patterns.rootUrl})`,
      );
    }
  }

  return {
    rootUrl: patterns.rootUrl,
    patterns,
    unknowns,
    exploration,
    siteObservation,
    selectedPages,
    pageFamilies,
    verifiedUrls,
    ...(aiAnalysis ? { aiAnalysis } : {}),
    dynamicTargetSubtrees,
    discoveredTargetSubtrees,
    siteObservationDir,
    // Recorded in portable, working-directory-relative form: a SiteSpec is a
    // shareable artifact and must not carry this machine's absolute layout.
    sourcePaths: {
      interactionPatterns: portablePath(patternsPath),
      unknownInteractions: portablePath(unknownsPath),
      interactionExploration: portablePath(explorationPath),
      siteObservation: portablePath(siteObservationPath),
      selectedPages: portablePath(selectedPagesPath),
      pageFamilies: portablePath(pageFamiliesPath),
      verifiedUrls: portablePath(verifiedUrlsPath),
      verification: portablePath(
        path.resolve(
          path.dirname(selectedPagesPath),
          path.basename(selectedPages.sourceVerificationFile),
        ),
      ),
      ...(aiRecordedPath ? { aiAnalysis: portablePath(aiRecordedPath) } : {}),
    },
  };
}
