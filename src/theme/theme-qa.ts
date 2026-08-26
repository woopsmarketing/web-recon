import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  findIntroducedJsErrors, buildApp, startApp } from "../recon-template/parity-qa.js";
import type { RuntimeRouteMap } from "../reconstruction/index.js";
import type { LoadedReconTemplate } from "../content-injection/load-template.js";
import { startOverlayProxy } from "./serve.js";
import {
  THEME_SCHEMA_VERSION,
  ThemeQaReportSchema,
  type PaintApplicationCheck,
  type PaintGroup,
  type SiteThemeAdapter,
  type ThemeFile,
  type ThemeInteractionCheck,
  type ThemeQaPage,
  type ThemeQaReport,
} from "./types.js";
import type { ThemeOverlay } from "./overlay.js";

/**
 * Theme QA (§27–§29): the Content QA harness's question, re-asked for paint.
 *
 *   baseline render  (template app, optionally + content overlay)
 *   themed render    (same server, same bytes, + overlay CSS at the stylesheet)
 *
 * Level 1/2 themes must keep DOM, geometry and interaction EXACTLY — a theme
 * that moves layout is a defect, not a reflow (§27: geometry delta ≈ 0 목표).
 * On top of that the QA verifies the paint actually changed (§28 — a theme
 * that changes nothing is not a success), samples computed contrast in the
 * real browser (§22), and re-runs the interaction regression so mounted
 * dynamic surfaces are proven to carry the theme (§33).
 */

const SETTLE_MS = 900;
const GEOMETRY_TOLERANCE_PX = 1;
const CONTRAST_FAIL_RATIO = 1.7;
const SAMPLES_PER_GROUP = 8;

export interface ThemeQaOptions {
  runId: string;
  runDir: string;
  template: LoadedReconTemplate;
  adapter: SiteThemeAdapter;
  theme: ThemeFile;
  overlay: ThemeOverlay;
  routes: string[];
  widths?: number[];
  /** Task 19 slot-values overlay — the §30 curated composition canary. */
  slotValuesFile?: string;
  forceBuild?: boolean;
  skipInteractions?: boolean;
  screenshots?: boolean;
  log?: (line: string) => void;
}

function recordErrors(page: Page, jsErrors: string[], hydrationErrors: string[]): void {
  const record = (text: string): void => {
    if (/hydrat|minified react error #(418|423|425)/i.test(text)) hydrationErrors.push(text.slice(0, 300));
    else jsErrors.push(text.slice(0, 300));
  };
  page.on("pageerror", (error) => record(String((error as Error | undefined)?.message ?? error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|net::ERR|404|ERR_/i.test(text)) return;
    record(text);
  });
}

async function installNameShim(page: Page): Promise<void> {
  await page.evaluate("globalThis.__name = globalThis.__name || function (fn) { return fn; };");
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page
    .evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
    .catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

interface PageCapture {
  domSignature: string;
  nodes: Map<string, { x: number; y: number; w: number; h: number }>;
  docHeight: number;
  horizontalOverflow: boolean;
  lowContrastNodeIds: string[];
  jsErrors: string[];
  hydrationErrors: string[];
}

async function capturePage(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  screenshotFile?: string,
): Promise<PageCapture> {
  const viewport = width < breakpoint ? "mobile" : "desktop";
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  const jsErrors: string[] = [];
  const hydrationErrors: string[] = [];
  recordErrors(page, jsErrors, hydrationErrors);
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
    await installNameShim(page);
    await settle(page);
    const captured = await page.evaluate(
      (args: { viewport: string; contrastFail: number }) => {
        const round = (v: number): number => Math.round(v * 10) / 10;
        const doc = document.documentElement;
        const variant = document.querySelector(
          `.wr-variant[data-wr-viewport="${args.viewport}"]`,
        ) as HTMLElement | null;
        const tags: string[] = [];
        const nodes: Record<string, { x: number; y: number; w: number; h: number }> = {};
        const lowContrast: string[] = [];

        const parse = (value: string): [number, number, number, number] | undefined => {
          const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/.exec(value);
          if (!m) return undefined;
          return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : Number.parseFloat(m[4])];
        };
        const lum = (c: [number, number, number, number]): number => {
          const ch = (v: number): number => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
        };
        const ratio = (a: [number, number, number, number], b: [number, number, number, number]): number => {
          const la = lum(a);
          const lb = lum(b);
          const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
          return (hi + 0.05) / (lo + 0.05);
        };

        if (variant) {
          let contrastBudget = 400;
          for (const el of variant.querySelectorAll("[data-wr-node]")) {
            const h = el as HTMLElement;
            const rect = h.getBoundingClientRect();
            const id = h.getAttribute("data-wr-node") ?? "";
            tags.push(`${el.tagName.toLowerCase()}:${id}`);
            nodes[id] = {
              x: round(rect.x + window.scrollX),
              y: round(rect.y + window.scrollY),
              w: round(rect.width),
              h: round(rect.height),
            };
            // Browser-computed contrast sampling (§22): direct-text elements
            // against the nearest opaque ancestor background.
            if (contrastBudget > 0 && rect.width > 0 && rect.height > 0) {
              let hasText = false;
              for (const child of h.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "") {
                  hasText = true;
                  break;
                }
              }
              if (hasText) {
                contrastBudget--;
                const style = window.getComputedStyle(h);
                const fg = parse(style.color);
                let bg: [number, number, number, number] | undefined;
                let bgHasImage = false;
                let ancestor: HTMLElement | null = h;
                while (ancestor) {
                  const s = window.getComputedStyle(ancestor);
                  const candidate = parse(s.backgroundColor);
                  if (candidate && candidate[3] >= 0.99) {
                    bg = candidate;
                    bgHasImage = s.backgroundImage !== "none";
                    break;
                  }
                  if (s.backgroundImage !== "none") {
                    bgHasImage = true;
                    break;
                  }
                  ancestor = ancestor.parentElement;
                }
                if (fg && fg[3] > 0.5 && bg && !bgHasImage && ratio(fg, bg) < args.contrastFail) {
                  lowContrast.push(id);
                }
              }
            }
          }
        }
        return {
          domSignature: tags.join("|"),
          nodes,
          docHeight: doc.scrollHeight,
          horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
          lowContrast,
        };
      },
      { viewport, contrastFail: CONTRAST_FAIL_RATIO },
    );
    if (screenshotFile) {
      await page.screenshot({ path: screenshotFile, fullPage: true }).catch(() => {});
    }
    return {
      domSignature: captured.domSignature,
      nodes: new Map(Object.entries(captured.nodes)),
      docHeight: captured.docHeight,
      horizontalOverflow: captured.horizontalOverflow,
      lowContrastNodeIds: captured.lowContrast,
      jsErrors,
      hydrationErrors,
    };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Computed paint application (§27 computed paint application / §28 coverage)
// ---------------------------------------------------------------------------

interface GroupProbe {
  paintGroupId: string;
  token: string;
  property: string;
  /** CSS selector to sample (style-token class or node-scoped selector). */
  selector: string;
  pseudo?: "::before" | "::after";
  /** The computed property to read (border shorthand → its -color longhand). */
  computedProperty: string;
  /** The raw theme value; canonicalized in-page before comparison. */
  themeValue: string;
  kind: "color" | "radius" | "shadow";
}

function probesForGroup(group: PaintGroup, themeValue: string): GroupProbe[] {
  const probes: GroupProbe[] = [];
  const computedProperty = group.property.startsWith("border-") && group.preservedPrefix !== undefined
    ? `${group.property}-color`
    : group.property;
  // Prefer style-token selectors (cheap, census-backed); fall back to the
  // first node-scoped selectors so pseudo/full-bleed paint is verified too.
  const selectors = group.selectors.filter((s) => s.startsWith(".wr-")).slice(0, 3);
  const nodeScoped = group.selectors
    .filter((s) => !s.startsWith(".wr-") && !s.includes("[data-wr-revealed"))
    .slice(0, 2);
  for (const selector of [...selectors, ...nodeScoped]) {
    const pseudoMatch = /::(before|after)$/.exec(selector);
    probes.push({
      paintGroupId: group.paintGroupId,
      token: group.semanticToken ?? "",
      property: group.property,
      selector: pseudoMatch ? selector.slice(0, -pseudoMatch[0].length) : selector,
      ...(pseudoMatch ? { pseudo: `::${pseudoMatch[1]}` as "::before" | "::after" } : {}),
      computedProperty,
      themeValue,
      kind: group.paintKind,
    });
  }
  return probes;
}

async function samplePaintApplication(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  probes: GroupProbe[],
): Promise<Map<string, { sampled: number; matched: number; sampleActual: string; expected: string }>> {
  const viewport = width < breakpoint ? "mobile" : "desktop";
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
    await installNameShim(page);
    await page.waitForTimeout(SETTLE_MS);
    const results = await page.evaluate(
      (args: { probes: GroupProbe[]; limit: number }) => {
        // Canonicalize an authored value through the browser's own computed
        // machinery: assign to a probe element, read back.
        const probeEl = document.createElement("div");
        document.body.appendChild(probeEl);
        const canonical = (property: string, value: string): string => {
          probeEl.style.cssText = "";
          probeEl.style.setProperty(property === "box-shadow" ? "box-shadow" : property, value);
          return window.getComputedStyle(probeEl).getPropertyValue(
            property === "box-shadow" ? "box-shadow" : property,
          );
        };
        const out: Record<string, { sampled: number; matched: number; sampleActual: string; expected: string }> = {};
        for (const probe of args.probes) {
          const expectedProperty =
            probe.kind === "color"
              ? "color"
              : probe.kind === "radius"
                ? "border-radius"
                : "box-shadow";
          const expected = canonical(expectedProperty, probe.themeValue).trim();
          let elements: Element[] = [];
          try {
            elements = [...document.querySelectorAll(probe.selector)].slice(0, args.limit);
          } catch {
            elements = [];
          }
          let sampled = 0;
          let matched = 0;
          let sampleActual = "";
          for (const el of elements) {
            const style = probe.pseudo
              ? window.getComputedStyle(el, probe.pseudo)
              : window.getComputedStyle(el);
            const actual = style.getPropertyValue(probe.computedProperty).trim();
            if (actual === "") continue;
            sampled++;
            if (sampleActual === "") sampleActual = actual;
            if (actual === expected) matched++;
          }
          const key = `${probe.paintGroupId}|${probe.selector}${probe.pseudo ?? ""}`;
          out[key] = { sampled, matched, sampleActual, expected };
        }
        probeEl.remove();
        return out;
      },
      { probes, limit: SAMPLES_PER_GROUP },
    );
    return new Map(Object.entries(results));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Interaction regression + dynamic-surface paint (§33)
// ---------------------------------------------------------------------------

interface TriggerState {
  patternId: string;
  nodeId: string;
  found: boolean;
  clicked: boolean;
  stateAfter?: string;
  regionsVisible: number;
  regionsOverflowViewport: number;
  /** Computed colors of themed dynamic-group samples inside mounted regions. */
  dynamicPaint: Record<string, { sampled: number; matched: number; sampleActual: string }>;
}

async function captureTriggers(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  dynamicProbes: { paintGroupId: string; className: string; computedProperty: string; kind: string; themeValue: string }[],
  screenshotFile?: string,
): Promise<TriggerState[]> {
  const viewport = width < breakpoint ? "mobile" : "desktop";
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const listPage = await context.newPage();
  await listPage.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
  await installNameShim(listPage);
  await listPage.waitForTimeout(SETTLE_MS);
  const triggers = await listPage.evaluate((activeViewport: string) => {
    const variant = document.querySelector(`.wr-variant[data-wr-viewport="${activeViewport}"]`);
    if (!variant) return [] as { patternId: string; nodeId: string; field?: string }[];
    const out: { patternId: string; nodeId: string; field?: string }[] = [];
    for (const el of variant.querySelectorAll("[data-wr-pattern-id]")) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      out.push({
        patternId: el.getAttribute("data-wr-pattern-id") ?? "",
        nodeId: el.getAttribute("data-wr-node") ?? "",
        field: el.getAttribute("data-wr-field") ?? undefined,
      });
    }
    return out;
  }, viewport);
  await listPage.close();

  const results: TriggerState[] = [];
  let shotTaken = false;
  for (const trigger of triggers) {
    const page = await context.newPage();
    try {
      await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
      await installNameShim(page);
      await page.waitForTimeout(SETTLE_MS);
      const selector = `.wr-variant[data-wr-viewport="${viewport}"] [data-wr-node="${trigger.nodeId}"][data-wr-pattern-id="${trigger.patternId}"]`;
      const locator = page.locator(selector).first();
      if ((await locator.count()) === 0) {
        results.push({ ...trigger, found: false, clicked: false, regionsVisible: 0, regionsOverflowViewport: 0, dynamicPaint: {} });
        continue;
      }
      let clicked = true;
      try {
        await locator.click({ timeout: 5_000 });
      } catch {
        clicked = false;
      }
      await page.waitForTimeout(400);
      const inspection = await page.evaluate(
        (args: {
          selector: string;
          field?: string;
          patternId: string;
          probes: { paintGroupId: string; className: string; computedProperty: string; kind: string; themeValue: string }[];
        }) => {
          const el = document.querySelector(args.selector);
          const stateAfter = el && args.field ? el.getAttribute(args.field) ?? undefined : undefined;
          let regionsVisible = 0;
          let regionsOverflowViewport = 0;
          const regions: Element[] = [];
          // Every runtime mount channel stamps a marker: declared-target
          // mounts get "wr-obs-…" ids / `data-wr-dynamic-target`, and
          // observed-channel mounts (static host, captured subtree mounted on
          // open) get `data-wr-obs-mounted` — include them all, or an
          // observed-channel panel is invisible to the dynamic-paint probes.
          for (const region of document.querySelectorAll(
            '[id^="wr-obs-"], [id^="wr-dyn-"], [data-wr-dynamic-target], [data-wr-obs-mounted]',
          )) {
            const rect = (region as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(region as HTMLElement);
            const visible =
              rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            if (!visible) continue;
            regionsVisible++;
            regions.push(region);
            if (rect.left < -8 || rect.right > window.innerWidth + 8) regionsOverflowViewport++;
          }
          const probeEl = document.createElement("div");
          document.body.appendChild(probeEl);
          const canonical = (property: string, value: string): string => {
            probeEl.style.cssText = "";
            probeEl.style.setProperty(property, value);
            return window.getComputedStyle(probeEl).getPropertyValue(property);
          };
          const dynamicPaint: Record<string, { sampled: number; matched: number; sampleActual: string }> = {};
          for (const probe of args.probes) {
            const expectedProperty =
              probe.kind === "color" ? "color" : probe.kind === "radius" ? "border-radius" : "box-shadow";
            const expected = canonical(expectedProperty, probe.themeValue).trim();
            let sampled = 0;
            let matched = 0;
            let sampleActual = "";
            for (const region of regions) {
              for (const target of region.querySelectorAll(`.${probe.className}`)) {
                if (sampled >= 5) break;
                const actual = window.getComputedStyle(target).getPropertyValue(probe.computedProperty).trim();
                if (actual === "") continue;
                sampled++;
                if (sampleActual === "") sampleActual = actual;
                if (actual === expected) matched++;
              }
            }
            if (sampled > 0) dynamicPaint[probe.paintGroupId] = { sampled, matched, sampleActual };
          }
          probeEl.remove();
          return { stateAfter, regionsVisible, regionsOverflowViewport, dynamicPaint };
        },
        { selector, field: trigger.field, patternId: trigger.patternId, probes: dynamicProbes },
      );
      if (screenshotFile && !shotTaken && inspection.regionsVisible > 0) {
        await page.screenshot({ path: screenshotFile, fullPage: false }).catch(() => {});
        shotTaken = true;
      }
      results.push({
        patternId: trigger.patternId,
        nodeId: trigger.nodeId,
        found: true,
        clicked,
        stateAfter: inspection.stateAfter,
        regionsVisible: inspection.regionsVisible,
        regionsOverflowViewport: inspection.regionsOverflowViewport,
        dynamicPaint: inspection.dynamicPaint,
      });
    } catch {
      results.push({ ...trigger, found: false, clicked: false, regionsVisible: 0, regionsOverflowViewport: 0, dynamicPaint: {} });
    } finally {
      await page.close();
    }
  }
  await context.close();
  return results;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function runThemeQa(options: ThemeQaOptions): Promise<ThemeQaReport> {
  const log = options.log ?? (() => {});
  const widths = options.widths ?? [390, 1440, 1920];
  const takeScreenshots = options.screenshots ?? true;

  const routeMap = JSON.parse(
    await readFile(path.join(options.template.appDir, "reconstruction-data", "route-map.json"), "utf8"),
  ) as RuntimeRouteMap;
  const breakpoint = routeMap.breakpoint;

  const screenshotsDir = path.join(options.runDir, "report", "screenshots");
  if (takeScreenshots) await mkdir(screenshotsDir, { recursive: true });
  const screenshots: string[] = [];
  const routeSlug = (route: string): string =>
    route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");

  log("[theme:qa] building template app");
  await buildApp(options.template.appDir, options.forceBuild ?? false, log);
  const upstream = await startApp(
    options.template.appDir,
    options.slotValuesFile !== undefined
      ? { WR_SLOT_VALUES_FILE: path.resolve(options.slotValuesFile) }
      : {},
  );
  const proxy = await startOverlayProxy(upstream.baseUrl, options.overlay.css);
  const browser = await chromium.launch();

  const pages: ThemeQaPage[] = [];
  const paintChecks: PaintApplicationCheck[] = [];
  const interactionChecks: ThemeInteractionCheck[] = [];
  const verifiedGroups = new Set<string>();
  const themedGroups = options.adapter.paintGroups.filter(
    (group) =>
      group.status === "themeable" &&
      group.semanticToken !== null &&
      options.theme.tokens[group.semanticToken] !== undefined,
  );

  try {
    // ---- page-level structural safety + contrast ----
    for (const route of options.routes) {
      for (const width of widths) {
        const viewport = width < breakpoint ? ("mobile" as const) : ("desktop" as const);
        log(`[theme:qa] page ${route} @${width}`);
        const shotBase = takeScreenshots
          ? path.join(screenshotsDir, `${routeSlug(route)}-${width}-base.png`)
          : undefined;
        const shotThemed = takeScreenshots
          ? path.join(screenshotsDir, `${routeSlug(route)}-${width}-themed.png`)
          : undefined;
        const base = await capturePage(browser, upstream.baseUrl, route, width, breakpoint, shotBase);
        const themed = await capturePage(browser, proxy.baseUrl, route, width, breakpoint, shotThemed);
        if (shotBase) screenshots.push(path.relative(options.runDir, shotBase));
        if (shotThemed) screenshots.push(path.relative(options.runDir, shotThemed));

        const domIdentical = base.domSignature === themed.domSignature;
        let compared = 0;
        let maxDelta = 0;
        const deltas: number[] = [];
        for (const [id, rect] of base.nodes) {
          const other = themed.nodes.get(id);
          if (!other) continue;
          compared++;
          const delta = Math.max(
            Math.abs(rect.x - other.x),
            Math.abs(rect.y - other.y),
            Math.abs(rect.w - other.w),
            Math.abs(rect.h - other.h),
          );
          deltas.push(delta);
          if (delta > maxDelta) maxDelta = delta;
        }
        deltas.sort((a, b) => a - b);
        const p95 = deltas.length === 0 ? 0 : deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))];
        const baseLow = new Set(base.lowContrastNodeIds);
        const newLow = themed.lowContrastNodeIds.filter((id) => !baseLow.has(id));
        const newHorizontalOverflow = themed.horizontalOverflow && !base.horizontalOverflow;
        const notes: string[] = [];
        if (!domIdentical) notes.push("DOM signature differs under theme");
        if (maxDelta > GEOMETRY_TOLERANCE_PX) notes.push(`geometry delta max ${maxDelta}px`);
        if (Math.abs(themed.docHeight - base.docHeight) > 1) {
          notes.push(`document height ${base.docHeight} → ${themed.docHeight}`);
        }
        if (newHorizontalOverflow) notes.push("themed page overflows horizontally");
        if (newLow.length > 0) notes.push(`new low-contrast text nodes: ${newLow.slice(0, 5).join(", ")}`);
        // A js error the unthemed BASELINE of the same app also emits (e.g.
        // the source CDN refusing cross-origin asset loads) is inherited, not
        // introduced by the theme overlay — only introduced errors fail.
        const introducedJsErrors = findIntroducedJsErrors(base.jsErrors, themed.jsErrors);
        if (introducedJsErrors.length > 0) {
          notes.push(`theme-introduced js error: ${introducedJsErrors[0]}`);
        } else if (themed.jsErrors.length > 0) {
          notes.push(
            `${themed.jsErrors.length} inherited js error(s) present in BOTH baseline and themed captures (first: ${themed.jsErrors[0]})`,
          );
        }
        if (themed.hydrationErrors.length > 0) notes.push(`hydration error: ${themed.hydrationErrors[0]}`);
        const pass =
          domIdentical &&
          maxDelta <= GEOMETRY_TOLERANCE_PX &&
          Math.abs(themed.docHeight - base.docHeight) <= 1 &&
          !newHorizontalOverflow &&
          introducedJsErrors.length === 0 &&
          themed.hydrationErrors.length === 0 &&
          newLow.length === 0;
        pages.push({
          route,
          width,
          viewport,
          domIdentical,
          baseDocHeight: base.docHeight,
          themedDocHeight: themed.docHeight,
          geometryComparedNodes: compared,
          geometryDeltaP95: p95,
          geometryDeltaMax: maxDelta,
          newHorizontalOverflow,
          jsErrors: themed.jsErrors.length,
          hydrationErrors: themed.hydrationErrors.length,
          newLowContrastTexts: newLow.length,
          pass,
          notes,
        });
        if (!pass) log(`[theme:qa]   FAIL — ${notes.join("; ")}`);
      }
    }

    // ---- computed paint application (canonical width per viewport) ----
    const probeRoutes = options.routes.slice(0, 3);
    for (const route of probeRoutes) {
      for (const [viewport, width] of [["desktop", 1440], ["mobile", 390]] as const) {
        const probes: GroupProbe[] = [];
        for (const group of themedGroups) {
          probes.push(...probesForGroup(group, options.theme.tokens[group.semanticToken!]!));
        }
        if (probes.length === 0) continue;
        log(`[theme:qa] paint ${route} ${viewport} (${probes.length} probes)`);
        const results = await samplePaintApplication(
          browser,
          proxy.baseUrl,
          route,
          width,
          breakpoint,
          probes,
        );
        const seenGroups = new Set<string>();
        for (const probe of probes) {
          const key = `${probe.paintGroupId}|${probe.selector}${probe.pseudo ?? ""}`;
          const result = results.get(key);
          if (!result || result.sampled === 0) continue;
          if (seenGroups.has(key + route + viewport)) continue;
          seenGroups.add(key + route + viewport);
          const applied = result.matched >= 1;
          if (applied) verifiedGroups.add(probe.paintGroupId);
          paintChecks.push({
            paintGroupId: probe.paintGroupId,
            token: probe.token,
            property: probe.property,
            route,
            viewport,
            surface: probe.pseudo !== undefined ? "pseudo" : "static",
            sampledElements: result.sampled,
            matchedElements: result.matched,
            expected: result.expected,
            sampleActual: result.sampleActual,
            applied,
          });
        }
      }
    }

    // ---- interaction regression + dynamic-surface paint (§33) ----
    if (!(options.skipInteractions ?? false)) {
      const dynamicProbes = themedGroups
        .filter((group) => group.dynamicElementCount > 0 && group.paintKind === "color")
        .slice(0, 6)
        .flatMap((group) => {
          const classSelector = group.selectors.find((s) => /^\.wr-st\d+$/.test(s));
          if (classSelector === undefined) return [];
          return [
            {
              paintGroupId: group.paintGroupId,
              className: classSelector.slice(1),
              computedProperty:
                group.preservedPrefix !== undefined ? `${group.property}-color` : group.property,
              kind: group.paintKind,
              themeValue: options.theme.tokens[group.semanticToken!]!,
            },
          ];
        });
      const interactionRoutes = options.routes.includes("/") ? ["/"] : options.routes.slice(0, 1);
      for (const route of interactionRoutes) {
        for (const width of [1440, 390]) {
          log(`[theme:qa] interactions ${route} @${width}`);
          const openShot = takeScreenshots
            ? path.join(screenshotsDir, `${routeSlug(route)}-${width}-menu-open-themed.png`)
            : undefined;
          const baseTriggers = await captureTriggers(
            browser,
            upstream.baseUrl,
            route,
            width,
            breakpoint,
            [],
          );
          const themedTriggers = await captureTriggers(
            browser,
            proxy.baseUrl,
            route,
            width,
            breakpoint,
            dynamicProbes,
            openShot,
          );
          if (openShot) screenshots.push(path.relative(options.runDir, openShot));
          const byKey = new Map(themedTriggers.map((t) => [`${t.patternId}|${t.nodeId}`, t]));
          for (const base of baseTriggers) {
            const themed = byKey.get(`${base.patternId}|${base.nodeId}`);
            if (!themed) {
              interactionChecks.push({
                route,
                width,
                patternId: base.patternId,
                nodeId: base.nodeId,
                equivalent: false,
                detail: "trigger missing in themed app",
              });
              continue;
            }
            const equivalent =
              base.found === themed.found &&
              base.clicked === themed.clicked &&
              base.stateAfter === themed.stateAfter &&
              base.regionsVisible === themed.regionsVisible &&
              themed.regionsOverflowViewport <= base.regionsOverflowViewport;
            for (const [groupId, paint] of Object.entries(themed.dynamicPaint)) {
              if (paint.matched >= 1) verifiedGroups.add(groupId);
              paintChecks.push({
                paintGroupId: groupId,
                token:
                  options.adapter.paintGroups.find((g) => g.paintGroupId === groupId)?.semanticToken ?? "",
                property:
                  options.adapter.paintGroups.find((g) => g.paintGroupId === groupId)?.property ?? "",
                route,
                viewport: width < breakpoint ? "mobile" : "desktop",
                surface: "dynamic-template",
                sampledElements: paint.sampled,
                matchedElements: paint.matched,
                expected: "themed value (canonicalized in page)",
                sampleActual: paint.sampleActual,
                applied: paint.matched >= 1,
              });
            }
            interactionChecks.push({
              route,
              width,
              patternId: base.patternId,
              nodeId: base.nodeId,
              equivalent,
              detail: equivalent
                ? `state=${themed.stateAfter ?? "-"}, regions ${themed.regionsVisible}`
                : `base {clicked:${base.clicked}, state:${base.stateAfter}, regions:${base.regionsVisible}} vs themed {clicked:${themed.clicked}, state:${themed.stateAfter}, regions:${themed.regionsVisible}}`,
            });
          }
        }
      }
    }
  } finally {
    await browser.close();
    await proxy.stop();
    await upstream.stop();
  }

  const perToken: Record<string, { groups: number; elementWeight: number }> = {};
  for (const group of themedGroups) {
    const token = group.semanticToken!;
    const entry = perToken[token] ?? { groups: 0, elementWeight: 0 };
    entry.groups++;
    entry.elementWeight += group.staticElementCount + group.dynamicElementCount;
    perToken[token] = entry;
  }

  const pass =
    pages.every((page) => page.pass) &&
    interactionChecks.every((check) => check.equivalent) &&
    paintChecks.every((check) => check.applied);

  return ThemeQaReportSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    runId: options.runId,
    templateId: options.template.manifest.templateId,
    themeId: options.theme.themeId,
    baseline: options.slotValuesFile !== undefined ? "content-injected" : "default",
    widths,
    routes: options.routes,
    pages,
    paintChecks,
    interactionChecks,
    coverage: {
      themedGroups: themedGroups.length,
      verifiedGroups: verifiedGroups.size,
      themedElementWeight: themedGroups.reduce(
        (sum, group) => sum + group.staticElementCount + group.dynamicElementCount,
        0,
      ),
      preservedGroups: options.adapter.coverage.preservedGroups,
      reviewGroups: options.adapter.coverage.reviewGroups,
      perToken,
    },
    screenshots: screenshots.sort(),
    pass,
  });
}
