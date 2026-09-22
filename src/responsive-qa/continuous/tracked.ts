import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CATEGORY_PRIORITY,
  ContinuousQaInputError,
  MAX_ANCESTOR_CLASS_TOKENS,
  MAX_TRACKED_PER_VARIANT,
  SIGNATURE_TEXT_CHARS,
  SKIP_TAGS,
  TRACK_BLOCK_MIN_HEIGHT_PX,
  TRACK_BLOCK_MIN_WIDTH_RATIO,
  TRACK_CTA_MIN_HEIGHT_PX,
  TRACK_CTA_MIN_WIDTH_PX,
  TRACK_MEDIA_MIN_AREA_PX2,
  TRACK_PARAGRAPH_MIN_CHARS,
  VARIANT_IDS,
  type AncestorSig,
  type InPageTarget,
  type SourceRef,
  type TrackCategory,
  type TrackedNode,
  type TrackedVariant,
  type VariantId,
} from "./types.js";

/**
 * Tracked-node selection and correspondence references (brief steps 4–5).
 *
 * The SiteSpec is read LENIENTLY (plain JSON, only the fields this harness
 * needs) rather than through the full zod loader: the harness must keep
 * working on old artifacts and while other streams extend the schema, and it
 * never writes anything back.
 *
 * Correspondence chain (clone → source):
 *   data-wr-node → SiteSpec node → sourceElementId → observer dom.json element
 *   → structural element-child path from <body> (SKIP_TAGS skipped, the
 *     observer's own skip set) + signature (tag, class tokens, text prefix,
 *     child-tag sequence).
 * When the observation's dom.json is not resolvable, the path and signature
 * are derived from the SiteSpec node tree itself (no class tokens there).
 */

const SKIP = new Set(SKIP_TAGS.map((tag) => tag.toLowerCase()));

// ---------------------------------------------------------------------------
// Lenient JSON shapes
// ---------------------------------------------------------------------------

interface SpecNode {
  nodeId: string;
  type: string;
  sourceElementId?: string;
  parentNodeId?: string;
  childNodeIds?: string[];
  tagName?: string;
  effectiveVisible?: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  styleTokenId?: string;
  value?: string;
}

interface SpecViewport {
  profile?: { width?: number };
  nodes?: SpecNode[];
  rootNodeIds?: string[];
}

export interface PageSpecLite {
  pageId: string;
  url?: string;
  sourceObservation?: string;
  viewports?: Partial<Record<VariantId, SpecViewport>>;
  [key: string]: unknown;
}

export interface SiteSpecLite {
  rootDir: string;
  siteSpec: {
    rootUrl?: string;
    routes?: Array<{
      url?: string;
      pathname?: string;
      pageId?: string;
      renderSourcePageId?: string;
    }>;
    pages?: Array<{ pageId: string; file: string }>;
    styleCatalogFile?: string;
  };
  styleProps: Map<string, { display?: string; position?: string }>;
  readPage(pageId: string): Promise<PageSpecLite>;
}

export interface DomRecord {
  id: string;
  parentId?: string;
  tagName: string;
  attributes?: Record<string, string>;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new ContinuousQaInputError(
      `cannot read JSON ${file}: ${err instanceof Error ? err.message.split("\n", 1)[0] : String(err)}`,
    );
  }
}

export async function readSiteSpecLite(siteSpecFile: string): Promise<SiteSpecLite> {
  const absolute = path.resolve(siteSpecFile);
  const rootDir = path.dirname(absolute);
  const siteSpec = (await readJson(absolute)) as SiteSpecLite["siteSpec"];
  const styleProps = new Map<string, { display?: string; position?: string }>();
  if (siteSpec.styleCatalogFile) {
    const catalogFile = path.join(rootDir, siteSpec.styleCatalogFile);
    if (existsSync(catalogFile)) {
      const catalog = (await readJson(catalogFile)) as {
        styles?: Array<{ styleTokenId: string; properties?: Record<string, string> }>;
      };
      for (const style of catalog.styles ?? []) {
        styleProps.set(style.styleTokenId, {
          display: style.properties?.display,
          position: style.properties?.position,
        });
      }
    }
  }
  const cache = new Map<string, PageSpecLite>();
  return {
    rootDir,
    siteSpec,
    styleProps,
    async readPage(pageId: string): Promise<PageSpecLite> {
      const cached = cache.get(pageId);
      if (cached) return cached;
      const entry = siteSpec.pages?.find((page) => page.pageId === pageId);
      if (!entry) throw new ContinuousQaInputError(`site-spec has no page ${pageId}`);
      const page = (await readJson(path.join(rootDir, entry.file))) as PageSpecLite;
      cache.set(pageId, page);
      return page;
    },
  };
}

// ---------------------------------------------------------------------------
// Text / tree helpers
// ---------------------------------------------------------------------------

export function signatureText(text: string, chars: number = SIGNATURE_TEXT_CHARS): string {
  return text.replace(/\s+/g, "").slice(0, chars);
}

interface TreeIndex {
  byId: Map<string, SpecNode>;
  bySourceElement: Map<string, SpecNode>;
  elementChildren: Map<string, SpecNode[]>;
  descendantText: Map<string, string>;
  order: SpecNode[];
  body: SpecNode | undefined;
}

function indexTree(viewport: SpecViewport): TreeIndex {
  const nodes = viewport.nodes ?? [];
  const byId = new Map<string, SpecNode>();
  const bySourceElement = new Map<string, SpecNode>();
  for (const node of nodes) {
    byId.set(node.nodeId, node);
    if (node.sourceElementId) bySourceElement.set(node.sourceElementId, node);
  }
  const elementChildren = new Map<string, SpecNode[]>();
  const descendantText = new Map<string, string>();
  const order: SpecNode[] = [];
  const roots =
    viewport.rootNodeIds && viewport.rootNodeIds.length > 0
      ? viewport.rootNodeIds
      : nodes.filter((node) => !node.parentNodeId).map((node) => node.nodeId);
  // Iterative post-order so deep trees cannot overflow the stack.
  const visit = (rootId: string): void => {
    const stack: Array<{ id: string; expanded: boolean }> = [{ id: rootId, expanded: false }];
    while (stack.length > 0) {
      const top = stack.pop()!;
      const node = byId.get(top.id);
      if (!node) continue;
      if (!top.expanded) {
        if (node.type === "element") order.push(node);
        stack.push({ id: top.id, expanded: true });
        const children = node.childNodeIds ?? [];
        for (let i = children.length - 1; i >= 0; i--) stack.push({ id: children[i]!, expanded: false });
        continue;
      }
      if (node.type !== "element") continue;
      const tag = (node.tagName ?? "").toLowerCase();
      let text = "";
      const kids: SpecNode[] = [];
      for (const childId of node.childNodeIds ?? []) {
        const child = byId.get(childId);
        if (!child) continue;
        if (child.type === "text") {
          if (text.length < 4000) text += child.value ?? "";
        } else if (child.type === "element") {
          const childTag = (child.tagName ?? "").toLowerCase();
          if (SKIP.has(childTag)) continue;
          kids.push(child);
          if (childTag !== "svg" && text.length < 4000) text += descendantText.get(child.nodeId) ?? "";
        }
      }
      elementChildren.set(node.nodeId, kids);
      descendantText.set(node.nodeId, tag === "svg" ? "" : text);
    }
  };
  for (const root of roots) visit(root);
  const body = order.find((node) => (node.tagName ?? "").toLowerCase() === "body");
  return { byId, bySourceElement, elementChildren, descendantText, order, body };
}

interface DomIndex {
  byId: Map<string, DomRecord>;
  children: Map<string, DomRecord[]>;
  body: DomRecord | undefined;
  pathOf: Map<string, number[]>;
  byPath: Map<string, DomRecord>;
}

function indexDom(records: readonly DomRecord[]): DomIndex {
  const byId = new Map<string, DomRecord>();
  const children = new Map<string, DomRecord[]>();
  for (const record of records) {
    byId.set(record.id, record);
    if (record.parentId) {
      if (SKIP.has(record.tagName.toLowerCase())) continue;
      if (!children.has(record.parentId)) children.set(record.parentId, []);
      children.get(record.parentId)!.push(record);
    }
  }
  const body = records.find((record) => record.tagName.toLowerCase() === "body");
  const pathOf = new Map<string, number[]>();
  const byPath = new Map<string, DomRecord>();
  if (body) {
    const stack: Array<{ record: DomRecord; path: number[] }> = [{ record: body, path: [] }];
    while (stack.length > 0) {
      const { record, path: p } = stack.pop()!;
      pathOf.set(record.id, p);
      byPath.set(p.join("."), record);
      const kids = children.get(record.id) ?? [];
      kids.forEach((kid, index) => stack.push({ record: kid, path: [...p, index] }));
    }
  }
  return { byId, children, body, pathOf, byPath };
}

function classTokens(record: DomRecord | undefined): string[] {
  const raw = record?.attributes?.class;
  if (typeof raw !== "string") return [];
  return [...new Set(raw.split(/\s+/).filter(Boolean))].sort();
}

function refFromDom(dom: DomIndex, record: DomRecord, tree: TreeIndex): SourceRef | null {
  const p = dom.pathOf.get(record.id);
  if (!p) return null;
  const tag = record.tagName.toLowerCase();
  const specNode = tree.bySourceElement.get(record.id);
  const text = specNode ? signatureText(tree.descendantText.get(specNode.nodeId) ?? "") : "";
  // Ancestor signatures along the path (body excluded), target last.
  const chain: DomRecord[] = [];
  let current: DomRecord | undefined = record;
  while (current && current !== dom.body) {
    chain.push(current);
    current = current.parentId ? dom.byId.get(current.parentId) : undefined;
  }
  chain.reverse();
  const anc: AncestorSig[] | undefined =
    chain.length === p.length
      ? chain.map((element) => {
          const sig: AncestorSig = {
            tag: element.tagName.toLowerCase(),
            classes: classTokens(element).slice(0, MAX_ANCESTOR_CLASS_TOKENS),
          };
          const id = element.attributes?.id;
          if (typeof id === "string" && id.length > 0) sig.id = id;
          const siblings = element.parentId ? dom.children.get(element.parentId) : undefined;
          if (siblings) sig.n = siblings.length;
          return sig;
        })
      : undefined;
  const ref: SourceRef = {
    path: p,
    tag,
    classes: classTokens(record),
    text,
    childTags: tag === "svg" ? null : (dom.children.get(record.id) ?? []).map((kid) => kid.tagName.toLowerCase()),
  };
  if (anc) ref.anc = anc;
  const siblings = record.parentId ? dom.children.get(record.parentId) : undefined;
  if (siblings) ref.sib = siblings.length;
  return ref;
}

function treePathOf(tree: TreeIndex, node: SpecNode): number[] | null {
  const out: number[] = [];
  let current: SpecNode | undefined = node;
  while (current && current !== tree.body) {
    const parent: SpecNode | undefined = current.parentNodeId ? tree.byId.get(current.parentNodeId) : undefined;
    if (!parent) return null;
    const index = (tree.elementChildren.get(parent.nodeId) ?? []).indexOf(current);
    if (index < 0) return null;
    out.push(index);
    current = parent;
  }
  return current === tree.body ? out.reverse() : null;
}

const treePathCache = new WeakMap<TreeIndex, Map<string, SpecNode>>();

function treePathIndex(tree: TreeIndex): Map<string, SpecNode> {
  const cached = treePathCache.get(tree);
  if (cached) return cached;
  const map = new Map<string, SpecNode>();
  if (tree.body) {
    const stack: Array<{ node: SpecNode; path: number[] }> = [{ node: tree.body, path: [] }];
    while (stack.length > 0) {
      const { node, path: p } = stack.pop()!;
      map.set(p.join("."), node);
      (tree.elementChildren.get(node.nodeId) ?? []).forEach((kid, index) =>
        stack.push({ node: kid, path: [...p, index] }),
      );
    }
  }
  treePathCache.set(tree, map);
  return map;
}

function refFromTree(tree: TreeIndex, node: SpecNode): SourceRef | null {
  const p = treePathOf(tree, node);
  if (!p) return null;
  const tag = (node.tagName ?? "").toLowerCase();
  const ref: SourceRef = {
    path: p,
    tag,
    classes: [],
    text: signatureText(tree.descendantText.get(node.nodeId) ?? ""),
    childTags:
      tag === "svg"
        ? null
        : (tree.elementChildren.get(node.nodeId) ?? []).map((kid) => (kid.tagName ?? "").toLowerCase()),
  };
  const siblings = node.parentNodeId ? tree.elementChildren.get(node.parentNodeId) : undefined;
  if (siblings) ref.sib = siblings.length;
  return ref;
}

// ---------------------------------------------------------------------------
// Observation dom.json resolution
// ---------------------------------------------------------------------------

export async function readObservationDom(
  pageSpec: PageSpecLite,
  variant: VariantId,
  searchRoots: readonly string[],
): Promise<{ records: DomRecord[]; file: string } | null> {
  const observation = pageSpec.sourceObservation;
  if (typeof observation !== "string" || observation.length === 0) return null;
  for (const root of searchRoots) {
    const observationFile = path.resolve(root, observation);
    if (!existsSync(observationFile)) continue;
    const observationDir = path.dirname(observationFile);
    let domRel = `viewports/${variant}/dom.json`;
    try {
      const parsed = JSON.parse(await readFile(observationFile, "utf8")) as {
        viewports?: Record<string, { files?: { dom?: string } }>;
      };
      const declared = parsed.viewports?.[variant]?.files?.dom;
      if (typeof declared === "string" && declared.length > 0) domRel = declared;
    } catch {
      // fall through to the conventional layout
    }
    const domFile = path.resolve(observationDir, domRel);
    if (!domFile.startsWith(observationDir) || !existsSync(domFile)) continue;
    const records = JSON.parse(await readFile(domFile, "utf8")) as unknown;
    if (!Array.isArray(records)) continue;
    return { records: records as DomRecord[], file: domFile };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

const BLOCK_LEVEL = new Set(["block", "flow-root", "list-item", "flex", "grid", "table"]);
const FLEX_GRID = new Set(["flex", "inline-flex", "grid", "inline-grid"]);
const MEDIA_TAGS = new Set(["img", "picture", "video", "svg", "canvas"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);
const EXCLUDED_TAGS = new Set(["html", "body", "head"]);

function sameBox(
  a: SpecNode["boundingBox"],
  b: SpecNode["boundingBox"],
): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  );
}

export interface BuildTrackedInput {
  pageSpec: PageSpecLite;
  styleProps: SiteSpecLite["styleProps"];
  /** dom.json per variant (null → SiteSpec-tree fallback). */
  dom: Partial<Record<VariantId, DomRecord[] | null>>;
  maxPerVariant?: number;
}

export function buildTrackedVariants(input: BuildTrackedInput): TrackedVariant[] {
  const cap = input.maxPerVariant ?? MAX_TRACKED_PER_VARIANT;
  const trees = new Map<VariantId, TreeIndex>();
  const doms = new Map<VariantId, DomIndex>();
  for (const variant of VARIANT_IDS) {
    const viewport = input.pageSpec.viewports?.[variant];
    if (!viewport) continue;
    trees.set(variant, indexTree(viewport));
    const records = input.dom[variant];
    if (records && records.length > 0) doms.set(variant, indexDom(records));
  }
  const out: TrackedVariant[] = [];
  for (const variant of VARIANT_IDS) {
    const viewport = input.pageSpec.viewports?.[variant];
    const tree = trees.get(variant);
    if (!viewport || !tree) continue;
    const other: VariantId = variant === "desktop" ? "mobile" : "desktop";
    const truthWidth = viewport.profile?.width ?? 0;
    const dom = doms.get(variant);
    const otherDom = doms.get(other);
    const otherTree = trees.get(other);

    interface Candidate {
      node: SpecNode;
      order: number;
      categories: TrackCategory[];
    }
    const candidates: Candidate[] = [];
    let dedupedWrappers = 0;
    tree.order.forEach((node, order) => {
      const tag = (node.tagName ?? "").toLowerCase();
      if (EXCLUDED_TAGS.has(tag) || SKIP.has(tag)) return;
      if (node.effectiveVisible !== true) return;
      const box = node.boundingBox;
      if (!box) return;
      const style = node.styleTokenId ? input.styleProps.get(node.styleTokenId) : undefined;
      const display = style?.display ?? "";
      const position = style?.position ?? "";
      const text = (tree.descendantText.get(node.nodeId) ?? "").replace(/\s+/g, " ").trim();
      const kids = tree.elementChildren.get(node.nodeId) ?? [];
      const visibleKids = kids.filter((kid) => kid.effectiveVisible === true).length;
      const categories: TrackCategory[] = [];
      if (
        BLOCK_LEVEL.has(display) &&
        truthWidth > 0 &&
        box.width >= TRACK_BLOCK_MIN_WIDTH_RATIO * truthWidth &&
        box.height >= TRACK_BLOCK_MIN_HEIGHT_PX
      ) {
        categories.push("a");
      }
      if (FLEX_GRID.has(display) && visibleKids >= 2) categories.push("b");
      if (HEADING_TAGS.has(tag) && text.length > 0) categories.push("c");
      if (
        (tag === "a" || tag === "button") &&
        text.length > 0 &&
        box.width >= TRACK_CTA_MIN_WIDTH_PX &&
        box.height >= TRACK_CTA_MIN_HEIGHT_PX
      ) {
        if (!categories.includes("c")) categories.push("c");
      }
      if (MEDIA_TAGS.has(tag) && box.width * box.height >= TRACK_MEDIA_MIN_AREA_PX2) categories.push("d");
      if (position === "fixed" || position === "sticky") categories.push("e");
      if (tag === "p" && text.length >= TRACK_PARAGRAPH_MIN_CHARS) categories.push("f");
      if (categories.length === 0) return;
      if (categories.length === 1 && categories[0] === "a" && node.parentNodeId) {
        const parent = tree.byId.get(node.parentNodeId);
        const parentKids = parent ? tree.elementChildren.get(parent.nodeId) ?? [] : [];
        const parentStyle = parent?.styleTokenId ? input.styleProps.get(parent.styleTokenId) : undefined;
        const parentIsBlockCandidate =
          parent !== undefined &&
          parent.effectiveVisible === true &&
          BLOCK_LEVEL.has(parentStyle?.display ?? "") &&
          !EXCLUDED_TAGS.has((parent.tagName ?? "").toLowerCase());
        if (parentIsBlockCandidate && parentKids.length === 1 && sameBox(parent!.boundingBox, box)) {
          // A single-child wrapper with the identical truth box: the outer one
          // is already tracked and carries the same geometry.
          dedupedWrappers++;
          return;
        }
      }
      categories.sort((x, y) => CATEGORY_PRIORITY.indexOf(x) - CATEGORY_PRIORITY.indexOf(y));
      candidates.push({ node, order, categories });
    });

    const ranked = [...candidates].sort(
      (x, y) =>
        CATEGORY_PRIORITY.indexOf(x.categories[0]!) - CATEGORY_PRIORITY.indexOf(y.categories[0]!) ||
        x.order - y.order,
    );
    const kept = ranked.slice(0, cap).sort((x, y) => x.order - y.order);

    const nodes: TrackedNode[] = kept.map(({ node, order, categories }) => {
      const tag = (node.tagName ?? "").toLowerCase();
      let primary: SourceRef | null = null;
      let refSource: TrackedNode["refSource"] = "none";
      if (dom && node.sourceElementId) {
        const record = dom.byId.get(node.sourceElementId);
        if (record) {
          primary = refFromDom(dom, record, tree);
          if (primary) refSource = "dom-json";
        }
      }
      if (!primary) {
        primary = refFromTree(tree, node);
        if (primary) refSource = "sitespec-tree";
      }
      let alt: SourceRef | null = null;
      if (primary && otherTree) {
        const key = primary.path.join(".");
        if (otherDom) {
          const record = otherDom.byPath.get(key);
          if (record) alt = refFromDom(otherDom, record, otherTree);
        } else {
          const otherNode = treePathIndex(otherTree).get(key);
          if (otherNode) alt = refFromTree(otherTree, otherNode);
        }
      }
      const text = (tree.descendantText.get(node.nodeId) ?? "").trim();
      return {
        key: `${variant}:${node.nodeId}`,
        variant,
        nodeId: node.nodeId,
        tag,
        category: categories[0]!,
        categories,
        documentOrder: order,
        primary,
        alt,
        refSource,
        hasText: text.length > 0,
        isMedia: MEDIA_TAGS.has(tag),
        truthBox: {
          x: node.boundingBox!.x,
          y: node.boundingBox!.y,
          width: node.boundingBox!.width,
          height: node.boundingBox!.height,
        },
      };
    });
    out.push({
      variant,
      truthWidth,
      nodes,
      candidates: candidates.length,
      capped: candidates.length > cap,
      dedupedWrappers,
    });
  }
  return out;
}

export function toInPageTargets(variants: readonly TrackedVariant[]): InPageTarget[] {
  const targets: InPageTarget[] = [];
  for (const variant of variants) {
    for (const node of variant.nodes) {
      targets.push({
        k: node.key,
        vp: node.variant,
        n: node.nodeId,
        p: node.primary,
        a: node.alt,
        wl: node.categories.includes("c"),
        wc: node.categories.includes("b"),
        wm: node.categories.includes("d"),
        wt: node.categories.includes("c") || node.categories.includes("f"),
      });
    }
  }
  return targets;
}
