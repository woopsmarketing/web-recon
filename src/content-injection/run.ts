import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectSourceBrandLeaks } from "./brand-leak.js";
import { loadReconTemplate, type LoadedReconTemplate } from "./load-template.js";
import { buildOverlayValues, changedKeys, effectiveSlotValues } from "./overlay.js";
import { buildOperatorReview } from "./report.js";
import { validateGenerationResult, validateSlotAssignments } from "./validate.js";
import type { SlotValue } from "../recon-template/types.js";
import {
  BRAND_LEAK_REPORT_FILE,
  CONTENT_POLICY_FILE,
  CONTENT_REPORT_DIR,
  CONTENT_RUN_MANIFEST_FILE,
  CONTENT_UNITS_FILE,
  ENGINE_LIMITATION_MARKER,
  ContentInputError,
  ContentPolicySchema,
  ContentIntentSchema,
  ContentRunManifestSchema,
  ContentUnitsFileSchema,
  ContentGenerationResultSchema,
  GENERATION_REQUEST_FILE,
  GENERATION_RESULT_FILE,
  GenerationRequestSchema,
  INTENT_FILE,
  LAYOUT_QA_REPORT_FILE,
  OPERATOR_REVIEW_JSON_FILE,
  OPERATOR_REVIEW_MD_FILE,
  SLOT_VALUES_FILE,
  VALIDATION_REPORT_FILE,
  ContentValidationError,
  type ContentGenerationResult,
  type ContentIntent,
  type ContentPolicy,
  type ContentRunManifest,
  type ContentUnitsFile,
  type GenerationRequest,
  type LayoutQaReport,
  type ValidationReport,
} from "./types.js";

/**
 * Content run orchestration shared by the CLIs: load a prepared run, ingest a
 * generation result (from any provider or the manual seam), and revalidate
 * hand-edited slot values (§29 — the operator can edit `slot-values.json`
 * and re-run validate/preview/qa without any LLM call).
 */

export interface LoadedContentRun {
  runDir: string;
  manifest: ContentRunManifest;
  intent: ContentIntent;
  policy: ContentPolicy;
  unitsFile: ContentUnitsFile;
  request: GenerationRequest;
  template: LoadedReconTemplate;
  result?: ContentGenerationResult;
}

async function readJson(file: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new ContentInputError(`cannot read ${file}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
}

/** Accepts the run directory or its manifest.json path. */
export async function loadContentRun(runRef: string): Promise<LoadedContentRun> {
  const resolved = path.resolve(runRef);
  const runDir = resolved.endsWith(".json") ? path.dirname(resolved) : resolved;
  const manifest = ContentRunManifestSchema.parse(
    await readJson(path.join(runDir, CONTENT_RUN_MANIFEST_FILE)),
  );
  const intent = ContentIntentSchema.parse(await readJson(path.join(runDir, INTENT_FILE)));
  const policy = ContentPolicySchema.parse(await readJson(path.join(runDir, CONTENT_POLICY_FILE)));
  const unitsFile = ContentUnitsFileSchema.parse(
    await readJson(path.join(runDir, CONTENT_UNITS_FILE)),
  );
  const request = GenerationRequestSchema.parse(
    await readJson(path.join(runDir, GENERATION_REQUEST_FILE)),
  );
  const template = await loadReconTemplate(manifest.templateManifestFile);
  if (template.manifest.templateId !== manifest.templateId) {
    throw new ContentInputError(
      `content run references template ${manifest.templateId} but ${manifest.templateManifestFile} holds ${template.manifest.templateId}`,
    );
  }
  let result: ContentGenerationResult | undefined;
  try {
    result = ContentGenerationResultSchema.parse(
      await readJson(path.join(runDir, GENERATION_RESULT_FILE)),
    );
  } catch {
    result = undefined;
  }
  return { runDir, manifest, intent, policy, unitsFile, request, template, result };
}

async function writeRunJson(runDir: string, name: string, value: unknown): Promise<void> {
  await writeFile(path.join(runDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function updateManifest(
  run: LoadedContentRun,
  patch: (manifest: ContentRunManifest) => ContentRunManifest,
): Promise<void> {
  const next = ContentRunManifestSchema.parse(patch(run.manifest));
  run.manifest = next;
  await writeRunJson(run.runDir, CONTENT_RUN_MANIFEST_FILE, next);
}

export interface IngestOutcome {
  validation: ValidationReport;
  overlay: Record<string, SlotValue>;
  changed: Set<string>;
}

async function writeReviewArtifacts(
  run: LoadedContentRun,
  validation: ValidationReport,
  overlay: Record<string, SlotValue>,
  layoutQa?: LayoutQaReport,
): Promise<Set<string>> {
  const reportDir = path.join(run.runDir, CONTENT_REPORT_DIR);
  await mkdir(reportDir, { recursive: true });
  const changed = changedKeys(run.template, overlay);
  const effective = effectiveSlotValues(run.template, overlay);
  // §13 (Task 19.1): slots the user targeted that an ENGINE limitation kept at
  // the source default are blockers, not ordinary kept-default warnings.
  const engineBlockedKeys = new Set(
    (run.result?.unresolved ?? [])
      .filter((u) => u.reason.toLowerCase().includes(ENGINE_LIMITATION_MARKER))
      .map((u) => u.slotKey),
  );
  const brandLeak = detectSourceBrandLeaks(
    run.template,
    run.unitsFile,
    effective,
    changed,
    engineBlockedKeys,
  );
  const review = buildOperatorReview({
    manifest: run.manifest,
    intent: run.intent,
    unitsFile: run.unitsFile,
    result: run.result,
    validation,
    brandLeak,
    layoutQa,
    changedKeys: changed,
    overlay,
  });
  await writeRunJson(run.runDir, path.join(CONTENT_REPORT_DIR, VALIDATION_REPORT_FILE), validation);
  await writeRunJson(run.runDir, path.join(CONTENT_REPORT_DIR, BRAND_LEAK_REPORT_FILE), brandLeak);
  await writeRunJson(run.runDir, path.join(CONTENT_REPORT_DIR, OPERATOR_REVIEW_JSON_FILE), review.json);
  await writeFile(
    path.join(reportDir, OPERATOR_REVIEW_MD_FILE),
    review.markdown + "\n",
    "utf8",
  );
  await updateManifest(run, (m) => ({
    ...m,
    validation: {
      pass: validation.pass,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    },
    brandLeakWarnings: brandLeak.warnings.length,
    counts: {
      ...m.counts,
      generatedSlots: validation.stats.assignedSlots,
      unresolvedSlots: validation.stats.unresolvedSlots,
      imageBriefs: validation.stats.imageBriefs,
    },
  }));
  return changed;
}

/**
 * Ingest a generation result: validate deterministically, and only on PASS
 * write the overlay. The result file itself is always persisted so a failed
 * validation stays inspectable.
 */
export async function ingestGenerationResult(
  run: LoadedContentRun,
  result: ContentGenerationResult,
): Promise<IngestOutcome> {
  run.result = result;
  await writeRunJson(run.runDir, GENERATION_RESULT_FILE, result);
  await updateManifest(run, (m) => ({
    ...m,
    generator: { name: result.generator.name, ...(result.generator.model ? { model: result.generator.model } : {}) },
    manualEdits: false,
  }));
  const validation = validateGenerationResult(run.template, run.unitsFile, result);
  const overlay = buildOverlayValues(result);
  if (validation.pass) {
    await writeRunJson(run.runDir, SLOT_VALUES_FILE, overlay);
  }
  const changed = await writeReviewArtifacts(run, validation, validation.pass ? overlay : {});
  if (!validation.pass) {
    throw new ContentValidationError(
      `generation result failed validation with ${validation.errors.length} error(s); see report/${VALIDATION_REPORT_FILE}`,
    );
  }
  return { validation, overlay, changed };
}

/**
 * Revalidate the CURRENT slot-values.json (§29 human override). Detects
 * manual edits by comparing against the stored generation result, keeps every
 * safety check, and refreshes the reports.
 */
export async function revalidateSlotValues(run: LoadedContentRun): Promise<IngestOutcome> {
  const overlayFile = path.join(run.runDir, SLOT_VALUES_FILE);
  const overlay = (await readJson(overlayFile)) as Record<string, SlotValue>;
  const generated = run.result?.slotValues ?? {};
  const manualEdits = JSON.stringify(overlay) !== JSON.stringify(generated);
  const sources = run.result?.sources ?? {};
  const unresolved = run.result?.unresolved ?? [];
  const imageBriefs = run.result?.imageBriefs ?? [];
  const validation = validateSlotAssignments(
    run.template,
    run.unitsFile,
    overlay,
    unresolved.filter((u) => overlay[u.slotKey] === undefined),
    sources,
    imageBriefs,
    { manual: manualEdits },
  );
  await updateManifest(run, (m) => ({ ...m, manualEdits }));
  const changed = await writeReviewArtifacts(run, validation, overlay);
  if (!validation.pass) {
    throw new ContentValidationError(
      `slot-values.json failed validation with ${validation.errors.length} error(s); see report/${VALIDATION_REPORT_FILE}`,
    );
  }
  return { validation, overlay, changed };
}

/** Persist a layout QA report and refresh manifest + operator review. */
export async function recordLayoutQa(
  run: LoadedContentRun,
  layoutQa: LayoutQaReport,
  validation: ValidationReport,
  overlay: Record<string, SlotValue>,
): Promise<void> {
  await writeRunJson(run.runDir, path.join(CONTENT_REPORT_DIR, LAYOUT_QA_REPORT_FILE), layoutQa);
  await updateManifest(run, (m) => ({
    ...m,
    layoutQa: {
      pass: layoutQa.pass,
      pages: layoutQa.pages.length,
      repairCandidates: layoutQa.repairCandidates.length,
    },
  }));
  await writeReviewArtifacts(run, validation, overlay, layoutQa);
}
