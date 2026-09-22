import { z } from "zod";
import {
  ATTR_WHITELIST,
  BoundingBoxSchema,
  FamilySwitchBisectionSchema,
  InitialDocumentSchema,
  InlineStyleProvenanceCountsSchema,
  InlineStyleProvenanceSchema,
  InlineStyleSchema,
  LayoutProbeFingerprintSchema,
  MatchedLayoutRuleSchema,
  RootCustomPropertiesSchema,
  ScrollStateSchema,
  StylesheetCoverageSchema,
  ViewportProfileSchema,
} from "../observer/types.js";
import { PageFamilyTypeSchema } from "../selector/types.js";
import { SitePageRoleSchema } from "../multi-observer/types.js";
import { ControlRelationTypeSchema } from "../interaction-detector/types.js";
import {
  PatternMechanismSchema,
  PatternTypeSchema,
  TransitionDirectionSchema,
  UnknownReasonSchema,
  AiEligibilitySchema,
  PartialPatternHintSchema,
} from "../interaction-patterns/types.js";
import { ActionStatusSchema, DiffCategorySchema } from "../interaction-explorer/types.js";

/**
 * SiteSpec — Browser-observable website reconstruction IR (Task 13).
 *
 * Everything Task 06–12 learned about a site arrives here as a pile of run
 * directories that only make sense together. This layer answers one question:
 *
 *   > what is the SMALLEST self-contained, implementation-neutral description a
 *   > renderer needs in order to rebuild what was observed?
 *
 * The result is deliberately NOT any of the things it could easily have become:
 *
 *   not an HTML dump          — `rendered.html` is an input, never an output
 *   not a React/Vue model     — no component, no props, no hook appears here
 *   not a Tailwind/CSS model  — computed style only, never a class name
 *   not a Next.js model       — no route file, no framework convention
 *
 * A future renderer that is not React may consume this file unchanged. That is
 * the whole point of the layer, and it is why every field below is phrased in
 * browser vocabulary (element, text node, computed style, asset, viewport)
 * rather than in framework vocabulary.
 *
 * **Offline deterministic processing.** No Firecrawl, no Playwright, no browser,
 * no network request, no AI. The only inputs are files Tasks 06–12 already
 * wrote, and they are treated as immutable: this stage only ADDS a new run
 * directory under `data/<host>/site-specs/`.
 *
 * Data levels, unchanged from the rest of the pipeline:
 *  - `observed` : anything read verbatim out of an earlier artifact — element
 *                 attributes, geometry, computed styles, asset URLs, verified
 *                 URLs, transition before/after values, observation timestamps.
 *  - `derived`  : everything computed here — node ids, content trees, style/asset
 *                 catalogs, route coverage, family arithmetic, interaction joins.
 *  - `inferred` : AI output ONLY, opt-in via `--ai-analysis`, and it never leaves
 *                 its own `inferredInteractions[]` namespace.
 *
 * Determinism is a hard requirement (item 9): the artifact body contains no
 * `generatedAt`, no wall clock, no random id. Two compiles of the same input are
 * byte-identical. Timestamps that ARE present are observation facts copied from
 * the source run, never the compiler's own clock.
 */

/**
 * Bumped when any persisted SiteSpec shape changes.
 *
 * v2 (Task 13.1): `ElementSpecNode.recoveredAttributeNames`, three supplemental
 * counters on `ContentRecovery` and three on `SiteSpecStats`, one new relation
 * type, and a renamed table limitation code.
 *
 * v3 (Task 16): `ElementSpecNode.scrollState` (A2), `CompiledTarget.dynamicTemplate`
 * (the bounded after-state subtree of a mounted interaction target), and the
 * counters that account for both. Every addition is an OPTIONAL field.
 *
 * v4 (Task 17.1): `CompiledObservedTarget.mountHostNodeId` / `mountChildIndex`
 * (the resolved static host a mounted region attaches to), `containsTrigger`
 * (the region is an ancestor of its own trigger, so its contents must not be
 * replaced at runtime), and `captureExpanded`. Every addition is OPTIONAL.
 *
 * v5 (Task 28.6, Lane W2): `ViewportPageSpec.authoredBreakpoints` — the
 * viewport breakpoints this viewport's authored `@media` conditions name,
 * folded into a weighted whole-pixel histogram. OPTIONAL, like every addition
 * since v2, so every v2–v4 document on disk is a valid v5 one.
 *
 * WHY THIS BUMPS despite being purely additive. The rule this constant states
 * is "bumped when any persisted SiteSpec shape changes", and v3 and v4 were
 * both optional-only additions that bumped. But the specific reason here is
 * that an ABSENT `authoredBreakpoints` is ambiguous without the version: under
 * v4 it means "compiled before this field existed", under v5 it means "this
 * viewport carried no authored declaration at all AND nothing was truncated
 * away" (a viewport whose every node was truncated to zero declarations gets a
 * record, not an absence — see {@link AuthoredBreakpointsSchema}). Those are
 * opposite facts —
 * one is a gap in the tooling, the other a fact about the page — and a consumer
 * that snaps responsive band edges to this histogram must be able to tell them
 * apart. Not bumping would make the field's own absence a silent ambiguity,
 * which is the failure mode the field exists to remove. The cost is nil:
 * {@link READABLE_SCHEMA_VERSIONS} keeps 2–4, so nothing on disk is invalidated,
 * and every downstream version gate either derives from that list
 * (`SUPPORTED_SITESPEC_SCHEMA_VERSIONS`) or compares a SiteSpec against the
 * version its own manifest recorded (`recon-template` lineage), never against a
 * hard-coded 4.
 *
 * v6 (Task 28.6, Lane CORE / C2): `PageSpec.layoutProbeMobile` — the
 * MOBILE-context multi-width layout probe's attachment status, and with it the
 * `probe` arrays on the MOBILE viewport's element nodes. The Observer has been
 * writing `layout-probe-mobile.json` on every page since 28.6 W1.4 (1.2 MB on
 * one hobbang.net page, 852 elements x 8 widths) and NOTHING downstream read
 * it: `compilePage()` read `observation.layoutProbe` alone, so the mobile probe
 * never crossed this boundary and the mobile subtree carried no width evidence
 * at all.
 *
 * WHY THIS BUMPS, by the same argument v5 used. An absent `layoutProbeMobile`
 * is ambiguous without the version: under v5 it means "compiled before the
 * field existed", under v6 it means "the observation carried no mobile probe,
 * or the probe did not align to this page's mobile element walk". A consumer
 * that infers mobile layout rules must be able to tell "this page has no mobile
 * width evidence" from "this compiler could not carry any", because the first
 * is a fact about the page and the second is a gap in the tooling. As with v5
 * the addition is OPTIONAL and {@link READABLE_SCHEMA_VERSIONS} keeps 2-5, so
 * nothing on disk is invalidated.
 */
/*
 * NOT BUMPED by Task 28.7 §27, which added `PageSpec.layoutProbe.fingerprints`
 * and `PageSpec.layoutProbeMobile.fingerprints` — the per-width DOM-FAMILY
 * FINGERPRINT the layout probe now takes at every width it already visits.
 *
 * The rule this constant states is "bumped when any persisted SiteSpec shape
 * changes", and v3-v6 were all optional-only additions that bumped, so the
 * exception has to earn itself. The v5 and v6 arguments were both the SAME
 * argument: an absent field meant two OPPOSITE things either side of the bump —
 * "this compiler could not carry it" versus "this page genuinely has none" — and
 * a consumer had to act differently on each.
 *
 * That argument does not hold here, and the difference is not cosmetic. Both v5
 * and v6 carried something the OBSERVATION already had on disk and the compiler
 * had been throwing away, so the two readings could both be true of the same
 * artifact. The fingerprint exists in NO observation written before §27, so an
 * absent `fingerprints` has exactly one cause under either version — the run
 * that produced it did not measure one — and the only consumer
 * (`tree-switch.ts`) behaves identically under both readings: no fingerprint
 * evidence, fall back to the geometry ranking. A version bump that cannot change
 * any consumer's behaviour buys nothing, and it would invalidate the repo check
 * that deliberately pins this value.
 *
 * If a later task makes the fingerprint's absence mean something a consumer must
 * act on, that task bumps.
 */
export const SCHEMA_VERSION = 6 as const;

/**
 * SiteSpec shapes this codebase can still READ (Task 16, item 105).
 *
 * The four Task 13.1 SiteSpecs on disk are v2 and item 26 forbids rewriting
 * them, so Task 14's generator and Task 15's QA must keep working against them
 * unchanged. Every v3 addition is optional, so a v2 document is a valid v3 one
 * that observed no scroll container and captured no dynamic subtree.
 *
 * Producers ALWAYS write {@link SCHEMA_VERSION}; only the reader is permissive.
 */
export const READABLE_SCHEMA_VERSIONS = [2, 3, 4, 5, 6] as const;

export const ReadableSchemaVersionSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

/**
 * The IR CONTRACT version, bumped independently of the schema (a renderer needs
 * to ask "which SiteSpec semantics is this?" without diffing field lists).
 *
 * Deliberately still 1 after Task 13.1. The supplemental attribute recovery adds
 * FIELDS and widens where `attributes` may come from, but it does not change
 * what any of them MEAN to a renderer: `attributes` is still a flat map of
 * declarative HTML attributes to render, and nothing a v1 consumer relied on
 * moved or changed sign. A v1 renderer run against a v2 SiteSpec produces a more
 * accurate page, not a wrong one, so pinning it out would be a false alarm.
 *
 * Still 1 after Task 16, by the same test. `scrollState` and `dynamicTemplate`
 * are new OPTIONAL fields that a v1 renderer ignores; ignoring them costs it the
 * accuracy Task 16 added and costs it nothing it previously had. No existing
 * field moved, changed units, or changed meaning.
 */
export const SITESPEC_VERSION = 1 as const;

/**
 * Bumped when the compiler's own behavior changes without a schema change.
 * v2 (Task 13.1): the aligned rendered-HTML channel now also supplies a closed
 * allowlist of declarative attributes.
 * v3 (Task 16): scroll state propagation + dynamic target template compilation.
 */
export const COMPILER_VERSION = 3 as const;

/** Recorded in artifacts so a reader can tell what produced them. */
export const COMPILER_ENGINE = "offline-deterministic";

/** Fixed file names inside a SiteSpec run directory. */
export const SITE_SPEC_FILE = "site-spec.json";
export const STYLE_CATALOG_FILE = "style-catalog.json";
export const ASSET_CATALOG_FILE = "asset-catalog.json";
export const INTERACTION_SPEC_FILE = "interaction-spec.json";
export const PAGES_DIR = "pages";

// ---------------------------------------------------------------------------
// Limitations (a closed vocabulary, never free text)
// ---------------------------------------------------------------------------

/**
 * Every honesty statement this IR can make, as a CODE.
 *
 * Free-text limitations would be unreviewable and undiffable: two compiles of
 * the same input could disagree by a comma, and a consumer could not branch on
 * them. Codes can be counted, asserted in a fixture, and rendered for a human
 * from {@link LIMITATION_MESSAGES} — which is itself embedded (filtered to the
 * codes actually used) in `site-spec.json`, so the artifact explains itself
 * without this source file.
 *
 * Task 12's own free-text pattern limitations are NOT folded in here; they are
 * preserved verbatim in `CompiledPattern.sourceLimitations` so nothing an
 * earlier layer said is lost or paraphrased.
 */
export const LimitationCodeSchema = z.enum([
  // --- route / family coverage ---
  "route-not-deeply-observed",
  "route-render-source-missing",
  "route-behavior-family-represented",
  "route-behavior-not-explored",
  "family-representative-not-observed",
  // --- page / interaction coverage ---
  "page-interactions-not-explored",
  // --- content recovery ---
  "mixed-content-order-not-recovered",
  "text-may-be-truncated",
  "content-recovery-fallback",
  "supplemental-attributes-not-recovered",
  "attribute-value-may-be-truncated",
  // --- observation boundaries carried forward ---
  "frame-content-not-observed",
  "shadow-content-not-observed",
  "svg-subtree-opaque",
  "table-cell-attributes-not-recovered",
  "pseudo-element-limited-style-set",
  // --- deliberate compilation exclusions ---
  "javascript-href-removed",
  "sensitive-input-value-not-compiled",
  "form-action-not-compiled",
  "source-html-id-not-identity",
  // --- interaction joins ---
  "dynamic-target-not-in-static-dom",
  "dynamic-target-content-bounded-capture",
  "dynamic-target-content-not-captured",
  "declared-target-not-in-static-dom",
  "interaction-target-not-declared",
  "trigger-node-unresolved",
  "observed-target-not-in-static-dom",
  "observed-target-content-not-captured",
  "observed-target-contains-trigger",
  // --- site-level scope statements ---
  "breakpoints-not-inferred",
  "cross-viewport-node-matching-not-performed",
  "original-stylesheet-source-not-compiled",
  "original-script-source-not-compiled",
  "assets-not-downloaded",
]);
export type LimitationCode = z.infer<typeof LimitationCodeSchema>;

/** Fixed order, so every `limitations[]` array sorts the same way everywhere. */
export const LIMITATION_ORDER: readonly LimitationCode[] =
  LimitationCodeSchema.options;

/** One human sentence per code. Embedded (filtered) into `site-spec.json`. */
export const LIMITATION_MESSAGES: Readonly<Record<LimitationCode, string>> = {
  "route-not-deeply-observed":
    "Exact route was not deeply observed; reconstruction uses the family representative.",
  "route-render-source-missing":
    "No page of this route's family was successfully deep-observed, so no reconstruction source exists for it.",
  "route-behavior-family-represented":
    "No interaction was explored on this exact URL; behavior evidence belongs to the family representative page and is not verified here.",
  "route-behavior-not-explored":
    "This route was deep-observed but no interaction exploration ran on it, so no behavior is claimed.",
  "family-representative-not-observed":
    "This family's representative URL has no successful deep observation.",
  "page-interactions-not-explored":
    "Task 11 did not explore this page, so the absence of patterns is a gap in coverage rather than a finding.",
  "mixed-content-order-not-recovered":
    "Element/text child ordering could not be recovered; text is attached as a single leading text node.",
  "text-may-be-truncated":
    "Text comes from the Observer's normalized 200-character direct-text field and may be cut short.",
  "content-recovery-fallback":
    "rendered.html did not align with dom.json for this viewport, so the content tree was built from dom.json alone.",
  "supplemental-attributes-not-recovered":
    "rendered.html did not align for this viewport, so no declarative attribute outside the Observer's whitelist could be recovered; attributes come from dom.json alone.",
  "attribute-value-may-be-truncated":
    "At least one attribute value is exactly at the Observer's 500-character cap and may be cut short.",
  "frame-content-not-observed":
    "iframe documents were never entered; only the frame inventory is preserved.",
  "shadow-content-not-observed":
    "Open shadow roots were inventoried but their contents were never observed.",
  "svg-subtree-opaque":
    "Inline SVG is preserved as opaque asset markup; its internal elements are not part of the node tree.",
  "table-cell-attributes-not-recovered":
    "This table's colspan / rowspan / scope could not be recovered: they are outside the Observer's attribute whitelist, and this viewport's rendered.html did not align, so the supplemental channel was unavailable.",
  "pseudo-element-limited-style-set":
    "Pseudo-element styles use the Observer's smaller pseudo whitelist, not the full element style set.",
  "javascript-href-removed":
    "A javascript: href was dropped — it is script source, not a reconstruction attribute.",
  "sensitive-input-value-not-compiled":
    "password / hidden / file input values are never carried into reconstruction data.",
  "form-action-not-compiled":
    "The source form declared an action endpoint; it is recorded as a boolean only, so a reconstruction cannot write to the original backend.",
  "source-html-id-not-identity":
    "sourceHtmlId is a source hint. The original id may be generated per render and is not an identity a renderer must reuse.",
  "dynamic-target-not-in-static-dom":
    "The controlled region was mounted by the interaction and did not exist in the observed static DOM; its structure was never observed.",
  "dynamic-target-content-bounded-capture":
    "The mounted region's contents were captured after one observed action, under fixed element/depth/text caps; they describe that one instance and not the region's behavior in general.",
  "dynamic-target-content-not-captured":
    "The region was mounted by the interaction but no bounded content capture is available for it, so a reconstruction can only mount it empty.",
  "declared-target-not-in-static-dom":
    "The trigger declares a target that is absent from the observed static DOM, and no mount was observed either.",
  "interaction-target-not-declared":
    "The trigger declares no controlled region, so no target node can be named.",
  "trigger-node-unresolved":
    "The source element behind this interaction is not present in the compiled static tree.",
  "observed-target-not-in-static-dom":
    "A user-visible target region was discovered live but could not be matched to any node of the compiled static tree by html id or exact structural path.",
  "observed-target-content-not-captured":
    "A user-visible target region was discovered live but its bounded after-state capture is unavailable, so a reconstruction can only reveal or mount it without observed contents.",
  "observed-target-contains-trigger":
    "The discovered region contains its own trigger element; replacing its children at runtime would destroy the live trigger mid-interaction, so the observed content swap inside it is not replayed.",
  "breakpoints-not-inferred":
    "Only the two observed viewport endpoints exist; no responsive breakpoint was inferred.",
  "cross-viewport-node-matching-not-performed":
    "Desktop and mobile trees are independent observations; no node is claimed to be the same element across viewports.",
  "original-stylesheet-source-not-compiled":
    "Original stylesheet source is never copied; the IR carries browser-computed style only.",
  "original-script-source-not-compiled":
    "Original JavaScript, inline handlers, bundles and serialized state are never copied.",
  "assets-not-downloaded":
    "Assets are references. No image, font, video or icon binary was downloaded.",
};

/** Deterministic sort + dedup for any limitation list. */
export function sortLimitations(
  codes: Iterable<LimitationCode>,
): LimitationCode[] {
  const set = new Set(codes);
  return LIMITATION_ORDER.filter((code) => set.has(code));
}

// ---------------------------------------------------------------------------
// Attribute policy (items 36–40)
// ---------------------------------------------------------------------------

/**
 * Named attributes carried into reconstruction data, in addition to EVERY
 * `aria-*` attribute (which is always kept — it is the accessibility contract of
 * the page, and it is what the interaction layer joins on).
 *
 * What is missing is the point:
 *  - `class` / `style`  — computed style is in the style catalog; source class
 *                         names are a framework artifact, not browser semantics.
 *  - `id`               — kept separately as `sourceHtmlId`, a hint, never identity.
 *  - `src` / `srcset` / `sizes` / `poster` — expressed as asset references.
 *  - every `data-*`     — arbitrary, framework-specific, and frequently a payload.
 *  - every `on*`        — script source. The Observer never recorded them either.
 *
 * `colspan` / `rowspan` / `scope` are absent here for a different reason: the
 * Observer's whitelist never captured them, so `dom.json` has nothing to
 * compile. Since Task 13.1 they arrive through the SECOND channel instead —
 * see {@link SUPPLEMENTAL_ATTRIBUTES}.
 */
export const SAFE_ATTRIBUTES: readonly string[] = [
  "role",
  "alt",
  "title",
  "href",
  "target",
  "rel",
  "name",
  "type",
  "placeholder",
  "value",
  "for",
  "lang",
  "dir",
  "tabindex",
  "width",
  "height",
  "loading",
  "controls",
  "draggable",
];

/** Input types whose `value` is never compiled, whatever the source held. */
export const SENSITIVE_VALUE_INPUT_TYPES: readonly string[] = [
  "password",
  "hidden",
  "file",
];

// ---------------------------------------------------------------------------
// Supplemental attribute recovery (Task 13.1)
// ---------------------------------------------------------------------------

/**
 * How a recovered attribute's VALUE is to be understood.
 *
 *  - `boolean`     : an HTML boolean attribute. `disabled`, `disabled=""` and
 *                    `disabled="disabled"` are the same fact — presence — so the
 *                    value is normalized to `""` and nothing else is claimed.
 *  - `enumerated`  : the value names a state (`contenteditable="plaintext-only"`,
 *                    `popover="manual"`, `hidden="until-found"`). Preserved
 *                    verbatim: normalizing it would change the page.
 *  - `value`       : the value IS the data (`colspan="2"`, `min="1"`). Verbatim.
 */
export type SupplementalAttributeKind = "boolean" | "enumerated" | "value";

/**
 * The CLOSED allowlist of declarative attributes recovered from an ALIGNED
 * `rendered.html` (Task 13.1, items 6, 9, 10).
 *
 * Task 03/04's `ATTR_WHITELIST` was written for observation, and observation is
 * not reconstruction: the Observer never stored `colspan`, `open`, `disabled`,
 * `checked` or `selected`, so a clone built from the Task 13 IR rendered every
 * table cell one column wide, every `<details>` closed and every `<option>`
 * unselected. Task 13 already proved that each viewport's `rendered.html`
 * reproduces `dom.json` exactly (104/104), and that same verified alignment is
 * what licenses reading these — and ONLY these — out of the parse tree.
 *
 * Three rules make this a bounded supplement rather than a second source of
 * truth:
 *
 *  1. It is a closed list. Nothing outside it is even harvested from the parse
 *     tree, so `class`, `style`, `data-*`, `on*`, `action`, `formaction`,
 *     `method`, `enctype`, `nonce`, `integrity`, `src` and every input `value`
 *     are unreachable by construction, not by a later filter.
 *  2. It is DISJOINT from what the Observer records ({@link ATTR_WHITELIST}) —
 *     asserted below at module load. Every name here is a genuine gap, and
 *     `dom.json` can therefore never be overwritten by this channel.
 *  3. It only applies where `contentRecovery.status === "aligned"`. A fallback
 *     viewport recovers nothing and says so.
 *
 * What is recovered is the page's SERIALIZED DECLARATIVE STATE, which is not the
 * same thing as its live DOM property state (item 16): a script that set
 * `el.checked = true` without touching the attribute leaves no trace in
 * `rendered.html`, and this IR does not pretend otherwise.
 */
export const SUPPLEMENTAL_ATTRIBUTES: Readonly<
  Record<string, SupplementalAttributeKind>
> = {
  // --- table semantics: without these a table is structurally wrong ---------
  colspan: "value",
  rowspan: "value",
  scope: "enumerated",

  // --- native state / operability: the initial state of a real control ------
  open: "boolean",
  hidden: "enumerated", // `until-found` is a distinct state; never collapsed
  disabled: "boolean",
  readonly: "boolean",
  checked: "boolean",
  selected: "boolean",
  multiple: "boolean",
  required: "boolean",
  autofocus: "boolean",
  inert: "boolean",

  // --- editable / form semantics -------------------------------------------
  contenteditable: "enumerated",
  spellcheck: "enumerated",
  autocomplete: "enumerated",
  min: "value",
  max: "value",
  step: "value",
  minlength: "value",
  maxlength: "value",
  pattern: "value",
  accept: "value",

  // --- list numbering: these change what the reader SEES --------------------
  start: "value",
  reversed: "boolean",

  // --- machine-readable content --------------------------------------------
  datetime: "value",

  // --- native popover -------------------------------------------------------
  popover: "enumerated",
  popovertarget: "value",
  popovertargetaction: "enumerated",
};

/** Sorted allowlist names, for deterministic reporting and membership tests. */
export const SUPPLEMENTAL_ATTRIBUTE_NAMES: readonly string[] =
  Object.keys(SUPPLEMENTAL_ATTRIBUTES).sort();

/**
 * Names and prefixes that may NEVER appear in the allowlist above.
 *
 * The allowlist alone already excludes them — it is closed — but a denylist that
 * is CHECKED makes a careless future addition unshippable rather than merely
 * unreviewed. `assertSupplementalAttributePolicy()` runs at module load, so a
 * pull request that adds `formaction` here fails at import, not in production.
 */
export const SUPPLEMENTAL_DENYLIST: readonly string[] = [
  "class",
  "style",
  "id",
  "value",
  "src",
  "srcset",
  "sizes",
  "poster",
  "srcdoc",
  "href",
  "action",
  "formaction",
  "method",
  "formmethod",
  "enctype",
  "formenctype",
  "target",
  "formtarget",
  "nonce",
  "integrity",
  "crossorigin",
  "ping",
  "referrerpolicy",
  "http-equiv",
  "content",
  "charset",
  "async",
  "defer",
  "nomodule",
];

/** Prefixes no supplemental attribute may carry. */
export const SUPPLEMENTAL_DENIED_PREFIXES: readonly string[] = [
  "data-",
  "on",
  "aria-", // already in dom.json, and never a "gap"
  "xlink:",
  "xmlns",
];

/**
 * Fail at import if the allowlist ever drifts out of policy (item 7).
 *
 * Four properties, each of which a reviewer would otherwise have to re-derive by
 * hand: lowercase names, no denied name, no denied prefix, and no overlap with
 * what the Observer already records.
 */
export function assertSupplementalAttributePolicy(
  allowlist: Readonly<
    Record<string, SupplementalAttributeKind>
  > = SUPPLEMENTAL_ATTRIBUTES,
): void {
  const denied = new Set(SUPPLEMENTAL_DENYLIST);
  const observed = new Set<string>(ATTR_WHITELIST);
  const problems: string[] = [];

  for (const name of Object.keys(allowlist).sort()) {
    if (name !== name.toLowerCase() || name.trim() !== name) {
      problems.push(`${name} is not a normalized lowercase attribute name`);
    }
    if (denied.has(name)) {
      problems.push(`${name} is on the supplemental denylist and must never be recovered`);
    }
    for (const prefix of SUPPLEMENTAL_DENIED_PREFIXES) {
      if (name.startsWith(prefix)) {
        problems.push(`${name} starts with the denied prefix "${prefix}"`);
      }
    }
    if (observed.has(name)) {
      problems.push(
        `${name} is already in the Observer's ATTR_WHITELIST — the supplemental channel exists only for attributes dom.json cannot supply`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `supplemental attribute policy violated:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

assertSupplementalAttributePolicy();

/** Attribute values carrying IDREF(s) that become node relations (item 41). */
export const RELATION_ATTRIBUTES: readonly string[] = [
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-owns",
  "for",
  // Task 13.1: recovered from the aligned parse tree, not from dom.json.
  "popovertarget",
];

export const NodeRelationTypeSchema = z.enum([
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-owns",
  "label-for",
  "href-fragment",
  /** `popovertarget` → the popover it opens (Task 13.1, item 18). */
  "popover-target",
]);
export type NodeRelationType = z.infer<typeof NodeRelationTypeSchema>;

export const NODE_RELATION_ORDER: readonly NodeRelationType[] =
  NodeRelationTypeSchema.options;

/**
 * One resolved (or deliberately unresolved) reference between two nodes of the
 * SAME viewport tree (item 42). A desktop id never resolves to a mobile node —
 * the two trees are separate observations and are compiled separately.
 */
export const NodeRelationSchema = z.object({
  type: NodeRelationTypeSchema,
  /** The author's value as written (`menu1`, `#section-2`). */
  sourceValue: z.string(),
  resolved: z.boolean(),
  /** Present only when `resolved`. */
  resolvedNodeId: z.string().optional(),
});
export type NodeRelation = z.infer<typeof NodeRelationSchema>;

// ---------------------------------------------------------------------------
// Nodes (items 30–35)
// ---------------------------------------------------------------------------

/**
 * A text node, preserved with its RAW parsed value (item 32).
 *
 * Raw rather than normalized because whitespace is sometimes the design: `<pre>`,
 * `white-space: pre-wrap`, and inline layout where `</a> <a>` renders a space
 * that `</a><a>` does not. A normalized copy is offered next to it for
 * diagnostics, never as the value a renderer should emit.
 */
export const TextSpecNodeSchema = z.object({
  nodeId: z.string(),
  type: z.literal("text"),
  parentNodeId: z.string(),
  /** Exactly what the parser saw. This is what a renderer must reproduce. */
  value: z.string(),
  /** Whitespace-collapsed form. DIAGNOSTIC ONLY — never the reconstruction value. */
  normalizedValue: z.string().optional(),
});
export type TextSpecNode = z.infer<typeof TextSpecNodeSchema>;

/** A renderable `::before` / `::after`, carried through to the style catalog. */
export const PseudoSpecSchema = z.object({
  content: z.string().optional(),
  styleTokenId: z.string(),
});
export type PseudoSpec = z.infer<typeof PseudoSpecSchema>;

export const NodePseudoSchema = z.object({
  before: PseudoSpecSchema.optional(),
  after: PseudoSpecSchema.optional(),
});
export type NodePseudo = z.infer<typeof NodePseudoSchema>;

/**
 * One element of the reconstruction tree.
 *
 * `nodeId` is SiteSpec identity; `sourceElementId` is the Observer's `e000123`
 * and exists purely as a provenance / interaction join key (items 33, 34). They
 * are separate fields on purpose: the Observer's numbering is an index into one
 * saved `dom.json` and shifts whenever the page gains an element, so it must
 * never become the identity a renderer builds on.
 */
export const ElementSpecNodeSchema = z.object({
  nodeId: z.string(),
  type: z.literal("element"),
  /** Observer element id, viewport-local. Provenance + interaction join key. */
  sourceElementId: z.string(),
  parentNodeId: z.string().optional(),
  /** Document child order, elements and text nodes interleaved (item 31). */
  childNodeIds: z.array(z.string()),

  tagName: z.string(),
  /**
   * Safe reconstruction attributes only: {@link SAFE_ATTRIBUTES} plus `aria-*`
   * from `dom.json`, and — where the viewport aligned —
   * {@link SUPPLEMENTAL_ATTRIBUTES} from the parsed `rendered.html`.
   */
  attributes: z.record(z.string(), z.string()),
  /**
   * Which of `attributes` came from the supplemental rendered-HTML channel
   * rather than from `dom.json` (Task 13.1, item 11). Sorted; present ONLY on
   * nodes that actually recovered something, so the common node pays nothing.
   */
  recoveredAttributeNames: z.array(z.string()).optional(),
  /** The `role` attribute's first token, lifted out for convenience. */
  role: z.string().optional(),
  /** The original HTML `id` — a SOURCE HINT, never identity (item 40). */
  sourceHtmlId: z.string().optional(),

  localVisible: z.boolean(),
  effectiveVisible: z.boolean(),
  boundingBox: BoundingBoxSchema.optional(),
  /**
   * The observed scroll offsets of a real scroll container (Task 16, A2).
   *
   * This travels with `boundingBox` because it is the missing half of it: a
   * descendant's rect was measured AT this offset, so a renderer that restores
   * the box model but not the offset reproduces every coordinate in the subtree
   * wrongly by exactly `scrollTop` — which is the 19,739px Task 15 measured on
   * MDN. Present only where the Observer found a scroller; never on `<html>` or
   * `<body>` (item 21).
   */
  scrollState: ScrollStateSchema.optional(),

  /** Reference into the SiteSpec-global style catalog. */
  styleTokenId: z.string().optional(),
  pseudo: NodePseudoSchema.optional(),

  /**
   * Task 17 §7 — layout-critical AUTHORED declarations the browser matched to
   * this element, carried verbatim from the Observer. Evidence for layout-rule
   * inference; never merged into the exact-computed style catalog.
   */
  authoredLayout: z.array(MatchedLayoutRuleSchema).optional(),
  authoredLayoutTruncated: z.boolean().optional(),
  /**
   * Responsive Core P0 §C1.7 — the observer's cascade-aware cap counters
   * (`layoutRulesMatched` / `layoutRulesKept`), carried verbatim.
   */
  authoredLayoutMatched: z.number().int().nonnegative().optional(),
  authoredLayoutKept: z.number().int().nonnegative().optional(),
  /**
   * Responsive Core P0 §C1.7 — the element's RUNTIME inline style at the truth
   * width, carried verbatim from the observation. The `style` ATTRIBUTE is
   * still never an entry of `attributes`.
   */
  inlineStyle: InlineStyleSchema.optional(),
  /**
   * Responsive Core P0 §C1.4 — where each inline declaration came from
   * (initial document vs runtime, and whether it varies across probe widths).
   * Present exactly when `inlineStyle` has declarations.
   */
  inlineStyleProvenance: InlineStyleProvenanceSchema.optional(),
  /**
   * Task 17 §8 — this node's box at each of the page's `layoutProbe.widths`
   * (x / width / visible, index-aligned). Present only on the desktop tree of
   * a page whose probe aligned exactly.
   */
  probe: z
    .object({
      x: z.array(z.number()),
      w: z.array(z.number()),
      v: z.array(z.union([z.literal(0), z.literal(1)])),
      /**
       * Responsive Core P0 §C1.7 — per width, the index into the owning probe
       * summary's `inlineStyleTable` (-1 = no `style` attribute / disconnected).
       * Present only when the probe carried `s` for every width.
       */
      s: z.array(z.number().int().min(-1)).optional(),
    })
    .optional(),

  /** Global asset ids observed ON this element (item 53). */
  assetRefs: z.array(z.string()),
  /** Viewport-local, resolved where possible (items 41, 42). */
  relations: z.array(NodeRelationSchema),

  /**
   * Diagnostic only: the source `<form>` declared an action endpoint. The URL
   * itself is never compiled, so a reconstruction cannot post to it (item 38).
   */
  sourceHasFormAction: z.boolean().optional(),

  limitations: z.array(LimitationCodeSchema),
});
export type ElementSpecNode = z.infer<typeof ElementSpecNodeSchema>;

export const SpecNodeSchema = z.discriminatedUnion("type", [
  ElementSpecNodeSchema,
  TextSpecNodeSchema,
]);
export type SpecNode = z.infer<typeof SpecNodeSchema>;

// ---------------------------------------------------------------------------
// Content recovery (items 24–29)
// ---------------------------------------------------------------------------

/**
 * Whether the rendered-HTML channel could be used for this viewport.
 *
 *  - `aligned`  : the re-parsed `rendered.html` reproduced dom.json's element
 *                 sequence and parent relation exactly, so real text nodes and
 *                 real mixed-content ordering are in the tree.
 *  - `fallback` : it did not, and NOTHING was fuzzy-matched. The tree is built
 *                 from dom.json alone, with the two honest limitations attached.
 */
export const ContentRecoveryStatusSchema = z.enum(["aligned", "fallback"]);
export type ContentRecoveryStatus = z.infer<typeof ContentRecoveryStatusSchema>;

/** Why an alignment attempt failed. Recorded — never silently swallowed (item 29). */
export const AlignmentFailureSchema = z.enum([
  "no-document-element",
  "element-count-mismatch",
  "tag-sequence-mismatch",
  "parent-relation-mismatch",
  "parse-error",
  "rendered-html-unreadable",
]);
export type AlignmentFailure = z.infer<typeof AlignmentFailureSchema>;

export const ContentRecoverySchema = z.object({
  status: ContentRecoveryStatusSchema,
  /** `rendered-html` when aligned, `dom-json` when not. */
  source: z.enum(["rendered-html", "dom-json"]),
  /** Elements the aligned parse produced (absent when the parse itself failed). */
  parsedElementCount: z.number().int().nonnegative().optional(),
  /** Elements dom.json holds — the number the parse had to match. */
  sourceElementCount: z.number().int().nonnegative(),
  failure: AlignmentFailureSchema.optional(),
  /** 0-based index of the first disagreeing element, when there was one. */
  mismatchIndex: z.number().int().nonnegative().optional(),
  /** `parsed=<tag> source=<tag>` — small and deterministic, never a DOM dump. */
  mismatchDetail: z.string().optional(),

  textNodeCount: z.number().int().nonnegative(),
  /** Elements whose stored dom.json text sat exactly on the 200-char cap. */
  cappedSourceTextCount: z.number().int().nonnegative(),
  /** …of those, how many now carry their full text (item 80's whole point). */
  recoveredLongTextCount: z.number().int().nonnegative(),
  /** Longest single text node value in this viewport, in characters. */
  longestTextLength: z.number().int().nonnegative(),

  // --- supplemental attribute recovery (Task 13.1, item 12) ------------------
  /** Attribute instances recovered from the aligned parse tree. 0 on fallback. */
  supplementalAttributeCount: z.number().int().nonnegative(),
  /** Element nodes that recovered at least one. 0 on fallback. */
  supplementalElementCount: z.number().int().nonnegative(),
  /** Which allowlist names were actually recovered here, sorted. */
  supplementalAttributeNames: z.array(z.string()),
});
export type ContentRecovery = z.infer<typeof ContentRecoverySchema>;

// ---------------------------------------------------------------------------
// Frames / shadow inventory (items 55, 56)
// ---------------------------------------------------------------------------

export const FrameSpecSchema = z.object({
  nodeId: z.string(),
  sourceElementId: z.string(),
  src: z.string().optional(),
  resolvedUrl: z.string().optional(),
  sameOrigin: z.boolean().optional(),
  /** Whether the frame document was reachable at observation time. */
  accessible: z.boolean(),
  title: z.string().optional(),
  limitations: z.array(LimitationCodeSchema),
});
export type FrameSpec = z.infer<typeof FrameSpecSchema>;

export const ShadowInventorySpecSchema = z.object({
  openShadowRootCount: z.number().int().nonnegative(),
  /** SiteSpec node ids of the hosts, sorted. */
  hostNodeIds: z.array(z.string()),
  limitations: z.array(LimitationCodeSchema),
});
export type ShadowInventorySpec = z.infer<typeof ShadowInventorySpecSchema>;

// ---------------------------------------------------------------------------
// Viewport + page (items 21–23)
// ---------------------------------------------------------------------------

export const DocumentDimensionsSchema = z.object({
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  documentWidth: z.number(),
  documentHeight: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
});
export type DocumentDimensions = z.infer<typeof DocumentDimensionsSchema>;

/**
 * ONE bucket of a viewport's authored breakpoint histogram: the whole CSS pixel
 * the source says the layout changes at, which side of the change it names, and
 * how many matched declarations named it.
 */
export const AuthoredBreakpointEntrySchema = z.object({
  /** Whole CSS pixel. `boundary.above` for a `min` bound, `boundary.below` for a `max`. */
  px: z.number().int(),
  /** `"min"` = the change begins at `px`; `"max"` = it ends at `px`. */
  kind: z.enum(["min", "max"]),
  /** Matched declarations that named this exact `(px, kind)` pair. */
  count: z.number().int().nonnegative(),
});
export type AuthoredBreakpointEntry = z.infer<typeof AuthoredBreakpointEntrySchema>;

/**
 * ONE AUTHORED CHANGE of a viewport's breakpoint histogram, keyed on the
 * boundary rather than on the pixel a bound happens to name.
 *
 * `entries` answers "what did the source write"; this answers "where does the
 * layout change". They differ by exactly the adjacency problem: `(max-width:
 * 1024px)` names the pixel 1024 from below and `(min-width: 1025px)` names the
 * pixel 1025 from above, so in `entries` they are TWO buckets one pixel apart
 * while the author wrote ONE change. Both spellings share the boundary
 * `{below: 1024, above: 1025}`, and here they share one row.
 *
 * This is the view a band-edge snapper should read. It is not hypothetical: the
 * observations on disk carry `(max-width: 899px)` beside `(min-width: 900px)`,
 * `(max-width: 599px)` beside `(min-width: 600px)`, and `(max-width: 1111px)`
 * beside `(min-width: 1112px)`.
 *
 * `below` may be `-1`, for a bound authored at 0px: the notional pixel before
 * the first real one. Clamping it to 0 would break `above === below + 1`, which
 * is the adjacency the fold depends on.
 */
export const AuthoredBreakpointBoundarySchema = z.object({
  /** Last whole pixel on the low side of the change. */
  below: z.number().int(),
  /** First whole pixel on the high side. Always `below + 1`. */
  above: z.number().int(),
  /** Weighted declarations naming this boundary from either side; `minCount + maxCount`. */
  count: z.number().int().nonnegative(),
  /** …spelled as a `min` bound (the change begins at `above`). */
  minCount: z.number().int().nonnegative(),
  /** …spelled as a `max` bound (the change ends at `below`). */
  maxCount: z.number().int().nonnegative(),
});
export type AuthoredBreakpointBoundary = z.infer<typeof AuthoredBreakpointBoundarySchema>;

/**
 * Task 28.6 W2 — WHERE THE SOURCE SAYS ITS LAYOUT CHANGES, for one viewport.
 *
 * Everything before this asked geometry where the layout changed. This asks the
 * stylesheet: every distinct authored `@media` condition matched to an element
 * of this viewport, weighted by how many declarations sit under it, folded into
 * whole-pixel snap targets. A responsive band edge placed on one of these
 * numbers is a number the author wrote; a band edge placed between them is a
 * guess.
 *
 * ABSENT ONLY WHEN THE VIEWPORT CARRIED NO AUTHORED DECLARATION AT ALL *AND*
 * NOTHING WAS TRUNCATED AWAY — usually cross-origin stylesheets the CSSOM
 * refused. Three distinct facts, three distinct shapes, none of them collapsed
 * into the others:
 *
 *  - absent                                    → nothing was read and nothing
 *                                                was truncated; the page's
 *                                                breakpoints are UNKNOWN.
 *  - `entries: []`, `declarationsExamined > 0`  → declarations were read and
 *                                                none of them was inside a
 *                                                usable screen `@media`.
 *  - `declarationsExamined === 0`,
 *    `truncatedNodeCount > 0`                   → every node's declaration list
 *                                                was truncated to nothing. The
 *                                                fold is empty because the
 *                                                INPUT was cut, not because the
 *                                                page authored nothing.
 *
 * The third case is why "absent means the observation recovered none" is not
 * the whole rule: it would make a fully-truncated viewport indistinguishable
 * from a viewport with no CSS.
 *
 * Every declaration examined is accounted for. `declarationsExamined` splits
 * into `mediaScopedDeclarations` + `unconditionalDeclarations` + (declarations
 * gated only by `@supports` / `@container`), and `mediaScopedDeclarations`
 * splits into `foldedDeclarations` + `containerGatedSkippedDeclarations`.
 * Nothing is dropped without a counter.
 */
export const AuthoredBreakpointsSchema = z.object({
  /** Sorted by `px` ascending, then `kind` ascending (`"max"` before `"min"`). */
  entries: z.array(AuthoredBreakpointEntrySchema),
  /**
   * The same fold keyed on the authored CHANGE, sorted by `below` ascending, so
   * the `max` spelling and the `min` spelling of one boundary are ONE row here
   * and two rows in `entries`. Read this to snap a band edge; read `entries` to
   * see what the stylesheet literally said.
   *
   * Optional: absent on a v5 record written before this view existed, where it
   * is UNKNOWN, not empty. A reader that finds it absent should fold `entries`
   * itself or say it could not.
   */
  boundaries: z.array(AuthoredBreakpointBoundarySchema).optional(),
  /**
   * Root font size assumed when converting an `em` / `rem` breakpoint. The
   * observation does not record the real one, so the assumption is carried
   * rather than hidden.
   */
  rootFontSizePx: z.number().positive(),

  /** Matched authored declarations looked at, across every node of this viewport. */
  declarationsExamined: z.number().int().nonnegative(),
  /**
   * Distinct `@media` conditions among them, counted on the parser's NORMALIZED
   * form: `(max-width: 640px)`, `(MAX-WIDTH: 640px)` and `(max-width:640px)` are
   * one condition, not three.
   */
  distinctConditions: z.number().int().nonnegative(),
  /**
   * Distinct RAW `@media` strings, before that normalization. Greater than
   * `distinctConditions` exactly when the source spells one breakpoint more than
   * one way, so the collapse is visible instead of silent. Optional: absent on a
   * v5 spec written before this counter existed, where it is unknown, NOT zero.
   */
  distinctRawConditions: z.number().int().nonnegative().optional(),
  /** Declarations that sat inside an `@media`. */
  mediaScopedDeclarations: z.number().int().nonnegative(),
  /** …of those, the ones actually weighted into `entries`. */
  foldedDeclarations: z.number().int().nonnegative(),
  /**
   * Declarations with NO `@media`, NO `@supports` and NO `@container`. The
   * only ones that genuinely always apply. Pre-28.6 collectors mislabelled
   * gated declarations as unconditional; this counter cannot be read that way.
   */
  unconditionalDeclarations: z.number().int().nonnegative(),

  /** Declarations inside an `@container` (viewport-irrelevant by construction). */
  containerScopedDeclarations: z.number().int().nonnegative(),
  /** Declarations inside an `@supports` (a feature gate, not a size gate). */
  supportsScopedDeclarations: z.number().int().nonnegative(),
  /** Declarations inside an `@layer` (cascade order only; never affects applicability). */
  layerScopedDeclarations: z.number().int().nonnegative(),
  /**
   * `@media` declarations EXCLUDED from the histogram because they also sit
   * inside an `@container`: their change width follows an element box, not the
   * window, so their media value is not a viewport band edge.
   */
  containerGatedSkippedDeclarations: z.number().int().nonnegative(),
  /**
   * Declarations whose sheet text was recovered from the network rather than
   * read from the CSSOM. Same declarations, weaker provenance.
   */
  fetchedOriginDeclarations: z.number().int().nonnegative(),
  /** Nodes whose authored-declaration list was truncated: the fold is incomplete by that much. */
  truncatedNodeCount: z.number().int().nonnegative(),

  /** Conditions (weighted) that contributed at least one entry. */
  widthDeclarations: z.number().int().nonnegative(),
  /** Conditions (weighted) that parsed cleanly and named no screen breakpoint. */
  widthIrrelevantDeclarations: z.number().int().nonnegative(),
  /** Conditions (weighted) whose meaning could not be represented (`not`, `or`, `calc()`, …). */
  unsupportedDeclarations: z.number().int().nonnegative(),
  /**
   * Conditions (weighted) that could not be read at all. The honesty gate: a
   * non-zero value here means this histogram is INCOMPLETE, not that the page
   * authored fewer breakpoints.
   */
  unparsedDeclarations: z.number().int().nonnegative(),
  /** Informational: conditions (weighted) that were comma-separated disjunctions. */
  disjunctionDeclarations: z.number().int().nonnegative(),
  /** Informational: conditions (weighted) contributing a deprecated `device-width` bound. */
  deviceWidthDeclarations: z.number().int().nonnegative(),
  /** Alternatives (weighted) skipped because their media type is not screen-applicable. */
  nonScreenSkippedDeclarations: z.number().int().nonnegative(),
  /** Alternatives (weighted) skipped because no width can satisfy them. */
  emptyIntervalSkippedDeclarations: z.number().int().nonnegative(),

  /** The distinct condition strings that could not be read. Sorted; never capped. */
  unparsedConditions: z.array(z.string()),
  /** The distinct condition strings understood in shape but not representable. Sorted; never capped. */
  unsupportedConditions: z.array(z.string()),
});
export type AuthoredBreakpoints = z.infer<typeof AuthoredBreakpointsSchema>;

/**
 * ONE viewport of one page — a complete, independent reconstruction unit.
 *
 * Desktop and mobile are never merged and never matched (items 22, 70). A
 * renderer that wants a single responsive implementation performs that inference
 * itself; this IR only states what was observed at each endpoint.
 */
export const ViewportPageSpecSchema = z.object({
  /** The Task 05 profile as actually applied, copied verbatim. */
  profile: ViewportProfileSchema,
  documentDimensions: DocumentDimensionsSchema,
  contentRecovery: ContentRecoverySchema,

  /** Usually one (`<html>`), but the schema does not assume it. */
  rootNodeIds: z.array(z.string()),
  /** Flat, in document order. Parent/child links are by `nodeId`. */
  nodes: z.array(SpecNodeSchema),

  sourceElementCount: z.number().int().nonnegative(),
  elementNodeCount: z.number().int().nonnegative(),
  textNodeCount: z.number().int().nonnegative(),
  localVisibleCount: z.number().int().nonnegative(),
  effectiveVisibleCount: z.number().int().nonnegative(),
  /** Distinct global style tokens referenced from this viewport. */
  styleTokenCount: z.number().int().nonnegative(),
  /** Nodes carrying an observed `scrollState` (Task 16, A2). */
  scrollStateNodeCount: z.number().int().nonnegative().optional(),
  /** …of those, how many are at a non-zero offset and must be RESTORED. */
  scrolledNodeCount: z.number().int().nonnegative().optional(),
  /** Element nodes carrying at least one asset ref (Task 16, A1 accounting). */
  assetBoundNodeCount: z.number().int().nonnegative().optional(),

  /** Every global asset id referenced in this viewport, sorted. */
  assetRefs: z.array(z.string()),
  frameInventory: z.array(FrameSpecSchema),
  shadowInventory: ShadowInventorySpecSchema,

  /**
   * Task 28.5B §5 — the source `:root` CSS custom properties resolved AT THIS
   * VIEWPORT, carried verbatim from the observation.
   *
   * Per viewport and never merged: a media query may give `--brand` a different
   * value at 390 than at 1440, and both viewport subtrees coexist in one
   * generated document, so a single universal map would be a value the page
   * never had. Optional — historical SiteSpecs carry no such record.
   */
  customProperties: RootCustomPropertiesSchema.optional(),

  /**
   * Task 28.6 W2 — the viewport breakpoints this viewport's authored `@media`
   * conditions name, folded into a weighted whole-pixel histogram.
   *
   * Per viewport and never merged, for the same reason as everything else here
   * (items 22, 70): desktop and mobile are two independent observations, and a
   * merged histogram would be a set of breakpoints no single observed document
   * ever had. A consumer that wants one number line across both merges them
   * itself, knowingly.
   *
   * Optional: absent on every pre-v5 SiteSpec, and absent on a viewport whose
   * observation recovered no authored declaration at all AND had nothing
   * truncated. A viewport whose nodes were all truncated to zero declarations
   * carries a RECORD (with `declarationsExamined === 0` and a non-zero
   * `truncatedNodeCount`), never an absence — see
   * {@link AuthoredBreakpointsSchema} for the three-way split.
   */
  authoredBreakpoints: AuthoredBreakpointsSchema.optional(),

  /**
   * Responsive Core P0 §C1.7 — summary of this viewport's initial document
   * evidence (the file itself stays in the observation). Absent = the
   * observation predates the capture.
   */
  initialDocument: InitialDocumentSchema.pick({
    status: true,
    reason: true,
    bytes: true,
    sha256: true,
  }).optional(),
  /** Responsive Core P0 §C1.4 — inline-style provenance tallies for this viewport. */
  inlineStyleProvenanceCounts: InlineStyleProvenanceCountsSchema.optional(),
  /**
   * The observation's `viewports.<id>.stylesheetCoverage`, carried VERBATIM
   * (unreadable / unrecovered sheets, unresolved imports, rule-index cap,
   * skipped grouping rules, size-capped / body-unavailable sheets, cascade-cap
   * totals). A consumer proving a node has NO authored declaration needs it;
   * absent = the observation predates coverage (never read as complete).
   */
  stylesheetCoverage: StylesheetCoverageSchema.optional(),

  limitations: z.array(LimitationCodeSchema),
});
export type ViewportPageSpec = z.infer<typeof ViewportPageSpecSchema>;

/**
 * How much is known about this page's BEHAVIOR (item 65).
 *
 *  - `explored`     : Task 11 ran actions here and Task 12 modeled the results.
 *  - `not-explored` : nobody clicked anything on this page. The absence of
 *                     patterns is a coverage gap, not evidence of a static page.
 */
export const InteractionCoverageSchema = z.enum(["explored", "not-explored"]);
export type InteractionCoverage = z.infer<typeof InteractionCoverageSchema>;

export const PageDocumentMetadataSchema = z.object({
  requestedUrl: z.string(),
  finalUrl: z.string(),
  title: z.string(),
});
export type PageDocumentMetadata = z.infer<typeof PageDocumentMetadataSchema>;

/** One deep-observed page, persisted as `pages/<pageId>.json`. */
export const PageSpecSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  pageId: z.string(),
  url: z.string(),

  role: SitePageRoleSchema,
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,

  /** The Observer's own timestamp — an observed fact, not the compiler's clock. */
  observedAt: z.string().optional(),
  /**
   * Where this page was observed, for AUDIT ONLY. Nothing in the SiteSpec reads
   * it; `loadSiteSpec()` is forbidden from following it (item 73).
   */
  sourceObservation: z.string(),

  documentMetadata: PageDocumentMetadataSchema,

  viewports: z.object({
    desktop: ViewportPageSpecSchema,
    mobile: ViewportPageSpecSchema,
  }),

  interactionCoverage: InteractionCoverageSchema,
  /**
   * Task 17 §8 — multi-width layout probe status for this page. When
   * `aligned` is true the desktop tree's nodes carry per-width `probe`
   * arrays; when false (or absent) no probe data was attached and layout-rule
   * inference falls back to exact computed style.
   */
  layoutProbe: z
    .object({
      widths: z.array(z.number().int().positive()),
      /** True when the WHOLE walk matched the desktop tree tag-for-tag. */
      aligned: z.boolean(),
      /**
       * Elements covered by the longest common tag prefix. A trailing
       * third-party widget (cookie banner, chat) frequently renders
       * differently between the two loads; the prefix before the first
       * mismatch is still an exact match and carries probe data when it
       * covers at least 90% of both walks. Elements past it carry nothing.
       */
      alignedElementCount: z.number().int().nonnegative().optional(),
      elementCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
      /**
       * Task 28.75 §07 — HOW MUCH OF THIS VIEWPORT'S TREE CARRIES PROBE DATA.
       *
       * `alignedElementCount` has never had a denominator in the artifact, so
       * "311" read the same as "2,283": both are just numbers until you go and
       * count the viewport's nodes yourself. Nobody did, and a page sitting at
       * 13.5% coverage looked exactly like a healthy one for three waves.
       *
       * `nodeCount` is the viewport's element-node count; `alignmentRatio` is
       * `alignedElementCount / nodeCount` rounded to 4 places. A reader — or a
       * suite — can now see starvation without instrumenting anything.
       */
      nodeCount: z.number().int().nonnegative().optional(),
      alignmentRatio: z.number().optional(),
      /**
       * Task 28.7 §27 — the per-width DOM-FAMILY FINGERPRINT, index-aligned to
       * {@link widths}.
       *
       * NOT gated on `aligned` / `alignedElementCount`, and that is the point.
       * The `probe` arrays on the element nodes are a per-ELEMENT claim and are
       * refused whenever the probe's walk does not match this page's walk; the
       * fingerprint is a per-DOCUMENT census of what the width renders and is
       * true whether or not two page loads produced the same element order. A
       * page whose probe would not attach still gets width evidence from it.
       *
       * Present only when EVERY width carried one, so a consumer never has to
       * decide what a hole in the middle of the array means. Absent = the
       * observation predates §27 (or the probe was not read).
       */
      fingerprints: z.array(LayoutProbeFingerprintSchema).optional(),
      /**
       * Responsive Core P0 §C1.7 — the normalized `style` texts the element
       * nodes' `probe.s` arrays index (compacted to the entries they use).
       */
      inlineStyleTable: z.array(z.string()).optional(),
      /** Responsive Core P0 §C1.6 — observed family switches bisected to 1px. */
      familySwitchBisections: z.array(FamilySwitchBisectionSchema).optional(),
      familySwitchPairsSkipped: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /**
   * Task 28.6 C2 — the MOBILE-context multi-width layout probe for this page.
   *
   * A SEPARATE field from {@link layoutProbe} with a SEPARATE width list,
   * because the two probes walked two different trees. The mobile probe ran in
   * a mobile browser context and walked the tree that context rendered, so its
   * per-element arrays align to `viewports.mobile`'s element list and to
   * NOTHING ELSE. When `aligned` is true (or `alignedElementCount > 0`) the
   * MOBILE tree's nodes carry `probe` arrays indexed by THIS record's `widths`;
   * the desktop tree's `probe` arrays stay indexed by `layoutProbe.widths`.
   * A consumer that indexes one viewport's arrays with the other viewport's
   * widths corrupts every rule it derives, so the two never share a field.
   *
   * Absent under schemaVersion 6 means the observation carried no mobile probe
   * at all, or it could not be read. Absent under 2-5 means the compiler
   * predates the field. `alignedElementCount === 0` with the record present
   * means the probe was read and REFUSED: it walked a tree this page's mobile
   * element list does not match.
   */
  layoutProbeMobile: z
    .object({
      widths: z.array(z.number().int().positive()),
      /** True when the WHOLE walk matched the MOBILE tree tag-for-tag. */
      aligned: z.boolean(),
      /**
       * Elements covered by the longest common tag prefix, under the same 90%
       * rule the desktop probe uses. 0 means nothing was attached.
       */
      alignedElementCount: z.number().int().nonnegative().optional(),
      elementCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
      /**
       * Task 28.75 §07 — HOW MUCH OF THIS VIEWPORT'S TREE CARRIES PROBE DATA.
       *
       * `alignedElementCount` has never had a denominator in the artifact, so
       * "311" read the same as "2,283": both are just numbers until you go and
       * count the viewport's nodes yourself. Nobody did, and a page sitting at
       * 13.5% coverage looked exactly like a healthy one for three waves.
       *
       * `nodeCount` is the viewport's element-node count; `alignmentRatio` is
       * `alignedElementCount / nodeCount` rounded to 4 places. A reader — or a
       * suite — can now see starvation without instrumenting anything.
       */
      nodeCount: z.number().int().nonnegative().optional(),
      alignmentRatio: z.number().optional(),
      /**
       * The observation's own profile id for the context this probe ran in.
       * MUST be `"mobile"`; a probe whose context is anything else is refused
       * rather than attached, and the refusal is recorded in
       * {@link refusedReason}.
       */
      profileId: z.string().optional(),
      /**
       * Why nothing was attached, when nothing was. Absent when
       * `alignedElementCount > 0`. A refusal is an outcome a caller must be
       * able to read, never a silent absence.
       */
      refusedReason: z
        .enum([
          /** The probe walked a context that is not the mobile one. */
          "probe-context-not-mobile",
          /** The probe's tag walk does not match the mobile element walk. */
          "tag-walk-mismatch",
          /** The probe's own walk was truncated by the observer's cap. */
          "probe-truncated",
          /** The file named by the observation could not be read or parsed. */
          "probe-unreadable",
        ])
        .optional(),
      /**
       * Task 28.7 §27 — the per-width DOM-family fingerprint of the MOBILE
       * probe, index-aligned to this record's own {@link widths}.
       *
       * Carried even when the probe was REFUSED for attachment: a refusal is a
       * statement about element-order alignment between two page loads, and the
       * fingerprint makes no per-element claim. Present only when every width
       * carried one.
       */
      fingerprints: z.array(LayoutProbeFingerprintSchema).optional(),
      /**
       * Responsive Core P0 §C1.7 — the normalized `style` texts the element
       * nodes' `probe.s` arrays index (compacted to the entries they use).
       */
      inlineStyleTable: z.array(z.string()).optional(),
      /** Responsive Core P0 §C1.6 — observed family switches bisected to 1px. */
      familySwitchBisections: z.array(FamilySwitchBisectionSchema).optional(),
      familySwitchPairsSkipped: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** Confirmed pattern ids verified ON THIS PAGE, sorted. */
  patternIds: z.array(z.string()),
  unknownInteractionIds: z.array(z.string()),
  /** Present only when `--ai-analysis` was passed. Never mixed with the above. */
  inferredInteractionIds: z.array(z.string()).optional(),

  limitations: z.array(LimitationCodeSchema),
});
export type PageSpec = z.infer<typeof PageSpecSchema>;

// ---------------------------------------------------------------------------
// Style catalog (items 43–49)
// ---------------------------------------------------------------------------

/**
 * One deduplicated computed-style map, shared across the WHOLE site.
 *
 * Task 09's style tables are page + viewport local, so the same button style is
 * stored once per page per viewport. Here an exact canonical match collapses
 * them into one token regardless of page or viewport. Exact equality only —
 * there is no similarity threshold anywhere, because a threshold is per-site
 * tuning wearing a lab coat (item 44).
 *
 * The values are the browser's FINAL COMPUTED values. No Tailwind utility, no
 * class name, no `--primary-color` is invented from them (items 48, 49).
 */
export const StyleTokenSchema = z.object({
  styleTokenId: z.string(),
  /** Property → computed value, keys in sorted order. */
  properties: z.record(z.string(), z.string()),
  /** Element + pseudo references across every page and viewport. */
  usageCount: z.number().int().positive(),
});
export type StyleToken = z.infer<typeof StyleTokenSchema>;

/**
 * Frequency statistics offered as a DIAGNOSTIC (item 49): they name nothing.
 * There is no `primary-color`, no `spacing-md`, no `heading-xl` — the IR truth
 * is the exact computed style, and a semantic token is an inference this Task
 * does not make.
 */
export const StyleFrequencySchema = z.object({
  property: z.string(),
  value: z.string(),
  tokenCount: z.number().int().positive(),
});
export type StyleFrequency = z.infer<typeof StyleFrequencySchema>;

export const StyleCatalogSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  /** Distinct canonical style maps across the site. */
  tokenCount: z.number().int().nonnegative(),
  /** Every element/pseudo style reference before dedup. */
  sourceStyleReferenceCount: z.number().int().nonnegative(),
  /** Sum of every page+viewport local style table size (the Task 09 baseline). */
  sourceLocalStyleRecordCount: z.number().int().nonnegative(),
  /** `1 - tokenCount / sourceLocalStyleRecordCount`, 4 decimals. */
  dedupReductionRate: z.number(),

  /** Sorted by `styleTokenId`. */
  styles: z.array(StyleTokenSchema),

  /** Diagnostic only — top values by token count, for a few properties. */
  frequency: z.object({
    color: z.array(StyleFrequencySchema),
    backgroundColor: z.array(StyleFrequencySchema),
    fontFamily: z.array(StyleFrequencySchema),
    fontSize: z.array(StyleFrequencySchema),
  }),
});
export type StyleCatalog = z.infer<typeof StyleCatalogSchema>;

// ---------------------------------------------------------------------------
// Asset catalog (items 50–54)
// ---------------------------------------------------------------------------

/**
 * A referenced asset, deduplicated site-wide. This is a REFERENCE IR: no image,
 * font, video or icon binary is ever downloaded (item 52).
 *
 * `inline-svg` is the exception that proves the rule — it has no URL, so the
 * markup itself is the asset. It is UNTRUSTED page content, and it is sanitized
 * before storage: `<script>` elements, every `on*` handler attribute and every
 * `javascript:` URL are removed, and what was removed is recorded.
 */
export const AssetSpecSchema = z.object({
  assetId: z.string(),
  /** The Observer's asset `type`, carried through unchanged. */
  kind: z.string(),
  url: z.string().optional(),
  /** srcset candidate descriptor (`2x`, `640w`) — part of the identity. */
  descriptor: z.string().optional(),
  /** Extension-derived hint. A HINT: no request was made to confirm it. */
  mimeHint: z.string().optional(),
  /** Whether the URL shares the site root's origin. */
  sameOrigin: z.boolean().optional(),

  /** Declared attribute dimensions, when observed. */
  width: z.number().optional(),
  height: z.number().optional(),
  /** Intrinsic dimensions of a loaded `<img>`, when observed. */
  naturalWidth: z.number().optional(),
  naturalHeight: z.number().optional(),

  /** Present only for `inline-svg` — the sanitized markup. */
  inlineSvg: z
    .object({
      markup: z.string(),
      sanitized: z.boolean(),
      /** `script-element`, `event-handler-attribute`, `javascript-url`. */
      removed: z.array(z.string()),
    })
    .optional(),

  usageCount: z.number().int().positive(),
  /** Pages this asset was observed on, sorted. */
  sourcePageIds: z.array(z.string()),
});
export type AssetSpec = z.infer<typeof AssetSpecSchema>;

export const AssetCatalogSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  assetCount: z.number().int().nonnegative(),
  /** Asset records across every page and viewport, before dedup. */
  occurrenceCount: z.number().int().nonnegative(),
  /** Non-zero counts per `kind`, sorted by kind. */
  kindCounts: z.record(z.string(), z.number().int().nonnegative()),
  /** Sorted by `assetId`. */
  assets: z.array(AssetSpecSchema),
});
export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;

// ---------------------------------------------------------------------------
// Routes & families (items 12–19)
// ---------------------------------------------------------------------------

/**
 * How much DIRECT observation stands behind a route.
 *
 *  - `exact-observed`             : this exact URL was deep-observed, as its
 *                                   family's representative.
 *  - `validation-sample-observed` : this exact URL was deep-observed, as a
 *                                   validation sample (item 16).
 *  - `family-represented`         : this URL was NEVER observed. Reconstruction
 *                                   borrows the family representative's page,
 *                                   and says so (item 15).
 */
export const RouteCoverageSchema = z.enum([
  "exact-observed",
  "validation-sample-observed",
  "family-represented",
]);
export type RouteCoverage = z.infer<typeof RouteCoverageSchema>;

export const ROUTE_COVERAGE_ORDER: readonly RouteCoverage[] =
  RouteCoverageSchema.options;

/**
 * How much is known about a route's BEHAVIOR — deliberately a DIFFERENT axis
 * from {@link RouteCoverageSchema} (item 66).
 *
 * A family member is never told that the representative's verified patterns were
 * verified on IT. That would turn one observation into forty claims.
 */
export const RouteBehaviorCoverageSchema = z.enum([
  "exact-verified",
  "exact-not-explored",
  "family-represented-unverified",
  "none",
]);
export type RouteBehaviorCoverage = z.infer<typeof RouteBehaviorCoverageSchema>;

export const ROUTE_BEHAVIOR_COVERAGE_ORDER: readonly RouteBehaviorCoverage[] =
  RouteBehaviorCoverageSchema.options;

/** What Task 06 knew about the URL, kept small. */
export const RouteVerificationSummarySchema = z.object({
  httpStatus: z.number().int(),
  title: z.string().optional(),
  canonicalUrl: z.string().optional(),
});
export type RouteVerificationSummary = z.infer<
  typeof RouteVerificationSummarySchema
>;

/**
 * ONE verified URL. Every verified URL becomes exactly one route (item 13) —
 * including the ones nobody ever loaded twice — because a reconstruction that
 * silently drops 60% of a site's URLs is not a reconstruction.
 */
export const RouteSpecSchema = z.object({
  /** `r000001…`, assigned after a lexical sort of the URL (item 17). */
  routeId: z.string(),
  url: z.string(),
  pathname: z.string(),

  familyId: z.string(),
  coverage: RouteCoverageSchema,

  /** Present only when this exact URL has its own PageSpec. */
  pageId: z.string().optional(),
  /** The PageSpec a renderer should build this route from. */
  renderSourcePageId: z.string().optional(),
  /** Never inferred: true only when this exact URL was deep-observed. */
  observedOnThisExactUrl: z.boolean(),

  behaviorCoverage: RouteBehaviorCoverageSchema,
  /** Where this route's behavior evidence comes from, when any exists. */
  behaviorSourcePageId: z.string().optional(),

  verificationSummary: RouteVerificationSummarySchema.optional(),
  limitations: z.array(LimitationCodeSchema),
});
export type RouteSpec = z.infer<typeof RouteSpecSchema>;

/**
 * A page/template structural family, exactly as Task 07/08 defined it.
 *
 * NOT a component (item 19). There is no `componentId` here and there will not
 * be one: a family is "these URLs looked structurally alike to deterministic
 * signals", which is a statement about routes, not about a React tree.
 */
export const FamilySpecSchema = z.object({
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,

  representativeUrl: z.string(),
  /** Absent when the representative's observation failed. */
  representativePageId: z.string().optional(),
  /** Every observed page of this family (representative + samples), sorted. */
  observedVariantPageIds: z.array(z.string()),

  /** Sorted member URLs — the full family, not just the observed ones. */
  memberUrls: z.array(z.string()),
  memberCount: z.number().int().positive(),
  exactObservedMemberCount: z.number().int().nonnegative(),
  representedOnlyMemberCount: z.number().int().nonnegative(),

  localePrefix: z.string().optional(),
  routeScope: z.string().optional(),
  inferredRoutePattern: z.string().optional(),
  /** Task 08's readable coarse-signal trace, carried through verbatim. */
  selectionEvidence: z.string().optional(),

  limitations: z.array(LimitationCodeSchema),
});
export type FamilySpec = z.infer<typeof FamilySpecSchema>;

// ---------------------------------------------------------------------------
// Interaction spec (items 57–67)
// ---------------------------------------------------------------------------

/** What happened to a controlled region across the verified transition. */
export const TargetTransitionSchema = z.enum([
  "mounted",
  "unmounted",
  "visibility-changed",
  "attribute-changed",
  "none",
]);
export type TargetTransition = z.infer<typeof TargetTransitionSchema>;

/**
 * The controlled region of a verified pattern.
 *
 * `staticNodeResolved: false` + `dynamic: true` is a NORMAL, expected outcome
 * (items 59, 60): a menu that is mounted on first click genuinely was not in the
 * observed static DOM, and the honest IR says so instead of inventing a subtree.
 * A renderer reading this knows it has to create one — and knows that nothing
 * observed tells it what is inside.
 */
/**
 * One node of a dynamic target's OBSERVED after-state subtree (Task 16, item 75).
 *
 * A deliberately separate node type from {@link ElementSpecNode}, not a reuse of
 * it, because the two carry different guarantees. A `SpecNode` is part of the
 * page's INITIAL DOM: it has a `sourceElementId` in a saved `dom.json`, a
 * `boundingBox` measured in that same pass, and a place in `rootNodeIds`. A
 * template node is a bounded capture of what one region looked like AFTER one
 * click at one moment — `provenance: observed`, `state: after-action` — and it
 * must never be walkable from the page tree or countable as page content
 * (item 73). Keeping the shapes apart makes that structural instead of a rule
 * someone has to remember.
 */
export const DynamicTemplateNodeSchema = z.object({
  /** Template-local, `t000001…`. Not a page node id and never resolvable as one. */
  templateNodeId: z.string(),
  parentTemplateNodeId: z.string().optional(),
  tagName: z.string(),
  /** Same safe-attribute policy as the page tree: no class, style, data-*, on*. */
  attributes: z.record(z.string(), z.string()),
  role: z.string().optional(),
  /**
   * Task 26 — the captured element's own HTML id, carried the same way the
   * page tree carries it (evidence, never re-emitted as a DOM id). It lets a
   * renderer identify WHICH mounted template node a declared relation named
   * (a framework-portal panel inside its host's capture). Additive-optional.
   */
  sourceHtmlId: z.string().optional(),
  /** Direct text children, in document order, interleaved with `childNodeIds`. */
  childTemplateNodeIds: z.array(z.string()),
  /** Present on text nodes; `tagName` is `#text` for those. */
  text: z.string().optional(),
  effectiveVisible: z.boolean(),
  styleTokenId: z.string().optional(),
  pseudo: z.lazy(() => NodePseudoSchema).optional(),
  assetRefs: z.array(z.string()),
});
export type DynamicTemplateNode = z.infer<typeof DynamicTemplateNodeSchema>;

/** Why a bounded dynamic-target capture stopped short of the whole region. */
export const DynamicTemplateTruncationSchema = z.enum([
  "element-cap",
  "depth-cap",
  "text-cap",
]);
export type DynamicTemplateTruncation = z.infer<
  typeof DynamicTemplateTruncationSchema
>;

/**
 * The bounded after-state contents of a target the interaction MOUNTED.
 *
 * Task 15 measured the gap this closes: nextjs.org's nine verified menus each
 * mount a region with real children, and the clone mounted an empty one, so all
 * nine were `dynamic-target-content-unobserved` — a mismatch the pipeline could
 * name but not fix, because nothing had ever looked inside.
 *
 * What this is NOT (items 79, 80): a claim about the site's data, its search
 * results, or what the region contains on any other click. It is one observed
 * instance, and `provenance`/`state` say so in the artifact.
 */
export const DynamicTemplateSchema = z.object({
  provenance: z.literal("observed"),
  state: z.literal("after-action"),
  /** The action that produced it, for audit. */
  actionId: z.string().optional(),
  rootTemplateNodeIds: z.array(z.string()),
  nodes: z.array(DynamicTemplateNodeSchema),
  elementNodeCount: z.number().int().nonnegative(),
  textNodeCount: z.number().int().nonnegative(),
  /** Non-empty when a cap stopped the walk; the region is partial and says so. */
  truncations: z.array(DynamicTemplateTruncationSchema),
});
export type DynamicTemplate = z.infer<typeof DynamicTemplateSchema>;

export const CompiledTargetSchema = z.object({
  relation: ControlRelationTypeSchema,
  /** The author's declared id, when the relation carries one. */
  targetSourceHtmlId: z.string().optional(),
  staticNodeResolved: z.boolean(),
  targetNodeId: z.string().optional(),
  /** True when the region appeared only as a result of the interaction. */
  dynamic: z.boolean(),

  observedTag: z.string().optional(),
  observedRole: z.string().optional(),
  transition: TargetTransitionSchema,
  existedBefore: z.boolean(),
  existsAfter: z.boolean(),
  /** Interactive descendants counted inside the region after the action. */
  descendantsSummary: z
    .object({ interactiveDescendantsAfter: z.number().int().nonnegative() })
    .optional(),
  /**
   * The bounded observed contents of a MOUNTED region (Task 16). Present only
   * when the explorer actually captured a subtree; a target with no template
   * keeps the Task 14 empty-mount behavior exactly (item 76).
   */
  dynamicTemplate: DynamicTemplateSchema.optional(),
});
export type CompiledTarget = z.infer<typeof CompiledTargetSchema>;

/**
 * One user-visible target region of a verified pattern (Task 17 §4/§5).
 *
 * Where {@link CompiledTargetSchema} carries what the trigger DECLARES, this
 * carries what the user actually SAW change — discovered live from
 * before/after DOM evidence, so a mega-menu that declares nothing is still
 * here. Everything observed; the only derivation is the static-node join.
 */
export const CompiledObservedTargetSchema = z.object({
  /** Explorer discovery id (`dt000001…`), rank order within the action. */
  discoveryId: z.string(),
  kind: z.enum([
    "existing-visibility",
    "existing-with-mounted-content",
    "content-replaced",
    "newly-mounted",
  ]),
  direction: z.enum(["appeared", "disappeared", "content-changed"]),

  observedTag: z.string(),
  observedRole: z.string().optional(),
  targetSourceHtmlId: z.string().optional(),
  /** Element-child index path over the Observer's tree shape (`0/1/3/0`). */
  structuralPath: z.string(),
  relationEvidence: z.array(
    z.object({ kind: z.string(), detail: z.string().optional() }),
  ),

  staticNodeResolved: z.boolean(),
  targetNodeId: z.string().optional(),
  resolutionMethod: z.enum(["html-id", "structural-path"]).optional(),

  /**
   * Task 17.1 — for a newly-mounted region: the STATIC node of the nearest
   * pre-click ancestor it attached under (resolved from the explorer's
   * baseline-coordinate host path), and the mounted branch's element-child
   * position inside it. The clone mounts the observed copy there instead of
   * guessing a position next to the trigger.
   */
  mountHostNodeId: z.string().optional(),
  mountChildIndex: z.number().int().nonnegative().optional(),
  /**
   * Task 17.1 — the region CONTAINS its own trigger (stripe's mobile nav host):
   * replacing its children at runtime would destroy the live trigger mid-click,
   * so the renderer must not mount into it. Recorded as evidence, named as a
   * limitation where it suppresses content replay.
   */
  containsTrigger: z.boolean().optional(),
  /** Task 17.1 — the capture behind `dynamicTemplate` used the expanded caps. */
  captureExpanded: z.boolean().optional(),

  /** User-visible state of the region right BEFORE the verified action. */
  closedState: z.object({
    exists: z.boolean(),
    visible: z.boolean().optional(),
    display: z.string().optional(),
  }),
  /** User-visible state of the region right AFTER the verified action. */
  openState: z.object({
    exists: z.boolean(),
    visible: z.boolean().optional(),
    display: z.string().optional(),
    visibility: z.string().optional(),
    opacity: z.string().optional(),
    hidden: z.boolean().optional(),
    ariaHidden: z.string().optional(),
    boundingBox: BoundingBoxSchema.optional(),
  }),

  /** Elements inside the region that were mounted by the action itself. */
  mountedDescendantCount: z.number().int().nonnegative(),
  /** Content fingerprint: normalized text sample (capped) + full length. */
  textSample: z.string().optional(),
  textLength: z.number().int().nonnegative(),

  /** Bounded observed after-state contents, when the explorer captured them. */
  dynamicTemplate: DynamicTemplateSchema.optional(),

  /**
   * Open-state style graft for an `existing-visibility` region (Task 17 §5).
   *
   * The region's contents already live in the static tree — but their computed
   * styles were observed CLOSED, and a site that hides a menu on an inner
   * wrapper (visibility/opacity/height, not the root) collapses to a 0-height
   * reveal. The explorer's bounded open-state capture walks the SAME region, so
   * its elements align to static nodes by recursive tag/order pairing, and each
   * aligned descendant records its open-state style token beside its closed
   * one. A renderer emits the DIFFERING declarations at reveal specificity —
   * observed values only, nothing invented.
   */
  openStyleOverrides: z
    .array(
      z.object({
        nodeId: z.string(),
        closedStyleTokenId: z.string().optional(),
        openStyleTokenId: z.string(),
      }),
    )
    .optional(),

  limitations: z.array(LimitationCodeSchema),
  provenance: z.literal("observed"),
});
export type CompiledObservedTarget = z.infer<typeof CompiledObservedTargetSchema>;

/** Where a compiled behavior came from — audit only, never a runtime read. */
export const InteractionProvenanceSchema = z.object({
  level: z.enum(["derived", "inferred"]),
  ruleId: z.string().optional(),
  ruleVersion: z.number().int().positive().optional(),
  registryVersion: z.number().int().positive().optional(),
  actionId: z.string().optional(),
  explorationRun: z.string().optional(),
  observationFile: z.string().optional(),
});
export type InteractionProvenance = z.infer<typeof InteractionProvenanceSchema>;

/**
 * A Task 12 confirmed pattern, joined onto the compiled static tree.
 *
 * `triggerNodeId` is REQUIRED: a behavior whose trigger cannot be pointed at is
 * unusable to a renderer, so an unresolvable trigger fails the compile rather
 * than being stored as an orphan (item 59).
 */
export const CompiledPatternSchema = z.object({
  patternId: z.string(),
  patternType: PatternTypeSchema,
  subtype: z.string().optional(),
  mechanism: PatternMechanismSchema,

  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,

  triggerNodeId: z.string(),
  triggerSourceElementId: z.string(),
  trigger: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    /** The Observer's normalized direct text — identity, never a match rule. */
    text: z.string().optional(),
  }),

  transition: z.object({
    direction: TransitionDirectionSchema.optional(),
    field: z.string(),
    before: z.string(),
    after: z.string(),
  }),

  target: CompiledTargetSchema.optional(),

  /**
   * Task 17 §4/§5 — the regions the user actually saw change, joined to the
   * static tree where possible. Absent on pre-Task-17 SiteSpecs.
   */
  observedTargets: z.array(CompiledObservedTargetSchema).optional(),

  /** Task 12's own free-text limitations, preserved verbatim. */
  sourceLimitations: z.array(z.string()),
  limitations: z.array(LimitationCodeSchema),
  provenance: InteractionProvenanceSchema,
});
export type CompiledPattern = z.infer<typeof CompiledPatternSchema>;

/**
 * A Task 12 unknown case, carried through UNCHANGED (items 61, 62).
 *
 * Nothing here is upgraded. An `unmatched-transition` stays an
 * `unmatched-transition`, and the compiler is forbidden from reading a trigger's
 * `aria-label` and deciding it was a menu after all — that would replace an
 * honest gap with a guess, which is exactly what the whole pipeline is built to
 * avoid.
 */
export const CompiledUnknownInteractionSchema = z.object({
  unknownId: z.string(),
  reason: UnknownReasonSchema,
  /** Task 11's own action status, preserved next to the reason. */
  status: ActionStatusSchema,

  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,

  /** Absent when the source element is not in the compiled tree. */
  triggerNodeId: z.string().optional(),
  triggerSourceElementId: z.string(),
  trigger: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    label: z.string().optional(),
  }),

  diffCategories: z.array(DiffCategorySchema),
  mutationCategories: z.array(z.string()),
  partialPatternHints: z.array(PartialPatternHintSchema),

  aiEligibility: AiEligibilitySchema,
  aiEligibilityReason: z.string(),
  preferredProbeState: z.string().optional(),

  navigation: z
    .object({
      urlBefore: z.string(),
      urlAfter: z.string(),
      sameDocumentNavigation: z.boolean(),
    })
    .optional(),

  limitations: z.array(LimitationCodeSchema),
  provenance: InteractionProvenanceSchema,
});
export type CompiledUnknownInteraction = z.infer<
  typeof CompiledUnknownInteractionSchema
>;

/**
 * An AI proposal — `--ai-analysis` only, and it lives here and nowhere else
 * (items 63, 64). It is never merged into `patterns[]`, and `provenance.level`
 * is `inferred` so no consumer can mistake it for evidence.
 */
export const CompiledInferenceSchema = z.object({
  inferenceId: z.string(),
  /** The unknown case this analysis was about. */
  unknownId: z.string(),
  provider: z.string(),
  status: z.enum(["analyzed", "unavailable", "error"]),

  pageId: z.string().optional(),
  viewport: ViewportProfileSchema.shape.id.optional(),

  proposedPatternType: z.string().optional(),
  proposedSubtype: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().optional(),
  uncertainty: z.array(z.string()),
  suggestedNextProbe: z.string().optional(),

  provenance: InteractionProvenanceSchema,
});
export type CompiledInference = z.infer<typeof CompiledInferenceSchema>;

/** The registry rule that produced a pattern — so the IR can be argued with. */
export const CompiledRuleSchema = z.object({
  ruleId: z.string(),
  patternType: PatternTypeSchema,
  version: z.number().int().positive(),
  description: z.string(),
  requiredEvidence: z.array(z.string()),
  /** How many compiled patterns this rule is responsible for. */
  compiledPatternCount: z.number().int().nonnegative(),
});
export type CompiledRule = z.infer<typeof CompiledRuleSchema>;

export const InteractionSummarySchema = z.object({
  verifiedPatternCount: z.number().int().nonnegative(),
  unknownInteractionCount: z.number().int().nonnegative(),
  inferredInteractionCount: z.number().int().nonnegative(),

  /** Non-zero counts in Task 12 vocabulary order. */
  patternTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
  mechanismCounts: z.record(z.string(), z.number().int().nonnegative()),
  unknownReasonCounts: z.record(z.string(), z.number().int().nonnegative()),

  patternsWithStaticTrigger: z.number().int().nonnegative(),
  patternsWithStaticTarget: z.number().int().nonnegative(),
  patternsWithDynamicTarget: z.number().int().nonnegative(),
  /** …of those, how many carry an observed content template (Task 16). */
  patternsWithDynamicTargetContent: z.number().int().nonnegative().optional(),
  /** Template nodes across every dynamic target in this SiteSpec (Task 16). */
  dynamicTemplateNodeCount: z.number().int().nonnegative().optional(),
  patternsWithoutTarget: z.number().int().nonnegative(),
  /**
   * Task 17 §4/§5 accounting. Optional so pre-Task-17 SiteSpecs stay valid;
   * always written by this compiler version.
   */
  patternsWithObservedTargets: z.number().int().nonnegative().optional(),
  observedTargetCount: z.number().int().nonnegative().optional(),
  observedTargetsResolved: z.number().int().nonnegative().optional(),
  observedTargetsWithTemplate: z.number().int().nonnegative().optional(),

  pagesExplored: z.number().int().nonnegative(),
  pagesNotExplored: z.number().int().nonnegative(),

  routesWithExactBehaviorEvidence: z.number().int().nonnegative(),
  routesWithRepresentedBehavior: z.number().int().nonnegative(),
  routesWithoutBehaviorEvidence: z.number().int().nonnegative(),
});
export type InteractionSummary = z.infer<typeof InteractionSummarySchema>;

export const InteractionSpecSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  /** Task 12's registry version, so a reader knows which ruleset decided this. */
  registryVersion: z.number().int().positive(),

  summary: InteractionSummarySchema,
  /** Sorted by `patternId`. */
  patterns: z.array(CompiledPatternSchema),
  /** Sorted by `unknownId`. */
  unknownInteractions: z.array(CompiledUnknownInteractionSchema),
  /** Empty unless `--ai-analysis` was passed. */
  inferredInteractions: z.array(CompiledInferenceSchema),
  /** Sorted by `ruleId`. */
  rules: z.array(CompiledRuleSchema),
});
export type InteractionSpec = z.infer<typeof InteractionSpecSchema>;

// ---------------------------------------------------------------------------
// Responsive model (items 68–71)
// ---------------------------------------------------------------------------

/**
 * What is actually known about responsiveness: two observed endpoints and
 * nothing between them (item 68).
 *
 * `inferredBreakpoints` exists and is ALWAYS empty here. A `768px` this Task
 * never measured would be indistinguishable from one it did, so the field is
 * kept as a place for a later renderer's own inference to live — clearly labeled
 * as that renderer's claim, not this IR's observation (item 69).
 */
export const ResponsiveModelSchema = z.object({
  mode: z.literal("observed-endpoints"),
  observedViewports: z.array(ViewportProfileSchema),
  inferredBreakpoints: z.array(z.number()),
  limitations: z.array(LimitationCodeSchema),
});
export type ResponsiveModel = z.infer<typeof ResponsiveModelSchema>;

/** Per-page desktop/mobile figures. Numbers only — no node correspondence. */
export const ResponsiveDifferenceSchema = z.object({
  pageId: z.string(),
  desktopElementNodes: z.number().int().nonnegative(),
  mobileElementNodes: z.number().int().nonnegative(),
  desktopTextNodes: z.number().int().nonnegative(),
  mobileTextNodes: z.number().int().nonnegative(),
  desktopEffectiveVisible: z.number().int().nonnegative(),
  mobileEffectiveVisible: z.number().int().nonnegative(),
  desktopDocumentHeight: z.number(),
  mobileDocumentHeight: z.number(),
});
export type ResponsiveDifference = z.infer<typeof ResponsiveDifferenceSchema>;

// ---------------------------------------------------------------------------
// Top-level SiteSpec (item 8)
// ---------------------------------------------------------------------------

/**
 * Where the data came from. AUDIT ONLY.
 *
 * These are the paths of the pipeline runs this SiteSpec was compiled from, in
 * the caller's own form. Recording them is allowed; DEPENDING on them is not —
 * `loadSiteSpec()` never opens any of them (items 11, 73). A SiteSpec whose
 * source runs were deleted is still a complete reconstruction input.
 */
export const SiteSpecSourceSchema = z.object({
  verifiedUrls: z.string(),
  verification: z.string(),
  pageFamilies: z.string(),
  selectedPages: z.string(),
  siteObservation: z.string(),
  interactionExploration: z.string(),
  interactionPatterns: z.string(),
  unknownInteractions: z.string(),
  aiAnalysis: z.string().optional(),
});
export type SiteSpecSource = z.infer<typeof SiteSpecSourceSchema>;

export const SiteSpecStatsSchema = z.object({
  routeCount: z.number().int().nonnegative(),
  familyCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),

  exactObservedRouteCount: z.number().int().nonnegative(),
  validationSampleRouteCount: z.number().int().nonnegative(),
  familyRepresentedRouteCount: z.number().int().nonnegative(),
  /** `(exact + validation) / routeCount`, 4 decimals. NOT route coverage. */
  exactObservationRate: z.number(),

  representativePageCount: z.number().int().nonnegative(),
  validationPageCount: z.number().int().nonnegative(),

  desktopElementNodeCount: z.number().int().nonnegative(),
  mobileElementNodeCount: z.number().int().nonnegative(),
  desktopTextNodeCount: z.number().int().nonnegative(),
  mobileTextNodeCount: z.number().int().nonnegative(),
  effectiveVisibleElementCount: z.number().int().nonnegative(),
  hiddenElementCount: z.number().int().nonnegative(),

  viewportCount: z.number().int().nonnegative(),
  alignedViewportCount: z.number().int().nonnegative(),
  fallbackViewportCount: z.number().int().nonnegative(),
  cappedSourceTextCount: z.number().int().nonnegative(),
  recoveredLongTextCount: z.number().int().nonnegative(),

  /** Attribute instances recovered from aligned rendered.html (Task 13.1). */
  supplementalAttributeCount: z.number().int().nonnegative(),
  /** Element nodes carrying at least one recovered attribute. */
  supplementalElementCount: z.number().int().nonnegative(),
  /** Per-name recovery counts, non-zero only, keys sorted. */
  supplementalAttributeNameCounts: z.record(
    z.string(),
    z.number().int().nonnegative(),
  ),

  styleTokenCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  shadowHostCount: z.number().int().nonnegative(),
});
export type SiteSpecStats = z.infer<typeof SiteSpecStatsSchema>;

/**
 * The provenance ledger (item 100). Three numbers and two booleans that answer
 * "how much of this file is something somebody SAW?" without reading the file.
 */
export const ProvenanceSummarySchema = z.object({
  /** Facts read verbatim out of an earlier artifact. */
  observedFactCount: z.number().int().nonnegative(),
  /** Facts this compiler computed deterministically from observed ones. */
  derivedFactCount: z.number().int().nonnegative(),
  /** AI proposals. Zero unless `--ai-analysis` was explicitly passed. */
  inferredFactCount: z.number().int().nonnegative(),
  hasAiInference: z.boolean(),
  verifiedPatternCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
});
export type ProvenanceSummary = z.infer<typeof ProvenanceSummarySchema>;

/**
 * `site-spec.json` — the entry point a reconstruction engine reads.
 *
 * Together with the sibling files it names, this is the COMPLETE reconstruction
 * input (item 10). Task 14 opens no Task 09 `dom.json`, no Task 11 action file
 * and no Task 12 pattern file; if something in those was needed, it is here.
 */
export const SiteSpecSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  siteSpecVersion: z.literal(SITESPEC_VERSION),
  compilerVersion: z.number().int().positive(),
  engine: z.string(),

  rootUrl: z.string(),
  /** Audit-only provenance. Never read at reconstruction time (item 11). */
  source: SiteSpecSourceSchema,

  responsiveModel: ResponsiveModelSchema,
  stats: SiteSpecStatsSchema,
  provenanceSummary: ProvenanceSummarySchema,

  /** Sorted by `routeId`. Exactly one entry per verified URL (item 13). */
  routes: z.array(RouteSpecSchema),
  /** Sorted by `familyId`. */
  families: z.array(FamilySpecSchema),
  /** Sorted by `pageId`; each names its own file inside this directory. */
  pages: z.array(
    z.object({
      pageId: z.string(),
      url: z.string(),
      role: SitePageRoleSchema,
      familyId: z.string(),
      /** Relative to the SiteSpec root, e.g. `pages/p000001.json`. */
      file: z.string(),
      interactionCoverage: InteractionCoverageSchema,
      desktopElementNodes: z.number().int().nonnegative(),
      mobileElementNodes: z.number().int().nonnegative(),
    }),
  ),

  /** Diagnostic desktop/mobile figures. No node correspondence is claimed. */
  responsiveDifferences: z.array(ResponsiveDifferenceSchema),

  /** All relative, all inside this directory (item 74). */
  styleCatalogFile: z.string(),
  assetCatalogFile: z.string(),
  interactionSpecFile: z.string(),

  /** Site-wide honesty statements. */
  limitations: z.array(LimitationCodeSchema),
  /** Only the codes actually used anywhere in this SiteSpec, sorted. */
  limitationGlossary: z.record(z.string(), z.string()),
});
export type SiteSpec = z.infer<typeof SiteSpecSchema>;

// ---------------------------------------------------------------------------
// Id helpers (deterministic, zero-padded, never random)
// ---------------------------------------------------------------------------

export function routeId(index: number): string {
  return `r${String(index).padStart(6, "0")}`;
}
export function nodeId(index: number): string {
  return `n${String(index).padStart(6, "0")}`;
}
export function styleTokenId(index: number): string {
  return `st${String(index).padStart(6, "0")}`;
}
export function assetId(index: number): string {
  return `a${String(index).padStart(6, "0")}`;
}
