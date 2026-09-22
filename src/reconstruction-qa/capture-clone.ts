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
import {
  BREAKPOINT_PROBE_WIDTHS,
  type ScreenshotCoverage,
  type Stability,
} from "./types.js";

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
  /** Task 28.6 C5 — how much of the document `screenshot` contains. */
  screenshotCoverage?: ScreenshotCoverage;
  diagnostics?: PageDiagnostics;
  stability?: Stability;
  /** Task 28.6 — what `stabilize()`'s two bounded waits actually reached. */
  stabilization?: { networkIdleReached: boolean; fontsReadyReached: boolean };
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
    let stabilization: { networkIdleReached: boolean; fontsReadyReached: boolean };
    try {
      await gotoQa(page, requestUrl);
      stabilization = await stabilize(page);
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
    // Task 28.6 C5 — see the note in `captureOriginal`: a screenshot the driver
    // refuses is a coverage finding, not a clone load error.
    const screenshot = options.screenshot
      ? await captureScreenshot(page, "clone")
      : undefined;
    const stability = options.measureStability
      ? await measureStability(page, capture, options.viewportId)
      : undefined;

    return {
      ok: true,
      requestUrl,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      capture,
      ...(screenshot?.buffer ? { screenshot: screenshot.buffer } : {}),
      ...(screenshot ? { screenshotCoverage: screenshot.coverage } : {}),
      stabilization,
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
 * The clone-only breakpoint probe (items 59, 60).
 *
 * The switch width is this generator's decision, not an observation of the
 * original at that width, so demanding pixel equality with the original there
 * would be measuring a number nobody measured. What CAN be required is internal
 * consistency: around the switch the clone must show exactly one variant, must
 * render content, and must throw nothing. A failure here is
 * `inferred-breakpoint-runtime-defect` and is never reported as an original
 * mismatch.
 *
 * Responsive Core P0 — WHERE it probes. It used to probe 914/915/916 (the stale
 * 390/1440 midpoint) on the first route only, which never touched the served
 * switch. It now probes served−1 / served / served+1 on EVERY route, with the
 * route's own served width from the route map, and additionally requires the
 * RIGHT variant: mobile below the switch, desktop at and above it (the
 * convention `width < breakpoint → mobile`). Only a manifest with no usable
 * breakpoint falls back to {@link BREAKPOINT_PROBE_WIDTHS}, consistency-only,
 * and that is counted.
 */
export type BreakpointProbeSource = "route-map-page" | "manifest-site" | "fallback-constant";

export interface BreakpointProbeTarget {
  pageId?: string;
  clonePath: string;
  /** The served switch this route swaps at; absent only for the fallback. */
  breakpoint?: number;
  widths: number[];
  source: BreakpointProbeSource;
}

const usableBreakpoint = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 1;

/**
 * Pure: one probe target per distinct route (first clone path wins per page),
 * in input order. A route listed in `pageBreakpoints` is probed at its own
 * width; otherwise at the site's; with neither usable, at the fallback constant.
 */
export function planBreakpointProbeTargets(input: {
  siteBreakpoint?: unknown;
  pageBreakpoints?: Record<string, unknown>;
  routes: ReadonlyArray<{ pageId: string; clonePath: string }>;
}): { targets: BreakpointProbeTarget[]; fallbackTargets: number } {
  const targetFor = (pageId: string | undefined, clonePath: string): BreakpointProbeTarget => {
    const own = pageId !== undefined ? input.pageBreakpoints?.[pageId] : undefined;
    if (usableBreakpoint(own)) {
      return { ...(pageId !== undefined ? { pageId } : {}), clonePath, breakpoint: own, widths: [own - 1, own, own + 1], source: "route-map-page" };
    }
    if (usableBreakpoint(input.siteBreakpoint)) {
      const bp = input.siteBreakpoint;
      return { ...(pageId !== undefined ? { pageId } : {}), clonePath, breakpoint: bp, widths: [bp - 1, bp, bp + 1], source: "manifest-site" };
    }
    return {
      ...(pageId !== undefined ? { pageId } : {}),
      clonePath,
      widths: [...BREAKPOINT_PROBE_WIDTHS],
      source: "fallback-constant",
    };
  };
  const seen = new Set<string>();
  const targets: BreakpointProbeTarget[] = [];
  for (const route of input.routes) {
    if (seen.has(route.pageId)) continue;
    seen.add(route.pageId);
    targets.push(targetFor(route.pageId, route.clonePath));
  }
  if (targets.length === 0) targets.push(targetFor(undefined, "/"));
  return {
    targets,
    fallbackTargets: targets.filter((t) => t.source === "fallback-constant").length,
  };
}

/** The variant the convention requires at `width`, or undefined when no switch is known. */
export function expectedVariantAt(
  breakpoint: number | undefined,
  width: number,
): "mobile" | "desktop" | undefined {
  if (breakpoint === undefined) return undefined;
  return width < breakpoint ? "mobile" : "desktop";
}

export interface BreakpointProbeResult {
  width: number;
  /** Responsive Core P0 — which route and which served switch this sample probed. */
  clonePath?: string;
  pageId?: string;
  breakpoint?: number;
  source?: BreakpointProbeSource;
  /** The variant the convention requires here; absent for the fallback constant. */
  expectedVariant?: "mobile" | "desktop";
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
  /** Responsive Core P0 — the target; omitted = the fallback constant on `clonePath`. */
  target?: BreakpointProbeTarget;
}): Promise<BreakpointProbeResult[]> {
  const results: BreakpointProbeResult[] = [];
  const target: BreakpointProbeTarget = options.target ?? {
    clonePath: options.clonePath,
    widths: [...BREAKPOINT_PROBE_WIDTHS],
    source: "fallback-constant",
  };
  const clonePath = target.clonePath;
  for (const width of target.widths) {
    const expectedVariant = expectedVariantAt(target.breakpoint, width);
    const identity = {
      clonePath,
      ...(target.pageId !== undefined ? { pageId: target.pageId } : {}),
      ...(target.breakpoint !== undefined ? { breakpoint: target.breakpoint } : {}),
      source: target.source,
      ...(expectedVariant !== undefined ? { expectedVariant } : {}),
    };
    const context = await newQaContext(options.browser, options.desktopProfile, {
      widthOverride: width,
    });
    try {
      const page = await context.newPage();
      const diagnostics = attachDiagnostics(page);
      await gotoQa(page, `${options.baseUrl}${clonePath}`);
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
      const rightVariant =
        expectedVariant === undefined ||
        (expectedVariant === "desktop" ? probe.desktop : probe.mobile);
      results.push({
        width,
        ...identity,
        ok:
          probe.desktop !== probe.mobile &&
          rightVariant &&
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
        ...identity,
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
