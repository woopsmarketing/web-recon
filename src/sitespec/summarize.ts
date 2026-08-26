import type { SiteSpecBundle } from "./validate-sitespec.js";

/**
 * Deterministic reporting figures for a compiled SiteSpec (Task 13, items
 * 102–108).
 *
 * Everything here is a pure function of the bundle, so the CLI's output and the
 * report's tables are the same numbers computed once. Coverage is reported on
 * TWO axes on purpose (item 127): route coverage is always 100% by construction
 * — every verified URL is in the table — while exact-observation coverage is the
 * far smaller fraction that was actually loaded in a browser. Collapsing them
 * into one "coverage" number would make a 37%-observed site look complete.
 */

export interface SiteSpecSummary {
  rootUrl: string;

  routes: {
    total: number;
    exactObserved: number;
    validationSampleObserved: number;
    familyRepresented: number;
    /** Always 1: every verified URL is present. */
    routeCoverage: number;
    /** `(exact + validation) / total` — a different, much smaller number. */
    exactObservationCoverage: number;
  };

  families: {
    total: number;
    withObservedRepresentative: number;
    largestMemberCount: number;
  };

  pages: {
    total: number;
    representative: number;
    validationSample: number;
    explored: number;
    notExplored: number;
  };

  content: {
    viewports: number;
    aligned: number;
    fallback: number;
    desktopElementNodes: number;
    mobileElementNodes: number;
    desktopTextNodes: number;
    mobileTextNodes: number;
    effectiveVisibleElements: number;
    hiddenElements: number;
    cappedSourceTexts: number;
    recoveredLongTexts: number;
    longestTextLength: number;
  };

  styles: {
    sourceLocalRecords: number;
    sourceReferences: number;
    globalTokens: number;
    dedupReductionRate: number;
    nodesWithStyleToken: number;
  };

  assets: {
    occurrences: number;
    unique: number;
    kindCounts: Record<string, number>;
    inlineSvgSanitized: number;
  };

  interactions: {
    patterns: number;
    unknowns: number;
    inferred: number;
    patternTypeCounts: Record<string, number>;
    unknownReasonCounts: Record<string, number>;
    staticTriggers: number;
    staticTargets: number;
    dynamicTargets: number;
    withoutTarget: number;
    routesExactBehavior: number;
    routesRepresentedBehavior: number;
    routesNoBehavior: number;
  };

  frames: number;
  shadowHosts: number;
}

export function summarizeSiteSpec(bundle: SiteSpecBundle): SiteSpecSummary {
  const { siteSpec, styleCatalog, assetCatalog, interactionSpec, pages } = bundle;

  const viewports = pages.flatMap((page) => [
    page.viewports.desktop,
    page.viewports.mobile,
  ]);
  const aligned = viewports.filter((v) => v.contentRecovery.status === "aligned").length;

  let nodesWithStyleToken = 0;
  let longestTextLength = 0;
  for (const viewport of viewports) {
    if (viewport.contentRecovery.longestTextLength > longestTextLength) {
      longestTextLength = viewport.contentRecovery.longestTextLength;
    }
    for (const node of viewport.nodes) {
      if (node.type === "element" && node.styleTokenId !== undefined) {
        nodesWithStyleToken++;
      }
    }
  }

  return {
    rootUrl: siteSpec.rootUrl,
    routes: {
      total: siteSpec.stats.routeCount,
      exactObserved: siteSpec.stats.exactObservedRouteCount,
      validationSampleObserved: siteSpec.stats.validationSampleRouteCount,
      familyRepresented: siteSpec.stats.familyRepresentedRouteCount,
      routeCoverage: siteSpec.stats.routeCount > 0 ? 1 : 0,
      exactObservationCoverage: siteSpec.stats.exactObservationRate,
    },
    families: {
      total: siteSpec.stats.familyCount,
      withObservedRepresentative: siteSpec.families.filter(
        (family) => family.representativePageId !== undefined,
      ).length,
      largestMemberCount: siteSpec.families.reduce(
        (max, family) => Math.max(max, family.memberCount),
        0,
      ),
    },
    pages: {
      total: siteSpec.stats.pageCount,
      representative: siteSpec.stats.representativePageCount,
      validationSample: siteSpec.stats.validationPageCount,
      explored: interactionSpec.summary.pagesExplored,
      notExplored: interactionSpec.summary.pagesNotExplored,
    },
    content: {
      viewports: viewports.length,
      aligned,
      fallback: viewports.length - aligned,
      desktopElementNodes: siteSpec.stats.desktopElementNodeCount,
      mobileElementNodes: siteSpec.stats.mobileElementNodeCount,
      desktopTextNodes: siteSpec.stats.desktopTextNodeCount,
      mobileTextNodes: siteSpec.stats.mobileTextNodeCount,
      effectiveVisibleElements: siteSpec.stats.effectiveVisibleElementCount,
      hiddenElements: siteSpec.stats.hiddenElementCount,
      cappedSourceTexts: siteSpec.stats.cappedSourceTextCount,
      recoveredLongTexts: siteSpec.stats.recoveredLongTextCount,
      longestTextLength,
    },
    styles: {
      sourceLocalRecords: styleCatalog.sourceLocalStyleRecordCount,
      sourceReferences: styleCatalog.sourceStyleReferenceCount,
      globalTokens: styleCatalog.tokenCount,
      dedupReductionRate: styleCatalog.dedupReductionRate,
      nodesWithStyleToken,
    },
    assets: {
      occurrences: assetCatalog.occurrenceCount,
      unique: assetCatalog.assetCount,
      kindCounts: assetCatalog.kindCounts,
      inlineSvgSanitized: assetCatalog.assets.filter(
        (asset) => asset.inlineSvg?.sanitized === true,
      ).length,
    },
    interactions: {
      patterns: interactionSpec.summary.verifiedPatternCount,
      unknowns: interactionSpec.summary.unknownInteractionCount,
      inferred: interactionSpec.summary.inferredInteractionCount,
      patternTypeCounts: interactionSpec.summary.patternTypeCounts,
      unknownReasonCounts: interactionSpec.summary.unknownReasonCounts,
      staticTriggers: interactionSpec.summary.patternsWithStaticTrigger,
      staticTargets: interactionSpec.summary.patternsWithStaticTarget,
      dynamicTargets: interactionSpec.summary.patternsWithDynamicTarget,
      withoutTarget: interactionSpec.summary.patternsWithoutTarget,
      routesExactBehavior: interactionSpec.summary.routesWithExactBehaviorEvidence,
      routesRepresentedBehavior: interactionSpec.summary.routesWithRepresentedBehavior,
      routesNoBehavior: interactionSpec.summary.routesWithoutBehaviorEvidence,
    },
    frames: siteSpec.stats.frameCount,
    shadowHosts: siteSpec.stats.shadowHostCount,
  };
}
