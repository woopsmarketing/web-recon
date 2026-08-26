import {
  assertSiteSpecValid,
  compileSiteSpec,
  loadInputs,
  loadSiteSpec,
  saveSiteSpec,
  siteSpecRunDir,
  summarizeSiteSpec,
  type SiteSpecSummary,
} from "../sitespec/index.js";
import { executeStage } from "./execute-stage.js";
import { assertLineage, portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stage 8 — SiteSpec compilation (Task 16, item 53).
 *
 * The seam. Everything before it is evidence in a dozen run directories;
 * everything after it reads ONE directory and nothing else. Task 13's contract
 * is not restated or relaxed here — this stage calls the same compiler, the same
 * validator, and then re-loads the result through the same consumer API
 * (`loadSiteSpec`) that Task 14 will use, so a SiteSpec that validates in memory
 * and fails on disk fails HERE rather than in reconstruction.
 *
 * It is also where {@link assertLineage} runs. This is the last moment a mixed
 * run is cheap: after this, the wrong `verified-urls.json` has already become a
 * route table and every downstream number describes a site nobody asked about.
 */

export interface SiteSpecStageResult {
  siteSpecFile: string;
  summary: SiteSpecSummary;
  /** Task 16 A2 / dynamic-target figures, read from the compiled artifact. */
  scrollStateNodes: number;
  scrolledNodes: number;
  assetBoundImageNodes: number;
  imageNodes: number;
  dynamicTargets: number;
  dynamicTargetsWithTemplate: number;
  dynamicTemplateNodes: number;
  gridPropertyOccurrences: Record<string, number>;
}

/** The Task 16 A3 additions, counted where they land: the style catalog. */
const GRID_PROPERTIES: readonly string[] = [
  "grid-template-areas",
  "grid-area",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-auto-columns",
  "place-items",
  "place-content",
  "place-self",
  "order",
];

export interface SiteSpecStageInput {
  context: E2eRunContext;
  interactionPatternsFile: string;
  /**
   * Override the observation run the compiler reads (Task 16, item 65).
   *
   * `loadInputs()` normally follows `exploration.sourceSiteObservation` back to
   * the Task 09 run the exploration was planned from — which is correct, and
   * which is exactly why the family-escalation recompile has to say otherwise.
   * Without this the escalation would observe four pages into an augmented run
   * and then compile from the original one, producing an identical SiteSpec and
   * a "no improvement" result that had nothing to do with the escalation.
   */
  siteObservationFile?: string;
}

export async function runSiteSpecStage(
  input: SiteSpecStageInput,
): Promise<SiteSpecStageResult> {
  const { context, interactionPatternsFile } = input;
  const { value } = await executeStage<SiteSpecStageResult>({
    context,
    stage: "sitespec",
    onError: "sitespec-invalid",
    run: async () => {
      assertLineage(context);

      const inputs = await loadInputs({
        patternsFile: interactionPatternsFile,
        ...(input.siteObservationFile !== undefined
          ? { siteObservationFile: input.siteObservationFile }
          : {}),
      });
      if (inputs.rootUrl !== context.rootUrl) {
        throw new E2eError(
          `the interaction model describes ${inputs.rootUrl}, not ${context.rootUrl}`,
          "sitespec-invalid",
        );
      }
      const successfulPages = inputs.siteObservation.pages.filter(
        (page) => page.status === "success",
      );

      const compiled = await compileSiteSpec(inputs);
      assertSiteSpecValid(compiled, {
        expectedVerifiedUrls: inputs.verifiedUrls.urls.map((entry) => entry.url),
        expectedPageIds: successfulPages.map((page) => page.pageId),
        expectedPatternIds: inputs.patterns.patterns.map((pattern) => pattern.id),
        expectedUnknownIds: inputs.unknowns.cases.map((unknown) => unknown.id),
      });

      const runDir = siteSpecRunDir(
        inputs.rootUrl,
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
      const saved = await saveSiteSpec(runDir, compiled);
      // Read it back through the CONSUMER door and validate again: the artifact
      // Task 14 will open must satisfy the invariants, not just the object the
      // compiler held in memory.
      const reloaded = await loadSiteSpec(saved.siteSpecPath);

      const siteSpecFile = portablePath(saved.siteSpecPath);
      context.lineage.siteSpecFile = siteSpecFile;

      // --- Task 16 accounting, read from the COMPILED artifact ---------------
      let scrollStateNodes = 0;
      let scrolledNodes = 0;
      let imageNodes = 0;
      let assetBoundImageNodes = 0;
      for (const page of reloaded.pages) {
        for (const viewport of [page.viewports.desktop, page.viewports.mobile]) {
          scrollStateNodes += viewport.scrollStateNodeCount ?? 0;
          scrolledNodes += viewport.scrolledNodeCount ?? 0;
          for (const node of viewport.nodes) {
            if (node.type !== "element" || node.tagName !== "img") continue;
            imageNodes++;
            if (node.assetRefs.length > 0) assetBoundImageNodes++;
          }
        }
      }
      const gridPropertyOccurrences: Record<string, number> = {};
      for (const token of reloaded.styleCatalog.styles) {
        for (const property of GRID_PROPERTIES) {
          if (token.properties[property] === undefined) continue;
          gridPropertyOccurrences[property] =
            (gridPropertyOccurrences[property] ?? 0) + 1;
        }
      }
      const summary = summarizeSiteSpec(reloaded);
      const interactionSummary = reloaded.interactionSpec.summary;

      const warnings: string[] = [];
      if (imageNodes > assetBoundImageNodes) {
        warnings.push(
          `${imageNodes - assetBoundImageNodes} <img> node(s) carry no asset reference; ` +
            `their source markup declared no usable image URL`,
        );
      }

      return {
        outcome: {
          artifact: siteSpecFile,
          runDir: portablePath(saved.runDir),
          counts: {
            routes: reloaded.siteSpec.routes.length,
            families: reloaded.siteSpec.families.length,
            pages: reloaded.pages.length,
            styleTokens: reloaded.styleCatalog.tokenCount,
            assets: reloaded.assetCatalog.assetCount,
            assetOccurrences: reloaded.assetCatalog.occurrenceCount,
            patterns: reloaded.interactionSpec.patterns.length,
            unknowns: reloaded.interactionSpec.unknownInteractions.length,
            scrollStateNodes,
            scrolledNodes,
            imageNodes,
            assetBoundImageNodes,
            dynamicTargets: interactionSummary.patternsWithDynamicTarget,
            dynamicTargetsWithTemplate:
              interactionSummary.patternsWithDynamicTargetContent ?? 0,
            dynamicTemplateNodes: interactionSummary.dynamicTemplateNodeCount ?? 0,
          },
          warnings,
          bytes: saved.bytes.total,
        },
        value: {
          siteSpecFile,
          summary,
          scrollStateNodes,
          scrolledNodes,
          imageNodes,
          assetBoundImageNodes,
          dynamicTargets: interactionSummary.patternsWithDynamicTarget,
          dynamicTargetsWithTemplate:
            interactionSummary.patternsWithDynamicTargetContent ?? 0,
          dynamicTemplateNodes: interactionSummary.dynamicTemplateNodeCount ?? 0,
          gridPropertyOccurrences,
        },
      };
    },
  });

  if (!value) throw new E2eError("SiteSpec compile produced no result", "sitespec-invalid");
  return value;
}
