/**
 * Production candidate QA (Task 23 E/H) — against the DEPLOYMENT PACKAGE,
 * launched standalone.
 *
 * Runtime independence is proven structurally: the package directory is
 * COPIED to an isolation directory OUTSIDE the repository and served by its
 * own `server.mjs` with a minimal environment (PATH only — no WR_* vars, no
 * repo cwd, no run directories reachable). Every check then runs over real
 * HTTP / real Chromium against that isolated copy.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

import { SERVER_READY_PREFIX } from "./static-server.js";
import type { DeployManifest } from "./types.js";

const SETTLE_MS = 700;
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

export interface QaCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface ProductionQaReport {
  createdAt: string;
  isolatedDir: string;
  baseUrl: string;
  launchEnv: string[];
  passed: number;
  failed: number;
  checks: QaCheck[];
  routeCensus: Array<{
    route: string;
    status: number | null;
    titleOk: boolean;
    externalHosts: Record<string, number>;
    jsErrors: number;
    hydrationErrors: number;
  }>;
  externalRequestTotal: number;
  externalRequestsByHost: Record<string, number>;
  unexpectedExternalHosts: string[];
  internalLinks: {
    inTableChecked: number;
    inTableBroken: string[];
    outOfTableCount: number;
    externalCount: number;
  };
  sourceHostMentionsInHtml: number;
}

export interface LaunchedPackage {
  baseUrl: string;
  isolatedDir: string;
  launchEnv: string[];
  stop: () => Promise<void>;
}

/** Copy the package outside the repo and launch it with a minimal env. */
export async function launchPackageIsolated(packageDir: string): Promise<LaunchedPackage> {
  const isolatedDir = await mkdtemp(path.join(os.tmpdir(), "wr-production-qa-"));
  await cp(packageDir, isolatedDir, { recursive: true });
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(isolatedDir, "server.mjs"), "--port", "0"],
    { cwd: isolatedDir, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const baseUrl = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`package server did not become ready:\n${output.slice(-1000)}`));
    }, 20_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      const line = output.split("\n").find((candidate) => candidate.startsWith(SERVER_READY_PREFIX));
      if (line) {
        clearTimeout(timer);
        resolve(line.slice(SERVER_READY_PREFIX.length).trim());
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`package server exited early (code ${code}):\n${output.slice(-1000)}`));
    });
  });
  return {
    baseUrl,
    isolatedDir,
    launchEnv: Object.keys(env),
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(isolatedDir, { recursive: true, force: true });
    },
  };
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

async function settle(page: Page): Promise<void> {
  // tsx/esbuild wraps functions passed to evaluate() with a __name helper
  // that does not exist inside the page — define it (Task 17 gotcha).
  await page.evaluate("globalThis.__name = globalThis.__name || function (fn) { return fn; };");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

/** Parse the theme overlay: token map + a few class→token color rules. */
export function parseThemeProbes(css: string): Array<{ className: string; expectedColor: string }> {
  const tokens = new Map<string, string>();
  const rootMatch = css.match(/:root\{([^}]*)\}/);
  if (rootMatch) {
    for (const declaration of rootMatch[1].split(";")) {
      const index = declaration.indexOf(":");
      if (index === -1) continue;
      tokens.set(declaration.slice(0, index).trim(), declaration.slice(index + 1).trim());
    }
  }
  const probes: Array<{ className: string; expectedColor: string }> = [];
  const ruleRe = /((?:\.[A-Za-z0-9_-]+,?)+)\{color:var\((--wr-theme-color-[a-z-]+)\)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css)) !== null) {
    const expected = tokens.get(match[2]);
    if (!expected || !expected.startsWith("rgb")) continue;
    for (const selector of match[1].split(",")) {
      if (selector.startsWith(".")) probes.push({ className: selector.slice(1), expectedColor: expected });
    }
  }
  return probes;
}

export interface QaOptions {
  packageDir: string;
  log?: (line: string) => void;
}

export async function runProductionQa(options: QaOptions): Promise<ProductionQaReport> {
  const log = options.log ?? ((): void => {});
  const manifest = JSON.parse(
    await readFile(path.join(options.packageDir, "deploy-manifest.json"), "utf8"),
  ) as DeployManifest;
  const themeOverlayCss = await readFile(
    path.join(options.packageDir, "site", "wr", "theme-overlay.css"),
    "utf8",
  );

  const launched = await launchPackageIsolated(options.packageDir);
  log(`[production:qa] isolated package at ${launched.isolatedDir}, serving ${launched.baseUrl}`);

  const checks: QaCheck[] = [];
  const check = (id: string, ok: boolean, detail = ""): void => {
    checks.push({ id, ok, detail });
    log(`  ${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
  };

  const routeCensus: ProductionQaReport["routeCensus"] = [];
  const externalRequestsByHost: Record<string, number> = {};
  const internalLinks = { inTableChecked: 0, inTableBroken: [] as string[], outOfTableCount: 0, externalCount: 0 };
  let sourceHostMentionsInHtml = 0;

  let browser: Browser | null = null;
  try {
    // ---- HTTP-level checks -------------------------------------------------
    // What each route's baked head PROMISES (description is needs-input on
    // uninjected routes and is never invented — assert consistency, not
    // unconditional presence).
    const servedHasDescription = new Map<string, boolean>();
    for (const route of manifest.routes) {
      const response = await fetch(launched.baseUrl + route.route);
      const body = await response.text();
      servedHasDescription.set(route.route, body.includes('name="description"'));
      const contentTypeOk = (response.headers.get("content-type") ?? "").includes("text/html");
      check(
        `http:${route.route}`,
        response.status === 200 && contentTypeOk,
        `status=${response.status}`,
      );
      const titleNeedle = `<title>${route.expectedTitle
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</title>`;
      check(`title-served:${route.route}`, body.includes(titleNeedle), route.expectedTitle.slice(0, 60));
      check(`head-block:${route.route}`, body.includes(route.headMarker), "");
      check(
        `robots-meta:${route.route}`,
        manifest.mode !== "preview" || body.includes('name="robots" content="noindex,nofollow"'),
        "",
      );
      sourceHostMentionsInHtml += body.split(manifest.sourceHost).length - 1;
    }
    const robots = await fetch(launched.baseUrl + "/robots.txt");
    const robotsBody = await robots.text();
    check(
      "robots-txt",
      robots.status === 200 && (manifest.mode !== "preview" || /Disallow: \/$/m.test(robotsBody)),
      `status=${robots.status}`,
    );
    check(
      "robots-txt-no-sitemap-line",
      manifest.mode !== "preview" || !robotsBody.includes("Sitemap:"),
      "",
    );
    const sitemap = await fetch(launched.baseUrl + "/sitemap.xml");
    check(
      "sitemap-preview-404",
      manifest.mode !== "preview" ? sitemap.status === 200 : sitemap.status === 404,
      `status=${sitemap.status}`,
    );
    const missing = await fetch(launched.baseUrl + "/__wr_definitely_not_a_route__");
    check("unknown-route-404", missing.status === 404, `status=${missing.status}`);
    const overlayResponse = await fetch(launched.baseUrl + manifest.themeOverlayPath);
    check("theme-overlay-served", overlayResponse.status === 200, `status=${overlayResponse.status}`);

    // ---- browser checks ----------------------------------------------------
    browser = await chromium.launch();
    const localHost = new URL(launched.baseUrl).host;

    for (const route of manifest.routes) {
      const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const jsErrors: string[] = [];
      const hydrationErrors: string[] = [];
      const externalHosts: Record<string, number> = {};
      recordErrors(page, jsErrors, hydrationErrors);
      page.on("request", (request) => {
        const host = new URL(request.url()).host;
        if (host === localHost) return;
        externalHosts[host] = (externalHosts[host] ?? 0) + 1;
        externalRequestsByHost[host] = (externalRequestsByHost[host] ?? 0) + 1;
      });
      const response = await page.goto(launched.baseUrl + route.route, {
        waitUntil: "load",
        timeout: 60_000,
      });
      await settle(page);
      const title = await page.title();
      const titleOk = title === route.expectedTitle;
      check(`browser-title:${route.route}`, titleOk, title.slice(0, 60));
      const meta = await page.evaluate(() => {
        const attr = (selector: string, name: string): string | null =>
          document.querySelector(selector)?.getAttribute(name) ?? null;
        let jsonLdParses = false;
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        try {
          jsonLdParses = jsonLd !== null && JSON.parse(jsonLd.textContent ?? "") !== null;
        } catch {
          jsonLdParses = false;
        }
        return {
          description: attr('meta[name="description"]', "content"),
          ogTitle: attr('meta[property="og:title"]', "content"),
          twitterCard: attr('meta[name="twitter:card"]', "content"),
          jsonLdParses,
        };
      });
      const descriptionConsistent =
        (meta.description !== null) === (servedHasDescription.get(route.route) ?? false);
      check(
        `browser-meta:${route.route}`,
        descriptionConsistent && meta.ogTitle !== null && meta.twitterCard !== null && meta.jsonLdParses,
        `desc=${meta.description !== null}(baked=${servedHasDescription.get(route.route)}) og=${meta.ogTitle !== null} twitter=${meta.twitterCard !== null} jsonld=${meta.jsonLdParses}`,
      );
      check(
        `hydration-clean:${route.route}`,
        hydrationErrors.length === 0 && jsErrors.length === 0,
        hydrationErrors[0] ?? jsErrors[0] ?? "",
      );
      routeCensus.push({
        route: route.route,
        status: response?.status() ?? null,
        titleOk,
        externalHosts,
        jsErrors: jsErrors.length,
        hydrationErrors: hydrationErrors.length,
      });
      await context.close();
    }

    // ---- homepage deep checks ----------------------------------------------
    const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(launched.baseUrl + "/", { waitUntil: "load", timeout: 60_000 });
    await settle(page);

    // injected content visible (values proven different from template defaults)
    const html = await page.content();
    for (const proof of manifest.contentProof) {
      check(`content-proof:${proof.slotKey}`, html.includes(proof.value), proof.value.slice(0, 40));
    }

    // theme applied: link present + computed color equals the overlay token
    const themeLink = await page.evaluate(
      (href: string) => document.querySelector(`link[rel="stylesheet"][href="${href}"]`) !== null,
      manifest.themeOverlayPath,
    );
    check("theme-link-present", themeLink, manifest.themeOverlayPath);
    // Invert the search: the overlay has thousands of class rules; collect
    // the DOM's wr-classes first, intersect with the probe map, then verify
    // the computed color of a sample.
    const probeMap = new Map(
      parseThemeProbes(themeOverlayCss).map((probe) => [probe.className, probe.expectedColor]),
    );
    const domClasses = await page.evaluate(() => {
      const out = new Set<string>();
      for (const el of document.querySelectorAll("[class]")) {
        for (const name of el.classList) {
          if (/^wr-(doc-)?st\d+$/.test(name)) out.add(name);
        }
        if (out.size > 20000) break;
      }
      return [...out];
    });
    const sampled = domClasses
      .filter((name) => probeMap.has(name))
      .slice(0, 5)
      .map((name) => ({ className: name, expectedColor: probeMap.get(name) ?? "" }));
    const themeProbe = await page.evaluate(
      (candidates: Array<{ className: string; expectedColor: string }>) => {
        const results: Array<{ className: string; expected: string; actual: string }> = [];
        for (const candidate of candidates) {
          const el = document.querySelector("." + candidate.className);
          if (!el) continue;
          results.push({
            className: candidate.className,
            expected: candidate.expectedColor,
            actual: window.getComputedStyle(el).color.trim(),
          });
        }
        return results;
      },
      sampled,
    );
    check(
      "theme-computed-paint",
      themeProbe.length > 0 && themeProbe.every((probe) => probe.actual === probe.expected),
      themeProbe.length > 0
        ? themeProbe.map((probe) => `${probe.className}:${probe.actual === probe.expected ? "ok" : `${probe.actual} vs ${probe.expected}`}`).join(" ")
        : "no probe class found in DOM",
    );

    // internal links on /
    const anchors = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
    );
    const routeSet = new Set(manifest.routes.map((route) => route.route));
    const inTable = new Set<string>();
    for (const href of anchors) {
      if (href.startsWith("http://") || href.startsWith("https://")) {
        internalLinks.externalCount++;
        continue;
      }
      if (!href.startsWith("/")) continue;
      const clean = href.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
      if (routeSet.has(clean)) inTable.add(clean);
      else internalLinks.outOfTableCount++;
    }
    for (const route of inTable) {
      internalLinks.inTableChecked++;
      const response = await fetch(launched.baseUrl + route);
      if (response.status !== 200) internalLinks.inTableBroken.push(`${route} -> ${response.status}`);
    }
    check(
      "internal-links-in-table",
      internalLinks.inTableBroken.length === 0,
      `${internalLinks.inTableChecked} checked, broken: ${internalLinks.inTableBroken.join(", ") || "none"}`,
    );

    // overflow sanity (desktop)
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    check("overflow-desktop:/", desktopOverflow, "");

    // interactions (desktop): click sample triggers, expect an observable
    // response — a dynamic region mount OR a state flip (static-target
    // disclosures / selection toggles mount nothing; see sampleInteractions).
    const interactionResult = await sampleInteractions(page, "desktop", 3);
    check(
      "interactions-desktop:/",
      interactionResult.clicked > 0 &&
        interactionResult.regionsAppeared + interactionResult.stateFlips > 0,
      `clicked=${interactionResult.clicked} regionsAppeared=${interactionResult.regionsAppeared} stateFlips=${interactionResult.stateFlips}`,
    );
    await context.close();

    // mobile: portal menu + overflow
    const mobileContext = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 1 });
    const mobilePage = await mobileContext.newPage();
    const mobileHydration: string[] = [];
    const mobileJs: string[] = [];
    recordErrors(mobilePage, mobileJs, mobileHydration);
    await mobilePage.goto(launched.baseUrl + "/", { waitUntil: "load", timeout: 60_000 });
    await settle(mobilePage);
    const mobileOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    check("overflow-mobile:/", mobileOverflow, "");
    const mobileInteraction = await sampleInteractions(mobilePage, "mobile", 2);
    check(
      "interactions-mobile:/",
      mobileInteraction.clicked > 0 &&
        mobileInteraction.regionsAppeared + mobileInteraction.stateFlips > 0,
      `clicked=${mobileInteraction.clicked} regionsAppeared=${mobileInteraction.regionsAppeared} stateFlips=${mobileInteraction.stateFlips}`,
    );
    check("hydration-clean-mobile:/", mobileHydration.length === 0 && mobileJs.length === 0, mobileHydration[0] ?? mobileJs[0] ?? "");
    await mobileContext.close();

    // external request policy: only the known replacement-required hosts
    const unexpectedExternalHosts = Object.keys(externalRequestsByHost).filter(
      (host) => !manifest.knownResidualSourceHosts.includes(host),
    );
    check(
      "external-requests-only-known-residual",
      unexpectedExternalHosts.length === 0,
      `hosts=${JSON.stringify(externalRequestsByHost)}`,
    );

    const failed = checks.filter((entry) => !entry.ok).length;
    return {
      createdAt: new Date().toISOString(),
      isolatedDir: launched.isolatedDir,
      baseUrl: launched.baseUrl,
      launchEnv: launched.launchEnv,
      passed: checks.length - failed,
      failed,
      checks,
      routeCensus,
      externalRequestTotal: Object.values(externalRequestsByHost).reduce((a, b) => a + b, 0),
      externalRequestsByHost,
      unexpectedExternalHosts,
      internalLinks,
      sourceHostMentionsInHtml,
    };
  } finally {
    await browser?.close();
    await launched.stop();
  }
}

export interface InteractionSampleResult {
  clicked: number;
  /** Visible dynamically-mounted regions (id^=wr-obs-/wr-dyn-) after a click. */
  regionsAppeared: number;
  /**
   * Triggers whose observable state changed after the click without mounting
   * a region: aria-expanded / aria-checked / aria-selected / aria-pressed
   * transitions, a native <details> open toggle, or a visibility change of
   * the aria-controls target. Static-target disclosures and selection
   * toggles legitimately mount nothing (Task 24 GED-A) — the same evidence
   * the template parity QA accepts.
   */
  stateFlips: number;
}

/** Serialized observable state of one trigger (null when it is not in the DOM). */
async function readTriggerState(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const isVisible = (node: Element): boolean => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(node as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const stateAttr = (name: string): string | null =>
      el.closest(`[${name}]`)?.getAttribute(name) ?? null;
    const controls: string[] = [];
    const controlsAttr = el.getAttribute("aria-controls");
    if (controlsAttr) {
      for (const id of controlsAttr.split(/\s+/).filter((part) => part.length > 0)) {
        const target = document.getElementById(id);
        controls.push(`${id}:${target ? String(isVisible(target)) : "missing"}`);
      }
    }
    return JSON.stringify({
      expanded: stateAttr("aria-expanded"),
      checked: stateAttr("aria-checked"),
      selected: stateAttr("aria-selected"),
      pressed: stateAttr("aria-pressed"),
      open: el.closest("details")?.hasAttribute("open") ?? null,
      controls,
    });
  }, selector);
}

export async function sampleInteractions(
  page: Page,
  viewport: "desktop" | "mobile",
  limit: number,
): Promise<InteractionSampleResult> {
  const triggers = await page.evaluate((activeViewport: string) => {
    const variant = document.querySelector(`.wr-variant[data-wr-viewport="${activeViewport}"]`);
    if (!variant) return [] as string[];
    const out: string[] = [];
    for (const el of variant.querySelectorAll("[data-wr-pattern-id][data-wr-node]")) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      out.push(
        `.wr-variant[data-wr-viewport="${activeViewport}"] [data-wr-node="${el.getAttribute("data-wr-node")}"][data-wr-pattern-id="${el.getAttribute("data-wr-pattern-id")}"]`,
      );
    }
    return out;
  }, viewport);
  let clicked = 0;
  let regionsAppeared = 0;
  let stateFlips = 0;
  for (const selector of triggers.slice(0, limit)) {
    const before = await readTriggerState(page, selector);
    try {
      await page.locator(selector).first().click({ timeout: 5_000 });
      clicked++;
    } catch {
      continue;
    }
    await page.waitForTimeout(400);
    // Mount-type triggers: dynamic regions appearing (path unchanged).
    const visible = await page.evaluate(() => {
      let count = 0;
      for (const region of document.querySelectorAll('[id^="wr-obs-"], [id^="wr-dyn-"]')) {
        const rect = (region as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(region as HTMLElement);
        if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") count++;
      }
      return count;
    });
    regionsAppeared += visible;
    // Static-target triggers: attribute/visibility state flip on the trigger.
    const after = await readTriggerState(page, selector);
    if (before !== null && after !== null && before !== after) stateFlips++;
    await page.keyboard.press("Escape").catch(() => {});
  }
  return { clicked, regionsAppeared, stateFlips };
}
