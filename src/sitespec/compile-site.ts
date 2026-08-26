import { VIEWPORT_PROFILES, type ViewportId } from "../observer/types.js";
import type { SiteSpecInputs } from "./load-inputs.js";
import { compileFamilies } from "./compile-families.js";
import { compileRoutes } from "./compile-routes.js";
import { compilePage } from "./compile-page.js";
import { compileInteractions } from "./compile-interactions.js";
import { compileDynamicTemplate } from "./dynamic-template.js";
import { StyleCatalogBuilder } from "./style-catalog.js";
import { AssetCatalogBuilder } from "./asset-catalog.js";
import {
  ASSET_CATALOG_FILE,
  COMPILER_ENGINE,
  COMPILER_VERSION,
  INTERACTION_SPEC_FILE,
  LIMITATION_MESSAGES,
  LIMITATION_ORDER,
  PAGES_DIR,
  SCHEMA_VERSION,
  SITESPEC_VERSION,
  STYLE_CATALOG_FILE,
  SiteSpecSchema,
  sortLimitations,
  type AssetCatalog,
  type ElementSpecNode,
  type FamilySpec,
  type InteractionSpec,
  type LimitationCode,
  type PageSpec,
  type ResponsiveDifference,
  type RouteSpec,
  type SiteSpec,
  type StyleCatalog,
} from "./types.js";

/**
 * SiteSpec compilation (Task 13, items 8–11).
 *
 * This is the assembly point: routes from Task 06, families from Task 07/08,
 * pages from Task 09, behaviors from Task 11/12 — plus the content recovered
 * from each viewport's `rendered.html` — become one self-contained IR.
 *
 * The invariant that governs everything below is item 10: after this runs, a
 * reconstruction engine must never need to open a Task 09 `dom.json`, a Task 11
 * action file or a Task 12 pattern file again. Source paths are recorded, but
 * only as audit provenance; if a fact was needed for reconstruction, it was
 * COMPILED IN, not linked to.
 *
 * Determinism (item 9): nothing here reads a clock or a random source. Style and
 * asset ids come from lexical sorts of the complete key set, route ids from a
 * lexical sort of URLs, node ids from document order. Two compiles of the same
 * inputs produce byte-identical files.
 */

export interface CompiledSiteSpec {
  siteSpec: SiteSpec;
  styleCatalog: StyleCatalog;
  assetCatalog: AssetCatalog;
  interactionSpec: InteractionSpec;
  /** Sorted by `pageId`; each is written to `pages/<pageId>.json`. */
  pages: PageSpec[];
}

/** `pages/p000001.json`, relative to the SiteSpec root and always posix-style. */
export function pageSpecFile(pageId: string): string {
  return `${PAGES_DIR}/${pageId}.json`;
}

/** Directory part of a recorded path, normalized to forward slashes. */
function parentRef(recorded: string): string {
  const normalized = recorded.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? "." : normalized.slice(0, slash);
}

/**
 * Swap the canonical catalog KEYS recorded during page compilation for the final
 * `styleTokenId` / `assetId` values.
 *
 * Both catalogs number their entries from a lexical sort of the complete key
 * set, which cannot be known until every page is compiled. Keys are therefore
 * carried on the nodes and replaced here, once. A key that survives this pass
 * would be a dangling reference, and the validator rejects exactly that — so a
 * missed swap fails the compile instead of reaching an artifact.
 */
function resolveCatalogReferences(
  pages: readonly PageSpec[],
  styleIdByKey: ReadonlyMap<string, string>,
  assetIdByKey: ReadonlyMap<string, string>,
): void {
  const style = (key: string): string => {
    const id = styleIdByKey.get(key);
    if (id === undefined) throw new Error(`unresolved style catalog key`);
    return id;
  };
  const asset = (key: string): string => {
    const id = assetIdByKey.get(key);
    if (id === undefined) throw new Error(`unresolved asset catalog key`);
    return id;
  };

  for (const page of pages) {
    for (const viewportId of ["desktop", "mobile"] as const) {
      const viewport = page.viewports[viewportId];
      viewport.assetRefs = viewport.assetRefs.map(asset);
      for (const node of viewport.nodes) {
        if (node.type !== "element") continue;
        const element = node as ElementSpecNode;
        if (element.styleTokenId !== undefined) {
          element.styleTokenId = style(element.styleTokenId);
        }
        if (element.pseudo?.before) {
          element.pseudo.before.styleTokenId = style(element.pseudo.before.styleTokenId);
        }
        if (element.pseudo?.after) {
          element.pseudo.after.styleTokenId = style(element.pseudo.after.styleTokenId);
        }
        element.assetRefs = element.assetRefs.map(asset);
      }
    }
  }
}

function collectLimitationCodes(
  routes: readonly RouteSpec[],
  families: readonly FamilySpec[],
  pages: readonly PageSpec[],
  siteLimitations: readonly LimitationCode[],
): LimitationCode[] {
  const used = new Set<LimitationCode>(siteLimitations);
  for (const route of routes) for (const code of route.limitations) used.add(code);
  for (const family of families) for (const code of family.limitations) used.add(code);
  for (const page of pages) {
    for (const code of page.limitations) used.add(code);
    for (const viewportId of ["desktop", "mobile"] as const) {
      const viewport = page.viewports[viewportId];
      for (const code of viewport.limitations) used.add(code);
      for (const frame of viewport.frameInventory) {
        for (const code of frame.limitations) used.add(code);
      }
      for (const code of viewport.shadowInventory.limitations) used.add(code);
      for (const node of viewport.nodes) {
        if (node.type !== "element") continue;
        for (const code of node.limitations) used.add(code);
      }
    }
  }
  return LIMITATION_ORDER.filter((code) => used.has(code));
}

export async function compileSiteSpec(
  inputs: SiteSpecInputs,
): Promise<CompiledSiteSpec> {
  const successfulPages = inputs.siteObservation.pages.filter(
    (page) => page.status === "success",
  );

  const { families, familyIdByUrl, representativePageIdByFamily } = compileFamilies(
    inputs.pageFamilies,
    successfulPages,
  );

  // Task 12's page index lists exactly the pages Task 11 executed an action on,
  // which is the honest definition of "explored" (item 65).
  const exploredPageIds = new Set(inputs.patterns.pages.map((page) => page.pageId));

  const routes = compileRoutes({
    verifiedUrls: inputs.verifiedUrls,
    successfulPages,
    familyIdByUrl,
    representativePageIdByFamily,
    exploredPageIds,
  });

  // --- pages ------------------------------------------------------------------
  const styleBuilder = new StyleCatalogBuilder();
  const assetBuilder = new AssetCatalogBuilder(inputs.rootUrl);
  const familyTypeById = new Map(
    inputs.pageFamilies.families.map((family) => [family.id, family.type]),
  );
  const observationRunRef = parentRef(inputs.sourcePaths.siteObservation);

  const pages: PageSpec[] = [];
  for (const page of [...successfulPages].sort((a, b) =>
    a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0,
  )) {
    const familyType = familyTypeById.get(page.familyId) ?? page.familyType;
    const compiled = await compilePage({
      siteObservationDir: inputs.siteObservationDir,
      page,
      familyType,
      sourceObservationRef: `${observationRunRef}/${page.pageObservationFile}`,
      styleBuilder,
      assetBuilder,
    });
    pages.push(compiled.spec);
  }

  // --- dynamic target templates (Task 16, item 75) ----------------------------
  // Compiled BEFORE the catalogs are finalized, because a mounted region's
  // styles and assets belong in the SAME site-wide tables as the page tree's —
  // a menu that reuses a header button's computed style must not mint a second
  // token for it.
  const dynamicTemplates = new Map<string, ReturnType<typeof compileDynamicTemplate>>();
  for (const pattern of inputs.patterns.patterns) {
    const captured = inputs.dynamicTargetSubtrees.get(pattern.source.actionId);
    if (!captured) continue;
    dynamicTemplates.set(
      pattern.id,
      compileDynamicTemplate({
        captured,
        actionId: pattern.source.actionId,
        styleBuilder,
        assetBuilder,
        pageId: pattern.source.pageId,
      }),
    );
  }

  // Task 17 §4 — same policy for DISCOVERED user-visible target regions, keyed
  // `patternId|discoveryId` so one action's several regions stay distinct.
  const observedTargetTemplates = new Map<
    string,
    ReturnType<typeof compileDynamicTemplate>
  >();
  for (const pattern of inputs.patterns.patterns) {
    for (const record of pattern.observedTargets ?? []) {
      const captured = inputs.discoveredTargetSubtrees.get(
        `${pattern.source.actionId}|${record.discoveryId}`,
      );
      if (!captured) continue;
      observedTargetTemplates.set(
        `${pattern.id}|${record.discoveryId}`,
        compileDynamicTemplate({
          captured,
          actionId: pattern.source.actionId,
          styleBuilder,
          assetBuilder,
          pageId: pattern.source.pageId,
        }),
      );
    }
  }

  const { catalog: styleCatalog, idByKey: styleIdByKey } = styleBuilder.finalize();
  const { catalog: assetCatalog, idByKey: assetIdByKey } = assetBuilder.finalize();
  resolveCatalogReferences(pages, styleIdByKey, assetIdByKey);
  for (const template of [
    ...dynamicTemplates.values(),
    ...observedTargetTemplates.values(),
  ]) {
    for (const node of template.nodes) {
      if (node.styleTokenId !== undefined) {
        const id = styleIdByKey.get(node.styleTokenId);
        if (id === undefined) throw new Error("unresolved dynamic template style key");
        node.styleTokenId = id;
      }
      node.assetRefs = node.assetRefs.map((key) => {
        const id = assetIdByKey.get(key);
        if (id === undefined) throw new Error("unresolved dynamic template asset key");
        return id;
      });
    }
  }

  // --- interactions -----------------------------------------------------------
  const pagesById = new Map(pages.map((page) => [page.pageId, page]));
  const { spec: interactionSpec, byPage } = compileInteractions({
    patterns: inputs.patterns,
    unknowns: inputs.unknowns,
    ...(inputs.aiAnalysis ? { aiAnalysis: inputs.aiAnalysis } : {}),
    pages: pagesById,
    routes,
    exploredPageIds,
    dynamicTemplates,
    observedTargetTemplates,
  });

  for (const page of pages) {
    page.patternIds = (byPage.patternIds.get(page.pageId) ?? []).sort();
    page.unknownInteractionIds = (byPage.unknownIds.get(page.pageId) ?? []).sort();
    const inferred = byPage.inferenceIds.get(page.pageId);
    if (inputs.aiAnalysis) page.inferredInteractionIds = (inferred ?? []).sort();
    page.interactionCoverage = exploredPageIds.has(page.pageId)
      ? "explored"
      : "not-explored";
    if (page.interactionCoverage === "not-explored") {
      page.limitations = sortLimitations([
        ...page.limitations,
        "page-interactions-not-explored",
      ]);
    }
  }

  // --- stats ------------------------------------------------------------------
  const viewportOf = (page: PageSpec, id: ViewportId) => page.viewports[id];
  const sum = (fn: (page: PageSpec) => number): number =>
    pages.reduce((total, page) => total + fn(page), 0);

  const desktopElementNodeCount = sum((p) => viewportOf(p, "desktop").elementNodeCount);
  const mobileElementNodeCount = sum((p) => viewportOf(p, "mobile").elementNodeCount);
  const desktopTextNodeCount = sum((p) => viewportOf(p, "desktop").textNodeCount);
  const mobileTextNodeCount = sum((p) => viewportOf(p, "mobile").textNodeCount);
  const effectiveVisibleElementCount = sum(
    (p) =>
      viewportOf(p, "desktop").effectiveVisibleCount +
      viewportOf(p, "mobile").effectiveVisibleCount,
  );
  const totalElementNodes = desktopElementNodeCount + mobileElementNodeCount;
  const totalTextNodes = desktopTextNodeCount + mobileTextNodeCount;

  const viewportSpecs = pages.flatMap((page) => [
    viewportOf(page, "desktop"),
    viewportOf(page, "mobile"),
  ]);
  const alignedViewportCount = viewportSpecs.filter(
    (v) => v.contentRecovery.status === "aligned",
  ).length;

  // Supplemental attribute recovery, aggregated from the per-viewport counters
  // rather than recounted, so the site figure and the viewport figures cannot
  // drift apart (the validator asserts they agree).
  const supplementalAttributeNameCounts: Record<string, number> = {};
  for (const viewport of viewportSpecs) {
    for (const node of viewport.nodes) {
      if (node.type !== "element") continue;
      for (const name of node.recoveredAttributeNames ?? []) {
        supplementalAttributeNameCounts[name] =
          (supplementalAttributeNameCounts[name] ?? 0) + 1;
      }
    }
  }
  const sortedSupplementalNameCounts: Record<string, number> = {};
  for (const name of Object.keys(supplementalAttributeNameCounts).sort()) {
    sortedSupplementalNameCounts[name] = supplementalAttributeNameCounts[name]!;
  }

  const relationCount = viewportSpecs.reduce(
    (total, viewport) =>
      total +
      viewport.nodes.reduce(
        (nodeTotal, node) =>
          nodeTotal + (node.type === "element" ? node.relations.length : 0),
        0,
      ),
    0,
  );

  const responsiveDifferences: ResponsiveDifference[] = pages.map((page) => ({
    pageId: page.pageId,
    desktopElementNodes: viewportOf(page, "desktop").elementNodeCount,
    mobileElementNodes: viewportOf(page, "mobile").elementNodeCount,
    desktopTextNodes: viewportOf(page, "desktop").textNodeCount,
    mobileTextNodes: viewportOf(page, "mobile").textNodeCount,
    desktopEffectiveVisible: viewportOf(page, "desktop").effectiveVisibleCount,
    mobileEffectiveVisible: viewportOf(page, "mobile").effectiveVisibleCount,
    desktopDocumentHeight: viewportOf(page, "desktop").documentDimensions.documentHeight,
    mobileDocumentHeight: viewportOf(page, "mobile").documentDimensions.documentHeight,
  }));

  const exactObservedRouteCount = routes.filter(
    (r) => r.coverage === "exact-observed",
  ).length;
  const validationSampleRouteCount = routes.filter(
    (r) => r.coverage === "validation-sample-observed",
  ).length;
  const familyRepresentedRouteCount = routes.filter(
    (r) => r.coverage === "family-represented",
  ).length;

  const siteLimitations: LimitationCode[] = [
    "breakpoints-not-inferred",
    "cross-viewport-node-matching-not-performed",
    "original-stylesheet-source-not-compiled",
    "original-script-source-not-compiled",
    "assets-not-downloaded",
  ];

  const usedCodes = collectLimitationCodes(routes, families, pages, siteLimitations);
  const limitationGlossary: Record<string, string> = {};
  for (const code of usedCodes) limitationGlossary[code] = LIMITATION_MESSAGES[code];

  // Provenance ledger (item 100). Each number is a COUNT OF FACTS of one kind,
  // defined here so it can never drift into a vague quality score:
  //   observed — carried verbatim out of an earlier artifact
  //   derived  — computed by this compiler from observed values, with no AI
  //   inferred — AI proposals, and nothing else, ever
  const observedFactCount =
    totalElementNodes +
    totalTextNodes +
    assetCatalog.occurrenceCount +
    inputs.verifiedUrls.urls.length +
    interactionSpec.patterns.length +
    interactionSpec.unknownInteractions.length +
    // Recovered attributes are OBSERVED, not derived: each one was read
    // verbatim out of a rendered.html this pipeline saved (Task 13.1).
    viewportSpecs.reduce(
      (total, v) => total + v.contentRecovery.supplementalAttributeCount,
      0,
    );
  const derivedFactCount =
    routes.length +
    families.length +
    pages.length +
    styleCatalog.tokenCount +
    assetCatalog.assetCount +
    relationCount +
    interactionSpec.patterns.filter((p) => p.target !== undefined).length;

  const siteSpec = SiteSpecSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    siteSpecVersion: SITESPEC_VERSION,
    compilerVersion: COMPILER_VERSION,
    engine: COMPILER_ENGINE,
    rootUrl: inputs.rootUrl,
    source: {
      verifiedUrls: inputs.sourcePaths.verifiedUrls,
      verification: inputs.sourcePaths.verification,
      pageFamilies: inputs.sourcePaths.pageFamilies,
      selectedPages: inputs.sourcePaths.selectedPages,
      siteObservation: inputs.sourcePaths.siteObservation,
      interactionExploration: inputs.sourcePaths.interactionExploration,
      interactionPatterns: inputs.sourcePaths.interactionPatterns,
      unknownInteractions: inputs.sourcePaths.unknownInteractions,
      ...(inputs.sourcePaths.aiAnalysis
        ? { aiAnalysis: inputs.sourcePaths.aiAnalysis }
        : {}),
    },
    responsiveModel: {
      mode: "observed-endpoints",
      observedViewports: inputs.siteObservation.config.viewportProfiles.length
        ? inputs.siteObservation.config.viewportProfiles
        : [...VIEWPORT_PROFILES],
      inferredBreakpoints: [],
      limitations: sortLimitations([
        "breakpoints-not-inferred",
        "cross-viewport-node-matching-not-performed",
      ]),
    },
    stats: {
      routeCount: routes.length,
      familyCount: families.length,
      pageCount: pages.length,
      exactObservedRouteCount,
      validationSampleRouteCount,
      familyRepresentedRouteCount,
      exactObservationRate:
        routes.length > 0
          ? Number(
              ((exactObservedRouteCount + validationSampleRouteCount) / routes.length).toFixed(4),
            )
          : 0,
      representativePageCount: pages.filter((p) => p.role === "representative").length,
      validationPageCount: pages.filter((p) => p.role === "validation-sample").length,
      desktopElementNodeCount,
      mobileElementNodeCount,
      desktopTextNodeCount,
      mobileTextNodeCount,
      effectiveVisibleElementCount,
      hiddenElementCount: totalElementNodes - effectiveVisibleElementCount,
      viewportCount: viewportSpecs.length,
      alignedViewportCount,
      fallbackViewportCount: viewportSpecs.length - alignedViewportCount,
      cappedSourceTextCount: viewportSpecs.reduce(
        (total, v) => total + v.contentRecovery.cappedSourceTextCount,
        0,
      ),
      recoveredLongTextCount: viewportSpecs.reduce(
        (total, v) => total + v.contentRecovery.recoveredLongTextCount,
        0,
      ),
      supplementalAttributeCount: viewportSpecs.reduce(
        (total, v) => total + v.contentRecovery.supplementalAttributeCount,
        0,
      ),
      supplementalElementCount: viewportSpecs.reduce(
        (total, v) => total + v.contentRecovery.supplementalElementCount,
        0,
      ),
      supplementalAttributeNameCounts: sortedSupplementalNameCounts,
      styleTokenCount: styleCatalog.tokenCount,
      assetCount: assetCatalog.assetCount,
      frameCount: viewportSpecs.reduce((total, v) => total + v.frameInventory.length, 0),
      shadowHostCount: viewportSpecs.reduce(
        (total, v) => total + v.shadowInventory.hostNodeIds.length,
        0,
      ),
    },
    provenanceSummary: {
      observedFactCount,
      derivedFactCount,
      inferredFactCount: interactionSpec.inferredInteractions.length,
      hasAiInference: inputs.aiAnalysis !== undefined,
      verifiedPatternCount: interactionSpec.patterns.length,
      unknownCount: interactionSpec.unknownInteractions.length,
    },
    routes,
    families,
    pages: pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      role: page.role,
      familyId: page.familyId,
      file: pageSpecFile(page.pageId),
      interactionCoverage: page.interactionCoverage,
      desktopElementNodes: page.viewports.desktop.elementNodeCount,
      mobileElementNodes: page.viewports.mobile.elementNodeCount,
    })),
    responsiveDifferences,
    styleCatalogFile: STYLE_CATALOG_FILE,
    assetCatalogFile: ASSET_CATALOG_FILE,
    interactionSpecFile: INTERACTION_SPEC_FILE,
    limitations: sortLimitations(siteLimitations),
    limitationGlossary,
  } satisfies SiteSpec);

  return { siteSpec, styleCatalog, assetCatalog, interactionSpec, pages };
}
