import type {
  ElementSpecNode,
  PageSpec,
  SpecNode,
  ViewportPageSpec,
} from "../sitespec/index.js";
import type { AssetResolver } from "./asset-resolver.js";
import type { LinkRewriter } from "./link-rewriter.js";
import {
  compileDocumentRoot,
  newCounters,
  type CompileCounters,
} from "./compile-node.js";
import { collectGeneratedIdNodes } from "./relations.js";
import { adaptParserNesting } from "./nesting.js";
import type { InteractionPlan } from "./interaction-bindings.js";
import type { CorrectionPlan } from "./qa-corrections.js";
import type { RuntimePage, RuntimeViewport } from "./types.js";

/**
 * One PageSpec → one compact runtime page (items 7, 10, 27).
 *
 * Desktop and mobile stay two independent trees. Task 13 states plainly that no
 * node is claimed to be the same element across viewports
 * (`cross-viewport-node-matching-not-performed`), so merging them here would
 * mean inventing exactly the correspondence the pipeline refused to assert. Both
 * trees go into the document and CSS chooses which one is visible (item 30).
 *
 * What comes out is a DERIVATIVE, not a copy (items 7, 10). Everything a renderer
 * cannot use is gone by construction: `sourceElementId`, `boundingBox`,
 * `localVisible` / `effectiveVisible`, `limitations`, `contentRecovery`,
 * `frameInventory`, `shadowInventory`, `provenance`, `recoveredAttributeNames`.
 * On the corpus that is the difference between 157 MB of SiteSpec and the
 * runtime data the manifest reports.
 */

export interface CompileRuntimePageInput {
  page: PageSpec;
  assets: AssetResolver;
  links: LinkRewriter;
  interactions: InteractionPlan;
  /** Does this style token produce a CSS rule? See `hasRenderableDeclarations`. */
  styleRenders: (styleTokenId: string, documentRoot?: boolean) => boolean;
  /** Task 15 corrections. Undefined for a baseline reconstruction (item 114). */
  corrections?: CorrectionPlan;
}

export interface CompiledRuntimePage {
  page: RuntimePage;
  counters: CompileCounters;
  /** Style tokens used at a document root, needing the adapted class (item 56). */
  documentRootTokens: string[];
}

function nodeIndex(viewport: ViewportPageSpec): Map<string, SpecNode> {
  return new Map(viewport.nodes.map((node) => [node.nodeId, node]));
}

function elementsOf(viewport: ViewportPageSpec): ElementSpecNode[] {
  return viewport.nodes.filter(
    (node): node is ElementSpecNode => node.type === "element",
  );
}

export function compileRuntimePage(
  input: CompileRuntimePageInput,
): CompiledRuntimePage {
  const counters = newCounters();
  const documentRootTokens: string[] = [];

  const compileOne = (
    viewportId: "desktop" | "mobile",
    viewport: ViewportPageSpec,
  ): RuntimeViewport => {
    const nodeById = nodeIndex(viewport);
    const elements = elementsOf(viewport);

    // Every node the interaction layer names needs a stable DOM id: triggers are
    // found by delegation and targets are found by `getElementById`.
    const interactionNodeIds: string[] = [];
    for (const binding of input.interactions.bindings.values()) {
      if (binding.pageId !== input.page.pageId || binding.viewportId !== viewportId) {
        continue;
      }
      interactionNodeIds.push(binding.triggerNodeId);
      if (binding.targetNodeId) interactionNodeIds.push(binding.targetNodeId);
      // Task 17 §5: observed user-visible targets are addressed the same way.
      for (const observed of binding.observedTargets ?? []) {
        if (observed.nodeId) interactionNodeIds.push(observed.nodeId);
      }
    }

    const generatedIdNodes = collectGeneratedIdNodes(
      viewport.nodes,
      elements,
      interactionNodeIds,
    );

    const { root, documentRootTokens: tokens } = compileDocumentRoot(
      viewport.rootNodeIds,
      {
        pageId: input.page.pageId,
        pageUrl: input.page.documentMetadata.finalUrl || input.page.url,
        viewportId,
        nodeById,
        generatedIdNodes,
        assets: input.assets,
        links: input.links,
        interactions: input.interactions,
        styleRenders: input.styleRenders,
        ...(input.corrections ? { corrections: input.corrections } : {}),
      },
      counters,
    );
    documentRootTokens.push(...tokens);

    // The compiled tree is a DOM tree; the clone receives it as HTML. Any edge
    // the parser would rewrite is expressed the way HTML requires BEFORE the
    // tree is written, so the markup React server-renders is the markup the
    // browser parses back (Task 16 final correction).
    const { adaptations } = adaptParserNesting(root, {
      pageId: input.page.pageId,
      viewportId,
    });
    if (adaptations.length > 0) {
      counters.nestingAdaptations += adaptations.length;
      // Each interposed container is a real element in the written tree, so the
      // manifest has to count it; `validateGeneratedApp` reads both back and
      // compares them.
      counters.elementNodes += adaptations.length;
      counters.limitations.add("parser-invalid-nesting-adapted");
    }

    return { id: viewportId, width: viewport.profile.width, doc: root };
  };

  return {
    page: {
      pageId: input.page.pageId,
      desktop: compileOne("desktop", input.page.viewports.desktop),
      mobile: compileOne("mobile", input.page.viewports.mobile),
    },
    counters,
    documentRootTokens,
  };
}

/** Merge a page's counters into a running total. */
export function mergeCounters(total: CompileCounters, page: CompileCounters): void {
  total.elementNodes += page.elementNodes;
  total.textNodes += page.textNodes;
  total.styledNodes += page.styledNodes;
  total.generatedDomIds += page.generatedDomIds;
  total.rewrittenIdrefTokens += page.rewrittenIdrefTokens;
  total.unresolvedIdrefTokens += page.unresolvedIdrefTokens;
  total.elementAssetsRequested += page.elementAssetsRequested;
  total.resolvedImageSrc += page.resolvedImageSrc;
  total.resolvedSrcset += page.resolvedSrcset;
  total.inlineSvgRendered += page.inlineSvgRendered;
  total.unresolvedElementAssets += page.unresolvedElementAssets;
  total.droppedSrcsetCandidates += page.droppedSrcsetCandidates;
  total.remoteAssetUrls += page.remoteAssetUrls;
  total.internalLinksRewritten += page.internalLinksRewritten;
  total.unresolvedInternalLinks += page.unresolvedInternalLinks;
  total.externalLinks += page.externalLinks;
  total.skippedSourceNodes += page.skippedSourceNodes;
  total.scrollStateNodes += page.scrollStateNodes;
  total.scrollRestoreNodes += page.scrollRestoreNodes;
  total.nestingAdaptations += page.nestingAdaptations;
  for (const token of page.usedStyleTokens) total.usedStyleTokens.add(token);
  total.pseudoRules.push(...page.pseudoRules);
  for (const code of page.limitations) total.limitations.add(code);
}
