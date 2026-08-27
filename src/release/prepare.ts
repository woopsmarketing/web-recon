/**
 * release:prepare (spec §15) — scan an ACCEPTED production candidate and
 * emit the release project + normalized requirements + operator checklist.
 *
 * Input: a production-spec run dir (production-spec-v1). Its lineage block
 * names every consumed artifact by id + dir hash; prepare walks it (plus the
 * template manifest's reconstruction back-reference and the SEO plan's source
 * snapshot reference), re-hashes every directory, and records the accepted
 * lineage. Everything is read-only; the only writes go to the NEW
 * data/<host>/release-projects/<projectId>/ namespace.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { hashDirectory } from "../production/hash.js";
import { productionBuildDir } from "../production/index.js";
import { collectRequirements } from "./collect.js";
import { deriveReleaseState } from "./gate.js";
import { loadTechnicalDebtRegister } from "./debt.js";
import {
  CONTENT_DERIVED_HASH_EXCLUSIONS,
  FROZEN_TEMPLATE_HASH_EXCLUSIONS,
  applyBlocking,
  computeStageInputsHash,
  refreshStageStatuses,
} from "./freshness.js";
import { STAGE_ORDER } from "./graph.js";
import { defaultSiteId, projectIdForSite } from "./instance.js";
import {
  buildRequirementsFile,
  effectiveResolution,
  mergeRequirements,
  releaseBlockers,
  sha256OfJson,
} from "./requirements.js";
import { renderOperatorChecklist } from "./checklist.js";
import {
  CHECKLIST_FILE,
  RELEASE_PROJECT_FILE,
  REQUIREMENTS_FILE,
  TECHNICAL_DEBT_FILE,
  loadReleaseProject,
  loadRequirementsFile,
  newReleaseRunId,
  releaseProjectDir,
  saveChecklist,
  saveReleaseProject,
  saveReleaseRun,
  saveRequirementsFile,
} from "./store.js";
import {
  RELEASE_PROJECT_REVISION,
  RELEASE_PROJECT_SCHEMA_NAME,
  RELEASE_SCHEMA_VERSION,
  emptyAuthoredState,
} from "./types.js";
import type {
  AppliedResolution,
  ArtifactRef,
  AuthoredState,
  ReleaseProject,
  ReleaseStage,
  StageStatus,
} from "./types.js";
import { mkdir, writeFile } from "node:fs/promises";

export interface PrepareOptions {
  /** production-spec run dir (or its production-spec.json). */
  productionSpecRef: string;
  /**
   * STABLE site identity. Operator-suppliable (`--site-id`); defaults to the
   * host slug, which is identical on every prepare. Several distinct customer
   * sites are produced from one template by giving each its own siteId.
   */
  siteId?: string;
  /** Project directory name. Defaults to the siteId (not the spec run id). */
  projectId?: string;
  debtSourceFile?: string;
  log?: (line: string) => void;
}

export interface PrepareResult {
  project: ReleaseProject;
  projectDir: string;
  requirementsCount: number;
  releaseBlockingUnresolved: number;
  /** True when an existing project was updated in place (authored preserved). */
  reprepared: boolean;
  /** What re-prepare carried forward untouched (empty on a first prepare). */
  preserved: string[];
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function hashRef(id: string, dir: string, exclude: string[] = []): Promise<ArtifactRef> {
  const hashed = await hashDirectory(dir, exclude);
  return {
    id,
    path: dir,
    hash: hashed.hash,
    fileCount: hashed.fileCount,
    byteCount: hashed.byteCount,
    excluded: hashed.excluded,
  };
}

export async function prepareReleaseProject(options: PrepareOptions): Promise<PrepareResult> {
  const log = options.log ?? ((): void => {});
  const specFile = options.productionSpecRef.endsWith(".json")
    ? options.productionSpecRef
    : path.join(options.productionSpecRef, "production-spec.json");
  const spec = await readJson<{
    schemaName: string;
    runId: string;
    sourceHost: string;
    lineage: {
      template: { templateId: string; dir: string; excluded?: string[] };
      contentRun: { contentRunId: string; dir: string };
      theme: { themeRunId: string; dir: string };
      seoPlan: { seoPlanRunId: string; dir: string };
      assets: { materializationRunId: string; inventoryRunDir: string; dir: string };
    };
  }>(specFile);
  if (spec.schemaName !== "production-spec-v1") {
    throw new Error(`not a production-spec-v1 file: ${specFile}`);
  }
  const host = spec.sourceHost;
  // ---- stable identity (Task 27) -------------------------------------------
  // Task 25/26 derived the projectId from the production-spec RUN id, so every
  // prepare minted a NEW identity for the SAME customer site (linear.app has
  // two such projects on disk, 22 minutes apart). Identity now comes from the
  // siteId, which does not move.
  const requestedSiteId = options.siteId ?? defaultSiteId(host);
  const projectId = options.projectId ?? projectIdForSite(requestedSiteId);
  const projectDir = releaseProjectDir(host, projectId);
  // ---- non-destructive re-prepare ------------------------------------------
  // REQUIREMENT RECALCULATION and AUTHORED-DATA PRESERVATION are DISTINCT
  // operations: everything below is re-derived from the re-hashed lineage,
  // while the operator's authored work is carried forward untouched.
  const loadedExisting = existsSync(path.join(projectDir, RELEASE_PROJECT_FILE))
    ? await loadReleaseProject(projectDir)
    : null;
  const existing = loadedExisting?.project ?? null;
  const siteId = options.siteId ?? existing?.siteId ?? requestedSiteId;
  const carriedResolutions: AppliedResolution[] = existing?.resolutions ?? [];
  const carriedAuthored: AuthoredState = existing?.authored ?? emptyAuthoredState();
  const carriedRuns = existing?.runs ?? [];
  const preserved: string[] = [];
  if (existing !== null) {
    preserved.push(
      `resolutions:${carriedResolutions.length}`,
      `authored.slotValues:${Object.keys(carriedAuthored.slotValues).length}`,
      `authored.theme.tokens:${Object.keys(carriedAuthored.theme.tokens ?? {}).length}`,
      `runs:${carriedRuns.length}`,
      `siteId:${siteId}`,
      `createdAt:${existing.createdAt}`,
    );
    log(`[release:prepare] existing project found — preserving ${preserved.join(", ")}`);
  }
  const specDir = path.dirname(specFile);
  const buildDir = productionBuildDir(host, spec.runId);
  if (!existsSync(buildDir)) {
    throw new Error(`accepted production build not found next to the spec: ${buildDir}`);
  }

  // ---- walk the lineage -----------------------------------------------------
  const templateManifest = await readJson<{
    templateId: string;
    source: { host: string; rootUrl?: string; reconstructionRunId: string };
  }>(path.join(spec.lineage.template.dir, "manifest.json"));
  const reconstructionDir = path.join("data", host, "reconstructions", templateManifest.source.reconstructionRunId);
  if (!existsSync(reconstructionDir)) {
    throw new Error(`reconstruction run not found: ${reconstructionDir}`);
  }
  const seoManifest = await readJson<{ inputs: { sourceSnapshotDir: string } }>(
    path.join(spec.lineage.seoPlan.dir, "manifest.json"),
  );
  const contentIntent = await readJson<{ rawIntent?: string }>(
    path.join(spec.lineage.contentRun.dir, "intent.json"),
  );
  const contentManifest = await readJson<{ intentHash?: string }>(
    path.join(spec.lineage.contentRun.dir, "manifest.json"),
  );

  log(`[release:prepare] hashing accepted lineage (dir-sha256-v1)…`);
  const acceptedLineage = {
    reconstruction: await hashRef(
      templateManifest.source.reconstructionRunId,
      reconstructionDir,
      ["node_modules", ".next", "out"],
    ),
    // `report/` is excluded — qa:recon-template writes there, and a frozen-stage
    // hash that moves when QA runs bricks release:build (freshness.ts).
    template: await hashRef(spec.lineage.template.templateId, spec.lineage.template.dir, [
      ...FROZEN_TEMPLATE_HASH_EXCLUSIONS,
    ]),
    // `report/` + `slot-accounting.json` are excluded for the same reason — a
    // content QA / revalidation pass rewrites them, and drifting the content
    // stage hash reruns content and every stage downstream of it (freshness.ts).
    content: await hashRef(spec.lineage.contentRun.contentRunId, spec.lineage.contentRun.dir, [
      ...CONTENT_DERIVED_HASH_EXCLUSIONS,
    ]),
    theme: await hashRef(spec.lineage.theme.themeRunId, spec.lineage.theme.dir),
    seo: await hashRef(spec.lineage.seoPlan.seoPlanRunId, spec.lineage.seoPlan.dir),
    assets: await hashRef(spec.lineage.assets.materializationRunId, spec.lineage.assets.dir),
    production: {
      spec: await hashRef(spec.runId, specDir),
      build: await hashRef(spec.runId, buildDir, ["node_modules", ".next", "app"]),
    },
  };

  // ---- collect requirements (normalization, spec §8) ------------------------
  const collected = await collectRequirements({
    host,
    templateRunDir: spec.lineage.template.dir,
    contentRunDir: spec.lineage.contentRun.dir,
    themeRunDir: spec.lineage.theme.dir,
    seoPlanRunDir: spec.lineage.seoPlan.dir,
    materializationRunDir: spec.lineage.assets.dir,
    inventoryRunDir: spec.lineage.assets.inventoryRunDir,
    productionSpecFile: specFile,
    productionBuildDir: buildDir,
  });
  const previous = existsSync(path.join(projectDir, REQUIREMENTS_FILE))
    ? (await loadRequirementsFile(projectDir)).requirements
    : null;
  // Requirements are RECOMPUTED from the re-hashed lineage — and matched
  // against the CARRIED resolutions, so re-prepare never re-opens a gap the
  // operator already closed.
  const requirements = mergeRequirements(previous, collected.requirements, carriedResolutions);

  // ---- technical debt register (spec §30) -----------------------------------
  const debt = await loadTechnicalDebtRegister(options.debtSourceFile);

  // ---- stage statuses: the accepted candidate is the fresh baseline ---------
  const intentHash = contentManifest.intentHash ?? null;
  const emptyResolution = { schemaVersion: 1, schemaName: "production-resolution-v1" } as const;
  const artifactHashes: Partial<Record<ReleaseStage, string | null>> = {
    reconstruction: acceptedLineage.reconstruction.hash,
    template: acceptedLineage.template.hash,
    content: acceptedLineage.content.hash,
    theme: acceptedLineage.theme.hash,
    seo: acceptedLineage.seo.hash,
    assets: acceptedLineage.assets.hash,
    production: acceptedLineage.production.spec.hash,
  };
  const stageStatus = {} as Record<ReleaseStage, StageStatus>;
  for (const stage of STAGE_ORDER) {
    const lineageArtifact =
      stage === "production" ? acceptedLineage.production.spec : acceptedLineage[stage];
    const carried = existing?.stageStatus?.[stage];
    // Frozen stages (reconstruction/template) are never re-run, so the freshly
    // re-hashed accepted lineage IS their current artifact — that is also how a
    // pre-Task-27 project picks up the new template `report/` exclusion.
    const frozen = stage === "reconstruction" || stage === "template";
    // For an EXECUTABLE stage the carried artifact is kept, because a
    // release:build rerun advances the stage to a NEW run dir that the accepted
    // lineage does not know about; adopting the lineage there would silently
    // revert the project to the pre-rerun artifact (test 27.35).
    //
    // But when the carried artifact IS the lineage artifact — same path — the
    // two refs describe the same bytes and differ only in HOW they were hashed.
    // Discarding the freshly re-hashed ref in that case made the remedy printed
    // by `staleExclusionSetWarnings` (freshness.ts) a lie for every non-frozen
    // stage: content could never pick up CONTENT_DERIVED_HASH_EXCLUSIONS, so an
    // operator who ran the re-prepare it told them to run saw the same warning
    // forever. Adopting the lineage ref re-hashes the artifact IN PLACE (same
    // id, same path, current `excluded`); `inputsHash` below is still the
    // CARRIED one, so no per-stage derivation state is lost.
    const samePath = carried?.artifact != null && carried.artifact.path === lineageArtifact.path;
    const artifact = carried !== undefined && !frozen && !samePath ? carried.artifact : lineageArtifact;
    stageStatus[stage] = {
      status: "fresh",
      artifact,
      inputsHash:
        carried?.inputsHash ??
        computeStageInputsHash(stage, artifactHashes, emptyResolution, {}, intentHash),
      reasons: [],
      blockedBy: [],
    };
  }

  const warnings = [
    ...collected.warnings,
    ...debt.warnings,
    ...(loadedExisting?.adaptedFrom != null
      ? [
          `release project revision ${loadedExisting.adaptedFrom} adapted to ` +
            `${RELEASE_PROJECT_REVISION}: siteId "${siteId}" adopted and the authored block ` +
            `replayed from ${carriedResolutions.length} applied resolution(s) — the previous ` +
            `document was NOT rewritten until this prepare saved it`,
        ]
      : []),
    "workspace-versioning: the pipeline source tree is a single foundation commit with extensive " +
      "uncommitted work — releases currently depend on this working tree (operational risk, Task 25 report §29)",
  ];

  const project: ReleaseProject = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    schemaName: RELEASE_PROJECT_SCHEMA_NAME,
    projectRevision: RELEASE_PROJECT_REVISION,
    siteId,
    projectId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      host,
      rootUrl: templateManifest.source.rootUrl ?? null,
    },
    acceptedLineage,
    auxiliary: {
      seoSourceSnapshotDir: seoManifest.inputs.sourceSnapshotDir,
      assetInventoryDir: spec.lineage.assets.inventoryRunDir,
      siteSpecDir: null,
    },
    intent: {
      rawIntent: contentIntent.rawIntent ?? null,
      intentHash,
    },
    target: { mode: "preview", productionBaseUrl: null },
    stageStatus,
    requirementsFile: REQUIREMENTS_FILE,
    checklistFile: CHECKLIST_FILE,
    resolutions: carriedResolutions,
    authored: carriedAuthored,
    releaseState: "DISCOVERED",
    failure: existing?.failure ?? null,
    limitations: [
      "collections/blog: template routes are a CLOSED set from observation — no collection or blog " +
        "generation exists; new posts/pages of a family are out of scope (seam: content-route " +
        "requirements per route; future collection task)",
      "asset-inventory imageBrief join staleness: the release graph follows spec §12 " +
        "(image/font → assets); a content rerun does not re-run the asset inventory, so " +
        "replacement-manifest slotKey joins may reference the earlier content run",
      "og-image / organization-logo / social-handle resolutions are recorded and shipped " +
        "(media/), but the SEO plan has no consumption seam for them yet",
    ],
    warnings,
    technicalDebt: debt.entries,
    runs: [...carriedRuns],
  };

  // ---- freshness under the CARRIED authored state + resolutions ------------
  // A first prepare adopts the accepted candidate as the fresh baseline (every
  // recomputed hash equals the one just recorded). A re-prepare answers the
  // honest question instead: given the carried authoring, what is still fresh?
  const effective = effectiveResolution(carriedResolutions);
  if (existing !== null) {
    const refreshed = await refreshStageStatuses(project, effective, { log });
    project.stageStatus = refreshed.stageStatus;
    warnings.push(...refreshed.warnings);
    project.target = {
      mode: effective.productionBaseUrl === undefined ? "preview" : "indexable-production",
      productionBaseUrl: effective.productionBaseUrl ?? null,
    };
    applyBlocking(project.stageStatus, releaseBlockers(requirements), project.target.mode);
  }

  // releaseState is artifact-derived — compute it now.
  project.releaseState = deriveReleaseState({
    stageStatus: project.stageStatus,
    requirements,
    facts: collected.facts,
  });

  const runId = newReleaseRunId();
  project.runs.push({ runId, kind: "prepare" });

  await mkdir(projectDir, { recursive: true });
  await saveRequirementsFile(projectDir, buildRequirementsFile(projectId, requirements));
  await saveChecklist(
    projectDir,
    renderOperatorChecklist(project, requirements, collected.routeReadiness, warnings),
  );
  await writeFile(
    path.join(projectDir, TECHNICAL_DEBT_FILE),
    JSON.stringify(
      { schemaVersion: 1, schemaName: "release-technical-debt-v1", entries: debt.entries },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await saveReleaseProject(projectDir, project);
  await saveReleaseRun(projectDir, {
    schemaVersion: 1,
    schemaName: "release-run-v1",
    runId,
    kind: "prepare",
    projectId,
    createdAt: new Date().toISOString(),
    intentHash,
    resolutionHash: carriedResolutions.length > 0 ? sha256OfJson(effective) : null,
    inputArtifactHashes: Object.fromEntries(
      Object.entries(artifactHashes).filter(([, hash]) => hash != null) as Array<[string, string]>,
    ),
    reusedStages: [...STAGE_ORDER],
    rerunStages: [],
    blockedStages: [],
    operatorOverrides: [],
    warnings,
    blockers: requirements
      .filter(
        (requirement) =>
          requirement.severity === "release-blocking" &&
          requirement.status !== "resolved" &&
          requirement.status !== "not-applicable",
      )
      .map((requirement) => requirement.requirementId),
    finalVerdict: project.releaseState,
    stageExecutions: [],
    failure: null,
  });

  log(
    `[release:prepare] ${projectId}: ${requirements.length} requirement(s), state ${project.releaseState}`,
  );
  return {
    project,
    projectDir,
    requirementsCount: requirements.length,
    releaseBlockingUnresolved: requirements.filter(
      (requirement) =>
        requirement.severity === "release-blocking" &&
        requirement.status !== "resolved" &&
        requirement.status !== "not-applicable",
    ).length,
    reprepared: existing !== null,
    preserved,
  };
}
