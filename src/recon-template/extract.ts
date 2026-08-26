import type {
  RuntimeElementNode,
  RuntimeNode,
  RuntimePage,
} from "../reconstruction/index.js";
import { TemplateCompileError, type SlotSurface } from "./types.js";
import { scanSvgTextRuns } from "./svg-text.js";

/**
 * Slot candidate extraction — the only pass that reads the DOM trees.
 *
 * Walks every runtime page document (desktop + mobile) of the Exact
 * Reconstruction, plus every captured dynamic template carried in `data-wr-obs`
 * trigger annotations, and produces flat OCCURRENCE lists: every user-visible
 * text run, every `<a href>`, every `<img>`. Grouping into logical slots is a
 * separate pass (`grouping.ts`) — extraction states what exists and where,
 * nothing more.
 *
 * What is deliberately NOT a candidate (generic evidence only, no site rule):
 *
 *   - anything inside an `aria-hidden="true"` subtree (decorative visuals —
 *     this single rule is what keeps Stripe's invoice-mockup UI from becoming
 *     hundreds of unusable slots)
 *   - anything inside `role="presentation"` / `role="none"`
 *   - inline SVG internals (the `v` channel is opaque, never descended)
 *   - `script` / `style` / `noscript` / `template` subtrees
 *   - pure-whitespace text nodes (they are layout data, not content)
 *   - every URL that is not an `<a>`/`<area>` `href` or an `<img>` source —
 *     script src, stylesheet href, preload, form action and iframe src are
 *     structurally unreachable because the walk never reads them
 *
 * Exclusions are COUNTED with their evidence so the report can show what was
 * left out and why.
 */

export type Viewport = "desktop" | "mobile";

/** Section label used for keys and grouping — derived from landmark ancestry. */
export type Section = "header" | "nav" | "main" | "footer" | "body";

interface OccurrenceBase {
  pageId: string;
  viewport: Viewport;
  surface: SlotSurface;
  /** dynamic-template only: the static trigger element carrying `data-wr-obs`. */
  triggerNodeId?: string;
  /** dynamic-template only: the observed-target entry (`dt000001…`). */
  discoveryId?: string;
  section: Section;
  /** Deterministic document-order counter within (page, viewport, surface). */
  docOrder: number;
  /** Largest same-tag sibling repetition along the ancestor chain. */
  maxRepetition: number;
}

export interface TextOccurrence extends OccurrenceBase {
  kind: "text";
  /** Static: element node id (`n…`). Dynamic: template node id (`t…`). */
  ownerNodeId: string;
  /** Absolute index into the owner's children array. */
  childIndex: number;
  /** Index among the owner's TEXT children. */
  textSegment: number;
  /** Raw value, never trimmed — whitespace is data. */
  value: string;
  ownerTag: string;
  /** Nearest heading ancestor level (1–6), if any. */
  headingLevel?: number;
  /** Nearest ancestor anchor (same surface), when inside a link. */
  anchorNodeId?: string;
  anchorHref?: string;
  /** Element node ids from the owner up to the surface root (nearest first). */
  ancestorIds: string[];
}

export interface UrlOccurrence extends OccurrenceBase {
  kind: "url";
  /** The anchor element itself. */
  nodeId: string;
  href: string;
  /** The attribute/prop name that held the href on this surface. */
  attributeName: string;
  ancestorIds: string[];
}

export interface ImageOccurrence extends OccurrenceBase {
  kind: "image";
  nodeId: string;
  src: string;
  alt?: string;
  srcset?: string;
  /** Surface-correct prop names (`srcSet` on static, `srcset` on dynamic). */
  propNames: { src: string; alt?: string; srcset?: string };
  /** Nearest ancestor anchor href, when the image sits inside a link. */
  anchorHref?: string;
  ancestorIds: string[];
}

/**
 * A text node inside an `aria-hidden="true"` subtree (Task 19.1). NOT a slot
 * candidate — recorded solely so the paint-twin pass can co-bind a proven
 * visual duplicate of an already-slotted visible occurrence. Static surface
 * only (dynamic templates carry no observed geometry to prove a twin with).
 */
export interface HiddenTextOccurrence {
  pageId: string;
  viewport: Viewport;
  ownerNodeId: string;
  childIndex: number;
  textSegment: number;
  value: string;
  /** Element ids from the owner up to the document root (nearest first). */
  ancestorIds: string[];
  /** The `aria-hidden="true"` boundary element this occurrence lives under. */
  hiddenRootNodeId: string;
  /** Order among hidden occurrences (its own counter — never perturbs slots). */
  hiddenOrder: number;
}

/**
 * A rendered character run inside an inline SVG (Task 19.1). The SVG subtree
 * stays opaque — this is the one narrow, deterministic exception: actual
 * user-visible `<text>`/`<tspan>` content, addressed by run index.
 */
export interface SvgTextOccurrence extends OccurrenceBase {
  kind: "svg-text";
  /** The SVG HOST element (`node.v` owner) in the walked tree. */
  hostNodeId: string;
  svgTextIndex: number;
  svgTextPath: string;
  /** Decoded run value — what the user reads. */
  value: string;
  /** Nearest ancestor anchor (same surface), when inside a link. */
  anchorNodeId?: string;
  anchorHref?: string;
  ancestorIds: string[];
}

export interface PageExtraction {
  pageId: string;
  texts: TextOccurrence[];
  urls: UrlOccurrence[];
  images: ImageOccurrence[];
  /** Task 19.1 channels — never slot candidates by themselves. */
  hiddenTexts: HiddenTextOccurrence[];
  svgTexts: SvgTextOccurrence[];
  /** First `<h1>` text occurrence in `main`, per viewport, when present. */
  heroHeadline: Partial<Record<Viewport, TextOccurrence>>;
  /** Ancestor chain (nearest-first) of that h1's OWNER element, per viewport. */
  heroAncestors: Partial<Record<Viewport, string[]>>;
  /** Sections that produced at least one candidate occurrence. */
  sectionsPresent: Set<Section>;
}

export interface ExtractionResult {
  pages: Map<string, PageExtraction>;
  /** Exclusion evidence tag → number of candidates it excluded. */
  excluded: Map<string, number>;
}

const SKIPPED_SUBTREE_TAGS = new Set(["script", "style", "noscript", "template"]);

function isHiddenBoundary(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  const ariaHidden = props["aria-hidden"];
  if (ariaHidden === "true" || ariaHidden === true) return "aria-hidden";
  const role = props["role"];
  if (role === "presentation" || role === "none") return "presentation-role";
  return undefined;
}

function stringProp(
  props: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const value = props?.[name];
  return typeof value === "string" ? value : undefined;
}

const HEADING_TAGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

interface WalkContext {
  pageId: string;
  viewport: Viewport;
  surface: SlotSurface;
  triggerNodeId?: string;
  discoveryId?: string;
  hrefProp: string;
  srcsetProp: string;
  out: PageExtraction;
  excluded: Map<string, number>;
  counter: { value: number };
  /** Independent counter for hidden-text occurrences (twin pass ordering). */
  hiddenCounter: { value: number };
}

interface WalkState {
  landmark: "header" | "footer" | "main" | "body";
  inNav: boolean;
  headingLevel?: number;
  anchorNodeId?: string;
  anchorHref?: string;
  ancestorIds: string[];
  maxRepetition: number;
}

function sectionOf(state: WalkState): Section {
  if (state.landmark === "header") return "header";
  if (state.landmark === "footer") return "footer";
  if (state.inNav) return "nav";
  return state.landmark === "main" ? "main" : "body";
}

/**
 * Record every text node under an aria-hidden boundary (skipping svg / script
 * / style / nested presentation subtrees — those can never be twins).
 * `ancestors` is the chain from the CURRENT element up to the document root,
 * nearest first, and already includes the boundary element.
 */
function collectHiddenTexts(
  node: RuntimeElementNode,
  ctx: WalkContext,
  ancestors: string[],
  hiddenRootNodeId: string,
): void {
  if (SKIPPED_SUBTREE_TAGS.has(node.t) || node.v !== undefined) return;
  const children = node.c ?? [];
  let textSegment = 0;
  for (let childIndex = 0; childIndex < children.length; childIndex++) {
    const child = children[childIndex];
    if (child.k === "t") {
      const segment = textSegment++;
      if (child.v.trim() === "") continue;
      ctx.out.hiddenTexts.push({
        pageId: ctx.pageId,
        viewport: ctx.viewport,
        ownerNodeId: node.n,
        childIndex,
        textSegment: segment,
        value: child.v,
        ancestorIds: ancestors,
        hiddenRootNodeId,
        hiddenOrder: ctx.hiddenCounter.value++,
      });
      continue;
    }
    collectHiddenTexts(child, ctx, [child.n, ...ancestors], hiddenRootNodeId);
  }
}

function countExcluded(excluded: Map<string, number>, evidence: string, node: RuntimeNode): void {
  // Count every text / image / anchor candidate the exclusion suppressed.
  if (node.k === "t") {
    if (node.v.trim() !== "") excluded.set(evidence, (excluded.get(evidence) ?? 0) + 1);
    return;
  }
  const props = node.p as Record<string, unknown> | undefined;
  if (node.t === "img" && typeof props?.["src"] === "string") {
    excluded.set(evidence, (excluded.get(evidence) ?? 0) + 1);
  }
  if ((node.t === "a" || node.t === "area") && typeof props?.["href"] === "string") {
    excluded.set(evidence, (excluded.get(evidence) ?? 0) + 1);
  }
  for (const child of node.c ?? []) countExcluded(excluded, evidence, child);
}

function walkElement(node: RuntimeElementNode, ctx: WalkContext, state: WalkState): void {
  const props = node.p as Record<string, unknown> | undefined;

  if (SKIPPED_SUBTREE_TAGS.has(node.t)) {
    countExcluded(ctx.excluded, `skipped-tag:${node.t}`, node);
    return;
  }
  const hidden = isHiddenBoundary(props);
  if (hidden) {
    countExcluded(ctx.excluded, hidden, node);
    // Task 19.1: aria-hidden subtrees stay non-candidates, but their text
    // nodes are recorded so the paint-twin pass can co-bind PROVEN visual
    // duplicates of slotted visible text. Static surface only.
    if (hidden === "aria-hidden" && ctx.surface === "static") {
      collectHiddenTexts(node, ctx, [node.n, ...state.ancestorIds], node.n);
    }
    return;
  }
  if (node.v !== undefined) {
    // Inline SVG host — the subtree is opaque markup, never a slot source.
    // Task 19.1 exception: rendered `<text>`/`<tspan>` character runs become
    // svg-text occurrences (the ONLY thing observed inside the markup).
    ctx.excluded.set("svg-opaque", (ctx.excluded.get("svg-opaque") ?? 0) + 1);
    const hostState: WalkState = { ...state, ancestorIds: [node.n, ...state.ancestorIds] };
    const section = sectionOf(hostState);
    for (const run of scanSvgTextRuns(node.v)) {
      if (!run.candidate) {
        if (run.excludedBecause !== undefined) {
          ctx.excluded.set(run.excludedBecause, (ctx.excluded.get(run.excludedBecause) ?? 0) + 1);
        }
        continue;
      }
      ctx.out.svgTexts.push({
        kind: "svg-text",
        pageId: ctx.pageId,
        viewport: ctx.viewport,
        surface: ctx.surface,
        triggerNodeId: ctx.triggerNodeId,
        discoveryId: ctx.discoveryId,
        section,
        docOrder: ctx.counter.value++,
        maxRepetition: state.maxRepetition,
        hostNodeId: node.n,
        svgTextIndex: run.index,
        svgTextPath: run.path,
        value: run.value,
        anchorNodeId: state.anchorNodeId,
        anchorHref: state.anchorHref,
        ancestorIds: hostState.ancestorIds.slice(0, 12),
      });
    }
    return;
  }

  const next: WalkState = {
    landmark:
      state.landmark === "body" && (node.t === "header" || node.t === "footer" || node.t === "main")
        ? (node.t as WalkState["landmark"])
        : state.landmark,
    inNav: state.inNav || node.t === "nav" || props?.["role"] === "navigation",
    headingLevel: HEADING_TAGS[node.t] ?? state.headingLevel,
    anchorNodeId: state.anchorNodeId,
    anchorHref: state.anchorHref,
    ancestorIds: [node.n, ...state.ancestorIds],
    maxRepetition: state.maxRepetition,
  };

  const section = sectionOf(next);
  ctx.out.sectionsPresent.add(section);
  const base = {
    pageId: ctx.pageId,
    viewport: ctx.viewport,
    surface: ctx.surface,
    triggerNodeId: ctx.triggerNodeId,
    discoveryId: ctx.discoveryId,
    section,
  };

  const href = stringProp(props, ctx.hrefProp) ?? stringProp(props, "href");
  if ((node.t === "a" || node.t === "area") && href !== undefined) {
    if (href.trim().toLowerCase().startsWith("javascript:")) {
      ctx.excluded.set("javascript-pseudo-url", (ctx.excluded.get("javascript-pseudo-url") ?? 0) + 1);
    } else {
      next.anchorNodeId = node.n;
      next.anchorHref = href;
      ctx.out.urls.push({
        kind: "url",
        ...base,
        docOrder: ctx.counter.value++,
        maxRepetition: next.maxRepetition,
        nodeId: node.n,
        href,
        attributeName: "href",
        ancestorIds: next.ancestorIds.slice(0, 12),
      });
    }
  }

  if (node.t === "img") {
    const src = stringProp(props, "src");
    if (src !== undefined) {
      const alt = stringProp(props, "alt");
      const srcset = stringProp(props, ctx.srcsetProp);
      ctx.out.images.push({
        kind: "image",
        ...base,
        docOrder: ctx.counter.value++,
        maxRepetition: next.maxRepetition,
        nodeId: node.n,
        src,
        alt,
        srcset,
        propNames: {
          src: "src",
          alt: alt !== undefined ? "alt" : undefined,
          srcset: srcset !== undefined ? ctx.srcsetProp : undefined,
        },
        anchorHref: next.anchorHref,
        ancestorIds: next.ancestorIds.slice(0, 12),
      });
    }
  }

  const children = node.c ?? [];
  // Same-tag sibling repetition at this level, for the list-explosion flag.
  const tagCounts = new Map<string, number>();
  for (const child of children) {
    if (child.k === "e") tagCounts.set(child.t, (tagCounts.get(child.t) ?? 0) + 1);
  }

  let textSegment = 0;
  for (let childIndex = 0; childIndex < children.length; childIndex++) {
    const child = children[childIndex];
    if (child.k === "t") {
      const segment = textSegment++;
      if (child.v.trim() === "") continue; // pure whitespace — layout, not content
      const occurrence: TextOccurrence = {
        kind: "text",
        ...base,
        docOrder: ctx.counter.value++,
        maxRepetition: next.maxRepetition,
        ownerNodeId: node.n,
        childIndex,
        textSegment: segment,
        value: child.v,
        ownerTag: node.t,
        headingLevel: next.headingLevel,
        anchorNodeId: next.anchorNodeId,
        anchorHref: next.anchorHref,
        ancestorIds: next.ancestorIds.slice(0, 12),
      };
      ctx.out.texts.push(occurrence);
      // The page's first h1 text inside `main` is the hero headline candidate.
      // `headingLevel` (not the owner tag) is the test, because real headlines
      // are routinely wrapped: `<h1><span>Financial infrastructure…</span></h1>`.
      if (
        next.headingLevel === 1 &&
        section === "main" &&
        ctx.surface === "static" &&
        !ctx.out.heroHeadline[ctx.viewport]
      ) {
        ctx.out.heroHeadline[ctx.viewport] = occurrence;
        ctx.out.heroAncestors[ctx.viewport] = next.ancestorIds;
      }
      continue;
    }
    const repetition = tagCounts.get(child.t) ?? 1;
    walkElement(child, ctx, {
      ...next,
      maxRepetition: Math.max(next.maxRepetition, repetition),
    });
  }
}

/** Shape of one `data-wr-obs` entry as the reconstruction generator wrote it. */
interface ObsEntry {
  di?: string;
  tpl?: RuntimeNode[];
}

function walkDynamicTemplates(
  doc: RuntimeElementNode,
  ctx: Omit<WalkContext, "surface" | "triggerNodeId" | "discoveryId" | "hrefProp" | "srcsetProp">,
): void {
  const visit = (node: RuntimeElementNode, state: WalkState): void => {
    const props = node.p as Record<string, unknown> | undefined;
    const next: WalkState = {
      landmark:
        state.landmark === "body" && (node.t === "header" || node.t === "footer" || node.t === "main")
          ? (node.t as WalkState["landmark"])
          : state.landmark,
      inNav: state.inNav || node.t === "nav" || props?.["role"] === "navigation",
      headingLevel: state.headingLevel,
      anchorNodeId: undefined,
      anchorHref: undefined,
      ancestorIds: state.ancestorIds,
      maxRepetition: state.maxRepetition,
    };
    const raw = stringProp(props, "data-wr-obs");
    if (raw !== undefined) {
      let entries: ObsEntry[];
      try {
        entries = JSON.parse(raw) as ObsEntry[];
      } catch (error) {
        throw new TemplateCompileError(
          `unparsable data-wr-obs on ${ctx.pageId}/${ctx.viewport} node ${node.n}: ${(error as Error).message}`,
        );
      }
      for (const entry of entries) {
        if (!Array.isArray(entry.tpl) || entry.tpl.length === 0) continue;
        if (typeof entry.di !== "string") continue;
        const templateCtx: WalkContext = {
          ...ctx,
          surface: "dynamic-template",
          triggerNodeId: node.n,
          discoveryId: entry.di,
          // Dynamic templates hold RAW attribute names (the client mounts them
          // with setAttribute), so the srcset prop is lowercase there.
          hrefProp: "href",
          srcsetProp: "srcset",
        };
        for (const root of entry.tpl) {
          if (root.k !== "e") continue;
          walkElement(root, templateCtx, {
            landmark: next.landmark,
            inNav: next.inNav,
            headingLevel: undefined,
            anchorNodeId: undefined,
            anchorHref: undefined,
            ancestorIds: [],
            maxRepetition: 1,
          });
        }
      }
    }
    for (const child of node.c ?? []) {
      if (child.k === "e") visit(child, next);
    }
  };
  visit(doc, {
    landmark: "body",
    inNav: false,
    ancestorIds: [],
    maxRepetition: 1,
  });
}

export function extractPage(page: RuntimePage, excluded: Map<string, number>): PageExtraction {
  const out: PageExtraction = {
    pageId: page.pageId,
    texts: [],
    urls: [],
    images: [],
    hiddenTexts: [],
    svgTexts: [],
    heroHeadline: {},
    heroAncestors: {},
    sectionsPresent: new Set(),
  };
  for (const viewport of ["desktop", "mobile"] as const) {
    const doc = page[viewport].doc;
    const counter = { value: 0 };
    const hiddenCounter = { value: 0 };
    const ctx: WalkContext = {
      pageId: page.pageId,
      viewport,
      surface: "static",
      hrefProp: "href",
      srcsetProp: "srcSet",
      out,
      excluded,
      counter,
      hiddenCounter,
    };
    walkElement(doc, ctx, {
      landmark: "body",
      inNav: false,
      ancestorIds: [],
      maxRepetition: 1,
    });
    walkDynamicTemplates(doc, {
      pageId: page.pageId,
      viewport,
      out,
      excluded,
      counter,
      hiddenCounter,
    });
  }
  return out;
}

export function extractAllPages(pages: Map<string, RuntimePage>): ExtractionResult {
  const excluded = new Map<string, number>();
  const result = new Map<string, PageExtraction>();
  for (const pageId of [...pages.keys()].sort()) {
    const page = pages.get(pageId);
    if (!page) continue;
    result.set(pageId, extractPage(page, excluded));
  }
  return { pages: result, excluded };
}
