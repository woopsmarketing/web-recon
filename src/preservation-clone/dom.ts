import { parse, serialize, type DefaultTreeAdapterTypes } from "parse5";

/**
 * parse5 helpers for the Preservation Clone.
 *
 * The runtime DOM is edited IN PLACE rather than regenerated. That is the whole
 * point: keeping the source's own tree means class names, data-* attributes,
 * ARIA attributes, inline styles, element order and nesting all survive
 * unchanged, and — critically — every `<style>`/`<link>` keeps its original
 * position, so the cascade is preserved by construction instead of being
 * reassembled and hoped about.
 *
 * Only two kinds of edit are ever made here:
 *   1. resource URLs are pointed at local bytes (or absolutized back to the
 *      source when they could not be localized, so nothing 404s on localhost),
 *   2. anything executable is made inert.
 */

export type P5Node = DefaultTreeAdapterTypes.Node;
export type P5Element = DefaultTreeAdapterTypes.Element;
export type P5Document = DefaultTreeAdapterTypes.Document;
export type P5TextNode = DefaultTreeAdapterTypes.TextNode;

/**
 * `scriptingEnabled: false` is deliberate.
 *
 * With the scripting flag on — parse5's default — the contents of `<noscript>`
 * are raw TEXT, so a walker never sees the elements inside. Real pages hide
 * tracking there: this capture keeps a Facebook pixel `<img>` and a Google Tag
 * Manager `<iframe>` inside `<noscript>`, and as text they would have passed
 * through the builder untouched, straight into the clone. Parsing them as
 * markup is what lets them be neutralized like anything else.
 */
export function parseDocument(html: string): P5Document {
  return parse(html, { scriptingEnabled: false });
}

export function serializeDocument(doc: P5Document): string {
  return serialize(doc);
}

export function isElement(node: P5Node): node is P5Element {
  return "tagName" in node;
}

export function childrenOf(node: P5Node): P5Node[] {
  return "childNodes" in node ? node.childNodes : [];
}

/** Depth-first, document order. */
export function walkElements(root: P5Node, visit: (el: P5Element) => void): void {
  for (const child of childrenOf(root)) {
    if (isElement(child)) visit(child);
    walkElements(child, visit);
  }
}

export function getAttr(el: P5Element, name: string): string | null {
  const found = el.attrs.find((a) => a.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

export function setAttr(el: P5Element, name: string, value: string): void {
  const found = el.attrs.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (found) found.value = value;
  else el.attrs.push({ name, value });
}

export function removeAttr(el: P5Element, name: string): boolean {
  const index = el.attrs.findIndex(
    (a) => a.name.toLowerCase() === name.toLowerCase(),
  );
  if (index < 0) return false;
  el.attrs.splice(index, 1);
  return true;
}

export function relTokens(el: P5Element): string[] {
  const rel = getAttr(el, "rel");
  return rel ? rel.toLowerCase().split(/\s+/).filter(Boolean) : [];
}

/** Raw text of a `<style>` / `<script>` element (they hold a single text node). */
export function rawText(el: P5Element): string {
  let out = "";
  for (const child of el.childNodes) {
    if (child.nodeName === "#text" && "value" in child) out += child.value;
  }
  return out;
}

export function setRawText(el: P5Element, text: string): void {
  const textNode: P5TextNode = {
    nodeName: "#text",
    value: text,
    parentNode: el,
  } as P5TextNode;
  el.childNodes = text === "" ? [] : [textNode];
}

export function removeElement(el: P5Element): void {
  const parent = el.parentNode;
  if (!parent || !("childNodes" in parent)) return;
  const siblings = parent.childNodes as P5Node[];
  const index = siblings.indexOf(el as unknown as P5Node);
  if (index >= 0) siblings.splice(index, 1);
}

/** Human-readable position, e.g. `html>body>div[2]>section[0]>img[3]`. */
export function elementPath(el: P5Element): string {
  const parts: string[] = [];
  let current: P5Node | null = el as unknown as P5Node;
  while (current && isElement(current)) {
    const parent: P5Node | null = current.parentNode as P5Node | null;
    if (parent && "childNodes" in parent) {
      const siblings = parent.childNodes.filter(
        (n) => isElement(n) && n.tagName === (current as P5Element).tagName,
      );
      const index = siblings.indexOf(current);
      parts.unshift(
        siblings.length > 1
          ? `${(current as P5Element).tagName}[${index}]`
          : (current as P5Element).tagName,
      );
    } else {
      parts.unshift((current as P5Element).tagName);
    }
    current = parent;
  }
  return parts.join(">");
}

/* ------------------------------------------------------------------ *
 * Stylesheet nodes
 * ------------------------------------------------------------------ */

/**
 * The `<link rel=stylesheet>` and `<style>` elements in document order.
 *
 * This is the DOM-side counterpart of the Source Package's StyleEntry `order`
 * field, which is an index into `document.styleSheets`. Both sequences are
 * built in document order from the same two element kinds, so entry N pairs
 * with node N — the builder checks that agreement rather than trusting it.
 */
export function stylesheetNodes(doc: P5Document): P5Element[] {
  const nodes: P5Element[] = [];
  walkElements(doc, (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "style") nodes.push(el);
    else if (tag === "link" && relTokens(el).includes("stylesheet")) nodes.push(el);
  });
  return nodes;
}

/* ------------------------------------------------------------------ *
 * srcset
 * ------------------------------------------------------------------ */

export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

/**
 * Split a srcset into candidates WITHOUT losing descriptors.
 *
 * Flattening a srcset to one measured `currentSrc` would be exactly the kind of
 * observation-derived collapse Phase 2 forbids, so every candidate is kept and
 * rewritten individually with its `2x` / `800w` descriptor intact.
 */
export function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const match = trimmed.match(/^(\S+)(?:\s+(.*))?$/);
    if (!match) continue;
    out.push({ url: match[1], descriptor: (match[2] ?? "").trim() });
  }
  return out;
}

export function serializeSrcset(candidates: SrcsetCandidate[]): string {
  return candidates
    .map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url))
    .join(", ");
}

/* ------------------------------------------------------------------ *
 * URL-bearing attributes
 * ------------------------------------------------------------------ */

export type UrlAttrRole =
  | "resource" // localize if possible
  | "srcset" // localize each candidate
  | "navigation" // absolutize only, never localize
  | "embed"; // neutralize

export interface UrlAttrSpec {
  attr: string;
  role: UrlAttrRole;
}

/**
 * Which attributes on a given element actually hold a URL.
 *
 * This is an explicit allowlist rather than a scan for anything URL-shaped:
 * blindly rewriting every string that resembles a URL would corrupt
 * `data-*` payloads and JSON blobs that Phase 2 is supposed to preserve.
 */
export function urlAttrsFor(el: P5Element): UrlAttrSpec[] {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "img":
      return [
        { attr: "src", role: "resource" },
        { attr: "srcset", role: "srcset" },
      ];
    case "source":
      return [
        { attr: "src", role: "resource" },
        { attr: "srcset", role: "srcset" },
      ];
    case "video":
      return [
        { attr: "src", role: "resource" },
        { attr: "poster", role: "resource" },
      ];
    case "audio":
    case "track":
      return [{ attr: "src", role: "resource" }];
    case "input":
      return (getAttr(el, "type") ?? "").toLowerCase() === "image"
        ? [{ attr: "src", role: "resource" }]
        : [];
    case "image": // SVG <image>
    case "use": // SVG <use>
      // parse5 splits `xlink:href` into name "href" + prefix "xlink", so this
      // one entry matches both the plain and the namespaced attribute; a
      // literal "xlink:href" spec would never match anything.
      return [{ attr: "href", role: "resource" }];
    case "iframe":
    case "object":
    case "embed":
      // All three create a nested browsing context. Localizing their bytes
      // would not make them safe: an SVG or HTML document loaded through
      // <object>/<embed> executes its own <script>, unlike the same file in an
      // <img>. Phase 2 says source JS must not run, so they are neutralized.
      return [{ attr: tag === "object" ? "data" : "src", role: "embed" }];
    case "a":
    case "area":
      return [{ attr: "href", role: "navigation" }];
    case "form":
      return [{ attr: "action", role: "navigation" }];
    case "link": {
      const rels = relTokens(el);
      // Stylesheets are owned by the style pipeline, not by attribute rewriting.
      if (rels.includes("stylesheet")) return [];
      const localizable = [
        "icon",
        "shortcut",
        "apple-touch-icon",
        "apple-touch-icon-precomposed",
        "mask-icon",
        "manifest",
      ];
      if (rels.some((r) => localizable.includes(r))) {
        return [{ attr: "href", role: "resource" }];
      }
      return [{ attr: "href", role: "navigation" }];
    }
    default:
      return [];
  }
}

/** Performance hints: pure source-host chatter with no visual contribution. */
export const HINT_RELS = new Set([
  "preload",
  "modulepreload",
  "prefetch",
  "preconnect",
  "dns-prefetch",
  "prerender",
]);

/** Schemes that are already self-contained, or must never be followed. */
export function isInertUrl(value: string): boolean {
  const v = value.trim();
  if (v === "" || v.startsWith("#")) return true;
  return /^(data|blob|about|mailto|tel|sms|javascript):/i.test(v);
}
