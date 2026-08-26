import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { findIntroducedJsErrors } from "../recon-template/parity-qa.js";
import { runInternalLinkQa } from "./link-qa.js";
import type { LoadedPlanRun } from "./run.js";
import { startSeoServedApp } from "./serve.js";

/**
 * Browser QA for the production SEO candidate (Task 21 J).
 *
 * Launches the immutable template app (+ content overlay) behind the SEO
 * proxy and verifies IN A REAL BROWSER, after hydration settle:
 *   - document.title is the plan title (the document-title-not-slotted gap,
 *     closed — and checked post-hydration so a React title revert would FAIL);
 *   - preview robots meta (noindex) present; canonical absent in preview;
 *   - meta description matches the plan (or is honestly absent);
 *   - every ld+json in the head parses and carries the production identity;
 *   - the SEO-CONTROLLED head surfaces (title, meta content, canonical,
 *     JSON-LD) contain none of the source-brand terms. App-emitted head
 *     asset references (e.g. body <link rel="preload"> elements React hoists
 *     into the head, whose hrefs still point at the source CDN before the
 *     asset-independence layer runs) are MEASURED and reported per route —
 *     they are the asset layer's territory, so they never grade the SEO
 *     layer, and hiding them would be worse than counting them;
 *   - /robots.txt serves the preview policy; /sitemap.xml is 404 in preview;
 *   - zero SEO-INTRODUCED runtime/console errors: each route is also loaded
 *     on the un-proxied upstream serving of the SAME app, and only errors
 *     absent from that reference capture fail the gate (the Task 26B
 *     introduced-vs-inherited rule — an error the underlying app already
 *     emits, e.g. a source CDN refusing cross-origin asset loads, is an
 *     inherited limitation, not an SEO defect; it is still reported);
 * plus the fetch-based internal link audit over every route.
 */

/** The head surfaces the SEO layer itself controls or emits. */
export interface SeoControlledHeadSurfaces {
  documentTitle: string | null;
  headTitle: string | null;
  metaContents: string[];
  canonicalHrefs: string[];
  jsonLdRaw: string[];
}

/**
 * Source-brand-term scan over the SEO-controlled head surfaces only.
 * A term found here IS an SEO-layer failure (the plan is brand-isolated by
 * construction, so any hit means a source value leaked through the layer).
 */
export function findSeoSurfaceBrandLeaks(
  surfaces: SeoControlledHeadSurfaces,
  forbiddenTerms: readonly string[],
): string[] {
  const haystacks = [
    surfaces.documentTitle ?? "",
    surfaces.headTitle ?? "",
    ...surfaces.metaContents,
    ...surfaces.canonicalHrefs,
    ...surfaces.jsonLdRaw,
  ].map((s) => s.toLowerCase());
  return forbiddenTerms.filter((term) =>
    haystacks.some((h) => h.includes(term.toLowerCase())),
  );
}

/**
 * URL attributes (href/src) of app-emitted head elements that reference a
 * source-brand host — typically image preloads hoisted out of the observed
 * body. Measured evidence for the asset layer, never an SEO-layer grade.
 */
export function findHeadSourceAssetReferences(
  headHtml: string,
  forbiddenTerms: readonly string[],
): string[] {
  const refs: string[] = [];
  const attrPattern = /\b(?:href|src)="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(headHtml)) !== null) {
    const url = match[1];
    const lower = url.toLowerCase();
    if (forbiddenTerms.some((term) => lower.includes(term.toLowerCase()))) {
      refs.push(url);
    }
  }
  return [...new Set(refs)];
}

export interface SeoQaRouteResult {
  route: string;
  checks: { name: string; pass: boolean; detail?: string }[];
  /**
   * App-emitted head asset URLs still referencing source-brand hosts on this
   * route (measured; asset-layer territory — see module doc).
   */
  headSourceAssetReferences: string[];
}

export interface SeoQaResult {
  pass: boolean;
  routes: SeoQaRouteResult[];
  siteChecks: { name: string; pass: boolean; detail?: string }[];
  totals: { checks: number; failures: number };
  linkTotals: {
    fetchedRoutes: number;
    anchors: number;
    routeResolves: number;
    brokenInternal: number;
    sourceHostAbsolute: number;
    external: number;
    nonNavigational: number;
  };
  /** Errors captured on the SEO-served pages (raw, route-prefixed). */
  runtimeErrors: string[];
  /** Errors captured on the un-proxied upstream serving of the same routes. */
  upstreamRuntimeErrors: string[];
  /** runtimeErrors minus those the upstream reference also emits — the gate. */
  introducedRuntimeErrors: string[];
}

export async function runSeoQa(options: {
  planRun: LoadedPlanRun;
  slotValuesFile?: string;
  qaRoutes?: string[];
  log?: (line: string) => void;
}): Promise<SeoQaResult> {
  const { planRun } = options;
  const log = options.log ?? (() => {});
  const preview = planRun.plan.domainState.mode === "preview";
  const forbiddenTerms = planRun.manifest.checks.brandIsolation.forbiddenTerms;

  const injectedRoutes = planRun.plan.routes.filter((r) => r.contentScope === "content-injected").map((r) => r.route);
  const fallbackSample = planRun.plan.routes
    .filter((r) => r.contentScope === "not-yet-injected")
    .slice(0, 2)
    .map((r) => r.route);
  const qaRoutes = options.qaRoutes ?? [...injectedRoutes, ...fallbackSample];

  const app = await startSeoServedApp({
    appDir: planRun.templateAppDir,
    slotValuesFile: options.slotValuesFile,
    proxy: {
      renderedHead: planRun.renderedHead,
      robotsTxt: planRun.robotsTxt,
      sitemapXml: planRun.sitemapXml,
    },
    log,
  });

  const routes: SeoQaRouteResult[] = [];
  const siteChecks: SeoQaResult["siteChecks"] = [];
  const runtimeErrors: string[] = [];
  const upstreamRuntimeErrors: string[] = [];
  const browser = await chromium.launch();
  try {
    for (const routeKey of qaRoutes) {
      const planRoute = planRun.plan.routes.find((r) => r.route === routeKey);
      const headEntry = planRun.renderedHead.routes.find((r) => r.route === routeKey);
      if (planRoute === undefined || headEntry === undefined) continue;
      const checks: SeoQaRouteResult["checks"] = [];
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(`${routeKey}: ${message.text()}`);
      });
      page.on("pageerror", (error) => runtimeErrors.push(`${routeKey}: ${error.message}`));
      await page.goto(app.baseUrl + routeKey, { waitUntil: "load", timeout: 60_000 });
      // tsx/esbuild keepNames workaround (same as theme-qa.ts): page.evaluate
      // callbacks reference an injected __name helper the page never defines.
      await page.evaluate("globalThis.__name = globalThis.__name || function (fn) { return fn; };");
      await page.waitForTimeout(1_500); // hydration settle — a React title revert must be visible here

      const observed = await page.evaluate(() => {
        const head = document.head;
        const metas = (selector: string): string[] =>
          [...head.querySelectorAll<HTMLMetaElement>(selector)].map((m) => m.content);
        return {
          documentTitle: document.title,
          headTitle: head.querySelector("title")?.textContent ?? null,
          robots: metas('meta[name="robots"]'),
          description: metas('meta[name="description"]'),
          canonical: [...head.querySelectorAll('link[rel="canonical"]')].map(
            (l) => (l as HTMLLinkElement).href,
          ),
          ogTitle: metas('meta[property="og:title"]'),
          ogSiteName: metas('meta[property="og:site_name"]'),
          jsonLdRaw: [...head.querySelectorAll('script[type="application/ld+json"]')].map(
            (s) => s.textContent ?? "",
          ),
          metaContents: [...head.querySelectorAll<HTMLMetaElement>("meta")].map((m) => m.content),
          headHtml: head.innerHTML,
        };
      });

      // Introduced-vs-inherited reference (Task 26B rule): the SAME route on
      // the un-proxied upstream serving of the same app. Errors it emits are
      // the app's own (e.g. source-CDN CORS refusals) — inherited, not SEO's.
      const upstreamPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      upstreamPage.on("console", (message) => {
        if (message.type() === "error") upstreamRuntimeErrors.push(`${routeKey}: ${message.text()}`);
      });
      upstreamPage.on("pageerror", (error) => upstreamRuntimeErrors.push(`${routeKey}: ${error.message}`));
      await upstreamPage.goto(app.upstreamBaseUrl + routeKey, { waitUntil: "load", timeout: 60_000 });
      await upstreamPage.waitForTimeout(1_500);
      await upstreamPage.close();

      checks.push({
        name: "document.title renders the production plan title (post-hydration)",
        pass: observed.documentTitle === headEntry.title,
        detail: JSON.stringify({ expected: headEntry.title, actual: observed.documentTitle }),
      });
      checks.push({
        name: "head <title> element carries the plan title",
        pass: observed.headTitle === headEntry.title,
        detail: JSON.stringify(observed.headTitle),
      });
      checks.push({
        name: `robots meta is ${planRoute.robotsMeta.value}`,
        pass: observed.robots.includes(planRoute.robotsMeta.value),
        detail: JSON.stringify(observed.robots),
      });
      if (planRoute.description.value !== null) {
        checks.push({
          name: "meta description equals the plan value",
          pass: observed.description.includes(planRoute.description.value),
          detail: JSON.stringify(observed.description),
        });
      } else {
        checks.push({
          name: "needs-input description is honestly absent",
          pass: observed.description.length === 0,
          detail: JSON.stringify(observed.description),
        });
      }
      if (preview) {
        checks.push({
          name: "no canonical link in preview (never invented)",
          pass: observed.canonical.length === 0,
          detail: JSON.stringify(observed.canonical),
        });
      }
      checks.push({
        name: "og:title + og:site_name present",
        pass: observed.ogTitle.length === 1 && observed.ogSiteName.length === 1,
        detail: JSON.stringify({ ogTitle: observed.ogTitle, ogSiteName: observed.ogSiteName }),
      });
      let jsonLdOk = observed.jsonLdRaw.length > 0;
      let jsonLdDetail = `${observed.jsonLdRaw.length} script(s)`;
      for (const raw of observed.jsonLdRaw) {
        try {
          const parsed = JSON.parse(raw) as { "@graph"?: { name?: string }[] };
          const names = (parsed["@graph"] ?? []).map((n) => n.name).filter((n): n is string => typeof n === "string");
          if (!names.includes(planRun.plan.site.siteName.value as string)) {
            jsonLdOk = false;
            jsonLdDetail = `parsed but missing production identity: ${JSON.stringify(names)}`;
          }
        } catch (error) {
          jsonLdOk = false;
          jsonLdDetail = `unparseable: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      checks.push({ name: "JSON-LD parses and carries the production identity", pass: jsonLdOk, detail: jsonLdDetail });
      const leaks = findSeoSurfaceBrandLeaks(
        {
          documentTitle: observed.documentTitle,
          headTitle: observed.headTitle,
          metaContents: observed.metaContents,
          canonicalHrefs: observed.canonical,
          jsonLdRaw: observed.jsonLdRaw,
        },
        forbiddenTerms,
      );
      checks.push({
        name: "SEO-controlled head surfaces contain no source-brand term",
        pass: leaks.length === 0,
        detail: JSON.stringify(leaks),
      });
      const headSourceAssetReferences = findHeadSourceAssetReferences(
        observed.headHtml,
        forbiddenTerms,
      );
      routes.push({ route: routeKey, checks, headSourceAssetReferences });
      log(`[seo:qa] ${routeKey} — ${checks.filter((c) => c.pass).length}/${checks.length}`);
      await page.close();
    }

    // ---- site files at the serve boundary ---------------------------------
    const robotsResponse = await fetch(`${app.baseUrl}/robots.txt`);
    const robotsBody = await robotsResponse.text();
    siteChecks.push({
      name: "GET /robots.txt is 200 text/plain",
      pass: robotsResponse.status === 200 && (robotsResponse.headers.get("content-type") ?? "").includes("text/plain"),
      detail: String(robotsResponse.status),
    });
    if (preview) {
      siteChecks.push({
        name: "preview robots.txt disallows everything and names no Sitemap",
        pass: /Disallow: \/$/m.test(robotsBody) && !/^Sitemap:/m.test(robotsBody),
        detail: robotsBody.split("\n").filter((l) => !l.startsWith("#")).join(" | "),
      });
      const sitemapResponse = await fetch(`${app.baseUrl}/sitemap.xml`);
      siteChecks.push({
        name: "GET /sitemap.xml is 404 in preview (no invented domain)",
        pass: sitemapResponse.status === 404,
        detail: String(sitemapResponse.status),
      });
    }

    // ---- internal link audit over every route -----------------------------
    const linkQa = await runInternalLinkQa({
      baseUrl: app.baseUrl,
      routes: planRun.plan.routes.map((r) => r.route),
      sourceHost: planRun.plan.sourceHost,
      log,
    });
    siteChecks.push({
      name: "every planned route serves 200 through the SEO proxy",
      pass: linkQa.totals.fetchedRoutes === planRun.plan.routes.length,
      detail: `${linkQa.totals.fetchedRoutes}/${planRun.plan.routes.length}`,
    });
    const introducedRuntimeErrors = findIntroducedJsErrors(upstreamRuntimeErrors, runtimeErrors);
    siteChecks.push({
      name: "0 SEO-introduced runtime/console errors across QA routes",
      pass: introducedRuntimeErrors.length === 0,
      detail: JSON.stringify({
        introduced: introducedRuntimeErrors.slice(0, 5),
        inheritedFromApp: runtimeErrors.length - introducedRuntimeErrors.length,
      }),
    });

    const allChecks = [...routes.flatMap((r) => r.checks), ...siteChecks];
    const failures = allChecks.filter((c) => !c.pass).length;
    const result: SeoQaResult = {
      pass: failures === 0,
      routes,
      siteChecks,
      totals: { checks: allChecks.length, failures },
      linkTotals: {
        fetchedRoutes: linkQa.totals.fetchedRoutes,
        anchors: linkQa.totals.anchors,
        routeResolves: linkQa.totals.routeResolves,
        brokenInternal: linkQa.totals.brokenInternal.length,
        sourceHostAbsolute: linkQa.totals.sourceHostAbsolute,
        external: linkQa.totals.external,
        nonNavigational: linkQa.totals.nonNavigational,
      },
      runtimeErrors,
      upstreamRuntimeErrors,
      introducedRuntimeErrors,
    };
    await writeFile(
      path.join(planRun.runDir, "report", "qa.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(planRun.runDir, "report", "link-qa.json"),
      JSON.stringify(linkQa, null, 2) + "\n",
      "utf8",
    );
    return result;
  } finally {
    await browser.close();
    await app.stop();
  }
}
