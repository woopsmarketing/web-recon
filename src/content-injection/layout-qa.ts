import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { buildApp, findIntroducedJsErrors, startApp } from "../recon-template/parity-qa.js";
import type { RuntimeRouteMap } from "../reconstruction/index.js";
import type { SlotBinding, SlotDefinition, SlotValue } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  CONTENT_SCHEMA_VERSION,
  LayoutQaReportSchema,
  type AppliedValueCheck,
  type InteractionRegressionCheck,
  type LayoutPageCheck,
  type LayoutQaReport,
  type RepairCandidate,
  type SlotLayoutObservation,
} from "./types.js";

/**
 * Content Layout Safety QA (Task 19 §24–§26, §33–§34).
 *
 * The Exact-Clone parity question ("is the content identical?") is meaningless
 * for an injected site — the content changed on purpose. The question here is:
 *
 *   "Did the new content break the layout the template guarantees?"
 *
 * Both renders come from the SAME immutable template app — default content vs
 * the run's slot-values overlay (`WR_SLOT_VALUES_FILE`) — so every difference
 * is attributable to content alone.
 *
 * Checks: text clipping, horizontal overflow, section collision, neighbor
 * displacement, viewport overflow of dynamic menus, runtime/hydration errors,
 * applied-value verification on every changed binding (static + mounted
 * dynamic templates), and interaction regression. Reference line counts are
 * DIAGNOSTIC evidence (§25): a 2→3 line change with an intact layout passes;
 * clipping/collision fails regardless of counts.
 */

const SETTLE_MS = 900;
const OVERLAP_TOLERANCE_PX = 8;
const CLIP_TOLERANCE_PX = 2;

export interface ContentLayoutQaOptions {
  runId: string;
  runDir: string;
  template: LoadedReconTemplate;
  slotValuesFile: string;
  routes: string[];
  widths?: number[];
  forceBuild?: boolean;
  skipInteractions?: boolean;
  screenshots?: boolean;
  log?: (line: string) => void;
}

interface SectionBox {
  sig: string;
  y: number;
  h: number;
}

interface SlotNodeProbe {
  nodeId: string;
  found: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  scrollW: number;
  clientW: number;
  scrollH: number;
  clientH: number;
  lineHeightPx?: number;
  overflowHidden: boolean;
  lineClamp: boolean;
  nextSiblingY?: number;
  overlapsNextSibling: boolean;
  sectionY?: number;
  sectionH?: number;
}

interface CapturedPage {
  docHeight: number;
  horizontalOverflow: boolean;
  sections: SectionBox[];
  probes: Map<string, SlotNodeProbe>;
  jsErrors: string[];
  hydrationErrors: string[];
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

/** tsx/esbuild wraps named functions with a module-local `__name` helper that
 * does not exist in the browser; install a no-op shim (as a string, so it is
 * not itself transformed) before any serialized evaluate. */
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

async function capturePage(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  probeNodeIds: string[],
  screenshotFile?: string,
): Promise<CapturedPage> {
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
      (args: { viewport: string; probeNodeIds: string[] }) => {
        const round = (v: number): number => Math.round(v * 10) / 10;
        const doc = document.documentElement;
        const variant = document.querySelector(
          `.wr-variant[data-wr-viewport="${args.viewport}"]`,
        ) as HTMLElement | null;
        const sections: { sig: string; y: number; h: number }[] = [];
        if (variant) {
          const landmarks = variant.querySelectorAll("header, main, footer, nav, section");
          let index = 0;
          for (const el of landmarks) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.height <= 0) continue;
            sections.push({
              sig: `${el.tagName.toLowerCase()}#${index++}`,
              y: round(rect.y + window.scrollY),
              h: round(rect.height),
            });
          }
        }
        const probes: Record<string, unknown> = {};
        for (const nodeId of args.probeNodeIds) {
          const el = variant?.querySelector(`[data-wr-node="${nodeId}"]`) as HTMLElement | null;
          if (!el) {
            probes[nodeId] = { nodeId, found: false };
            continue;
          }
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const lineHeight = parseFloat(style.lineHeight);
          const next = el.nextElementSibling as HTMLElement | null;
          const nextRect = next ? next.getBoundingClientRect() : undefined;
          // Inline boxes of a wrapped run legitimately overlap by bounding
          // box (a 2-line inline heading's rect covers the sibling's first
          // line) — only block-level owners can produce a real collision.
          const inlineOwner = style.display.startsWith("inline");
          const overlaps =
            !inlineOwner &&
            nextRect !== undefined &&
            rect.bottom > nextRect.top + 8 &&
            rect.top < nextRect.bottom &&
            rect.right > nextRect.left &&
            rect.left < nextRect.right &&
            // vertical stacking only: side-by-side flex items are not overlap
            Math.abs(nextRect.top - rect.top) > 4;
          const sectionEl = el.closest("header, main, footer, nav, section") as HTMLElement | null;
          const sectionRect = sectionEl ? sectionEl.getBoundingClientRect() : undefined;
          probes[nodeId] = {
            nodeId,
            found: true,
            x: round(rect.x + window.scrollX),
            y: round(rect.y + window.scrollY),
            w: round(rect.width),
            h: round(rect.height),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            scrollH: el.scrollHeight,
            clientH: el.clientHeight,
            lineHeightPx: Number.isFinite(lineHeight) ? lineHeight : undefined,
            overflowHidden: style.overflow === "hidden" || style.overflowY === "hidden",
            lineClamp:
              style.getPropertyValue("-webkit-line-clamp") !== "" &&
              style.getPropertyValue("-webkit-line-clamp") !== "none",
            nextSiblingY: nextRect ? round(nextRect.y + window.scrollY) : undefined,
            overlapsNextSibling: overlaps === true,
            sectionY: sectionRect ? round(sectionRect.y + window.scrollY) : undefined,
            sectionH: sectionRect ? round(sectionRect.height) : undefined,
          };
        }
        return {
          docHeight: doc.scrollHeight,
          horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
          sections,
          probes,
        };
      },
      { viewport, probeNodeIds },
    );
    if (screenshotFile) {
      await page.screenshot({ path: screenshotFile, fullPage: true }).catch(() => {});
    }
    const probes = new Map<string, SlotNodeProbe>();
    for (const [nodeId, probe] of Object.entries(captured.probes)) {
      probes.set(nodeId, probe as SlotNodeProbe);
    }
    return {
      docHeight: captured.docHeight,
      horizontalOverflow: captured.horizontalOverflow,
      sections: captured.sections,
      probes,
      jsErrors,
      hydrationErrors,
    };
  } finally {
    await context.close();
  }
}

/** Pairs of vertically overlapping sections, `a|b` sigs, nesting excluded. */
function sectionCollisions(sections: SectionBox[]): Set<string> {
  const collisions = new Set<string>();
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const contained =
        (a.y <= b.y + 1 && a.y + a.h >= b.y + b.h - 1) ||
        (b.y <= a.y + 1 && b.y + b.h >= a.y + a.h - 1);
      if (!contained && overlap > OVERLAP_TOLERANCE_PX) collisions.add(`${a.sig}|${b.sig}`);
    }
  }
  return collisions;
}

function lineCountOf(probe: SlotNodeProbe | undefined): number | undefined {
  if (!probe || !probe.found || probe.lineHeightPx === undefined || probe.lineHeightPx <= 0) {
    return undefined;
  }
  return Math.max(1, Math.round(probe.h / probe.lineHeightPx));
}

function referenceLineCount(slot: SlotDefinition, viewport: "desktop" | "mobile"): number | undefined {
  const constraints = slot.constraints as
    | { desktop?: { lineCount?: number }; mobile?: { lineCount?: number } }
    | undefined;
  const value = constraints?.[viewport]?.lineCount;
  return typeof value === "number" ? value : undefined;
}

function projectExpected(value: SlotValue, binding: SlotBinding): string | undefined {
  if (typeof value === "string") return binding.field === undefined ? value : undefined;
  if (binding.field !== undefined) {
    const v = (value as Record<string, unknown>)[binding.field];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Applied-value verification (batched per page load)
// ---------------------------------------------------------------------------

interface StaticCheckSpec {
  slotKey: string;
  bindingId: string;
  nodeId: string;
  surface: "static" | "paint-twin";
  target: "text" | "attribute" | "svg-text";
  attributeName?: string;
  expected: string;
}

async function verifyStaticBatch(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  viewport: "desktop" | "mobile",
  specs: StaticCheckSpec[],
): Promise<{ bindingId: string; applied: boolean; detail: string }[]> {
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
await installNameShim(page);
    await page.waitForTimeout(SETTLE_MS);
    return await page.evaluate(
      (args: { viewport: string; specs: StaticCheckSpec[] }) => {
        const out: { bindingId: string; applied: boolean; detail: string }[] = [];
        for (const spec of args.specs) {
          const el = document.querySelector(
            `.wr-variant[data-wr-viewport="${args.viewport}"] [data-wr-node="${spec.nodeId}"]`,
          );
          if (!el) {
            out.push({ bindingId: spec.bindingId, applied: false, detail: "node not found" });
            continue;
          }
          if (spec.target === "attribute") {
            const actual = el.getAttribute(spec.attributeName ?? "");
            out.push({
              bindingId: spec.bindingId,
              applied: actual === spec.expected,
              detail: `attribute ${spec.attributeName}=${JSON.stringify(actual)?.slice(0, 80)}`,
            });
            continue;
          }
          if (spec.target === "svg-text") {
            const scope = el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg") ?? el;
            const runs: string[] = [];
            for (const textEl of scope.querySelectorAll("text, tspan")) {
              for (const child of textEl.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "") {
                  runs.push(child.textContent ?? "");
                }
              }
            }
            out.push({
              bindingId: spec.bindingId,
              applied: runs.includes(spec.expected),
              detail: `svg text runs ${JSON.stringify(runs.map((t) => t.slice(0, 40)))}`,
            });
            continue;
          }
          const texts: string[] = [];
          for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) texts.push(child.textContent ?? "");
          }
          out.push({
            bindingId: spec.bindingId,
            applied: texts.includes(spec.expected),
            detail: `text children ${JSON.stringify(texts.map((t) => t.slice(0, 40)))}`,
          });
        }
        return out;
      },
      { viewport, specs },
    );
  } finally {
    await context.close();
  }
}

interface DynamicCheckSpec {
  slotKey: string;
  bindingId: string;
  triggerNodeId: string;
  /** svg-text verifies like text: SVG text participates in textContent. */
  target: "text" | "attribute" | "svg-text";
  attributeName?: string;
  expected: string;
}

async function verifyDynamicBatch(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  viewport: "desktop" | "mobile",
  triggerNodeId: string,
  specs: DynamicCheckSpec[],
): Promise<{ bindingId: string; applied: boolean; detail: string }[]> {
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
await installNameShim(page);
    await page.waitForTimeout(SETTLE_MS);
    const trigger = page
      .locator(`.wr-variant[data-wr-viewport="${viewport}"] [data-wr-node="${triggerNodeId}"]`)
      .first();
    if ((await trigger.count()) === 0) {
      return specs.map((s) => ({ bindingId: s.bindingId, applied: false, detail: "trigger not found" }));
    }
    try {
      await trigger.click({ timeout: 5_000 });
    } catch {
      return specs.map((s) => ({ bindingId: s.bindingId, applied: false, detail: "trigger not clickable" }));
    }
    await page.waitForTimeout(500);
    return await page.evaluate(
      (args: { specs: DynamicCheckSpec[] }) => {
        // Every runtime mount channel stamps a marker: declared-target mounts
        // set `data-wr-dynamic-target` (ids "wr-obs-…"), and observed-channel
        // mounts (static host whose captured subtree is mounted on open) set
        // `data-wr-obs-mounted` / `data-wr-dynamic-content` — include them all,
        // or an observed-channel panel is invisible to this check.
        const regions = [
          ...document.querySelectorAll(
            '[id^="wr-obs-"], [data-wr-dynamic-target], [data-wr-obs-mounted]',
          ),
        ];
        return args.specs.map((spec) => {
          for (const region of regions) {
            if (spec.target !== "attribute") {
              if ((region.textContent ?? "").includes(spec.expected)) {
                return { bindingId: spec.bindingId, applied: true, detail: `found in #${region.id}` };
              }
            } else {
              for (const el of region.querySelectorAll(`[${spec.attributeName}]`)) {
                if (el.getAttribute(spec.attributeName ?? "") === spec.expected) {
                  return { bindingId: spec.bindingId, applied: true, detail: `attr in #${region.id}` };
                }
              }
            }
          }
          return {
            bindingId: spec.bindingId,
            applied: false,
            detail: `value not found in ${regions.length} mounted region(s)`,
          };
        });
      },
      { specs },
    );
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Interaction regression (dynamic menus keep opening; no viewport overflow)
// ---------------------------------------------------------------------------

interface TriggerState {
  patternId: string;
  nodeId: string;
  found: boolean;
  clicked: boolean;
  stateAfter?: string;
  regionsVisible: number;
  regionsOverflowViewport: number;
}

async function captureTriggers(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
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
  for (const trigger of triggers) {
    const page = await context.newPage();
    try {
      await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
await installNameShim(page);
      await page.waitForTimeout(SETTLE_MS);
      const selector = `.wr-variant[data-wr-viewport="${viewport}"] [data-wr-node="${trigger.nodeId}"][data-wr-pattern-id="${trigger.patternId}"]`;
      const locator = page.locator(selector).first();
      if ((await locator.count()) === 0) {
        results.push({ ...trigger, found: false, clicked: false, regionsVisible: 0, regionsOverflowViewport: 0 });
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
        (args: { selector: string; field?: string; patternId: string }) => {
          const el = document.querySelector(args.selector);
          const stateAfter = el && args.field ? el.getAttribute(args.field) ?? undefined : undefined;
          let regionsVisible = 0;
          let regionsOverflowViewport = 0;
          for (const region of document.querySelectorAll(
            `[id^="wr-obs-${args.patternId}-"], [id^="wr-dyn-"]`,
          )) {
            const rect = (region as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(region as HTMLElement);
            const visible =
              rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            if (!visible) continue;
            regionsVisible++;
            if (rect.left < -8 || rect.right > window.innerWidth + 8) regionsOverflowViewport++;
          }
          return { stateAfter, regionsVisible, regionsOverflowViewport };
        },
        { selector, field: trigger.field, patternId: trigger.patternId },
      );
      results.push({
        patternId: trigger.patternId,
        nodeId: trigger.nodeId,
        found: true,
        clicked,
        stateAfter: inspection.stateAfter,
        regionsVisible: inspection.regionsVisible,
        regionsOverflowViewport: inspection.regionsOverflowViewport,
      });
    } catch {
      results.push({ ...trigger, found: false, clicked: false, regionsVisible: 0, regionsOverflowViewport: 0 });
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

export async function runContentLayoutQa(options: ContentLayoutQaOptions): Promise<LayoutQaReport> {
  const log = options.log ?? (() => {});
  const template = options.template;
  const widths = options.widths ?? [390, 1440];
  const takeScreenshots = options.screenshots ?? true;

  const overlay = JSON.parse(await readFile(options.slotValuesFile, "utf8")) as Record<
    string,
    SlotValue
  >;
  const changed = new Map<string, SlotValue>();
  for (const [key, value] of Object.entries(overlay)) {
    const original = template.defaultContent.values[key];
    if (JSON.stringify(value) !== JSON.stringify(original)) changed.set(key, value);
  }

  const routeMap = JSON.parse(
    await readFile(path.join(template.appDir, "reconstruction-data", "route-map.json"), "utf8"),
  ) as RuntimeRouteMap;
  const breakpoint = routeMap.breakpoint;
  const routeForPage = new Map<string, string>();
  for (const route of routeMap.routes) {
    if (!routeForPage.has(route.pageSourceId)) routeForPage.set(route.pageSourceId, route.key);
  }
  const scopedRouteSet = new Set(options.routes);

  // Changed static text bindings per (route, viewport) → probe node ids.
  interface ChangedBinding {
    slot: SlotDefinition;
    binding: SlotBinding;
    route: string;
    expected: string | undefined;
  }
  const changedBindings: ChangedBinding[] = [];
  for (const [key, value] of changed) {
    const slot = template.slotByKey.get(key);
    if (!slot) continue;
    for (const binding of template.bindingsBySlotId.get(slot.id) ?? []) {
      const route = routeForPage.get(binding.pageId);
      if (route === undefined || !scopedRouteSet.has(route)) continue;
      changedBindings.push({ slot, binding, route, expected: projectExpected(value, binding) });
    }
  }

  // ---- offline stale-twin scan (§16 / Task 19.1 severity split) ----
  // A changed text whose DEFAULT string still occurs in the page tree at an
  // address NO binding writes has an UNSLOTTED duplicate. Task 19.1 co-binds
  // proven paint twins (surface `paint-twin`), so those addresses now count
  // as bound and stay synchronized. What remains splits by landmark section:
  //
  //   desync  — the unbound copy shares a landmark section with a bound
  //             occurrence of the same string (Stripe-hero-shaped double
  //             exposure risk) → the page FAILS; repair is a revert.
  //   remnant — the unbound copy lives in a DIFFERENT landmark section (e.g.
  //             a decorative aria-hidden product-mockup string that merely
  //             equals a nav label) → recorded for the operator, not a
  //             failure: the mockup region is preserved-by-design and no
  //             double exposure can occur at the changed occurrence.
  interface TwinFinding {
    slotKey: string;
    route: string;
    viewport: "desktop" | "mobile";
    kind: "desync" | "remnant";
    occurrences: number;
    boundOccurrences: number;
    unboundSections: string[];
  }
  const twinFindings: TwinFinding[] = [];
  {
    const boundOwnersByValue = new Map<string, Set<string>>();
    for (const b of template.bindingsFile.bindings) {
      if ((b.surface !== "static" && b.surface !== "paint-twin") || b.target !== "text") continue;
      const k = `${b.pageId}|${b.viewport}|${b.expectedValue}`;
      const set = boundOwnersByValue.get(k) ?? new Set<string>();
      set.add(b.nodeId);
      boundOwnersByValue.set(k, set);
    }
    interface LooseNode {
      k?: string;
      n?: string;
      t?: string;
      v?: string;
      c?: LooseNode[];
    }
    interface TextHit {
      ownerId: string;
      section: string;
    }
    const collect = (
      node: LooseNode,
      wanted: Set<string>,
      landmark: string,
      out: Map<string, TextHit[]>,
    ): void => {
      const nextLandmark =
        node.t === "header" || node.t === "footer" || node.t === "main" || node.t === "nav"
          ? node.t
          : landmark;
      for (const child of node.c ?? []) {
        if (child.k === "t") {
          if (typeof child.v === "string" && wanted.has(child.v)) {
            const list = out.get(child.v) ?? [];
            list.push({ ownerId: node.n ?? "", section: nextLandmark });
            out.set(child.v, list);
          }
          continue;
        }
        collect(child, wanted, nextLandmark, out);
      }
    };
    const wantedDefaults = new Set<string>();
    for (const cb of changedBindings) {
      const def = template.defaultContent.values[cb.slot.key];
      if (typeof def === "string" && def.trim().length >= 4) wantedDefaults.add(def);
    }
    const hitsCache = new Map<string, { desktop: Map<string, TextHit[]>; mobile: Map<string, TextHit[]> }>();
    for (const route of options.routes) {
      const pageId = routeMap.routes.find((r) => r.key === route)?.pageSourceId;
      if (!pageId) continue;
      let hits = hitsCache.get(pageId);
      if (!hits) {
        const pageJson = JSON.parse(
          await readFile(
            path.join(template.appDir, "reconstruction-data", "pages", `${pageId}.json`),
            "utf8",
          ),
        ) as { desktop: { doc: LooseNode }; mobile: { doc: LooseNode } };
        hits = { desktop: new Map(), mobile: new Map() };
        collect(pageJson.desktop.doc, wantedDefaults, "body", hits.desktop);
        collect(pageJson.mobile.doc, wantedDefaults, "body", hits.mobile);
        hitsCache.set(pageId, hits);
      }
      const seen = new Set<string>();
      for (const cb of changedBindings) {
        if (cb.route !== route || cb.binding.target !== "text") continue;
        const def = template.defaultContent.values[cb.slot.key];
        if (typeof def !== "string" || def.trim().length < 4) continue;
        const vp = cb.binding.viewport;
        const dedupe = `${cb.slot.key}|${vp}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const occurrences = hits[vp].get(def) ?? [];
        const boundOwners =
          boundOwnersByValue.get(`${cb.binding.pageId}|${vp}|${def}`) ?? new Set<string>();
        const unbound = occurrences.filter((o) => !boundOwners.has(o.ownerId));
        if (unbound.length === 0) continue;
        const boundSections = new Set(
          occurrences.filter((o) => boundOwners.has(o.ownerId)).map((o) => o.section),
        );
        const desync = unbound.some((o) => boundSections.has(o.section));
        twinFindings.push({
          slotKey: cb.slot.key,
          route,
          viewport: vp,
          kind: desync ? "desync" : "remnant",
          occurrences: occurrences.length,
          boundOccurrences: occurrences.length - unbound.length,
          unboundSections: [...new Set(unbound.map((o) => o.section))].sort(),
        });
      }
    }
  }

  const probeIdsFor = (route: string, viewport: "desktop" | "mobile"): string[] => {
    const ids = new Set<string>();
    for (const cb of changedBindings) {
      if (cb.route !== route) continue;
      if (cb.binding.viewport !== viewport) continue;
      if (cb.binding.surface !== "static") continue;
      if (cb.binding.target !== "text") continue;
      ids.add(cb.binding.nodeId);
    }
    return [...ids].sort();
  };

  const screenshotsDir = path.join(options.runDir, "report", "screenshots");
  if (takeScreenshots) await mkdir(screenshotsDir, { recursive: true });
  const screenshots: string[] = [];
  const routeSlug = (route: string): string =>
    route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");

  log("[content:qa] building template app");
  await buildApp(template.appDir, options.forceBuild ?? false, log);
  const defaultApp = await startApp(template.appDir);
  const injectedApp = await startApp(template.appDir, {
    WR_SLOT_VALUES_FILE: path.resolve(options.slotValuesFile),
  });
  const browser = await chromium.launch();

  const pages: LayoutPageCheck[] = [];
  const slotObservations: SlotLayoutObservation[] = [];
  const appliedChecks: AppliedValueCheck[] = [];
  const interactionChecks: InteractionRegressionCheck[] = [];

  try {
    for (const route of options.routes) {
      for (const width of widths) {
        const viewport = width < breakpoint ? ("mobile" as const) : ("desktop" as const);
        log(`[content:qa] layout ${route} @${width}`);
        const probeIds = probeIdsFor(route, viewport);
        const shotDefault = takeScreenshots
          ? path.join(screenshotsDir, `${routeSlug(route)}-${width}-default.png`)
          : undefined;
        const shotInjected = takeScreenshots
          ? path.join(screenshotsDir, `${routeSlug(route)}-${width}-injected.png`)
          : undefined;
        const defaultCapture = await capturePage(
          browser,
          defaultApp.baseUrl,
          route,
          width,
          breakpoint,
          probeIds,
          shotDefault,
        );
        const injectedCapture = await capturePage(
          browser,
          injectedApp.baseUrl,
          route,
          width,
          breakpoint,
          probeIds,
          shotInjected,
        );
        if (shotDefault) screenshots.push(path.relative(options.runDir, shotDefault));
        if (shotInjected) screenshots.push(path.relative(options.runDir, shotInjected));

        const defaultCollisions = sectionCollisions(defaultCapture.sections);
        const injectedCollisions = sectionCollisions(injectedCapture.sections);
        const newCollisions = [...injectedCollisions].filter((c) => !defaultCollisions.has(c));

        const notes: string[] = [];
        let hardClip = false;
        const seenSlotViewport = new Set<string>();
        for (const cb of changedBindings) {
          if (cb.route !== route || cb.binding.viewport !== viewport) continue;
          if (cb.binding.surface !== "static" || cb.binding.target !== "text") continue;
          const dedupe = `${cb.slot.key}|${cb.binding.nodeId}|${width}`;
          if (seenSlotViewport.has(dedupe)) continue;
          seenSlotViewport.add(dedupe);
          const before = defaultCapture.probes.get(cb.binding.nodeId);
          const after = injectedCapture.probes.get(cb.binding.nodeId);
          const clippedH =
            after !== undefined && after.found && after.scrollW > after.clientW + CLIP_TOLERANCE_PX;
          const clippedV =
            after !== undefined &&
            after.found &&
            (after.overflowHidden || after.lineClamp) &&
            after.scrollH > after.clientH + CLIP_TOLERANCE_PX;
          // Only a clip the DEFAULT render did not already have counts.
          const beforeClippedH =
            before !== undefined && before.found && before.scrollW > before.clientW + CLIP_TOLERANCE_PX;
          const beforeClippedV =
            before !== undefined &&
            before.found &&
            (before.overflowHidden || before.lineClamp) &&
            before.scrollH > before.clientH + CLIP_TOLERANCE_PX;
          const newClipH = clippedH && !beforeClippedH;
          const newClipV = clippedV && !beforeClippedV;
          const overlaps =
            after !== undefined &&
            after.found &&
            after.overlapsNextSibling &&
            !(before !== undefined && before.found && before.overlapsNextSibling);
          if (newClipH || newClipV || overlaps) hardClip = true;
          slotObservations.push({
            slotKey: cb.slot.key,
            route,
            viewport,
            width,
            nodeId: cb.binding.nodeId,
            found: after?.found === true,
            referenceLineCount: referenceLineCount(cb.slot, viewport),
            defaultLineCount: lineCountOf(before),
            injectedLineCount: lineCountOf(after),
            clippedHorizontally: newClipH,
            clippedVertically: newClipV,
            overlapsFollowingSibling: overlaps === true,
            ...(before?.found
              ? { boxBefore: { x: before.x, y: before.y, w: before.w, h: before.h } }
              : {}),
            ...(after?.found ? { boxAfter: { x: after.x, y: after.y, w: after.w, h: after.h } } : {}),
            ...(before?.found && before.sectionY !== undefined && before.sectionH !== undefined
              ? { sectionBefore: { y: before.sectionY, h: before.sectionH } }
              : {}),
            ...(after?.found && after.sectionY !== undefined && after.sectionH !== undefined
              ? { sectionAfter: { y: after.sectionY, h: after.sectionH } }
              : {}),
            ...(before?.found &&
            after?.found &&
            before.nextSiblingY !== undefined &&
            after.nextSiblingY !== undefined
              ? { neighborDisplacement: Math.round((after.nextSiblingY - before.nextSiblingY) * 10) / 10 }
              : {}),
          });
        }

        const pageTwins = twinFindings.filter(
          (t) => t.route === route && t.viewport === viewport && t.kind === "desync",
        );
        if (pageTwins.length > 0) {
          notes.push(
            `unslotted duplicate text desync: ${[...new Set(pageTwins.map((t) => t.slotKey))].join(", ")}`,
          );
        }
        const pageRemnants = twinFindings.filter(
          (t) => t.route === route && t.viewport === viewport && t.kind === "remnant",
        );
        if (pageRemnants.length > 0) {
          // Recorded, never failing: the duplicate lives in a different
          // landmark section (decorative mockup regions etc.).
          notes.push(
            `stale duplicate remnant (non-failing): ${[...new Set(pageRemnants.map((t) => t.slotKey))].join(", ")}`,
          );
        }
        const newHorizontalOverflow =
          injectedCapture.horizontalOverflow && !defaultCapture.horizontalOverflow;
        if (newHorizontalOverflow) notes.push("injected page overflows horizontally");
        if (newCollisions.length > 0) notes.push(`new section collisions: ${newCollisions.join(", ")}`);
        if (hardClip) notes.push("changed slot content is clipped or overlaps a sibling");
        // A js error the DEFAULT capture of the same app also emits (e.g. the
        // source CDN refusing cross-origin asset loads) is inherited, not
        // introduced by the injected content — only introduced errors fail.
        const introducedJsErrors = findIntroducedJsErrors(
          defaultCapture.jsErrors,
          injectedCapture.jsErrors,
        );
        if (introducedJsErrors.length > 0) {
          notes.push(`content-introduced js error: ${introducedJsErrors[0]}`);
        } else if (injectedCapture.jsErrors.length > 0) {
          notes.push(
            `${injectedCapture.jsErrors.length} inherited js error(s) present in BOTH default and injected captures (first: ${injectedCapture.jsErrors[0]})`,
          );
        }
        if (injectedCapture.hydrationErrors.length > 0) {
          notes.push(`hydration error: ${injectedCapture.hydrationErrors[0]}`);
        }
        // Document height change alone is NOT a failure (§26): content may
        // legitimately reflow. It is recorded for the operator.
        const pass =
          introducedJsErrors.length === 0 &&
          injectedCapture.hydrationErrors.length === 0 &&
          !newHorizontalOverflow &&
          newCollisions.length === 0 &&
          !hardClip &&
          pageTwins.length === 0;
        pages.push({
          route,
          width,
          viewport,
          defaultDocHeight: defaultCapture.docHeight,
          injectedDocHeight: injectedCapture.docHeight,
          horizontalOverflowDefault: defaultCapture.horizontalOverflow,
          horizontalOverflowInjected: injectedCapture.horizontalOverflow,
          sectionCollisions: newCollisions,
          injectedJsErrors: injectedCapture.jsErrors.length,
          injectedHydrationErrors: injectedCapture.hydrationErrors.length,
          pass,
          notes,
        });
        if (!pass) log(`[content:qa]   FAIL — ${notes.join("; ")}`);
      }
    }

    // ---- applied-value verification (canonical width per viewport) ----
    const staticGroups = new Map<string, { route: string; viewport: "desktop" | "mobile"; specs: StaticCheckSpec[] }>();
    const dynamicGroups = new Map<
      string,
      { route: string; viewport: "desktop" | "mobile"; triggerNodeId: string; specs: DynamicCheckSpec[] }
    >();
    for (const cb of changedBindings) {
      if (cb.expected === undefined) continue;
      const viewport = cb.binding.viewport;
      // static AND paint-twin occurrences verify on the plain page load; only
      // dynamic-template occurrences need their trigger clicked first.
      if (cb.binding.surface !== "dynamic-template") {
        const key = `${cb.route}|${viewport}`;
        const group = staticGroups.get(key) ?? { route: cb.route, viewport, specs: [] };
        group.specs.push({
          slotKey: cb.slot.key,
          bindingId: cb.binding.bindingId,
          nodeId: cb.binding.nodeId,
          surface: cb.binding.surface as "static" | "paint-twin",
          target: cb.binding.target,
          ...(cb.binding.attributeName !== undefined ? { attributeName: cb.binding.attributeName } : {}),
          expected: cb.expected,
        });
        staticGroups.set(key, group);
      } else {
        const key = `${cb.route}|${viewport}|${cb.binding.nodeId}`;
        const group =
          dynamicGroups.get(key) ?? { route: cb.route, viewport, triggerNodeId: cb.binding.nodeId, specs: [] };
        group.specs.push({
          slotKey: cb.slot.key,
          bindingId: cb.binding.bindingId,
          triggerNodeId: cb.binding.nodeId,
          target: cb.binding.target,
          ...(cb.binding.attributeName !== undefined ? { attributeName: cb.binding.attributeName } : {}),
          expected: cb.expected,
        });
        dynamicGroups.set(key, group);
      }
    }
    for (const group of staticGroups.values()) {
      const width = group.viewport === "mobile" ? 390 : 1440;
      log(`[content:qa] applied static ${group.route} ${group.viewport} (${group.specs.length})`);
      const results = await verifyStaticBatch(
        browser,
        injectedApp.baseUrl,
        group.route,
        width,
        breakpoint,
        group.viewport,
        group.specs,
      );
      const byBinding = new Map(results.map((r) => [r.bindingId, r]));
      for (const spec of group.specs) {
        const r = byBinding.get(spec.bindingId);
        appliedChecks.push({
          slotKey: spec.slotKey,
          bindingId: spec.bindingId,
          surface: spec.surface,
          route: group.route,
          viewport: group.viewport,
          applied: r?.applied === true,
          detail: r?.detail ?? "no result",
        });
      }
    }
    for (const group of dynamicGroups.values()) {
      const width = group.viewport === "mobile" ? 390 : 1440;
      log(`[content:qa] applied dynamic ${group.route} ${group.viewport} trigger ${group.triggerNodeId}`);
      const results = await verifyDynamicBatch(
        browser,
        injectedApp.baseUrl,
        group.route,
        width,
        breakpoint,
        group.viewport,
        group.triggerNodeId,
        group.specs,
      );
      const byBinding = new Map(results.map((r) => [r.bindingId, r]));
      for (const spec of group.specs) {
        const r = byBinding.get(spec.bindingId);
        appliedChecks.push({
          slotKey: spec.slotKey,
          bindingId: spec.bindingId,
          surface: "dynamic-template",
          route: group.route,
          viewport: group.viewport,
          applied: r?.applied === true,
          detail: r?.detail ?? "no result",
        });
      }
    }

    // ---- interaction regression (§34) ----
    if (!(options.skipInteractions ?? false)) {
      const interactionRoutes = options.routes.includes("/") ? ["/"] : options.routes.slice(0, 1);
      for (const route of interactionRoutes) {
        for (const width of [1440, 390]) {
          log(`[content:qa] interactions ${route} @${width}`);
          const defaults = await captureTriggers(browser, defaultApp.baseUrl, route, width, breakpoint);
          const injected = await captureTriggers(browser, injectedApp.baseUrl, route, width, breakpoint);
          const byKey = new Map(injected.map((t) => [`${t.patternId}|${t.nodeId}`, t]));
          for (const d of defaults) {
            const i = byKey.get(`${d.patternId}|${d.nodeId}`);
            if (!i) {
              interactionChecks.push({
                route,
                width,
                patternId: d.patternId,
                nodeId: d.nodeId,
                equivalent: false,
                detail: "trigger missing in injected app",
              });
              continue;
            }
            // Text length is EXPECTED to differ; behavior must not.
            const equivalent =
              d.found === i.found &&
              d.clicked === i.clicked &&
              d.stateAfter === i.stateAfter &&
              d.regionsVisible === i.regionsVisible &&
              i.regionsOverflowViewport <= d.regionsOverflowViewport;
            interactionChecks.push({
              route,
              width,
              patternId: d.patternId,
              nodeId: d.nodeId,
              equivalent,
              detail: equivalent
                ? `state=${i.stateAfter ?? "-"}, regions ${i.regionsVisible}, overflowRegions ${i.regionsOverflowViewport}`
                : `default {clicked:${d.clicked}, state:${d.stateAfter}, regions:${d.regionsVisible}, overflow:${d.regionsOverflowViewport}} vs injected {clicked:${i.clicked}, state:${i.stateAfter}, regions:${i.regionsVisible}, overflow:${i.regionsOverflowViewport}}`,
            });
          }
        }
      }
    }
  } finally {
    await browser.close();
    await defaultApp.stop();
    await injectedApp.stop();
  }

  // ---- repair candidates (§27): evidence-bearing slots only ----
  const repairCandidates: RepairCandidate[] = [];
  const byKeyObservations = new Map<string, SlotLayoutObservation[]>();
  for (const obs of slotObservations) {
    const list = byKeyObservations.get(obs.slotKey) ?? [];
    list.push(obs);
    byKeyObservations.set(obs.slotKey, list);
  }
  const twinsBySlot = new Map<string, { kinds: Set<string>; evidence: string[] }>();
  for (const t of twinFindings) {
    const entry = twinsBySlot.get(t.slotKey) ?? { kinds: new Set<string>(), evidence: [] };
    entry.kinds.add(t.kind);
    entry.evidence.push(
      `default text occurs ${t.occurrences}× in ${t.route} ${t.viewport} tree but only ` +
        `${t.boundOccurrences} occurrence(s) are slotted (unbound in section(s): ${t.unboundSections.join(", ")})`,
    );
    twinsBySlot.set(t.slotKey, entry);
  }
  for (const [slotKey, entry] of twinsBySlot) {
    repairCandidates.push({
      slotKey,
      // Any same-section finding escalates the whole slot to desync.
      reason: entry.kinds.has("desync")
        ? "unslotted-duplicate-text-desync"
        : "stale-duplicate-text-remnant",
      evidence: entry.evidence,
    });
  }
  for (const [slotKey, observations] of byKeyObservations) {
    const evidence: string[] = [];
    for (const obs of observations) {
      if (obs.clippedHorizontally) evidence.push(`clipped horizontally @${obs.width} (${obs.viewport})`);
      if (obs.clippedVertically) evidence.push(`clipped vertically @${obs.width} (${obs.viewport})`);
      if (obs.overlapsFollowingSibling) evidence.push(`overlaps following sibling @${obs.width}`);
      if (
        obs.referenceLineCount !== undefined &&
        obs.injectedLineCount !== undefined &&
        obs.injectedLineCount > obs.referenceLineCount * 2 + 1 &&
        pages.some((p) => p.route === obs.route && p.width === obs.width && !p.pass)
      ) {
        evidence.push(
          `line count ${obs.referenceLineCount}→${obs.injectedLineCount} @${obs.width} on a failing page`,
        );
      }
    }
    if (evidence.length > 0) {
      repairCandidates.push({ slotKey, reason: "layout evidence against injected content", evidence });
    }
  }
  repairCandidates.sort((a, b) => a.slotKey.localeCompare(b.slotKey));

  const pass =
    pages.every((p) => p.pass) &&
    appliedChecks.every((c) => c.applied) &&
    interactionChecks.every((i) => i.equivalent);

  return LayoutQaReportSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    runId: options.runId,
    templateId: template.manifest.templateId,
    widths,
    routes: options.routes,
    pages,
    slotObservations,
    appliedChecks,
    interactionChecks,
    repairCandidates,
    screenshots: screenshots.sort(),
    pass,
  });
}
