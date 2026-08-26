import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import {
  AssetCatalogSchema,
  SCHEMA_VERSION,
  assetId,
  type AssetCatalog,
  type AssetSpec,
} from "./types.js";
import type { AssetObservation } from "../observer/types.js";

/**
 * SiteSpec-global asset catalog (Task 13, items 50–54).
 *
 * A REFERENCE IR, not a mirror: no image, font, video or icon binary is ever
 * downloaded (item 52). What is compiled is the identity of each asset and where
 * it was seen, deduplicated site-wide on exact equality of
 * `kind + url + descriptor` — the same "no similarity threshold" rule the style
 * catalog follows.
 *
 * Inline `<svg>` is the one asset that has no URL, so its markup IS the asset.
 * Task 04 preserved that markup verbatim and its schema says out loud that it is
 * UNTRUSTED page content. This compiler is the first stage that hands it to
 * something which will eventually render it, so it is also the stage that has to
 * defuse it (item 54): the markup is re-parsed, `<script>` elements, every `on*`
 * handler attribute and every `javascript:` URL are removed, and the result is
 * re-serialized. What was removed is recorded per asset rather than silently
 * dropped — a reviewer should be able to see that a site shipped an inline SVG
 * with a script in it.
 *
 * Ids follow the same rule as style tokens: assigned after a lexical sort of the
 * canonical key, so they never depend on which page was compiled first (item 51).
 */

type P5Element = DefaultTreeAdapterTypes.Element;
type P5Node = DefaultTreeAdapterTypes.Node;
type P5ParentNode = DefaultTreeAdapterTypes.ParentNode;

/** Extension → media type. A HINT: nothing was requested to confirm it. */
const MIME_HINTS: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function mimeHintFor(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const dot = pathname.lastIndexOf(".");
  if (dot < 0) return undefined;
  return MIME_HINTS[pathname.slice(dot).toLowerCase()];
}

function sameOriginAs(url: string, rootUrl: string): boolean | undefined {
  try {
    return new URL(url).origin === new URL(rootUrl).origin;
  } catch {
    return undefined;
  }
}

function isElement(node: P5Node): node is P5Element {
  return typeof (node as P5Element).tagName === "string";
}

export interface SanitizedSvg {
  markup: string;
  sanitized: boolean;
  /** Sorted, deduplicated removal kinds. */
  removed: string[];
}

/**
 * Strip everything executable from untrusted inline-SVG markup.
 *
 * Always re-parsed and re-serialized, even when nothing is found: that way the
 * stored markup is provably the output of an HTML5 parser this code walked, not
 * a string that merely looked harmless to a regular expression.
 */
export function sanitizeSvgMarkup(markup: string): SanitizedSvg {
  const removed = new Set<string>();
  let fragment: DefaultTreeAdapterTypes.DocumentFragment;
  try {
    fragment = parseFragment(markup);
  } catch {
    // A fragment that will not parse cannot be shown to be safe, so nothing is
    // carried through — an empty markup body with the reason recorded.
    return { markup: "", sanitized: true, removed: ["unparsable-markup"] };
  }

  const visit = (node: P5ParentNode): void => {
    const children = node.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]!;
      if (!isElement(child)) continue;
      if (child.tagName.toLowerCase() === "script") {
        children.splice(i, 1);
        removed.add("script-element");
        continue;
      }
      child.attrs = child.attrs.filter((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          removed.add("event-handler-attribute");
          return false;
        }
        if (
          (name === "href" || name === "xlink:href" || name === "src") &&
          attr.value.trim().toLowerCase().startsWith("javascript:")
        ) {
          removed.add("javascript-url");
          return false;
        }
        return true;
      });
      visit(child);
    }
  };
  visit(fragment);

  return {
    markup: serialize(fragment),
    sanitized: removed.size > 0,
    removed: [...removed].sort(),
  };
}

interface AssetAccumulator {
  kind: string;
  url?: string;
  descriptor?: string;
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  markup?: string;
  usageCount: number;
  pageIds: Set<string>;
}

/**
 * Accumulates asset occurrences across the whole site, then assigns ids once.
 *
 * Like the style builder, this is two-phase: callers record the canonical KEY on
 * a node during compilation and swap it for the final `assetId` afterwards.
 */
export class AssetCatalogBuilder {
  private readonly assets = new Map<string, AssetAccumulator>();
  private occurrences = 0;

  constructor(private readonly rootUrl: string) {}

  /**
   * Canonical identity of one asset observation (item 51): its kind, its
   * normalized URL, and the srcset descriptor when it has one — a `2x` and a
   * `640w` candidate of the same file are two different reconstruction inputs.
   * Inline SVG has no URL, so its exact markup is its identity.
   */
  static canonicalKey(asset: AssetObservation): string {
    if (asset.type === "inline-svg") {
      return JSON.stringify(["inline-svg", asset.markup ?? ""]);
    }
    return JSON.stringify([asset.type, asset.url ?? "", asset.descriptor ?? ""]);
  }

  /** Record ONE observed asset on ONE page; returns its canonical key. */
  add(asset: AssetObservation, pageId: string): string {
    const key = AssetCatalogBuilder.canonicalKey(asset);
    this.occurrences++;
    let entry = this.assets.get(key);
    if (!entry) {
      entry = {
        kind: asset.type,
        ...(asset.url !== undefined ? { url: asset.url } : {}),
        ...(asset.descriptor !== undefined ? { descriptor: asset.descriptor } : {}),
        ...(asset.width !== undefined ? { width: asset.width } : {}),
        ...(asset.height !== undefined ? { height: asset.height } : {}),
        ...(asset.naturalWidth !== undefined
          ? { naturalWidth: asset.naturalWidth }
          : {}),
        ...(asset.naturalHeight !== undefined
          ? { naturalHeight: asset.naturalHeight }
          : {}),
        ...(asset.markup !== undefined ? { markup: asset.markup } : {}),
        usageCount: 0,
        pageIds: new Set<string>(),
      };
      this.assets.set(key, entry);
    }
    entry.usageCount++;
    entry.pageIds.add(pageId);
    // Intrinsic dimensions are observed per occurrence; the first observation
    // that HAS them wins, and later ones never overwrite with `undefined`.
    if (entry.naturalWidth === undefined && asset.naturalWidth !== undefined) {
      entry.naturalWidth = asset.naturalWidth;
    }
    if (entry.naturalHeight === undefined && asset.naturalHeight !== undefined) {
      entry.naturalHeight = asset.naturalHeight;
    }
    return key;
  }

  finalize(): { catalog: AssetCatalog; idByKey: Map<string, string> } {
    const keys = [...this.assets.keys()].sort();
    const idByKey = new Map<string, string>();
    const specs: AssetSpec[] = [];
    const kindCounts: Record<string, number> = {};

    keys.forEach((key, index) => {
      const id = assetId(index + 1);
      idByKey.set(key, id);
      const entry = this.assets.get(key)!;
      kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;

      const mimeHint = entry.url ? mimeHintFor(entry.url) : undefined;
      const sameOrigin = entry.url
        ? sameOriginAs(entry.url, this.rootUrl)
        : undefined;
      const inlineSvg =
        entry.kind === "inline-svg" && entry.markup !== undefined
          ? sanitizeSvgMarkup(entry.markup)
          : undefined;

      specs.push({
        assetId: id,
        kind: entry.kind,
        ...(entry.url !== undefined ? { url: entry.url } : {}),
        ...(entry.descriptor !== undefined ? { descriptor: entry.descriptor } : {}),
        ...(mimeHint !== undefined ? { mimeHint } : {}),
        ...(sameOrigin !== undefined ? { sameOrigin } : {}),
        ...(entry.width !== undefined ? { width: entry.width } : {}),
        ...(entry.height !== undefined ? { height: entry.height } : {}),
        ...(entry.naturalWidth !== undefined
          ? { naturalWidth: entry.naturalWidth }
          : {}),
        ...(entry.naturalHeight !== undefined
          ? { naturalHeight: entry.naturalHeight }
          : {}),
        ...(inlineSvg ? { inlineSvg } : {}),
        usageCount: entry.usageCount,
        sourcePageIds: [...entry.pageIds].sort(),
      });
    });

    const orderedKindCounts: Record<string, number> = {};
    for (const kind of Object.keys(kindCounts).sort()) {
      orderedKindCounts[kind] = kindCounts[kind]!;
    }

    const catalog = AssetCatalogSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      assetCount: specs.length,
      occurrenceCount: this.occurrences,
      kindCounts: orderedKindCounts,
      assets: specs,
    } satisfies AssetCatalog);

    return { catalog, idByKey };
  }
}
