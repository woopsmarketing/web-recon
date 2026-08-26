import { z } from "zod";

/**
 * Static Observer layer types & schemas (Phase 3, hardened in Task 04).
 *
 * The Observer renders ONE URL in a real Chromium (via Playwright) and records
 * the *observed* static state needed to later reconstruct the page: page
 * metadata, per-element DOM/geometry/computed-style, assets, links, frame and
 * shadow-root inventory, plus a desktop and mobile screenshot. It is strictly
 * read-only — no clicks, hovers, form input, or AI inference. The only motion
 * it may perform is an optional read-only *preparation* auto-scroll to trigger
 * lazy-loaded content (never a click/submit); see the Task 04 report.
 *
 * Data levels:
 *  - `observed`: read directly from the rendered page (attributes, geometry,
 *    computed styles, HTML, environment).
 *  - `derived`: deterministically computed from observed values, with no AI
 *    (per-element `localVisible` / `effectiveVisible`, style deduplication).
 */

/**
 * Bumped when any persisted observation shape changes.
 *  - v1 (Task 03): inline per-element styles, `raw.html`, single `visible`.
 *  - v2 (Task 04): shared style table (`styleId`), `rendered.html`,
 *    `localVisible`/`effectiveVisible`, environment/frames/shadow inventory,
 *    inline-SVG assets.
 *  - v3 (Task 05): responsive — one run holds a FULL deep observation per
 *    viewport under `viewports/<id>/`; `observation.json` becomes
 *    `{ target, observationProfile, viewports:{desktop,mobile},
 *    responsiveSummary }`. Screenshots move to `viewports/<id>/screenshot.png`.
 *  - v4 (Task 16): `ElementObservation.scrollState` on real scroll containers,
 *    and `assets.json` records one entry per element OCCURRENCE rather than one
 *    per `type|url` (see {@link deriveAssets}). Both changes are ADDITIVE: a v3
 *    artifact is still a valid v4 document minus the optional field, which is
 *    why the reader below accepts both.
 *  - v5 (Task 17): `ElementObservation.layoutRules` — layout-critical authored
 *    declarations the browser itself matched to the element — and the optional
 *    page-level `layout-probe.json` (multi-width lightweight geometry probe).
 *    Both additive-optional again.
 */
export const SCHEMA_VERSION = 5 as const;

/**
 * Versions this codebase can still READ (Task 16, item 15).
 *
 * Task 06–15 wrote 52 pages × 2 viewports of v3 observation data and item 26
 * forbids rewriting any of it, so a hard `z.literal(SCHEMA_VERSION)` would make
 * every historical run unloadable the moment the version moved. The v4 additions
 * are optional fields, so a v3 document parses as a v4 one that simply observed
 * no scroll container — which is exactly what it did.
 *
 * Producers ALWAYS write {@link SCHEMA_VERSION}; only the reader is permissive.
 */
export const READABLE_SCHEMA_VERSIONS = [3, 4, 5] as const;

export const ReadableSchemaVersionSchema = z.union([
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ---------------------------------------------------------------------------
// Observation run configuration (defaults; not all are user-tunable yet).
// ---------------------------------------------------------------------------

/**
 * Platform tokens for the mobile UA. The real observation engine is Chromium,
 * so the mobile browser is emulated as **Android Chrome** (a Chromium-family
 * mobile browser) rather than iPhone Safari — that keeps engine and UA
 * consistent and avoids a Safari-content / Chromium-render hybrid on UA-sniffing
 * sites (Task 05 follow-up). Real WebKit/iOS-Safari observation would be a
 * separate profile on a WebKit engine (see ROADMAP), not a UA swap here.
 */
export const MOBILE_UA_PLATFORM = "Linux; Android 13; Pixel 7";

/**
 * Build the mobile (Android Chrome) user agent for the CURRENTLY RUNNING
 * Chromium, from `browser.version()` (e.g. `151.0.7922.34`). Deriving it from
 * the live engine keeps the Chrome version in the UA aligned with the actual
 * renderer instead of hardcoding a value that ages out of sync. The
 * `Mobile Safari/537.36` token is Android Chrome's standard suffix (it is a
 * Chromium browser, not WebKit Safari).
 */
export function chromiumMobileUserAgent(browserVersion: string): string {
  return (
    `Mozilla/5.0 (${MOBILE_UA_PLATFORM}) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${browserVersion} Mobile Safari/537.36`
  );
}

/**
 * A viewport profile drives ONE full deep-observation pass. The same observer
 * pipeline runs once per profile — there is no separate desktop/mobile observer
 * and no reduced mobile variant — so both viewports are observed at identical
 * fidelity; only the browser context differs. Persisted verbatim into each
 * viewport's summary. `isMobile`/`hasTouch`/`userAgent` reflect real mobile
 * browser behavior (touch, layout, UA-based content negotiation).
 */
export const ViewportProfileSchema = z.object({
  id: z.enum(["desktop", "mobile"]),
  width: z.number(),
  height: z.number(),
  deviceScaleFactor: z.number(),
  isMobile: z.boolean(),
  hasTouch: z.boolean(),
  userAgent: z.string().optional(),
});
export type ViewportProfile = z.infer<typeof ViewportProfileSchema>;
export type ViewportId = ViewportProfile["id"];

/** Desktop profile: deep observation at 1440×900, DPR 1, non-touch. */
export const DESKTOP_PROFILE: ViewportProfile = {
  id: "desktop",
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

/**
 * Mobile profile: deep observation at 390×844 (Android-phone-like), DPR 3,
 * touch. `userAgent` is intentionally left unset here and resolved at run time
 * from the live Chromium via {@link chromiumMobileUserAgent}, so the stored
 * profile records the exact engine-consistent UA that was applied.
 */
export const MOBILE_PROFILE: ViewportProfile = {
  id: "mobile",
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/** Observed in this order; each gets the identical deep-observation pipeline. */
export const VIEWPORT_PROFILES: readonly ViewportProfile[] = [
  DESKTOP_PROFILE,
  MOBILE_PROFILE,
];

/**
 * Browser-context settings applied to EVERY viewport, for reproducibility. The
 * two test sites are Korean, so we pin locale/timezone (affects the
 * `Accept-Language` header + server content negotiation, date/number
 * formatting, and font selection). `colorScheme`/`reducedMotion` are pinned so
 * a machine or browser default flip cannot silently move a regression baseline.
 * The applied values are recorded in `observation.json.observationProfile`, and
 * the per-viewport *observed* values in each `environment`. See the Task 05
 * report for the rationale and the check that this did not break the sites.
 */
export const OBSERVATION_LOCALE = "ko-KR";
export const OBSERVATION_TIMEZONE = "Asia/Seoul";
export const OBSERVATION_COLOR_SCHEME = "light";
export const OBSERVATION_REDUCED_MOTION = "no-preference";

/** Page navigation timeout (ms). */
export const NAV_TIMEOUT_MS = 45_000;

/**
 * Bounded wait for network to go idle after `load`. Intentionally short: many
 * sites (analytics, websockets, long-polling) never truly idle, so we cap it
 * and continue rather than depending on `networkidle` alone.
 */
export const NETWORK_IDLE_TIMEOUT_MS = 8_000;

/**
 * Bounded wait for `document.fonts.ready`. Web fonts change text metrics and
 * therefore geometry, so we wait for them — but never indefinitely (a single
 * slow/blocked font must not stall the whole observation).
 */
export const FONTS_READY_TIMEOUT_MS = 5_000;

/** Fixed post-load settle so late layout/paint work can finish. */
export const SETTLE_MS = 1_200;

/** Max characters of normalized direct text stored per element. */
export const TEXT_MAX_LEN = 200;

/** Max characters stored per attribute value (guards against huge data-* blobs). */
export const ATTR_MAX_LEN = 500;

// --- Read-only preparation auto-scroll limits (Task 04, item 12) ------------
// A bounded, read-only downward scroll used only to trigger lazy-loaded
// content before the final static observation. Hard-capped so infinite-scroll
// sites cannot run forever.

/** Fraction of viewport height advanced per scroll step. */
export const SCROLL_STEP_FRACTION = 0.85;
/** Hard cap on the number of scroll steps. */
export const SCROLL_MAX_STEPS = 40;
/** Short wait after each scroll step (ms) so lazy content can begin loading. */
export const SCROLL_STEP_SETTLE_MS = 250;
/** Hard cap on total time spent scrolling (ms). */
export const SCROLL_MAX_TOTAL_MS = 15_000;
/** Hard cap on cumulative scroll distance (px), for infinite-scroll safety. */
export const SCROLL_MAX_DISTANCE_PX = 120_000;

/**
 * Elements skipped during DOM observation (and their subtrees). These carry no
 * layout/visual reconstruction value; `<head>`-only metadata, scripts, and
 * styles are collected via other channels (assets/links) where relevant.
 */
export const SKIP_TAGS: readonly string[] = [
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
  "META",
  "LINK",
  "TITLE",
  "BASE",
];

/**
 * Attribute names preserved verbatim (in addition to any `aria-*` and `data-*`
 * attribute, which are always kept). Sensitive fields are handled specially in
 * the collector (e.g. password/hidden input `value` is never read).
 */
export const ATTR_WHITELIST: readonly string[] = [
  "id",
  "class",
  "role",
  "href",
  "src",
  "srcset",
  "sizes",
  "alt",
  "title",
  "type",
  "name",
  "value",
  "placeholder",
  "tabindex",
  "draggable",
  "target",
  "rel",
  "for",
  "lang",
  "dir",
  "loading",
  "poster",
  "controls",
  "width",
  "height",
];

/**
 * Computed-style properties recorded per element. Deliberately a whitelist:
 * `getComputedStyle` exposes hundreds of longhands, but only a subset matters
 * for reconstruction. We store the browser's *final computed* value, not the
 * source stylesheet.
 *
 * Task 04 expanded this list with high-value reconstruction properties
 * (media fit, masking/clipping, filters, blending, wrapping). Because styles
 * are now deduplicated into a shared table (`styles.json`), the marginal cost
 * of extra properties is far lower than in Task 03.
 */
export const STYLE_WHITELIST: readonly string[] = [
  // Layout
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
  // Task 16 (A3): grid PLACEMENT, not just the track definition. Task 15 found
  // MDN's `grid-template-rows` 78 / `grid-template-columns` 74 mismatches while
  // the properties that decide WHERE an item lands in those tracks were not
  // recorded at all — so a clone could get the grid right and every child in the
  // wrong cell, with nothing in the artifact to show it. `order` is here for the
  // same reason: it changes visual order without changing the DOM.
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
  // Task 17.1: list markers. A captured `<li>` keeps `display: list-item`, and
  // without the marker properties the clone renders UA-default discs that the
  // source suppressed — measured on stripe's mounted nav menu columns.
  "list-style-type",
  "list-style-position",
  "list-style-image",
  // Typography
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
  "overflow-wrap",
  "word-break",
  "color",
  // Media fit
  "object-fit",
  "object-position",
  // Visual
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
  // Masking / clipping / filters / blending
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
  // Visibility (recorded as a style too, distinct from derived visibility)
  "visibility",
  "content-visibility",
  // Transform / behavior hints
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
];

/**
 * Layout-critical properties whose AUTHORED declarations are worth recovering
 * (Task 17 §7).
 *
 * Computed style destroys responsive semantics: an authored `margin: 0 auto`
 * arrives as `margin-left: 220px`, a `max-width: min(1200px, 100%)` as
 * `width: 1200px` — correct at the observed viewport and wrong at every other
 * one. This closed allowlist names the properties whose authored value the
 * Observer records off the browser's own matched rules (`document.styleSheets`
 * + `element.matches(selector)` — browser-observed evidence, never a compile
 * of the original stylesheet). Values are recorded VERBATIM, including `%`,
 * `vw`/`vh`, `calc()`, `clamp()`, `min()`/`max()` and `auto`; nothing outside
 * this list is ever read from a stylesheet.
 */
export const LAYOUT_RULE_PROPERTIES: readonly string[] = [
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "flex",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "flex-flow",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-auto-columns",
  "grid-column",
  "grid-row",
  "grid-area",
  "gap",
  "row-gap",
  "column-gap",
  "justify-content",
  "justify-items",
  "justify-self",
  "align-content",
  "align-items",
  "align-self",
  "place-content",
  "place-items",
  "place-self",
  "overflow",
  "overflow-x",
  "overflow-y",
  "transform",
  "translate",
  "aspect-ratio",
  "box-sizing",
];

/** Stylesheet rules indexed per page for matched-rule recovery. Hard cap. */
export const MAX_LAYOUT_RULES = 2_000;
/** Matched declarations kept per element. Beyond this the element records a cap. */
export const MAX_MATCHED_RULES_PER_ELEMENT = 32;
/** Selector text stored per matched declaration (provenance, not identity). */
export const LAYOUT_RULE_SELECTOR_MAX_LEN = 200;
/** Authored value length cap — a longer value is dropped, never truncated. */
export const LAYOUT_RULE_VALUE_MAX_LEN = 200;

/**
 * Smaller whitelist for `::before` / `::after`. Pseudo-elements are only
 * recorded when their computed `content` is renderable (not `none`/`normal`),
 * so this stays cheap. Their style maps are deduplicated into the same shared
 * style table as element styles.
 */
export const PSEUDO_STYLE_WHITELIST: readonly string[] = [
  "content",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "color",
  "background-color",
  "background-image",
  "font-size",
  "font-weight",
  "border-radius",
  "transform",
  /*
   * Task 16 final correction: the two properties that decide whether a
   * decorative pseudo-element is also an INTERACTION BARRIER.
   *
   * A `::after` with `position: absolute`, a background and `z-index: -1` is an
   * extremely common way to paint a bar behind a header. Every property needed
   * to draw it was already observed and every one of them was reproduced — but
   * not the one that puts it BEHIND. Reconstructed at `z-index: auto` the same
   * box paints in front of the header instead, and the clone's nav stops being
   * clickable: measured on stripe.com as 15 verified interactions that could not
   * be replayed at all (Playwright's hit-target check found the pseudo, not the
   * button). `pointer-events` is the other spelling of the same intent, so it is
   * observed for the same reason.
   *
   * Nothing else was added. `opacity` and `visibility` would change how such a
   * box LOOKS and no measurement has asked for them yet.
   */
  "z-index",
  "pointer-events",
];

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Element geometry from `getBoundingClientRect()` (viewport coords at scroll 0). */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/**
 * A real scroll container's OBSERVED scroll state (Task 16, A2).
 *
 * Every field here is read straight off the element — `scrollTop`,
 * `scrollLeft`, `scrollWidth`, `scrollHeight`, `clientWidth`, `clientHeight`
 * are all live DOM properties, so the provenance is `observed` throughout and
 * nothing is inferred (item 14).
 *
 * Why it exists: `getBoundingClientRect()` returns viewport coordinates, so a
 * descendant of an internally-scrolled container is recorded at the position it
 * had AT THAT SCROLL OFFSET. Task 15 measured the consequence — MDN's
 * `<aside overflow-y:auto height:802px>` held a `<nav height:24,803px>` that the
 * site had auto-scrolled 18,106px, and the clone rendered the same tree from
 * scroll 0, producing a median y delta of 19,739px on a page whose document
 * height matched exactly. Without this field the coordinate is unreproducible
 * and the diff is unattributable.
 */
export const ScrollStateSchema = z.object({
  scrollTop: z.number(),
  scrollLeft: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
  clientWidth: z.number(),
  clientHeight: z.number(),
});
export type ScrollState = z.infer<typeof ScrollStateSchema>;

/**
 * Which elements get a {@link ScrollState}.
 *
 * Deliberately narrow (item 12): the element must BOTH overflow its client box
 * AND compute an `overflow` axis to `auto` or `scroll`. A `overflow: hidden`
 * container can be scrolled programmatically but is not a scroller the user or
 * the site's own `scrollIntoView` normally moves, and admitting every element
 * would put a six-number object on 148,373 nodes to describe 30 real scrollers.
 */
export const SCROLLABLE_OVERFLOW_VALUES: readonly string[] = ["auto", "scroll"];

/** Map of computed-style property → final computed value. Empty values dropped. */
export const ComputedStyleObservationSchema = z.record(z.string(), z.string());
export type ComputedStyleObservation = z.infer<
  typeof ComputedStyleObservationSchema
>;

/**
 * Shared style table (`styles.json`): `styleId` → computed-style map. Identical
 * computed-style maps (ignoring property order) collapse to a single entry;
 * elements and pseudo-elements reference them by id. Ids are `s000001…`,
 * assigned deterministically in first-encounter document order.
 */
export const StyleTableSchema = z.record(
  z.string(),
  ComputedStyleObservationSchema,
);
export type StyleTable = z.infer<typeof StyleTableSchema>;

/**
 * A renderable pseudo-element (`::before` / `::after`). `content` is duplicated
 * inline for readability; the full style map (including `content`) lives in the
 * shared table under `styleId`.
 */
export const PseudoStyleRefSchema = z.object({
  content: z.string().optional(),
  styleId: z.string(),
});
export type PseudoStyleRef = z.infer<typeof PseudoStyleRefSchema>;

/** Renderable pseudo-element style references, when present. */
export const PseudoObservationSchema = z.object({
  before: PseudoStyleRefSchema.optional(),
  after: PseudoStyleRefSchema.optional(),
});
export type PseudoObservation = z.infer<typeof PseudoObservationSchema>;

/**
 * One layout-critical authored declaration the browser matched to an element
 * (Task 17 §7). `observed` level: the selector, media condition and value are
 * read verbatim off `document.styleSheets`, and matching is the browser's own
 * `element.matches`. Never a compile of the original stylesheet — only the
 * declarations that actually apply to this observed element, restricted to
 * {@link LAYOUT_RULE_PROPERTIES}.
 */
export const MatchedLayoutRuleSchema = z.object({
  property: z.string(),
  /** Authored value, verbatim (`min(1200px, 100%)`, `0 auto`, `50%`). */
  value: z.string(),
  /** The enclosing `@media` condition text, when the rule sits inside one. */
  media: z.string().optional(),
  /** Selector text, length-capped. Provenance only, never an identity. */
  selector: z.string(),
  important: z.boolean().optional(),
});
export type MatchedLayoutRule = z.infer<typeof MatchedLayoutRuleSchema>;

/** One observed DOM element (stored in dom.json). */
export const ElementObservationSchema = z.object({
  /** Stable id within this run, e.g. `e000001` (document order). */
  id: z.string(),
  /** Id of the nearest observed ancestor, if any. */
  parentId: z.string().optional(),
  /** Lower-case tag name. */
  tagName: z.string(),
  /** Normalized, length-capped *direct* text only (never inherited). */
  text: z.string().optional(),
  /**
   * Task 17.1 — direct-text POSITION among element children, recorded only by
   * the interaction explorer's dynamic-subtree capture (never in dom.json):
   * each segment's `i` is the number of element children that precede it. A
   * renderer without this field keeps the historical leading-text placement.
   */
  textSegments: z
    .array(z.object({ i: z.number().int().nonnegative(), t: z.string() }))
    .optional(),
  /** Whitelisted attributes (plus any aria- and data- attribute), length-capped. */
  attributes: z.record(z.string(), z.string()),
  /**
   * Element-local visibility: this element's own `display` / `visibility` /
   * `opacity` / geometry / DOM-connected state, ignoring ancestors (derived).
   */
  localVisible: z.boolean(),
  /**
   * Effective visibility: `localVisible` AND no ancestor hard-hides the subtree
   * (`display:none`, `opacity:0`, `content-visibility:hidden`). Not a human
   * "can a person see it" judgement — no occlusion/overlap detection (derived).
   */
  effectiveVisible: z.boolean(),
  /** getBoundingClientRect geometry. */
  boundingBox: BoundingBoxSchema.optional(),
  /**
   * Present ONLY on real scroll containers (Task 16, A2). Absent on the ~99.98%
   * of elements that do not scroll, and absent on the document root / `<body>`
   * — top-level page scroll is a different problem with a different answer
   * (item 21), and the Observer already captures at scroll 0.
   */
  scrollState: ScrollStateSchema.optional(),
  /** Reference into the shared style table (`styles.json`). */
  styleId: z.string(),
  /** Renderable ::before/::after style references, if any. */
  pseudo: PseudoObservationSchema.optional(),
  /** True when this element is the host of an OPEN shadow root. */
  hasShadowRoot: z.boolean().optional(),
  /**
   * Task 17 §7 — layout-critical authored declarations the browser matched to
   * this element. Present only when at least one matched; capped at
   * {@link MAX_MATCHED_RULES_PER_ELEMENT} (with `layoutRulesTruncated`).
   */
  layoutRules: z.array(MatchedLayoutRuleSchema).optional(),
  layoutRulesTruncated: z.boolean().optional(),
});
export type ElementObservation = z.infer<typeof ElementObservationSchema>;

/**
 * A referenced asset. For URL assets only the URL + metadata are kept (binaries
 * are never downloaded). Inline `<svg>` has no URL and instead preserves its
 * `markup` (outerHTML).
 *
 * SECURITY: `markup` (inline-SVG outerHTML) is UNTRUSTED page content. It must
 * be treated as untrusted and sanitized before it is ever re-rendered; this
 * Task only stores it — no sanitization/rendering is implemented.
 */
export const AssetObservationSchema = z.object({
  /** Absolute, resolved URL (absent for inline assets like `inline-svg`). */
  url: z.string().optional(),
  /**
   * Asset kind: `image`, `image-srcset`, `image-current`, `picture-source`,
   * `video`, `video-poster`, `audio`, `source`, `background-image`,
   * `mask-image`, `icon`, `font`, `inline-svg`.
   */
  type: z.string(),
  /** Observed element this asset was found on, when applicable. */
  elementId: z.string().optional(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** srcset candidate descriptor (e.g. `2x`, `640w`), for `image-srcset`. */
  descriptor: z.string().optional(),
  /** Browser-selected responsive URL for `<img>` (from `currentSrc`). */
  currentSrc: z.string().optional(),
  /** Intrinsic pixel dimensions of a loaded `<img>`. */
  naturalWidth: z.number().optional(),
  naturalHeight: z.number().optional(),
  /** Raw outerHTML for `inline-svg` (UNTRUSTED — see schema note above). */
  markup: z.string().optional(),
});
export type AssetObservation = z.infer<typeof AssetObservationSchema>;

/** A link/anchor observed on the page. */
export const LinkObservationSchema = z.object({
  elementId: z.string(),
  /** Raw href attribute, preserved even for non-URL pseudo-links. */
  href: z.string(),
  /** Absolute resolved URL, when the href resolves to an http(s) URL. */
  resolvedUrl: z.string().optional(),
  text: z.string().optional(),
  target: z.string().optional(),
  rel: z.string().optional(),
  /** True when the resolved URL is on the same host as the observed page. */
  internal: z.boolean(),
});
export type LinkObservation = z.infer<typeof LinkObservationSchema>;

/**
 * An `<iframe>` inventory entry (frames.json). Inventory only — this Task does
 * NOT recurse into frame documents, and never bypasses cross-origin isolation.
 */
export const FrameObservationSchema = z.object({
  elementId: z.string(),
  /** Raw `src` attribute, if any. */
  src: z.string().optional(),
  /** Absolute resolved URL, when `src` resolves. */
  resolvedUrl: z.string().optional(),
  /** True when the frame's URL is same-origin with the top document. */
  sameOrigin: z.boolean().optional(),
  /**
   * Whether the frame's document was reachable from the page's JS context
   * (same-origin & attached). Cross-origin frames are `false` by design and are
   * NOT probed further.
   */
  accessible: z.boolean(),
  title: z.string().optional(),
});
export type FrameObservation = z.infer<typeof FrameObservationSchema>;

/**
 * Open-shadow-root inventory. Closed shadow roots are not accessible from page
 * JS and are treated as `unobservable` — never bypassed.
 */
export const ShadowInventorySchema = z.object({
  openShadowRootCount: z.number(),
  shadowHostIds: z.array(z.string()),
});
export type ShadowInventory = z.infer<typeof ShadowInventorySchema>;

/** Observation environment (for reproducible/regression QA). */
export const EnvironmentSchema = z.object({
  browser: z.string(),
  browserVersion: z.string(),
  userAgent: z.string(),
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  deviceScaleFactor: z.number(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  colorScheme: z.string(),
  reducedMotion: z.string(),
  timestamp: z.string(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

/** Page-level metadata (observed). */
export const PageMetadataSchema = z.object({
  requestedUrl: z.string(),
  finalUrl: z.string(),
  title: z.string(),
  timestamp: z.string(),
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  documentWidth: z.number(),
  documentHeight: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
});
export type PageMetadata = z.infer<typeof PageMetadataSchema>;

/** Per-phase load timings (ms), best-effort. */
export const LoadTimingsSchema = z.object({
  navMs: z.number(),
  networkIdleMs: z.number(),
  fontsReadyMs: z.number(),
  settleMs: z.number(),
  scrollMs: z.number().optional(),
  totalMs: z.number(),
});
export type LoadTimings = z.infer<typeof LoadTimingsSchema>;

/** How the page was loaded/stabilized (recorded for reproducibility). */
export const LoadStrategySchema = z.object({
  waitUntil: z.string(),
  navTimeoutMs: z.number(),
  networkIdleTimeoutMs: z.number(),
  networkIdleReached: z.boolean(),
  fontsReadyTimeoutMs: z.number(),
  fontsReadyReached: z.boolean(),
  settleMs: z.number(),
  /** Whether the read-only preparation auto-scroll ran. */
  prepareScroll: z.boolean(),
  /** Number of scroll steps performed (when prepareScroll). */
  scrollSteps: z.number().optional(),
  /** Cumulative scroll distance in px (when prepareScroll). */
  scrollDistancePx: z.number().optional(),
  timings: LoadTimingsSchema,
});
export type LoadStrategy = z.infer<typeof LoadStrategySchema>;

/** Style-deduplication effectiveness (Task 04, item 6). */
export const StyleDedupSchema = z.object({
  /** Total style-map references (one per element + one per pseudo style map). */
  rawStyleOccurrences: z.number(),
  /** Distinct style maps after dedup (= styles.json entry count). */
  uniqueStyleCount: z.number(),
  /** 1 − unique/raw; higher means more sharing. */
  dedupRatio: z.number(),
});
export type StyleDedup = z.infer<typeof StyleDedupSchema>;

/** Byte sizes of ONE viewport's persisted files (measured after writing). */
export const ViewportSizeReportSchema = z.object({
  renderedHtmlBytes: z.number(),
  domJsonBytes: z.number(),
  stylesJsonBytes: z.number(),
  assetsJsonBytes: z.number(),
  linksJsonBytes: z.number(),
  framesJsonBytes: z.number(),
  screenshotBytes: z.number(),
  /** dom.json + styles.json (the deduplicated representation). */
  domPlusStylesBytes: z.number(),
  /**
   * Hypothetical dom.json size if styles were still inlined per element (the
   * Task 03 representation), measured on the SAME observation for an exact
   * before/after. See the reports.
   */
  inlineStylesDomBytes: z.number(),
  /** Sum of all this viewport's files (6 data files + screenshot). */
  viewportTotalBytes: z.number(),
});
export type ViewportSizeReport = z.infer<typeof ViewportSizeReportSchema>;

/** Run-level byte totals (both viewports + observation.json). */
export const RunSizeReportSchema = z.object({
  observationJsonBytes: z.number(),
  /** Every persisted byte of the run (both viewports + observation.json). */
  runTotalBytes: z.number(),
});
export type RunSizeReport = z.infer<typeof RunSizeReportSchema>;

/** Aggregate counts across the observation. */
export const ObservationStatsSchema = z.object({
  domElementCount: z.number(),
  elementsWithGeometry: z.number(),
  localVisibleCount: z.number(),
  effectiveVisibleCount: z.number(),
  elementsWithPseudo: z.number(),
  uniqueStyleCount: z.number(),
  rawStyleOccurrenceCount: z.number(),
  /**
   * Asset OCCURRENCES, not unique assets (Task 16, A1). Three `<img>` sharing
   * one URL count 3 here and still collapse to one entry in the SiteSpec asset
   * catalog; the distinction is the whole point of the fix.
   */
  assetCount: z.number(),
  /** Distinct `type|url` (or inline-SVG markup) identities behind `assetCount`. */
  uniqueAssetCount: z.number().optional(),
  /** Elements carrying a {@link ScrollState} (Task 16, A2). */
  scrollContainerCount: z.number().optional(),
  inlineSvgCount: z.number(),
  linkCount: z.number(),
  internalLinkCount: z.number(),
  openShadowRootCount: z.number(),
  iframeCount: z.number(),
});
export type ObservationStats = z.infer<typeof ObservationStatsSchema>;

/**
 * The applied browser-context profile shared by every viewport (reproducibility).
 * These are what we *configured*; each viewport's `environment` records what was
 * actually *observed* in the page.
 */
export const ObservationProfileSchema = z.object({
  locale: z.string(),
  timezone: z.string(),
  colorScheme: z.string(),
  reducedMotion: z.string(),
});
export type ObservationProfile = z.infer<typeof ObservationProfileSchema>;

/** The run's target: requested URL + a representative final URL/title. */
export const RunTargetSchema = z.object({
  requestedUrl: z.string(),
  /** Representative final URL (the desktop viewport's), after redirects. */
  finalUrl: z.string(),
  /** Representative page title (the desktop viewport's). */
  title: z.string(),
  timestamp: z.string(),
});
export type RunTarget = z.infer<typeof RunTargetSchema>;

/** Relative file paths (from the run dir) for one viewport. */
export const ViewportFilesSchema = z.object({
  rendered: z.string(),
  dom: z.string(),
  styles: z.string(),
  assets: z.string(),
  links: z.string(),
  frames: z.string(),
  screenshot: z.string(),
});
export type ViewportFiles = z.infer<typeof ViewportFilesSchema>;

/**
 * One viewport's observation summary inside observation.json. The bulk data
 * (DOM, styles, assets, links, frames arrays and rendered.html) lives in sibling
 * files under `viewports/<id>/`; only summary + reference data is embedded here,
 * so the large DOM/style data is never inlined into observation.json.
 */
export const ViewportObservationSchema = z.object({
  profile: ViewportProfileSchema,
  environment: EnvironmentSchema,
  metadata: PageMetadataSchema,
  loadStrategy: LoadStrategySchema,
  stats: ObservationStatsSchema,
  styleDedup: StyleDedupSchema,
  shadow: ShadowInventorySchema,
  sizes: ViewportSizeReportSchema,
  files: ViewportFilesSchema,
});
export type ViewportObservation = z.infer<typeof ViewportObservationSchema>;

/** Deterministic per-viewport figures for a quick responsive diff (no AI). */
export const ViewportResponsiveSummarySchema = z.object({
  elementCount: z.number(),
  effectiveVisibleCount: z.number(),
  documentWidth: z.number(),
  documentHeight: z.number(),
  uniqueStyleCount: z.number(),
  /** Asset OCCURRENCES (Task 16, A1) — three `<img>` on one URL count 3. */
  assetCount: z.number(),
  /** Distinct asset identities behind that count (Task 16, A1). */
  uniqueAssetCount: z.number().optional(),
  /** Elements carrying an observed `scrollState` (Task 16, A2). */
  scrollContainerCount: z.number().optional(),
  linkCount: z.number(),
});
export type ViewportResponsiveSummary = z.infer<
  typeof ViewportResponsiveSummarySchema
>;

/** Side-by-side deterministic responsive summary (desktop vs mobile). */
export const ResponsiveSummarySchema = z.object({
  desktop: ViewportResponsiveSummarySchema,
  mobile: ViewportResponsiveSummarySchema,
});
export type ResponsiveSummary = z.infer<typeof ResponsiveSummarySchema>;

// ---------------------------------------------------------------------------
// Multi-viewport layout probe (Task 17 §8)
// ---------------------------------------------------------------------------

/**
 * The probe widths. The two truth viewports (390 / 1440) are untouched; these
 * are ADDITIONAL lightweight measurements — bounding boxes, display and
 * visibility only, never a second deep observation. 2048 is opt-in (regression
 * canary), not part of the default set.
 */
export const LAYOUT_PROBE_WIDTHS: readonly number[] = [390, 768, 1024, 1440, 1920];
export const LAYOUT_PROBE_HEIGHT = 900;
/** Elements tracked by one probe. Beyond this, `truncated: true`. */
export const MAX_LAYOUT_PROBE_ELEMENTS = 8_000;
/** Settle after each viewport resize, before measuring. */
export const LAYOUT_PROBE_SETTLE_MS = 250;

/** One width's measurements, aligned by index to the probe's element walk. */
export const LayoutProbeWidthSchema = z.object({
  width: z.number().int().positive(),
  /** Viewport-relative x / width per element, rounded to 0.01px. */
  x: z.array(z.number()),
  w: z.array(z.number()),
  /** 1 = visible under the Observer's standard visibility rule. */
  v: z.array(z.union([z.literal(0), z.literal(1)])),
  /** Elements no longer connected at this width (their entries read 0). */
  disconnected: z.number().int().nonnegative(),
  documentWidth: z.number().nonnegative(),
});
export type LayoutProbeWidth = z.infer<typeof LayoutProbeWidthSchema>;

/**
 * The lightweight multi-width layout probe (Task 17 §8), persisted as
 * `layout-probe.json` beside `observation.json`.
 *
 * ONE page load at the initial width; the walk (Observer skip policy — the
 * probe's element order is comparable with a `dom.json` walk by tag sequence)
 * parks element references, then each probe width is applied with
 * `setViewportSize` and re-measured against the SAME elements, so identity
 * across widths is the DOM's own. A page whose script replaces nodes on resize
 * shows up as `disconnected` counts rather than as silently wrong geometry.
 */
export const LayoutProbeSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  url: z.string(),
  finalUrl: z.string(),
  capturedAt: z.string(),
  /** The width the page was loaded and walked at (the desktop truth width). */
  initialWidth: z.number().int().positive(),
  /** Tag sequence of the probe walk — exact-alignment material for dom.json. */
  tags: z.array(z.string()),
  /** Element-child parent index per element (-1 for the root). */
  parents: z.array(z.number().int()),
  widths: z.array(LayoutProbeWidthSchema),
  truncated: z.boolean(),
});
export type LayoutProbe = z.infer<typeof LayoutProbeSchema>;

/**
 * Top-level observation summary (stored as observation.json). One page run now
 * holds a full deep observation for EACH viewport; the per-viewport bulk data
 * lives under `viewports/<id>/`. Element ids (`e######`) and style ids
 * (`s######`) are stable only WITHIN a viewport — desktop `e000050` and mobile
 * `e000050` are not guaranteed to be the same semantic element (this Task
 * implements no cross-viewport matching). `sizes` is filled in after the sibling
 * files are written.
 */
export const PageObservationSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  engine: z.string(),
  target: RunTargetSchema,
  observationProfile: ObservationProfileSchema,
  viewports: z.object({
    desktop: ViewportObservationSchema,
    mobile: ViewportObservationSchema,
  }),
  responsiveSummary: ResponsiveSummarySchema,
  sizes: RunSizeReportSchema,
  /**
   * Task 17 §8 — present when the multi-width layout probe ran. The probe data
   * itself lives in `layout-probe.json`; this is the pointer + summary.
   */
  layoutProbe: z
    .object({
      file: z.string(),
      widths: z.array(z.number().int().positive()),
      elementCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
    })
    .optional(),
});
export type PageObservation = z.infer<typeof PageObservationSchema>;

/**
 * One viewport's complete in-memory observation, before persistence. `sizes` /
 * `files` are added by the store once paths and byte counts are known.
 */
export interface ObservedViewport {
  profile: ViewportProfile;
  environment: Environment;
  metadata: PageMetadata;
  loadStrategy: LoadStrategy;
  stats: ObservationStats;
  styleDedup: StyleDedup;
  shadow: ShadowInventory;
  elements: ElementObservation[];
  styleTable: StyleTable;
  assets: AssetObservation[];
  links: LinkObservation[];
  frames: FrameObservation[];
  renderedHtml: string;
  screenshot: Buffer;
}

/** The complete in-memory result of observing one page across all viewports. */
export interface ObservedPage {
  target: RunTarget;
  observationProfile: ObservationProfile;
  viewports: ObservedViewport[];
  /** Task 17 §8 — the multi-width layout probe, when it ran. */
  layoutProbe?: LayoutProbe;
}
