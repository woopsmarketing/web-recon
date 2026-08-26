/**
 * Post-MVP technical-debt register (spec §30).
 *
 * The canonical GED entries live in Task 24's aggregation artifact
 * (docs/result/handoffs/24-aggregation-phase1.json .genericDefects). The
 * release layer PRESERVES them — read at prepare time, never re-detected,
 * never fixed here — and maps each to the requirement kinds / stages whose
 * blockers and warnings it colors, so the orchestrator can surface them.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import type { ReleaseStage, RequirementKind, TechnicalDebtEntry } from "./types.js";

export const DEFAULT_DEBT_SOURCE = "docs/result/handoffs/24-aggregation-phase1.json";

/** Which release surfaces each canonical defect colors (by id prefix). */
const AFFECTS: Record<string, { requirementKinds: RequirementKind[]; stages: ReleaseStage[] }> = {
  "GED-D": { requirementKinds: ["content-route"], stages: ["content"] },
  "GED-E": { requirementKinds: [], stages: ["seo"] },
  "GED-F": { requirementKinds: ["content-route", "source-brand-asset"], stages: ["content", "production"] },
  "GED-G": { requirementKinds: ["replacement-image"], stages: ["assets", "production"] },
};

export async function loadTechnicalDebtRegister(
  sourceFile: string = DEFAULT_DEBT_SOURCE,
): Promise<{ entries: TechnicalDebtEntry[]; warnings: string[] }> {
  if (!existsSync(sourceFile)) {
    return {
      entries: [],
      warnings: [`technical-debt source not found: ${sourceFile} — register empty (nothing invented)`],
    };
  }
  const raw = JSON.parse(await readFile(sourceFile, "utf8")) as {
    genericDefects?: Array<{
      id: string;
      description: string;
      severity?: string;
      decision?: string;
    }>;
  };
  const entries: TechnicalDebtEntry[] = [];
  for (const defect of raw.genericDefects ?? []) {
    if (defect.decision !== "post-mvp") continue;
    const prefix = defect.id.match(/^(GED-[A-Z])/)?.[1] ?? defect.id;
    const affects = AFFECTS[prefix] ?? { requirementKinds: [], stages: [] };
    entries.push({
      id: defect.id,
      description: defect.description,
      decision: defect.decision,
      ...(defect.severity !== undefined ? { severity: defect.severity } : {}),
      source: sourceFile,
      affects,
    });
  }
  return { entries, warnings: [] };
}

/** Debt entries whose surfaces intersect the given requirement kinds. */
export function debtAffecting(
  entries: TechnicalDebtEntry[],
  kinds: Iterable<RequirementKind>,
): TechnicalDebtEntry[] {
  const wanted = new Set(kinds);
  return entries.filter((entry) => entry.affects.requirementKinds.some((kind) => wanted.has(kind)));
}
