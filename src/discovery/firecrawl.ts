import { Firecrawl, SdkError } from "firecrawl";
import {
  DEFAULT_MAX_URLS,
  type DiscoveryOptions,
  type DiscoveryProvider,
  type RawDiscovery,
  type RawDiscoveryLink,
} from "./types.js";

/** Default provider request timeout (ms) for a Map call. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Firecrawl-backed {@link DiscoveryProvider}.
 *
 * Uses the Firecrawl **Map** endpoint (not Crawl): the goal is to discover a
 * site's URL structure, not to fetch page content. The Firecrawl SDK is only
 * referenced here — the rest of the engine depends on the DiscoveryProvider
 * abstraction instead.
 */
export class FirecrawlDiscoveryProvider implements DiscoveryProvider {
  readonly name = "firecrawl";
  private readonly client: Firecrawl;

  /**
   * @param apiKey The Firecrawl API key. Required — a Firecrawl discovery run
   *   cannot proceed without it. The key value is never logged or stored.
   */
  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY is required for Firecrawl discovery.");
    }
    this.client = new Firecrawl({ apiKey });
  }

  async discover(
    url: string,
    options: DiscoveryOptions = {},
  ): Promise<RawDiscovery> {
    const limit = options.maxUrls ?? DEFAULT_MAX_URLS;
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let data;
    try {
      data = await this.client.map(url, {
        limit,
        timeout,
        // Query parameters can be part of a page's identity; keep them.
        ignoreQueryParameters: false,
        includeSubdomains: options.includeSubdomains ?? false,
        // Use the sitemap when available but also fall back to discovery.
        sitemap: "include",
      });
    } catch (err) {
      throw new Error(`Discovery failed: ${describeFirecrawlError(err)}`);
    }

    const links: RawDiscoveryLink[] = (data.links ?? []).map((link) => ({
      url: link.url,
      ...(link.title ? { title: link.title } : {}),
      ...(link.description ? { description: link.description } : {}),
      ...(typeof link.position === "number" ? { position: link.position } : {}),
      ...(link.category ? { category: link.category } : {}),
    }));

    return {
      provider: this.name,
      rootUrl: url,
      requestedLimit: limit,
      fetchedAt: new Date().toISOString(),
      rawCount: links.length,
      links,
    };
  }
}

/**
 * Map a Firecrawl error into a human-readable cause without leaking the API
 * key or any authorization header. Never include raw request details.
 */
function describeFirecrawlError(err: unknown): string {
  if (err instanceof SdkError) {
    switch (err.status) {
      case 401:
        return "Firecrawl authentication failed (401) — check FIRECRAWL_API_KEY";
      case 402:
        return "Firecrawl payment required (402) — out of credits or over plan limit";
      case 429:
        return "Firecrawl rate limit exceeded (429)";
      default:
        if (err.status && err.status >= 500) {
          return `Firecrawl server error (${err.status})`;
        }
        return err.status
          ? `Firecrawl error (${err.status}): ${err.message}`
          : `Firecrawl error: ${err.message}`;
    }
  }
  if (err instanceof Error) {
    // Timeouts and network errors surface here.
    return err.message;
  }
  return "unknown error";
}
