/**
 * The IN-PAGE inventory pass of the Source Package (serialized into the page by
 * `page.evaluate`; every helper must live INSIDE the exported function and it
 * must reference no module-scope symbol).
 *
 * It reads what the browser has: `document.styleSheets` (with per-sheet CSSOM
 * counts and, for runtime style tags, the CSSOM-serialized rule text),
 * `document.scripts`, `<link>` relations, images/picture sources, background /
 * mask image URLs, media elements, iframes, inline/external SVG, `@font-face`
 * rules, `document.fonts`, page-delivered config blobs and an allowlist of
 * window globals. Everything is bounded by the caps in `arg` and every cap hit
 * is reported, never silent.
 *
 * NOTHING here resolves an authored value to pixels. CSSOM serialization is a
 * parser normalization (colors, shorthands, whitespace), not a layout result:
 * `width: calc(100% - 40px)` stays `calc(100% - 40px)`.
 */

export interface SourceInventoryArg {
  maxInventoryEntries: number;
  maxElementsWalked: number;
  maxRulesPerSheet: number;
  maxInlineTextBytes: number;
  maxMediaConditions: number;
  windowGlobals: string[];
  /** Regex SOURCE for config-key redaction (compiled in the page). */
  sensitiveConfigKeyPattern: string;
}

export interface RawCssomSummary {
  readable: boolean;
  error?: string;
  ruleCount?: number;
  styleRules?: number;
  mediaRules?: number;
  containerRules?: number;
  supportsRules?: number;
  layerRules?: number;
  importRules?: number;
  fontFaceRules?: number;
  keyframesRules?: number;
  customPropertyDeclarations?: number;
  mediaConditions?: string[];
  layerNames?: string[];
  walkCapHit?: boolean;
}

export interface RawFontFace {
  family: string;
  src: string;
  unicodeRange?: string;
  display?: string;
  weight?: string;
  style?: string;
  sheetHref: string | null;
}

export interface RawSheet {
  index: number;
  ownerTag: "link" | "style" | null;
  href: string | null;
  mediaText: string;
  mediaAttr?: string;
  title?: string;
  disabled: boolean;
  ownerAttributes?: Record<string, string>;
  runtimeMarkers: string[];
  textContent?: string;
  textBytes?: number;
  textSkippedBySize?: boolean;
  cssom: RawCssomSummary;
  cssomText?: string;
  cssomTextBytes?: number;
  cssomTextSkippedBySize?: boolean;
  importHrefs: string[];
  fontFaces: RawFontFace[];
}

export interface RawScriptEl {
  order: number;
  src: string | null;
  srcAttr: string | null;
  typeAttr: string | null;
  async: boolean;
  defer: boolean;
  nomodule: boolean;
  crossorigin: string | null;
  integrity: string | null;
  referrerpolicy: string | null;
  nonceUsed: boolean;
  id: string | null;
  inHead: boolean;
  dataAttributes?: Record<string, string>;
  text?: string;
  textBytes: number;
  textSkippedBySize?: boolean;
}

export interface RawLinkEl {
  order: number;
  rel: string;
  href: string | null;
  as: string | null;
  type: string | null;
  media: string | null;
  crossorigin: string | null;
  sizes: string | null;
  integrity: string | null;
}

export interface RawSourceEl {
  srcset: string | null;
  src: string | null;
  sizes: string | null;
  type: string | null;
  media: string | null;
}

export interface RawImageEl {
  path: string;
  src: string | null;
  currentSrc: string;
  srcset: string | null;
  sizes: string | null;
  loading: string | null;
  decoding: string | null;
  fetchpriority: string | null;
  width: string | null;
  height: string | null;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  pictureSources: RawSourceEl[];
}

export interface RawCssImage {
  path: string;
  property: "background-image" | "mask-image";
  urls: string[];
}

export interface RawMediaEl {
  path: string;
  tag: "video" | "audio";
  src: string | null;
  currentSrc: string;
  poster: string | null;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  playsinline: boolean;
  controls: boolean;
  preload: string | null;
  width: string | null;
  height: string | null;
  sources: RawSourceEl[];
}

export interface RawFrameEl {
  path: string;
  src: string | null;
  srcdocBytes?: number;
  loading: string | null;
  allow: string | null;
  sandbox: string | null;
  referrerpolicy: string | null;
  width: string | null;
  height: string | null;
}

export interface RawSvgInventory {
  inlineCount: number;
  inlineBytes: number;
  uses: { path: string; href: string }[];
  objects: { path: string; tag: string; url: string; type: string | null }[];
}

export interface RawDataScript {
  order: number;
  id: string | null;
  typeAttr: string;
  inHead: boolean;
  text?: string;
  textBytes: number;
  textSkippedBySize?: boolean;
}

export interface RawWindowGlobal {
  name: string;
  valueType: string;
  json?: string;
  bytes: number;
  skippedBySize?: boolean;
  serializable: boolean;
  redactedKeys: string[];
}

export interface RawSourceInventory {
  finalUrl: string;
  origin: string;
  baseURI: string;
  baseHref: string | null;
  metaGenerator: string | null;
  htmlAttributes: Record<string, string>;
  bodyAttributes: Record<string, string>;
  tagNames: string[];
  sheets: RawSheet[];
  adoptedSheetCount: number;
  scripts: RawScriptEl[];
  dataScripts: RawDataScript[];
  links: RawLinkEl[];
  images: RawImageEl[];
  cssImages: RawCssImage[];
  media: RawMediaEl[];
  frames: RawFrameEl[];
  svg: RawSvgInventory;
  windowGlobals: RawWindowGlobal[];
  fontsLoaded: { family: string; status: string; weight: string; style: string }[];
  caps: {
    elementsWalked: number;
    elementWalkCapHit: boolean;
    inventoryCapHits: string[];
    inlineTextBytes: number;
    /** Open shadow roots on host elements within the walk (their trees are not captured). */
    shadowRoots: number;
  };
}

export function collectSourceInventoryInBrowser(arg: SourceInventoryArg): RawSourceInventory {
  const encoder = new TextEncoder();
  const byteLen = (s: string): number => encoder.encode(s).length;
  const capHits: string[] = [];
  let inlineTextBytes = 0;
  const sensitiveKey = new RegExp(arg.sensitiveConfigKeyPattern, "i");

  const attr = (el: Element, name: string): string | null => {
    const v = el.getAttribute(name);
    return v === null ? null : v.slice(0, 2000);
  };
  const resolve = (raw: string | null): string | null => {
    if (raw === null) return null;
    const t = raw.trim();
    if (t === "") return null;
    try {
      return new URL(t, document.baseURI).href;
    } catch {
      return t;
    }
  };
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && depth < 64) {
      const parent: Element | null = cur.parentElement;
      if (!parent) {
        parts.push(cur.tagName.toLowerCase());
        break;
      }
      const idx = Array.prototype.indexOf.call(parent.children, cur);
      parts.push(`${cur.tagName.toLowerCase()}[${idx}]`);
      cur = parent;
      depth++;
    }
    return parts.reverse().join(">");
  };
  const attributesOf = (el: Element, max = 32): Record<string, string> => {
    const out: Record<string, string> = {};
    const names = el.getAttributeNames().slice(0, max);
    for (const name of names) {
      if (name === "nonce") {
        out[name] = "[present]";
        continue;
      }
      out[name] = (el.getAttribute(name) ?? "").slice(0, 200);
    }
    return out;
  };
  const dataAttributesOf = (el: Element): Record<string, string> | undefined => {
    const out: Record<string, string> = {};
    let n = 0;
    for (const name of el.getAttributeNames()) {
      if (!name.startsWith("data-")) continue;
      out[name] = (el.getAttribute(name) ?? "").slice(0, 200);
      n++;
      if (n >= 32) break;
    }
    return n > 0 ? out : undefined;
  };
  const boundedText = (
    text: string,
  ): { text?: string; bytes: number; skipped: boolean } => {
    const bytes = byteLen(text);
    if (bytes > arg.maxInlineTextBytes) return { bytes, skipped: true };
    inlineTextBytes += bytes;
    return { text, bytes, skipped: false };
  };

  /* ---- stylesheets ---------------------------------------------------- */
  const RUNTIME_MARKER_NAMES = [
    "data-emotion",
    "data-styled",
    "data-styled-version",
    "data-s",
    "data-jss",
    "data-meta",
    "data-href",
    "data-n-href",
    "data-n-p",
    "data-precedence",
    "data-vite-dev-id",
    "data-sc-",
    "data-css-hash",
    "data-tailwind",
  ];

  const walkRules = (
    rules: CSSRuleList,
    summary: RawCssomSummary,
    state: { walked: number; conditions: Set<string>; layers: string[]; imports: string[]; fontFaces: RawFontFace[]; sheetHref: string | null },
  ): void => {
    for (let i = 0; i < rules.length; i++) {
      if (state.walked >= arg.maxRulesPerSheet) {
        summary.walkCapHit = true;
        return;
      }
      state.walked++;
      const rule = rules[i]!;
      const ctor = (rule.constructor && rule.constructor.name) || "";
      summary.ruleCount = (summary.ruleCount ?? 0) + 1;
      if (ctor === "CSSStyleRule") {
        summary.styleRules = (summary.styleRules ?? 0) + 1;
        const style = (rule as CSSStyleRule).style;
        for (let p = 0; p < style.length; p++) {
          if (style.item(p).startsWith("--")) {
            summary.customPropertyDeclarations = (summary.customPropertyDeclarations ?? 0) + 1;
          }
        }
        const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
        if (nested && nested.length > 0) walkRules(nested, summary, state);
        continue;
      }
      if (ctor === "CSSMediaRule") {
        summary.mediaRules = (summary.mediaRules ?? 0) + 1;
        const text = (rule as CSSMediaRule).media.mediaText;
        if (text && state.conditions.size < arg.maxMediaConditions) state.conditions.add(text);
        walkRules((rule as CSSMediaRule).cssRules, summary, state);
        continue;
      }
      if (ctor === "CSSContainerRule") {
        summary.containerRules = (summary.containerRules ?? 0) + 1;
        walkRules((rule as unknown as CSSGroupingRule).cssRules, summary, state);
        continue;
      }
      if (ctor === "CSSSupportsRule") {
        summary.supportsRules = (summary.supportsRules ?? 0) + 1;
        walkRules((rule as CSSSupportsRule).cssRules, summary, state);
        continue;
      }
      if (ctor === "CSSLayerBlockRule" || ctor === "CSSLayerStatementRule") {
        summary.layerRules = (summary.layerRules ?? 0) + 1;
        const r = rule as unknown as { name?: string; nameList?: string[]; cssRules?: CSSRuleList };
        const names = r.nameList ? r.nameList : r.name !== undefined ? [r.name] : [];
        for (const n of names) if (n !== undefined && state.layers.indexOf(n) < 0 && state.layers.length < 64) state.layers.push(n);
        if (r.cssRules) walkRules(r.cssRules, summary, state);
        continue;
      }
      if (ctor === "CSSImportRule") {
        summary.importRules = (summary.importRules ?? 0) + 1;
        const href = (rule as CSSImportRule).href;
        if (href) {
          let abs = href;
          try {
            abs = new URL(href, state.sheetHref ?? document.baseURI).href;
          } catch {
            /* keep raw */
          }
          if (state.imports.indexOf(abs) < 0) state.imports.push(abs);
        }
        // The imported sheet's rules are walked when it appears in document.styleSheets? No —
        // imported sheets are NOT listed there; walk them here (same CORS rule applies).
        let imported: CSSStyleSheet | null = null;
        try {
          imported = (rule as CSSImportRule).styleSheet;
        } catch {
          imported = null;
        }
        if (imported) {
          let importedRules: CSSRuleList | null = null;
          try {
            importedRules = imported.cssRules;
          } catch {
            importedRules = null;
          }
          if (importedRules) {
            const prevHref = state.sheetHref;
            state.sheetHref = imported.href ?? prevHref;
            walkRules(importedRules, summary, state);
            state.sheetHref = prevHref;
          }
        }
        continue;
      }
      if (ctor === "CSSFontFaceRule") {
        summary.fontFaceRules = (summary.fontFaceRules ?? 0) + 1;
        const style = (rule as CSSFontFaceRule).style;
        const src = style.getPropertyValue("src");
        const family = style.getPropertyValue("font-family");
        if (src && state.fontFaces.length < arg.maxInventoryEntries) {
          const face: RawFontFace = {
            family: family.trim(),
            src: src.slice(0, 4000),
            sheetHref: state.sheetHref,
          };
          const ur = style.getPropertyValue("unicode-range");
          const disp = style.getPropertyValue("font-display");
          const w = style.getPropertyValue("font-weight");
          const st = style.getPropertyValue("font-style");
          if (ur) face.unicodeRange = ur.slice(0, 500);
          if (disp) face.display = disp;
          if (w) face.weight = w;
          if (st) face.style = st;
          state.fontFaces.push(face);
        }
        continue;
      }
      if (ctor === "CSSKeyframesRule") {
        summary.keyframesRules = (summary.keyframesRules ?? 0) + 1;
        continue;
      }
      const nested = (rule as unknown as { cssRules?: CSSRuleList }).cssRules;
      if (nested && nested.length > 0) walkRules(nested, summary, state);
    }
  };

  const serializeRules = (sheet: CSSStyleSheet): string => {
    const parts: string[] = [];
    const rules = sheet.cssRules;
    for (let i = 0; i < rules.length && i < arg.maxRulesPerSheet; i++) parts.push(rules[i]!.cssText);
    return parts.join("\n");
  };

  const sheets: RawSheet[] = [];
  const sheetList: { sheet: CSSStyleSheet; adopted: boolean }[] = [];
  const total = document.styleSheets.length;
  for (let s = 0; s < total; s++) sheetList.push({ sheet: document.styleSheets[s]!, adopted: false });
  // Review M3: constructed stylesheets (`document.adoptedStyleSheets`) are NOT
  // in `document.styleSheets`. On a Lit / web-component / token-sheet site
  // they can hold every rule the page has. They have no owner node; their
  // index continues after the list so cascade order is preserved (adopted
  // sheets cascade after document sheets).
  try {
    for (const sh of (document as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []) sheetList.push({ sheet: sh, adopted: true });
  } catch {
    /* unsupported */
  }
  for (let s = 0; s < sheetList.length; s++) {
    if (sheets.length >= arg.maxInventoryEntries) {
      capHits.push("styleSheets");
      break;
    }
    const sheet = sheetList[s]!.sheet;
    const owner = sheetList[s]!.adopted ? null : (sheet.ownerNode as Element | null);
    const ownerTag: RawSheet["ownerTag"] =
      owner && owner.nodeType === 1
        ? owner.tagName.toLowerCase() === "link"
          ? "link"
          : owner.tagName.toLowerCase() === "style"
            ? "style"
            : null
        : null;
    let href: string | null = null;
    try {
      href = sheet.href;
    } catch {
      href = null;
    }
    let mediaText = "";
    try {
      mediaText = sheet.media.mediaText;
    } catch {
      mediaText = "";
    }
    const entry: RawSheet = {
      index: s,
      ownerTag,
      href,
      mediaText,
      disabled: sheet.disabled,
      runtimeMarkers: [],
      cssom: { readable: false },
      importHrefs: [],
      fontFaces: [],
    };
    if (sheet.title) entry.title = sheet.title;
    if (owner && owner.nodeType === 1) {
      const m = attr(owner, "media");
      if (m !== null) entry.mediaAttr = m;
      entry.ownerAttributes = attributesOf(owner);
      for (const name of owner.getAttributeNames()) {
        if (RUNTIME_MARKER_NAMES.some((mk) => (mk.endsWith("-") ? name.startsWith(mk) : name === mk))) {
          entry.runtimeMarkers.push(name);
        }
      }
      if (ownerTag === "style") {
        const bt = boundedText(owner.textContent ?? "");
        entry.textBytes = bt.bytes;
        if (bt.skipped) entry.textSkippedBySize = true;
        else entry.textContent = bt.text;
      }
    }
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
      entry.cssom.readable = true;
    } catch (err) {
      entry.cssom.readable = false;
      entry.cssom.error = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err).slice(0, 200);
    }
    if (rules) {
      const state = { walked: 0, conditions: new Set<string>(), layers: [] as string[], imports: [] as string[], fontFaces: [] as RawFontFace[], sheetHref: href };
      entry.cssom.ruleCount = 0;
      walkRules(rules, entry.cssom, state);
      if (state.conditions.size > 0) entry.cssom.mediaConditions = Array.from(state.conditions);
      if (state.layers.length > 0) entry.cssom.layerNames = state.layers;
      entry.importHrefs = state.imports;
      entry.fontFaces = state.fontFaces;
      // CSSOM-serialized text: for runtime style tags (empty text node, or a
      // CSS-in-JS marker) and for sheets with no text node at all.
      const emptyText = ownerTag === "style" && (entry.textContent === undefined || entry.textContent.trim() === "") && !entry.textSkippedBySize;
      const wantsSerialized = ownerTag !== "link" && (emptyText || entry.runtimeMarkers.length > 0 || ownerTag === null);
      if (wantsSerialized && (entry.cssom.ruleCount ?? 0) > 0) {
        const text = serializeRules(sheet);
        const bt = boundedText(text);
        entry.cssomTextBytes = bt.bytes;
        if (bt.skipped) entry.cssomTextSkippedBySize = true;
        else entry.cssomText = bt.text;
      }
    }
    sheets.push(entry);
  }
  let adoptedSheetCount = 0;
  try {
    adoptedSheetCount = (document as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets?.length ?? 0;
  } catch {
    adoptedSheetCount = 0;
  }

  /* ---- scripts ---------------------------------------------------------- */
  const JS_TYPES = ["", "text/javascript", "application/javascript", "application/x-javascript", "text/ecmascript", "application/ecmascript", "module", "text/jscript"];
  const scripts: RawScriptEl[] = [];
  const dataScripts: RawDataScript[] = [];
  const all = document.scripts;
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    const typeAttr = attr(el, "type");
    const t = (typeAttr ?? "").trim().toLowerCase();
    const inHead = !!el.closest("head");
    if (JS_TYPES.indexOf(t) >= 0) {
      if (scripts.length >= arg.maxInventoryEntries) {
        capHits.push("scripts");
        break;
      }
      const srcAttr = attr(el, "src");
      const entry: RawScriptEl = {
        order: i,
        src: resolve(srcAttr),
        srcAttr,
        typeAttr,
        async: el.hasAttribute("async"),
        defer: el.hasAttribute("defer"),
        nomodule: el.hasAttribute("nomodule"),
        crossorigin: attr(el, "crossorigin"),
        integrity: attr(el, "integrity"),
        referrerpolicy: attr(el, "referrerpolicy"),
        nonceUsed: el.hasAttribute("nonce"),
        id: attr(el, "id"),
        inHead,
        textBytes: 0,
      };
      const data = dataAttributesOf(el);
      if (data) entry.dataAttributes = data;
      if (srcAttr === null || srcAttr.trim() === "") {
        const bt = boundedText(el.textContent ?? "");
        entry.textBytes = bt.bytes;
        if (bt.skipped) entry.textSkippedBySize = true;
        else entry.text = bt.text;
      }
      scripts.push(entry);
    } else {
      if (dataScripts.length >= arg.maxInventoryEntries) {
        capHits.push("dataScripts");
        continue;
      }
      const bt = boundedText(el.textContent ?? "");
      const entry: RawDataScript = { order: i, id: attr(el, "id"), typeAttr: t, inHead, textBytes: bt.bytes };
      if (bt.skipped) entry.textSkippedBySize = true;
      else entry.text = bt.text;
      dataScripts.push(entry);
    }
  }

  /* ---- links ---------------------------------------------------------- */
  const links: RawLinkEl[] = [];
  const linkEls = document.querySelectorAll("link[rel]");
  for (let i = 0; i < linkEls.length; i++) {
    if (links.length >= arg.maxInventoryEntries) {
      capHits.push("links");
      break;
    }
    const el = linkEls[i]!;
    links.push({
      order: i,
      rel: (attr(el, "rel") ?? "").trim().toLowerCase(),
      href: resolve(attr(el, "href")),
      as: attr(el, "as"),
      type: attr(el, "type"),
      media: attr(el, "media"),
      crossorigin: attr(el, "crossorigin"),
      sizes: attr(el, "sizes"),
      integrity: attr(el, "integrity"),
    });
  }

  /* ---- images ---------------------------------------------------------- */
  const readSources = (parent: Element): RawSourceEl[] => {
    const out: RawSourceEl[] = [];
    const srcs = parent.querySelectorAll(":scope > source");
    for (let i = 0; i < srcs.length && i < 32; i++) {
      const s = srcs[i]!;
      out.push({ srcset: attr(s, "srcset"), src: attr(s, "src"), sizes: attr(s, "sizes"), type: attr(s, "type"), media: attr(s, "media") });
    }
    return out;
  };
  const images: RawImageEl[] = [];
  const imgs = document.images;
  for (let i = 0; i < imgs.length; i++) {
    if (images.length >= arg.maxInventoryEntries) {
      capHits.push("images");
      break;
    }
    const img = imgs[i]!;
    const picture = img.parentElement && img.parentElement.tagName.toLowerCase() === "picture" ? img.parentElement : null;
    images.push({
      path: pathOf(img),
      src: attr(img, "src"),
      currentSrc: img.currentSrc || "",
      srcset: attr(img, "srcset"),
      sizes: attr(img, "sizes"),
      loading: attr(img, "loading"),
      decoding: attr(img, "decoding"),
      fetchpriority: attr(img, "fetchpriority"),
      width: attr(img, "width"),
      height: attr(img, "height"),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      pictureSources: picture ? readSources(picture) : [],
    });
  }

  /* ---- CSS images (bounded element walk) -------------------------------- */
  const cssImages: RawCssImage[] = [];
  const everything = document.querySelectorAll("*");
  let walked = 0;
  let walkCapHit = false;
  let shadowRoots = 0;
  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/g;
  const extractUrls = (value: string): string[] => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(value)) !== null) {
      const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (raw !== "") out.push(raw);
      if (out.length >= 16) break;
    }
    return out;
  };
  for (let i = 0; i < everything.length; i++) {
    if (walked >= arg.maxElementsWalked) {
      walkCapHit = true;
      break;
    }
    walked++;
    const el = everything[i]!;
    // Review M4: shadow trees are not traversed (querySelectorAll and
    // page.content() stop at the host); count the hosts so the gap is measured.
    if (el.shadowRoot) shadowRoots++;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (bg && bg !== "none" && bg.indexOf("url(") >= 0) {
      const urls = extractUrls(bg);
      if (urls.length > 0 && cssImages.length < arg.maxInventoryEntries) cssImages.push({ path: pathOf(el), property: "background-image", urls });
    }
    const mask = cs.maskImage || (cs as unknown as { webkitMaskImage?: string }).webkitMaskImage || "";
    if (mask && mask !== "none" && mask.indexOf("url(") >= 0) {
      const urls = extractUrls(mask);
      if (urls.length > 0 && cssImages.length < arg.maxInventoryEntries) cssImages.push({ path: pathOf(el), property: "mask-image", urls });
    }
  }

  /* ---- media ----------------------------------------------------------- */
  const media: RawMediaEl[] = [];
  const mediaEls = document.querySelectorAll("video, audio");
  for (let i = 0; i < mediaEls.length; i++) {
    if (media.length >= arg.maxInventoryEntries) {
      capHits.push("media");
      break;
    }
    const el = mediaEls[i]! as HTMLMediaElement;
    media.push({
      path: pathOf(el),
      tag: el.tagName.toLowerCase() === "video" ? "video" : "audio",
      src: attr(el, "src"),
      currentSrc: el.currentSrc || "",
      poster: attr(el, "poster"),
      autoplay: el.hasAttribute("autoplay"),
      muted: el.hasAttribute("muted") || (el as HTMLMediaElement).muted,
      loop: el.hasAttribute("loop"),
      playsinline: el.hasAttribute("playsinline"),
      controls: el.hasAttribute("controls"),
      preload: attr(el, "preload"),
      width: attr(el, "width"),
      height: attr(el, "height"),
      sources: readSources(el),
    });
  }

  /* ---- frames ---------------------------------------------------------- */
  const frames: RawFrameEl[] = [];
  const frameEls = document.querySelectorAll("iframe");
  for (let i = 0; i < frameEls.length; i++) {
    if (frames.length >= arg.maxInventoryEntries) {
      capHits.push("frames");
      break;
    }
    const el = frameEls[i]!;
    const entry: RawFrameEl = {
      path: pathOf(el),
      src: resolve(attr(el, "src")),
      loading: attr(el, "loading"),
      allow: attr(el, "allow"),
      sandbox: attr(el, "sandbox"),
      referrerpolicy: attr(el, "referrerpolicy"),
      width: attr(el, "width"),
      height: attr(el, "height"),
    };
    const srcdoc = el.getAttribute("srcdoc");
    if (srcdoc !== null) entry.srcdocBytes = byteLen(srcdoc);
    frames.push(entry);
  }

  /* ---- svg ------------------------------------------------------------- */
  const svg: RawSvgInventory = { inlineCount: 0, inlineBytes: 0, uses: [], objects: [] };
  const svgEls = document.querySelectorAll("svg");
  for (let i = 0; i < svgEls.length; i++) {
    const el = svgEls[i]!;
    if (el.parentElement && el.parentElement.closest("svg")) continue; // nested
    svg.inlineCount++;
    svg.inlineBytes += byteLen(el.outerHTML);
  }
  const useEls = document.querySelectorAll("use");
  for (let i = 0; i < useEls.length && svg.uses.length < arg.maxInventoryEntries; i++) {
    const el = useEls[i]!;
    const href = el.getAttribute("href") ?? el.getAttribute("xlink:href");
    if (!href) continue;
    const hashAt = href.indexOf("#");
    const file = hashAt > 0 ? href.slice(0, hashAt) : hashAt === 0 ? "" : href;
    if (file === "") continue; // same-document symbol reference
    svg.uses.push({ path: pathOf(el), href: resolve(href) ?? href });
  }
  const objEls = document.querySelectorAll("object[data], embed[src]");
  for (let i = 0; i < objEls.length && svg.objects.length < arg.maxInventoryEntries; i++) {
    const el = objEls[i]!;
    const tag = el.tagName.toLowerCase();
    const url = resolve(attr(el, tag === "object" ? "data" : "src"));
    if (!url) continue;
    svg.objects.push({ path: pathOf(el), tag, url, type: attr(el, "type") });
  }

  /* ---- runtime config ----------------------------------------------------- */
  const redactDeep = (value: unknown, redacted: string[], depth: number, budget: { nodes: number }): unknown => {
    if (depth > 24 || budget.nodes > 200_000) return "[truncated]";
    budget.nodes++;
    if (Array.isArray(value)) return value.map((v) => redactDeep(v, redacted, depth + 1, budget));
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const v = (value as Record<string, unknown>)[key];
        if (sensitiveKey.test(key) && (typeof v === "string" || typeof v === "number")) {
          out[key] = "[redacted]";
          if (redacted.indexOf(key) < 0) redacted.push(key);
          continue;
        }
        out[key] = redactDeep(v, redacted, depth + 1, budget);
      }
      return out;
    }
    if (typeof value === "function") return "[function]";
    return value;
  };
  const windowGlobals: RawWindowGlobal[] = [];
  for (const name of arg.windowGlobals) {
    let present = false;
    let value: unknown;
    try {
      present = Object.prototype.hasOwnProperty.call(window, name);
      if (!present) continue;
      value = (window as unknown as Record<string, unknown>)[name];
    } catch {
      continue;
    }
    const entry: RawWindowGlobal = { name, valueType: value === null ? "null" : typeof value, bytes: 0, serializable: false, redactedKeys: [] };
    try {
      const redacted: string[] = [];
      const cleaned = redactDeep(value, redacted, 0, { nodes: 0 });
      const json = JSON.stringify(cleaned);
      if (typeof json === "string") {
        entry.serializable = true;
        entry.redactedKeys = redacted.sort();
        const bt = boundedText(json);
        entry.bytes = bt.bytes;
        if (bt.skipped) entry.skippedBySize = true;
        else entry.json = bt.text;
      }
    } catch {
      entry.serializable = false;
    }
    windowGlobals.push(entry);
  }

  const fontsLoaded: RawSourceInventory["fontsLoaded"] = [];
  try {
    const fontSet = (document as unknown as { fonts?: { forEach: (cb: (f: FontFace) => void) => void } }).fonts;
    if (fontSet) {
      fontSet.forEach((f: FontFace) => {
        if (fontsLoaded.length < arg.maxInventoryEntries) fontsLoaded.push({ family: f.family, status: f.status, weight: f.weight, style: f.style });
      });
    }
  } catch {
    /* FontFaceSet unavailable */
  }

  const tagNames: string[] = [];
  const seenTags = new Set<string>();
  for (let i = 0; i < everything.length && i < arg.maxElementsWalked; i++) {
    const t = everything[i]!.tagName.toLowerCase();
    if (t.indexOf("-") >= 0 && !seenTags.has(t)) {
      seenTags.add(t);
      tagNames.push(t);
      if (tagNames.length >= 64) break;
    }
  }

  const generator = document.querySelector('meta[name="generator"]');
  const base = document.querySelector("base[href]");

  return {
    finalUrl: location.href,
    origin: location.origin,
    baseURI: document.baseURI,
    baseHref: base ? attr(base, "href") : null,
    metaGenerator: generator ? attr(generator, "content") : null,
    htmlAttributes: attributesOf(document.documentElement),
    bodyAttributes: document.body ? attributesOf(document.body) : {},
    tagNames,
    sheets,
    adoptedSheetCount,
    scripts,
    dataScripts,
    links,
    images,
    cssImages,
    media,
    frames,
    svg,
    windowGlobals,
    fontsLoaded,
    caps: { elementsWalked: walked, elementWalkCapHit: walkCapHit, inventoryCapHits: capHits, inlineTextBytes, shadowRoots },
  };
}

/**
 * Second in-page pass: serialize the CSSOM of specific sheets (by
 * `document.styleSheets` index) — used for LINKED sheets whose network body
 * could not be captured but whose CSSOM is readable.
 */
export function serializeSheetsInBrowser(arg: { indices: number[]; maxRules: number; maxBytes: number }): {
  index: number;
  /** Identity of the sheet found at `index` NOW — the caller rejects a result whose href is not the one it asked for (review M5). */
  href: string | null;
  ownerTag: string | null;
  text?: string;
  bytes: number;
  skippedBySize?: boolean;
  error?: string;
}[] {
  const encoder = new TextEncoder();
  const out: { index: number; href: string | null; ownerTag: string | null; text?: string; bytes: number; skippedBySize?: boolean; error?: string }[] = [];
  for (const index of arg.indices) {
    const sheet = document.styleSheets[index];
    if (!sheet) {
      out.push({ index, href: null, ownerTag: null, bytes: 0, error: "sheet index no longer present" });
      continue;
    }
    let href: string | null = null;
    try {
      href = sheet.href;
    } catch {
      href = null;
    }
    const ownerNode = sheet.ownerNode as Element | null;
    const ownerTag = ownerNode && ownerNode.nodeType === 1 ? ownerNode.tagName.toLowerCase() : null;
    try {
      const rules = sheet.cssRules;
      const parts: string[] = [];
      for (let i = 0; i < rules.length && i < arg.maxRules; i++) parts.push(rules[i]!.cssText);
      const text = parts.join("\n");
      const bytes = encoder.encode(text).length;
      if (bytes > arg.maxBytes) out.push({ index, href, ownerTag, bytes, skippedBySize: true });
      else out.push({ index, href, ownerTag, text, bytes });
    } catch (err) {
      out.push({ index, href, ownerTag, bytes: 0, error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err) });
    }
  }
  return out;
}
