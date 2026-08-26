/**
 * Production bake (Task 23 A–F): copy the immutable template app, bake every
 * serve-boundary layer INTO the copy, build it as a fully static export and
 * post-process the exported files.
 *
 *   A content  — content-run overlay → template-data/slot-values.baked.json
 *                (slot-content.ts patched to read it; env seam removed)
 *   B theme    — theme-run overlay css → public/wr/theme-overlay.css,
 *                linked in the document head after the exact stylesheet
 *   C seo      — plan titles baked into route-map.json (head + RSC flight);
 *                rendered head block spliced into each exported HTML file;
 *                robots.txt emitted; preview: no /sitemap.xml
 *   D assets   — media/ copied into the site; rewrite-map applied to every
 *                exported html/txt(css) file — the Task 22 proxy's exact
 *                mechanism, at build time instead of serve time
 *   E/F        — output is a plain directory of files; no Next server, no
 *                run-directory reads, no env vars at runtime
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import { applyRewrite } from "../assets/rewrite.js";
import type { RewriteMap } from "../assets/types.js";
import {
  bakeRouteTitles,
  patchLayout,
  patchNextConfig,
  patchPageTsx,
  patchSlotContent,
} from "./patch.js";
import type { BakeReport } from "./types.js";

export interface RenderedHeadRoute {
  route: string;
  upstreamTitle: string | null;
  title: string;
  headHtml: string;
}

const BUILD_TIMEOUT_MS = 10 * 60_000;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function patchFile(file: string, patch: (source: string) => string): Promise<void> {
  const source = await readFile(file, "utf8");
  await writeFile(file, patch(source), "utf8");
}

/** Copy the template app, excluding build byproducts. */
export async function copyTemplateApp(templateAppDir: string, destAppDir: string): Promise<void> {
  const excluded = new Set(["node_modules", ".next", "out"]);
  await cp(templateAppDir, destAppDir, {
    recursive: true,
    filter: (source) => !excluded.has(path.basename(source)),
  });
}

export interface ContentBakeResult {
  overlayKeyCount: number;
  unknownOverlayKeys: string[];
}

/** A — bake the content overlay into the app copy. */
export async function bakeContent(
  appDir: string,
  slotValuesFile: string,
): Promise<ContentBakeResult> {
  const overlay = await readJson<Record<string, unknown>>(slotValuesFile);
  const defaults = await readJson<{ values: Record<string, unknown> }>(
    path.join(appDir, "template-data", "default-content.json"),
  );
  const unknownOverlayKeys = Object.keys(overlay).filter(
    (key) => !(key in defaults.values),
  );
  await writeFile(
    path.join(appDir, "template-data", "slot-values.baked.json"),
    JSON.stringify(overlay, null, 2),
    "utf8",
  );
  await patchFile(path.join(appDir, "src", "runtime", "slot-content.ts"), patchSlotContent);
  return { overlayKeyCount: Object.keys(overlay).length, unknownOverlayKeys };
}

/** B — bake the theme overlay as a static asset linked in the head. */
export async function bakeTheme(appDir: string, themeOverlayCssFile: string): Promise<number> {
  const css = await readFile(themeOverlayCssFile, "utf8");
  const target = path.join(appDir, "public", "wr", "theme-overlay.css");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, css, "utf8");
  await patchFile(path.join(appDir, "app", "layout.tsx"), patchLayout);
  return Buffer.byteLength(css, "utf8");
}

/** C (part 1) — bake plan titles into the route table. */
export async function bakeSeoTitles(
  appDir: string,
  planRoutes: RenderedHeadRoute[],
): Promise<ReturnType<typeof bakeRouteTitles>> {
  const routeMapFile = path.join(appDir, "reconstruction-data", "route-map.json");
  const routeMap = await readJson<{ routes: Array<{ key: string; title?: string }> }>(routeMapFile);
  const result = bakeRouteTitles(routeMap, planRoutes);
  await writeFile(routeMapFile, JSON.stringify(routeMap), "utf8");
  return result;
}

/** Switch the app copy to static export (route table must be path-only). */
export async function convertToStaticExport(appDir: string): Promise<void> {
  const routeMap = await readJson<{ routes: Array<{ key: string }> }>(
    path.join(appDir, "reconstruction-data", "route-map.json"),
  );
  const queryRoutes = routeMap.routes.filter((route) => route.key.includes("?"));
  if (queryRoutes.length > 0) {
    throw new Error(
      "static export requires a path-only route table; query-variant route keys found: " +
        queryRoutes.map((route) => route.key).join(", "),
    );
  }
  await patchFile(path.join(appDir, "app", "[[...slug]]", "page.tsx"), patchPageTsx);
  await patchFile(path.join(appDir, "next.config.mjs"), patchNextConfig);
}

/** Run `next build` in the app copy (dependencies resolve upward, exactly as
 *  for every generated app since Task 14). Returns elapsed ms. */
export async function buildStaticExport(
  appDir: string,
  log: (line: string) => void,
): Promise<number> {
  const startedAt = Date.now();
  const output = await new Promise<{ code: number | null; text: string }>((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "next", "build"], {
      cwd: appDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    const capture = (chunk: Buffer): void => {
      text += chunk.toString("utf8");
      if (text.length > 200_000) text = text.slice(-200_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("next build timed out"));
    }, BUILD_TIMEOUT_MS);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, text });
    });
  });
  if (output.code !== 0) {
    throw new Error(`next build failed (exit ${output.code}):\n${output.text.slice(-4000)}`);
  }
  log(`[production] next build finished in ${Date.now() - startedAt}ms`);
  return Date.now() - startedAt;
}

export function routeHtmlFile(route: string): string {
  return route === "/" ? "index.html" : route.slice(1) + ".html";
}

async function walkFiles(root: string, relDir = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(path.join(root, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walkFiles(root, rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

export interface PostProcessResult {
  seo: BakeReport["seo"];
  assets: Omit<BakeReport["assets"], "mediaFilesCopied" | "mediaBytes">;
  routeHtmlFiles: number;
}

/** C (part 2) + D — splice heads, rewrite asset URLs, emit robots.txt. */
export async function postProcessExport(
  outDir: string,
  planRoutes: RenderedHeadRoute[],
  rewriteMap: RewriteMap,
  robotsTxt: string,
  residualHosts: string[],
): Promise<PostProcessResult> {
  const files = await walkFiles(outDir);
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const flightFiles = files.filter((file) => file.endsWith(".txt"));
  const cssFiles = files.filter((file) => file.endsWith(".css"));

  // C: verify baked titles and splice the rendered head block per route.
  let headBlocksSpliced = 0;
  let titleVerifiedRoutes = 0;
  const headSpliceFailures: string[] = [];
  for (const planRoute of planRoutes) {
    const relFile = routeHtmlFile(planRoute.route);
    const filePath = path.join(outDir, relFile);
    let html: string;
    try {
      html = await readFile(filePath, "utf8");
    } catch {
      headSpliceFailures.push(`${planRoute.route}: exported file missing (${relFile})`);
      continue;
    }
    if (html.includes(`<title>${escapeForTitle(planRoute.title)}</title>`)) {
      titleVerifiedRoutes++;
    }
    const headClose = html.indexOf("</head>");
    if (headClose === -1) {
      headSpliceFailures.push(`${planRoute.route}: no </head> in exported HTML`);
      continue;
    }
    if (html.includes("wr-seo-head-start")) {
      headSpliceFailures.push(`${planRoute.route}: head block already present`);
      continue;
    }
    html = html.slice(0, headClose) + planRoute.headHtml + html.slice(headClose);
    await writeFile(filePath, html, "utf8");
    headBlocksSpliced++;
  }

  // D: asset rewrite — html context over HTML + RSC flight, css over stylesheets.
  const rewriteTotals = {
    htmlFiles: 0,
    htmlReplacedOccurrences: 0,
    flightFiles: 0,
    flightReplacedOccurrences: 0,
    cssFiles: 0,
    cssReplacedOccurrences: 0,
  };
  const rewriteFile = async (
    relFile: string,
    context: "html" | "css",
  ): Promise<number> => {
    const filePath = path.join(outDir, relFile);
    const body = await readFile(filePath, "utf8");
    const result = applyRewrite(body, rewriteMap, context);
    if (result.replacedOccurrences > 0) await writeFile(filePath, result.body, "utf8");
    return result.replacedOccurrences;
  };
  for (const file of htmlFiles) {
    const occurrences = await rewriteFile(file, "html");
    if (occurrences > 0) rewriteTotals.htmlFiles++;
    rewriteTotals.htmlReplacedOccurrences += occurrences;
  }
  for (const file of flightFiles) {
    const occurrences = await rewriteFile(file, "html");
    if (occurrences > 0) rewriteTotals.flightFiles++;
    rewriteTotals.flightReplacedOccurrences += occurrences;
  }
  for (const file of cssFiles) {
    const occurrences = await rewriteFile(file, "css");
    if (occurrences > 0) rewriteTotals.cssFiles++;
    rewriteTotals.cssReplacedOccurrences += occurrences;
  }

  // Honest residual count: remaining source-host URL occurrences in the site.
  let residualSourceUrlOccurrencesInSite = 0;
  const needles = residualHosts.map((host) => `https://${host}`);
  for (const file of [...htmlFiles, ...flightFiles, ...cssFiles]) {
    const body = await readFile(path.join(outDir, file), "utf8");
    for (const needle of needles) {
      residualSourceUrlOccurrencesInSite += body.split(needle).length - 1;
    }
  }

  // C: robots.txt (preview policy). No /sitemap.xml is written in preview —
  // the path-only sitemap plan is a package artifact, never a served sitemap.
  await writeFile(path.join(outDir, "robots.txt"), robotsTxt, "utf8");

  return {
    seo: {
      routeTitlesBaked: 0, // filled by the caller from the title bake result
      titleGuardMismatches: [],
      headBlocksSpliced,
      headSpliceFailures,
      titleVerifiedRoutes,
      robotsTxtBytes: Buffer.byteLength(robotsTxt, "utf8"),
      sitemapPolicy:
        "preview: no /sitemap.xml served (404 from the static host); path-only sitemap.preview.xml shipped as a package artifact only",
    },
    assets: {
      rewrite: rewriteTotals,
      residualSourceUrlOccurrencesInSite,
    },
    routeHtmlFiles: htmlFiles.length,
  };
}

function escapeForTitle(title: string): string {
  return title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** D — copy the materialized media into the site. */
export async function copyMedia(
  mediaDir: string,
  outDir: string,
): Promise<{ mediaFilesCopied: number; mediaBytes: number }> {
  const target = path.join(outDir, "media");
  await mkdir(target, { recursive: true });
  const entries = await readdir(mediaDir, { withFileTypes: true });
  let mediaFilesCopied = 0;
  let mediaBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const source = path.join(mediaDir, entry.name);
    await cp(source, path.join(target, entry.name));
    mediaFilesCopied++;
    mediaBytes += (await stat(source)).size;
  }
  return { mediaFilesCopied, mediaBytes };
}

export async function directoryStats(root: string): Promise<{ fileCount: number; byteCount: number }> {
  const files = await walkFiles(root);
  let byteCount = 0;
  for (const file of files) byteCount += (await stat(path.join(root, file))).size;
  return { fileCount: files.length, byteCount };
}
