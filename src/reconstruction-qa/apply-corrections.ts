import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  generateApp,
  loadReconstructionInput,
  planReconstruction,
  resolveDependencyVersions,
  validateGeneratedApp,
  type ReconstructionCorrectionInput,
  type ReconstructionCorrections,
} from "../reconstruction/index.js";
import { QaEngineError } from "./types.js";
import type { QaCorrectionSet } from "./correction-types.js";
import { portablePath } from "./store.js";

/**
 * Generating a CORRECTED reconstruction (items 88, 113–116, 123).
 *
 * Three properties hold this apart from a normal reconstruction, and all three
 * matter:
 *
 *  1. **The SiteSpec is not touched** (item 88). A corrected clone is
 *     `SiteSpec + QaCorrectionSet`, generated fresh; the IR keeps saying what was
 *     observed in the past, and the correction layer says what a later
 *     observation added.
 *  2. **The Task 14 baseline is not touched** (item 115). Output goes into
 *     `iterations/q00N/reconstruction/` inside the QA run, so the baseline clone
 *     stays exactly as Task 14 produced it and remains the thing every
 *     before/after number is measured against.
 *  3. **No source file is edited** (item 123). This calls the SAME generator with
 *     an extra data input. Nothing rewrites `src/reconstruction/*.ts`, and a
 *     global rule change is a human's promotion decision, not a loop's
 *     side effect (item 124).
 */

export interface WriteCorrectionSetResult {
  /** Absolute path of the written correction set. */
  file: string;
  /** Absolute directory holding the correction assets. */
  assetDir: string;
  bytes: number;
  assetBytes: number;
}

/** Persist a correction set plus its content-addressed asset files. */
export async function writeCorrectionSet(
  runDir: string,
  relativePath: string,
  correctionSet: QaCorrectionSet,
  assets: ReadonlyMap<string, Buffer>,
): Promise<WriteCorrectionSetResult> {
  const file = path.join(runDir, ...relativePath.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  const json = JSON.stringify(correctionSet, null, 2) + "\n";
  await writeFile(file, json, "utf8");

  const assetDir = path.join(path.dirname(file), "assets");
  let assetBytes = 0;
  if (assets.size > 0) {
    await mkdir(assetDir, { recursive: true });
    for (const name of [...assets.keys()].sort()) {
      const bytes = assets.get(name)!;
      await writeFile(path.join(assetDir, name), bytes);
      assetBytes += bytes.byteLength;
    }
  }
  return { file, assetDir, bytes: Buffer.byteLength(json, "utf8"), assetBytes };
}

export interface ApplyCorrectionsInput {
  siteSpecFile: string;
  /** Where the corrected app goes — inside the QA run, never over the baseline. */
  outputDir: string;
  correctionSet: QaCorrectionSet;
  correctionSetFile: string;
  assetDir: string;
  sourceQaRun: string;
  /** Skip `next build`; the caller builds when it is about to serve the app. */
  skipBuild?: boolean;
  onLog?: (message: string) => void;
}

export interface AppliedCorrections {
  outputDir: string;
  appDir: string;
  manifestFile: string;
  generatedFileCount: number;
  bytes: number;
  appliedByType: Record<string, number>;
  generationMs: number;
}

/** Regenerate the clone from the same SiteSpec plus a correction set. */
export async function applyCorrections(
  input: ApplyCorrectionsInput,
): Promise<AppliedCorrections> {
  const startedAt = Date.now();
  const log = input.onLog ?? (() => {});

  const reconstructionInput = await loadReconstructionInput(input.siteSpecFile);
  const payloads: ReconstructionCorrectionInput[] = input.correctionSet.corrections.map(
    (correction) => correction.payload as ReconstructionCorrectionInput,
  );
  const corrections: ReconstructionCorrections = {
    sourceQaRun: portablePath(input.sourceQaRun),
    correctionSet: portablePath(input.correctionSetFile),
    sourceSiteSpec: portablePath(input.siteSpecFile),
    assetDir: input.assetDir,
    corrections: payloads,
  };

  const plan = planReconstruction(reconstructionInput, { corrections });
  if (plan.corrections === undefined) {
    throw new QaEngineError(
      "a correction set was supplied but the generator produced no correction plan",
    );
  }
  const versions = await resolveDependencyVersions(process.cwd());
  const generated = await generateApp(plan, {
    outputDir: input.outputDir,
    correctionAssetDir: input.assetDir,
    sourceSchemaVersion: reconstructionInput.siteSpec.schemaVersion,
    sourceSiteSpecVersion: reconstructionInput.siteSpec.siteSpecVersion,
    sourceCompilerVersion: reconstructionInput.siteSpec.compilerVersion,
    versions,
  });

  // The generated-app invariants are part of the no-regression gate (item 120):
  // a correction that breaks route completeness or leaves a dangling style class
  // must never reach a measurement, let alone an acceptance.
  await validateGeneratedApp({
    outputDir: input.outputDir,
    expectedRouteUrls: reconstructionInput.siteSpec.routes.map((route) => route.url),
    expectedPatternTriggers: [...plan.interactions.bindings.keys()],
  });

  log(
    `[qa] corrected reconstruction written to ${input.outputDir} ` +
      `(${generated.files.length} files)`,
  );

  return {
    outputDir: generated.outputDir,
    appDir: generated.appDir,
    manifestFile: path.join(input.outputDir, "reconstruction-manifest.json"),
    generatedFileCount: generated.files.length,
    bytes: generated.bytes.total,
    appliedByType: {
      "document-canvas-background": plan.corrections.counts.canvasBackground,
      "interaction-target-state-style":
        plan.corrections.counts.interactionTargetStateStyle,
      "safe-data-image-recovery": plan.corrections.counts.safeDataImageRecovery,
    },
    generationMs: Date.now() - startedAt,
  };
}
