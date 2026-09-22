import type { Browser, BrowserContext, Page } from "playwright";
import { markInitialPaintCensus } from "../../observer/initial-paint-census.js";
import { normalizePageState } from "../../observer/normalize-page-state.js";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_TIMEZONE,
} from "../../observer/types.js";
import { gotoQa, stabilize } from "../../reconstruction-qa/capture-page.js";
import { measureInPage, pauseVideosInPage, scanStylesheetsInPage } from "./in-page.js";
import {
  COLUMN_BUCKET_PX,
  H8_TEXT_CHARS,
  MAX_ANCESTOR_CLASS_TOKENS,
  MAX_SIBLING_DRIFT_STEPS,
  MOTION_FREEZE_CSS,
  MOTION_TOLERANCE_PX,
  MOTION_WAIT_MS,
  SETTLE_MS,
  SIGNATURE_CLASS_JACCARD,
  SIGNATURE_TEXT_CHARS,
  SKIP_TAGS,
  VIEWPORT_HEIGHT,
  type InPageTarget,
  type MeasureArgs,
  type PageReading,
  type StylesheetScan,
} from "./types.js";

/**
 * One side (source or clone) of a continuous QA route: ONE navigation, then
 * in-place resizes only. Both sides go through literally this code; the only
 * asymmetries are the URL, the optional CSS override (clone) and the in-page
 * element lookup `mode`.
 */

export const NAME_SHIM = "globalThis.__name = globalThis.__name || function (fn) { return fn; };";

/** The generator's stylesheet path (a generator convention, not a site one). */
export const GENERATED_STYLES_ROUTE = "**/wr/generated-styles.css*";

export interface SideTiming {
  settleMs?: number;
  motionWaitMs?: number;
  /** Stepped-scroll pause (ms). */
  scrollStepWaitMs?: number;
  /** Extra wait before each reproducibility re-measurement (ms). */
  reproduceExtraSettleMs?: number;
}

export interface OpenSideInput {
  browser: Browser;
  side: "source" | "clone";
  url: string;
  pageId: string;
  loadWidth: number;
  targets: InPageTarget[];
  cssOverrideBody?: string;
  normalize?: boolean;
  evidenceRoot: string;
  timing?: SideTiming;
  log?: (line: string) => void;
}

export interface SideSession {
  side: "source" | "clone";
  page: Page;
  context: BrowserContext;
  url: string;
  finalUrl: string;
  currentWidth: number;
  normalization: {
    ran: boolean;
    qualified: number;
    dismissed: number;
    initialPaintCensusElements: number;
    networkIdleReached: boolean;
    fontsReadyReached: boolean;
    videosPaused: number;
    limitations: string[];
  };
  motionUnstable: string[];
  cssOverrideRequests: number;
  lazyScrollPasses: number;
  measurements: number;
  measure(width: number, heavy: boolean, findTexts?: string[], extraSettleMs?: number): Promise<PageReading>;
  scanStylesheets(): Promise<StylesheetScan>;
  lazyScroll(): Promise<void>;
  close(): Promise<void>;
}

function shortError(err: unknown): string {
  return err instanceof Error ? err.message.split("\n", 1)[0]! : String(err);
}

export async function openSide(input: OpenSideInput): Promise<SideSession> {
  const settleMs = input.timing?.settleMs ?? SETTLE_MS;
  const motionWaitMs = input.timing?.motionWaitMs ?? MOTION_WAIT_MS;
  const scrollStepWaitMs = input.timing?.scrollStepWaitMs ?? 110;
  const log = input.log ?? (() => {});

  const context = await input.browser.newContext({
    viewport: { width: input.loadWidth, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: "reduce",
    acceptDownloads: false,
  });
  await context.addInitScript(NAME_SHIM);
  let cssOverrideRequests = 0;
  if (input.cssOverrideBody !== undefined) {
    const body = input.cssOverrideBody;
    await context.route(GENERATED_STYLES_ROUTE, (route) => {
      cssOverrideRequests++;
      void route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", body });
    });
  }
  const page = await context.newPage();
  context.on("page", (popup) => {
    if (popup !== page) void popup.close().catch(() => {});
  });
  page.on("download", (download) => void download.cancel().catch(() => {}));
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));

  let currentWidth = input.loadWidth;
  let measurements = 0;
  let lazyScrollPasses = 0;

  const settle = async (): Promise<void> => {
    await page
      .evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      )
      .catch(() => {});
    await page.waitForTimeout(settleMs);
    await page
      .evaluate(() => {
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (!fonts || !fonts.ready) return true;
        return Promise.race([
          fonts.ready.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
        ]);
      })
      .catch(() => false);
  };

  const cfg: MeasureArgs["cfg"] = {
    textChars: SIGNATURE_TEXT_CHARS,
    jaccard: SIGNATURE_CLASS_JACCARD,
    columnBucket: COLUMN_BUCKET_PX,
    h8Chars: H8_TEXT_CHARS,
    maxDrift: MAX_SIBLING_DRIFT_STEPS,
    ancClassCap: MAX_ANCESTOR_CLASS_TOKENS,
  };

  const evaluateMeasure = async (heavy: boolean, findTexts: string[]): Promise<PageReading> => {
    const args: MeasureArgs = {
      mode: input.side,
      pageId: input.pageId,
      heavy,
      skipTags: [...SKIP_TAGS],
      targets: input.targets,
      findTexts,
      cfg,
    };
    measurements++;
    return (await page.evaluate(measureInPage, args)) as PageReading;
  };

  const lazyScroll = async (): Promise<void> => {
    lazyScrollPasses++;
    try {
      const { height, step } = await page.evaluate(() => ({
        height: (document.scrollingElement || document.documentElement).scrollHeight,
        step: Math.max(200, Math.round(window.innerHeight * 0.9)),
      }));
      let steps = 0;
      for (let y = 0; y < height && steps < 60; y += step, steps++) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(scrollStepWaitMs);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(Math.max(scrollStepWaitMs, 150));
      await page.evaluate(pauseVideosInPage).catch(() => 0);
    } catch (err) {
      log(`[continuous-qa] ${input.side} lazy scroll failed: ${shortError(err)}`);
    }
  };

  const finalUrl = await gotoQa(page, input.url);
  const normalizeEnabled = input.normalize ?? true;
  const initialPaint = normalizeEnabled
    ? await markInitialPaintCensus(page)
    : { usable: false, elements: 0, capHit: false };
  const stable = await stabilize(page);
  const pageState = normalizeEnabled
    ? await normalizePageState(page, {
        observationUrl: input.url,
        viewportId: `continuous-${input.side}-w${input.loadWidth}`,
        pageId: input.pageId,
        evidenceRoot: input.evidenceRoot,
      })
    : undefined;
  await page.addStyleTag({ content: MOTION_FREEZE_CSS }).catch(() => {});
  const videosPaused = (await page.evaluate(pauseVideosInPage).catch(() => 0)) as number;
  await settle();
  await lazyScroll();
  await settle();

  // Motion detection: two readings at the load width, no resize in between.
  const first = await evaluateMeasure(false, []);
  await page.waitForTimeout(motionWaitMs);
  const second = await evaluateMeasure(false, []);
  const motionUnstable: string[] = [];
  const secondByKey = new Map(second.nodes.map((node) => [node.k, node]));
  for (const node of first.nodes) {
    const other = secondByKey.get(node.k);
    if (!other || node.v !== 1 || other.v !== 1) continue;
    if (
      Math.abs(node.x - other.x) > MOTION_TOLERANCE_PX ||
      Math.abs(node.y - other.y) > MOTION_TOLERANCE_PX
    ) {
      motionUnstable.push(node.k);
    }
  }
  motionUnstable.sort();

  const session: SideSession = {
    side: input.side,
    page,
    context,
    url: input.url,
    finalUrl,
    get currentWidth() {
      return currentWidth;
    },
    normalization: {
      ran: pageState?.ran ?? false,
      qualified: pageState?.qualified ?? 0,
      dismissed: pageState?.dismissed ?? 0,
      initialPaintCensusElements: initialPaint.elements,
      networkIdleReached: stable.networkIdleReached,
      fontsReadyReached: stable.fontsReadyReached,
      videosPaused,
      limitations: [...(pageState?.limitations ?? [])],
    },
    motionUnstable,
    get cssOverrideRequests() {
      return cssOverrideRequests;
    },
    get lazyScrollPasses() {
      return lazyScrollPasses;
    },
    get measurements() {
      return measurements;
    },
    async measure(
      width: number,
      heavy: boolean,
      findTexts: string[] = [],
      extraSettleMs = 0,
    ): Promise<PageReading> {
      if (width !== currentWidth) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        currentWidth = width;
      }
      await settle();
      if (extraSettleMs > 0) {
        await page.waitForTimeout(extraSettleMs);
        await settle();
      }
      return evaluateMeasure(heavy, findTexts);
    },
    async scanStylesheets(): Promise<StylesheetScan> {
      try {
        return (await page.evaluate(scanStylesheetsInPage)) as StylesheetScan;
      } catch (err) {
        log(`[continuous-qa] ${input.side} stylesheet scan failed: ${shortError(err)}`);
        return { sheets: 0, unreadableSheets: 0, conditions: [] };
      }
    },
    lazyScroll,
    async close(): Promise<void> {
      await context.close().catch(() => {});
    },
  };
  return session;
}
