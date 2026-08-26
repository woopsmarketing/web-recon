import {
  loadSiteSelection,
  observeSelectedPages,
  type SiteObservation,
} from "../multi-observer/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stage 4 — Multi-page responsive deep observation (Task 16).
 *
 * The expensive stage: every selected page is rendered twice in real Chromium
 * with a full DOM / computed-style / geometry / asset walk and a full-page
 * screenshot. It is also the stage whose per-page failure isolation Task 09
 * already built and item 38 says to reuse rather than re-implement — one page
 * that will not load costs one page, and the run continues on the rest.
 *
 * Zero successful pages is different, and fatal: the SiteSpec would have no
 * render source for any route, and everything downstream would be a clone of
 * nothing reported as a success.
 */

export interface ObservationStageResult {
  siteObservation: SiteObservation;
  siteObservationFile: string;
  runDir: string;
}

export async function runObservationStage(
  context: E2eRunContext,
  selectedPagesFile: string,
): Promise<ObservationStageResult> {
  const { value } = await executeStage<ObservationStageResult>({
    context,
    stage: "observation",
    onError: "observation-failure",
    run: async () => {
      const input = await loadSiteSelection(selectedPagesFile);
      if (input.selection.rootUrl !== context.rootUrl) {
        throw new E2eError(
          `selected-pages.json describes ${input.selection.rootUrl}, not ${context.rootUrl}`,
          "observation-failure",
        );
      }

      const run = await observeSelectedPages(input.selection, {
        concurrency: context.options.concurrency,
        prepareScroll: context.options.prepareScroll,
        sourceSelectedPagesFile: input.sourceSelectedPagesFile,
        ...(input.sourcePageFamiliesFile
          ? { sourcePageFamiliesFile: input.sourcePageFamiliesFile }
          : {}),
        onPageDone: (page, done, total) => {
          context.log(
            `[e2e]   observe [${done}/${total}] ${page.status} ${page.pageId} ${page.url}`,
          );
        },
      });

      const site = run.siteObservation;
      const siteObservationFile = portablePath(run.manifestPath);
      context.lineage.siteObservationFile = siteObservationFile;

      const succeeded = site.pages.filter((page) => page.status === "success");
      const failed = site.pages.length - succeeded.length;
      const warnings = site.pages
        .filter((page) => page.status !== "success")
        .map(
          (page) =>
            `page ${page.pageId} (${page.url}) ${page.status}: ${page.error?.message ?? ""}`,
        );

      // Task 16 A1/A2 accounting starts here, from the Observer's own stats, so
      // the manifest can compare "observed" against "reached the SiteSpec"
      // rather than assuming they agree (items 50, 51).
      let assetOccurrences = 0;
      let uniqueAssets = 0;
      let scrollContainers = 0;
      for (const page of succeeded) {
        for (const viewport of [
          page.responsiveSummary?.desktop,
          page.responsiveSummary?.mobile,
        ]) {
          if (!viewport) continue;
          assetOccurrences += viewport.assetCount ?? 0;
          uniqueAssets += viewport.uniqueAssetCount ?? 0;
          scrollContainers += viewport.scrollContainerCount ?? 0;
        }
      }

      return {
        outcome: {
          status: failed > 0 ? ("partial" as const) : ("ok" as const),
          artifact: siteObservationFile,
          runDir: portablePath(run.dir),
          counts: {
            plannedPages: site.pages.length,
            observedPages: succeeded.length,
            failedPages: failed,
            representatives: site.coverage.observedRepresentativeCount,
            validationSamples: site.coverage.validationSampleCount,
            assetOccurrences,
            uniqueAssetIdentities: uniqueAssets,
            scrollContainers,
          },
          warnings,
          bytes: site.stats.totalBytes,
          ...(succeeded.length === 0
            ? { failure: "observation-failure" as const }
            : failed > 0
              ? { failure: "observation-partial" as const }
              : {}),
        },
        value: {
          siteObservation: site,
          siteObservationFile,
          runDir: portablePath(run.dir),
        },
      };
    },
  });

  if (!value) {
    throw new E2eError("observation produced no result", "observation-failure");
  }
  return value;
}
