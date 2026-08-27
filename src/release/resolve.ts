/**
 * release:resolve (spec §16) — validate a production-resolution-v1 pack,
 * match it to requirements (spec §11), and invalidate exactly the stages the
 * dependency graph names (spec §12). Original artifacts are never mutated;
 * the pack is copied into a new release run for the audit trail.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { isSafeThemeValue, isThemeToken } from "../theme/index.js";
import { collectRequirements } from "./collect.js";
import { deriveReleaseState } from "./gate.js";
import { applyBlocking, refreshStageStatuses } from "./freshness.js";
import { invalidatedStages } from "./graph.js";
import { foldResolutionIntoAuthored, resolutionSlotValues } from "./instance.js";
import { renderOperatorChecklist } from "./checklist.js";
import {
  buildRequirementsFile,
  effectiveResolution,
  matchResolutionToRequirements,
  mergeRequirements,
  releaseBlockers,
  sha256OfJson,
} from "./requirements.js";
import {
  loadReleaseProject,
  loadRequirementsFile,
  newReleaseRunId,
  saveChecklist,
  saveReleaseProject,
  saveReleaseRun,
  saveRequirementsFile,
} from "./store.js";
import { ProductionResolutionSchema } from "./types.js";
import type { ReleaseStage, ReleaseProject, ReleaseRun } from "./types.js";
import { productionBuildDir } from "../production/index.js";

export interface ResolveOptions {
  resolutionFile: string;
  log?: (line: string) => void;
}

export interface ResolveResult {
  project: ReleaseProject;
  resolutionId: string;
  matched: Array<{ requirementId: string; field: string }>;
  unmatchedFields: string[];
  invalidated: ReleaseStage[];
}

export async function resolveRelease(
  projectDirOrFile: string,
  options: ResolveOptions,
): Promise<ResolveResult> {
  const log = options.log ?? ((): void => {});
  const { project, projectDir } = await loadReleaseProject(projectDirOrFile);
  const requirementsFile = await loadRequirementsFile(projectDir);

  // ---- 1. validate the pack (hard gate — spec §10: whatever produced the
  //         JSON, it must pass the production-resolution-v1 validator) -------
  const raw = JSON.parse(await readFile(options.resolutionFile, "utf8"));
  const parsed = ProductionResolutionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `resolution failed production-resolution-v1 validation:\n` +
        parsed.error.issues
          .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("\n"),
    );
  }
  const resolution = parsed.data;

  // ---- 2. slot/route sanity against the template (fail early, kindly) ------
  const templatePath = project.stageStatus.template?.artifact?.path;
  if (templatePath !== undefined) {
    const slots = JSON.parse(
      await readFile(path.join(templatePath, "slots.json"), "utf8"),
    ) as { slots: Array<{ key: string }> };
    const slotKeys = new Set(slots.slots.map((slot) => slot.key));
    const templateManifest = JSON.parse(
      await readFile(path.join(templatePath, "manifest.json"), "utf8"),
    ) as { routes: string[] };
    const routes = new Set(templateManifest.routes);
    const badSlots = [
      ...Object.keys(resolution.urls ?? {}),
      ...Object.values(resolution.routeContent ?? {}).flatMap((content) =>
        Object.keys(content.slotValues ?? {}),
      ),
    ].filter((slotKey) => !slotKeys.has(slotKey));
    if (badSlots.length > 0) {
      throw new Error(`resolution references unknown slot keys: ${badSlots.join(", ")}`);
    }
    const badRoutes = Object.keys(resolution.routeContent ?? {}).filter(
      (route) => route !== "global" && !routes.has(route),
    );
    if (badRoutes.length > 0) {
      throw new Error(`resolution references unknown template routes: ${badRoutes.join(", ")}`);
    }
  }

  // ---- 2b. theme authoring stays INSIDE the Theme Contract -----------------
  // The Task 20 token vocabulary is CLOSED and carries paint only, so a layout
  // value has no token to land in; `isSafeThemeValue` additionally refuses any
  // value that could escape a declaration or reference an asset.
  const themeTokens = resolution.theme?.tokens ?? {};
  const badTokens = Object.keys(themeTokens).filter((token) => !isThemeToken(token));
  if (badTokens.length > 0) {
    throw new Error(
      `resolution theme references tokens outside theme-contract-v1: ${badTokens.join(", ")} ` +
        "— a theme is a paint skin, never layout",
    );
  }
  const unsafeTokens = Object.entries(themeTokens)
    .filter(([, value]) => !isSafeThemeValue(value))
    .map(([token]) => token);
  if (unsafeTokens.length > 0) {
    throw new Error(`resolution theme carries unsafe paint values for: ${unsafeTokens.join(", ")}`);
  }
  if (resolution.theme?.themeSourceFile !== undefined && !existsSync(resolution.theme.themeSourceFile)) {
    throw new Error(`resolution theme.themeSourceFile not found: ${resolution.theme.themeSourceFile}`);
  }

  // ---- 3. match to requirements + record ------------------------------------
  const { matches, acknowledgements, unmatchedFields } = matchResolutionToRequirements(
    requirementsFile.requirements,
    resolution,
  );
  const resolutionId = `res-${newReleaseRunId()}`;
  const runId = newReleaseRunId();
  const runDirRel = path.join(projectDir, "runs", runId);
  await mkdir(runDirRel, { recursive: true });
  const storedPackFile = path.join(runDirRel, "resolution.json");
  await copyFile(options.resolutionFile, storedPackFile);

  const appliedAt = new Date().toISOString();
  project.resolutions.push({
    resolutionId,
    appliedAt,
    file: storedPackFile,
    resolutionHash: sha256OfJson(resolution),
    resolution,
    matched: [...matches, ...acknowledgements],
    unmatchedFields,
  });

  // ---- 3b. fold authored values into the AUTHORITATIVE block ---------------
  // `authored` is the one source for slot values and theme; the pack above
  // stays as the immutable audit record of HOW each value arrived. Nothing is
  // read back out of the pack as an independent truth.
  project.authored = foldResolutionIntoAuthored(project.authored, resolution, appliedAt);

  // ---- 4. requirement statuses + stage invalidation -------------------------
  // No re-collection here (artifacts are unchanged) — the current requirement
  // list IS the gap set; matching flips newly-resolved statuses.
  const requirements = mergeRequirements(null, requirementsFile.requirements, project.resolutions);
  const invalidated = invalidatedStages(resolution);
  const effective = effectiveResolution(project.resolutions);
  const targetMode = effective.productionBaseUrl === undefined ? "preview" : "indexable-production";
  const refreshed = await refreshStageStatuses(project, effective, { log });
  const blockers = releaseBlockers(requirements);
  applyBlocking(refreshed.stageStatus, blockers, targetMode);
  project.stageStatus = refreshed.stageStatus;
  project.target = { mode: targetMode, productionBaseUrl: effective.productionBaseUrl ?? null };

  const warnings = [...refreshed.warnings];
  if (unmatchedFields.length > 0) {
    // Authoring is not only gap-filling, so an authored slot value that binds
    // to no open requirement is normal and can arrive in bulk — the list is
    // capped so one large pack cannot bury the rest of the operator screen.
    // `matched` / `unmatchedFields` on the recorded pack stay complete.
    const shown = unmatchedFields.slice(0, 12).join(", ");
    const more = unmatchedFields.length > 12 ? `, … and ${unmatchedFields.length - 12} more` : "";
    warnings.push(
      `resolution ${resolutionId}: ${unmatchedFields.length} field(s) matched no open requirement ` +
        `(recorded, still applied where consumable): ${shown}${more}`,
    );
    log(`[release:resolve] WARNING — unmatched fields: ${shown}${more}`);
  }
  const authoredSlotCount = Object.keys(resolutionSlotValues(resolution)).length;
  if (authoredSlotCount > 0) {
    warnings.push(
      `content write doctrine: ${authoredSlotCount} slot value(s) folded into the AUTHORITATIVE ` +
        `authored.slotValues (project total ${Object.keys(project.authored.slotValues).length}). ` +
        "content-runs/<run>/slot-values.json is a DERIVED, MATERIALIZED output — editing a " +
        "historical content run's slot-values.json in place is NON-AUTHORITATIVE and will be " +
        "replaced by the next release:build",
    );
  }
  if (Object.keys(resolution.theme?.tokens ?? {}).length > 0) {
    log(
      `[release:resolve] theme: ${Object.keys(resolution.theme!.tokens!).length} contract token(s) ` +
        "authored → theme + production stale (template/content/reconstruction untouched)",
    );
  }

  // Route readiness + facts for the state derivation (read-only collect).
  const production = project.stageStatus.production?.artifact ?? null;
  const collected = await collectRequirements({
    host: project.source.host,
    templateRunDir: project.stageStatus.template.artifact!.path,
    contentRunDir: project.stageStatus.content.artifact!.path,
    themeRunDir: project.stageStatus.theme.artifact!.path,
    seoPlanRunDir: project.stageStatus.seo.artifact!.path,
    materializationRunDir: project.stageStatus.assets.artifact!.path,
    productionSpecFile: production ? path.join(production.path, "production-spec.json") : null,
    productionBuildDir: production ? productionBuildDir(project.source.host, production.id) : null,
  });
  project.releaseState = deriveReleaseState({
    stageStatus: project.stageStatus,
    requirements,
    facts: collected.facts,
  });
  project.updatedAt = new Date().toISOString();
  project.runs.push({ runId, kind: "resolve" });

  const run: ReleaseRun = {
    schemaVersion: 1,
    schemaName: "release-run-v1",
    runId,
    kind: "resolve",
    projectId: project.projectId,
    createdAt: new Date().toISOString(),
    intentHash: project.intent.intentHash,
    resolutionHash: sha256OfJson(effective),
    inputArtifactHashes: Object.fromEntries(
      Object.entries(project.stageStatus)
        .filter(([, status]) => status.artifact !== null)
        .map(([stage, status]) => [stage, status.artifact!.hash]),
    ),
    reusedStages: [],
    rerunStages: [],
    blockedStages: [],
    operatorOverrides: [
      ...Object.keys(resolution.fontDecisions ?? {}).map((family) => `fontDecision:${family}`),
      ...(resolution.acknowledgements ?? []).map((ack) => `acknowledgement:${ack.requirementId}`),
    ],
    warnings,
    blockers: blockers.map((requirement) => requirement.requirementId),
    finalVerdict: project.releaseState,
    stageExecutions: [],
    failure: project.failure,
  };

  await saveRequirementsFile(projectDir, buildRequirementsFile(project.projectId, requirements));
  await saveChecklist(
    projectDir,
    renderOperatorChecklist(project, requirements, collected.routeReadiness, warnings),
  );
  await saveReleaseProject(projectDir, project);
  await saveReleaseRun(projectDir, run);

  log(
    `[release:resolve] ${resolutionId}: ${matches.length + acknowledgements.length} requirement(s) matched, ` +
      `${invalidated.length} stage(s) invalidated (${invalidated.join(", ") || "none"})`,
  );
  return {
    project,
    resolutionId,
    matched: [...matches, ...acknowledgements],
    unmatchedFields,
    invalidated,
  };
}
