import type { SlotValue } from "../recon-template/types.js";
import {
  CONTENT_SCHEMA_VERSION,
  type BrandLeakReport,
  type ContentGenerationResult,
  type ContentIntent,
  type ContentRunManifest,
  type ContentUnitsFile,
  type LayoutQaReport,
  type ValidationReport,
} from "./types.js";

/**
 * Operator review report (Task 19 §28).
 *
 * The MVP is operator-assisted: before anything ships, a human reads ONE
 * document that answers "what did the generator do, what does it want from
 * me, and what is still risky?". Markdown + JSON — no UI.
 */

export interface OperatorReviewInput {
  manifest: ContentRunManifest;
  intent: ContentIntent;
  unitsFile: ContentUnitsFile;
  result?: ContentGenerationResult;
  validation: ValidationReport;
  brandLeak: BrandLeakReport;
  layoutQa?: LayoutQaReport;
  changedKeys: Set<string>;
  overlay: Record<string, SlotValue>;
}

export interface OperatorReviewJson {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  runId: string;
  templateId: string;
  intentHash: string;
  scopedRoutes: string[];
  siteSummary?: {
    workingName: string;
    category: string;
    audience: string;
    positioning: string;
    primaryConversion: string;
    tone: string[];
  };
  pagePlans?: unknown[];
  counts: {
    units: number;
    assignedSlots: number;
    changedSlots: number;
    unresolved: number;
    reviewSlotsUntouched: number;
    imageBriefs: number;
    brandLeakWarnings: number;
    validationErrors: number;
    validationWarnings: number;
  };
  unresolved: { slotKey: string; reason: string }[];
  reviewSlotsUntouched: string[];
  brandLeakWarnings: unknown[];
  layoutQa?: {
    pass: boolean;
    pages: number;
    failingPages: string[];
    repairCandidates: number;
    screenshots: string[];
  };
  imageBriefs: unknown[];
}

export function buildOperatorReview(input: OperatorReviewInput): {
  json: OperatorReviewJson;
  markdown: string;
} {
  const { manifest, result, validation, brandLeak, layoutQa, unitsFile } = input;
  const unresolved = result?.unresolved ?? [];
  const imageBriefs = result?.imageBriefs ?? [];

  const json: OperatorReviewJson = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    runId: manifest.runId,
    templateId: manifest.templateId,
    intentHash: manifest.intentHash,
    scopedRoutes: manifest.scopedRoutes,
    ...(result
      ? {
          siteSummary: {
            workingName: result.sitePlan.siteIdentity.workingName,
            category: result.sitePlan.siteIdentity.category,
            audience: result.sitePlan.siteIdentity.audience,
            positioning: result.sitePlan.siteIdentity.positioning,
            primaryConversion: result.sitePlan.primaryConversion,
            tone: result.sitePlan.tone,
          },
          pagePlans: result.sitePlan.pagePlans,
        }
      : {}),
    counts: {
      units: unitsFile.units.length,
      assignedSlots: validation.stats.assignedSlots,
      changedSlots: input.changedKeys.size,
      unresolved: unresolved.length,
      reviewSlotsUntouched: unitsFile.reviewSlotKeys.length,
      imageBriefs: imageBriefs.length,
      brandLeakWarnings: brandLeak.warnings.length,
      validationErrors: validation.errors.length,
      validationWarnings: validation.warnings.length,
    },
    unresolved,
    reviewSlotsUntouched: unitsFile.reviewSlotKeys,
    brandLeakWarnings: brandLeak.warnings,
    ...(layoutQa
      ? {
          layoutQa: {
            pass: layoutQa.pass,
            pages: layoutQa.pages.length,
            failingPages: layoutQa.pages.filter((p) => !p.pass).map((p) => `${p.route}@${p.width}`),
            repairCandidates: layoutQa.repairCandidates.length,
            screenshots: layoutQa.screenshots,
          },
        }
      : {}),
    imageBriefs,
  };

  const lines: string[] = [];
  const push = (s = ""): void => {
    lines.push(s);
  };
  push(`# Content Run Operator Review — ${manifest.runId}`);
  push();
  push(`- template: \`${manifest.templateId}\``);
  push(`- policy: ${manifest.policyId} v${manifest.policyVersion}`);
  push(`- scope: ${manifest.scopedRoutes.join(", ")} (review opt-in: ${manifest.includeReview})`);
  push(`- intent hash: \`${manifest.intentHash.slice(0, 16)}…\``);
  push(`- generator: ${manifest.generator ? `${manifest.generator.name}${manifest.generator.model ? ` (${manifest.generator.model})` : ""}` : "—"}`);
  push(`- manual edits: ${manifest.manualEdits}`);
  push();
  push(`## Intent (verbatim)`);
  push();
  push("```");
  push(input.intent.rawIntent);
  push("```");
  if (json.siteSummary) {
    push();
    push(`## Site summary`);
    push();
    push(`- working name: **${json.siteSummary.workingName}**`);
    push(`- category: ${json.siteSummary.category}`);
    push(`- audience: ${json.siteSummary.audience}`);
    push(`- positioning: ${json.siteSummary.positioning}`);
    push(`- primary conversion: ${json.siteSummary.primaryConversion}`);
    push(`- tone: ${json.siteSummary.tone.join(", ")}`);
  }
  if (result && result.sitePlan.pagePlans.length > 0) {
    push();
    push(`## Page plans`);
    push();
    for (const plan of result.sitePlan.pagePlans) {
      push(`### ${plan.route}`);
      push(`- current: ${plan.currentPurpose}`);
      push(`- new: ${plan.newPurpose}`);
      push(`- primary message: ${plan.primaryMessage}`);
      push(`- conversion: ${plan.conversionGoal}`);
    }
  }
  push();
  push(`## Numbers`);
  push();
  push(`| axis | value |`);
  push(`| --- | --- |`);
  push(`| content units | ${json.counts.units} |`);
  push(`| assigned slots | ${json.counts.assignedSlots} |`);
  push(`| changed slots (vs default) | ${json.counts.changedSlots} |`);
  push(`| unresolved (needs-input) | ${json.counts.unresolved} |`);
  push(`| review slots untouched | ${json.counts.reviewSlotsUntouched} |`);
  push(`| image briefs | ${json.counts.imageBriefs} |`);
  push(`| brand-leak warnings | ${json.counts.brandLeakWarnings} |`);
  push(`| validation | ${validation.pass ? "PASS" : "FAIL"} (${json.counts.validationErrors} errors / ${json.counts.validationWarnings} warnings) |`);
  if (json.layoutQa) {
    push(`| layout QA | ${json.layoutQa.pass ? "PASS" : "FAIL"} (${json.layoutQa.pages} pages, ${json.layoutQa.repairCandidates} repair candidates) |`);
  }
  if (unresolved.length > 0) {
    push();
    push(`## Needs input (${unresolved.length})`);
    push();
    for (const item of unresolved) push(`- \`${item.slotKey}\` — ${item.reason}`);
  }
  if (brandLeak.warnings.length > 0) {
    push();
    push(`## Source-brand-leak warnings (${brandLeak.warnings.length})`);
    push();
    // 19.1 §13: engine-blocked visible content outranks ordinary warnings.
    const blockers = brandLeak.warnings.filter((w) => w.severity === "blocker");
    if (blockers.length > 0) {
      push(`**BLOCKERS (${blockers.length})** — user-targeted visible content kept at the source default by an engine limitation:`);
      for (const w of blockers) push(`- \`${w.slotKey}\` [${w.kind}] ${w.detail}`);
      push();
    }
    const ordinary = brandLeak.warnings.filter((w) => w.severity !== "blocker");
    const shown = ordinary.slice(0, 40);
    for (const w of shown) push(`- \`${w.slotKey}\` [${w.kind}] ${w.detail}`);
    if (ordinary.length > shown.length) {
      push(`- … ${ordinary.length - shown.length} more in report/brand-leak.json`);
    }
  }
  if (imageBriefs.length > 0) {
    push();
    push(`## Image replacement briefs (${imageBriefs.length})`);
    push();
    for (const brief of imageBriefs) {
      push(
        `- \`${brief.slotKey}\` — ${brief.action}${brief.brief ? `: ${brief.brief.subject} (${brief.brief.purpose})` : ""}${brief.warning ? ` ⚠ ${brief.warning}` : ""}`,
      );
    }
  }
  if (json.layoutQa && json.layoutQa.failingPages.length > 0) {
    push();
    push(`## Layout QA failing pages`);
    push();
    for (const p of json.layoutQa.failingPages) push(`- ${p}`);
  }
  push();
  push(`## Where things are`);
  push();
  push(`- overlay: \`slot-values.json\` (edit by hand, then \`content:validate\` + \`content:qa\` — no LLM call needed)`);
  push(`- packet: \`content-units.json\`, \`generation-request.json\``);
  push(`- reports: \`report/validation.json\`, \`report/brand-leak.json\`${json.layoutQa ? ", `report/layout-qa.json`, `report/screenshots/`" : ""}`);
  push();

  return { json, markdown: lines.join("\n") };
}
