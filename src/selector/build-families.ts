// Imported from the leaf modules rather than the package barrels on purpose:
// the verifier barrel pulls in Playwright and the discovery barrel pulls in the
// Firecrawl SDK. Selection must not even *load* them — see the offline note in
// cli-select.ts.
import type {
  DuplicateGroup,
  VerificationResult,
  VerifiedUrl,
  VerifiedUrlSet,
} from "../verifier/types.js";
import { normalizeUrl } from "../discovery/normalize-url.js";
import { histogramPresenceKey } from "../verifier/structural-profile.js";
import {
  extractRouteFeatures,
  inferredSiblingPattern,
  isSiteRoot,
} from "./route-features.js";
import { canonicalTargetOf, pickRepresentative } from "./select-representatives.js";
import {
  MAX_ELEMENT_COUNT_RATIO,
  MIN_SCOPE_STRUCTURE_FAMILY_SIZE,
  MIN_SIBLING_FAMILY_SIZE,
  SCHEMA_VERSION,
  type FamilyMatch,
  type FamilyTypeCounts,
  type PageFamily,
  type PageFamilyMember,
  type PageFamilySet,
  type PageFamilyType,
} from "./types.js";

/**
 * Deterministic Page Family grouping (Task 07).
 *
 * Grouping is **hierarchical, not union-find**. Feeding every signal into one
 * connected-components pass is how a site collapses into a single giant family:
 * A links to B by content hash, B links to C by route scope, and suddenly the
 * pricing page represents the blog. Instead each URL is claimed by the first
 * (strongest) rule that applies and is then out of the running:
 *
 *   1. content-duplicate  — Task 06 says textHash AND structureHash are identical
 *   2. sibling-pattern    — ≥3 same-depth siblings, one parent, one structureHash
 *   3. scope-structure    — same locale prefix + route scope + structureHash
 *   4. singleton          — everything else
 *
 * The governing bias is stated once and applied everywhere: **a false merge is
 * worse than a missed merge.** Merging two genuinely different pages means the
 * next stage observes one of them and permanently loses the other; leaving them
 * apart only costs an extra observation.
 *
 * Task 08 changed exactly one thing here: rules 2 and 3 now compare the COARSE
 * structural profile instead of the exact `structureHash`. Rule 1 is untouched —
 * a duplicate still requires byte-identical `textHash` AND `structureHash`, and
 * no coarse signal may ever declare one.
 *
 * The coarse rule is not a similarity score and has no tunable knob per site. It
 * is a conjunction of exact matches on deliberately blunt signals, plus guards:
 *
 *   condition  same shallowSkeletonHash   (depth-6, repeat-collapsed tag skeleton)
 *   condition  same landmarkHash          (landmark nesting signature)
 *   condition  same histogram presence    (page contains the same element kinds)
 *   guard      same route context         (parent+depth, or locale+scope)
 *   guard      no member is a path ancestor of another  (list vs detail)
 *   guard      element counts within MAX_ELEMENT_COUNT_RATIO
 *
 * Three signals are deliberately NOT merge causes:
 *  - **canonical** — Task 06 found real pages declaring an unrelated canonical
 *    (`domainchecker.co.kr/blog` and `seoworld.co.kr/tools/domain-checker` both
 *    point at their homepage). Canonical is recorded as a hint and used only to
 *    lower representative priority.
 *  - **structure alone** — two pages sharing a template are normal and are still
 *    separate pages. Structure only groups *within* one route context, never
 *    across the whole site.
 *  - **route shape alone** — a shared parent, a shared scope, or a slug that
 *    looks dynamic never groups anything by itself. Every structural family
 *    needs a structural match as well.
 */

/**
 * Bucket-key separator. NUL, because path segments are percent-decoded before
 * they become route features and may therefore contain spaces or slashes.
 */
const KEY_SEP = "\u0000";

export interface BuildFamiliesInput {
  verifiedUrls: VerifiedUrlSet;
  verification: VerificationResult;
  sourceVerifiedUrlsFile: string;
  sourceVerificationFile: string;
  /** ISO timestamp recorded in the output (injectable so tests stay byte-stable). */
  builtAt: string;
}

/** A group of verified URLs claimed by one rule, before ids/representatives. */
interface DraftFamily {
  type: PageFamilyType;
  members: PageFamilyMember[];
  localePrefix?: string;
  routeScope?: string;
  inferredRoutePattern?: string;
  sharedParent?: string;
  rootProtected?: boolean;
}

/** Build the immutable member record for one verified URL. */
function toMember(verified: VerifiedUrl): PageFamilyMember {
  return {
    url: verified.url,
    ...(verified.title ? { title: verified.title } : {}),
    ...(verified.canonicalUrl ? { canonicalUrl: verified.canonicalUrl } : {}),
    canonicalTarget: canonicalTargetOf(verified.url, verified.canonicalUrl),
    ...(verified.textHash ? { textHash: verified.textHash } : {}),
    ...(verified.structureHash ? { structureHash: verified.structureHash } : {}),
    ...(verified.structuralProfile
      ? { structuralProfile: verified.structuralProfile }
      : {}),
    sourceCandidateUrls: [...verified.sourceCandidateUrls].sort(),
    route: extractRouteFeatures(verified.url),
    isRepresentative: false,
  };
}

/**
 * The coarse structural family key — the conjunction of the three merge
 * conditions. `undefined` when the member has no profile (an older verification
 * run, or a page that blocked collection), which keeps it out of every
 * structural rule instead of guessing.
 */
function coarseStructureKey(member: PageFamilyMember): string | undefined {
  const profile = member.structuralProfile;
  if (!profile) return undefined;
  return [
    profile.shallowSkeletonHash,
    profile.landmarkHash,
    histogramPresenceKey(profile),
  ].join(KEY_SEP);
}

/** Element count from the coarse profile (0 when absent — never reached in a family). */
function elementCountOf(member: PageFamilyMember): number {
  return member.structuralProfile?.elementCount ?? 0;
}

/**
 * Split a coarse-matched bucket so that no resulting group spans more than
 * {@link MAX_ELEMENT_COUNT_RATIO} between its smallest and largest member.
 *
 * Members are sorted by element count (ties broken by URL) and cut whenever the
 * next page would exceed the ratio against the group's *smallest* member — not
 * against its predecessor, so a long chain of small steps cannot quietly stretch
 * a group to any width. Deterministic and independent of input order.
 */
function partitionByElementCount(
  members: readonly PageFamilyMember[],
): PageFamilyMember[][] {
  const sorted = [...members].sort(
    (a, b) =>
      elementCountOf(a) - elementCountOf(b) ||
      (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  );
  const groups: PageFamilyMember[][] = [];
  let current: PageFamilyMember[] = [];
  for (const member of sorted) {
    if (
      current.length === 0 ||
      elementCountOf(member) <= elementCountOf(current[0]) * MAX_ELEMENT_COUNT_RATIO
    ) {
      current.push(member);
    } else {
      groups.push(current);
      current = [member];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Drop any member whose path is a proper ancestor of another member's path.
 *
 * This is the list-vs-detail guard: `/blog` and `/blog/post-a` (or `/docs` and
 * `/docs/getting-started`) can share a skeleton on a site whose index page is
 * mostly chrome, and merging them would silently drop the index from
 * observation. The ancestor is the one removed — it becomes a singleton and is
 * still observed — while the sibling detail pages stay together.
 *
 * Only `scope-structure` needs this: a `sibling-pattern` bucket already requires
 * one shared parent and one shared depth, so no member can contain another.
 */
function dropPathAncestors(
  members: readonly PageFamilyMember[],
): PageFamilyMember[] {
  const paths = members.map((m) => m.route.pathSegments);
  const isAncestor = (a: string[], b: string[]): boolean =>
    a.length < b.length && a.every((segment, i) => segment === b[i]);
  return members.filter(
    (_, i) => !paths.some((other, j) => i !== j && isAncestor(paths[i], other)),
  );
}

/** The value shared by every member, or undefined when they disagree/lack it. */
function sharedValue<T>(
  members: readonly PageFamilyMember[],
  pick: (m: PageFamilyMember) => T | undefined,
): T | undefined {
  const first = pick(members[0]);
  if (first === undefined) return undefined;
  return members.every((m) => pick(m) === first) ? first : undefined;
}

/** Sort members by URL so a family's contents never depend on input order. */
function sortMembers(members: PageFamilyMember[]): PageFamilyMember[] {
  return [...members].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/**
 * Map every Task 06 candidate URL to the verified (final) URL it resolved to,
 * so `duplicateGroups` — which are expressed in candidate URLs — can be consumed
 * against `verified-urls.json`.
 */
function buildCandidateToVerified(
  verifiedUrls: VerifiedUrlSet,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of verifiedUrls.urls) {
    for (const candidate of entry.sourceCandidateUrls) {
      map.set(candidate, entry.url);
    }
  }
  return map;
}

/**
 * Step 1 — collapse Task 06 `content-fingerprint` groups into one logical node.
 *
 * Identical textHash AND structureHash is the one signal strong enough to say
 * "these URLs are the same content", so a single Deep Observation covers them.
 * The other URLs are kept as full members (aliases), never deleted.
 *
 * Groups are processed in Task 06's deterministic key order and a URL is claimed
 * at most once, so overlapping groups cannot depend on iteration order.
 */
function claimContentDuplicates(
  groups: readonly DuplicateGroup[],
  candidateToVerified: Map<string, string>,
  available: Map<string, PageFamilyMember>,
): DraftFamily[] {
  const contentGroups = groups
    .filter((g) => g.type === "content-fingerprint")
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const families: DraftFamily[] = [];
  for (const group of contentGroups) {
    const urls = new Set<string>();
    for (const candidate of group.candidateUrls) {
      const verifiedUrl = candidateToVerified.get(candidate);
      if (verifiedUrl && available.has(verifiedUrl)) urls.add(verifiedUrl);
    }
    if (urls.size < 2) continue;

    const members = sortMembers(
      [...urls].map((url) => available.get(url) as PageFamilyMember),
    );
    for (const member of members) available.delete(member.url);

    families.push({
      type: "content-duplicate",
      members,
      ...optionalScope(members),
    });
  }
  return families;
}

/** locale/route-scope metadata, recorded only when every member agrees. */
function optionalScope(members: readonly PageFamilyMember[]): {
  localePrefix?: string;
  routeScope?: string;
} {
  const localePrefix = sharedValue(members, (m) => m.route.localePrefix);
  const routeScope = sharedValue(members, (m) => m.route.routeScope);
  return {
    ...(localePrefix ? { localePrefix } : {}),
    ...(routeScope ? { routeScope } : {}),
  };
}

/** Bucket the remaining members by a derived key (undefined key ⇒ not eligible). */
function bucketBy(
  available: Map<string, PageFamilyMember>,
  keyOf: (m: PageFamilyMember) => string | undefined,
): Map<string, PageFamilyMember[]> {
  const buckets = new Map<string, PageFamilyMember[]>();
  for (const member of available.values()) {
    const key = keyOf(member);
    if (key === undefined) continue;
    const list = buckets.get(key);
    if (list) list.push(member);
    else buckets.set(key, [member]);
  }
  return buckets;
}

/**
 * Step 2 — sibling-pattern families.
 *
 * Same parent path, same depth, same COARSE structural key, element counts
 * within the ratio guard, and at least {@link MIN_SIBLING_FAMILY_SIZE} members.
 * Three repeated same-structure siblings is the point where "this parent renders
 * a repeated route" is the simpler explanation than coincidence.
 *
 * Task 08 replaced the exact `structureHash` here. That hash is strictly
 * stronger than the coarse key (an identical tag/depth sequence produces an
 * identical skeleton, landmark tree and histogram), so nothing Task 07 grouped
 * can stop grouping — the rule only became able to see templates whose content
 * length varies.
 *
 * The resulting `/blog/<*>` string is an **inferred** pattern from observation.
 * We do not claim the site's framework declares a dynamic segment there.
 */
function claimSiblingPatterns(
  available: Map<string, PageFamilyMember>,
): DraftFamily[] {
  const buckets = bucketBy(available, (m) => {
    const coarse = coarseStructureKey(m);
    return coarse && m.route.pathDepth >= 1
      ? [m.route.parentPath, String(m.route.pathDepth), coarse].join(KEY_SEP)
      : undefined;
  });

  const families: DraftFamily[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < MIN_SIBLING_FAMILY_SIZE) continue;
    // Members that fall out of a too-small partition stay `available` for the
    // next rule rather than being consumed by a family that never formed.
    for (const part of partitionByElementCount(bucket)) {
      if (part.length < MIN_SIBLING_FAMILY_SIZE) continue;
      const members = sortMembers(part);
      for (const member of members) available.delete(member.url);

      const parentPath = members[0].route.parentPath;
      families.push({
        type: "sibling-pattern",
        members,
        sharedParent: parentPath,
        inferredRoutePattern: inferredSiblingPattern(parentPath),
        ...optionalScope(members),
      });
    }
  }
  return families;
}

/**
 * Step 3 — route-scope + structure families.
 *
 * Not siblings, but the same locale prefix, the same first route scope, and the
 * same coarse structural key. Requiring the scope is what stops a cross-section
 * merge: two pages may share a template while living in unrelated sections
 * (`/pricing` vs `/about`), and those must stay separate.
 *
 * Two further guards apply here and not to siblings: path ancestors are dropped
 * (a section index must not be absorbed by its own detail pages) and the element
 * count ratio is enforced, since a route scope can span pages of very different
 * sizes.
 *
 * The locale prefix is part of the key on purpose. `/en-US/docs/x` and
 * `/ko/docs/y` probably do share a template, but merging them would drop a whole
 * locale from observation — the conservative side of that trade is to keep them
 * apart and say so.
 */
function claimScopeStructure(
  available: Map<string, PageFamilyMember>,
): DraftFamily[] {
  const buckets = bucketBy(available, (m) => {
    const coarse = coarseStructureKey(m);
    return coarse && m.route.routeScope
      ? [m.route.localePrefix ?? "", m.route.routeScope, coarse].join(KEY_SEP)
      : undefined;
  });

  const families: DraftFamily[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < MIN_SCOPE_STRUCTURE_FAMILY_SIZE) continue;
    const withoutAncestors = dropPathAncestors(bucket);
    for (const part of partitionByElementCount(withoutAncestors)) {
      if (part.length < MIN_SCOPE_STRUCTURE_FAMILY_SIZE) continue;
      const members = sortMembers(part);
      for (const member of members) available.delete(member.url);

      families.push({
        type: "scope-structure",
        members,
        ...optionalScope(members),
      });
    }
  }
  return families;
}

/** Distinct canonical URLs declared by members (normalized, sorted). Hint only. */
function canonicalHints(members: readonly PageFamilyMember[]): string[] {
  const hints = new Set<string>();
  for (const member of members) {
    if (!member.canonicalUrl) continue;
    hints.add(normalizeUrl(member.canonicalUrl) ?? member.canonicalUrl);
  }
  return [...hints].sort();
}

/** Round to 3 decimals so a persisted ratio is byte-stable across runs. */
function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Which coarse signals actually agree across a family's members. Computed for
 * every multi-member family whose members all carry a profile — including
 * `content-duplicate`, where it costs nothing and answers "would the coarse rule
 * have found this too?".
 */
function familyMatchOf(
  members: readonly PageFamilyMember[],
): FamilyMatch | undefined {
  if (members.length < 2) return undefined;
  const profiles = members.map((m) => m.structuralProfile);
  if (profiles.some((p) => p === undefined)) return undefined;
  const present = profiles as NonNullable<(typeof profiles)[number]>[];

  const allSame = <T>(pick: (p: (typeof present)[number]) => T): boolean =>
    present.every((p) => pick(p) === pick(present[0]));

  const counts = present.map((p) => p.elementCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);

  return {
    shallowSkeleton: allSame((p) => p.shallowSkeletonHash),
    landmark: allSame((p) => p.landmarkHash),
    histogramPresence: allSame((p) => histogramPresenceKey(p)),
    histogram: allSame((p) => p.tagHistogramHash),
    exactStructure: sharedValue(members, (m) => m.structureHash) !== undefined,
    elementCountMin: min,
    elementCountMax: max,
    elementCountRatio: min === 0 ? 0 : round3(max / min),
  };
}

/** Readable one-line trace of the coarse signals behind a structural family. */
function structuralMatchReason(match: FamilyMatch): string {
  const agreed = [
    match.shallowSkeleton ? "shallowSkeleton" : undefined,
    match.landmark ? "landmark" : undefined,
    match.histogramPresence ? "histogramPresence" : undefined,
  ].filter((s): s is string => s !== undefined);
  return [
    agreed.join("+") || "none",
    `elements ${match.elementCountMin}–${match.elementCountMax} (ratio ${match.elementCountRatio})`,
    `histogram=${match.histogram ? "yes" : "no"}`,
    `exactStructure=${match.exactStructure ? "yes" : "no"}`,
  ].join("; ");
}

/** Finalize a draft: assign the id, choose the representative, build signals. */
function finalizeFamily(draft: DraftFamily, id: string): PageFamily {
  const representative = pickRepresentative(draft.members);
  const members = draft.members.map((m) => ({
    ...m,
    isRepresentative: m.url === representative.url,
  }));

  const structureHash = sharedValue(members, (m) => m.structureHash);
  const textHash = sharedValue(members, (m) => m.textHash);
  const shallowSkeletonHash = sharedValue(
    members,
    (m) => m.structuralProfile?.shallowSkeletonHash,
  );
  const landmarkHash = sharedValue(
    members,
    (m) => m.structuralProfile?.landmarkHash,
  );
  const hints = canonicalHints(members);
  const pointsElsewhere = members.filter(
    (m) => m.canonicalTarget === "other",
  ).length;
  const familyMatch = familyMatchOf(members);
  const isStructuralFamily =
    draft.type === "sibling-pattern" || draft.type === "scope-structure";

  return {
    id,
    type: draft.type,
    ...(draft.localePrefix ? { localePrefix: draft.localePrefix } : {}),
    ...(draft.routeScope ? { routeScope: draft.routeScope } : {}),
    ...(draft.inferredRoutePattern
      ? { inferredRoutePattern: draft.inferredRoutePattern }
      : {}),
    ...(structureHash ? { structureHash } : {}),
    ...(draft.type === "content-duplicate" && textHash ? { textHash } : {}),
    ...(shallowSkeletonHash ? { shallowSkeletonHash } : {}),
    ...(landmarkHash ? { landmarkHash } : {}),
    ...(isStructuralFamily && familyMatch
      ? { structuralMatchReason: structuralMatchReason(familyMatch) }
      : {}),
    members,
    representativeUrl: representative.url,
    signals: {
      memberCount: members.length,
      sharedStructure: structureHash !== undefined,
      sharedText: textHash !== undefined,
      ...(draft.sharedParent ? { sharedParent: draft.sharedParent } : {}),
      ...(hints.length > 0 ? { canonicalHints: hints } : {}),
      ...(pointsElsewhere > 0
        ? { canonicalPointsElsewhereCount: pointsElsewhere }
        : {}),
      ...(draft.rootProtected ? { rootProtected: true } : {}),
      ...(familyMatch ? { familyMatch } : {}),
    },
  };
}

/** The smallest member URL — a family's stable identity, independent of order. */
function familySortKey(draft: DraftFamily): string {
  let min = draft.members[0].url;
  for (const member of draft.members) if (member.url < min) min = member.url;
  return min;
}

/** Zero-padded deterministic id (`f000001`). */
function familyId(index: number): string {
  return `f${String(index + 1).padStart(6, "0")}`;
}

/**
 * Group every verified URL into exactly one Page Family.
 *
 * Deterministic end to end: buckets are keyed on data (never encounter order),
 * members are sorted by URL, families are sorted by their smallest member URL,
 * and ids are assigned only after that sort. Reversing or shuffling the input
 * arrays yields byte-identical output.
 */
export function buildPageFamilies(input: BuildFamiliesInput): PageFamilySet {
  const { verifiedUrls, verification } = input;
  const rootUrl = verifiedUrls.rootUrl;

  const available = new Map<string, PageFamilyMember>();
  for (const verified of verifiedUrls.urls) {
    available.set(verified.url, toMember(verified));
  }

  const drafts: DraftFamily[] = [];

  // Step 0 — root protection. The site root is pulled out before any grouping
  // so it can never lose a representative contest and vanish from the selection.
  // It costs at most one extra observation and removes a whole failure mode.
  const rootMember = [...available.values()].find((m) =>
    isSiteRoot(m.url, rootUrl),
  );
  if (rootMember) {
    available.delete(rootMember.url);
    drafts.push({
      type: "singleton",
      members: [rootMember],
      rootProtected: true,
      ...optionalScope([rootMember]),
    });
  }

  // Step 1 → 2 → 3, each claiming from what the previous step left behind.
  drafts.push(
    ...claimContentDuplicates(
      verification.duplicateGroups,
      buildCandidateToVerified(verifiedUrls),
      available,
    ),
  );
  drafts.push(...claimSiblingPatterns(available));
  drafts.push(...claimScopeStructure(available));

  // Step 4 — singletons. Nothing conservative applied; left deliberately alone.
  for (const member of available.values()) {
    drafts.push({
      type: "singleton",
      members: [member],
      ...optionalScope([member]),
    });
  }

  const families = drafts
    .sort((a, b) => {
      const ka = familySortKey(a);
      const kb = familySortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((draft, index) => finalizeFamily(draft, familyId(index)));

  const familyTypeCounts: FamilyTypeCounts = {
    "content-duplicate": 0,
    "sibling-pattern": 0,
    "scope-structure": 0,
    singleton: 0,
  };
  let largestFamilySize = 0;
  for (const family of families) {
    familyTypeCounts[family.type]++;
    largestFamilySize = Math.max(largestFamilySize, family.members.length);
  }

  const familySet: PageFamilySet = {
    schemaVersion: SCHEMA_VERSION,
    rootUrl,
    sourceVerifiedUrlsFile: input.sourceVerifiedUrlsFile,
    sourceVerificationFile: input.sourceVerificationFile,
    builtAt: input.builtAt,
    verifiedUrlCount: verifiedUrls.urls.length,
    familyCount: families.length,
    familyTypeCounts,
    largestFamilySize,
    families,
  };

  assertFamilyInvariants(familySet, verifiedUrls);
  return familySet;
}

/**
 * Hard invariants, checked before anything reaches disk. A violation is a bug in
 * the grouping rules, not a data condition, so it throws rather than warns.
 *
 *  - Coverage       : every verified URL appears in exactly one family, and no
 *                     family contains a URL that was not verified.
 *  - Membership     : no URL in two families (the reason grouping is layered).
 *  - Representative : exactly one per family, and it is one of the members.
 *  - Ids            : unique, and ordered by the family's smallest member URL.
 *  - Duplicate      : a `content-duplicate` family really does share both exact
 *                     hashes — no coarse signal can ever produce one.
 *  - Structural     : a `sibling-pattern` / `scope-structure` family really does
 *                     satisfy all three coarse conditions and the ratio guard,
 *                     and a `scope-structure` family contains no path ancestor.
 */
export function assertFamilyInvariants(
  familySet: PageFamilySet,
  verifiedUrls: VerifiedUrlSet,
): void {
  const seen = new Map<string, string>();
  const ids = new Set<string>();
  let previousSortKey: string | undefined;

  for (const family of familySet.families) {
    if (ids.has(family.id)) {
      throw new Error(`Invariant violated: duplicate family id ${family.id}`);
    }
    ids.add(family.id);

    if (family.members.length === 0) {
      throw new Error(`Invariant violated: family ${family.id} has no members`);
    }

    const representatives = family.members.filter((m) => m.isRepresentative);
    if (representatives.length !== 1) {
      throw new Error(
        `Invariant violated: family ${family.id} has ${representatives.length} representatives (expected 1)`,
      );
    }
    if (representatives[0].url !== family.representativeUrl) {
      throw new Error(
        `Invariant violated: family ${family.id} representativeUrl does not match its flagged member`,
      );
    }
    if (family.signals.memberCount !== family.members.length) {
      throw new Error(
        `Invariant violated: family ${family.id} memberCount ${family.signals.memberCount} != ${family.members.length} members`,
      );
    }

    assertFamilyRuleInvariants(family);

    let sortKey = family.members[0].url;
    for (const member of family.members) {
      if (member.url < sortKey) sortKey = member.url;
      const owner = seen.get(member.url);
      if (owner) {
        throw new Error(
          `Invariant violated: ${member.url} belongs to both ${owner} and ${family.id}`,
        );
      }
      seen.set(member.url, family.id);
    }

    if (previousSortKey !== undefined && sortKey < previousSortKey) {
      throw new Error(
        `Invariant violated: families are not sorted by smallest member URL (${sortKey} after ${previousSortKey})`,
      );
    }
    previousSortKey = sortKey;
  }

  const verified = new Set(verifiedUrls.urls.map((u) => u.url));
  if (seen.size !== verified.size) {
    throw new Error(
      `Invariant violated: coverage mismatch — ${seen.size} family members vs ${verified.size} verified URLs`,
    );
  }
  for (const url of verified) {
    if (!seen.has(url)) {
      throw new Error(`Invariant violated: verified URL not in any family: ${url}`);
    }
  }
  for (const url of seen.keys()) {
    if (!verified.has(url)) {
      throw new Error(`Invariant violated: family member is not a verified URL: ${url}`);
    }
  }
  if (familySet.familyCount !== familySet.families.length) {
    throw new Error(
      `Invariant violated: familyCount ${familySet.familyCount} != ${familySet.families.length} families`,
    );
  }
  if (familySet.verifiedUrlCount !== verified.size) {
    throw new Error(
      `Invariant violated: verifiedUrlCount ${familySet.verifiedUrlCount} != ${verified.size}`,
    );
  }
}

/**
 * Per-family rule checks. Kept as executable invariants rather than prose so the
 * two claims that matter most cannot silently rot: a duplicate is still an exact
 * match, and a structural family is still a conjunction of coarse conditions
 * plus guards — not a similarity score that drifted.
 */
function assertFamilyRuleInvariants(family: PageFamily): void {
  const fail = (message: string): never => {
    throw new Error(`Invariant violated: family ${family.id} ${message}`);
  };

  if (family.type === "content-duplicate") {
    // §"Duplicate logic unchanged": both EXACT hashes, never a coarse signal.
    const text = family.members[0].textHash;
    const structure = family.members[0].structureHash;
    if (!text || !structure) {
      fail("is a content-duplicate without exact text/structure hashes");
    }
    for (const member of family.members) {
      if (member.textHash !== text || member.structureHash !== structure) {
        fail(
          `is a content-duplicate whose members disagree on the exact hashes (${member.url})`,
        );
      }
    }
    return;
  }

  if (family.type !== "sibling-pattern" && family.type !== "scope-structure") {
    return;
  }

  const match = family.signals.familyMatch;
  if (!match) fail(`is a ${family.type} family without a familyMatch record`);
  else {
    if (!match.shallowSkeleton || !match.landmark || !match.histogramPresence) {
      fail(
        `is a ${family.type} family whose coarse conditions do not all hold (${structuralMatchReason(match)})`,
      );
    }
    if (match.elementCountRatio > MAX_ELEMENT_COUNT_RATIO) {
      fail(
        `exceeds the element-count guard: ratio ${match.elementCountRatio} > ${MAX_ELEMENT_COUNT_RATIO}`,
      );
    }
  }

  if (family.type === "scope-structure") {
    if (dropPathAncestors(family.members).length !== family.members.length) {
      fail("is a scope-structure family containing a path ancestor of another member");
    }
  }
}

/** Re-check the selection against its family set (also run before writing). */
export function assertSelectionInvariants(
  familySet: PageFamilySet,
  selection: { selectedCount: number; pages: { url: string; familyId: string }[]; unselected: { url: string }[] },
): void {
  if (selection.selectedCount !== familySet.familyCount) {
    throw new Error(
      `Invariant violated: selectedCount ${selection.selectedCount} != familyCount ${familySet.familyCount}`,
    );
  }
  const representatives = new Set(
    familySet.families.map((f) => `${f.id}${KEY_SEP}${f.representativeUrl}`),
  );
  for (const page of selection.pages) {
    if (!representatives.has(`${page.familyId}${KEY_SEP}${page.url}`)) {
      throw new Error(
        `Invariant violated: selected page ${page.url} is not the representative of ${page.familyId}`,
      );
    }
  }
  const total = selection.pages.length + selection.unselected.length;
  if (total !== familySet.verifiedUrlCount) {
    throw new Error(
      `Invariant violated: selected (${selection.pages.length}) + unselected (${selection.unselected.length}) != ${familySet.verifiedUrlCount} verified URLs`,
    );
  }
}
