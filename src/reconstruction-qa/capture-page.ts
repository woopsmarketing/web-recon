import type { Browser, BrowserContext, Page } from "playwright";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  SKIP_TAGS,
  type ViewportProfile,
} from "../observer/types.js";
import {
  buildScreenshotCoverage,
  ERROR_MESSAGE_MAX_LEN,
  QA_FONTS_READY_TIMEOUT_MS,
  QA_NAV_TIMEOUT_MS,
  QA_NETWORK_IDLE_TIMEOUT_MS,
  QA_RAF_COUNT,
  QA_SETTLE_MS,
  type DocumentGeometry,
  type ScreenshotCoverage,
  type ScreenshotSide,
} from "./types.js";
import { readPngDimensions } from "./screenshot-diff.js";

/**
 * Page capture, shared by all three truth sources (items 18, 19, 20, 21).
 *
 * The single most important property of this file is that the ORIGINAL and the
 * CLONE are measured by the same code, in the same browser build, under the same
 * context settings, with the same load policy. A QA harness that stabilized the
 * two sides differently would manufacture differences and then attribute them,
 * which is worse than not measuring at all.
 *
 * The context settings and the load policy are Task 05's, deliberately:
 *
 *   desktop 1440×900 DPR 1 · mobile 390×844 DPR 3 touch + Android-Chrome UA
 *   locale ko-KR · timezone Asia/Seoul · colorScheme light · reducedMotion no-preference
 *   goto(load) → bounded networkidle → bounded fonts.ready → 1200 ms settle → 2 rAF
 *
 * The original's CSS animations are NOT disabled (item 21). Forcing
 * `transition: none` would be editing the page under measurement; instead the
 * caller can re-capture a bounded moment later and a page that keeps moving is
 * classified `environment-unstable` rather than blamed on the clone.
 *
 * Nothing here writes to the page. The walk reads the DOM and the CSSOM, exactly
 * like the Observer's own collector.
 */

/**
 * Computed properties captured per element — QA's OWN vocabulary (item 46,
 * rewritten by Task 28.5B change 6).
 *
 * Until 28.5B this constant was literally `= STYLE_WHITELIST`, an alias of the
 * Observer's list. That made the QA structurally incapable of its one job: a
 * property the Observer never captured was also a property the QA never read,
 * so the harness was blind in exactly the Observer's blind spots and reported
 * "no style mismatch" for differences it could not physically see. Task 28.5A
 * measured this on real pages (`docs/result/28.5-visual-reconstruction-root-
 * cause-2026-08-29.md`): `-webkit-font-smoothing`, `text-wrap-mode` and
 * `text-wrap-style` were repainting the clone's text and the QA said nothing.
 *
 * The list is therefore an INDEPENDENT literal. It deliberately shares its
 * vocabulary with the Observer — every property in `STYLE_WHITELIST` at the
 * time of writing appears below, because QA must never lose coverage — but it
 * is not derived from it, and it carries a curated tail of paint-relevant
 * properties the Observer does NOT record. Those extra properties cannot be
 * compared against a SiteSpec style token (the spec never stored them); they
 * are compared ORIGINAL-BROWSER ↔ CLONE-BROWSER by `compareCapturedStyles`
 * below, and they are reported as un-verifiable-from-spec by
 * `unverifiableFromSpecProperties` rather than silently counted as equal. That
 * is the honest degradation: spec-less does not mean difference-less.
 *
 * Two consequences are intended:
 *
 *  - The two lists may now DIVERGE, and that is the point. A QA property with
 *    no observer counterpart is a candidate observer gap; the proof suite
 *    `scripts/smoke-qa-independence.ts` asserts the divergence exists and that
 *    the Observer's whole vocabulary is still contained here.
 *  - `diffStyles` iterates the SPEC's properties, so an extra QA property never
 *    manufactures a spec mismatch and never crashes an older artifact.
 *
 * Ordering is literal and grouped, the same convention `STYLE_WHITELIST` uses;
 * nothing here is sorted at runtime, so the capture order is deterministic.
 */
export const QA_STYLE_PROPERTIES: readonly string[] = [
  // --- Layout ---------------------------------------------------------------
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "aspect-ratio",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "box-sizing",
  "overflow",
  "overflow-x",
  "overflow-y",
  // Task 28.75 MIRROR of STYLE_WHITELIST. The superset invariant
  // (`STYLE_WHITELIST ⊆ QA_STYLE_PROPERTIES`) is asserted by
  // `scripts/smoke-qa-independence.ts` AND by `scripts/smoke-multi-observer.ts`;
  // adding an observer property without mirroring it here turns both red. See
  // the observer-side note for the measured gs.severance.healthcare carousels.
  "float",
  "clear",
  "gap",
  "row-gap",
  "column-gap",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "justify-content",
  "align-items",
  "align-content",
  "align-self",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "grid-template-areas",
  "grid-area",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-auto-columns",
  "place-items",
  "place-content",
  "place-self",
  "order",
  "vertical-align",
  "list-style-type",
  "list-style-position",
  "list-style-image",
  // --- Typography -----------------------------------------------------------
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space",
  "text-overflow",
  // Task 28.75 note: `text-indent` was ALREADY here (in the typography tail
  // below, and in QA_ONLY_STYLE_PROPERTIES), so the Observer adopting it needs
  // no mirror entry — adding one made this list carry it twice and turned the
  // no-duplicates check in scripts/smoke-qa-independence.ts red. Per that
  // constant's own contract, an Observer adoption leaves
  // QA_ONLY_STYLE_PROPERTIES correct as "properties QA added on its own
  // initiative", so it is left alone.
  "overflow-wrap",
  "word-break",
  "color",
  "text-wrap-mode",
  "text-wrap-style",
  "-webkit-font-smoothing",
  // --- Media fit ------------------------------------------------------------
  "object-fit",
  "object-position",
  // --- Visual ---------------------------------------------------------------
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "box-shadow",
  "opacity",
  // --- Masking / clipping / filters / blending -------------------------------
  "clip-path",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "isolation",
  "mask-image",
  "mask-size",
  "mask-position",
  "mask-repeat",
  "-webkit-mask-image",
  "-webkit-mask-size",
  "-webkit-mask-position",
  "-webkit-mask-repeat",
  // --- Table formatting -----------------------------------------------------
  //
  // Task 28.7 regression repair. Task 28.6 W6 O5 added these five to the
  // Observer's `STYLE_WHITELIST` (`src/observer/types.ts`) and did not mirror
  // them here, which broke the 28.5B superset invariant this file's own header
  // states: "every property in `STYLE_WHITELIST` at the time of writing appears
  // below, because QA must never lose coverage". `smoke-qa-independence`
  // asserts that invariant and had been red since 28.6 — 28.6 ran no full
  // regression, so the first authoritative full regression after it is what
  // found this. QA was blind to exactly the property family 28.6 measured
  // growing hobbang.net's tables by up to +82px.
  "border-collapse",
  "border-spacing",
  "table-layout",
  "caption-side",
  "empty-cells",
  // --- Visibility -----------------------------------------------------------
  "visibility",
  "content-visibility",
  // --- Transform / behavior hints -------------------------------------------
  "transform",
  "transform-origin",
  "transition-property",
  "transition-duration",
  "transition-delay",
  "transition-timing-function",
  "animation-name",
  "animation-duration",
  "animation-delay",
  "animation-timing-function",
  "animation-iteration-count",
  "cursor",
  "pointer-events",
  "z-index",

  // ==========================================================================
  // QA-ONLY TAIL (Task 28.5B change 6)
  //
  // Paint-relevant properties the Observer does not record today. Each one can
  // change what a pixel looks like without changing a single observed value —
  // which is precisely the failure mode 28.5A found. They are listed here so
  // the QA can SEE the difference and name it, not so the QA can blame the
  // clone: an entry that keeps showing up here is evidence for an Observer
  // whitelist extension, and until that happens it is reported honestly as
  // un-verifiable against the SiteSpec.
  // ==========================================================================
  // Gradient/knockout text — the modern headline treatment. `background-image`
  // is observed, but the two properties that turn it into visible text are not,
  // so a gradient headline reconstructs as a solid-colour headline with an
  // invisible gradient behind it.
  "background-clip",
  "-webkit-background-clip",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",
  // Text painting beyond `color`.
  "text-shadow",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-underline-offset",
  "text-indent",
  "word-spacing",
  "direction",
  // Variable-font axes and OpenType features: same family, same weight
  // keyword, visibly different glyph rendering.
  "font-variation-settings",
  "font-feature-settings",
  // Focus rings and other outline painting (drawn outside the border box, so
  // no observed border property covers it).
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  // Individual transform properties. `transform` is observed; `translate` /
  // `rotate` / `scale` compose with it independently and are lost silently.
  "translate",
  "rotate",
  "scale",
  // SVG paint. The Observer records `color`, but shapes paint through these.
  "fill",
  "stroke",
  "stroke-width",
  // Remaining paint surfaces.
  "background-blend-mode",
  "border-image-source",
  "accent-color",
  "appearance",
];

/**
 * The QA-only tail, named separately for reporting (Task 28.5B change 6).
 *
 * A literal subset of `QA_STYLE_PROPERTIES`, NOT computed by subtracting the
 * Observer's list — computing it would re-introduce the coupling this change
 * removed. If the Observer later adopts one of these, this constant stays
 * correct as "properties QA added on its own initiative"; the proof suite
 * measures the live divergence against `STYLE_WHITELIST` directly.
 */
export const QA_ONLY_STYLE_PROPERTIES: readonly string[] = [
  "-webkit-background-clip",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",
  "accent-color",
  "appearance",
  "background-blend-mode",
  "background-clip",
  "border-image-source",
  "direction",
  "fill",
  "font-feature-settings",
  "font-variation-settings",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "rotate",
  "scale",
  "stroke",
  "stroke-width",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-indent",
  "text-shadow",
  "text-underline-offset",
  "translate",
  "word-spacing",
];

/** Attribute names captured per element for structure / state comparison. */
export const QA_ATTRIBUTE_NAMES: readonly string[] = [
  "alt",
  "checked",
  "colspan",
  "dir",
  "disabled",
  "for",
  "height",
  "hidden",
  "href",
  "lang",
  "name",
  "open",
  "placeholder",
  "readonly",
  "rel",
  "role",
  "rowspan",
  "scope",
  "selected",
  "src",
  "srcset",
  "target",
  "title",
  "type",
  "value",
  "width",
];

/** One captured element, from either the live original or the clone. */
export interface QaCapturedElement {
  /** Original: document-order index as a string. Clone: the SiteSpec node id. */
  key: string;
  tagName: string;
  /** Present when the element has a captured parent. */
  parentKey?: string;
  /** Clone only: the source tag a document-root wrapper stands for. */
  docTag?: string;
  /** Concatenated RAW direct text children, never trimmed (item 41). */
  rawText: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  box: { x: number; y: number; width: number; height: number };
  localVisible: boolean;
  effectiveVisible: boolean;
  /**
   * The element's ACTUAL scroll offsets at capture time (Task 16, item 89).
   *
   * Captured on every element that has a non-zero offset, on both sides, so
   * "the SiteSpec says this scroller was at 18,106px" can be compared with
   * "the clone's scroller is at N" directly instead of being inferred from the
   * geometry of its descendants.
   */
  scroll?: { top: number; left: number };
  img?: {
    hasSrc: boolean;
    src: string;
    currentSrc: string;
    complete: boolean;
    naturalWidth: number;
    naturalHeight: number;
  };
}

export interface QaRawCapture {
  url: string;
  title: string;
  documentGeometry: DocumentGeometry;
  elements: QaCapturedElement[];
  /** Raw text node values in document order (item 40's ordered sequence). */
  textSequence: string[];
  /** Clone only. Which viewport variants were visible at capture time. */
  variants?: { desktop: boolean; mobile: boolean };
  /** Clone only. `data-wr-node` values that appeared more than once. */
  duplicateNodeIds?: string[];
  /** Clone only. Computed background of the FRAMEWORK html/body (item 57). */
  canvas?: {
    html: Record<string, string>;
    body: Record<string, string>;
  };
}

interface CaptureConfig {
  skipTags: string[];
  styleProperties: string[];
  attributeNames: string[];
  /** Clone mode: only elements inside this variant are captured. */
  variantId?: string;
  backgroundProperties: string[];
}

/**
 * The in-page capture. Serialized into the browser, so every helper is declared
 * inside it and it closes over nothing but its argument.
 *
 * Two modes in one function on purpose: the original walk and the clone walk
 * must produce identical record shapes, and two functions would drift.
 */
export function captureInBrowser(config: CaptureConfig): QaRawCapture {
  const skip = new Set(config.skipTags);
  const styleProperties = config.styleProperties;
  const attributeNames = config.attributeNames;

  const round = (n: number): number => Math.round(n * 100) / 100;

  const readStyle = (cs: CSSStyleDeclaration): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const name of styleProperties) {
      const value = cs.getPropertyValue(name);
      if (value && value.trim() !== "") out[name] = value;
    }
    return out;
  };

  const readAttributes = (el: Element): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const name of attributeNames) {
      const value = el.getAttribute(name);
      if (value !== null) out[name] = value;
    }
    for (const attribute of Array.from(el.attributes)) {
      if (attribute.name.indexOf("aria-") === 0 && out[attribute.name] === undefined) {
        out[attribute.name] = attribute.value;
      }
    }
    return out;
  };

  const rawDirectText = (el: Element): string => {
    let text = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) text += node.textContent || "";
    }
    return text;
  };

  const isLocalVisible = (el: Element, cs: CSSStyleDeclaration, rect: DOMRect): boolean => {
    if (!el.isConnected) return false;
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity || "1") === 0) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  };

  const isHardHidden = (cs: CSSStyleDeclaration): boolean => {
    if (cs.display === "none") return true;
    if (parseFloat(cs.opacity || "1") === 0) return true;
    if (cs.getPropertyValue("content-visibility") === "hidden") return true;
    return false;
  };

  const imgInfo = (el: Element): QaCapturedElement["img"] => {
    const img = el as HTMLImageElement;
    return {
      hasSrc: el.hasAttribute("src") || el.hasAttribute("srcset"),
      src: img.getAttribute("src") || "",
      currentSrc: img.currentSrc || "",
      complete: img.complete === true,
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
    };
  };

  const elements: QaCapturedElement[] = [];
  const textSequence: string[] = [];
  const duplicateNodeIds: string[] = [];

  const describe = (
    el: Element,
    key: string,
    parentKey: string | undefined,
    ancestorHardHidden: boolean,
  ): { record: QaCapturedElement; hardHidden: boolean } => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const localVisible = isLocalVisible(el, cs, rect);
    const hardHidden = isHardHidden(cs);
    const tagName = el.tagName.toLowerCase();
    const record: QaCapturedElement = {
      key,
      tagName,
      rawText: rawDirectText(el),
      attributes: readAttributes(el),
      style: readStyle(cs),
      box: {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
      },
      localVisible,
      effectiveVisible: localVisible && !ancestorHardHidden,
    };
    if (parentKey !== undefined) record.parentKey = parentKey;
    // Only a non-zero offset is recorded: every element reports 0/0 and storing
    // that on 87,191 nodes would be pure noise (Task 16).
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      record.scroll = { top: round(el.scrollTop), left: round(el.scrollLeft) };
    }
    if (tagName === "img") record.img = imgInfo(el);
    const docTag = el.getAttribute("data-wr-doc-tag");
    if (docTag !== null) record.docTag = docTag;
    return { record, hardHidden };
  };

  const collectTextNodes = (root: Node): void => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !skip.has(parent.tagName)) {
        const value = node.textContent || "";
        if (value !== "") textSequence.push(value);
      }
      node = walker.nextNode();
    }
  };

  if (config.variantId === undefined) {
    // --- ORIGINAL: the Observer's own document-order walk -------------------
    let counter = 0;
    const walk = (el: Element, parentKey: string | undefined, ancestorHardHidden: boolean): void => {
      if (skip.has(el.tagName)) return;
      const key = String(counter);
      counter++;
      const { record, hardHidden } = describe(el, key, parentKey, ancestorHardHidden);
      elements.push(record);
      // Inline SVG is one opaque node upstream, so it is one opaque node here.
      if (record.tagName === "svg") return;
      const childHardHidden = ancestorHardHidden || hardHidden;
      for (const child of Array.from(el.children)) {
        walk(child, key, childHardHidden);
      }
    };
    walk(document.documentElement, undefined, false);
    collectTextNodes(document.documentElement);
  } else {
    // --- CLONE: only the ACTIVE viewport variant (items 38, 39) -------------
    const variants = Array.from(document.querySelectorAll("[data-wr-viewport]"));
    let root: Element | null = null;
    for (const variant of variants) {
      if (variant.getAttribute("data-wr-viewport") === config.variantId) {
        root = variant;
        break;
      }
    }
    if (root) {
      const byId = new Map<string, Element>();
      const nodes = Array.from(root.querySelectorAll("[data-wr-node]"));
      for (const node of nodes) {
        const id = node.getAttribute("data-wr-node") || "";
        if (id === "") continue;
        if (byId.has(id)) {
          if (duplicateNodeIds.indexOf(id) < 0) duplicateNodeIds.push(id);
          continue;
        }
        byId.set(id, node);
      }
      for (const [id, node] of byId) {
        // The nearest ANNOTATED ancestor, which is the SiteSpec parent whenever
        // the parent was itself emitted (a `wr-svg-host` span is not).
        let parentKey: string | undefined;
        let cursor: Element | null = node.parentElement;
        while (cursor && cursor !== root) {
          const candidate = cursor.getAttribute("data-wr-node");
          if (candidate !== null && candidate !== "" && byId.get(candidate) === cursor) {
            parentKey = candidate;
            break;
          }
          cursor = cursor.parentElement;
        }
        let ancestorHardHidden = false;
        let up: Element | null = node.parentElement;
        while (up && up !== root) {
          if (isHardHidden(getComputedStyle(up))) {
            ancestorHardHidden = true;
            break;
          }
          up = up.parentElement;
        }
        const { record } = describe(node, id, parentKey, ancestorHardHidden);
        elements.push(record);
      }
      elements.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      collectTextNodes(root);
    }
  }

  const documentElement = document.documentElement;
  const body = document.body;
  const result: QaRawCapture = {
    url: document.location.href,
    title: document.title,
    documentGeometry: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: round(documentElement.getBoundingClientRect().width),
      documentHeight: round(documentElement.getBoundingClientRect().height),
      scrollWidth: documentElement.scrollWidth,
      scrollHeight: documentElement.scrollHeight,
    },
    elements,
    textSequence,
  };

  if (config.variantId !== undefined) {
    const isVariantVisible = (id: string): boolean => {
      const nodes = Array.from(document.querySelectorAll('[data-wr-viewport="' + id + '"]'));
      for (const node of nodes) {
        if (getComputedStyle(node).display !== "none") return true;
      }
      return false;
    };
    result.variants = {
      desktop: isVariantVisible("desktop"),
      mobile: isVariantVisible("mobile"),
    };
    result.duplicateNodeIds = duplicateNodeIds.sort();
    const readBackground = (el: Element | null): Record<string, string> => {
      if (!el) return {};
      const cs = getComputedStyle(el);
      const out: Record<string, string> = {};
      for (const name of config.backgroundProperties) {
        const value = cs.getPropertyValue(name);
        if (value && value.trim() !== "") out[name] = value;
      }
      return out;
    };
    result.canvas = {
      html: readBackground(documentElement),
      body: readBackground(body),
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Node-side driving
// ---------------------------------------------------------------------------

/** Diagnostics collected from the page while it loads. */
export interface PageDiagnostics {
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  failedResources: string[];
  /** Response statuses ≥ 400 or aborted requests, `status url` form. */
  resourceFailures: Array<{ url: string; status: number; reason: string }>;
  hydrationErrors: number;
  navigations: string[];
}

function shortMessage(text: string): string {
  const firstLine = text.split("\n", 1)[0]!.trim();
  return firstLine.length > ERROR_MESSAGE_MAX_LEN
    ? `${firstLine.slice(0, ERROR_MESSAGE_MAX_LEN)}…`
    : firstLine;
}

/** `origin + pathname` — never a query string in an artifact. */
function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

/** Attach console / pageerror / response listeners. Returns the collector. */
export function attachDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedResources: [],
    resourceFailures: [],
    hydrationErrors: 0,
    navigations: [],
  };
  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    const text = shortMessage(message.text());
    if (type === "error") {
      diagnostics.consoleErrors.push(text);
      if (/hydrat/i.test(text)) diagnostics.hydrationErrors++;
    } else {
      diagnostics.consoleWarnings.push(text);
    }
  });
  page.on("pageerror", (error) => {
    const text = shortMessage(error.message);
    diagnostics.pageErrors.push(text);
    if (/hydrat/i.test(text)) diagnostics.hydrationErrors++;
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    diagnostics.failedResources.push(safeUrl(request.url()));
    diagnostics.resourceFailures.push({
      url: safeUrl(request.url()),
      status: 0,
      reason: failure?.errorText ?? "request-failed",
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    diagnostics.failedResources.push(safeUrl(response.url()));
    diagnostics.resourceFailures.push({
      url: safeUrl(response.url()),
      status,
      reason: `http-${status}`,
    });
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) diagnostics.navigations.push(safeUrl(frame.url()));
  });
  return diagnostics;
}

/** A fresh, anonymous context in the Task 05 environment (items 8, 18). */
export async function newQaContext(
  browser: Browser,
  profile: ViewportProfile,
  options: { widthOverride?: number } = {},
): Promise<BrowserContext> {
  const width = options.widthOverride ?? profile.width;
  const context = await browser.newContext({
    viewport: { width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: OBSERVATION_REDUCED_MOTION as "no-preference",
    // Nothing this Task does may ever write a file (item 8).
    acceptDownloads: false,
  });
  // tsx/esbuild `keepNames` leaks a `__name` helper into every serialized
  // function; the same shim the Observer and the Explorer install.
  await context.addInitScript(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
  return context;
}

/** load → bounded networkidle → bounded fonts.ready → settle → 2 rAF (item 20). */
export async function stabilize(page: Page): Promise<{
  networkIdleReached: boolean;
  fontsReadyReached: boolean;
}> {
  let networkIdleReached = false;
  try {
    await page.waitForLoadState("networkidle", { timeout: QA_NETWORK_IDLE_TIMEOUT_MS });
    networkIdleReached = true;
  } catch {
    // Bounded on purpose: many sites never truly idle.
  }
  let fontsReadyReached = false;
  try {
    fontsReadyReached = await page.evaluate((ms) => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (!fonts || !fonts.ready) return Promise.resolve(true);
      return Promise.race([
        fonts.ready.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
      ]);
    }, QA_FONTS_READY_TIMEOUT_MS);
  } catch {
    fontsReadyReached = false;
  }
  await page.waitForTimeout(QA_SETTLE_MS);
  try {
    await page.evaluate((count: number) => {
      return new Promise<void>((resolve) => {
        let remaining = count;
        const tick = (): void => {
          remaining--;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, QA_RAF_COUNT);
  } catch {
    // A page that tore down its execution context still has a usable settle.
  }
  return { networkIdleReached, fontsReadyReached };
}

/** Navigate with the Observer's own timeout and wait condition. */
export async function gotoQa(page: Page, url: string): Promise<string> {
  const response = await page.goto(url, {
    waitUntil: "load",
    timeout: QA_NAV_TIMEOUT_MS,
  });
  return response?.url() ?? page.url();
}

/** Run the in-page capture. `variantId` switches to clone mode. */
export async function runCapture(
  page: Page,
  variantId?: "desktop" | "mobile",
): Promise<QaRawCapture> {
  return page.evaluate(captureInBrowser, {
    skipTags: [...SKIP_TAGS],
    styleProperties: [...QA_STYLE_PROPERTIES],
    attributeNames: [...QA_ATTRIBUTE_NAMES],
    ...(variantId !== undefined ? { variantId } : {}),
    backgroundProperties: [
      "background-attachment",
      "background-color",
      "background-image",
      "background-position",
      "background-repeat",
      "background-size",
    ],
  });
}

/**
 * The screenshot policy, copied from the Observer (items 26, 27).
 *
 * `fullPage: true`, PNG, no clip, no animation freezing, no `caret` or `mask`
 * options — because that is exactly what produced the saved snapshot the clone
 * is being compared against.
 *
 * ## Why this returns a coverage record and not just a Buffer (Task 28.6, C5)
 *
 * A full-page screenshot is the ONLY input to every pixel metric in this Task,
 * and it has two failure modes that used to be invisible:
 *
 *  1. The driver refuses a document taller than
 *     {@link SCREENSHOT_DEVICE_DIMENSION_CAP} device px. Before this, that
 *     exception escaped to `captureOriginal`/`captureClone`'s outer catch, which
 *     threw away a perfectly good DOM capture and reported the page as a LOAD
 *     ERROR — the clone had loaded fine; only the screenshot was too tall.
 *  2. A browser that CLIPS instead of refusing returns a short PNG, and every
 *     downstream number is then computed over the part that survived while
 *     reading exactly like a whole-page result.
 *
 * So the document is measured first, the PNG that comes back is measured
 * against it (from its IHDR, so this costs no decode), and the difference is
 * reported. `buffer` is absent when nothing was captured; `coverage` is always
 * present and always says how much of the page the caller is allowed to speak
 * for. Nothing here throws for a screenshot problem.
 *
 * Measured on 2026-09-03, darwin + playwright 1.62.1: no clipping at 1440x40000,
 * 1440x200000 or 1170x180000 device px, so on this platform `truncated` is
 * expected to be false and the record is a standing proof of that rather than a
 * silence. See {@link SCREENSHOT_DEVICE_DIMENSION_CAP} for the off-darwin case.
 */
export interface ScreenshotCapture {
  /** Absent when the capture failed; `coverage.reason` says why. */
  buffer?: Buffer;
  coverage: ScreenshotCoverage;
}

export async function captureScreenshot(
  page: Page,
  side: ScreenshotSide,
): Promise<ScreenshotCapture> {
  let documentHeightCss = 0;
  let documentWidthCss = 0;
  let deviceScaleFactor = 1;
  let measureError: string | undefined;
  try {
    const measured = await page.evaluate(() => ({
      height: Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.getBoundingClientRect().height,
      ),
      width: Math.max(
        document.documentElement.scrollWidth,
        document.documentElement.getBoundingClientRect().width,
      ),
      dpr: window.devicePixelRatio,
    }));
    documentHeightCss = measured.height;
    documentWidthCss = measured.width;
    deviceScaleFactor = measured.dpr;
  } catch (err) {
    // The document could not be measured, so coverage cannot be claimed either.
    // Recorded rather than assumed complete.
    measureError = `document not measurable: ${
      err instanceof Error ? err.message.split("\n", 1)[0] : String(err)
    }`;
  }

  let buffer: Buffer | undefined;
  let reason = measureError;
  try {
    buffer = await page.screenshot({ fullPage: true, type: "png" });
  } catch (err) {
    reason = `screenshot failed: ${
      err instanceof Error ? err.message.split("\n", 1)[0] : String(err)
    }`;
  }

  const dimensions = buffer ? readPngDimensions(buffer) : undefined;
  if (buffer && !dimensions) {
    reason = reason ?? "screenshot bytes are not a readable PNG";
  }
  const coverage = buildScreenshotCoverage({
    side,
    // The one fact that makes every fraction below readable. `measureError` is
    // set exactly when the `page.evaluate` above threw, so a document we could
    // not measure is reported as unknown rather than as a page of height 0 that
    // we confidently covered none of.
    documentMeasured: measureError === undefined,
    documentHeightCss,
    documentWidthCss,
    deviceScaleFactor,
    ...(dimensions ? { captured: dimensions } : {}),
    ...(reason !== undefined ? { reason } : {}),
  });
  if (coverage.truncated && coverage.captured && coverage.reason === undefined) {
    const shortfalls: string[] = [];
    if (coverage.truncatedDeviceRows > 0) {
      shortfalls.push(
        `${coverage.capturedDeviceHeight} of ${coverage.expectedDeviceHeight} device rows`,
      );
    }
    if (coverage.truncatedDeviceColumns > 0) {
      shortfalls.push(
        `${coverage.capturedDeviceWidth} of ${coverage.expectedDeviceWidth} device columns`,
      );
    }
    coverage.reason = `captured ${shortfalls.join(" and ")}`;
  }
  return { ...(buffer ? { buffer } : {}), coverage };
}

// ---------------------------------------------------------------------------
// Browser-to-browser style comparison (Task 28.5B change 6)
// ---------------------------------------------------------------------------

/**
 * `diffStyles` compares a capture against the SiteSpec's stored style token, so
 * it can only ever see properties the OBSERVER wrote down. Every property in
 * the QA-only tail above is invisible to it — not because the two pages agree,
 * but because there is nothing to agree with.
 *
 * These two helpers are the honest alternative:
 *
 *   `unverifiableFromSpecProperties`  names what the spec cannot adjudicate,
 *                                     so a report can say "un-verifiable"
 *                                     instead of implying "equal".
 *   `compareCapturedStyles`           compares two LIVE captures directly.
 *                                     Original browser vs clone browser needs
 *                                     no observer data at all, so the QA-only
 *                                     tail is fully verifiable on that axis.
 *
 * Both are pure functions over capture records; neither touches a browser.
 */

/** QA properties the SiteSpec vocabulary cannot adjudicate. Sorted. */
export function unverifiableFromSpecProperties(
  specProperties: Iterable<string>,
  qaProperties: readonly string[] = QA_STYLE_PROPERTIES,
): string[] {
  const spec = new Set(specProperties);
  return qaProperties.filter((property) => !spec.has(property)).sort();
}

export interface CapturedStyleMismatch {
  /** Capture key — document-order index (original walk) or node id (clone walk). */
  key: string;
  tagName: string;
  property: string;
  a: string;
  b: string;
}

export interface CapturedStyleComparison {
  comparedElements: number;
  comparedProperties: number;
  mismatches: CapturedStyleMismatch[];
  /** Non-zero per-property mismatch counts, sorted by property. */
  byProperty: Record<string, number>;
  /** Keys present on exactly one side — a structural difference, not a style one. */
  unmatchedKeys: string[];
  /** Keys whose two sides are different elements; their styles are NOT compared. */
  tagMismatchKeys: string[];
  /** Properties one side reported and the other did not (engine/UA difference). */
  oneSidedProperties: string[];
}

export interface CompareCapturedStylesOptions {
  /** Restrict the comparison to this vocabulary. Default: everything captured. */
  properties?: readonly string[];
  /** Cap on retained mismatch records; counts are never capped. */
  maxMismatches?: number;
}

/**
 * Compare two captures property-by-property, EXACT string equality.
 *
 * Defensible for the same reason `style-diff.ts` gives: both sides were
 * serialized by the same Chromium build, so `rgb(17, 24, 39)` vs `#111827`
 * cannot occur. No tolerance, no threshold — a caller that wants the layout
 * quantum tolerance can apply `isSubLayoutUnitDifference` to the output.
 */
export function compareCapturedStyles(
  a: QaRawCapture,
  b: QaRawCapture,
  options: CompareCapturedStylesOptions = {},
): CapturedStyleComparison {
  const limit = options.maxMismatches ?? 500;
  const vocabulary = options.properties ? new Set(options.properties) : undefined;
  const byKeyB = new Map(b.elements.map((element) => [element.key, element]));
  const seenB = new Set<string>();
  const mismatches: CapturedStyleMismatch[] = [];
  const byProperty: Record<string, number> = {};
  const unmatchedKeys: string[] = [];
  const tagMismatchKeys: string[] = [];
  const oneSided = new Set<string>();
  let comparedElements = 0;
  let comparedProperties = 0;

  for (const elementA of a.elements) {
    const elementB = byKeyB.get(elementA.key);
    if (!elementB) {
      unmatchedKeys.push(elementA.key);
      continue;
    }
    seenB.add(elementA.key);
    if (elementA.tagName !== elementB.tagName) {
      tagMismatchKeys.push(elementA.key);
      continue;
    }
    comparedElements++;
    const properties = new Set([
      ...Object.keys(elementA.style),
      ...Object.keys(elementB.style),
    ]);
    for (const property of [...properties].sort()) {
      if (vocabulary && !vocabulary.has(property)) continue;
      const valueA = elementA.style[property];
      const valueB = elementB.style[property];
      if (valueA === undefined || valueB === undefined) {
        oneSided.add(property);
        continue;
      }
      comparedProperties++;
      if (valueA === valueB) continue;
      byProperty[property] = (byProperty[property] ?? 0) + 1;
      if (mismatches.length < limit) {
        mismatches.push({
          key: elementA.key,
          tagName: elementA.tagName,
          property,
          a: valueA,
          b: valueB,
        });
      }
    }
  }
  // Keys the `b` side has and the `a` side never presented.
  for (const element of b.elements) {
    if (!seenB.has(element.key)) unmatchedKeys.push(element.key);
  }

  const sortedByProperty: Record<string, number> = {};
  for (const property of Object.keys(byProperty).sort()) {
    sortedByProperty[property] = byProperty[property]!;
  }
  return {
    comparedElements,
    comparedProperties,
    mismatches,
    byProperty: sortedByProperty,
    unmatchedKeys: [...new Set(unmatchedKeys)].sort(),
    tagMismatchKeys: tagMismatchKeys.sort(),
    oneSidedProperties: [...oneSided].sort(),
  };
}
