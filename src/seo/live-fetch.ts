import type { SourceSeoSnapshot } from "./types.js";

/**
 * Bounded live fetch of the source site's robots.txt / sitemap files —
 * the ONE place the Source SEO Observer may touch the network, because no
 * stored artifact carries them (verified: no robots/sitemap file exists
 * anywhere under data/). Opt-in via `--live-site-files`; every result is marked
 * `live-fetched` with a timestamp, and a failure is recorded as
 * `unavailable`, never invented.
 *
 * Bounds: GET only, 15s timeout, max 3 sitemap files, 2 MB per file,
 * 10 sample URLs per sitemap.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_FILES = 3;
const MAX_BYTES = 2 * 1024 * 1024;

async function fetchTextBounded(
  url: string,
): Promise<{ httpStatus: number; text: string | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "web-recon-seo-observer/1.0 (source audit)" },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        httpStatus: response.status,
        text: response.ok ? buffer.subarray(0, MAX_BYTES).toString("utf8") : null,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      httpStatus: 0,
      text: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseRobotsTxt(content: string): { sitemapUrls: string[]; disallowRules: number } {
  const sitemapUrls: string[] = [];
  let disallowRules = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "sitemap" && value !== "") sitemapUrls.push(value);
    else if (field === "disallow" && value !== "") disallowRules += 1;
  }
  return { sitemapUrls, disallowRules };
}

export function classifySitemap(xml: string): {
  kind: "sitemap-index" | "urlset" | "unknown";
  urlCount: number;
  sampleUrls: string[];
} {
  const kind = /<sitemapindex[\s>]/.test(xml)
    ? "sitemap-index"
    : /<urlset[\s>]/.test(xml)
      ? "urlset"
      : "unknown";
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
  return { kind, urlCount: locs.length, sampleUrls: locs.slice(0, 10) };
}

/** Fetch robots.txt (+ up to MAX_SITEMAP_FILES sitemaps it names, falling back to /sitemap.xml). */
export async function fetchLiveSiteFiles(rootUrl: string): Promise<{
  robotsTxt: SourceSeoSnapshot["site"]["robotsTxt"];
  sitemaps: SourceSeoSnapshot["site"]["sitemaps"];
}> {
  const origin = new URL(rootUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;
  const fetchedAt = new Date().toISOString();
  const robots = await fetchTextBounded(robotsUrl);
  const parsed = robots.text !== null ? parseRobotsTxt(robots.text) : null;
  const robotsTxt: SourceSeoSnapshot["site"]["robotsTxt"] = {
    status: robots.text !== null ? "live-fetched" : "unavailable",
    url: robotsUrl,
    httpStatus: robots.httpStatus === 0 ? null : robots.httpStatus,
    fetchedAt,
    content: robots.text,
    sitemapUrls: parsed?.sitemapUrls ?? [],
    disallowRules: parsed?.disallowRules ?? null,
    error: robots.error,
  };

  const sitemapUrls =
    (parsed?.sitemapUrls.length ?? 0) > 0
      ? (parsed as { sitemapUrls: string[] }).sitemapUrls.slice(0, MAX_SITEMAP_FILES)
      : [`${origin}/sitemap.xml`];
  const sitemaps: SourceSeoSnapshot["site"]["sitemaps"] = [];
  for (const url of sitemapUrls) {
    const fetched = await fetchTextBounded(url);
    if (fetched.text === null) {
      sitemaps.push({
        url,
        httpStatus: fetched.httpStatus === 0 ? null : fetched.httpStatus,
        kind: "unknown",
        urlCount: null,
        sampleUrls: [],
        error: fetched.error ?? `http ${fetched.httpStatus}`,
      });
      continue;
    }
    const classified = classifySitemap(fetched.text);
    sitemaps.push({
      url,
      httpStatus: fetched.httpStatus,
      kind: classified.kind,
      urlCount: classified.urlCount,
      sampleUrls: classified.sampleUrls,
      error: null,
    });
  }
  return { robotsTxt, sitemaps };
}

/** The "fetch was not requested" record — the honest default. */
export function notFetchedSiteFiles(): {
  robotsTxt: SourceSeoSnapshot["site"]["robotsTxt"];
  sitemaps: SourceSeoSnapshot["site"]["sitemaps"];
} {
  return {
    robotsTxt: {
      status: "not-fetched",
      url: null,
      httpStatus: null,
      fetchedAt: null,
      content: null,
      sitemapUrls: [],
      disallowRules: null,
      error: null,
    },
    sitemaps: [],
  };
}
