import { z } from "zod";
import {
  READABLE_SCHEMA_VERSIONS as SITESPEC_READABLE_SCHEMA_VERSIONS,
  SITESPEC_VERSION,
  type LimitationCode,
} from "../sitespec/index.js";

/**
 * Next.js Reconstruction Engine — types (Task 14).
 *
 * This layer turns ONE input — a SiteSpec directory — into a runnable Next.js /
 * React / TypeScript application. The direction of travel matters:
 *
 *   SiteSpec  = browser-observable IR, framework-neutral, HTML vocabulary
 *   this Task = the FIRST place a framework opinion is allowed to exist
 *
 * so everything React-shaped (props, `defaultValue`, `htmlFor`, client
 * components, catch-all routes) lives here and nowhere upstream. A future Vue or
 * Svelte engine would sit next to this directory, not inside it.
 *
 * Three contracts hold the whole Task together:
 *
 *  1. **Input boundary** (items 2, 3). The generator reads `site-spec.json` and
 *     the files it names, through `loadSiteSpec()`, and nothing else. The
 *     SiteSpec's `source.*` fields are audit strings; following one would make
 *     Task 09–12 run directories a runtime dependency of reconstruction, which
 *     is exactly the coupling Task 13 was built to remove.
 *  2. **Output boundary** (items 6, 10). Everything is written under
 *     `data/<host>/reconstructions/<run-id>/`. No byte is written into the
 *     SiteSpec or into any earlier run.
 *  3. **Client bundle isolation** (item 8). The 157 MB of SiteSpec in the corpus
 *     never reaches a browser. The page tree renders in Server Components, and
 *     what crosses to the client is a small generic runtime plus `data-wr-*`
 *     annotations on the handful of nodes that carry verified behavior.
 *
 * Determinism is a hard requirement (item 12): same SiteSpec + same config →
 * byte-identical generated source. No timestamp, no random id, no absolute local
 * path is ever written into a generated file.
 */

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** Bumped when the shape of anything this Task persists changes. */
export const RECONSTRUCTION_SCHEMA_VERSION = 1 as const;

/** Bumped when the generator's output changes without a schema change. */
export const GENERATOR_VERSION = 1 as const;

/** Recorded in the manifest so a reader can tell what produced the app. */
export const GENERATOR_ENGINE = "deterministic-sitespec-to-nextjs";

/**
 * SiteSpec shapes this generator understands.
 *
 * Two separate checks on purpose (item 14). `siteSpecVersion` is the IR CONTRACT
 * — what the fields MEAN — and `schemaVersion` is the persisted SHAPE. A
 * SiteSpec may legitimately keep contract v1 while moving to shape v3, and a
 * generator that only looked at the contract would then read fields that had
 * moved. Both are asserted, and an unsupported value is a fail-fast.
 */
/**
 * Both v2 (Task 13.1) and v3 (Task 16) are read.
 *
 * Task 16 added `scrollState` and `dynamicTemplate` as OPTIONAL fields, so a v2
 * SiteSpec is a valid v3 document that observed no scroll container and captured
 * no dynamic subtree — and the four v2 SiteSpecs on disk are historical
 * artifacts Task 16 item 26 forbids rewriting. Rejecting them would mean this
 * generator could no longer reproduce the Task 14 baseline it is measured
 * against, which is a worse outcome than reading a shape whose additions it
 * knows about.
 *
 * This is a deliberate widening, not a relaxation of the rule the error message
 * below states: an UNKNOWN shape is still rejected.
 */
export const SUPPORTED_SITESPEC_SCHEMA_VERSIONS: readonly number[] = [
  ...SITESPEC_READABLE_SCHEMA_VERSIONS,
];
export const SUPPORTED_SITESPEC_VERSIONS: readonly number[] = [SITESPEC_VERSION];

/** Fixed file / directory names inside a reconstruction run directory. */
export const MANIFEST_FILE = "reconstruction-manifest.json";
export const APP_DIR = "app";
export const RUNTIME_DATA_DIR = "reconstruction-data";
export const RUNTIME_PAGES_DIR = "pages";
export const ROUTE_MAP_FILE = "route-map.json";
/** Served as a plain static file: never processed by the bundler (item 113). */
export const GENERATED_STYLES_FILE = "wr/generated-styles.css";

/** Every generated DOM id, class and attribute starts here (item 105). */
export const WR_PREFIX = "wr";

// ---------------------------------------------------------------------------
// Compact runtime page data (items 7, 10, 11)
// ---------------------------------------------------------------------------

/**
 * A React prop value as the generator produces it.
 *
 * `boolean` exists because HTML boolean attributes must become React booleans
 * (item 42); `number` because `colSpan`/`rowSpan`/`start` are numeric props in
 * React and passing the string would be a type error in the generated `.tsx`.
 */
export type RuntimePropValue = string | number | boolean | string[];

/**
 * One element of the runtime tree.
 *
 * Short keys are not obfuscation: this file is re-read per cold render and is
 * the single biggest artifact the generator writes, and the SiteSpec's own
 * readable long-form field names would cost ~35 bytes per node across ~150k
 * nodes. Everything a renderer does NOT need — provenance, bounding boxes,
 * visibility flags, source element ids, limitations, recovery diagnostics — is
 * absent by construction rather than filtered later (item 7).
 */
export interface RuntimeElementNode {
  /** Discriminator. `e` = element. */
  k: "e";
  /** Viewport-local SiteSpec node id. Powers `data-wr-node`, pseudo CSS, QA. */
  n: string;
  /** Tag to render. Original source tag wherever HTML allows it (item 117). */
  t: string;
  /** React-ready props, already through the attribute adapter (item 39). */
  p?: Record<string, RuntimePropValue>;
  /** Document order, elements and text interleaved (item 60). */
  c?: RuntimeNode[];
  /**
   * Sanitized inline-SVG markup, already carrying its class / id / `data-wr-node`
   * (items 74–77). The ONLY value in this IR that reaches
   * `dangerouslySetInnerHTML`.
   */
  v?: string;
}

/** A text node. Raw value, never trimmed or whitespace-collapsed (item 59). */
export interface RuntimeTextNode {
  k: "t";
  v: string;
}

export type RuntimeNode = RuntimeElementNode | RuntimeTextNode;

/**
 * One viewport of one page: an independent tree (item 27).
 *
 * `doc` is the adapted document root. A SiteSpec tree is rooted at `<html>` and
 * contains a `<body>`, neither of which may be re-nested inside a Next.js
 * document, so both are rendered as `div`s carrying their observed computed
 * style minus the document-box geometry — see `documentRootAdapted` in the
 * manifest and the `document-root-adapted-for-nextjs` limitation (item 56).
 */
export interface RuntimeViewport {
  id: "desktop" | "mobile";
  /** The width this tree was observed at. Drives breakpoint inference. */
  width: number;
  doc: RuntimeElementNode;
}

export interface RuntimePage {
  pageId: string;
  desktop: RuntimeViewport;
  mobile: RuntimeViewport;
}

// ---------------------------------------------------------------------------
// Route map (items 18–22)
// ---------------------------------------------------------------------------

/**
 * One clone route.
 *
 * `renderCoverage` and `behaviorCoverage` are carried through UNCHANGED from the
 * RouteSpec and are deliberately two different axes (items 23, 24). Rendering a
 * family member from the representative's tree is implementation reuse; it is
 * not evidence that anything was observed on that URL, and this record refuses
 * to let the two blur.
 */
export interface RuntimeRoute {
  routeId: string;
  /** Deterministic lookup key: normalized pathname + normalized query. */
  key: string;
  /** The original verified URL, for provenance and reporting. */
  url: string;
  /** Clone-local path a link rewriter may point at. */
  path: string;
  /** Runtime page file, relative to `reconstruction-data/` (item 112). */
  pageFile: string;
  pageSourceId: string;
  title?: string;
  renderCoverage: "exact-observed" | "validation-sample-observed" | "family-represented";
  behaviorCoverage:
    | "exact-verified"
    | "exact-not-explored"
    | "family-represented-unverified"
    | "none";
  /** True only when this exact URL was deep-observed (never inferred). */
  observedOnThisExactUrl: boolean;
  /**
   * Whether the behavior implementation rendered on this route was verified ON
   * this route. `false` on every family-represented route, even though the
   * representative's bindings are reused (item 25).
   */
  verifiedOnThisRoute: boolean;
}

export interface RuntimeRouteMap {
  schemaVersion: number;
  rootUrl: string;
  /** `mobile` below this, `desktop` at or above it (item 28). */
  breakpoint: number;
  routes: RuntimeRoute[];
}

// ---------------------------------------------------------------------------
// Manifest (item 13)
// ---------------------------------------------------------------------------

/**
 * Honesty codes this Task can add.
 *
 * SiteSpec limitation codes are carried forward untouched (item 192); these are
 * the ones that only exist because a reconstruction happened. A closed
 * vocabulary for the same reason Task 13 used one: free text cannot be counted,
 * asserted or diffed.
 */
export const ReconstructionLimitationCodeSchema = z.enum([
  "document-root-adapted-for-nextjs",
  "breakpoint-inferred",
  "family-represented-route",
  "behavior-implementation-reused-from-representative",
  "route-behavior-not-explored",
  "dynamic-target-content-not-observed",
  "dynamic-target-content-observed-once",
  "dynamic-target-content-truncated",
  "dynamic-target-placement-not-observed",
  "tabs-panel-target-not-distinguishable",
  "interaction-open-state-style-not-observed",
  "observed-target-not-resolved",
  "observed-target-content-observed-once",
  "observed-target-content-not-observed",
  "observed-target-contains-trigger",
  "interaction-initial-state-conflict",
  "layout-rule-inferred",
  "unknown-interaction-not-implemented",
  "element-asset-unresolved",
  "srcset-candidate-descriptor-missing",
  "internal-link-not-in-route-table",
  "font-source-binding-unverified",
  "shadow-content-not-observed",
  "frame-content-not-observed",
  "source-head-not-reconstructed",
  "parser-invalid-nesting-adapted",
]);
export type ReconstructionLimitationCode = z.infer<
  typeof ReconstructionLimitationCodeSchema
>;

export const RECONSTRUCTION_LIMITATION_ORDER: readonly ReconstructionLimitationCode[] =
  ReconstructionLimitationCodeSchema.options;

export const RECONSTRUCTION_LIMITATION_MESSAGES: Readonly<
  Record<ReconstructionLimitationCode, string>
> = {
  "document-root-adapted-for-nextjs":
    "The source <html> / <body> nodes are rendered as div wrappers inside the Next.js document; their computed style is applied except for the document-box geometry (width/height/min/max), which is a measurement of the observed viewport rather than an authored style.",
  "breakpoint-inferred":
    "The responsive breakpoint was inferred by this generator from the two observed viewport widths. It was never measured on the original site.",
  "family-represented-route":
    "This route renders the family representative's page tree. Nothing was observed on this exact URL.",
  "behavior-implementation-reused-from-representative":
    "Verified interaction bindings from the representative page are reused on family-represented routes. Implementation reuse is not evidence promotion: verifiedOnThisRoute is false.",
  "route-behavior-not-explored":
    "This route has its own observed page but no interaction exploration ran on it, so only native browser behavior is present.",
  "dynamic-target-content-not-observed":
    "A verified interaction mounts a region whose contents were never observed. The clone mounts an empty region with the observed tag and role and invents no children.",
  "dynamic-target-content-observed-once":
    "A verified interaction mounts a region whose contents WERE observed — once, after one click, under fixed caps. The clone reproduces that one instance; it is not a claim about what the region contains on any other click or for any other data.",
  "dynamic-target-content-truncated":
    "A mounted region's observed contents hit an element, depth or text cap, so the clone mounts a partial region. The caps are global constants, not a per-site tuning.",
  "dynamic-target-placement-not-observed":
    "Where in the document a dynamically mounted region appeared was not recorded, so the clone inserts it immediately after its trigger. The position is a renderer choice, not an observation.",
  "tabs-panel-target-not-distinguishable":
    "The verified tabs pattern's aria-controls target resolved to the trigger itself (source id churn), so no panel show/hide is implemented — only the aria-selected transition.",
  "interaction-open-state-style-not-observed":
    "A verified interaction makes a region visible, but only its CLOSED-state computed style was ever observed — the pipeline never captured what the region's style becomes while open. The clone reveals it with a neutral `display: revert`, which reproduces that the region appears but not the layout it appears with.",
  "observed-target-not-resolved":
    "A user-visible target region was discovered live but matched no node of the compiled static tree, and no bounded capture of it exists, so the clone cannot show it. The trigger's state transition is still implemented.",
  "observed-target-content-observed-once":
    "A user-visible target region's contents were observed — once, after one click, under fixed caps. The clone reproduces that one instance; it is not a claim about what the region contains on any other click or for any other data.",
  "observed-target-content-not-observed":
    "A user-visible target region needs mounted contents the explorer did not capture, so the clone reveals or mounts it without observed children.",
  "observed-target-contains-trigger":
    "A discovered target region contains its own trigger element. Replacing its children at runtime would destroy the live trigger mid-interaction, so the observed content swap inside that region is not replayed; the trigger's state transition and every other observed target still are.",
  "interaction-initial-state-conflict":
    "A node's recovered declarative state disagrees with the `before` value of a verified transition observed on it. Neither side was silently preferred: the initial state is rendered as the SiteSpec's attributes describe it and the disagreement is counted here.",
  "layout-rule-inferred":
    "Some elements carry a RECOVERED layout rule (centered max-width, full width, percentage width, or responsive visibility) derived deterministically from the multi-width layout probe and authored-rule evidence. Each rule reproduces the observed truth-viewport geometry by construction; at unobserved widths it is this generator's inference, not an observation, and the exact computed style remains the fallback for every element without one.",
  "unknown-interaction-not-implemented":
    "Unknown interaction cases are annotated for diagnostics only. No behavior is generated for them.",
  "element-asset-unresolved":
    "An element expects an asset the SiteSpec has no usable reference for. No src was invented; layout attributes and style are preserved.",
  "srcset-candidate-descriptor-missing":
    "At least one srcset candidate arrived without a descriptor alongside candidates that had one — the Observer's 500-character attribute cap truncates long srcsets — so the descriptorless candidates were left out of the generated srcSet rather than guessed at.",
  "internal-link-not-in-route-table":
    "A same-origin link points at a URL that is not a verified route. The local pathname is kept, so the clone answers with its own not-found rather than silently rerouting to some other page.",
  "font-source-binding-unverified":
    "Font files are referenced by the site's own stylesheets, which are not compiled. The clone uses computed font-family values and whatever the browser can resolve; no font/family binding was inferred from file names.",
  "shadow-content-not-observed":
    "Open shadow roots were inventoried upstream but their contents were never observed, so they are absent from the clone.",
  "frame-content-not-observed":
    "iframe documents were never entered upstream, so frame contents are absent from the clone.",
  "source-head-not-reconstructed":
    "The source <head> was outside the Observer's scope. Only the document title is reconstructed; original stylesheets, scripts and meta tags are not.",
  "parser-invalid-nesting-adapted":
    "The observed live DOM contained a parent/child relationship the HTML parser cannot produce (for example a script-built <li> inside another <li>). Serialized markup is transported through the parser, so the clone expresses that relationship the way HTML requires — an interposed container carrying display:contents, which generates no box. Every observed node keeps its tag, attributes, text, order and ancestry; the clone's DOM has one non-observed wrapper element per adapted edge.",
};

/** Deterministic sort + dedup for a reconstruction limitation list. */
export function sortReconstructionLimitations(
  codes: Iterable<ReconstructionLimitationCode>,
): ReconstructionLimitationCode[] {
  const set = new Set(codes);
  return RECONSTRUCTION_LIMITATION_ORDER.filter((code) => set.has(code));
}

/**
 * How the breakpoint was arrived at (item 29).
 *
 * `provenance` is never `observed`: the pipeline measured two endpoints and
 * nothing between them, and a number this Task computed must not be able to pass
 * for one the browser reported.
 */
export const BreakpointSpecSchema = z.object({
  value: z.number().int().positive(),
  provenance: z.enum(["inferred", "operator-override"]),
  method: z.enum(["observed-endpoint-midpoint", "cli-override"]),
  mobileObservedWidth: z.number(),
  desktopObservedWidth: z.number(),
  /** The convention the generated CSS implements, stated in words. */
  convention: z.string(),
});
export type BreakpointSpec = z.infer<typeof BreakpointSpecSchema>;

export const ManifestConfigSchema = z.object({
  inferredBreakpoint: BreakpointSpecSchema,
  /** Only `catch-all` exists in v1; named so a second mode can be added. */
  routeMode: z.literal("catch-all"),
  /** `reference` = asset URLs are used as observed; nothing was downloaded. */
  assetMode: z.literal("reference"),
  nextVersion: z.string(),
  reactVersion: z.string(),
});
export type ManifestConfig = z.infer<typeof ManifestConfigSchema>;

export const ManifestStatsSchema = z.object({
  routes: z.number().int().nonnegative(),
  pageSources: z.number().int().nonnegative(),
  runtimeElementNodes: z.number().int().nonnegative(),
  runtimeTextNodes: z.number().int().nonnegative(),
  /** Element nodes that carry a generated style class. */
  styledNodes: z.number().int().nonnegative(),
  /** Style token references that had no catalog entry. Must be 0 (item 169). */
  missingStyleRefs: z.number().int().nonnegative(),
  styleRules: z.number().int().nonnegative(),
  pseudoRules: z.number().int().nonnegative(),
  generatedDomIds: z.number().int().nonnegative(),
  rewrittenIdrefTokens: z.number().int().nonnegative(),
  unresolvedIdrefTokens: z.number().int().nonnegative(),
  patternBindings: z.number().int().nonnegative(),
  nativeBindings: z.number().int().nonnegative(),
  scriptedBindings: z.number().int().nonnegative(),
  unknownBindings: z.number().int().nonnegative(),
  dynamicTargets: z.number().int().nonnegative(),
  /** Dynamic targets that mount OBSERVED contents rather than an empty region. */
  dynamicTargetsWithContent: z.number().int().nonnegative().optional(),
  /** Template nodes emitted for those regions (Task 16). */
  dynamicTemplateNodes: z.number().int().nonnegative().optional(),
  /** Nodes carrying an observed `scrollState` (Task 16, A2). */
  scrollStateNodes: z.number().int().nonnegative().optional(),
  /** …of those, how many the client runtime is instructed to restore. */
  scrollRestoreNodes: z.number().int().nonnegative().optional(),
  /**
   * Observed parent→child edges the HTML parser would have rewritten, expressed
   * instead through the container HTML requires (Task 16 final correction).
   */
  nestingAdaptations: z.number().int().nonnegative().optional(),
  elementAssetsRequested: z.number().int().nonnegative(),
  resolvedImageSrc: z.number().int().nonnegative(),
  resolvedSrcset: z.number().int().nonnegative(),
  inlineSvgRendered: z.number().int().nonnegative(),
  unresolvedElementAssets: z.number().int().nonnegative(),
  droppedSrcsetCandidates: z.number().int().nonnegative(),
  remoteAssetUrls: z.number().int().nonnegative(),
  assetDownloads: z.literal(0),
  internalLinksRewritten: z.number().int().nonnegative(),
  unresolvedInternalLinks: z.number().int().nonnegative(),
  externalLinks: z.number().int().nonnegative(),
  skippedSourceNodes: z.number().int().nonnegative(),
  /** Initial declarative state that disagreed with a pattern's `before` value. */
  interactionStateConflicts: z.number().int().nonnegative(),
});
export type ManifestStats = z.infer<typeof ManifestStatsSchema>;

export const ManifestCoverageSchema = z.object({
  exactObservedRoutes: z.number().int().nonnegative(),
  validationObservedRoutes: z.number().int().nonnegative(),
  familyRepresentedRoutes: z.number().int().nonnegative(),
  exactBehaviorRoutes: z.number().int().nonnegative(),
  representedBehaviorRoutes: z.number().int().nonnegative(),
  unexploredBehaviorRoutes: z.number().int().nonnegative(),
  routesWithoutBehaviorEvidence: z.number().int().nonnegative(),
});
export type ManifestCoverage = z.infer<typeof ManifestCoverageSchema>;

/** Per-pattern-type accounting, so "supported" can never be a rounded claim. */
export const ManifestBehaviorSchema = z.object({
  /** Verified pattern INSTANCES in the SiteSpec (source facts, not routes). */
  sourcePatternInstances: z.number().int().nonnegative(),
  /** Of those, how many became a runtime binding. */
  runtimeBindings: z.number().int().nonnegative(),
  /** Bindings the browser performs natively — no generated JS (items 90, 92). */
  nativeBindings: z.number().int().nonnegative(),
  /** Bindings the generated InteractionRuntime performs. */
  scriptedBindings: z.number().int().nonnegative(),
  /** Confirmed patterns this generator has no implementation for. */
  unsupportedPatterns: z.number().int().nonnegative(),
  byPatternType: z.record(z.string(), z.number().int().nonnegative()),
  byMechanism: z.record(z.string(), z.number().int().nonnegative()),
  /** Unknown source instances. Runtime behavior generated for them: always 0. */
  unknownSourceInstances: z.number().int().nonnegative(),
  unknownAnnotations: z.number().int().nonnegative(),
  unknownBehaviorsImplemented: z.literal(0),
  /**
   * Task 17 §5 — user-visible observed-target accounting. Optional so
   * pre-Task-17 manifests stay valid; always written by this generator.
   */
  observedTargetBindings: z.number().int().nonnegative().optional(),
  observedTargetsRevealed: z.number().int().nonnegative().optional(),
  observedTargetsWithContent: z.number().int().nonnegative().optional(),
  observedTargetsUnresolved: z.number().int().nonnegative().optional(),
  /** Task 17.1 — host-resolved mounts and expanded captures. */
  observedTargetsHostMounted: z.number().int().nonnegative().optional(),
  observedTargetsCaptureExpanded: z.number().int().nonnegative().optional(),
});
export type ManifestBehavior = z.infer<typeof ManifestBehaviorSchema>;

export const GeneratedFileSchema = z.object({
  /** Relative to the reconstruction run directory, POSIX separators. */
  path: z.string(),
  bytes: z.number().int().nonnegative(),
});
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;

/**
 * `reconstruction-manifest.json`.
 *
 * No timestamp anywhere (item 13): the run directory name carries the clock, the
 * manifest body is a pure function of the SiteSpec and the config.
 */
export const ReconstructionManifestSchema = z.object({
  schemaVersion: z.literal(RECONSTRUCTION_SCHEMA_VERSION),
  generatorVersion: z.literal(GENERATOR_VERSION),
  engine: z.string(),

  sourceSiteSpecVersion: z.number().int(),
  sourceSchemaVersion: z.number().int(),
  sourceCompilerVersion: z.number().int(),
  /** Audit only — the SiteSpec's own root URL, never fetched. */
  rootUrl: z.string(),

  config: ManifestConfigSchema,
  stats: ManifestStatsSchema,
  coverage: ManifestCoverageSchema,
  behavior: ManifestBehaviorSchema,
  /** Task 17 §9/§10 — recovered layout-rule accounting. Optional (pre-Task-17). */
  layout: z
    .object({
      pagesWithAlignedProbe: z.number().int().nonnegative(),
      nodesWithProbe: z.number().int().nonnegative(),
      recoveredRules: z.number().int().nonnegative(),
      centered: z.number().int().nonnegative(),
      fullWidth: z.number().int().nonnegative(),
      percentage: z.number().int().nonnegative(),
      responsiveHidden: z.number().int().nonnegative(),
    })
    .optional(),

  /**
   * Task 15 provenance (item 116). Present ONLY on a CORRECTED reconstruction:
   * a baseline manifest omits all four, which is what keeps `pnpm reconstruct`
   * with no corrections byte-identical to the Task 14 output (item 114).
   */
  sourceQaRun: z.string().optional(),
  correctionSet: z.string().optional(),
  correctionCount: z.number().int().nonnegative().optional(),
  sourceSiteSpec: z.string().optional(),
  correctionsByType: z.record(z.string(), z.number().int().nonnegative()).optional(),

  /** Every file this run wrote, sorted by path. */
  generatedFiles: z.array(GeneratedFileSchema),

  /** This Task's own honesty codes. */
  limitations: z.array(ReconstructionLimitationCodeSchema),
  /** Codes carried forward from the SiteSpec, unchanged (item 192). */
  sourceLimitations: z.array(z.string()),
  limitationGlossary: z.record(z.string(), z.string()),
});
export type ReconstructionManifest = z.infer<typeof ReconstructionManifestSchema>;

/** Convenience alias so callers can pass SiteSpec codes through unchanged. */
export type SourceLimitationCode = LimitationCode;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The input is not a SiteSpec this generator can read (item 14). */
export class ReconstructionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconstructionInputError";
  }
}

/** The generator refuses to emit something it cannot emit honestly. */
export class ReconstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconstructionError";
  }
}

/** `validateGeneratedApp()` found a broken invariant (item 180). */
export class GeneratedAppValidationError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`generated app failed validation:\n  - ${problems.join("\n  - ")}`);
    this.name = "GeneratedAppValidationError";
    this.problems = problems;
  }
}
