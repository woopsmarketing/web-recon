import type { RuntimeRouteMap } from "../reconstruction/index.js";
import { scanBackgroundImageRules, type BackgroundImageRule } from "./css.js";
import { slugify, VARIANTS, type PageIndex, variantIndex } from "./tree.js";
import type {
  BindingAddress,
  BindingTarget,
  FitHints,
  ImageField,
  SlotType,
  SlotValue,
  Variant,
} from "./types.js";

/**
 * Surfaces Slot V2 cannot see.
 *
 * Slot V2 covers text, `<a href>`, `<img src/alt/srcset>`, paint twins and SVG
 * runs. Everything else a customer would call "content" is invisible to it:
 *
 *   CSS background-image   the site's biggest images are often here
 *   <video src/poster>     and `<source>` inside picture/video
 *   title/aria-label/placeholder   visible or assistive copy on any element
 *   <img> with no resolvable src   structure says media exists (slot certainty)
 *   page title (route map) the only <head> field the app can actually render
 *
 * What is deliberately NOT slotted: `<iframe src>` (infrastructure/embed, not
 * editable copy), class/id/aria-expanded/data-* (framework state), and every
 * layout CSS declaration.
 */

/** A neutral pre-id occurrence: slotize.ts assigns ids and keys. */
export interface RawBinding {
  pageId: string;
  nodeId?: string;
  variant?: Variant;
  target: BindingTarget;
  property?: string;
  field?: ImageField;
  address: BindingAddress;
  expectedValue?: string;
  transform?: "identity" | "background-image-url-replace";
}

export interface RawSlot {
  /** Stable merge identity — occurrences sharing it become ONE slot. */
  mergeKey: string;
  keyPrefix: string;
  section: string;
  kind: string;
  slug: string;
  type: SlotType;
  role?: string;
  scopeHint: "page" | "global";
  pageId?: string;
  defaultValue: SlotValue;
  fitHints?: FitHints;
  evidence: string[];
  bindings: RawBinding[];
  /** Surface class this slot answers for, used by coverage accounting. */
  coverageClass: string;
}

export interface V2Coverage {
  /** `${pageId}|${variant}|${nodeId}|${childIndex}` */
  text: Set<string>;
  /** `${pageId}|${variant}|${nodeId}|${attributeName}` */
  attribute: Set<string>;
  /** `${pageId}|${variant}|${nodeId}` — any binding at all. */
  nodes: Set<string>;
}

export interface SurfaceScanOptions {
  pages: Map<string, PageIndex>;
  /** pageId → slot key prefix used by Slot V2 (`home`, `kr-pricing`, …). */
  keyPrefixByPage: Map<string, string>;
  routeMap: RuntimeRouteMap;
  stylesheet: string;
  v2: V2Coverage;
}

export interface SurfaceScanResult {
  slots: RawSlot[];
  /** Occurrence counts per coverage class, for the merge report. */
  occurrences: Record<string, number>;
  backgroundRules: BackgroundImageRule[];
  limitations: string[];
}

/** Attributes that carry human copy. Everything else is framework state. */
const COPY_ATTRIBUTES = ["title", "aria-label", "placeholder"] as const;
/** Tags whose attributes are infrastructure, never customer content. */
const ATTRIBUTE_TAG_DENYLIST = new Set(["iframe", "script", "style", "link", "meta", "html", "body"]);

function pushBinding(map: Map<string, RawSlot>, slot: RawSlot): void {
  const existing = map.get(slot.mergeKey);
  if (!existing) {
    map.set(slot.mergeKey, slot);
    return;
  }
  existing.bindings.push(...slot.bindings);
  for (const tag of slot.evidence) if (!existing.evidence.includes(tag)) existing.evidence.push(tag);
}

/**
 * CSS background media. The generated stylesheet is SITE-WIDE (one
 * `.wr-stNNNNNN` class per distinct computed style, shared by every page), so
 * one rule = one slot by construction; a rule used on more than one page is a
 * template-level global because overriding it cannot be page-scoped.
 */
function scanBackgroundMedia(options: SurfaceScanOptions, out: Map<string, RawSlot>): number {
  const rules = scanBackgroundImageRules(options.stylesheet);
  const byClass = new Map<string, BackgroundImageRule[]>();
  for (const rule of rules) {
    const m = /^\.([A-Za-z0-9_-]+)$/.exec(rule.selector.trim());
    if (!m) continue; // compound/descendant selectors are not node-addressable
    const list = byClass.get(m[1]!) ?? [];
    list.push(rule);
    byClass.set(m[1]!, list);
  }

  let occurrences = 0;
  for (const [pageId, page] of options.pages) {
    for (const variant of VARIANTS) {
      const index = variantIndex(page, variant);
      for (const nodeId of index.order) {
        const info = index.byId.get(nodeId)!;
        for (const className of info.classes) {
          const matched = byClass.get(className);
          if (!matched) continue;
          for (const rule of matched) {
            occurrences++;
            const address: BindingAddress = {
              surface: "css-rule",
              cssSelector: rule.selector,
              ...(rule.mediaCondition ? { mediaCondition: rule.mediaCondition } : {}),
            };
            pushBinding(out, {
              mergeKey: `bg|${rule.selector}|${rule.mediaCondition ?? ""}`,
              keyPrefix: options.keyPrefixByPage.get(pageId) ?? pageId,
              section: info.landmark,
              kind: "background",
              slug: slugify(assetSlug(rule.url)),
              type: "image",
              role: "background.image",
              scopeHint: "page",
              pageId,
              defaultValue: { src: rule.url },
              evidence: [
                `landmark:${info.landmark}`,
                `tag:${info.node.t}`,
                "surface:css-rule",
                ...(rule.layered ? ["background:layered"] : []),
              ],
              coverageClass: "backgroundMedia",
              bindings: [
                {
                  pageId,
                  nodeId,
                  variant,
                  target: "style",
                  property: "background-image",
                  field: "src",
                  address,
                  expectedValue: rule.value,
                  transform: "background-image-url-replace",
                },
              ],
            });
          }
        }
      }
    }
  }
  return occurrences;
}

function assetSlug(url: string): string {
  if (url.startsWith("data:")) return "inline";
  const clean = url.split(/[?#]/)[0] ?? url;
  const base = clean.split("/").filter((p) => p !== "").pop() ?? "asset";
  return base.replace(/\.[a-z0-9]+$/i, "");
}

/** `<video>`, `<audio>` and their `<source>`s, plus `<picture><source>`. */
function scanMedia(options: SurfaceScanOptions, out: Map<string, RawSlot>): number {
  let occurrences = 0;
  for (const [pageId, page] of options.pages) {
    for (const variant of VARIANTS) {
      const index = variantIndex(page, variant);
      for (const nodeId of index.order) {
        const info = index.byId.get(nodeId)!;
        const tag = info.node.t.toLowerCase();
        const props = (info.node.p ?? {}) as Record<string, unknown>;
        const parentTag = info.parentId
          ? (index.byId.get(info.parentId)?.node.t.toLowerCase() ?? "")
          : "";

        const isTimedMedia = tag === "video" || tag === "audio";
        const isMediaSource = tag === "source" && (parentTag === "video" || parentTag === "audio");
        const isPictureSource = tag === "source" && parentTag === "picture";
        if (!isTimedMedia && !isMediaSource && !isPictureSource) continue;

        const src = typeof props["src"] === "string" ? (props["src"] as string) : null;
        const poster = typeof props["poster"] === "string" ? (props["poster"] as string) : null;
        const srcSet = typeof props["srcSet"] === "string" ? (props["srcSet"] as string) : undefined;
        occurrences++;

        const bindings: RawBinding[] = [];
        const mk = (property: string, field: ImageField, expected: string): RawBinding => ({
          pageId,
          nodeId,
          variant,
          target: "attribute",
          property,
          field,
          address: { surface: "static" },
          expectedValue: expected,
        });
        if (src !== null) bindings.push(mk("src", "src", src));
        if (poster !== null) bindings.push(mk("poster", "poster", poster));
        if (srcSet !== undefined) bindings.push(mk("srcSet", "srcset", srcSet));

        const type: SlotType = isPictureSource ? "image" : "video";
        const value: SlotValue = isPictureSource
          ? { src, ...(srcSet === undefined ? {} : { srcset: srcSet }) }
          : { src, poster };
        pushBinding(out, {
          mergeKey: `media|${pageId}|${tag}|${type}|${src ?? ""}|${poster ?? ""}|${srcSet ?? ""}`,
          keyPrefix: options.keyPrefixByPage.get(pageId) ?? pageId,
          section: info.landmark,
          kind: type,
          slug: slugify(assetSlug(src ?? poster ?? nodeId)),
          type,
          role: type === "video" ? "media.video" : "image.source",
          scopeHint: "page",
          pageId,
          defaultValue: value,
          evidence: [`landmark:${info.landmark}`, `tag:${tag}`, "surface:static"],
          coverageClass: "video",
          bindings,
        });
      }
    }
  }
  return occurrences;
}

/** `title` / `aria-label` / `placeholder` that Slot V2 never claimed. */
function scanCopyAttributes(options: SurfaceScanOptions, out: Map<string, RawSlot>): number {
  let occurrences = 0;
  for (const [pageId, page] of options.pages) {
    for (const variant of VARIANTS) {
      const index = variantIndex(page, variant);
      for (const nodeId of index.order) {
        const info = index.byId.get(nodeId)!;
        const tag = info.node.t.toLowerCase();
        if (ATTRIBUTE_TAG_DENYLIST.has(tag)) continue;
        const boundNode = options.v2.nodes.has(`${pageId}|${variant}|${nodeId}`);
        // aria-hidden copy is not read by anyone — unless Slot V2 already
        // proved this node is a painted twin of visible content.
        if (info.ariaHidden && !boundNode) continue;
        const props = (info.node.p ?? {}) as Record<string, unknown>;
        for (const attribute of COPY_ATTRIBUTES) {
          const raw = props[attribute];
          if (typeof raw !== "string" || raw.trim() === "") continue;
          if (options.v2.attribute.has(`${pageId}|${variant}|${nodeId}|${attribute}`)) continue;
          occurrences++;
          pushBinding(out, {
            mergeKey: `attr|${pageId}|${attribute}|${tag}|${raw}`,
            keyPrefix: options.keyPrefixByPage.get(pageId) ?? pageId,
            section: info.landmark,
            kind: attribute === "aria-label" ? "aria-label" : attribute,
            slug: slugify(raw),
            type: "text",
            role: attribute === "placeholder" ? "form.placeholder" : `attribute.${attribute}`,
            scopeHint: "page",
            pageId,
            defaultValue: raw,
            fitHints: textFitHints(raw, false),
            evidence: [`landmark:${info.landmark}`, `tag:${tag}`, `attribute:${attribute}`, "surface:static"],
            coverageClass: attribute === "aria-label" ? "ariaLabel" : "titlePlaceholder",
            bindings: [
              {
                pageId,
                nodeId,
                variant,
                target: "attribute",
                property: attribute,
                address: { surface: "static" },
                expectedValue: raw,
              },
            ],
          });
        }
      }
    }
  }
  return occurrences;
}

/**
 * `<img>` whose src never resolved. SLOT CERTAINTY > ASSET FIDELITY: the slot
 * exists because the structure says an image belongs here, and its default is
 * honestly `null` rather than a silently dropped surface.
 */
function scanUnresolvedImages(options: SurfaceScanOptions, out: Map<string, RawSlot>): number {
  let occurrences = 0;
  for (const [pageId, page] of options.pages) {
    for (const variant of VARIANTS) {
      const index = variantIndex(page, variant);
      for (const nodeId of index.order) {
        const info = index.byId.get(nodeId)!;
        if (info.node.t.toLowerCase() !== "img") continue;
        if (options.v2.nodes.has(`${pageId}|${variant}|${nodeId}`)) continue;
        const props = (info.node.p ?? {}) as Record<string, unknown>;
        const src = typeof props["src"] === "string" ? (props["src"] as string) : null;
        const alt = typeof props["alt"] === "string" ? (props["alt"] as string) : undefined;
        occurrences++;
        const bindings: RawBinding[] = [];
        if (src !== null) {
          bindings.push({
            pageId,
            nodeId,
            variant,
            target: "attribute",
            property: "src",
            field: "src",
            address: { surface: "static" },
            expectedValue: src,
          });
        }
        if (alt !== undefined) {
          bindings.push({
            pageId,
            nodeId,
            variant,
            target: "attribute",
            property: "alt",
            field: "alt",
            address: { surface: "static" },
            expectedValue: alt,
          });
        }
        // No writable attribute at all: keep the slot addressable by node so a
        // later phase can still attach a src, but bind nothing that can fail.
        if (bindings.length === 0) {
          bindings.push({
            pageId,
            nodeId,
            variant,
            target: "attribute",
            property: "src",
            field: "src",
            address: { surface: "static" },
          });
        }
        pushBinding(out, {
          mergeKey: `img|${pageId}|${nodeId}`,
          keyPrefix: options.keyPrefixByPage.get(pageId) ?? pageId,
          section: info.landmark,
          kind: "image",
          slug: slugify(src === null ? `unresolved-${nodeId}` : assetSlug(src)),
          type: "image",
          role: "image.content",
          scopeHint: "page",
          pageId,
          defaultValue: { src, ...(alt === undefined ? {} : { alt }) },
          evidence: [
            `landmark:${info.landmark}`,
            "tag:img",
            "surface:static",
            ...(src === null ? ["asset:unresolved"] : []),
          ],
          coverageClass: "images",
          bindings,
        });
      }
    }
  }
  return occurrences;
}

/** Page metadata. Only `title` exists in this app — see limitations. */
function scanMetadata(options: SurfaceScanOptions, out: Map<string, RawSlot>): number {
  let occurrences = 0;
  for (const route of options.routeMap.routes) {
    const title = route.title;
    if (typeof title !== "string" || title.trim() === "") continue;
    occurrences++;
    pushBinding(out, {
      mergeKey: `meta|${route.pageSourceId}|title|${title}`,
      keyPrefix: options.keyPrefixByPage.get(route.pageSourceId) ?? route.pageSourceId,
      section: "meta",
      kind: "title",
      slug: "page-title",
      type: "text",
      role: "meta.title",
      scopeHint: "page",
      pageId: route.pageSourceId,
      defaultValue: title,
      fitHints: textFitHints(title, true),
      evidence: ["surface:route-map", "metadata:title"],
      coverageClass: "metadata",
      bindings: [
        {
          pageId: route.pageSourceId,
          target: "metadata",
          property: "title",
          address: { surface: "route-map", metadataKey: "title", routeId: route.routeId },
          expectedValue: title,
        },
      ],
    });
  }
  return occurrences;
}

/** Cheap fit hints: headings get a tighter budget than body copy. */
export function textFitHints(value: string, heading: boolean): FitHints {
  const sourceChars = [...value].length;
  const sourceWords = value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
  return {
    sourceChars,
    sourceWords,
    recommendedMaxChars: Math.max(1, Math.ceil(sourceChars * (heading ? 1.3 : 1.5))),
  };
}

export function scanSurfaces(options: SurfaceScanOptions): SurfaceScanResult {
  const out = new Map<string, RawSlot>();
  const occurrences: Record<string, number> = {
    backgroundMedia: scanBackgroundMedia(options, out),
    video: scanMedia(options, out),
    copyAttributes: scanCopyAttributes(options, out),
    images: scanUnresolvedImages(options, out),
    metadata: scanMetadata(options, out),
  };
  return {
    slots: [...out.values()],
    occurrences,
    backgroundRules: scanBackgroundImageRules(options.stylesheet),
    limitations: [
      "metadata: only the document title is representable — the reconstruction app renders no description/og:* tags, so inventing those slots would produce values nothing reads",
      "iframe src is classified as infrastructure/embed, not content: no slot is created for it",
      "rich-text: no innerHTML slots are emitted in V1 — every text occurrence is bound as a leaf text run instead",
    ],
  };
}
