import { z } from "zod";

/**
 * Discovery layer types & schemas (Phase 2).
 *
 * The engine talks to a {@link DiscoveryProvider} abstraction so that Firecrawl
 * (or any future provider) is not coupled into the rest of the codebase. A
 * provider is responsible only for *fetching* raw URL metadata; deterministic
 * normalization / dedup / same-site filtering happens in a provider-agnostic
 * step (see `build-result.ts`).
 */

/** Bumped when the persisted DiscoveryResult shape changes. */
export const SCHEMA_VERSION = 2 as const;

/**
 * Versions a reader accepts. v1 artifacts predate root seeding and simply lack
 * `rootSeeded`; their meaning is unchanged, so they stay readable forever.
 */
export const READABLE_SCHEMA_VERSIONS = [1, 2] as const;
const ReadableSchemaVersionSchema = z.union([z.literal(1), z.literal(2)]);

/** Safe default cap on how many URLs a single Map call may return. */
export const DEFAULT_MAX_URLS = 100;

/**
 * A small, deliberately conservative set of obvious tracking parameters that
 * are safe to strip during normalization. This is intentionally NOT a large
 * database — query parameters are frequently part of a page's real identity
 * (e.g. `?bo_table=notice`), so we only remove the few that never are.
 */
export const TRACKING_PARAMS: readonly string[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
];

/** Options controlling a discovery run. */
export interface DiscoveryOptions {
  /** Upper bound on discovered URLs; passed through to the provider. */
  maxUrls?: number;
  /** Include subdomains of the root host in the same-site set. Default: false. */
  includeSubdomains?: boolean;
  /** Provider request timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * A single link exactly as returned by the provider, before normalization.
 * We preserve the raw url plus whatever metadata the provider gives us so a
 * future re-analysis does not have to re-run the Map call.
 */
export const RawDiscoveryLinkSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  position: z.number().optional(),
  category: z.string().optional(),
});
export type RawDiscoveryLink = z.infer<typeof RawDiscoveryLinkSchema>;

/** The raw, provider-native discovery output (persisted as discovery.raw.json). */
export const RawDiscoverySchema = z.object({
  provider: z.string(),
  rootUrl: z.string(),
  requestedLimit: z.number().int().positive(),
  fetchedAt: z.string(),
  rawCount: z.number().int().nonnegative(),
  links: z.array(RawDiscoveryLinkSchema),
});
export type RawDiscovery = z.infer<typeof RawDiscoverySchema>;

/** A normalized, deduplicated, same-site link (persisted inside discovery.json). */
export const DiscoveryLinkSchema = z.object({
  /** Original URL as discovered by the provider. */
  url: z.string(),
  /** Deterministically normalized form used as the dedup key. */
  normalizedUrl: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});
export type DiscoveryLink = z.infer<typeof DiscoveryLinkSchema>;

/** The final, normalized discovery result (persisted as discovery.json). */
export const DiscoveryResultSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  rootUrl: z.string(),
  /** Populated only if the effective root differs from the requested one. */
  finalRootUrl: z.string().optional(),
  provider: z.string(),
  discoveredAt: z.string(),
  /**
   * Root URL Invariant (Task 17): true when the input root URL was NOT in the
   * provider's links and was injected into `links` by `buildDiscoveryResult`.
   * The candidate set is `normalize(provider.links UNION rootUrl)` — the root
   * is the one URL the caller knows for certain, so it never depends on what a
   * provider happens to return. When seeded,
   * `links.length === normalizedCount + 1`; the provider counters below always
   * describe provider links only. Absent on v1 artifacts (no seeding existed).
   */
  rootSeeded: z.boolean().optional(),
  /** Total links the provider returned. */
  rawCount: z.number().int().nonnegative(),
  /** Unique same-site links the provider contributed to `links`. */
  normalizedCount: z.number().int().nonnegative(),
  /** Same-site parseable links dropped because they collapsed onto an existing normalized URL. */
  duplicateCount: z.number().int().nonnegative(),
  /** Links that could not be parsed / were not http(s). */
  invalidCount: z.number().int().nonnegative(),
  /** Parseable links dropped because they belong to a different site. */
  externalFilteredCount: z.number().int().nonnegative(),
  links: z.array(DiscoveryLinkSchema),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

/**
 * Abstraction over a URL-discovery backend. A provider only fetches raw URL
 * metadata; it does not normalize. Keeping the boundary here means Firecrawl
 * stays isolated behind {@link FirecrawlDiscoveryProvider}.
 */
export interface DiscoveryProvider {
  /** Stable identifier, e.g. "firecrawl". Stored in the result. */
  readonly name: string;
  discover(url: string, options?: DiscoveryOptions): Promise<RawDiscovery>;
}
