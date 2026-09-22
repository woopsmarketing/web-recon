/**
 * Region ENABLEMENT ANALYSIS (Task 28 Phase 5).
 *
 * The compiler in `compile.ts` answers "where are the seams?". This module
 * answers the three questions an operator's "이 섹션 필요 없으니까 삭제"
 * (delete this section) forces before anything may be disabled:
 *
 *   1. WHICH ROUTES does this region actually render on?
 *      `RegionContract.routes` is already correct: region-plan.ts:82 unions
 *      `region.pages[].routes`. It is NOT `slot.route` (the recon-template
 *      grouping records the FIRST route serving a page, so a shared page's
 *      sibling route is invisible there) and it is NOT derivable from the
 *      regionId, which is namespaced by pageSourceId and cannot name a route
 *      at all (skeleton.ts `regionIdOf`).
 *
 *   2. IS THIS REGION GLOBAL? `region.scope === "global"` is the compiler's
 *      STRICT lift (identical landmark + child path + root tag + subtree
 *      structural hash on EVERY non-locale page) and it UNDER-REPORTS: on the
 *      accepted linear.app template all eight page-scoped `footer1:self`
 *      regions carry the identical 84 `global.footer.*` slot keys, and only a
 *      single element-count difference on one page keeps them page-scoped.
 *      Relaxing the compiler is not an option — `REGION_COMPILER_VERSION`
 *      exists because a policy change MOVES EVERY ID, and an authored decision
 *      keyed on a moved id addresses nothing. So enablement takes the union of
 *      three signals and treats ANY hit as global:
 *
 *        (i)   region.scope === "global"                       (the strict lift)
 *        (ii)  a member slot key whose slots.json scope is `global`
 *              — authoritative, because the SLOT compiler already ran the
 *              cross-page identity analysis this one refused to
 *        (iii) the region's (landmarkKey, childPath) signature occurring on
 *              >= 2 distinct pageSourceIds — the catch-all for zero-slot chrome
 *
 *   3. WHAT ELSE BREAKS? A region is not an island: an interaction trigger
 *      inside it may drive a target outside it, and vice versa. There is no
 *      interaction-graph artifact — the graph is `data-wr-*` props on the
 *      runtime IR — so `scanInteractionEdges` reads them directly.
 *
 * NOTHING HERE WRITES. Every function is a pure read over a page-regions
 * artifact plus the template's runtime trees, and no `data-wr-slot` attribute
 * is minted or consulted: membership is DERIVED by walking the tree from each
 * region root, exactly as `compile.ts` derives it.
 */
import type {
  RuntimeElementNode,
  RuntimeNode,
  RuntimePage,
} from "../reconstruction/types.js";
import type { PageRegion, PageRegionsArtifact, RegionViewport } from "./types.js";

export const REGION_VIEWPORTS: readonly RegionViewport[] = ["desktop", "mobile"];

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function isElement(node: RuntimeNode): node is RuntimeElementNode {
  return node.k === "e";
}

/** Depth-first search for the element carrying `nodeId`. */
export function findNodeById(root: RuntimeElementNode, nodeId: string): RuntimeElementNode | null {
  if (root.n === nodeId) return root;
  for (const child of root.c ?? []) {
    if (!isElement(child)) continue;
    const found = findNodeById(child, nodeId);
    if (found !== null) return found;
  }
  return null;
}

/** Every element node id in the subtree, root included, in document order. */
export function subtreeNodeIds(root: RuntimeElementNode): string[] {
  const out: string[] = [];
  const visit = (node: RuntimeElementNode): void => {
    out.push(node.n);
    for (const child of node.c ?? []) if (isElement(child)) visit(child);
  };
  visit(root);
  return out;
}

export function membershipKey(
  pageSourceId: string,
  viewport: string,
  nodeId: string,
): string {
  return `${pageSourceId}|${viewport}|${nodeId}`;
}

// ---------------------------------------------------------------------------
// Region membership — (page, viewport, node) -> region ids
// ---------------------------------------------------------------------------

export interface RegionMembership {
  /** Region ids owning this node. EMPTY is a real answer — see the doc below. */
  regionsOf(pageSourceId: string, viewport: string, nodeId: string): string[];
  /** Root node occurrences of one region, for the physical disable. */
  rootsOf(regionId: string): Array<{ pageSourceId: string; viewport: RegionViewport; nodeId: string }>;
  /** Number of (page, viewport, node) keys that belong to at least one region. */
  readonly size: number;
  /** Region roots the artifact names that no loaded tree could resolve. */
  readonly unresolvedRoots: Array<{ regionId: string; pageSourceId: string; viewport: string; nodeId: string }>;
}

/**
 * Build the many-to-many membership map.
 *
 * MANY-TO-MANY ON PURPOSE. `region-plan.ts` builds a slotKey -> region map
 * with FIRST-REGION-WINS, which is correct for its own job (one unit gets one
 * region) and wrong for a safety check: on linear that map collapses all
 * eight footer regions into one and would under-report the affected region set
 * by 7x. Nested regions also genuinely overlap, so a node can belong to more
 * than one region and the answer must be a list.
 *
 * A node that belongs to NO region is not an error. On both real templates the
 * biggest single interaction-target bucket is exactly that: portal mounts
 * attach under `n000002`, the adapted document root, which no region owns.
 */
export function buildRegionMembership(
  pages: ReadonlyMap<string, RuntimePage>,
  artifact: Pick<PageRegionsArtifact, "regions">,
): RegionMembership {
  const byNode = new Map<string, string[]>();
  const roots = new Map<string, Array<{ pageSourceId: string; viewport: RegionViewport; nodeId: string }>>();
  const unresolvedRoots: RegionMembership["unresolvedRoots"] = [];
  for (const region of artifact.regions) {
    const regionRoots: Array<{ pageSourceId: string; viewport: RegionViewport; nodeId: string }> = [];
    for (const page of region.pages) {
      const tree = pages.get(page.pageSourceId);
      for (const occurrence of page.occurrences) {
        const viewportTree = tree?.[occurrence.viewport];
        const root =
          viewportTree === undefined ? null : findNodeById(viewportTree.doc, occurrence.nodeId);
        if (root === null) {
          unresolvedRoots.push({
            regionId: region.regionId,
            pageSourceId: page.pageSourceId,
            viewport: occurrence.viewport,
            nodeId: occurrence.nodeId,
          });
          continue;
        }
        regionRoots.push({
          pageSourceId: page.pageSourceId,
          viewport: occurrence.viewport,
          nodeId: occurrence.nodeId,
        });
        for (const nodeId of subtreeNodeIds(root)) {
          const key = membershipKey(page.pageSourceId, occurrence.viewport, nodeId);
          const list = byNode.get(key);
          if (list === undefined) byNode.set(key, [region.regionId]);
          else if (!list.includes(region.regionId)) list.push(region.regionId);
        }
      }
    }
    roots.set(region.regionId, regionRoots);
  }
  return {
    regionsOf: (pageSourceId, viewport, nodeId) =>
      [...(byNode.get(membershipKey(pageSourceId, viewport, nodeId)) ?? [])].sort(),
    rootsOf: (regionId) => roots.get(regionId) ?? [],
    size: byNode.size,
    unresolvedRoots,
  };
}

// ---------------------------------------------------------------------------
// The interaction trigger/target graph
// ---------------------------------------------------------------------------

/**
 * How a trigger names its target. Three CHANNELS, because the runtime has
 * three and a safety rule that reads only one is blind to the other two:
 *
 *   target-node      `data-wr-target-node` — the target's SiteSpec node id
 *   obs-existing     `data-wr-obs[].i` — a generated DOM id
 *                    (`wr-<pageId>-<viewport>-<nodeId>`) of an EXISTING node
 *   obs-mount-host   `data-wr-obs[].hn` — the node a newly-mounted branch
 *                    attaches under
 *   dyn-mount        `data-wr-dyn-id` — a region the runtime MOUNTS from a
 *                    serialized template. Its nodes carry `data-wr-dyn-node`
 *                    only INSIDE that string and have no static region
 *                    membership at all, so the edge names no target node.
 */
export const INTERACTION_TARGET_CHANNELS = [
  "target-node",
  "obs-existing",
  "obs-mount-host",
  "dyn-mount",
] as const;
export type InteractionTargetChannel = (typeof INTERACTION_TARGET_CHANNELS)[number];

export interface InteractionEdge {
  pageSourceId: string;
  viewport: RegionViewport;
  triggerNodeId: string;
  triggerRegionIds: string[];
  channel: InteractionTargetChannel;
  /** null when the channel names no static node (a `dyn-mount`). */
  targetNodeId: string | null;
  /** [] = resolved to no region. null = no target node to resolve. */
  targetRegionIds: string[] | null;
  patternId: string | null;
  op: string | null;
}

/** `wr-p000001-desktop-n001530` -> `n001530`. */
export function nodeIdFromGeneratedDomId(domId: string): string | null {
  const match = domId.match(/-(n\d+)$/);
  return match === null ? null : match[1];
}

/**
 * Read every trigger/target edge out of the runtime trees.
 *
 * There is no interaction-graph artifact to read: the SiteSpec's compiled
 * patterns are upstream of the recon template and are not copied into it. What
 * survives is `data-wr-*` props emitted by
 * `src/reconstruction/interaction-bindings.ts` `bindingProps()`, which is what
 * this walk parses. `data-wr-obs` is a JSON array and a malformed one is
 * reported as an `unparsed` edge rather than silently skipped.
 */
export function scanInteractionEdges(
  pages: ReadonlyMap<string, RuntimePage>,
  membership: RegionMembership,
): { edges: InteractionEdge[]; triggers: number; unparsedObs: number } {
  const edges: InteractionEdge[] = [];
  let triggers = 0;
  let unparsedObs = 0;
  for (const [pageSourceId, page] of pages) {
    for (const viewport of REGION_VIEWPORTS) {
      const tree = page[viewport];
      if (tree === undefined) continue;
      const visit = (node: RuntimeElementNode): void => {
        const props = node.p ?? {};
        if (props["data-wr-op"] !== undefined) {
          triggers += 1;
          const triggerRegionIds = membership.regionsOf(pageSourceId, viewport, node.n);
          const patternId =
            typeof props["data-wr-pattern-id"] === "string" ? props["data-wr-pattern-id"] : null;
          const op = typeof props["data-wr-op"] === "string" ? props["data-wr-op"] : null;
          const push = (channel: InteractionTargetChannel, targetNodeId: string | null): void => {
            edges.push({
              pageSourceId,
              viewport,
              triggerNodeId: node.n,
              triggerRegionIds,
              channel,
              targetNodeId,
              targetRegionIds:
                targetNodeId === null ? null : membership.regionsOf(pageSourceId, viewport, targetNodeId),
              patternId,
              op,
            });
          };
          const targetNode = props["data-wr-target-node"];
          if (typeof targetNode === "string" && targetNode !== "") push("target-node", targetNode);
          const obs = props["data-wr-obs"];
          if (typeof obs === "string" && obs !== "") {
            let parsed: unknown;
            try {
              parsed = JSON.parse(obs);
            } catch {
              parsed = null;
              unparsedObs += 1;
            }
            if (Array.isArray(parsed)) {
              for (const entry of parsed as Array<Record<string, unknown>>) {
                if (typeof entry.i === "string") {
                  const nodeId = nodeIdFromGeneratedDomId(entry.i);
                  if (nodeId !== null) push("obs-existing", nodeId);
                }
                if (typeof entry.hn === "string" && entry.hn !== "") push("obs-mount-host", entry.hn);
              }
            }
          }
          if (typeof props["data-wr-dyn-id"] === "string") push("dyn-mount", null);
        }
        for (const child of node.c ?? []) if (isElement(child)) visit(child);
      };
      visit(tree.doc);
    }
  }
  return { edges, triggers, unparsedObs };
}

// ---------------------------------------------------------------------------
// Global-for-enablement
// ---------------------------------------------------------------------------

/** `(landmarkKey, childPath)` — the signature signal (iii) counts pages by. */
export function regionSignature(region: Pick<PageRegion, "landmark" | "childPath">): string {
  return `${region.landmark.key}|${region.childPath}`;
}

/** signature -> number of DISTINCT pageSourceIds carrying it. */
export function buildSignaturePageCounts(
  artifact: Pick<PageRegionsArtifact, "regions">,
): Map<string, number> {
  const pagesBySignature = new Map<string, Set<string>>();
  for (const region of artifact.regions) {
    const signature = regionSignature(region);
    const set = pagesBySignature.get(signature) ?? new Set<string>();
    for (const page of region.pages) set.add(page.pageSourceId);
    pagesBySignature.set(signature, set);
  }
  return new Map([...pagesBySignature].map(([signature, set]) => [signature, set.size]));
}

export const REGION_GLOBAL_SIGNALS = [
  "compiler-scope-global",
  "global-scope-slot",
  "signature-on-multiple-pages",
] as const;
export type RegionGlobalSignal = (typeof REGION_GLOBAL_SIGNALS)[number];

export interface RegionEnablementScope {
  /** true when ANY signal fires — the widest answer, never the narrowest. */
  global: boolean;
  signals: RegionGlobalSignal[];
  /** The member slot keys whose slots.json scope is `global`. */
  globalSlotKeys: string[];
  /** Distinct pageSourceIds carrying this region's (landmark, childPath). */
  signaturePages: number;
}

export interface RegionScopeContext {
  /** Slot keys whose slots.json `scope` is `global`. */
  globalSlotKeys: ReadonlySet<string>;
  /** From `buildSignaturePageCounts`. */
  signaturePageCounts: ReadonlyMap<string, number>;
  /** Fewest pages a signature must span for signal (iii). Default 2. */
  signatureMinPages?: number;
}

export function regionEnablementScope(
  region: Pick<PageRegion, "scope" | "landmark" | "childPath" | "slotKeys">,
  context: RegionScopeContext,
): RegionEnablementScope {
  const signals: RegionGlobalSignal[] = [];
  if (region.scope === "global") signals.push("compiler-scope-global");
  const globalSlotKeys = region.slotKeys.filter((key) => context.globalSlotKeys.has(key)).sort();
  if (globalSlotKeys.length > 0) signals.push("global-scope-slot");
  const signaturePages = context.signaturePageCounts.get(regionSignature(region)) ?? 0;
  if (signaturePages >= (context.signatureMinPages ?? 2)) signals.push("signature-on-multiple-pages");
  return { global: signals.length > 0, signals, globalSlotKeys, signaturePages };
}

/**
 * Every route this region renders on — the blast radius of disabling it.
 *
 * Read from `region.pages[].routes`, which `RegionPageSchema` documents as
 * "Many routes -> one pageSourceId. Never collapsed to the first one." That
 * array IS the blast radius; nothing else in the artifact carries it.
 */
export function regionRouteBlastRadius(region: Pick<PageRegion, "pages">): string[] {
  return [...new Set(region.pages.flatMap((page) => page.routes))].sort();
}

/** Every pageSourceId this region occurs on. */
export function regionPageSourceIds(region: Pick<PageRegion, "pages">): string[] {
  return [...new Set(region.pages.map((page) => page.pageSourceId))].sort();
}
