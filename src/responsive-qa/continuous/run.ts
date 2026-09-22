import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startClone, type RunningClone } from "../../reconstruction-qa/start-clone.js";
import { newResponsiveRunId, routeSlug, siteFolder } from "../store.js";
import { siteSpecAuthoredBoundaries } from "./boundaries.js";
import { writeStableJson } from "./json.js";
import { runContinuousRoute, type RouteResult } from "./run-route.js";
import {
  buildTrackedVariants,
  readObservationDom,
  readSiteSpecLite,
  type DomRecord,
} from "./tracked.js";
import {
  CONTINUOUS_QA_SCHEMA_VERSION,
  ContinuousQaInputError,
  DEFAULT_EXTRAPOLATE,
  DEFAULT_MAX_WIDTH,
  DEFAULT_MIN_WIDTH,
  VARIANT_IDS,
  type VariantId,
} from "./types.js";

/**
 * `pnpm qa:continuous <reconstruction-run-dir> --site-spec <site-spec.json> --routes /a,/b`
 *
 * Inputs are EXPLICIT paths — never "the newest run". The clone is built if
 * needed and served with `next start`; the source is the live route URL, read
 * only, one navigation per route.
 */

export const CONTINUOUS_RUN_FILE = "continuous-qa.json";
export const CONTINUOUS_RUNS_DIR = "responsive-qa-continuous";

export interface RunContinuousQaOptions {
  runDir: string;
  siteSpecFile: string;
  routes: string[];
  outDir?: string;
  min?: number;
  max?: number;
  extrapolate?: number[];
  cssOverrideFile?: string;
  sourceOrigin?: string;
  label?: string;
  log?: (line: string) => void;
  now?: Date;
}

interface RouteMapEntry {
  key?: string;
  path?: string;
  url?: string;
  pageSourceId?: string;
}

async function readJsonOptional(file: string): Promise<unknown | undefined> {
  if (!existsSync(file)) return undefined;
  return JSON.parse(await readFile(file, "utf8"));
}

function numbersFrom(values: unknown[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * The width THIS route's clone swaps variant trees at.
 *
 * Primary: `app/reconstruction-data/route-map.json` — the file the running app
 * actually reads — `pageBreakpoints[pageId]`, else the site scalar `breakpoint`.
 * Fallback (route map missing the fields): manifest
 * `config.routeBreakpoints[pageId].servedSwitch.value` (P0) →
 * `config.inferredBreakpoint.servedSwitch.value` (P0) →
 * `config.inferredBreakpoint.value`.
 * `config.routeBreakpoints[].breakpoint` is deliberately NOT read: it is the
 * route's INFERRED width, not the served one.
 */
export function resolveServedSwitch(
  manifest: unknown,
  routeMap: unknown,
  pageId: string,
): { px: number; source: string } | null {
  const rm = (routeMap ?? {}) as { breakpoint?: unknown; pageBreakpoints?: Record<string, unknown> };
  const perPage = positiveInt(rm.pageBreakpoints?.[pageId]);
  if (perPage !== undefined) return { px: perPage, source: "route-map.pageBreakpoints" };
  const site = positiveInt(rm.breakpoint);
  if (site !== undefined) return { px: site, source: "route-map.breakpoint" };
  const config = ((manifest ?? {}) as {
    config?: {
      inferredBreakpoint?: { value?: unknown; servedSwitch?: { value?: unknown } };
      routeBreakpoints?: Array<{ pageId?: string; servedSwitch?: { value?: unknown } }>;
    };
  }).config;
  const routeRecord = config?.routeBreakpoints?.find((entry) => entry.pageId === pageId);
  const routeServed = positiveInt(routeRecord?.servedSwitch?.value);
  if (routeServed !== undefined) {
    return { px: routeServed, source: "manifest.config.routeBreakpoints.servedSwitch" };
  }
  const siteServed = positiveInt(config?.inferredBreakpoint?.servedSwitch?.value);
  if (siteServed !== undefined) return { px: siteServed, source: "manifest.config.inferredBreakpoint.servedSwitch" };
  const inferred = positiveInt(config?.inferredBreakpoint?.value);
  if (inferred !== undefined) return { px: inferred, source: "manifest.config.inferredBreakpoint.value" };
  return null;
}

function withOrigin(url: string, origin: string | undefined): string {
  if (!origin) return url;
  const parsed = new URL(url);
  const replacement = new URL(origin);
  parsed.protocol = replacement.protocol;
  parsed.host = replacement.host;
  return parsed.toString();
}

export interface ContinuousRunSummary {
  outDir: string;
  files: string[];
  routes: Array<{ path: string; verdict: string; intervalsPass: number; intervalsTotal: number; totalMs: number }>;
}

export async function runContinuousQa(options: RunContinuousQaOptions): Promise<ContinuousRunSummary> {
  const log = options.log ?? ((line: string) => console.error(line));
  const min = options.min ?? DEFAULT_MIN_WIDTH;
  const max = options.max ?? DEFAULT_MAX_WIDTH;
  const extrapolate = options.extrapolate ?? [...DEFAULT_EXTRAPOLATE];
  if (!(min > 0 && max >= min)) throw new ContinuousQaInputError(`invalid range ${min}..${max}`);
  if (options.routes.length === 0) throw new ContinuousQaInputError("--routes is required");

  const runDir = path.resolve(options.runDir);
  const appDir = path.join(runDir, "app");
  if (!existsSync(appDir)) throw new ContinuousQaInputError(`no app/ in reconstruction run ${runDir}`);
  const manifest = await readJsonOptional(path.join(runDir, "reconstruction-manifest.json"));
  const routeMap = (await readJsonOptional(path.join(appDir, "reconstruction-data", "route-map.json"))) as
    | { rootUrl?: string; routes?: RouteMapEntry[]; breakpoint?: number; pageBreakpoints?: Record<string, number> }
    | undefined;
  if (!routeMap?.routes) throw new ContinuousQaInputError(`no route-map.json in ${appDir}/reconstruction-data`);
  const spec = await readSiteSpecLite(options.siteSpecFile);
  const rootUrl =
    (manifest as { rootUrl?: string } | undefined)?.rootUrl ?? spec.siteSpec.rootUrl ?? routeMap.rootUrl;
  if (!rootUrl) throw new ContinuousQaInputError("cannot determine the site root URL");

  const resolved = options.routes.map((routePath) => {
    const entry =
      routeMap.routes!.find((r) => r.path === routePath || r.key === routePath) ??
      routeMap.routes!.find((r) => {
        try {
          return r.url !== undefined && new URL(r.url).pathname === routePath;
        } catch {
          return false;
        }
      });
    if (!entry || !entry.url || !entry.pageSourceId) {
      throw new ContinuousQaInputError(`route ${routePath} is not in the reconstruction's route map`);
    }
    return {
      routePath,
      clonePath: entry.path ?? entry.key ?? routePath,
      pageId: entry.pageSourceId,
      sourceUrl: withOrigin(entry.url, options.sourceOrigin),
    };
  });

  const cssOverrideBody = options.cssOverrideFile
    ? await readFile(path.resolve(options.cssOverrideFile), "utf8")
    : undefined;
  const runId = newResponsiveRunId(options.now ?? new Date());
  const outDir = path.resolve(
    options.outDir ?? path.join("data", siteFolder(rootUrl), CONTINUOUS_RUNS_DIR, runId),
  );
  const evidenceRoot = path.join(outDir, "page-state-evidence");
  const searchRoots = [process.cwd(), path.resolve(spec.rootDir, "..", "..", "..", ".."), spec.rootDir];

  const files: string[] = [];
  const routeSummaries: ContinuousRunSummary["routes"] = [];
  const routeEntries: unknown[] = [];
  let clone: RunningClone | undefined;
  const browser = await chromium.launch();
  const startedAt = Date.now();
  try {
    clone = await startClone({ appDir, onLog: log });
    for (const route of resolved) {
      log(`[continuous-qa] route ${route.routePath} (${route.pageId}) ← ${route.sourceUrl}`);
      const pageSpec = await spec.readPage(route.pageId);
      const dom: Partial<Record<VariantId, DomRecord[] | null>> = {};
      const domFiles: Record<string, string | null> = {};
      for (const variant of VARIANT_IDS) {
        const found = await readObservationDom(pageSpec, variant, searchRoots);
        dom[variant] = found ? found.records : null;
        domFiles[variant] = found ? path.relative(process.cwd(), found.file) : null;
      }
      const variants = buildTrackedVariants({ pageSpec, styleProps: spec.styleProps, dom });
      const result: RouteResult = await runContinuousRoute({
        browser,
        routePath: route.routePath,
        pageId: route.pageId,
        sourceUrl: route.sourceUrl,
        cloneUrl: new URL(route.clonePath, clone.baseUrl).toString(),
        variants,
        siteSpecBoundaries: siteSpecAuthoredBoundaries(pageSpec),
        cloneHintBoundaries: [],
        servedSwitch: resolveServedSwitch(manifest, routeMap, route.pageId),
        min,
        max,
        extrapolate,
        cssOverrideBody,
        evidenceRoot,
        log,
      });
      const file = path.join(outDir, `route-${routeSlug(route.routePath)}.json`);
      await writeStableJson(file, { ...result, inputs: { observationDom: domFiles } });
      files.push(file);
      routeSummaries.push({
        path: route.routePath,
        verdict: result.summary.verdict,
        intervalsPass: result.summary.intervalsPass,
        intervalsTotal: result.summary.intervalsTotal,
        totalMs: result.timing.totalMs,
      });
      routeEntries.push({
        path: route.routePath,
        pageId: route.pageId,
        file: path.basename(file),
        servedSwitchPx: result.servedSwitchPx,
        summary: result.summary,
        counters: {
          samples: result.counters.samples,
          nodesTracked: result.counters.nodesTracked,
          nodesMatchedEver: result.counters.nodesMatchedEver,
          treeMismatchSamples: result.counters.treeMismatchSamples,
          cloneOnlyDiscontinuities: result.counters.cloneOnlyDiscontinuities,
          comparedNodeSamples: result.counters.comparedNodeSamples,
          ambiguousSignature: result.counters.ambiguousSignature,
        },
        intervals: result.intervals.map((i) => ({
          min: i.min,
          max: i.max,
          verdict: i.verdict,
          firstFailingWidth: i.firstFailingWidth,
          failingChecks: i.failingChecks,
          coverage: i.coverage,
        })),
        timing: result.timing,
      });
      log(
        `[continuous-qa] ${route.routePath}: ${result.summary.verdict} ` +
          `${result.summary.intervalsPass}/${result.summary.intervalsTotal} intervals, ${result.timing.totalMs} ms`,
      );
    }
    const top = path.join(outDir, CONTINUOUS_RUN_FILE);
    await writeStableJson(top, {
      schemaVersion: CONTINUOUS_QA_SCHEMA_VERSION,
      label: options.label ?? null,
      runId,
      generatedAt: (options.now ?? new Date()).toISOString(),
      rootUrl,
      inputs: {
        reconstructionRunDir: path.relative(process.cwd(), runDir),
        siteSpec: path.relative(process.cwd(), path.resolve(options.siteSpecFile)),
        cssOverride: options.cssOverrideFile
          ? {
              file: path.relative(process.cwd(), path.resolve(options.cssOverrideFile)),
              sha256: createHash("sha256").update(cssOverrideBody ?? "").digest("hex"),
              bytes: Buffer.byteLength(cssOverrideBody ?? ""),
            }
          : null,
        sourceOrigin: options.sourceOrigin ?? null,
      },
      clone: { buildMs: clone.buildMs },
      range: { min, max, extrapolate },
      routes: routeEntries,
      totals: {
        routes: routeEntries.length,
        routesPass: routeSummaries.filter((r) => r.verdict === "PASS").length,
        intervalsPass: routeSummaries.reduce((sum, r) => sum + r.intervalsPass, 0),
        intervalsTotal: routeSummaries.reduce((sum, r) => sum + r.intervalsTotal, 0),
        totalMs: Date.now() - startedAt,
      },
    });
    files.push(top);
  } finally {
    await browser.close().catch(() => {});
    await clone?.stop();
  }
  return { outDir, files, routes: routeSummaries };
}
