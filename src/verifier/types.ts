import { z } from "zod";
import { StructuralProfileSchema } from "./structural-profile.js";

/**
 * Verifier layer types & schemas (Task 06 — Discovery Candidate Verification).
 *
 * A Firecrawl Map result is a list of *candidates*, not confirmed pages. The
 * Verifier visits each candidate ONCE in a real Chromium (Playwright) and records
 * only the lightweight signals needed to answer one question:
 *
 *   > Can this URL be used as a Deep Observation / Page Analysis candidate?
 *
 * It is deliberately a FAST FILTER — never a deep observation. It does NOT
 * collect computed styles, geometry, screenshots, assets, or a mobile pass; that
 * is the Observer's job (Task 03–05). It is strictly read-only (GET navigation +
 * page inspection): no click / input / form submit / login / purchase.
 *
 * Provenance (kept explicit, matching the project philosophy):
 *  - `observed`  : read directly from the response / rendered page — HTTP status,
 *                  final URL, content-type, title, canonical tag, meta robots,
 *                  body text, DOM element count.
 *  - `derived`   : deterministically computed from observed values, no AI —
 *                  same-site, redirected, fingerprints, duplicate groups,
 *                  verified-url eligibility.
 * There is no AI/LLM inference anywhere in verification.
 *
 * Task 08 added a second, deliberately COARSER structural signal next to the
 * exact fingerprints (see {@link ./structural-profile.ts}). The two answer
 * different questions and are never mixed:
 *
 *   textHash + structureHash   (exact)   → duplicate / identity
 *   StructuralProfile          (coarse)  → template / page family
 *
 * The exact fingerprints keep their Task 06 meaning byte for byte; nothing about
 * duplicate detection changed.
 */

/**
 * Bumped when the persisted verification/verified-url shape changes.
 * v2 (Task 08): added the optional coarse `structuralProfile`.
 */
export const SCHEMA_VERSION = 2 as const;

/** Conservative default concurrency — never hammer a site while verifying. */
export const DEFAULT_CONCURRENCY = 3;
/** Allowed concurrency range (inclusive). */
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 8;

/**
 * Per-candidate navigation timeout (ms). Verification is a fast filter, so this
 * is well under the Observer's 45s deep-observation budget: a candidate that
 * cannot even respond in time is recorded as a navigation error, not waited on.
 */
export const NAV_TIMEOUT_MS = 25_000;

/**
 * Short, bounded settle after `domcontentloaded` before reading identity signals
 * from a valid HTML page. We do NOT wait for `networkidle` — existence + a title
 * / canonical / body-text snapshot only need the initial document to stabilize.
 */
export const SETTLE_MS = 500;

/** Navigation wait state (recorded for reproducibility). */
export const WAIT_UNTIL = "domcontentloaded" as const;

/** Max characters of normalized body text fed into the text fingerprint hash.
 * The full normalized length is still recorded as `bodyTextLength`; only the
 * hashed slice is capped, to bound cross-context transfer on very large pages. */
export const TEXT_HASH_MAX_LEN = 500_000;

/** Max elements walked when building the DOM structure signature (safety cap). */
export const STRUCTURE_MAX_ELEMENTS = 8_000;

/** HTTP statuses treated as `blocked` rather than a generic `http-error`. */
export const BLOCKED_STATUSES: readonly number[] = [401, 403, 429];

/** Content-type essences accepted as an HTML document. */
export const HTML_CONTENT_TYPES: readonly string[] = [
  "text/html",
  "application/xhtml+xml",
];

/**
 * Deterministic verification status. Kept intentionally small; the taxonomy
 * exists to answer "is this a usable Deep Observation candidate?", not to
 * classify every possible HTTP nuance.
 *  - `valid-html`        : final response is same-site, 2xx-ish, HTML → usable.
 *  - `http-error`        : same-site final response with a 4xx/5xx status.
 *  - `navigation-error`  : navigation failed (timeout / DNS / connection / no
 *                          response).
 *  - `non-html`          : same-site 2xx response whose content-type is not HTML
 *                          (pdf / image / json / zip …).
 *  - `external-redirect` : the final URL is NOT same-site (redirected away).
 *  - `blocked`           : same-site final response with 401 / 403 / 429.
 */
export const VerificationStatusSchema = z.enum([
  "valid-html",
  "http-error",
  "navigation-error",
  "non-html",
  "external-redirect",
  "blocked",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** One hop in a server (3xx) redirect chain (observed). */
export const RedirectHopSchema = z.object({
  /** The URL that produced this redirect response. */
  url: z.string(),
  /** The redirect response status (e.g. 301, 302, 308). 0 if unavailable. */
  status: z.number(),
  /** The `Location` header of the redirect, if present. */
  location: z.string().optional(),
});
export type RedirectHop = z.infer<typeof RedirectHopSchema>;

/**
 * Deterministic duplicate-detection fingerprints for a valid HTML page (derived,
 * no AI). Only hashes are stored — never the page body itself.
 *  - `textHash`      : SHA-256 of the whitespace-normalized `body.innerText`.
 *  - `structureHash` : SHA-256 of a lightweight DOM tag-structure signature
 *                      (`depth:tag` tokens in document order; no attributes/styles).
 *  - `combinedHash`  : SHA-256 of `title` + `textHash` + `structureHash`.
 */
export const FingerprintSchema = z.object({
  textHash: z.string(),
  structureHash: z.string(),
  combinedHash: z.string(),
  /** True if the structure walk hit the element cap (signature truncated). */
  structureTruncated: z.boolean().optional(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

/** Full verification record for ONE candidate URL. */
export const CandidateVerificationSchema = z.object({
  /** Candidate URL as it appeared in discovery (`link.url`). */
  candidateUrl: z.string(),
  /** Deterministically normalized candidate URL (`link.normalizedUrl`). */
  normalizedCandidateUrl: z.string(),

  status: VerificationStatusSchema,

  /** Final main-document HTTP status (observed), when a response was received. */
  httpStatus: z.number().optional(),
  /** Content-type essence of the final response (lower-cased, no params). */
  contentType: z.string().optional(),

  /** URL after all redirects (`page.url()`), when available. */
  finalUrl: z.string().optional(),
  /** Whether the final URL is same-site with the discovery root (derived). */
  finalSameSite: z.boolean().optional(),

  /** Whether the candidate ended somewhere other than where it started (derived). */
  redirected: z.boolean(),
  /** Number of server (3xx) redirect hops. */
  redirectCount: z.number(),
  /** Server redirect chain, when there was at least one hop. */
  redirectChain: z.array(RedirectHopSchema).optional(),

  /** Document title (observed; valid HTML only). */
  title: z.string().optional(),
  /** Absolute-resolved `<link rel="canonical">` href (observed → resolved). */
  canonicalUrl: z.string().optional(),
  /** Whether the canonical URL is same-site (derived). Hint only. */
  canonicalSameSite: z.boolean().optional(),
  /** `<meta name="robots">` content, verbatim (observed). */
  metaRobots: z.string().optional(),

  /** Length of the whitespace-normalized body text (observed; valid HTML only). */
  bodyTextLength: z.number().optional(),
  /** `document.getElementsByTagName('*').length` (observed; valid HTML only). */
  domElementCount: z.number().optional(),

  /** Duplicate-detection fingerprints (derived; valid HTML only). */
  fingerprints: FingerprintSchema.optional(),

  /**
   * Coarse structural profile for page-family detection (derived; valid HTML
   * only). Optional: a page whose profile collection fails still verifies, it
   * simply cannot join a structural family later.
   */
  structuralProfile: StructuralProfileSchema.optional(),

  /** Wall-clock time spent verifying this candidate (ms). */
  timingMs: z.number(),

  /** Sanitized failure reason for navigation errors (no secrets). */
  error: z.string().optional(),
});
export type CandidateVerification = z.infer<typeof CandidateVerificationSchema>;

/**
 * A deterministic duplicate group. Types differ in how strong a duplicate signal
 * they are (see the Task 06 report):
 *  - `final-url`           : candidates that resolve to the SAME normalized final
 *                            URL — a very strong duplicate (they ARE the same page).
 *  - `canonical`           : candidates declaring the same canonical URL — a HINT
 *                            only (canonical is advisory, not enforced here).
 *  - `content-fingerprint` : candidates with identical `textHash` AND
 *                            `structureHash` — a strong content-duplicate HINT
 *                            (still conservative: shared template alone is not enough).
 */
export const DuplicateGroupSchema = z.object({
  type: z.enum(["final-url", "canonical", "content-fingerprint"]),
  key: z.string(),
  candidateUrls: z.array(z.string()),
});
export type DuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

/** The browser profile applied to every verification context (reproducibility). */
export const VerifierProfileSchema = z.object({
  locale: z.string(),
  timezone: z.string(),
  colorScheme: z.string(),
  reducedMotion: z.string(),
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  waitUntil: z.string(),
  navTimeoutMs: z.number(),
});
export type VerifierProfile = z.infer<typeof VerifierProfileSchema>;

/** Detailed verification result (persisted as verification.json). */
export const VerificationResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engine: z.string(),
  rootUrl: z.string(),
  /** Which discovery.json this verification was derived from (provenance). */
  sourceDiscoveryFile: z.string(),
  verifiedAt: z.string(),
  profile: VerifierProfileSchema,
  concurrency: z.number(),

  totalCandidates: z.number(),
  validHtmlCount: z.number(),
  httpErrorCount: z.number(),
  navigationErrorCount: z.number(),
  nonHtmlCount: z.number(),
  externalRedirectCount: z.number(),
  blockedCount: z.number(),

  redirectedCount: z.number(),
  uniqueFinalUrlCount: z.number(),
  duplicateGroupCount: z.number(),

  candidates: z.array(CandidateVerificationSchema),
  duplicateGroups: z.array(DuplicateGroupSchema),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

/** One eligible URL for the next stage (compact; persisted in verified-urls.json). */
export const VerifiedUrlSchema = z.object({
  /** Normalized final URL — the unique key. */
  url: z.string(),
  /** Every candidate URL that resolved to this final URL. */
  sourceCandidateUrls: z.array(z.string()),
  httpStatus: z.number(),
  title: z.string().optional(),
  canonicalUrl: z.string().optional(),
  textHash: z.string().optional(),
  structureHash: z.string().optional(),
  /**
   * Carried through so the offline Selector can group by structure without
   * re-opening `verification.json` per member — the same reason `textHash` /
   * `structureHash` are here.
   */
  structuralProfile: StructuralProfileSchema.optional(),
});
export type VerifiedUrl = z.infer<typeof VerifiedUrlSchema>;

/** Compact Deep-Observation candidate set (persisted as verified-urls.json). */
export const VerifiedUrlSetSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  rootUrl: z.string(),
  sourceDiscoveryFile: z.string(),
  verifiedAt: z.string(),
  count: z.number(),
  urls: z.array(VerifiedUrlSchema),
});
export type VerifiedUrlSet = z.infer<typeof VerifiedUrlSetSchema>;

/** Parse a Content-Type header into its lower-cased essence (no params). */
export function contentTypeEssence(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const essence = raw.split(";")[0]?.trim().toLowerCase();
  return essence || undefined;
}

/** Whether a content-type essence denotes an HTML document. */
export function isHtmlContentType(essence: string | undefined): boolean {
  if (!essence) return false;
  return HTML_CONTENT_TYPES.includes(essence);
}
