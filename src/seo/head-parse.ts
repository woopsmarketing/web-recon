import { parse, type DefaultTreeAdapterTypes } from "parse5";
import type {
  SourceHreflang,
  SourceJsonLd,
  SourceMetaEntry,
  SourcePageSeo,
} from "./types.js";

/**
 * Deterministic head/document SEO fact extraction from a stored
 * `rendered.html` (Task 03-05 Observer output, serialized by Chromium).
 *
 * Evidence only: a tag that is absent yields `null` / `[]`, never a default.
 * No network, no AI, no similarity — one parse5 pass, document order.
 */

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;

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
  if ("childNodes" in node) {
    for (const child of node.childNodes) out += textOf(child);
  }
  return out;
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export interface RenderedDocumentSeo {
  htmlLang: string | null;
  title: string | null;
  metaDescription: string | null;
  canonicalHref: string | null;
  metaRobots: string | null;
  hreflang: SourceHreflang[];
  openGraph: SourceMetaEntry[];
  twitter: SourceMetaEntry[];
  jsonLd: SourceJsonLd[];
  headingOutline: { level: number; text: string }[];
  imageAltAudit: SourcePageSeo["imageAltAudit"];
}

function flattenJsonLdTypes(json: unknown, into: string[]): void {
  if (Array.isArray(json)) {
    for (const item of json) flattenJsonLdTypes(item, into);
    return;
  }
  if (json !== null && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") into.push(type);
    else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") into.push(t);
    const graph = record["@graph"];
    if (graph !== undefined) flattenJsonLdTypes(graph, into);
  }
}

/** Parse one rendered.html string into its observable SEO facts. */
export function parseRenderedDocumentSeo(html: string): RenderedDocumentSeo {
  const document = parse(html);
  const result: RenderedDocumentSeo = {
    htmlLang: null,
    title: null,
    metaDescription: null,
    canonicalHref: null,
    metaRobots: null,
    hreflang: [],
    openGraph: [],
    twitter: [],
    jsonLd: [],
    headingOutline: [],
    imageAltAudit: { images: 0, withAlt: 0, emptyAlt: 0, missingAlt: 0, missingAltSample: [] },
  };

  const headingTags = new Map<string, number>([
    ["h1", 1], ["h2", 2], ["h3", 3], ["h4", 4], ["h5", 5], ["h6", 6],
  ]);

  const walk = (node: P5Node): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      if (tag === "html" && result.htmlLang === null) {
        result.htmlLang = attr(node, "lang");
      } else if (tag === "title" && result.title === null) {
        result.title = normalizeText(textOf(node));
      } else if (tag === "meta") {
        const name = attr(node, "name")?.toLowerCase() ?? null;
        const property = attr(node, "property")?.toLowerCase() ?? null;
        const content = attr(node, "content");
        if (content !== null) {
          if (name === "description" && result.metaDescription === null) {
            result.metaDescription = content;
          } else if (name === "robots" && result.metaRobots === null) {
            result.metaRobots = content;
          } else if (property !== null && property.startsWith("og:")) {
            result.openGraph.push({ key: property, content });
          } else if (
            (name !== null && name.startsWith("twitter:")) ||
            (property !== null && property.startsWith("twitter:"))
          ) {
            result.twitter.push({ key: (name ?? property) as string, content });
          }
        }
      } else if (tag === "link") {
        const rel = attr(node, "rel")?.toLowerCase() ?? null;
        const href = attr(node, "href");
        if (rel === "canonical" && href !== null && result.canonicalHref === null) {
          result.canonicalHref = href;
        } else if (rel === "alternate" && href !== null) {
          const lang = attr(node, "hreflang");
          if (lang !== null) result.hreflang.push({ lang, href });
        }
      } else if (tag === "script" && attr(node, "type")?.toLowerCase() === "application/ld+json") {
        const raw = textOf(node).trim();
        const entry: SourceJsonLd = { parseable: false, bytes: Buffer.byteLength(raw, "utf8"), types: [] };
        try {
          const json: unknown = JSON.parse(raw);
          entry.parseable = true;
          entry.json = json;
          const types: string[] = [];
          flattenJsonLdTypes(json, types);
          entry.types = types;
        } catch {
          // unparseable JSON-LD is itself a finding — recorded, never repaired
        }
        result.jsonLd.push(entry);
      } else if (headingTags.has(tag)) {
        result.headingOutline.push({
          level: headingTags.get(tag) as number,
          text: normalizeText(textOf(node)),
        });
        // headings are recorded whole; still recurse for nested img/meta? Headings
        // legitimately contain imgs — keep recursing below.
      } else if (tag === "img") {
        const audit = result.imageAltAudit;
        audit.images += 1;
        const alt = attr(node, "alt");
        if (alt === null) {
          audit.missingAlt += 1;
          if (audit.missingAltSample.length < 10) {
            audit.missingAltSample.push(attr(node, "src") ?? "(no src)");
          }
        } else if (alt.trim() === "") audit.emptyAlt += 1;
        else audit.withAlt += 1;
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
    if (isElement(node) && node.tagName.toLowerCase() === "template") {
      const content = (node as { content?: P5Node }).content;
      if (content) walk(content);
    }
  };

  walk(document);
  return result;
}

/** Exact URL equality after trailing-slash-insensitive normalization of the path. */
export function urlsEquivalent(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const pa = ua.pathname.replace(/\/+$/, "") || "/";
    const pb = ub.pathname.replace(/\/+$/, "") || "/";
    return ua.origin === ub.origin && pa === pb && ua.search === ub.search;
  } catch {
    return a === b;
  }
}
