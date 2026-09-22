import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSlotAccounting } from "./accounting.js";
import { reviewCrossPageConsistency } from "./consistency.js";
import { buildAuthoringPlan } from "./plan.js";
import { detectSourceBrandLeaks, detectTemplateBrandSurfaceLeaks } from "./brand-leak.js";
import { loadReconTemplate, type LoadedReconTemplate } from "./load-template.js";
import { applyTruthMode, resolveTruthMode } from "./truth-mode.js";
import { buildOverlayValues, changedKeys, effectiveSlotValues } from "./overlay.js";
import { buildOperatorReview } from "./report.js";
import { validateGenerationResult, validateSlotAssignments } from "./validate.js";
import type { SlotValue } from "../recon-template/types.js";
import {
  AUTHORING_PLAN_FILE,
  AuthoringPlanFileSchema,
  REGION_PLAN_FILE,
  RegionPlanFileSchema,
  BRAND_LEAK_REPORT_FILE,
  CONSISTENCY_REPORT_FILE,
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
  SLOT_ACCOUNTING_FILE,
  SLOT_VALUES_FILE,
  VALIDATION_REPORT_FILE,
  ContentValidationError,
  type ContentGenerationResult,
  type ContentIntent,
  type ContentPolicy,
  type ContentRunManifest,
  type AuthoringPlanFile,
  type ConsistencyReport,
  type ContentUnitsFile,
  type GenerationRequest,
  type LayoutQaReport,
  type RegionPlanFile,
  type SlotAccountingFile,
  type TruthModeDecision,
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
  /**
   * Task 28 Phase 9: the derivation chain the packet emitted. Optional because
   * every Task 19-27 run on disk predates the artifact and must still load.
   */
  authoringPlan?: AuthoringPlanFile;
  /** Task 27: the RegionPlan layer, when a page-regions artifact was supplied. */
  regionPlan?: RegionPlanFile;
  /**
   * Task 27 §4: what the run's truth mode decided, per slot. Populated by
   * `ingestGenerationResult`; empty on a run loaded straight off disk, because
   * the decisions are evidence about ONE ingest, not a property of the run.
   */
  truthDecisions?: TruthModeDecision[];
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
  let regionPlan: RegionPlanFile | undefined;
  try {
    regionPlan = RegionPlanFileSchema.parse(await readJson(path.join(runDir, REGION_PLAN_FILE)));
  } catch {
    regionPlan = undefined;
  }
  let authoringPlan: AuthoringPlanFile | undefined;
  try {
    authoringPlan = AuthoringPlanFileSchema.parse(
      await readJson(path.join(runDir, AUTHORING_PLAN_FILE)),
    );
  } catch {
    // A run prepared before Task 28 Phase 9 has no plan on disk. That is an
    // absence, not a defect: the consistency review falls back to the site
    // plan the result carries and says which source it read.
    authoringPlan = undefined;
  }
  return {
    runDir,
    manifest,
    intent,
    policy,
    unitsFile,
    request,
    template,
    result,
    ...(authoringPlan !== undefined ? { authoringPlan } : {}),
    ...(regionPlan !== undefined ? { regionPlan } : {}),
  };
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
  /** Task 27 §2: the sibling account of every in-scope slot. */
  accounting: SlotAccountingFile;
  /** Task 28 Phase 9: the cross-page consistency review (reported, not gated). */
  consistency: ConsistencyReport;
}

async function writeReviewArtifacts(
  run: LoadedContentRun,
  validation: ValidationReport,
  overlay: Record<string, SlotValue>,
  layoutQa?: LayoutQaReport,
): Promise<{ changed: Set<string>; accounting: SlotAccountingFile; consistency: ConsistencyReport }> {
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
  // Task 28 CR8: the inline-SVG / attribute surfaces that carry the source mark
  // but bind to no slot. Read from the template's runtime IR (read-only), so a
  // template with no runtime data simply contributes nothing.
  const surfaceWarnings = await detectTemplateBrandSurfaceLeaks(run.template);
  const brandLeak = detectSourceBrandLeaks(
    run.template,
    run.unitsFile,
    effective,
    changed,
    engineBlockedKeys,
    surfaceWarnings,
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
  // §2: EVERY in-scope slot accounted for, on two orthogonal axes, in a
  // SIBLING artifact — `slot-values.json` stays a bare { slotKey: value } map
  // because the release orchestrator reads it that way.
  const accounting = buildSlotAccounting({
    manifest: run.manifest,
    template: run.template,
    unitsFile: run.unitsFile,
    overlay,
    sources: run.result?.sources ?? {},
    unresolved: run.result?.unresolved ?? [],
    truthMode: resolveTruthMode(run.intent.truthMode ?? run.manifest.truthMode),
    truthDecisions: run.truthDecisions ?? [],
    syntheticKeys: new Set(run.result?.synthetic ?? []),
    manualEdits: run.manifest.manualEdits,
  });
  // Task 28 Phase 9: the authoring plan is REBUILT here with the SiteContentPlan
  // the generator actually produced. At prepare time no plan exists yet, so the
  // page level knows the route but not what the page is FOR; once a result is
  // in, the chain can carry the real PageContentPlan and the closure can say
  // honestly which routes still have none. The rebuild is the same deterministic
  // function — nothing is grafted on.
  if (run.authoringPlan !== undefined && run.result !== undefined) {
    const rebuilt = buildAuthoringPlan({
      runId: run.manifest.runId,
      templateId: run.manifest.templateId,
      scopedRoutes: run.manifest.scopedRoutes,
      intent: run.intent,
      briefGaps: run.authoringPlan.brief.gaps,
      unitsFile: run.unitsFile,
      ...(run.regionPlan !== undefined ? { regionPlan: run.regionPlan } : {}),
      sitePlan: run.result.sitePlan,
    });
    run.authoringPlan = rebuilt;
    await writeRunJson(run.runDir, AUTHORING_PLAN_FILE, rebuilt);
  }

  // Task 28 Phase 9: the CROSS-PAGE review pass. Deterministic, reads only
  // artifacts this run already produced, and REPORTS — it never rewrites a
  // value and never fails an ingest, exactly like the brand-leak scan beside it.
  const consistency = reviewCrossPageConsistency({
    runId: run.manifest.runId,
    templateId: run.manifest.templateId,
    scopedRoutes: run.manifest.scopedRoutes,
    template: run.template,
    unitsFile: run.unitsFile,
    overlay,
    changed,
    ...(run.authoringPlan !== undefined ? { plan: run.authoringPlan } : {}),
    ...(run.result !== undefined ? { sitePlan: run.result.sitePlan } : {}),
    disabledSlotKeys: (run.manifest.enablement?.disabledSlots ?? []).map((slot) => slot.slotKey),
    disabledRoutes: run.manifest.enablement?.disabledRoutes ?? [],
  });
  await writeRunJson(run.runDir, SLOT_ACCOUNTING_FILE, accounting);
  await writeRunJson(run.runDir, path.join(CONTENT_REPORT_DIR, CONSISTENCY_REPORT_FILE), consistency);
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
    slotAccounting: {
      file: SLOT_ACCOUNTING_FILE,
      inScopeSlots: accounting.totals.inScopeSlots,
      reconciled: accounting.reconciliation.reconciled,
      ambiguousSlots: accounting.scopeHonesty.ambiguousSlots,
    },
    consistency: {
      file: `${CONTENT_REPORT_DIR}/${CONSISTENCY_REPORT_FILE}`,
      pass: consistency.pass,
      errors: consistency.counts.errors,
      warnings: consistency.counts.warnings,
      routesCovered: consistency.routeCoverage.filter((entry) => entry.writtenSlots > 0).length,
      routesInScope: consistency.routeCoverage.length,
    },
  }));
  return { changed, accounting, consistency };
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
  // §4: the truth mode is an ENGINE behaviour, not a prompt request. Under
  // verified-only an unbacked factual claim is withheld and becomes
  // needs-input BEFORE anything can become an overlay; under
  // synthetic-allowed the same value is kept with synthetic provenance.
  const truthMode = resolveTruthMode(run.intent.truthMode ?? run.manifest.truthMode);
  const enforced = applyTruthMode(run.template, truthMode, result, run.intent.providedFacts);
  run.result = enforced.result;
  run.truthDecisions = enforced.decisions;
  await writeRunJson(run.runDir, GENERATION_RESULT_FILE, enforced.result);
  await updateManifest(run, (m) => ({
    ...m,
    generator: { name: result.generator.name, ...(result.generator.model ? { model: result.generator.model } : {}) },
    manualEdits: false,
    truthMode,
  }));
  const validation = validateGenerationResult(run.template, run.unitsFile, enforced.result);
  const overlay = buildOverlayValues(enforced.result);
  if (validation.pass) {
    await writeRunJson(run.runDir, SLOT_VALUES_FILE, overlay);
  }
  const { changed, accounting, consistency } = await writeReviewArtifacts(
    run,
    validation,
    validation.pass ? overlay : {},
  );
  if (!validation.pass) {
    throw new ContentValidationError(
      `generation result failed validation with ${validation.errors.length} error(s); see report/${VALIDATION_REPORT_FILE}`,
    );
  }
  return { validation, overlay, changed, accounting, consistency };
}

/**
 * The content write doctrine, stated AT THE POINT OF EDIT (Task 27 final
 * residual). `release:resolve` (src/release/resolve.ts) and `release:build`
 * (src/release/stages.ts) already say this to the operator who works through
 * the release layer; the operator who hand-edits slot-values.json and never
 * touches that layer was told nothing. Same load-bearing words in all three
 * places on purpose — one message to the operator, not three dialects.
 */
export const CONTENT_WRITE_DOCTRINE_WARNING =
  "content write doctrine: content-runs/<run>/slot-values.json is a DERIVED, MATERIALIZED " +
  "output — editing a historical content run's slot-values.json in place is " +
  "NON-AUTHORITATIVE and will be replaced by the next release:build, which re-materializes " +
  "a NEW content run from the project's AUTHORITATIVE authored.slotValues. To KEEP an edit, " +
  "author it through `pnpm release:resolve` (it folds the value into authored.slotValues).";

/**
 * Revalidate the CURRENT slot-values.json — a DERIVED, NON-AUTHORITATIVE
 * overlay, not the site's source of truth (§29 human override).
 *
 * This is the hand-edit path: an operator edits the overlay, re-runs validate
 * → preview → qa, and never needs another LLM call. Every safety check applies
 * unchanged and manual edits are recorded in the manifest — but the bytes
 * validated here are a MATERIALIZED output of the release layer. The project's
 * `authored.slotValues` is authoritative, and the next `release:build`
 * re-materializes a new content run from it, discarding any edit that was
 * never authored there. Callers that face an operator MUST surface
 * `CONTENT_WRITE_DOCTRINE_WARNING` when `manifest.manualEdits` comes back true
 * (see src/cli-content-validate.ts); the value is derived, not authoritative.
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
  const { changed, accounting, consistency } = await writeReviewArtifacts(run, validation, overlay);
  if (!validation.pass) {
    throw new ContentValidationError(
      `slot-values.json failed validation with ${validation.errors.length} error(s); see report/${VALIDATION_REPORT_FILE}`,
    );
  }
  return { validation, overlay, changed, accounting, consistency };
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
