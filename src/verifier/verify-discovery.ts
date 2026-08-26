import { chromium, type Browser } from "playwright";
import type { DiscoveryResult } from "../discovery/index.js";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
} from "../observer/types.js";
import {
  DEFAULT_CONCURRENCY,
  NAV_TIMEOUT_MS,
  SCHEMA_VERSION,
  WAIT_UNTIL,
  type CandidateVerification,
  type VerificationResult,
  type VerifierProfile,
} from "./types.js";
import {
  VERIFIER_VIEWPORT,
  verifyCandidate,
  type Candidate,
} from "./verify-candidate.js";
import { buildDuplicateGroups } from "./duplicate-groups.js";

/**
 * Orchestrate verification of every candidate in a DiscoveryResult (Task 06).
 *
 * One shared Chromium PROCESS; each candidate gets a fresh context inside
 * {@link verifyCandidate}. Candidates run through a small bounded concurrency
 * pool (default 3) so we never overload the site. Firecrawl is NOT called here —
 * this reuses already-discovered data ("Explore Once → Reuse Data").
 */

const ENGINE = "playwright-chromium";

export interface VerifyDiscoveryOptions {
  concurrency?: number;
  sourceDiscoveryFile: string;
  verifiedAt?: string;
  /** Progress callback: fired as each candidate completes (order not guaranteed). */
  onProgress?: (
    done: number,
    total: number,
    verification: CandidateVerification,
  ) => void;
  /** Inject a browser (used by the fixture smoke test); default launches Chromium. */
  browser?: Browser;
}

/**
 * Run `worker` over `items` with at most `limit` concurrent in flight. Results
 * are returned in the ORIGINAL item order regardless of completion order.
 */
async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners: Promise<void>[] = [];
  const n = Math.min(limit, items.length);
  for (let w = 0; w < n; w++) {
    runners.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) break;
          results[i] = await worker(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

export async function verifyDiscovery(
  discovery: DiscoveryResult,
  options: VerifyDiscoveryOptions,
): Promise<VerificationResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const verifiedAt = options.verifiedAt ?? new Date().toISOString();
  const rootUrl = discovery.rootUrl;

  const candidates: Candidate[] = discovery.links.map((l) => ({
    candidateUrl: l.url,
    normalizedCandidateUrl: l.normalizedUrl,
  }));

  const browser = options.browser ?? (await chromium.launch());
  const ownsBrowser = !options.browser;

  let done = 0;
  let verifications: CandidateVerification[];
  try {
    verifications = await runPool(candidates, concurrency, async (candidate) => {
      const v = await verifyCandidate(browser, candidate, rootUrl);
      done++;
      options.onProgress?.(done, candidates.length, v);
      return v;
    });
  } finally {
    if (ownsBrowser) await browser.close();
  }

  const duplicateGroups = buildDuplicateGroups(verifications);

  const uniqueFinalUrls = new Set(
    verifications.filter((v) => v.finalUrl).map((v) => v.finalUrl as string),
  );

  const count = (status: CandidateVerification["status"]): number =>
    verifications.filter((v) => v.status === status).length;

  const profile: VerifierProfile = {
    locale: OBSERVATION_LOCALE,
    timezone: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME,
    reducedMotion: OBSERVATION_REDUCED_MOTION,
    viewportWidth: VERIFIER_VIEWPORT.width,
    viewportHeight: VERIFIER_VIEWPORT.height,
    waitUntil: WAIT_UNTIL,
    navTimeoutMs: NAV_TIMEOUT_MS,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    engine: ENGINE,
    rootUrl,
    sourceDiscoveryFile: options.sourceDiscoveryFile,
    verifiedAt,
    profile,
    concurrency,
    totalCandidates: verifications.length,
    validHtmlCount: count("valid-html"),
    httpErrorCount: count("http-error"),
    navigationErrorCount: count("navigation-error"),
    nonHtmlCount: count("non-html"),
    externalRedirectCount: count("external-redirect"),
    blockedCount: count("blocked"),
    redirectedCount: verifications.filter((v) => v.redirected).length,
    uniqueFinalUrlCount: uniqueFinalUrls.size,
    duplicateGroupCount: duplicateGroups.length,
    candidates: verifications,
    duplicateGroups,
  };
}
