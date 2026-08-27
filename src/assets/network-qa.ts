/**
 * Runtime network QA (Task 22 I): with asset-independent delivery active,
 * which runtime requests STILL go to source asset / CDN / font hosts?
 * Measured in a real browser (request capture), reported honestly — the
 * residual count is the finding, not a failure to hide.
 */
import { chromium, type Page } from "playwright";

export interface NetworkQaOptions {
  /** Asset-independent (proxied) base URL. */
  servedBaseUrl: string;
  /** Unmodified upstream app base URL — the BEFORE measurement. */
  upstreamBaseUrl: string;
  routes: string[];
  /**
   * Exact source asset/CDN/font hosts from the inventory. A `host:port`
   * entry also matches (real source hosts never carry a port; fixtures do).
   */
  sourceHosts: string[];
  /** Apex domain of the source site (e.g. "stripe.com") — subdomain match. */
  sourceApex: string;
  settleMs?: number;
}

export interface RouteRequestSummary {
  route: string;
  total: number;
  local: number;
  sourceHost: number;
  otherExternal: number;
  sourceUrls: string[];
}

export interface NetworkQaReport {
  baseline: RouteRequestSummary[];
  independent: RouteRequestSummary[];
  totals: {
    baselineSourceRequests: number;
    independentSourceRequests: number;
    residualSourceUrls: string[];
    residualByHost: Record<string, number>;
  };
}

function classifyHost(
  host: string,
  /** host:port form (URL.host) — a source host given WITH an explicit port wins over the loopback shortcut. */
  hostWithPort: string,
  sourceHosts: Set<string>,
  sourceApex: string,
): "local" | "source" | "other" {
  if (sourceHosts.has(hostWithPort)) return "source";
  if (host === "127.0.0.1" || host === "localhost") return "local";
  if (sourceHosts.has(host)) return "source";
  if (host === sourceApex || host.endsWith("." + sourceApex)) return "source";
  return "other";
}

const NAME_SHIM = "window.__name = window.__name || ((f) => f);";

async function measureRoute(
  page: Page,
  baseUrl: string,
  route: string,
  sourceHosts: Set<string>,
  sourceApex: string,
  settleMs: number,
): Promise<RouteRequestSummary> {
  const requests: string[] = [];
  const onRequest = (request: { url(): string }): void => {
    requests.push(request.url());
  };
  page.on("request", onRequest);
  await page.goto(baseUrl + route, { waitUntil: "load", timeout: 60_000 });
  await page.evaluate(NAME_SHIM);
  await page.waitForTimeout(settleMs);
  // Scroll through the page so lazy-loaded images issue their requests too.
  await page.evaluate(
    "(async () => { const step = window.innerHeight; for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); })()",
  );
  await page.waitForTimeout(settleMs);
  page.off("request", onRequest);

  const summary: RouteRequestSummary = {
    route,
    total: requests.length,
    local: 0,
    sourceHost: 0,
    otherExternal: 0,
    sourceUrls: [],
  };
  for (const url of requests) {
    let host = "";
    let hostWithPort = "";
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      hostWithPort = parsed.host;
    } catch {
      continue;
    }
    const cls = classifyHost(host, hostWithPort, sourceHosts, sourceApex);
    if (cls === "local") summary.local++;
    else if (cls === "source") {
      summary.sourceHost++;
      summary.sourceUrls.push(url);
    } else summary.otherExternal++;
  }
  return summary;
}

export async function runNetworkQa(options: NetworkQaOptions): Promise<NetworkQaReport> {
  const sourceHosts = new Set(options.sourceHosts);
  const settleMs = options.settleMs ?? 1500;
  const browser = await chromium.launch();
  try {
    const baseline: RouteRequestSummary[] = [];
    const independent: RouteRequestSummary[] = [];
    for (const route of options.routes) {
      const pageA = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      baseline.push(
        await measureRoute(pageA, options.upstreamBaseUrl, route, sourceHosts, options.sourceApex, settleMs),
      );
      await pageA.close();
      const pageB = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      independent.push(
        await measureRoute(pageB, options.servedBaseUrl, route, sourceHosts, options.sourceApex, settleMs),
      );
      await pageB.close();
    }
    const residual = independent.flatMap((r) => r.sourceUrls);
    const residualByHost: Record<string, number> = {};
    for (const url of residual) {
      const host = new URL(url).hostname;
      residualByHost[host] = (residualByHost[host] ?? 0) + 1;
    }
    return {
      baseline,
      independent,
      totals: {
        baselineSourceRequests: baseline.reduce((sum, r) => sum + r.sourceHost, 0),
        independentSourceRequests: independent.reduce((sum, r) => sum + r.sourceHost, 0),
        residualSourceUrls: [...new Set(residual)].sort(),
        residualByHost,
      },
    };
  } finally {
    await browser.close();
  }
}
