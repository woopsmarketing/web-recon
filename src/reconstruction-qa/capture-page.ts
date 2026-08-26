import type { Browser, BrowserContext, Page } from "playwright";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  SKIP_TAGS,
  STYLE_WHITELIST,
  type ViewportProfile,
} from "../observer/types.js";
import {
  ERROR_MESSAGE_MAX_LEN,
  QA_FONTS_READY_TIMEOUT_MS,
  QA_NAV_TIMEOUT_MS,
  QA_NETWORK_IDLE_TIMEOUT_MS,
  QA_RAF_COUNT,
  QA_SETTLE_MS,
  type DocumentGeometry,
} from "./types.js";

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

/** Computed properties captured per element — the Observer's own whitelist (item 46). */
export const QA_STYLE_PROPERTIES: readonly string[] = STYLE_WHITELIST;

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
 */
export async function captureScreenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: true, type: "png" });
}
