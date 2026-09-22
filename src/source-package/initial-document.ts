import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

/**
 * The INITIAL-DOCUMENT WITNESS: one parse5 pass over the main document's bytes
 * AS SERVED (before any script ran), listing what the document itself declared.
 * Joined against the runtime inventory it tells `document-declared` from
 * `runtime-injected` (a `<script>`/`<style>`/`<link>` the runtime DOM has but
 * the served HTML did not).
 *
 * parse5 is already a dependency (SEO head parsing); this is a second, tiny
 * consumer of it — not a second HTML pipeline.
 */

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;

export interface InitialDocumentInventory {
  /** Absolute script `src` URLs, in document order. */
  scriptSrcs: string[];
  /** sha256 of inline script text (exact bytes of the text node), document order. */
  inlineScriptHashes: string[];
  /** Absolute `<link rel=stylesheet>` hrefs, document order. */
  stylesheetHrefs: string[];
  /** sha256 of `<style>` text, document order. */
  styleTextHashes: string[];
  /**
   * Attribute signature of each `<style>` (sorted `name=value` lines, values
   * cut at 200 chars, nonce → `[present]` — the same shape the in-page
   * inventory records as `ownerAttributes`), document order. Lets an EMPTY or
   * runtime-mutated style tag still be attributed to the initial document.
   */
  styleTagSignatures: string[];
  /** Absolute preload / modulepreload hrefs. */
  preloadHrefs: string[];
  modulepreloadHrefs: string[];
  counts: {
    scripts: number;
    inlineScripts: number;
    stylesheetLinks: number;
    styleTags: number;
    preloadLinks: number;
    modulepreloadLinks: number;
  };
}

/** See `InitialDocumentInventory.styleTagSignatures`; mirrors `attributesOf` in the in-page inventory. */
export function styleSignature(node: P5Element): string {
  return node.attrs
    .slice(0, 32)
    .map((a) => {
      const name = a.name.toLowerCase();
      return `${name}=${name === "nonce" ? "[present]" : a.value.slice(0, 200)}`;
    })
    .sort()
    .join("\n");
}

function isElement(node: P5Node): node is P5Element {
  return "tagName" in node;
}

function attr(node: P5Element, name: string): string | null {
  const found = node.attrs.find((a) => a.name.toLowerCase() === name);
  return found ? found.value : null;
}

function textOf(node: P5Node): string {
  if ("value" in node && node.nodeName === "#text") return node.value;
  let out = "";
  if ("childNodes" in node) for (const child of node.childNodes) out += textOf(child);
  return out;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function resolveAgainst(raw: string | null, base: string): string | null {
  if (raw === null) return null;
  const t = raw.trim();
  if (t === "") return null;
  try {
    return new URL(t, base).href;
  } catch {
    return t;
  }
}

/**
 * `baseUrl` is the document's FINAL URL; a `<base href>` in the served HTML is
 * honoured because the browser honours it too.
 */
export function inventoryInitialDocument(html: string, baseUrl: string): InitialDocumentInventory {
  const doc = parse(html);
  const inv: InitialDocumentInventory = {
    scriptSrcs: [],
    inlineScriptHashes: [],
    stylesheetHrefs: [],
    styleTextHashes: [],
    styleTagSignatures: [],
    preloadHrefs: [],
    modulepreloadHrefs: [],
    counts: { scripts: 0, inlineScripts: 0, stylesheetLinks: 0, styleTags: 0, preloadLinks: 0, modulepreloadLinks: 0 },
  };
  let base = baseUrl;
  const stack: P5Node[] = [doc];
  // First pass for <base href> so later resolution honours it.
  const findBase = (node: P5Node): string | null => {
    if (isElement(node) && node.tagName === "base") {
      const href = attr(node, "href");
      if (href) return resolveAgainst(href, baseUrl);
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        const found = findBase(child);
        if (found) return found;
      }
    }
    return null;
  };
  const declaredBase = findBase(doc);
  if (declaredBase) base = declaredBase;

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isElement(node)) {
      const tag = node.tagName;
      if (tag === "script") {
        const src = resolveAgainst(attr(node, "src"), base);
        if (src) {
          inv.scriptSrcs.push(src);
          inv.counts.scripts++;
        } else {
          inv.inlineScriptHashes.push(sha256Hex(textOf(node)));
          inv.counts.inlineScripts++;
        }
      } else if (tag === "style") {
        inv.styleTextHashes.push(sha256Hex(textOf(node)));
        inv.styleTagSignatures.push(styleSignature(node));
        inv.counts.styleTags++;
      } else if (tag === "link") {
        const rel = (attr(node, "rel") ?? "").trim().toLowerCase().split(/\s+/);
        const href = resolveAgainst(attr(node, "href"), base);
        if (href) {
          if (rel.includes("stylesheet")) {
            inv.stylesheetHrefs.push(href);
            inv.counts.stylesheetLinks++;
          }
          if (rel.includes("preload")) {
            inv.preloadHrefs.push(href);
            inv.counts.preloadLinks++;
          }
          if (rel.includes("modulepreload")) {
            inv.modulepreloadHrefs.push(href);
            inv.counts.modulepreloadLinks++;
          }
        }
      }
    }
    if ("childNodes" in node) {
      // Push in reverse so document order is preserved when popping.
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]!);
    }
    if (isElement(node) && node.tagName === "template") {
      const content = (node as unknown as { content?: P5Node }).content;
      if (content && "childNodes" in content) {
        for (let i = content.childNodes.length - 1; i >= 0; i--) stack.push(content.childNodes[i]!);
      }
    }
  }
  return inv;
}
