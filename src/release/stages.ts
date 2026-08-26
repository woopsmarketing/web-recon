/**
 * Default stage runners (spec §17) — each one is a thin conductor over the
 * subsystem's PUBLIC typed API (never `exec("pnpm …")`, never a re-implemented
 * algorithm). Every rerun lands in the subsystem's own namespace under a NEW
 * run id; lineage inputs stay read-only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ingestGenerationResult,
  loadContentRun,
  prepareContentRun,
  type ContentGenerationResult,
} from "../content-injection/index.js";
import {
  createThemeRun,
  loadAdapterFile,
  loadThemeFile,
  newThemeRunId,
  themeRunDir,
} from "../theme/index.js";
import { loadReconTemplate } from "../content-injection/index.js";
import { createProductionSeoPlanRun, type ProvidedBusinessFacts } from "../seo/index.js";
import { productionBuildDir, runProductionCompile, runProductionQa } from "../production/index.js";
import { applyAssetResolutions } from "./resolve-assets.js";
import { CANONICAL_FACT_KEYS, normalizeProductionDomain } from "./requirements.js";
import type {
  ArtifactRef,
  ProductionResolution,
  ReleaseProject,
  ReleaseStage,
} from "./types.js";

export interface StageRunnerContext {
  project: ReleaseProject;
  effective: ProductionResolution;
  /** Current artifact per stage — updated as earlier stages complete. */
  current: Partial<Record<ReleaseStage, ArtifactRef | null>>;
  releaseRunId: string;
  log: (line: string) => void;
}

export interface StageRunnerResult {
  id: string;
  path: string;
  /** Subtrees excluded from the artifact hash (build byproducts). */
  excluded?: string[];
  detail?: string;
}

export type StageRunner = (context: StageRunnerContext) => Promise<StageRunnerResult>;

function currentPath(context: StageRunnerContext, stage: ReleaseStage): string {
  const artifact = context.current[stage];
  if (!artifact) throw new Error(`release build: no current artifact for stage ${stage}`);
  return artifact.path;
}

// ---------------------------------------------------------------------------
// content — prepare + ingest a MERGED generation result (previous run values
// + resolution routeContent/urls), through the real Task 19 pipeline.
// ---------------------------------------------------------------------------

export const contentStageRunner: StageRunner = async (context) => {
  const templateManifestFile = path.join(currentPath(context, "template"), "manifest.json");
  const baseRunDir = currentPath(context, "content");
  const baseResult = JSON.parse(
    await readFile(path.join(baseRunDir, "generation-result.json"), "utf8"),
  ) as ContentGenerationResult;
  const baseManifest = JSON.parse(
    await readFile(path.join(baseRunDir, "manifest.json"), "utf8"),
  ) as { scopedRoutes?: string[] };
  const rawIntent = context.project.intent.rawIntent;
  if (rawIntent === null) throw new Error("release build: project has no recorded intent");

  const routeContent = context.effective.routeContent ?? {};
  const urls = context.effective.urls ?? {};
  const template = await loadReconTemplate(templateManifestFile);
  const templateRoutes = new Set(template.manifest.routes);
  const routes = [...new Set([...(baseManifest.scopedRoutes ?? []), ...Object.keys(routeContent).filter((route) => route !== "global")])];
  for (const route of routes) {
    if (!templateRoutes.has(route)) {
      throw new Error(`release build: routeContent route ${route} is not a template route`);
    }
  }

  const prepared = await prepareContentRun({
    templateManifestFile,
    rawIntent,
    routes,
  });
  const runId = prepared.runId;
  const runDir = path.relative(process.cwd(), path.resolve(prepared.runDir));
  const run = await loadContentRun(runDir);

  // ---- merge: base result + operator-provided values ----------------------
  const slotValues: Record<string, unknown> = { ...baseResult.slotValues };
  const sources: Record<string, string> = { ...baseResult.sources };
  const providedKeys = new Set<string>();
  for (const [route, content] of Object.entries(routeContent)) {
    for (const [slotKey, value] of Object.entries(content.slotValues ?? {})) {
      slotValues[slotKey] = value;
      sources[slotKey] = "user-provided";
      providedKeys.add(slotKey);
    }
    void route;
  }
  for (const [slotKey, value] of Object.entries(urls)) {
    slotValues[slotKey] = value;
    sources[slotKey] = "user-provided";
    providedKeys.add(slotKey);
  }
  const pagePlans = [...baseResult.sitePlan.pagePlans];
  const plannedRoutes = new Set(pagePlans.map((plan) => plan.route));
  for (const route of routes) {
    if (plannedRoutes.has(route)) continue;
    const provided = routeContent[route]?.pagePlan;
    pagePlans.push({
      route,
      currentPurpose: provided?.currentPurpose ?? "source route (carried by the release orchestrator)",
      newPurpose: provided?.newPurpose ?? "operator-provided route content (release resolution)",
      primaryMessage:
        provided?.primaryMessage ??
        (Object.values(routeContent[route]?.slotValues ?? {}).find(
          (value): value is string => typeof value === "string",
        ) ?? "operator-provided route content"),
      secondaryMessages: provided?.secondaryMessages ?? [],
      conversionGoal: provided?.conversionGoal ?? baseResult.sitePlan.primaryConversion,
      contentStrategy:
        provided?.contentStrategy ??
        "keep layout and structure; only operator-provided text/link values are injected",
    });
  }
  const merged: ContentGenerationResult = {
    ...baseResult,
    generator: { name: "release-orchestrator" },
    sitePlan: { ...baseResult.sitePlan, pagePlans },
    slotValues: slotValues as ContentGenerationResult["slotValues"],
    sources: sources as ContentGenerationResult["sources"],
    unresolved: baseResult.unresolved.filter((slot) => !providedKeys.has(slot.slotKey)),
    notes: [
      ...(baseResult.notes ?? []),
      `release rerun ${context.releaseRunId}: merged operator resolution (routes: ${routes.join(", ")})`,
    ],
  };
  const outcome = await ingestGenerationResult(run, merged);
  context.log(
    `[release] content run ${runId}: ${Object.keys(outcome.overlay).length} slot values, ` +
      `${merged.unresolved.length} unresolved`,
  );
  return { id: runId, path: runDir };
};

// ---------------------------------------------------------------------------
// theme — same theme + adapter as the current run, over the CURRENT content.
// ---------------------------------------------------------------------------

export const themeStageRunner: StageRunner = async (context) => {
  const baseRunDir = currentPath(context, "theme");
  const baseManifest = JSON.parse(await readFile(path.join(baseRunDir, "manifest.json"), "utf8")) as {
    themeSourceFile: string;
    adapterSourceFile: string;
  };
  const templateManifestFile = path.join(currentPath(context, "template"), "manifest.json");
  const template = await loadReconTemplate(templateManifestFile);
  const theme = await loadThemeFile(baseManifest.themeSourceFile);
  const adapter = await loadAdapterFile(baseManifest.adapterSourceFile);
  const runId = newThemeRunId();
  const runDir = themeRunDir(context.project.source.host, runId);
  await createThemeRun({
    template,
    templateManifestFile,
    adapter,
    adapterSourceFile: baseManifest.adapterSourceFile,
    theme,
    themeSourceFile: baseManifest.themeSourceFile,
    runId,
    runDir,
    contentRunDir: currentPath(context, "content"),
  });
  context.log(`[release] theme run ${runId} (theme + adapter carried from ${baseRunDir})`);
  return { id: runId, path: runDir };
};

// ---------------------------------------------------------------------------
// seo — regenerate the production SEO plan (offline, deterministic).
// ---------------------------------------------------------------------------

export const seoStageRunner: StageRunner = async (context) => {
  const facts: ProvidedBusinessFacts = {};
  for (const key of CANONICAL_FACT_KEYS) {
    const value = context.effective.facts?.[key];
    if (value === undefined) continue;
    if (key === "sameAs") facts.sameAs = Array.isArray(value) ? value : [value];
    else {
      (facts as Record<string, string>)[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  const domain =
    context.effective.productionBaseUrl === undefined
      ? undefined
      : normalizeProductionDomain(context.effective.productionBaseUrl);
  const { manifest, outputDir } = await createProductionSeoPlanRun({
    templateManifestRef: path.join(currentPath(context, "template"), "manifest.json"),
    contentRunDir: currentPath(context, "content"),
    sourceSnapshotRef: context.project.auxiliary.seoSourceSnapshotDir,
    ...(domain !== undefined ? { productionDomain: domain } : {}),
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    log: context.log,
  });
  context.log(`[release] seo plan ${manifest.runId} (mode ${manifest.domainState.mode})`);
  return { id: manifest.runId, path: path.relative(process.cwd(), outputDir) };
};

// ---------------------------------------------------------------------------
// assets — apply operator asset/font resolutions as a DERIVED materialization.
// ---------------------------------------------------------------------------

export const assetsStageRunner: StageRunner = async (context) => {
  const result = await applyAssetResolutions({
    baseMaterializationRunDir: currentPath(context, "assets"),
    assets: context.effective.assets ?? {},
    fontDecisions: context.effective.fontDecisions ?? {},
    providedBy: `release:${context.project.projectId}:${context.releaseRunId}`,
    log: context.log,
  });
  return {
    id: result.runId,
    path: path.relative(process.cwd(), path.resolve(result.runDir)),
    detail:
      `${result.appliedAssets.length} asset(s) applied, ${result.recordedFiles.length} recorded, ` +
      `${result.fontDecisionFamilies.length} font decision(s)`,
  };
};

// ---------------------------------------------------------------------------
// production — real compile (Task 23) + isolated-package QA. QA failure is a
// stage failure: a build whose QA fails is never adopted.
// ---------------------------------------------------------------------------

export const productionStageRunner: StageRunner = async (context) => {
  const compile = await runProductionCompile({
    host: context.project.source.host,
    templateRunDir: currentPath(context, "template"),
    contentRunDir: currentPath(context, "content"),
    themeRunDir: currentPath(context, "theme"),
    seoPlanRunDir: currentPath(context, "seo"),
    materializationRunDir: currentPath(context, "assets"),
    log: context.log,
  });
  const qa = await runProductionQa({ packageDir: compile.packageDir, log: context.log });
  const buildDir = productionBuildDir(context.project.source.host, compile.runId);
  await mkdir(path.join(buildDir, "report"), { recursive: true });
  await writeFile(
    path.join(buildDir, "report", "qa.json"),
    JSON.stringify(qa, null, 2) + "\n",
    "utf8",
  );
  if (qa.failed > 0) {
    throw new Error(
      `production QA failed: ${qa.failed} of ${qa.passed + qa.failed} checks — build ${compile.runId} not adopted`,
    );
  }
  context.log(`[release] production ${compile.runId}: QA ${qa.passed}/${qa.passed + qa.failed}`);
  return {
    id: compile.runId,
    path: path.relative(process.cwd(), compile.specDir),
    detail: `decision=${compile.spec.indexabilityGate.decision}; qa ${qa.passed}/${qa.passed + qa.failed}`,
  };
};

export const DEFAULT_STAGE_RUNNERS: Partial<Record<ReleaseStage, StageRunner>> = {
  content: contentStageRunner,
  theme: themeStageRunner,
  seo: seoStageRunner,
  assets: assetsStageRunner,
  production: productionStageRunner,
};
