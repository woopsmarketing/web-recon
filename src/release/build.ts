/**
 * release:build — dependency-graph-driven selective rebuild (spec §17, §18).
 *
 *   1. refresh fresh/stale from input hashes (dir-sha256-v1 + resolution slices)
 *   2. gate: indexable target + unresolved release-blocking ⇒ production BLOCKED
 *   3. dry-run: WOULD RUN / WOULD REUSE / BLOCKED BY, zero file mutation
 *   4. execute stale stages in topological order via the typed stage runners,
 *      saving the project after every successful stage (crash-safe resume)
 *   5. failure recovery (spec §27): lastSuccessfulStage / failedStage /
 *      failureArtifact / retryable — a retry never re-runs earlier fresh stages
 *   6. audit trail (spec §28): every run records intent/resolution hashes,
 *      input artifact hashes, reused/rerun stages, overrides, blockers, verdict
 *
 * Frozen stages (reconstruction / template) are NEVER executed here — there is
 * no runner for them at all; if their artifacts drift the build refuses.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashDirectory } from "../production/hash.js";
import { productionBuildDir } from "../production/index.js";
import { collectRequirements, type LineagePaths } from "./collect.js";
import { deriveReleaseState } from "./gate.js";
import { EXECUTABLE_STAGES, FROZEN_STAGES } from "./types.js";
import { STAGE_DEPENDENCIES, STAGE_ORDER } from "./graph.js";
import {
  applyBlocking,
  computeStageInputsHash,
  refreshStageStatuses,
  resolutionAssetContentHashes,
} from "./freshness.js";
import {
  buildRequirementsFile,
  effectiveResolution,
  mergeRequirements,
  releaseBlockers,
  sha256OfJson,
} from "./requirements.js";
import { renderOperatorChecklist } from "./checklist.js";
import { DEFAULT_STAGE_RUNNERS, type StageRunner, type StageRunnerContext } from "./stages.js";
import {
  loadReleaseProject,
  loadRequirementsFile,
  newReleaseRunId,
  saveChecklist,
  saveReleaseProject,
  saveReleaseRun,
  saveRequirementsFile,
} from "./store.js";
import type {
  ArtifactRef,
  ReleaseProject,
  ReleaseRun,
  ReleaseStage,
  StageExecutionRecord,
} from "./types.js";

export interface BuildOptions {
  dryRun?: boolean;
  /** Test seam: override/instrument stage runners (failure injection). */
  runners?: Partial<Record<ReleaseStage, StageRunner>>;
  log?: (line: string) => void;
}

export interface BuildResult {
  project: ReleaseProject;
  run: ReleaseRun | null;
  plan: {
    wouldRun: ReleaseStage[];
    wouldReuse: ReleaseStage[];
    blocked: Array<{ stage: ReleaseStage; blockedBy: string[] }>;
  };
  failed: boolean;
}

function lineagePathsOf(project: ReleaseProject): LineagePaths {
  const artifact = (stage: ReleaseStage): ArtifactRef => {
    const ref = project.stageStatus[stage]?.artifact;
    if (!ref) throw new Error(`release: stage ${stage} has no current artifact`);
    return ref;
  };
  const production = project.stageStatus.production?.artifact ?? null;
  return {
    host: project.source.host,
    templateRunDir: artifact("template").path,
    contentRunDir: artifact("content").path,
    themeRunDir: artifact("theme").path,
    seoPlanRunDir: artifact("seo").path,
    materializationRunDir: artifact("assets").path,
    productionSpecFile: production ? path.join(production.path, "production-spec.json") : null,
    productionBuildDir: production
      ? productionBuildDir(project.source.host, production.id)
      : null,
  };
}

export async function buildRelease(
  projectDirOrFile: string,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const log = options.log ?? ((): void => {});
  const dryRun = options.dryRun ?? false;
  const { project, projectDir } = await loadReleaseProject(projectDirOrFile);
  const requirementsFile = await loadRequirementsFile(projectDir);
  const effective = effectiveResolution(project.resolutions);
  const targetMode = effective.productionBaseUrl === undefined ? "preview" : "indexable-production";

  // ---- 1. freshness --------------------------------------------------------
  const refreshed = await refreshStageStatuses(project, effective, { log });
  // Staleness propagates through the dependency graph: a stage whose upstream
  // WILL be rebuilt is itself stale (the plan must predict the cascade).
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const stage of STAGE_ORDER) {
      const status = refreshed.stageStatus[stage];
      if (status.status !== "fresh") continue;
      const staleDep = STAGE_DEPENDENCIES[stage].find(
        (dep) => refreshed.stageStatus[dep].status !== "fresh",
      );
      if (staleDep !== undefined) {
        status.status = "stale";
        status.reasons = [...status.reasons, `upstream stage ${staleDep} will be rebuilt`];
        propagated = true;
      }
    }
  }
  const blockers = releaseBlockers(requirementsFile.requirements);
  applyBlocking(refreshed.stageStatus, blockers, targetMode);

  const wouldRun: ReleaseStage[] = [];
  const wouldReuse: ReleaseStage[] = [];
  const blocked: Array<{ stage: ReleaseStage; blockedBy: string[] }> = [];
  for (const stage of STAGE_ORDER) {
    const status = refreshed.stageStatus[stage];
    if (status.status === "blocked") blocked.push({ stage, blockedBy: status.blockedBy });
    else if (status.status === "stale" && (EXECUTABLE_STAGES as readonly string[]).includes(stage)) {
      wouldRun.push(stage);
    } else if (status.status === "stale") {
      // frozen stage stale — surfaced, never executed
      blocked.push({ stage, blockedBy: ["frozen-stage-input-drift"] });
    } else wouldReuse.push(stage);
  }

  // ---- 2. dry run (spec §18): report, mutate NOTHING -----------------------
  if (dryRun) {
    log("");
    log("WOULD RUN");
    for (const stage of wouldRun) log(`  ${stage}`);
    if (wouldRun.length === 0) log("  (nothing — all stages fresh)");
    log("");
    log("WOULD REUSE");
    for (const stage of wouldReuse) log(`  ${stage}`);
    log("");
    if (blocked.length > 0) {
      log("BLOCKED BY");
      for (const entry of blocked) log(`  ${entry.stage}: ${entry.blockedBy.join(", ")}`);
      log("");
    }
    return { project, run: null, plan: { wouldRun, wouldReuse, blocked }, failed: false };
  }

  const frozenBlocked = blocked.filter((entry) =>
    (FROZEN_STAGES as readonly string[]).includes(entry.stage),
  );
  if (frozenBlocked.length > 0) {
    throw new Error(
      `release build refused: frozen stage inputs drifted (${frozenBlocked
        .map((entry) => entry.stage)
        .join(", ")}) — reconstruction/template are never re-run by the release layer (spec §12)`,
    );
  }

  // ---- 3. execute -----------------------------------------------------------
  const releaseRunId = newReleaseRunId();
  const runners = { ...DEFAULT_STAGE_RUNNERS, ...(options.runners ?? {}) };
  const stageExecutions: StageExecutionRecord[] = [];
  const rerun: ReleaseStage[] = [];
  const warnings = [...refreshed.warnings];
  const overrides: string[] = [
    ...Object.keys(effective.fontDecisions ?? {}).map((family) => `fontDecision:${family}`),
    ...(effective.acknowledgements ?? []).map((ack) => `acknowledgement:${ack.requirementId}`),
  ];
  const current: Partial<Record<ReleaseStage, ArtifactRef | null>> = {};
  for (const stage of STAGE_ORDER) current[stage] = refreshed.stageStatus[stage].artifact;
  const assetHashes = await resolutionAssetContentHashes(effective);

  let failedStage: ReleaseStage | null = null;
  let failureMessage = "";
  let lastSuccessfulStage: ReleaseStage | null = null;

  const context: StageRunnerContext = {
    project,
    effective,
    current,
    releaseRunId,
    log,
  };

  for (const stage of STAGE_ORDER) {
    const status = refreshed.stageStatus[stage];
    if (status.status === "blocked") {
      stageExecutions.push({
        stage,
        status: "blocked",
        elapsedMs: 0,
        artifact: status.artifact,
        detail: `blocked by: ${status.blockedBy.join(", ")}`,
      });
      continue;
    }
    if (status.status === "fresh") {
      stageExecutions.push({ stage, status: "reused", elapsedMs: 0, artifact: status.artifact });
      continue;
    }
    const runner = runners[stage];
    if (!runner) {
      throw new Error(`release build: stale stage ${stage} has no runner (frozen stages never do)`);
    }
    const startedAt = Date.now();
    try {
      log(`[release] running stage ${stage}…`);
      const result = await runner(context);
      const hashed = await hashDirectory(result.path, result.excluded ?? []);
      const artifact: ArtifactRef = {
        id: result.id,
        path: result.path,
        hash: hashed.hash,
        fileCount: hashed.fileCount,
        byteCount: hashed.byteCount,
        excluded: result.excluded ?? [],
      };
      current[stage] = artifact;
      const artifactHashes: Partial<Record<ReleaseStage, string | null>> = {};
      for (const s of STAGE_ORDER) artifactHashes[s] = current[s]?.hash ?? null;
      refreshed.stageStatus[stage] = {
        status: "fresh",
        artifact,
        inputsHash: computeStageInputsHash(stage, artifactHashes, effective, assetHashes, project.intent.intentHash),
        reasons: [],
        blockedBy: [],
      };
      stageExecutions.push({
        stage,
        status: "rerun",
        elapsedMs: Date.now() - startedAt,
        artifact,
        ...(result.detail !== undefined ? { detail: result.detail } : {}),
      });
      rerun.push(stage);
      lastSuccessfulStage = stage;
      // Crash-safe: persist the adoption immediately.
      project.stageStatus = refreshed.stageStatus;
      project.updatedAt = new Date().toISOString();
      await saveReleaseProject(projectDir, project);
      // Downstream inputs changed → recompute their status now.
      for (const downstream of STAGE_ORDER) {
        if (downstream === stage) continue;
        const downstreamStatus = refreshed.stageStatus[downstream];
        if (downstreamStatus.status === "blocked") continue;
        const expected = computeStageInputsHash(
          downstream,
          artifactHashes,
          effective,
          assetHashes,
          project.intent.intentHash,
        );
        if (downstreamStatus.artifact !== null && downstreamStatus.inputsHash === expected) {
          if (downstreamStatus.status !== "fresh") {
            downstreamStatus.status = "fresh";
            downstreamStatus.reasons = [];
          }
        } else if (downstreamStatus.status === "fresh") {
          downstreamStatus.status = "stale";
          downstreamStatus.reasons = ["upstream stage was rebuilt in this run"];
          if (!wouldRun.includes(downstream) && (EXECUTABLE_STAGES as readonly string[]).includes(downstream)) {
            wouldRun.push(downstream);
          }
        }
      }
    } catch (error) {
      failedStage = stage;
      failureMessage = error instanceof Error ? error.message : String(error);
      stageExecutions.push({
        stage,
        status: "failed",
        elapsedMs: Date.now() - startedAt,
        artifact: status.artifact,
        detail: failureMessage,
      });
      break;
    }
  }

  // ---- 4. re-collect requirements from the CURRENT artifacts ---------------
  project.stageStatus = refreshed.stageStatus;
  const lineage = lineagePathsOf(project);
  const collected = await collectRequirements(lineage);
  const freshConsumers = new Set(
    (["content", "seo", "assets"] as const).filter(
      (stage) => project.stageStatus[stage].status === "fresh",
    ),
  );
  const requirements = mergeRequirements(
    requirementsFile.requirements,
    collected.requirements,
    project.resolutions,
    freshConsumers,
  );
  const finalBlockers = releaseBlockers(requirements);
  applyBlocking(project.stageStatus, finalBlockers, targetMode);
  warnings.push(...collected.warnings);

  // ---- 5. failure record (spec §27) ----------------------------------------
  const runDirRel = path.join(projectDir, "runs", releaseRunId);
  if (failedStage !== null) {
    const failureArtifact = path.join(runDirRel, "failure.json");
    await mkdir(runDirRel, { recursive: true });
    await writeFile(
      path.join(runDirRel, "failure.json"),
      JSON.stringify(
        { stage: failedStage, message: failureMessage, at: new Date().toISOString() },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    project.failure = {
      lastSuccessfulStage,
      failedStage,
      failureArtifact,
      retryable: true,
      message: failureMessage,
      at: new Date().toISOString(),
    };
  } else {
    project.failure = null;
  }

  // ---- 6. state + persistence ----------------------------------------------
  project.releaseState = deriveReleaseState({
    stageStatus: project.stageStatus,
    requirements,
    facts: collected.facts,
  });
  project.target = {
    mode: targetMode,
    productionBaseUrl: effective.productionBaseUrl ?? null,
  };
  project.updatedAt = new Date().toISOString();
  project.runs.push({ runId: releaseRunId, kind: "build" });

  const inputArtifactHashes: Record<string, string> = {};
  for (const stage of STAGE_ORDER) {
    const hash = current[stage]?.hash;
    if (hash !== undefined && hash !== null) inputArtifactHashes[stage] = hash;
  }
  const run: ReleaseRun = {
    schemaVersion: 1,
    schemaName: "release-run-v1",
    runId: releaseRunId,
    kind: "build",
    projectId: project.projectId,
    createdAt: new Date().toISOString(),
    intentHash: project.intent.intentHash,
    resolutionHash: project.resolutions.length > 0 ? sha256OfJson(effective) : null,
    inputArtifactHashes,
    reusedStages: stageExecutions.filter((entry) => entry.status === "reused").map((entry) => entry.stage),
    rerunStages: rerun,
    blockedStages: stageExecutions.filter((entry) => entry.status === "blocked").map((entry) => entry.stage),
    operatorOverrides: overrides,
    warnings,
    blockers: finalBlockers.map((requirement) => requirement.requirementId),
    finalVerdict: project.releaseState,
    stageExecutions,
    failure: project.failure,
  };

  await saveRequirementsFile(projectDir, buildRequirementsFile(project.projectId, requirements));
  await saveChecklist(
    projectDir,
    renderOperatorChecklist(project, requirements, collected.routeReadiness, warnings),
  );
  await saveReleaseProject(projectDir, project);
  await saveReleaseRun(projectDir, run);

  return {
    project,
    run,
    plan: { wouldRun, wouldReuse, blocked },
    failed: failedStage !== null,
  };
}
