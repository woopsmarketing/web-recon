import {
  DiscoveryResultSchema,
  SCHEMA_VERSION,
  type DiscoveryLink,
  type DiscoveryOptions,
  type DiscoveryResult,
  type RawDiscovery,
} from "./types.js";
import { isSameSite, normalizeUrl } from "./normalize-url.js";

/**
 * Turn a provider's raw discovery into the final normalized, deduplicated,
 * same-site DiscoveryResult. Pure and deterministic: same raw input always
 * yields the same output. The returned value is validated against the Zod
 * schema before being handed back.
 *
 * Invariant: rawCount === normalizedCount + duplicateCount + invalidCount +
 * externalFilteredCount. Those four counters describe PROVIDER links only.
 *
 * Root URL Invariant (Task 17): the candidate set is
 * `normalize(provider.links UNION rootUrl)`. The input root is the one URL the
 * caller knows for certain exists, so it must never depend on whether the
 * provider's Map result happens to include it (stripe.com's did not, and the
 * clone shipped without a homepage). When the normalized root is absent from
 * the provider links it is seeded into `links` and `rootSeeded` is set, so
 * `links.length === normalizedCount + 1` for a seeded result. Dedup,
 * same-site handling and normalization are the existing deterministic rules —
 * the seed goes through `normalizeUrl` like every other candidate.
 */
export function buildDiscoveryResult(
  raw: RawDiscovery,
  rootUrl: string,
  options: DiscoveryOptions = {},
  discoveredAt: string = new Date().toISOString(),
): DiscoveryResult {
  const includeSubdomains = options.includeSubdomains ?? false;

  let invalidCount = 0;
  let externalFilteredCount = 0;
  let duplicateCount = 0;

  // Preserve first-seen order while deduping on the normalized URL.
  const byNormalized = new Map<string, DiscoveryLink>();

  for (const link of raw.links) {
    const normalizedUrl = normalizeUrl(link.url);
    if (normalizedUrl === null) {
      invalidCount++;
      continue;
    }
    if (!isSameSite(normalizedUrl, rootUrl, includeSubdomains)) {
      externalFilteredCount++;
      continue;
    }

    const existing = byNormalized.get(normalizedUrl);
    if (existing) {
      duplicateCount++;
      // Backfill metadata if the first occurrence lacked it.
      if (!existing.title && link.title) existing.title = link.title;
      if (!existing.description && link.description) {
        existing.description = link.description;
      }
      continue;
    }

    byNormalized.set(normalizedUrl, {
      url: link.url,
      normalizedUrl,
      ...(link.title ? { title: link.title } : {}),
      ...(link.description ? { description: link.description } : {}),
    });
  }

  // Provider-derived unique same-site links, before any seeding. The four
  // provider counters (raw/duplicate/invalid/externalFiltered) balance against
  // THIS number, never against the seeded total.
  const providerLinkCount = byNormalized.size;

  // Root URL Invariant: candidates = normalize(links UNION rootUrl).
  const normalizedRoot = normalizeUrl(rootUrl);
  let rootSeeded = false;
  if (normalizedRoot !== null && !byNormalized.has(normalizedRoot)) {
    byNormalized.set(normalizedRoot, { url: rootUrl, normalizedUrl: normalizedRoot });
    rootSeeded = true;
  }

  // Sort by normalized URL for stable, diff-friendly output.
  const links = [...byNormalized.values()].sort((a, b) =>
    a.normalizedUrl < b.normalizedUrl ? -1 : a.normalizedUrl > b.normalizedUrl ? 1 : 0,
  );

  const result: DiscoveryResult = {
    schemaVersion: SCHEMA_VERSION,
    rootUrl,
    provider: raw.provider,
    discoveredAt,
    rootSeeded,
    rawCount: raw.rawCount,
    normalizedCount: providerLinkCount,
    duplicateCount,
    invalidCount,
    externalFilteredCount,
    links,
  };

  // Fail loudly if we ever produce something that violates the schema.
  return DiscoveryResultSchema.parse(result);
}
