import {
  SUPPLEMENTAL_ATTRIBUTES,
  type AssetCatalog,
  type InteractionSpec,
  type PageSpec,
  type SiteSpec,
  type StyleCatalog,
} from "./types.js";

/**
 * SiteSpec invariants (Task 13, items 74, 75, 99).
 *
 * These run BEFORE anything is written and again after `loadSiteSpec()` reads it
 * back, which is the point: the same predicate defines "a valid SiteSpec" for
 * the producer and for the consumer, so Task 14 cannot be handed a file this
 * compiler would have rejected.
 *
 * The checks are deliberately about REFERENTIAL TRUTH rather than plausibility.
 * A SiteSpec whose style tokens dangle, whose parent links form a forest with an
 * orphan, or whose confirmed pattern points at a node that is not in the tree
 * would still deserialize perfectly and would produce a broken reconstruction
 * that is very hard to trace back here. So every id in the artifact is resolved
 * against the thing it claims to name, and every internal file reference is
 * proven to be relative and inside the SiteSpec root.
 *
 * Every violation is collected rather than thrown on sight: one run should tell
 * you everything that is wrong, not the first thing.
 */

export interface SiteSpecBundle {
  siteSpec: SiteSpec;
  styleCatalog: StyleCatalog;
  assetCatalog: AssetCatalog;
  interactionSpec: InteractionSpec;
  pages: readonly PageSpec[];
}

export interface ValidateOptions {
  /**
   * Task 06's verified URL set. Supplied at COMPILE time to prove the route
   * table is exactly the verified set — the consumer cannot check this, because
   * checking it would mean reading outside the SiteSpec root (item 73).
   */
  expectedVerifiedUrls?: readonly string[];
  /** Task 09's successful page ids, for the same reason. */
  expectedPageIds?: readonly string[];
  /** Task 12's confirmed pattern ids. */
  expectedPatternIds?: readonly string[];
  /** Task 12's unknown case ids. */
  expectedUnknownIds?: readonly string[];
}

export class SiteSpecValidationError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(
      `SiteSpec failed ${violations.length} invariant(s):\n  - ${violations.join("\n  - ")}`,
    );
    this.name = "SiteSpecValidationError";
  }
}

/** A file reference must be relative, inside the root, and separator-normalized. */
function badFileReference(reference: string): string | undefined {
  if (reference === "") return "is empty";
  if (reference.startsWith("/") || /^[A-Za-z]:[\\/]/.test(reference)) {
    return "is an absolute filesystem path";
  }
  if (reference.includes("\\")) return "uses a backslash separator";
  const segments = reference.split("/");
  if (segments.includes("..")) return "escapes the SiteSpec root with `..`";
  return undefined;
}

export function validateSiteSpec(
  bundle: SiteSpecBundle,
  options: ValidateOptions = {},
): string[] {
  const violations: string[] = [];
  const { siteSpec, styleCatalog, assetCatalog, interactionSpec, pages } = bundle;
  const fail = (message: string): void => {
    violations.push(message);
  };

  // --- internal file references (items 74) ------------------------------------
  const fileRefs: Array<[string, string]> = [
    ["styleCatalogFile", siteSpec.styleCatalogFile],
    ["assetCatalogFile", siteSpec.assetCatalogFile],
    ["interactionSpecFile", siteSpec.interactionSpecFile],
    ...siteSpec.pages.map(
      (page) => [`pages[${page.pageId}].file`, page.file] as [string, string],
    ),
  ];
  for (const [label, reference] of fileRefs) {
    const problem = badFileReference(reference);
    if (problem) fail(`internal file reference ${label} (${reference}) ${problem}`);
  }
  // Audit-only provenance may point anywhere the run came from, but it must
  // still never carry a machine-absolute path into a shareable artifact.
  for (const [label, value] of Object.entries(siteSpec.source)) {
    if (typeof value !== "string") continue;
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
      fail(`source.${label} is an absolute filesystem path (${value})`);
    }
  }
  for (const page of pages) {
    if (
      page.sourceObservation.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(page.sourceObservation)
    ) {
      fail(`page ${page.pageId} sourceObservation is an absolute path`);
    }
  }

  // --- routes (items 13, 17) ---------------------------------------------------
  const routeIds = new Set<string>();
  const routeUrls = new Set<string>();
  for (const route of siteSpec.routes) {
    if (routeIds.has(route.routeId)) fail(`duplicate routeId ${route.routeId}`);
    routeIds.add(route.routeId);
    if (routeUrls.has(route.url)) fail(`duplicate route url ${route.url}`);
    routeUrls.add(route.url);
  }
  const sortedRouteUrls = [...siteSpec.routes].map((r) => r.url);
  const lexical = [...sortedRouteUrls].sort();
  for (let i = 0; i < sortedRouteUrls.length; i++) {
    if (sortedRouteUrls[i] !== lexical[i]) {
      fail("routes are not in normalized-URL lexical order (route ids are not deterministic)");
      break;
    }
  }
  if (options.expectedVerifiedUrls) {
    const expected = new Set(options.expectedVerifiedUrls);
    for (const url of expected) {
      if (!routeUrls.has(url)) fail(`verified URL missing from the route table: ${url}`);
    }
    for (const url of routeUrls) {
      if (!expected.has(url)) fail(`route table holds a non-verified URL: ${url}`);
    }
  }

  // --- families (item 18) ------------------------------------------------------
  const familyIds = new Set<string>();
  const memberOwner = new Map<string, string>();
  for (const family of siteSpec.families) {
    if (familyIds.has(family.familyId)) fail(`duplicate familyId ${family.familyId}`);
    familyIds.add(family.familyId);
    if (family.memberUrls.length !== family.memberCount) {
      fail(
        `family ${family.familyId} declares memberCount ${family.memberCount} but lists ${family.memberUrls.length} urls`,
      );
    }
    if (
      family.exactObservedMemberCount + family.representedOnlyMemberCount !==
      family.memberCount
    ) {
      fail(`family ${family.familyId} member arithmetic does not add up`);
    }
    for (const url of family.memberUrls) {
      const owner = memberOwner.get(url);
      if (owner !== undefined) {
        fail(`url ${url} belongs to two families (${owner} and ${family.familyId})`);
      }
      memberOwner.set(url, family.familyId);
      if (!routeUrls.has(url)) fail(`family member ${url} has no route`);
    }
  }
  for (const route of siteSpec.routes) {
    if (!familyIds.has(route.familyId)) {
      fail(`route ${route.routeId} references unknown family ${route.familyId}`);
    }
    if (memberOwner.get(route.url) !== route.familyId) {
      fail(
        `route ${route.routeId} claims family ${route.familyId} but that family does not list its url`,
      );
    }
  }

  // --- pages -------------------------------------------------------------------
  const pageIds = new Set<string>();
  for (const page of pages) {
    if (pageIds.has(page.pageId)) fail(`duplicate pageId ${page.pageId}`);
    pageIds.add(page.pageId);
  }
  if (options.expectedPageIds) {
    for (const pageId of options.expectedPageIds) {
      if (!pageIds.has(pageId)) {
        fail(`successful Task 09 page ${pageId} was not compiled into a PageSpec`);
      }
    }
    const expected = new Set(options.expectedPageIds);
    for (const pageId of pageIds) {
      if (!expected.has(pageId)) fail(`PageSpec ${pageId} has no successful source page`);
    }
  }
  const indexedPageIds = new Set(siteSpec.pages.map((p) => p.pageId));
  for (const pageId of pageIds) {
    if (!indexedPageIds.has(pageId)) fail(`PageSpec ${pageId} is missing from site-spec.json`);
  }
  for (const pageId of indexedPageIds) {
    if (!pageIds.has(pageId)) fail(`site-spec.json indexes a missing PageSpec ${pageId}`);
  }
  for (const route of siteSpec.routes) {
    if (route.pageId !== undefined && !pageIds.has(route.pageId)) {
      fail(`route ${route.routeId} references unknown page ${route.pageId}`);
    }
    if (route.renderSourcePageId !== undefined && !pageIds.has(route.renderSourcePageId)) {
      fail(`route ${route.routeId} renderSourcePageId ${route.renderSourcePageId} does not exist`);
    }
    if (
      route.behaviorSourcePageId !== undefined &&
      !pageIds.has(route.behaviorSourcePageId)
    ) {
      fail(`route ${route.routeId} behaviorSourcePageId ${route.behaviorSourcePageId} does not exist`);
    }
    // An "observed" claim must be backed by this exact URL's own PageSpec.
    if (route.observedOnThisExactUrl !== (route.pageId !== undefined)) {
      fail(`route ${route.routeId} observedOnThisExactUrl disagrees with its pageId`);
    }
    if (route.coverage === "family-represented" && route.pageId !== undefined) {
      fail(`route ${route.routeId} is family-represented but carries its own pageId`);
    }
    if (route.coverage !== "family-represented" && route.pageId === undefined) {
      fail(`route ${route.routeId} claims coverage ${route.coverage} without a pageId`);
    }
  }
  for (const family of siteSpec.families) {
    if (
      family.representativePageId !== undefined &&
      !pageIds.has(family.representativePageId)
    ) {
      fail(`family ${family.familyId} representativePageId does not exist`);
    }
    for (const pageId of family.observedVariantPageIds) {
      if (!pageIds.has(pageId)) {
        fail(`family ${family.familyId} lists unknown observed page ${pageId}`);
      }
    }
  }

  // --- node trees (item 99) ----------------------------------------------------
  const styleTokenIds = new Set(styleCatalog.styles.map((s) => s.styleTokenId));
  const assetIds = new Set(assetCatalog.assets.map((a) => a.assetId));
  /** page|viewport → element node ids, for the interaction join below. */
  const elementNodeIndex = new Map<string, Set<string>>();
  let viewportSupplementalAttributes = 0;
  let viewportSupplementalElements = 0;

  for (const page of pages) {
    for (const viewportId of ["desktop", "mobile"] as const) {
      const viewport = page.viewports[viewportId];
      const label = `${page.pageId}/${viewportId}`;
      if (viewport.profile.id !== viewportId) {
        fail(`${label} carries a ${viewport.profile.id} profile`);
      }

      const nodeIds = new Set<string>();
      const elementNodeIds = new Set<string>();
      const sourceElementIds = new Set<string>();
      const childOwner = new Map<string, string>();
      let supplementalAttributes = 0;
      let supplementalElements = 0;
      const supplementalNames = new Set<string>();

      for (const node of viewport.nodes) {
        if (nodeIds.has(node.nodeId)) fail(`${label} duplicate nodeId ${node.nodeId}`);
        nodeIds.add(node.nodeId);
        if (node.type === "element") {
          elementNodeIds.add(node.nodeId);
          if (sourceElementIds.has(node.sourceElementId)) {
            fail(`${label} duplicate sourceElementId ${node.sourceElementId}`);
          }
          sourceElementIds.add(node.sourceElementId);
        }
      }
      elementNodeIndex.set(`${page.pageId}|${viewportId}`, elementNodeIds);

      if (viewport.rootNodeIds.length === 0 && viewport.nodes.length > 0) {
        fail(`${label} has nodes but no root`);
      }
      for (const rootId of viewport.rootNodeIds) {
        if (!nodeIds.has(rootId)) fail(`${label} root ${rootId} is not in nodes[]`);
      }

      for (const node of viewport.nodes) {
        if (node.type === "text") {
          if (!nodeIds.has(node.parentNodeId)) {
            fail(`${label} text node ${node.nodeId} has unknown parent ${node.parentNodeId}`);
          }
          continue;
        }
        if (node.parentNodeId !== undefined && !nodeIds.has(node.parentNodeId)) {
          fail(`${label} node ${node.nodeId} has unknown parent ${node.parentNodeId}`);
        }
        if (node.parentNodeId === undefined && !viewport.rootNodeIds.includes(node.nodeId)) {
          fail(`${label} node ${node.nodeId} has no parent and is not a root`);
        }
        for (const childId of node.childNodeIds) {
          if (!nodeIds.has(childId)) {
            fail(`${label} node ${node.nodeId} references unknown child ${childId}`);
          }
          const owner = childOwner.get(childId);
          if (owner !== undefined) {
            fail(`${label} node ${childId} appears under two parents (${owner}, ${node.nodeId})`);
          }
          childOwner.set(childId, node.nodeId);
        }
        if (node.styleTokenId !== undefined && !styleTokenIds.has(node.styleTokenId)) {
          fail(`${label} node ${node.nodeId} has dangling styleTokenId ${node.styleTokenId}`);
        }
        if (node.styleTokenId === undefined) {
          fail(`${label} element node ${node.nodeId} has no style token`);
        }
        for (const pseudo of [node.pseudo?.before, node.pseudo?.after]) {
          if (pseudo && !styleTokenIds.has(pseudo.styleTokenId)) {
            fail(`${label} node ${node.nodeId} pseudo has dangling styleTokenId`);
          }
        }
        for (const ref of node.assetRefs) {
          if (!assetIds.has(ref)) {
            fail(`${label} node ${node.nodeId} has dangling assetRef ${ref}`);
          }
        }
        for (const relation of node.relations) {
          if (relation.resolved !== (relation.resolvedNodeId !== undefined)) {
            fail(`${label} node ${node.nodeId} relation ${relation.type} resolved flag disagrees with its target`);
          }
          if (relation.resolvedNodeId !== undefined && !elementNodeIds.has(relation.resolvedNodeId)) {
            fail(`${label} node ${node.nodeId} relation resolves outside this viewport`);
          }
        }

        // --- supplemental attribute provenance (Task 13.1, items 6, 11, 13) --
        // Value semantics are a property of the attribute, so this holds for
        // every node whatever channel supplied the attribute.
        for (const [name, value] of Object.entries(node.attributes)) {
          if (SUPPLEMENTAL_ATTRIBUTES[name] === "boolean" && value !== "") {
            fail(
              `${label} node ${node.nodeId} stores boolean attribute ${name} as ${JSON.stringify(value)} instead of presence`,
            );
          }
        }
        const recovered = node.recoveredAttributeNames;
        if (recovered !== undefined) {
          if (recovered.length === 0) {
            fail(`${label} node ${node.nodeId} carries an empty recoveredAttributeNames`);
          }
          if (viewport.contentRecovery.status !== "aligned") {
            fail(
              `${label} node ${node.nodeId} claims recovered attributes on a ${viewport.contentRecovery.status} viewport`,
            );
          }
          for (const name of recovered) {
            if (!Object.hasOwn(SUPPLEMENTAL_ATTRIBUTES, name)) {
              fail(`${label} node ${node.nodeId} recovered ${name}, which is not on the allowlist`);
            }
            if (!Object.hasOwn(node.attributes, name)) {
              fail(`${label} node ${node.nodeId} names ${name} as recovered but does not carry it`);
            }
            supplementalNames.add(name);
          }
          if ([...recovered].sort().join(" ") !== recovered.join(" ")) {
            fail(`${label} node ${node.nodeId} recoveredAttributeNames is not sorted`);
          }
          supplementalElements++;
          supplementalAttributes += recovered.length;
        }
      }

      // Every non-root node must be somebody's child exactly once.
      for (const node of viewport.nodes) {
        if (viewport.rootNodeIds.includes(node.nodeId)) continue;
        if (!childOwner.has(node.nodeId)) {
          fail(`${label} node ${node.nodeId} is not referenced by any parent`);
        }
      }

      for (const ref of viewport.assetRefs) {
        if (!assetIds.has(ref)) fail(`${label} viewport assetRef ${ref} is dangling`);
      }
      for (const frame of viewport.frameInventory) {
        if (!elementNodeIds.has(frame.nodeId)) {
          fail(`${label} frame references unknown node ${frame.nodeId}`);
        }
      }
      for (const hostId of viewport.shadowInventory.hostNodeIds) {
        if (!elementNodeIds.has(hostId)) {
          fail(`${label} shadow host references unknown node ${hostId}`);
        }
      }

      // --- reconstruction completeness (item 75) -----------------------------
      if (viewport.elementNodeCount !== elementNodeIds.size) {
        fail(`${label} elementNodeCount disagrees with nodes[]`);
      }
      if (viewport.textNodeCount !== viewport.nodes.length - elementNodeIds.size) {
        fail(`${label} textNodeCount disagrees with nodes[]`);
      }
      if (viewport.sourceElementCount !== elementNodeIds.size) {
        fail(
          `${label} sourceElementCount ${viewport.sourceElementCount} does not match the ` +
            `${elementNodeIds.size} compiled element nodes`,
        );
      }
      if (
        viewport.contentRecovery.status === "aligned" &&
        viewport.contentRecovery.source !== "rendered-html"
      ) {
        fail(`${label} claims aligned content recovery from ${viewport.contentRecovery.source}`);
      }
      if (viewport.contentRecovery.status === "fallback") {
        if (!viewport.limitations.includes("content-recovery-fallback")) {
          fail(`${label} fell back but does not record the limitation`);
        }
        if (viewport.contentRecovery.failure === undefined) {
          fail(`${label} fell back without recording a reason`);
        }
        if (!viewport.limitations.includes("supplemental-attributes-not-recovered")) {
          fail(`${label} fell back but does not record the supplemental-attribute gap`);
        }
      }
      const recovery = viewport.contentRecovery;
      if (recovery.supplementalAttributeCount !== supplementalAttributes) {
        fail(
          `${label} declares ${recovery.supplementalAttributeCount} recovered attributes; the nodes carry ${supplementalAttributes}`,
        );
      }
      if (recovery.supplementalElementCount !== supplementalElements) {
        fail(
          `${label} declares ${recovery.supplementalElementCount} recovered elements; the nodes carry ${supplementalElements}`,
        );
      }
      if (
        recovery.supplementalAttributeNames.join(",") !==
        [...supplementalNames].sort().join(",")
      ) {
        fail(`${label} supplementalAttributeNames disagrees with the nodes`);
      }
      viewportSupplementalAttributes += supplementalAttributes;
      viewportSupplementalElements += supplementalElements;
    }
  }

  // --- interactions (items 59, 99) --------------------------------------------
  const patternIds = new Set<string>();
  for (const pattern of interactionSpec.patterns) {
    if (patternIds.has(pattern.patternId)) {
      fail(`duplicate patternId ${pattern.patternId}`);
    }
    patternIds.add(pattern.patternId);
    const nodes = elementNodeIndex.get(`${pattern.pageId}|${pattern.viewport}`);
    if (!nodes) {
      fail(`pattern ${pattern.patternId} references missing page/viewport ${pattern.pageId}/${pattern.viewport}`);
      continue;
    }
    if (!nodes.has(pattern.triggerNodeId)) {
      fail(`pattern ${pattern.patternId} triggerNodeId ${pattern.triggerNodeId} does not resolve`);
    }
    const target = pattern.target;
    if (target) {
      if (target.staticNodeResolved !== (target.targetNodeId !== undefined)) {
        fail(`pattern ${pattern.patternId} target staticNodeResolved disagrees with targetNodeId`);
      }
      if (target.targetNodeId !== undefined && !nodes.has(target.targetNodeId)) {
        fail(`pattern ${pattern.patternId} targetNodeId ${target.targetNodeId} does not resolve`);
      }
      if (target.dynamic && target.staticNodeResolved) {
        fail(`pattern ${pattern.patternId} claims a dynamic target that is also in the static tree`);
      }
    }
  }
  const unknownIds = new Set<string>();
  for (const unknown of interactionSpec.unknownInteractions) {
    if (unknownIds.has(unknown.unknownId)) fail(`duplicate unknownId ${unknown.unknownId}`);
    unknownIds.add(unknown.unknownId);
    const nodes = elementNodeIndex.get(`${unknown.pageId}|${unknown.viewport}`);
    if (!nodes) {
      fail(`unknown ${unknown.unknownId} references missing page/viewport`);
      continue;
    }
    if (unknown.triggerNodeId !== undefined && !nodes.has(unknown.triggerNodeId)) {
      fail(`unknown ${unknown.unknownId} triggerNodeId does not resolve`);
    }
  }
  if (options.expectedPatternIds) {
    const expected = new Set(options.expectedPatternIds);
    for (const id of expected) {
      if (!patternIds.has(id)) fail(`Task 12 pattern ${id} was not compiled`);
    }
    for (const id of patternIds) {
      if (!expected.has(id)) fail(`compiled pattern ${id} has no Task 12 source`);
    }
  }
  if (options.expectedUnknownIds) {
    const expected = new Set(options.expectedUnknownIds);
    for (const id of expected) {
      if (!unknownIds.has(id)) fail(`Task 12 unknown case ${id} was not compiled`);
    }
    for (const id of unknownIds) {
      if (!expected.has(id)) fail(`compiled unknown ${id} has no Task 12 source`);
    }
  }

  // Page ↔ interaction index agreement, in both directions.
  const patternsByPage = new Map<string, Set<string>>();
  for (const pattern of interactionSpec.patterns) {
    const bucket = patternsByPage.get(pattern.pageId) ?? new Set<string>();
    bucket.add(pattern.patternId);
    patternsByPage.set(pattern.pageId, bucket);
  }
  const unknownsByPage = new Map<string, Set<string>>();
  for (const unknown of interactionSpec.unknownInteractions) {
    const bucket = unknownsByPage.get(unknown.pageId) ?? new Set<string>();
    bucket.add(unknown.unknownId);
    unknownsByPage.set(unknown.pageId, bucket);
  }
  for (const page of pages) {
    const expectedPatterns = patternsByPage.get(page.pageId) ?? new Set<string>();
    if (page.patternIds.length !== expectedPatterns.size) {
      fail(`page ${page.pageId} lists ${page.patternIds.length} patterns; the interaction spec has ${expectedPatterns.size}`);
    }
    for (const id of page.patternIds) {
      if (!expectedPatterns.has(id)) fail(`page ${page.pageId} lists pattern ${id}, which is not its own`);
    }
    const expectedUnknowns = unknownsByPage.get(page.pageId) ?? new Set<string>();
    if (page.unknownInteractionIds.length !== expectedUnknowns.size) {
      fail(`page ${page.pageId} lists ${page.unknownInteractionIds.length} unknowns; the interaction spec has ${expectedUnknowns.size}`);
    }
    for (const id of page.unknownInteractionIds) {
      if (!expectedUnknowns.has(id)) fail(`page ${page.pageId} lists unknown ${id}, which is not its own`);
    }
    // A page nobody explored must not claim verified behavior.
    if (page.interactionCoverage === "not-explored" && page.patternIds.length > 0) {
      fail(`page ${page.pageId} is marked not-explored but carries confirmed patterns`);
    }
  }
  for (const pageId of patternsByPage.keys()) {
    if (!pageIds.has(pageId)) fail(`interaction spec references unknown page ${pageId}`);
  }

  // --- AI boundary (items 63, 64) ---------------------------------------------
  if (!siteSpec.provenanceSummary.hasAiInference) {
    if (interactionSpec.inferredInteractions.length > 0) {
      fail("inferred interactions exist but the SiteSpec declares no AI inference");
    }
    if (siteSpec.provenanceSummary.inferredFactCount !== 0) {
      fail("inferredFactCount is non-zero without AI inference");
    }
  }
  for (const inference of interactionSpec.inferredInteractions) {
    if (inference.provenance.level !== "inferred") {
      fail(`inference ${inference.inferenceId} is not marked inferred`);
    }
    if (patternIds.has(inference.inferenceId)) {
      fail(`inference ${inference.inferenceId} collides with a confirmed pattern id`);
    }
  }

  // --- declared counts ---------------------------------------------------------
  if (siteSpec.stats.routeCount !== siteSpec.routes.length) fail("stats.routeCount is wrong");
  if (siteSpec.stats.familyCount !== siteSpec.families.length) fail("stats.familyCount is wrong");
  if (siteSpec.stats.pageCount !== pages.length) fail("stats.pageCount is wrong");
  if (siteSpec.stats.styleTokenCount !== styleCatalog.tokenCount) {
    fail("stats.styleTokenCount disagrees with the style catalog");
  }
  if (siteSpec.stats.assetCount !== assetCatalog.assetCount) {
    fail("stats.assetCount disagrees with the asset catalog");
  }
  if (siteSpec.provenanceSummary.verifiedPatternCount !== interactionSpec.patterns.length) {
    fail("provenanceSummary.verifiedPatternCount disagrees with the interaction spec");
  }
  if (siteSpec.provenanceSummary.unknownCount !== interactionSpec.unknownInteractions.length) {
    fail("provenanceSummary.unknownCount disagrees with the interaction spec");
  }
  if (siteSpec.responsiveModel.inferredBreakpoints.length > 0) {
    fail("responsiveModel declares inferred breakpoints, which this Task never produces");
  }
  if (siteSpec.stats.supplementalAttributeCount !== viewportSupplementalAttributes) {
    fail(
      `stats.supplementalAttributeCount (${siteSpec.stats.supplementalAttributeCount}) disagrees with the ${viewportSupplementalAttributes} carried by the pages`,
    );
  }
  if (siteSpec.stats.supplementalElementCount !== viewportSupplementalElements) {
    fail(
      `stats.supplementalElementCount (${siteSpec.stats.supplementalElementCount}) disagrees with the ${viewportSupplementalElements} carried by the pages`,
    );
  }
  const declaredNameTotal = Object.values(
    siteSpec.stats.supplementalAttributeNameCounts,
  ).reduce((total, count) => total + count, 0);
  if (declaredNameTotal !== viewportSupplementalAttributes) {
    fail(
      `stats.supplementalAttributeNameCounts sums to ${declaredNameTotal}, not ${viewportSupplementalAttributes}`,
    );
  }
  for (const name of Object.keys(siteSpec.stats.supplementalAttributeNameCounts)) {
    if (!Object.hasOwn(SUPPLEMENTAL_ATTRIBUTES, name)) {
      fail(`stats report a recovered attribute ${name} that is not on the allowlist`);
    }
  }

  return violations;
}

export function assertSiteSpecValid(
  bundle: SiteSpecBundle,
  options: ValidateOptions = {},
): void {
  const violations = validateSiteSpec(bundle, options);
  if (violations.length > 0) throw new SiteSpecValidationError(violations);
}
