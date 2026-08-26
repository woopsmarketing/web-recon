// Leaf import, not the discovery barrel: that barrel loads the Firecrawl SDK.
import { normalizeUrl } from "../discovery/normalize-url.js";
import {
  SCHEMA_VERSION,
  type CanonicalTarget,
  type PageFamily,
  type PageFamilyMember,
  type PageFamilySet,
  type PageSelection,
  type SelectedPage,
  type UnselectedUrl,
} from "./types.js";

/**
 * Deterministic representative selection (Task 07).
 *
 * Exactly ONE representative per family, chosen by a fixed priority list — no
 * AI, no scoring model, no randomness:
 *
 *   1. self-canonical or no canonical  (a page that points elsewhere is a weaker
 *                                       stand-in for its family)
 *   2. no query parameters             (`/page` beats `/page?v=2`)
 *   3. shallower path depth
 *   4. shorter URL
 *   5. lexical order                   (total order ⇒ never order-dependent)
 *
 * Rule 1 only *lowers* priority. A URL whose canonical points at another page is
 * still a full family member and is still selected when it is the only member —
 * Task 06 found real sites declaring an unrelated canonical (`/blog` → homepage),
 * so canonical is never treated as truth here.
 */

/** Classify a member's canonical relative to itself (`self` / `other` / `none`). */
export function canonicalTargetOf(
  url: string,
  canonicalUrl: string | undefined,
): CanonicalTarget {
  if (!canonicalUrl) return "none";
  const normalizedCanonical = normalizeUrl(canonicalUrl) ?? canonicalUrl;
  return normalizedCanonical === url ? "self" : "other";
}

/** Rank 0 = self/none canonical (preferred), 1 = canonical points elsewhere. */
function canonicalRank(member: PageFamilyMember): number {
  return member.canonicalTarget === "other" ? 1 : 0;
}

/** Rank 0 = no query parameters (preferred), 1 = has query parameters. */
function queryRank(member: PageFamilyMember): number {
  return member.route.queryKeys.length > 0 ? 1 : 0;
}

/**
 * Total order over family members: the smallest member is the representative.
 * Ends in a lexical comparison of unique URLs, so the result never depends on
 * input array order.
 */
export function compareRepresentatives(
  a: PageFamilyMember,
  b: PageFamilyMember,
): number {
  const byCanonical = canonicalRank(a) - canonicalRank(b);
  if (byCanonical !== 0) return byCanonical;

  const byQuery = queryRank(a) - queryRank(b);
  if (byQuery !== 0) return byQuery;

  const byDepth = a.route.pathDepth - b.route.pathDepth;
  if (byDepth !== 0) return byDepth;

  const byLength = a.url.length - b.url.length;
  if (byLength !== 0) return byLength;

  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/** Pick the representative member of a non-empty member list. */
export function pickRepresentative(
  members: readonly PageFamilyMember[],
): PageFamilyMember {
  if (members.length === 0) {
    throw new Error("pickRepresentative: family has no members");
  }
  let best = members[0];
  for (const member of members.slice(1)) {
    if (compareRepresentatives(member, best) < 0) best = member;
  }
  return best;
}

/**
 * Factual, deterministic trace of the winning member's signals. It reports the
 * values that decided the comparison rather than guessing which rule fired.
 */
function representativeDetail(
  member: PageFamilyMember,
  memberCount: number,
): string {
  const query =
    member.route.queryKeys.length === 0
      ? "none"
      : member.route.queryKeySignature;
  return [
    `members=${memberCount}`,
    `canonical=${member.canonicalTarget}`,
    `query=${query}`,
    `depth=${member.route.pathDepth}`,
    `urlLength=${member.url.length}`,
  ].join("; ");
}

/** Build the SelectedPage entry for one already-representative-marked family. */
function toSelectedPage(family: PageFamily): SelectedPage {
  const representative = family.members.find((m) => m.isRepresentative);
  if (!representative) {
    throw new Error(`Family ${family.id} has no representative member`);
  }

  const memberCount = family.members.length;
  const rootProtected = family.signals.rootProtected === true;

  const reason = rootProtected
    ? "root-protected"
    : memberCount === 1
      ? "sole-member"
      : "representative-rule";

  const reasonDetail = rootProtected
    ? "site root — kept as its own family so it is always observed"
    : memberCount === 1
      ? "only member of its family"
      : representativeDetail(representative, memberCount);

  return {
    url: representative.url,
    familyId: family.id,
    familyType: family.type,
    memberCount,
    reason,
    reasonDetail,
    ...(family.routeScope ? { routeScope: family.routeScope } : {}),
    ...(family.inferredRoutePattern
      ? { inferredRoutePattern: family.inferredRoutePattern }
      : {}),
  };
}

/** Round to 4 decimals so the persisted rate is byte-stable across runs. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Build `selected-pages.json` from a completed family set. One representative
 * per family (so `selectedCount === familyCount`), plus an explicit record of
 * every URL that is represented by another page — nothing is silently dropped.
 */
export function buildPageSelection(
  familySet: PageFamilySet,
  selectedAt: string,
): PageSelection {
  const pages: SelectedPage[] = [];
  const unselected: UnselectedUrl[] = [];

  for (const family of familySet.families) {
    const page = toSelectedPage(family);
    pages.push(page);
    for (const member of family.members) {
      if (member.isRepresentative) continue;
      unselected.push({
        url: member.url,
        familyId: family.id,
        representativeUrl: family.representativeUrl,
        reason: "represented-by-family",
      });
    }
  }

  pages.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  unselected.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

  const verifiedUrlCount = familySet.verifiedUrlCount;
  const selectedCount = pages.length;
  const reductionCount = verifiedUrlCount - selectedCount;

  return {
    schemaVersion: SCHEMA_VERSION,
    rootUrl: familySet.rootUrl,
    sourceVerifiedUrlsFile: familySet.sourceVerifiedUrlsFile,
    sourceVerificationFile: familySet.sourceVerificationFile,
    selectedAt,
    verifiedUrlCount,
    familyCount: familySet.familyCount,
    selectedCount,
    reductionCount,
    reductionRate:
      verifiedUrlCount === 0 ? 0 : round4(reductionCount / verifiedUrlCount),
    familyTypeCounts: familySet.familyTypeCounts,
    largestFamilySize: familySet.largestFamilySize,
    pages,
    unselected,
  };
}
