/**
 * ENABLEMENT APPLICATION (Task 28 Phases 5 + 6).
 *
 * "Delete this section" and "turn this page off" are DISABLE operations, never
 * template mutations. The Recon Template run directory is frozen and is read
 * as bytes by every downstream stage; the only place a disable may become
 * physical is the BUILD COPY of the app — the same directory, and the same
 * point in the bake, where `bakeContent` / `bakeSeoTitles` / `bakeBrand`
 * already mutate the copy before `next build`.
 *
 * WHY THE APP COPY AND NOT A RENDER-TIME FLAG. A render-time "hidden" flag
 * would leave the disabled markup in the shipped bytes, where the bake's own
 * source-brand census (bake.ts) still counts it and where "view source"
 * contradicts what the operator was told. A disabled region is REMOVED FROM
 * THE TREE the build renders, so its absence is a property of the artifact.
 *
 * WHAT THIS MODULE IS NOT. It decides nothing. Every id it acts on was already
 * cleared by the safety rules in `src/release/enablement.ts` (shared-page blast
 * radius, global-region scope, interaction cut). Handing it an unsafe plan is a
 * programming error on the caller's side, not a case this file adjudicates.
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/types.js";

export const ENABLEMENT_PLAN_SCHEMA_NAME = "enablement-plan-v1";

/** One region occurrence to physically remove: the region ROOT node. */
export interface DisabledRegionNode {
  regionId: string;
  pageSourceId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
}

/** One navigation host to remove because it links to a disabled route. */
export interface RemovedNavNode {
  pageSourceId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  slotKey: string;
  groupId: string | null;
  targetRoute: string;
}

export interface EnablementPlan {
  schemaName: typeof ENABLEMENT_PLAN_SCHEMA_NAME;
  /** Route KEYS (route-map `key`) to drop from the route table. */
  disabledRoutes: string[];
  /** Region ids the plan disables — carried for reporting, never for the walk. */
  disabledRegionIds: string[];
  disabledNodes: DisabledRegionNode[];
  removedNavNodes: RemovedNavNode[];
  /**
   * Slot keys this plan stops rendering.
   *
   * Carried on the PLAN, not recomputed at the bake, because the bake has two
   * consumers that would otherwise demand proof of content the operator
   * deleted: `pickContentProof` (production QA asserts the baked value appears
   * in the served HTML) and the content-run accounting. A disabled slot is not
   * a missing slot, and neither reader can tell them apart from the node ids
   * alone.
   */
  disabledSlotKeys: string[];
}

export function emptyEnablementPlan(): EnablementPlan {
  return {
    schemaName: ENABLEMENT_PLAN_SCHEMA_NAME,
    disabledRoutes: [],
    disabledRegionIds: [],
    disabledNodes: [],
    removedNavNodes: [],
    disabledSlotKeys: [],
  };
}

export function enablementPlanIsEmpty(plan: EnablementPlan | null | undefined): boolean {
  if (plan === null || plan === undefined) return true;
  return (
    plan.disabledRoutes.length === 0 &&
    plan.disabledNodes.length === 0 &&
    plan.removedNavNodes.length === 0
  );
}

export interface EnablementApplyReport {
  routesRemoved: string[];
  routesRemaining: number;
  /** Requested route keys the route table did not contain (loud, not silent). */
  routesNotFound: string[];
  regionNodesRemoved: number;
  regionNodesNotFound: DisabledRegionNode[];
  navNodesRemoved: number;
  navNodesNotFound: RemovedNavNode[];
  pageFilesRewritten: string[];
  /** Page trees no remaining route references any more — deleted from the copy. */
  pageFilesRemoved: string[];
}

interface RouteMapShape {
  routes: Array<{ key: string; path: string; pageFile: string; pageSourceId: string }>;
}

function isElement(node: RuntimeNode): node is RuntimeElementNode {
  return node.k === "e";
}

/**
 * Remove every element whose node id is in `nodeIds`, returning what was found.
 *
 * The walk is top-down and does not descend into a node it removed: a nested
 * region inside a disabled region is already gone, and counting it again would
 * inflate the report.
 */
export function removeNodesById(
  root: RuntimeElementNode,
  nodeIds: ReadonlySet<string>,
): Set<string> {
  const removed = new Set<string>();
  /**
   * A wanted node INSIDE a removed subtree is gone too, and must be reported
   * as removed rather than as missing. It happens for real: a navigation
   * anchor that links to a disabled route can sit inside a region the same
   * edit disables (a footer link is the ordinary case). Reporting it missing
   * would make `applyEnablementToApp` throw on a plan that was correct.
   */
  const collectInside = (node: RuntimeElementNode): void => {
    if (nodeIds.has(node.n)) removed.add(node.n);
    for (const child of node.c ?? []) if (isElement(child)) collectInside(child);
  };
  const visit = (node: RuntimeElementNode): void => {
    const children = node.c;
    if (children === undefined) return;
    const kept: RuntimeNode[] = [];
    for (const child of children) {
      if (isElement(child) && nodeIds.has(child.n)) {
        collectInside(child);
        continue;
      }
      kept.push(child);
      if (isElement(child)) visit(child);
    }
    if (kept.length === children.length) return;
    if (kept.length === 0) delete node.c;
    else node.c = kept;
  };
  if (nodeIds.has(root.n)) {
    // The document root itself is never a region root and never a nav host;
    // removing it would leave the page with nothing to render, so it is
    // refused loudly rather than producing an empty document.
    throw new Error(`enablement: refusing to remove the document root node ${root.n}`);
  }
  visit(root);
  return removed;
}

/**
 * Apply an enablement plan to a BUILD COPY of the template app.
 *
 * Order matters: the route table is filtered FIRST so the page-tree pass knows
 * which page files are still reachable, and a page a remaining route still
 * uses is never deleted (routes -> pageSourceId is MANY-TO-ONE).
 */
export async function applyEnablementToApp(
  appDir: string,
  plan: EnablementPlan,
): Promise<EnablementApplyReport> {
  const dataDir = path.join(appDir, "reconstruction-data");
  const routeMapFile = path.join(dataDir, "route-map.json");
  const routeMap = JSON.parse(await readFile(routeMapFile, "utf8")) as RouteMapShape;

  const disabled = new Set(plan.disabledRoutes);
  const before = routeMap.routes;
  const kept = before.filter((route) => !disabled.has(route.key));
  const routesRemoved = before.filter((route) => disabled.has(route.key)).map((route) => route.key);
  const routesNotFound = [...disabled].filter(
    (key) => !before.some((route) => route.key === key),
  ).sort();
  if (routesRemoved.length > 0) {
    if (kept.length === 0) {
      throw new Error(
        "enablement: refusing to disable every route — the site would export no page at all",
      );
    }
    routeMap.routes = kept;
    await writeFile(routeMapFile, JSON.stringify(routeMap), "utf8");
  }

  // ---- page trees --------------------------------------------------------
  const byPage = new Map<string, { regions: DisabledRegionNode[]; nav: RemovedNavNode[] }>();
  for (const node of plan.disabledNodes) {
    const entry = byPage.get(node.pageSourceId) ?? { regions: [], nav: [] };
    entry.regions.push(node);
    byPage.set(node.pageSourceId, entry);
  }
  for (const node of plan.removedNavNodes) {
    const entry = byPage.get(node.pageSourceId) ?? { regions: [], nav: [] };
    entry.nav.push(node);
    byPage.set(node.pageSourceId, entry);
  }

  const pageFileById = new Map(before.map((route) => [route.pageSourceId, route.pageFile]));
  const pageFilesRewritten: string[] = [];
  const regionNodesNotFound: DisabledRegionNode[] = [];
  const navNodesNotFound: RemovedNavNode[] = [];
  let regionNodesRemoved = 0;
  let navNodesRemoved = 0;

  for (const [pageSourceId, entry] of [...byPage].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const pageFile = pageFileById.get(pageSourceId);
    if (pageFile === undefined) {
      // The page is not in the route table at all — every node "missing".
      regionNodesNotFound.push(...entry.regions);
      navNodesNotFound.push(...entry.nav);
      continue;
    }
    const file = path.join(dataDir, pageFile);
    const page = JSON.parse(await readFile(file, "utf8")) as RuntimePage;
    let changed = false;
    for (const viewport of ["desktop", "mobile"] as const) {
      const tree = page[viewport];
      if (tree === undefined) continue;
      const wanted = new Set<string>();
      for (const node of entry.regions) if (node.viewport === viewport) wanted.add(node.nodeId);
      for (const node of entry.nav) if (node.viewport === viewport) wanted.add(node.nodeId);
      if (wanted.size === 0) continue;
      const removed = removeNodesById(tree.doc, wanted);
      if (removed.size > 0) changed = true;
      for (const node of entry.regions) {
        if (node.viewport !== viewport) continue;
        if (removed.has(node.nodeId)) regionNodesRemoved += 1;
        else regionNodesNotFound.push(node);
      }
      for (const node of entry.nav) {
        if (node.viewport !== viewport) continue;
        if (removed.has(node.nodeId)) navNodesRemoved += 1;
        else navNodesNotFound.push(node);
      }
    }
    if (changed) {
      await writeFile(file, JSON.stringify(page), "utf8");
      pageFilesRewritten.push(pageFile);
    }
  }

  // ---- orphaned page trees ------------------------------------------------
  // A page no remaining route reaches must not sit in the build copy: the
  // static export would not render it, but the tree would still be an input
  // the build read, and "not exported" is a weaker claim than "not present".
  const stillReferenced = new Set(kept.map((route) => route.pageFile));
  const pageFilesRemoved: string[] = [];
  if (routesRemoved.length > 0) {
    const orphaned = [
      ...new Set(
        before
          .filter((route) => disabled.has(route.key))
          .map((route) => route.pageFile)
          .filter((pageFile) => !stillReferenced.has(pageFile)),
      ),
    ].sort();
    for (const pageFile of orphaned) {
      await rm(path.join(dataDir, pageFile), { force: true });
      pageFilesRemoved.push(pageFile);
    }
  }

  return {
    routesRemoved,
    routesRemaining: kept.length,
    routesNotFound,
    regionNodesRemoved,
    regionNodesNotFound,
    navNodesRemoved,
    navNodesNotFound,
    pageFilesRewritten,
    pageFilesRemoved,
  };
}
