/**
 * Operator checklist generation (spec §21) — human-readable Markdown with
 * Why / How to resolve / Used on / Expected per item, grouped by priority.
 */
import type { RouteReadiness } from "./collect.js";
import type { ReleaseProject, Requirement } from "./types.js";

function requirementSection(requirement: Requirement): string[] {
  const lines: string[] = [];
  const title =
    requirement.route ??
    requirement.slotKey ??
    requirement.assetId ??
    requirement.fontId ??
    requirement.factKey ??
    requirement.kind;
  lines.push(`### ${requirement.requirementId}${title !== requirement.requirementId ? ` — ${title}` : ""}`);
  lines.push("");
  lines.push(`- **Status**: ${requirement.status}${requirement.statusNote ? ` (${requirement.statusNote})` : ""}`);
  if (requirement.resolvedBy) {
    lines.push(`- **Resolved by**: ${requirement.resolvedBy.resolutionId} → \`${requirement.resolvedBy.field}\``);
  }
  lines.push(`- **Why**: ${requirement.message}`);
  lines.push(`- **How to resolve**: ${requirement.resolutionOptions.join(" · ") || "(no automated seam)"}`);
  const usedOn = [requirement.route, requirement.slotKey].filter((value) => value !== undefined);
  if (usedOn.length > 0) lines.push(`- **Used on**: ${usedOn.join(", ")}`);
  if (requirement.kind === "replacement-image") {
    lines.push(`- **Expected**: a brand-appropriate replacement image file (png/jpg/webp/svg/ico)`);
  } else if (requirement.kind === "og-image") {
    lines.push(`- **Expected**: a production social-sharing image (typically 1200×630)`);
  } else if (requirement.kind === "font-license") {
    lines.push(`- **Expected**: a license decision — accept the measured fallback stack, or verify self-hosting rights`);
  } else if (requirement.kind === "content-route") {
    lines.push(`- **Expected**: injected content for the route (slot values; optional page plan)`);
  } else if (requirement.kind === "production-domain") {
    lines.push(`- **Expected**: the real production domain (e.g. https://example.com)`);
  }
  lines.push(
    `- **Evidence**: ${requirement.evidence
      .slice(0, 3)
      .map((evidence) => `\`${evidence.file}\`${evidence.pointer ? ` @ ${evidence.pointer}` : ""}`)
      .join(" · ")}${requirement.evidence.length > 3 ? ` · +${requirement.evidence.length - 3} more` : ""}`,
  );
  lines.push("");
  return lines;
}

export function renderOperatorChecklist(
  project: ReleaseProject,
  requirements: Requirement[],
  routeReadiness: RouteReadiness[],
  warnings: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Release Checklist — ${project.projectId}`);
  lines.push("");
  lines.push(`- Source: ${project.source.host}`);
  lines.push(`- State: **${project.releaseState}**`);
  lines.push(`- Target: ${project.target.mode}`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");

  const unresolved = requirements.filter((requirement) => requirement.status === "unresolved");
  const resolved = requirements.filter((requirement) => requirement.status === "resolved");
  const acknowledged = requirements.filter((requirement) => requirement.status === "accepted-limitation");

  lines.push("## Ready");
  lines.push("");
  const freshStages = Object.entries(project.stageStatus)
    .filter(([, status]) => status.status === "fresh")
    .map(([stage]) => stage);
  lines.push(
    freshStages.length > 0
      ? freshStages.map((stage) => `- ${stage}`).join("\n")
      : "- (no stage is fresh)",
  );
  if (resolved.length > 0) {
    lines.push("");
    lines.push(`${resolved.length} requirement(s) already resolved:`);
    for (const requirement of resolved) {
      lines.push(
        `- ~~${requirement.requirementId}~~${requirement.resolvedBy ? ` (via \`${requirement.resolvedBy.field}\`)` : ""}`,
      );
    }
  }
  lines.push("");

  lines.push("## Need your input");
  lines.push("");
  for (const severity of ["release-blocking", "high-value", "optional"] as const) {
    const group = unresolved.filter((requirement) => requirement.severity === severity);
    if (group.length === 0) continue;
    lines.push(`## ${severity === "release-blocking" ? "Release-blocking" : severity === "high-value" ? "High-value" : "Optional"} (${group.length})`);
    lines.push("");
    // Large uniform groups (e.g. hundreds of replacement images) collapse to a
    // summary + the first few concrete items, so the checklist stays readable.
    const byKind = new Map<string, Requirement[]>();
    for (const requirement of group) {
      const list = byKind.get(requirement.kind) ?? [];
      list.push(requirement);
      byKind.set(requirement.kind, list);
    }
    for (const [kind, list] of byKind) {
      if (list.length > 8) {
        lines.push(`### ${kind} × ${list.length}`);
        lines.push("");
        lines.push(`- **Why**: ${list[0].message}`);
        lines.push(`- **How to resolve**: ${list[0].resolutionOptions.join(" · ")}`);
        lines.push(
          `- **Items**: ${list
            .slice(0, 8)
            .map((requirement) => requirement.requirementId)
            .join(", ")}, … (+${list.length - 8} more — see requirements.json)`,
        );
        lines.push("");
      } else {
        for (const requirement of list) lines.push(...requirementSection(requirement));
      }
    }
  }
  if (unresolved.length === 0) {
    lines.push("Nothing — every requirement is resolved.");
    lines.push("");
  }

  if (acknowledged.length > 0) {
    lines.push("## Accepted limitations");
    lines.push("");
    for (const requirement of acknowledged) {
      lines.push(
        `- ${requirement.requirementId} — acknowledged${requirement.resolvedBy ? ` (${requirement.resolvedBy.resolutionId})` : ""}. ` +
          "NOTE: an acknowledgement does not unlock indexable production for release-blocking items.",
      );
    }
    lines.push("");
  }

  lines.push("## Route readiness");
  lines.push("");
  lines.push("| route | state | content | seo needs-input | residual assets |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of routeReadiness) {
    lines.push(
      `| ${row.route} | ${row.state} | ${row.content} | ${row.seoNeedsInput} | ${row.assetsResidual ?? "n/a"} |`,
    );
  }
  lines.push("");

  lines.push("## Technical warnings");
  lines.push("");
  for (const warning of warnings) lines.push(`- ${warning}`);
  if (project.technicalDebt.length > 0) {
    lines.push("");
    lines.push("Known post-MVP defects affecting this project (preserved, not fixed here):");
    for (const debt of project.technicalDebt) {
      lines.push(
        `- ${debt.id}: ${debt.description}` +
          (debt.affects.requirementKinds.length > 0
            ? ` _(colors: ${debt.affects.requirementKinds.join(", ")})_`
            : ""),
      );
    }
  }
  if (project.limitations.length > 0) {
    lines.push("");
    lines.push("Known limitations:");
    for (const limitation of project.limitations) lines.push(`- ${limitation}`);
  }
  lines.push("");
  return lines.join("\n");
}
