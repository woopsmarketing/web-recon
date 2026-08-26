import { normalizeUrl } from "../discovery/index.js";
import {
  SCHEMA_VERSION,
  type CandidateVerification,
  type VerifiedUrl,
  type VerifiedUrlSet,
} from "./types.js";

/**
 * Build the compact verified-urls.json Deep-Observation candidate set (Task 06).
 *
 * Eligibility (the ONLY automatic filtering this task performs):
 *   status === "valid-html"  ⇒  final HTTP success + HTML document + same-site
 *                               final URL (all already folded into that status).
 *
 * Dedup: the SAME normalized final URL appears once, with every candidate that
 * resolved to it recorded in `sourceCandidateUrls`.
 *
 * Deliberately NOT removed here: candidates that merely share a `canonical` or a
 * content fingerprint. Those are hints for the later Page Selection step; this
 * task only collapses provably-identical final URLs.
 */
export function buildVerifiedUrls(
  candidates: CandidateVerification[],
  rootUrl: string,
  sourceDiscoveryFile: string,
  verifiedAt: string,
): VerifiedUrlSet {
  const byFinalUrl = new Map<string, VerifiedUrl>();

  for (const c of candidates) {
    if (c.status !== "valid-html" || !c.finalUrl || c.httpStatus === undefined) {
      continue;
    }
    const key = normalizeUrl(c.finalUrl) ?? c.finalUrl;
    const existing = byFinalUrl.get(key);
    if (existing) {
      existing.sourceCandidateUrls.push(c.candidateUrl);
      continue;
    }
    byFinalUrl.set(key, {
      url: key,
      sourceCandidateUrls: [c.candidateUrl],
      httpStatus: c.httpStatus,
      ...(c.title ? { title: c.title } : {}),
      ...(c.canonicalUrl ? { canonicalUrl: c.canonicalUrl } : {}),
      ...(c.fingerprints?.textHash ? { textHash: c.fingerprints.textHash } : {}),
      ...(c.fingerprints?.structureHash
        ? { structureHash: c.fingerprints.structureHash }
        : {}),
      ...(c.structuralProfile ? { structuralProfile: c.structuralProfile } : {}),
    });
  }

  const urls = [...byFinalUrl.values()]
    .map((u) => ({ ...u, sourceCandidateUrls: [...u.sourceCandidateUrls].sort() }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

  return {
    schemaVersion: SCHEMA_VERSION,
    rootUrl,
    sourceDiscoveryFile,
    verifiedAt,
    count: urls.length,
    urls,
  };
}
