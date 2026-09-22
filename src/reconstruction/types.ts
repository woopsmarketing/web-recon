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
  /**
   * The SITE-WIDE switch: `mobile` below this, `desktop` at or above it (item 28).
   *
   * TASK 28.7 §26 — this scalar is unchanged in meaning and in value, because
   * four consumers outside this module read it and every artifact written before
   * §26 carries only this. It is now the DEFAULT rather than the whole answer:
   * a route listed in {@link pageBreakpoints} swaps at its own width instead.
   */
  breakpoint: number;
  /**
   * TASK 28.7 §26 — `pageSourceId` → that route's own switch width, present only
   * for the routes whose own evidence chose a width different from `breakpoint`.
   *
   * OPTIONAL, and absent means "every route uses the scalar" — which is exactly
   * what a pre-§26 route map means, so an old artifact reads correctly without a
   * migration and a consumer that knows only the scalar stays correct.
   */
  pageBreakpoints?: Record<string, number>;
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
  "tree-switch-dom-width-not-observed",
  "variant-tree-not-observed",
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
  "parser-invalid-nesting-demoted",
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
    "The responsive breakpoint was inferred by this generator. Where the source's stylesheet named a breakpoint inside the interval the two observations leave open, that number was used and the manifest records its evidence; otherwise the midpoint of the two observed widths was kept and the manifest names the reason. Either way the number was never measured as a breakpoint on the original site.",
  "tree-switch-dom-width-not-observed":
    "This source serves a DIFFERENT DOM to a mobile context than to a desktop one, so the generated breakpoint chooses page STRUCTURE and not only paint. The two trees were observed at exactly two widths, and an authored breakpoint says where the source changes its CSS, not where it changes its DOM. The width at which the source actually swaps its trees was never observed, and the clone's switch is not a measurement of it.",
  "variant-tree-not-observed":
    "At least one route's own layout probe measured that route changing rendering regime at a width the clone does NOT swap trees at. Only two trees exist — one observed at the mobile endpoint, one at the desktop endpoint — so the clone keeps serving the tree its switch selected across that width, and neither tree was ever observed there. The manifest's config.variantTreeNotObserved names every such width as variant-tree-not-observed-at-<width>, and config.routeBreakpoints attributes them to routes.",
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
  "parser-invalid-nesting-demoted":
    "The observed live DOM nested an interactive or formatting element inside an open one of the same kind (for example a script-built <a> inside an <a>), which the HTML parser would close early. The inner node is served with the same box, classes and children but demoted to a layout-neutral tag (span/div, marked data-wr-demoted, any href kept as data-wr-href), so it is no longer its own link or control.",
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
/**
 * One authored breakpoint that was offered as the tree switch, with its evidence.
 * Task 28.6 C1; see `src/reconstruction/tree-switch.ts` for how "best" is ranked.
 */
export const TreeSwitchCandidateSchema = z.object({
  px: z.number().int().positive(),
  authoredWeight: z.number().int().nonnegative(),
  authoredPages: z.number().int().nonnegative(),
  observedChange: z.number().int().nonnegative(),
  observedChangePages: z.number().int().nonnegative(),
  observedChangeUnattributablePages: z.number().int().nonnegative(),
  /*
   * TASK 28.7 §27 — THE DOM-FAMILY EVIDENCE. Optional because a manifest written
   * before §27 carries none of it, and because their absence must read as
   * UNKNOWN: `familyChangePages: 0` already means "no fingerprint could answer
   * for this width", and an absent field means the artifact predates the field.
   */
  /** Pages whose probe fingerprinted both sides of a tight bracket here. */
  familyChangePages: z.number().int().nonnegative().optional(),
  /** The probe watched the RENDER FAMILY change across this width. */
  familyChangeObserved: z.boolean().optional(),
  /** How big that change was, in elements. 0 = a structure-only swap. */
  familyChange: z.number().int().nonnegative().optional(),
});
export type TreeSwitchCandidateRecord = z.infer<typeof TreeSwitchCandidateSchema>;

/**
 * Responsive Core P0 §C2.6 — HOW STRONG the evidence behind the SERVED switch is.
 *
 *   operator-override  → `--breakpoint N`, site-wide, beats everything;
 *   authored-observed  → the ranked authored winner is also a width the probe
 *                        WATCHED the render family change at (tight bracket);
 *   observed-only      → a C1.6 bisection located a family change to a 1px
 *                        bracket with no authored candidate within ±1px;
 *   product-policy     → neither: the V1 801 policy (clamped) is served.
 */
export const ServedSwitchGradeSchema = z.enum([
  "operator-override",
  "authored-observed",
  "observed-only",
  "product-policy",
]);
export type ServedSwitchGrade = z.infer<typeof ServedSwitchGradeSchema>;

export const ServedSwitchBisectionSchema = z.object({
  pageId: z.string(),
  probe: z.enum(["desktop", "mobile"]),
  lo: z.number().int().positive(),
  hi: z.number().int().positive(),
  pairLo: z.number().int().positive().optional(),
  pairHi: z.number().int().positive().optional(),
  steps: z.number().int().nonnegative(),
  converged: z.boolean(),
  familyChange: z.number().int().nonnegative(),
});

/**
 * Responsive Core P0 §C2.6 — the SERVED switch and the evidence that earned it.
 * Optional wherever it appears: artifacts written before P0 carry none, and
 * their `value` keeps meaning exactly what it meant then.
 */
export const ServedSwitchSchema = z.object({
  /** The width the clone actually swaps trees at (for a record: on THIS route). */
  value: z.number().int().positive(),
  grade: ServedSwitchGradeSchema,
  /** Human-readable account of why this grade, and not a stronger one. */
  reason: z.string(),
  /** Route records only: true when the route had no grade-2/3 evidence of its own. */
  inherited: z.boolean().optional(),
  evidence: z.object({
    /** The candidate width the evidence names (authored winner or bisected `hi`). */
    candidatePx: z.number().int().positive().optional(),
    authoredWeight: z.number().int().nonnegative().optional(),
    familyChange: z.number().int().nonnegative().optional(),
    familyChangePages: z.number().int().nonnegative().optional(),
    bisection: ServedSwitchBisectionSchema.optional(),
    /** Pages whose bisections located the grade-3 width. */
    bisectionPages: z.number().int().nonnegative().optional(),
  }),
});
export type ServedSwitch = z.infer<typeof ServedSwitchSchema>;

export const BreakpointSpecSchema = z.object({
  value: z.number().int().positive(),
  /**
   * TASK 28.8 A1 — `product-policy` is now what a default run ships.
   *
   * `inferred` is kept in the enum because every artifact written before 28.8
   * carries it, and because the inference itself still runs — its answer moved
   * to {@link inferredAuthoredPx} rather than disappearing.
   */
  provenance: z.enum([
    "inferred",
    "operator-override",
    "product-policy",
    /** Responsive Core P0 §C2.6 grade 2. */
    "authored-observed",
    /** Responsive Core P0 §C2.6 grade 3. */
    "observed-only",
  ]),
  /**
   * TASK 28.6 C1 — `authored-breakpoint` was added because the previous two
   * values could not tell a number the SOURCE wrote from a number this generator
   * calculated. `observed-endpoint-midpoint` is still emitted, and now only when
   * `fallbackReason` says why nothing better was available.
   *
   * TASK 28.8 A1 — `product-policy-v1` is the two-mode switch this product
   * serves regardless of what the source authored. See `V1_RESPONSIVE_POLICY`.
   */
  method: z.enum([
    "observed-endpoint-midpoint",
    "cli-override",
    "authored-breakpoint",
    "product-policy-v1",
    /** Responsive Core P0 §C2.6 grade 2 — see `servedSwitch`. */
    "authored-observed",
    /** Responsive Core P0 §C2.6 grade 3 — see `servedSwitch`. */
    "observed-only",
  ]),
  /**
   * TASK 28.8 A1 — what the AUTHORED-EVIDENCE inference would have served, and
   * how it got there. Present on every non-override grade (`product-policy-v1`,
   * and since Responsive Core P0 also `authored-observed` / `observed-only`);
   * absent on an operator override, whose number is nobody's inference.
   *
   * This is the field that keeps the policy honest: the inference is still run
   * on every reconstruction, so a reader can see the gap between what the source
   * implies and what the product serves, and a later Task can measure whether
   * closing that gap is worth the per-site variability it costs.
   */
  inferredAuthoredPx: z.number().int().positive().optional(),
  inferredAuthoredMethod: z
    .enum(["observed-endpoint-midpoint", "authored-breakpoint"])
    .optional(),
  /**
   * TASK 28.8 A1 — the policy width did not survive the observed interval.
   *
   * `801` is clamped into `(mobileObservedWidth, desktopObservedWidth]` so the
   * switch can never serve a tree at a width where the other tree is the one
   * that was observed. Absent means the served value IS the policy value.
   */
  policyClamped: z.boolean().optional(),
  mobileObservedWidth: z.number(),
  desktopObservedWidth: z.number(),
  /** The convention the generated CSS implements, stated in words. */
  convention: z.string(),

  /*
   * ------------------------------------------------------------------------
   * Task 28.6 C1 — TREE-SWITCH PROVENANCE.
   * ------------------------------------------------------------------------
   *
   * Every field below is OPTIONAL, and absent means UNKNOWN rather than zero: a
   * manifest written before 28.6 carried none of them, and reading its silence
   * as "no candidates, not ambiguous, single DOM" would invent evidence. An
   * operator override carries none of them either, on purpose — an operator's
   * number is not this mechanism's output and must not borrow its provenance.
   */
  /** Why the midpoint was kept. Present exactly when `method` is the midpoint. */
  fallbackReason: z
    .enum([
      "no-page-specs",
      "no-histogram",
      "empty-histogram",
      "no-candidate-in-observed-interval",
    ])
    .optional(),
  /** Authored breakpoints inside the observed interval `(mobile, desktop]`. */
  candidateCount: z.number().int().nonnegative().optional(),
  /** `candidateCount > 1`: the source named more than one usable breakpoint. */
  ambiguous: z.boolean().optional(),
  /**
   * Authored boundaries DROPPED for sitting outside that interval. Snapping to
   * one would move the switch past a width at which the other tree was observed.
   */
  candidatesOutsideObservedInterval: z.number().int().nonnegative().optional(),
  /** Candidates omitted from `candidates` by the report cap. Never silent. */
  candidatesOmitted: z.number().int().nonnegative().optional(),
  /** Ranked candidates, best first. */
  candidates: z.array(TreeSwitchCandidateSchema).optional(),
  /** The winner's evidence. */
  chosen: TreeSwitchCandidateSchema.optional(),
  pagesRead: z.number().int().nonnegative().optional(),
  pagesWithHistogram: z.number().int().nonnegative().optional(),
  pagesWithUsableProbe: z.number().int().nonnegative().optional(),
  /**
   * Measured: whether the source serves ONE DOM across the two observations or
   * TWO. `single-dom` means no width can mount the wrong tree, because there is
   * only one tree. `dual-dom` means the switch chooses structure.
   */
  treeDivergence: z.enum(["single-dom", "dual-dom", "unknown"]).optional(),
  pagesIdenticalWalk: z.number().int().nonnegative().optional(),
  pagesDivergentWalk: z.number().int().nonnegative().optional(),
  pagesWalkNotComparable: z.number().int().nonnegative().optional(),
  /**
   * TASK 28.7 §27 — TRUE when the layout probe's per-width DOM-family fingerprint
   * WATCHED the render family change across the width that ships.
   *
   * It was `z.literal(false)` from 28.6 C1 until §27, and that was honest: the
   * only width evidence in the pipeline was the geometry of matched nodes, and a
   * CSS reflow moves geometry exactly as a DOM swap does. FALSE still means "not
   * observed" and never "no swap exists" — every artifact observed before §27
   * reads false, as does a site that is genuinely CSS-responsive at every width
   * and any run that fell back to the midpoint.
   */
  domSwitchWidthObserved: z.boolean().optional(),
  /** Pages whose probe carried a per-width DOM-family fingerprint at all. */
  pagesWithFingerprint: z.number().int().nonnegative().optional(),
  /**
   * Responsive Core P0 §C2.6 — the served switch, its grade and its evidence.
   * Absent on every artifact written before P0.
   */
  servedSwitch: ServedSwitchSchema.optional(),
});
export type BreakpointSpec = z.infer<typeof BreakpointSpecSchema>;

/**
 * TASK 28.7 §26 — ONE ROUTE'S SWITCH, AND THE EVIDENCE THAT CHOSE IT.
 *
 * Emitted for every page, including the ones that simply inherit the site-wide
 * number, so a reader can tell "this route agreed" from "this route was never
 * asked". Every field is required HERE because the whole record is optional in
 * the manifest: an artifact written before §26 carries no `routeBreakpoints` at
 * all, and that silence must not be readable as "no route disagreed".
 */
export const PageBreakpointRecordSchema = z.object({
  pageId: z.string(),
  /** The width this route's clone actually swaps trees at. */
  breakpoint: z.number().int().positive(),
  /** True when that width is this route's own winner rather than the site's. */
  ownDecision: z.boolean(),
  /**
   * True when the width this route is SERVED at differs from the site's served
   * switch (Responsive Core P0: was the inference's disagreement, now in
   * `inferredDiffersFromSite`). Equals "this route is in `pageBreakpoints`".
   */
  differsFromSite: z.boolean(),
  /** Responsive Core P0 — the pre-P0 meaning: this route's own INFERENCE differs from the site's. */
  inferredDiffersFromSite: z.boolean().optional(),
  /** Why this route produced no winner of its own. */
  fallbackReason: z
    .enum([
      "no-page-specs",
      "no-histogram",
      "empty-histogram",
      "no-candidate-in-observed-interval",
    ])
    .optional(),
  /** Authored candidates from THIS page's stylesheet, inside the observed interval. */
  candidateCount: z.number().int().nonnegative(),
  ambiguous: z.boolean(),
  /** This route's winner and its evidence. */
  chosen: TreeSwitchCandidateSchema.optional(),
  /** This page's own two element walks differ, so its switch chooses structure. */
  dualDom: z.boolean(),
  /**
   * TASK 28.7 §27 — this route's `breakpoint` is a width its own probe WATCHED
   * the render family change at. Optional: absent in every artifact written
   * before §27.
   */
  domSwitchWidthObserved: z.boolean().optional(),
  /** Widths where this route's fingerprint measured a family swap, ascending. */
  familyChangeWidths: z.array(z.number().int().positive()).optional(),
  /**
   * Widths where this route's own probe measured it changing and at which the
   * clone does NOT swap trees. Each is reported as `variant-tree-not-observed-at-<px>`.
   */
  unservedChangeWidths: z.array(z.number().int().positive()),
  /**
   * Responsive Core P0 — `unservedChangeWidths` is measured against the SERVED
   * width (`servedSwitch.value`) since P0, because it is a manifest limitation
   * and must describe what ships. This is the same list measured against the
   * route's INFERRED width (`breakpoint`), kept as evidence.
   */
  inferredUnservedChangeWidths: z.array(z.number().int().positive()).optional(),
  /**
   * Responsive Core P0 §C2.6 — the width THIS route is served at, with its grade.
   * `breakpoint` above stays this route's own INFERENCE (as it has been since
   * 28.8 A1); `servedSwitch.value` is what the clone swaps at. Absent pre-P0.
   */
  servedSwitch: ServedSwitchSchema.optional(),
});
export type PageBreakpointRecord = z.infer<typeof PageBreakpointRecordSchema>;

export const ManifestConfigSchema = z.object({
  inferredBreakpoint: BreakpointSpecSchema,
  /**
   * TASK 28.7 §26 — the per-route switches. OPTIONAL: absent in every artifact
   * written before §26, and absent for an operator `--breakpoint N`, whose number
   * is a site-wide instruction and must not borrow per-route provenance.
   */
  routeBreakpoints: z.array(PageBreakpointRecordSchema).optional(),
  /**
   * TASK 28.7 §26.4 — the honest refusal, deduplicated and sorted: every width at
   * which some route was measured to change and the clone does not swap trees.
   */
  variantTreeNotObserved: z.array(z.string()).optional(),
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
  nestingDemotions: z.number().int().nonnegative().optional(),
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
  /*
   * Task 28.5B §5 — the source `:root` custom-property section, made VISIBLE.
   * Without these a run whose observations carried no custom properties emits
   * an empty section and nothing in the manifest says so, which is precisely
   * how the zero-reach case hid. `.optional()` so every historical manifest
   * still parses.
   */
  /** Scoped `[data-wr-page][data-wr-viewport]` blocks written. */
  customPropertyBlocks: z.number().int().nonnegative().optional(),
  /** Declarations inside them (post-dedup, post-safety-gate). */
  customPropertyDeclarations: z.number().int().nonnegative().optional(),
  /** Names + values + scopes the emitter refused. Never silent. */
  customPropertyRejected: z.number().int().nonnegative().optional(),
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
      /**
       * Task 28.6 A5 — shipped `grid-track-columns` rules. Optional so that a
       * manifest written before this kind existed still parses.
       */
      gridTrack: z.number().int().nonnegative().optional(),

      /*
       * Task 28.5B — layout-inference SAFETY accounting.
       *
       * Every field below is optional so that a manifest written before this
       * task still parses: historical reconstruction artifacts are inputs to the
       * template, content, theme and release tiers, and a schema change that
       * orphaned them would break the pipeline behind this one.
       *
       * `recoveredRules` above is the SHIPPED count. These say how it was
       * reached: how many rules inference proposed, how many a containing-block
       * guard refused before emission, and how many a real Chromium re-render at
       * the truth viewport rejected afterwards. `acceptedRegressed` is the claim
       * the old docstring made for free and could not support — it is now a
       * measurement, and it must be 0.
       */
      /** Rules inference proposed, before the browser truth check. */
      candidateRules: z.number().int().nonnegative().optional(),
      /** …of those, the ones that shipped. Equals `recoveredRules`. */
      acceptedRules: z.number().int().nonnegative().optional(),
      /** Nodes a containing-block guard refused before any rule was emitted. */
      rejectedByGuard: z.number().int().nonnegative().optional(),
      /** Candidates a truth-viewport re-render measured as regressions. */
      rejectedByTruthCheck: z.number().int().nonnegative().optional(),
      /**
       * Geometry-affecting candidates (`centered-max-width`, `full-width`,
       * `percentage-width`) REJECTED because the check could not measure them:
       * no observed rect, no such page in this generation, node absent from the
       * render, the page's set never settling, a failed render, or no Chromium.
       * A geometry rule never ships unverified, so these are dropped rather than
       * emitted at (0,3,0) above the exact computed class.
       */
      rejectedUnverifiable: z.number().int().nonnegative().optional(),
      /**
       * Rules that shipped with NO render at all.
       *
       * Task 28.6 R3 retracted the sentence that used to stand here — that a
       * banded rule's `@media` condition cannot apply at the truth viewport, so
       * shipping it unrendered is "a proof, not an exemption". The first half is
       * true and the conclusion does not follow: it is a reason to render the
       * rule somewhere else, and it is exactly what let 503 inverted bands ship
       * through a green truth check. Banded rules are now rendered inside their
       * own active range, so this field is 0 on every status but `disabled`.
       */
      acceptedUnchecked: z.number().int().nonnegative().optional(),
      /** Shipped rules still regressing in the confirming render. Must be 0. */
      acceptedRegressed: z.number().int().nonnegative().optional(),
      /** Guard refusals by reason (`grid-item`, `flex-item-basis-governed`, …). */
      guardRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /*
       * Task 28.6 — the three proven responsive-recovery defects, each with the
       * counter that keeps it fixed. Optional for the same reason as the 28.5B
       * block above: historical reconstruction artifacts are inputs to the tiers
       * behind this one and must keep parsing.
       */
      /**
       * R2. Candidates refused because the observation could not say whether
       * `width: auto` would STRETCH or shrink-to-fit on that box. `width: auto`
       * is intrinsic sizing everywhere but a block-level in-flow box in a block
       * container, and emitting it on an out-of-flow box or a flex item was
       * resolving correctly only because frozen descendants propped up
       * max-content. A counted refusal beats silently wrong output.
       */
      widthModeRefusals: z.number().int().nonnegative().optional(),
      /** …by reason (`flex-item-main-axis`, `grid-item-inline-size`, …). */
      widthModeRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /** R2. Rules that shipped `width: auto`, having been shown to stretch. */
      widthModeStretch: z.number().int().nonnegative().optional(),
      /** R2. Rules that shipped `width: 100%` / `calc(100% - Npx)` instead. */
      widthModeFillPercentage: z.number().int().nonnegative().optional(),
      /**
       * R1. Emitted `@media` bands whose coverage of the desktop probe widths
       * disagrees with what the probe observed at those widths. MUST be 0: the
       * shipped off-by-one opened a band at the observed sample instead of below
       * it, hiding 503 nodes across a range they had been measured visible in.
       */
      bandSampleMismatches: z.number().int().nonnegative().optional(),

      /*
       * Task 28.6 D1 — BAND EDGES SNAPPED ONTO THE SOURCE'S OWN BREAKPOINTS.
       *
       * A midpoint edge is arithmetic on the probe's sampling grid: 1232 is
       * `floor((1024 + 1440) / 2)` and no one wrote it. These fields say, for
       * this build, how many edges moved onto a number the source's stylesheet
       * actually authored and how many stayed a guess — and, for the guesses,
       * whether the histogram said nothing here or there was no histogram to
       * ask. Optional like every block around them: a pre-28.6 manifest carries
       * none of them, where they are UNKNOWN and not zero.
       */
      /** Pages by histogram provenance: `spec-field` / `derived-from-nodes` / `unavailable`. */
      authoredBreakpointPages: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /** Histogram entries read across those pages. */
      authoredBreakpointEntries: z.number().int().nonnegative().optional(),
      /** Matched authored declarations they were folded from. */
      authoredBreakpointDeclarations: z.number().int().nonnegative().optional(),
      /** …of those, the ones that could not be READ: the histograms are incomplete by that much. */
      authoredBreakpointUnparsedDeclarations: z.number().int().nonnegative().optional(),
      /** Nodes whose authored-declaration list the observation truncated. */
      authoredBreakpointTruncatedNodes: z.number().int().nonnegative().optional(),
      /** Band edges left OPEN by the builder: no bracketing sample, nothing to snap. */
      bandEdgesOpen: z.number().int().nonnegative().optional(),
      /**
       * PRESENT band edges offered to the snapper. Splits exactly into
       * `bandEdgesSnapped` + `bandEdgesKeptMidpointNoAuthoredInGap` +
       * `bandEdgesKeptMidpointEmptyHistogram` + `bandEdgesKeptMidpointNoHistogram`.
       */
      bandEdgesConsidered: z.number().int().nonnegative().optional(),
      /** …moved onto an authored breakpoint inside the probe gap. */
      bandEdgesSnapped: z.number().int().nonnegative().optional(),
      /** …of the snapped, the ones whose gap held more than one authored edge. */
      bandEdgesSnappedAmbiguous: z.number().int().nonnegative().optional(),
      /** …kept the midpoint: the histogram named nothing inside the gap. */
      bandEdgesKeptMidpointNoAuthoredInGap: z.number().int().nonnegative().optional(),
      /** …kept the midpoint: the histogram was present and empty. */
      bandEdgesKeptMidpointEmptyHistogram: z.number().int().nonnegative().optional(),
      /** …kept the midpoint FOR WANT OF DATA: no histogram for that viewport. */
      bandEdgesKeptMidpointNoHistogram: z.number().int().nonnegative().optional(),
      /** Total px the snapped edges moved off their midpoint guess. */
      bandEdgeSnapShiftPx: z.number().nonnegative().optional(),
      /**
       * R3. Banded rules verified INSIDE their own active range. Before 28.6
       * every banded rule was exempt from the check entirely, which is how the
       * R1 bands shipped through a green truth check.
       */
      bandCheckable: z.number().int().nonnegative().optional(),
      /** R3. Banded rules an in-band render rejected. */
      rejectedByBandCheck: z.number().int().nonnegative().optional(),
      /** R3. Extra page loads spent on in-band verification. */
      bandWidthsRendered: z.number().int().nonnegative().optional(),

      /*
       * Task 28.6 V1/V2/V4 and A5 — the corrections a fresh verifier required of
       * the R1/R2/R3 wave, plus the grid-track recovery kind. Optional for the
       * same reason as every block above: historical artifacts must keep
       * parsing.
       */
      /**
       * V1. Banded rules that REACHED the in-band render and whose verdict was
       * read off the node's own computed `display`.
       *
       * TASK 28.6 D1(b) — WHAT DIVIDING THIS BY `bandCheckable` DOES AND DOES
       * NOT SAY. This counter increments for every banded rule whose node is in
       * the document; it is a presence count, not a measurement of
       * discrimination, and it reads `bandCheckable`-of-`bandCheckable` under
       * the reverted pre-V1 semantics too. The discriminated population is this
       * number MINUS `bandExactTierHidesAtBandWidth` — the rules whose own
       * cascade already said `none` at the band width, where the band adds
       * nothing. So "all of them were discriminated" is only sound when that
       * second counter is 0, and the honest form of the claim names all three:
       * N checkable, N present, M already hidden by the exact tier ⇒ N − M
       * discriminated.
       *
       * The first R3 revision asked whether the node was in layout, which any
       * ancestor's `display: none` answers, so 68.4% of this corpus's banded
       * rules were never discriminated at all — that is what
       * `bandHiddenByAncestorAtBandWidth` now measures.
       */
      bandIndependentlyDiscriminated: z.number().int().nonnegative().optional(),
      /** V1. …of those, the ones an ANCESTOR removed from layout at the band width. */
      bandHiddenByAncestorAtBandWidth: z.number().int().nonnegative().optional(),
      /** V1. …and the ones the exact computed class already hid there. */
      bandExactTierHidesAtBandWidth: z.number().int().nonnegative().optional(),
      /**
       * V4. Banded rules whose node was already OUT of layout at the truth width
       * in the baseline render, contradicting the probe sample the band was
       * built from. Rejected rather than passed.
       */
      bandTruthBaselineNotInLayout: z.number().int().nonnegative().optional(),
      /**
       * V2. Rules refused because a length the declaration had to SUBTRACT could
       * not be read from the computed style. The pre-V2 code read those as zero,
       * which shipped a `width: 100%` overflowing by exactly the padding and a
       * `max-width` too large by it, with nothing in any counter.
       */
      widthValueRefusals: z.number().int().nonnegative().optional(),
      /** V2. …by reason (`own-padding-unreadable`). */
      widthValueRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /*
       * ----------------------------------------------------------------------
       * Task 28.6 C2b — the DESKTOP / MOBILE split.
       * ----------------------------------------------------------------------
       */
      /** Viewport passes attempted, by viewport id (one per page per viewport). */
      viewportPasses: z.record(z.string(), z.number().int().nonnegative()).optional(),
      /** …of those, the ones that resolved a probe and ran. */
      viewportPassesUsed: z.record(z.string(), z.number().int().nonnegative()).optional(),
      /**
       * …and the ones that refused, keyed `"<viewport>:<reason>"`. On an artifact
       * compiled before SiteSpec schemaVersion 6 every mobile pass lands in
       * `mobile:probe-absent`, which is the honest reading of a missing field
       * rather than evidence that the mobile probe found nothing.
       */
      viewportPassRefusals: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /**
       * CANDIDATE rules by viewport, before the truth check. Read with
       * `shippedRulesByViewport` to see what the check kept.
       */
      rulesByViewport: z.record(z.string(), z.number().int().nonnegative()).optional(),
      /** SHIPPED rules by viewport — what is actually in the stylesheet. */
      shippedRulesByViewport: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /*
       * ----------------------------------------------------------------------
       * Task 28.6 C3 — the INLINE-SIZE FUNNEL.
       * ----------------------------------------------------------------------
       *
       * The population every inline-size branch divides, and what happened to
       * each member of it. Before C3 the three branches ended in a bare
       * `continue` and nothing counted the nodes that fell past all of them, so
       * a run that examined 3,005 boxes and restated 85 of them reported "7
       * refusals" — indistinguishable from a run that found nothing to examine.
       */
      /** Probed nodes that reached the inline-size stage. */
      inlineSizeCandidates: z.number().int().nonnegative().optional(),
      /**
       * …by outcome, summing exactly to `inlineSizeCandidates`.
       * `no-branch-matched` is the count that had no field at all: those nodes
       * ship their exact computed width, frozen at the truth viewport, at every
       * width the clone renders.
       */
      inlineSizeOutcomes: z.record(z.string(), z.number().int().nonnegative()).optional(),
      /** Candidates that recorded a second outcome. Structurally 0. */
      inlineSizeOutcomeDoubleCounts: z.number().int().nonnegative().optional(),
      /**
       * Probed nodes dropped BEFORE that stage, by reason. Sums with
       * `inlineSizeCandidates` to `nodesWithProbe`.
       */
      inlineSizePreStageDrops: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * A5. Grid containers whose COLUMN TRACKS were re-expressed from the
       * observed child geometry. Chromium serializes `grid-template-columns` as
       * the used track sizes in px, so the exact tier freezes `2fr repeat(4,
       * 1fr)` into five pixel widths that keep summing to the observed container
       * width inside every narrower viewport.
       */
      gridTrackColumns: z.number().int().nonnegative().optional(),
      /** A5. Grid containers examined for track recovery and refused. */
      gridTrackRefusals: z.number().int().nonnegative().optional(),
      /** A5. …by reason (`container-width-constant`, `all-tracks-fixed`, …). */
      gridTrackRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * Task 28.75 §03b. Grid containers whose tracks were recovered ONE
       * AUTHORED BAND AT A TIME, because their column COUNT changes at a
       * breakpoint and no single track list can describe them.
       * `gridTrackBandContainers` counts containers and
       * `gridTrackColumnsBanded` counts the rules they emitted (one per band),
       * so the container-level conservation is
       * `gridTrackColumns + gridTrackBandContainers + gridTrackRefusals`.
       */
      gridTrackBandContainers: z.number().int().nonnegative().optional(),
      gridTrackColumnsBanded: z.number().int().nonnegative().optional(),
      /** §03b. Containers the banded pass was offered and refused. */
      gridTrackBandRefusals: z.number().int().nonnegative().optional(),
      /** §03b. …by reason (`single-band`, `band-insets-not-constant`, …). */
      gridTrackBandRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /** §03b. Grid band edges moved onto a breakpoint the source authored. */
      gridBandEdgesSnapped: z.number().int().nonnegative().optional(),
      /** §03b. …edges considered, snapped or not. */
      gridBandEdgesConsidered: z.number().int().nonnegative().optional(),
      /** §03b. Banded GEOMETRY rules offered to the band-width render check. */
      bandGeometryCheckable: z.number().int().nonnegative().optional(),
      /** §03b. Extra renders that check needed. */
      bandGeometryWidthsRendered: z.number().int().nonnegative().optional(),
      /**
       * Task 28.75 §03b. Grid ITEMS whose frozen used `width` was restated as
       * `width: auto; min-width: 0` because the item was observed filling the
       * grid AREA `recoverGridTracks()` measured for it, at every width.
       */
      gridAreaFill: z.number().int().nonnegative().optional(),
      /** §03b. …and every node the same test declined, by reason. */
      gridAreaFillRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * Task 28.7 G. Out-of-flow boxes whose frozen used `width` was restated as
       * `width: auto` because the inset equation
       * `width = containingBlock − left − right − margins` reproduces the
       * observed border box at every displayed probe width. `insetResolved` is
       * the SHIPPED count, `insetResolvedWidth` what inference proposed.
       */
      insetResolved: z.number().int().nonnegative().optional(),
      insetResolvedWidth: z.number().int().nonnegative().optional(),
      /** Task 28.7 G. …and every node the same test declined, by reason. */
      insetResolvedRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * Task 28.75. In-flow BLOCK boxes whose frozen used `width` was restated as
       * `width: auto` because the gap to the parent's border box is constant
       * across real parent growth and decomposes into the exact tier's own box
       * model at the truth width. `trackedFill` is the SHIPPED count,
       * `trackedFillWidth` what inference proposed.
       */
      trackedFill: z.number().int().nonnegative().optional(),
      trackedFillWidth: z.number().int().nonnegative().optional(),
      /** Task 28.75. …and every node the same test declined, by reason. */
      trackedFillRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * Task 28.75. In-flow FULL-BLEED bands whose frozen `width` /
       * `margin-inline` / `left` set was co-emitted as `100vw` +
       * `calc(50% - 50vw)`. `viewportBleed` is the SHIPPED count,
       * `viewportBleedWidth` what inference proposed.
       */
      viewportBleed: z.number().int().nonnegative().optional(),
      viewportBleedWidth: z.number().int().nonnegative().optional(),
      /** Task 28.75. …and every node the same test declined, by reason. */
      viewportBleedRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),

      /**
       * Task 28.75 §19. Boxes with PROVEN frozen-width damage and no recoverable
       * relation, capped at their containing block with `max-width: 100%`.
       * `damageClamped` is the SHIPPED count, `damageClampedWidth` what
       * inference proposed.
       */
      /**
       * Task 28.75 §19. Candidates whose recorded inline-size outcome was
       * REPLACED by a later branch (only the damage clamp does this). The
       * partition still sums to `inlineSizeCandidates`.
       */
      inlineSizeOutcomesSuperseded: z.number().int().nonnegative().optional(),
      damageClamped: z.number().int().nonnegative().optional(),
      damageClampedWidth: z.number().int().nonnegative().optional(),
      /** Task 28.75 §19. …and every node the same test declined, by reason. */
      damageClampRefusalsByReason: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /*
       * ---------------------------------------------------------------------
       * TASK 28.7 B1 — THE RESIDUAL FREEZE AUDIT. Diagnostic, never a gate.
       * ---------------------------------------------------------------------
       *
       * Every counter above accounts for rules that were EMITTED. None of them
       * accounts for the nodes recovery DECLINED to emit for — and declining is
       * not neutral: the exact tier's value is a used value resolved at the
       * truth width, so a refusal ships a 1440 pixel at every other width. This
       * block is the measurement of what those pixels do, taken by rendering
       * the clone at the widths the PROBE measured the source at.
       *
       * It never rejects a rule. The reason is measured rather than stylistic:
       * on the one worked case, refusing the recovered `width: auto` as well
       * leaves the container at 1436 and trades a 290px overhang for a 336px
       * one — the refusal makes the clipping worse. Optional like every block
       * around it, so a pre-28.7 manifest still parses.
       */
      /** `performed` / `not-performed` (no browser or no evidence) / `no-candidates`. */
      residualAuditStatus: z
        .enum(["performed", "not-performed", "no-candidates"])
        .optional(),
      /** page × viewport passes that got at least two measured widths. */
      residualAuditPasses: z.number().int().nonnegative().optional(),
      /** Nodes whose own SOURCE geometry moves across their variant's widths. */
      residualAuditNodesOffered: z.number().int().nonnegative().optional(),
      /** …of those, the ones actually carried into the render. */
      residualAuditNodesMeasured: z.number().int().nonnegative().optional(),
      /** …and the ones the per-pass bound dropped. Never silent. */
      residualAuditNodesOmitted: z.number().int().nonnegative().optional(),
      /** Extra page loads the audit added, beyond the ones already happening. */
      residualAuditWidthsRendered: z.number().int().nonnegative().optional(),
      /** Audit widths the per-pass width bound dropped. */
      residualAuditWidthsCapped: z.number().int().nonnegative().optional(),
      /**
       * The ranked residuals: source geometry moved, clone geometry did not.
       * Top-N per ROUTE, ordered by offscreen impact, then clipping impact,
       * then pixel delta, then descendants carried.
       */
      residualFrozenNodes: z
        .array(
          z.object({
            pageId: z.string(),
            viewportId: z.string(),
            nodeId: z.string(),
            tagName: z.string(),
            parentNodeId: z.string().optional(),
            property: z.string(),
            family: z.string(),
            frozenValue: z.string(),
            widths: z.array(z.number()),
            sourceX: z.array(z.number()),
            sourceW: z.array(z.number()),
            cloneX: z.array(z.number()),
            cloneW: z.array(z.number()),
            absoluteDeltaPx: z.number(),
            relativeDelta: z.number(),
            consequence: z.enum(["offscreen", "clipping", "neither"]),
            descendants: z.number().int().nonnegative(),
            recoveredKind: z.string().optional(),
            refusalReason: z.string().optional(),
          }),
        )
        .optional(),
      /** …and what the per-route cut dropped. */
      residualFrozenOmitted: z.number().int().nonnegative().optional(),
      /** Every DETECTED residual by frozen property family, before the cut. */
      residualFrozenFamilies: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /** …and by derived visual consequence. */
      residualFrozenConsequences: z
        .record(z.string(), z.number().int().nonnegative())
        .optional(),
      /**
       * Task 28.7 B1 — per-NODE grid-track refusals, bounded per route by the
       * measured px the frozen track list overhangs its container by.
       * `gridTrackRefusalsByReason` is a histogram and cannot name a container.
       */
      gridTrackRefusalNodes: z
        .array(
          z.object({
            pageId: z.string(),
            viewportId: z.string(),
            nodeId: z.string(),
            tagName: z.string(),
            reason: z.string(),
            childCount: z.number().int().nonnegative(),
            frozenTracks: z.string().optional(),
            trackCount: z.number().int().nonnegative().optional(),
            frozenExcessPx: z.number().optional(),
            atWidth: z.number().optional(),
          }),
        )
        .optional(),
      gridTrackRefusalNodesOmitted: z.number().int().nonnegative().optional(),
      /**
       * Whether the truth check actually ran. `chromium-unavailable` and
       * `disabled` are recorded rather than silently treated as a pass: an
       * unverified recovered tier is a different artifact from a verified one.
       */
      truthCheckStatus: z
        .enum([
          "verified",
          "no-candidates",
          "responsive-hidden-only",
          "unverifiable-candidates",
          "chromium-unavailable",
          "disabled",
        ])
        .optional(),
      /** Geometry candidates that can be measured at the truth viewport. */
      truthCheckable: z.number().int().nonnegative().optional(),
      /** Re-render/measure rounds, summed across pages. */
      truthCheckRounds: z.number().int().nonnegative().optional(),
      truthCheckPagesRendered: z.number().int().nonnegative().optional(),
      /** False when a page's candidate set never settled and was dropped whole. */
      truthCheckConverged: z.boolean().optional(),
      /*
       * P0 contract C2.1 — interval-sample verification. Optional: manifests
       * written before C2.1 carry none of these and still parse.
       */
      /** Geometry rules that carried per-width source samples into the check. */
      intervalSampleCheckable: z.number().int().nonnegative().optional(),
      /** Extra page loads the interval stage added (widths not already rendered). */
      intervalSamplesRendered: z.number().int().nonnegative().optional(),
      /** (rule × selected width) comparisons in the stage's first sweep. */
      intervalSamplesChecked: z.number().int().nonnegative().optional(),
      /** Rules rejected `interval-sample-regressed`. */
      rejectedAtIntervalSample: z.number().int().nonnegative().optional(),
      rejectedAtIntervalSampleByKind: z.record(z.string(), z.number()).optional(),
      /** Selection positions no probe width inside the served interval answered. */
      unprobedPositions: z.number().int().nonnegative().optional(),
      /** Amended C2.1 — sample widths the per-pass cap of 16 dropped. */
      intervalSampleWidthsCapped: z.number().int().nonnegative().optional(),
      intervalSampleUnverifiedByCap: z.number().int().nonnegative().optional(),
      /** RECI2 fix (a) — page loads retried, interval isolation renders / co-rejections avoided, truth re-check rejections. */
      renderLoadRetries: z.number().int().nonnegative().optional(),
      intervalIsolationRenders: z.number().int().nonnegative().optional(),
      intervalCoRejectionsAvoided: z.number().int().nonnegative().optional(),
      truthRecheckRejections: z.number().int().nonnegative().optional(),
      intervalIsolationBudgetFallbacks: z.number().int().nonnegative().optional(),
      /**
       * TASK 28.8 A2 — the truth check's rejections, split by rule KIND.
       *
       * `rejectedByTruthCheck` is one total over eleven kinds, so a new kind
       * that renders badly is invisible in it until it is large enough to move
       * the total. Per kind, it is visible on the first run.
       */
      rejectedByTruthCheckByKind: z.record(z.string(), z.number()).optional(),

      /*
       * TASK 28.8 A2 — THE AUTHORED INLINE-SIZE FALLBACK.
       *
       * `authoredInlineSize` is what SHIPPED; everything below is what the
       * branch was offered and why it declined, at both the node grain and the
       * declaration grain. The two histograms answer different questions: a
       * node refused `no-authored-layout` was never a candidate, while a node
       * refused `no-admissible-declaration` had declarations that lost on their
       * value shape or their media condition, and the declaration histogram
       * says which.
       */
      authoredInlineSize: z.number().int().nonnegative().optional(),
      authoredIntentOffered: z.record(z.string(), z.number()).optional(),
      authoredIntentEmitted: z.record(z.string(), z.number()).optional(),
      authoredIntentDeclarations: z.number().int().nonnegative().optional(),
      /** Admissible declarations BEYOND the one the cascade took. */
      authoredIntentCascadeCandidates: z.number().int().nonnegative().optional(),
      /** Rules that added `width: auto` because the source declared no width. */
      authoredIntentWidthAutoAdded: z.number().int().nonnegative().optional(),
      authoredIntentRefusalsByReason: z.record(z.string(), z.number()).optional(),
      authoredIntentDeclarationRefusalsByReason: z
        .record(z.string(), z.number())
        .optional(),
      authoredIntentEmittedByProperty: z.record(z.string(), z.number()).optional(),
      /** Task 28.8 A2b — emitted declarations admitted through a resolved `var()`. */
      authoredIntentVarAdmitted: z.number().int().nonnegative().optional(),

      /*
       * TASK 28.8 A3 — TEXT-BOX BLOCK-SIZE RELIEF, in the FROZEN tier.
       *
       * Not a recovered rule and not truth-checked as one: it is a variant of
       * the exact computed class itself, so it ships with the frozen tier and
       * is identical to it at the truth width whenever the content fits. See
       * `textBoxVariantCss()`.
       */
      textBoxRelief: z
        .object({
          /** Nodes flagged `wr-tx`: `height: N` became `min-height: N`. */
          minHeightNodes: z.number().int().nonnegative(),
          /** Nodes flagged `wr-sf`: a shrink-to-fit frozen `width` was dropped. */
          shrinkToFitWidthDropped: z.number().int().nonnegative(),
          /** Variant RULES emitted — one per (token × variant) actually used. */
          tokensVariants: z.number().int().nonnegative(),
        })
        .optional(),

      /*
       * Responsive Core P0 §C2.4 / §C2.5 (REC-I2) — WIDTH-FAMILY OWNERSHIP.
       * Optional: manifests written before REC-I2 carry none and still parse.
       * Counts (no clocks). Partition: `nodesConsidered = nodePlansOffered +
       * Σ notOfferedByReason`; `nodePlansOffered = nodesOwned + nodePlansRejected`;
       * `Σ rejectedBy = nodePlansRejected`.
       */
      ownership: z
        .object({
          nodesConsidered: z.number().int().nonnegative(),
          notConsideredByReason: z.record(z.string(), z.number().int().nonnegative()),
          nodePlansOffered: z.number().int().nonnegative(),
          nodesOwned: z.number().int().nonnegative(),
          nodePlansRejected: z.number().int().nonnegative(),
          rejectedBy: z.record(z.string(), z.number().int().nonnegative()),
          notOfferedByReason: z.record(z.string(), z.number().int().nonnegative()),
          ambiguousByReason: z.record(z.string(), z.number().int().nonnegative()),
          contradictedByProperty: z.record(z.string(), z.number().int().nonnegative()),
          rulesOffered: z.number().int().nonnegative(),
          rulesShipped: z.number().int().nonnegative(),
          tokensSplit: z.number().int().nonnegative(),
          splitRulesEmitted: z.number().int().nonnegative(),
          /** Always 0: the split keeps every token class; it only moves declarations. */
          tokenCountDelta: z.number().int(),
          /** Exact-tier bytes, owned split minus the same run's unsplit tier. */
          cssBytesDelta: z.number().int(),
          /** Recovered-tier bytes removed by dropping owner nodes' measured width-family declarations. */
          recoveredCssBytesDropped: z.number().int().nonnegative(),
          /** Runtime JSON bytes added by marker classes (net of removed `wr-sf`). */
          markerBytes: z.number().int(),
          measuredDeclarationsDropped: z.number().int().nonnegative(),
          measuredRulesDropped: z.number().int().nonnegative(),
          shrinkToFitClassesRemoved: z.number().int().nonnegative(),
          /** Owner nodes that also ship a grid-track rule (different property; reported). */
          ownersWithGridTrackRule: z.number().int().nonnegative(),
          /** property → provenance (`authored-sheet` / `authored-inline` / `runtime-inline` / `frozen-UA` / `initial`) → shipped pieces. */
          provenanceByProperty: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
          verificationWidthsRendered: z.number().int().nonnegative(),
          verificationRounds: z.number().int().nonnegative(),
          verificationIsolatedRenders: z.number().int().nonnegative(),
          verificationConverged: z.boolean(),
          acceptedJointRegressions: z.number().int().nonnegative(),
          ownedFormConfirm: z.enum(["confirmed", "not-run", "chromium-unavailable"]),
          ownedFormChecked: z.number().int().nonnegative(),
          ownedFormMismatches: z.number().int().nonnegative(),
          // Review fixes (MAJOR-1..4). Optional: absent on manifests written before them.
          ownedFormRollbacks: z.number().int().nonnegative().optional(),
          jointRegressionRollbacks: z.number().int().nonnegative().optional(),
          rollbackPasses: z.number().int().nonnegative().optional(),
          rollbackExhausted: z.number().int().nonnegative().optional(),
          verificationRenders: z.number().int().nonnegative().optional(),
          renderBudgetRejections: z.number().int().nonnegative().optional(),
          renderBudgetPerPass: z.number().int().nonnegative().optional(),
          witnessesGuarded: z.number().int().nonnegative().optional(),
          /** RECI2 budget fix — phase-B set screening renders; review-VF — ownership page-load retries. */
          independentSetRenders: z.number().int().nonnegative().optional(),
          renderLoadRetries: z.number().int().nonnegative().optional(),
          coverageIncompleteByReason: z.record(z.string(), z.number()).optional(),
        })
        .optional(),
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
