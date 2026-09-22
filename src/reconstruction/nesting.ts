import {
  ReconstructionError,
  type RuntimeElementNode,
  type RuntimeNode,
  type RuntimePropValue,
} from "./types.js";

/**
 * Parser-stable nesting (Task 16 final correction).
 *
 * THE PROBLEM
 *
 * The Observer reads a LIVE DOM. The reconstruction transports that DOM to the
 * clone as HTML: React server-renders a markup string, the browser parses it
 * back, and React hydrates against the result. That round trip is lossy in one
 * specific way nothing upstream can see — the DOM API accepts parent/child
 * edges the HTML PARSER refuses to produce.
 *
 * `document.createElement("li")` appended to another `<li>` is a perfectly legal
 * DOM operation, and a site whose menu is built by script can end up with
 * `li > li` in its live DOM. Serialize that and the parser's "in body" insertion
 * mode closes the outer `<li>` when it meets the inner start tag, so the tree
 * React hydrates has the two as SIBLINGS. React finds an element where it
 * expected a child, and throws:
 *
 *     Hydration failed because the server rendered HTML didn't match the client.
 *     …  - Invalid HTML tag nesting.
 *
 * which minifies to `React error #418; args[]=HTML`. React then discards the
 * server tree and re-renders that subtree on the client, so the page LOOKS
 * right — the defect is silent except for the error and for the fact that every
 * event handler in the regenerated subtree is late.
 *
 * THE FIX
 *
 * Emit HTML the parser reproduces verbatim. Where HTML has a canonical way to
 * express the observed relationship, use it: a list item inside a list item is
 * written `<li><ul><li>` — that is the shape the parser accepts and the shape a
 * person would write. The interposed container carries `display: contents`, so
 * it generates no box and the geometry is the observed geometry. Every observed
 * node keeps its tag, its attributes, its text and its order, and the ancestor
 * relationship survives.
 *
 * Where HTML has no such expression the generator REFUSES rather than shipping
 * markup it knows the browser will reshape. That is the same wall `SKIPPED_TAGS`
 * and the void-element check already are: a property of the code, not of the
 * data that happened to arrive. Measured across all five reconstructed sites:
 * 30 adaptations (one site), 0 refusals.
 *
 * This is a RENDERER concern and lives only here. The SiteSpec still records
 * what was observed — `li > li` — because that is what was true of the page.
 */

/** The class that makes an interposed container generate no box. */
export const NESTING_CONTAINER_CLASS = "wr-nest";

/**
 * The HTML "special" category (tree construction stage). The list-item and
 * definition-list walks stop at any of these, which is why `<li><div><li>`
 * still closes the outer `<li>` (`div` is one of the three exceptions) but
 * `<li><ul><li>` does not.
 */
const SPECIAL: ReadonlySet<string> = new Set([
  "address", "applet", "area", "article", "aside", "base", "basefont", "bgsound",
  "blockquote", "body", "br", "button", "caption", "center", "col", "colgroup",
  "dd", "details", "dir", "div", "dl", "dt", "embed", "fieldset", "figcaption",
  "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5",
  "h6", "head", "header", "hgroup", "hr", "html", "iframe", "img", "input",
  "keygen", "li", "link", "listing", "main", "marquee", "menu", "meta", "nav",
  "noembed", "noframes", "noscript", "object", "ol", "p", "param", "plaintext",
  "pre", "script", "search", "section", "select", "source", "style", "summary",
  "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead",
  "title", "tr", "track", "ul", "wbr", "xmp",
]);

/** The three elements the list-item / definition-list walks step over. */
const WALK_THROUGH: ReadonlySet<string> = new Set(["address", "div", "p"]);

/** Elements that terminate "scope" — and therefore "button scope" too. */
const SCOPE_BOUNDARY: ReadonlySet<string> = new Set([
  "applet", "caption", "html", "table", "td", "th", "marquee", "object",
  "template", "mi", "mo", "mn", "ms", "mtext", "annotation-xml",
  "foreignobject", "desc", "title",
]);

/** Start tags that close an open `<p>` ("if the stack has a p in button scope"). */
const CLOSES_P: ReadonlySet<string> = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog",
  "dir", "div", "dl", "fieldset", "figcaption", "figure", "footer", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "listing", "main", "menu",
  "nav", "ol", "p", "plaintext", "pre", "search", "section", "summary", "table",
  "ul", "xmp", "li", "dd", "dt", "button", "form",
]);

/**
 * Markers that reset the list of active formatting elements. An `<a>` inside a
 * `<td>` inside an `<a>` is NOT reopened by the adoption agency, so the anchor
 * and `<nobr>` checks stop here rather than scanning the whole chain.
 */
const FORMATTING_MARKER: ReadonlySet<string> = new Set([
  "applet", "object", "marquee", "template", "td", "th", "caption",
]);

/** Subtrees where the "in body" rules do not apply at all. */
const FOREIGN_ROOTS: ReadonlySet<string> = new Set(["svg", "math"]);

/** Where each table-model element is legal. Anywhere else the parser moves or drops it. */
const TABLE_PARENTS: Readonly<Record<string, ReadonlySet<string>>> = {
  tr: new Set(["thead", "tbody", "tfoot"]),
  td: new Set(["tr"]),
  th: new Set(["tr"]),
  thead: new Set(["table"]),
  tbody: new Set(["table"]),
  tfoot: new Set(["table"]),
  caption: new Set(["table"]),
  colgroup: new Set(["table"]),
  col: new Set(["colgroup"]),
};

/** What may sit directly inside a table-model element. */
const TABLE_CHILDREN: Readonly<Record<string, ReadonlySet<string>>> = {
  table: new Set(["thead", "tbody", "tfoot", "caption", "colgroup"]),
  thead: new Set(["tr"]),
  tbody: new Set(["tr"]),
  tfoot: new Set(["tr"]),
  tr: new Set(["td", "th"]),
  colgroup: new Set(["col"]),
};

/** Child tag → the container HTML requires, when one exists and is layout-neutral. */
const CANONICAL_CONTAINER: Readonly<Record<string, string>> = {
  li: "ul",
  dd: "dl",
  dt: "dl",
};

export type NestingRepairKind =
  | "list-item-implied-end"
  | "definition-item-implied-end"
  | "block-closes-p"
  | "nested-anchor"
  | "nested-formatting"
  | "nested-form"
  | "nested-button"
  | "table-model-misplaced"
  | "table-stray-content";

export interface NestingRepair {
  kind: NestingRepairKind;
  /** The ancestor the parser would close, or the misplaced element's parent. */
  offendingAncestorTag: string;
}

/**
 * Would the HTML parser reshape this parent→child edge?
 *
 * `ancestors` is root-first and ends with the direct parent. Returns the repair
 * the tree construction stage would apply, or `null` when the edge survives.
 */
export function detectNestingRepair(
  childTag: string,
  ancestors: readonly string[],
): NestingRepair | null {
  const parent = ancestors[ancestors.length - 1];
  if (parent === undefined) return null;

  // --- table model ---------------------------------------------------------
  const allowedParents = TABLE_PARENTS[childTag];
  if (allowedParents && !allowedParents.has(parent)) {
    return { kind: "table-model-misplaced", offendingAncestorTag: parent };
  }
  const allowedChildren = TABLE_CHILDREN[parent];
  if (allowedChildren && !allowedChildren.has(childTag)) {
    return { kind: "table-stray-content", offendingAncestorTag: parent };
  }

  // --- implied end tags: li / dd / dt --------------------------------------
  if (childTag === "li" || childTag === "dd" || childTag === "dt") {
    const targets = childTag === "li" ? ["li"] : ["dd", "dt"];
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const tag = ancestors[i]!;
      if (targets.includes(tag)) {
        return {
          kind: childTag === "li" ? "list-item-implied-end" : "definition-item-implied-end",
          offendingAncestorTag: tag,
        };
      }
      if (SPECIAL.has(tag) && !WALK_THROUGH.has(tag)) break;
    }
  }

  // --- a start tag closing an open <a>, and the nobr twin ------------------
  if (childTag === "a" && openFormatting("a", ancestors)) {
    return { kind: "nested-anchor", offendingAncestorTag: "a" };
  }
  if (childTag === "nobr" && openFormatting("nobr", ancestors)) {
    return { kind: "nested-formatting", offendingAncestorTag: "nobr" };
  }

  // --- form element pointer and button ------------------------------------
  if (childTag === "form" && ancestors.includes("form")) {
    return { kind: "nested-form", offendingAncestorTag: "form" };
  }
  if (childTag === "button" && inScope("button", ancestors)) {
    return { kind: "nested-button", offendingAncestorTag: "button" };
  }

  // --- a block-level start tag closing an open <p> -------------------------
  if (CLOSES_P.has(childTag) && inScope("p", ancestors)) {
    return { kind: "block-closes-p", offendingAncestorTag: "p" };
  }

  return null;
}

/** Is `tag` open "in scope" — i.e. reachable without crossing a scope boundary? */
function inScope(tag: string, ancestors: readonly string[]): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const current = ancestors[i]!;
    if (current === tag) return true;
    if (SCOPE_BOUNDARY.has(current)) return false;
  }
  return false;
}

/** Is `tag` still in the list of active formatting elements at this depth? */
function openFormatting(tag: string, ancestors: readonly string[]): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const current = ancestors[i]!;
    if (current === tag) return true;
    if (FORMATTING_MARKER.has(current)) return false;
  }
  return false;
}

export interface NestingAdaptation {
  pageId: string;
  viewportId: string;
  kind: NestingRepairKind;
  /** The observed node that would have been moved by the parser. */
  nodeId: string;
  childTag: string;
  parentTag: string;
  /** The interposed container, or (mode "demote") the tag the node was demoted to. */
  container: string;
  /**
   * TASK 28.8 FAST (Phase F correction 1) — "interpose" adds a layout-neutral
   * wrapper element; "demote" keeps the SAME node and only changes its tag.
   */
  mode: "interpose" | "demote";
}

/**
 * TASK 28.8 FAST (Phase F correction 1, generic) — nested interactive /
 * formatting elements the parser would close early, and the layout-neutral tag
 * the node is demoted to instead of refusing the whole build. SPA runtimes build
 * `<a>` inside `<a>` (or a `<button>` inside a `<button>`) through DOM APIs; the
 * observed box model is real, only the TAG cannot be served. The frozen style
 * classes carry the computed color/decoration/display, so a `span` renders the
 * same box; the inner element stops being its own link/control, which the
 * manifest records as `parser-invalid-nesting-demoted` and the element marks
 * with `data-wr-demoted` (+ `data-wr-href` when an href is dropped).
 */
const DEMOTION_TAG: Readonly<Record<string, string>> = {
  a: "span",
  button: "span",
  nobr: "span",
  form: "div",
};
const DEMOTABLE_KINDS: ReadonlySet<NestingRepairKind> = new Set([
  "nested-anchor",
  "nested-button",
  "nested-formatting",
  "nested-form",
]);

export interface AdaptNestingResult {
  adaptations: NestingAdaptation[];
}

export interface AdaptNestingContext {
  pageId: string;
  viewportId: string;
}

/**
 * Rewrite a compiled viewport tree in place so the HTML parser reproduces it.
 *
 * Walks in document order with the ancestor tag stack the parser would have.
 * Foreign subtrees (`<svg>`, `<math>`) are skipped: the "in body" rules do not
 * apply inside them, and their markup travels as sanitized innerHTML anyway.
 */
export function adaptParserNesting(
  root: RuntimeElementNode,
  context: AdaptNestingContext,
): AdaptNestingResult {
  const adaptations: NestingAdaptation[] = [];

  /*
   * TASK 28.8 FAST (Phase F correction 1) — the walk keeps the ancestor NODES,
   * not only their tags, because `block-closes-p` is repaired on the ancestor:
   * the open <p> is re-tagged to a <div> (same box, same classes, marked
   * `data-wr-demoted="p"`), which accepts any flow content. Tags are re-read
   * from the nodes for every edge so a re-tagged ancestor is seen at once.
   */
  const visit = (node: RuntimeElementNode, ancestorNodes: RuntimeElementNode[]): void => {
    // `v` is the sanitized inline-SVG channel: foreign content, already a string.
    if (node.v !== undefined || FOREIGN_ROOTS.has(node.t)) return;
    const children = node.c;
    if (!children || children.length === 0) return;
    const chain = [...ancestorNodes, node];
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.k === "t") {
        // Non-whitespace text directly inside the table model is foster-parented
        // out of the table by the parser.
        if (TABLE_CHILDREN[node.t] && child.v.trim() !== "") {
          throw refusal(context, "table-stray-content", node.t, "#text", node.n);
        }
        continue;
      }
      let tags = chain.map((n) => n.t);
      let repair = detectNestingRepair(child.t, tags);
      if (repair !== null && repair.kind === "block-closes-p") {
        const open = openParagraph(chain);
        if (open !== undefined) {
          demoteInPlace(open, "div");
          adaptations.push({
            pageId: context.pageId,
            viewportId: context.viewportId,
            kind: repair.kind,
            nodeId: open.n,
            childTag: child.t,
            parentTag: node.t,
            container: "div",
            mode: "demote",
          });
          tags = chain.map((n) => n.t);
          repair = detectNestingRepair(child.t, tags);
        }
      }
      if (repair !== null) {
        children[i] = interpose(child, repair, tags, context, adaptations);
      }
      visit(children[i] as RuntimeElementNode, chain);
    }
  };
  visit(root, []);
  return { adaptations };
}

/**
 * Wrap `child` in the container HTML requires, or refuse.
 *
 * The container is only accepted when it actually removes the repair AND is
 * itself legal where it is being placed — otherwise interposing would trade one
 * parser rewrite for another.
 */
function interpose(
  child: RuntimeElementNode,
  repair: NestingRepair,
  ancestors: readonly string[],
  context: AdaptNestingContext,
  adaptations: NestingAdaptation[],
): RuntimeElementNode {
  const parentTag = ancestors[ancestors.length - 1] ?? "";
  const container = CANONICAL_CONTAINER[child.t];
  if (
    container === undefined ||
    detectNestingRepair(container, ancestors) !== null ||
    detectNestingRepair(child.t, [...ancestors, container]) !== null
  ) {
    const demoted = DEMOTABLE_KINDS.has(repair.kind)
      ? DEMOTION_TAG[child.t]
      : undefined;
    if (demoted === undefined || detectNestingRepair(demoted, ancestors) !== null) {
      throw refusal(context, repair.kind, repair.offendingAncestorTag, child.t, child.n);
    }
    adaptations.push({
      pageId: context.pageId,
      viewportId: context.viewportId,
      kind: repair.kind,
      nodeId: child.n,
      childTag: child.t,
      parentTag,
      container: demoted,
      mode: "demote",
    });
    // Same node id, same classes, same children — only the tag changes.
    demoteInPlace(child, demoted);
    return child;
  }

  adaptations.push({
    pageId: context.pageId,
    viewportId: context.viewportId,
    kind: repair.kind,
    nodeId: child.n,
    childTag: child.t,
    parentTag,
    container,
    mode: "interpose",
  });

  return {
    k: "e",
    // Never a real observed id: the wrapper is a serialization detail, carries no
    // `data-wr-node`, and QA must not be able to map anything onto it.
    n: `${child.n}~nest`,
    t: container,
    p: { className: NESTING_CONTAINER_CLASS },
    c: [child],
  };
}

/** The nearest open <p> the parser would close for a block start tag (scope walk). */
function openParagraph(chain: readonly RuntimeElementNode[]): RuntimeElementNode | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const current = chain[i]!;
    if (current.t === "p") return current;
    if (SCOPE_BOUNDARY.has(current.t)) return undefined;
  }
  return undefined;
}

/** Re-tag a node in place: same id, classes and children; marked for QA and humans. */
function demoteInPlace(node: RuntimeElementNode, tag: string): void {
  const props: Record<string, RuntimePropValue> = { ...(node.p ?? {}) };
  props["data-wr-demoted"] = node.t;
  if (props["href"] !== undefined) {
    props["data-wr-href"] = props["href"];
    delete props["href"];
  }
  node.t = tag;
  node.p = props;
}

function refusal(
  context: AdaptNestingContext,
  kind: NestingRepairKind,
  offendingAncestorTag: string,
  childTag: string,
  nodeId: string,
): ReconstructionError {
  return new ReconstructionError(
    `${context.pageId}/${context.viewportId}: observed DOM nests <${childTag}> (${nodeId}) ` +
      `inside <${offendingAncestorTag}>, which the HTML parser would rewrite (${kind}). ` +
      `HTML has no layout-neutral container that expresses this relationship, so the ` +
      `generator refuses to emit markup the browser will reshape.`,
  );
}

/** Count the interposed containers in a compiled tree (validation, item 180). */
export function countNestingContainers(node: RuntimeNode): number {
  if (node.k === "t") return 0;
  let total = node.p?.["className"] === NESTING_CONTAINER_CLASS ? 1 : 0;
  for (const child of node.c ?? []) total += countNestingContainers(child);
  return total;
}
