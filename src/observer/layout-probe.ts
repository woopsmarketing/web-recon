import type { Browser, Page } from "playwright";
import {
  DESKTOP_PROFILE,
  LAYOUT_PROBE_HEIGHT,
  LAYOUT_PROBE_SETTLE_MS,
  LAYOUT_PROBE_WIDTHS,
  MAX_LAYOUT_PROBE_ELEMENTS,
  MAX_PROBE_ATTEMPTS,
  DOCUMENT_NAV_RETRY_BACKOFF_MS,
  NAV_TIMEOUT_MS,
  PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH,
  NETWORK_IDLE_TIMEOUT_MS,
  PROBE_DOCUMENT_STARVATION_RATIO,
  PREPARE_SCROLL_MAX_RECOVERY_NAVIGATIONS,
  PREPARE_SCROLL_MAX_RETRIES,
  PREPARE_SCROLL_RECOVERY_LOAD_TIMEOUT_MS,
  PREPARE_SCROLL_RECOVERY_SETTLE_MS,
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  SCHEMA_VERSION,
  SCROLL_MAX_DISTANCE_PX,
  SCROLL_MAX_STEPS,
  SCROLL_MAX_TOTAL_MS,
  SCROLL_NO_PROGRESS_TOLERANCE,
  SCROLL_REVEAL_OPACITY_THRESHOLD,
  SCROLL_REVEAL_STATE_KEY,
  MAX_SCROLL_REVEAL_CANDIDATES,
  SCROLL_STEP_FRACTION,
  SCROLL_STEP_SETTLE_MS,
  SKIP_TAGS,
  MAX_EXTRA_PROBE_WIDTHS,
  MAX_FAMILY_BISECTION_PAIRS,
  MAX_FAMILY_BISECTION_STEPS,
  MAX_PROBE_WIDTH,
  MIN_PROBE_WIDTH,
  type DocumentResponse,
  type FamilySwitchBisection,
  type LayoutProbe,
  type LayoutProbeFingerprint,
  type LayoutProbeCoverage,
  type LayoutProbeWidth,
  type PrepareScrollNavigation,
  type PrepareScrollStatus,
  type ProbeWidthProvenance,
  type ScrollReveal,
  type ViewportProfile,
} from "./types.js";
import { withOperatorWidths } from "./probe-widths.js";
import { navigateMainDocument } from "./navigate-document.js";
import {
  PageNavigatedDuringScrollError,
  isSameObservedDocument,
  isScrollNavigationInterruption,
} from "./navigation-errors.js";

/*
 * ---------------------------------------------------------------------------
 * Task 28.6 C2 B4 — SCROLL-REVEAL MEASUREMENT (in-page halves)
 * ---------------------------------------------------------------------------
 *
 * The preparation auto-scroll ends by returning to the top, because geometry is
 * captured at scroll 0 and the whole pipeline depends on that. On a site whose
 * scroll-animation library runs in RE-HIDE mode, the return-to-top puts the
 * majority of the document back to `opacity: 0`: the reconstruction ships BLANK
 * and screenshot-diff QA passes it blank-against-blank.
 *
 * MEASURED BY THIS LANE (Task 28.6 C2, homepage, 1440×900 desktop):
 *   mystarskin.co.kr    983 observed elements, 327 SIZED, 141 of them (43%)
 *                       painting nothing, ALL 141 below the fold; 21 of those
 *                       are proven reveal regressions — the probe watched them
 *                       reach a visible opacity during the scroll and drop back
 *                       to 0 after the return-to-top (an AOS `aos-init` set).
 *                       Those four desktop figures were stable across three
 *                       runs. The MOBILE figures are NOT: across the same three
 *                       runs sizedElements held at 373 while suppressed read
 *                       116 / 107 / 116 and regressions 20 / 15 / 18. Mobile is
 *                       a range, not a number, because how far the scroll gets
 *                       before the caps bite varies with load timing.
 *   interiorteacher.com 655 sized elements, 0 suppressed, 8 reveal candidates,
 *                       8 revealed, 0 regressed. The NEGATIVE CONTROL: a site
 *                       that animates once is measured and left alone.
 * The Task 28.6 scout's mystarskin figure ("~4,000 of 6,157") counts PIXELS at
 * `opacity: 0`; the figures above count ELEMENTS. This lane did not re-measure
 * blanked pixels, so the scout's number is neither confirmed nor refuted here.
 *
 * So the condition is DETECTED, never assumed, and the page is never altered.
 * Candidates are the elements a `class`/`style` mutation touched during the
 * scroll — every scroll-animation library writes one of those to reveal, and
 * writes it again to re-hide — sampled after each step for the highest opacity
 * they reach, then re-measured once the scroll has returned to the top.
 *
 * These three functions are serialized into the page by `page.evaluate`, so they
 * may reference only their argument and browser globals.
 */

interface RevealProbeState {
  candidates: Element[];
  seen: WeakSet<Element>;
  everVisible: boolean[];
  maxOpacity: number[];
  capHit: boolean;
  samples: number;
  observer: MutationObserver | null;
  /** Filled by the finish pass; read by the collector to mark elements. */
  regressed: Element[];
  regressedOpacity: number[];
}

function installRevealProbeInBrowser(arg: {
  key: string;
  maxCandidates: number;
}): void {
  const store = window as unknown as Record<string, unknown>;
  const state: RevealProbeState = {
    candidates: [],
    seen: new WeakSet<Element>(),
    everVisible: [],
    maxOpacity: [],
    capHit: false,
    samples: 0,
    observer: null,
    regressed: [],
    regressedOpacity: [],
  };
  const add = (el: Element): void => {
    if (state.seen.has(el)) return;
    if (state.candidates.length >= arg.maxCandidates) {
      state.capHit = true;
      return;
    }
    state.seen.add(el);
    state.candidates.push(el);
    state.everVisible.push(false);
    state.maxOpacity.push(-1);
  };
  try {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        if (target && target.nodeType === 1) add(target);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
      subtree: true,
    });
    state.observer = observer;
  } catch {
    state.observer = null;
  }
  store[arg.key] = state;
}

function sampleRevealProbeInBrowser(arg: { key: string; threshold: number }): void {
  const store = window as unknown as Record<string, unknown>;
  const state = store[arg.key] as RevealProbeState | undefined;
  if (!state) return;
  state.samples++;
  for (let i = 0; i < state.candidates.length; i++) {
    // Already seen fully opaque: nothing further to learn, and skipping it is
    // what keeps a 4,000-candidate page cheap across 40 steps.
    if (state.maxOpacity[i]! >= 0.999) continue;
    const el = state.candidates[i]!;
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    const raw = parseFloat(cs.opacity || "1");
    const opacity = raw >= 0 && raw <= 1 ? raw : 1;
    if (opacity > state.maxOpacity[i]!) state.maxOpacity[i] = opacity;
    if (state.everVisible[i]) continue;
    if (cs.display === "none" || cs.visibility !== "visible") continue;
    if (opacity < arg.threshold) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) state.everVisible[i] = true;
  }
}

function finishRevealProbeInBrowser(arg: { key: string; threshold: number }): {
  candidates: number;
  candidateCapHit: boolean;
  samples: number;
  revealedDuringScroll: number;
  regressedAfterReturn: number;
  regressedBelowFold: number;
  revealedThenRemoved: number;
  revealedBelowFull: number;
  opacityThreshold: number;
} {
  const store = window as unknown as Record<string, unknown>;
  const state = store[arg.key] as RevealProbeState | undefined;
  if (!state) {
    return {
      candidates: 0,
      candidateCapHit: false,
      samples: 0,
      revealedDuringScroll: 0,
      regressedAfterReturn: 0,
      regressedBelowFold: 0,
      revealedThenRemoved: 0,
      revealedBelowFull: 0,
      opacityThreshold: arg.threshold,
    };
  }
  if (state.observer) {
    try {
      state.observer.disconnect();
    } catch {
      /* already gone */
    }
    state.observer = null;
  }
  const viewportHeight = window.innerHeight;
  let revealed = 0;
  let regressed = 0;
  let belowFold = 0;
  let removed = 0;
  // Task 28.6 C3 D2 — how many marks carry a revealedOpacity BELOW full. The
  // probe samples once per scroll step, so an element still mid-fade at its
  // last sample records the opacity it REACHED, not the reveal target: the
  // value is a sampling floor and a consumer that restores it verbatim renders
  // that element translucent. Counted so the consumer can see how many.
  let belowFull = 0;
  for (let i = 0; i < state.candidates.length; i++) {
    if (!state.everVisible[i]) continue;
    revealed++;
    const el = state.candidates[i]!;
    if (!el.isConnected) {
      // Gone from the document entirely. A real loss, but a different one from
      // blanking, so it is counted separately and never mixed in.
      removed++;
      continue;
    }
    const cs = getComputedStyle(el);
    const raw = parseFloat(cs.opacity || "1");
    const opacity = raw >= 0 && raw <= 1 ? raw : 1;
    const hidden =
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      cs.visibility === "collapse" ||
      opacity < arg.threshold;
    if (!hidden) continue;
    regressed++;
    const rect = el.getBoundingClientRect();
    if (rect.top >= viewportHeight) belowFold++;
    state.regressed.push(el);
    const reached = state.maxOpacity[i]! >= 0 ? state.maxOpacity[i]! : 1;
    if (reached < 1) belowFull++;
    state.regressedOpacity.push(reached);
  }
  return {
    candidates: state.candidates.length,
    candidateCapHit: state.capHit,
    samples: state.samples,
    revealedDuringScroll: revealed,
    regressedAfterReturn: regressed,
    regressedBelowFold: belowFold,
    revealedThenRemoved: removed,
    revealedBelowFull: belowFull,
    opacityThreshold: arg.threshold,
  };
}

export interface AutoScrollResult {
  steps: number;
  distancePx: number;
  /**
   * Task 28.7 A1 — how the scroll ENDED. Always present. A navigation during
   * the scroll can never make this function throw, so the caller always gets a
   * result and the observation always completes.
   */
  status: PrepareScrollStatus;
  /** Present only when a navigation interrupted the scroll. */
  navigation?: PrepareScrollNavigation;
  /**
   * Task 28.6 C2 B4 — the finish pass, present only when `measureReveal` was
   * requested. The CALLER runs it, AFTER its own settle, because the re-hide is
   * a CSS transition: a finish pass run immediately after the return-to-top
   * measures the page mid-fade and under-reports. It must describe the state the
   * COLLECTOR will record, which is the state after the observation's settle.
   *
   * MEASURED on mystarskin.co.kr desktop: finishing at +250 ms found 2
   * regressed elements; finishing after the observation's own 1,200 ms settle
   * found 21 — the same 21 the collector then records at `opacity: 0`.
   */
  finishReveal?: () => Promise<ScrollReveal | undefined>;
}

export interface AutoScrollOptions {
  /**
   * Measure which elements the scroll REVEALED and the return-to-top re-hid,
   * and park the regressed ones on {@link SCROLL_REVEAL_STATE_KEY} for the
   * collector. Read-only: it computes styles, it never writes to the page, so a
   * load that measures and a load that does not end in the SAME page state and
   * the probe↔observation scroll parity is untouched.
   */
  measureReveal?: boolean;
  /**
   * Task 28.7 A1 — the URL this observation is FOR.
   *
   * A page that navigates mid-scroll leaves the scroll stepping a document that
   * is not the one under observation. With this set, the recovery can navigate
   * ONCE back to it and retry; without it, a navigation still cannot throw —
   * the scroll simply stops and records `prepare-scroll-navigated-fallback`.
   */
  observationUrl?: string;
  /** Progress/limitation log. */
  onLog?: (message: string) => void;
}

/** First line of an error message, length-capped for the artifact. */
function shortErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.split("\n", 1)[0]!.trim();
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

/**
 * ONE downward scroll pass. Throws on a destroyed execution context — the
 * caller decides what that means. Extracted from {@link autoScrollPrepare} so
 * the recovery can run the SAME pass again without a second copy of the policy.
 */
async function runScrollPass(
  page: Page,
  measure: boolean,
  observationUrl?: string,
): Promise<{ steps: number; distance: number }> {
  const start = Date.now();
  let steps = 0;
  let distance = 0;
  let stalls = 0;
  /*
   * Task 28.75 — WHY THIS IS THREE STATEMENTS RATHER THAN ONE.
   *
   * THE DEFECT. This used to issue `window.scrollBy(0, step)` and read
   * `window.scrollY` in the SAME evaluate, then `break` when the difference was
   * `<= 0`. Under `html { scroll-behavior: smooth }` — which is one CSS
   * declaration, on a great many sites — `scrollBy` is ASYNCHRONOUS: it starts
   * an animation and returns. The synchronous read therefore always saw zero
   * movement, the loop broke on step 1, and THE OBSERVER NEVER SCROLLED THE PAGE
   * AT ALL. On seoultone.kr that meant ScrollReveal never fired below the fold,
   * so the collector recorded `opacity: 0` for the doctor-credential block and
   * four section headings and the clone shipped them blank.
   *
   * THE FIX, in three parts:
   *  1. Scroll with `scrollTo({ behavior: "instant" })` — an explicit behaviour
   *     that overrides the page's own `scroll-behavior`, so the jump is
   *     synchronous no matter what the stylesheet says.
   *  2. Measure progress from a SECOND evaluate taken AFTER the settle wait, so
   *     an animated or deferred scroll is measured once it has landed.
   *  3. Tolerate {@link SCROLL_NO_PROGRESS_TOLERANCE} consecutive stalls instead
   *     of breaking on the first.
   *
   * The bottom check uses the post-settle reading too, because a page that grows
   * as it loads has a different `scrollHeight` after the dwell than before it.
   */
  const readPosition = (): Promise<{
    y: number;
    innerHeight: number;
    scrollHeight: number;
  }> =>
    page.evaluate(() => ({
      y: window.scrollY,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));

  while (
    steps < SCROLL_MAX_STEPS &&
    distance < SCROLL_MAX_DISTANCE_PX &&
    Date.now() - start < SCROLL_MAX_TOTAL_MS
  ) {
    const before = await readPosition();
    await page.evaluate((frac) => {
      const step = Math.max(1, Math.floor(window.innerHeight * frac));
      // `behavior: "instant"` is the whole point: it beats a page-authored
      // `html { scroll-behavior: smooth }`, which makes the plain form async.
      window.scrollTo({
        top: window.scrollY + step,
        left: 0,
        behavior: "instant",
      });
    }, SCROLL_STEP_FRACTION);
    steps++;
    await page.waitForTimeout(SCROLL_STEP_SETTLE_MS);
    /*
     * Task 28.7 A1 — DOCUMENT IDENTITY CHECK, every step.
     *
     * Playwright throws only when a navigation lands inside an in-flight
     * evaluate. A scroll-triggered navigation that completes during the step
     * settle above throws NOTHING: the next evaluate runs against the new
     * document and the scroll keeps stepping — and the observation then collects
     * — a page that is not the one under observation. Catching that quiet case
     * matters more than catching the loud one.
     */
    if (observationUrl !== undefined) {
      let here: string | undefined;
      try {
        here = page.url();
      } catch {
        here = undefined;
      }
      if (here !== undefined && !isSameObservedDocument(here, observationUrl)) {
        throw new PageNavigatedDuringScrollError(here);
      }
    }
    if (measure) {
      await page
        .evaluate(sampleRevealProbeInBrowser, {
          key: SCROLL_REVEAL_STATE_KEY,
          threshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
        })
        .catch(() => {});
    }
    // --- progress, measured AFTER the settle (see the note above) ----------
    const after = await readPosition();
    const moved = after.y - before.y;
    distance += Math.max(0, moved);
    if (moved <= 0) {
      stalls++;
      if (stalls >= SCROLL_NO_PROGRESS_TOLERANCE) break;
    } else {
      stalls = 0;
    }
    if (after.y + after.innerHeight >= after.scrollHeight - 2) break;
  }
  return { steps, distance };
}

/** Install the read-only reveal probe. Never fatal. */
async function installRevealProbe(page: Page): Promise<void> {
  await page
    .evaluate(installRevealProbeInBrowser, {
      key: SCROLL_REVEAL_STATE_KEY,
      maxCandidates: MAX_SCROLL_REVEAL_CANDIDATES,
    })
    .catch(() => {});
}

/**
 * Read-only preparation auto-scroll (Task 05). Lives here so both the deep
 * observation and the layout probe run the SAME scroll policy — the probe's
 * contract is that the page under it is the page the Observer saw, and a page
 * that lazy-mounts content on scroll only satisfies that when both loads
 * scrolled the same way (Task 26 generic correction).
 *
 * TASK 28.7 A1 — NAVIGATION SAFETY. This function NEVER throws. A page that
 * navigates while the scroll is stepping destroys the execution context every
 * step evaluates in; before 28.7 that throw escaped `stabilize()` →
 * `observeViewport()` → `observePageWithBrowser()` and the page was filed as an
 * `observation-error` with NO observation, which then took the whole
 * reconstruction down (`route-plan` throws when a route has no
 * `renderSourcePageId`).
 *
 * The recovery is deliberately tiny:
 *   navigation detected
 *     → wait (bounded) for the intruding navigation to reach `load`
 *     → if the page left the observed document, `goto` back to it ONCE
 *     → re-settle, reinstall the read-only reveal probe and the `__name` shim
 *     → retry the scroll ONCE
 *     → a second navigation stops everything and falls back
 * and every outcome is a recorded {@link PrepareScrollStatus}, never an
 * exception.
 */
export async function autoScrollPrepare(
  page: Page,
  options: AutoScrollOptions = {},
): Promise<AutoScrollResult> {
  const measure = options.measureReveal === true;
  const log = options.onLog ?? ((): void => {});
  const observationUrl = options.observationUrl;
  if (measure) await installRevealProbe(page);

  let steps = 0;
  let distance = 0;
  let status: PrepareScrollStatus = "prepare-scroll-complete";
  let navigation: PrepareScrollNavigation | undefined;

  try {
    const first = await runScrollPass(page, measure, observationUrl);
    steps = first.steps;
    distance = first.distance;
  } catch (err) {
    if (!isScrollNavigationInterruption(err)) {
      // NOT a navigation. Recorded and swallowed all the same: an observation
      // must never be lost to a failed preparation step.
      status = "prepare-scroll-failed-fallback";
      navigation = {
        observationUrl: observationUrl ?? page.url(),
        leftObservedDocument: false,
        recoveryNavigated: false,
        retryAttempted: false,
        retryNavigated: false,
        restoreNavigated: false,
        limitation:
          "the preparation scroll failed for a non-navigation reason; the " +
          "observation continues against the unscrolled/partial state",
        error: shortErrorMessage(err),
      };
      log(`[prepare-scroll] ${status} — ${shortErrorMessage(err)}`);
    } else {
      // --- a navigation destroyed the scroll's execution context -----------
      const originalError = shortErrorMessage(err);
      // Let the intruding navigation finish before reading anything off the
      // page; a URL read mid-navigation is not a fact about anything.
      await page
        .waitForLoadState("load", {
          timeout: PREPARE_SCROLL_RECOVERY_LOAD_TIMEOUT_MS,
        })
        .catch(() => {});
      await page.waitForTimeout(PREPARE_SCROLL_RECOVERY_SETTLE_MS);
      let navigatedUrl: string | undefined;
      if (err instanceof PageNavigatedDuringScrollError) {
        navigatedUrl = err.navigatedUrl;
      }
      try {
        navigatedUrl = page.url();
      } catch {
        // Keep whatever the sentinel carried.
      }
      const target = observationUrl ?? navigatedUrl ?? "";
      const leftObservedDocument =
        navigatedUrl !== undefined && target !== ""
          ? !isSameObservedDocument(navigatedUrl, target)
          : navigatedUrl === undefined;

      let recoveryNavigated = false;
      let retryAttempted = false;
      let retryNavigated = false;
      let restoreNavigated = false;
      let recoveryError: string | undefined;

      // ONE re-navigation back to the page under observation, and only when we
      // actually know which page that is and we actually left it.
      let safeToRetry = !leftObservedDocument;
      if (
        leftObservedDocument &&
        observationUrl !== undefined &&
        PREPARE_SCROLL_MAX_RECOVERY_NAVIGATIONS > 0
      ) {
        try {
          await page.goto(observationUrl, {
            waitUntil: "load",
            timeout: NAV_TIMEOUT_MS,
          });
          // The reload threw away the `__name` shim every serialized function
          // depends on; it must go back on before anything else evaluates.
          await installNameShim(page).catch(() => {});
          await page.waitForTimeout(PREPARE_SCROLL_RECOVERY_SETTLE_MS);
          recoveryNavigated = true;
          safeToRetry = true;
        } catch (navErr) {
          recoveryError = shortErrorMessage(navErr);
          safeToRetry = false;
        }
      }

      if (safeToRetry && PREPARE_SCROLL_MAX_RETRIES > 0) {
        retryAttempted = true;
        // The reload also threw away the read-only reveal probe; it has to be
        // reinstalled or the retry measures nothing.
        if (recoveryNavigated && measure) await installRevealProbe(page);
        try {
          const retry = await runScrollPass(page, measure, observationUrl);
          // The retry is the pass that describes the page, so its figures are
          // the ones reported: a partial first pass on a document we then left
          // is not a measurement of anything.
          steps = retry.steps;
          distance = retry.distance;
          status = "prepare-scroll-navigated-recovered";
        } catch (retryErr) {
          retryNavigated = isScrollNavigationInterruption(retryErr);
          status = "prepare-scroll-navigated-fallback";
          recoveryError = recoveryError ?? shortErrorMessage(retryErr);
        }
      } else {
        status = "prepare-scroll-navigated-fallback";
      }

      /*
       * FINAL RESTORE. Whatever happened above, the page must END on the
       * document under observation: the collection that follows describes
       * whatever is loaded here, and observing a DIFFERENT page is a worse
       * defect than the lost route A1 removes.
       *
       * It is NOT a second recovery attempt — nothing is scrolled after it and
       * no retry follows — and it is recorded separately so the artifact never
       * conflates "we recovered and retried" with "we merely put the right page
       * back".
       */
      if (observationUrl !== undefined) {
        let here: string | undefined;
        try {
          here = page.url();
        } catch {
          here = undefined;
        }
        if (here === undefined || !isSameObservedDocument(here, observationUrl)) {
          try {
            await page.goto(observationUrl, {
              waitUntil: "load",
              timeout: NAV_TIMEOUT_MS,
            });
            await installNameShim(page).catch(() => {});
            await page.waitForTimeout(PREPARE_SCROLL_RECOVERY_SETTLE_MS);
            restoreNavigated = true;
          } catch (restoreErr) {
            recoveryError = recoveryError ?? shortErrorMessage(restoreErr);
          }
        }
      }

      navigation = {
        ...(navigatedUrl !== undefined ? { navigatedUrl } : {}),
        observationUrl: target,
        leftObservedDocument,
        recoveryNavigated,
        retryAttempted,
        retryNavigated,
        restoreNavigated,
        limitation:
          status === "prepare-scroll-navigated-recovered"
            ? "the page navigated during the preparation scroll; the observation " +
              "returned to the URL under observation and completed a bounded retry"
            : "the page navigated during the preparation scroll and the bounded " +
              "recovery did not produce a clean retry; the observation " +
              "continues against the unscrolled/partial state, so lazy content " +
              "that only mounts on scroll may be missing",
        error: recoveryError ?? originalError,
      };
      log(
        `[prepare-scroll] ${status} — navigated to ` +
          `${navigatedUrl ?? "(unknown)"} (observing ${target})`,
      );
    }
  }

  // The return-to-top is not optional (geometry is captured at scroll 0) but it
  // must not be able to throw either — and neither may the wait after it.
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page
    .waitForTimeout(SCROLL_STEP_SETTLE_MS)
    .catch(
      () =>
        new Promise<void>((resolve) => setTimeout(resolve, SCROLL_STEP_SETTLE_MS)),
    );
  return {
    steps,
    distancePx: Math.round(distance),
    status,
    ...(navigation ? { navigation } : {}),
    ...(measure
      ? {
          finishReveal: (): Promise<ScrollReveal | undefined> =>
            page
              .evaluate(finishRevealProbeInBrowser, {
                key: SCROLL_REVEAL_STATE_KEY,
                threshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
              })
              .catch(() => undefined),
        }
      : {}),
  };
}

/**
 * Multi-viewport lightweight layout probe (Task 17 §8).
 *
 * The two truth viewports keep their full deep observation; this probe answers
 * ONE question those cannot: how does each element's box respond as the
 * viewport width moves? It is deliberately not a deep observation — no styles,
 * no attributes, no text, no screenshot — just x / width / visibility per
 * element per width, which is exactly the input the layout-rule inference
 * (§9) needs to tell a centered max-width container from a left-anchored
 * fixed one.
 *
 * Identity across widths is the DOM's own: the page is loaded ONCE at the
 * desktop truth width, the walk (Observer skip policy, `<svg>` opaque) parks
 * element references, and each probe width is applied with `setViewportSize`
 * and re-measured against the SAME references. A page whose script replaces
 * nodes on resize shows up as a `disconnected` count, never as silently wrong
 * geometry. The walk's tag sequence is recorded so a consumer can align the
 * probe against a `dom.json` walk by exact comparison — or refuse to.
 */

const PROBE_STATE_KEY = "__webReconLayoutProbe";

interface ProbeWalkResult {
  tags: string[];
  parents: number[];
  truncated: boolean;
  finalUrl: string;
}

function walkInBrowser(arg: {
  key: string;
  skipTags: string[];
  maxElements: number;
}): ProbeWalkResult {
  const store = window as unknown as Record<string, unknown>;
  const skip = new Set(arg.skipTags);
  const elements: Element[] = [];
  const tags: string[] = [];
  const parents: number[] = [];
  let truncated = false;

  const walk = (el: Element, parentIndex: number): void => {
    if (skip.has(el.tagName)) return;
    if (elements.length >= arg.maxElements) {
      truncated = true;
      return;
    }
    const index = elements.length;
    elements.push(el);
    tags.push(el.tagName.toLowerCase());
    parents.push(parentIndex);
    if (el.tagName.toLowerCase() === "svg") return;
    for (const child of Array.from(el.children)) walk(child, index);
  };
  walk(document.documentElement, -1);
  store[arg.key] = { elements };
  return { tags, parents, truncated, finalUrl: document.location.href };
}

/*
 * ---------------------------------------------------------------------------
 * TASK 28.7 §27 — THE DOM-FAMILY FINGERPRINT
 * ---------------------------------------------------------------------------
 *
 * WHY IT EXISTS. Everything else this probe records is measured on the elements
 * it PARKED at its walk width. That is the right shape for "where did this box
 * go", and it is the wrong shape for "which tree is this width rendering":
 * `tree-switch.ts` inferred the second from the first, a CSS reflow and a
 * served-variant swap move geometry identically, and so `domSwitchWidthObserved`
 * was hardcoded `false` on every path. This walks the LIVE document once more in
 * the SAME `page.evaluate` — same round trip, same settled layout, no second page
 * load and no second resize — and reports which family that width renders.
 *
 * `rendered` is `getClientRects().length > 0`: generates layout boxes, i.e. not
 * `display: none` and no ancestor `display: none`. It is deliberately NOT the
 * Observer's visibility rule — `visibility: hidden` and `opacity: 0` are paint
 * facts and leave an element in the family — and it deliberately avoids
 * `getComputedStyle`, which is what makes it cheap enough for 16 widths.
 *
 * The structure hash is FNV-1a over `depth:tag` for rendered elements down to
 * {@link PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH}, so a variant swap that holds
 * both counts is still caught while an incidental deep mutation between two
 * samples is not mistaken for one.
 *
 * IT LIVES INSIDE `measureInBrowser`. `page.evaluate` serializes ONE function and
 * nothing its module scope closes over, so a helper defined beside it is
 * `ReferenceError: not defined` in the page. Inlining is the price of taking the
 * fingerprint in the SAME round trip as the geometry rather than in a second one.
 */
function measureInBrowser(arg: {
  key: string;
  skipTags: string[];
  maxElements: number;
  maxDepth: number;
  /** Responsive Core P0 §C1.6 — bisection steps need the fingerprint only. */
  fingerprintOnly?: boolean;
  /** Responsive Core P0 §C1.3 — normalized `style` text kept per table entry. */
  styleTextMaxLen?: number;
}): {
  x: number[];
  w: number[];
  v: (0 | 1)[];
  disconnected: number;
  documentWidth: number;
  fingerprint: {
    elements: number;
    rendered: number;
    structure: string;
    truncated: boolean;
  };
  /** Responsive Core P0 §C1.3 — per element index into `sTable`, -1 = none. */
  s: number[];
  sTable: string[];
} {
  const store = window as unknown as Record<string, unknown>;
  const state = store[arg.key] as { elements: Element[] } | undefined;
  const round = (n: number): number => Math.round(n * 100) / 100;
  const x: number[] = [];
  const w: number[] = [];
  const v: (0 | 1)[] = [];
  let disconnected = 0;
  const s: number[] = [];
  const sTable: string[] = [];
  const sIndex: Record<string, number> = Object.create(null) as Record<string, number>;
  const styleTextMaxLen = arg.styleTextMaxLen ?? 2000;
  /*
   * Responsive Core P0 §C1.3 — the element's `style` ATTRIBUTE at this width,
   * whitespace-normalized. A text longer than the cap keeps a prefix plus its
   * full length and an FNV-1a hash, so two different long styles can never
   * collapse into one table entry.
   */
  const normalizeStyle = (raw: string | null): string | null => {
    if (raw === null) return null;
    const text = raw.replace(/\s+/g, " ").trim();
    if (text === "") return null;
    if (text.length <= styleTextMaxLen) return text;
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (
      text.slice(0, styleTextMaxLen) +
      "…#" +
      String(text.length) +
      "#" +
      (hash >>> 0).toString(16)
    );
  };
  for (const el of arg.fingerprintOnly ? [] : (state?.elements ?? [])) {
    if (!el.isConnected) {
      disconnected++;
      x.push(0);
      w.push(0);
      v.push(0);
      s.push(-1);
      continue;
    }
    const styleText = normalizeStyle(el.getAttribute("style"));
    if (styleText === null) {
      s.push(-1);
    } else {
      let index = sIndex[styleText];
      if (index === undefined) {
        index = sTable.length;
        sTable.push(styleText);
        sIndex[styleText] = index;
      }
      s.push(index);
    }
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    x.push(round(rect.x));
    w.push(round(rect.width));
    v.push(
      style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        rect.width > 0 &&
        rect.height > 0
        ? 1
        : 0,
    );
  }
  return {
    x,
    w,
    v,
    s,
    sTable,
    disconnected,
    documentWidth: round(document.documentElement.scrollWidth),
    fingerprint: (() => {
      const skip = new Set(arg.skipTags);
      let elements = 0;
      let rendered = 0;
      let truncated = false;
      // FNV-1a, 32-bit. Four lines, no dependency, and compared only for
      // equality — this is a change detector, not a digest.
      let hash = 0x811c9dc5;
      const walk = (el: Element, depth: number): void => {
        if (skip.has(el.tagName)) return;
        if (elements >= arg.maxElements) {
          truncated = true;
          return;
        }
        elements++;
        let boxes = 0;
        try {
          boxes = el.getClientRects().length;
        } catch {
          boxes = 0;
        }
        if (boxes > 0) {
          rendered++;
          if (depth <= arg.maxDepth) {
            const text = depth + ":" + el.tagName.toLowerCase() + ";";
            for (let i = 0; i < text.length; i++) {
              hash ^= text.charCodeAt(i);
              hash = Math.imul(hash, 0x01000193) >>> 0;
            }
          }
        }
        // The walk's own `<svg>` cut, mirrored: an SVG's internal element census
        // is an authoring detail, and descending into one at every width would
        // multiply the cost on an icon-heavy page for no family evidence.
        if (el.tagName.toLowerCase() === "svg") return;
        for (const child of Array.from(el.children)) walk(child, depth + 1);
      };
      walk(document.documentElement, 0);
      return { elements, rendered, structure: (hash >>> 0).toString(16), truncated };
    })(),
  };
}

/*
 * Responsive Core P0 §C1.6 — THE FAMILY-CHANGE PREDICATE, DUPLICATED ON PURPOSE.
 *
 * The authority is `familyChangeVerdict` in `src/reconstruction/tree-switch.ts`
 * (with `FAMILY_CHANGE_MIN_RATIO` / `FAMILY_CHANGE_MIN_ELEMENTS`). That module
 * imports reconstruction code, and the observer must not depend on the
 * reconstruction, so the pure predicate is copied here verbatim.
 * `scripts/smoke-multi-observer.ts` asserts the two agree on a table of cases,
 * so a drift goes red instead of silently bisecting with a different rule.
 */
export const OBSERVER_FAMILY_CHANGE_MIN_RATIO = 0.05;
export const OBSERVER_FAMILY_CHANGE_MIN_ELEMENTS = 8;
export function observerFamilyChangeVerdict(
  below: LayoutProbeFingerprint,
  above: LayoutProbeFingerprint,
): "changed" | "unchanged" | "unproven" {
  const floor = (a: number, b: number): number =>
    Math.max(
      OBSERVER_FAMILY_CHANGE_MIN_ELEMENTS,
      Math.ceil(OBSERVER_FAMILY_CHANGE_MIN_RATIO * Math.max(a, b)),
    );
  if (Math.abs(above.rendered - below.rendered) >= floor(below.rendered, above.rendered)) {
    return "changed";
  }
  if (Math.abs(above.elements - below.elements) >= floor(below.elements, above.elements)) {
    return "changed";
  }
  if (
    above.structure !== below.structure &&
    above.rendered === below.rendered &&
    above.elements === below.elements
  ) {
    return "changed";
  }
  return below.truncated || above.truncated ? "unproven" : "unchanged";
}

/**
 * Responsive Core P0 §C1.3 — merge per-width local style tables into ONE
 * probe-level table (first-appearance order across widths) and remap every
 * width's `s` array onto it. Pure.
 */
export function mergeInlineStyleTables(
  perWidth: readonly { s: readonly number[]; sTable: readonly string[] }[],
): { table: string[]; s: number[][] } {
  const table: string[] = [];
  const index = new Map<string, number>();
  const out: number[][] = [];
  for (const entry of perWidth) {
    const remap = entry.sTable.map((text) => {
      let at = index.get(text);
      if (at === undefined) {
        at = table.length;
        table.push(text);
        index.set(text, at);
      }
      return at;
    });
    out.push(entry.s.map((i) => (i >= 0 ? (remap[i] ?? -1) : -1)));
  }
  return { table, s: out };
}

function releaseInBrowser(key: string): void {
  const store = window as unknown as Record<string, unknown>;
  delete store[key];
}

async function installNameShim(page: Page): Promise<void> {
  await page.evaluate(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
}

async function settle(page: Page): Promise<void> {
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    )
    .catch(() => {});
  await page.waitForTimeout(LAYOUT_PROBE_SETTLE_MS);
}

/**
 * Resolve the effective probe width set: the base set plus any extra widths,
 * deduplicated and ascending. ONE implementation, so a CLI, the site manifest
 * and the probe itself can never disagree about which widths a run used.
 */
export function resolveProbeWidths(
  base: readonly number[],
  extra: readonly number[] = [],
): number[] {
  return [...new Set([...base, ...extra])].sort((a, b) => a - b);
}

/**
 * Validate operator-supplied probe widths (a CLI flag). Positive integers
 * within a sane range, deduplicated, ascending, and bounded in count — a run
 * that probes 40 widths is a mistake, not a request.
 */
export function parseProbeWidths(value: string | undefined): number[] {
  if (value === undefined || value.trim() === "") {
    throw new Error("--probe-widths expects a comma-separated list of widths");
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) {
    throw new Error("--probe-widths expects at least one width");
  }
  const widths: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) {
      throw new Error(`--probe-widths expects positive integers, got: ${part}`);
    }
    const width = Number(part);
    if (width < MIN_PROBE_WIDTH || width > MAX_PROBE_WIDTH) {
      throw new Error(
        `--probe-widths expects widths ${MIN_PROBE_WIDTH}–${MAX_PROBE_WIDTH}px, got: ${part}`,
      );
    }
    widths.push(width);
  }
  const unique = [...new Set(widths)].sort((a, b) => a - b);
  if (unique.length > MAX_EXTRA_PROBE_WIDTHS) {
    throw new Error(
      `--probe-widths accepts at most ${MAX_EXTRA_PROBE_WIDTHS} widths, got ${unique.length}`,
    );
  }
  return unique;
}

export interface ProbeLayoutOptions {
  /** Probe widths; defaults to {@link LAYOUT_PROBE_WIDTHS}. */
  widths?: readonly number[];
  /**
   * Task 28.6 W1.4 — the browser CONTEXT to probe in. Defaults to the
   * desktop-like context this probe has always used. Pass the resolved mobile
   * profile to probe the MOBILE tree; the walk then parks mobile elements, so
   * the arrays it returns align to the mobile viewport's element list and to
   * nothing else.
   */
  profile?: ViewportProfile;
  /** Viewport height held constant across widths (default 900). */
  height?: number;
  /** Extra widths appended (e.g. a 2048 regression canary). Deduplicated. */
  extraWidths?: readonly number[];
  /**
   * Task 28.6 C3 D1 — the provenance record for `widths`, when they were
   * DERIVED from the page's own authored breakpoints rather than taken from the
   * fixed floor list. Written into the artifact so the reconstruction lane and
   * an auditor can see why each sample exists.
   *
   * `extraWidths` are applied AFTER the derivation and are folded into the
   * record as `source: "operator"`, so every width the pass actually sampled
   * ends up with a reason. They are bounded by {@link MAX_EXTRA_PROBE_WIDTHS}
   * and NOT by the derivation's cap — an operator asking for a specific width
   * gets it, and the record shows that is why it is there.
   */
  widthProvenance?: ProbeWidthProvenance;
  /**
   * Run the SAME read-only preparation auto-scroll the deep observation ran.
   * Must mirror the observation's setting: a page that lazy-mounts content on
   * scroll renders a structurally different tree when only one of the two
   * loads scrolled, and the probe walk can then never align with dom.json
   * (Task 26 generic correction).
   */
  prepareScroll?: boolean;
  /**
   * Task 28.75 §07 — the DEEP observation's element count for this probe's
   * viewport, so the probe can tell a starved load from a small page.
   *
   * Without it the probe has no denominator and cannot know that walking 3
   * elements is wrong: 3 is a perfectly good walk of a 3-element page. With it,
   * a walk below {@link PROBE_DOCUMENT_STARVATION_RATIO} of the deep count is
   * retried once and then MARKED. Optional so a standalone `probeLayout` call
   * still works — it simply reports coverage without a ratio rather than
   * inventing a denominator.
   */
  expectedElementCount?: number;
  onLog?: (message: string) => void;
}

/**
 * Run the probe against one URL. One page load, one walk, one resize+measure
 * per width. The context mirrors the desktop observation recipe (locale,
 * timezone, colour scheme, reduced motion) so the page under the probe is the
 * page the Observer saw.
 */
export async function probeLayout(
  browser: Browser,
  url: string,
  options: ProbeLayoutOptions = {},
): Promise<LayoutProbe> {
  const log = options.onLog ?? (() => {});
  const widths = resolveProbeWidths(
    options.widths ?? LAYOUT_PROBE_WIDTHS,
    options.extraWidths ?? [],
  );
  const profile = options.profile ?? DESKTOP_PROFILE;
  const initialWidth = profile.width;
  const probeHeight = options.height ?? LAYOUT_PROBE_HEIGHT;

  /*
   * Task 28.75 §07 — ONE probe pass, retried under a bounded policy.
   *
   * WHY A LOOP NOW. The probe makes its OWN page load, and until 28.75 that load
   * was the only one in the pipeline whose HTTP response was never read: a
   * transient upstream error body sailed through `page.goto`, the walk parked
   * its `html/body/pre`, and a THREE-element probe of a 2,291-element page was
   * written to the artifact as an ordinary success (`linear.app /`, run
   * `2026-09-04T22-34-32-296Z`).
   *
   * Two gates, because two different failures produce the same useless walk:
   *  1. `navigateMainDocument` — the non-2xx retry Task 28.7 B1 already applies
   *     to the deep observation's load. Moved to a shared module so the probe's
   *     load obeys the same policy instead of a private copy of none.
   *  2. the STARVATION check below — a soft error page answers 200, so no status
   *     check can catch it. The control is the deep walk of the SAME viewport in
   *     the SAME run, which the caller passes in.
   *
   * A retry re-creates the CONTEXT, not just the page: a starved load can leave
   * a poisoned service worker or cache entry behind, and the whole point is to
   * ask the site again from a clean slate.
   */
  const attemptProbe = async (
    attempt: number,
  ): Promise<{
    walk: ProbeWalkResult;
    widthResults: LayoutProbeWidth[];
    documentResponse: DocumentResponse;
    prepareScrollStatus?: PrepareScrollStatus;
    minMeasured: number;
    inlineStyleTable: string[];
    inlineStyleRecheck?: LayoutProbe["inlineStyleRecheck"];
    familySwitchBisections: FamilySwitchBisection[];
    familySwitchPairsSkipped: number;
  }> => {
    const context = await browser.newContext({
      viewport: { width: initialWidth, height: probeHeight },
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
      log(
        `[probe:${profile.id}] loading at ${initialWidth}px` +
          (attempt > 1 ? ` (attempt ${attempt}/${MAX_PROBE_ATTEMPTS})` : "") +
          `…`,
      );
      // Task 28.75 §07 — the document's status is READ, and a non-2xx is retried
      // once, exactly as the deep observation's load does.
      const documentResponse = await navigateMainDocument(page, url, (m) =>
        log(`[probe:${profile.id}] ${m}`),
      );
      if (!documentResponse.ok && !documentResponse.statusUnavailable) {
        log(
          `[probe:${profile.id}] SOURCE INTEGRITY: the probe's document answered ` +
            `HTTP ${String(documentResponse.status)} — the bytes about to be ` +
            `walked are the SERVER'S ERROR RESPONSE, not the page`,
        );
      }
      await installNameShim(page);
      try {
        await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS });
      } catch {
        // Bounded on purpose.
      }
      let prepareScrollStatus: PrepareScrollStatus | undefined;
      if (options.prepareScroll) {
        log(`[probe:${profile.id}] preparing (read-only auto-scroll, mirroring the observation)…`);
        // Task 28.7 A1 — the probe scroll goes through the SAME navigation-safe
        // policy as the deep observation. A navigation here used to escape into
        // `observePageWithBrowser`'s catch and make the whole probe vanish with no
        // record of why; now it DEGRADES the probe and says so.
        const prepared = await autoScrollPrepare(page, {
          observationUrl: url,
          onLog: (m) => log(`[probe:${profile.id}] ${m}`),
        });
        prepareScrollStatus = prepared.status;
        if (prepared.status !== "prepare-scroll-complete") {
          log(
            `[probe:${profile.id}] preparation scroll ended ${prepared.status}` +
              (prepared.navigation ? ` — ${prepared.navigation.limitation}` : ""),
          );
        }
        // The recovery/restore may have re-navigated, which throws away the shim.
        // `autoScrollPrepare` reinstalls it after each of its own gotos; this is
        // belt and braces for the walk that follows.
        await installNameShim(page).catch(() => {});
      }
      await settle(page);

      const walk = await page.evaluate(walkInBrowser, {
        key: PROBE_STATE_KEY,
        skipTags: [...SKIP_TAGS],
        maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
      });

      const widthResults: LayoutProbeWidth[] = [];
      const localStyleTables: { s: number[]; sTable: string[] }[] = [];
      let minMeasured = walk.tags.length;
      for (const width of widths) {
        await page.setViewportSize({ width, height: probeHeight });
        await settle(page);
        const measured = await page.evaluate(measureInBrowser, {
          key: PROBE_STATE_KEY,
          skipTags: [...SKIP_TAGS],
          maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
          maxDepth: PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH,
        });
        log(
          `[probe:${profile.id}] ${width}px — ${walk.tags.length} element(s), ` +
            `${measured.disconnected} disconnected, ` +
            `family ${measured.fingerprint.rendered}/${measured.fingerprint.elements} ` +
            `rendered @${measured.fingerprint.structure}`,
        );
        const { s: localS, sTable: localTable, ...geometry } = measured;
        localStyleTables.push({ s: localS, sTable: localTable });
        widthResults.push({ width, ...geometry });
        const stillConnected = walk.tags.length - measured.disconnected;
        if (stillConnected < minMeasured) minMeasured = stillConnected;
      }
      // Responsive Core P0 §C1.3 — one probe-level style table.
      const merged = mergeInlineStyleTables(localStyleTables);
      widthResults.forEach((entry, i) => {
        entry.s = merged.s[i] ?? [];
      });

      /*
       * Responsive Core P0 §C1.6 — OBSERVED FAMILY-SWITCH BISECTION.
       *
       * For every adjacent probed pair whose fingerprints CHANGED (the same
       * predicate the tree switch uses), resize in place — fingerprint only —
       * until the switch sits in a 1px bracket. Bounded per pair and per probe;
       * the bisected widths are NOT added to `widths` (no element geometry is
       * taken there).
       */
      const familySwitchBisections: FamilySwitchBisection[] = [];
      let familySwitchPairsSkipped = 0;
      for (let k = 1; k < widthResults.length; k++) {
        const below = widthResults[k - 1]!;
        const above = widthResults[k]!;
        if (!below.fingerprint || !above.fingerprint) continue;
        if (observerFamilyChangeVerdict(below.fingerprint, above.fingerprint) !== "changed") {
          continue;
        }
        if (familySwitchBisections.length >= MAX_FAMILY_BISECTION_PAIRS) {
          familySwitchPairsSkipped++;
          continue;
        }
        let lo = below.width;
        let hi = above.width;
        let loFingerprint = below.fingerprint;
        let hiFingerprint = above.fingerprint;
        let steps = 0;
        let failed = false;
        let bracketChanged = false;
        try {
          while (hi - lo > 1 && steps < MAX_FAMILY_BISECTION_STEPS) {
            const mid = Math.floor((lo + hi) / 2);
            await page.setViewportSize({ width: mid, height: probeHeight });
            await settle(page);
            const at = await page.evaluate(measureInBrowser, {
              key: PROBE_STATE_KEY,
              skipTags: [...SKIP_TAGS],
              maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
              maxDepth: PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH,
              fingerprintOnly: true,
            });
            steps++;
            if (observerFamilyChangeVerdict(loFingerprint, at.fingerprint) === "changed") {
              hi = mid;
              hiFingerprint = at.fingerprint;
            } else {
              lo = mid;
              loFingerprint = at.fingerprint;
            }
          }
          /*
           * Review fix M3 — every mid-point was compared with the MOVING low
           * end, so a gradual change (+1 rendered every 30px) still walks down
           * to a 1px bracket that holds no switch. Re-measure BOTH ends of the
           * final bracket and require the verdict between them to be
           * `changed`; otherwise the bracket is not a switch.
           */
          if (hi - lo <= 1) {
            const measureAt = async (width: number) => {
              await page.setViewportSize({ width, height: probeHeight });
              await settle(page);
              return (
                await page.evaluate(measureInBrowser, {
                  key: PROBE_STATE_KEY,
                  skipTags: [...SKIP_TAGS],
                  maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
                  maxDepth: PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH,
                  fingerprintOnly: true,
                })
              ).fingerprint;
            };
            loFingerprint = await measureAt(lo);
            hiFingerprint = await measureAt(hi);
            bracketChanged =
              observerFamilyChangeVerdict(loFingerprint, hiFingerprint) === "changed";
          }
        } catch (err) {
          failed = true;
          log(
            `[probe:${profile.id}] family bisection ${below.width}→${above.width} ` +
              `stopped: ${err instanceof Error ? err.message.split("\n", 1)[0] : String(err)}`,
          );
        }
        const converged = !failed && hi - lo <= 1 && bracketChanged;
        const notConvergedReason: FamilySwitchBisection["reason"] = converged
          ? undefined
          : failed
            ? "error"
            : hi - lo > 1
              ? "step-limit"
              : "gradual";
        familySwitchBisections.push({
          pairLo: below.width,
          pairHi: above.width,
          lo,
          hi,
          loFingerprint,
          hiFingerprint,
          steps,
          converged,
          ...(notConvergedReason !== undefined ? { reason: notConvergedReason } : {}),
        });
        log(
          `[probe:${profile.id}] family switch ${below.width}→${above.width} bisected to ` +
            `${lo}|${hi} in ${steps} step(s)` +
            (converged ? "" : ` (NOT converged: ${String(notConvergedReason)})`),
        );
      }

      /*
       * Review fix M5 — TIME vs WIDTH. The widths above were measured one after
       * another, so an autoplay carousel's changing inline `transform` looks
       * exactly like a width-dependent value. Re-measure the FIRST width now:
       * any element whose style text differs between the two measurements of
       * the same width changed over time, and provenance must not call it
       * `runtime-responsive`.
       */
      let inlineStyleTable = merged.table;
      let inlineStyleRecheck: LayoutProbe["inlineStyleRecheck"];
      const firstWidth = widthResults[0];
      if (firstWidth !== undefined && firstWidth.s !== undefined) {
        try {
          await page.setViewportSize({ width: firstWidth.width, height: probeHeight });
          await settle(page);
          const again = await page.evaluate(measureInBrowser, {
            key: PROBE_STATE_KEY,
            skipTags: [...SKIP_TAGS],
            maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
            maxDepth: PROBE_FINGERPRINT_STRUCTURE_MAX_DEPTH,
          });
          const remerged = mergeInlineStyleTables([
            ...localStyleTables,
            { s: again.s, sTable: again.sTable },
          ]);
          // Appending one more per-width table never renumbers earlier entries
          // (first-appearance order), so the widths' `s` arrays stay valid.
          inlineStyleTable = remerged.table;
          const recheckS = remerged.s[remerged.s.length - 1] ?? [];
          const firstS = firstWidth.s;
          let timeVaryingElements = 0;
          for (let i = 0; i < recheckS.length; i++) {
            if ((recheckS[i] ?? -1) !== (firstS[i] ?? -1)) timeVaryingElements++;
          }
          inlineStyleRecheck = { width: firstWidth.width, s: recheckS, timeVaryingElements };
          if (timeVaryingElements > 0) {
            log(
              `[probe:${profile.id}] ${firstWidth.width}px re-measured: ` +
                `${timeVaryingElements} element(s) changed inline style over time`,
            );
          }
        } catch (err) {
          log(
            `[probe:${profile.id}] first-width re-measure failed: ` +
              `${err instanceof Error ? err.message.split("\n", 1)[0] : String(err)}`,
          );
        }
      }

      await page.evaluate(releaseInBrowser, PROBE_STATE_KEY).catch(() => {});
      return {
        walk,
        widthResults,
        inlineStyleTable,
        ...(inlineStyleRecheck !== undefined ? { inlineStyleRecheck } : {}),
        familySwitchBisections,
        familySwitchPairsSkipped,
        documentResponse,
        ...(prepareScrollStatus ? { prepareScrollStatus } : {}),
        minMeasured,
      };
    } finally {
      await context.close();
    }
  };

  /**
   * The probe's walk is starved when it holds an order of magnitude fewer
   * elements than the deep walk of the same viewport. No denominator, no
   * verdict — an absent `expectedElementCount` is never treated as zero.
   */
  const isStarved = (walked: number): boolean => {
    const expected = options.expectedElementCount;
    if (expected === undefined || expected <= 0) return false;
    return walked / expected < PROBE_DOCUMENT_STARVATION_RATIO;
  };

  let result = await attemptProbe(1);
  let attempts = 1;
  while (
    attempts < MAX_PROBE_ATTEMPTS &&
    (isStarved(result.walk.tags.length) ||
      (!result.documentResponse.ok && !result.documentResponse.statusUnavailable))
  ) {
    const expected = options.expectedElementCount;
    log(
      `[probe:${profile.id}] walked ${String(result.walk.tags.length)} element(s)` +
        (expected !== undefined ? ` against ${String(expected)} in the deep walk` : "") +
        ` (document HTTP ${String(result.documentResponse.status)}) — retrying the ` +
        `whole probe once from a clean context`,
    );
    await new Promise<void>((resolve) =>
      setTimeout(resolve, DOCUMENT_NAV_RETRY_BACKOFF_MS),
    );
    attempts++;
    const retry = await attemptProbe(attempts);
    // Keep the BETTER pass. A retry that came back worse (the site degraded
    // further) must not throw away a usable first walk.
    if (retry.walk.tags.length > result.walk.tags.length) result = retry;
  }

  const { walk, widthResults, documentResponse, prepareScrollStatus } = result;
  const expected = options.expectedElementCount;
  const starved = isStarved(walk.tags.length);
  const coverage: LayoutProbeCoverage = {
    walked: walk.tags.length,
    measured: Math.max(0, result.minMeasured),
    ...(expected !== undefined && expected > 0
      ? {
          documentElements: expected,
          ratio: Math.round((walk.tags.length / expected) * 10000) / 10000,
        }
      : {}),
    starved,
    attempts,
  };
  if (starved) {
    log(
      `[probe:${profile.id}] SOURCE INTEGRITY: probe walked ` +
        `${String(coverage.walked)} element(s) against ` +
        `${String(expected)} in the deep walk of the same viewport (ratio ` +
        `${String(coverage.ratio)}, below the ${String(PROBE_DOCUMENT_STARVATION_RATIO)} ` +
        `probe starvation floor) after ${String(attempts)} attempt(s) — this ` +
        `probe's load did not get the page`,
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    url,
    finalUrl: walk.finalUrl,
    capturedAt: new Date().toISOString(),
    initialWidth,
    // Recorded only when the caller chose a context / height, so the
    // long-standing desktop probe artifact keeps exactly the shape it had.
    ...(options.profile ? { profile } : {}),
    ...(probeHeight !== LAYOUT_PROBE_HEIGHT ? { initialHeight: probeHeight } : {}),
    tags: walk.tags,
    parents: walk.parents,
    widths: widthResults,
    truncated: walk.truncated,
    // Task 28.7 A1 — how the probe's own preparation scroll ended. Present
    // only when the probe scrolled; a degraded probe is now visible in its
    // artifact instead of being an unexplained walk.
    ...(prepareScrollStatus ? { prepareScrollStatus } : {}),
    ...(options.widthProvenance
      ? { widthProvenance: withOperatorWidths(options.widthProvenance, widths) }
      : {}),
    documentResponse,
    coverage,
    // Responsive Core P0 §C1.3 / §C1.6.
    inlineStyleTable: result.inlineStyleTable,
    ...(result.inlineStyleRecheck !== undefined
      ? { inlineStyleRecheck: result.inlineStyleRecheck }
      : {}),
    familySwitchBisections: result.familySwitchBisections,
    ...(result.familySwitchPairsSkipped > 0
      ? { familySwitchPairsSkipped: result.familySwitchPairsSkipped }
      : {}),
  };
}
