import { z } from "zod";

/**
 * PageRegion — Task 27 (Overnight Authoring Foundation).
 *
 * A PageRegion is a VISUAL-SECTION-LEVEL grouping of the reconstruction's
 * runtime tree: the unit a later Visual Editor would select, an AI rewrite
 * would target, and an operator would enable or disable. Tonight it is the
 * COMPILER AND ITS ARTIFACT ONLY — nothing consumes it, nothing branches on it.
 *
 * The name is `PageRegion`, never bare `Region`: `region` is already an ARIA
 * role handled by the selector/verifier stack and `Section` is already the
 * recon-template's header/nav/main/body/footer axis (`src/recon-template/
 * grouping.ts`). A bare name would read as either of those.
 *
 * WHAT THIS ARTIFACT IS NOT ALLOWED TO BE:
 *
 *   - a change to Slot V2. `slots.json`, `slot-bindings.json` and
 *     `site-map.json` are read byte-for-byte and never rewritten; PageRegion is
 *     a NEW VERSIONED SIBLING that joins to them through the one key they
 *     already publish, `(pageId, viewport, nodeId)`.
 *   - a new DOM attribute. `data-wr-node` already carries node identity into
 *     the rendered page and slot-bindings already addresses it. Region
 *     membership is computed from the tree, never stamped into it.
 *   - a semantic classifier. A region's MEANING is unknown here and that is the
 *     expected outcome; "hero" / "features" / "pricing table" is a later,
 *     AI-shaped problem. This compiler only says WHERE the seams are.
 */

// ---------------------------------------------------------------------------
// Output namespace + versions
// ---------------------------------------------------------------------------

export const PAGE_REGION_SCHEMA_NAME = "page-regions-v1";
/** Envelope version (file shape). */
export const PAGE_REGIONS_SCHEMA_VERSION = 1;
/** Record version (one PageRegion's shape). Bumped independently of the file. */
export const REGION_SCHEMA_VERSION = 1;
/** Bumped whenever the SELECTION POLICY changes, because the ids then move. */
export const REGION_COMPILER_VERSION = 1;

export const PAGE_REGIONS_FILE = "page-regions.json";
export const REGION_SUMMARY_FILE = "region-summary.json";
export const REGION_REPORT_DIR = "report";

// ---------------------------------------------------------------------------
// Selection policy (every constant that can move an id lives here)
// ---------------------------------------------------------------------------

/**
 * The whole policy in one object so that `policyTag()` can fold it into every
 * structural hash. Changing a constant necessarily changes the hashes rather
 * than silently changing what a match means — the same discipline
 * `src/verifier/structural-profile.ts` applies to its skeleton hashes.
 */
export interface RegionPolicy {
  /** Single-element-child wrapper hops collapsed before a candidate decides. */
  unwrapMaxHops: number;
  /**
   * How far below a candidate a landmark/sectioning element still forces the
   * candidate to be treated as a shell and descended through. Bounded on
   * purpose: a `<section>` buried 9 levels down inside a card should NOT
   * shatter the list that holds the card into one region per card.
   */
  shellLookaheadDepth: number;
  /** Hard stop on shell descent, so a pathological tree cannot mirror itself. */
  descentDepthCap: number;
  /** Skeleton hash: element levels below the region root that are serialized. */
  skeletonDepthCap: number;
  /** Skeleton hash: element children serialized per node before `+N`. */
  skeletonBreadthCap: number;
  /** Fewest pages a subtree must occur on before it may be lifted to global. */
  globalMinPages: number;
}

export const REGION_POLICY: RegionPolicy = {
  unwrapMaxHops: 8,
  shellLookaheadDepth: 6,
  descentDepthCap: 12,
  skeletonDepthCap: 6,
  skeletonBreadthCap: 40,
  globalMinPages: 2,
};

/**
 * Elements that open a LANDMARK SCOPE — the local root every region id is
 * measured from. Kept to the closed HTML landmark set; no inference.
 */
export const LANDMARK_TAGS: readonly string[] = ["header", "nav", "main", "footer", "aside"];

/** ARIA equivalents of the same set, for sites that build landmarks by role. */
export const LANDMARK_ROLES: Readonly<Record<string, string>> = {
  banner: "header",
  navigation: "nav",
  main: "main",
  contentinfo: "footer",
  complementary: "aside",
};

/**
 * Elements that mark a seam WITHOUT opening a new id scope. They are what makes
 * a container a shell (something inside it is a section, so the container is a
 * list of sections, not a section), and they are region roots themselves.
 */
export const SECTIONING_TAGS: readonly string[] = ["section", "article", "aside"];
export const SECTIONING_ROLES: readonly string[] = ["region"];

/**
 * HTML "sectioning content" plus `main`: inside any of these, a `<header>` /
 * `<footer>` / `<aside>` is a CARD header, not a page landmark. This is the
 * HTML-AAM scoping rule verbatim, not a tuning knob — banner and contentinfo
 * exist only when scoped to the body.
 */
export const SECTIONING_CONTENT_TAGS: readonly string[] = ["article", "aside", "main", "nav", "section"];

/** The landmark tags that rule applies to. `nav` and `main` are unconditional. */
export const BODY_SCOPED_LANDMARK_TAGS: readonly string[] = ["header", "footer", "aside"];

/**
 * Tags that make a subtree non-empty even with no text: a decorative wrapper
 * holding only an `<img>` is still a thing an operator can point at.
 */
export const MEDIA_TAGS: readonly string[] = [
  "img", "svg", "picture", "video", "audio", "canvas", "iframe",
  "input", "textarea", "select", "button",
];

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export const ViewportSchema = z.enum(["desktop", "mobile"]);
export type RegionViewport = z.infer<typeof ViewportSchema>;

const count = z.number().int().nonnegative();

/**
 * One (page, viewport) occurrence of a region. Desktop and mobile are
 * INDEPENDENT trees in the reconstruction IR (`src/reconstruction/types.ts`
 * item 27), so a region carries one occurrence per viewport it was found in and
 * never pretends the two are the same nodes.
 */
export const RegionOccurrenceSchema = z.object({
  viewport: ViewportSchema,
  /** The `data-wr-node` value of the region root. The join key, not the id. */
  nodeId: z.string(),
  /** Elements in the region subtree, root included. */
  elementCount: count,
  /** Drift detector for THIS occurrence. Never an identity. */
  structuralHash: z.string(),
  bindingCount: count,
  /** Document-order rank of this region among the page-viewport's regions. */
  docOrder: count,
});
export type RegionOccurrence = z.infer<typeof RegionOccurrenceSchema>;

/** A region's presence on one pageSourceId, with EVERY route that reaches it. */
export const RegionPageSchema = z.object({
  pageSourceId: z.string(),
  /** Many routes → one pageSourceId. Never collapsed to the first one. */
  routes: z.array(z.string()),
  occurrences: z.array(RegionOccurrenceSchema),
});
export type RegionPage = z.infer<typeof RegionPageSchema>;

export const RegionLandmarkSchema = z.object({
  /** `header` | `nav` | `main` | `footer` | `aside` | `document`. */
  kind: z.string(),
  /** `main1`, `nav2`, `doc` — kind + document-order ordinal. The id scope. */
  key: z.string(),
  /** How the landmark was recognised. */
  source: z.enum(["tag", "role", "document"]),
});
export type RegionLandmark = z.infer<typeof RegionLandmarkSchema>;

export const PageRegionSchema = z.object({
  /** `<scopeKey>:rgn:<landmarkKey>:<childPath>` — see `regionIdOf()`. */
  regionId: z.string(),
  scope: z.enum(["global", "page"]),
  /** `global`, or the owning pageSourceId. */
  scopeKey: z.string(),
  landmark: RegionLandmarkSchema,
  /** `div:1>section:3`, or `self` when the region root IS the landmark root. */
  childPath: z.string(),
  rootTag: z.string(),
  /**
   * Representative (first page, desktop-preferred) skeleton hash. Persisted
   * BESIDE the id and never as the id: the id must survive a markup edit inside
   * the region, and this hash exists precisely to announce that edit.
   */
  structuralHash: z.string(),
  elementCount: count,
  bindingCount: count,
  /** Bindings that address a captured dynamic template hosted in this region. */
  dynamicTemplateBindingCount: count,
  /** Slot KEYS (not ids): stable across recompiles, readable in a diff. */
  slotKeys: z.array(z.string()),
  pages: z.array(RegionPageSchema),
});
export type PageRegion = z.infer<typeof PageRegionSchema>;

// ---------------------------------------------------------------------------
// The artifact
// ---------------------------------------------------------------------------

export const RegionRouteSchema = z.object({
  route: z.string(),
  pageSourceId: z.string(),
  /** `/fr/pricing` — excluded from automatic global promotion (Task 18 rule). */
  localePrefixed: z.boolean(),
  renderCoverage: z.string().optional(),
});

export const RegionPageCoverageSchema = z.object({
  pageSourceId: z.string(),
  routes: z.array(z.string()),
  viewports: z.array(ViewportSchema),
  regions: count,
  bindings: count,
  joinedBindings: count,
  orphanBindings: count,
  unresolvedBindings: count,
});

export const RegionCountsSchema = z.object({
  pages: count,
  routes: count,
  regions: count,
  globalRegions: count,
  pageRegions: count,
  slots: count,
  slotsJoined: count,
  orphanSlots: count,
  bindings: count,
  joinedBindings: count,
  orphanBindings: count,
  /** Bindings whose `(pageId, viewport, nodeId)` is not in the loaded trees. */
  unresolvedBindings: count,
  /** Candidates dropped for holding no binding, no text and no media. */
  emptyCandidatesDropped: count,
  /** Times shell descent stopped because `descentDepthCap` was reached. */
  depthCapHits: count,
  /** Wrapper hops collapsed by the unwrap rule. */
  unwrapHops: count,
  /** Desktop/mobile occurrences merged into one region record. */
  viewportMerges: count,
  /** Same landmark+path with a different root tag per viewport (kept apart). */
  viewportRootMismatches: count,
  /**
   * Regions the LANDMARK-QUALIFIED promotion rule would have lifted and the
   * strict every-non-locale-page rule did not. Measured, never applied.
   */
  globalCandidatesLandmarkQualifiedOnly: count,
  /**
   * Subtree fingerprints shared by at least `globalMinPages` non-locale pages
   * but NOT by all of them — the shared shell that ALMOST lifts. Measured so
   * the cost of the strict rule is visible instead of assumed.
   */
  nearGlobalGroups: count,
  /** Widest page coverage any of those near-global groups reached. */
  nearGlobalMaxPages: count,
});
export type RegionCounts = z.infer<typeof RegionCountsSchema>;

export const PageRegionsArtifactSchema = z.object({
  schemaVersion: z.number().int().positive(),
  schemaName: z.literal(PAGE_REGION_SCHEMA_NAME),
  regionSchemaVersion: z.number().int().positive(),
  compilerVersion: z.number().int().positive(),
  engine: z.string(),
  templateId: z.string(),
  /** What was read, and the byte hashes that pin it. */
  template: z.object({
    templateId: z.string(),
    runDir: z.string(),
    host: z.string(),
    rootUrl: z.string(),
    slotSchemaVersion: z.number().int().positive().optional(),
    slotsHash: z.string(),
    slotBindingsHash: z.string(),
    siteMapHash: z.string(),
    routeMapHash: z.string(),
  }),
  policy: z.object({
    unwrapMaxHops: count,
    shellLookaheadDepth: count,
    descentDepthCap: count,
    skeletonDepthCap: count,
    skeletonBreadthCap: count,
    globalMinPages: count,
  }),
  routes: z.array(RegionRouteSchema),
  pages: z.array(RegionPageCoverageSchema),
  counts: RegionCountsSchema,
  regions: z.array(PageRegionSchema),
  limitations: z.array(z.string()),
  provenance: z.literal("derived"),
});
export type PageRegionsArtifact = z.infer<typeof PageRegionsArtifactSchema>;

/**
 * NOTE ON THE ABSENT `createdAt`.
 *
 * Every other artifact in this repo stamps a `createdAt` recovered from its run
 * id. `page-regions.json` deliberately does NOT: it is a pure function of its
 * inputs and the determinism guarantee this Task ships is BYTE identity across
 * two compiles. The one clock reading lives in the run directory name and in
 * `report/region-summary.json`.
 */

export class RegionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegionInputError";
  }
}

export class RegionCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegionCompileError";
  }
}
