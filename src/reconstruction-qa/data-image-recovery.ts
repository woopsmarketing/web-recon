import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { SKIP_TAGS } from "../observer/types.js";
import {
  alignRenderedHtml,
  type AlignableElement,
} from "../sitespec/index.js";
import {
  DATA_IMAGE_EXTENSIONS,
  MAX_DATA_IMAGE_BYTES,
  SAFE_DATA_IMAGE_MIMES,
} from "./types.js";

/**
 * Safe `data:` image recovery (items 101–107).
 *
 * Task 14 leaves some `<img>` elements with no `src` because the SiteSpec has no
 * asset reference for them: the Observer never stored a `data:` URI, so the
 * asset catalog has nothing to point at. The bytes are not lost, though — the
 * Task 09 `rendered.html` for that viewport still contains them, and Task 13
 * already proved that parse reproduces `dom.json` exactly.
 *
 * That proof is the ONLY thing that licenses reading anything out of the markup
 * (item 102), so it is re-run here rather than assumed, and the harvest is
 * bounded to a single attribute (`src`) on a single tag (`img`).
 *
 * ## Everything that can reject a candidate
 *
 *   - the viewport's `rendered.html` does not align  → no recovery, no exception
 *   - the value is not a `data:` URI                 → out of scope entirely
 *   - the MIME is not one of five raster types       → rejected (SVG included:
 *     an SVG data URI is markup that can carry script, and sanitizing it is a
 *     second security surface this Task has no reason to open — item 103)
 *   - base64 / percent-encoding does not parse       → rejected (item 106)
 *   - declared MIME disagrees with the magic bytes   → rejected (item 106)
 *   - decoded size over 1 MiB                        → rejected (item 104)
 *
 * A candidate that passes all of them is written as a content-addressed file, so
 * two runs over the same evidence produce the same file name (item 105) and the
 * decoded payload never travels inside JSON or inside browser JavaScript.
 */

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SKIP = new Set<string>(SKIP_TAGS);

function isElement(node: P5Node): node is P5Element {
  return typeof (node as P5Element).tagName === "string";
}

/** The value `Element.tagName` would have had in the browser (Task 13's rule). */
function domTagName(element: P5Element): string {
  return element.namespaceURI === HTML_NAMESPACE
    ? element.tagName.toUpperCase()
    : element.tagName;
}

function attrValue(element: P5Element, name: string): string | undefined {
  for (const attribute of element.attrs) {
    if (attribute.name === name && !attribute.prefix) return attribute.value;
  }
  return undefined;
}

interface HarvestedElement {
  tagName: string;
  parentIndex: number;
  /** Present only for `<img>` whose `src` is a `data:` URI. */
  dataSrc?: string;
}

/**
 * Walk the parse tree exactly as `collect-dom.ts` walked the live document:
 * same skip set, same pre-order, same "an inline `<svg>` root is opaque".
 */
function harvest(html: string): HarvestedElement[] | undefined {
  let document: DefaultTreeAdapterTypes.Document;
  try {
    document = parse(html);
  } catch {
    return undefined;
  }
  const out: HarvestedElement[] = [];
  const root = findHtmlElement(document);
  if (!root) return undefined;

  const walk = (element: P5Element, parentIndex: number): void => {
    const tag = domTagName(element);
    if (SKIP.has(tag)) return;
    const index = out.length;
    const lower = tag.toLowerCase();
    const record: HarvestedElement = { tagName: lower, parentIndex };
    if (lower === "img") {
      const src = attrValue(element, "src");
      if (src !== undefined && src.startsWith("data:")) record.dataSrc = src;
    }
    out.push(record);
    if (lower === "svg") return;
    for (const child of element.childNodes) {
      if (isElement(child)) walk(child, index);
    }
  };
  walk(root, -1);
  return out;
}

function findHtmlElement(
  document: DefaultTreeAdapterTypes.Document,
): P5Element | undefined {
  for (const child of document.childNodes) {
    if (isElement(child) && domTagName(child) === "HTML") return child;
  }
  return undefined;
}

export interface DataImageSource {
  /** dom.json element index → the `data:` URI found on that `<img>`. */
  byElementIndex: Map<number, string>;
  /** Element index → the Observer element id, for cross-checking. */
  aligned: boolean;
  failure?: string;
}

/**
 * Re-align a viewport's `rendered.html` and harvest `data:` image sources.
 *
 * Two independent checks have to agree before a single byte is used:
 * Task 13's own `alignRenderedHtml()` must report `aligned`, AND this module's
 * bounded walk must reproduce the same element count and tag sequence. The
 * second exists because the first does not return attributes, so the index
 * mapping between the two walks has to be proven rather than assumed.
 */
export function harvestDataImages(
  html: string,
  elements: readonly AlignableElement[],
): DataImageSource {
  const alignment = alignRenderedHtml(html, elements);
  if (alignment.status !== "aligned") {
    return { byElementIndex: new Map(), aligned: false, failure: alignment.failure };
  }
  const harvested = harvest(html);
  if (!harvested) {
    return { byElementIndex: new Map(), aligned: false, failure: "parse-error" };
  }
  if (harvested.length !== elements.length) {
    return {
      byElementIndex: new Map(),
      aligned: false,
      failure: "harvest-count-mismatch",
    };
  }
  for (let index = 0; index < elements.length; index++) {
    if (harvested[index]!.tagName !== elements[index]!.tagName) {
      return {
        byElementIndex: new Map(),
        aligned: false,
        failure: "harvest-tag-mismatch",
      };
    }
  }
  const byElementIndex = new Map<number, string>();
  harvested.forEach((element, index) => {
    if (element.dataSrc !== undefined) byElementIndex.set(index, element.dataSrc);
  });
  return { byElementIndex, aligned: true };
}

export interface DecodedDataImage {
  mime: string;
  bytes: Buffer;
  sha256: string;
  extension: string;
}

export type DataImageRejection =
  | "not-a-data-uri"
  | "unparseable"
  | "unsafe-mime"
  | "invalid-encoding"
  | "magic-bytes-mismatch"
  | "over-size-cap";

/** Parse and validate a `data:` URI. Returns a rejection reason, never throws. */
export function decodeSafeDataImage(
  value: string,
): { ok: true; image: DecodedDataImage } | { ok: false; reason: DataImageRejection } {
  if (!value.startsWith("data:")) return { ok: false, reason: "not-a-data-uri" };
  const comma = value.indexOf(",");
  if (comma < 0) return { ok: false, reason: "unparseable" };
  const header = value.slice(5, comma);
  const payload = value.slice(comma + 1);
  const parts = header.split(";");
  const mime = (parts[0] ?? "").trim().toLowerCase();
  const isBase64 = parts.slice(1).some((part) => part.trim().toLowerCase() === "base64");
  if (!SAFE_DATA_IMAGE_MIMES.includes(mime)) return { ok: false, reason: "unsafe-mime" };

  let bytes: Buffer;
  if (isBase64) {
    const normalized = payload.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
      return { ok: false, reason: "invalid-encoding" };
    }
    bytes = Buffer.from(normalized, "base64");
    // Node's base64 decoder is lenient; round-tripping catches a truncated tail.
    if (bytes.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
      return { ok: false, reason: "invalid-encoding" };
    }
  } else {
    try {
      const decoded = decodeURIComponent(payload);
      bytes = Buffer.from(decoded, "binary");
    } catch {
      return { ok: false, reason: "invalid-encoding" };
    }
  }

  if (bytes.byteLength === 0) return { ok: false, reason: "invalid-encoding" };
  if (bytes.byteLength > MAX_DATA_IMAGE_BYTES) return { ok: false, reason: "over-size-cap" };
  if (!magicBytesMatch(mime, bytes)) return { ok: false, reason: "magic-bytes-mismatch" };

  return {
    ok: true,
    image: {
      mime,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      extension: DATA_IMAGE_EXTENSIONS[mime] ?? "bin",
    },
  };
}

/** Declared MIME must agree with what the bytes actually are (item 106). */
export function magicBytesMatch(mime: string, bytes: Buffer): boolean {
  const starts = (signature: readonly number[], offset = 0): boolean => {
    if (bytes.byteLength < offset + signature.length) return false;
    for (let index = 0; index < signature.length; index++) {
      if (bytes[offset + index] !== signature[index]) return false;
    }
    return true;
  };
  const ascii = (text: string, offset: number): boolean =>
    bytes.byteLength >= offset + text.length &&
    bytes.subarray(offset, offset + text.length).toString("latin1") === text;

  switch (mime) {
    case "image/png":
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return starts([0xff, 0xd8, 0xff]);
    case "image/gif":
      return ascii("GIF87a", 0) || ascii("GIF89a", 0);
    case "image/webp":
      return ascii("RIFF", 0) && ascii("WEBP", 8);
    case "image/avif":
      return ascii("ftyp", 4) && (ascii("avif", 8) || ascii("avis", 8));
    default:
      return false;
  }
}

/** `wr/qa-assets/<sha256>.<ext>` — content-addressed, deterministic (item 105). */
export function qaAssetFileName(image: DecodedDataImage): string {
  return `${image.sha256}.${image.extension}`;
}

export function qaAssetPublicPath(image: DecodedDataImage): string {
  return `/wr/qa-assets/${qaAssetFileName(image)}`;
}
