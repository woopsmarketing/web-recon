import {
  chromium,
  type Browser,
  type Page,
  type Request,
  type Response,
} from "playwright";
import {
  installBrowserNameShim,
  markInitialPaintCensus,
} from "./initial-paint-census.js";
import {
  ATTR_MAX_LEN,
  ATTR_WHITELIST,
  CROSS_VIEWPORT_STARVATION_RATIO,
  PROBE_DOCUMENT_STARVATION_RATIO,
  DESKTOP_PROFILE,
  DOCUMENT_NAV_RETRY_BACKOFF_MS,
  FONTS_READY_TIMEOUT_MS,
  INITIAL_PAINT_STATE_KEY,
  MAX_DOCUMENT_NAV_ATTEMPTS,
  MAX_OVERLAY_CANDIDATES,
  MAX_PAGE_STATE_DISMISSALS,
  OVERLAY_SHAPE,
  SCREENSHOT_FALLBACK_TIMEOUT_MS,
  SCREENSHOT_TIMEOUT_MS,
  SETTLE_IMAGE_PROXIMITY_PX,
  SETTLE_MAX_SAMPLES,
  SETTLE_MAX_TOTAL_MS,
  SETTLE_SAMPLE_INTERVAL_MS,
  SETTLE_STABLE_SAMPLES,
  SCROLL_REVEAL_OPACITY_THRESHOLD,
  SCROLL_REVEAL_STATE_KEY,
  LAYOUT_RULE_PROPERTIES,
  LAYOUT_RULE_SELECTOR_MAX_LEN,
  LAYOUT_RULE_VALUE_MAX_LEN,
  MAX_LAYOUT_RULES,
  MAX_MATCHED_RULES_PER_ELEMENT,
  MAX_MATCHED_RULES_PER_PROPERTY,
  MAX_INLINE_STYLE_DECLS,
  INLINE_STYLE_RAW_MAX_LEN,
  MAX_ROOT_CUSTOM_PROPERTIES,
  MAX_STYLESHEET_BYTES,
  MAX_STYLESHEET_CAPTURE_BYTES,
  MAX_STYLESHEET_IMPORT_DEPTH,
  MAX_STYLESHEET_REDIRECT_HOPS,
  LAYOUT_PROBE_WIDTHS,
  MOBILE_LAYOUT_PROBE_WIDTHS,
  NAV_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  PSEUDO_STYLE_WHITELIST,
  ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN,
  SCROLLABLE_OVERFLOW_VALUES,
  chromiumMobileUserAgent,
  SETTLE_MS,
  SKIP_TAGS,
  STYLE_WHITELIST,
  TEXT_MAX_LEN,
  VIEWPORT_PROFILES,
  type DocumentNavigationAttempt,
  type DocumentResponse,
  type Environment,
  type LoadStrategy,
  type ObservationProfile,
  type ObservationStats,
  type ObservedPage,
  type ObservedViewport,
  type OverlayCensus,
  type PageMetadata,
  type PageStateNormalization,
  type LayoutProbe,
  type PageSourceIntegrity,
  type PaintSuppression,
  type PrepareScrollNavigation,
  type PrepareScrollStatus,
  type ScrollReveal,
  type SettleOutcome,
  type SourceIntegrity,
  type SourceIntegrityReason,
  type RunTarget,
  type ShadowInventory,
  type StylesheetCoverage,
  type ViewportProfile,
} from "./types.js";
import {
  collectPageInBrowser,
  type CollectConfig,
  type RawCollectResult,
} from "./collect-dom.js";
import { dedupeStyles, assertStyleReferencesResolve } from "./dedupe-styles.js";
import { autoScrollPrepare, probeLayout } from "./layout-probe.js";
import {
  isOkStatus,
  navigateMainDocumentCapturingBody,
  pause,
} from "./navigate-document.js";
import { attachSourceCapture, type SourceCaptureOptions } from "../source-package/capture.js";
import {
  normalizePageState,
  pageStateNormalizationSkipped,
} from "./normalize-page-state.js";
import { deriveProbeWidths, type DerivedProbeWidths } from "./probe-widths.js";
import { deriveLinks } from "./collect-links.js";
import { countUniqueAssetIdentities, deriveAssets } from "./collect-assets.js";

/**
 * Single-page RESPONSIVE static observer (Phase 3; responsive in Task 05).
 *
 * Renders ONE URL in real Chromium and returns the observed static state for
 * EACH viewport profile (desktop + mobile). There is a single observer pipeline:
 * {@link observeViewport} runs the full deep observation (DOM / styles /
 * geometry / visibility / assets / links / frames / shadow / environment +
 * screenshot) for one {@link ViewportProfile}; {@link observePage} runs it once
 * per profile. Mobile is NOT a reduced screenshot-only variant — it gets the
 * exact same pipeline, so responsive layout differences are preserved as-is per
 * viewport (never normalized or merged).
 *
 * ---------------------------------------------------------------------------
 * THE OBSERVER'S CONTRACT (rewritten for Task 28.7 — read this before changing
 * anything below)
 * ---------------------------------------------------------------------------
 * Until Task 28.7 this header said the observer "never clicks". That is no
 * longer true, and the change is deliberate: obtaining the NORMAL page state —
 * the page a human sees rather than the page behind an entry popup — is a
 * product requirement, because a popup open at capture time is reconstructed as
 * a permanent overlay covering the hero.
 *
 * The observation now has TWO phases with DIFFERENT permissions:
 *
 *   PAGE-STATE NORMALIZATION (may act, bounded, evidence-gated)
 *     A very small number of conservative dismissals of overlays that clear a
 *     written evidence bar — at most {@link MAX_PAGE_STATE_DISMISSALS} per
 *     page-load, preferring the overlay's own close control, `Escape` only with
 *     declared-dialog evidence, never `force: true`, and never removing or
 *     hiding a node. Default ON; `--no-normalize-page-state` opts out. See
 *     `normalize-page-state.ts` for the predicate and the refusals.
 *
 *   COLLECTION (strictly read-only, unchanged)
 *     DOM / styles / geometry / visibility / assets / links / frames / shadow /
 *     environment + screenshot. It navigates and reads. It never clicks, hovers
 *     to explore, submits forms, or types.
 *
 * The other motion the observer may perform is unchanged: the read-only
 * *preparation* auto-scroll (`--prepare-scroll`, default ON) that triggers
 * lazy-loaded content. The same policy is applied to every viewport.
 *
 * SILENT MANIPULATION IS FORBIDDEN. Every normalization action is recorded on
 * the observation artifact (`loadStrategy.pageStateNormalization`) AND written
 * to an evidence directory holding `before.png`, `after.png` and a `record.json`
 * naming the node, the signals, the control used and the measured outcome.
 *
 * Load/stabilization strategy, applied per viewport (Task 28.7 A1–A3):
 *   goto("load") → initial-paint census → bounded networkidle
 *   → bounded document.fonts.ready → [page-state normalization]
 *   → [optional prepare-scroll, navigation-safe] → deterministic settle
 *   (document-height + renderable-image stability, capped) → fixed tail wait
 *   → observe.
 *
 * Browser lifecycle (Task 09, item 11). The observation pipeline itself takes a
 * live {@link Browser}; owning the Chromium process is a separate concern:
 *
 *   observePage(url)              — convenience wrapper: launch → observe → close
 *   observePageWithBrowser(b,url) — the shared primitive, browser supplied
 *
 * Multi-page observation launches ONE Chromium for the whole site run and calls
 * {@link observePageWithBrowser} per page. Both paths run the exact same code
 * below — there is no multi-page observation variant.
 */

export const COLLECT_CONFIG: CollectConfig = {
  skipTags: SKIP_TAGS,
  attrWhitelist: ATTR_WHITELIST,
  styleWhitelist: STYLE_WHITELIST,
  pseudoStyleWhitelist: PSEUDO_STYLE_WHITELIST,
  textMaxLen: TEXT_MAX_LEN,
  attrMaxLen: ATTR_MAX_LEN,
  scrollableOverflowValues: SCROLLABLE_OVERFLOW_VALUES,
  // Task 17 §7 — authored layout-rule recovery. Bounded-subtree captures skip
  // this channel inside the collector regardless of the config.
  layoutRuleProperties: LAYOUT_RULE_PROPERTIES,
  maxLayoutRules: MAX_LAYOUT_RULES,
  maxMatchedRulesPerElement: MAX_MATCHED_RULES_PER_ELEMENT,
  // Responsive Core P0 §C1.5 / §C1.2.
  maxMatchedRulesPerProperty: MAX_MATCHED_RULES_PER_PROPERTY,
  maxInlineStyleDecls: MAX_INLINE_STYLE_DECLS,
  inlineStyleRawMaxLen: INLINE_STYLE_RAW_MAX_LEN,
  layoutRuleSelectorMaxLen: LAYOUT_RULE_SELECTOR_MAX_LEN,
  layoutRuleValueMaxLen: LAYOUT_RULE_VALUE_MAX_LEN,
  // Task 28.5B §5 — `:root` custom-property harvest caps.
  maxRootCustomProperties: MAX_ROOT_CUSTOM_PROPERTIES,
  rootCustomPropertyValueMaxLen: ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN,
  // Task 28.6 C2 B4/B5 — the two hand-off keys and the shared paint threshold.
  // Both are page-mode channels: the interaction explorer's bounded-subtree
  // capture reuses this config and the collector ignores them there.
  scrollRevealStateKey: SCROLL_REVEAL_STATE_KEY,
  initialPaintStateKey: INITIAL_PAINT_STATE_KEY,
  paintOpacityThreshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
  maxOverlayCandidates: MAX_OVERLAY_CANDIDATES,
  // Task 28.7 A2 — the SHARED overlay shape thresholds. The page-state
  // normalizer applies the identical gate from the same constant, so the census
  // and the normalizer cannot drift apart about what "modal-shaped" means.
  overlayMinWidthCoverage: OVERLAY_SHAPE.minWidthCoverage,
  overlayMinHeightCoverage: OVERLAY_SHAPE.minHeightCoverage,
  overlayMinAreaCoverage: OVERLAY_SHAPE.minAreaCoverage,
};


export interface ObserveOptions {
  /** Optional progress callback for the CLI. */
  onLog?: (message: string) => void;
  /**
   * Run a bounded, read-only preparation auto-scroll to trigger lazy content.
   *
   * Task 28.6 W8 RC2 — DEFAULTS TO TRUE. It used to default to false, and that
   * made the observer disagree with the instrument that grades it: the
   * responsive-QA capture ALWAYS scrolls both sides to the bottom before it
   * probes (`src/responsive-qa/capture.ts:353`, unconditional). So the clone was
   * built from a pre-reveal instant while the source was measured revealed, and
   * every entrance animation that holds its element at `opacity: 0` until it
   * scrolls into view was BAKED into the clone as a permanent `opacity: 0`.
   *
   * MEASURED on www.xn--ok0b408a79cba430b.net, same page and same node
   * (`p000005` / `e000222`, the footer social-icon container), two observation
   * runs differing only in this flag: identical 124x22 box at y=1887.56, opacity
   * 1 with the scroll and 0 without. 136 of 6,144 shared nodes flip opacity
   * between the two runs; baked `opacity: 0` classes go 23 -> 38; the four
   * social `<img>` children are byte-identical and are killed purely by the
   * ancestor. On linear.app `/pricing`, 56 image nodes are suppressed the same
   * way in BOTH variant trees.
   *
   * The known counter-case is recorded as defect B4: a site running its reveal
   * animation in RE-HIDE mode is left at `opacity: 0` by a scroll that returns
   * to the top. That failure mode exists under either default; what cannot be
   * defended is an observer whose reveal state disagrees with the instrument
   * that grades it. The two-instant verify gate (observe opacity before AND
   * after the scroll, and refuse to bake a value when they disagree) is the
   * correct end state and is recorded as the next correction, not done here.
   */
  prepareScroll?: boolean;
  /**
   * Task 17 §8 — run the multi-width lightweight layout probe after the deep
   * observations (default true). The probe failing never fails the page: it is
   * supplemental evidence, and its absence is visible as a missing
   * `layout-probe.json`.
   */
  layoutProbe?: boolean;
  /** Extra probe widths (e.g. a 2048 regression canary). */
  probeExtraWidths?: readonly number[];
  /**
   * Task 28.6 W1.4 — run the MOBILE-context layout probe as well (default true
   * whenever the desktop probe runs). Same failure policy: a failure is logged
   * and the observation stands without it.
   */
  mobileLayoutProbe?: boolean;
  /** Extra widths for the mobile probe pass only. */
  mobileProbeExtraWidths?: readonly number[];
  /**
   * Task 28.7 A2 — run the bounded PAGE-STATE NORMALIZATION phase before
   * collection (default TRUE; `--no-normalize-page-state` opts out).
   *
   * This is the phase that may CLICK — a very small number of conservative
   * dismissals of overlays that clear a written evidence bar. See
   * `normalize-page-state.ts` for the predicate, the refusals and the bounds,
   * and the module header of this file for the contract change it represents.
   *
   * Turning it OFF is a legitimate choice (it is the only way to capture the
   * page WITH its entry popup), and the artifact records `ran: false` plus the
   * limitation that implies rather than going quiet.
   */
  normalizePageState?: boolean;
  /**
   * Identifier used in the page-state evidence path. A site run passes its
   * deterministic `p00000N`; a single-page run gets a slug derived from the URL,
   * so no evidence directory is ever anonymous.
   */
  pageStateEvidenceId?: string;
  /** Evidence root override (the smoke suite points this at a temp directory). */
  pageStateEvidenceRoot?: string;
  /**
   * Task 28.7 — budget for the full-page screenshot, default
   * {@link SCREENSHOT_TIMEOUT_MS}.
   *
   * An override exists for two reasons. An operator observing a genuinely huge
   * document may need to raise it; and the smoke suite lowers it to force the
   * DEGRADATION PATH, so "a screenshot failure no longer costs the route" is a
   * permanently tested property rather than a hoped-for one.
   */
  screenshotTimeoutMs?: number;
  /**
   * Source Preservation V2 Phase 1 — capture a SOURCE PACKAGE for every
   * viewport load (`viewports/<id>/source-package/`): initial document bytes,
   * runtime DOM snapshot, stylesheet/script source material, asset inventory
   * and a bounded network dependency map. OFF by default (`--source-package`
   * opts in); when off, the observation is byte-identical to the pre-Phase-1
   * one. `true` uses the default limits/body policy; an object overrides them.
   */
  sourcePackage?: boolean | SourceCaptureOptions;
}

/**
 * A filesystem-safe id for a single-page run's evidence directory, derived from
 * the URL path. Deterministic, and never a site-specific special case.
 */
function evidenceIdFromUrl(url: string): string {
  let slug = "";
  try {
    const parsed = new URL(url);
    slug = `${parsed.pathname}${parsed.search}`;
  } catch {
    slug = url;
  }
  const cleaned = slug.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "root" : cleaned.slice(0, 60);
}

/**
 * Task 28.6 W1.1 — CORS STYLESHEET FALLBACK, capture half (Node side).
 *
 * A cross-origin stylesheet throws on `cssRules`, so before this wave every
 * authored declaration it held was lost.
 *
 * MEASURED, on linear.app/pricing (Task 28.6 C1.5 correction — an earlier draft
 * of this comment cited "34 of 3,254 nodes", a figure that belongs to no
 * artifact on disk for this URL; the stored 28.5C artifact for
 * linear.app/pricing has 1,363 observed nodes, 17 of them carrying an authored
 * declaration): 81 sheets, 30 CSSOM-blocked, 30 recovered, 0 missed, and
 * `authoredLayout` present on 17 of 1,363 nodes BEFORE, 1,363 of 1,363 AFTER.
 *
 * The recovery costs NO new request: Chromium already downloaded each sheet, so
 * the observation simply keeps the response bodies it sees go by and hands the
 * blocked ones back to the page (see {@link CollectConfig.extraSheets}).
 *
 * Bounded on purpose: {@link MAX_STYLESHEET_BYTES} per sheet and
 * {@link MAX_STYLESHEET_CAPTURE_BYTES} in total. A body dropped by a cap, or one
 * the browser will not hand over, is COUNTED — never silently missing.
 */
interface StylesheetCaptureStats {
  /**
   * Bytes of EVERY stylesheet response held in memory. Task 28.6 C1.4: this is
   * the capture buffer, NOT the payload that crossed into the page — that is
   * reported separately as `bytesBridged`.
   *
   * Task 28.6 C2 verifier correction: the capture figure is RUN-VARIABLE —
   * ≈446,461, ≈446,609 and 446,597 on three linear.app/pricing occasions, and
   * 415,860 for the MOBILE load of the same page — because it counts every
   * stylesheet response that load happened to see. `bytesBridged` is the steady
   * one (151,145 on both viewports of both of this lane's runs; 151,157 on an
   * earlier one): reproducible within a deploy and viewport-independent. Cite
   * bytesBridged, with its run.
   */
  bytesCaptured: number;
  skippedBySizeCap: number;
  bodyUnavailable: number;
  /**
   * Task 28.6 W6 O1 — 3xx stylesheet responses seen on the wire.
   *
   * A redirect response carries no stylesheet body and never could; before O1
   * it fell into the `response.text()` catch and inflated `bodyUnavailable`,
   * which is the counter that is supposed to mean "a real body the browser
   * would not hand over". MEASURED on seoultone.kr: `sheetsBodyUnavailable: 1`
   * on 28 of 28 observations, entirely from the one `unpkg.com/swiper/...`
   * 302. Counted here instead, so neither number lies.
   */
  redirectResponses: number;
  /**
   * Pre-redirect URLs keyed onto a captured body by walking
   * `request().redirectedFrom()`. This is the O1 fix's own evidence: the CSSOM
   * reports the href the DOCUMENT asked for, the response arrives under the
   * URL the server finally served, and without these aliases the two never
   * meet. MEASURED on seoultone.kr: 1 alias per observation, recovering a
   * 14,612-byte sheet that `fallbackMissed` had counted on every run.
   */
  redirectAliasesKeyed: number;
  /**
   * Redirect chains longer than {@link MAX_STYLESHEET_REDIRECT_HOPS}, whose
   * remaining hops were NOT keyed. Never silent: a sheet lost this way shows up
   * here as well as in `fallbackMissed`.
   */
  redirectChainsTruncated: number;
}

interface StylesheetCapture {
  /**
   * Response text keyed by the response URL, the request URL, AND every
   * pre-redirect URL in the request's redirect chain (Task 28.6 W6 O1).
   */
  bodies: Map<string, string>;
  stats: StylesheetCaptureStats;
  /** Await the in-flight body reads before collecting. */
  settle: () => Promise<void>;
}

/**
 * Every URL a captured stylesheet body should answer to (Task 28.6 W6 O1).
 *
 * THE DEFECT THIS REMOVES. The CSSOM reports `CSSStyleSheet.href` as the URL the
 * DOCUMENT asked for. The network reports the URL the server finally SERVED.
 * When a sheet 302s, those are different strings, so a body keyed only by the
 * post-redirect URL is invisible to the `extraSheetCss[href]` lookup the
 * CORS-recovery path performs — the sheet is captured, held in memory, and then
 * counted as `fallbackMissed` anyway.
 *
 * MEASURED on seoultone.kr (2026-09-02 run `2026-09-02T20-18-18-932Z`):
 * `fallbackMissed: 1` and `sheetsBodyUnavailable: 1` on 28 of 28 observations.
 * The sheet is `https://unpkg.com/swiper/swiper-bundle.min.css`, which 302s to
 * `https://unpkg.com/swiper@14.2.0/swiper-bundle.min.css` (14,612 bytes). The
 * other four blocked sheets recovered byte-exact.
 *
 * The walk is bounded by {@link MAX_STYLESHEET_REDIRECT_HOPS} and a truncated
 * chain is COUNTED, never dropped in silence.
 */
function redirectChainUrls(
  response: Response,
  stats: StylesheetCaptureStats,
): string[] {
  const urls: string[] = [];
  let request: Request | null;
  try {
    request = response.request();
  } catch {
    return urls;
  }
  for (let hop = 0; hop < MAX_STYLESHEET_REDIRECT_HOPS; hop++) {
    let previous: Request | null = null;
    try {
      previous = request ? request.redirectedFrom() : null;
    } catch {
      return urls;
    }
    if (previous === null) return urls;
    try {
      urls.push(previous.url());
    } catch {
      return urls;
    }
    request = previous;
  }
  // The loop ran the full budget and the chain still has another hop.
  try {
    if (request && request.redirectedFrom() !== null) stats.redirectChainsTruncated++;
  } catch {
    /* the chain is unreadable past here; the counter above is the honest floor */
  }
  return urls;
}

function captureStylesheetBodies(page: Page): StylesheetCapture {
  const bodies = new Map<string, string>();
  const stats: StylesheetCaptureStats = {
    bytesCaptured: 0,
    skippedBySizeCap: 0,
    bodyUnavailable: 0,
    redirectResponses: 0,
    redirectAliasesKeyed: 0,
    redirectChainsTruncated: 0,
  };
  const pending: Promise<void>[] = [];
  page.on("response", (response) => {
    let resourceType = "";
    try {
      resourceType = response.request().resourceType();
    } catch {
      return;
    }
    if (resourceType !== "stylesheet") return;
    // A 3xx has no stylesheet body and never could. Counting it as
    // `bodyUnavailable` would report a redirect as a body the browser refused.
    let status = 0;
    try {
      status = response.status();
    } catch {
      status = 0;
    }
    if (status >= 300 && status < 400) {
      stats.redirectResponses++;
      return;
    }
    pending.push(
      (async () => {
        let responseUrl = "";
        let requestUrl = "";
        try {
          responseUrl = response.url();
          requestUrl = response.request().url();
        } catch {
          return;
        }
        const aliases = redirectChainUrls(response, stats);
        const keys: string[] = [];
        for (const url of [responseUrl, requestUrl, ...aliases]) {
          if (url !== "" && !keys.includes(url)) keys.push(url);
        }
        if (keys.length > 0 && keys.every((key) => bodies.has(key))) return;
        let text: string;
        try {
          text = await response.text();
        } catch {
          // A body can simply be unavailable (cache, aborted, no-store).
          stats.bodyUnavailable++;
          return;
        }
        const size = Buffer.byteLength(text, "utf8");
        if (
          size > MAX_STYLESHEET_BYTES ||
          stats.bytesCaptured + size > MAX_STYLESHEET_CAPTURE_BYTES
        ) {
          stats.skippedBySizeCap++;
          return;
        }
        stats.bytesCaptured += size;
        const aliasSet = new Set(aliases);
        for (const key of keys) {
          if (bodies.has(key)) continue;
          bodies.set(key, text);
          if (aliasSet.has(key) && key !== responseUrl && key !== requestUrl) {
            stats.redirectAliasesKeyed++;
          }
        }
      })(),
    );
  });
  return {
    bodies,
    stats,
    settle: async () => {
      await Promise.allSettled(pending);
    },
  };
}

/** In-page: the hrefs of the sheets whose `cssRules` the CSSOM refuses. */
function listBlockedSheetHrefsInBrowser(): string[] {
  const out: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i]!;
    let readableRuleCount = -1;
    try {
      const rules = sheet.cssRules;
      readableRuleCount = rules ? rules.length : 0;
    } catch {
      readableRuleCount = -1; // the CSSOM refuses this sheet
    }
    if (readableRuleCount >= 0) continue;
    const href = sheet.href;
    if (href) out.push(href);
  }
  return out;
}

/** Read a balanced `(` … `)` group starting at `open`. Returns null if unbalanced. */
function readBalancedGroup(text: string, open: number): { inner: string; end: number } | null {
  if (text.charAt(open) !== "(") return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

interface ParsedImport {
  url: string;
  layer?: string;
  supports?: string;
  media?: string;
}

/**
 * Parse the inside of an `@import … ;` statement. Returns null when anything is
 * not confidently understood — the caller then LEAVES the statement alone and
 * counts it unresolved, because inlining an import whose conditions were not
 * understood would turn a conditional block into an unconditional one.
 */
function parseImportStatement(body: string): ParsedImport | null {
  let rest = body.trim();
  let url: string;
  const urlFn = /^url\(\s*("([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/.exec(rest);
  if (urlFn) {
    url = (urlFn[2] ?? urlFn[3] ?? urlFn[4] ?? "").trim();
    rest = rest.slice(urlFn[0].length).trim();
  } else {
    const quoted = /^("([^"]*)"|'([^']*)')/.exec(rest);
    if (!quoted) return null;
    url = (quoted[2] ?? quoted[3] ?? "").trim();
    rest = rest.slice(quoted[0].length).trim();
  }
  if (url === "") return null;

  const parsed: ParsedImport = { url };
  if (/^layer\s*\(/.test(rest)) {
    const group = readBalancedGroup(rest, rest.indexOf("("));
    if (!group) return null;
    parsed.layer = group.inner.trim();
    rest = rest.slice(group.end).trim();
  } else if (/^layer/.test(rest)) {
    parsed.layer = "";
    rest = rest.slice("layer".length).trim();
  }
  if (/^supports\s*\(/.test(rest)) {
    const group = readBalancedGroup(rest, rest.indexOf("("));
    if (!group) return null;
    parsed.supports = group.inner.trim();
    rest = rest.slice(group.end).trim();
  }
  if (rest !== "") {
    // Whatever is left must be a media query list. A stray `supports(` /
    // `layer(` here means the statement is not in the shape we understand.
    if (/[({]/.test(rest) && !/^[^{}]*$/.test(rest)) return null;
    parsed.media = rest;
  }
  return parsed;
}

interface ImportExpansion {
  css: string;
  expanded: number;
  unresolved: number;
}

/**
 * Inline `@import`ed sheets into `css`. A constructed `CSSStyleSheet` drops
 * `@import` silently (verified in Chromium), so an import left in place is a
 * hole in the recovered sheet — this closes the ones whose bodies were captured
 * and counts the ones it cannot close. Conditions on the import are preserved by
 * wrapping the inlined text in the equivalent `@layer` / `@supports` / `@media`
 * block, never by dropping them.
 */
function expandStylesheetImports(
  css: string,
  baseUrl: string,
  bodies: Map<string, string>,
  depth: number,
  seen: readonly string[],
): ImportExpansion {
  let expanded = 0;
  let unresolved = 0;
  const out = css.replace(/@import\s+([^;]+);/g, (statement, body: string) => {
    const parsed = parseImportStatement(body);
    if (!parsed) {
      unresolved++;
      return statement;
    }
    let absolute: string;
    try {
      absolute = new URL(parsed.url, baseUrl).href;
    } catch {
      unresolved++;
      return statement;
    }
    const text = bodies.get(absolute);
    if (
      text === undefined ||
      depth >= MAX_STYLESHEET_IMPORT_DEPTH ||
      seen.indexOf(absolute) >= 0
    ) {
      unresolved++;
      return statement;
    }
    const nested = expandStylesheetImports(text, absolute, bodies, depth + 1, [
      ...seen,
      absolute,
    ]);
    expanded += 1 + nested.expanded;
    unresolved += nested.unresolved;
    let inner = nested.css;
    if (parsed.media !== undefined && parsed.media !== "") {
      inner = `@media ${parsed.media} {\n${inner}\n}`;
    }
    if (parsed.supports !== undefined && parsed.supports !== "") {
      const condition = parsed.supports.startsWith("(")
        ? parsed.supports
        : `(${parsed.supports})`;
      inner = `@supports ${condition} {\n${inner}\n}`;
    }
    if (parsed.layer !== undefined) {
      inner =
        parsed.layer === ""
          ? `@layer {\n${inner}\n}`
          : `@layer ${parsed.layer} {\n${inner}\n}`;
    }
    return inner;
  });
  return { css: out, expanded, unresolved };
}

/**
 * Build the fallback material for exactly the sheets the CSSOM refused. Sorted
 * by href so the payload handed to the page is a function of the page, not of
 * network arrival order.
 */
function buildExtraSheets(
  blockedHrefs: readonly string[],
  bodies: Map<string, string>,
): {
  sheets: { href: string; css: string }[];
  expanded: number;
  unresolved: number;
  /** Task 28.6 C1.4 — bytes actually handed to the page (post-import-expansion). */
  bytesBridged: number;
} {
  const sheets: { href: string; css: string }[] = [];
  let expanded = 0;
  let unresolved = 0;
  let bytesBridged = 0;
  const seenHrefs = new Set<string>();
  for (const href of [...blockedHrefs].sort()) {
    if (seenHrefs.has(href)) continue;
    seenHrefs.add(href);
    const text = bodies.get(href);
    if (text === undefined) continue;
    const result = expandStylesheetImports(text, href, bodies, 0, [href]);
    expanded += result.expanded;
    unresolved += result.unresolved;
    bytesBridged += Buffer.byteLength(result.css, "utf8");
    sheets.push({ href, css: result.css });
  }
  return { sheets, expanded, unresolved, bytesBridged };
}

interface StabilizeResult {
  networkIdleReached: boolean;
  fontsReadyReached: boolean;
  networkIdleMs: number;
  fontsReadyMs: number;
  scrollMs: number;
  scrollSteps?: number;
  scrollDistancePx?: number;
  /** Task 28.6 C2 B4 — present only when a preparation scroll actually ran. */
  scrollReveal?: ScrollReveal;
  /** Task 28.7 A1 — how the preparation scroll ended (when it ran). */
  prepareScrollStatus?: PrepareScrollStatus;
  prepareScrollNavigation?: PrepareScrollNavigation;
  /** Task 28.7 A3 — the deterministic settle record. Always present. */
  settle: SettleOutcome;
  /** Task 28.7 A2 — the page-state normalization record. Always present. */
  pageStateNormalization: PageStateNormalization;
}

/**
 * Task 28.7 A3 — ONE stability sample, taken in the page.
 *
 * WHAT COUNTS AS A "RENDERABLE CANDIDATE" IMAGE, and why it is not
 * `document.images`. `document.images` is every `<img>` in the document
 * including ones inside `display: none` subtrees, ones with no source at all,
 * and ones twenty screens below the fold that will never be requested on this
 * load — a denominator that can never reach its numerator, which is exactly how
 * "wait for the images" becomes "wait for the timeout". A RENDERABLE CANDIDATE
 * is an `<img>` that
 *   (1) has a RESOLVABLE SOURCE — a non-empty `currentSrc`, `src` or `srcset`;
 *   (2) is not switched off — computed `display` is not `none`, `visibility` is
 *       neither `hidden` nor `collapse`, and it is RENDERED at all: an element
 *       inside a `display: none` ancestor keeps its own computed `display` (the
 *       property is not inherited) and reports a 0×0 box AT THE ORIGIN, which
 *       looks exactly like a visible zero-size element at the top of the page —
 *       so the test is `getClientRects().length`, which is empty for anything
 *       that generates no box;
 *   (3) is ACTUALLY IN PLAY — it has a non-zero layout box, or its box sits
 *       within {@link SETTLE_IMAGE_PROXIMITY_PX} of the viewport, i.e. it is
 *       about to be painted.
 * An image that has permanently FAILED (`complete` with `naturalWidth === 0`)
 * counts as SETTLED, because it can never do anything else and must not hold
 * the load open.
 *
 * KNOWN LIMITATION, stated rather than papered over: CSS `background-image`
 * loads are not counted — there is no per-element load event for them — so a
 * page whose hero is a background image settles on height stability alone.
 */
function sampleSettleInBrowser(arg: { proximityPx: number }): {
  documentHeight: number;
  renderable: number;
  loaded: number;
  failed: number;
  settled: number;
} {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  let renderable = 0;
  let loaded = 0;
  let failed = 0;
  const imgs = document.getElementsByTagName("img");
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i]!;
    const source =
      img.currentSrc || img.getAttribute("src") || img.getAttribute("srcset") || "";
    if (source === "") continue;
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(img);
    } catch {
      continue;
    }
    if (cs.display === "none") continue;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") continue;
    // Generates no box at all (the `display: none` ANCESTOR case). Without this
    // such an image reports a 0×0 rect at (0,0), which the proximity test below
    // would happily read as "just above the fold".
    if (img.getClientRects().length === 0) continue;
    const rect = img.getBoundingClientRect();
    const hasBox = rect.width > 0 && rect.height > 0;
    const nearViewport =
      rect.bottom > -arg.proximityPx &&
      rect.top < viewportH + arg.proximityPx &&
      rect.right > -arg.proximityPx &&
      rect.left < viewportW + arg.proximityPx;
    if (!hasBox && !nearViewport) continue;
    renderable++;
    if (!img.complete) continue;
    if (img.naturalWidth > 0) loaded++;
    else failed++;
  }
  return {
    documentHeight: document.documentElement.scrollHeight,
    renderable,
    loaded,
    failed,
    settled: loaded + failed,
  };
}

/* ---------------------------------------------------------------------------
 * Task 28.7 B1 — THE MAIN DOCUMENT'S HTTP STATUS.
 *
 * Measured on a real canary (2026-09-04, run `2026-09-04T15-30-50-831Z`): a
 * transient upstream outage made `linear.app` answer the DESKTOP load of two
 * routes with a proxy error body, and the observation recorded it as a normal
 * success — `status: "success"`, `domElementCount: 3`,
 * `heightStable: true, imagesStable: true`. A deterministic settle makes that
 * WORSE, not better: an empty error page has nothing to lay out and no image to
 * load, so it settles instantly and confidently. The MOBILE load of the same
 * URL in the same run collected 2,306 elements.
 *
 * The observer never recorded the document's status. `page.goto` has always
 * returned the main-frame response; these two helpers use it.
 * ------------------------------------------------------------------------- */

/**
 * The mark for a document that answered non-2xx after the bounded retry.
 *
 * The observation is KEPT. See {@link SourceIntegritySchema} for why dropping it
 * is the worse outcome (a page with no observation kills the whole
 * reconstruction downstream), and what carries the mark instead.
 */
function non2xxIntegrity(documentResponse: DocumentResponse): SourceIntegrity {
  const statuses = documentResponse.attempts
    .map((a) => (a.status === null ? "unavailable" : String(a.status)))
    .join(", ");
  return {
    suspect: true,
    reasons: ["non-2xx-document"],
    limitations: [
      `the main document answered HTTP ${String(documentResponse.status)} after ` +
        `${String(documentResponse.attempts.length)} attempt(s) (${statuses}); the ` +
        `bytes in this observation are the SERVER'S ERROR RESPONSE, not the source ` +
        `page, and must not be reconstructed as the site`,
    ],
  };
}

/**
 * Merge a second reason into an existing mark (or create the mark). Reasons and
 * limitations accumulate; `suspect` is monotonic.
 */
function addIntegrityReason(
  existing: SourceIntegrity | undefined,
  reason: SourceIntegrityReason,
  limitation: string,
): SourceIntegrity {
  if (!existing) {
    return { suspect: true, reasons: [reason], limitations: [limitation] };
  }
  if (existing.reasons.includes(reason)) return existing;
  return {
    suspect: true,
    reasons: [...existing.reasons, reason],
    limitations: [...existing.limitations, limitation],
  };
}

/**
 * Task 28.7 B1 — THE CORROBORATING SIGNAL, keyed on the RUN'S OWN DATA.
 *
 * A soft error page can answer 200, so the status alone does not catch every
 * "the site did not give us the page". The same URL is loaded once per viewport
 * within seconds in the same run, so the other viewport is a free control: a
 * capture holding less than {@link CROSS_VIEWPORT_STARVATION_RATIO} of the
 * richest viewport's element count is evidence one of the loads was not the
 * page (the canary was 3 against 2,306).
 *
 * NO ABSOLUTE THRESHOLD. A page that is legitimately tiny is tiny at BOTH
 * viewports, so its ratio is ~1 and it is never marked; a fixed "fewer than N
 * elements" rule would be a number tuned to one site. Marking only — the
 * observation is kept, exactly as for a non-2xx document.
 */
function applyCrossViewportIntegrity(
  viewports: ObservedViewport[],
  log: (message: string) => void,
): void {
  if (viewports.length < 2) return;
  const richest = Math.max(...viewports.map((v) => v.stats.domElementCount));
  if (richest <= 0) return;
  for (const viewport of viewports) {
    const count = viewport.stats.domElementCount;
    const ratio = count / richest;
    if (ratio >= CROSS_VIEWPORT_STARVATION_RATIO) continue;
    const limitation =
      `this viewport collected ${String(count)} element(s) against ` +
      `${String(richest)} at the richest viewport of the SAME page in the SAME ` +
      `run (ratio ${ratio.toFixed(4)}, below the ` +
      `${String(CROSS_VIEWPORT_STARVATION_RATIO)} cross-viewport starvation ` +
      `ratio) — one of the two loads did not get the page`;
    viewport.sourceIntegrity = addIntegrityReason(
      viewport.sourceIntegrity,
      "cross-viewport-starved",
      limitation,
    );
    log(`[${viewport.profile.id}] SOURCE INTEGRITY: ${limitation}`);
  }
}

/**
 * Task 28.75 §07 — THE PROBE'S OWN INTEGRITY MARK.
 *
 * `applyCrossViewportIntegrity` compares the two DEEP walks against each other.
 * It cannot see the probe at all: the probe runs afterwards, on its own page
 * load, and on `linear.app /` (run `2026-09-04T22-34-32-296Z`) that load was the
 * one that failed while both deep walks were healthy — so every existing signal
 * stayed green while the mobile width evidence went to zero.
 *
 * The probe already computed the verdict (it owns the retry), so this only
 * carries it onto the viewport the probe belongs to. Marking only: the deep
 * observation is untouched and remains fully usable, and it is the width
 * evidence — not the page — that is missing.
 */
function applyProbeIntegrity(
  viewports: ObservedViewport[],
  desktopProbe: LayoutProbe | undefined,
  mobileProbe: LayoutProbe | undefined,
  log: (message: string) => void,
): void {
  const mark = (probe: LayoutProbe | undefined, viewportId: string): void => {
    const coverage = probe?.coverage;
    if (!coverage?.starved) return;
    const viewport = viewports.find((v) => v.profile.id === viewportId);
    if (!viewport) return;
    const limitation =
      `this viewport's LAYOUT PROBE walked ${String(coverage.walked)} element(s) ` +
      `against ${String(coverage.documentElements)} in the deep walk of the same ` +
      `viewport in the same run (ratio ${String(coverage.ratio)}, below the ` +
      `${String(PROBE_DOCUMENT_STARVATION_RATIO)} probe starvation floor) after ` +
      `${String(coverage.attempts)} attempt(s) — the probe's own page load did ` +
      `not get the page, so this viewport has NO usable multi-width layout ` +
      `evidence; the deep observation itself is unaffected`;
    viewport.sourceIntegrity = addIntegrityReason(
      viewport.sourceIntegrity,
      "probe-starved",
      limitation,
    );
    log(`[${viewportId}] SOURCE INTEGRITY: ${limitation}`);
  };
  mark(desktopProbe, "desktop");
  mark(mobileProbe, "mobile");
}

/**
 * Task 28.7 B1 — the page-level roll-up, so a consumer reading
 * `observation.json` sees the mark without walking viewports. `undefined` when
 * every viewport is healthy, so a clean page is byte-identical to a pre-B1 one.
 */
function rollUpSourceIntegrity(
  viewports: readonly ObservedViewport[],
): PageSourceIntegrity | undefined {
  const suspect = viewports.filter((v) => v.sourceIntegrity?.suspect === true);
  if (suspect.length === 0) return undefined;
  const reasons: SourceIntegrityReason[] = [];
  const limitations: string[] = [];
  for (const viewport of [...suspect].sort((a, b) =>
    a.profile.id < b.profile.id ? -1 : a.profile.id > b.profile.id ? 1 : 0,
  )) {
    for (const reason of viewport.sourceIntegrity!.reasons) {
      if (!reasons.includes(reason)) reasons.push(reason);
    }
    for (const limitation of viewport.sourceIntegrity!.limitations) {
      limitations.push(`[${viewport.profile.id}] ${limitation}`);
    }
  }
  return {
    suspect: true,
    suspectViewportIds: [...suspect]
      .map((v) => v.profile.id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    reasons,
    limitations,
  };
}

/** Bounded wait for `document.fonts.ready`. Returns whether it resolved in time. */
async function waitForFonts(page: Page): Promise<boolean> {
  try {
    return await page.evaluate((ms) => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (!fonts || !fonts.ready) return Promise.resolve(true);
      return Promise.race([
        fonts.ready.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
      ]);
    }, FONTS_READY_TIMEOUT_MS);
  } catch {
    return false;
  }
}

/**
 * Read-only preparation auto-scroll (Task 04, item 12). Steps the page down to
 * trigger lazy-loaded content, then returns to the top so geometry is captured
 * at scroll 0. Hard-capped by step count, distance, and total time so
 * infinite-scroll pages cannot run forever. Never clicks/types/submits.
 */
// `autoScrollPrepare` now lives in layout-probe.ts, so the probe and the deep
// observation share ONE scroll policy (Task 26 generic correction).

interface StabilizeOptions {
  prepareScroll: boolean;
  /** Task 28.7 A2 — run the bounded page-state normalization phase. */
  normalizePageState: boolean;
  /** The URL under observation (navigation recovery + evidence). */
  observationUrl: string;
  viewportId: string;
  pageId: string;
  evidenceRoot?: string;
  log: (message: string) => void;
}

/**
 * load → bounded networkidle → bounded fonts.ready → [page-state normalization]
 * → [navigation-safe prepare-scroll] → DETERMINISTIC settle → fixed tail wait.
 *
 * Task 28.7 A3 — `networkidle` is ONE bounded input here, no longer the settle
 * condition. Many sites never idle (analytics beacons, websockets, long polls),
 * so the observation used to fall through its 8s cap and collect whatever
 * happened to be on screen. The condition is now that the document height and
 * the settled count of RENDERABLE candidate images both hold still for
 * {@link SETTLE_STABLE_SAMPLES} consecutive samples, under hard sample and time
 * caps — and the fixed {@link SETTLE_MS} tail wait is KEPT after it, so every
 * timing property the pre-28.7 pipeline depended on still holds (in particular
 * the reveal finish pass still runs at least `SETTLE_MS` after the scroll).
 */
async function stabilize(
  page: Page,
  options: StabilizeOptions,
): Promise<StabilizeResult> {
  const { prepareScroll, log } = options;
  let domContentLoadedReached = false;
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 1_000 });
    domContentLoadedReached = true;
  } catch {
    // `goto` already waited for `load`, so this is effectively always true; it
    // is recorded rather than assumed.
  }

  let networkIdleReached = false;
  const niStart = Date.now();
  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    });
    networkIdleReached = true;
  } catch {
    // Bounded on purpose: many sites never truly idle. Continue anyway — the
    // deterministic settle below is what decides the page is done.
  }
  const networkIdleMs = Date.now() - niStart;

  const fontsStart = Date.now();
  const fontsReadyReached = await waitForFonts(page);
  const fontsReadyMs = Date.now() - fontsStart;

  // --- Task 28.7 A2 — page-state normalization, BEFORE the scroll ----------
  // Before the scroll on purpose: scrolling a page behind a modal that locks
  // the page scroller measures nothing, and collecting it bakes the popup in.
  const pageStateNormalization = options.normalizePageState
    ? await normalizePageState(page, {
        observationUrl: options.observationUrl,
        viewportId: options.viewportId,
        pageId: options.pageId,
        ...(options.evidenceRoot ? { evidenceRoot: options.evidenceRoot } : {}),
        onLog: log,
      })
    : pageStateNormalizationSkipped();

  let scrollMs = 0;
  let scrollSteps: number | undefined;
  let scrollDistancePx: number | undefined;
  let scrollReveal: ScrollReveal | undefined;
  let prepareScrollStatus: PrepareScrollStatus | undefined;
  let prepareScrollNavigation: PrepareScrollNavigation | undefined;
  let finishReveal: (() => Promise<ScrollReveal | undefined>) | undefined;
  if (prepareScroll) {
    const scrollStart = Date.now();
    // Task 28.6 C2 B4 — the deep observation MEASURES the reveal/re-hide, the
    // layout probe does not. The measurement is read-only, so both loads still
    // end in the same page state and the probe↔observation scroll parity the
    // /lazy fixture asserts is untouched.
    // Task 28.7 A1 — and it cannot throw: a navigation mid-scroll is recovered
    // or recorded, never propagated. Losing the whole route to it is the P0
    // defect this replaces.
    const r = await autoScrollPrepare(page, {
      measureReveal: true,
      observationUrl: options.observationUrl,
      onLog: log,
    });
    scrollSteps = r.steps;
    scrollDistancePx = r.distancePx;
    finishReveal = r.finishReveal;
    prepareScrollStatus = r.status;
    prepareScrollNavigation = r.navigation;
    scrollMs = Date.now() - scrollStart;
    if (r.status !== "prepare-scroll-complete") {
      log(
        `preparation scroll ended ${r.status}` +
          (r.navigation ? ` — ${r.navigation.limitation}` : ""),
      );
    }
    if (r.navigation?.recoveryNavigated || r.navigation?.restoreNavigated) {
      // The recovery/restore reloaded the document. `autoScrollPrepare` already
      // reinstalls the shim after each of its own gotos; this is belt and braces
      // for the collect pass that follows, and costs one tiny evaluate.
      await installBrowserNameShim(page).catch(() => {});
    }
  }

  // --- Task 28.7 A3 — the deterministic stability loop ---------------------
  const stabilityStart = Date.now();
  let samplesTaken = 0;
  let stableRun = 0;
  let sampleCapHit = false;
  let timeCapHit = false;
  let sampleError: string | undefined;
  let previous:
    | { documentHeight: number; settled: number; renderable: number }
    | undefined;
  let last = { documentHeight: 0, renderable: 0, loaded: 0, failed: 0, settled: 0 };
  let heightStable = false;
  let imagesStable = false;
  while (stableRun < SETTLE_STABLE_SAMPLES) {
    if (samplesTaken >= SETTLE_MAX_SAMPLES) {
      sampleCapHit = true;
      break;
    }
    if (Date.now() - stabilityStart >= SETTLE_MAX_TOTAL_MS) {
      timeCapHit = true;
      break;
    }
    let sample: typeof last;
    try {
      sample = await page.evaluate(sampleSettleInBrowser, {
        proximityPx: SETTLE_IMAGE_PROXIMITY_PX,
      });
    } catch (err) {
      // A page that tore its context down mid-settle cannot be sampled. The
      // observation continues; the failure is recorded, never swallowed.
      sampleError = err instanceof Error ? err.message.split("\n", 1)[0] : String(err);
      break;
    }
    samplesTaken++;
    last = sample;
    if (
      previous !== undefined &&
      previous.documentHeight === sample.documentHeight &&
      previous.settled === sample.settled &&
      previous.renderable === sample.renderable
    ) {
      stableRun++;
    } else {
      stableRun = 0;
    }
    previous = {
      documentHeight: sample.documentHeight,
      settled: sample.settled,
      renderable: sample.renderable,
    };
    if (stableRun >= SETTLE_STABLE_SAMPLES) break;
    await pause(page, SETTLE_SAMPLE_INTERVAL_MS);
  }
  const reachedStability = stableRun >= SETTLE_STABLE_SAMPLES;
  heightStable = reachedStability;
  imagesStable = reachedStability && last.settled === last.renderable;
  const stabilityMs = Date.now() - stabilityStart;

  // The fixed tail wait is KEPT: late layout/paint work, and every pre-28.7
  // ordering property that depends on `SETTLE_MS` elapsing after the scroll.
  await pause(page, SETTLE_MS);
  // AFTER the settle, so the regression is measured against the state the
  // COLLECTOR is about to record rather than against a page mid-fade-out.
  if (finishReveal) scrollReveal = await finishReveal();

  const settle: SettleOutcome = {
    domContentLoadedReached,
    networkIdleReached,
    networkIdleMs,
    fontsReadyReached,
    fontsReadyMs,
    scrollRan: prepareScroll,
    scrollMs,
    heightStable,
    imagesStable,
    requiredStableSamples: SETTLE_STABLE_SAMPLES,
    samplesTaken,
    stabilityMs,
    sampleCapHit,
    timeCapHit,
    ...(sampleError ? { sampleError } : {}),
    finalDocumentHeight: last.documentHeight,
    renderableImages: last.renderable,
    imagesLoaded: last.loaded,
    imagesFailed: last.failed,
    tailMs: SETTLE_MS,
  };
  log(
    `settle: height ${heightStable ? "stable" : "UNSTABLE"}, images ` +
      `${String(last.settled)}/${String(last.renderable)} settled ` +
      `(${String(last.failed)} failed), ${String(samplesTaken)} sample(s) in ` +
      `${String(stabilityMs)}ms` +
      (sampleCapHit ? " — SAMPLE CAP HIT" : "") +
      (timeCapHit ? " — TIME CAP HIT" : "") +
      (networkIdleReached ? "" : " — networkidle never reached"),
  );

  return {
    networkIdleReached,
    fontsReadyReached,
    networkIdleMs,
    fontsReadyMs,
    scrollMs,
    scrollSteps,
    scrollDistancePx,
    ...(scrollReveal ? { scrollReveal } : {}),
    ...(prepareScrollStatus ? { prepareScrollStatus } : {}),
    ...(prepareScrollNavigation ? { prepareScrollNavigation } : {}),
    settle,
    pageStateNormalization,
  };
}

/**
 * Deep-observe ONE viewport. Same pipeline for every profile: a dedicated
 * browser context (viewport / DPR / touch / UA from the profile, plus the shared
 * locale/timezone/colorScheme/reducedMotion), then load → stabilize → collect →
 * screenshot, all inside that one context so the DOM observation and the
 * screenshot describe the same page state (Task 05, item 12).
 */
async function observeViewport(
  browser: Browser,
  requestedUrl: string,
  profile: ViewportProfile,
  timestamp: string,
  prepareScroll: boolean,
  // Task 28.7 A2 — the normalization phase's settings, threaded per viewport so
  // the evidence directory names the exact page AND viewport it describes.
  normalize: {
    enabled: boolean;
    pageId: string;
    evidenceRoot?: string;
  },
  screenshotTimeoutMs: number,
  // Source Preservation V2 Phase 1 — undefined = no Source Package (default).
  sourcePackageOptions: SourceCaptureOptions | undefined,
  log: (message: string) => void,
): Promise<ObservedViewport> {
  const t0 = Date.now();
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: OBSERVATION_REDUCED_MOTION as "no-preference",
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    // Source Preservation V2 Phase 1 — the Source Package recorder, ALSO before
    // navigation, for the same reason. Opt-in; absent it changes nothing.
    const sourceCapture = sourcePackageOptions
      ? await attachSourceCapture(page, {
          ...sourcePackageOptions,
          log: (m) => log(`[${profile.id}] ${m}`),
        })
      : undefined;
    // Task 28.6 W1.1 — installed BEFORE navigation: a stylesheet response that
    // arrives before the listener exists cannot be recovered afterwards.
    const stylesheetCapture = captureStylesheetBodies(page);

    log(`[${profile.id}] Loading (${profile.width}×${profile.height})…`);
    const navStart = Date.now();
    // Task 28.7 B1 — the main document's HTTP status is RECORDED, and a non-2xx
    // answer is retried once before it is accepted. See navigateMainDocument.
    // Responsive Core P0 §C1.1 — the same navigation also keeps the main
    // document's response body (bytes as served, before any script ran), read
    // from the Response `page.goto` returned. No second request.
    const {
      documentResponse,
      initialDocument,
      html: documentResponseHtml,
      body: documentResponseBody,
    } = await navigateMainDocumentCapturingBody(page, requestedUrl, (m) =>
      log(`[${profile.id}] ${m}`),
    );
    if (initialDocument.status !== "captured") {
      log(
        `[${profile.id}] initial document not captured (${initialDocument.status}` +
          (initialDocument.reason ? `: ${initialDocument.reason}` : "") +
          `) — inline-style provenance will read "no-initial-document"`,
      );
    }
    const navMs = Date.now() - navStart;
    let sourceIntegrity: SourceIntegrity | undefined;
    if (!documentResponse.ok && !documentResponse.statusUnavailable) {
      sourceIntegrity = non2xxIntegrity(documentResponse);
      log(
        `[${profile.id}] SOURCE INTEGRITY: ${sourceIntegrity.limitations[0]}`,
      );
    } else if (documentResponse.retried) {
      log(
        `[${profile.id}] the retry recovered the document (HTTP ` +
          `${String(documentResponse.status)})`,
      );
    }
    // Task 28.75 — the shim, the census and the normalizer are ONE shared
    // implementation now (src/observer/initial-paint-census.ts), so a non-observer
    // caller runs exactly the phases the observer runs.
    await installBrowserNameShim(page);
    // Task 28.6 C2 B5 — BEFORE stabilization: "what painted at initial paint" is
    // only true if nothing has had time to open a popup yet. A failure here is
    // never fatal; the overlay census then records
    // `initialPaintCensusAvailable: false` and refuses every candidate instead
    // of guessing.
    const initialPaint = await markInitialPaintCensus(page);
    if (initialPaint.capHit) {
      log(
        `[${profile.id}] initial-paint census capped at ${initialPaint.elements} ` +
          `element(s) — overlay candidates beyond it carry no initial-paint signal`,
      );
    }
    if (prepareScroll) {
      log(`[${profile.id}] Preparing (read-only auto-scroll for lazy content)…`);
    }
    const stab = await stabilize(page, {
      prepareScroll,
      normalizePageState: normalize.enabled,
      observationUrl: requestedUrl,
      viewportId: profile.id,
      pageId: normalize.pageId,
      ...(normalize.evidenceRoot ? { evidenceRoot: normalize.evidenceRoot } : {}),
      log: (m) => log(`[${profile.id}] ${m}`),
    });
    if (stab.pageStateNormalization.attempts.length > 0) {
      log(
        `[${profile.id}] page-state normalization: ` +
          `${stab.pageStateNormalization.dismissed} dismissed of ` +
          `${stab.pageStateNormalization.attempts.length} attempt(s) ` +
          `(${stab.pageStateNormalization.qualified} qualified of ` +
          `${stab.pageStateNormalization.structuralMatches} modal-shaped)`,
      );
    }

    // Task 28.6 W1.1 — the recovery material, assembled before the collect pass.
    // The page is asked FIRST which sheets it cannot read, so only those bodies
    // cross the bridge (on a big site the difference is megabytes).
    await stylesheetCapture.settle();
    let blockedHrefs: string[] = [];
    try {
      blockedHrefs = await page.evaluate(listBlockedSheetHrefsInBrowser);
    } catch {
      blockedHrefs = [];
    }
    const extra = buildExtraSheets(blockedHrefs, stylesheetCapture.bodies);
    if (blockedHrefs.length > 0) {
      log(
        `[${profile.id}] ${blockedHrefs.length} stylesheet(s) blocked from the ` +
          `CSSOM; ${extra.sheets.length} recovered from captured responses ` +
          `(${extra.expanded} @import expanded, ${extra.unresolved} unresolved)`,
      );
    }

    log(`[${profile.id}] Collecting DOM / computed styles / geometry / inventory…`);
    const raw: RawCollectResult = await page.evaluate(collectPageInBrowser, {
      config:
        extra.sheets.length > 0
          ? { ...COLLECT_CONFIG, extraSheets: extra.sheets }
          : COLLECT_CONFIG,
    });
    const stylesheetCoverage: StylesheetCoverage | undefined = raw.stylesheetCoverage
      ? {
          ...raw.stylesheetCoverage,
          bytesCaptured: stylesheetCapture.stats.bytesCaptured,
          bytesBridged: extra.bytesBridged,
          sheetsSkippedBySizeCap: stylesheetCapture.stats.skippedBySizeCap,
          sheetsBodyUnavailable: stylesheetCapture.stats.bodyUnavailable,
          sheetsRedirectResponses: stylesheetCapture.stats.redirectResponses,
          sheetsRedirectAliasesKeyed: stylesheetCapture.stats.redirectAliasesKeyed,
          sheetsRedirectChainsTruncated:
            stylesheetCapture.stats.redirectChainsTruncated,
          importsExpanded: extra.expanded,
          importsUnresolved: extra.unresolved,
          // Task 28.6 W6 O2 — the two paths, added. `importsExpanded` /
          // `importsUnresolved` are the NODE text-inlining path only;
          // `importRules*` come from the in-page CSSOM walk. Neither half is a
          // page total, and before O2 nothing published the sum.
          importsResolvedTotal:
            extra.expanded + (raw.stylesheetCoverage.importRulesFollowed ?? 0),
          importsUnresolvedTotal:
            extra.unresolved + (raw.stylesheetCoverage.importRulesUnresolved ?? 0),
        }
      : undefined;
    if (stylesheetCoverage) {
      log(
        `[${profile.id}] authored CSS: ${stylesheetCoverage.rulesIndexed} rule(s) ` +
          `indexed from ${stylesheetCoverage.cssomReadable}+` +
          `${stylesheetCoverage.fallbackRecovered}/` +
          `${stylesheetCoverage.stylesheetsTotal} sheet(s), ` +
          `${stylesheetCoverage.elementsWithAuthoredRules ?? 0} element(s) matched` +
          (stylesheetCoverage.ruleIndexCapHit ? " (RULE INDEX CAP HIT)" : ""),
      );
    }
    // Task 28.6 C2 B4/B5 — the two page-mode censuses the collector produced.
    // `scrollRevealMarked` counts the elements the collector actually marked, so
    // a hand-off the collector could not read shows up as 0 marked against a
    // nonzero `regressedAfterReturn` rather than as silence.
    const paintSuppression: PaintSuppression | undefined = raw.paintSuppression;
    const overlayCensus: OverlayCensus | undefined = raw.overlayCensus;
    if (paintSuppression && paintSuppression.sizedElements > 0) {
      log(
        `[${profile.id}] paint: ${paintSuppression.suppressedElements}/` +
          `${paintSuppression.sizedElements} sized element(s) paint nothing ` +
          `(${paintSuppression.suppressedBelowFold} below the fold` +
          (stab.scrollReveal
            ? `, ${stab.scrollReveal.regressedAfterReturn} re-hidden by the ` +
              `return-to-top`
            : "") +
          ")",
      );
    }
    if (overlayCensus && overlayCensus.structuralMatches > 0) {
      log(
        `[${profile.id}] overlay census: ${overlayCensus.structuralMatches} ` +
          `modal-shaped element(s), ${overlayCensus.flagged} flagged for review, ` +
          `${overlayCensus.refused} refused, ` +
          `${overlayCensus.headerLikeRefused} header-like refused`,
      );
    }
    const renderedHtml = await page.content();

    // Source Preservation V2 Phase 1 — assemble the package while the page is
    // still open (the in-page inventory and the CSSOM serialization pass need
    // it). A failure here is logged and the observation stands without it.
    let sourcePackage: ObservedViewport["sourcePackage"];
    if (sourceCapture) {
      try {
        sourcePackage = await sourceCapture.finish({
          requestedUrl,
          viewport: {
            id: profile.id,
            width: profile.width,
            height: profile.height,
            isMobile: profile.isMobile,
            deviceScaleFactor: profile.deviceScaleFactor,
          },
          engine: "playwright-chromium",
          ...(normalize.pageId ? { pageId: normalize.pageId } : {}),
          initialDocument,
          ...(documentResponseBody !== undefined ? { documentResponseBody } : {}),
          runtimeHtml: renderedHtml,
        });
      } catch (err) {
        log(
          `[${profile.id}] source-package capture failed (${err instanceof Error ? err.message : String(err)}) — ` +
            `continuing without a Source Package for this viewport`,
        );
      }
    }

    const metadata: PageMetadata = {
      requestedUrl,
      finalUrl: raw.metadata.finalUrl,
      title: raw.metadata.title,
      timestamp,
      viewportWidth: raw.metadata.viewportWidth,
      viewportHeight: raw.metadata.viewportHeight,
      documentWidth: raw.metadata.documentWidth,
      documentHeight: raw.metadata.documentHeight,
      scrollWidth: raw.metadata.scrollWidth,
      scrollHeight: raw.metadata.scrollHeight,
    };

    // Deduplicate computed styles into a per-viewport shared table.
    // Task 28.7 A4 — this is also where the reveal-regression policy is applied:
    // an element the scroll watched reach a visible opacity and the return-to-top
    // put back to 0 emits the REVEALED value, and both real instants stay on the
    // raw record. Counted and logged, never silent.
    const { elements, styleTable, dedup, revealRegressionPolicy } = dedupeStyles(
      raw.elements,
    );
    assertStyleReferencesResolve(elements, styleTable);
    if (revealRegressionPolicy && revealRegressionPolicy.marks > 0) {
      log(
        `[${profile.id}] reveal-regression policy: ` +
          `${revealRegressionPolicy.corrected}/${revealRegressionPolicy.marks} ` +
          `mark(s) corrected to their observed revealed opacity ` +
          `(${revealRegressionPolicy.correctedBelowFull} below full, ` +
          `${revealRegressionPolicy.unstable} left alone as unstable)`,
      );
    }

    const links = deriveLinks(elements, raw.baseUri, metadata.finalUrl);
    const assets = deriveAssets(
      raw.elements,
      raw.images,
      raw.inlineSvgs,
      raw.icons,
      raw.fontUrls,
      raw.baseUri,
    );

    /*
     * Task 28.7 — THE SCREENSHOT MAY NOT COST THE ROUTE.
     *
     * `page.screenshot` inherits Playwright's 30s DEFAULT action timeout
     * (`setDefaultNavigationTimeout` moves only the navigation budget), and it is
     * the heaviest call in the whole observation: a tall document at the mobile
     * profile's DPR 3 is a hundreds-of-megapixels capture. An overrun used to
     * throw straight out of here, and the site orchestrator then filed the page
     * as an `observation-error` WITH NO ARTIFACT — which kills the entire
     * reconstruction downstream (`route-plan` throws when a route has no
     * `renderSourcePageId`). That is the same P0 A1 exists to remove, reached
     * through a different door.
     *
     * So the budget is explicit and generous, and an overrun DEGRADES to the
     * cheap viewport-only capture with the fact recorded on the artifact. Only if
     * even that fails does the observation fail — at which point the page really
     * is gone and an error is the honest answer.
     */
    log(`[${profile.id}] Capturing screenshot (fullPage)…`);
    let screenshot: Buffer;
    let screenshotDegraded: string | undefined;
    try {
      screenshot = await page.screenshot({
        fullPage: true,
        type: "png",
        timeout: screenshotTimeoutMs,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message.split("\n", 1)[0] : String(err);
      log(
        `[${profile.id}] full-page screenshot failed (${reason}) — falling back ` +
          `to a viewport-only capture; the observation is KEPT and the ` +
          `degradation is recorded`,
      );
      screenshot = await page.screenshot({
        type: "png",
        timeout: SCREENSHOT_FALLBACK_TIMEOUT_MS,
      });
      screenshotDegraded = `viewport-only: full-page capture failed — ${reason}`;
    }

    const environment: Environment = {
      browser: "chromium",
      browserVersion: browser.version(),
      userAgent: raw.environment.userAgent,
      viewportWidth: raw.environment.viewportWidth,
      viewportHeight: raw.environment.viewportHeight,
      deviceScaleFactor: raw.environment.deviceScaleFactor,
      ...(raw.environment.locale ? { locale: raw.environment.locale } : {}),
      ...(raw.environment.timezone
        ? { timezone: raw.environment.timezone }
        : {}),
      colorScheme: raw.environment.colorScheme,
      reducedMotion: raw.environment.reducedMotion,
      timestamp,
    };

    const shadow: ShadowInventory = {
      openShadowRootCount: raw.shadowHostIds.length,
      shadowHostIds: raw.shadowHostIds,
    };

    const inlineSvgCount = assets.filter((a) => a.type === "inline-svg").length;

    const stats: ObservationStats = {
      domElementCount: elements.length,
      elementsWithGeometry: elements.filter(
        (e) =>
          e.boundingBox && e.boundingBox.width > 0 && e.boundingBox.height > 0,
      ).length,
      localVisibleCount: elements.filter((e) => e.localVisible).length,
      effectiveVisibleCount: elements.filter((e) => e.effectiveVisible).length,
      elementsWithPseudo: elements.filter((e) => e.pseudo).length,
      uniqueStyleCount: dedup.uniqueStyleCount,
      rawStyleOccurrenceCount: dedup.rawStyleOccurrences,
      assetCount: assets.length,
      uniqueAssetCount: countUniqueAssetIdentities(assets),
      scrollContainerCount: elements.filter((e) => e.scrollState !== undefined).length,
      inlineSvgCount,
      linkCount: links.length,
      internalLinkCount: links.filter((l) => l.internal).length,
      openShadowRootCount: shadow.openShadowRootCount,
      iframeCount: raw.frames.length,
    };

    const totalMs = Date.now() - t0;
    const loadStrategy: LoadStrategy = {
      waitUntil: "load",
      navTimeoutMs: NAV_TIMEOUT_MS,
      networkIdleTimeoutMs: NETWORK_IDLE_TIMEOUT_MS,
      networkIdleReached: stab.networkIdleReached,
      fontsReadyTimeoutMs: FONTS_READY_TIMEOUT_MS,
      fontsReadyReached: stab.fontsReadyReached,
      settleMs: SETTLE_MS,
      prepareScroll,
      ...(stab.scrollSteps !== undefined ? { scrollSteps: stab.scrollSteps } : {}),
      ...(stab.scrollDistancePx !== undefined
        ? { scrollDistancePx: stab.scrollDistancePx }
        : {}),
      // Task 28.7 A1/A2/A3 — how the scroll ended, what the normalization phase
      // did, and what the deterministic settle actually reached.
      ...(stab.prepareScrollStatus
        ? { prepareScrollStatus: stab.prepareScrollStatus }
        : {}),
      ...(stab.prepareScrollNavigation
        ? { prepareScrollNavigation: stab.prepareScrollNavigation }
        : {}),
      // Task 28.7 B1 — the main document's status and every attempt made for it.
      documentResponse,
      settle: stab.settle,
      pageStateNormalization: stab.pageStateNormalization,
      timings: {
        navMs,
        networkIdleMs: stab.networkIdleMs,
        fontsReadyMs: stab.fontsReadyMs,
        settleMs: SETTLE_MS,
        ...(prepareScroll ? { scrollMs: stab.scrollMs } : {}),
        totalMs,
      },
    };

    return {
      profile,
      environment,
      metadata,
      loadStrategy,
      stats,
      styleDedup: dedup,
      shadow,
      elements,
      styleTable,
      assets,
      links,
      frames: raw.frames,
      renderedHtml,
      screenshot,
      // Task 28.5B §5 — resolved at THIS viewport, never merged with the other.
      customProperties: raw.customProperties,
      // Task 28.6 W1 — how much of the authored CSS this load could read.
      ...(stylesheetCoverage ? { stylesheetCoverage } : {}),
      // Task 28.6 C2 B4/B5 — blankness, scroll-reveal regression, modal shapes.
      ...(paintSuppression ? { paintSuppression } : {}),
      ...(stab.scrollReveal ? { scrollReveal: stab.scrollReveal } : {}),
      ...(overlayCensus ? { overlayCensus } : {}),
      // Task 28.7 — set only when `screenshot` is NOT a full-page capture.
      ...(screenshotDegraded ? { screenshotDegraded } : {}),
      // Task 28.7 A4 — the counted correction applied above.
      ...(revealRegressionPolicy ? { revealRegressionPolicy } : {}),
      // Task 28.7 B1 — ABSENT on a healthy capture; set when the document
      // answered non-2xx after the bounded retry. The cross-viewport reason is
      // merged in later, once the sibling viewport exists to compare against.
      ...(sourceIntegrity ? { sourceIntegrity } : {}),
      // Responsive Core P0 §C1.1 — the initial document record (+ its text).
      initialDocument,
      ...(documentResponseHtml !== undefined ? { documentResponseHtml } : {}),
      ...(documentResponseBody !== undefined ? { documentResponseBody } : {}),
      // Source Preservation V2 Phase 1 — absent unless the option was on.
      ...(sourcePackage ? { sourcePackage } : {}),
    };
  } finally {
    await context.close();
  }
}

/**
 * Resolve the viewport profiles against a LIVE Chromium: the mobile profile's UA
 * is derived from `browser.version()` so engine and UA stay consistent (Android
 * Chrome on a Chromium engine) rather than masquerading as iPhone Safari.
 * Desktop keeps Chromium's default UA.
 *
 * Exported so a multi-page run can record the exact profiles it applied without
 * re-deriving the policy (Task 09, item 10 — one source of truth).
 */
export function resolveViewportProfiles(browser: Browser): ViewportProfile[] {
  const mobileUserAgent = chromiumMobileUserAgent(browser.version());
  return VIEWPORT_PROFILES.map((p) =>
    p.id === "mobile" ? { ...p, userAgent: mobileUserAgent } : p,
  );
}

/**
 * Deep-observe ONE page (every viewport profile) using an ALREADY-RUNNING
 * browser. This is the shared observation primitive: {@link observePage} and the
 * multi-page site orchestrator both go through it, so there is exactly one
 * implementation of the observation logic.
 *
 * The caller owns the browser process; each viewport still gets its own fresh
 * `BrowserContext` inside {@link observeViewport}, so no cookie / localStorage /
 * sessionStorage state can leak between pages or viewports.
 */
export async function observePageWithBrowser(
  browser: Browser,
  requestedUrl: string,
  options: ObserveOptions = {},
): Promise<ObservedPage> {
  const log = options.onLog ?? (() => {});
  // Task 28.6 W8 RC2 — see ObserveOptions.prepareScroll. Default TRUE so the
  // observer's reveal state matches the responsive-QA capture, which scrolls
  // unconditionally. An explicit `false` still turns it off.
  const prepareScroll = options.prepareScroll ?? true;
  // Task 28.7 A2 — ON by default. See ObserveOptions.normalizePageState.
  const normalizeEnabled = options.normalizePageState ?? true;
  const evidencePageId =
    options.pageStateEvidenceId ?? evidenceIdFromUrl(requestedUrl);
  const timestamp = new Date().toISOString();

  const profiles = resolveViewportProfiles(browser);

  const viewports: ObservedViewport[] = [];
  for (const profile of profiles) {
    viewports.push(
      await observeViewport(
        browser,
        requestedUrl,
        profile,
        timestamp,
        prepareScroll,
        {
          enabled: normalizeEnabled,
          pageId: evidencePageId,
          ...(options.pageStateEvidenceRoot
            ? { evidenceRoot: options.pageStateEvidenceRoot }
            : {}),
        },
        options.screenshotTimeoutMs ?? SCREENSHOT_TIMEOUT_MS,
        options.sourcePackage === true
          ? {}
          : typeof options.sourcePackage === "object"
            ? options.sourcePackage
            : undefined,
        log,
      ),
    );
  }

  // Task 28.7 B1 — the corroborating signal, computed only now: it compares the
  // viewports of THIS page in THIS run against each other, so it cannot exist
  // until every viewport has been observed.
  applyCrossViewportIntegrity(viewports, log);
  const desktop =
    viewports.find((v) => v.profile.id === "desktop") ?? viewports[0];
  const target: RunTarget = {
    requestedUrl,
    finalUrl: desktop.metadata.finalUrl,
    title: desktop.metadata.title,
    timestamp,
  };
  const observationProfile: ObservationProfile = {
    locale: OBSERVATION_LOCALE,
    timezone: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME,
    reducedMotion: OBSERVATION_REDUCED_MOTION,
  };

  /*
   * Task 28.6 C3 D1 — DERIVE the probe widths from the page's OWN authored
   * breakpoints.
   *
   * The deep observation above already tallied every distinct `@media`
   * condition each viewport's stylesheets carry (the same in-page pass that
   * recovers CORS-blocked sheets), so the site's authored breakpoints are known
   * HERE, before either probe pass runs. The reconstruction engine builds a
   * responsive band edge at the midpoint of two adjacent samples, so sampling
   * either side of an authored breakpoint is what stops an edge landing 200px
   * away from where the source actually changes.
   *
   * A viewport whose CSS could not be read degrades to the fixed floor list and
   * says so in the artifact; nothing here can make the probe sample FEWER or
   * differently-placed widths than the pre-C3 fixed list did.
   */
  const deriveFor = (
    viewport: ObservedViewport | undefined,
    floorWidths: readonly number[],
    // Task 28.6 W7 O3.1 — the width THIS pass's own deep observation was taken
    // at. The reconstruction anchors the whole viewport pass to it and refuses
    // the pass with `truth-width-not-probed` when it is absent, so it is pinned
    // against the W6 O3 eviction path. Passed by the caller from the live
    // profile, so no pixel value is named inside the derivation.
    requiredWidths: readonly number[],
    /*
     * Task 28.7 B2 — the envelope extension, requested by the MOBILE pass only.
     *
     * `crossContextViewport` is the OTHER browser context's observation of the
     * same page in the same run. A site that serves a different DOM to mobile
     * can serve different sheets with it, and the authored pixel that governs
     * the desktop/mobile tree switch normally lives in the DESKTOP-loaded
     * stylesheets, which the mobile context never reads. The switch itself is
     * inferred downstream and does not exist here, so that authored pixel is
     * the only evidence available at observe time — see
     * MAX_ENVELOPE_EXTENSION_BRACKETS. The desktop pass passes neither, so its
     * derivation is byte-identical to the pre-B2 one.
     */
    envelope?: {
      extend: boolean;
      crossContextViewport?: ObservedViewport | undefined;
      /**
       * The width the extension may never pass — the width the OTHER context's
       * own full observation was taken at. Above it that context's tree is
       * demonstrably what renders, so an authored breakpoint beyond it cannot
       * be this pass's tree switch. Passed from the LIVE profile, so no pixel
       * value is named inside the derivation.
       */
      maxWidth?: number;
    },
  ): DerivedProbeWidths => {
    const coverage = viewport?.stylesheetCoverage;
    const crossConditions =
      envelope?.crossContextViewport?.stylesheetCoverage
        ?.authoredMediaConditions;
    return deriveProbeWidths({
      floorWidths,
      requiredWidths,
      conditions: coverage?.authoredMediaConditions,
      ...(envelope?.extend
        ? {
            extendEnvelopeFromAuthored: true,
            ...(crossConditions ? { crossContextConditions: crossConditions } : {}),
            ...(envelope.maxWidth !== undefined
              ? { envelopeExtensionMaxWidth: envelope.maxWidth }
              : {}),
          }
        : {}),
      ...(coverage
        ? {
            sheetsReadable:
              (coverage.cssomReadable ?? 0) + (coverage.fallbackRecovered ?? 0),
            sheetsTotal: coverage.stylesheetsTotal ?? 0,
            conditionsDroppedByCollector:
              coverage.authoredMediaConditionsDropped ?? 0,
          }
        : {}),
    });
  };
  const logDerived = (tag: string, derived: DerivedProbeWidths): void => {
    const p = derived.provenance;
    log(
      `[probe:${tag}] widths ${derived.widths.join(", ")} — ` +
        `${p.floorWidths.length} floor + ${p.widthsAdded} from ` +
        `${p.breakpointsAdopted}/${p.breakpointsFolded} authored breakpoint(s) ` +
        `(${p.conditionsRead} condition(s) read` +
        (p.breakpointsDroppedByCap > 0
          ? `, ${p.breakpointsDroppedByCap} dropped by the ${String(p.cap)}-width cap`
          : "") +
        (p.breakpointsOutOfRange > 0
          ? `, ${p.breakpointsOutOfRange} out of range`
          : "") +
        ")" +
        (p.degradedToFloor ? ` — DEGRADED TO FLOOR (${String(p.degradedReason)})` : "") +
        // Task 28.7 B2 — only the pass that asked for an envelope extension.
        (p.envelopeExtension
          ? p.envelopeExtension.extended
            ? ` — envelope extended ${String(p.envelopeExtension.baseMaxWidth)}→` +
              `${String(p.envelopeExtension.maxWidth)} by ` +
              `${String(p.envelopeExtension.bracketsAdmitted.length)} authored ` +
              `breakpoint(s) (${p.envelopeExtension.bracketsAdmitted
                .map((b) => `${String(b.px)}/${b.kind}`)
                .join(", ")}); widths beyond the floor ceiling: ` +
              `${p.envelopeExtension.widthsBeyondBase.join(", ") || "none"}`
            : ` — envelope NOT extended (no authored breakpoint above ` +
              `${String(p.envelopeExtension.baseMaxWidth)})`
          : ""),
    );
  };

  // Task 17 §8 — the lightweight multi-width probe. Supplemental by design: a
  // probe failure is logged and the observation stands without it.
  let layoutProbe: ObservedPage["layoutProbe"];
  if (options.layoutProbe !== false) {
    try {
      log(`[probe] multi-width layout probe…`);
      const derived = deriveFor(desktop, LAYOUT_PROBE_WIDTHS, [
        desktop?.profile.width ?? DESKTOP_PROFILE.width,
      ]);
      logDerived("desktop", derived);
      layoutProbe = await probeLayout(browser, requestedUrl, {
        widths: derived.widths,
        widthProvenance: derived.provenance,
        // Task 28.75 §07 — the denominator. Without the deep walk's count the
        // probe cannot tell a starved load from a small page, which is how a
        // 3-element probe of a 2,306-element page was recorded as a success.
        ...(desktop ? { expectedElementCount: desktop.stats.domElementCount } : {}),
        ...(options.probeExtraWidths ? { extraWidths: options.probeExtraWidths } : {}),
        // The probe must render the page the Observer saw: mirror prepare-scroll.
        ...(prepareScroll ? { prepareScroll: true } : {}),
        onLog: log,
      });
    } catch (err) {
      log(
        `[probe] failed (${err instanceof Error ? err.message : String(err)}) — ` +
          `continuing without a layout probe`,
      );
    }
  }

  // Task 28.6 W1.4 — the MOBILE-context probe. The desktop probe walks the tree
  // a desktop browser context renders; a site that serves a different DOM to
  // mobile never shows that tree to it, so the clone's mobile subtree had no
  // width evidence at all and a 700px viewport rendered a 390px layout. Separate
  // pass, separate artifact, separate element identity — never merged.
  let layoutProbeMobile: ObservedPage["layoutProbeMobile"];
  const mobileProfile = profiles.find((p) => p.id === "mobile");
  if (
    options.layoutProbe !== false &&
    options.mobileLayoutProbe !== false &&
    mobileProfile
  ) {
    try {
      log(`[probe:mobile] multi-width layout probe (mobile context)…`);
      // The MOBILE tree's own authored conditions FIRST: a site that serves a
      // different DOM to mobile can serve different sheets with it.
      //
      // Task 28.7 B2 corrects the bound. The mobile floor set stops at its own
      // widest width, and 28.6 defect A13 measured what that costs: the mobile
      // tree renders up to the desktop/mobile switch, which sits ABOVE that
      // ceiling on 5 of 7 pilots, so the band between them had no width
      // evidence at all. The ceiling now moves as far as the site's OWN
      // authored breakpoints above it reach — including the ones only the
      // desktop context could read, which is where that pixel usually lives —
      // and not one pixel further.
      const derivedMobile = deriveFor(
        viewports.find((v) => v.profile.id === "mobile"),
        MOBILE_LAYOUT_PROBE_WIDTHS,
        [mobileProfile.width],
        // Task 28.7 B2 — the mobile pass, and only it, may extend its ceiling
        // from authored evidence, and reads the desktop context's authored
        // conditions to find it. See MAX_ENVELOPE_EXTENSION_BRACKETS.
        {
          extend: true,
          crossContextViewport: desktop,
          maxWidth: desktop?.profile.width ?? DESKTOP_PROFILE.width,
        },
      );
      logDerived("mobile", derivedMobile);
      const mobileViewport = viewports.find((v) => v.profile.id === "mobile");
      layoutProbeMobile = await probeLayout(browser, requestedUrl, {
        profile: mobileProfile,
        height: mobileProfile.height,
        widths: derivedMobile.widths,
        widthProvenance: derivedMobile.provenance,
        // Task 28.75 §07 — the MOBILE deep walk is the mobile probe's
        // denominator. This is the exact pair that failed on linear.app: probe
        // 3, deep 2,291, ratio 0.0013.
        ...(mobileViewport
          ? { expectedElementCount: mobileViewport.stats.domElementCount }
          : {}),
        ...(options.mobileProbeExtraWidths
          ? { extraWidths: options.mobileProbeExtraWidths }
          : {}),
        ...(prepareScroll ? { prepareScroll: true } : {}),
        onLog: log,
      });
    } catch (err) {
      log(
        `[probe:mobile] failed (${err instanceof Error ? err.message : String(err)}) — ` +
          `continuing without a mobile layout probe`,
      );
    }
  }

  /*
   * Task 28.75 §07 — the probe marks land on the viewport they belong to, and
   * the roll-up happens AFTER them.
   *
   * It used to roll up before the probes ran, which is why a probe that walked
   * three elements could not have marked anything even if it had noticed.
   */
  applyProbeIntegrity(viewports, layoutProbe, layoutProbeMobile, log);
  const sourceIntegrity = rollUpSourceIntegrity(viewports);
  if (sourceIntegrity) {
    log(
      `SOURCE INTEGRITY: ${sourceIntegrity.suspectViewportIds.join("/")} ` +
        `viewport(s) of this page are NOT trustworthy as the source ` +
        `(${sourceIntegrity.reasons.join(", ")})`,
    );
  }


  return {
    target,
    observationProfile,
    viewports,
    ...(layoutProbe ? { layoutProbe } : {}),
    ...(layoutProbeMobile ? { layoutProbeMobile } : {}),
    // Task 28.7 B1 — absent when every viewport is healthy.
    ...(sourceIntegrity ? { sourceIntegrity } : {}),
  };
}

/**
 * Observe ONE page, owning the Chromium process: launch → observe → close.
 * Convenience wrapper for the single-page CLI (`pnpm observe`); the observation
 * itself is {@link observePageWithBrowser}.
 */
export async function observePage(
  requestedUrl: string,
  options: ObserveOptions = {},
): Promise<ObservedPage> {
  const browser: Browser = await chromium.launch();
  try {
    return await observePageWithBrowser(browser, requestedUrl, options);
  } finally {
    await browser.close();
  }
}
