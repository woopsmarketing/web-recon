import type { Browser } from "playwright";
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
import { measureStability } from "./capture-original.js";
import { BREAKPOINT_PROBE_WIDTHS, type Stability } from "./types.js";

/**
 * Capturing the CLONE (items 7, 38, 39, 59).
 *
 * Identical environment, identical load policy, identical screenshot policy as
 * the original capture — the only difference is that the clone renders BOTH
 * observed viewport trees into one document and hides one with CSS, so every
 * read has to be scoped to the variant that is actually shown (item 39).
 *
 * That scoping is not a convenience: `data-wr-node` ids are VIEWPORT-LOCAL, so
 * `n000042` exists once in the desktop tree and once (as a different element) in
 * the mobile tree. Querying the document would silently mix two observations.
 *
 * The clone is also the only side where a "both visible / neither visible"
 * answer is possible, and that is a runtime defect of the responsive mechanism
 * rather than a fidelity finding — so it is captured here and classified
 * separately (`responsive-variant-runtime-error`).
 */

export interface CloneCapture {
  ok: boolean;
  requestUrl: string;
  httpStatus?: number;
  capture?: QaRawCapture;
  screenshot?: Buffer;
  diagnostics?: PageDiagnostics;
  stability?: Stability;
  error?: string;
  loadMs: number;
  totalMs: number;
  capturedAt: string;
}

export interface CaptureCloneOptions {
  browser: Browser;
  baseUrl: string;
  /** Clone-local path, e.g. `/docs/getting-started?q=a`. */
  clonePath: string;
  profile: ViewportProfile;
  viewportId: "desktop" | "mobile";
  screenshot: boolean;
  measureStability: boolean;
}

export async function captureClone(
  options: CaptureCloneOptions,
): Promise<CloneCapture> {
  const startedAtMs = Date.now();
  const capturedAt = new Date(startedAtMs).toISOString();
  const requestUrl = `${options.baseUrl}${options.clonePath}`;
  const context = await newQaContext(options.browser, options.profile);
  let loadMs = 0;
  try {
    const page = await context.newPage();
    const diagnostics = attachDiagnostics(page);
    let httpStatus: number | undefined;
    page.on("response", (response) => {
      if (response.url() === requestUrl && httpStatus === undefined) {
        httpStatus = response.status();
      }
    });

    const loadStart = Date.now();
    try {
      await gotoQa(page, requestUrl);
      await stabilize(page);
      loadMs = Date.now() - loadStart;
    } catch (err) {
      loadMs = Date.now() - loadStart;
      return {
        ok: false,
        requestUrl,
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
        loadMs,
        totalMs: Date.now() - startedAtMs,
        capturedAt,
      };
    }

    const capture = await runCapture(page, options.viewportId);
    const screenshot = options.screenshot ? await captureScreenshot(page) : undefined;
    const stability = options.measureStability
      ? await measureStability(page, capture, options.viewportId)
      : undefined;

    return {
      ok: true,
      requestUrl,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      capture,
      ...(screenshot ? { screenshot } : {}),
      diagnostics,
      ...(stability ? { stability } : {}),
      loadMs,
      totalMs: Date.now() - startedAtMs,
      capturedAt,
    };
  } catch (err) {
    return {
      ok: false,
      requestUrl,
      error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
      loadMs,
      totalMs: Date.now() - startedAtMs,
      capturedAt,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * The clone-only inferred-breakpoint probe (items 59, 60).
 *
 * 915 px is this generator's own arithmetic, not an observation, so demanding
 * pixel equality with the original there would be measuring a number nobody ever
 * measured. What CAN be required is internal consistency: at 914 / 915 / 916 the
 * clone must show exactly one variant, must render content, and must throw
 * nothing. A failure here is `inferred-breakpoint-runtime-defect` and is never
 * reported as an original mismatch.
 */
export interface BreakpointProbeResult {
  width: number;
  ok: boolean;
  desktopVisible: boolean;
  mobileVisible: boolean;
  elementCount: number;
  runtimeErrors: number;
  error?: string;
}

export async function probeBreakpoint(options: {
  browser: Browser;
  baseUrl: string;
  clonePath: string;
  desktopProfile: ViewportProfile;
}): Promise<BreakpointProbeResult[]> {
  const results: BreakpointProbeResult[] = [];
  for (const width of BREAKPOINT_PROBE_WIDTHS) {
    const context = await newQaContext(options.browser, options.desktopProfile, {
      widthOverride: width,
    });
    try {
      const page = await context.newPage();
      const diagnostics = attachDiagnostics(page);
      await gotoQa(page, `${options.baseUrl}${options.clonePath}`);
      await stabilize(page);
      const probe = await page.evaluate(() => {
        const visible = (id: string): boolean => {
          const nodes = Array.from(document.querySelectorAll('[data-wr-viewport="' + id + '"]'));
          for (const node of nodes) {
            if (getComputedStyle(node).display !== "none") return true;
          }
          return false;
        };
        const desktop = visible("desktop");
        const mobile = visible("mobile");
        let elementCount = 0;
        for (const node of Array.from(document.querySelectorAll("[data-wr-viewport]"))) {
          if (getComputedStyle(node).display === "none") continue;
          elementCount += node.querySelectorAll("[data-wr-node]").length;
        }
        return { desktop, mobile, elementCount };
      });
      const runtimeErrors =
        diagnostics.consoleErrors.length + diagnostics.pageErrors.length;
      results.push({
        width,
        ok:
          probe.desktop !== probe.mobile &&
          probe.elementCount > 0 &&
          runtimeErrors === 0,
        desktopVisible: probe.desktop,
        mobileVisible: probe.mobile,
        elementCount: probe.elementCount,
        runtimeErrors,
      });
    } catch (err) {
      results.push({
        width,
        ok: false,
        desktopVisible: false,
        mobileVisible: false,
        elementCount: 0,
        runtimeErrors: 0,
        error: err instanceof Error ? err.message.split("\n", 1)[0] : String(err),
      });
    } finally {
      await context.close().catch(() => {});
    }
  }
  return results;
}
