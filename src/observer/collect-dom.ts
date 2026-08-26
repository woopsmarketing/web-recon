/**
 * In-page DOM collection (Phase 3, hardened in Task 04).
 *
 * {@link collectPageInBrowser} runs INSIDE the rendered page via
 * `page.evaluate`. It must be fully self-contained: Playwright serializes the
 * function source and executes it in the browser, so it may reference only its
 * `config` argument and browser globals — no imports, no closure variables. All
 * tuning (whitelists, caps) is therefore passed in via {@link CollectConfig}.
 *
 * It performs a single deterministic document-order walk so that element ids,
 * links, assets, frames, and the style table all share one consistent id space
 * (`e000001`, `e000002`, …). Styles are collected inline here and deduplicated
 * into a shared table in Node (see `dedupe-styles.ts`); links/assets/frames are
 * derived from the returned data in Node.
 *
 * Read-only: this reads the DOM/CSSOM only. It never mutates the page.
 */

/** Tuning passed into the browser context (everything the walk needs). */
export interface CollectConfig {
  skipTags: readonly string[];
  attrWhitelist: readonly string[];
  styleWhitelist: readonly string[];
  pseudoStyleWhitelist: readonly string[];
  textMaxLen: number;
  attrMaxLen: number;
  /** `overflow` computed values that make an overflowing element a scroller. */
  scrollableOverflowValues: readonly string[];
  /**
   * Task 17 §7 — layout-critical properties whose AUTHORED declarations are
   * recovered from the browser's own matched rules. Empty/absent disables the
   * channel (bounded-subtree captures always skip it: a region capture is not
   * a stylesheet observation).
   */
  layoutRuleProperties?: readonly string[];
  maxLayoutRules?: number;
  maxMatchedRulesPerElement?: number;
  layoutRuleSelectorMaxLen?: number;
  layoutRuleValueMaxLen?: number;
}

/**
 * Caps for the BOUNDED SUBTREE mode (Task 16, items 69–71).
 *
 * The same walk, rooted at one element instead of `document.documentElement`,
 * so a newly-mounted interaction target is observed by the Observer's own
 * extraction logic rather than by a second miniature observer that would drift
 * from it. Whole-page recursion is structurally impossible here: the walk stops
 * at the caps and says so.
 */
export interface SubtreeCaps {
  maxElements: number;
  maxDepth: number;
  maxTextChars: number;
  /**
   * Task 17.1: per-element direct-text cap override for captures (the page
   * walk keeps the Observer's own `textMaxLen`).
   */
  perElementTextMax?: number;
  /**
   * Task 17.1: record each direct-text run's POSITION among element children
   * (`textSegments`). Only the interaction explorer's dynamic-subtree capture
   * sets this — dom.json stays byte-identical to its historical shape.
   */
  textSegments?: boolean;
}

/** Why a bounded subtree walk stopped early. Empty when it completed. */
export type SubtreeTruncation = "element-cap" | "depth-cap" | "text-cap";

/** A pseudo-element with its inline (pre-dedup) style map. */
export interface RawPseudo {
  content?: string;
  styles: Record<string, string>;
}

/** One element as collected in-browser, with inline styles (deduped in Node). */
export interface RawElement {
  id: string;
  parentId?: string;
  tagName: string;
  text?: string;
  /** Task 17.1 — see {@link SubtreeCaps.textSegments}. Capture-only. */
  textSegments?: { i: number; t: string }[];
  attributes: Record<string, string>;
  localVisible: boolean;
  effectiveVisible: boolean;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  styles: Record<string, string>;
  pseudoBefore?: RawPseudo;
  pseudoAfter?: RawPseudo;
  hasShadowRoot?: boolean;
  /** Task 17 §7 — matched layout-critical authored declarations, when any. */
  matchedLayoutRules?: {
    property: string;
    value: string;
    media?: string;
    selector: string;
    important?: boolean;
  }[];
  layoutRulesTruncated?: boolean;
  /** Present only on real scroll containers (Task 16, A2). */
  scrollState?: {
    scrollTop: number;
    scrollLeft: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
}

/** Runtime `<img>` info (properties, not attributes). */
export interface RawImageInfo {
  elementId: string;
  currentSrc?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

/** A top-level inline `<svg>` (outerHTML preserved for reconstruction). */
export interface RawInlineSvg {
  elementId: string;
  outerHTML: string;
  width?: number;
  height?: number;
}

/** An `<iframe>` inventory entry (no recursion into the frame document). */
export interface RawFrame {
  elementId: string;
  src?: string;
  resolvedUrl?: string;
  sameOrigin?: boolean;
  accessible: boolean;
  title?: string;
}

/** A favicon/icon `<link>` from the document head. */
export interface RawIcon {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
}

/** A font URL from an `@font-face` rule in a same-origin stylesheet (best-effort). */
export interface RawFontUrl {
  url: string;
  family?: string;
}

/** Environment values readable from inside the page. */
export interface RawEnvironment {
  userAgent: string;
  locale?: string;
  timezone?: string;
  colorScheme: string;
  reducedMotion: string;
  deviceScaleFactor: number;
  viewportWidth: number;
  viewportHeight: number;
}

/** Page metrics read in-browser (merged with requestedUrl/timestamp in Node). */
export interface RawMetadata {
  finalUrl: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

/** Everything the single in-page pass returns. */
export interface RawCollectResult {
  metadata: RawMetadata;
  environment: RawEnvironment;
  baseUri: string;
  elements: RawElement[];
  images: RawImageInfo[];
  inlineSvgs: RawInlineSvg[];
  frames: RawFrame[];
  shadowHostIds: string[];
  icons: RawIcon[];
  fontUrls: RawFontUrl[];
  /** Bounded-subtree mode only: which cap(s) stopped the walk. */
  truncations?: SubtreeTruncation[];
}

/** The argument object handed to {@link collectPageInBrowser}. */
export interface CollectArg {
  config: CollectConfig;
  /**
   * BOUNDED SUBTREE mode. When present the walk starts at this element instead
   * of `document.documentElement`, the caps apply, and the page-level channels
   * (metadata, environment, icons, `@font-face` URLs, frame inventory) are
   * returned empty because they describe a document, not a region.
   */
  root?: Element | null;
  caps?: SubtreeCaps;
}

/**
 * Runs in the browser. Keep it dependency-free and self-contained.
 */
export function collectPageInBrowser(arg: CollectArg): RawCollectResult {
  const { config, root: subtreeRoot, caps } = arg;
  const {
    skipTags,
    attrWhitelist,
    styleWhitelist,
    pseudoStyleWhitelist,
    textMaxLen,
    attrMaxLen,
    scrollableOverflowValues,
  } = config;
  const subtreeMode = subtreeRoot != null;
  const elementCap = caps ? caps.maxElements : Number.MAX_SAFE_INTEGER;
  const depthCap = caps ? caps.maxDepth : Number.MAX_SAFE_INTEGER;
  const textCap = caps ? caps.maxTextChars : Number.MAX_SAFE_INTEGER;
  const truncations: SubtreeTruncation[] = [];
  let textCharsUsed = 0;
  const noteTruncation = (reason: SubtreeTruncation): void => {
    if (truncations.indexOf(reason) < 0) truncations.push(reason);
  };

  const skip = new Set(skipTags);
  const attrSet = new Set(attrWhitelist);
  const scrollableOverflow = new Set(scrollableOverflowValues);
  // `value` may hold server-prefilled sensitive data on these input types.
  const sensitiveInputTypes = new Set(["password", "hidden"]);

  // --- Task 17 §7: authored layout-rule index ------------------------------
  // Built once per page from `document.styleSheets` (cross-origin sheets throw
  // on `cssRules` and are skipped — browser-observed evidence only, never a
  // fetch). Each entry holds the declarations from the closed allowlist; the
  // walk below runs `element.matches(selector)` against the index, so what is
  // recorded is exactly what the browser applies to that element.
  interface LayoutRuleEntry {
    matchSelector: string;
    selector: string;
    media?: string;
    declarations: { property: string; value: string; important?: boolean }[];
  }
  const layoutProps =
    !subtreeMode &&
    config.layoutRuleProperties &&
    config.layoutRuleProperties.length > 0
      ? config.layoutRuleProperties
      : null;
  const layoutRuleIndex: LayoutRuleEntry[] = [];
  if (layoutProps) {
    const maxRules = config.maxLayoutRules ?? 2000;
    const selectorMax = config.layoutRuleSelectorMaxLen ?? 200;
    const valueMax = config.layoutRuleValueMaxLen ?? 200;
    const visit = (rules: CSSRuleList, media: string | undefined): void => {
      for (let i = 0; i < rules.length; i++) {
        if (layoutRuleIndex.length >= maxRules) return;
        const rule = rules[i] as CSSRule & {
          selectorText?: string;
          style?: CSSStyleDeclaration;
          cssRules?: CSSRuleList;
          conditionText?: string;
        };
        if (rule.selectorText !== undefined && rule.style) {
          const declarations: LayoutRuleEntry["declarations"] = [];
          for (const property of layoutProps) {
            const value = rule.style.getPropertyValue(property);
            if (!value || value.trim() === "" || value.length > valueMax) continue;
            const important = rule.style.getPropertyPriority(property) === "important";
            declarations.push({
              property,
              value: value.trim(),
              ...(important ? { important: true } : {}),
            });
          }
          if (declarations.length > 0) {
            const selectorText = rule.selectorText;
            layoutRuleIndex.push({
              matchSelector: selectorText,
              selector:
                selectorText.length > selectorMax
                  ? selectorText.slice(0, selectorMax)
                  : selectorText,
              ...(media !== undefined ? { media } : {}),
              declarations,
            });
          }
        } else if (rule.cssRules) {
          // @media / @supports / other grouping rules: recurse, carrying the
          // media condition text (nested conditions join with " and ").
          const condition =
            rule.conditionText !== undefined && (rule as CSSRule).constructor &&
            (rule as CSSRule).type === 4 // CSSRule.MEDIA_RULE
              ? rule.conditionText
              : undefined;
          const nextMedia =
            condition !== undefined
              ? media !== undefined
                ? media + " and " + condition
                : condition
              : media;
          visit(rule.cssRules, nextMedia);
        }
      }
    };
    for (let s = 0; s < document.styleSheets.length; s++) {
      try {
        const sheetRules = document.styleSheets[s]!.cssRules;
        if (sheetRules) visit(sheetRules, undefined);
      } catch {
        // Cross-origin stylesheet: unobservable, skipped. The computed-style
        // channel still covers its effects at this viewport.
      }
    }
  }
  const maxMatchedPerElement = config.maxMatchedRulesPerElement ?? 32;

  function collectMatchedLayoutRules(el: Element): {
    matched: NonNullable<RawElement["matchedLayoutRules"]>;
    truncated: boolean;
  } {
    const matched: NonNullable<RawElement["matchedLayoutRules"]> = [];
    let truncated = false;
    for (const entry of layoutRuleIndex) {
      if (matched.length >= maxMatchedPerElement) {
        truncated = true;
        break;
      }
      let applies = false;
      try {
        applies = el.matches(entry.matchSelector);
      } catch {
        continue; // a selector the engine rejects matches nothing
      }
      if (!applies) continue;
      for (const declaration of entry.declarations) {
        if (matched.length >= maxMatchedPerElement) {
          truncated = true;
          break;
        }
        matched.push({
          property: declaration.property,
          value: declaration.value,
          ...(entry.media !== undefined ? { media: entry.media } : {}),
          selector: entry.selector,
          ...(declaration.important ? { important: true } : {}),
        });
      }
    }
    return { matched, truncated };
  }

  const round = (n: number): number => Math.round(n * 100) / 100;
  const normalizeText = (s: string): string => s.replace(/\s+/g, " ").trim();

  function collectAttributes(el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    const tag = el.tagName;
    const typeAttr = (el.getAttribute("type") || "").toLowerCase();
    for (const name of el.getAttributeNames()) {
      const keep =
        attrSet.has(name) ||
        name.startsWith("aria-") ||
        name.startsWith("data-");
      if (!keep) continue;
      if (
        name === "value" &&
        (tag === "INPUT" || tag === "TEXTAREA") &&
        sensitiveInputTypes.has(typeAttr)
      ) {
        continue;
      }
      let val = el.getAttribute(name);
      if (val == null) continue;
      if (val.length > attrMaxLen) val = val.slice(0, attrMaxLen);
      out[name] = val;
    }
    return out;
  }

  function collectStyles(
    cs: CSSStyleDeclaration,
    whitelist: readonly string[],
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const prop of whitelist) {
      const v = cs.getPropertyValue(prop);
      if (v && v.trim() !== "") out[prop] = v;
    }
    return out;
  }

  // Task 17.1: captures may raise the per-element cap — they have no
  // rendered.html recovery channel to backfill what the cap cuts.
  const elementTextMax =
    caps && caps.perElementTextMax ? caps.perElementTextMax : textMaxLen;

  function directText(el: Element): string | undefined {
    let t = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) t += node.textContent || "";
    }
    t = normalizeText(t);
    if (!t) return undefined;
    let capped = t.length > elementTextMax ? t.slice(0, elementTextMax) : t;
    // Bounded-subtree mode also has a WHOLE-SUBTREE character budget, so one
    // region can never carry a page's worth of prose into an action artifact.
    if (textCharsUsed + capped.length > textCap) {
      const remaining = Math.max(0, textCap - textCharsUsed);
      capped = capped.slice(0, remaining);
      noteTruncation("text-cap");
    }
    textCharsUsed += capped.length;
    return capped === "" ? undefined : capped;
  }

  /**
   * Read a real scroll container's offsets (Task 16, A2, item 12).
   *
   * Both conditions must hold: the content must actually overflow the client
   * box on that axis, AND the computed `overflow` for that axis must be `auto`
   * or `scroll`. `overflow: hidden` is excluded — it clips, it is not a
   * scroller a site's own `scrollIntoView` moves, and admitting it would put a
   * six-number object on tens of thousands of clipping wrappers.
   */
  function readScrollState(
    el: Element,
    cs: CSSStyleDeclaration,
  ): RawElement["scrollState"] {
    const overflowY = cs.getPropertyValue("overflow-y") || cs.getPropertyValue("overflow");
    const overflowX = cs.getPropertyValue("overflow-x") || cs.getPropertyValue("overflow");
    const scrollsY =
      el.scrollHeight > el.clientHeight && scrollableOverflow.has(overflowY.trim());
    const scrollsX =
      el.scrollWidth > el.clientWidth && scrollableOverflow.has(overflowX.trim());
    if (!scrollsY && !scrollsX) return undefined;
    return {
      scrollTop: round(el.scrollTop),
      scrollLeft: round(el.scrollLeft),
      scrollWidth: round(el.scrollWidth),
      scrollHeight: round(el.scrollHeight),
      clientWidth: round(el.clientWidth),
      clientHeight: round(el.clientHeight),
    };
  }

  /** Element-local visibility (own box only; ancestors ignored). */
  function isLocalVisible(
    el: Element,
    cs: CSSStyleDeclaration,
    rect: DOMRect,
  ): boolean {
    if (!el.isConnected) return false;
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity || "1") === 0) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  /**
   * Whether this element hard-hides its whole subtree, i.e. no descendant can
   * paint regardless of its own styles: `display:none`, `opacity:0`, or
   * `content-visibility:hidden`. (`visibility:hidden` is NOT hard — a descendant
   * may set `visibility:visible` — so it is handled per-element instead.)
   */
  function isHardHidden(cs: CSSStyleDeclaration): boolean {
    if (cs.display === "none") return true;
    if (parseFloat(cs.opacity || "1") === 0) return true;
    if (cs.getPropertyValue("content-visibility") === "hidden") return true;
    return false;
  }

  const elements: RawElement[] = [];
  const images: RawImageInfo[] = [];
  const inlineSvgs: RawInlineSvg[] = [];
  const frames: RawFrame[] = [];
  const shadowHostIds: string[] = [];
  let counter = 0;

  function walk(
    el: Element,
    parentId: string | undefined,
    ancestorHardHidden: boolean,
    depth: number,
  ): void {
    if (skip.has(el.tagName)) return;
    if (counter >= elementCap) {
      noteTruncation("element-cap");
      return;
    }
    if (depth > depthCap) {
      noteTruncation("depth-cap");
      return;
    }
    counter++;
    const id = "e" + String(counter).padStart(6, "0");
    const tagName = el.tagName.toLowerCase();

    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const localVisible = isLocalVisible(el, cs, r);
    const hardHidden = isHardHidden(cs);

    const record: RawElement = {
      id,
      tagName,
      attributes: collectAttributes(el),
      localVisible,
      effectiveVisible: localVisible && !ancestorHardHidden,
      boundingBox: {
        x: round(r.x),
        y: round(r.y),
        width: round(r.width),
        height: round(r.height),
        top: round(r.top),
        right: round(r.right),
        bottom: round(r.bottom),
        left: round(r.left),
      },
      styles: collectStyles(cs, styleWhitelist),
    };
    if (parentId) record.parentId = parentId;

    // Scroll state (Task 16, A2). `<html>` and `<body>` are excluded on purpose:
    // they ARE the top-level page scroller, the Observer captures at scroll 0,
    // and conflating the two restorations is exactly what item 21 forbids.
    if (tagName !== "html" && tagName !== "body") {
      const scrollState = readScrollState(el, cs);
      if (scrollState) record.scrollState = scrollState;
    }

    // Task 17 §7: the layout-critical authored declarations the browser itself
    // matches to this element.
    if (layoutRuleIndex.length > 0) {
      const { matched, truncated } = collectMatchedLayoutRules(el);
      if (matched.length > 0) record.matchedLayoutRules = matched;
      if (truncated) record.layoutRulesTruncated = true;
    }

    const text = directText(el);
    if (text) record.text = text;

    /*
     * Task 17.1 — direct-text position among kept element children, recorded
     * only when the caller asked for it (dynamic-subtree captures). The
     * budget is the capped `text` already charged above: segments re-slice
     * that same string, so no extra text volume can enter the artifact.
     */
    if (caps?.textSegments && text !== undefined) {
      const segments: { i: number; t: string }[] = [];
      let elementChildrenSeen = 0;
      let run = "";
      let runIndex = 0;
      const flush = (): void => {
        const normalized = normalizeText(run);
        if (normalized !== "") segments.push({ i: runIndex, t: normalized });
        run = "";
      };
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          if (run === "") runIndex = elementChildrenSeen;
          run += node.textContent || "";
        } else if (node.nodeType === 1 && !skip.has((node as Element).tagName)) {
          flush();
          elementChildrenSeen++;
        }
      }
      flush();
      // Leading-only text is the historical default; the field is evidence
      // that some run sits elsewhere, so a trivial layout stays absent.
      if (segments.length > 1 || (segments.length === 1 && segments[0]!.i > 0)) {
        // Re-apply the same total cap `directText` charged for.
        let remaining = text.length;
        const capped: { i: number; t: string }[] = [];
        for (const segment of segments) {
          if (remaining <= 0) break;
          const t = segment.t.length > remaining ? segment.t.slice(0, remaining) : segment.t;
          remaining -= t.length;
          if (t !== "") capped.push({ i: segment.i, t });
        }
        if (capped.length > 0) record.textSegments = capped;
      }
    }

    // Pseudo-elements: only when their computed `content` is renderable.
    const before = getComputedStyle(el, "::before");
    const beforeContent = before.getPropertyValue("content");
    if (beforeContent && beforeContent !== "none" && beforeContent !== "normal") {
      record.pseudoBefore = {
        content: beforeContent,
        styles: collectStyles(before, pseudoStyleWhitelist),
      };
    }
    const after = getComputedStyle(el, "::after");
    const afterContent = after.getPropertyValue("content");
    if (afterContent && afterContent !== "none" && afterContent !== "normal") {
      record.pseudoAfter = {
        content: afterContent,
        styles: collectStyles(after, pseudoStyleWhitelist),
      };
    }

    // Runtime <img> info (currentSrc / natural size are properties, not attrs).
    if (tagName === "img") {
      const img = el as HTMLImageElement;
      const info: RawImageInfo = { elementId: id };
      if (img.currentSrc) info.currentSrc = img.currentSrc;
      if (img.naturalWidth) info.naturalWidth = img.naturalWidth;
      if (img.naturalHeight) info.naturalHeight = img.naturalHeight;
      images.push(info);
    }

    // <iframe> inventory (no recursion into the frame document).
    if (tagName === "iframe") {
      const frame: RawFrame = { elementId: id, accessible: false };
      const rawSrc = el.getAttribute("src");
      if (rawSrc) frame.src = rawSrc;
      const abs = (el as HTMLIFrameElement).src;
      if (abs) {
        frame.resolvedUrl = abs;
        try {
          frame.sameOrigin = new URL(abs).origin === location.origin;
        } catch {
          /* leave sameOrigin undefined */
        }
      }
      try {
        const doc = (el as HTMLIFrameElement).contentDocument;
        if (doc) {
          frame.accessible = true;
          if (doc.title) frame.title = doc.title;
        }
      } catch {
        frame.accessible = false; // cross-origin: not probed further
      }
      frames.push(frame);
    }

    // Open shadow root inventory (closed roots are null → unobservable).
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (shadow) {
      record.hasShadowRoot = true;
      shadowHostIds.push(id);
    }

    elements.push(record);

    // Inline SVG: preserve the whole root's markup and DO NOT descend — its
    // internal elements are captured by outerHTML, so walking them would only
    // bloat dom.json (and duplicate assets).
    if (tagName === "svg") {
      const svg: RawInlineSvg = { elementId: id, outerHTML: el.outerHTML };
      if (r.width > 0) svg.width = round(r.width);
      if (r.height > 0) svg.height = round(r.height);
      inlineSvgs.push(svg);
      return;
    }

    const childHardHidden = ancestorHardHidden || hardHidden;
    for (const child of Array.from(el.children)) {
      walk(child, id, childHardHidden, depth + 1);
    }
  }

  if (subtreeMode) {
    // One region, bounded. Ancestor hard-hiding is computed from the region's
    // real ancestors so a mounted-but-hidden menu is not reported as visible.
    let ancestorHidden = false;
    for (
      let ancestor = subtreeRoot.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      if (isHardHidden(getComputedStyle(ancestor))) {
        ancestorHidden = true;
        break;
      }
    }
    walk(subtreeRoot, undefined, ancestorHidden, 0);
    return {
      metadata: {
        finalUrl: document.location.href,
        title: "",
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: 0,
        documentHeight: 0,
        scrollWidth: 0,
        scrollHeight: 0,
      },
      environment: {
        userAgent: navigator.userAgent,
        colorScheme: "light",
        reducedMotion: "no-preference",
        deviceScaleFactor: window.devicePixelRatio,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
      baseUri: document.baseURI,
      elements,
      images,
      inlineSvgs,
      frames: [],
      shadowHostIds,
      icons: [],
      fontUrls: [],
      truncations,
    };
  }

  walk(document.documentElement, undefined, false, 0);

  const icons: RawIcon[] = [];
  document.querySelectorAll("link[rel]").forEach((link) => {
    const rel = (link.getAttribute("rel") || "").toLowerCase();
    if (!rel.includes("icon")) return;
    const href = link.getAttribute("href");
    if (!href) return;
    const icon: RawIcon = { rel, href };
    const sizes = link.getAttribute("sizes");
    if (sizes) icon.sizes = sizes;
    const type = link.getAttribute("type");
    if (type) icon.type = type;
    icons.push(icon);
  });

  // Font URLs from same-origin @font-face rules. Cross-origin stylesheets throw
  // on `cssRules` access (that's expected — we skip them). Best-effort only.
  const fontUrls: RawFontUrl[] = [];
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule.constructor && rule.constructor.name !== "CSSFontFaceRule") {
        continue;
      }
      const style = (rule as CSSFontFaceRule).style;
      if (!style) continue;
      const src = style.getPropertyValue("src");
      const family = style
        .getPropertyValue("font-family")
        .replace(/['"]/g, "")
        .trim();
      let m: RegExpExecArray | null;
      urlRe.lastIndex = 0;
      while ((m = urlRe.exec(src)) !== null) {
        const entry: RawFontUrl = { url: m[2] };
        if (family) entry.family = family;
        fontUrls.push(entry);
      }
    }
  }

  const de = document.documentElement;
  const body = document.body as HTMLElement | null;
  const metadata: RawMetadata = {
    finalUrl: location.href,
    title: document.title,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: Math.max(
      de.scrollWidth,
      body ? body.scrollWidth : 0,
      de.offsetWidth,
      body ? body.offsetWidth : 0,
    ),
    documentHeight: Math.max(
      de.scrollHeight,
      body ? body.scrollHeight : 0,
      de.offsetHeight,
      body ? body.offsetHeight : 0,
    ),
    scrollWidth: de.scrollWidth,
    scrollHeight: de.scrollHeight,
  };

  const prefersDark =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
  const prefersReduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const environment: RawEnvironment = {
    userAgent: navigator.userAgent,
    colorScheme: prefersDark ? "dark" : "light",
    reducedMotion: prefersReduced ? "reduce" : "no-preference",
    deviceScaleFactor: window.devicePixelRatio,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
  if (navigator.language) environment.locale = navigator.language;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) environment.timezone = tz;
  } catch {
    /* leave timezone undefined */
  }

  return {
    metadata,
    environment,
    baseUri: document.baseURI,
    elements,
    images,
    inlineSvgs,
    frames,
    shadowHostIds,
    icons,
    fontUrls,
  };
}
