import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/index.js";
import type { Variant } from "./types.js";

/**
 * One indexing pass over the reconstructed page trees, shared by every
 * consumer (surface scan, grouping, coverage).
 *
 * The reconstruction holds TWO independent trees per page (desktop/mobile);
 * node ids repeat across them but mean different nodes, so every index is
 * keyed per (page, variant). Landmark and aria-hidden are inherited during the
 * walk because both are ANCESTOR properties — a span inside `aria-hidden` is
 * hidden even though it carries no attribute of its own.
 */

export interface NodeInfo {
  node: RuntimeElementNode;
  parentId?: string;
  depth: number;
  /** Nearest ancestor-or-self landmark: header/footer/nav/main/aside/body. */
  landmark: string;
  ariaHidden: boolean;
  classes: string[];
}

export interface VariantIndex {
  pageId: string;
  variant: Variant;
  root: RuntimeElementNode;
  byId: Map<string, NodeInfo>;
  /** Document order — the only ordering any deterministic output may use. */
  order: string[];
}

export interface PageIndex {
  pageId: string;
  desktop: VariantIndex;
  mobile: VariantIndex;
}

const LANDMARK_TAGS = new Set(["header", "footer", "nav", "main", "aside"]);
const LANDMARK_ROLES: Record<string, string> = {
  banner: "header",
  contentinfo: "footer",
  navigation: "nav",
  main: "main",
};

export const VARIANTS: readonly Variant[] = ["desktop", "mobile"];

function landmarkOf(node: RuntimeElementNode, inherited: string): string {
  const tag = node.t.toLowerCase();
  if (LANDMARK_TAGS.has(tag)) return tag;
  const role = node.p?.["role"];
  if (typeof role === "string" && LANDMARK_ROLES[role]) return LANDMARK_ROLES[role]!;
  return inherited;
}

function classesOf(node: RuntimeElementNode): string[] {
  const raw = node.p?.["className"];
  if (typeof raw !== "string" || raw === "") return [];
  return raw.split(/\s+/).filter((c) => c !== "");
}

export function indexVariant(
  pageId: string,
  variant: Variant,
  root: RuntimeElementNode,
): VariantIndex {
  const byId = new Map<string, NodeInfo>();
  const order: string[] = [];
  const visit = (
    node: RuntimeElementNode,
    parentId: string | undefined,
    depth: number,
    landmark: string,
    ariaHidden: boolean,
  ): void => {
    const ownLandmark = landmarkOf(node, landmark);
    const hidden = ariaHidden || node.p?.["aria-hidden"] === "true";
    byId.set(node.n, {
      node,
      parentId,
      depth,
      landmark: ownLandmark,
      ariaHidden: hidden,
      classes: classesOf(node),
    });
    order.push(node.n);
    for (const child of node.c ?? []) {
      if (child.k === "e") visit(child, node.n, depth + 1, ownLandmark, hidden);
    }
  };
  visit(root, undefined, 0, "body", false);
  return { pageId, variant, root, byId, order };
}

export function indexPages(pages: Map<string, RuntimePage>): Map<string, PageIndex> {
  const out = new Map<string, PageIndex>();
  for (const [pageId, page] of [...pages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.set(pageId, {
      pageId,
      desktop: indexVariant(pageId, "desktop", page.desktop.doc),
      mobile: indexVariant(pageId, "mobile", page.mobile.doc),
    });
  }
  return out;
}

export function variantIndex(page: PageIndex, variant: Variant): VariantIndex {
  return variant === "desktop" ? page.desktop : page.mobile;
}

/** True when `ancestorId` is a strict ancestor of `nodeId` in this variant. */
export function isAncestor(index: VariantIndex, ancestorId: string, nodeId: string): boolean {
  let cursor = index.byId.get(nodeId)?.parentId;
  while (cursor !== undefined) {
    if (cursor === ancestorId) return true;
    cursor = index.byId.get(cursor)?.parentId;
  }
  return false;
}

/** Root-first ancestor chain, self last. */
export function ancestorChain(index: VariantIndex, nodeId: string): string[] {
  const chain: string[] = [];
  let cursor: string | undefined = nodeId;
  while (cursor !== undefined) {
    chain.push(cursor);
    cursor = index.byId.get(cursor)?.parentId;
  }
  return chain.reverse();
}

/** Nearest common ancestor of a set of node ids (undefined if disjoint trees). */
export function nearestCommonAncestor(index: VariantIndex, nodeIds: readonly string[]): string | undefined {
  let common: string[] | undefined;
  for (const nodeId of nodeIds) {
    if (!index.byId.has(nodeId)) continue;
    const chain = ancestorChain(index, nodeId);
    if (!common) {
      common = chain;
      continue;
    }
    let i = 0;
    while (i < common.length && i < chain.length && common[i] === chain[i]) i++;
    common = common.slice(0, i);
  }
  return common && common.length > 0 ? common[common.length - 1] : undefined;
}

/**
 * The `.`-joined child-index path from `rootId` down to `nodeId`, or undefined
 * when `nodeId` is not inside that subtree. Indexes address `node.c` and so
 * count TEXT children too — the same coordinate system `childIndex` uses, so a
 * binding's `childIndex` stays meaningful after the path is followed.
 */
export function childPath(
  index: VariantIndex,
  rootId: string,
  nodeId: string,
): number[] | undefined {
  const path: number[] = [];
  let cursor = nodeId;
  while (cursor !== rootId) {
    const info = index.byId.get(cursor);
    if (!info || info.parentId === undefined) return undefined;
    const parent = index.byId.get(info.parentId);
    if (!parent) return undefined;
    const children = parent.node.c ?? [];
    let found = -1;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.k === "e" && child.n === cursor) {
        found = i;
        break;
      }
    }
    if (found === -1) return undefined;
    path.push(found);
    cursor = info.parentId;
  }
  return path.reverse();
}

/** Follow a `childPath` inside a (possibly cloned) subtree. */
export function nodeAtPath(
  root: RuntimeElementNode,
  path: readonly number[],
): RuntimeElementNode | undefined {
  let node: RuntimeElementNode = root;
  for (const index of path) {
    const child = (node.c ?? [])[index];
    if (!child || child.k !== "e") return undefined;
    node = child;
  }
  return node;
}

export function parsePath(path: string): number[] {
  return path === "" ? [] : path.split(".").map((p) => Number.parseInt(p, 10));
}

export function formatPath(path: readonly number[]): string {
  return path.join(".");
}

export function textChildren(node: RuntimeElementNode): Array<{ childIndex: number; value: string }> {
  const out: Array<{ childIndex: number; value: string }> = [];
  const children: RuntimeNode[] = node.c ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.k === "t") out.push({ childIndex: i, value: child.v });
  }
  return out;
}

/** Slug used inside generated slot keys — deterministic, ascii-safe, bounded. */
export function slugify(value: string, max = 28): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9À-￿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = cleaned === "" ? "x" : cleaned;
  return slug.length > max ? slug.slice(0, max).replace(/-+$/g, "") : slug;
}
