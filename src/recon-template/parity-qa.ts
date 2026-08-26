import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  SLOTS_FILE,
  SLOT_BINDINGS_FILE,
  REPORT_DIR,
  TEMPLATE_APP_DIR,
  TemplateManifestSchema,
  SlotsFileSchema,
  SlotBindingsFileSchema,
  type SlotBinding,
  type SlotDefinition,
  type TemplateManifest,
} from "./types.js";
import type { RuntimeRouteMap } from "../reconstruction/index.js";

/**
 * Recon Template parity + mutation QA (Task 18 §33/§34).
 *
 * The FIRST truth here is not the live original — it is the Exact
 * Reconstruction: comparing template(default) against the exact clone removes
 * live-source drift from the measurement entirely. Both apps are built and
 * served the ordinary way (`next build` + `next start`) and driven by real
 * Chromium; nothing renders trees in-process.
 *
 *   Phase 1 — default parity   exact app vs template app, default content.
 *     content (active-variant innerText), DOM identity (tag + data-wr-node
 *     sequence), document height, per-node geometry, runtime errors,
 *     hydration errors. Requirement: the slot layer changes NOTHING.
 *
 *   Phase 2 — interaction regression   every `data-wr-pattern-id` trigger on
 *     the QA routes is clicked in both apps (fresh page per trigger) and the
 *     after-states compared: trigger state attribute, mounted/revealed
 *     observed regions, region text length.
 *
 *   Phase 3 — slot mutation canary   a deterministic slot selection (hero
 *     headline, a CTA label + href, a nav label with static + dynamic
 *     bindings, an image alt) is overridden through the template app's
 *     overlay file (`WR_SLOT_VALUES_FILE`) — the production artifact is never
 *     modified. Requirement: every bound occurrence changed (including inside
 *     a mounted dynamic template), nothing else changed, runtime/hydration
 *     still clean.
 */

// ---------------------------------------------------------------------------
// App serving (local copy of the QA start logic, plus env injection — the
// mutation phase needs WR_SLOT_VALUES_FILE in the server environment).
// ---------------------------------------------------------------------------

const READY_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 600_000;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function runToCompletion(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const capture = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
  });
}

async function hasNextBuild(appDir: string): Promise<boolean> {
  try {
    return (await stat(path.join(appDir, ".next", "BUILD_ID"))).isFile();
  } catch {
    return false;
  }
}

export async function buildApp(appDir: string, force: boolean, log: (l: string) => void): Promise<number> {
  if (!force && (await hasNextBuild(appDir))) return 0;
  log(`[qa:template] next build (${appDir})`);
  const startedAt = Date.now();
  const { code, output } = await runToCompletion("npx", ["--no-install", "next", "build"], appDir, BUILD_TIMEOUT_MS);
  if (code !== 0) throw new Error(`next build failed in ${appDir} (exit ${code}):\n${output.slice(-2000)}`);
  return Date.now() - startedAt;
}

interface RunningApp {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startApp(appDir: string, extraEnv: Record<string, string> = {}): Promise<RunningApp> {
  const port = await findFreePort();
  const child: ChildProcess = spawn("npx", ["--no-install", "next", "start", "-p", String(port)], {
    cwd: appDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  const capture = (chunk: Buffer): void => {
    serverOutput += chunk.toString("utf8");
    if (serverOutput.length > 100_000) serverOutput = serverOutput.slice(-100_000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`${baseUrl}/__wr_probe__`, { signal: AbortSignal.timeout(4_000) });
      await response.arrayBuffer();
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) {
    child.kill("SIGKILL");
    throw new Error(`app at ${appDir} did not answer on ${baseUrl}:\n${serverOutput.slice(-2000)}`);
  }
  return {
    baseUrl,
    stop: async () => {
      if (exited) return;
      child.kill("SIGTERM");
      const grace = Date.now() + 5_000;
      while (!exited && Date.now() < grace) await new Promise((r) => setTimeout(r, 50));
      if (!exited) child.kill("SIGKILL");
    },
  };
}

// ---------------------------------------------------------------------------
// Page capture
// ---------------------------------------------------------------------------

interface NodeRect {
  id: string;
  tag: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PageCapture {
  route: string;
  width: number;
  viewport: "desktop" | "mobile";
  innerText: string;
  docHeight: number;
  nodes: NodeRect[];
  jsErrors: string[];
  hydrationErrors: string[];
}

const SETTLE_MS = 900;

async function capturePage(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
): Promise<PageCapture> {
  const viewport = width < breakpoint ? ("mobile" as const) : ("desktop" as const);
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  const jsErrors: string[] = [];
  const hydrationErrors: string[] = [];
  const record = (text: string): void => {
    if (/hydrat|minified react error #(418|423|425)/i.test(text)) hydrationErrors.push(text.slice(0, 300));
    else jsErrors.push(text.slice(0, 300));
  };
  page.on("pageerror", (error) => record(String(error?.message ?? error)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Remote asset fetch failures are environment noise, not clone defects —
    // the same separation Task 15's runtime diff makes.
    if (/Failed to load resource|net::ERR|404|ERR_/i.test(text)) return;
    record(text);
  });
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const captured = await page.evaluate((activeViewport: string) => {
      const variant = document.querySelector(
        `.wr-variant[data-wr-viewport="${activeViewport}"]`,
      ) as HTMLElement | null;
      const nodes: { id: string; tag: string; x: number; y: number; w: number; h: number }[] = [];
      if (variant) {
        for (const el of variant.querySelectorAll("[data-wr-node]")) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          nodes.push({
            id: (el as HTMLElement).getAttribute("data-wr-node") ?? "",
            tag: el.tagName.toLowerCase(),
            x: Math.round((rect.x + window.scrollX) * 10) / 10,
            y: Math.round((rect.y + window.scrollY) * 10) / 10,
            w: Math.round(rect.width * 10) / 10,
            h: Math.round(rect.height * 10) / 10,
          });
        }
      }
      return {
        innerText: variant ? variant.innerText : "",
        docHeight: document.documentElement.scrollHeight,
        nodes,
      };
    }, viewport);
    return { route, width, viewport, ...captured, jsErrors, hydrationErrors };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface PairComparison {
  route: string;
  width: number;
  viewport: string;
  contentEqual: boolean;
  structureEqual: boolean;
  comparedNodes: number;
  docHeightDelta: number;
  geometry: { p50: number; p95: number; max: number };
  exactJsErrors: number;
  templateJsErrors: number;
  /** template-side js errors NOT present in the exact reference capture (serve-origin normalized). */
  templateIntroducedJsErrors: number;
  exactHydrationErrors: number;
  templateHydrationErrors: number;
  pass: boolean;
  notes: string[];
}

/**
 * The two apps are served on different harness-chosen local ports, so an
 * otherwise identical browser error message differs only by its serve origin.
 * Normalize that origin before comparing — nothing site-specific: the
 * replaced value is the QA harness's own 127.0.0.1/localhost address.
 */
export function normalizeJsError(text: string): string {
  return text.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/gi, "http://<serve-origin>");
}

/**
 * Parity measures template(default) AGAINST the exact reconstruction — the
 * accepted answer sheet — not against an ideal error-free page. A js error
 * that the exact reference emits identically (e.g. the source site's asset
 * CDN refusing cross-origin loads, a limitation the reconstruction gate
 * already accepted) is INHERITED, not introduced by the slot layer, and must
 * not fail parity. Only errors absent from the exact capture fail the pair.
 */
export function findIntroducedJsErrors(
  exactErrors: readonly string[],
  templateErrors: readonly string[],
): string[] {
  const inherited = new Set(exactErrors.map(normalizeJsError));
  return templateErrors.filter((error) => !inherited.has(normalizeJsError(error)));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

const GEOMETRY_P95_LIMIT = 2;
const DOC_HEIGHT_LIMIT = 1;

function comparePair(exact: PageCapture, template: PageCapture): PairComparison {
  const notes: string[] = [];
  const contentEqual = exact.innerText === template.innerText;
  if (!contentEqual) {
    notes.push(
      `innerText differs (${exact.innerText.length} vs ${template.innerText.length} chars)`,
    );
  }
  const exactSig = exact.nodes.map((n) => `${n.tag}#${n.id}`).join(",");
  const templateSig = template.nodes.map((n) => `${n.tag}#${n.id}`).join(",");
  const structureEqual = exactSig === templateSig;
  if (!structureEqual) notes.push(`node sequence differs (${exact.nodes.length} vs ${template.nodes.length})`);

  const deltas: number[] = [];
  if (structureEqual) {
    for (let i = 0; i < exact.nodes.length; i++) {
      const a = exact.nodes[i];
      const b = template.nodes[i];
      deltas.push(
        Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)),
      );
    }
    deltas.sort((x, y) => x - y);
  }
  const geometry = {
    p50: percentile(deltas, 50),
    p95: percentile(deltas, 95),
    max: deltas.length > 0 ? deltas[deltas.length - 1] : 0,
  };
  const docHeightDelta = Math.abs(exact.docHeight - template.docHeight);
  const introducedJsErrors = findIntroducedJsErrors(exact.jsErrors, template.jsErrors);
  const pass =
    contentEqual &&
    structureEqual &&
    docHeightDelta <= DOC_HEIGHT_LIMIT &&
    geometry.p95 <= GEOMETRY_P95_LIMIT &&
    introducedJsErrors.length === 0 &&
    template.hydrationErrors.length === 0;
  if (template.hydrationErrors.length > 0) notes.push(`template hydration: ${template.hydrationErrors[0]}`);
  if (introducedJsErrors.length > 0) {
    notes.push(`template-introduced js error: ${introducedJsErrors[0]}`);
  } else if (template.jsErrors.length > 0) {
    notes.push(
      `${template.jsErrors.length} inherited js error(s) present in BOTH exact and template captures ` +
        `(not introduced by the slot layer; first: ${template.jsErrors[0]})`,
    );
  }
  return {
    route: exact.route,
    width: exact.width,
    viewport: exact.viewport,
    contentEqual,
    structureEqual,
    comparedNodes: exact.nodes.length,
    docHeightDelta,
    geometry,
    exactJsErrors: exact.jsErrors.length,
    templateJsErrors: template.jsErrors.length,
    templateIntroducedJsErrors: introducedJsErrors.length,
    exactHydrationErrors: exact.hydrationErrors.length,
    templateHydrationErrors: template.hydrationErrors.length,
    pass,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Interaction regression
// ---------------------------------------------------------------------------

interface TriggerAfterState {
  patternId: string;
  nodeId: string;
  found: boolean;
  clicked: boolean;
  stateAttribute?: string;
  stateAfter?: string;
  regionsVisible: number;
  regionTextLength: number;
}

async function captureInteractions(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
): Promise<TriggerAfterState[]> {
  const viewport = width < breakpoint ? "mobile" : "desktop";
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const listPage = await context.newPage();
  await listPage.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
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

  const results: TriggerAfterState[] = [];
  for (const trigger of triggers) {
    const page = await context.newPage();
    try {
      await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(SETTLE_MS);
      const state = await clickAndInspect(page, viewport, trigger);
      results.push(state);
    } catch {
      results.push({
        patternId: trigger.patternId,
        nodeId: trigger.nodeId,
        found: false,
        clicked: false,
        regionsVisible: 0,
        regionTextLength: 0,
      });
    } finally {
      await page.close();
    }
  }
  await context.close();
  return results;
}

async function clickAndInspect(
  page: Page,
  viewport: string,
  trigger: { patternId: string; nodeId: string; field?: string },
): Promise<TriggerAfterState> {
  const selector = `.wr-variant[data-wr-viewport="${viewport}"] [data-wr-node="${trigger.nodeId}"][data-wr-pattern-id="${trigger.patternId}"]`;
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) {
    return { ...trigger, found: false, clicked: false, regionsVisible: 0, regionTextLength: 0 };
  }
  let clicked = true;
  try {
    await locator.click({ timeout: 5_000 });
  } catch {
    clicked = false;
  }
  await page.waitForTimeout(400);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const inspection = await page.evaluate(
    (args: { selector: string; field?: string; patternId: string }) => {
      const el = document.querySelector(args.selector);
      const stateAfter = el && args.field ? el.getAttribute(args.field) ?? undefined : undefined;
      let regionsVisible = 0;
      let regionTextLength = 0;
      for (const region of document.querySelectorAll(
        `[id^="wr-obs-${args.patternId}-"], [id^="wr-dyn-"]`,
      )) {
        const rect = (region as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(region as HTMLElement);
        const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        if (visible) {
          regionsVisible++;
          regionTextLength += ((region as HTMLElement).textContent ?? "").length;
        }
      }
      return { stateAfter, regionsVisible, regionTextLength };
    },
    { selector, field: trigger.field, patternId: trigger.patternId },
  );
  return {
    patternId: trigger.patternId,
    nodeId: trigger.nodeId,
    found: true,
    clicked,
    stateAttribute: trigger.field,
    stateAfter: inspection.stateAfter,
    regionsVisible: inspection.regionsVisible,
    regionTextLength: inspection.regionTextLength,
  };
}

export interface InteractionComparison {
  route: string;
  width: number;
  patternId: string;
  nodeId: string;
  equivalent: boolean;
  detail: string;
}

function compareInteractions(
  route: string,
  width: number,
  exact: TriggerAfterState[],
  template: TriggerAfterState[],
): InteractionComparison[] {
  const out: InteractionComparison[] = [];
  const byKey = new Map(template.map((t) => [`${t.patternId}|${t.nodeId}`, t]));
  for (const e of exact) {
    const t = byKey.get(`${e.patternId}|${e.nodeId}`);
    if (!t) {
      out.push({ route, width, patternId: e.patternId, nodeId: e.nodeId, equivalent: false, detail: "trigger missing in template app" });
      continue;
    }
    const equivalent =
      e.found === t.found &&
      e.clicked === t.clicked &&
      e.stateAfter === t.stateAfter &&
      e.regionsVisible === t.regionsVisible &&
      e.regionTextLength === t.regionTextLength;
    out.push({
      route,
      width,
      patternId: e.patternId,
      nodeId: e.nodeId,
      equivalent,
      detail: equivalent
        ? `state ${e.stateAttribute ?? "-"}=${e.stateAfter ?? "-"}, regions ${e.regionsVisible}, textLength ${e.regionTextLength}`
        : `exact {clicked:${e.clicked}, state:${e.stateAfter}, regions:${e.regionsVisible}, text:${e.regionTextLength}} vs template {clicked:${t.clicked}, state:${t.stateAfter}, regions:${t.regionsVisible}, text:${t.regionTextLength}}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mutation canary
// ---------------------------------------------------------------------------

export interface MutationPick {
  purpose: string;
  slot: SlotDefinition;
  newValue: unknown;
}

/** Deterministic slot picks for the mutation canary. */
export function pickMutationSlots(
  slots: SlotDefinition[],
  bindings: SlotBinding[],
  homeRoute: string,
): MutationPick[] {
  const bindingsBySlot = new Map<string, SlotBinding[]>();
  for (const b of bindings) {
    const list = bindingsBySlot.get(b.slotId) ?? [];
    list.push(b);
    bindingsBySlot.set(b.slotId, list);
  }
  const picks: MutationPick[] = [];
  const onHome = (s: SlotDefinition): boolean => s.route === homeRoute || s.scope === "global";

  const hero = slots.find((s) => s.role === "hero.headline" && s.route === homeRoute) ??
    slots.find((s) => s.role === "hero.headline");
  if (hero) picks.push({ purpose: "hero-headline", slot: hero, newValue: "WRQA Hero Headline Mutated" });

  const ctaLabel =
    slots.find((s) => s.role === "cta.label" && onHome(s)) ??
    slots.find((s) => s.type === "text" && s.role === "link.label" && onHome(s));
  if (ctaLabel) picks.push({ purpose: "cta-label", slot: ctaLabel, newValue: "WRQA CTA Label" });
  const ctaHref = ctaLabel?.groupId
    ? slots.find((s) => s.groupId === ctaLabel.groupId && s.type === "url")
    : undefined;
  if (ctaHref) picks.push({ purpose: "cta-href", slot: ctaHref, newValue: "/wrqa-mutated-href" });

  const navLabel =
    slots.find((s) => {
      if (s.role !== "navigation.label" || s.type !== "text" || !onHome(s)) return false;
      const surfaces = new Set((bindingsBySlot.get(s.id) ?? []).map((b) => b.surface));
      return surfaces.has("static") && surfaces.has("dynamic-template");
    }) ?? slots.find((s) => s.role === "navigation.label" && s.type === "text" && onHome(s));
  if (navLabel) picks.push({ purpose: "nav-label", slot: navLabel, newValue: "WRQANav" });

  const image = slots.find((s) => s.type === "image" && onHome(s)) ?? slots.find((s) => s.type === "image");
  if (image && typeof image.defaultValue === "object") {
    picks.push({
      purpose: "image-alt",
      slot: image,
      newValue: { ...image.defaultValue, alt: "WRQA mutated alt text" },
    });
  }
  return picks;
}

export interface MutationCheck {
  purpose: string;
  slotKey: string;
  bindingId: string;
  surface: string;
  pageId: string;
  viewport: string;
  applied: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ParityQaOptions {
  templateManifestFile: string;
  widths?: number[];
  routesFilter?: string[];
  forceBuild?: boolean;
  skipMutation?: boolean;
  skipInteractions?: boolean;
  log?: (line: string) => void;
}

export interface ParityQaResult {
  pairs: PairComparison[];
  interactions: InteractionComparison[];
  mutationChecks: MutationCheck[];
  mutationStructureEqual: boolean | undefined;
  mutationRuntimeClean: boolean | undefined;
  pass: boolean;
}

const DEFAULT_WIDTHS = [390, 1440] as const;
const WIDE_WIDTHS = [1920, 2048] as const;

/** Deterministic wide-viewport route selection: root + one per section family. */
function wideRoutes(routes: string[]): string[] {
  const picks = new Set<string>();
  if (routes.includes("/")) picks.add("/");
  for (const prefix of ["/customers/", "/industries/", "/use-cases/"]) {
    const first = routes.find((r) => r.startsWith(prefix));
    if (first) picks.add(first);
  }
  if (picks.size === 0 && routes.length > 0) picks.add(routes[0]);
  return [...picks];
}

export async function runParityQa(options: ParityQaOptions): Promise<ParityQaResult> {
  const log = options.log ?? (() => {});
  const runDir = path.dirname(options.templateManifestFile);
  const manifest: TemplateManifest = TemplateManifestSchema.parse(
    JSON.parse(await readFile(options.templateManifestFile, "utf8")),
  );
  const slotsFile = SlotsFileSchema.parse(
    JSON.parse(await readFile(path.join(runDir, SLOTS_FILE), "utf8")),
  );
  const bindingsFile = SlotBindingsFileSchema.parse(
    JSON.parse(await readFile(path.join(runDir, SLOT_BINDINGS_FILE), "utf8")),
  );

  const templateAppDir = path.resolve(runDir, TEMPLATE_APP_DIR);
  const exactAppDir = path.resolve(path.dirname(manifest.source.reconstructionManifestFile), "app");
  const routeMap = JSON.parse(
    await readFile(path.join(templateAppDir, "reconstruction-data", "route-map.json"), "utf8"),
  ) as RuntimeRouteMap;
  const breakpoint = routeMap.breakpoint;

  let routes = manifest.routes;
  if (options.routesFilter && options.routesFilter.length > 0) {
    routes = routes.filter((r) => options.routesFilter!.includes(r));
  }
  const widths = options.widths ?? [...DEFAULT_WIDTHS];
  const wide = options.widths ? [] : wideRoutes(routes);

  await buildApp(exactAppDir, options.forceBuild ?? false, log);
  await buildApp(templateAppDir, options.forceBuild ?? false, log);

  const exactApp = await startApp(exactAppDir);
  const templateApp = await startApp(templateAppDir);
  const browser = await chromium.launch();

  const pairs: PairComparison[] = [];
  const interactions: InteractionComparison[] = [];
  const mutationChecks: MutationCheck[] = [];
  let mutationStructureEqual: boolean | undefined;
  let mutationRuntimeClean: boolean | undefined;

  try {
    // ---- Phase 1: default parity ----
    const jobs: { route: string; width: number }[] = [];
    for (const route of routes) for (const width of widths) jobs.push({ route, width });
    for (const route of wide) for (const width of WIDE_WIDTHS) jobs.push({ route, width });

    for (const job of jobs) {
      log(`[qa:template] parity ${job.route} @${job.width}`);
      const exact = await capturePage(browser, exactApp.baseUrl, job.route, job.width, breakpoint);
      const template = await capturePage(browser, templateApp.baseUrl, job.route, job.width, breakpoint);
      const compared = comparePair(exact, template);
      pairs.push(compared);
      if (!compared.pass) log(`[qa:template]   FAIL — ${compared.notes.join("; ") || "thresholds exceeded"}`);
    }

    // ---- Phase 2: interaction regression ----
    if (!options.skipInteractions) {
      const interactionRoutes = routes.includes("/") ? ["/"] : routes.slice(0, 1);
      for (const route of interactionRoutes) {
        for (const width of [1440, 390]) {
          log(`[qa:template] interactions ${route} @${width}`);
          const exact = await captureInteractions(browser, exactApp.baseUrl, route, width, breakpoint);
          const template = await captureInteractions(browser, templateApp.baseUrl, route, width, breakpoint);
          interactions.push(...compareInteractions(route, width, exact, template));
        }
      }
    }

    // ---- Phase 3: mutation canary ----
    if (!options.skipMutation) {
      const homeRoute = routes.includes("/") ? "/" : routes[0];
      const picks = pickMutationSlots(slotsFile.slots, bindingsFile.bindings, homeRoute);
      if (picks.length === 0) {
        log("[qa:template] mutation: no eligible slots found — skipped");
      } else {
        const overlay: Record<string, unknown> = {};
        for (const pick of picks) overlay[pick.slot.key] = pick.newValue;
        const overlayFile = path.resolve(runDir, REPORT_DIR, "mutation-overlay.json");
        await writeFile(overlayFile, JSON.stringify(overlay, null, 2) + "\n", "utf8");
        log(`[qa:template] mutation overlay → ${overlayFile}`);

        await templateApp.stop();
        const mutatedApp = await startApp(templateAppDir, { WR_SLOT_VALUES_FILE: overlayFile });
        try {
          const routeForPage = new Map<string, string>();
          for (const route of routeMap.routes) {
            if (!routeForPage.has(route.pageSourceId)) routeForPage.set(route.pageSourceId, route.key);
          }
          const bindingsBySlot = new Map<string, SlotBinding[]>();
          for (const b of bindingsFile.bindings) {
            const list = bindingsBySlot.get(b.slotId) ?? [];
            list.push(b);
            bindingsBySlot.set(b.slotId, list);
          }

          let structureOk = true;
          let runtimeOk = true;
          for (const pick of picks) {
            for (const binding of bindingsBySlot.get(pick.slot.id) ?? []) {
              const route = routeForPage.get(binding.pageId);
              if (!route) continue;
              const width = binding.viewport === "mobile" ? 390 : 1440;
              const expectedNew = projectMutationValue(pick.newValue, binding);
              if (expectedNew === undefined) continue;
              const check = await verifyMutatedBinding(
                browser,
                mutatedApp.baseUrl,
                route,
                width,
                breakpoint,
                binding,
                expectedNew,
              );
              mutationChecks.push({
                purpose: pick.purpose,
                slotKey: pick.slot.key,
                bindingId: binding.bindingId,
                surface: binding.surface,
                pageId: binding.pageId,
                viewport: binding.viewport,
                ...check,
              });
            }
          }

          // Structure + runtime cleanliness on the mutated home page.
          const width = 1440;
          const exactHome = await capturePage(browser, exactApp.baseUrl, homeRoute, width, breakpoint);
          const mutatedHome = await capturePage(browser, mutatedApp.baseUrl, homeRoute, width, breakpoint);
          const exactSig = exactHome.nodes.map((n) => `${n.tag}#${n.id}`).join(",");
          const mutatedSig = mutatedHome.nodes.map((n) => `${n.tag}#${n.id}`).join(",");
          structureOk = exactSig === mutatedSig;
          runtimeOk =
            findIntroducedJsErrors(exactHome.jsErrors, mutatedHome.jsErrors).length === 0 &&
            mutatedHome.hydrationErrors.length === 0;
          mutationStructureEqual = structureOk;
          mutationRuntimeClean = runtimeOk;
        } finally {
          await mutatedApp.stop();
        }
      }
    }
  } finally {
    await browser.close();
    await exactApp.stop();
    await templateApp.stop().catch(() => {});
  }

  const pass =
    pairs.every((p) => p.pass) &&
    interactions.every((i) => i.equivalent) &&
    mutationChecks.every((m) => m.applied) &&
    mutationStructureEqual !== false &&
    mutationRuntimeClean !== false;

  return { pairs, interactions, mutationChecks, mutationStructureEqual, mutationRuntimeClean, pass };
}

function projectMutationValue(newValue: unknown, binding: SlotBinding): string | undefined {
  if (typeof newValue === "string") return binding.field === undefined ? newValue : undefined;
  if (typeof newValue === "object" && newValue !== null && binding.field) {
    const v = (newValue as Record<string, unknown>)[binding.field];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

async function verifyMutatedBinding(
  browser: Browser,
  baseUrl: string,
  route: string,
  width: number,
  breakpoint: number,
  binding: SlotBinding,
  expectedNew: string,
): Promise<{ applied: boolean; detail: string }> {
  const viewport = binding.viewport;
  const context = await browser.newContext({
    viewport: { width, height: width < breakpoint ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(SETTLE_MS);
    // paint-twin occurrences are static-tree nodes; svg-text runs live inside
    // the addressed host's rendered inline SVG.
    if (binding.surface === "static" || binding.surface === "paint-twin") {
      const result = await page.evaluate(
        (args: { viewport: string; nodeId: string; target: string; attributeName?: string; childIndex?: number; expected: string }) => {
          const el = document.querySelector(
            `.wr-variant[data-wr-viewport="${args.viewport}"] [data-wr-node="${args.nodeId}"]`,
          );
          if (!el) return { applied: false, detail: "node not found" };
          if (args.target === "attribute") {
            const actual = el.getAttribute(args.attributeName ?? "");
            return {
              applied: actual === args.expected,
              detail: `attribute ${args.attributeName}=${JSON.stringify(actual)?.slice(0, 80)}`,
            };
          }
          if (args.target === "svg-text") {
            const scope = el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg") ?? el;
            const runs: string[] = [];
            for (const textEl of scope.querySelectorAll("text, tspan")) {
              for (const child of textEl.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "") {
                  runs.push(child.textContent ?? "");
                }
              }
            }
            return {
              applied: runs.includes(args.expected),
              detail: `svg text runs ${JSON.stringify(runs.map((t) => t.slice(0, 40)))}`,
            };
          }
          const texts: string[] = [];
          for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) texts.push(child.textContent ?? "");
          }
          return {
            applied: texts.includes(args.expected),
            detail: `text children ${JSON.stringify(texts.map((t) => t.slice(0, 40)))}`,
          };
        },
        {
          viewport,
          nodeId: binding.nodeId,
          target: binding.target,
          attributeName: binding.attributeName,
          childIndex: binding.childIndex,
          expected: expectedNew,
        },
      );
      return result;
    }
    // dynamic-template: click the trigger, then look for the value inside the
    // mounted/revealed region.
    const triggerSelector = `.wr-variant[data-wr-viewport="${viewport}"] [data-wr-node="${binding.nodeId}"]`;
    const trigger = page.locator(triggerSelector).first();
    if ((await trigger.count()) === 0) return { applied: false, detail: "trigger not found" };
    try {
      await trigger.click({ timeout: 5_000 });
    } catch {
      return { applied: false, detail: "trigger not clickable" };
    }
    await page.waitForTimeout(500);
    const result = await page.evaluate(
      (args: { expected: string; target: string; attributeName?: string }) => {
        const regions = document.querySelectorAll('[id^="wr-obs-"], [data-wr-dynamic-target]');
        for (const region of regions) {
          if (args.target === "text") {
            if ((region.textContent ?? "").includes(args.expected)) {
              return { applied: true, detail: `found in region #${region.id}` };
            }
          } else {
            for (const el of region.querySelectorAll(`[${args.attributeName}]`)) {
              if (el.getAttribute(args.attributeName ?? "") === args.expected) {
                return { applied: true, detail: `attribute found in region #${region.id}` };
              }
            }
          }
        }
        return { applied: false, detail: `value not found in ${regions.length} mounted region(s)` };
      },
      { expected: expectedNew, target: binding.target, attributeName: binding.attributeName },
    );
    return result;
  } finally {
    await context.close();
  }
}
