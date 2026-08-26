import path from "node:path";
import {
  E2eError,
  STAGE_ORDER,
  type E2eOptions,
  type Lineage,
  type StageName,
  type StageRecord,
} from "./types.js";

/**
 * The one mutable object an E2E run threads through its stages.
 *
 * It exists to make item 40 structural rather than a rule someone remembers:
 * **no stage discovers its own input.** Every path a stage receives was recorded
 * here by the stage that produced it, so "the newest file in
 * `data/<host>/site-observations/`" is not a thing this pipeline can express.
 *
 * It also owns the two things that must not be per-stage: the failure record and
 * the elapsed-time ledger. A stage that throws still leaves its timing behind,
 * because a run that died at minute nine of observation is a different report
 * from one that died at second two.
 */

export interface E2eRunContext {
  readonly runId: string;
  readonly rootUrl: string;
  readonly runDir: string;
  readonly options: E2eOptions;
  readonly startedAt: string;
  readonly lineage: Lineage;
  readonly stages: Map<StageName, StageRecord>;
  readonly timings: Record<string, number>;
  readonly storageBytes: Record<string, number>;
  readonly warnings: string[];
  log(message: string): void;
}

export interface CreateRunContextInput {
  runId: string;
  rootUrl: string;
  runDir: string;
  options: E2eOptions;
  onLog?: (message: string) => void;
}

export function createRunContext(input: CreateRunContextInput): E2eRunContext {
  const log = input.onLog ?? ((): void => {});
  return {
    runId: input.runId,
    rootUrl: input.rootUrl,
    runDir: input.runDir,
    options: input.options,
    startedAt: new Date().toISOString(),
    lineage: { rootUrl: input.rootUrl },
    stages: new Map(),
    timings: {},
    storageBytes: {},
    warnings: [],
    log,
  };
}

/** Working-directory-relative, forward slashes. Never an absolute machine path. */
export function portablePath(target: string): string {
  const relative = path.relative(process.cwd(), path.resolve(target));
  return relative === "" ? "." : relative.split(path.sep).join("/");
}

/** Stage records in {@link STAGE_ORDER}, never in completion order (item 36). */
export function orderedStages(context: E2eRunContext): StageRecord[] {
  const out: StageRecord[] = [];
  for (const stage of STAGE_ORDER) {
    const record = context.stages.get(stage);
    if (record) out.push(record);
  }
  return out;
}

/**
 * Verify the chain describes ONE site and ONE run (item 39).
 *
 * Called before the SiteSpec compile, which is the last moment a mismatch is
 * cheap: after it, a wrong `verified-urls.json` has already become a route
 * table, and every downstream number is about a site nobody asked for.
 *
 * The check is deliberately about roots and directories rather than content
 * hashes. A content hash would also catch a mixed run, but it would fail on a
 * legitimately re-run stage, and this pipeline is allowed to re-observe (item
 * 61). What must never happen is stage N reading a run stage N−1 did not write.
 */
export function assertLineage(context: E2eRunContext): void {
  const { lineage } = context;
  if (lineage.rootUrl !== context.rootUrl) {
    throw new E2eError(
      `lineage rootUrl ${lineage.rootUrl} does not match the run's root ${context.rootUrl}`,
      "sitespec-invalid",
    );
  }

  // Discovery → verification → selection all extend ONE run directory, so they
  // must literally be siblings. Task 06/07 rely on that too; asserting it here
  // turns "the CLI happened to be given the right file" into a checked property.
  const discoveryDir = lineage.discoveryRunDir;
  const sameDirAsDiscovery: Array<[string, string | undefined]> = [
    ["discovery.json", lineage.discoveryFile],
    ["verification.json", lineage.verificationFile],
    ["verified-urls.json", lineage.verifiedUrlsFile],
    ["page-families.json", lineage.pageFamiliesFile],
    ["selected-pages.json", lineage.selectedPagesFile],
  ];
  if (discoveryDir !== undefined) {
    for (const [label, file] of sameDirAsDiscovery) {
      if (file === undefined) continue;
      const dir = portablePath(path.dirname(path.resolve(file)));
      if (dir !== discoveryDir) {
        throw new E2eError(
          `${label} lives in ${dir}, not in this run's discovery directory ${discoveryDir}. ` +
            `A stage read an artifact from a different run.`,
          "sitespec-invalid",
        );
      }
    }
  }

  const required: Array<[string, string | undefined]> = [
    ["discovery", lineage.discoveryFile],
    ["verification", lineage.verifiedUrlsFile],
    ["selection", lineage.selectedPagesFile],
    ["observation", lineage.siteObservationFile],
    ["interaction detection", lineage.interactionAnalysisFile],
    ["interaction exploration", lineage.interactionExplorationFile],
    ["interaction modeling", lineage.interactionPatternsFile],
  ];
  for (const [label, file] of required) {
    if (file === undefined) {
      throw new E2eError(
        `the ${label} stage produced no artifact path, so the SiteSpec compile has no verified input`,
        "sitespec-invalid",
      );
    }
  }
}
