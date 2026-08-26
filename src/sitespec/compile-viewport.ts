import {
  TEXT_MAX_LEN,
  type AssetObservation,
  type ElementObservation,
  type FrameObservation,
  type PageMetadata,
  type ShadowInventory,
  type StyleTable,
  type ViewportProfile,
} from "../observer/types.js";
import {
  alignRenderedHtml,
  normalizeText,
  type AlignedChild,
  type AlignmentResult,
} from "./content-tree.js";
import { compileAttributes, type RelationSource } from "./safe-attributes.js";
import type { AssetCatalogBuilder } from "./asset-catalog.js";
import type { StyleCatalogBuilder } from "./style-catalog.js";
import {
  nodeId as makeNodeId,
  sortLimitations,
  type ContentRecovery,
  type ElementSpecNode,
  type FrameSpec,
  type LimitationCode,
  type NodeRelation,
  type ShadowInventorySpec,
  type SpecNode,
  type TextSpecNode,
  type ViewportPageSpec,
} from "./types.js";

/**
 * Compile ONE viewport of ONE page into a reconstruction tree (Task 13, items
 * 22, 23, 30–35, 41, 42).
 *
 * The two input channels have different jobs and are never allowed to swap:
 *
 *   dom.json      structure, geometry, computed style, visibility  (truth)
 *   rendered.html text node values, mixed-content child order, and
 *                 a closed allowlist of declarative attributes     (recovery)
 *
 * When they align, the tree carries real text nodes in real document order and
 * paragraphs longer than the Observer's 200-character cap arrive intact. When
 * they do not, the tree is still built — from dom.json alone, with the two
 * honest limitations attached — because a page with recoverable structure and
 * truncated text is still worth reconstructing, and pretending otherwise would
 * lose it entirely (item 29).
 *
 * Desktop and mobile are compiled by two independent calls that share nothing
 * but the global catalogs. No node here is ever claimed to be "the same element"
 * as a node in the other viewport (items 22, 70) — the two are separate
 * observations of a site that may genuinely render different markup at different
 * widths, and inventing a correspondence would be the first lie in the IR.
 */

export interface CompileViewportInput {
  pageId: string;
  profile: ViewportProfile;
  metadata: PageMetadata;
  elements: readonly ElementObservation[];
  styleTable: StyleTable;
  assets: readonly AssetObservation[];
  frames: readonly FrameObservation[];
  shadow: ShadowInventory;
  /** `undefined` when the file could not be read — a fallback, never a crash. */
  renderedHtml: string | undefined;
  styleBuilder: StyleCatalogBuilder;
  assetBuilder: AssetCatalogBuilder;
}

/**
 * The viewport spec, with catalog references still expressed as CANONICAL KEYS.
 *
 * Style/asset ids cannot exist until the whole site is known (both are numbered
 * from a lexical sort of the complete key set), so compilation records keys and
 * `resolveCatalogReferences()` swaps them for ids once. The swap is verified
 * afterwards by the dangling-reference invariants, so a missed key fails the
 * compile rather than reaching an artifact.
 */
export interface CompiledViewport {
  spec: ViewportPageSpec;
  /** Observer element id → SiteSpec node id, for the interaction join. */
  nodeIdByElementId: Map<string, string>;
}

interface PendingRelation {
  nodeIndex: number;
  source: RelationSource;
}

export function compileViewport(input: CompileViewportInput): CompiledViewport {
  const {
    pageId,
    profile,
    metadata,
    elements,
    styleTable,
    assets,
    frames,
    shadow,
    renderedHtml,
    styleBuilder,
    assetBuilder,
  } = input;

  styleBuilder.countLocalStyleTable(Object.keys(styleTable).length);

  const alignment: AlignmentResult =
    renderedHtml === undefined
      ? { status: "fallback", failure: "rendered-html-unreadable" }
      : alignRenderedHtml(renderedHtml, elements);

  // --- asset occurrences ------------------------------------------------------
  const assetKeysByElement = new Map<string, string[]>();
  const viewportAssetKeys = new Set<string>();
  for (const asset of assets) {
    const key = assetBuilder.add(asset, pageId);
    viewportAssetKeys.add(key);
    if (asset.elementId !== undefined) {
      const bucket = assetKeysByElement.get(asset.elementId);
      if (bucket) {
        if (!bucket.includes(key)) bucket.push(key);
      } else {
        assetKeysByElement.set(asset.elementId, [key]);
      }
    }
  }

  // --- children, by channel ---------------------------------------------------
  // In fallback mode the element children are rebuilt from dom.json's parentId
  // links; text becomes ONE leading node carrying the Observer's normalized (and
  // possibly truncated) direct text, which is all that channel knows.
  let childrenByIndex: AlignedChild[][];
  if (alignment.status === "aligned") {
    childrenByIndex = alignment.children;
  } else {
    const indexById = new Map<string, number>();
    elements.forEach((el, i) => indexById.set(el.id, i));
    childrenByIndex = elements.map((el) =>
      el.text ? [{ kind: "text" as const, value: el.text }] : [],
    );
    elements.forEach((el, i) => {
      if (el.parentId === undefined) return;
      const parentIndex = indexById.get(el.parentId);
      if (parentIndex === undefined) return;
      childrenByIndex[parentIndex]!.push({ kind: "element", elementIndex: i });
    });
  }

  // --- node emission ----------------------------------------------------------
  const nodes: SpecNode[] = [];
  const nodeIdByElementId = new Map<string, string>();
  const nodeIndexBySourceHtmlId = new Map<string, number>();
  const duplicateHtmlIds = new Set<string>();
  const pendingRelations: PendingRelation[] = [];
  const styleKeysUsed = new Set<string>();

  let textNodeCount = 0;
  let longestTextLength = 0;
  let localVisibleCount = 0;
  let effectiveVisibleCount = 0;
  let counter = 0;

  // Supplemental attribute accounting (item 12). Counted while the nodes are
  // emitted rather than by a second pass over the finished tree.
  let supplementalAttributeCount = 0;
  let supplementalElementCount = 0;
  const supplementalNames = new Set<string>();

  const nextNodeId = (): string => makeNodeId(++counter);

  const emitText = (value: string, parentNodeId: string): string => {
    const id = nextNodeId();
    const node: TextSpecNode = { nodeId: id, type: "text", parentNodeId, value };
    nodes.push(node);
    textNodeCount++;
    if (value.length > longestTextLength) longestTextLength = value.length;
    return id;
  };

  const emitElement = (index: number, parentNodeId: string | undefined): string => {
    const source = elements[index]!;
    const id = nextNodeId();
    const nodeIndex = nodes.length;

    // The supplemental channel exists only where the two channels were PROVEN
    // to describe the same tree; a fallback viewport passes nothing (item 13).
    const supplemental =
      alignment.status === "aligned"
        ? alignment.supplementalAttributes.get(index)
        : undefined;

    const compiled = compileAttributes(source.tagName, source.attributes, supplemental);
    const limitations = new Set<LimitationCode>(compiled.limitations);
    if (compiled.recoveredAttributeNames.length > 0) {
      supplementalElementCount++;
      supplementalAttributeCount += compiled.recoveredAttributeNames.length;
      for (const name of compiled.recoveredAttributeNames) supplementalNames.add(name);
    }

    const style = styleTable[source.styleId];
    if (style === undefined) {
      throw new Error(
        `dom.json element ${source.id} references styleId ${source.styleId}, which is not in styles.json`,
      );
    }
    const styleKey = styleBuilder.intern(style);
    styleKeysUsed.add(styleKey);

    let pseudo: ElementSpecNode["pseudo"];
    if (source.pseudo) {
      limitations.add("pseudo-element-limited-style-set");
      const before = source.pseudo.before;
      const after = source.pseudo.after;
      pseudo = {
        ...(before
          ? {
              before: {
                ...(before.content !== undefined ? { content: before.content } : {}),
                styleTokenId: (() => {
                  const map = styleTable[before.styleId];
                  if (map === undefined) {
                    throw new Error(
                      `element ${source.id} ::before references missing styleId ${before.styleId}`,
                    );
                  }
                  const key = styleBuilder.intern(map);
                  styleKeysUsed.add(key);
                  return key;
                })(),
              },
            }
          : {}),
        ...(after
          ? {
              after: {
                ...(after.content !== undefined ? { content: after.content } : {}),
                styleTokenId: (() => {
                  const map = styleTable[after.styleId];
                  if (map === undefined) {
                    throw new Error(
                      `element ${source.id} ::after references missing styleId ${after.styleId}`,
                    );
                  }
                  const key = styleBuilder.intern(map);
                  styleKeysUsed.add(key);
                  return key;
                })(),
              },
            }
          : {}),
      };
    }

    if (source.tagName === "svg") limitations.add("svg-subtree-opaque");
    if (alignment.status !== "aligned" && source.text !== undefined) {
      limitations.add("mixed-content-order-not-recovered");
      if (source.text.length >= TEXT_MAX_LEN) limitations.add("text-may-be-truncated");
    }

    const sourceHasFormAction =
      alignment.status === "aligned" && source.tagName === "form"
        ? alignment.formHasAction[index]
        : undefined;
    if (sourceHasFormAction) limitations.add("form-action-not-compiled");

    const assetRefs = [...(assetKeysByElement.get(source.id) ?? [])].sort();

    const node: ElementSpecNode = {
      nodeId: id,
      type: "element",
      sourceElementId: source.id,
      ...(parentNodeId !== undefined ? { parentNodeId } : {}),
      childNodeIds: [],
      tagName: source.tagName,
      attributes: compiled.attributes,
      // Written only where something was actually recovered, so 148,373 element
      // nodes do not each gain an empty array (item 35).
      ...(compiled.recoveredAttributeNames.length > 0
        ? { recoveredAttributeNames: compiled.recoveredAttributeNames }
        : {}),
      ...(compiled.role !== undefined ? { role: compiled.role } : {}),
      ...(compiled.sourceHtmlId !== undefined
        ? { sourceHtmlId: compiled.sourceHtmlId }
        : {}),
      localVisible: source.localVisible,
      effectiveVisible: source.effectiveVisible,
      ...(source.boundingBox !== undefined ? { boundingBox: source.boundingBox } : {}),
      // Task 16 (A2). Carried verbatim: the compiler neither derives nor
      // normalizes a scroll offset — it is an observation or it is absent.
      ...(source.scrollState !== undefined ? { scrollState: source.scrollState } : {}),
      // Task 17 §7. Same verbatim policy for authored layout declarations.
      ...(source.layoutRules !== undefined ? { authoredLayout: source.layoutRules } : {}),
      ...(source.layoutRulesTruncated ? { authoredLayoutTruncated: true } : {}),
      styleTokenId: styleKey,
      ...(pseudo ? { pseudo } : {}),
      assetRefs,
      relations: [],
      ...(sourceHasFormAction !== undefined ? { sourceHasFormAction } : {}),
      limitations: sortLimitations(limitations),
    };
    nodes.push(node);

    nodeIdByElementId.set(source.id, id);
    if (compiled.sourceHtmlId !== undefined) {
      if (nodeIndexBySourceHtmlId.has(compiled.sourceHtmlId)) {
        duplicateHtmlIds.add(compiled.sourceHtmlId);
      } else {
        nodeIndexBySourceHtmlId.set(compiled.sourceHtmlId, nodeIndex);
      }
    }
    for (const relation of compiled.relationSources) {
      pendingRelations.push({ nodeIndex, source: relation });
    }
    if (source.localVisible) localVisibleCount++;
    if (source.effectiveVisible) effectiveVisibleCount++;

    const childIds: string[] = [];
    for (const child of childrenByIndex[index] ?? []) {
      childIds.push(
        child.kind === "text"
          ? emitText(child.value, id)
          : emitElement(child.elementIndex, id),
      );
    }
    node.childNodeIds = childIds;
    return id;
  };

  // Roots: every element whose parent is not another observed element. In every
  // real observation that is exactly `<html>`, but the loop does not assume it.
  const rootNodeIds: string[] = [];
  const childElementIndices = new Set<number>();
  for (const children of childrenByIndex) {
    for (const child of children) {
      if (child.kind === "element") childElementIndices.add(child.elementIndex);
    }
  }
  for (let i = 0; i < elements.length; i++) {
    if (!childElementIndices.has(i)) rootNodeIds.push(emitElement(i, undefined));
  }

  // --- relations (viewport-local resolution, item 42) -------------------------
  for (const pending of pendingRelations) {
    const targetIndex = nodeIndexBySourceHtmlId.get(pending.source.sourceValue);
    const resolvedNode =
      targetIndex !== undefined && !duplicateHtmlIds.has(pending.source.sourceValue)
        ? (nodes[targetIndex] as ElementSpecNode)
        : undefined;
    const relation: NodeRelation = {
      type: pending.source.type,
      sourceValue: pending.source.sourceValue,
      resolved: resolvedNode !== undefined,
      ...(resolvedNode ? { resolvedNodeId: resolvedNode.nodeId } : {}),
    };
    (nodes[pending.nodeIndex] as ElementSpecNode).relations.push(relation);
  }

  // --- frames / shadow inventory (items 55, 56) -------------------------------
  const frameInventory: FrameSpec[] = [];
  for (const frame of frames) {
    const frameNodeId = nodeIdByElementId.get(frame.elementId);
    if (frameNodeId === undefined) continue;
    frameInventory.push({
      nodeId: frameNodeId,
      sourceElementId: frame.elementId,
      ...(frame.src !== undefined ? { src: frame.src } : {}),
      ...(frame.resolvedUrl !== undefined ? { resolvedUrl: frame.resolvedUrl } : {}),
      ...(frame.sameOrigin !== undefined ? { sameOrigin: frame.sameOrigin } : {}),
      accessible: frame.accessible,
      ...(frame.title !== undefined ? { title: frame.title } : {}),
      limitations: sortLimitations(["frame-content-not-observed"]),
    });
  }

  const hostNodeIds = shadow.shadowHostIds
    .map((elementId) => nodeIdByElementId.get(elementId))
    .filter((value): value is string => value !== undefined)
    .sort();
  const shadowInventory: ShadowInventorySpec = {
    openShadowRootCount: shadow.openShadowRootCount,
    hostNodeIds,
    limitations:
      shadow.openShadowRootCount > 0
        ? sortLimitations(["shadow-content-not-observed"])
        : [],
  };

  // --- content-recovery metrics (item 103) ------------------------------------
  let cappedSourceTextCount = 0;
  let recoveredLongTextCount = 0;
  for (let i = 0; i < elements.length; i++) {
    const text = elements[i]!.text;
    if (text === undefined || text.length < TEXT_MAX_LEN) continue;
    cappedSourceTextCount++;
    if (alignment.status !== "aligned") continue;
    const recovered = normalizeText(
      (childrenByIndex[i] ?? [])
        .filter((child): child is { kind: "text"; value: string } => child.kind === "text")
        .map((child) => child.value)
        .join(""),
    );
    if (recovered.length > text.length) recoveredLongTextCount++;
  }

  const contentRecovery: ContentRecovery = {
    status: alignment.status,
    source: alignment.status === "aligned" ? "rendered-html" : "dom-json",
    ...(alignment.parsedElementCount !== undefined
      ? { parsedElementCount: alignment.parsedElementCount }
      : {}),
    sourceElementCount: elements.length,
    ...(alignment.status === "fallback" ? { failure: alignment.failure } : {}),
    ...(alignment.status === "fallback" && alignment.mismatchIndex !== undefined
      ? { mismatchIndex: alignment.mismatchIndex }
      : {}),
    ...(alignment.status === "fallback" && alignment.mismatchDetail !== undefined
      ? { mismatchDetail: alignment.mismatchDetail }
      : {}),
    textNodeCount,
    cappedSourceTextCount,
    recoveredLongTextCount,
    longestTextLength,
    supplementalAttributeCount,
    supplementalElementCount,
    supplementalAttributeNames: [...supplementalNames].sort(),
  };

  // --- viewport limitations ---------------------------------------------------
  const viewportLimitations = new Set<LimitationCode>();
  if (alignment.status === "fallback") {
    viewportLimitations.add("content-recovery-fallback");
    viewportLimitations.add("mixed-content-order-not-recovered");
    viewportLimitations.add("text-may-be-truncated");
    // Item 13: no supplemental attribute may be read without alignment, so the
    // gap is stated rather than left to look like "the page had none".
    viewportLimitations.add("supplemental-attributes-not-recovered");
    // Item 14: the table warning is now conditional on the SAME failure. An
    // aligned viewport's table cells carry whatever colspan / rowspan / scope
    // the document declared, and an attribute that is simply absent is a fact
    // about the page, not a gap in the observation (item 15) — so claiming a
    // limitation there would be the compiler crying wolf.
    if (elements.some((el) => el.tagName === "td" || el.tagName === "th")) {
      viewportLimitations.add("table-cell-attributes-not-recovered");
    }
  }
  if (frameInventory.length > 0) viewportLimitations.add("frame-content-not-observed");
  if (shadow.openShadowRootCount > 0) {
    viewportLimitations.add("shadow-content-not-observed");
  }
  if (elements.some((el) => el.tagName === "svg")) {
    viewportLimitations.add("svg-subtree-opaque");
  }

  const spec: ViewportPageSpec = {
    profile,
    documentDimensions: {
      viewportWidth: metadata.viewportWidth,
      viewportHeight: metadata.viewportHeight,
      documentWidth: metadata.documentWidth,
      documentHeight: metadata.documentHeight,
      scrollWidth: metadata.scrollWidth,
      scrollHeight: metadata.scrollHeight,
    },
    contentRecovery,
    rootNodeIds,
    nodes,
    sourceElementCount: elements.length,
    elementNodeCount: nodes.length - textNodeCount,
    textNodeCount,
    localVisibleCount,
    effectiveVisibleCount,
    styleTokenCount: styleKeysUsed.size,
    // Task 16 accounting. `scrolledNodeCount` is the number the renderer has to
    // act on; `scrollStateNodeCount` is the number that were observed, and the
    // difference is scrollers that simply happened to be at the top.
    scrollStateNodeCount: nodes.filter(
      (n) => n.type === "element" && n.scrollState !== undefined,
    ).length,
    scrolledNodeCount: nodes.filter(
      (n) =>
        n.type === "element" &&
        n.scrollState !== undefined &&
        (n.scrollState.scrollTop !== 0 || n.scrollState.scrollLeft !== 0),
    ).length,
    assetBoundNodeCount: nodes.filter(
      (n) => n.type === "element" && n.assetRefs.length > 0,
    ).length,
    assetRefs: [...viewportAssetKeys].sort(),
    frameInventory,
    shadowInventory,
    limitations: sortLimitations(viewportLimitations),
  };

  return { spec, nodeIdByElementId };
}
