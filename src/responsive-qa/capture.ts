import type { Browser, Page } from "playwright";
import {
  markInitialPaintCensus,
  normalizePageState,
} from "../observer/index.js";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  type ViewportProfile,
} from "../observer/types.js";
import { gotoQa, newQaContext, stabilize } from "../reconstruction-qa/capture-page.js";
import { computeOverlapAccounting } from "./overlap.js";
import { probeInBrowser, type ProbeOptions, type ProbeResult } from "./probe.js";
import {
  CAPTURE_DEVICE_SCALE_FACTOR,
  CAPTURE_VIEWPORT_HEIGHT,
  EMPTY_BAND_ROW_PX,
  SCROLL_BEFORE_PROBE,
  SCROLL_BOTTOM_SETTLE_MS,
  SCROLL_MAX_STEPS,
  SCROLL_STEP_PX,
  SCROLL_STEP_WAIT_MS,
  SCROLL_TOP_SETTLE_MS,
  WIDE_ELEMENT_VIEWPORT_FACTOR,
  LOGO_ROW_PILE_EXTENT_RATIO,
  MAX_COLUMN_CONTAINERS,
  MAX_LEAF_BOXES,
  MAX_OVERLAP_SAMPLES,
  MIN_COLUMN_CONTAINER_CHILDREN,
  MIN_LOGO_ROW_ITEMS,
  ROW_CLUSTER_TOLERANCE_PX,
  QA_PAGE_STATE_EVIDENCE_ROOT,
  ResponsiveQaInfrastructureError,
  TEXT_KEY_MAX_CHARS,
  type CapturePolicy,
  type PageStateRecord,
  type ScrollReport,
  type SideMeasurement,
  type SideProvenance,
} from "./types.js";

/**
 * One capture, run identically on both sides (Task 28.6, lane W3).
 *
 * The context, the load policy and the settle are the repo's own — `newQaContext`,
 * `gotoQa` and `stabilize` are imported from `src/reconstruction-qa/capture-page.ts`
 * rather than reimplemented, so this harness cannot drift away from the way the
 * rest of the engine looks at a page.
 *
 * TWO DELIBERATE DEPARTURES, both recorded in the artifact's `capturePolicy`:
 *
 *  1. THE CAPTURE IS PINNED. Videos are paused and rewound to their first
 *     frame, and the screenshot is taken with Playwright's `animations:
 *     "disabled"`. `reconstruction-qa` deliberately does NOT do this, because
 *     its screenshots are compared against the Observer's saved snapshots and
 *     those were taken unpinned; mixing the two silently would compare a frozen
 *     page against a moving one. Both sides here are pinned the same way, and
 *     `capturePolicy.pinned` is written into the artifact so nobody can later
 *     mistake these PNGs for Observer snapshots.
 *
 *  2. ONE CONTEXT SHAPE AT EVERY WIDTH. Every capture uses a DPR-1, non-touch,
 *     desktop-shaped context and only the WIDTH changes. Task 05's mobile
 *     profile (DPR 3, touch, Android UA) is not used at 390, because a sweep
 *     whose user agent changes half way through is measuring two experiments.
 *     The consequence is honest and worth stating: at 390 the SOURCE may serve
 *     its desktop UA branch, and the CLONE — whose subtree choice is width-only
 *     — will render its mobile subtree below the generated breakpoint. That is
 *     the thing to measure, not something to work around.
 */

/** Every width uses this shape; only `width` changes. */
export function profileForWidth(width: number): ViewportProfile {
  return {
    id: "desktop",
    width,
    height: CAPTURE_VIEWPORT_HEIGHT,
    deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
    isMobile: false,
    hasTouch: false,
  };
}

export const PROBE_OPTIONS: ProbeOptions = {
  textKeyMaxChars: TEXT_KEY_MAX_CHARS,
  maxLeafBoxes: MAX_LEAF_BOXES,
  maxColumnContainers: MAX_COLUMN_CONTAINERS,
  rowClusterTolerancePx: ROW_CLUSTER_TOLERANCE_PX,
  minColumnContainerChildren: MIN_COLUMN_CONTAINER_CHILDREN,
  minLogoRowItems: MIN_LOGO_ROW_ITEMS,
  emptyBandRowPx: EMPTY_BAND_ROW_PX,
  logoRowPileExtentRatio: LOGO_ROW_PILE_EXTENT_RATIO,
  wideElementViewportFactor: WIDE_ELEMENT_VIEWPORT_FACTOR,
};

/**
 * The overlap sweep's budget, applied identically to both sides (WP-C guard 3).
 *
 * `maxOverlapComparisonsPerLeaf` is the same 2,000 the in-page sweep used, kept
 * so the numbers before and after the move are the same numbers.
 */
export const OVERLAP_BUDGET = {
  maxOverlapSamples: MAX_OVERLAP_SAMPLES,
  maxOverlapComparisonsPerLeaf: 2_000,
} as const;

export const CAPTURE_POLICY: CapturePolicy = {
  pinned: true,
  animationsDisabled: true,
  videosPaused: true,
  reducedMotion: OBSERVATION_REDUCED_MOTION,
  colorScheme: OBSERVATION_COLOR_SCHEME,
  locale: OBSERVATION_LOCALE,
  timezone: OBSERVATION_TIMEZONE,
  deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
  viewportHeight: CAPTURE_VIEWPORT_HEIGHT,
  waits:
    "goto(load) → markInitialPaintCensus → bounded networkidle → bounded fonts.ready → settle → 2 rAF (src/reconstruction-qa/capture-page.ts:stabilize) → normalizePageState → stepped scroll to the bottom → settle → scroll to top → settle",
  pageStateNormalized: true,
  pageStateNote:
    "TASK 28.75 item B7. Both sides run the OBSERVER'S OWN page-state normalization, from the one shared implementation in src/observer (markInitialPaintCensus immediately after goto, normalizePageState before the scroll and before any capture) — see docs/result/28.75/page-state-api-contract.md. Before this the observer dismissed entry popups and the QA source capture did not, so the two rendered the same URL into two different page states and the clone was charged missing-text-ratio for content the engine had deliberately removed. Running it on the CLONE side too is a check as much as a fix: a reconstruction whose source had its popup removed should have nothing here to dismiss, and the per-side record says whether it did.",
  scrollBeforeProbe: SCROLL_BEFORE_PROBE,
  scrollStepPx: SCROLL_STEP_PX,
  scrollMaxSteps: SCROLL_MAX_STEPS,
  scrollStepWaitMs: SCROLL_STEP_WAIT_MS,
  scrollBottomSettleMs: SCROLL_BOTTOM_SETTLE_MS,
  scrollTopSettleMs: SCROLL_TOP_SETTLE_MS,
  scrollNote:
    "Both sides are scrolled to the bottom in fixed steps with fixed waits and returned to the top BEFORE probing and screenshotting, so lazy-revealed content is inside every numeric channel on both sides rather than only in the PNG a human reviews. Each side reports how far it scrolled, how long it waited and how much content the scroll revealed.",
};

export interface CaptureSideInput {
  browser: Browser;
  url: string;
  width: number;
  /** Relative path recorded in the provenance; the caller writes the bytes. */
  screenshotFile: string;
  /**
   * TASK 28.75, item B7. Which side this is. It names the page-state evidence
   * directory and nothing else — the two sides run byte-identical code.
   */
  side?: "source" | "clone";
  /** Identifies the pair in the page-state evidence tree. */
  pageId?: string;
  /** Where page-state before/after PNGs are filed. Defaults to
   *  {@link QA_PAGE_STATE_EVIDENCE_ROOT}, which is outside `docs/result/`. */
  pageStateEvidenceRoot?: string;
  /**
   * Opt OUT of normalization. Exists for one purpose: the suite's negative
   * control, which has to be able to show the un-normalized page state the
   * defect produced. Production callers never set it.
   */
  normalizePageState?: boolean;
}

export interface CapturedSide {
  measurement: SideMeasurement;
  provenance: SideProvenance;
  screenshot: Buffer;
}

/** Pause every video and rewind it to its first frame. Recorded, not hidden. */
async function pinMedia(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const videos = document.querySelectorAll("video");
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as HTMLVideoElement;
        try {
          video.pause();
          video.currentTime = 0;
          video.autoplay = false;
          video.loop = false;
        } catch {
          // A cross-origin or not-yet-loaded video may refuse; the probe
          // reports how many actually ended up pinned.
        }
      }
    });
  } catch {
    // Never fail a capture because a page has hostile media.
  }
}

/** The three counters the scroll report compares before and after. */
interface ContentCensus {
  scrollHeight: number;
  visibleElements: number;
  visibleTextChars: number;
  imagesLoaded: number;
}

/** Serialized into the page. Cheap on purpose — it runs four times per capture. */
function censusInBrowser(): ContentCensus {
  const all = document.body.querySelectorAll("*");
  let visibleElements = 0;
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as Element;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) visibleElements++;
  }
  let visibleTextChars = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.nodeValue ?? "").replace(/[\s ]+/g, " ").trim();
    if (!text) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    // TASK 28.8 FAST (Phase F correction 2) — same rule as the probe census:
    // markup under <noscript>/<script>/<style>/<template> is never text.
    let markupAncestor = false;
    for (let a: Element | null = parent; a; a = a.parentElement) {
      const tag = a.tagName;
      if (tag === "NOSCRIPT" || tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") {
        markupAncestor = true;
        break;
      }
    }
    if (markupAncestor) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    visibleTextChars += text.length;
  }
  const images = document.querySelectorAll("img");
  let imagesLoaded = 0;
  for (let i = 0; i < images.length; i++) {
    const image = images[i] as HTMLImageElement;
    if (image.complete && image.naturalWidth > 0) imagesLoaded++;
  }
  return {
    scrollHeight: document.documentElement.scrollHeight,
    visibleElements,
    visibleTextChars,
    imagesLoaded,
  };
}

/**
 * Scroll the page to the bottom in fixed steps, let it settle, come back to the
 * top (Task 28.6, item C3.2).
 *
 * WHY THIS IS NOT OPTIONAL. `page.screenshot({ fullPage: true })` scrolls the
 * document as a side effect of stitching, so the PNG a reviewer looks at
 * already contains everything lazy loading reveals. The probe, run at scroll
 * position 0, did not. The instrument therefore disagreed with its own
 * evidence, in the one direction that matters: content a human can see and no
 * channel can. A pilot candidate for this very task serves 101 of its 102
 * images behind `loading="lazy"`.
 *
 * WHY FIXED STEPS AND FIXED WAITS. Symmetry beats cleverness here. An adaptive
 * "wait until the mutation observer goes quiet" would let the source (on a CDN,
 * over the network) and the clone (on localhost) wait for different lengths of
 * time, and every difference that produced would be charged to the clone. A
 * fixed policy is worse for any single page and correct for the COMPARISON,
 * which is the only thing this harness reports.
 *
 * WHY IT RETURNS TO THE TOP. The screenshot and the probe must see the same
 * geometry the pre-scroll capture saw, minus only the content the scroll
 * revealed; a sticky header measured mid-page is not the header.
 *
 * The cap is reported, never silent: a document longer than
 * `SCROLL_MAX_STEPS × SCROLL_STEP_PX` sets `stepsCapped` and records the depth
 * it actually reached.
 */
async function scrollThroughPage(page: Page): Promise<ScrollReport> {
  const before = (await page.evaluate(censusInBrowser)) as ContentCensus;
  // ITEM C3.13. `atBottom` is trivially true on the very first step of a
  // document no taller than the viewport, so a page that never rendered
  // (scrollHeight 900, 65 visible characters, deepest scroll 0) used to record
  // `reachedBottom: true` and was indistinguishable from a completed scroll of
  // a long page. `documentScrollable` is the floor: the bottom is only ASSERTED
  // to have been reached when there was something to scroll.
  const viewportHeight = page.viewportSize()?.height ?? CAPTURE_VIEWPORT_HEIGHT;
  const documentScrollable = before.scrollHeight > viewportHeight + 1;
  if (!SCROLL_BEFORE_PROBE) {
    return {
      applied: false,
      steps: 0,
      scrolledToPx: 0,
      reachedBottom: false,
      documentScrollable,
      viewportHeight,
      stepsCapped: false,
      waitedMs: 0,
      scrollHeightBefore: before.scrollHeight,
      scrollHeightAfter: before.scrollHeight,
      visibleElementsBefore: before.visibleElements,
      visibleElementsAfter: before.visibleElements,
      elementsRevealed: 0,
      visibleTextCharsBefore: before.visibleTextChars,
      visibleTextCharsAfter: before.visibleTextChars,
      textCharsRevealed: 0,
      imagesLoadedBefore: before.imagesLoaded,
      imagesLoadedAfter: before.imagesLoaded,
      imagesRevealed: 0,
    };
  }

  let steps = 0;
  let waitedMs = 0;
  let deepest = 0;
  let reachedBottom = false;
  for (let step = 1; step <= SCROLL_MAX_STEPS; step++) {
    const position = await page.evaluate((stepPx: number) => {
      window.scrollTo(0, window.scrollY + stepPx);
      return {
        scrollY: Math.round(window.scrollY),
        atBottom:
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 1,
      };
    }, SCROLL_STEP_PX);
    steps = step;
    if (position.scrollY > deepest) deepest = position.scrollY;
    await page.waitForTimeout(SCROLL_STEP_WAIT_MS);
    waitedMs += SCROLL_STEP_WAIT_MS;
    if (position.atBottom) {
      reachedBottom = true;
      break;
    }
  }
  await page.waitForTimeout(SCROLL_BOTTOM_SETTLE_MS);
  waitedMs += SCROLL_BOTTOM_SETTLE_MS;
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(SCROLL_TOP_SETTLE_MS);
  waitedMs += SCROLL_TOP_SETTLE_MS;
  const after = (await page.evaluate(censusInBrowser)) as ContentCensus;

  // A document that was never scrollable did not "reach the bottom" by
  // scrolling and was not "capped" either; both flags stay false and
  // `documentScrollable` says which case it is.
  const reachedBottomAsserted = reachedBottom && documentScrollable;
  return {
    applied: true,
    steps,
    scrolledToPx: deepest,
    reachedBottom: reachedBottomAsserted,
    documentScrollable,
    viewportHeight,
    stepsCapped: documentScrollable && !reachedBottomAsserted,
    waitedMs,
    scrollHeightBefore: before.scrollHeight,
    scrollHeightAfter: after.scrollHeight,
    visibleElementsBefore: before.visibleElements,
    visibleElementsAfter: after.visibleElements,
    elementsRevealed: after.visibleElements - before.visibleElements,
    visibleTextCharsBefore: before.visibleTextChars,
    visibleTextCharsAfter: after.visibleTextChars,
    textCharsRevealed: after.visibleTextChars - before.visibleTextChars,
    imagesLoadedBefore: before.imagesLoaded,
    imagesLoadedAfter: after.imagesLoaded,
    imagesRevealed: after.imagesLoaded - before.imagesLoaded,
  };
}

/**
 * Navigate, stabilize, pin, scroll-to-settle, probe, screenshot. Both sides
 * call exactly this.
 */
export async function captureSide(input: CaptureSideInput): Promise<CapturedSide> {
  const context = await newQaContext(input.browser, profileForWidth(input.width));
  let consoleErrors = 0;
  let pageErrors = 0;
  let httpStatus: number | null = null;
  try {
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors++;
    });
    page.on("pageerror", () => {
      pageErrors++;
    });
    page.on("response", (response) => {
      if (httpStatus === null && response.url() === input.url) {
        httpStatus = response.status();
      }
    });
    // Passive guards, the same ones the read-only sweeps used: never let a page
    // under measurement open a window, start a download or block on a dialog.
    page.context().on("page", (popup) => {
      if (popup !== page) void popup.close().catch(() => {});
    });
    page.on("download", (download) => {
      void download.cancel().catch(() => {});
    });
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => {});
    });

    const finalUrl = await gotoQa(page, input.url);
    // -- TASK 28.75, ITEM B7: the two-call page-state contract --------------
    //
    // CALL 1, IMMEDIATELY after the navigation resolves and BEFORE any settle.
    // `markInitialPaintCensus` parks two WeakSets recording what was painting
    // at the first paint; that is the only time-based discriminator the
    // normalizer has, and it is what powers the STRONG signal
    // `appeared-after-initial-paint` — the signal that separates an entry popup
    // which opened 350ms after load from a legitimate full-viewport hero that
    // was there all along. After a networkidle wait the popup is already
    // painted and the census would record it as original page furniture, so the
    // ordering is not a style preference, it is the contract
    // (docs/result/28.75/page-state-api-contract.md).
    const normalizeEnabled = input.normalizePageState ?? true;
    const initialPaint = normalizeEnabled
      ? await markInitialPaintCensus(page)
      : { usable: false, elements: 0, capHit: false };
    const settle = await stabilize(page);
    // CALL 2, before the scroll and before anything is captured. Before the
    // scroll for the same reason the observer does it there: scrolling a page
    // behind a modal that locks the page scroller measures nothing, and
    // capturing it bakes the popup into the evidence.
    //
    // RUN ON BOTH SIDES, DELIBERATELY. The source side is the FIX — it is the
    // side that was rendering a page state the observer had already dismissed.
    // The clone side is a CHECK: a reconstruction built from a normalized
    // observation should have no entry overlay left to dismiss, so `dismissed`
    // on the clone is expected to be 0 and a non-zero value is a fact about the
    // engine worth carrying. Running it on one side only would also break this
    // module's founding rule — both sides are measured by literally the same
    // code — and would replace one asymmetry with another.
    const pageState = normalizeEnabled
      ? await normalizePageState(page, {
          observationUrl: input.url,
          viewportId: `w${input.width}-${input.side ?? "side"}`,
          pageId: input.pageId ?? "pair",
          evidenceRoot: input.pageStateEvidenceRoot ?? QA_PAGE_STATE_EVIDENCE_ROOT,
        })
      : undefined;
    await pinMedia(page);
    const scroll = await scrollThroughPage(page);
    // Media that only started once it was scrolled into view is pinned again;
    // the probe reports how many videos ended up actually pinned either way.
    await pinMedia(page);
    const probed = (await page.evaluate(probeInBrowser, PROBE_OPTIONS)) as ProbeResult;
    // WP-C guard 3. The overlap accounting runs HERE rather than in the page,
    // on the very leaf array the probe just returned. Same boxes, same
    // traversal, same totals — and the one judgement it makes ("same picture
    // twice, or two different things collided?") is now an ordinary function
    // an ordinary test can reach.
    const measurement: SideMeasurement = {
      ...probed,
      ...computeOverlapAccounting(probed.leaves, {
        ...OVERLAP_BUDGET,
        innerWidth: probed.innerWidth,
        innerHeight: probed.innerHeight,
      }),
    };
    const screenshot = await page.screenshot({
      fullPage: true,
      type: "png",
      animations: "disabled",
    });
    const capturedAt = new Date().toISOString();
    return {
      measurement,
      screenshot,
      provenance: {
        url: input.url,
        finalUrl,
        capturedAt,
        networkIdleReached: settle.networkIdleReached,
        fontsReadyReached: settle.fontsReadyReached,
        screenshotFile: input.screenshotFile,
        screenshotBytes: screenshot.length,
        httpStatus,
        consoleErrors,
        pageErrors,
        scroll,
        pageState: {
          ran: pageState?.ran ?? false,
          initialPaintCensusAvailable: pageState?.initialPaintCensusAvailable ?? false,
          initialPaintCensusStatus:
            pageState?.initialPaintCensusStatus ??
            (normalizeEnabled ? "unreadable" : "absent"),
          initialPaintCensusElements: initialPaint.elements,
          initialPaintCensusCapHit: initialPaint.capHit,
          qualified: pageState?.qualified ?? 0,
          dismissed: pageState?.dismissed ?? 0,
          // The number comparability turns on. `qualified` counts overlays that
          // cleared the evidence bar; `dismissed` counts the ones actually
          // taken down. The difference is what is STILL STANDING in the
          // capture, and on the source side that is the condition under which
          // the text channels must declare themselves not comparable rather
          // than charge the clone.
          qualifiedNotDismissed: Math.max(
            0,
            (pageState?.qualified ?? 0) - (pageState?.dismissed ?? 0),
          ),
          attemptCapHit: pageState?.attemptCapHit ?? false,
          attempts: (pageState?.attempts ?? []).map((attempt) => ({
            domPath: attempt.domPath,
            shapeClass: attempt.shapeClass,
            method: attempt.method,
            outcome: attempt.outcome,
            signals: [...attempt.signals],
            ...(attempt.closeControlLabel !== undefined
              ? { closeControlLabel: attempt.closeControlLabel }
              : {}),
          })),
          limitations: [...(pageState?.limitations ?? [])],
        } satisfies PageStateRecord,
      },
    };
  } catch (err) {
    throw new ResponsiveQaInfrastructureError(
      `capture failed for ${input.url} @${input.width}: ${
        err instanceof Error ? err.message.split("\n", 1)[0] : String(err)
      }`,
    );
  } finally {
    await context.close().catch(() => {});
  }
}
