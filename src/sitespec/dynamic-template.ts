import type { CapturedSubtree } from "../interaction-explorer/types.js";
import type { AssetCatalogBuilder } from "./asset-catalog.js";
import type { StyleCatalogBuilder } from "./style-catalog.js";
import { compileAttributes } from "./safe-attributes.js";
import type { DynamicTemplate, DynamicTemplateNode } from "./types.js";

/**
 * A mounted region's observed contents → a reconstruction-safe IR (Task 16,
 * items 71–75).
 *
 * Task 11 now captures what a dynamic target contained after the click, using
 * the Observer's own walk. This turns that capture into something a renderer can
 * mount, and it applies exactly the same boundaries the page tree gets — because
 * an interaction-generated subtree that arrived through a different door would
 * be a way around every rule the SiteSpec enforces on page content:
 *
 *  - **The same attribute policy.** `compileAttributes()` is the page tree's
 *    function, so `class`, `style`, `data-*`, `on*` handlers, `action` /
 *    `formaction` and sensitive input values are unreachable here for the same
 *    structural reason they are unreachable there (item 72).
 *  - **The same style catalog.** Computed styles are interned into the
 *    SiteSpec-global table, so a menu that reuses the page's button style costs
 *    one reference rather than a duplicated map.
 *  - **The same asset catalog.** An icon inside a mounted menu is the same asset
 *    as the same icon in the header.
 *
 * What it deliberately does NOT do (items 73, 79, 80): it never merges these
 * nodes into the page's `nodes[]`, never gives them a page `nodeId`, and never
 * claims they describe anything but one observed instance. `provenance` and
 * `state` travel with the data and the renderer is expected to keep them apart.
 */

export interface CompileDynamicTemplateInput {
  captured: CapturedSubtree;
  actionId: string;
  styleBuilder: StyleCatalogBuilder;
  assetBuilder: AssetCatalogBuilder;
  /** Page the interaction belongs to — for asset catalog usage attribution. */
  pageId: string;
}

/** `t000001…`, template-local. Never resolvable as a page node id. */
export function templateNodeId(n: number): string {
  return `t${String(n).padStart(6, "0")}`;
}

/**
 * Compile ONE captured subtree. Catalog references are recorded as canonical
 * KEYS and swapped for ids by `resolveCatalogReferences()`, exactly as the page
 * tree does — the ids do not exist until every page has been compiled.
 */
export function compileDynamicTemplate(
  input: CompileDynamicTemplateInput,
): DynamicTemplate {
  const { captured, actionId, styleBuilder, assetBuilder, pageId } = input;

  // Observer element id → the asset catalog keys observed on that element.
  const assetKeysByElement = new Map<string, string[]>();
  for (const asset of captured.assets) {
    const key = assetBuilder.add(asset, pageId);
    if (asset.elementId === undefined) continue;
    const bucket = assetKeysByElement.get(asset.elementId);
    if (bucket) {
      if (!bucket.includes(key)) bucket.push(key);
    } else {
      assetKeysByElement.set(asset.elementId, [key]);
    }
  }

  const nodes: DynamicTemplateNode[] = [];
  const idByElementId = new Map<string, string>();
  const childrenByElementId = new Map<string, string[]>();
  /** Task 17.1 — element id → its text runs with their child positions. */
  const textIdsByElementId = new Map<string, { i: number; templateNodeId: string }[]>();
  let counter = 0;
  let textNodeCount = 0;

  // Elements arrive in document order from one pre-order walk, so a parent is
  // always emitted before its children and the link can be made in one pass.
  for (const element of captured.elements) {
    const id = templateNodeId(++counter);
    idByElementId.set(element.id, id);

    const style = captured.styleTable[element.styleId];
    const compiled = compileAttributes(element.tagName, element.attributes, undefined);

    const node: DynamicTemplateNode = {
      templateNodeId: id,
      ...(element.parentId !== undefined && idByElementId.has(element.parentId)
        ? { parentTemplateNodeId: idByElementId.get(element.parentId)! }
        : {}),
      tagName: element.tagName,
      attributes: compiled.attributes,
      ...(compiled.role !== undefined ? { role: compiled.role } : {}),
      ...(compiled.sourceHtmlId !== undefined
        ? { sourceHtmlId: compiled.sourceHtmlId }
        : {}),
      childTemplateNodeIds: [],
      effectiveVisible: element.effectiveVisible,
      ...(style !== undefined ? { styleTokenId: styleBuilder.intern(style) } : {}),
      assetRefs: [...(assetKeysByElement.get(element.id) ?? [])].sort(),
    };
    nodes.push(node);
    childrenByElementId.set(element.id, []);

    if (element.parentId !== undefined) {
      const siblings = childrenByElementId.get(element.parentId);
      if (siblings) siblings.push(id);
    }

    // The Observer records normalized DIRECT text per element. Task 17.1's
    // capture may additionally record each run's POSITION among element
    // children (`textSegments`); without that evidence, one leading text child
    // remains the honest representation of what was captured.
    if (element.text !== undefined && element.text !== "") {
      const segments =
        element.textSegments !== undefined && element.textSegments.length > 0
          ? element.textSegments
          : [{ i: 0, t: element.text }];
      const textIds: { i: number; templateNodeId: string }[] = [];
      for (const segment of segments) {
        if (segment.t === "") continue;
        const textId = templateNodeId(++counter);
        nodes.push({
          templateNodeId: textId,
          parentTemplateNodeId: id,
          tagName: "#text",
          attributes: {},
          childTemplateNodeIds: [],
          text: segment.t,
          effectiveVisible: element.effectiveVisible,
          assetRefs: [],
        });
        textNodeCount++;
        textIds.push({ i: segment.i, templateNodeId: textId });
      }
      textIdsByElementId.set(element.id, textIds);
    }
  }

  // Second pass: interleave element children with their text runs. A text run
  // recorded at position `i` renders after `i` element children (Task 17.1);
  // legacy captures place their single run at `i = 0`, the historical leading
  // position `compileViewport()` uses in its own fallback mode.
  const byId = new Map(nodes.map((node) => [node.templateNodeId, node]));
  for (const element of captured.elements) {
    const id = idByElementId.get(element.id);
    if (id === undefined) continue;
    const node = byId.get(id);
    if (!node) continue;
    const elementChildren = childrenByElementId.get(element.id) ?? [];
    const textRuns = [...(textIdsByElementId.get(element.id) ?? [])];
    node.childTemplateNodeIds = [];
    for (let position = 0; position <= elementChildren.length; position++) {
      for (const run of textRuns) {
        if (run.i === position || (position === elementChildren.length && run.i > position)) {
          node.childTemplateNodeIds.push(run.templateNodeId);
        }
      }
      if (position < elementChildren.length) {
        node.childTemplateNodeIds.push(elementChildren[position]!);
      }
    }
  }

  const rootTemplateNodeIds = captured.elements
    .filter((el) => el.parentId === undefined || !idByElementId.has(el.parentId))
    .map((el) => idByElementId.get(el.id)!)
    .filter((id): id is string => id !== undefined);

  return {
    provenance: "observed",
    state: "after-action",
    actionId,
    rootTemplateNodeIds,
    nodes,
    elementNodeCount: nodes.length - textNodeCount,
    textNodeCount,
    truncations: [...captured.truncations].sort(),
  };
}
