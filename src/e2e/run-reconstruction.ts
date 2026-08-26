import path from "node:path";
import {
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  reconstructionRunDir,
  resolveDependencyVersions,
  runNextBuild,
  validateGeneratedApp,
  MANIFEST_FILE,
  type ReconstructionCorrections,
} from "../reconstruction/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stages 9 and 10 — Next.js generation and `next build` (Task 16, items 44, 54).
 *
 * Two stages, not one, because they answer two different questions and fail for
 * two different reasons. Generation failing means this pipeline produced an IR
 * it cannot render. `next build` failing means the produced app is not a valid
 * Next.js application — a much narrower and more embarrassing claim, and one
 * worth being able to point at directly in a manifest.
 *
 * Both are fatal (item 38): there is nothing to QA without a built clone.
 *
 * The generated stack is fixed and does not consult the origin (items 47, 54):
 * Next.js + React + TypeScript + generated exact CSS, whatever the source site
 * turned out to be built with. No branch anywhere below reads a framework
 * fingerprint.
 */

export interface ReconstructionStageResult {
  manifestFile: string;
  appDir: string;
  outputDir: string;
  routes: number;
  /** Full source URLs of every generated route (Root URL Invariant, Task 17). */
  routeUrls: string[];
  scrollRestoreNodes: number;
  dynamicTargetsWithContent: number;
  dynamicTemplateNodes: number;
  versions: Record<string, string | undefined>;
}

export interface ReconstructionStageInput {
  context: E2eRunContext;
  siteSpecFile: string;
  /** Present only on a correction / escalation pass. */
  corrections?: ReconstructionCorrections;
  /** Where to write. Defaults to the standard reconstructions namespace. */
  outputDir?: string;
}

export async function runReconstructionStage(
  input: ReconstructionStageInput,
): Promise<ReconstructionStageResult> {
  const { context } = input;

  const { value } = await executeStage<ReconstructionStageResult>({
    context,
    stage: "reconstruction",
    onError: "reconstruction-failure",
    run: async () => {
      const loaded = await loadReconstructionInput(input.siteSpecFile);
      if (loaded.siteSpec.rootUrl !== context.rootUrl) {
        throw new E2eError(
          `the SiteSpec describes ${loaded.siteSpec.rootUrl}, not ${context.rootUrl}`,
          "reconstruction-failure",
        );
      }

      const plan = planReconstruction(loaded, {
        ...(input.corrections ? { corrections: input.corrections } : {}),
      });
      const outputDir =
        input.outputDir ??
        reconstructionRunDir(
          loaded.siteSpec.rootUrl,
          new Date().toISOString().replace(/[:.]/g, "-"),
        );
      const versions = await resolveDependencyVersions(process.cwd());
      const generated = await generateApp(plan, {
        outputDir,
        ...(input.corrections ? { correctionAssetDir: input.corrections.assetDir } : {}),
        sourceSchemaVersion: loaded.siteSpec.schemaVersion,
        sourceSiteSpecVersion: loaded.siteSpec.siteSpecVersion,
        sourceCompilerVersion: loaded.siteSpec.compilerVersion,
        versions,
      });

      const validation = await validateGeneratedApp({
        outputDir,
        expectedRouteUrls: loaded.siteSpec.routes.map((route) => route.url),
        expectedPatternTriggers: [...plan.interactions.bindings.keys()],
      });

      const manifestFile = portablePath(path.join(outputDir, MANIFEST_FILE));
      context.lineage.reconstructionManifestFile = manifestFile;

      return {
        outcome: {
          artifact: manifestFile,
          runDir: portablePath(outputDir),
          counts: {
            routes: validation.routeCount,
            pageFiles: validation.pageFileCount,
            elementNodes: validation.runtimeElementNodes,
            textNodes: validation.runtimeTextNodes,
            styleRules: plan.styles.ruleCount,
            patternBindings: plan.interactions.bindings.size,
            unknownAnnotations: plan.interactions.unknowns.size,
            scrollStateNodes: plan.counters.scrollStateNodes,
            scrollRestoreNodes: plan.counters.scrollRestoreNodes,
            dynamicTargets: plan.interactions.dynamicTargets,
            dynamicTargetsWithContent: plan.interactions.dynamicTargetsWithContent,
            dynamicTemplateNodes: plan.interactions.dynamicTemplateNodes,
            observedTargetBindings: plan.interactions.observedTargetBindings,
            observedTargetsRevealed: plan.interactions.observedTargetsRevealed,
            observedTargetsWithContent: plan.interactions.observedTargetsWithContent,
            observedTargetsHostMounted: plan.interactions.observedTargetsHostMounted,
            observedTargetsCaptureExpanded:
              plan.interactions.observedTargetsCaptureExpanded,
            layoutRecoveredRules: plan.layout.rules.length,
            layoutPagesWithAlignedProbe: plan.layout.counters.pagesWithAlignedProbe,
            assetDownloads: 0,
          },
          warnings: [],
          bytes: generated.bytes.total,
        },
        value: {
          manifestFile,
          appDir: generated.appDir,
          outputDir,
          routes: validation.routeCount,
          routeUrls: loaded.siteSpec.routes.map((route) => route.url),
          scrollRestoreNodes: plan.counters.scrollRestoreNodes,
          dynamicTargetsWithContent: plan.interactions.dynamicTargetsWithContent,
          dynamicTemplateNodes: plan.interactions.dynamicTemplateNodes,
          versions,
        },
      };
    },
  });

  if (!value) {
    throw new E2eError("reconstruction produced no result", "reconstruction-failure");
  }
  return value;
}

export async function runBuildStage(
  context: E2eRunContext,
  appDir: string,
): Promise<void> {
  await executeStage<void>({
    context,
    stage: "build",
    onError: "reconstruction-build-failure",
    run: async () => {
      const build = await runNextBuild(appDir, { captureOutput: true });
      if (build.exitCode !== 0) {
        throw new E2eError(
          `next build exited ${build.exitCode}: ${(build.output ?? "").trim().split("\n").slice(-3).join(" / ")}`,
          "reconstruction-build-failure",
        );
      }
      return {
        outcome: {
          runDir: portablePath(appDir),
          counts: { exitCode: 0, buildMs: build.elapsedMs },
          warnings: [],
        },
        value: undefined,
      };
    },
  });
}
