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
import type { ReleaseProject, ReleaseStage, Requirement } from "./types.js";

export interface PlanView {
  project: ReleaseProject;
  requirements: Requirement[];
  ready: ReleaseStage[];
  stale: ReleaseStage[];
  blocked: Array<{ stage: ReleaseStage; blockedBy: string[] }>;
  needsInput: Requirement[];
  nextActions: string[];
  routeReadiness: RouteReadiness[];
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
  const needsInput = requirements.filter((requirement) => requirement.status === "unresolved");

  const nextActions: string[] = [];
  const actionOrder: Record<string, number> = {
    "production-domain": 0,
    "font-license": 1,
    "organization-logo": 2,
    "og-image": 3,
    "content-route": 4,
    "replacement-image": 5,
    "source-brand-asset": 6,
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
  if (stale.length > 0) {
    nextActions.push(`pnpm release:build ${projectDir}   (reruns: ${stale.join(", ")})`);
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
  if (stale.length > 0) {
    lines.push("STALE (will re-run on release:build)");
    for (const stage of stale) {
      lines.push(`  ${stage} — ${refreshed.stageStatus[stage].reasons.join("; ") || "inputs changed"}`);
    }
    lines.push("");
  }
  if (blocked.length > 0) {
    lines.push("BLOCKED");
    for (const entry of blocked) lines.push(`  ${entry.stage} — by ${entry.blockedBy.join(", ")}`);
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
    text: lines.join("\n"),
  };
}
