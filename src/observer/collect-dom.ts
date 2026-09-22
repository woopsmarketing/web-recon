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
  /**
   * Task 28.6 C3 D1 — DISTINCT authored `@media` conditions tallied per page.
   * The tally is what the probe-width derivation reads; the cap bounds it and
   * every refusal is counted in `authoredMediaConditionsDropped`.
   */
  maxAuthoredMediaConditions?: number;
  maxMatchedRulesPerElement?: number;
  /** Responsive Core P0 §C1.5 — declarations kept per (element, property). */
  maxMatchedRulesPerProperty?: number;
  /**
   * Responsive Core P0 §C1.2 — runtime inline style capture (page mode only).
   * Absent/0 disables the channel.
   */
  maxInlineStyleDecls?: number;
  inlineStyleRawMaxLen?: number;
  layoutRuleSelectorMaxLen?: number;
  layoutRuleValueMaxLen?: number;
  /**
   * Task 28.5B §5 — caps for the `:root` custom-property harvest. Absent means
   * the built-in defaults below; the harvest itself is unconditional on a page
   * walk and always empty in bounded-subtree mode.
   */
  maxRootCustomProperties?: number;
  rootCustomPropertyValueMaxLen?: number;
  /**
   * Task 28.6 W1.1 — CORS STYLESHEET FALLBACK material.
   *
   * Text of stylesheets whose `cssRules` the CSSOM refuses (cross-origin, no
   * `Access-Control-Allow-Origin`), keyed by the sheet's `href` as
   * `document.styleSheets` reports it. Node captured these from the RESPONSES
   * Chromium had already downloaded — no second fetch, no new request — and
   * expanded their `@import`s, because a constructed sheet drops `@import`
   * silently.
   *
   * The page parses each one with `new CSSStyleSheet().replaceSync(text)` AT
   * THE SHEET'S POSITION in the sheet list, so cascade order is preserved, and
   * NEVER adopts it: the constructed sheet cannot affect what is rendered or
   * what `getComputedStyle` returns. Declarations recovered this way are marked
   * `origin: "fetched"` so the artifact never pretends the engine gave them up.
   */
  extraSheets?: readonly { href: string; css: string }[];
  /**
   * Task 28.6 C2 B4 — window key where the preparation auto-scroll parked the
   * elements it measured being REVEALED during the scroll and re-hidden after
   * the return to the top (see `layout-probe.ts`). Absent when no preparation
   * scroll ran (then no element can be marked, and `paintSuppression` reports
   * `scrollRevealMarked: 0`), and absent in bounded-subtree mode.
   */
  scrollRevealStateKey?: string;
  /**
   * Task 28.6 C2 B5 — window key where the load parked its INITIAL-PAINT census
   * (which elements existed and which were visible right after `load`, before
   * any stabilization). The overlay census uses it as its only time-based
   * discriminator; absent, every overlay candidate is recorded as
   * `refused: "no-initial-paint-census"` rather than guessed at.
   */
  initialPaintStateKey?: string;
  /**
   * Task 28.6 C2 B4/B5 — computed `opacity` strictly BELOW which an element
   * counts as painting nothing. Default {@link SCROLL_REVEAL_OPACITY_THRESHOLD}'s value
   * (0.05); passed in so the observer, the probe and the collector cannot drift.
   */
  paintOpacityThreshold?: number;
  /** Task 28.6 C2 B5 — max overlay candidates recorded. A hit is counted. */
  maxOverlayCandidates?: number;
  /**
   * Task 28.7 A2 — the SHARED overlay SHAPE thresholds ({@link OVERLAY_SHAPE}).
   *
   * The page-state normalizer applies the identical gate before collection.
   * Neither in-page pass can import the other's helpers (Playwright serializes
   * only the function it is handed), so the thresholds are passed in from ONE
   * constant and the smoke suite asserts the two passes agree end to end on the
   * same page. Defaults preserve the pre-28.7 literals exactly.
   */
  overlayMinWidthCoverage?: number;
  overlayMinHeightCoverage?: number;
  overlayMinAreaCoverage?: number;
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
    /** Task 28.6 W1.2 — enclosing `@supports` / `@container` / `@layer`. */
    supports?: string;
    container?: string;
    layer?: string;
    /** Task 28.6 W1.1 — `"fetched"` when recovered from the response body. */
    origin?: "cssom" | "fetched";
    selector: string;
    important?: boolean;
    /** Responsive Core P0 §C1.5 — cascade metadata (see MatchedLayoutRuleSchema). */
    sheetIndex?: number;
    ruleOrder?: number;
    specificity?: [number, number, number];
    layerOrder?: number;
    supportsMatches?: boolean;
  }[];
  layoutRulesTruncated?: boolean;
  /** Responsive Core P0 §C1.5 — declarations matched before / kept after the cap. */
  layoutRulesMatched?: number;
  layoutRulesKept?: number;
  /** Responsive Core P0 §C1.2 — runtime inline style (non-empty `style` only). */
  inlineStyle?: {
    decls: { property: string; value: string; important?: true }[];
    raw?: string;
    truncated?: true;
    unresolvedShorthands?: number;
  };
  /**
   * Task 28.6 C2 B4 — the preparation auto-scroll measured this element PAINTING
   * during the scroll and painting nothing again after the return to the top. Its
   * observed styles therefore describe the re-hidden state, not the state a
   * human scrolling the page sees.
   */
  scrollRevealRegressed?: boolean;
  /** The highest `opacity` that scroll measured on it (its revealed value). */
  revealedOpacity?: number;
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
  /** The raw `url()` text, exactly as authored. NOT resolved. */
  url: string;
  family?: string;
  /**
   * Task 28.6 W6 O4 — the href of the STYLESHEET that authored this `url()`,
   * absent for an inline `<style>` (whose base IS the document).
   *
   * WHY THIS FIELD EXISTS. A relative `src: url(...)` in `@font-face` resolves
   * against the stylesheet that contains it, not against the document. With no
   * sheet href on the record, the consumer had nothing but `document.baseURI`.
   *
   * MEASURED on hobbang.net: 92 of 184 font assets resolved to
   * `https://hobbang.net/packages/pretendard/...`, which returns 404 (146 bytes
   * of `text/html`), while the correct `cdn.jsdelivr.net` URL returns 200 and
   * 34,568 bytes of `font/woff2`. The asymmetry is diagnostic — ABSOLUTE `src`
   * in the CORS-bridged sheet was right 92/92, RELATIVE `src` in the readable
   * third-party sheet was wrong 92/92 — and it is exactly what a
   * document-base-only resolver produces.
   */
  sheetHref?: string;
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

/** One `:root` custom property with its FINAL cascaded value. */
export interface RawRootCustomProperty {
  name: string;
  value: string;
}

/**
 * Task 28.5B §5 — the root custom properties observed at this viewport.
 *
 * Names are discovered from root-level rules in same-origin stylesheets (a
 * cross-origin sheet throws on `cssRules` and is skipped, exactly as the font
 * harvest does). Values are then read from
 * `getComputedStyle(document.documentElement)`, so the cascade decides — a
 * `@media (max-width: 500px) { :root { --brand: … } }` override is reflected at
 * the narrow viewport and not at the wide one, which is the whole reason this
 * record is per-viewport.
 */
export interface RawRootCustomProperties {
  /** Sorted by name (code-point order) so the bytes are a function of the page. */
  properties: RawRootCustomProperty[];
  /** Distinct names discovered before the count cap was applied. */
  discoveredCount: number;
  /** True when the count cap truncated the harvest — recorded, never silent. */
  countCapped: boolean;
  /** Names dropped because their value exceeded the length cap. */
  valueCappedCount: number;
  /**
   * Names found in a stylesheet whose value the cascade does NOT give the
   * document element (resolution is `""`), so they were dropped. Separates a
   * discovery/resolution mismatch from a cap hit.
   */
  unresolvedCount: number;
  /**
   * Task 28.5B Change 5, correction 2 — REFERENCE-DRIVEN DISCOVERY.
   *
   * Distinct `--name`s that a captured inline `<svg>`'s markup references
   * through `var(--name)`. These are found by reading the markup, not a
   * stylesheet, which is the only channel that reaches a name declared in a
   * CROSS-ORIGIN sheet (`cssRules` throws, so the name is unknowable) — the
   * exact case measured on linear.app: 239 inline SVGs, 183 `var()` references,
   * 16 distinct names, none of them present in any readable sheet.
   */
  referenceDiscoveredCount: number;
  /** Referenced names KEPT with a value resolved at the consuming element. */
  referenceResolvedCount: number;
  /**
   * Referenced names that were already discovered from a stylesheet, so the
   * sheet/root-resolved value stands (see the precedence rule in the harvest).
   */
  referenceSheetKnownCount: number;
  /** Referenced names that resolve to `""` at EVERY element consuming them. */
  referenceUnresolvedCount: number;
  /**
   * Times two consuming elements resolved the SAME name to DIFFERENT non-empty
   * values. The first element in document order wins; wrapper-scoped emission
   * can only carry one value per name, so this counter is the honesty channel
   * for the values that were not carried.
   */
  referenceResolutionConflicts: number;
}

/**
 * Task 28.6 W1 — the in-page half of the stylesheet coverage record. Node adds
 * `bytesCaptured` / `sheetsSkippedBySizeCap` / `sheetsBodyUnavailable` /
 * `importsExpanded` / `importsUnresolved`, which only the capture side knows.
 */
export interface RawStylesheetCoverage {
  stylesheetsTotal: number;
  cssomReadable: number;
  cssomBlocked: number;
  fallbackRecovered: number;
  fallbackMissed: number;
  sheetsOffered: number;
  ruleIndexCapHit: boolean;
  rulesIndexed: number;
  nestedRulesVisited: number;
  importRulesVisited: number;
  /**
   * Task 28.6 W6 O2 — of `importRulesVisited`, the ones whose imported sheet
   * yielded a rule list the visitor actually walked.
   */
  importRulesFollowed: number;
  /** Task 28.6 W6 O2 — of those, the ones recovered from a captured body. */
  importRulesRecovered: number;
  /**
   * Task 28.6 W6 O2 — THE SKIP THAT USED TO BE SILENT. A `CSSImportRule` the
   * visitor reached and could not obtain rules for. Before O2 the walker's
   * `if (imported) { visit(...) } continue;` had no `else` and no counter, so
   * `importsUnresolved: 0` was not evidence that nothing went unresolved.
   */
  importRulesUnresolved: number;
  groupingRulesSkipped: number;
  /** Task 28.6 W6 O4 — `url()` occurrences harvested from `@font-face` `src`. */
  fontFaceUrlsHarvested: number;
  /** Of those, already absolute (or `data:`) — no base needed. */
  fontFaceUrlsAbsolute: number;
  /** Of those, relative and carrying their OWNING SHEET's href as the base. */
  fontFaceUrlsSheetResolved: number;
  /**
   * Of those, relative with the DOCUMENT as the base — correct only because the
   * sheet is an inline `<style>`, whose base is the document.
   */
  fontFaceUrlsDocumentResolved: number;
  elementsWithAuthoredRules: number;
  /**
   * Task 28.6 C1.1 — sheets whose OWN `media` list is a real condition (not
   * empty / `all` / `screen`), so every declaration indexed from them carries
   * that condition instead of reading as unconditional.
   */
  sheetsMediaScoped: number;
  /**
   * Task 28.6 C1.1 — sheets that DID carry a `media` list but whose list was
   * `all` / `screen`, i.e. unconditional for every artifact this engine
   * produces. Counted so "the sheet media attribute was read and classified"
   * is auditable rather than indistinguishable from "it was never read".
   */
  sheetsMediaTrivial: number;
  /** Task 28.6 C2.2 — sheets whose media list could not be READ at all. */
  sheetsMediaUnreadable: number;
  /** Task 28.6 C2.1 — media joins that distributed over a comma disjunction. */
  mediaConditionsDistributed: number;
  /** Task 28.6 C2.1 — media joins with a `not`-prefixed alternative. */
  mediaConditionsNegated: number;
  /**
   * Task 28.6 C3 D1 — every DISTINCT `@media` condition this page authored,
   * with how many times it was authored (one count per `@media` block and one
   * per media-scoped sheet). This is the raw material the probe-width
   * derivation folds into breakpoints; it is recorded rather than derived
   * in-page so the derivation stays a pure, testable Node function.
   *
   * Sorted by `count` descending then `condition` ascending, so two runs of the
   * same page emit byte-identical arrays.
   */
  authoredMediaConditions: { condition: string; count: number }[];
  /** Distinct conditions the cap refused to record. Never silent. */
  authoredMediaConditionsDropped: number;
  /** True when {@link CollectConfig.maxAuthoredMediaConditions} bit. */
  authoredMediaConditionsCapHit: boolean;
  /** Responsive Core P0 §C1.5 — cascade-aware cap totals. */
  layoutRulesMatched: number;
  layoutRulesKept: number;
  layoutRulesTruncated: number;
  layoutRulesTruncatedElements: number;
  /** Review fix M2 — dropped declarations whose conditions applied / did not. */
  layoutRulesDroppedApplying: number;
  layoutRulesDroppedNonApplying: number;
  cascadeLayers: number;
  /** Review fix m2 — layer statements / blocks under a non-applying condition. */
  cascadeLayersConditionalSkipped: number;
  specificityUncomputable: number;
  /** Responsive Core P0 §C1.2 — runtime inline style capture totals. */
  inlineStyleElements: number;
  inlineStyleDecls: number;
  inlineStyleTruncated: number;
  /** Review fix M1 — `var()` shorthands recorded raw (longhands read back empty). */
  inlineStyleUnresolvedShorthands: number;
}

/**
 * Task 28.6 C2 B4 — PAINT-SUPPRESSION CENSUS (page mode only).
 *
 * The blank-reconstruction channel. A site whose scroll-animation library runs
 * in re-hide mode leaves most of the document at `opacity: 0` once the
 * preparation scroll returns to the top, and the reconstruction then ships that
 * page BLANK while screenshot-diff QA passes it blank-against-blank. Nothing in
 * the artifact said so, because "this element paints nothing" was only ever a
 * per-element boolean nobody totalled.
 *
 * These are counts over SIZED elements (`display` not `none`, positive box), so
 * a menu that is `display:none` is not in the denominator at all. The three
 * cause counters OVERLAP by construction (an element can be both low-opacity and
 * inside a hard-hidden ancestor); `suppressedElements` is the deduplicated
 * total.
 */
export interface RawPaintSuppression {
  sizedElements: number;
  suppressedElements: number;
  suppressedByOpacity: number;
  suppressedByVisibility: number;
  suppressedByAncestor: number;
  /** Suppressed AND lying entirely below the first viewport (`top >= height`). */
  suppressedBelowFold: number;
  opacityThreshold: number;
  /** Elements the preparation scroll measured revealing and then re-hiding. */
  scrollRevealMarked: number;
  /** True when the scroll-reveal hand-off existed at all (a scroll ran). */
  scrollRevealAvailable: boolean;
}

/**
 * Task 28.6 C2 B5 — one element that has the SHAPE of a modal overlay.
 *
 * Recorded, never removed and never resolved. A modal and a legitimate
 * full-height fixed element are the same shape to a naive detector, and a false
 * positive here deletes a real header — so this record carries the signals and
 * leaves the verdict to a consumer or an operator.
 */
export interface RawOverlayCandidate {
  /** Walk id, so the record points into `dom.json`. */
  elementId: string;
  tagName: string;
  /** Fraction of the viewport the element's box covers (0–1). */
  viewportCoverage: number;
  /** Fraction of the viewport HEIGHT the element's box covers (0–1). */
  heightCoverage: number;
  position: string;
  /** Computed `z-index`, absent when `auto`. */
  zIndex?: number;
  /** `role=dialog|alertdialog`, `aria-modal="true"`, or a native `<dialog>`. */
  declaredDialog: boolean;
  /** The element existed in the DOM at initial paint. Absent without a census. */
  presentAtInitialPaint?: boolean;
  /** The element PAINTED at initial paint. Absent without a census. */
  visibleAtInitialPaint?: boolean;
  /** Interactive descendants (bounded count) — a dismiss control may be here. */
  interactiveDescendants: number;
  /**
   * Flagged as a likely modal: it has at least one corroborating signal beyond
   * the shape. Never an instruction to remove anything.
   */
  flagged: boolean;
  /**
   * Task 28.6 C3 D2 — WHICH corroborating signals fired, in a fixed order:
   * `"declared-dialog"`, `"appeared-after-initial-paint"`,
   * `"page-scroll-locked"`. Empty exactly when `flagged` is false.
   *
   * Recorded because the three are OR-ed: an element flagged solely by
   * `"page-scroll-locked"` was PAINTING at the initial paint and carries no
   * dialog semantics — the legitimate-hero class — and only this list lets a
   * consumer tell it apart from a dialog that really appeared.
   */
  flaggedBy: string[];
  /** Why it was NOT flagged. Absent when `flagged`. */
  refusedReason?: string;
}

/** Task 28.6 C2 B5 — the overlay census for one page load. */
export interface RawOverlayCensus {
  /** Elements passing the SHAPE gate (positioned, ≥half the viewport, painting). */
  structuralMatches: number;
  /** Structural matches with a corroborating signal. */
  flagged: number;
  /**
   * Task 28.6 C3 D2 — flagged ONLY because the page scroll happened to be
   * locked, while the element was painting at the initial paint and declares no
   * dialog semantics. This is the census's known FALSE-POSITIVE class, counted
   * so its size on any given page is readable instead of assumed to be zero.
   */
  flaggedByScrollLockOnly: number;
  /** Flagged with declared dialog semantics (`<dialog>`, role, aria-modal). */
  flaggedByDeclaredDialog: number;
  /** Flagged because it was not painting at the initial paint. */
  flaggedByAppearedAfterInitialPaint: number;
  /** Structural matches with none — recorded, never flagged. */
  refused: number;
  /**
   * Positioned, painting, ≥half the viewport WIDE but SHORT: the legitimate
   * fixed-header class this census deliberately never flags. Counted so the
   * refusal is auditable rather than invisible.
   */
  headerLikeRefused: number;
  /** Page scroll was locked (`overflow:hidden` on a scrollable document). */
  pageScrollLocked: boolean;
  /** The initial-paint census was available for the time-based signal. */
  initialPaintCensusAvailable: boolean;
  /**
   * The initial-paint census stopped at its element cap. Membership then cannot
   * tell "was not there" from "was never looked at", and the unknown direction
   * is the DANGEROUS one — it would flag an element that had been painting all
   * along — so a capped census is treated as no census at all and this says so.
   */
  initialPaintCapHit: boolean;
  /** True when {@link CollectConfig.maxOverlayCandidates} stopped the list. */
  capHit: boolean;
  candidates: RawOverlayCandidate[];
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
  /** Task 28.5B §5 — `:root` custom properties resolved at this viewport. */
  customProperties: RawRootCustomProperties;
  /**
   * Task 28.6 W1 — how much of the page's authored CSS this pass could read.
   * Page mode only (a bounded-subtree capture is not a sheet observation).
   * Node fills in the fields only it can know (bytes captured, imports
   * expanded) before the record is persisted.
   */
  stylesheetCoverage?: RawStylesheetCoverage;
  /** Task 28.6 C2 B4 — how much of this page paints nothing. Page mode only. */
  paintSuppression?: RawPaintSuppression;
  /** Task 28.6 C2 B5 — modal-shaped elements, recorded not resolved. Page mode. */
  overlayCensus?: RawOverlayCensus;
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
  // Responsive Core P0 §C1.2 — runtime inline style capture caps (0 = off).
  const maxInlineStyleDecls = config.maxInlineStyleDecls ?? 0;
  const inlineStyleRawMaxLen = config.inlineStyleRawMaxLen ?? 2000;
  const scrollableOverflow = new Set(scrollableOverflowValues);
  // `value` may hold server-prefilled sensitive data on these input types.
  const sensitiveInputTypes = new Set(["password", "hidden"]);

  // --- Task 17 §7 / Task 28.6 W1: authored layout-rule index ---------------
  //
  // Built once per page from `document.styleSheets`, IN SHEET ORDER, so the
  // index reflects the cascade order the engine itself uses. The walk below runs
  // `element.matches(selector)` against it, so what is recorded is what the
  // browser applies to that element — never a compile of the stylesheet.
  //
  // Task 28.6 W1.1: a sheet the CSSOM refuses (cross-origin, no CORS header) is
  // no longer simply lost. Node hands the page that sheet's TEXT (captured from
  // the response Chromium already downloaded, `@import`s expanded) and the page
  // parses it into a constructed `CSSStyleSheet` at the same position in the
  // list. The constructed sheet is never adopted, so it cannot change rendering
  // or `getComputedStyle`; its declarations are marked `origin: "fetched"`.
  //
  // Task 28.6 W1.2: grouping rules are discriminated by `constructor.name`.
  // `CSSRule.type` cannot do this job — in Chromium 151 `CSSContainerRule.type`
  // and `CSSLayerBlockRule.type` are both `0` and `CSSSupportsRule.type` is 12 —
  // which is why the pre-28.6 `type === 4` test recorded `@container` /
  // `@supports` / `@layer` declarations as UNCONDITIONAL.
  interface LayoutRuleEntry {
    matchSelector: string;
    selector: string;
    media?: string;
    supports?: string;
    container?: string;
    layer?: string;
    origin?: "fetched";
    declarations: { property: string; value: string; important?: boolean }[];
    /** Responsive Core P0 §C1.5 — owning top-level sheet index. */
    sheetIndex: number;
    /** Responsive Core P0 §C1.5 — global cascade source-order position. */
    ruleOrder: number;
    /** Each `@supports` condition in the chain, for in-page evaluation. */
    supportsParts?: string[];
    /** Lazily computed per complex selector of `matchSelector`. */
    parts?: { selector: string; specificity: [number, number, number] | null }[];
  }

  const coverage: RawStylesheetCoverage = {
    stylesheetsTotal: 0,
    cssomReadable: 0,
    cssomBlocked: 0,
    fallbackRecovered: 0,
    fallbackMissed: 0,
    sheetsOffered: 0,
    ruleIndexCapHit: false,
    rulesIndexed: 0,
    nestedRulesVisited: 0,
    importRulesVisited: 0,
    importRulesFollowed: 0,
    importRulesRecovered: 0,
    importRulesUnresolved: 0,
    groupingRulesSkipped: 0,
    fontFaceUrlsHarvested: 0,
    fontFaceUrlsAbsolute: 0,
    fontFaceUrlsSheetResolved: 0,
    fontFaceUrlsDocumentResolved: 0,
    elementsWithAuthoredRules: 0,
    sheetsMediaScoped: 0,
    sheetsMediaTrivial: 0,
    sheetsMediaUnreadable: 0,
    mediaConditionsDistributed: 0,
    mediaConditionsNegated: 0,
    authoredMediaConditions: [],
    authoredMediaConditionsDropped: 0,
    authoredMediaConditionsCapHit: false,
    layoutRulesMatched: 0,
    layoutRulesKept: 0,
    layoutRulesTruncated: 0,
    layoutRulesTruncatedElements: 0,
    layoutRulesDroppedApplying: 0,
    layoutRulesDroppedNonApplying: 0,
    cascadeLayers: 0,
    cascadeLayersConditionalSkipped: 0,
    specificityUncomputable: 0,
    inlineStyleElements: 0,
    inlineStyleDecls: 0,
    inlineStyleTruncated: 0,
    inlineStyleUnresolvedShorthands: 0,
  };

  /**
   * Task 28.6 C3 D1 — the authored `@media` tally, keyed by the JOINED
   * condition text (the same string the matched-rule records carry, so a
   * consumer can line the two up). Bounded by `maxAuthoredMediaConditions`; a
   * distinct condition the cap refuses increments
   * `authoredMediaConditionsDropped` and can never be mistaken for a condition
   * the page did not author.
   */
  const maxAuthoredMediaConditions = config.maxAuthoredMediaConditions ?? 300;
  const authoredMediaTally: Record<string, number> = Object.create(
    null,
  ) as Record<string, number>;
  let authoredMediaDistinct = 0;
  const tallyAuthoredMedia = (condition: string): void => {
    const text = condition.trim();
    if (text === "") return;
    const existing = authoredMediaTally[text];
    if (existing !== undefined) {
      authoredMediaTally[text] = existing + 1;
      return;
    }
    if (authoredMediaDistinct >= maxAuthoredMediaConditions) {
      coverage.authoredMediaConditionsCapHit = true;
      coverage.authoredMediaConditionsDropped++;
      return;
    }
    authoredMediaTally[text] = 1;
    authoredMediaDistinct++;
  };

  // Fallback material, keyed by the href `document.styleSheets` reports.
  const extraSheetCss: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  if (config.extraSheets) {
    for (let i = 0; i < config.extraSheets.length; i++) {
      const offered = config.extraSheets[i]!;
      if (extraSheetCss[offered.href] === undefined) {
        extraSheetCss[offered.href] = offered.css;
        coverage.sheetsOffered++;
      }
    }
  }

  /** Parse recovered text without ever adopting the sheet. */
  const parseRecovered = (css: string): CSSRuleList | null => {
    try {
      const constructed = new CSSStyleSheet();
      constructed.replaceSync(css);
      return constructed.cssRules;
    } catch {
      return null;
    }
  };

  /*
   * Task 28.6 C1.1 — SHEET-LEVEL `media`.
   *
   * `<link media="print">` / `<style media="print">` / `@import … print` scope
   * EVERY rule in the sheet, and nothing in the rule objects says so: a rule
   * inside such a sheet has no `CSSMediaRule` ancestor, so the visitor below
   * would record `.print-canary { width: 987px }` as an UNCONDITIONAL
   * declaration. That is the same wrong-value class W1.2 removed at the
   * grouping-rule level, one level up — and W1.1 made it worse, because a
   * CORS-blocked `media="print"` sheet used to be invisible and is now
   * recovered. So the sheet's own media list is read here and SEEDS the root
   * rule context, joining with the same `" and "` convention nested `@media`
   * uses.
   *
   * `all` and `screen` are dropped as unconditional-for-this-pipeline: a media
   * LIST is a disjunction, and the observation — like every artifact downstream
   * of it — is a screen rendering, so a list containing `all` or `screen`
   * applies to everything this engine models. Every other list (`print`,
   * `speech`, `(min-width: 700px)`, `screen and (min-width: 700px)`, …) SEEDS
   * the root rule context and is counted in `sheetsMediaScoped`.
   *
   * Task 28.6 C2.1 correction — the seed is verbatim, but what a nested `@media`
   * then does to it is NOT concatenation (see `joinMedia` below). A comma list
   * is a DISJUNCTION, so `" and "`-appending onto it (`"print, speech"` plus a
   * nested `(min-width: 700px)` → `"print, speech and (min-width: 700px)"`)
   * states `print OR (speech AND width)` when the truth is
   * `(print OR speech) AND width`. The nested condition is DISTRIBUTED across
   * the alternatives instead, so the recorded string stays a comma list of
   * conjunctions — the alternatives form the SiteSpec consumer already parses.
   */
  const sheetMediaCondition = (
    mediaText: string,
  ): { condition: string; trivial: boolean } => {
    const text = mediaText.trim();
    if (text === "") return { condition: "", trivial: false };
    const queries = text.split(",");
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]!.trim().toLowerCase();
      // A media LIST is a disjunction, so one `all`/`screen` query makes the
      // whole sheet apply to every screen rendering this engine produces.
      // Classified, never dropped: counted in `sheetsMediaTrivial`.
      if (query === "all" || query === "screen") {
        return { condition: "", trivial: true };
      }
    }
    return { condition: text, trivial: false };
  };

  /**
   * The media list scoping a whole sheet. `CSSStyleSheet.media` reflects the
   * owner node's `media` attribute (and, for an imported sheet, the `@import`
   * media) and is NOT gated by CORS, so this is readable even for a sheet whose
   * `cssRules` throws. The owner-node attribute is the documented fallback for
   * any build where `media` is missing.
   *
   * Task 28.6 C2.2 — `unreadable` is the honesty channel for the double-catch.
   * Before it, a sheet whose media list could not be read AT ALL (both the
   * `media` accessor and the owner node refused) returned `""`, which the caller
   * could not tell apart from a genuinely unmediated sheet: every rule in it was
   * then recorded UNCONDITIONALLY and counted in neither `sheetsMediaScoped` nor
   * `sheetsMediaTrivial` — a silent skip producing a confident wrong value. The
   * recorded condition is unchanged (there is nothing better to record), but the
   * caller can now count it and a consumer can refuse it.
   */
  const readSheetMedia = (
    sheet: CSSStyleSheet,
  ): { condition: string; trivial: boolean; unreadable: boolean } => {
    let mediaText = "";
    let primaryRead = false;
    let fallbackRead = false;
    try {
      mediaText = sheet.media && sheet.media.mediaText ? sheet.media.mediaText : "";
      primaryRead = true;
    } catch {
      mediaText = "";
    }
    if (mediaText === "") {
      try {
        const owner = sheet.ownerNode as Element | null;
        if (owner && typeof (owner as Element).getAttribute === "function") {
          mediaText = (owner as Element).getAttribute("media") ?? "";
          fallbackRead = true;
        }
      } catch {
        mediaText = "";
      }
    }
    return {
      ...sheetMediaCondition(mediaText),
      unreadable: !primaryRead && !fallbackRead,
    };
  };

  // Every document sheet resolved ONCE, in order, so the two consumers below
  // (the layout index and the custom-property harvest) share one set of
  // counters and one recovery attempt per sheet.
  interface ResolvedSheet {
    rules: CSSRuleList | null;
    fetched: boolean;
    /** Sheet-level `@media` scope, `""` when the sheet applies unconditionally. */
    media: string;
    /**
     * Task 28.6 W6 O4 — the sheet's OWN href, or `null` for an inline
     * `<style>` / constructed sheet whose base is the document. Relative
     * `url()` inside the sheet resolves against THIS, never against the
     * document.
     */
    href: string | null;
  }
  // Responsive Core P0 §C1.5 — one entry per `document.styleSheets[s]`, pushed
  // in order, so the array position IS the sheet index recorded as `sheetIndex`.
  const resolvedSheets: ResolvedSheet[] = [];
  if (!subtreeMode) {
    for (let s = 0; s < document.styleSheets.length; s++) {
      coverage.stylesheetsTotal++;
      const sheet = document.styleSheets[s]!;
      const read = readSheetMedia(sheet);
      const sheetMedia = read.condition;
      // Counted BEFORE the classification below: an unreadable list is recorded
      // unconditionally, so without this counter it is indistinguishable from a
      // sheet that genuinely carries no media list (Task 28.6 C2.2).
      if (read.unreadable) coverage.sheetsMediaUnreadable++;
      if (sheetMedia !== "") coverage.sheetsMediaScoped++;
      else if (read.trivial) coverage.sheetsMediaTrivial++;
      let rules: CSSRuleList | null = null;
      let blocked = false;
      // `.href` is readable even on a CORS-blocked sheet, and it is the base a
      // relative `url()` inside that sheet resolves against (Task 28.6 W6 O4).
      let sheetHref: string | null = null;
      try {
        sheetHref = sheet.href;
      } catch {
        sheetHref = null;
      }
      try {
        rules = sheet.cssRules;
      } catch {
        blocked = true;
      }
      if (!blocked) {
        coverage.cssomReadable++;
        resolvedSheets.push({ rules, fetched: false, media: sheetMedia, href: sheetHref });
        continue;
      }
      coverage.cssomBlocked++;
      const css = sheetHref !== null ? extraSheetCss[sheetHref] : undefined;
      const recovered = css !== undefined ? parseRecovered(css) : null;
      if (recovered) {
        coverage.fallbackRecovered++;
        resolvedSheets.push({
          rules: recovered,
          fetched: true,
          media: sheetMedia,
          href: sheetHref,
        });
      } else {
        coverage.fallbackMissed++;
        resolvedSheets.push({
          rules: null,
          fetched: false,
          media: sheetMedia,
          href: sheetHref,
        });
      }
    }
  }

  const layoutProps =
    !subtreeMode &&
    config.layoutRuleProperties &&
    config.layoutRuleProperties.length > 0
      ? config.layoutRuleProperties
      : null;
  const layoutRuleIndex: LayoutRuleEntry[] = [];
  // Responsive Core P0 §C1.5 — full dotted layer name → cascade layer position.
  const layerOrderByName: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  if (layoutProps) {
    const maxRules = config.maxLayoutRules ?? 2000;
    const selectorMax = config.layoutRuleSelectorMaxLen ?? 200;
    const valueMax = config.layoutRuleValueMaxLen ?? 200;
    // CSS nesting can go arbitrarily deep; the index does not need to.
    const maxNestDepth = 6;

    // `@supports` / `@container` only. The MEDIA chain uses `joinMedia` below,
    // because a media list is a disjunction and plain concatenation onto one is
    // logically wrong (Task 28.6 C2.1). `@supports` conditions carry no
    // top-level comma, so concatenation is correct there.
    const joinAnd = (existing: string | undefined, next: string): string =>
      existing !== undefined && existing !== "" ? existing + " and " + next : next;
    const joinLayer = (existing: string | undefined, next: string): string =>
      existing !== undefined && existing !== "" ? existing + "." + next : next;

    /** Split a selector LIST on top-level commas only (`:is(a, b)` stays whole). */
    const splitSelectorList = (text: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let quote = "";
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (quote !== "") {
          if (ch === "\\") i++;
          else if (ch === quote) quote = "";
          continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth = depth > 0 ? depth - 1 : 0;
        else if (ch === "," && depth === 0) {
          parts.push(text.slice(start, i));
          start = i + 1;
        }
      }
      parts.push(text.slice(start));
      return parts;
    };

    /** A media LIST split on top-level commas, trimmed, empties dropped. */
    const splitMediaList = (text: string): string[] => {
      const out: string[] = [];
      const parts = splitSelectorList(text);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!.trim();
        if (part !== "") out.push(part);
      }
      return out;
    };

    /**
     * Task 28.6 C2.1 — conjoin two media conditions, DISTRIBUTING over commas.
     *
     * A media list is a DISJUNCTION of queries, so `joinAnd` was logically wrong
     * the moment either side carried a top-level comma. MEASURED instance: a
     * sheet with `media="print, speech"` holding a nested
     * `@media (min-width: 700px)` produced `"print, speech and (min-width: 700px)"`,
     * which reads as `print OR (speech AND width)`. The truth is
     * `(print OR speech) AND width`.
     *
     * So the two lists are multiplied out: every LEFT alternative is conjoined
     * with every RIGHT alternative and the results are re-joined with `", "`.
     * The output is therefore still a comma list — the alternatives form the
     * SiteSpec consumer already supports — and a single-alternative join is
     * byte-identical to what `joinAnd` produced, so nothing that was already
     * right changes.
     *
     * KNOWN REMAINING APPROXIMATION, counted not hidden: a `not`-prefixed
     * alternative cannot be conjoined at all. `not screen` AND `(min-width:700px)`
     * has no single-query spelling — Media Queries 4 allows `not` only in front
     * of a whole query or a parenthesized condition, and a media TYPE may not
     * appear inside `<media-in-parens>` — and the verbatim conjunction
     * `not screen and (min-width: 700px)` parses as `NOT (screen AND width)`.
     * The verbatim conjunction is what gets recorded (there is no better
     * spelling), and every join that touches such an alternative is counted in
     * `mediaConditionsNegated` so a consumer can refuse the observation's media
     * strings instead of trusting them.
     */
    const joinMedia = (existing: string | undefined, next: string): string => {
      if (existing === undefined || existing === "") return next;
      const left = splitMediaList(existing);
      const right = splitMediaList(next);
      if (left.length === 0) return next;
      if (right.length === 0) return existing;
      const negated = (q: string): boolean =>
        q.slice(0, 4).toLowerCase() === "not ";
      if (left.some(negated) || right.some(negated)) {
        coverage.mediaConditionsNegated++;
      }
      if (left.length > 1 || right.length > 1) {
        coverage.mediaConditionsDistributed++;
      }
      const out: string[] = [];
      for (let i = 0; i < left.length; i++) {
        for (let j = 0; j < right.length; j++) {
          out.push(left[i]! + " and " + right[j]!);
        }
      }
      return out.join(", ");
    };

    /**
     * Resolve a CSS-NESTING child selector against its parent. `&` is replaced
     * by `:is(parent)`; a relative selector with no `&` is a descendant of the
     * parent, exactly as CSS nesting defines it. If the result is not a selector
     * the engine accepts, `element.matches` throws at match time and the entry
     * simply matches nothing — a nested rule can never widen what is recorded.
     */
    const nestSelector = (parent: string | undefined, nested: string): string => {
      if (parent === undefined) return nested;
      const parentIs = ":is(" + parent + ")";
      const out: string[] = [];
      const parts = splitSelectorList(nested);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!.trim();
        if (part === "") continue;
        out.push(
          part.indexOf("&") >= 0
            ? part.split("&").join(parentIs)
            : parentIs + " " + part,
        );
      }
      return out.length > 0 ? out.join(", ") : parent;
    };

    interface RuleContext {
      media?: string;
      supports?: string;
      container?: string;
      layer?: string;
      /** Selector of the enclosing style rule, for CSS nesting. */
      parentSelector?: string;
      fetched: boolean;
      depth: number;
      /** Responsive Core P0 §C1.5 — owning top-level sheet index. */
      sheetIndex: number;
      /** Each `@supports` condition in the chain (for `CSS.supports`). */
      supportsParts?: string[];
    }

    /*
     * Responsive Core P0 §C1.5 — CASCADE LAYER ORDER.
     *
     * Layers form a tree (`@layer a { @layer b {} }` is `a.b`). Each name is
     * registered at its FIRST appearance — a `@layer a, b;` statement, a layer
     * block, or an `@import … layer(x)` — and anonymous layers get a unique
     * name. The final order is a post-order walk: a sub-layer precedes its
     * parent's own rules, and siblings keep first-appearance order (Cascade 5).
     */
    interface LayerNode {
      children: string[];
      byName: Record<string, LayerNode>;
    }
    const layerRoot: LayerNode = {
      children: [],
      byName: Object.create(null) as Record<string, LayerNode>,
    };
    let anonymousLayerCount = 0;
    const anonymousLayerName = (): string => {
      anonymousLayerCount++;
      return "(anonymous-" + String(anonymousLayerCount) + ")";
    };
    const registerLayer = (fullName: string): void => {
      const segments = fullName.split(".");
      let node = layerRoot;
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!.trim();
        if (segment === "") continue;
        let next = node.byName[segment];
        if (next === undefined) {
          next = {
            children: [],
            byName: Object.create(null) as Record<string, LayerNode>,
          };
          node.byName[segment] = next;
          node.children.push(segment);
        }
        node = next;
      }
    };
    let ruleOrderCounter = 0;

    /*
     * Review fix m2 — does the enclosing `@media` / `@supports` chain apply at
     * capture? Chromium ignores `@layer` statements AND layer blocks inside a
     * non-applying condition for layer ORDER (verified in Chromium 151), so
     * registering them would put a layer in the wrong position.
     */
    const layerContextApplies = (ctx: { media?: string; supportsParts?: string[] }): boolean => {
      if (ctx.media !== undefined && ctx.media !== "" && typeof matchMedia === "function") {
        try {
          if (!matchMedia(ctx.media).matches) return false;
        } catch {
          // An unevaluable condition is not evidence that it does not apply.
        }
      }
      const parts = ctx.supportsParts ?? [];
      for (let p = 0; p < parts.length; p++) {
        try {
          if (!CSS.supports(parts[p]!)) return false;
        } catch {
          // As above.
        }
      }
      return true;
    };

    const record = (
      selectorText: string,
      style: CSSStyleDeclaration,
      ctx: RuleContext,
    ): void => {
      // Counted for EVERY style rule visited, indexed or not, so the value is a
      // true cascade source-order position (Responsive Core P0 §C1.5).
      const ruleOrder = ruleOrderCounter++;
      const declarations: LayoutRuleEntry["declarations"] = [];
      for (const property of layoutProps) {
        const value = style.getPropertyValue(property);
        if (!value || value.trim() === "" || value.length > valueMax) continue;
        const important = style.getPropertyPriority(property) === "important";
        declarations.push({
          property,
          value: value.trim(),
          ...(important ? { important: true } : {}),
        });
      }
      if (declarations.length === 0) return;
      layoutRuleIndex.push({
        matchSelector: selectorText,
        selector:
          selectorText.length > selectorMax
            ? selectorText.slice(0, selectorMax)
            : selectorText,
        ...(ctx.media !== undefined ? { media: ctx.media } : {}),
        ...(ctx.supports !== undefined ? { supports: ctx.supports } : {}),
        ...(ctx.container !== undefined ? { container: ctx.container } : {}),
        ...(ctx.layer !== undefined ? { layer: ctx.layer } : {}),
        ...(ctx.fetched ? { origin: "fetched" as const } : {}),
        declarations,
        sheetIndex: ctx.sheetIndex,
        ruleOrder,
        ...(ctx.supportsParts !== undefined && ctx.supportsParts.length > 0
          ? { supportsParts: ctx.supportsParts }
          : {}),
      });
    };

    const visit = (rules: CSSRuleList, ctx: RuleContext): void => {
      for (let i = 0; i < rules.length; i++) {
        if (layoutRuleIndex.length >= maxRules) {
          coverage.ruleIndexCapHit = true;
          return;
        }
        const rule = rules[i] as CSSRule & {
          selectorText?: string;
          style?: CSSStyleDeclaration;
          cssRules?: CSSRuleList;
          conditionText?: string;
          containerName?: string;
          containerQuery?: string;
          name?: string;
          href?: string;
          media?: MediaList;
          styleSheet?: CSSStyleSheet;
          parentStyleSheet?: CSSStyleSheet | null;
          layerName?: string | null;
          nameList?: ArrayLike<string>;
        };
        // `CSSRule.type` is legacy and cannot tell these apart (verified in
        // Chromium 151: container and layer rules both report 0), so the kind
        // is the constructor name, exactly as the @font-face harvest does.
        const kind =
          rule.constructor && rule.constructor.name ? rule.constructor.name : "";

        // @import — the rule exposes `.styleSheet`, never `.cssRules`, so both
        // pre-28.6 visitors walked straight past it.
        if (kind === "CSSImportRule" || (kind === "" && rule.styleSheet !== undefined)) {
          coverage.importRulesVisited++;
          const mediaText =
            rule.media && rule.media.mediaText ? rule.media.mediaText : "";
          // Responsive Core P0 §C1.5 — `@import url(…) layer(x)` puts every
          // imported rule in layer x (`layer` alone = a fresh anonymous layer).
          let importLayer: string | undefined;
          if (typeof rule.layerName === "string") {
            importLayer = joinLayer(
              ctx.layer,
              rule.layerName !== "" ? rule.layerName : anonymousLayerName(),
            );
            registerLayer(importLayer);
          }
          const nextCtx: RuleContext = {
            ...ctx,
            ...(mediaText !== "" ? { media: joinMedia(ctx.media, mediaText) } : {}),
            ...(importLayer !== undefined ? { layer: importLayer } : {}),
          };
          let imported: CSSRuleList | null = null;
          let importFetched = false;
          try {
            imported = rule.styleSheet ? rule.styleSheet.cssRules : null;
          } catch {
            imported = null; // the imported sheet is cross-origin too
          }
          if (!imported && rule.href !== undefined) {
            let absolute = "";
            try {
              const base =
                rule.parentStyleSheet && rule.parentStyleSheet.href
                  ? rule.parentStyleSheet.href
                  : document.baseURI;
              absolute = new URL(rule.href, base).href;
            } catch {
              absolute = "";
            }
            const css = absolute !== "" ? extraSheetCss[absolute] : undefined;
            if (css !== undefined) {
              imported = parseRecovered(css);
              importFetched = imported !== null;
            }
          }
          if (imported) {
            coverage.importRulesFollowed++;
            if (importFetched) coverage.importRulesRecovered++;
            visit(imported, {
              ...nextCtx,
              fetched: ctx.fetched || importFetched,
            });
          } else {
            // Task 28.6 W6 O2 — the skip that used to be silent. The imported
            // sheet is cross-origin with no captured body, its href would not
            // resolve, or the recovered text would not parse. Either way the
            // page's CSS is incompletely indexed and a caller must be able to
            // see it: on gs.severance.healthcare 93.9% of the page's CSS lives
            // behind an `@import`, so one unresolved import can be most of the
            // stylesheet.
            coverage.importRulesUnresolved++;
          }
          continue;
        }

        // A style rule (possibly with CSS-nesting children of its own).
        if (rule.selectorText !== undefined && rule.style) {
          const selectorText = nestSelector(ctx.parentSelector, rule.selectorText);
          record(selectorText, rule.style, ctx);
          if (rule.cssRules && rule.cssRules.length > 0 && ctx.depth < maxNestDepth) {
            coverage.nestedRulesVisited++;
            visit(rule.cssRules, {
              ...ctx,
              parentSelector: selectorText,
              depth: ctx.depth + 1,
            });
          }
          continue;
        }

        // CSSNestedDeclarations: bare declarations inside a nested grouping
        // rule. They belong to the enclosing style rule's selector.
        if (
          rule.style &&
          rule.selectorText === undefined &&
          !rule.cssRules &&
          ctx.parentSelector !== undefined &&
          (kind === "CSSNestedDeclarations" || kind === "")
        ) {
          record(ctx.parentSelector, rule.style, ctx);
          continue;
        }

        // Responsive Core P0 §C1.5 — `@layer a, b;` declares layer ORDER and
        // holds no rules; it must be seen before the cssRules gate below.
        if (kind === "CSSLayerStatementRule") {
          const names = rule.nameList;
          if (names && !layerContextApplies(ctx)) {
            coverage.cascadeLayersConditionalSkipped++;
          } else if (names) {
            for (let n = 0; n < names.length; n++) {
              const layerName = names[n];
              if (typeof layerName === "string" && layerName !== "") {
                registerLayer(joinLayer(ctx.layer, layerName));
              }
            }
          }
          continue;
        }

        if (!rule.cssRules) continue;

        // Grouping rules. Each kind carries its own condition; only `@media`
        // may touch the media chain.
        if (kind === "CSSMediaRule") {
          const condition =
            rule.conditionText !== undefined && rule.conditionText !== ""
              ? rule.conditionText
              : rule.media && rule.media.mediaText
                ? rule.media.mediaText
                : "";
          const joined = condition !== "" ? joinMedia(ctx.media, condition) : "";
          // Task 28.6 C3 D1 — the condition is tallied HERE, where the `@media`
          // block is entered, not at `record()`: a breakpoint the page authors
          // is authored whether or not the block happens to carry one of the
          // layout properties this index keeps.
          if (joined !== "") tallyAuthoredMedia(joined);
          visit(rule.cssRules, {
            ...ctx,
            ...(joined !== "" ? { media: joined } : {}),
          });
        } else if (kind === "CSSSupportsRule") {
          const condition = rule.conditionText ?? "";
          visit(rule.cssRules, {
            ...ctx,
            ...(condition !== ""
              ? {
                  supports: joinAnd(ctx.supports, condition),
                  supportsParts: [...(ctx.supportsParts ?? []), condition],
                }
              : {}),
          });
        } else if (kind === "CSSContainerRule") {
          const query =
            rule.containerQuery !== undefined && rule.containerQuery !== ""
              ? rule.containerQuery
              : (rule.conditionText ?? "");
          const named =
            rule.containerName !== undefined && rule.containerName !== ""
              ? rule.containerName + " " + query
              : query;
          visit(rule.cssRules, {
            ...ctx,
            ...(named !== "" ? { container: joinAnd(ctx.container, named) } : {}),
          });
        } else if (kind === "CSSLayerBlockRule") {
          // Responsive Core P0 §C1.5 — an anonymous `@layer { … }` is a real,
          // unique layer (it used to be recorded as unlayered).
          const name =
            rule.name !== undefined && rule.name !== "" ? rule.name : anonymousLayerName();
          const full = joinLayer(ctx.layer, name);
          if (layerContextApplies(ctx)) registerLayer(full);
          else coverage.cascadeLayersConditionalSkipped++;
          visit(rule.cssRules, { ...ctx, layer: full });
        } else if (
          kind === "CSSKeyframesRule" ||
          kind === "CSSFontFeatureValuesRule" ||
          kind === "CSSFontPaletteValuesRule" ||
          kind === "CSSCounterStyleRule"
        ) {
          // Holds no rule that can match an element. Not a coverage gap.
          continue;
        } else {
          // `@scope`, `@starting-style`, or a rule this build does not model.
          // Descending would record its declarations as unconditional — the
          // exact wrong-value bug W1.2 removes — so it is skipped and COUNTED.
          coverage.groupingRulesSkipped++;
        }
      }
    };

    for (let s = 0; s < resolvedSheets.length; s++) {
      const entry = resolvedSheets[s]!;
      if (!entry.rules) continue;
      // Task 28.6 C1.1 — the sheet's OWN media list is the outermost condition
      // every rule in it sits under, so it seeds the root context rather than
      // being lost the way it was before this correction.
      if (entry.media !== "") tallyAuthoredMedia(entry.media);
      visit(entry.rules, {
        fetched: entry.fetched,
        depth: 0,
        sheetIndex: s,
        ...(entry.media !== "" ? { media: entry.media } : {}),
      });
    }
    coverage.rulesIndexed = layoutRuleIndex.length;
    // Responsive Core P0 §C1.5 — post-order layer positions (see LayerNode).
    let layerPosition = 0;
    const assignLayerOrder = (node: LayerNode, prefix: string): void => {
      for (let c = 0; c < node.children.length; c++) {
        const childName = node.children[c]!;
        const key = prefix === "" ? childName : prefix + "." + childName;
        assignLayerOrder(node.byName[childName]!, key);
        layerOrderByName[key] = layerPosition++;
      }
    };
    assignLayerOrder(layerRoot, "");
    coverage.cascadeLayers = layerPosition;
    // Deterministic emission order: weight first, then the condition text, so
    // two runs of the same page produce byte-identical arrays and the
    // probe-width derivation downstream cannot depend on hash order.
    const tallyKeys: string[] = [];
    for (const key in authoredMediaTally) tallyKeys.push(key);
    tallyKeys.sort();
    coverage.authoredMediaConditions = tallyKeys
      .map((condition) => ({ condition, count: authoredMediaTally[condition]! }))
      .sort((a, b) =>
        a.count !== b.count
          ? b.count - a.count
          : a.condition < b.condition
            ? -1
            : a.condition > b.condition
              ? 1
              : 0,
      );
  }
  const maxMatchedPerElement = config.maxMatchedRulesPerElement ?? 32;
  const maxMatchedPerProperty =
    config.maxMatchedRulesPerProperty !== undefined && config.maxMatchedRulesPerProperty > 0
      ? config.maxMatchedRulesPerProperty
      : maxMatchedPerElement;

  /*
   * Responsive Core P0 §C1.5 — SELECTOR SPECIFICITY (Selectors Level 4), in page.
   *
   * [a, b, c] = ids / classes + attributes + pseudo-classes / types +
   * pseudo-elements. `:where()` contributes 0; `:is()`, `:not()`, `:has()`
   * (and the legacy `:matches()` / `:-webkit-any()` / `:any()`) contribute the
   * max of their argument list; `:nth-child(… of S)` / `:nth-last-child(… of S)`
   * contribute one pseudo-class plus max(S); `:host()` / `:host-context()` one
   * pseudo-class plus their argument; `::slotted()` one pseudo-element plus its
   * argument. Anything this scanner does not understand makes the result
   * `null` ("not computable") — never a guessed number.
   */
  const splitTopLevelCommas = (text: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let quote = "";
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      if (quote !== "") {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth = depth > 0 ? depth - 1 : 0;
      else if (ch === "," && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  };
  const specificityCache: Record<string, [number, number, number] | null> =
    Object.create(null) as Record<string, [number, number, number] | null>;
  const specificityOf = (selectorText: string): [number, number, number] | null => {
    const cached = specificityCache[selectorText];
    if (cached !== undefined) return cached;
    const isIdentChar = (code: number): boolean =>
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 45 ||
      code === 95 ||
      code >= 128;
    const compute = (text: string, depthLeft: number): [number, number, number] | null => {
      if (depthLeft <= 0) return null;
      let a = 0;
      let b = 0;
      let c = 0;
      let i = 0;
      const n = text.length;
      const readIdent = (): string => {
        let out = "";
        while (i < n) {
          const code = text.charCodeAt(i);
          if (code === 92) {
            // `\` escape: hex (up to 6, one optional whitespace) or one char.
            i++;
            let hex = "";
            while (i < n && hex.length < 6 && /[0-9a-fA-F]/.test(text.charAt(i))) {
              hex += text.charAt(i);
              i++;
            }
            if (hex !== "") {
              if (i < n && /\s/.test(text.charAt(i))) i++;
              out += "?";
            } else if (i < n) {
              out += text.charAt(i);
              i++;
            }
            continue;
          }
          if (!isIdentChar(code)) break;
          out += text.charAt(i);
          i++;
        }
        return out;
      };
      const readBalanced = (): string | null => {
        // `text[i]` is "(" — return the inside, leave `i` after ")".
        let depth = 0;
        let quote = "";
        const begin = i + 1;
        for (; i < n; i++) {
          const ch = text.charAt(i);
          if (quote !== "") {
            if (ch === "\\") i++;
            else if (ch === quote) quote = "";
            continue;
          }
          if (ch === "\\") {
            i++;
            continue;
          }
          if (ch === '"' || ch === "'") quote = ch;
          else if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              const inside = text.slice(begin, i);
              i++;
              return inside;
            }
          }
        }
        return null;
      };
      const maxOfList = (list: string): [number, number, number] | null => {
        const parts = splitTopLevelCommas(list);
        let best: [number, number, number] | null = null;
        for (let p = 0; p < parts.length; p++) {
          const part = parts[p]!.trim();
          if (part === "") continue;
          const spec = compute(part, depthLeft - 1);
          if (spec === null) return null;
          if (
            best === null ||
            spec[0] > best[0] ||
            (spec[0] === best[0] &&
              (spec[1] > best[1] || (spec[1] === best[1] && spec[2] > best[2])))
          ) {
            best = spec;
          }
        }
        return best ?? [0, 0, 0];
      };
      const legacyPseudoElements = ["before", "after", "first-line", "first-letter"];
      while (i < n) {
        const ch = text.charAt(i);
        if (/\s/.test(ch) || ch === ">" || ch === "+" || ch === "~") {
          i++;
          continue;
        }
        if (ch === "|") {
          i++; // namespace separator (`ns|div`, `*|div`, `||` column combinator)
          continue;
        }
        if (ch === "*") {
          i++;
          continue;
        }
        if (ch === "#") {
          i++;
          if (readIdent() === "") return null;
          a++;
          continue;
        }
        if (ch === ".") {
          i++;
          if (readIdent() === "") return null;
          b++;
          continue;
        }
        if (ch === "[") {
          let quote = "";
          let closed = false;
          for (i++; i < n; i++) {
            const inner = text.charAt(i);
            if (quote !== "") {
              if (inner === "\\") i++;
              else if (inner === quote) quote = "";
              continue;
            }
            if (inner === "\\") {
              i++;
              continue;
            }
            if (inner === '"' || inner === "'") quote = inner;
            else if (inner === "]") {
              closed = true;
              i++;
              break;
            }
          }
          if (!closed) return null;
          b++;
          continue;
        }
        if (ch === ":") {
          const pseudoElement = text.charAt(i + 1) === ":";
          i += pseudoElement ? 2 : 1;
          const name = readIdent().toLowerCase();
          if (name === "") return null;
          let args: string | null = null;
          if (text.charAt(i) === "(") {
            args = readBalanced();
            if (args === null) return null;
          }
          if (pseudoElement) {
            c++;
            if (args !== null && name === "slotted") {
              const inner = maxOfList(args);
              if (inner === null) return null;
              a += inner[0];
              b += inner[1];
              c += inner[2];
            }
            continue;
          }
          if (args === null) {
            if (legacyPseudoElements.indexOf(name) >= 0) c++;
            else b++;
            continue;
          }
          if (name === "where") continue;
          if (
            name === "is" ||
            name === "not" ||
            name === "has" ||
            name === "matches" ||
            name === "any" ||
            name === "-webkit-any"
          ) {
            const inner = maxOfList(args);
            if (inner === null) return null;
            a += inner[0];
            b += inner[1];
            c += inner[2];
            continue;
          }
          b++;
          if (name === "nth-child" || name === "nth-last-child") {
            const ofMatch = /\sof\s/i.exec(args);
            if (ofMatch) {
              const inner = maxOfList(args.slice(ofMatch.index + ofMatch[0].length));
              if (inner === null) return null;
              a += inner[0];
              b += inner[1];
              c += inner[2];
            }
            continue;
          }
          if (name === "host" || name === "host-context") {
            const inner = maxOfList(args);
            if (inner === null) return null;
            a += inner[0];
            b += inner[1];
            c += inner[2];
          }
          continue;
        }
        const code = text.charCodeAt(i);
        if (isIdentChar(code) || code === 92) {
          if (readIdent() === "") return null;
          c++;
          continue;
        }
        // `&` outside a resolved nesting context, `%`, or anything unknown.
        return null;
      }
      return [a, b, c];
    };
    const result = compute(selectorText.trim(), 32);
    specificityCache[selectorText] = result;
    return result;
  };

  /** Specificity of the most specific selector in `entry` that matches `el`. */
  const matchedSpecificity = (
    entry: LayoutRuleEntry,
    el: Element,
  ): [number, number, number] | null => {
    if (entry.parts === undefined) {
      entry.parts = splitTopLevelCommas(entry.matchSelector)
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => ({ selector: part, specificity: specificityOf(part) }));
    }
    const parts = entry.parts;
    if (parts.length === 1) return parts[0]!.specificity;
    let best: [number, number, number] | null = null;
    let anyMatched = false;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p]!;
      let applies = false;
      try {
        applies = el.matches(part.selector);
      } catch {
        applies = false;
      }
      if (!applies) continue;
      anyMatched = true;
      const spec = part.specificity;
      if (spec === null) return null;
      if (
        best === null ||
        spec[0] > best[0] ||
        (spec[0] === best[0] &&
          (spec[1] > best[1] || (spec[1] === best[1] && spec[2] > best[2])))
      ) {
        best = spec;
      }
    }
    return anyMatched ? best : null;
  };

  const supportsCache: Record<string, boolean> = Object.create(null) as Record<
    string,
    boolean
  >;
  const supportsMatchesOf = (parts: string[]): boolean => {
    for (let p = 0; p < parts.length; p++) {
      const condition = parts[p]!;
      let result = supportsCache[condition];
      if (result === undefined) {
        try {
          result = CSS.supports(condition);
        } catch {
          result = false;
        }
        supportsCache[condition] = result;
      }
      if (!result) return false;
    }
    return true;
  };

  const mediaCache: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  const mediaMatchesOf = (media: string): boolean => {
    let result = mediaCache[media];
    if (result === undefined) {
      try {
        result = typeof matchMedia === "function" ? matchMedia(media).matches : true;
      } catch {
        result = true; // unevaluable: never treated as "does not apply"
      }
      mediaCache[media] = result;
    }
    return result;
  };

  function collectMatchedLayoutRules(el: Element): {
    matched: NonNullable<RawElement["matchedLayoutRules"]>;
    truncated: boolean;
    matchedCount: number;
  } {
    type Matched = NonNullable<RawElement["matchedLayoutRules"]>[number];
    /*
     * Responsive Core P0 §C1.5 — COLLECT ALL, THEN RANK, THEN CAP.
     *
     * The pre-P0 loop `break`-ed at the cap while walking the index in sheet
     * order, so the declarations it dropped were the LATEST — the cascade
     * winners. Every match is gathered first; `seq` is its position in index
     * order (= cascade source order, declarations within a rule in property
     * order), which is also the emission order of whatever is kept.
     */
    /*
     * Review fix M2 — `tier` is whether the rule's conditions apply at the
     * capture width: 0 = every `@media` / `@supports` condition applies and no
     * `@container` condition, 1 = applies except for a container condition
     * this collector cannot evaluate, 2 = a condition does not apply. The cap
     * keeps lower tiers first, so a base declaration that WINS at the capture
     * width can never be cut in favour of 8 breakpoint variants that do not
     * apply.
     */
    const all: { rule: Matched; seq: number; tier: 0 | 1 | 2 }[] = [];
    for (const entry of layoutRuleIndex) {
      let applies = false;
      try {
        applies = el.matches(entry.matchSelector);
      } catch {
        continue; // a selector the engine rejects matches nothing
      }
      if (!applies) continue;
      const specificity = matchedSpecificity(entry, el);
      const layerOrder =
        entry.layer !== undefined ? layerOrderByName[entry.layer] : undefined;
      const supportsMatches =
        entry.supportsParts !== undefined ? supportsMatchesOf(entry.supportsParts) : undefined;
      const conditionsApply =
        supportsMatches !== false && (entry.media === undefined || mediaMatchesOf(entry.media));
      const tier: 0 | 1 | 2 = !conditionsApply ? 2 : entry.container !== undefined ? 1 : 0;
      for (const declaration of entry.declarations) {
        if (specificity === null) coverage.specificityUncomputable++;
        all.push({
          seq: all.length,
          tier,
          rule: {
            property: declaration.property,
            value: declaration.value,
            ...(entry.media !== undefined ? { media: entry.media } : {}),
            ...(entry.supports !== undefined ? { supports: entry.supports } : {}),
            ...(entry.container !== undefined ? { container: entry.container } : {}),
            ...(entry.layer !== undefined ? { layer: entry.layer } : {}),
            ...(entry.origin !== undefined ? { origin: entry.origin } : {}),
            selector: entry.selector,
            ...(declaration.important ? { important: true } : {}),
            sheetIndex: entry.sheetIndex,
            ruleOrder: entry.ruleOrder,
            ...(specificity !== null ? { specificity } : {}),
            ...(layerOrder !== undefined ? { layerOrder } : {}),
            ...(supportsMatches !== undefined ? { supportsMatches } : {}),
          },
        });
      }
    }

    type Item = (typeof all)[number];
    const byProperty: Record<string, Item[]> = Object.create(null) as Record<string, Item[]>;
    const propertyOrder: string[] = [];
    let perPropertyOverflow = false;
    for (const item of all) {
      let group = byProperty[item.rule.property];
      if (group === undefined) {
        group = [];
        byProperty[item.rule.property] = group;
        propertyOrder.push(item.rule.property);
      }
      group.push(item);
      if (group.length > maxMatchedPerProperty) perPropertyOverflow = true;
    }
    if (!perPropertyOverflow && all.length <= maxMatchedPerElement) {
      return { matched: all.map((item) => item.rule), truncated: false, matchedCount: all.length };
    }

    // Applicability first (M2), then cascade precedence, DESCENDING
    // (negative = `x` is kept before `y`).
    const precedence = (x: Item, y: Item): number => {
      if (x.tier !== y.tier) return x.tier - y.tier;
      const xi = x.rule.important === true;
      const yi = y.rule.important === true;
      if (xi !== yi) return xi ? -1 : 1;
      // Unlayered = +Infinity. Normal: later layer wins, unlayered strongest.
      // Important: the order inverts — earlier layer wins, unlayered weakest.
      const xl = x.rule.layerOrder !== undefined ? x.rule.layerOrder : Infinity;
      const yl = y.rule.layerOrder !== undefined ? y.rule.layerOrder : Infinity;
      if (xl !== yl) {
        if (xi) return xl < yl ? -1 : 1;
        return xl > yl ? -1 : 1;
      }
      // Not computable = treated as maximal, so a declaration whose rank is
      // unknown is kept rather than cut in favour of one that is known.
      const xs = x.rule.specificity ?? [Infinity, Infinity, Infinity];
      const ys = y.rule.specificity ?? [Infinity, Infinity, Infinity];
      for (let k = 0; k < 3; k++) {
        if (xs[k] !== ys[k]) return xs[k]! > ys[k]! ? -1 : 1;
      }
      return y.seq - x.seq; // later in source order wins
    };
    const ranked: Item[][] = [];
    for (const property of propertyOrder) {
      const group = byProperty[property]!.slice().sort(precedence);
      ranked.push(group.slice(0, maxMatchedPerProperty));
    }
    // Element total: within each applicability tier, take rank 0 of every
    // property, then rank 1, … so each property keeps its strongest
    // declarations before any property keeps a weaker one, and no
    // non-applying declaration is kept while an applying one is cut.
    const kept: Item[] = [];
    for (let tier = 0; tier <= 2 && kept.length < maxMatchedPerElement; tier++) {
      const tiered = ranked.map((group) => group.filter((item) => item.tier === tier));
      for (let rank = 0; rank < maxMatchedPerProperty && kept.length < maxMatchedPerElement; rank++) {
        for (let g = 0; g < tiered.length && kept.length < maxMatchedPerElement; g++) {
          const item = tiered[g]![rank];
          if (item !== undefined) kept.push(item);
        }
      }
    }
    const keptSet = new Set(kept);
    for (const item of all) {
      if (keptSet.has(item)) continue;
      if (item.tier === 0) coverage.layoutRulesDroppedApplying++;
      else coverage.layoutRulesDroppedNonApplying++;
    }
    kept.sort((x, y) => x.seq - y.seq);
    return {
      matched: kept.map((item) => item.rule),
      truncated: kept.length < all.length,
      matchedCount: all.length,
    };
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

  /*
   * Task 28.6 C2 B4/B5 — the two page-mode censuses, prepared before the walk
   * so each element costs one extra arithmetic pass over the `cs`/`rect` the
   * walk already computed. Both are page-mode only: a bounded-subtree capture is
   * not a page observation, and neither a viewport nor a document belongs to it.
   */
  const paintOpacityThreshold = config.paintOpacityThreshold ?? 0.05;
  const paint: RawPaintSuppression = {
    sizedElements: 0,
    suppressedElements: 0,
    suppressedByOpacity: 0,
    suppressedByVisibility: 0,
    suppressedByAncestor: 0,
    suppressedBelowFold: 0,
    opacityThreshold: paintOpacityThreshold,
    scrollRevealMarked: 0,
    scrollRevealAvailable: false,
  };

  /**
   * The scroll-reveal hand-off: elements the preparation auto-scroll saw paint
   * during the scroll and stop painting after the return to the top, with the
   * highest opacity it measured on each. Read-only; a missing key simply means
   * no preparation scroll ran on this load.
   */
  const revealedOpacityByElement = new Map<Element, number>();
  if (!subtreeMode && config.scrollRevealStateKey) {
    try {
      const handoff = (window as unknown as Record<string, unknown>)[
        config.scrollRevealStateKey
      ] as { regressed?: Element[]; regressedOpacity?: number[] } | undefined;
      if (handoff && handoff.regressed) {
        paint.scrollRevealAvailable = true;
        const opacities = handoff.regressedOpacity ?? [];
        for (let i = 0; i < handoff.regressed.length; i++) {
          const el = handoff.regressed[i];
          if (el) revealedOpacityByElement.set(el, opacities[i] ?? 1);
        }
      }
    } catch {
      // A hand-off that cannot be read is simply absent; never fatal.
    }
  }

  /**
   * The initial-paint census: which elements existed, and which PAINTED, right
   * after `load` and before any stabilization. The only time-based discriminator
   * the overlay census has, and the reason it can tell "appeared later" from
   * "was always there".
   */
  let initialPresent: { has: (el: Element) => boolean } | null = null;
  let initialVisible: { has: (el: Element) => boolean } | null = null;
  let initialPaintCapHit = false;
  if (!subtreeMode && config.initialPaintStateKey) {
    try {
      const census = (window as unknown as Record<string, unknown>)[
        config.initialPaintStateKey
      ] as
        | {
            present?: { has: (el: Element) => boolean };
            visible?: { has: (el: Element) => boolean };
            capHit?: boolean;
          }
        | undefined;
      if (census && census.capHit === true) {
        // A PARTIAL census is worse than none: an element the census never
        // reached looks exactly like one that did not exist yet, and that is the
        // direction that invents a modal out of a legitimate fixed element.
        initialPaintCapHit = true;
      } else if (census && census.present && census.visible) {
        initialPresent = census.present;
        initialVisible = census.visible;
      }
    } catch {
      initialPresent = null;
      initialVisible = null;
    }
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const maxOverlayCandidates = config.maxOverlayCandidates ?? 16;
  // Task 28.7 A2 — ONE source for the shape thresholds, shared with the
  // page-state normalizer. The literals here are only the pre-28.7 defaults for
  // a caller that supplies no config (the bounded-subtree capture).
  const overlayMinWidthCoverage = config.overlayMinWidthCoverage ?? 0.5;
  const overlayMinHeightCoverage = config.overlayMinHeightCoverage ?? 0.5;
  const overlayMinAreaCoverage = config.overlayMinAreaCoverage ?? 0.5;
  /**
   * Page scroll locked while the document is longer than the viewport. The
   * classic modal signature, and fully structural: a fixed header never locks
   * the page scroller. Read once, not per element.
   */
  let pageScrollLocked = false;
  if (!subtreeMode) {
    try {
      const de = document.documentElement;
      const bodyEl = document.body as HTMLElement | null;
      const scrollable = de.scrollHeight > viewportH + 2;
      const locks = (value: string): boolean =>
        value === "hidden" || value === "clip";
      const htmlOverflow = getComputedStyle(de).overflowY;
      const bodyOverflow = bodyEl ? getComputedStyle(bodyEl).overflowY : "";
      pageScrollLocked = scrollable && (locks(htmlOverflow) || locks(bodyOverflow));
    } catch {
      pageScrollLocked = false;
    }
  }
  const overlay: RawOverlayCensus = {
    structuralMatches: 0,
    flagged: 0,
    flaggedByScrollLockOnly: 0,
    flaggedByDeclaredDialog: 0,
    flaggedByAppearedAfterInitialPaint: 0,
    refused: 0,
    headerLikeRefused: 0,
    pageScrollLocked,
    initialPaintCensusAvailable: initialPresent !== null,
    initialPaintCapHit,
    capHit: false,
    candidates: [],
  };

  /**
   * Task 28.6 C2 B5 — the shape gate and its refusals, for ONE element.
   *
   * SHAPE alone is never a verdict. `role=dialog` / `aria-modal` is a DECLARED
   * dialog and needs no inference; otherwise the element must either have
   * appeared after the initial paint, or the page scroll must be locked. An
   * element that was already painting at initial paint with neither of those is
   * RECORDED and REFUSED — that is the legitimate hero/cover/fixed-layout class,
   * and mistaking it for a modal is the failure that deletes a real header.
   *
   * No hostname, site name, URL, class name or human-language string is read.
   *
   * Task 28.6 C3 D2 — THE THREE SIGNALS ARE OR-ED, so `flagged` alone cannot
   * say why. Which fired is recorded in `flaggedBy`, because one of the three
   * has a known false-positive class: a legitimate full-viewport hero that WAS
   * painting at the initial paint gets flagged whenever the page scroll happens
   * to be locked for an unrelated reason (an open nav drawer, a scroll-jacking
   * library, `overflow:hidden` during an intro animation). Those candidates
   * carry `flaggedBy: ["page-scroll-locked"]` and nothing else, and are totalled
   * in `flaggedByScrollLockOnly`. Measuring zero of them on a handful of sites
   * is a sample, not a property of the detector.
   */
  const censusOverlay = (
    el: Element,
    id: string,
    tagName: string,
    cs: CSSStyleDeclaration,
    rect: DOMRect,
    painting: boolean,
  ): void => {
    if (!painting) return;
    const position = cs.position;
    if (position !== "fixed" && position !== "absolute") return;
    if (viewportW <= 0 || viewportH <= 0) return;
    const ix = Math.max(0, Math.min(rect.right, viewportW) - Math.max(rect.left, 0));
    const iy = Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0));
    if (iy <= 0) return;
    const widthCoverage = ix / viewportW;
    if (widthCoverage < overlayMinWidthCoverage) return;
    const heightCoverage = iy / viewportH;
    const area = (ix * iy) / (viewportW * viewportH);
    if (heightCoverage < overlayMinHeightCoverage || area < overlayMinAreaCoverage) {
      // Wide, positioned, painting — and SHORT. A header/banner/toolbar. This
      // census refuses the whole class on purpose, and counts the refusal.
      overlay.headerLikeRefused++;
      return;
    }
    overlay.structuralMatches++;
    if (overlay.candidates.length >= maxOverlayCandidates) {
      overlay.capHit = true;
      return;
    }
    const role = (el.getAttribute("role") ?? "").toLowerCase();
    const declaredDialog =
      tagName === "dialog" ||
      role === "dialog" ||
      role === "alertdialog" ||
      (el.getAttribute("aria-modal") ?? "") === "true";
    const presentAtInitialPaint =
      initialPresent !== null ? initialPresent.has(el) : undefined;
    const visibleAtInitialPaint =
      initialVisible !== null ? initialVisible.has(el) : undefined;
    let interactiveDescendants = 0;
    try {
      interactiveDescendants = el.querySelectorAll(
        'button, [role="button"], a[href], input, select, textarea',
      ).length;
    } catch {
      interactiveDescendants = 0;
    }
    const appearedAfterInitialPaint = visibleAtInitialPaint === false;
    // Task 28.6 C3 D2 — the three signals are OR-ed, so the boolean alone
    // cannot say WHY. Recorded individually, in a fixed order.
    const flaggedBy: string[] = [];
    if (declaredDialog) flaggedBy.push("declared-dialog");
    if (appearedAfterInitialPaint) flaggedBy.push("appeared-after-initial-paint");
    if (pageScrollLocked) flaggedBy.push("page-scroll-locked");
    const flagged = flaggedBy.length > 0;
    const zRaw = parseInt(cs.zIndex, 10);
    const candidate: RawOverlayCandidate = {
      elementId: id,
      tagName,
      viewportCoverage: Math.round(area * 1000) / 1000,
      heightCoverage: Math.round(heightCoverage * 1000) / 1000,
      position,
      ...(Number.isFinite(zRaw) ? { zIndex: zRaw } : {}),
      declaredDialog,
      ...(presentAtInitialPaint !== undefined ? { presentAtInitialPaint } : {}),
      ...(visibleAtInitialPaint !== undefined ? { visibleAtInitialPaint } : {}),
      interactiveDescendants,
      flagged,
      flaggedBy,
      ...(flagged
        ? {}
        : {
            refusedReason:
              initialPresent === null
                ? initialPaintCapHit
                  ? "initial-paint-census-capped"
                  : "no-initial-paint-census"
                : "painting-at-initial-paint",
          }),
    };
    if (flagged) {
      overlay.flagged++;
      if (declaredDialog) overlay.flaggedByDeclaredDialog++;
      if (appearedAfterInitialPaint) overlay.flaggedByAppearedAfterInitialPaint++;
      // The false-positive class: scroll lock was the ONLY signal.
      if (!declaredDialog && !appearedAfterInitialPaint) {
        overlay.flaggedByScrollLockOnly++;
      }
    } else overlay.refused++;
    overlay.candidates.push(candidate);
  };

  const elements: RawElement[] = [];
  const images: RawImageInfo[] = [];
  const inlineSvgs: RawInlineSvg[] = [];
  /**
   * The live `<svg>` roots behind `inlineSvgs`, same index, DOCUMENT ORDER
   * (the walk is depth-first from `documentElement`). Never returned — it only
   * exists so reference-driven custom-property discovery can resolve a
   * `var(--x)` reference AT THE ELEMENT THAT CONSUMES IT.
   */
  const inlineSvgElements: Element[] = [];
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

    /*
     * Task 28.6 C2 B4 — PAINT-SUPPRESSION CENSUS. Same `cs`/`r` the walk already
     * has, so the census costs arithmetic and no second pass. Denominator is
     * SIZED elements only: a `display:none` menu was never going to paint and
     * belongs in neither half of the ratio. The three cause counters overlap on
     * purpose (an element can be low-opacity inside a hidden ancestor);
     * `suppressedElements` is the deduplicated total.
     */
    if (
      !subtreeMode &&
      el.isConnected &&
      cs.display !== "none" &&
      r.width > 0 &&
      r.height > 0
    ) {
      paint.sizedElements++;
      const ownOpacity = parseFloat(cs.opacity || "1");
      const lowOpacity = ownOpacity < paintOpacityThreshold;
      const hiddenVisibility =
        cs.visibility === "hidden" || cs.visibility === "collapse";
      if (lowOpacity) paint.suppressedByOpacity++;
      if (hiddenVisibility) paint.suppressedByVisibility++;
      if (ancestorHardHidden) paint.suppressedByAncestor++;
      if (lowOpacity || hiddenVisibility || ancestorHardHidden) {
        paint.suppressedElements++;
        // The capture is always at scroll 0, so a viewport-relative `top` at or
        // beyond the viewport height is exactly "below the fold".
        if (r.top >= viewportH) paint.suppressedBelowFold++;
      }
    }

    // Task 28.6 C2 B4 — this element revealed during the preparation scroll and
    // stopped painting after the return to the top. The mark travels with the
    // element so a consumer can use the revealed value instead of the observed
    // one, rather than having to re-derive which elements were affected.
    if (revealedOpacityByElement.size > 0) {
      const revealed = revealedOpacityByElement.get(el);
      if (revealed !== undefined) {
        record.scrollRevealRegressed = true;
        record.revealedOpacity = Math.round(revealed * 1000) / 1000;
        paint.scrollRevealMarked++;
      }
    }

    // Task 28.6 C2 B5 — modal-shaped elements, recorded and never resolved.
    if (!subtreeMode) {
      censusOverlay(el, id, tagName, cs, r, localVisible && !ancestorHardHidden);
    }

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
      const { matched, truncated, matchedCount } = collectMatchedLayoutRules(el);
      if (matched.length > 0) {
        record.matchedLayoutRules = matched;
        coverage.elementsWithAuthoredRules++;
      }
      if (matchedCount > 0) {
        record.layoutRulesMatched = matchedCount;
        record.layoutRulesKept = matched.length;
        coverage.layoutRulesMatched += matchedCount;
        coverage.layoutRulesKept += matched.length;
        coverage.layoutRulesTruncated += matchedCount - matched.length;
      }
      if (truncated) {
        record.layoutRulesTruncated = true;
        coverage.layoutRulesTruncatedElements++;
      }
    }

    /*
     * Responsive Core P0 §C1.2 — RUNTIME INLINE STYLE. Read off `el.style`
     * (the CSSOM's longhand expansion, with priority), only when the element
     * carries a non-empty `style` attribute. Page mode only: a bounded-subtree
     * capture keeps its historical shape.
     */
    if (!subtreeMode && maxInlineStyleDecls > 0) {
      const styleAttr = el.getAttribute("style");
      if (styleAttr !== null && styleAttr.trim() !== "") {
        const inline = (el as Element & { style?: CSSStyleDeclaration }).style;
        const decls: { property: string; value: string; important?: true }[] = [];
        let nonEmpty = 0;
        let emptyLonghands = 0;
        let unresolvedShorthands = 0;
        const listed: Record<string, true> = Object.create(null) as Record<string, true>;
        if (inline) {
          for (let i = 0; i < inline.length; i++) {
            const property = inline.item(i);
            if (!property) continue;
            listed[property] = true;
            const value = inline.getPropertyValue(property);
            if (!value || value.trim() === "") {
              emptyLonghands++;
              continue;
            }
            nonEmpty++;
            if (decls.length >= maxInlineStyleDecls) continue;
            decls.push({
              property,
              value: value.trim(),
              ...(inline.getPropertyPriority(property) === "important"
                ? { important: true as const }
                : {}),
            });
          }
        }
        /*
         * Review fix M1 — a shorthand holding `var()` (`padding: var(--p)`)
         * reads back as longhands whose value is `""` (pending substitution);
         * skipping them silently lost the declaration. Each such shorthand in
         * the attribute is recorded RAW (property = the shorthand) and the
         * record is marked `truncated`, so a consumer treats every property
         * it cannot see as ambiguous rather than absent.
         */
        if (inline && emptyLonghands > 0) {
          const text = styleAttr;
          const pieces: string[] = [];
          let depth = 0;
          let quote = "";
          let start = 0;
          for (let i = 0; i < text.length; i++) {
            const ch = text.charAt(i);
            if (quote !== "") {
              if (ch === "\\") i++;
              else if (ch === quote) quote = "";
              continue;
            }
            if (ch === '"' || ch === "'") quote = ch;
            else if (ch === "(") depth++;
            else if (ch === ")") depth = depth > 0 ? depth - 1 : 0;
            else if (ch === ";" && depth === 0) {
              pieces.push(text.slice(start, i));
              start = i + 1;
            }
          }
          pieces.push(text.slice(start));
          const recordedShorthand: Record<string, true> = Object.create(null) as Record<string, true>;
          for (let k = 0; k < pieces.length; k++) {
            const piece = pieces[k]!;
            const colon = piece.indexOf(":");
            if (colon <= 0) continue;
            const name = piece.slice(0, colon).trim().toLowerCase();
            if (name === "" || name.slice(0, 2) === "--" || listed[name]) continue;
            let rawValue = piece.slice(colon + 1).trim();
            let important = false;
            const bang = /!\s*important\s*$/i.exec(rawValue);
            if (bang) {
              important = true;
              rawValue = rawValue.slice(0, bang.index).trim();
            }
            if (rawValue === "" || !/\bvar\s*\(/i.test(rawValue)) continue;
            if (recordedShorthand[name]) continue;
            recordedShorthand[name] = true;
            const serialized = inline.getPropertyValue(name);
            unresolvedShorthands++;
            nonEmpty++;
            if (decls.length >= maxInlineStyleDecls) continue;
            decls.push({
              property: name,
              value: serialized && serialized.trim() !== "" ? serialized.trim() : rawValue,
              ...(important ? { important: true as const } : {}),
            });
          }
        }
        const truncatedInline = nonEmpty > decls.length || unresolvedShorthands > 0;
        record.inlineStyle = {
          decls,
          raw:
            styleAttr.length > inlineStyleRawMaxLen
              ? styleAttr.slice(0, inlineStyleRawMaxLen)
              : styleAttr,
          ...(truncatedInline ? { truncated: true as const } : {}),
          ...(unresolvedShorthands > 0 ? { unresolvedShorthands } : {}),
        };
        coverage.inlineStyleUnresolvedShorthands += unresolvedShorthands;
        coverage.inlineStyleElements++;
        coverage.inlineStyleDecls += decls.length;
        if (truncatedInline) coverage.inlineStyleTruncated++;
      }
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
      inlineSvgElements.push(el);
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
      // A region capture is not a stylesheet observation (same reasoning as
      // icons / fontUrls): the document's root variables are not this subtree's.
      customProperties: {
        properties: [],
        discoveredCount: 0,
        countCapped: false,
        valueCappedCount: 0,
        unresolvedCount: 0,
        referenceDiscoveredCount: 0,
        referenceResolvedCount: 0,
        referenceSheetKnownCount: 0,
        referenceUnresolvedCount: 0,
        referenceResolutionConflicts: 0,
      },
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

  // Font URLs from @font-face rules. Task 28.6 W1.1: this reads the SAME
  // resolved sheet list the layout index used, so a `@font-face` in a
  // cross-origin sheet — previously unobservable — is recovered whenever its
  // response body was captured. A sheet neither readable nor recovered
  // contributes nothing and is already counted in `coverage.fallbackMissed`.
  const fontUrls: RawFontUrl[] = [];
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const isAbsoluteUrl = (raw: string): boolean =>
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.slice(0, 2) === "//";
  for (let fs = 0; fs < resolvedSheets.length; fs++) {
    const sheetEntry = resolvedSheets[fs]!;
    const rules = sheetEntry.rules;
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
        const raw = m[2];
        const entry: RawFontUrl = { url: raw };
        if (family) entry.family = family;
        // Task 28.6 W6 O4 — carry the OWNING sheet's href so a relative `url()`
        // resolves against the sheet, not the document. A `data:` src carries
        // no base and needs none.
        if (sheetEntry.href !== null && raw.slice(0, 5) !== "data:") {
          entry.sheetHref = sheetEntry.href;
        }
        fontUrls.push(entry);
        coverage.fontFaceUrlsHarvested++;
        if (isAbsoluteUrl(raw) || raw.slice(0, 5) === "data:") {
          coverage.fontFaceUrlsAbsolute++;
        } else if (entry.sheetHref !== undefined) {
          coverage.fontFaceUrlsSheetResolved++;
        } else {
          // Relative, and the only base available is the document — correct
          // here, because the sheet IS the document (inline `<style>`).
          coverage.fontFaceUrlsDocumentResolved++;
        }
      }
    }
  }

  /*
   * Task 28.5B §5 — `:root` CSS custom properties, PER VIEWPORT.
   *
   * Two steps, deliberately separate:
   *
   *   DISCOVER names — walk same-origin `document.styleSheets` AND
   *     `document.adoptedStyleSheets` (including grouping rules such as
   *     `@media`, and the nested child rules a CSS-nesting style rule carries,
   *     so a name that only ever appears inside a media query or a nested block
   *     is still found) and keep declaration names starting with `--` from rules
   *     whose selector is ROOT-LEVEL. Root-level means a comma-separated
   *     selector part that is exactly `:root` or `html`, case-insensitively
   *     (HTML selectors are case-insensitive, so `HTML` and `:ROOT` are the same
   *     selector) — a deliberately narrow, documented choice: anything more
   *     permissive would collect names that do not resolve on the document
   *     element anyway, because the value step below reads from the document
   *     element only. A rule nested inside a root-level rule inherits that
   *     context, so `:root { &.x { --a } }` and `:root { @media … { --b } }`
   *     both contribute.
   *
   *     `document.adoptedStyleSheets` is walked with the SAME visitor and the
   *     same per-sheet try/catch: `document.styleSheets` does NOT include
   *     constructed sheets, and a design-token sheet adopted at the document
   *     level is exactly where a modern app keeps its `:root` variables (on
   *     linear.app that one adopted sheet holds every root token the site has).
   *     LIMITATION: document level only — sheets adopted onto a SHADOW ROOT are
   *     not traversed, and their variables would not resolve on the document
   *     element anyway.
   *
   *   RESOLVE values — `getComputedStyle(document.documentElement)` for each
   *     name. The CASCADE is the authority, not the last rule visited, so an
   *     `@media (max-width: 500px)` override is honoured at 390 and absent at
   *     1440. That is exactly the per-viewport difference this channel exists
   *     to preserve, and it is why the record is never flattened across
   *     viewports.
   *
   * Both caps record their hit rather than silently shrinking the record.
   */
  const maxCustomProps = config.maxRootCustomProperties ?? 500;
  const customValueMax = config.rootCustomPropertyValueMaxLen ?? 200;
  // `HTML` is the same element as `html` and `:ROOT` the same pseudo-class as
  // `:root`: CSS keyword/type selectors are ASCII case-insensitive in HTML
  // documents, so the comparison is too.
  const isRootSelector = (selectorText: string): boolean => {
    const parts = selectorText.split(",");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!.trim().toLowerCase();
      if (part === ":root" || part === "html") return true;
    }
    return false;
  };
  // A nested rule written as `&`, `& …` or with no selector at all continues
  // whatever context it sits in; anything else re-qualifies on its own selector.
  const isSelfSelector = (selectorText: string): boolean => {
    const parts = selectorText.split(",");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]!.trim() === "&") return true;
    }
    return false;
  };
  const customNames: string[] = [];
  const seenCustomNames: Record<string, true> = Object.create(null) as Record<
    string,
    true
  >;
  const harvestDeclarations = (style: CSSStyleDeclaration): void => {
    for (let d = 0; d < style.length; d++) {
      const name = style.item(d);
      if (!name || name.slice(0, 2) !== "--") continue;
      if (seenCustomNames[name] === true) continue;
      seenCustomNames[name] = true;
      customNames.push(name);
    }
  };
  /**
   * @param rules  the rule list to visit
   * @param inRoot true when the ENCLOSING rule was itself root-level, so a
   *   nested `&`/bare-declaration block belongs to the root too.
   */
  const visitCustomRules = (rules: CSSRuleList, inRoot: boolean): void => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as CSSRule & {
        selectorText?: string;
        style?: CSSStyleDeclaration;
        cssRules?: CSSRuleList;
      };
      if (rule.selectorText !== undefined && rule.style) {
        // A style rule. It qualifies on its own selector, or by inheriting the
        // enclosing root context through a `&` nested selector.
        const matched =
          isRootSelector(rule.selectorText) ||
          (inRoot && isSelfSelector(rule.selectorText));
        if (matched) harvestDeclarations(rule.style);
        // CSS nesting: a style rule can carry child rules of its own, which the
        // pre-correction visitor never reached (`else if`). Cheap to follow.
        if (rule.cssRules) visitCustomRules(rule.cssRules, matched);
      } else if (rule.style && rule.selectorText === undefined && !rule.cssRules) {
        // CSSNestedDeclarations: bare declarations inside a nested grouping
        // rule. They belong to whatever context encloses them.
        if (inRoot) harvestDeclarations(rule.style);
      } else if (rule.cssRules) {
        // A grouping rule (@media / @supports / @layer / @container …): the
        // context passes straight through it. For DISCOVERY that is correct
        // whatever the condition is — the value still comes from the cascade.
        visitCustomRules(rule.cssRules, inRoot);
      } else if ((rule as { styleSheet?: CSSStyleSheet }).styleSheet !== undefined) {
        // Task 28.6 W1.2 — `@import` exposes `.styleSheet`, not `.cssRules`, so
        // the pre-28.6 visitor walked past an imported token sheet entirely.
        try {
          const imported = (rule as unknown as CSSImportRule).styleSheet;
          const importedRules = imported ? imported.cssRules : null;
          if (importedRules) visitCustomRules(importedRules, inRoot);
        } catch {
          // Cross-origin import: its names are unknowable from here.
        }
      }
    }
  };
  // Task 28.6 W1.1: the same resolved sheet list, so a `:root` block that lives
  // in a CORS-blocked sheet is DISCOVERED whenever that sheet's response body
  // was captured. Only the NAME comes from the sheet; the VALUE still comes from
  // `getComputedStyle(document.documentElement)`, so the cascade — not the
  // recovered text — remains the authority, and a name that does not resolve is
  // dropped and counted (`unresolvedCount`) exactly as before.
  for (let s2 = 0; s2 < resolvedSheets.length; s2++) {
    const sheetRules = resolvedSheets[s2]!.rules;
    if (sheetRules) visitCustomRules(sheetRules, false);
  }
  // Constructed sheets adopted at the DOCUMENT level. `document.styleSheets`
  // omits them entirely, so without this loop a token sheet built with
  // `new CSSStyleSheet()` contributes nothing at all. Same visitor, same
  // per-sheet try/catch, same caps below. Shadow-root adoptions are out of
  // scope (their variables do not resolve on the document element).
  const adopted = (document as Document & { adoptedStyleSheets?: CSSStyleSheet[] })
    .adoptedStyleSheets;
  if (adopted) {
    for (let s3 = 0; s3 < adopted.length; s3++) {
      try {
        const sheetRules = adopted[s3]!.cssRules;
        if (sheetRules) visitCustomRules(sheetRules, false);
      } catch {
        // Unreadable constructed sheet: skipped, exactly like a cross-origin one.
      }
    }
  }
  customNames.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const discoveredCount = customNames.length;
  let countCapped = discoveredCount > maxCustomProps;
  const keptNames = countCapped ? customNames.slice(0, maxCustomProps) : customNames;
  const rootStyle = getComputedStyle(document.documentElement);
  const customProperties: RawRootCustomProperty[] = [];
  let valueCappedCount = 0;
  let unresolvedCount = 0;
  for (let i = 0; i < keptNames.length; i++) {
    const name = keptNames[i]!;
    const value = rootStyle.getPropertyValue(name).trim();
    if (value === "") {
      // Discovered in a sheet but the cascade gives the document element
      // nothing — e.g. declared under `:root` inside a media query this
      // viewport does not match, or on a non-root part of a selector list.
      // Dropped (never invented), but COUNTED: `discoveredCount` minus
      // `properties.length` is otherwise the only trace, and it conflates this
      // with the value cap.
      unresolvedCount++;
      continue;
    }
    if (value.length > customValueMax) {
      valueCappedCount++;
      continue;
    }
    customProperties.push({ name, value });
  }
  /* -------------------------------------------------------------------------
   * REFERENCE-DRIVEN DISCOVERY (Task 28.5B Change 5, correction 2)
   *
   * Sheet walking can only find a name a sheet LETS it read. On linear.app the
   * tokens the page actually paints with are served from a cross-origin host,
   * so `cssRules` throws and the 16 names its 239 inline SVGs reference through
   * 183 `var()` calls are unknowable from any stylesheet — yet 11 of them
   * RESOLVE perfectly well through `getComputedStyle`. The values are there;
   * only the NAMES are missing. So take the names from the one place the
   * pipeline already copies verbatim: the captured SVG markup itself.
   *
   *   DISCOVER  every `var(--name)` token in each captured `<svg>`'s outerHTML.
   *             Names are case-SENSITIVE and are never lowercased.
   *   RESOLVE   at the CONSUMING element (`getComputedStyle(svgRoot)`), not at
   *             the document element — that is the value the source paint
   *             actually used, and because custom properties inherit, emitting
   *             it on the variant wrapper reaches the same consumer in the
   *             clone.
   *
   * PRECEDENCE (one rule, applied everywhere): a name already discovered from a
   * stylesheet keeps its sheet/root-resolved value and is NOT element-resolved.
   * The sheet channel is the one whose scope is known to be the root, so its
   * value is the one that is honest to declare at a wrapper that stands in for
   * the root; element resolution exists only to reach names no sheet revealed.
   * The name is still counted (`referenceSheetKnownCount`) so the overlap is
   * visible rather than silent.
   *
   * CONFLICTS: two elements can legitimately resolve one name to two values
   * (two differently-scoped wrappers). Wrapper-level emission can carry only
   * one, so the FIRST consuming element in document order wins — the walk is
   * depth-first from `documentElement`, so "first" is a function of the page,
   * not of timing — and every disagreement increments
   * `referenceResolutionConflicts`.
   *
   * LIMITATION: only inline-SVG markup is scanned. `var()` references living in
   * element `style` attributes, in pseudo-element content or in observed
   * computed values are NOT harvested here; inline SVG is the proven 28.5A
   * consumer and the only channel measured, so widening it stays a separate,
   * separately-measured decision.
   * ---------------------------------------------------------------------- */
  const varRefPattern = /var\(\s*(--[-A-Za-z0-9_]+)/g;
  const referencedSeen: Record<string, true> = Object.create(null) as Record<
    string,
    true
  >;
  const referenceFirstValue: Record<string, string> = Object.create(
    null,
  ) as Record<string, string>;
  let referenceDiscoveredCount = 0;
  let referenceSheetKnownCount = 0;
  let referenceResolutionConflicts = 0;
  for (let i = 0; i < inlineSvgElements.length; i++) {
    const markup = inlineSvgs[i]!.outerHTML;
    if (markup.indexOf("var(") === -1) continue;
    varRefPattern.lastIndex = 0;
    const namesHere: string[] = [];
    const seenHere: Record<string, true> = Object.create(null) as Record<
      string,
      true
    >;
    let match = varRefPattern.exec(markup);
    while (match !== null) {
      const name = match[1]!;
      if (seenHere[name] !== true) {
        seenHere[name] = true;
        namesHere.push(name);
      }
      match = varRefPattern.exec(markup);
    }
    if (namesHere.length === 0) continue;
    const consumerStyle = getComputedStyle(inlineSvgElements[i]!);
    for (let n = 0; n < namesHere.length; n++) {
      const name = namesHere[n]!;
      if (referencedSeen[name] !== true) {
        referencedSeen[name] = true;
        referenceDiscoveredCount++;
        if (seenCustomNames[name] === true) referenceSheetKnownCount++;
      }
      // Sheet precedence: the sheet channel already spoke for this name.
      if (seenCustomNames[name] === true) continue;
      const value = consumerStyle.getPropertyValue(name).trim();
      // Not resolvable HERE; a later consumer may still resolve it, so this is
      // not yet a loss. Names resolving nowhere are counted after the loop.
      if (value === "") continue;
      const previous = referenceFirstValue[name];
      if (previous === undefined) referenceFirstValue[name] = value;
      else if (previous !== value) referenceResolutionConflicts++;
    }
  }
  const referenceNames: string[] = [];
  for (const name in referenceFirstValue) referenceNames.push(name);
  referenceNames.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let referenceResolvedCount = 0;
  for (let i = 0; i < referenceNames.length; i++) {
    const name = referenceNames[i]!;
    const value = referenceFirstValue[name]!;
    if (value.length > customValueMax) {
      // Same convention as the sheet channel: dropped, never truncated.
      valueCappedCount++;
      continue;
    }
    if (customProperties.length >= maxCustomProps) {
      countCapped = true;
      continue;
    }
    customProperties.push({ name, value });
    referenceResolvedCount++;
  }
  // Referenced, not sheet-known, and resolving to "" at every element that
  // consumes it. Reported, never invented — on linear.app this is the honest 5
  // of the 16 names that genuinely have no value at their consumer.
  const referenceUnresolvedCount =
    referenceDiscoveredCount - referenceSheetKnownCount - referenceNames.length;
  // One sorted, deduped list again: the sheet names were already sorted and the
  // reference names are disjoint from them by the precedence rule above.
  customProperties.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const rootCustomProperties: RawRootCustomProperties = {
    properties: customProperties,
    discoveredCount,
    countCapped,
    valueCappedCount,
    unresolvedCount,
    referenceDiscoveredCount,
    referenceResolvedCount,
    referenceSheetKnownCount,
    referenceUnresolvedCount,
    referenceResolutionConflicts,
  };

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
    customProperties: rootCustomProperties,
    stylesheetCoverage: coverage,
    paintSuppression: paint,
    overlayCensus: overlay,
  };
}
