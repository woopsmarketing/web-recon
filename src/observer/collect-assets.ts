import type { AssetObservation } from "./types.js";
import type {
  RawElement,
  RawFontUrl,
  RawIcon,
  RawImageInfo,
  RawInlineSvg,
} from "./collect-dom.js";

/**
 * Derive asset references from observed elements (Phase 3, Node side; augmented
 * in Task 04).
 *
 * URL assets keep only URLs + metadata — binaries are never downloaded. URLs are
 * resolved against the page `baseUri`; only http(s) results are kept (inline
 * `data:` / `blob:` URIs are skipped to avoid bloating the output).
 *
 * Task 04 additions:
 *  - `<img>` `currentSrc` (the browser-selected responsive URL) + intrinsic
 *    `naturalWidth`/`naturalHeight`.
 *  - `mask-image` / `-webkit-mask-image` `url(...)` targets.
 *  - Inline `<svg>` roots, preserved as `inline-svg` assets carrying the SVG
 *    `markup` (outerHTML). That markup is UNTRUSTED page content and must be
 *    sanitized before any future re-render (see AssetObservation schema note).
 *
 * ## Asset IDENTITY vs asset OCCURRENCE (Task 16, A1)
 *
 * Up to Task 15 this function deduplicated URL assets on `type|url` alone, so
 * the SECOND `<img src="/logo.png">` on a page produced no record at all — and
 * with no record there was no `elementId`, so Task 13 compiled that node with
 * `assetRefs: []` and Task 14 rendered an `<img>` with no `src`. Task 15
 * measured the damage: all 325 of nextjs.org's `asset-missing` findings were
 * this one bug, every one of them a visible gap where the live original draws
 * an image.
 *
 * The two concepts are now separated:
 *
 *   identity    the same file referenced twice is ONE asset. Deduplication
 *               still happens — in the SiteSpec asset catalog, which keys on
 *               `kind + url + descriptor` and is the thing that must not grow.
 *   occurrence  WHICH elements use it is per element, always. That mapping is
 *               what a renderer needs and what was being thrown away.
 *
 * So an asset that belongs to an element is deduplicated on
 * `type|url|elementId` (an element still cannot list the same asset twice), and
 * a document-level asset with no element — `icon`, `font` — keeps the original
 * `type|url` key because there is no occurrence to preserve.
 */

function resolve(u: string | undefined, baseUri: string): string | null {
  if (u == null) return null;
  try {
    const url = new URL(u, baseUri);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function toInt(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Split a srcset string into `{ url, descriptor? }` candidates. */
function parseSrcset(srcset: string): Array<{ url: string; descriptor?: string }> {
  const out: Array<{ url: string; descriptor?: string }> = [];
  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [url, ...rest] = trimmed.split(/\s+/);
    if (!url) continue;
    const descriptor = rest.join(" ");
    out.push(descriptor ? { url, descriptor } : { url });
  }
  return out;
}

/** Extract every `url(...)` target from a CSS value (e.g. background-image). */
function extractCssUrls(cssValue: string): string[] {
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssValue)) !== null) urls.push(m[2]);
  return urls;
}

export function deriveAssets(
  elements: readonly RawElement[],
  images: readonly RawImageInfo[],
  inlineSvgs: readonly RawInlineSvg[],
  icons: readonly RawIcon[],
  fontUrls: readonly RawFontUrl[],
  baseUri: string,
): AssetObservation[] {
  const assets: AssetObservation[] = [];
  const seen = new Set<string>();
  const imageById = new Map<string, RawImageInfo>();
  for (const info of images) imageById.set(info.elementId, info);

  const push = (a: AssetObservation): void => {
    // The element is part of the key whenever there is one, so N elements using
    // one URL produce N occurrence records — and a single element still cannot
    // list the same (type, url, descriptor) twice.
    const identity = a.url ?? "el:" + (a.elementId ?? "");
    const key =
      a.elementId !== undefined
        ? `${a.type}|${identity}|${a.descriptor ?? ""}|${a.elementId}`
        : `${a.type}|${identity}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push(a);
  };

  for (const el of elements) {
    const attrs = el.attributes;
    const alt = attrs["alt"];
    const width = toInt(attrs["width"]);
    const height = toInt(attrs["height"]);

    switch (el.tagName) {
      case "img": {
        const info = imageById.get(el.id);
        const src = resolve(attrs["src"], baseUri);
        const currentSrc = resolve(info?.currentSrc, baseUri);
        const primaryUrl = src ?? currentSrc ?? undefined;
        if (primaryUrl) {
          push({
            url: primaryUrl,
            type: "image",
            elementId: el.id,
            ...(alt ? { alt } : {}),
            ...(width !== undefined ? { width } : {}),
            ...(height !== undefined ? { height } : {}),
            ...(currentSrc ? { currentSrc } : {}),
            ...(info?.naturalWidth ? { naturalWidth: info.naturalWidth } : {}),
            ...(info?.naturalHeight
              ? { naturalHeight: info.naturalHeight }
              : {}),
          });
        }
        if (attrs["srcset"]) {
          for (const c of parseSrcset(attrs["srcset"])) {
            const u = resolve(c.url, baseUri);
            if (!u) continue;
            push({
              url: u,
              type: "image-srcset",
              elementId: el.id,
              ...(c.descriptor ? { descriptor: c.descriptor } : {}),
              ...(alt ? { alt } : {}),
            });
          }
        }
        break;
      }
      case "source": {
        if (attrs["srcset"]) {
          for (const c of parseSrcset(attrs["srcset"])) {
            const u = resolve(c.url, baseUri);
            if (!u) continue;
            push({
              url: u,
              type: "picture-source",
              elementId: el.id,
              ...(c.descriptor ? { descriptor: c.descriptor } : {}),
            });
          }
        }
        const src = resolve(attrs["src"], baseUri);
        if (src) push({ url: src, type: "source", elementId: el.id });
        break;
      }
      case "video": {
        const src = resolve(attrs["src"], baseUri);
        if (src) push({ url: src, type: "video", elementId: el.id });
        const poster = resolve(attrs["poster"], baseUri);
        if (poster) push({ url: poster, type: "video-poster", elementId: el.id });
        break;
      }
      case "audio": {
        const src = resolve(attrs["src"], baseUri);
        if (src) push({ url: src, type: "audio", elementId: el.id });
        break;
      }
    }

    const bg = el.styles["background-image"];
    if (bg && bg !== "none") {
      for (const raw of extractCssUrls(bg)) {
        const u = resolve(raw, baseUri);
        if (u) push({ url: u, type: "background-image", elementId: el.id });
      }
    }

    // Mask images (standard + WebKit-prefixed).
    for (const prop of ["mask-image", "-webkit-mask-image"] as const) {
      const mask = el.styles[prop];
      if (mask && mask !== "none") {
        for (const raw of extractCssUrls(mask)) {
          const u = resolve(raw, baseUri);
          if (u) push({ url: u, type: "mask-image", elementId: el.id });
        }
      }
    }
  }

  // Inline SVG roots (no URL; markup preserved, UNTRUSTED).
  for (const svg of inlineSvgs) {
    push({
      type: "inline-svg",
      elementId: svg.elementId,
      markup: svg.outerHTML,
      ...(svg.width !== undefined ? { width: svg.width } : {}),
      ...(svg.height !== undefined ? { height: svg.height } : {}),
    });
  }

  for (const icon of icons) {
    const u = resolve(icon.href, baseUri);
    if (u) push({ url: u, type: "icon" });
  }

  for (const font of fontUrls) {
    const u = resolve(font.url, baseUri);
    if (u) push({ url: u, type: "font" });
  }

  return assets;
}

/**
 * Distinct asset IDENTITIES behind a list of occurrences (Task 16, A1).
 *
 * The key mirrors the SiteSpec asset catalog's `canonicalKey` exactly, so
 * "catalog duplicate growth 0" (item 8) is checkable against the Observer's own
 * numbers without loading a SiteSpec.
 */
export function countUniqueAssetIdentities(
  assets: readonly AssetObservation[],
): number {
  const identities = new Set<string>();
  for (const a of assets) {
    identities.add(
      a.type === "inline-svg"
        ? `inline-svg|${a.markup ?? ""}`
        : `${a.type}|${a.url ?? ""}|${a.descriptor ?? ""}`,
    );
  }
  return identities.size;
}
