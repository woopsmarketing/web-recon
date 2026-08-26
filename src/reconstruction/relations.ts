import type { ElementSpecNode, NodeRelationType } from "../sitespec/index.js";
import { WR_PREFIX } from "./types.js";

/**
 * Generated DOM identity and IDREF rewriting (items 32–38).
 *
 * The SiteSpec keeps the original HTML `id` as `sourceHtmlId` and says out loud
 * that it is a source HINT and never an identity — the corpus is full of
 * `_R_14naotbsnuiubaaivb_` and `radix-_R_2miubaaivb_`, ids a framework mints per
 * render. Reusing them as the clone's DOM identity would make the clone's own
 * structure depend on a number the original site regenerates on every deploy.
 *
 * So the clone mints its own:
 *
 *   wr-<pageId>-<viewportId>-<nodeId>        e.g. wr-p000003-desktop-n000809
 *
 * which is deterministic, collision-free by construction (node ids are unique
 * within a viewport, and one document renders exactly one route and therefore
 * one page source), and readable enough to debug (item 181).
 *
 * The two identities are then kept apart on purpose (item 33): `sourceHtmlId`
 * stays the provenance that let Task 13 resolve `aria-controls="menu1"` to a
 * node, and the generated id is what the clone's DOM actually uses. Every
 * resolved relation is rewritten to point at the generated id; every unresolved
 * token keeps the author's original token rather than being deleted, because a
 * silently dropped `aria-labelledby` reads as "this element has no accessible
 * name" instead of "this reference was already broken upstream" (item 36).
 */

/** `wr-<pageId>-<viewport>-<nodeId>`. */
export function generatedDomId(
  pageId: string,
  viewportId: string,
  nodeId: string,
): string {
  return `${WR_PREFIX}-${pageId}-${viewportId}-${nodeId}`;
}

/** Deterministic id for a region a verified interaction mounts (item 96). */
export function dynamicTargetDomId(
  pageId: string,
  viewportId: string,
  patternId: string,
): string {
  return `${WR_PREFIX}-dyn-${pageId}-${viewportId}-${patternId}`;
}

/** Which HTML attribute each relation type writes back into. */
export const RELATION_ATTRIBUTE: Readonly<Record<NodeRelationType, string>> = {
  "aria-controls": "aria-controls",
  "aria-labelledby": "aria-labelledby",
  "aria-describedby": "aria-describedby",
  "aria-owns": "aria-owns",
  "label-for": "for",
  "href-fragment": "href",
  "popover-target": "popovertarget",
};

/** Relation types whose attribute holds a space-separated ID list. */
const LIST_RELATIONS: ReadonlySet<NodeRelationType> = new Set([
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-owns",
]);

export interface RelationRewrite {
  /** HTML attribute name (pre-React-adapter). */
  attribute: string;
  value: string;
  resolvedTokens: number;
  unresolvedTokens: number;
}

export interface RelationRewriteContext {
  pageId: string;
  viewportId: string;
  /** Node ids that will carry a generated DOM id in the emitted tree. */
  hasGeneratedId: (nodeId: string) => boolean;
}

/**
 * Rewrite one element's IDREF-carrying attributes.
 *
 * Token ORDER is preserved (item 36). The SiteSpec stores one relation per token
 * in source order, so the rewrite walks the original attribute value token by
 * token and consumes relations of that type in the same order — resolved tokens
 * become generated ids, unresolved tokens stay exactly as the author wrote them.
 */
export function rewriteRelations(
  node: ElementSpecNode,
  context: RelationRewriteContext,
): RelationRewrite[] {
  if (node.relations.length === 0) return [];

  const byType = new Map<NodeRelationType, typeof node.relations>();
  for (const relation of node.relations) {
    const bucket = byType.get(relation.type);
    if (bucket) bucket.push(relation);
    else byType.set(relation.type, [relation]);
  }

  const out: RelationRewrite[] = [];
  for (const [type, relations] of byType) {
    const attribute = RELATION_ATTRIBUTE[type];
    let resolvedTokens = 0;
    let unresolvedTokens = 0;

    const resolveToken = (token: string, index: number): string => {
      const relation = relations[index];
      // The relation list for a type is in the attribute's own token order, so
      // index alignment is exact; the value guard keeps that assumption honest.
      const matched =
        relation && relation.sourceValue === token
          ? relation
          : relations.find((r) => r.sourceValue === token);
      if (
        matched?.resolved &&
        matched.resolvedNodeId &&
        context.hasGeneratedId(matched.resolvedNodeId)
      ) {
        resolvedTokens++;
        return generatedDomId(context.pageId, context.viewportId, matched.resolvedNodeId);
      }
      unresolvedTokens++;
      return token;
    };

    if (type === "href-fragment") {
      const raw = node.attributes["href"];
      if (raw === undefined || !raw.startsWith("#")) continue;
      const token = raw.slice(1);
      out.push({
        attribute,
        value: `#${resolveToken(token, 0)}`,
        resolvedTokens,
        unresolvedTokens,
      });
      continue;
    }

    const raw = node.attributes[attribute];
    if (raw === undefined) continue;
    if (!LIST_RELATIONS.has(type)) {
      out.push({
        attribute,
        value: resolveToken(raw.trim(), 0),
        resolvedTokens,
        unresolvedTokens,
      });
      continue;
    }

    const tokens = raw.split(/\s+/).filter((t) => t !== "");
    out.push({
      attribute,
      value: tokens.map((token, index) => resolveToken(token, index)).join(" "),
      resolvedTokens,
      unresolvedTokens,
    });
  }
  return out;
}

/**
 * Which nodes of a viewport need a generated DOM id (item 34).
 *
 * Not every element: an id on all 148k nodes in the corpus would add roughly a
 * megabyte of DOM per large page for no reader. The set is exactly the nodes
 * something can point AT — anything that carried a source id, anything a
 * resolved relation targets, and anything the interaction layer names.
 */
export function collectGeneratedIdNodes(
  nodes: readonly { nodeId: string; type: string }[],
  elements: readonly ElementSpecNode[],
  interactionNodeIds: Iterable<string>,
): Set<string> {
  const needed = new Set<string>();
  for (const element of elements) {
    if (element.sourceHtmlId !== undefined) needed.add(element.nodeId);
    for (const relation of element.relations) {
      if (relation.resolved && relation.resolvedNodeId) {
        needed.add(relation.resolvedNodeId);
      }
    }
  }
  for (const nodeId of interactionNodeIds) needed.add(nodeId);

  // Only element nodes can carry an id; a relation resolving to a text node is
  // impossible upstream, but filtering here keeps the set honest either way.
  const elementIds = new Set(
    nodes.filter((n) => n.type === "element").map((n) => n.nodeId),
  );
  for (const id of [...needed]) if (!elementIds.has(id)) needed.delete(id);
  return needed;
}
