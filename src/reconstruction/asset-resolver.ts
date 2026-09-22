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

/**
 * Asset kinds that can supply an `<img>` / `<source>` / `<video>`'s primary
 * `src` (Task 28.5B, Change 4).
 *
 * `video` is a `<video>`'s OWN media reference (Observer `type: "video"`,
 * `src/observer/collect-assets.ts` case `"video"`). It was missing from this
 * list entirely — the confirmed root cause of docs/result/handoffs/
 * 28.5-root-causes.json's video-honesty finding: a `<video>` whose only asset
 * was kind `video` matched none of `["image","source","video-poster"]` and
 * received no `src`, silently, because nothing downstream asked "did the
 * KIND the tag actually wanted ever match?" — see `videoContentUnresolved`
 * in `resolve()` below, which is the other half of this fix.
 */
const PRIMARY_IMAGE_KINDS: readonly string[] = ["image", "source", "video", "video-poster"];

/** Kinds `buildSrcSet()` consumes — the srcset half of an element's own media. */
const SRCSET_KINDS: readonly string[] = ["image-srcset", "picture-source"];

/**
 * Every kind that can supply an element's OWN `src`/`srcSet` — the union of what
 * `choosePrimary()` and `buildSrcSet()` consume, derived from those two lists so
 * it cannot drift from them (Task 28.5B correction, GAP-B).
 *
 * The complement is what makes this useful: `background-image`, `mask-image`,
 * `icon`, `font` and `inline-svg` are assets an element merely *references*
 * through its computed style, and `src/observer/collect-assets.ts` pushes a
 * `background-image` ref onto EVERY element that has one, outside the tagName
 * switch. So "this element carries an assetRef" is not the same question as
 * "this element carries its own media", and only the second one may be used to
 * decide whether a `<video>`'s media went missing.
 *
 * Known limitation: `audio` is deliberately absent. `<audio>` never reaches the
 * media branch below at all (it takes the generic fall-through) and extending
 * this fix to it is explicitly out of Task 28.5B's scope; its media is still
 * silently dropped, recorded here so the gap is not lost.
 */
const MEDIA_ASSET_KINDS: ReadonlySet<string> = new Set<string>([
  ...PRIMARY_IMAGE_KINDS,
  ...SRCSET_KINDS,
]);

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
  /**
   * True when the element carried NO asset of a media kind (`MEDIA_ASSET_KINDS`)
   * of its own — either no assetRefs at all, or only non-media ones such as the
   * `background-image` ref every styled element gets (Task 28.5B correction).
   *
   * The resolver reports this instead of deciding, because for a `<video>` the
   * fact is not yet a verdict: media may legitimately arrive from `<source>`
   * children, which `resolve()` cannot see. `compile-node.ts` owns that join.
   */
  noOwnMediaAsset: boolean;
}

/**
 * Every `<img>` in the corpus has exactly one `image` asset, but "exactly one"
 * is a property of the data, not a guarantee, so ambiguity is decided by a
 * stated policy rather than by whichever id sorted first (item 72):
 *
 *   1. `image` beats `source` beats `video` beats `video-poster` — a kind
 *      ordering, not a string comparison. `video-poster` is last on purpose:
 *      it is a still-frame fallback, never the content itself, and it only
 *      ever gets asked to stand in for `src` when a `<video>` has no `video`
 *      kind asset at all — the exact substitution `resolve()` below counts as
 *      unresolved even though it still renders (poster handling is
 *      unchanged; the honesty of it is not).
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
      noOwnMediaAsset: false,
    };
    if (assetRefs.length === 0) {
      result.noOwnMediaAsset = true;
      /**
       * An `<img>` with no asset reference at all wanted one and has none.
       *
       * Task 28.5B correction, GAP-A: a `<source>` is now counted the same way.
       * A `<source>` exists for one purpose — to supply media to its `<picture>`
       * or `<video>` parent — so zero assetRefs means its `src`/`srcset` failed
       * URL resolution in the Observer (or it never carried one), and its media
       * is gone. Previously this returned `unresolved: false` while the parent
       * `<video>` was simultaneously judged innocent *because a `<source>` child
       * existed*: both ends stayed silent and a missing video coexisted with
       * `unresolvedElementAssets = 0`, which is exactly the invariant 28.5B
       * removes. Counting at the `<source>` — not at the parent — keeps it to
       * exactly one increment per genuinely-lost media element (see
       * `compile-node.ts`, which deliberately leaves such a parent uncounted).
       */
      result.unresolved = tagName === "img" || tagName === "source";
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
      /**
       * Task 28.5B correction, GAP-B (overcount).
       *
       * A `<video>` that supplies its media through `<source>` children still
       * commonly carries an assetRef of its own — the `background-image` ref
       * `collect-assets.ts` pushes onto every styled element. That ref says
       * nothing about the video's media, but it made `assetRefs.length > 0`,
       * which both defeated `compile-node.ts`'s source-child guard and drove
       * this branch to `noSrcAtAll` → `unresolved: true` for an element that
       * renders perfectly from its children. Honesty has to cut both ways: an
       * artifact that over-reports missing assets is as untrustworthy as one
       * that under-reports them.
       *
       * So the media question is asked of MEDIA kinds only. With none present,
       * this `<video>` is in exactly the state of one with zero assetRefs: the
       * resolver has no evidence either way and stays silent, and the verdict
       * is left to the one place that can see `<source>` children.
       *
       * `assets.length > 0` narrows this to refs that actually RESOLVED to
       * non-media assets. Refs that resolve to nothing at all (dangling ids)
       * have no kind to inspect and remain a genuine catalog failure — they
       * keep falling through to `noSrcAtAll` and stay counted, as before.
       */
      if (
        tagName === "video" &&
        assets.length > 0 &&
        !assets.some((a) => MEDIA_ASSET_KINDS.has(a.kind))
      ) {
        result.noOwnMediaAsset = true;
        return result;
      }

      const primary = choosePrimary(assets);
      if (primary.asset?.url) result.src = primary.asset.url;

      const srcset = buildSrcSet(assets.filter((a) => SRCSET_KINDS.includes(a.kind)));
      if (srcset.value !== undefined) result.srcSet = srcset.value;
      result.droppedSrcsetCandidates = srcset.dropped;

      const noSrcAtAll = result.src === undefined && result.srcSet === undefined;
      /**
       * A `<video>`'s real content is its `video`-kind asset. When none
       * resolved and a `video-poster` asset stood in for `src` instead (the
       * last entry in `PRIMARY_IMAGE_KINDS`), something still renders — but
       * it is a still-frame image standing in for missing media, not the
       * media. Task 28.5B's invariant is exactly this: an unmaterialized
       * visual asset must be COUNTED even where a fallback keeps the pixels
       * from being literally blank. Poster handling itself is unchanged —
       * this only changes whether the substitution is honest.
       */
      const videoContentUnresolved =
        tagName === "video" && primary.asset?.kind !== "video";

      // `<img>`, `<source>` and `<video>` all "wanted" a primary asset the
      // moment they carried an assetRef at all; failing to produce one is
      // unresolved for all three (Task 28.5B extends this from `img` only —
      // `<video><source>` children must count exactly like a bare `<img>`
      // does, and that is the only way item 4's "unresolvable children
      // counted" requirement can be true; it does not change what `<img>` or
      // `<source>` resolve TO, only whether a resolution failure is counted).
      if (noSrcAtAll || videoContentUnresolved) {
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
