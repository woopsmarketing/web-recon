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
import { computeStageInputsHash } from "./freshness.js";
import { STAGE_ORDER } from "./graph.js";
import { buildRequirementsFile, mergeRequirements } from "./requirements.js";
import { renderOperatorChecklist } from "./checklist.js";
import {
  CHECKLIST_FILE,
  REQUIREMENTS_FILE,
  TECHNICAL_DEBT_FILE,
  loadRequirementsFile,
  newReleaseRunId,
  releaseProjectDir,
  saveChecklist,
  saveReleaseProject,
  saveReleaseRun,
  saveRequirementsFile,
} from "./store.js";
import { RELEASE_PROJECT_SCHEMA_NAME, RELEASE_SCHEMA_VERSION } from "./types.js";
import type {
  ArtifactRef,
  ReleaseProject,
  ReleaseStage,
  StageStatus,
} from "./types.js";
import { mkdir, writeFile } from "node:fs/promises";

export interface PrepareOptions {
  /** production-spec run dir (or its production-spec.json). */
  productionSpecRef: string;
  projectId?: string;
  debtSourceFile?: string;
  log?: (line: string) => void;
}

export interface PrepareResult {
  project: ReleaseProject;
  projectDir: string;
  requirementsCount: number;
  releaseBlockingUnresolved: number;
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
  const projectId = options.projectId ?? `${host}-${spec.runId}`;
  const projectDir = releaseProjectDir(host, projectId);
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
    template: await hashRef(spec.lineage.template.templateId, spec.lineage.template.dir, [
      "node_modules",
      ".next",
      "out",
    ]),
    content: await hashRef(spec.lineage.contentRun.contentRunId, spec.lineage.contentRun.dir),
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
  const requirements = mergeRequirements(previous, collected.requirements, []);

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
    const artifact =
      stage === "production" ? acceptedLineage.production.spec : acceptedLineage[stage];
    stageStatus[stage] = {
      status: "fresh",
      artifact,
      inputsHash: computeStageInputsHash(stage, artifactHashes, emptyResolution, {}, intentHash),
      reasons: [],
      blockedBy: [],
    };
  }

  const warnings = [
    ...collected.warnings,
    ...debt.warnings,
    "workspace-versioning: the pipeline source tree is a single foundation commit with extensive " +
      "uncommitted work — releases currently depend on this working tree (operational risk, Task 25 report §29)",
  ];

  const project: ReleaseProject = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    schemaName: RELEASE_PROJECT_SCHEMA_NAME,
    projectId,
    createdAt: new Date().toISOString(),
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
    resolutions: [],
    releaseState: "DISCOVERED",
    failure: null,
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
    runs: [],
  };
  // releaseState is artifact-derived — compute it now.
  project.releaseState = deriveReleaseState({
    stageStatus,
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
    resolutionHash: null,
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
  };
}
