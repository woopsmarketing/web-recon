/**
 * release:plan (spec §14, §20) — the operator's one-screen view:
 * READY / NEEDS INPUT / STALE / BLOCKED / NEXT ACTIONS + per-route readiness.
 * Understandable without reading any log.
 */
import path from "node:path";

import { collectRequirements, type RouteReadiness } from "./collect.js";
import { applyBlocking, refreshStageStatuses } from "./freshness.js";
import { effectiveResolution, releaseBlockers } from "./requirements.js";
import { loadReleaseProject, loadRequirementsFile } from "./store.js";
import { STAGE_ORDER } from "./graph.js";
import { productionBuildDir } from "../production/index.js";
import { FROZEN_STAGES, type ReleaseProject, type ReleaseStage, type Requirement } from "./types.js";

export interface PlanView {
  project: ReleaseProject;
  requirements: Requirement[];
  ready: ReleaseStage[];
  stale: ReleaseStage[];
  blocked: Array<{ stage: ReleaseStage; blockedBy: string[] }>;
  needsInput: Requirement[];
  nextActions: string[];
  routeReadiness: RouteReadiness[];
  /** Operator-facing integrity warnings from the freshness refresh. */
  warnings: string[];
  text: string;
}

export async function planRelease(
  projectDirOrFile: string,
  options: { log?: (line: string) => void } = {},
): Promise<PlanView> {
  const { project, projectDir } = await loadReleaseProject(projectDirOrFile);
  const requirementsFile = await loadRequirementsFile(projectDir);
  const requirements = requirementsFile.requirements;
  const effective = effectiveResolution(project.resolutions);
  const targetMode = effective.productionBaseUrl === undefined ? "preview" : "indexable-production";
  const refreshed = await refreshStageStatuses(project, effective, { log: options.log });
  const blockers = releaseBlockers(requirements);
  applyBlocking(refreshed.stageStatus, blockers, targetMode);

  const production = refreshed.stageStatus.production?.artifact ?? null;
  const collected = await collectRequirements({
    host: project.source.host,
    templateRunDir: refreshed.stageStatus.template.artifact!.path,
    contentRunDir: refreshed.stageStatus.content.artifact!.path,
    themeRunDir: refreshed.stageStatus.theme.artifact!.path,
    seoPlanRunDir: refreshed.stageStatus.seo.artifact!.path,
    materializationRunDir: refreshed.stageStatus.assets.artifact!.path,
    productionSpecFile: production ? path.join(production.path, "production-spec.json") : null,
    productionBuildDir: production ? productionBuildDir(project.source.host, production.id) : null,
  });

  const ready: ReleaseStage[] = [];
  const stale: ReleaseStage[] = [];
  const blocked: PlanView["blocked"] = [];
  for (const stage of STAGE_ORDER) {
    const status = refreshed.stageStatus[stage];
    if (status.status === "fresh") ready.push(stage);
    else if (status.status === "blocked") blocked.push({ stage, blockedBy: status.blockedBy });
    else stale.push(stage);
  }
  // A stale FROZEN stage is NOT a pending rerun: release:build files it as
  // BLOCKED BY frozen-stage-input-drift and refuses the build (build.ts). The
  // stage SET was always the same on both surfaces — only plan's WORDS ("will
  // re-run on release:build") told the operator the opposite of what build
  // does, so the split below is rendering + next-actions only and `stale`
  // (the field the plan↔build agreement invariant compares) is untouched.
  const staleFrozen = stale.filter((stage) => (FROZEN_STAGES as readonly string[]).includes(stage));
  const staleRerun = stale.filter((stage) => !(FROZEN_STAGES as readonly string[]).includes(stage));
  const needsInput = requirements.filter((requirement) => requirement.status === "unresolved");

  const nextActions: string[] = [];
  const actionOrder: Record<string, number> = {
    "production-domain": 0,
    "font-license": 1,
    "organization-logo": 2,
    "og-image": 3,
    "content-route": 4,
    "replacement-image": 5,
    "brand-leak": 6,
    "source-brand-asset": 7,
  };
  const blocking = needsInput
    .filter((requirement) => requirement.severity === "release-blocking")
    .sort((a, b) => (actionOrder[a.kind] ?? 9) - (actionOrder[b.kind] ?? 9));
  for (const requirement of blocking.slice(0, 10)) {
    nextActions.push(`resolve ${requirement.requirementId} — ${requirement.resolutionOptions[0] ?? ""}`);
  }
  if (blocking.length > 10) {
    nextActions.push(`… and ${blocking.length - 10} more release-blocking requirement(s) (operator-checklist.md)`);
  }
  if (staleFrozen.length > 0) {
    // build.ts refuses the WHOLE build while a frozen input has drifted, so
    // offering "pnpm release:build" here would send the operator into a
    // guaranteed refusal.
    nextActions.push(
      `release:build REFUSES — frozen stage input drift (${staleFrozen.join(", ")}); ` +
        "restore the frozen artifact, or re-run the recon/template phase and release:prepare again",
    );
  } else if (staleRerun.length > 0) {
    nextActions.push(`pnpm release:build ${projectDir}   (reruns: ${staleRerun.join(", ")})`);
  }
  if (nextActions.length === 0 && project.releaseState === "PRODUCTION_READY") {
    nextActions.push("nothing — PRODUCTION_READY (deploy the package when you choose)");
  }

  // ---- render ---------------------------------------------------------------
  const lines: string[] = [];
  const label = (requirement: Requirement): string => {
    const detail =
      requirement.route ?? requirement.slotKey ?? requirement.assetId ?? requirement.fontId ?? requirement.factKey;
    return `${requirement.requirementId}${detail !== undefined && !requirement.requirementId.includes(detail) ? ` (${detail})` : ""}`;
  };
  lines.push("PROJECT");
  lines.push(`  ${project.projectId}  —  ${project.source.host}`);
  lines.push(`  state: ${project.releaseState}   target: ${targetMode}`);
  lines.push("");
  lines.push("READY (fresh)");
  for (const stage of ready) lines.push(`  ${stage}`);
  if (ready.length === 0) lines.push("  (none)");
  lines.push("");
  const staleReason = (stage: ReleaseStage): string =>
    refreshed.stageStatus[stage].reasons.join("; ") || "inputs changed";
  if (staleRerun.length > 0) {
    lines.push(
      staleFrozen.length > 0
        ? "STALE (blocked — release:build refuses while a frozen input has drifted)"
        : "STALE (will re-run on release:build)",
    );
    for (const stage of staleRerun) lines.push(`  ${stage} — ${staleReason(stage)}`);
    lines.push("");
  }
  if (staleFrozen.length > 0) {
    // Same wording build.ts uses when it refuses, so the two screens cannot
    // describe one state in opposite terms.
    lines.push("BLOCKED BY frozen-stage-input-drift (release:build REFUSES — frozen roots are never re-run)");
    for (const stage of staleFrozen) lines.push(`  ${stage} — ${staleReason(stage)}`);
    lines.push("");
  }
  if (blocked.length > 0) {
    lines.push("BLOCKED");
    for (const entry of blocked) lines.push(`  ${entry.stage} — by ${entry.blockedBy.join(", ")}`);
    lines.push("");
  }
  if (refreshed.warnings.length > 0) {
    // Integrity warnings (artifact drift, missing resolution assets, recorded
    // hash-exclusion sets that predate a fix) are operator ACTIONS, so they
    // belong on the one screen rather than only in a build log.
    lines.push("WARNINGS");
    for (const warning of refreshed.warnings) lines.push(`  ${warning}`);
    lines.push("");
  }
  lines.push("NEEDS INPUT");
  const bySeverity = (severity: Requirement["severity"]): Requirement[] =>
    needsInput.filter((requirement) => requirement.severity === severity);
  for (const [severity, title] of [
    ["release-blocking", "release-blocking"],
    ["high-value", "high-value"],
    ["optional", "optional"],
  ] as const) {
    const list = bySeverity(severity);
    if (list.length === 0) continue;
    lines.push(`  [${title}] ${list.length}`);
    for (const requirement of list.slice(0, 12)) lines.push(`    ${label(requirement)}`);
    if (list.length > 12) lines.push(`    … and ${list.length - 12} more (see operator-checklist.md)`);
  }
  if (needsInput.length === 0) lines.push("  (none — every requirement resolved)");
  lines.push("");
  lines.push("ROUTES");
  const width = Math.max(...collected.routeReadiness.map((row) => row.route.length), 6);
  for (const row of collected.routeReadiness) {
    lines.push(
      `  ${row.route.padEnd(width)}  ${row.state.padEnd(13)} content:${row.content}` +
        `  seo-needs-input:${row.seoNeedsInput}` +
        (row.assetsResidual !== null ? `  residual-assets:${row.assetsResidual}` : ""),
    );
  }
  lines.push("");
  lines.push("NEXT ACTIONS");
  nextActions.forEach((action, index) => lines.push(`  ${index + 1}. ${action}`));
  if (nextActions.length === 0) lines.push("  (none)");

  return {
    project,
    requirements,
    ready,
    stale,
    blocked,
    needsInput,
    nextActions,
    routeReadiness: collected.routeReadiness,
    warnings: refreshed.warnings,
    text: lines.join("\n"),
  };
}
