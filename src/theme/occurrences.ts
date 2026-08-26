import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ThemeInputError } from "./types.js";

/**
 * Style-token usage census over the template app's OWN runtime trees.
 *
 * Everything read here ships inside the template artifact
 * (`app/reconstruction-data/pages/*.json`), so the theme layer stays a pure
 * consumer of the Recon Template — no SiteSpec, no observation run, no live
 * browser. The census answers, per `st…` style token:
 *
 *   - how many elements carry it (static tree vs captured dynamic templates)
 *   - whether those elements own direct text (the token's `color` paints)
 *   - heading / anchor-or-button ancestry (semantic evidence, §10)
 *   - landmark section distribution (header / nav / main / footer / body)
 *
 * plus a nodeId → token join so slot bindings (CTA, hero) can name the exact
 * paint identity of their occurrences.
 */

export interface TokenUsage {
  staticElements: number;
  dynamicElements: number;
  /** Elements with a non-whitespace direct text child (color paints text). */
  directText: number;
  headingText: number;
  anchorOrButtonText: number;
  landmarks: Record<string, number>;
  tags: Record<string, number>;
}

export interface UsageCensus {
  byToken: Map<string, TokenUsage>;
  /** `${pageId}|${viewport}|${nodeId}` → first `st…` token on that node. */
  tokenOfNode: Map<string, string>;
  pageIds: string[];
  staticElementCount: number;
  dynamicElementCount: number;
}

interface RuntimeNode {
  k?: string;
  n?: string;
  t?: string;
  v?: string;
  p?: Record<string, unknown>;
  c?: RuntimeNode[];
}

interface WalkContext {
  landmark: string;
  heading: boolean;
  anchorish: boolean;
}

const LANDMARK_TAGS = new Set(["header", "footer", "nav", "main"]);
const CLASS_TOKEN = /^wr-(st\d+)$/;

function ensure(census: UsageCensus, token: string): TokenUsage {
  let usage = census.byToken.get(token);
  if (!usage) {
    usage = {
      staticElements: 0,
      dynamicElements: 0,
      directText: 0,
      headingText: 0,
      anchorOrButtonText: 0,
      landmarks: {},
      tags: {},
    };
    census.byToken.set(token, usage);
  }
  return usage;
}

function walk(
  node: RuntimeNode,
  context: WalkContext,
  census: UsageCensus,
  pageId: string,
  viewport: string,
  dynamic: boolean,
): void {
  if (!node || typeof node !== "object" || node.k === "t") return;
  const tag = node.t ?? "";
  const nextContext: WalkContext = {
    landmark: LANDMARK_TAGS.has(tag) ? tag : context.landmark,
    heading: /^h[1-6]$/.test(tag) ? true : context.heading,
    anchorish: tag === "a" || tag === "button" || tag === "summary" ? true : context.anchorish,
  };
  const rawClass = String(node.p?.["className"] ?? node.p?.["class"] ?? "");
  const tokens: string[] = [];
  for (const cls of rawClass.split(/\s+/)) {
    const match = CLASS_TOKEN.exec(cls);
    if (match) tokens.push(match[1]);
  }
  const hasDirectText = (node.c ?? []).some(
    (child) => child.k === "t" && String(child.v ?? "").trim() !== "",
  );
  if (tokens.length > 0) {
    if (dynamic) census.dynamicElementCount++;
    else census.staticElementCount++;
  }
  for (const token of tokens) {
    const usage = ensure(census, token);
    if (dynamic) usage.dynamicElements++;
    else usage.staticElements++;
    if (hasDirectText) {
      usage.directText++;
      if (nextContext.heading) usage.headingText++;
      if (nextContext.anchorish) usage.anchorOrButtonText++;
    }
    usage.landmarks[nextContext.landmark] = (usage.landmarks[nextContext.landmark] ?? 0) + 1;
    usage.tags[tag] = (usage.tags[tag] ?? 0) + 1;
  }
  const nodeId = node.p?.["data-wr-node"];
  if (typeof nodeId === "string" && tokens[0] !== undefined) {
    census.tokenOfNode.set(`${pageId}|${viewport}|${nodeId}`, tokens[0]);
  }
  // Captured dynamic templates ride inside the trigger's `data-wr-obs`
  // payload — the InteractionRuntime mounts them on click, and their nodes
  // carry the SAME catalog classes, which is exactly why one class-level
  // overlay themes the static page and the mounted mega-menu together (§33).
  const obs = node.p?.["data-wr-obs"];
  if (typeof obs === "string" && obs !== "") {
    try {
      const entries = JSON.parse(obs) as { tpl?: RuntimeNode | RuntimeNode[] }[];
      for (const entry of entries) {
        const roots = Array.isArray(entry.tpl) ? entry.tpl : entry.tpl ? [entry.tpl] : [];
        for (const root of roots) walk(root, nextContext, census, pageId, viewport, true);
      }
    } catch {
      // A malformed payload is the runtime's problem, not the census's.
    }
  }
  for (const child of node.c ?? []) {
    walk(child, nextContext, census, pageId, viewport, dynamic);
  }
}

export async function collectUsageCensus(appDir: string): Promise<UsageCensus> {
  const pagesDir = path.join(appDir, "reconstruction-data", "pages");
  let files: string[];
  try {
    files = (await readdir(pagesDir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new ThemeInputError(`template app has no runtime pages at ${pagesDir}`);
  }
  const census: UsageCensus = {
    byToken: new Map(),
    tokenOfNode: new Map(),
    pageIds: [],
    staticElementCount: 0,
    dynamicElementCount: 0,
  };
  for (const file of files) {
    const parsed = JSON.parse(await readFile(path.join(pagesDir, file), "utf8")) as {
      pageId: string;
      desktop?: { doc: RuntimeNode };
      mobile?: { doc: RuntimeNode };
    };
    census.pageIds.push(parsed.pageId);
    const rootContext: WalkContext = { landmark: "body", heading: false, anchorish: false };
    if (parsed.desktop?.doc) walk(parsed.desktop.doc, rootContext, census, parsed.pageId, "desktop", false);
    if (parsed.mobile?.doc) walk(parsed.mobile.doc, rootContext, census, parsed.pageId, "mobile", false);
  }
  return census;
}
