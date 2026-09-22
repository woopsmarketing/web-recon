import type { Browser, Page } from "playwright";
import type { ViewportProfile } from "../observer/types.js";
import {
  attachDiagnostics,
  captureScreenshot,
  gotoQa,
  newQaContext,
  runCapture,
  stabilize,
  type PageDiagnostics,
  type QaRawCapture,
} from "./capture-page.js";
import {
  STABILITY_GEOMETRY_EPSILON,
  STABILITY_SAMPLE_SIZE,
  STABILITY_SETTLE_MS,
  type ScreenshotCoverage,
  type Stability,
} from "./types.js";

/**
 * Capturing the LIVE ORIGINAL (items 2, 8, 21, 27).
 *
 * The live original is a public site somebody else runs, so this capture is
 * strictly read-only in the same sense Task 09's Observer is: navigate, wait,
 * read the DOM and the CSSOM, take a screenshot, leave. No click, no hover, no
 * form input, no scroll, no cookie, no storage state — the context is fresh and
 * anonymous every time.
 *
 * Unlike the interaction replay (see `interaction-qa.ts`), the static capture
 * does NOT intercept requests. Task 09's snapshot was taken with no interception
 * at all, and a QA capture that blocked the page's own lazy-loading XHR would
 * measure a different page than the one the clone was built from — manufacturing
 * exactly the drift it is meant to detect. What IS installed is the harmless
 * half of the safety net: popups are closed, downloads are cancelled, dialogs
 * are dismissed, and each is recorded.
 *
 * Request BLOCKING applies to the action phase, where this engine is the cause
 * of what happens; a page loading itself is not this engine's action.
 */

export interface OriginalCapture {
  ok: boolean;
  url: string;
  finalUrl?: string;
  capture?: QaRawCapture;
  screenshot?: Buffer;
  /**
   * Task 28.6 C5 — how much of the document `screenshot` contains. Present
   * whenever a screenshot was ASKED for, including when it failed, so a caller
   * can tell "not requested" (absent) from "requested and short" (`truncated`).
   */
  screenshotCoverage?: ScreenshotCoverage;
  diagnostics?: PageDiagnostics;
  stability?: Stability;
  /**
   * Task 28.6 — what `stabilize()`'s two BOUNDED waits actually reached. It
   * always computed these and every caller dropped them, so a page captured
   * while still loading was indistinguishable from a settled one.
   */
  stabilization?: { networkIdleReached: boolean; fontsReadyReached: boolean };
  safetyEvents: string[];
  error?: string;
  loadMs: number;
  totalMs: number;
  capturedAt: string;
}

export interface CaptureOriginalOptions {
  browser: Browser;
  url: string;
  profile: ViewportProfile;
  /** Take a full-page screenshot (the Observer's own policy). */
  screenshot: boolean;
  /** Re-capture a bounded moment later to measure stability (item 21). */
  measureStability: boolean;
}

/** Install the read-only half of the Task 11 safety net (item 8). */
function installPassiveGuards(page: Page, events: string[]): void {
  page.context().on("page", (popup) => {
    if (popup === page) return;
    events.push("popup-attempt");
    void popup.close().catch(() => {});
  });
  page.on("download", (download) => {
    events.push("download-attempt");
    void download.cancel().catch(() => {});
  });
  page.on("dialog", (dialog) => {
    events.push(`dialog-dismissed:${dialog.type()}`);
    void dialog.dismiss().catch(() => {});
  });
}

/**
 * Measure whether the page is still moving (item 21).
 *
 * A bounded settle, then the same geometry read again on a deterministic
 * prefix of the captured elements. Animations are never disabled; a page whose
 * layout keeps changing is reported as unstable so its diffs can be discounted
 * rather than attributed to the clone.
 */
export async function measureStability(
  page: Page,
  first: QaRawCapture,
  variantId?: "desktop" | "mobile",
): Promise<Stability> {
  await page.waitForTimeout(STABILITY_SETTLE_MS);
  let second: QaRawCapture;
  try {
    second = await runCapture(page, variantId);
  } catch {
    // `stable: true` here is a PLACEHOLDER beside `measured: false`, not a
    // verdict. Every consumer gates on `measured` first; the counters are
    // written as zeros with `candidateNodes` stated, so a reader can see that
    // nothing was compared rather than infer it from a bare `true`.
    return {
      measured: false,
      movingNodes: 0,
      sampledNodes: 0,
      candidateNodes: first.elements.length,
      unsampledNodes: first.elements.length,
      unmatchedNodes: 0,
      documentHeightDelta: 0,
      stable: true,
    };
  }
  const byKey = new Map(second.elements.map((element) => [element.key, element]));
  // A bounded, deterministic PREFIX — and the part it does not reach is counted
  // below rather than left to look like a page that had exactly this many nodes.
  const sample = first.elements.slice(0, STABILITY_SAMPLE_SIZE);
  let movingNodes = 0;
  let unmatchedNodes = 0;
  for (const element of sample) {
    const other = byKey.get(element.key);
    if (!other) {
      // Not comparable: the node is gone from the second capture. Counted, so a
      // `stable: true` over a page that lost half its nodes cannot read as calm.
      unmatchedNodes++;
      continue;
    }
    const moved =
      Math.abs(element.box.x - other.box.x) > STABILITY_GEOMETRY_EPSILON ||
      Math.abs(element.box.y - other.box.y) > STABILITY_GEOMETRY_EPSILON ||
      Math.abs(element.box.width - other.box.width) > STABILITY_GEOMETRY_EPSILON ||
      Math.abs(element.box.height - other.box.height) > STABILITY_GEOMETRY_EPSILON;
    if (moved) movingNodes++;
  }
  const documentHeightDelta =
    second.documentGeometry.documentHeight - first.documentGeometry.documentHeight;
  return {
    measured: true,
    movingNodes,
    sampledNodes: sample.length,
    candidateNodes: first.elements.length,
    unsampledNodes: Math.max(0, first.elements.length - sample.length),
    unmatchedNodes,
    documentHeightDelta,
    stable: movingNodes === 0 && Math.abs(documentHeightDelta) <= STABILITY_GEOMETRY_EPSILON,
  };
}

/** Capture one live-original page/viewport. Never throws for a site problem. */
export async function captureOriginal(
  options: CaptureOriginalOptions,
): Promise<OriginalCapture> {
  const startedAtMs = Date.now();
  const capturedAt = new Date(startedAtMs).toISOString();
  const safetyEvents: string[] = [];
  const context = await newQaContext(options.browser, options.profile);
  let loadMs = 0;
  try {
    const page = await context.newPage();
    installPassiveGuards(page, safetyEvents);
    const diagnostics = attachDiagnostics(page);

    const loadStart = Date.now();
    let finalUrl: string;
    let stabilization: { networkIdleReached: boolean; fontsReadyReached: boolean };
    try {
      finalUrl = await gotoQa(page, options.url);
      stabilization = await stabilize(page);
      loadMs = Date.now() - loadStart;
    } catch (err) {
      loadMs = Date.now() - loadStart;
      return {
        ok: false,
        url: options.url,
        safetyEvents: safetyEvents.sort(),
        error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
        loadMs,
        totalMs: Date.now() - startedAtMs,
        capturedAt,
      };
    }

    const capture = await runCapture(page);
    /*
     * Task 28.6 C5: a screenshot that is refused (too tall for the driver) used
     * to escape to the outer catch and discard `capture` — reporting a page
     * whose DOM, geometry and style were all captured successfully as a load
     * error. It is now a recorded coverage failure and the rest of the QA runs.
     */
    const screenshot = options.screenshot
      ? await captureScreenshot(page, "live-original")
      : undefined;
    const stability = options.measureStability
      ? await measureStability(page, capture)
      : undefined;

    return {
      ok: true,
      url: options.url,
      finalUrl,
      capture,
      ...(screenshot?.buffer ? { screenshot: screenshot.buffer } : {}),
      ...(screenshot ? { screenshotCoverage: screenshot.coverage } : {}),
      stabilization,
      diagnostics,
      ...(stability ? { stability } : {}),
      safetyEvents: safetyEvents.sort(),
      loadMs,
      totalMs: Date.now() - startedAtMs,
      capturedAt,
    };
  } catch (err) {
    return {
      ok: false,
      url: options.url,
      safetyEvents: safetyEvents.sort(),
      error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
      loadMs,
      totalMs: Date.now() - startedAtMs,
      capturedAt,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
