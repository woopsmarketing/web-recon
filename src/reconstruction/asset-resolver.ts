import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import type { AssetCatalog, AssetSpec } from "../sitespec/index.js";
import { ReconstructionError } from "./types.js";

/**
 * Element → asset binding (items 69–79).
 *
 * Task 13 already did the hard part: it recorded which asset ids were observed
 * ON which element, so this layer joins on that relation and nothing else. There
 * is no URL substring matching, no "this looks like the logo", no filename
 * heuristic (item 69) — a reconstruction that guessed which image belonged to
 * which element would be inventing the page.
 *
 * `assetMode: "reference"` (item 79). The SiteSpec is a reference IR; no binary
 * was ever downloaded and this Task downloads none either. The clone points at
 * the public URLs that were observed. If Task 15 finds hotlinking to be a
 * fidelity blocker, materialization is a later, separate decision.
 *
 * Native `<img>`, never `next/image` (item 70): the optimizer needs remote-domain
 * configuration and performs its own size inference, and every one of those is a
 * variable between the original pixels and the clone's that nobody asked for.
 */

/** Asset kinds that can supply an `<img>`'s primary `src`. */
const PRIMARY_IMAGE_KINDS: readonly string[] = ["image", "source", "video-poster"];

export interface ResolvedElementAssets {
  src?: string;
  srcSet?: string;
  /** Sanitized inline-SVG markup, when this element IS an inline SVG root. */
  inlineSvg?: string;
  /** Candidates left out because they arrived with no descriptor (item 72). */
  droppedSrcsetCandidates: number;
  /** True when the element wanted an asset and none was usable (item 73). */
  unresolved: boolean;
  /** Remote (cross-origin) URLs this element references. */
  remoteUrls: number;
}

/**
 * Every `<img>` in the corpus has exactly one `image` asset, but "exactly one"
 * is a property of the data, not a guarantee, so ambiguity is decided by a
 * stated policy rather than by whichever id sorted first (item 72):
 *
 *   1. `image` beats `source` beats `video-poster` — a kind ordering, not a
 *      string comparison.
 *   2. Within one kind, the descriptorless candidate is the element's own `src`;
 *      descriptors belong to srcset candidates.
 *   3. Still tied → nothing is chosen. The element renders without a `src` and
 *      the manifest counts it. Quietly taking the first is how a clone ends up
 *      showing the wrong picture with full confidence.
 */
function choosePrimary(candidates: readonly AssetSpec[]): {
  asset?: AssetSpec;
  ambiguous: boolean;
} {
  for (const kind of PRIMARY_IMAGE_KINDS) {
    const ofKind = candidates.filter((a) => a.kind === kind && a.url !== undefined);
    if (ofKind.length === 0) continue;
    if (ofKind.length === 1) return { asset: ofKind[0]!, ambiguous: false };
    const withoutDescriptor = ofKind.filter((a) => a.descriptor === undefined);
    if (withoutDescriptor.length === 1) {
      return { asset: withoutDescriptor[0]!, ambiguous: false };
    }
    return { ambiguous: true };
  }
  return { ambiguous: false };
}

/**
 * Build the `srcSet` value from the element's srcset candidates.
 *
 * The Observer caps an attribute value at 500 characters, and a Next.js image
 * `srcset` routinely exceeds that, so the LAST candidate of a long srcset can
 * arrive truncated and — because its descriptor was on the far side of the cut —
 * descriptorless. Emitting those would put a URL into the clone that resolves to
 * nothing.
 *
 * So: candidates WITH descriptors are emitted in catalog order. A lone
 * descriptorless candidate is a legal one-candidate srcset and is emitted.
 * Descriptorless candidates sitting ALONGSIDE descriptored ones are the
 * truncation artifact — they are left out and COUNTED, never silently dropped.
 */
function buildSrcSet(candidates: readonly AssetSpec[]): {
  value?: string;
  dropped: number;
} {
  const usable = candidates.filter((a) => a.url !== undefined);
  if (usable.length === 0) return { dropped: 0 };
  const withDescriptor = usable.filter((a) => a.descriptor !== undefined);
  if (withDescriptor.length === 0) {
    return usable.length === 1
      ? { value: usable[0]!.url!, dropped: 0 }
      : { dropped: usable.length };
  }
  return {
    value: withDescriptor.map((a) => `${a.url!} ${a.descriptor!}`).join(", "),
    dropped: usable.length - withDescriptor.length,
  };
}

export interface AssetResolverOptions {
  assetCatalog: AssetCatalog;
  rootUrl: string;
}

export class AssetResolver {
  private readonly byId: Map<string, AssetSpec>;

  constructor(private readonly options: AssetResolverOptions) {
    this.byId = new Map(options.assetCatalog.assets.map((a) => [a.assetId, a]));
  }

  get(assetId: string): AssetSpec | undefined {
    return this.byId.get(assetId);
  }

  /** Resolve one element's asset references into renderable values. */
  resolve(tagName: string, assetRefs: readonly string[]): ResolvedElementAssets {
    const result: ResolvedElementAssets = {
      droppedSrcsetCandidates: 0,
      unresolved: false,
      remoteUrls: 0,
    };
    if (assetRefs.length === 0) {
      // An `<img>` with no asset reference at all wanted one and has none.
      result.unresolved = tagName === "img";
      return result;
    }

    const assets = assetRefs
      .map((id) => this.byId.get(id))
      .filter((a): a is AssetSpec => a !== undefined);

    for (const asset of assets) {
      if (asset.url !== undefined && asset.sameOrigin === false) result.remoteUrls++;
    }

    if (tagName === "svg") {
      const svg = assets.find((a) => a.kind === "inline-svg" && a.inlineSvg);
      if (svg?.inlineSvg) {
        assertSvgIsDefused(svg);
        result.inlineSvg = svg.inlineSvg.markup;
      } else {
        result.unresolved = true;
      }
      return result;
    }

    if (tagName === "img" || tagName === "source" || tagName === "video") {
      const primary = choosePrimary(assets);
      if (primary.asset?.url) result.src = primary.asset.url;

      const srcset = buildSrcSet(
        assets.filter((a) => a.kind === "image-srcset" || a.kind === "picture-source"),
      );
      if (srcset.value !== undefined) result.srcSet = srcset.value;
      result.droppedSrcsetCandidates = srcset.dropped;

      if (tagName === "img" && result.src === undefined && result.srcSet === undefined) {
        result.unresolved = true;
      }
      return result;
    }

    // `background-image` / `mask-image` / `font` / `icon` assets are referenced
    // by the computed style the element already carries (item 78), so there is
    // nothing further to attach here.
    return result;
  }
}

/**
 * Defense in depth on inline SVG (item 75).
 *
 * Task 13 already parsed, sanitized and re-serialized this markup, and this
 * Task is forbidden from going back to the raw source to re-read it (item 74).
 * That makes the SiteSpec's `markup` the only SVG that exists here — and the one
 * value in the whole pipeline that reaches `dangerouslySetInnerHTML`. It is
 * checked again at the boundary, because "an earlier stage promised" is not a
 * property a security check can be built on: a SiteSpec is a shareable artifact
 * that can be edited between the two stages.
 */
export function assertSvgIsDefused(asset: AssetSpec): void {
  const markup = asset.inlineSvg?.markup ?? "";
  const problems: string[] = [];
  if (/<\s*script/i.test(markup)) problems.push("contains a <script> element");
  if (/\son[a-z]+\s*=/i.test(markup)) problems.push("contains an on* handler attribute");
  if (/javascript\s*:/i.test(markup)) problems.push("contains a javascript: URL");
  if (/<\s*foreignObject/i.test(markup)) problems.push("contains a <foreignObject>");
  if (problems.length > 0) {
    throw new ReconstructionError(
      `inline SVG asset ${asset.assetId} is not safe to render: ${problems.join("; ")}. ` +
        `Task 13 sanitizes this markup on the way in, so a violation here means the ` +
        `SiteSpec was modified after it was compiled.`,
    );
  }
}

/**
 * Give the sanitized SVG root the clone's own identity (item 76).
 *
 * Two things happen here, and the second is the one that matters.
 *
 * 1. The clone's `class` / `id` / `data-wr-node` go ON THE `<svg>` ELEMENT, so
 *    the element that carries the observed computed style is the one the browser
 *    lays out — not a wrapper whose box would be an extra, invented one.
 *
 * 2. The root's SOURCE `class`, `style`, `id` and `data-*` are removed first.
 *    Task 04 preserved inline SVG as opaque `outerHTML`, so 79 of the corpus's
 *    145 roots still carry a source `class` and 49 a source `style` — appending
 *    a second `class` would silently lose the generated one (first wins in the
 *    HTML parser), and keeping the source `style` would fight the computed style
 *    that already expresses it. The `<svg>` element is a SiteSpec NODE, and a
 *    node's attributes come from its attribute map, not from the asset markup
 *    (item 50). Everything else the root declares — `viewBox`, `fill`, `stroke`,
 *    `xmlns` — is SVG geometry and is preserved untouched, as is the entire
 *    subtree, which Task 13 marked `svg-subtree-opaque`.
 *
 * parse5 rather than a regex: the markup is already parse5's own serialization
 * (verified byte-stable across all 145 corpus assets), so a parse/serialize
 * round trip is exact and cannot be fooled by an attribute value containing `>`.
 */
export function annotateSvgRoot(
  markup: string,
  attributes: Readonly<Record<string, string>>,
): string {
  let fragment: DefaultTreeAdapterTypes.DocumentFragment;
  try {
    fragment = parseFragment(markup);
  } catch {
    return markup;
  }
  const root = fragment.childNodes.find(
    (node): node is DefaultTreeAdapterTypes.Element =>
      typeof (node as DefaultTreeAdapterTypes.Element).tagName === "string",
  );
  if (!root) return markup;

  root.attrs = root.attrs.filter((attr) => {
    const name = attr.name.toLowerCase();
    return (
      name !== "class" &&
      name !== "style" &&
      name !== "id" &&
      !name.startsWith("data-") &&
      !name.startsWith("on")
    );
  });
  for (const [name, value] of Object.entries(attributes)) {
    if (value === "") continue;
    root.attrs.push({ name, value });
  }
  return serialize(fragment);
}
