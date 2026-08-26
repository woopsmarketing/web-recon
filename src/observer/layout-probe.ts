import type { Browser, Page } from "playwright";
import {
  DESKTOP_PROFILE,
  LAYOUT_PROBE_HEIGHT,
  LAYOUT_PROBE_SETTLE_MS,
  LAYOUT_PROBE_WIDTHS,
  MAX_LAYOUT_PROBE_ELEMENTS,
  NAV_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  SCHEMA_VERSION,
  SCROLL_MAX_DISTANCE_PX,
  SCROLL_MAX_STEPS,
  SCROLL_MAX_TOTAL_MS,
  SCROLL_STEP_FRACTION,
  SCROLL_STEP_SETTLE_MS,
  SKIP_TAGS,
  type LayoutProbe,
  type LayoutProbeWidth,
} from "./types.js";

/**
 * Read-only preparation auto-scroll (Task 05). Lives here so both the deep
 * observation and the layout probe run the SAME scroll policy — the probe's
 * contract is that the page under it is the page the Observer saw, and a page
 * that lazy-mounts content on scroll only satisfies that when both loads
 * scrolled the same way (Task 26 generic correction).
 */
export async function autoScrollPrepare(
  page: Page,
): Promise<{ steps: number; distancePx: number }> {
  const start = Date.now();
  let steps = 0;
  let distance = 0;
  while (
    steps < SCROLL_MAX_STEPS &&
    distance < SCROLL_MAX_DISTANCE_PX &&
    Date.now() - start < SCROLL_MAX_TOTAL_MS
  ) {
    const m = await page.evaluate((frac) => {
      const step = Math.max(1, Math.floor(window.innerHeight * frac));
      const beforeY = window.scrollY;
      window.scrollBy(0, step);
      return {
        moved: window.scrollY - beforeY,
        y: window.scrollY,
        innerHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      };
    }, SCROLL_STEP_FRACTION);
    steps++;
    distance += Math.max(0, m.moved);
    await page.waitForTimeout(SCROLL_STEP_SETTLE_MS);
    // Stop once we can no longer advance or we've reached the bottom.
    if (m.moved <= 0) break;
    if (m.y + m.innerHeight >= m.scrollHeight - 2) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(SCROLL_STEP_SETTLE_MS);
  return { steps, distancePx: Math.round(distance) };
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

function measureInBrowser(arg: { key: string }): {
  x: number[];
  w: number[];
  v: (0 | 1)[];
  disconnected: number;
  documentWidth: number;
} {
  const store = window as unknown as Record<string, unknown>;
  const state = store[arg.key] as { elements: Element[] } | undefined;
  const round = (n: number): number => Math.round(n * 100) / 100;
  const x: number[] = [];
  const w: number[] = [];
  const v: (0 | 1)[] = [];
  let disconnected = 0;
  for (const el of state?.elements ?? []) {
    if (!el.isConnected) {
      disconnected++;
      x.push(0);
      w.push(0);
      v.push(0);
      continue;
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
    disconnected,
    documentWidth: round(document.documentElement.scrollWidth),
  };
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

export interface ProbeLayoutOptions {
  /** Probe widths; defaults to {@link LAYOUT_PROBE_WIDTHS}. */
  widths?: readonly number[];
  /** Extra widths appended (e.g. a 2048 regression canary). Deduplicated. */
  extraWidths?: readonly number[];
  /**
   * Run the SAME read-only preparation auto-scroll the deep observation ran.
   * Must mirror the observation's setting: a page that lazy-mounts content on
   * scroll renders a structurally different tree when only one of the two
   * loads scrolled, and the probe walk can then never align with dom.json
   * (Task 26 generic correction).
   */
  prepareScroll?: boolean;
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
  const widths = [
    ...new Set([...(options.widths ?? LAYOUT_PROBE_WIDTHS), ...(options.extraWidths ?? [])]),
  ].sort((a, b) => a - b);
  const initialWidth = DESKTOP_PROFILE.width;

  const context = await browser.newContext({
    viewport: { width: initialWidth, height: LAYOUT_PROBE_HEIGHT },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: OBSERVATION_REDUCED_MOTION as "no-preference",
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    log(`[probe] loading at ${initialWidth}px…`);
    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    await installNameShim(page);
    try {
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      // Bounded on purpose.
    }
    if (options.prepareScroll) {
      log(`[probe] preparing (read-only auto-scroll, mirroring the observation)…`);
      await autoScrollPrepare(page);
    }
    await settle(page);

    const walk = await page.evaluate(walkInBrowser, {
      key: PROBE_STATE_KEY,
      skipTags: [...SKIP_TAGS],
      maxElements: MAX_LAYOUT_PROBE_ELEMENTS,
    });

    const widthResults: LayoutProbeWidth[] = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: LAYOUT_PROBE_HEIGHT });
      await settle(page);
      const measured = await page.evaluate(measureInBrowser, { key: PROBE_STATE_KEY });
      log(
        `[probe] ${width}px — ${walk.tags.length} element(s), ` +
          `${measured.disconnected} disconnected`,
      );
      widthResults.push({ width, ...measured });
    }
    await page.evaluate(releaseInBrowser, PROBE_STATE_KEY).catch(() => {});

    return {
      schemaVersion: SCHEMA_VERSION,
      url,
      finalUrl: walk.finalUrl,
      capturedAt: new Date().toISOString(),
      initialWidth,
      tags: walk.tags,
      parents: walk.parents,
      widths: widthResults,
      truncated: walk.truncated,
    };
  } finally {
    await context.close();
  }
}
