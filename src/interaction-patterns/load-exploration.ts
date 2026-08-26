import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  EXECUTED_STATUSES,
  InteractionExplorationSchema,
  InteractionObservationSchema,
  InteractionPlanSchema,
  type InteractionActionPlan,
  type InteractionExploration,
  type InteractionObservation,
  type InteractionPlan,
} from "../interaction-explorer/types.js";

/**
 * Task 11 input loading and fail-fast validation (Task 12, item 7).
 *
 * Pattern modeling is only as trustworthy as the artifacts underneath it. A
 * half-written exploration run — an action listed in the manifest whose file is
 * missing, a result whose viewport disagrees with its plan, a duplicate action
 * id — would still produce a beautiful `interaction-patterns.json`, and every
 * number in it would be a lie. So nothing is modeled until the whole chain
 * validates.
 *
 * Everything here is read with the REAL Task 11 zod schemas, not a local
 * re-declaration. If Task 11's shape changes, this fails loudly at the seam
 * instead of silently parsing a subset.
 *
 * Strictly offline: `node:fs` only. No Playwright, no Firecrawl, no network.
 */

/** Input is broken. Never thrown for a legitimate "nothing matched" result. */
export class InteractionPatternInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionPatternInputError";
  }
}

/** One action: its plan entry, its result, and where the result came from. */
export interface LoadedAction {
  plan: InteractionActionPlan;
  observation: InteractionObservation;
  /** Path relative to the exploration run dir. */
  observationFile: string;
}

export interface LoadedExploration {
  /** The `interaction-exploration.json` path exactly as the caller gave it. */
  explorationFile: string;
  /** Its directory — the Task 11 run root. READ ONLY to this whole module. */
  runDir: string;
  /** Directory name only (`2026-08-13T13-41-01-872Z`), for provenance. */
  runId: string;
  rootUrl: string;
  manifest: InteractionExploration;
  plan: InteractionPlan;
  /** Sorted by `actionId`. */
  actions: LoadedAction[];
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new InteractionPatternInputError(
      `Cannot read ${label}: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new InteractionPatternInputError(
      `${label} is not valid JSON: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

function fail(message: string): never {
  throw new InteractionPatternInputError(message);
}

/**
 * Load and validate a complete Task 11 exploration run.
 *
 * The plan is found as a SIBLING of the manifest rather than by following a
 * stored path string, for the same reason Task 11 found its own inputs that way:
 * a path recorded in an artifact is a path in somebody else's shell, and it
 * breaks the moment the run directory is moved. The sibling relationship is a
 * structural fact of Task 11's store, so that is what is relied on — and then
 * cross-checked (`rootUrl`, action set, per-action provenance) rather than
 * trusted.
 */
export async function loadExploration(
  explorationFile: string,
): Promise<LoadedExploration> {
  const runDir = path.dirname(explorationFile);
  const runId = path.basename(runDir);

  const manifestParsed = InteractionExplorationSchema.safeParse(
    await readJson(explorationFile, "interaction-exploration.json"),
  );
  if (!manifestParsed.success) {
    fail(
      `interaction-exploration.json failed Task 11 schema validation: ` +
        manifestParsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }
  const manifest = manifestParsed.data;

  const planFile = path.join(runDir, "interaction-plan.json");
  const planParsed = InteractionPlanSchema.safeParse(
    await readJson(planFile, "interaction-plan.json"),
  );
  if (!planParsed.success) {
    fail(
      `interaction-plan.json failed Task 11 schema validation: ` +
        planParsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
    );
  }
  const plan = planParsed.data;

  // --- manifest ↔ plan --------------------------------------------------------
  if (manifest.rootUrl !== plan.rootUrl) {
    fail(
      `rootUrl mismatch between manifest (${manifest.rootUrl}) and plan (${plan.rootUrl})`,
    );
  }
  if (manifest.status === "plan-only" || manifest.actions.length === 0) {
    fail(
      `exploration run ${runId} has no executed actions (status: ${manifest.status}). ` +
        `Task 12 models observed transitions; run \`pnpm explore:interactions\` without --plan-only first.`,
    );
  }

  const planById = new Map<string, InteractionActionPlan>();
  for (const action of plan.actions) {
    if (planById.has(action.actionId)) {
      fail(`duplicate actionId in interaction-plan.json: ${action.actionId}`);
    }
    planById.set(action.actionId, action);
  }

  const planPageIds = new Set(plan.pages.map((p) => p.pageId));
  const seenActionIds = new Set<string>();
  const actions: LoadedAction[] = [];

  for (const summary of manifest.actions) {
    if (seenActionIds.has(summary.actionId)) {
      fail(`duplicate actionId in interaction-exploration.json: ${summary.actionId}`);
    }
    seenActionIds.add(summary.actionId);

    const planned = planById.get(summary.actionId);
    if (!planned) {
      fail(
        `action ${summary.actionId} is in the exploration manifest but not in the plan`,
      );
    }

    const observationFile = summary.observationFile;
    const parsed = InteractionObservationSchema.safeParse(
      await readJson(path.join(runDir, observationFile), observationFile),
    );
    if (!parsed.success) {
      fail(
        `${observationFile} failed Task 11 schema validation: ` +
          parsed.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
      );
    }
    const observation = parsed.data;

    // --- per-action invariants (item 7) --------------------------------------
    if (observation.actionId !== summary.actionId) {
      fail(
        `${observationFile} declares actionId ${observation.actionId}, manifest says ${summary.actionId}`,
      );
    }
    if (observation.pageId !== planned.pageId) {
      fail(
        `action ${summary.actionId}: pageId ${observation.pageId} does not match plan ${planned.pageId}`,
      );
    }
    if (!planPageIds.has(observation.pageId)) {
      fail(`action ${summary.actionId}: pageId ${observation.pageId} is not a planned page`);
    }
    if (observation.viewportId !== planned.viewportId) {
      fail(
        `action ${summary.actionId}: viewport ${observation.viewportId} does not match plan ${planned.viewportId}`,
      );
    }
    if (observation.viewportId !== observation.sourceViewport) {
      fail(
        `action ${summary.actionId}: viewport ${observation.viewportId} disagrees with sourceViewport ${observation.sourceViewport}`,
      );
    }
    if (observation.sourceCandidateId !== planned.sourceCandidateId) {
      fail(
        `action ${summary.actionId}: sourceCandidateId ${observation.sourceCandidateId} does not match plan ${planned.sourceCandidateId}`,
      );
    }
    if (!observation.sourceCandidateId || !observation.sourceElementId) {
      fail(`action ${summary.actionId}: missing Task 10 provenance`);
    }
    if (observation.status !== summary.status) {
      fail(
        `action ${summary.actionId}: status ${observation.status} disagrees with the manifest (${summary.status})`,
      );
    }
    // The single rule Task 12's whole classification rests on: Task 11 declares
    // `changed` if and only if the diff was meaningful. If that ever stops
    // holding, every coverage number below silently changes meaning.
    if (observation.diff) {
      const expected = observation.diff.meaningfulChange ? "changed" : "no-change";
      if (
        (observation.status === "changed" || observation.status === "no-change") &&
        observation.status !== expected
      ) {
        fail(
          `action ${summary.actionId}: status ${observation.status} contradicts diff.meaningfulChange=${observation.diff.meaningfulChange}`,
        );
      }
    }

    actions.push({ plan: planned, observation, observationFile });
  }

  // --- run-level count invariants (item 7) ------------------------------------
  if (manifest.actions.length !== manifest.stats.plannedActions) {
    fail(
      `manifest lists ${manifest.actions.length} actions but stats.plannedActions is ${manifest.stats.plannedActions}`,
    );
  }
  const executed = actions.filter((a) =>
    EXECUTED_STATUSES.includes(a.observation.status),
  ).length;
  if (executed !== manifest.stats.executedActions) {
    fail(
      `executed action count mismatch: ${executed} artifacts vs stats.executedActions ${manifest.stats.executedActions}`,
    );
  }
  const changed = actions.filter((a) => a.observation.status === "changed").length;
  if (changed !== manifest.stats.changedActions) {
    fail(
      `changed action count mismatch: ${changed} artifacts vs stats.changedActions ${manifest.stats.changedActions}`,
    );
  }

  actions.sort((a, b) => a.observation.actionId.localeCompare(b.observation.actionId));

  return {
    explorationFile,
    runDir,
    runId,
    rootUrl: manifest.rootUrl,
    manifest,
    plan,
    actions,
  };
}
