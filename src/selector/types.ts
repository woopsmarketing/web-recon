import { z } from "zod";
import { StructuralProfileSchema } from "../verifier/structural-profile.js";

/**
 * Selector layer types & schemas (Task 07 — Page Family & Representative Selection).
 *
 * Task 06 answered "is this URL real and usable?". This layer answers a different
 * question, entirely offline:
 *
 *   > Which of the verified URLs actually need their own Deep Observation, and
 *   > which ones are represented by another page?
 *
 * It is **Offline Deterministic Processing**: no Firecrawl call, no Playwright,
 * no network request, no AI/LLM. The only inputs are files Task 06 already wrote
 * (`verified-urls.json` + `verification.json`), so this stage costs 0 crawl and
 * 0 browser time.
 *
 * It is explicitly NOT semantic classification. No page is labelled `homepage` /
 * `blog-detail` / `product-detail`. A **Page Family** here means only:
 *
 *   > pages that deterministic route + structure signals say are likely to share
 *   > a structural pattern.
 *
 * Provenance:
 *  - `observed`  : Task 06 values reused verbatim (url, title, canonicalUrl,
 *                  textHash, structureHash, sourceCandidateUrls).
 *  - `derived`   : everything computed here (route features, families,
 *                  representatives) — pure functions of the input, no AI.
 *
 * Task 08 changed WHICH structure signal the two structural rules consume, and
 * nothing else about the layering. The distinction it enforces:
 *
 *   exact textHash + structureHash  →  `content-duplicate` (same page, several URLs)
 *   coarse StructuralProfile        →  `sibling-pattern` / `scope-structure`
 *
 * A coarse signal is NEVER allowed to declare a duplicate: `content-duplicate`
 * still requires both exact hashes to be byte-identical.
 */

/**
 * Bumped when the persisted family/selection shape changes.
 * v2 (Task 08): members carry `structuralProfile`, structural families carry the
 * coarse hashes plus a `familyMatch` breakdown.
 */
export const SCHEMA_VERSION = 2 as const;

/**
 * Minimum sibling count for a `sibling-pattern` family. Two pages under the same
 * parent can easily be a coincidence (e.g. `/legal/terms` + `/legal/privacy`);
 * three or more repeated same-structure siblings is the point where "this is a
 * repeated route" becomes the simpler explanation. Conservative by design — see
 * the false-merge policy below.
 */
export const MIN_SIBLING_FAMILY_SIZE = 3;

/**
 * Minimum member count for a `scope-structure` family. Two is enough here
 * because the key is already narrow (same locale prefix AND same route scope AND
 * byte-identical structure hash).
 */
export const MIN_SCOPE_STRUCTURE_FAMILY_SIZE = 2;

/**
 * Element-count sanity guard for a structural family: the largest member may be
 * at most this many times the size of the smallest (Task 08 § element count).
 *
 * Exact element-count equality is explicitly NOT required — that is the mistake
 * the exact `structureHash` made, and it is why three MDN reference pages with
 * 930 / 932 / 935 elements were three singletons in Task 07. What the guard
 * stops is the opposite failure: two pages that share the site shell and the
 * same 6-level skeleton while being wildly different in size.
 *
 * The value is 2.0, chosen by measuring the element-count spread inside every
 * coarse group produced across all 112 verified URLs of the four test sites:
 *
 *   domainchecker `/blog/*`   410–592   (1.44×)   same template ✓
 *   seoworld      `/blog/*`   353–467   (1.32×)   same template ✓
 *   nextjs `/docs/messages/*` 2821–3828 (1.36×)   same template ✓
 *   MDN reference cluster     779–1231  (1.58×)   same template ✓
 *   MDN cluster + one outlier 779–4795  (6.16×)   split ✗
 *   nextjs docs + one outlier 1982–4597 (2.32×)   split ✗
 *
 * Every group that human review calls one template fits under 2.0, and the two
 * groups with a single outsized page fall outside it. Loosening to 2.5 absorbed
 * only 3 more URLs across all four sites while pulling those outliers back in —
 * a bad trade under "false merge is worse than missed merge".
 *
 * ONE global constant. There is no per-site tuning anywhere in this file.
 */
export const MAX_ELEMENT_COUNT_RATIO = 2.0;

/**
 * Deterministic locale-prefix pattern: `xx` or `xx-YY` only.
 *
 * Deliberately NOT a locale database. A first path segment matching this shape
 * is *recorded* as `localePrefix` metadata; it is never deleted from the URL and
 * never changes what the URL means. Its only effect is that the NEXT segment
 * also becomes a `routeScope` candidate (`/en-US/docs/...` → scope `docs`).
 */
export const LOCALE_PREFIX_PATTERN = /^[a-z]{2}(-[A-Za-z]{2})?$/;

/** UUID v-any, canonical 8-4-4-4-12 hyphenated form. */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** `YYYY-MM-DD` or `YYYY-MM`. Checked before `numeric` (no overlap: has dashes). */
const DATE_LIKE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/;
/** All digits. */
const NUMERIC_PATTERN = /^\d+$/;
/** Long hex-ish id (≥8 hex chars, at least one digit — so `overview` is text). */
const HEX_ID_PATTERN = /^(?=.*\d)[0-9a-fA-F]{8,}$/;

/**
 * What the last path segment looks like — deterministic shape only, never a
 * semantic guess. A plain slug stays `text`: we do NOT assume every readable
 * segment is a framework dynamic route.
 */
export const TerminalKindSchema = z.enum([
  "root",
  "numeric",
  "uuid",
  "date-like",
  "hex-id",
  "text",
]);
export type TerminalKind = z.infer<typeof TerminalKindSchema>;

/** Classify a terminal path segment by shape (pure, order-independent). */
export function classifyTerminalSegment(segment: string): TerminalKind {
  if (segment === "") return "root";
  if (UUID_PATTERN.test(segment)) return "uuid";
  if (DATE_LIKE_PATTERN.test(segment)) return "date-like";
  if (NUMERIC_PATTERN.test(segment)) return "numeric";
  if (HEX_ID_PATTERN.test(segment)) return "hex-id";
  return "text";
}

/** Deterministic route features derived from one verified URL (no network). */
export const RouteFeaturesSchema = z.object({
  url: z.string(),
  pathname: z.string(),
  /** Non-empty path segments, decoded where possible. */
  pathSegments: z.array(z.string()),
  pathDepth: z.number().int().nonnegative(),

  /** First segment when it matches `xx` / `xx-YY` (metadata only, never removed). */
  localePrefix: z.string().optional(),
  /** First non-locale segment; undefined for the site root. */
  routeScope: z.string().optional(),
  /** Path of the parent directory (`/blog/post-a` → `/blog`; root → `/`). */
  parentPath: z.string(),

  /** Sorted unique query parameter names (values are never used as a signal). */
  queryKeys: z.array(z.string()),
  /** `queryKeys.join("&")` — stable key for "same query shape". */
  queryKeySignature: z.string(),

  /** Last non-empty segment; `""` for the root. */
  terminalSegment: z.string(),
  terminalKind: TerminalKindSchema,
});
export type RouteFeatures = z.infer<typeof RouteFeaturesSchema>;

/**
 * How a member's `<link rel="canonical">` relates to the member URL itself.
 * `self` and `none` are treated identically by the representative rule; `other`
 * only *lowers* priority — it never removes a URL and never merges families.
 */
export const CanonicalTargetSchema = z.enum(["self", "other", "none"]);
export type CanonicalTarget = z.infer<typeof CanonicalTargetSchema>;

/**
 * One verified URL inside a family. Every field Task 06 knew about the URL is
 * carried through, so no provenance is lost when a URL is not selected.
 */
export const PageFamilyMemberSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  canonicalUrl: z.string().optional(),
  canonicalTarget: CanonicalTargetSchema,
  textHash: z.string().optional(),
  structureHash: z.string().optional(),
  /**
   * Coarse structural profile (Task 08). Kept on every member so a family can be
   * reviewed for a false merge straight from `page-families.json` — URL, title,
   * route scope, skeleton/landmark hashes and element count side by side.
   */
  structuralProfile: StructuralProfileSchema.optional(),
  /** Discovery candidates that resolved to this final URL (Task 06). */
  sourceCandidateUrls: z.array(z.string()),
  route: RouteFeaturesSchema,
  isRepresentative: z.boolean(),
});
export type PageFamilyMember = z.infer<typeof PageFamilyMemberSchema>;

/**
 * Why a set of URLs was grouped. These are grouping *reasons*, not semantic
 * labels:
 *  - `content-duplicate` : Task 06 said textHash AND structureHash are identical
 *                          — effectively the same content behind several URLs.
 *  - `sibling-pattern`   : ≥3 same-depth siblings under one parent with an
 *                          identical structure hash → an observation-derived
 *                          repeated route (NOT a proven framework route).
 *  - `scope-structure`   : same locale prefix + route scope + structure hash,
 *                          but not siblings.
 *  - `singleton`         : nothing conservative applied — its own family.
 */
export const PageFamilyTypeSchema = z.enum([
  "content-duplicate",
  "sibling-pattern",
  "scope-structure",
  "singleton",
]);
export type PageFamilyType = z.infer<typeof PageFamilyTypeSchema>;

/**
 * Which coarse structural signals agreed across a family's members (Task 08 §
 * explainability). The first three are the merge CONDITIONS; the rest are
 * recorded evidence so a family can be argued about — or blamed — after the fact.
 */
export const FamilyMatchSchema = z.object({
  /** Condition: all members share one `shallowSkeletonHash`. */
  shallowSkeleton: z.boolean(),
  /** Condition: all members share one `landmarkHash`. */
  landmark: z.boolean(),
  /** Condition: all members contain the same element *kinds* (histogram presence). */
  histogramPresence: z.boolean(),
  /**
   * Evidence only: all members also share the full bucketed `tagHistogramHash`.
   * Measured and rejected as a merge condition — requiring it collapsed
   * domainchecker's 17 blog posts from 2 structural groups into 13 while
   * catching nothing the other guards missed.
   */
  histogram: z.boolean(),
  /**
   * Evidence only: the exact Task 06 `structureHash` matched too, i.e. Task 07
   * would already have formed this family without any coarse signal.
   */
  exactStructure: z.boolean(),
  elementCountMin: z.number().int().nonnegative(),
  elementCountMax: z.number().int().nonnegative(),
  /** `max/min` element count, rounded to 3 decimals. Guarded by {@link MAX_ELEMENT_COUNT_RATIO}. */
  elementCountRatio: z.number(),
});
export type FamilyMatch = z.infer<typeof FamilyMatchSchema>;

/** Deterministic evidence for a family (why these members are together). */
export const PageFamilySignalsSchema = z.object({
  memberCount: z.number().int().positive(),
  /** All members share one structureHash. */
  sharedStructure: z.boolean(),
  /** All members share one textHash (content-duplicate only). */
  sharedText: z.boolean(),
  /** Common parent path, when the family was formed from siblings. */
  sharedParent: z.string().optional(),
  /** Distinct canonical URLs declared by members — a HINT, never a merge cause. */
  canonicalHints: z.array(z.string()).optional(),
  /**
   * How many members declare a canonical pointing at some *other* page. Task 06
   * found real pages doing this wrongly (a blog index claiming the homepage as
   * its canonical), so it is surfaced for review — never acted on. Distinct
   * self-canonicals are normal and are not counted here.
   */
  canonicalPointsElsewhereCount: z.number().int().nonnegative().optional(),
  /** True for the site-root family, which is force-isolated so it is never dropped. */
  rootProtected: z.boolean().optional(),
  /** Coarse-signal breakdown; present for any multi-member family with profiles. */
  familyMatch: FamilyMatchSchema.optional(),
});
export type PageFamilySignals = z.infer<typeof PageFamilySignalsSchema>;

/** One Page Family (persisted inside page-families.json). */
export const PageFamilySchema = z.object({
  /** Deterministic `f000001…`, assigned after a stable sort (never encounter order). */
  id: z.string(),
  type: PageFamilyTypeSchema,

  localePrefix: z.string().optional(),
  routeScope: z.string().optional(),
  /**
   * Pattern *inferred from observation* for sibling families (`/blog/<*>`).
   * Deliberately not called a "route": we never claim the site's framework
   * actually declares this dynamic segment.
   */
  inferredRoutePattern: z.string().optional(),
  /** Exact Task 06 hash, present only when every member happens to share it. */
  structureHash: z.string().optional(),
  textHash: z.string().optional(),

  /** Coarse Task 08 hashes shared by every member of a structural family. */
  shallowSkeletonHash: z.string().optional(),
  landmarkHash: z.string().optional(),

  /**
   * Readable trace of the coarse signals that formed this family, e.g.
   * `shallowSkeleton+landmark+histogramPresence; elements 410–592 (ratio 1.44);
   * exactStructure=no`. The structured form lives in `signals.familyMatch`.
   */
  structuralMatchReason: z.string().optional(),

  members: z.array(PageFamilyMemberSchema).min(1),
  representativeUrl: z.string(),

  signals: PageFamilySignalsSchema,
});
export type PageFamily = z.infer<typeof PageFamilySchema>;

/** Per-type family counts (all four keys always present). */
export const FamilyTypeCountsSchema = z.object({
  "content-duplicate": z.number().int().nonnegative(),
  "sibling-pattern": z.number().int().nonnegative(),
  "scope-structure": z.number().int().nonnegative(),
  singleton: z.number().int().nonnegative(),
});
export type FamilyTypeCounts = z.infer<typeof FamilyTypeCountsSchema>;

/** Full family set (persisted as page-families.json). */
export const PageFamilySetSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  rootUrl: z.string(),
  /** Provenance: the two Task 06 files this was derived from. */
  sourceVerifiedUrlsFile: z.string(),
  sourceVerificationFile: z.string(),
  builtAt: z.string(),

  verifiedUrlCount: z.number().int().nonnegative(),
  familyCount: z.number().int().nonnegative(),
  familyTypeCounts: FamilyTypeCountsSchema,
  largestFamilySize: z.number().int().nonnegative(),

  families: z.array(PageFamilySchema),
});
export type PageFamilySet = z.infer<typeof PageFamilySetSchema>;

/**
 * Why one URL became its family's representative.
 *  - `sole-member`         : the family has exactly one URL.
 *  - `root-protected`      : the site root, isolated on purpose (§ root protection).
 *  - `representative-rule` : won the deterministic priority comparison.
 */
export const SelectionReasonSchema = z.enum([
  "sole-member",
  "root-protected",
  "representative-rule",
]);
export type SelectionReason = z.infer<typeof SelectionReasonSchema>;

/** One page chosen for the next stage (persisted inside selected-pages.json). */
export const SelectedPageSchema = z.object({
  url: z.string(),
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  memberCount: z.number().int().positive(),
  reason: SelectionReasonSchema,
  /** Human-readable trace of the winning signals (deterministic string). */
  reasonDetail: z.string(),
  routeScope: z.string().optional(),
  inferredRoutePattern: z.string().optional(),
});
export type SelectedPage = z.infer<typeof SelectedPageSchema>;

/** A verified URL that is represented by another page (never silently dropped). */
export const UnselectedUrlSchema = z.object({
  url: z.string(),
  familyId: z.string(),
  representativeUrl: z.string(),
  reason: z.literal("represented-by-family"),
});
export type UnselectedUrl = z.infer<typeof UnselectedUrlSchema>;

/** Selection summary (persisted as selected-pages.json). */
export const PageSelectionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  rootUrl: z.string(),

  sourceVerifiedUrlsFile: z.string(),
  sourceVerificationFile: z.string(),

  selectedAt: z.string(),

  verifiedUrlCount: z.number().int().nonnegative(),
  familyCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),

  /** `verifiedUrlCount - selectedCount` — how many pages the next stage skips. */
  reductionCount: z.number().int().nonnegative(),
  /** `reductionCount / verifiedUrlCount`, rounded to 4 decimals (0 when no input). */
  reductionRate: z.number(),

  familyTypeCounts: FamilyTypeCountsSchema,
  largestFamilySize: z.number().int().nonnegative(),

  pages: z.array(SelectedPageSchema),
  unselected: z.array(UnselectedUrlSchema),
});
export type PageSelection = z.infer<typeof PageSelectionSchema>;
