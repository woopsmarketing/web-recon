import { normalizeUrl } from "../discovery/index.js";
import type { CandidateVerification, DuplicateGroup } from "./types.js";

/**
 * Build deterministic duplicate groups from verification results (Task 06).
 *
 * Three group types, from strongest to weakest signal:
 *  - `final-url`           : same normalized final URL — the candidates ARE the
 *                            same page (very strong).
 *  - `canonical`           : same canonical URL — HINT only (canonical is advisory).
 *  - `content-fingerprint` : identical textHash AND structureHash — strong content
 *                            HINT, still conservative (never structureHash alone).
 *
 * All groups are HINTS for the later Page Selection step, not deletion orders:
 * every original candidate verification is preserved regardless of grouping.
 * Output is fully deterministic (stable sort on type, key, and member URLs).
 */

/** Group candidate URLs by a derived key; keep only keys with >1 candidate. */
function groupBy(
  candidates: CandidateVerification[],
  type: DuplicateGroup["type"],
  keyOf: (c: CandidateVerification) => string | undefined,
): DuplicateGroup[] {
  const buckets = new Map<string, string[]>();
  for (const c of candidates) {
    const key = keyOf(c);
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(c.candidateUrl);
    else buckets.set(key, [c.candidateUrl]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, candidateUrls] of buckets) {
    if (candidateUrls.length < 2) continue;
    groups.push({
      type,
      key,
      candidateUrls: [...candidateUrls].sort(),
    });
  }
  return groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function buildDuplicateGroups(
  candidates: CandidateVerification[],
): DuplicateGroup[] {
  // final-url: any candidate that produced a final URL (regardless of status).
  const finalUrlGroups = groupBy(candidates, "final-url", (c) =>
    c.finalUrl ? normalizeUrl(c.finalUrl) ?? c.finalUrl : undefined,
  );

  // canonical: any candidate that declared a canonical URL.
  const canonicalGroups = groupBy(candidates, "canonical", (c) => c.canonicalUrl);

  // content-fingerprint: valid HTML candidates with identical text+structure.
  const contentGroups = groupBy(candidates, "content-fingerprint", (c) =>
    c.status === "valid-html" && c.fingerprints
      ? `${c.fingerprints.textHash}:${c.fingerprints.structureHash}`
      : undefined,
  );

  return [...finalUrlGroups, ...canonicalGroups, ...contentGroups];
}
