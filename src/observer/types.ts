import { z } from "zod";
import { SourcePackagePointerSchema, type SourcePackageCapture } from "../source-package/types.js";

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
 *
 * NOT BUMPED by Task 28.7 §27, which added `LayoutProbeWidth.fingerprint` (the
 * per-width DOM-family census). The v4 and v5 additions bumped because an absent
 * field there meant two different things either side of the bump; this one has a
 * single meaning under both — "this run predates the measurement" — because the
 * probe writes it at every width or not at all, and its only consumer
 * (`reconstruction/tree-switch.ts`) falls back to the pre-§27 geometry path
 * either way. See the SiteSpec's own SCHEMA_VERSION note for the same argument
 * made at the compiler boundary.
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
 * Task 28.7 B1 — attempts allowed for the MAIN DOCUMENT navigation.
 *
 * THE DEFECT THIS EXISTS FOR. On 2026-09-04 `linear.app` returned a proxy error
 * body ("upstream connect error or disconnect/reset before headers…") for the
 * DESKTOP load of two routes. The observation recorded it as a normal success:
 * a 3-element document settles instantly (nothing to lay out, no image to
 * load), so every stability signal the observer had said "ready". The
 * site-spec, the reconstruction and the QA then processed a proxy error page as
 * if it were the site. A re-run 20 minutes later got 2,306 elements.
 *
 * TWO is deliberate. A transient upstream 5xx is overwhelmingly a
 * one-shot — the mobile load of the SAME url in the SAME run succeeded — so one
 * bounded retry converts the common case into a correct observation, while more
 * attempts would turn a site that is genuinely down into a long multiplied
 * stall across every page of the run.
 */
export const MAX_DOCUMENT_NAV_ATTEMPTS = 2;
/**
 * Backoff before the single retry above. Long enough for a load-balancer to
 * pick a different upstream, short enough that a site that is really 5xx costs
 * one second per page rather than a visible stall.
 */
export const DOCUMENT_NAV_RETRY_BACKOFF_MS = 1_000;

/**
 * Task 28.7 B1 — the CROSS-VIEWPORT starvation ratio.
 *
 * A soft error page can answer 200, so the HTTP status alone does not catch
 * every "the site did not give us the page" case. The one corroborating signal
 * available WITHOUT any site-specific knowledge is the run's OWN other
 * viewport: the same URL is loaded twice, seconds apart, in the same run, and a
 * capture holding an order of magnitude fewer elements than its sibling is
 * evidence that one of the two loads was not the page.
 *
 * It is a RATIO against the run's own richest viewport, never an absolute
 * element count — a threshold like "fewer than 50 elements" would be a number
 * tuned to whatever site was being looked at that day. A page that is
 * legitimately tiny is tiny at BOTH viewports, so its ratio is ~1 and it is not
 * marked; the linear.app case was 3 against 2,306 (0.0013).
 *
 * Marking is all this does. It never drops the observation — see
 * {@link SourceIntegritySchema}.
 */
export const CROSS_VIEWPORT_STARVATION_RATIO = 0.1;

/**
 * Task 28.75 §07 — the LAYOUT PROBE's starvation floor, against the deep
 * observation of the SAME viewport in the SAME run.
 *
 * The probe makes its OWN page load, so it can be starved exactly the way a
 * deep viewport load can — and on `linear.app /` run `2026-09-04T22-34-32-296Z`
 * it was: the mobile probe walked THREE elements (`html/body/pre`, a plain-text
 * edge error body Chrome wrapped in `<pre>`) while the mobile deep observation
 * of the same URL in the same run collected 2,291.
 *
 * DELIBERATELY THE SAME NUMBER as {@link CROSS_VIEWPORT_STARVATION_RATIO}, and
 * for the same reason: the control is a load of the SAME url, seconds apart, in
 * the SAME run, and a capture holding an order of magnitude fewer elements than
 * that control is evidence one of the loads was not the page. Introducing a
 * second, separately-tuned probe threshold would be a number picked to fit
 * whatever site was open that day. A page that is legitimately tiny is tiny in
 * both the probe and the deep walk, so its ratio is ~1 and it is never marked.
 *
 * Measured ratios on the four canary hosts (probe walk ÷ deep walk, homepage):
 *   linear.app healthy   2306/2306 = 1.000 · 2283/2306 = 0.990
 *   severance            1674/1674 = 1.000 · 1658/1658 = 1.000
 *   hobbang.net           852/852  = 1.000
 *   linear.app COLLAPSED     3/2291 = 0.0013   ← the only one below the floor
 */
export const PROBE_DOCUMENT_STARVATION_RATIO = CROSS_VIEWPORT_STARVATION_RATIO;

/**
 * Task 28.75 §07 — attempts allowed on ONE probe pass.
 *
 * TWO, for the reason {@link MAX_DOCUMENT_NAV_ATTEMPTS} is two: the measured
 * failure is a transient upstream/edge error on one load out of four, so a
 * single bounded retry converts the common case into a correct probe, while
 * more attempts would multiply a genuinely-down site across every page.
 *
 * This is the SECOND gate, not a replacement for the first: the probe's load
 * already goes through {@link navigateMainDocument}'s non-2xx retry. This one
 * catches the SOFT error — a starved walk behind an HTTP 200 — which no status
 * check can see.
 */
export const MAX_PROBE_ATTEMPTS = 2;

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

/**
 * Task 28.7 — explicit budget for the full-page screenshot.
 *
 * WHY IT NEEDED ONE. `page.screenshot` inherits Playwright's 30s DEFAULT action
 * timeout (`page.setDefaultNavigationTimeout` moves only the NAVIGATION budget),
 * and it is by far the heaviest call in the observation: a tall page at the
 * mobile profile's DPR 3 is a multi-hundred-megapixel capture. Before 28.7 a
 * screenshot that overran that invisible 30s threw straight out of
 * `observeViewport`, the site orchestrator filed the page as an
 * `observation-error` WITH NO ARTIFACT, and the route was lost — the exact
 * failure class A1 exists to eliminate, reached through a different door.
 *
 * The budget is explicit and generous, and overrunning it now DEGRADES the
 * screenshot (recorded as {@link ViewportObservation.screenshotDegraded})
 * instead of destroying the observation.
 */
export const SCREENSHOT_TIMEOUT_MS = 60_000;
/** Budget for the cheap viewport-only fallback capture. */
export const SCREENSHOT_FALLBACK_TIMEOUT_MS = 20_000;

/** Max characters of normalized direct text stored per element. */
export const TEXT_MAX_LEN = 200;

/** Max characters stored per attribute value (guards against huge data-* blobs). */
export const ATTR_MAX_LEN = 500;

// --- Read-only preparation auto-scroll limits (Task 04, item 12) ------------
// A bounded, read-only downward scroll used only to trigger lazy-loaded
// content before the final static observation. Hard-capped so infinite-scroll
// sites cannot run forever.

/**
 * Fraction of viewport height advanced per scroll step.
 *
 * Task 28.75 lowered this from 0.85 to 0.5. A scroll-reveal library fires on an
 * IntersectionObserver threshold, and an 0.85-viewport jump can carry an element
 * from "below the fold" to "above the fold" between two samples without it ever
 * having been near the trigger band. MEASURED on seoultone.kr: 0.5 vh steps with
 * a 700 ms dwell took live zero-opacity text from 3,642 characters down to 69 —
 * the survivors being one inactive carousel slide and two empty aria regions.
 */
export const SCROLL_STEP_FRACTION = 0.5;
/**
 * Hard cap on the number of scroll steps. Raised with the smaller step.
 *
 * The cap has to preserve REACH: the pre-28.75 policy could travel
 * `40 x 0.85 = 34` viewport heights before the cap stopped it, and halving the
 * step would have cut that to 30 if the cap had stayed at 60 — a page the old
 * pass reached the bottom of would have been silently truncated. 70 steps at
 * 0.5 vh restores 35 vh. `smoke-multi-observer` asserts the inequality so the
 * two constants can never drift apart again.
 */
export const SCROLL_MAX_STEPS = 70;
/**
 * Wait after each scroll step (ms) so lazy content can begin loading AND a
 * reveal animation can run. Task 28.75 raised this from 250 ms: 250 ms is
 * shorter than a typical 300–600 ms reveal transition, so the sample landed
 * mid-fade and the collector recorded a partial opacity.
 */
export const SCROLL_STEP_SETTLE_MS = 700;
/**
 * Hard cap on total time spent scrolling (ms).
 *
 * Must not bind before {@link SCROLL_MAX_STEPS} does, or the step cap above
 * stops being the thing that limits reach: `70 x 700 = 49,000`, so the wall
 * clock is set above that. Only a page that keeps genuinely moving for 70 steps
 * pays it; the stall guard ends a pinned page after ~3 steps.
 */
export const SCROLL_MAX_TOTAL_MS = 60_000;
/**
 * Task 28.75 — how many CONSECUTIVE zero-progress steps end the pass.
 *
 * The pass used to break on the FIRST step that reported no movement, which is
 * what made it blind to `html { scroll-behavior: smooth }`: `window.scrollBy`
 * is asynchronous there, so `window.scrollY` read synchronously afterwards is
 * unchanged, `moved` is 0, and the loop exits having travelled zero pixels — the
 * Observer never scrolled the page at all. Progress is now measured AFTER the
 * settle, and a single zero-progress reading no longer ends the pass.
 *
 * It is not zero-tolerance either: a genuinely pinned page (an `overflow:
 * hidden` scroll-jacked intro) would otherwise burn the whole step budget on
 * every pass. Three consecutive stalls is the compromise.
 */
export const SCROLL_NO_PROGRESS_TOLERANCE = 3;
/** Hard cap on cumulative scroll distance (px), for infinite-scroll safety. */
export const SCROLL_MAX_DISTANCE_PX = 120_000;

// --- Preparation-scroll navigation safety (Task 28.7 A1) -------------------
/*
 * A page that NAVIGATES while the preparation scroll is stepping destroys the
 * execution context the scroll evaluates in. Before Task 28.7 that throw
 * escaped the whole observation and the page was recorded as an
 * `observation-error` with no artifact at all — and a page with no observation
 * takes the entire reconstruction down (`route-plan` throws
 * `ReconstructionError` when a route has no `renderSourcePageId`).
 *
 * The recovery is deliberately tiny and bounded: at most ONE re-navigation back
 * to the URL under observation and at most ONE scroll retry. A second
 * navigation means the page genuinely does this, and the run falls back to the
 * stable (unscrolled/partial) state and RECORDS the limitation instead of
 * spending the run fighting the site.
 */
/** At most one re-navigation back to the URL under observation. */
export const PREPARE_SCROLL_MAX_RECOVERY_NAVIGATIONS = 1;
/** At most one scroll retry after a recovered navigation. */
export const PREPARE_SCROLL_MAX_RETRIES = 1;
/** Bounded wait for the intruding navigation to reach `load` before deciding. */
export const PREPARE_SCROLL_RECOVERY_LOAD_TIMEOUT_MS = 15_000;
/** Fixed settle after a recovery navigation, before any retry. */
export const PREPARE_SCROLL_RECOVERY_SETTLE_MS = 500;

// --- Deterministic settle (Task 28.7 A3) -----------------------------------
/*
 * `networkidle` alone is not a settle condition: an analytics beacon, a
 * websocket or a long-poll keeps a page from ever idling, so the observation
 * used to fall through its 8s cap and collect whatever happened to be on screen.
 * The deterministic settle samples two observable facts — document height and
 * how many RENDERABLE candidate images have finished — and stops when both hold
 * still across {@link SETTLE_STABLE_SAMPLES} consecutive samples. networkidle is
 * kept as ONE bounded input, not as the condition.
 *
 * Every cap here is hard, so a page that never settles still terminates and
 * SAYS it hit a cap.
 */
/** Gap between stability samples (ms). */
export const SETTLE_SAMPLE_INTERVAL_MS = 150;
/** Consecutive identical samples required before the page counts as stable. */
export const SETTLE_STABLE_SAMPLES = 3;
/** Hard cap on stability samples. */
export const SETTLE_MAX_SAMPLES = 40;
/** Hard cap on total time spent in the stability loop (ms). */
export const SETTLE_MAX_TOTAL_MS = 6_000;
/**
 * How far outside the viewport an image may sit and still count as a RENDERABLE
 * candidate. A lazy image 20 screens down is not something this load waits for;
 * one just below the fold is about to be painted and is.
 */
export const SETTLE_IMAGE_PROXIMITY_PX = 2_000;

// --- Scroll-reveal blanking (Task 28.6 C2 B4) ------------------------------
/*
 * The preparation auto-scroll ends by returning to the top of the page. On a
 * site whose scroll-animation library runs in RE-HIDE mode, that leaves the
 * majority of the document at `opacity: 0` — the reconstruction ships BLANK and
 * screenshot-diff QA passes it blank-against-blank, because both sides are
 * blank.
 *
 * MEASURED BY THIS LANE, homepage at 1440×900: mystarskin.co.kr has 327 SIZED
 * elements of which 141 paint nothing, and 21 of those are proven regressions
 * (watched reaching `opacity: 1` during the scroll, back to 0 after the
 * return-to-top).
 *
 * The condition is NOT universal and must never be assumed. MEASURED on
 * interiorteacher.com, same recipe: 655 sized elements, 0 suppressed, 8 reveal
 * candidates, 8 revealed, 0 regressed. So the observation MEASURES the
 * regression and RECORDS it. It never alters the page, never skips the
 * return-to-top, and never treats a site that legitimately animates once as
 * defective — on that site every counter added here is 0.
 */
/** Computed `opacity` strictly below which an element counts as painting nothing. */
export const SCROLL_REVEAL_OPACITY_THRESHOLD = 0.05;
/**
 * Max elements the scroll-reveal probe tracks. Candidates are the elements a
 * `class`/`style` mutation touched during the scroll — the set every
 * scroll-animation library writes to — so this is far smaller than the document.
 * A hit is reported in `ScrollReveal.candidateCapHit`, never silent.
 */
export const MAX_SCROLL_REVEAL_CANDIDATES = 4_000;
/** Window key where the scroll pass parks its measurement for the collector. */
export const SCROLL_REVEAL_STATE_KEY = "__webReconScrollReveal";

// --- Initial-paint census & overlay census (Task 28.6 C2 B5) ---------------
/** Window key where the load parks "what existed and painted at initial paint". */
export const INITIAL_PAINT_STATE_KEY = "__webReconInitialPaint";
/** Max elements the initial-paint census records. A hit is reported, not hidden. */
export const MAX_INITIAL_PAINT_ELEMENTS = 20_000;
/**
 * Max overlay candidates recorded per viewport. The census counts every
 * structural match; this caps only how many are described in detail.
 */
export const MAX_OVERLAY_CANDIDATES = 16;

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
  // Task 28.75 — FLOAT. Not one float property was on this list, so every
  // floated element reconstructed as `float: none`. MEASURED on
  // gs.severance.healthcare: the slick carousels' slides are `float: left`;
  // without it they stack vertically at the track origin, land at x = -543
  // under the track's own `translateX(-981px)`, and are clipped away entirely by
  // `.slick-list { overflow: hidden }` — which is the whole cause of "the NEWS
  // row has zero of four cards" and "the promo carousel has no cards". Injecting
  // `float: left` alone at runtime moved the news headline from (-543, 2371) to
  // (438, 1618): the source geometry to the pixel, on three carousels at once.
  // `clear` comes with it because a float list without its terminator produces
  // the opposite failure (siblings riding up beside the floats).
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
  // Task 28.75 — TEXT-INDENT. The classic off-screen-text idiom
  // (`text-indent: -9999px` on a control that carries a background sprite) is
  // unobservable without it, so slick's "Previous" / "Next" arrow labels, hidden
  // in the source, reconstruct as visible text stacked on top of each other.
  "text-indent",
  "overflow-wrap",
  "word-break",
  "color",
  // Task 28.5A: typography properties whose absence let the browser apply CSS
  // initial values in the clone. `text-wrap-mode` / `text-wrap-style` are the
  // computed longhands behind `text-wrap: balance|pretty` — unobserved, a
  // balanced headline reconstructs as `wrap`/`auto` and re-breaks its lines, so
  // the clone's headline block is a different height than the source's.
  // `-webkit-font-smoothing` changes glyph rasterization weight; unobserved it
  // reverts to `auto` and the clone's text renders visibly heavier.
  "text-wrap-mode",
  "text-wrap-style",
  "-webkit-font-smoothing",
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
  // Task 28.6 W6 O5 — TABLE FORMATTING. Not one table property was on this
  // list, so every reconstructed `<table>` fell back to the CSS initial values
  // (`border-collapse: separate`, `border-spacing: 2px`, `table-layout: auto`).
  // MEASURED on hobbang.net: all five tables render `separate` in the clone
  // against `collapse` in the source and grow +26.5 / +12.5 / +52 / +14.5 /
  // +58.5 px at 390 and +82 / +12.5 / +12.5 / +14.5 / +18.5 px at 1440, then
  // overflow their frozen-height wrappers by up to +57 px where the source fits
  // by −2 px. None of the five is a longhand of anything already listed, and
  // none is reachable from geometry: only the computed value says which one the
  // source used.
  "border-collapse",
  "border-spacing",
  "table-layout",
  "caption-side",
  "empty-cells",
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

/**
 * Stylesheet rules indexed per page for matched-rule recovery. Hard cap; a hit
 * is recorded in `stylesheetCoverage.ruleIndexCapHit`, never silent.
 *
 * Task 28.6 W1 raised this from 2,000. Once the CORS fallback recovers the
 * sheets the CSSOM refuses, 2,000 is no longer a generous cap but a truncation:
 * measured with the cap lifted, linear.app/pricing indexes 2,087 rules (desktop)
 * and stripe.com 1,898, and the index fills IN SHEET ORDER — so a cap that bites
 * drops exactly the last-loaded sheets, the ones that win the cascade. The
 * measured cost of the higher cap on linear.app/pricing was +0.7s of observation
 * time and ZERO extra bytes in dom.json (the per-element cap below, not the
 * index size, decides how much is written).
 */
export const MAX_LAYOUT_RULES = 6_000;
/**
 * Matched declarations kept per element. Beyond this the element records a cap.
 *
 * Task 28.6 C1.3 — MEASURED STORAGE COST of this channel on linear.app/pricing:
 * `dom.json` grows 697,194 → 5,759,235 bytes desktop (+5,062,041) and
 * 684,674 → ~5,746,71x bytes mobile (~+5,062,04x), i.e. **+5.06 MB per viewport
 * per page**, about **81 MB for an eight-page two-viewport site**. (An earlier
 * draft said +3.75 MB / ~60 MB; that figure is retracted. Task 28.6 C3
 * verifier correction: the DESKTOP figure reproduces exactly across runs, the
 * MOBILE one does not — this lane read 5,746,719 and the verifier's fresh
 * artifact 5,746,715 — so the mobile byte count and its delta are approximate,
 * the same treatment `bytesCaptured` gets eight lines below.) The cost is duplication: each element copies whole
 * declaration objects, so one authored rule matching N elements is stored N
 * times. A de-duplicated authored-rule table (store the rule table once per
 * page, reference it by index per element — exactly what `dedupeStyles`
 * already does for computed styles) is the carried follow-up; it is NOT
 * implemented here.
 */
/*
 * Responsive Core P0 §C1.5 — RAISED 32 → 96 and made CASCADE-AWARE. The old cap
 * iterated in sheet order and `break`-ed, so on a CSS-in-JS page (globals first,
 * component rules last) the declarations it dropped were exactly the cascade
 * WINNERS. The collector now gathers every match, keeps per property the
 * {@link MAX_MATCHED_RULES_PER_PROPERTY} declarations with the highest cascade
 * precedence (important > layer order > specificity > source order), bounds the
 * element total at this number, and emits the kept set in ascending source order
 * (`ruleOrder`) so a consumer reading array order still reads source order.
 * Counted per element (`layoutRulesMatched` / `layoutRulesKept`) and per page in
 * {@link StylesheetCoverage}.
 */
export const MAX_MATCHED_RULES_PER_ELEMENT = 96;
/** Responsive Core P0 §C1.5 — declarations kept per (element, property). */
export const MAX_MATCHED_RULES_PER_PROPERTY = 8;
/**
 * Responsive Core P0 §C1.2 — runtime inline `style` declarations kept per
 * element (CSSOM-expanded longhands). Truncation is counted, never silent.
 */
export const MAX_INLINE_STYLE_DECLS = 64;
/** Responsive Core P0 §C1.2 — `style` attribute text kept verbatim (`raw`). */
export const INLINE_STYLE_RAW_MAX_LEN = 2_000;
/**
 * Responsive Core P0 §C1.1 — the MAIN-DOCUMENT response body is persisted as
 * `document-response.html` only up to this many bytes (as served). A larger
 * body is recorded as `initialDocument.status: "too-large"`, never truncated.
 */
export const MAX_DOCUMENT_RESPONSE_BYTES = 8 * 1024 * 1024;
/** Responsive Core P0 §C1.1 — the per-viewport file name of that body. */
export const DOCUMENT_RESPONSE_FILE = "document-response.html" as const;
/**
 * Responsive Core P0 §C1.6 — family-switch bisection bounds: at most this many
 * resize steps per adjacent probe pair, and this many pairs per probe.
 */
export const MAX_FAMILY_BISECTION_STEPS = 10;
export const MAX_FAMILY_BISECTION_PAIRS = 4;
/**
 * Task 28.6 C3 D1 — DISTINCT `@media` conditions tallied per page load.
 *
 * The tally is the evidence the probe-width derivation reads, so it must be
 * bounded like every other in-page collection. 300 distinct conditions is an
 * order of magnitude above what a real site authors — MEASURED 2026-09-02:
 * linear.app/pricing 31 distinct (desktop and mobile alike, twice), stripe.com
 * 40 desktop / 39 mobile, `authoredMediaConditionsDropped` 0 on all four — and
 * a page that does exceed it records the overflow in that counter rather than
 * losing it silently.
 */
export const MAX_AUTHORED_MEDIA_CONDITIONS = 300;
/** Selector text stored per matched declaration (provenance, not identity). */
export const LAYOUT_RULE_SELECTOR_MAX_LEN = 200;
/** Authored value length cap — a longer value is dropped, never truncated. */
export const LAYOUT_RULE_VALUE_MAX_LEN = 200;

/**
 * Task 28.6 W1.1 — CORS STYLESHEET FALLBACK caps.
 *
 * A cross-origin stylesheet throws on `cssRules`, so every authored declaration
 * it holds was previously lost. MEASURED on linear.app/pricing: 30 of 81 sheets
 * blocked, and `authoredLayout` present on 17 of the 1,363 observed nodes
 * (Task 28.6 C1.5 correction — an earlier draft cited "34 of 3,254", which
 * matches no artifact on disk for this URL). The observation now keeps the
 * stylesheet RESPONSE BODIES Chromium
 * already downloaded and hands the blocked ones back to the page, where a
 * constructed `CSSStyleSheet` (never adopted — it cannot affect rendering)
 * parses them at the same position in the sheet list, so cascade order is
 * preserved. These caps bound what that keeps in memory; a sheet dropped by a
 * cap is COUNTED (`sheetsSkippedBySizeCap`), never silently missing.
 */
export const MAX_STYLESHEET_CAPTURE_BYTES = 8 * 1024 * 1024;
/** Per-sheet body cap. A larger sheet is skipped and counted, not truncated. */
export const MAX_STYLESHEET_BYTES = 2 * 1024 * 1024;
/** `@import` expansion depth (a constructed sheet drops `@import` silently). */
export const MAX_STYLESHEET_IMPORT_DEPTH = 3;
/**
 * Task 28.6 W6 O1 — how far back a stylesheet's redirect chain is walked so the
 * captured body can also be keyed by the URL the DOCUMENT asked for.
 *
 * A 302'd sheet arrives under its POST-redirect URL while the CSSOM reports the
 * PRE-redirect href, so without the aliases the recovery lookup misses a sheet
 * it is already holding in memory (MEASURED on seoultone.kr: 1 sheet,
 * 14,612 bytes, on 28 of 28 observations). Chains are short in practice — one
 * hop for the unpkg case — and a chain longer than this is COUNTED in
 * `sheetsRedirectChainsTruncated`, never dropped in silence.
 */
export const MAX_STYLESHEET_REDIRECT_HOPS = 8;

/**
 * Task 28.5B §5 — ROOT CSS CUSTOM PROPERTIES.
 *
 * 28.5A established that source `:root` custom properties are discarded even
 * though surviving values still reference them. The consumer that actually
 * needs them is INLINE SVG: `collect-dom.ts` captures an `<svg>` root as literal
 * `outerHTML`, so `fill="var(--brand)"` reaches the rendered clone verbatim with
 * nothing to resolve against. These caps bound that capture.
 *
 * Names are DISCOVERED from root-level rules in same-origin stylesheets; the
 * VALUE of each is then read from `getComputedStyle(documentElement)`, so the
 * cascade — including the `@media` query that makes `--brand` differ at 390 and
 * 1440 — is the authority, not the last rule that happened to be visited.
 */
/** Root custom properties kept per viewport. A cap hit is RECORDED, not silent. */
export const MAX_ROOT_CUSTOM_PROPERTIES = 500;
/** Value length cap — a longer value is dropped, never truncated (as above). */
export const ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN = 200;

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
   *
   * Task 28.5A IS that measurement. A pseudo-element is recorded whenever its
   * computed `content` is renderable — which includes the very common pattern of
   * a pseudo that is authored but deliberately SUPPRESSED (`opacity: 0`, or
   * `visibility: hidden`, often toggled on hover or by a state class). With
   * neither property observed, the clone reconstructed it at the CSS initial
   * values `opacity: 1` / `visibility: visible` and painted decorations the
   * source never showed. So both are observed now, for the paint reason the
   * Task 16 note anticipated.
   */
  "z-index",
  "pointer-events",
  "opacity",
  "visibility",
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
  /**
   * The enclosing `@media` condition text, when the rule sits inside one.
   *
   * SHAPE: a comma-separated list of ALTERNATIVES, each alternative a
   * `" and "`-joined conjunction — the same shape a CSS media list has. A
   * consumer must split on top-level commas FIRST (the list is a disjunction)
   * and only then on `" and "`.
   *
   * Task 28.6 W1.2 — `@media` AND NOTHING ELSE. The pre-28.6 collector recorded
   * a grouping rule's `conditionText` as `media` when `CSSRule.type === 4`, and
   * measured in Chromium 151 `CSSContainerRule.type` and
   * `CSSLayerBlockRule.type` are both `0` while `CSSSupportsRule.type` is `12`,
   * so a declaration inside `@container` / `@supports` / `@layer` was recorded
   * as UNCONDITIONAL — a wrong value, not a missing one. Grouping rules are now
   * discriminated by `constructor.name` and each kind carries its own field
   * below.
   *
   * Task 28.6 C1.1 — this field ALSO carries the SHEET's own media list, when
   * the sheet is scoped by one (`<link media="print">`, `<style media=...>`,
   * `@import … print`). Before that correction a rule in such a sheet had no
   * `CSSMediaRule` ancestor and was recorded unconditionally; W1.1 made it worse
   * by recovering CORS-blocked `media="print"` sheets that used to be invisible.
   * `all` and `screen` are dropped as unconditional (a media list is a
   * disjunction, and every artifact this engine produces is a screen rendering);
   * every other list SEEDS the rule context and is counted in
   * {@link StylesheetCoverage.sheetsMediaScoped}.
   *
   * Task 28.6 C2.1 correction — an earlier revision of this comment promised
   * "every other list is recorded verbatim". It is only verbatim while nothing
   * nests inside it. A nested `@media` is DISTRIBUTED across the alternatives,
   * because `" and "`-appending onto a comma list states the wrong logic:
   * a sheet `media="print, speech"` holding `@media (min-width: 700px)` used to
   * record `"print, speech and (min-width: 700px)"` (= `print OR (speech AND
   * width)`) and now records
   * `"print and (min-width: 700px), speech and (min-width: 700px)"`
   * (= `(print OR speech) AND width`, the truth). Distributions are counted in
   * {@link StylesheetCoverage.mediaConditionsDistributed}; the one case that
   * still cannot be spelled correctly — a `not`-prefixed alternative inside a
   * conjunction — is counted in
   * {@link StylesheetCoverage.mediaConditionsNegated}.
   *
   * KNOWN REMAINING GAP (measured, not claimed away): a sheet whose media list
   * could not be read at all is recorded UNCONDITIONALLY and counted in
   * {@link StylesheetCoverage.sheetsMediaUnreadable}; `@scope` and
   * `@starting-style` are skipped-and-counted rather than modelled
   * ({@link StylesheetCoverage.groupingRulesSkipped}), and a selector's own
   * conditionality (`:hover`, `@media print` inside a `@scope` block …) is not
   * modelled. So the honest claim is: every CONDITION THIS COLLECTOR DESCENDS
   * INTO is recorded in its own field, and a condition it does not model makes
   * the rule skipped, never unconditional.
   */
  media: z.string().optional(),
  /** Enclosing `@supports` condition text (joined with `" and "`). */
  supports: z.string().optional(),
  /** Enclosing `@container` query text (joined with `" and "`). */
  container: z.string().optional(),
  /** Enclosing `@layer` block name chain, outermost first, joined with `"."`. */
  layer: z.string().optional(),
  /**
   * Provenance (Task 28.6 W1.1). Absent — the historical shape — means the
   * declaration was read from the live CSSOM. `"fetched"` means the sheet was
   * CORS-blocked from the CSSOM and its text was recovered from the network
   * response Chromium had already downloaded, parsed in-page into a constructed
   * `CSSStyleSheet` that is never adopted. Same declarations, weaker provenance:
   * the recovered text is the sheet as served, not as the engine applied it.
   */
  origin: z.enum(["cssom", "fetched"]).optional(),
  /** Selector text, length-capped. Provenance only, never an identity. */
  selector: z.string(),
  important: z.boolean().optional(),
  /*
   * Responsive Core P0 §C1.5 — CASCADE METADATA. All optional: every artifact
   * written before P0 lacks them, and an absent field means "not recorded",
   * never a default value.
   */
  /**
   * Index into `document.styleSheets` of the top-level sheet this rule came
   * from. Rules reached through `@import` (followed or recovered) carry the
   * index of the OWNING top-level sheet.
   */
  sheetIndex: z.number().int().nonnegative().optional(),
  /**
   * Global, monotonically increasing position of the rule in cascade SOURCE
   * ORDER over the whole visit (sheet order, `@import`s expanded in place,
   * nested rules after their parent's own declarations). Declarations of one
   * rule share the value.
   */
  ruleOrder: z.number().int().nonnegative().optional(),
  /**
   * `[ids, classes+attributes+pseudo-classes, types+pseudo-elements]` of the
   * most specific selector in the rule's selector list that matches THIS
   * element (Selectors-4: `:where()` = 0; `:is()/:not()/:has()` = max of args;
   * `:nth-child(… of S)` = pseudo-class + max(S)). Absent when not computable.
   */
  specificity: z
    .tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ])
    .optional(),
  /**
   * Position of the rule's cascade layer in the document's layer order
   * (0 = earliest = weakest for normal declarations). Absent = unlayered.
   * Sub-layers order before their parent layer's own rules, per CSS Cascade 5.
   */
  layerOrder: z.number().int().nonnegative().optional(),
  /** `CSS.supports(supports)` evaluated in the page, when `supports` is present. */
  supportsMatches: z.boolean().optional(),
});
export type MatchedLayoutRule = z.infer<typeof MatchedLayoutRuleSchema>;

/**
 * Responsive Core P0 §C1.2 — the element's RUNTIME inline style at capture,
 * read by iterating `el.style` (longhands as the CSSOM expands them). Present
 * only when the element carried a non-empty `style` attribute. The `style`
 * attribute itself is still never part of the attributes bag.
 */
export const InlineStyleDeclSchema = z.object({
  property: z.string(),
  value: z.string(),
  important: z.literal(true).optional(),
});
export type InlineStyleDecl = z.infer<typeof InlineStyleDeclSchema>;
export const InlineStyleSchema = z.object({
  decls: z.array(InlineStyleDeclSchema),
  /** The `style` attribute text, capped at {@link INLINE_STYLE_RAW_MAX_LEN}. */
  raw: z.string().optional(),
  /**
   * True when {@link MAX_INLINE_STYLE_DECLS} cut declarations away, OR when a
   * shorthand pending `var()` substitution left its longhands empty in the
   * CSSOM (see `unresolvedShorthands`): either way the longhand list is not
   * the complete truth, and consumers must treat unseen properties as
   * ambiguous.
   */
  truncated: z.literal(true).optional(),
  /**
   * Review fix M1 — shorthands (e.g. `padding: var(--p)`) whose CSSOM
   * longhands read back as `""` (pending substitution). Each is ALSO recorded
   * in `decls` as `{ property: <shorthand>, value: <raw value> }`.
   */
  unresolvedShorthands: z.number().int().positive().optional(),
});
export type InlineStyle = z.infer<typeof InlineStyleSchema>;

/**
 * Responsive Core P0 §C1.4 — where each runtime inline declaration came from.
 *
 * `correspondence` says whether the element was matched to a node of the
 * initial document response (`matched`) or could not be (`ambiguous` /
 * `no-initial-node` / `no-initial-document`). Only a matched element gets an
 * `initial-*` / `runtime-added` class; everything else is `unknown` unless the
 * probe proved the value varies with width (`runtime-responsive` wins first).
 */
export const InlineStyleProvenanceClassSchema = z.enum([
  "initial-static",
  "initial-mutated",
  "runtime-added",
  "runtime-responsive",
  "unknown",
]);
export type InlineStyleProvenanceClass = z.infer<typeof InlineStyleProvenanceClassSchema>;
export const InlineStyleCorrespondenceSchema = z.enum([
  "matched",
  "ambiguous",
  "no-initial-document",
  "no-initial-node",
]);
export type InlineStyleCorrespondence = z.infer<typeof InlineStyleCorrespondenceSchema>;
export const InlineStylePropertyProvenanceSchema = z.object({
  class: InlineStyleProvenanceClassSchema,
  initialValue: z.string().optional(),
  runtimeValue: z.string(),
  /**
   * The probe saw the property (or a relative) take different values across
   * its measurements — across widths, or (with `timeVarying`) between two
   * measurements of the same width.
   */
  variesAcrossWidths: z.boolean(),
  /** Why the class is `unknown` (short code; never set for a proven class). */
  unknownReason: z.string().optional(),
  /** Review fix M5 — the value changed at ONE width over time (carousel-like). */
  timeVarying: z.literal(true).optional(),
});
export type InlineStylePropertyProvenance = z.infer<
  typeof InlineStylePropertyProvenanceSchema
>;
export const InlineStyleProvenanceSchema = z.object({
  correspondence: InlineStyleCorrespondenceSchema,
  byProperty: z.record(z.string(), InlineStylePropertyProvenanceSchema),
  /**
   * Whether per-width `style` evidence (probe `s` arrays) existed for this
   * element. `"absent"` makes every non-proven class `unknown` — without the
   * probe, "does not vary with width" is unproven.
   */
  widthEvidence: z.enum(["probe", "absent"]).optional(),
  /** Why correspondence was refused, when it was (diagnostic, short code). */
  reason: z.string().optional(),
});
export type InlineStyleProvenance = z.infer<typeof InlineStyleProvenanceSchema>;
/** Per-viewport tally of the classes above (per declaration) + correspondence (per element). */
export const InlineStyleProvenanceCountsSchema = z.object({
  elements: z.number().int().nonnegative(),
  declarations: z.number().int().nonnegative(),
  correspondence: z.record(z.string(), z.number().int().nonnegative()),
  byClass: z.record(z.string(), z.number().int().nonnegative()),
  /** Per-declaration histogram of `unknownReason`. Absent when none. */
  unknownReasons: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** Per-element histogram of correspondence refusal `reason`. Absent when none. */
  correspondenceReasons: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type InlineStyleProvenanceCounts = z.infer<typeof InlineStyleProvenanceCountsSchema>;

/**
 * Responsive Core P0 §C1.1 — the MAIN-DOCUMENT navigation response, as served,
 * captured once from the `Response` `page.goto` already returned (final,
 * post-redirect, successful attempt). Never `page.content()`.
 */
export const InitialDocumentSchema = z.object({
  status: z.enum(["captured", "unavailable", "too-large", "not-html", "error"]),
  reason: z.string().optional(),
  url: z.string().optional(),
  httpStatus: z.number().int().optional(),
  contentType: z.string().optional(),
  /** Body size in bytes as served (after transfer decoding). */
  bytes: z.number().int().nonnegative().optional(),
  /** sha256 (hex) of those bytes. */
  sha256: z.string().optional(),
  file: z.literal("document-response.html").optional(),
  /**
   * Review fix m1 — the charset the FILE's bytes decode with. The file holds
   * exactly the body `Response.body()` returned (so `bytes` / `sha256` match
   * it); Chromium hands text documents over already transcoded to UTF-8, so
   * this is `utf-8` unless the body is not valid UTF-8. Absent on captures
   * written before the fix (their file is UTF-8 text).
   */
  charset: z.string().optional(),
  /** The page's own label (header, then `<meta>`), when it differs from `charset`. */
  declaredCharset: z.string().optional(),
});
export type InitialDocument = z.infer<typeof InitialDocumentSchema>;

/**
 * Task 28.6 W1 — STYLESHEET COVERAGE for one viewport observation.
 *
 * The honesty channel for the authored-CSS recovery: how many sheets the page
 * had, how many the CSSOM would give up, how many of the rest were recovered
 * from their response body, and how much the visitor actually indexed. Persisted
 * (not merely logged) because "we captured the authored rules" is only a claim
 * until these numbers say how much of the page's CSS it covered.
 *
 * All fields are counts of THIS viewport's page load. Absent on pre-28.6 runs
 * and on bounded-subtree captures (a region capture is not a sheet observation).
 */
export const StylesheetCoverageSchema = z.object({
  /** `document.styleSheets.length` at collection time. */
  stylesheetsTotal: z.number().int().nonnegative(),
  /** Sheets whose `cssRules` the CSSOM handed over. */
  cssomReadable: z.number().int().nonnegative(),
  /** Sheets whose `cssRules` threw (cross-origin, no CORS header). */
  cssomBlocked: z.number().int().nonnegative(),
  /** Blocked sheets re-parsed from a captured response body. */
  fallbackRecovered: z.number().int().nonnegative(),
  /** Blocked sheets with no usable body (not captured, or unparseable). */
  fallbackMissed: z.number().int().nonnegative(),
  /**
   * `@import` statements inlined in Node before the text reached the page —
   * THE NODE TEXT-INLINING PATH ONLY.
   *
   * Task 28.6 W6 O2 CORRECTION. These two names read as though they covered all
   * `@import` handling. They never did: they count only the pre-page textual
   * inlining that `expandStylesheetImports` performs on a CORS-BLOCKED sheet's
   * captured body. The other path — a `CSSImportRule` the in-page visitor
   * follows through `rule.styleSheet` — moved neither counter.
   *
   * MEASURED on gs.severance.healthcare (run `2026-09-02T20-18-25-207Z`,
   * p000001 desktop): `importsExpanded: 0`, `importsUnresolved: 0`, while
   * `importRulesVisited: 5` and five imports were in fact followed. 93.9% of
   * that page's CSS lives behind an `@import`, so both zeros read as "this page
   * has no imports" when the truth was "five, all handled by the other path".
   *
   * The whole picture is {@link importsResolvedTotal} /
   * {@link importsUnresolvedTotal}. These two stay per-path so a caller can
   * still tell WHICH path did the work.
   */
  importsExpanded: z.number().int().nonnegative(),
  /**
   * `@import` statements left alone by the NODE text-inlining path (body
   * missing, depth/cycle, unparseable). See {@link importsExpanded}: this is
   * one path's counter, not a page total. {@link importsUnresolvedTotal} is the
   * total.
   */
  importsUnresolved: z.number().int().nonnegative(),
  /**
   * Bytes of EVERY stylesheet response body held in memory during the load —
   * the capture buffer, not the payload that reached the page.
   *
   * Task 28.6 C1.4 correction: this used to be documented (and reported) as
   * though it were the recovered-sheet payload. It is not.
   *
   * Task 28.6 C2 verifier correction: this number is RUN-VARIABLE and must be
   * cited as approximate. It counts every stylesheet response the load happened
   * to see, so what the site serves and which viewport asked for it both move
   * it. MEASURED on linear.app/pricing across three separate occasions:
   * ≈446,461, ≈446,609 and (this lane, twice, identical) 446,597 desktop —
   * with the SAME loads reporting 415,860 on mobile, because mobile pulls fewer
   * sheets. {@link bytesBridged} is the steadier of the two: it depends only on
   * the CORS-blocked set, and both viewports of both of this lane's runs
   * reported exactly 151,145 (an earlier run reported 151,157). So: bytesBridged
   * is reproducible WITHIN a deploy and viewport-independent; bytesCaptured is
   * neither. Cite bytesBridged with its run; treat bytesCaptured as an
   * order-of-magnitude memory cost, never as an identity.
   */
  bytesCaptured: z.number().int().nonnegative(),
  /**
   * Task 28.6 C1.4 — bytes of recovered CSS that actually CROSSED into the
   * observation: the sum of `CollectConfig.extraSheets[].css`, after `@import`
   * expansion, for the CORS-blocked sheets only. Always ≤ the total captured
   * plus whatever inlining imports duplicated. Absent on pre-C1.4 runs.
   */
  bytesBridged: z.number().int().nonnegative().optional(),
  /** Response bodies dropped by {@link MAX_STYLESHEET_BYTES} or the total cap. */
  sheetsSkippedBySizeCap: z.number().int().nonnegative(),
  /**
   * Stylesheet responses whose body could not be read at all.
   *
   * Task 28.6 W6 O1: a 3xx is no longer counted here. A redirect carries no
   * stylesheet body and never could, so folding it in made this counter read as
   * "the browser refused a real body". Redirects are counted in
   * {@link sheetsRedirectResponses} instead.
   */
  sheetsBodyUnavailable: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O1 — 3xx stylesheet responses seen on the wire. MEASURED on
   * seoultone.kr: 1 per observation (`unpkg.com/swiper/swiper-bundle.min.css`
   * → `swiper@14.2.0/...`), previously miscounted as a body the browser would
   * not hand over. Absent on pre-O1 runs.
   */
  sheetsRedirectResponses: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O1 — PRE-redirect URLs keyed onto a captured body by walking
   * `request().redirectedFrom()`. The CSSOM reports the href the document
   * asked for; the response arrives under the URL finally served. Without these
   * aliases the recovery lookup misses a sheet already held in memory — 1 sheet
   * / 14,612 bytes on every seoultone.kr observation. Absent on pre-O1 runs.
   */
  sheetsRedirectAliasesKeyed: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O1 — redirect chains longer than
   * {@link MAX_STYLESHEET_REDIRECT_HOPS}, whose remaining hops were not keyed.
   * Never silent. Absent on pre-O1 runs.
   */
  sheetsRedirectChainsTruncated: z.number().int().nonnegative().optional(),
  /** Sheet texts handed to the page for the fallback (blocked sheets only). */
  sheetsOffered: z.number().int().nonnegative().optional(),
  /** True when {@link MAX_LAYOUT_RULES} stopped the index. Never silent. */
  ruleIndexCapHit: z.boolean(),
  /** Rules in the authored-layout index (entries, after the property filter). */
  rulesIndexed: z.number().int().nonnegative(),
  /** CSS-nesting child rule lists visited (unreachable before 28.6). */
  nestedRulesVisited: z.number().int().nonnegative(),
  /**
   * `CSSImportRule`s the in-page visitor REACHED. Reaching one says nothing
   * about whether its rules were obtained — see {@link importRulesFollowed} and
   * {@link importRulesUnresolved}, which split this number.
   */
  importRulesVisited: z.number().int().nonnegative(),
  /**
   * Task 28.6 W6 O2 — of {@link importRulesVisited}, the ones whose imported
   * sheet actually yielded a rule list the visitor walked. MEASURED on
   * gs.severance.healthcare p000001: 5 of 5, recovering 4,748 style rules,
   * 493 media rules, 5 `@font-face` and 6 `@keyframes` that the pre-28.6 walker
   * never saw. Absent on pre-O2 runs.
   */
  importRulesFollowed: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O2 — of {@link importRulesFollowed}, the ones whose rules came
   * from a CAPTURED RESPONSE BODY rather than from the CSSOM (the sheet was
   * cross-origin, and `extraSheetCss` had its text). Absent on pre-O2 runs.
   */
  importRulesRecovered: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O2 — THE SKIP THAT USED TO BE SILENT. A `CSSImportRule` the
   * visitor reached and could NOT obtain rules for: the imported sheet is
   * cross-origin with no captured body, or its href would not resolve, or the
   * recovered text would not parse. Before O2 the walker's `if (imported) {…}
   * continue;` had no `else` and no counter, so `importsUnresolved: 0` was not
   * evidence that nothing went unresolved. Absent on pre-O2 runs.
   */
  importRulesUnresolved: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O2 — `@import`s RESOLVED across BOTH paths:
   * {@link importsExpanded} (Node text-inlining) + {@link importRulesFollowed}
   * (in-page CSSOM walk). This is the number a caller asking "did this page's
   * imports get handled" should read. Absent on pre-O2 runs.
   */
  importsResolvedTotal: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O2 — `@import`s NOT resolved across BOTH paths:
   * {@link importsUnresolved} + {@link importRulesUnresolved}. Absent on
   * pre-O2 runs.
   */
  importsUnresolvedTotal: z.number().int().nonnegative().optional(),
  /**
   * Grouping rules NOT descended into because their semantics are not modelled
   * (`@scope`, `@starting-style`, …). Descending would record their
   * declarations as unconditional — the exact bug W1.2 fixes — so they are
   * skipped and counted instead. Keyframe/font-feature containers are not
   * counted here: they hold no rules that could match an element.
   */
  groupingRulesSkipped: z.number().int().nonnegative(),
  /** Elements that ended the walk carrying at least one authored declaration. */
  elementsWithAuthoredRules: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 W6 O4 — `url()` occurrences harvested from `@font-face` `src`
   * across every resolved sheet, and how each one got its base. The three
   * sub-counters sum to this. Absent on pre-O4 runs.
   */
  fontFaceUrlsHarvested: z.number().int().nonnegative().optional(),
  /** Already absolute (or `data:`) — no base was needed. */
  fontFaceUrlsAbsolute: z.number().int().nonnegative().optional(),
  /**
   * Relative, resolved against the OWNING SHEET's href. This is the counter O4
   * created: on hobbang.net these 92 URLs previously resolved against the
   * document and 404'd.
   */
  fontFaceUrlsSheetResolved: z.number().int().nonnegative().optional(),
  /**
   * Relative, resolved against the DOCUMENT — correct only because the sheet is
   * an inline `<style>`, whose base IS the document.
   */
  fontFaceUrlsDocumentResolved: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C1.1 — sheets carrying a real sheet-level `media` list (anything
   * but empty / `all` / `screen`). Every declaration indexed from such a sheet
   * carries that list in {@link MatchedLayoutRule.media}; before C1.1 they were
   * recorded as unconditional. Absent on pre-C1.1 runs.
   */
  sheetsMediaScoped: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C1.1 — sheets that carried a `media` list which was `all` /
   * `screen`, i.e. unconditional for every artifact this engine produces. The
   * audit channel that separates "read and classified as unconditional" from
   * "never read". Absent on pre-C1.1 runs.
   */
  sheetsMediaTrivial: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C2.2 — sheets whose OWN media list could not be READ: both the
   * `CSSStyleSheet.media` accessor and the owner-node `media` attribute threw
   * or were absent. Such a sheet's rules are still recorded, unconditionally,
   * because there is nothing better to record — so without this counter the
   * artifact is indistinguishable from a genuinely unmediated sheet and states
   * a confident wrong value. A nonzero count means: at least one sheet's
   * declarations in this observation may carry a media scope nobody saw.
   * Absent on pre-C2 runs.
   */
  sheetsMediaUnreadable: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C2.1 — media joins where at least one side was a comma list, so
   * the nested condition had to be DISTRIBUTED across the alternatives rather
   * than concatenated. A nonzero count means this observation contains media
   * strings that the pre-C2.1 collector would have recorded with the wrong
   * logic. Absent on pre-C2 runs.
   */
  mediaConditionsDistributed: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C2.1 — media joins involving a `not`-prefixed alternative, which
   * has NO correct single-query spelling once it is conjoined with anything
   * (`not screen` AND `(min-width: 700px)` cannot be written as one media
   * query). The verbatim conjunction is recorded and counted here; a consumer
   * that needs exact media semantics must refuse those strings. Absent on
   * pre-C2 runs.
   */
  mediaConditionsNegated: z.number().int().nonnegative().optional(),
  /**
   * Task 28.6 C3 D1 — every DISTINCT `@media` condition this page's authored
   * CSS carries, with how many times it was authored (one per `@media` block,
   * one per media-scoped sheet). Sorted by `count` descending then `condition`
   * ascending, so two runs of the same page emit byte-identical arrays.
   *
   * THIS IS THE PROBE-WIDTH EVIDENCE. The layout probe used to sample a fixed
   * global width list, and the reconstruction engine builds a responsive band
   * edge at the MIDPOINT of two adjacent samples — so on a page whose authored
   * breakpoint is 1024/1025, samples at 1024 and 1440 put the emitted edge at
   * 1232 and the clone hides content across 1025–1231 that the source shows.
   * {@link deriveProbeWidths} folds these conditions into whole-pixel
   * breakpoints and samples either side of each one.
   *
   * An EMPTY array on a viewport whose sheets were readable means the page
   * authored no `@media` at all; a viewport whose sheets could not be read is
   * told apart by `cssomReadable` / `fallbackRecovered` / `stylesheetsTotal`,
   * never by this field alone. Absent on pre-C3 runs.
   */
  authoredMediaConditions: z
    .array(
      z.object({
        condition: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  /**
   * Distinct conditions {@link MAX_AUTHORED_MEDIA_CONDITIONS} refused to
   * record. Nonzero means the derivation below saw less than the page authored.
   */
  authoredMediaConditionsDropped: z.number().int().nonnegative().optional(),
  /** True when the distinct-condition cap bit on this page. */
  authoredMediaConditionsCapHit: z.boolean().optional(),
  /*
   * Responsive Core P0 §C1.5 — per-page totals of the cascade-aware cap.
   * `layoutRulesMatched` = declarations matched before the cap,
   * `layoutRulesKept` = declarations written, `layoutRulesTruncated` = the
   * difference; `layoutRulesTruncatedElements` = elements that lost any.
   * Absent on pre-P0 runs.
   */
  layoutRulesMatched: z.number().int().nonnegative().optional(),
  layoutRulesKept: z.number().int().nonnegative().optional(),
  layoutRulesTruncated: z.number().int().nonnegative().optional(),
  layoutRulesTruncatedElements: z.number().int().nonnegative().optional(),
  /**
   * Review fix M2 — declarations the cap dropped whose `@media` / `@supports`
   * conditions APPLIED at the capture width (a nonzero value means even the
   * applying set overflowed the cap; the kept ones outrank every dropped one)
   * vs. ones whose conditions did not apply (or are container-conditional).
   */
  layoutRulesDroppedApplying: z.number().int().nonnegative().optional(),
  layoutRulesDroppedNonApplying: z.number().int().nonnegative().optional(),
  /** Distinct cascade layers registered (named + anonymous). */
  cascadeLayers: z.number().int().nonnegative().optional(),
  /**
   * Review fix m2 — `@layer` statements / blocks NOT registered because an
   * enclosing `@media` / `@supports` did not apply at capture (the engine
   * ignores them for layer order).
   */
  cascadeLayersConditionalSkipped: z.number().int().nonnegative().optional(),
  /** Matched declarations whose selector specificity could not be computed. */
  specificityUncomputable: z.number().int().nonnegative().optional(),
  /*
   * Responsive Core P0 §C1.2 — runtime inline style capture: elements carrying
   * a non-empty `style` attribute, declarations kept, elements truncated by
   * {@link MAX_INLINE_STYLE_DECLS}. Absent on pre-P0 runs.
   */
  inlineStyleElements: z.number().int().nonnegative().optional(),
  inlineStyleDecls: z.number().int().nonnegative().optional(),
  inlineStyleTruncated: z.number().int().nonnegative().optional(),
  /** Review fix M1 — shorthands pending `var()` substitution recorded raw. */
  inlineStyleUnresolvedShorthands: z.number().int().nonnegative().optional(),
});
export type StylesheetCoverage = z.infer<typeof StylesheetCoverageSchema>;

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
  /**
   * Responsive Core P0 §C1.5 — declarations matched before the cascade-aware
   * cap and declarations kept. Present only when the element matched any.
   * (`layoutRulesTruncated` stays the historical boolean; the count truncated is
   * `layoutRulesMatched - layoutRulesKept`.)
   */
  layoutRulesMatched: z.number().int().nonnegative().optional(),
  layoutRulesKept: z.number().int().nonnegative().optional(),
  /** Responsive Core P0 §C1.2 — runtime inline style, when `style` was non-empty. */
  inlineStyle: InlineStyleSchema.optional(),
  /**
   * Task 28.6 C2 B4 — the preparation auto-scroll measured this element PAINTING
   * during the scroll and painting nothing again after the return to the top.
   *
   * Its recorded `styleId` therefore describes the RE-HIDDEN state, which is not
   * the state a human scrolling the page sees. A reconstruction that copies the
   * observed opacity ships this element blank. Present only on a run whose
   * preparation scroll measured a regression on this element; absent everywhere
   * else, including every pre-C2 artifact.
   */
  scrollRevealRegressed: z.boolean().optional(),
  /**
   * The highest `opacity` the preparation scroll SAMPLED on this element while
   * it was revealed — the value a consumer should prefer over the observed one
   * when `scrollRevealRegressed` is set. Observed, never invented.
   *
   * IT IS A SAMPLING FLOOR, NOT THE REVEAL TARGET. The probe samples once per
   * scroll step ({@link SCROLL_STEP_SETTLE_MS}), so an element whose fade is
   * still running when the last sample lands records the opacity it had
   * REACHED, which is at or below the value the animation was heading for.
   * MEASURED on mystarskin.co.kr desktop (twice): 4 of the 21 marks read
   * 0.31 / 0.531 / 0.895 / 0.943 rather than 1, and the mobile load carried a
   * 0.124. {@link ScrollReveal.revealedBelowFull} counts the marks in this
   * state so a consumer can see how many values it must treat as a lower bound
   * rather than as the reveal target.
   */
  revealedOpacity: z.number().optional(),
  /**
   * Task 28.7 A4 — the opacity the COLLECTOR actually measured on this element,
   * kept verbatim when the reveal-regression policy replaced it in the emitted
   * style token.
   *
   * BOTH REAL INSTANTS SURVIVE. `revealedOpacity` is what the scroll watched the
   * element reach; this is what the post-return-to-top collection saw; the
   * `styleId` token carries the corrected value. Nothing is invented and nothing
   * is lost — a consumer that wants the raw capture reads this field.
   *
   * Present only on elements the policy CORRECTED.
   */
  capturedOpacity: z.number().optional(),
  /**
   * Task 28.7 A4 — the emitted style token's `opacity` is `revealedOpacity`, not
   * the value at `capturedOpacity`. A COUNTED, documented correction; the count
   * and a bounded id sample are on
   * {@link ViewportObservation.revealRegressionPolicy}.
   */
  revealRegressionCorrected: z.boolean().optional(),
  /**
   * Task 28.7 A4 — the element is marked `scrollRevealRegressed` but the two
   * instants do not agree in the one way the policy is allowed to act on, so
   * NOTHING was changed. Recorded rather than guessed at.
   */
  revealRegressionUnstable: z.boolean().optional(),
  /** Why the element was left alone. See {@link revealRegressionUnstable}. */
  revealRegressionUnstableReason: z.string().optional(),
});
export type ElementObservation = z.infer<typeof ElementObservationSchema>;

/**
 * Task 28.6 C2 B4 — SCROLL-REVEAL MEASUREMENT for one page load.
 *
 * Recorded only when the read-only preparation auto-scroll ran; absent
 * otherwise (nothing scrolled, so nothing could regress).
 *
 * WHAT IT MEASURES. Elements a `class`/`style` mutation touched during the
 * scroll are sampled after every step. An element that PAINTED at some sample
 * and paints nothing once the scroll returns to the top has REGRESSED: its
 * observed styles describe a state no human scrolling the page ever sees.
 *
 * WHAT IT DOES NOT DO. It does not alter the page, does not skip the
 * return-to-top (geometry is captured at scroll 0 and the whole pipeline depends
 * on that), and does not assume the condition: on a site that animates once,
 * every counter here is 0 and nothing about the run changes.
 *
 * KNOWN LIMITATION, measured not claimed away: an element revealed by a
 * scroll-driven CSS animation (`animation-timeline: view()`) mutates no
 * attribute, so it is never a candidate and never counted here.
 * {@link PaintSuppression} is the channel that still sees it.
 */
export const ScrollRevealSchema = z.object({
  /** Elements a class/style mutation touched during the scroll. */
  candidates: z.number().int().nonnegative(),
  /** True when {@link MAX_SCROLL_REVEAL_CANDIDATES} stopped the tracking. */
  candidateCapHit: z.boolean(),
  /** Sampling passes taken (one per scroll step). */
  samples: z.number().int().nonnegative(),
  /** Candidates observed PAINTING at least once during the scroll. */
  revealedDuringScroll: z.number().int().nonnegative(),
  /** Of those, painting nothing again after the return to the top. */
  regressedAfterReturn: z.number().int().nonnegative(),
  /** Of those, whose box lies entirely below the first viewport. */
  regressedBelowFold: z.number().int().nonnegative(),
  /** Revealed candidates REMOVED from the document instead of re-hidden. */
  revealedThenRemoved: z.number().int().nonnegative(),
  /**
   * Task 28.6 C3 D2 — of the regressed elements this pass marked, how many
   * carry a {@link ElementObservation.revealedOpacity} strictly BELOW full
   * opacity. Those values are sampling floors: the probe samples once per
   * scroll step, so an element still mid-fade at the last sample records the
   * opacity it had reached, not the one the animation was heading for.
   * A consumer that restores `revealedOpacity` verbatim renders those elements
   * translucent; this counter is how it learns how many.
   *
   * MEASURED on mystarskin.co.kr desktop (twice): 4 of 21 marks below 1
   * (0.31 / 0.531 / 0.895 / 0.943); mobile carried a 0.124.
   */
  revealedBelowFull: z.number().int().nonnegative().optional(),
  /** The opacity threshold used ({@link SCROLL_REVEAL_OPACITY_THRESHOLD}). */
  opacityThreshold: z.number(),
});
export type ScrollReveal = z.infer<typeof ScrollRevealSchema>;

/**
 * Task 28.6 C2 B4 — PAINT-SUPPRESSION CENSUS for one viewport.
 *
 * "How much of this page paints nothing", totalled. Present on every C2+ page
 * observation, with or without a preparation scroll, because the blankness is
 * real either way — a re-hide library leaves below-fold content at `opacity: 0`
 * whether or not anything scrolled.
 *
 * DENOMINATOR: sized elements (`display` not `none`, positive box). A
 * `display:none` menu was never going to paint and is in neither half.
 *
 * The three cause counters OVERLAP by construction; `suppressedElements` is the
 * deduplicated total.
 */
export const PaintSuppressionSchema = z.object({
  sizedElements: z.number().int().nonnegative(),
  suppressedElements: z.number().int().nonnegative(),
  suppressedByOpacity: z.number().int().nonnegative(),
  suppressedByVisibility: z.number().int().nonnegative(),
  suppressedByAncestor: z.number().int().nonnegative(),
  suppressedBelowFold: z.number().int().nonnegative(),
  opacityThreshold: z.number(),
  /** Elements marked {@link ElementObservation.scrollRevealRegressed}. */
  scrollRevealMarked: z.number().int().nonnegative(),
  /** Whether a scroll-reveal hand-off existed at all on this load. */
  scrollRevealAvailable: z.boolean(),
});
export type PaintSuppression = z.infer<typeof PaintSuppressionSchema>;

/**
 * Task 28.6 C2 B5 — one MODAL-SHAPED element.
 *
 * An entry popup open at capture time is reconstructed as a permanent overlay
 * covering the hero (seen on 2 of 12 scouted pilot candidates). A modal and a
 * legitimate fixed full-height element are the SAME SHAPE, and a false positive
 * deletes a real header — which is worse than the defect. So this record states
 * the signals and refuses to resolve them: nothing is removed, hidden or
 * rewritten anywhere in the observer on the strength of it.
 */
export const OverlayCandidateSchema = z.object({
  /** Walk id, so the record points into `dom.json`. */
  elementId: z.string(),
  tagName: z.string(),
  /** Fraction of the viewport AREA the box covers (0–1). */
  viewportCoverage: z.number(),
  /** Fraction of the viewport HEIGHT the box covers (0–1). */
  heightCoverage: z.number(),
  position: z.string(),
  /** Computed `z-index`; absent when `auto`. */
  zIndex: z.number().optional(),
  /** `role=dialog|alertdialog`, `aria-modal="true"`, or a native `<dialog>`. */
  declaredDialog: z.boolean(),
  /** In the DOM at initial paint. Absent when no initial-paint census ran. */
  presentAtInitialPaint: z.boolean().optional(),
  /** PAINTING at initial paint. Absent when no initial-paint census ran. */
  visibleAtInitialPaint: z.boolean().optional(),
  /** Interactive descendants — a dismiss control would be one of them. */
  interactiveDescendants: z.number().int().nonnegative(),
  /**
   * At least one corroborating signal beyond the shape: declared dialog
   * semantics, OR it was not painting at initial paint, OR the page scroll is
   * locked. A CANDIDATE FOR REVIEW — never an instruction to remove anything.
   */
  flagged: z.boolean(),
  /**
   * Task 28.6 C3 D2 — WHICH of the three signals fired, in a fixed order:
   * `"declared-dialog"`, `"appeared-after-initial-paint"`,
   * `"page-scroll-locked"`. Empty exactly when `flagged` is false; absent on
   * pre-C3 runs, where the boolean was all that was recorded.
   *
   * The three are OR-ed, so the boolean alone cannot separate a real dialog
   * from a legitimate full-viewport hero that was painting from the first paint
   * on a page whose scroll happens to be locked. That element is flagged with
   * `["page-scroll-locked"]` and nothing else — the census's known
   * false-positive class, counted in
   * {@link OverlayCensus.flaggedByScrollLockOnly}.
   */
  flaggedBy: z.array(z.string()).optional(),
  /**
   * Why it was not flagged. `"painting-at-initial-paint"` is the legitimate
   * hero/cover/fixed-layout class; `"no-initial-paint-census"` means the load
   * could not supply the time-based signal and `"initial-paint-census-capped"`
   * that it supplied only part of one — in both of those, nothing was
   * concluded rather than guessed.
   */
  refusedReason: z.string().optional(),
});
export type OverlayCandidate = z.infer<typeof OverlayCandidateSchema>;

/** Task 28.6 C2 B5 — the overlay census for one viewport. */
export const OverlayCensusSchema = z.object({
  /** Elements passing the SHAPE gate (positioned, ≥half the viewport, painting). */
  structuralMatches: z.number().int().nonnegative(),
  flagged: z.number().int().nonnegative(),
  /**
   * Task 28.6 C3 D2 — flagged ONLY because the page scroll happened to be
   * locked: painting at the initial paint, no dialog semantics. THE KNOWN
   * FALSE-POSITIVE CLASS of this census — a legitimate full-viewport hero on a
   * page that locks scroll for any other reason (an open nav drawer, a
   * scroll-jacking library, a `overflow:hidden` body during an intro
   * animation) lands here. Counted so its size is readable per page instead of
   * assumed to be zero. Absent on pre-C3 runs.
   */
  flaggedByScrollLockOnly: z.number().int().nonnegative().optional(),
  /** Flagged with declared dialog semantics. Absent on pre-C3 runs. */
  flaggedByDeclaredDialog: z.number().int().nonnegative().optional(),
  /** Flagged because it was not painting at the initial paint. Absent pre-C3. */
  flaggedByAppearedAfterInitialPaint: z.number().int().nonnegative().optional(),
  refused: z.number().int().nonnegative(),
  /**
   * Positioned, painting, ≥half the viewport WIDE but SHORT — the legitimate
   * fixed-header class this census refuses as a class. Counted so the refusal
   * is auditable instead of invisible.
   */
  headerLikeRefused: z.number().int().nonnegative(),
  pageScrollLocked: z.boolean(),
  initialPaintCensusAvailable: z.boolean(),
  /**
   * The initial-paint census stopped at {@link MAX_INITIAL_PAINT_ELEMENTS}. A
   * partial census cannot tell "was not there" from "was never looked at", and
   * the unknown direction would INVENT a modal out of a legitimate fixed
   * element, so a capped census is treated as no census at all and every
   * candidate is refused with `"initial-paint-census-capped"`.
   */
  initialPaintCapHit: z.boolean().optional(),
  /** True when {@link MAX_OVERLAY_CANDIDATES} stopped the detail list. */
  capHit: z.boolean(),
  candidates: z.array(OverlayCandidateSchema),
});
export type OverlayCensus = z.infer<typeof OverlayCensusSchema>;

/**
 * Task 28.7 A4 — the REVEAL-REGRESSION POLICY applied at the
 * observation→style-token boundary for one viewport.
 *
 * THE DEFECT. On a site whose scroll-animation library runs in RE-HIDE mode the
 * collector runs after the preparation scroll has returned to the top and
 * records `opacity: 0`, so the reconstruction ships blank. Task 28.6 measured
 * the regression and MARKED it — and then nothing consumed the marks:
 * `scrollRevealRegressed` and `revealedOpacity` were recorded and ignored by
 * every consumer outside `src/observer/**`.
 *
 * WHAT THE POLICY DOES. When an element is marked regressed, its captured
 * opacity is below the visibility threshold, and the scroll observed it at or
 * above the threshold, the EMITTED style token uses the observed revealed
 * value. That is the whole correction: no animation system, no timeline, no
 * inference. Both real instants stay on the element
 * ({@link ElementObservation.capturedOpacity} and `revealedOpacity`).
 *
 * WHAT IT REFUSES TO DO. Any other disagreement — the element is hidden by
 * `display`/`visibility` rather than opacity, the scroll never saw it revealed,
 * or the capture already shows it visible — leaves the observed value ALONE and
 * records the element as unstable. Certainty is never fabricated.
 *
 * A site that animates ONCE produces zeros here and is not touched.
 */
export const RevealRegressionPolicySchema = z.object({
  /** Elements carrying a `scrollRevealRegressed` mark. */
  marks: z.number().int().nonnegative(),
  /** Marks whose emitted style token was corrected to the revealed value. */
  corrected: z.number().int().nonnegative(),
  /**
   * Corrected elements whose `revealedOpacity` is BELOW full. The value is a
   * sampling floor ({@link ElementObservation.revealedOpacity}), so these render
   * translucent rather than at the animation's target. Counted, not hidden.
   */
  correctedBelowFull: z.number().int().nonnegative(),
  /** Marks left alone because the two instants disagreed some other way. */
  unstable: z.number().int().nonnegative(),
  /** Bounded sample of corrected element ids, in document order. */
  correctedSample: z.array(z.string()),
  /** Bounded sample of `elementId: reason` for the unstable marks. */
  unstableSample: z.array(z.string()),
  /** The opacity threshold the policy compared against. */
  opacityThreshold: z.number(),
});
export type RevealRegressionPolicy = z.infer<typeof RevealRegressionPolicySchema>;

/** Bounded id sample recorded per correction/unstable list (Task 28.7 A4). */
export const MAX_REVEAL_REGRESSION_SAMPLE = 20;

// --- Shared overlay SHAPE gate (Task 28.7 A2) ------------------------------
/*
 * ONE set of thresholds for "is this element modal-SHAPED?", used by BOTH the
 * read-only overlay census in the collector and the page-state normalizer.
 *
 * They live here, are passed into each in-page pass through its own config
 * argument, and are asserted equal end-to-end by the smoke suite, so the census
 * and the normalizer cannot drift apart. (Neither in-page pass can import the
 * other's helpers: Playwright serializes only the function it is handed, so a
 * shared *function* would not survive the bridge — the constants and a
 * behavioural equivalence check are what actually bind the two.)
 *
 * A wide-but-SHORT positioned element is refused as a class: that is the
 * legitimate fixed header / banner / toolbar, and deleting one is worse than
 * the defect this whole lane exists for.
 */
export const OVERLAY_SHAPE = {
  /** Minimum fraction of the viewport WIDTH the box must cover. */
  minWidthCoverage: 0.5,
  /** Minimum fraction of the viewport HEIGHT the box must cover. */
  minHeightCoverage: 0.5,
  /** Minimum fraction of the viewport AREA the box must cover. */
  minAreaCoverage: 0.5,
} as const;

/**
 * Task 28.75 — the SECOND shape tier: the CENTERED DESKTOP PANEL.
 *
 * ---------------------------------------------------------------------------
 * WHY A SECOND TIER EXISTS (the measured defect)
 * ---------------------------------------------------------------------------
 * {@link OVERLAY_SHAPE} is a COVER gate: ≥50% of the viewport width AND height
 * AND area. A centered desktop modal is not shaped like that. Measured on
 * seoultone.kr `/` (`section#popup_slider`, the "가을이벤트" entry popup, same
 * page, same load, one observation run apart):
 *
 *   390×844  → 351×533 box → width 0.900, height 0.631, area 0.568  → COVER ✓
 *   1440×900 → 500×813 box → width 0.347, height 0.904, area 0.314  → COVER ✗
 *
 * At 1440 the popup fails `minWidthCoverage` by 0.153 and is dropped BEFORE any
 * evidence is read — not refused on evidence, never even counted. The desktop
 * record read `{structuralMatches: 0, qualified: 0, dismissed: 0}` while the
 * mobile record for the SAME page read `{1, 1, 1}`. So the gate was blind at
 * exactly the width the reconstruction is graded at, and the 1440 clone shipped
 * with the popup baked permanently over the homepage.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS TIER IS AND IS NOT
 * ---------------------------------------------------------------------------
 * It is a strictly ADDITIVE admission path: an element that already clears
 * {@link OVERLAY_SHAPE} is a `cover` candidate and is unaffected. An element
 * that does not may still be admitted as a `panel` candidate — and then faces
 * the SAME, unchanged evidence bar (≥1 STRONG signal AND ≥2 signals total).
 * Shape CORROBORATES a strongly-evidenced modal here; it no longer vetoes one.
 *
 * The tier is deliberately hostile to everything that is legitimately on a
 * page. Each threshold names the thing it exists to refuse:
 *
 *  `minWidthCoverage` / `minHeightCoverage` / `minAreaCoverage`
 *      A modal panel is a substantial rectangle. A chat bubble (64×64), a
 *      floating CTA, an accessibility rail (52×190) and a cookie strip are not.
 *      Measured against the five negative controls at BOTH viewports, every one
 *      of them fails at least two of these three.
 *
 *  `minAxisInset`
 *      A modal FLOATS: it is inset from the viewport on both ends of at least
 *      one axis. A header is welded to the top edge and both side edges; a
 *      cookie bar to the bottom edge and both side edges; a docked drawer to
 *      one side edge. Measured: seoultone's panel sits 0.326 in from BOTH
 *      sides at 1440. Linear's decorative `frameBackground` sits 0.042 in —
 *      refused.
 *
 *  `maxFullBleedWidth`
 *      The header / banner / toolbar / cookie-bar class, refused outright: an
 *      element that spans essentially the whole viewport width and is shorter
 *      than the COVER height threshold can never be a panel, whatever else it
 *      looks like. This is the rule that refuses linear.app's full-bleed hero
 *      frame (width 0.915, height 0.413) at both viewports.
 *
 * A panel candidate must ALSO be LIFTED — `position: fixed`, or an explicit
 * positive `z-index`. `z-index: auto` means the element takes part in the
 * page's own paint order; it is decoration, not an overlay. This single rule
 * refuses every remaining linear.app hero-frame layer (`z-index: auto`).
 *
 * Nothing here is keyed on a hostname, URL, class name or site-specific pixel.
 */
export const PANEL_SHAPE = {
  /** Minimum fraction of the viewport WIDTH a modal PANEL must cover. */
  minWidthCoverage: 0.2,
  /** Minimum fraction of the viewport HEIGHT a modal PANEL must cover. */
  minHeightCoverage: 0.25,
  /** Minimum fraction of the viewport AREA a modal PANEL must cover. */
  minAreaCoverage: 0.08,
  /**
   * A panel must be inset by at least this fraction of the viewport at BOTH
   * ends of at least one axis — i.e. it floats rather than being welded to the
   * page frame.
   */
  minAxisInset: 0.06,
  /**
   * Width coverage at or above which a box shorter than
   * {@link OVERLAY_SHAPE.minHeightCoverage} is refused as the
   * header / banner / toolbar / cookie-bar CLASS, unconditionally.
   */
  maxFullBleedWidth: 0.85,
} as const;

// --- Page-state normalization (Task 28.7 A2) -------------------------------
/** Hard cap on dismissals per page-load. Two is already generous. */
export const MAX_PAGE_STATE_DISMISSALS = 2;
/** Per-action timeout (ms). Never `force: true`. */
export const PAGE_STATE_ACTION_TIMEOUT_MS = 2_000;
/** Settle after a dismissal action before re-measuring (ms). */
export const PAGE_STATE_ACTION_SETTLE_MS = 400;
/** Gap between scans while waiting for a late-appearing overlay (ms). */
export const PAGE_STATE_SCAN_INTERVAL_MS = 300;
/** Hard cap on time spent scanning for an overlay (ms). */
export const PAGE_STATE_SCAN_MAX_MS = 1_200;
/** Max overlay candidates the normalizer describes per scan. */
export const MAX_PAGE_STATE_CANDIDATES = 16;
/**
 * DEFAULT evidence root. Every dismissal attempt writes a directory under it.
 *
 * Task 28.75 — this used to be the literal string
 * `docs/result/28.7/evidence/page-state`, hardcoded into permanently-enabled
 * production code. `docs/result/28.7/**` is a FROZEN wave artifact directory, so
 * every observation run after 28.7 closed was writing new evidence into
 * immutable history. The path is now (a) wave-neutral, (b) outside
 * `docs/result/` entirely, and (c) overridable per run:
 *
 *   pnpm observe <url> --page-state-evidence-root=docs/result/28.75/evidence/page-state
 *   pnpm observe:site <selected-pages.json> --page-state-evidence-root=…
 *   observeSelectedPages(sel, { pageStateEvidenceRoot: … })
 *   normalizePageState(page, { evidenceRoot: … })
 *
 * The invariant the smoke suite pins: this default must never point inside
 * `docs/result/`, so no future wave can silently write into a frozen one again.
 */
export const PAGE_STATE_EVIDENCE_ROOT_DEFAULT = "data/page-state-evidence";
/**
 * GENERIC, MULTILINGUAL dismissal vocabulary.
 *
 * Matched against a control's accessible label (`aria-label`, `title`, `alt`,
 * then its text), normalized to lowercase with collapsed whitespace. Nothing
 * here belongs to a particular website: these are the words a close control
 * carries in the wild.
 *
 * `symbols` must match the WHOLE label — a bare `x` inside a sentence is not a
 * close button. `phrases` may match as a substring, because real controls read
 * "오늘 하루 보지 않기 ✕" and "Close this dialog".
 */
export const PAGE_STATE_CLOSE_SYMBOLS: readonly string[] = [
  "x",
  "×",
  "✕",
  "✖",
  "✗",
  "⨯",
  "╳",
  "❌",
];
export const PAGE_STATE_CLOSE_PHRASES: readonly string[] = [
  // Korean — the two the operator named, plus the other common phrasings.
  "닫기",
  "창닫기",
  "창 닫기",
  "팝업닫기",
  "팝업 닫기",
  "오늘 하루 보지 않기",
  "오늘하루 보지 않기",
  "오늘하루보지않기",
  "하루 동안 보지 않기",
  "하루동안 보지 않기",
  "오늘은 그만 보기",
  "오늘 그만 보기",
  "다시 보지 않기",
  "그만 보기",
  // English.
  "close",
  "dismiss",
  "no thanks",
  "not now",
  // Other languages a close control commonly speaks.
  "关闭",
  "關閉",
  "閉じる",
  "cerrar",
  "fermer",
  "schließen",
  "schliessen",
  "chiudi",
  "fechar",
  "sluiten",
  "закрыть",
  "kapat",
  "إغلاق",
  "đóng",
  "ปิด",
  "tutup",
];

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

/**
 * Task 28.7 A1 — how the read-only preparation auto-scroll ENDED.
 *
 *  `prepare-scroll-complete`             the scroll ran to its own stopping
 *                                        condition; nothing navigated.
 *  `prepare-scroll-navigated-recovered`  a navigation destroyed the scroll's
 *                                        execution context; the observation
 *                                        returned to the URL under observation
 *                                        (or the page was already back on it)
 *                                        and a bounded retry completed.
 *  `prepare-scroll-navigated-fallback`   a navigation interrupted the scroll and
 *                                        the bounded recovery did not produce a
 *                                        clean retry. The observation continues
 *                                        against the stable (unscrolled or
 *                                        partially scrolled) state.
 *  `prepare-scroll-failed-fallback`      the scroll failed for a reason that is
 *                                        NOT a navigation. Recorded, never
 *                                        rethrown.
 *
 * A navigation during the preparation scroll may NEVER make the viewport
 * observation throw — that is what cost a whole route before 28.7.
 */
export const PrepareScrollStatusSchema = z.enum([
  "prepare-scroll-complete",
  "prepare-scroll-navigated-recovered",
  "prepare-scroll-navigated-fallback",
  "prepare-scroll-failed-fallback",
]);
export type PrepareScrollStatus = z.infer<typeof PrepareScrollStatusSchema>;

/** Task 28.7 A1 — what the interrupting navigation was and what was done. */
export const PrepareScrollNavigationSchema = z.object({
  /** The URL the page was on when the scroll's context was destroyed. */
  navigatedUrl: z.string().optional(),
  /** The URL the observation is FOR — what a recovery navigates back to. */
  observationUrl: z.string(),
  /** The page left the observed document (not just a fragment change). */
  leftObservedDocument: z.boolean(),
  /** A bounded `goto` back to `observationUrl` was performed. */
  recoveryNavigated: z.boolean(),
  /** A bounded scroll retry was performed after the recovery. */
  retryAttempted: z.boolean(),
  /** The retry itself was interrupted by another navigation. */
  retryNavigated: z.boolean(),
  /**
   * A final, NON-retrying `goto` was needed to leave the page on the document
   * under observation.
   *
   * This is not a second recovery attempt: nothing is scrolled after it and no
   * further retry follows. It exists because "fall back to the unscrolled state"
   * has to mean the unscrolled state OF THE OBSERVED PAGE — collecting a
   * DIFFERENT document would be a worse defect than the one A1 removes.
   */
  restoreNavigated: z.boolean(),
  /** Plain-language limitation carried into the artifact. */
  limitation: z.string(),
  /** First line of the originating error, when one was captured. */
  error: z.string().optional(),
});
export type PrepareScrollNavigation = z.infer<typeof PrepareScrollNavigationSchema>;

/**
 * Task 28.7 A3 — the DETERMINISTIC settle record for one page load.
 *
 * `networkidle` is one bounded INPUT here, never the condition. The condition
 * is that the document height and the settled-count of RENDERABLE candidate
 * images both hold still across {@link SETTLE_STABLE_SAMPLES} consecutive
 * samples. Every cap is recorded, so a page that never settles is visible as a
 * page that never settled rather than as a page that did.
 */
export const SettleOutcomeSchema = z.object({
  /** `document.readyState` had passed `interactive` when the settle began. */
  domContentLoadedReached: z.boolean(),
  /** The bounded `networkidle` wait resolved (kept as ONE input, not the gate). */
  networkIdleReached: z.boolean(),
  networkIdleMs: z.number().int().nonnegative(),
  fontsReadyReached: z.boolean(),
  fontsReadyMs: z.number().int().nonnegative(),
  /** The preparation scroll ran before the stability loop. */
  scrollRan: z.boolean(),
  scrollMs: z.number().int().nonnegative(),
  /** Document height held still for the required run of samples. */
  heightStable: z.boolean(),
  /** Renderable-image settled-count held still for the required run. */
  imagesStable: z.boolean(),
  /** Consecutive identical samples required. */
  requiredStableSamples: z.number().int().positive(),
  /** Samples actually taken. */
  samplesTaken: z.number().int().nonnegative(),
  /** Time spent in the stability loop (ms). */
  stabilityMs: z.number().int().nonnegative(),
  /** {@link SETTLE_MAX_SAMPLES} stopped the loop. */
  sampleCapHit: z.boolean(),
  /** {@link SETTLE_MAX_TOTAL_MS} stopped the loop. */
  timeCapHit: z.boolean(),
  /** The loop could not run at all (e.g. the context went away); caps recorded. */
  sampleError: z.string().optional(),
  /** `document.documentElement.scrollHeight` at the last sample. */
  finalDocumentHeight: z.number().nonnegative(),
  /**
   * RENDERABLE candidate images at the last sample — the denominator.
   * NOT `document.images`: see the in-page predicate in observe-page.ts.
   */
  renderableImages: z.number().int().nonnegative(),
  /** Of those, decoded successfully. */
  imagesLoaded: z.number().int().nonnegative(),
  /** Of those, permanently failed (they can never settle, so they never block). */
  imagesFailed: z.number().int().nonnegative(),
  /** Fixed tail wait after stability ({@link SETTLE_MS}). */
  tailMs: z.number().int().nonnegative(),
});
export type SettleOutcome = z.infer<typeof SettleOutcomeSchema>;

/**
 * Task 28.7 A2 — ONE page-state normalization attempt (a dismissal try).
 *
 * Every attempt is recorded whether it worked or not, and every attempt has a
 * matching evidence directory on disk. Silent manipulation is forbidden.
 */
export const PageStateNormalizationAttemptSchema = z.object({
  /** 1-based attempt index within this page-load. */
  index: z.number().int().positive(),
  /** `tag#id.class1.class2` — enough to find the node, no site knowledge. */
  fingerprint: z.string(),
  /** `nth-child` path from `<html>`; how the click target was addressed. */
  domPath: z.string(),
  /** The signals that qualified this overlay, in a fixed order. */
  signals: z.array(z.string()),
  /**
   * Task 28.75 — WHICH shape tier admitted this overlay as a candidate:
   *  `cover` it cleared {@link OVERLAY_SHAPE} (≥50% width AND height AND area).
   *  `panel` it did NOT clear {@link OVERLAY_SHAPE} and was admitted by
   *          {@link PANEL_SHAPE} instead — a centered, lifted, inset box. Before
   *          28.75 these were dropped before any evidence was read.
   * Defaulted for artifacts written before 28.75, where only `cover` existed.
   */
  shapeClass: z.enum(["cover", "panel"]).default("cover"),
  /** Viewport-WIDTH coverage of the overlay (0–1) at qualification time. */
  widthCoverage: z.number().default(0),
  /** Viewport-HEIGHT coverage of the overlay (0–1) at qualification time. */
  heightCoverage: z.number().default(0),
  /** Which action was taken. */
  method: z.enum(["close-control", "escape"]),
  /** The close control's accessible label, when one was used. */
  closeControlLabel: z.string().optional(),
  /** Where that label came from: `aria-label` / `title` / `alt` / `text`. */
  closeControlLabelSource: z.string().optional(),
  /** `nth-child` path of the close control itself. */
  closeControlPath: z.string().optional(),
  /**
   * Outcome:
   *  `dismissed`         the overlay is gone or no longer covering.
   *  `not-dismissed`     the action ran and the overlay still covers.
   *  `no-geometry-change` the overlay went, but nothing about the page geometry
   *                      moved — recorded distinctly because it means the
   *                      dismissal may have achieved nothing.
   *  `click-error`       the click/keypress itself failed (never forced).
   *  `navigated`         the action navigated the page; recorded and restored.
   */
  outcome: z.enum([
    "dismissed",
    "not-dismissed",
    "no-geometry-change",
    "click-error",
    "navigated",
  ]),
  /** Document scrollHeight before / after the action. */
  documentHeightBefore: z.number().nonnegative(),
  documentHeightAfter: z.number().nonnegative(),
  /** The overlay's own viewport-area coverage before / after (0–1). */
  overlayCoverageBefore: z.number(),
  overlayCoverageAfter: z.number(),
  /** Page scroll was locked before / after. */
  pageScrollLockedBefore: z.boolean(),
  pageScrollLockedAfter: z.boolean(),
  /** Evidence directory, RELATIVE to the repo root. Always written. */
  evidenceDir: z.string().optional(),
  /** First line of any error. */
  error: z.string().optional(),
});
export type PageStateNormalizationAttempt = z.infer<
  typeof PageStateNormalizationAttemptSchema
>;

/**
 * Task 28.7 A2 — the page-state normalization summary for one page-load.
 *
 * THE CONTRACT CHANGE. Before 28.7 the observer never clicked. Obtaining the
 * NORMAL page state is now a product requirement, so the observer gained a
 * bounded, evidence-gated normalization phase that may perform a very small
 * number of conservative clicks BEFORE collection. COLLECTION itself is still
 * strictly read-only, and every action taken is recorded here and on disk.
 */
export const PageStateNormalizationSchema = z.object({
  /** The pass ran at all (false when opted out with `--no-normalize-page-state`). */
  ran: z.boolean(),
  /** Scans performed while waiting for a late-appearing overlay. */
  scans: z.number().int().nonnegative(),
  /**
   * Elements that cleared the SHARED COVER shape gate ({@link OVERLAY_SHAPE}).
   *
   * Deliberately unchanged by Task 28.75: this counter is the one the collector's
   * read-only overlay census also reports, and the smoke suite pins the two
   * element-for-element so the census and the normalizer cannot drift apart. The
   * new panel tier is counted separately in {@link panelMatches}.
   */
  structuralMatches: z.number().int().nonnegative(),
  /**
   * Wide-but-short positioned elements the COVER gate refused as a class
   * (headers / banners / toolbars). Also unchanged by 28.75, and also pinned to
   * the census.
   */
  headerLikeRefused: z.number().int().nonnegative(),
  /**
   * Task 28.75 — elements admitted by the CENTERED PANEL tier
   * ({@link PANEL_SHAPE}) that the COVER gate did not admit. Additive: a cover
   * match is never counted here. Defaulted to 0 on pre-28.75 artifacts.
   */
  panelMatches: z.number().int().nonnegative().default(0),
  /** Shape-matching elements (cover OR panel) that cleared the EVIDENCE bar. */
  qualified: z.number().int().nonnegative(),
  /** Overlays actually dismissed (outcome `dismissed`). */
  dismissed: z.number().int().nonnegative(),
  /** Attempts made (bounded by {@link MAX_PAGE_STATE_DISMISSALS}). */
  attempts: z.array(PageStateNormalizationAttemptSchema),
  /** The attempt cap stopped further dismissals. */
  attemptCapHit: z.boolean(),
  /** An initial-paint census was available to supply the time-based signal. */
  initialPaintCensusAvailable: z.boolean(),
  /**
   * Task 28.75 — WHY the census was or was not usable, so a caller that skipped
   * the two-call contract can see it rather than silently losing a STRONG
   * signal (see `docs/result/28.75/page-state-api-contract.md`):
   *
   *  `available` a complete census was installed and read.
   *  `absent`    NOTHING was parked on the page under
   *              {@link INITIAL_PAINT_STATE_KEY} — the caller never ran
   *              `markInitialPaintCensus`. `appeared-after-initial-paint` can
   *              never fire on this load.
   *  `partial`   a census was installed but hit
   *              {@link MAX_INITIAL_PAINT_ELEMENTS}. Refused on purpose: an
   *              element the census never reached is indistinguishable from one
   *              that did not exist yet, and that is the direction that invents
   *              a modal out of a legitimate fixed element.
   *  `unreadable` the key held something that could not be read as a census.
   */
  initialPaintCensusStatus: z
    .enum(["available", "absent", "partial", "unreadable"])
    .default("available"),
  /** Plain-language limitations for this page-load. */
  limitations: z.array(z.string()),
});
export type PageStateNormalization = z.infer<typeof PageStateNormalizationSchema>;

/**
 * Task 28.7 B1 — ONE main-document navigation attempt and what the server said.
 *
 * `status` is `null` only when Playwright genuinely produced no main-frame
 * `Response` (a same-document navigation, or `about:blank`). Recording `null`
 * is honest; inventing `200` would not be.
 */
export const DocumentNavigationAttemptSchema = z.object({
  /** 1-based, in order. */
  attempt: z.number().int().positive(),
  /** HTTP status of the main document, or `null` when unavailable. */
  status: z.number().int().nullable(),
  statusText: z.string().optional(),
  /** The URL the response came from (after redirects). */
  responseUrl: z.string().optional(),
});
export type DocumentNavigationAttempt = z.infer<
  typeof DocumentNavigationAttemptSchema
>;

/**
 * Task 28.7 B1 — THE MAIN DOCUMENT'S HTTP STATUS, recorded at last.
 *
 * Before B1 the observer never called `response.status()` for the document at
 * all (the single call in the pipeline was scoped to STYLESHEET responses), so
 * a 5xx proxy error body was filed as a successful observation with no signal
 * anywhere in the artifact. `page.goto` returns the main-frame response; this
 * record is that response, plus every attempt made to get it.
 */
export const DocumentResponseSchema = z.object({
  /** Final attempt's status, or `null` when genuinely unavailable. */
  status: z.number().int().nullable(),
  statusText: z.string().optional(),
  responseUrl: z.string().optional(),
  /** `status` is 200-299. False for every non-2xx AND for an unavailable status. */
  ok: z.boolean(),
  /** No main-frame response object existed — `status` is `null` for that reason. */
  statusUnavailable: z.boolean(),
  /** Every attempt, in order. Length > 1 means a retry happened. */
  attempts: z.array(DocumentNavigationAttemptSchema),
  /** A bounded retry was performed because the first attempt was non-2xx. */
  retried: z.boolean(),
  /** Backoff waited before the retry, when one was made. */
  retryBackoffMs: z.number().int().nonnegative().optional(),
  /** Attempts allowed on this load ({@link MAX_DOCUMENT_NAV_ATTEMPTS}). */
  maxAttempts: z.number().int().positive(),
});
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;

/**
 * Task 28.7 B1 — why an observation is NOT trustworthy as a capture of the
 * source page.
 *
 *  `non-2xx-document`        the main document's final HTTP status was not 2xx
 *                            after the bounded retry. The bytes collected are
 *                            the SERVER'S error page, not the site.
 *  `cross-viewport-starved`  this viewport's element count is below
 *                            {@link CROSS_VIEWPORT_STARVATION_RATIO} of the
 *                            richest viewport of the SAME page in the SAME run.
 *                            Corroboration for the soft-error case that answers
 *                            200; keyed on the run's own data, never on a fixed
 *                            element count.
 *  `probe-starved`           this viewport's LAYOUT PROBE walked fewer than
 *                            {@link PROBE_DOCUMENT_STARVATION_RATIO} of the
 *                            elements the deep walk of the same viewport
 *                            collected, after the bounded probe retry. The
 *                            probe's own page load did not get the page. The
 *                            deep observation is unaffected and stays usable;
 *                            it is the width evidence that is missing.
 */
export const SourceIntegrityReasonSchema = z.enum([
  "non-2xx-document",
  "cross-viewport-starved",
  "probe-starved",
]);
export type SourceIntegrityReason = z.infer<typeof SourceIntegrityReasonSchema>;

/**
 * Task 28.7 B1 — the MARK on an observation that must not be treated as the
 * source page.
 *
 * WHY THE OBSERVATION IS KEPT AND MARKED RATHER THAN DROPPED. Losing a page's
 * observation entirely is the worst available outcome: `compile-routes` then
 * cannot set `renderSourcePageId` and `route-plan` throws, so ONE bad response
 * destroys the whole reconstruction — the exact P0 Task 28.7 A1 exists to
 * remove. So the artifact stays, and every level of it carries this record:
 * the viewport, the page observation, and the site manifest entry. A consumer
 * that reads any of them can refuse the capture; a consumer that reads none of
 * them was already ignoring `screenshotDegraded` and `degradedToFloor` too.
 *
 * `suspect` is the flag; `reasons` is machine-readable; `limitations` is the
 * plain-language sentence a human reads in the artifact.
 */
export const SourceIntegritySchema = z.object({
  suspect: z.boolean(),
  reasons: z.array(SourceIntegrityReasonSchema),
  limitations: z.array(z.string()),
});
export type SourceIntegrity = z.infer<typeof SourceIntegritySchema>;

/**
 * Task 28.7 B1 — the page-level roll-up of {@link SourceIntegritySchema}, so a
 * consumer reading `observation.json` sees the mark without walking viewports.
 */
export const PageSourceIntegritySchema = z.object({
  /** True when ANY viewport of this page is suspect. */
  suspect: z.boolean(),
  /** Which viewports are suspect, ascending by profile id. */
  suspectViewportIds: z.array(z.string()),
  /** Union of the viewport reasons. */
  reasons: z.array(SourceIntegrityReasonSchema),
  /** Union of the viewport limitations, each prefixed with its viewport id. */
  limitations: z.array(z.string()),
});
export type PageSourceIntegrity = z.infer<typeof PageSourceIntegritySchema>;

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
  /**
   * Task 28.7 A1 — how the preparation scroll ENDED. Optional so every
   * pre-28.7 artifact still parses; present on every run that scrolled from
   * 28.7 on. See {@link PrepareScrollStatusSchema}.
   */
  prepareScrollStatus: PrepareScrollStatusSchema.optional(),
  /**
   * Task 28.7 A1 — the navigation that interrupted the scroll, when one did.
   * Absent on the overwhelmingly common `prepare-scroll-complete` path.
   */
  prepareScrollNavigation: PrepareScrollNavigationSchema.optional(),
  /**
   * Task 28.7 B1 — the MAIN DOCUMENT's HTTP status and every navigation attempt
   * made for it. Optional so every pre-B1 artifact still parses; present on
   * every load from B1 on. See {@link DocumentResponseSchema}.
   */
  documentResponse: DocumentResponseSchema.optional(),
  /**
   * Task 28.7 A3 — the DETERMINISTIC settle record. Optional so pre-28.7
   * artifacts still parse.
   */
  settle: SettleOutcomeSchema.optional(),
  /**
   * Task 28.7 A2 — the bounded page-state normalization pass. Present on every
   * run from 28.7 on (with `ran: false` when it was opted out of); absent on
   * every earlier artifact.
   */
  pageStateNormalization: PageStateNormalizationSchema.optional(),
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
  /** Responsive Core P0 §C1.1 — `document-response.html`, when written. */
  documentResponseBytes: z.number().optional(),
  /** Source Preservation V2 Phase 1 — total bytes under `source-package/`, when captured. */
  sourcePackageBytes: z.number().optional(),
  /** Sum of all this viewport's files (6 data files + screenshot [+ document response] [+ source package]). */
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

/** One resolved `:root` custom property: its name and its computed value. */
export const RootCustomPropertySchema = z.object({
  /** Case-sensitive, as authored (`--Brand` and `--brand` are two properties). */
  name: z.string(),
  value: z.string(),
});
export type RootCustomProperty = z.infer<typeof RootCustomPropertySchema>;

/**
 * The root custom properties observed AT ONE VIEWPORT (Task 28.5B §5).
 *
 * Per viewport, never merged: `--brand` legitimately differs between 390 and
 * 1440 when a media query says so, and flattening the two into one universal
 * map would invent a value neither viewport had.
 */
export const RootCustomPropertiesSchema = z.object({
  /** Sorted by `name`, ascending code-point order. */
  properties: z.array(RootCustomPropertySchema),
  /** Distinct names discovered before any cap was applied. */
  discoveredCount: z.number().int().nonnegative(),
  /** True when {@link MAX_ROOT_CUSTOM_PROPERTIES} stopped the harvest. */
  countCapped: z.boolean(),
  /** Names dropped for exceeding {@link ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN}. */
  valueCappedCount: z.number().int().nonnegative(),
  /**
   * Names discovered in a stylesheet that the cascade does not resolve on the
   * document element (`getComputedStyle` returns `""`), and were therefore
   * dropped. `.optional()` because it was added after the first 28.5B runs;
   * every new observation carries it.
   */
  unresolvedCount: z.number().int().nonnegative().optional(),
  /**
   * Task 28.5B Change 5, correction 2 — REFERENCE-DRIVEN DISCOVERY counters.
   *
   * Distinct `--name`s referenced by `var()` inside captured inline-SVG markup.
   * That channel exists because a name declared only in a CROSS-ORIGIN sheet is
   * unknowable from the CSSOM (`cssRules` throws) while its value still
   * resolves through `getComputedStyle` — measured on linear.app as 16 names
   * across 239 SVGs that no sheet walk can ever see.
   *
   * All `.optional()`: records written before this correction carry none of
   * them and must keep parsing.
   */
  referenceDiscoveredCount: z.number().int().nonnegative().optional(),
  /** Referenced names kept with a value resolved AT THE CONSUMING ELEMENT. */
  referenceResolvedCount: z.number().int().nonnegative().optional(),
  /**
   * Referenced names a stylesheet had already revealed. Precedence rule: the
   * sheet/root-resolved value stands and the element is not consulted, because
   * only the sheet channel proves the declaration is root-scoped.
   */
  referenceSheetKnownCount: z.number().int().nonnegative().optional(),
  /** Referenced names resolving to `""` at EVERY element that consumes them. */
  referenceUnresolvedCount: z.number().int().nonnegative().optional(),
  /**
   * Times two consuming elements resolved one name to two different non-empty
   * values. The first element in document order wins; this counter is the
   * honesty channel for the value the single wrapper-level block cannot carry.
   */
  referenceResolutionConflicts: z.number().int().nonnegative().optional(),
});
export type RootCustomProperties = z.infer<typeof RootCustomPropertiesSchema>;

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
  /**
   * Task 28.5B §5 — root custom properties at THIS viewport. Embedded rather
   * than written as a sibling file: the record is small (a few hundred short
   * declarations at most, bounded by the caps above) and a new required key in
   * `ViewportFilesSchema` would stop every historical observation from parsing.
   * `.optional()` so pre-28.5B runs still load unchanged.
   */
  customProperties: RootCustomPropertiesSchema.optional(),
  /**
   * Task 28.6 W1 — how much of this page's authored CSS the observation could
   * actually read. Embedded for the same reason as `customProperties`: a
   * fixed-size record, and a new required key in `ViewportFilesSchema` would
   * stop every historical observation from parsing. `.optional()` so pre-28.6
   * runs still load unchanged.
   */
  stylesheetCoverage: StylesheetCoverageSchema.optional(),
  /**
   * Source Preservation V2 Phase 1 — pointer to this load's Source Package
   * (`viewports/<id>/source-package/`), present only when the observation was
   * run with `sourcePackage` enabled. Optional and additive: every historical
   * observation, and every run without the option, parses unchanged.
   */
  sourcePackage: SourcePackagePointerSchema.optional(),
  /**
   * Task 28.6 C2 B4 — how much of this viewport's page paints nothing. Embedded
   * for the same reason as the two records above (fixed size; a new required
   * `files` key would stop every historical observation from parsing).
   */
  paintSuppression: PaintSuppressionSchema.optional(),
  /**
   * Task 28.6 C2 B4 — the preparation scroll's reveal/re-hide measurement.
   * Absent when no preparation scroll ran on this load.
   */
  scrollReveal: ScrollRevealSchema.optional(),
  /** Task 28.6 C2 B5 — modal-shaped elements, recorded and never resolved. */
  overlayCensus: OverlayCensusSchema.optional(),
  /**
   * Task 28.7 — the full-page screenshot could not be taken within
   * {@link SCREENSHOT_TIMEOUT_MS} and this viewport's `screenshot.png` is NOT a
   * full-page capture. Carries the fallback that was used and the error that
   * forced it.
   *
   * ABSENT on every healthy observation, so a consumer that compares screenshots
   * (reconstruction QA does) can refuse a degraded one rather than silently
   * grading a viewport-sized image against a full-page one.
   */
  screenshotDegraded: z.string().optional(),
  /**
   * Task 28.7 A4 — the counted reveal-regression correction applied to this
   * viewport's emitted style tokens. Absent on pre-28.7 artifacts and on any
   * load whose preparation scroll measured no regression.
   */
  revealRegressionPolicy: RevealRegressionPolicySchema.optional(),
  /**
   * Task 28.7 B1 — ABSENT on a healthy capture. Present, with `suspect: true`,
   * when this viewport's bytes are not trustworthy as the source page (the
   * document answered non-2xx after a bounded retry, or the capture is starved
   * relative to the same page's other viewport in the same run).
   */
  sourceIntegrity: SourceIntegritySchema.optional(),
  /**
   * Responsive Core P0 §C1.1 — the main-document response as served. Absent on
   * pre-P0 artifacts (a consumer reads "initial-document evidence absent").
   */
  initialDocument: InitialDocumentSchema.optional(),
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
 *
 * Task 28.6 W1.3 added 700 and 1100 to the pre-28.6 set
 * `[390, 768, 1024, 1440, 1920]`:
 *
 *   1100 — 28.5C measured the fluid-node detector against the SAME page with
 *     and without a sample near 1100: 508 fluid nodes were detected WITH it and
 *     9 without. Every neighbouring sample (1024, 1440) sits on a breakpoint
 *     edge on the sites measured, so without an interior sample the detector
 *     cannot separate a fluid box from a stepped one.
 *   700 — an acceptance width of Task 28.6, and the width at which the clone's
 *     mobile/desktop switch is decided. A width that is never probed is a width
 *     the layout inference has no evidence for.
 *
 * Cost is one `setViewportSize` + settle + measure per width per page (no extra
 * page load), measured in the W1 report.
 */
export const LAYOUT_PROBE_WIDTHS: readonly number[] = [
  390, 700, 768, 1024, 1100, 1440, 1920,
];

/**
 * Task 28.6 W1.4 — the MOBILE-context probe widths.
 *
 * The desktop probe answers "how does this box respond as the desktop-context
 * viewport narrows"; it cannot answer anything about the MOBILE tree, because
 * that tree only exists in a mobile browser context (390×844, DPR 3, touch,
 * Android UA) and a site that serves a different DOM to mobile never shows it to
 * a desktop-context probe. The clone attaches inferred rules per viewport tree,
 * so with no mobile probe the mobile subtree inherits nothing and a 700px
 * viewport renders a 390px layout.
 *
 * The set stays BELOW the desktop/mobile switch: the widths where the mobile
 * tree is the tree actually rendered. 914 is the widest sample kept (a
 * two-column tablet-ish width) so a mobile-tree box that is fluid up to the
 * switch is measured on both sides of 768.
 *
 * TASK 28.7 B2 — THIS IS A FLOOR, NOT A CEILING, ANY MORE. 28.6 defect A13
 * measured the cost of treating it as one: the switch is above 914 on 5 of 7
 * pilot sites (1025 on three, 1280 on a fourth), so the band between 914 and
 * the switch had no width evidence at all and a clone served a 390px layout at
 * 1024. The mobile derivation may now extend its ceiling ABOVE the widest width
 * here, but ONLY as far as the site's own authored breakpoints reach and by at
 * most {@link MAX_ENVELOPE_EXTENSION_BRACKETS} of them — see
 * `ProbeWidthProvenance.envelopeExtension`. A site that authors nothing above
 * this list is still probed exactly across this list.
 */
export const MOBILE_LAYOUT_PROBE_WIDTHS: readonly number[] = [
  390, 480, 700, 768, 914,
];

/**
 * Task 28.6 C3 D1 — the HARD CAP on how many widths ONE probe pass samples,
 * floor set + authored-breakpoint samples + operator extras together.
 *
 * Every extra width costs one `setViewportSize` + {@link LAYOUT_PROBE_SETTLE_MS}
 * + one in-page measure pass, with NO extra page load. MEASURED 2026-09-02, two
 * A/B pairs per site on one browser, desktop probe pass only:
 *
 *            floor (7 widths)     derived (16 widths)   per added width
 *   linear    6,596 / 5,664 ms      8,271 / 9,259 ms    ~0.29 s
 *   stripe    5,036 / 4,734 ms      8,038 / 8,382 ms    ~0.37 s
 *
 * TASK 28.7 §27 ADDS THE DOM-FAMILY FINGERPRINT TO EVERY WIDTH, and it is
 * effectively free against the numbers above. MEASURED 2026-09-05 in-page on
 * linear.app (median of 7 repeats per width, 2,171 parked elements / ~2,280 live
 * elements, same settled layout, no extra round trip):
 *
 *            existing geometry pass    fingerprint walk
 *    390px          1.8 ms                  1.7 ms
 *    641px          1.8 ms                  2.0 ms
 *   1024px          1.6 ms                  1.8 ms
 *   1440px          2.0 ms                  2.5 ms
 *
 * So about 2 ms on a ~300 ms per-width budget — UNDER 1% — because the per-width
 * cost is dominated by `setViewportSize` plus {@link LAYOUT_PROBE_SETTLE_MS},
 * not by measurement, and the fingerprint deliberately reads `getClientRects()`
 * rather than `getComputedStyle`. The artifact grows by four scalars per width
 * (about 90 bytes) against per-width x/w/v arrays of thousands of numbers.
 *
 * and the artifact roughly doubles: `layout-probe.json` 374,591 → 829,451 bytes
 * on linear.app/pricing (+121%) and 513,832 → 1,124,804 on stripe.com (+119%),
 * all of it the per-width x/w/v arrays. A two-viewport page therefore pays
 * about 5-7s and ~1 MB for the full 16.
 *
 * 16 leaves 9 slots above the 7-width desktop floor — four authored breakpoint
 * BRACKETS plus one — and 11 above the 5-width mobile floor. THE CAP DOES BITE
 * ON REAL SITES: linear.app/pricing folds 14 screen breakpoints and 4 are
 * refused, stripe.com folds 21 and 12 are refused. Those are not silent — the
 * surplus is counted in `breakpointsDroppedByCap` and itemised by value in
 * `breakpointsRefused` — but they are the reason to revisit this number with
 * the per-width cost above rather than to assume 16 is enough.
 */
export const MAX_PROBE_WIDTHS_TOTAL = 16;
/**
 * Task 28.6 W6 O3 — floor widths that can NEVER be given up to make room for an
 * authored breakpoint.
 *
 * THE DEFECT THIS BOUNDS. The budget used to be spent floor-first: all seven
 * floor widths were seeded before any authored bracket was considered, so when
 * the cap bit it was always an AUTHORED width that lost. MEASURED on
 * gs.severance.healthcare (run `2026-09-02T20-18-25-207Z`, p000002 desktop):
 * `capHit: true`, `breakpointsDroppedByCap: 3` — the site's own `768/max`,
 * `992/min` and `1200/min` were refused while the un-authored floor widths 700,
 * 1100 and 1920 were kept. On seoultone.kr the same inversion refused `1600/max`
 * (p000001) and `1200/max` (p000002, p000003). Seven breakpoints is not unusual
 * for a CMS theme.
 *
 * A width the site AUTHORED is worth more than a width nobody authored, because
 * the band edge the reconstruction engine emits is the midpoint of two adjacent
 * samples and only a sample AT the authored pixel pins it. So the floor is now
 * evictable — except for this guaranteed core, which keeps a site that authors
 * NOTHING (or whose CSS could not be read) probed across its whole envelope.
 *
 * THREE, chosen by position in the sorted floor list, not by value: the
 * narrowest, the widest, and the median. For the desktop floor
 * (390/700/768/1024/1100/1440/1920) that is 390, 1024 and 1920 — a mobile, a
 * laptop and a wide sample. Naming pixel values here instead would be the
 * host-specific hack this engine forbids.
 */
export const MIN_GUARANTEED_FLOOR_WIDTHS = 3;
/**
 * Task 28.7 B2 — how many AUTHORED brackets may push a probe pass's width
 * envelope ABOVE its floor set's own ceiling.
 *
 * THE DEFECT THIS EXISTS FOR (28.6 defect A13). The mobile probe's floor set
 * tops out at its widest floor width, and the derivation's default `maxWidth`
 * is exactly that width, so every authored breakpoint above it was counted
 * `out-of-range` and never sampled. But the MOBILE TREE is what renders up to
 * the desktop/mobile switch, and on 5 of 7 pilot sites that switch is above the
 * mobile ceiling — leaving a band (915-1024 on three of them, 915-1279 on a
 * fourth) with NO width evidence at all, which is why a clone served a 390px
 * layout at 1024.
 *
 * Hardcoding a wider ceiling was explicitly rejected in 28.6: it is a guess.
 * The switch is inferred DOWNSTREAM and does not exist at observe time, but the
 * PIXEL that governs it is authored in the site's own CSS — normally in the
 * DESKTOP-loaded stylesheets, which the same run already read. So the envelope
 * is extended only as far as the site's own authored evidence reaches, and only
 * by this many brackets.
 *
 * TWO. The nearest authored edge above the floor ceiling is the leading
 * candidate for the switch, and the one after it covers the case where the
 * first is an intra-mobile layout change rather than the switch itself.
 * Admitting every authored bracket above the ceiling would sample the mobile
 * tree at widths where no site ever shows it and would spend cap slots that
 * in-envelope brackets need; admitting none is the defect. Every bracket
 * admitted is listed in `envelopeExtension` on the provenance.
 */
export const MAX_ENVELOPE_EXTENSION_BRACKETS = 2;
/**
 * Refused breakpoints listed by value in `ProbeWidthProvenance`. The COUNTS are
 * always complete; this bounds only the itemised list.
 */
export const MAX_LISTED_REFUSED_BREAKPOINTS = 32;
/** Extra probe widths a CLI may add (per probe pass). Bounds the CLI flag. */
export const MAX_EXTRA_PROBE_WIDTHS = 8;
/** Accepted range for an operator-supplied probe width, in CSS pixels. */
export const MIN_PROBE_WIDTH = 200;
export const MAX_PROBE_WIDTH = 4_096;
export const LAYOUT_PROBE_HEIGHT = 900;
/** Elements tracked by one probe. Beyond this, `truncated: true`. */
export const MAX_LAYOUT_PROBE_ELEMENTS = 8_000;
/** Settle after each viewport resize, before measuring. */
export const LAYOUT_PROBE_SETTLE_MS = 250;

/**
 * TASK 28.7 §27 — HOW DEEP THE PER-WIDTH STRUCTURE HASH LOOKS.
 *
 * The hash exists to catch a family swap that keeps the RENDERED COUNT the same
 * and changes what is rendered (variant A of 40 boxes replaced by variant B of
 * 40 boxes). It is deliberately SHALLOW because it is compared for exact
 * equality across widths sampled seconds apart on a live page: a deep hash also
 * changes when a lazy image mounts, an analytics node is appended or a
 * virtualised list scrolls, none of which are width facts, and a single spurious
 * inequality would invent a switch. Six levels covers `html > body > wrapper >
 * shell > main > section`, which is where a served-variant swap is visible on
 * every site measured, and stops above the churn.
 */
export const PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH = 6;

/**
 * TASK 28.7 §27 — THE DOM-FAMILY FINGERPRINT OF ONE PROBED WIDTH.
 *
 * WHAT IT IS FOR. The rest of {@link LayoutProbeWidthSchema} measures the boxes
 * of the elements the probe PARKED at its walk width. That answers "where did
 * this element move to", and a CSS reflow and a served-variant swap answer it
 * identically — which is exactly why `tree-switch.ts` could not tell them apart
 * and why `domSwitchWidthObserved` was hardcoded `false`. This record answers a
 * different question about the SAME resize: WHICH FAMILY OF ELEMENTS DOES THIS
 * WIDTH RENDER. It is taken from the LIVE document, not from the parked walk, so
 * it sees nodes that did not exist at walk time.
 *
 * MEASURED, AND THE REASON THE FIELDS ARE THE FIELDS THEY ARE. On linear.app the
 * source's total element population is FLAT across the switch — 4,704 nodes at
 * 700, 1024, 1100 and 1440 on `/`, 2,771 at every width on `/pricing` — while
 * the count of nodes that RENDER goes 969 → 2,860 between 390 and 700. Linear
 * ships both variants in one document and swaps them with `display`. A
 * population-only fingerprint would have called that page purely CSS-responsive
 * and changed nothing. So {@link rendered} is the primary field and
 * {@link elements} is the corroborating one, not the other way round: a site that
 * MOUNTS its variants (population moves) and a site that DISPLAYS them
 * (population flat, rendered set moves) are the same fact, and only the rendered
 * set is common to both.
 *
 * `rendered` is "generates layout boxes" — `getClientRects().length > 0`. That is
 * `display: none` (and any ancestor's) and nothing else: it is NOT the Observer's
 * standard visibility rule, because `visibility: hidden` and `opacity: 0` leave
 * an element in the rendered family and are paint facts, not family facts. It
 * also costs no style resolution, which is what keeps this affordable at 16
 * widths per page per viewport.
 */
export const LayoutProbeFingerprintSchema = z.object({
  /**
   * Elements in the LIVE document at this width, under the probe walk's own skip
   * policy ({@link SKIP_TAGS}) and its `<svg>` cut. Moves when the page MOUNTS or
   * UNMOUNTS a variant.
   */
  elements: z.number().int().nonnegative(),
  /**
   * …of those, the ones that generate layout boxes: the family this width
   * actually RENDERS. Moves when the page mounts a variant AND when it merely
   * displays one, which is why it is the field the switch is derived from.
   */
  rendered: z.number().int().nonnegative(),
  /**
   * FNV-1a (32-bit, hex) over `depth:tag` for every RENDERED element down to
   * {@link PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH}. Catches a swap that holds both
   * counts and changes what is under them.
   */
  structure: z.string(),
  /**
   * The live walk hit {@link MAX_LAYOUT_PROBE_ELEMENTS}. Both counts are then
   * floors and the hash covers a prefix, so a consumer must treat a change as
   * evidence and an EQUALITY as unproven.
   */
  truncated: z.boolean(),
});
export type LayoutProbeFingerprint = z.infer<typeof LayoutProbeFingerprintSchema>;

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
  /**
   * TASK 28.7 §27 — the DOM-family fingerprint of this width.
   *
   * OPTIONAL, and its absence is a fact about the RUN, not about the page: every
   * `layout-probe.json` written before §27 has none, and every one of those
   * documents must keep parsing. A consumer reads "no fingerprint evidence
   * here", never "no family change here".
   */
  fingerprint: LayoutProbeFingerprintSchema.optional(),
  /**
   * Responsive Core P0 §C1.3 — per element, the index into the probe-level
   * {@link LayoutProbe.inlineStyleTable} of its normalized `style` attribute
   * text at this width; `-1` = no (or empty) `style` attribute, or
   * disconnected. Absent on pre-P0 probes.
   */
  s: z.array(z.number().int().min(-1)).optional(),
});
export type LayoutProbeWidth = z.infer<typeof LayoutProbeWidthSchema>;

/**
 * Responsive Core P0 §C1.6 — one adjacent probe pair whose DOM-family
 * fingerprints changed (per `familyChangeVerdict`), bisected by in-place resize
 * to a 1px bracket. `lo`/`hi` are the FINAL bracket; `converged` = `hi - lo <= 1`.
 */
export const FamilySwitchBisectionSchema = z.object({
  /** The adjacent probe widths the bisection started from. */
  pairLo: z.number().int().positive(),
  pairHi: z.number().int().positive(),
  lo: z.number().int().positive(),
  hi: z.number().int().positive(),
  loFingerprint: LayoutProbeFingerprintSchema,
  hiFingerprint: LayoutProbeFingerprintSchema,
  steps: z.number().int().nonnegative(),
  /**
   * True only when BOTH ends of the final 1px bracket were re-measured and
   * the family verdict between them is `changed`.
   */
  converged: z.boolean(),
  /**
   * Review fix M3 — why `converged` is false: `gradual` (the re-measured 1px
   * bracket shows no family change — the switch is spread over the range),
   * `step-limit` (no 1px bracket within the step bound), `error` (a resize /
   * measure failed).
   */
  reason: z.enum(["gradual", "step-limit", "error"]).optional(),
});
export type FamilySwitchBisection = z.infer<typeof FamilySwitchBisectionSchema>;

/**
 * Task 28.6 C3 D1 — one probed width and the reason it is in the set.
 *
 * `source` is the FIRST reason in a fixed precedence (`floor` >
 * `authored-below` > `authored-above` > `operator`), so the record is
 * deterministic when a width has more than one; `alsoAuthored` /
 * `breakpointPx` / `breakpointKind` carry the authored reason for a floor
 * width that happens to sit on a breakpoint, which is exactly the Linear /
 * pricing case (1024 is both a floor sample and the low side of the authored
 * `max-width: 1024px`).
 */
export const ProbeWidthOriginSchema = z.object({
  width: z.number().int().positive(),
  source: z.enum(["floor", "authored-below", "authored-above", "operator"]),
  /** True when this width is ALSO one side of an authored breakpoint. */
  alsoAuthored: z.boolean().optional(),
  /** The whole-pixel breakpoint this width brackets, when it brackets one. */
  breakpointPx: z.number().int().nonnegative().optional(),
  /** Which side of the authored change the breakpoint names. */
  breakpointKind: z.enum(["min", "max"]).optional(),
  /**
   * Task 28.7 B2 — this width lies ABOVE the floor set's own ceiling and exists
   * only because an authored breakpoint extended the envelope. Absent on every
   * width inside the floor envelope, and on every pre-B2 run.
   */
  beyondFloorEnvelope: z.boolean().optional(),
});
export type ProbeWidthOrigin = z.infer<typeof ProbeWidthOriginSchema>;

/**
 * Task 28.6 C3 D1 — the derived probe-width set and its provenance.
 *
 * WHY THIS EXISTS. The probe used to sample a fixed global width list, and the
 * reconstruction engine builds a responsive band edge at the MIDPOINT of two
 * adjacent samples. So the density and placement of the samples sets how wrong
 * every band edge can be. MEASURED on linear.app/pricing: the authored
 * breakpoint is `max-width: 1024px` (a change between 1024 and 1025), the
 * samples either side were 1024 and 1440, the emitted edge was their midpoint
 * 1232, and the clone hid the comparison table across 1025–1231 where the
 * source shows it. The responsive-QA harness graded that pair a BLOCKER
 * independently.
 *
 * Every counter here exists so a caller can tell "this page authored no
 * breakpoints" from "we could not read this page's breakpoints" from "we read
 * them and the cap refused some".
 */
export const ProbeWidthProvenanceSchema = z.object({
  /** The fixed floor set, always included whatever the authored CSS says. */
  floorWidths: z.array(z.number().int().positive()),
  /** {@link MAX_PROBE_WIDTHS_TOTAL} (or the caller's override). */
  cap: z.number().int().positive(),
  /** True when the cap stopped at least one breakpoint from being sampled. */
  capHit: z.boolean(),
  /** One entry per probed width, ascending by width. */
  origins: z.array(ProbeWidthOriginSchema),
  /**
   * True when NO authored breakpoint could be adopted and the set is the floor
   * list alone. `degradedReason` says which of the three cases it is.
   */
  degradedToFloor: z.boolean(),
  /**
   * WHY the set is the floor list alone. Six causes, deliberately not collapsed
   * — a consumer acts differently on each, and merging any pair of them would
   * state something false about the page:
   *
   * `"no-condition-tally"` — the observation carried no authored-media tally at
   *   all (a pre-C3 artifact, or a capture mode that indexes no stylesheets).
   * `"authored-css-unreadable"` — the page HAS stylesheets and not one of them
   *   could be read, so its breakpoints are UNKNOWN, not absent.
   * `"cap-left-no-room"` — breakpoints were found and the width budget was
   *   already full. See `breakpointsRefused` for which ones.
   * `"breakpoints-out-of-range"` — every breakpoint found lies outside this
   *   pass's width envelope (the common mobile case: a 1024px desktop edge).
   * `"authored-breakpoints-already-bracketed"` — the page authors breakpoints
   *   and the FLOOR SET already samples both sides of every one. Nothing is
   *   missing; this is a success that happens to add no width.
   * `"no-width-breakpoints"` — the CSS was read and authors no screen width
   *   condition at all.
   *
   * Absent when the derivation added at least one width. Precedence is fixed in
   * the order above, so the reason is deterministic when several apply.
   */
  degradedReason: z
    .enum([
      "no-condition-tally",
      "authored-css-unreadable",
      "cap-left-no-room",
      "breakpoints-out-of-range",
      "authored-breakpoints-already-bracketed",
      "no-width-breakpoints",
    ])
    .optional(),
  /** Distinct `@media` conditions read, and their summed authored weight. */
  conditionsRead: z.number().int().nonnegative(),
  conditionsWeight: z.number().int().nonnegative(),
  /** Distinct conditions the collector's own cap refused to record. */
  conditionsDroppedByCollector: z.number().int().nonnegative(),
  /** Folded whole-pixel breakpoints, before any range or cap filter. */
  breakpointsFolded: z.number().int().nonnegative(),
  /** Folded breakpoints whose bracket falls outside the probe's width range. */
  breakpointsOutOfRange: z.number().int().nonnegative(),
  /** Folded breakpoints already bracketed by the floor set — no width added. */
  breakpointsAlreadyBracketed: z.number().int().nonnegative(),
  /** Breakpoints that contributed at least one sampled width. */
  breakpointsAdopted: z.number().int().nonnegative(),
  /** Breakpoints refused because the cap had no room for their bracket. */
  breakpointsDroppedByCap: z.number().int().nonnegative(),
  /**
   * WHICH breakpoints were refused, and why — not just how many. A cap that
   * bites on a real site (it does: linear.app/pricing authors 14 screen width
   * breakpoints and 16 widths hold 6 brackets) has to say what it did not
   * sample, or the reconstruction lane cannot tell a band edge that is
   * unpinned-because-nobody-authored-one from one that is
   * unpinned-because-the-budget-ran-out.
   *
   * Bounded by {@link MAX_LISTED_REFUSED_BREAKPOINTS}; the overflow is flagged
   * in `refusedListTruncated`, and the COUNTS above always cover everything.
   */
  breakpointsRefused: z.array(
    z.object({
      px: z.number().int().nonnegative(),
      kind: z.enum(["min", "max"]),
      /** Authored weight — why it ranked where it did. */
      count: z.number().int().nonnegative(),
      reason: z.enum(["cap", "out-of-range"]),
    }),
  ),
  /** True when the list above is shorter than the counts. */
  refusedListTruncated: z.boolean(),
  /**
   * Widths in the result that are NOT floor widths.
   *
   * Task 28.6 W6 O3: this used to be computed as `widths.length -
   * floorWidths.length`, which was the same number only because the floor set
   * was then inevictable. It is now counted directly, so it stays the count of
   * added samples even when the cap evicted a floor width.
   */
  widthsAdded: z.number().int().nonnegative(),
  /**
   * Task 28.6 W6 O3 — the floor widths that can never be evicted, ascending.
   * See {@link MIN_GUARANTEED_FLOOR_WIDTHS}. Absent on pre-O3 runs.
   */
  guaranteedFloorWidths: z.array(z.number().int().positive()).optional(),
  /**
   * Task 28.6 W7 O3.1 — widths a downstream consumer hard-required, ascending.
   * Pinned into the guaranteed core so eviction can never take them. Present
   * only when the caller named some; absent on pre-O3.1 runs.
   *
   * Both probe passes require their own OBSERVATION width (desktop 1440 /
   * mobile 390): the layout inference anchors that viewport's entire pass to it
   * and refuses the pass outright when it is missing from the probe set.
   */
  requiredWidths: z.array(z.number().int().positive()).optional(),
  /**
   * Task 28.6 W6 O3 — floor widths GIVEN UP so an authored breakpoint could be
   * sampled, ascending. Complete (the floor set is small, so this list is never
   * truncated) and empty whenever the cap did not bite. A floor width in here
   * is a sample the pre-O3 pipeline would have taken; it is listed rather than
   * merely counted so a consumer can see exactly which coverage was traded.
   * Absent on pre-O3 runs.
   */
  floorWidthsEvicted: z.array(z.number().int().positive()).optional(),
  /**
   * Task 28.6 W6 O3 — how many authored brackets were admitted only because a
   * floor width was evicted for them. 0 means the new priority changed nothing
   * on this page. Absent on pre-O3 runs.
   */
  breakpointsAdoptedByEviction: z.number().int().nonnegative().optional(),
  /**
   * The fold's own refusal counters, carried verbatim so a caller can see what
   * the media-condition parser would not represent rather than inferring it
   * from a smaller adopted count.
   */
  conditionsWidthIrrelevant: z.number().int().nonnegative(),
  conditionsUnsupported: z.number().int().nonnegative(),
  conditionsUnparsed: z.number().int().nonnegative(),
  queriesNonScreenSkipped: z.number().int().nonnegative(),
  queriesEmptyInterval: z.number().int().nonnegative(),
  /** Root font size the `em` / `rem` conversions assumed. */
  rootFontSizePx: z.number(),
  /**
   * Task 28.7 B2 — the authored-evidence extension of this pass's width
   * envelope. Present ONLY when the caller asked for the extension (the mobile
   * pass does; the desktop pass does not), so its absence is "not requested"
   * and `extended: false` inside it is "requested and the site authored no
   * evidence for it" — the negative control that keeps this from becoming a
   * hardcoded ceiling.
   */
  envelopeExtension: z
    .object({
      /** The ceiling the floor set alone defines (its widest width). */
      baseMaxWidth: z.number().int().positive(),
      /** The ceiling actually used. Equal to `baseMaxWidth` when not extended. */
      maxWidth: z.number().int().positive(),
      /** True when authored evidence moved the ceiling above `baseMaxWidth`. */
      extended: z.boolean(),
      /** Max brackets allowed to push the ceiling ({@link MAX_ENVELOPE_EXTENSION_BRACKETS}). */
      bracketCap: z.number().int().nonnegative(),
      /**
       * The width the extension may never pass, whatever the CSS authors.
       *
       * Supplied by the CALLER, which passes the width the OTHER browser
       * context's full observation was taken at: above that width the other
       * context's tree is demonstrably what renders (it was just observed
       * there), so an authored breakpoint beyond it cannot be this pass's tree
       * switch. Nothing in the derivation names a pixel value.
       */
      hardMaxWidth: z.number().int().positive(),
      /** Folded breakpoints found above `baseMaxWidth`, before the cap. */
      bracketsAboveBase: z.number().int().nonnegative(),
      /** …of those, the ones refused for sitting above `hardMaxWidth`. */
      bracketsBeyondHardMax: z.number().int().nonnegative(),
      /** The breakpoints that actually moved the ceiling, ascending by px. */
      bracketsAdmitted: z.array(
        z.object({
          px: z.number().int().nonnegative(),
          kind: z.enum(["min", "max"]),
          count: z.number().int().nonnegative(),
        }),
      ),
      /**
       * Distinct authored conditions contributed by the OTHER browser context
       * (the desktop load), merged into this pass's tally. 0 means the mobile
       * context's own sheets were the only evidence.
       */
      crossContextConditions: z.number().int().nonnegative(),
      /** Widths in the result that lie above `baseMaxWidth`, ascending. */
      widthsBeyondBase: z.array(z.number().int().positive()),
    })
    .optional(),
});
export type ProbeWidthProvenance = z.infer<typeof ProbeWidthProvenanceSchema>;

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
/**
 * Task 28.75 §07 — WHAT THE PROBE ACTUALLY COVERED, as an asserted quantity.
 *
 * THE DEFECT THIS EXISTS FOR. `linear.app /` run `2026-09-04T22-34-32-296Z`
 * recorded a mobile probe of THREE elements against a 2,291-element page. That
 * artifact then passed through a spec compile, a reconstruction and a QA run
 * without one number going red, because nothing anywhere compared the probe's
 * walk to the page it was supposed to be a probe OF. `elementCount` was
 * present and truthful the whole time — 3 is what it walked — and useless,
 * because it had no denominator.
 *
 * So the denominator is recorded beside it. `documentElements` is the deep
 * observation of the SAME viewport in the SAME run: the one control available
 * without any site-specific knowledge.
 */
export const LayoutProbeCoverageSchema = z.object({
  /** Elements the probe's walk parked (identical to `tags.length`). */
  walked: z.number().int().nonnegative(),
  /**
   * Elements still connected at measure time, minimised across the probed
   * widths. `walked - measured` is the parked-list decay a resize caused —
   * the failure mode `disconnected` was added for, now summarised per probe.
   */
  measured: z.number().int().nonnegative(),
  /**
   * The deep observation's element count for this probe's viewport, when the
   * caller supplied it. Absent when the probe ran standalone (a direct
   * `probeLayout` call with no observation beside it), and the ratio is then
   * absent too rather than invented.
   */
  documentElements: z.number().int().nonnegative().optional(),
  /** `walked / documentElements`, rounded to 4 places. Absent with the above. */
  ratio: z.number().optional(),
  /**
   * `ratio` fell below {@link PROBE_DOCUMENT_STARVATION_RATIO} on the FINAL
   * attempt. The probe is kept and marked — never silently dropped — for the
   * reason given in {@link SourceIntegritySchema}.
   */
  starved: z.boolean(),
  /** Probe passes made ({@link MAX_PROBE_ATTEMPTS}). >1 means a retry happened. */
  attempts: z.number().int().positive(),
});
export type LayoutProbeCoverage = z.infer<typeof LayoutProbeCoverageSchema>;

export const LayoutProbeSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  url: z.string(),
  finalUrl: z.string(),
  capturedAt: z.string(),
  /** The width the page was loaded and walked at (the desktop truth width). */
  initialWidth: z.number().int().positive(),
  /**
   * Task 28.6 W1.4 — the browser CONTEXT this probe ran in, when it was not the
   * default desktop-like one. Present on the mobile probe (`profile.id` is
   * `"mobile"`, with the engine-resolved UA), absent on the desktop probe so its
   * artifact keeps the exact bytes it has always had. A probe walks the tree its
   * own context renders: a mobile probe's `tags`/`parents` align to the MOBILE
   * element list and to nothing else.
   */
  profile: ViewportProfileSchema.optional(),
  /** Viewport height held constant across the widths, when not the default 900. */
  initialHeight: z.number().int().positive().optional(),
  /** Tag sequence of the probe walk — exact-alignment material for dom.json. */
  tags: z.array(z.string()),
  /** Element-child parent index per element (-1 for the root). */
  parents: z.array(z.number().int()),
  widths: z.array(LayoutProbeWidthSchema),
  truncated: z.boolean(),
  /**
   * Task 28.6 C3 D1 — WHY each width in `widths` was sampled.
   *
   * Absent on a probe whose widths were the fixed floor list and nothing else
   * (every pre-C3 artifact, and any run that passes an explicit width set), so
   * historical artifacts keep exactly the bytes they have. Present whenever the
   * derivation ran, INCLUDING when it degraded to the floor list — the
   * degradation and its reason are the point of recording it.
   */
  widthProvenance: ProbeWidthProvenanceSchema.optional(),
  /**
   * Task 28.7 A1 — how the probe's own preparation scroll ended. Present only
   * when the probe scrolled (it mirrors the observation's setting).
   *
   * A navigation during the PROBE scroll used to escape into
   * `observePageWithBrowser`'s catch, so the whole probe disappeared and the
   * only trace was a log line. Now the probe degrades and the artifact says so.
   */
  prepareScrollStatus: PrepareScrollStatusSchema.optional(),
  /**
   * Task 28.75 §07 — the HTTP status of the probe's OWN document load, with
   * every attempt. The probe makes a separate page load from the deep
   * observation, and until 28.75 it was the only load in the pipeline whose
   * response was never read: a proxy error body was walked and recorded as a
   * successful probe. Absent only on artifacts written before 28.75.
   */
  documentResponse: DocumentResponseSchema.optional(),
  /** Task 28.75 §07 — probe coverage against the deep walk. See the schema. */
  coverage: LayoutProbeCoverageSchema.optional(),
  /**
   * Responsive Core P0 §C1.3 — the deduplicated normalized `style` attribute
   * texts referenced by every width's `s` array. Absent on pre-P0 probes.
   */
  inlineStyleTable: z.array(z.string()).optional(),
  /**
   * Responsive Core P0 §C1.6 — observed family switches bisected to a 1px
   * bracket. Absent on pre-P0 probes; `[]` when no adjacent pair changed.
   */
  familySwitchBisections: z.array(FamilySwitchBisectionSchema).optional(),
  /** Adjacent changed pairs NOT bisected because of the pair cap. */
  familySwitchPairsSkipped: z.number().int().nonnegative().optional(),
  /**
   * Review fix M5 — the FIRST probe width re-measured at the end of the run.
   * `s` is aligned to `tags` and indexes `inlineStyleTable` like a width's `s`;
   * an element whose style text differs from `widths[0].s` changed over time
   * at one width. Absent on probes written before the fix.
   */
  inlineStyleRecheck: z
    .object({
      width: z.number().int().positive(),
      s: z.array(z.number().int().min(-1)),
      timeVaryingElements: z.number().int().nonnegative(),
    })
    .optional(),
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
      /**
       * Task 28.75 §07 — the coverage summary, lifted into `observation.json`
       * so a reader sees walked/measured/ratio without opening the probe file.
       * `elementCount` alone has no denominator, which is exactly why a
       * 3-element probe of a 2,306-element page read as normal.
       */
      coverage: LayoutProbeCoverageSchema.optional(),
      /** Task 28.75 §07 — the probe document's final HTTP status, when read. */
      documentStatus: z.number().int().nullable().optional(),
    })
    .optional(),
  /**
   * Task 28.6 W1.4 — the MOBILE-context layout probe, when it ran. A separate
   * sibling file (`layout-probe-mobile.json`) with a separate pointer, so the
   * desktop probe keeps its shape and NOTHING downstream can accidentally mix
   * the two element identities: the mobile probe walked the mobile DOM, so its
   * arrays align to the mobile viewport's element list, never the desktop one.
   */
  layoutProbeMobile: z
    .object({
      file: z.string(),
      widths: z.array(z.number().int().positive()),
      elementCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
      /** Always `"mobile"` today — the context the probe walked. */
      profileId: z.string().optional(),
      /** Task 28.75 §07 — see the desktop pointer's `coverage`. */
      coverage: LayoutProbeCoverageSchema.optional(),
      /** Task 28.75 §07 — the probe document's final HTTP status, when read. */
      documentStatus: z.number().int().nullable().optional(),
    })
    .optional(),
  /**
   * Task 28.7 B1 — the page-level roll-up of the per-viewport marks. ABSENT on
   * a healthy page, so a pre-B1 artifact and a clean capture look identical.
   */
  sourceIntegrity: PageSourceIntegritySchema.optional(),
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
  /** Task 28.5B §5 — root custom properties resolved at THIS viewport. */
  customProperties?: RootCustomProperties;
  /** Task 28.6 W1 — authored-CSS reachability for THIS viewport's page load. */
  stylesheetCoverage?: StylesheetCoverage;
  /** Task 28.6 C2 B4 — how much of this viewport's page paints nothing. */
  paintSuppression?: PaintSuppression;
  /** Task 28.6 C2 B4 — the preparation scroll's reveal/re-hide measurement. */
  scrollReveal?: ScrollReveal;
  /** Task 28.6 C2 B5 — modal-shaped elements, recorded and never resolved. */
  overlayCensus?: OverlayCensus;
  /** Task 28.7 — set when `screenshot` is NOT a full-page capture. */
  screenshotDegraded?: string;
  /** Task 28.7 A4 — the counted reveal-regression correction for this viewport. */
  revealRegressionPolicy?: RevealRegressionPolicy;
  /** Task 28.7 B1 — set only when this capture is NOT trustworthy as the source. */
  sourceIntegrity?: SourceIntegrity;
  /** Responsive Core P0 §C1.1 — the main-document response record. */
  initialDocument?: InitialDocument;
  /** Responsive Core P0 §C1.1 — its decoded text, when `status === "captured"`. */
  documentResponseHtml?: string;
  /** Review fix m1 — the raw response bytes (what the file must hold). */
  documentResponseBody?: Buffer;
  /** Source Preservation V2 Phase 1 — the in-memory Source Package for THIS load, when captured. */
  sourcePackage?: SourcePackageCapture;
}

/** The complete in-memory result of observing one page across all viewports. */
export interface ObservedPage {
  target: RunTarget;
  observationProfile: ObservationProfile;
  viewports: ObservedViewport[];
  /** Task 17 §8 — the multi-width layout probe, when it ran. */
  layoutProbe?: LayoutProbe;
  /** Task 28.6 W1.4 — the mobile-context probe, when it ran. Never merged. */
  layoutProbeMobile?: LayoutProbe;
  /** Task 28.7 B1 — page-level roll-up; absent when every viewport is healthy. */
  sourceIntegrity?: PageSourceIntegrity;
}
