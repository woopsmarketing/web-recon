import { chromium, type Browser, type Page } from "playwright";
import {
  ATTR_MAX_LEN,
  ATTR_WHITELIST,
  FONTS_READY_TIMEOUT_MS,
  LAYOUT_RULE_PROPERTIES,
  LAYOUT_RULE_SELECTOR_MAX_LEN,
  LAYOUT_RULE_VALUE_MAX_LEN,
  MAX_LAYOUT_RULES,
  MAX_MATCHED_RULES_PER_ELEMENT,
  NAV_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  PSEUDO_STYLE_WHITELIST,
  SCROLLABLE_OVERFLOW_VALUES,
  chromiumMobileUserAgent,
  SETTLE_MS,
  SKIP_TAGS,
  STYLE_WHITELIST,
  TEXT_MAX_LEN,
  VIEWPORT_PROFILES,
  type Environment,
  type LoadStrategy,
  type ObservationProfile,
  type ObservationStats,
  type ObservedPage,
  type ObservedViewport,
  type PageMetadata,
  type RunTarget,
  type ShadowInventory,
  type ViewportProfile,
} from "./types.js";
import {
  collectPageInBrowser,
  type CollectConfig,
  type RawCollectResult,
} from "./collect-dom.js";
import { dedupeStyles, assertStyleReferencesResolve } from "./dedupe-styles.js";
import { autoScrollPrepare, probeLayout } from "./layout-probe.js";
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
 * Strictly read-only: it navigates and reads. The ONLY motion it may perform is
 * an optional read-only *preparation* auto-scroll (`--prepare-scroll`) to
 * trigger lazy-loaded content — it never clicks, hovers to explore, submits
 * forms, or types. When enabled, the same preparation policy is applied to every
 * viewport.
 *
 * Load/stabilization strategy (see report for rationale), applied per viewport:
 *   goto("load") → bounded networkidle → bounded document.fonts.ready
 *   → [optional prepare-scroll] → fixed settle → observe.
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
  layoutRuleSelectorMaxLen: LAYOUT_RULE_SELECTOR_MAX_LEN,
  layoutRuleValueMaxLen: LAYOUT_RULE_VALUE_MAX_LEN,
};

/** tsx/esbuild wraps named functions with a module-local `__name` helper to
 * preserve Function.name. That helper is not present in the browser, so any
 * serialized function we pass to `page.evaluate` could throw
 * `__name is not defined`. Install a no-op shim first (as a string, so it is
 * not itself transformed). See ROADMAP: "Browser-side collector bundle". */
async function installNameShim(page: Page): Promise<void> {
  await page.evaluate(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
}

export interface ObserveOptions {
  /** Optional progress callback for the CLI. */
  onLog?: (message: string) => void;
  /** Run a bounded, read-only preparation auto-scroll to trigger lazy content. */
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
}

interface StabilizeResult {
  networkIdleReached: boolean;
  fontsReadyReached: boolean;
  networkIdleMs: number;
  fontsReadyMs: number;
  scrollMs: number;
  scrollSteps?: number;
  scrollDistancePx?: number;
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

/** load → bounded networkidle → bounded fonts.ready → [scroll] → settle. */
async function stabilize(
  page: Page,
  prepareScroll: boolean,
): Promise<StabilizeResult> {
  let networkIdleReached = false;
  const niStart = Date.now();
  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    });
    networkIdleReached = true;
  } catch {
    // Bounded on purpose: many sites never truly idle. Continue anyway.
  }
  const networkIdleMs = Date.now() - niStart;

  const fontsStart = Date.now();
  const fontsReadyReached = await waitForFonts(page);
  const fontsReadyMs = Date.now() - fontsStart;

  let scrollMs = 0;
  let scrollSteps: number | undefined;
  let scrollDistancePx: number | undefined;
  if (prepareScroll) {
    const scrollStart = Date.now();
    const r = await autoScrollPrepare(page);
    scrollSteps = r.steps;
    scrollDistancePx = r.distancePx;
    scrollMs = Date.now() - scrollStart;
  }

  await page.waitForTimeout(SETTLE_MS);
  return {
    networkIdleReached,
    fontsReadyReached,
    networkIdleMs,
    fontsReadyMs,
    scrollMs,
    scrollSteps,
    scrollDistancePx,
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

    log(`[${profile.id}] Loading (${profile.width}×${profile.height})…`);
    const navStart = Date.now();
    await page.goto(requestedUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    const navMs = Date.now() - navStart;
    await installNameShim(page);
    if (prepareScroll) {
      log(`[${profile.id}] Preparing (read-only auto-scroll for lazy content)…`);
    }
    const stab = await stabilize(page, prepareScroll);

    log(`[${profile.id}] Collecting DOM / computed styles / geometry / inventory…`);
    const raw: RawCollectResult = await page.evaluate(collectPageInBrowser, {
      config: COLLECT_CONFIG,
    });
    const renderedHtml = await page.content();

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
    const { elements, styleTable, dedup } = dedupeStyles(raw.elements);
    assertStyleReferencesResolve(elements, styleTable);

    const links = deriveLinks(elements, raw.baseUri, metadata.finalUrl);
    const assets = deriveAssets(
      raw.elements,
      raw.images,
      raw.inlineSvgs,
      raw.icons,
      raw.fontUrls,
      raw.baseUri,
    );

    log(`[${profile.id}] Capturing screenshot (fullPage)…`);
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });

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
  const prepareScroll = options.prepareScroll ?? false;
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
        log,
      ),
    );
  }

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

  // Task 17 §8 — the lightweight multi-width probe. Supplemental by design: a
  // probe failure is logged and the observation stands without it.
  let layoutProbe: ObservedPage["layoutProbe"];
  if (options.layoutProbe !== false) {
    try {
      log(`[probe] multi-width layout probe…`);
      layoutProbe = await probeLayout(browser, requestedUrl, {
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

  return {
    target,
    observationProfile,
    viewports,
    ...(layoutProbe ? { layoutProbe } : {}),
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
