import type { ElementSpecNode, PageSpec } from "../sitespec/index.js";
import { AssetResolver } from "./asset-resolver.js";
import { LinkRewriter } from "./link-rewriter.js";
import {
  compileRuntimePage,
  mergeCounters,
} from "./compile-runtime-page.js";
import { newCounters, type CompileCounters } from "./compile-node.js";
import {
  buildInteractionPlan,
  generateObservedTargetCss,
  type InteractionPlan,
} from "./interaction-bindings.js";
import { inferLayoutRules, type LayoutInferenceResult } from "./layout-inference.js";
import { inferBreakpoint } from "./responsive-plan.js";
import { buildRoutePlan, type RoutePlan } from "./route-plan.js";
import {
  DOCUMENT_ROOT_DROPPED_PROPERTIES,
  assertNoMissingStyleTokens,
  generateStylesheet,
  hasRenderableDeclarations,
  isSafeCssProperty,
  isSafeCssValue,
  type GeneratedStyles,
} from "./style-generator.js";
import { generatePseudoStyles, type GeneratedPseudoStyles } from "./pseudo-generator.js";
import type { ReconstructionInput } from "./load-input.js";
import {
  buildCorrectionPlan,
  type CorrectionPlan,
  type ReconstructionCorrections,
} from "./qa-corrections.js";
import {
  RUNTIME_PAGES_DIR,
  ReconstructionError,
  sortReconstructionLimitations,
  type BreakpointSpec,
  type ManifestBehavior,
  type ManifestCoverage,
  type ReconstructionLimitationCode,
  type RuntimePage,
} from "./types.js";

/**
 * The deterministic reconstruction plan (item 120).
 *
 * Everything the generator will write is decided HERE, before a single file is
 * created: routes, breakpoint, runtime page trees, CSS, asset bindings,
 * interaction bindings and every count that ends up in the manifest. Writing
 * files is then a mechanical dump of this object, which is what makes
 * `--plan-only` a real mode rather than a debug flag, and what makes
 * byte-identical output easy to guarantee instead of easy to hope for (item 12).
 *
 * The plan never touches the filesystem and never reaches the network.
 */

export interface ReconstructionPlan {
  rootUrl: string;
  breakpoint: BreakpointSpec;
  routes: RoutePlan;
  /** Compiled runtime pages, in `pageId` order. */
  pages: RuntimePage[];
  /** `pageId` → runtime page file, relative to `reconstruction-data/`. */
  pageFiles: Map<string, string>;
  styles: GeneratedStyles;
  pseudoStyles: GeneratedPseudoStyles;
  /** Task 17 §9/§10 — recovered layout rules + their CSS tier. */
  layout: LayoutInferenceResult;
  /** Task 17 §5 — observed open-state paint (reveal roots + descendant graft). */
  observedTargetCss: string;
  interactions: InteractionPlan;
  counters: CompileCounters;
  coverage: ManifestCoverage;
  behavior: ManifestBehavior;
  limitations: ReconstructionLimitationCode[];
  /** SiteSpec limitation codes, carried forward untouched (item 192). */
  sourceLimitations: string[];
  sourceLimitationGlossary: Record<string, string>;
  /**
   * Task 15 corrections, present ONLY when a correction set was supplied. A
   * baseline reconstruction leaves this undefined and is byte-identical to the
   * Task 14 output (item 114).
   */
  corrections?: CorrectionPlan;
  /** Provenance for the corrected manifest (item 116). */
  correctionProvenance?: {
    sourceQaRun: string;
    correctionSet: string;
    sourceSiteSpec?: string;
    correctionCount: number;
  };
}

export interface PlanReconstructionOptions {
  breakpointOverride?: number;
  /** Opt-in only. Absent means "generate the Task 14 baseline" (item 113). */
  corrections?: ReconstructionCorrections;
}

/** Runtime page file name for a page id. Relative, `..`-free (item 112). */
export function runtimePageFile(pageId: string): string {
  return `${RUNTIME_PAGES_DIR}/${pageId}.json`;
}

function collectSourceLimitations(input: ReconstructionInput): {
  codes: string[];
  glossary: Record<string, string>;
} {
  const codes = new Set<string>(input.siteSpec.limitations);
  for (const route of input.siteSpec.routes) {
    for (const code of route.limitations) codes.add(code);
  }
  for (const family of input.siteSpec.families) {
    for (const code of family.limitations) codes.add(code);
  }
  for (const page of input.pages) {
    for (const code of page.limitations) codes.add(code);
    for (const viewport of [page.viewports.desktop, page.viewports.mobile]) {
      for (const code of viewport.limitations) codes.add(code);
      for (const frame of viewport.frameInventory) {
        for (const code of frame.limitations) codes.add(code);
      }
      for (const code of viewport.shadowInventory.limitations) codes.add(code);
    }
  }
  for (const pattern of input.interactionSpec.patterns) {
    for (const code of pattern.limitations) codes.add(code);
  }
  for (const unknown of input.interactionSpec.unknownInteractions) {
    for (const code of unknown.limitations) codes.add(code);
  }

  const sorted = [...codes].sort();
  const glossary: Record<string, string> = {};
  for (const code of sorted) {
    const message = input.siteSpec.limitationGlossary[code];
    if (message !== undefined) glossary[code] = message;
  }
  return { codes: sorted, glossary };
}

function coverageOf(input: ReconstructionInput): ManifestCoverage {
  const coverage: ManifestCoverage = {
    exactObservedRoutes: 0,
    validationObservedRoutes: 0,
    familyRepresentedRoutes: 0,
    exactBehaviorRoutes: 0,
    representedBehaviorRoutes: 0,
    unexploredBehaviorRoutes: 0,
    routesWithoutBehaviorEvidence: 0,
  };
  for (const route of input.siteSpec.routes) {
    if (route.coverage === "exact-observed") coverage.exactObservedRoutes++;
    else if (route.coverage === "validation-sample-observed") {
      coverage.validationObservedRoutes++;
    } else coverage.familyRepresentedRoutes++;

    switch (route.behaviorCoverage) {
      case "exact-verified":
        coverage.exactBehaviorRoutes++;
        break;
      case "family-represented-unverified":
        coverage.representedBehaviorRoutes++;
        break;
      case "exact-not-explored":
        coverage.unexploredBehaviorRoutes++;
        break;
      default:
        coverage.routesWithoutBehaviorEvidence++;
    }
  }
  return coverage;
}

export function planReconstruction(
  input: ReconstructionInput,
  options: PlanReconstructionOptions = {},
): ReconstructionPlan {
  const corrections = buildCorrectionPlan(options.corrections);
  const breakpoint = inferBreakpoint(input.siteSpec, {
    ...(options.breakpointOverride !== undefined
      ? { override: options.breakpointOverride }
      : {}),
  });

  // --- routes ---------------------------------------------------------------
  const pageTitleById = new Map(
    input.pages.map((page) => [page.pageId, page.documentMetadata.title]),
  );
  const routes = buildRoutePlan(input.siteSpec, pageTitleById, {
    pageFileFor: runtimePageFile,
  });

  // --- interactions ---------------------------------------------------------
  const pageById = new Map(input.pages.map((page) => [page.pageId, page]));
  const nodeIndexCache = new Map<string, Map<string, ElementSpecNode>>();
  const nodeLookup = (
    pageId: string,
    viewportId: string,
    nodeId: string,
  ): ElementSpecNode | undefined => {
    const key = `${pageId}|${viewportId}`;
    let index = nodeIndexCache.get(key);
    if (!index) {
      const page = pageById.get(pageId);
      if (!page) return undefined;
      const viewport =
        viewportId === "desktop" ? page.viewports.desktop : page.viewports.mobile;
      index = new Map(
        viewport.nodes
          .filter((node): node is ElementSpecNode => node.type === "element")
          .map((node) => [node.nodeId, node]),
      );
      nodeIndexCache.set(key, index);
    }
    return index.get(nodeId);
  };
  const styleById = new Map(
    input.styleCatalog.styles.map((token) => [token.styleTokenId, token.properties]),
  );
  const interactions = buildInteractionPlan({
    interactionSpec: input.interactionSpec,
    nodeLookup,
    styleLookup: (styleTokenId) => styleById.get(styleTokenId),
  });

  // --- pages ----------------------------------------------------------------
  const assets = new AssetResolver({
    assetCatalog: input.assetCatalog,
    rootUrl: input.siteSpec.rootUrl,
  });
  const links = new LinkRewriter({
    rootUrl: input.siteSpec.rootUrl,
    routeKeys: new Set(routes.byKey.keys()),
  });

  /*
   * Which style tokens actually produce a rule (Task 16).
   *
   * Computed ONCE from the catalog with the SAME predicate the stylesheet
   * writer uses, and consulted by the node compiler before it puts a class on
   * an element. Task 14 assumed every token yields a rule; stripe.com's
   * `<video><source>` — an element Chromium never lays out, whose computed
   * style is empty — is the first case in the corpus where that is false.
   */
  const docRootSkip = new Set(DOCUMENT_ROOT_DROPPED_PROPERTIES);
  const renderableStyleTokens = new Set<string>();
  const renderableDocumentRootTokens = new Set<string>();
  for (const token of input.styleCatalog.styles) {
    if (hasRenderableDeclarations(token.properties)) {
      renderableStyleTokens.add(token.styleTokenId);
    }
    if (hasRenderableDeclarations(token.properties, docRootSkip)) {
      renderableDocumentRootTokens.add(token.styleTokenId);
    }
  }
  const styleRenders = (styleTokenId: string, documentRoot?: boolean): boolean =>
    documentRoot === true
      ? renderableDocumentRootTokens.has(styleTokenId)
      : renderableStyleTokens.has(styleTokenId);

  const counters = newCounters();
  const documentRootTokens = new Set<string>();
  const pages: RuntimePage[] = [];
  const pageFiles = new Map<string, string>();

  /*
   * Only pages some route renders from are compiled. In the corpus that is every
   * page, because Task 13 assigns every verified URL a render source — but a
   * SiteSpec whose page is unreachable should not silently ship a runtime file
   * nothing can load.
   */
  for (const pageId of routes.usedPageIds) {
    const page: PageSpec | undefined = pageById.get(pageId);
    if (!page) {
      throw new ReconstructionError(
        `route table names render source page ${pageId}, which is not in the SiteSpec`,
      );
    }
    const compiled = compileRuntimePage({
      page,
      assets,
      links,
      interactions,
      styleRenders,
      ...(corrections ? { corrections } : {}),
    });
    pages.push(compiled.page);
    pageFiles.set(pageId, runtimePageFile(pageId));
    mergeCounters(counters, compiled.counters);
    for (const token of compiled.documentRootTokens) documentRootTokens.add(token);
  }

  // --- styles ---------------------------------------------------------------
  // Task 17.1: template nodes (declared dynamic + observed-target mounts)
  // exist only after a click, so their style tokens never pass through
  // `compile-node`. Without this union their `.wr-stXXXXXX` classes had no
  // emitted rule and every mounted region rendered unstyled — a fixed
  // full-screen overlay collapsed into an in-flow text column.
  for (const token of interactions.templateStyleTokens) {
    counters.usedStyleTokens.add(token);
  }
  const usedTokenIds = [...counters.usedStyleTokens].sort();
  const styles = generateStylesheet({
    styleCatalog: input.styleCatalog,
    usedTokenIds,
    documentRootTokenIds: [...documentRootTokens].sort(),
  });
  assertNoMissingStyleTokens(styles);
  const pseudoStyles = generatePseudoStyles(
    counters.pseudoRules,
    input.styleCatalog,
  );
  if (pseudoStyles.missingTokens.length > 0) {
    throw new ReconstructionError(
      `${pseudoStyles.missingTokens.length} pseudo style token(s) are absent from the ` +
        `SiteSpec style catalog: ${pseudoStyles.missingTokens.slice(0, 5).join(", ")}`,
    );
  }

  // --- recovered layout rules (Task 17 §9/§10) -------------------------------
  // Deterministic inference over the multi-width probe + authored evidence.
  // Failure to recover anything is the normal fallback: the exact computed CSS
  // stands untouched and the page generates exactly as before.
  const stylePropertiesByToken = new Map(
    input.styleCatalog.styles.map((token) => [token.styleTokenId, token.properties]),
  );
  const layout = inferLayoutRules({
    pages: input.pages,
    styleLookup: (styleTokenId) => stylePropertiesByToken.get(styleTokenId),
    breakpoint: breakpoint.value,
  });

  // Task 17 §5 — observed open-state paint: the reveal roots plus the aligned
  // descendant diff graft, generated here where the style catalog lives.
  const observedTargetCss = generateObservedTargetCss(
    interactions,
    (styleTokenId) => stylePropertiesByToken.get(styleTokenId),
    { property: isSafeCssProperty, value: isSafeCssValue },
  );

  // --- honesty --------------------------------------------------------------
  const limitations = new Set<ReconstructionLimitationCode>([
    ...counters.limitations,
    ...interactions.limitations,
    "document-root-adapted-for-nextjs",
    "source-head-not-reconstructed",
    "font-source-binding-unverified",
    // True for `--breakpoint N` too: an operator's number is not an observation
    // either, and the manifest's `provenance` field is where the two differ.
    "breakpoint-inferred",
  ]);
  const coverage = coverageOf(input);
  if (coverage.familyRepresentedRoutes > 0) {
    limitations.add("family-represented-route");
    limitations.add("behavior-implementation-reused-from-representative");
  }
  if (coverage.unexploredBehaviorRoutes > 0) {
    limitations.add("route-behavior-not-explored");
  }
  if (input.siteSpec.stats.shadowHostCount > 0) {
    limitations.add("shadow-content-not-observed");
  }
  if (input.siteSpec.stats.frameCount > 0) {
    limitations.add("frame-content-not-observed");
  }
  if (layout.rules.length > 0) {
    limitations.add("layout-rule-inferred");
  }

  const source = collectSourceLimitations(input);

  const behavior: ManifestBehavior = {
    sourcePatternInstances: interactions.sourcePatternInstances,
    runtimeBindings: interactions.bindings.size,
    nativeBindings: interactions.nativeBindings,
    scriptedBindings: interactions.scriptedBindings,
    unsupportedPatterns: interactions.unsupported.length,
    byPatternType: sortRecord(interactions.byPatternType),
    byMechanism: sortRecord(interactions.byMechanism),
    unknownSourceInstances: interactions.unknownSourceInstances,
    unknownAnnotations: interactions.unknowns.size,
    unknownBehaviorsImplemented: 0,
    observedTargetBindings: interactions.observedTargetBindings,
    observedTargetsRevealed: interactions.observedTargetsRevealed,
    observedTargetsWithContent: interactions.observedTargetsWithContent,
    observedTargetsUnresolved: interactions.observedTargetsUnresolved,
    observedTargetsHostMounted: interactions.observedTargetsHostMounted,
    observedTargetsCaptureExpanded: interactions.observedTargetsCaptureExpanded,
  };

  return {
    rootUrl: input.siteSpec.rootUrl,
    breakpoint,
    routes,
    pages,
    pageFiles,
    styles,
    pseudoStyles,
    layout,
    observedTargetCss,
    interactions,
    counters,
    coverage,
    behavior,
    limitations: sortReconstructionLimitations(limitations),
    sourceLimitations: source.codes,
    sourceLimitationGlossary: source.glossary,
    ...(corrections ? { corrections } : {}),
    ...(options.corrections
      ? {
          correctionProvenance: {
            sourceQaRun: options.corrections.sourceQaRun,
            correctionSet: options.corrections.correctionSet,
            ...(options.corrections.sourceSiteSpec !== undefined
              ? { sourceSiteSpec: options.corrections.sourceSiteSpec }
              : {}),
            correctionCount: options.corrections.corrections.length,
          },
        }
      : {}),
  };
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key]!;
  return out;
}
