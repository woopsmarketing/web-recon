import { z } from "zod";
import {
  AssetObservationSchema,
  BoundingBoxSchema,
  ElementObservationSchema,
  StyleTableSchema,
  ViewportProfileSchema,
} from "../observer/types.js";
import {
  ControlRelationTypeSchema,
  GuardFlagSchema,
  InteractionCapabilitySchema,
  InteractionPrioritySchema,
  type GuardFlag,
  type InteractionCapability,
  type InteractionEvidenceType,
  type InteractionPriority,
} from "../interaction-detector/types.js";
import { SitePageRoleSchema } from "../multi-observer/types.js";
import { PageFamilyTypeSchema } from "../selector/types.js";

/**
 * Safe Rule-Based Interaction Exploration types & schemas (Task 11).
 *
 * Task 10 answered "what is there evidence for interacting with?" from stored
 * files. This layer answers the next question, and only that one:
 *
 *   > when this candidate is safely re-found in a LIVE page and clicked,
 *   > what observable state transition happens?
 *
 * It deliberately does NOT name a pattern. `aria-expanded false→true` plus
 * `target hidden→visible` is recorded as exactly that — never as "accordion".
 * Mapping verified transitions onto a pattern registry is Task 12.
 *
 * Two halves, kept strictly apart:
 *
 *   OFFLINE  interaction-analysis.json + interaction-candidates.json + dom.json
 *            → eligibility → shape dedup → budget → interaction-plan.json
 *            deterministic, browser-free, timestamp-free
 *
 *   LIVE     plan → fresh BrowserContext per action → re-identify → reconcile
 *            → before → click → after → diff → InteractionObservation
 *
 * The plan is the contract between them: the same input always produces the same
 * plan, so "why was this clicked and that one not?" is answerable without a
 * browser.
 *
 * Data levels (unchanged from Task 10's philosophy):
 *  - `observed` : live attribute / property / visibility / mutation / request /
 *                 popup / target existence, read from the real page.
 *  - `derived`  : locator strategy, action eligibility, diff category,
 *                 `status: changed`.
 *  - `inferred` : none. No AI, no LLM, no scoring, no similarity.
 */

/**
 * Bumped when any persisted exploration shape changes.
 * v2 (Task 16): `LiveTargetState.capturedSubtree` — the bounded after-state
 * contents of a region the interaction MOUNTED (items 68–73).
 * v3 (Task 17): `InteractionObservation.discoveredTargets` — generic
 * user-visible target discovery from before/after DOM evidence, independent of
 * any author-declared `aria-controls` relation.
 * v4 (Task 17.1): portal-aware discovery evidence — `descriptor.mountHostPath`
 * / `mountHostTag` / `mountChildIndex` (where a newly-mounted region attached,
 * in baseline coordinates), `CapturedSubtree.expanded` (a truncated capture was
 * retried once under the expanded caps), and captured elements may carry
 * `textSegments` (direct-text position among element children).
 */
export const SCHEMA_VERSION = 4 as const;

/** Exploration shapes this codebase can still READ (Task 16, item 26). */
export const READABLE_SCHEMA_VERSIONS = [1, 2, 3, 4] as const;
export const ReadableSchemaVersionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

/** Recorded in artifacts so a reader can tell what produced them. */
export const EXPLORER_ENGINE = "playwright-chromium";

/** Recorded in the plan, which is produced with no browser at all. */
export const PLANNER_ENGINE = "offline-deterministic";

// ---------------------------------------------------------------------------
// Policy constants — ONE global policy. Never per-site, never per-framework.
// ---------------------------------------------------------------------------

/**
 * Actions in flight. Every action is a fresh context loading a real page, so
 * this is real concurrent load on somebody else's site: two is already as much
 * as this stage should ever apply, and three is the hard ceiling.
 */
export const DEFAULT_CONCURRENCY = 2;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 3;

/**
 * Hard execution budgets (item 18). The detector deliberately threw nothing
 * away — 3,106 candidates across four sites — but every action here costs a page
 * load and touches a live site, so the explorer must not consume its input
 * whole. Budgets are global constants: a site whose plan is truncated says so in
 * `skipped[]` with `reason: budget` rather than getting its own tuning.
 */
export const MAX_ACTIONS_PER_VIEWPORT = 8;
export const MAX_ACTIONS_PER_PAGE = 16;
export const MAX_ACTIONS_PER_SITE = 80;

/**
 * Validation-sample pages explored per site (item 19). Task 09 already observed
 * a few non-representative family members; exploring one is only worth a browser
 * when its interaction signature actually DIFFERS from its representative's.
 */
export const MAX_VALIDATION_PAGES_PER_SITE = 2;

// --- load / settle policy (item 35, item 54) --------------------------------

/** Navigation timeout for the initial load of an action's page. */
export const LOAD_TIMEOUT_MS = 30_000;

/**
 * Bounded wait for network idle after `load`. Shorter than the Observer's 8 s:
 * this stage does not need a pixel-accurate render, only a hydrated page.
 */
export const LOAD_NETWORK_IDLE_TIMEOUT_MS = 5_000;

/** Fixed post-load settle so client-side hydration can attach its handlers. */
export const LOAD_SETTLE_MS = 1_000;

/** Timeout for the physical click itself (Playwright actionability included). */
export const ACTION_TIMEOUT_MS = 10_000;

/** Animation frames awaited after the click, before anything is measured. */
export const AFTER_RAF_COUNT = 2;
/** Fixed settle after those frames — CSS transitions are typically 150–400 ms. */
export const AFTER_SETTLE_MS = 600;
/** Bounded wait for network quiet after the click (never a hard requirement). */
export const AFTER_NETWORK_QUIET_TIMEOUT_MS = 2_000;

// --- capture caps (items 51, 53, 57) ----------------------------------------

/** Mutation records collected per action; beyond this, `truncated: true`. */
export const MAX_MUTATION_RECORDS = 500;
/** Stateful containers inventoried per snapshot; beyond this, `truncated: true`. */
export const MAX_CONTAINER_INVENTORY = 200;
/** Interactive descendants described inside one target (counts are uncapped). */
export const MAX_DESCENDANT_DESCRIPTORS = 20;

/**
 * Bounded dynamic-target subtree capture (Task 16, item 70).
 *
 * ONE global policy, never per site and never per framework. These exist so
 * "capture what the region contains" can never become "capture the page": a
 * mounted mega-menu, a modal that portals the whole document, and a router
 * outlet that swaps `<main>` all hit the same ceiling and are recorded as
 * partial rather than allowed to run.
 *
 * 300 elements is roughly ten times the largest observed dynamic menu in the
 * corpus (nextjs.org's largest mounted region inventoried 18 interactive
 * descendants), so a real menu is captured whole and a page is not.
 */
export const MAX_DYNAMIC_TARGET_ELEMENTS = 300;
export const MAX_DYNAMIC_TARGET_DEPTH = 12;
export const MAX_DYNAMIC_TARGET_TEXT_CHARS = 20_000;

/**
 * Task 17.1 §4 — adaptive bounded capture. The DEFAULT caps stay exactly as
 * above; only a capture that RECORDED a truncation is retried, once, under
 * these expanded (still hard) ceilings. Evidence-driven, never a default:
 * stripe's declared dialog/listbox portals inventory 600–800 elements, so a
 * 300-element capture cut the very content the user opened, while an unbounded
 * capture stays impossible by construction.
 */
export const EXPANDED_DYNAMIC_TARGET_ELEMENTS = 1_200;
/**
 * Depth is a guard against pathological recursion, not the working bound —
 * the element cap above is. stripe's dialog overlay nests 25+ levels
 * (overlay → snap wrappers → dialog → card → demo …) and a 24-level ceiling
 * cut 622 characters of user-visible dialog content, measured.
 */
export const EXPANDED_DYNAMIC_TARGET_DEPTH = 48;
export const EXPANDED_DYNAMIC_TARGET_TEXT_CHARS = 80_000;
/**
 * Per-element direct-text cap for CAPTURES. The Observer's page-wide 200-char
 * cap exists because rendered.html recovery backfills page text; a capture has
 * no recovery channel, so that cap silently deletes mounted content (stripe's
 * book-of-the-week description is one 414-char text node). The whole-subtree
 * text budget still bounds the total.
 */
export const DYNAMIC_TARGET_ELEMENT_TEXT_CHARS = 2_000;

/**
 * Generic user-visible target discovery (Task 17 §4). ONE global policy.
 *
 * The baseline walk records existence + visibility for every element BEFORE the
 * click so the after-state can be diffed against it. It is bounded so a
 * pathological page can never turn one action into a memory dump; a page that
 * hits the cap records `baselineTruncated` and discovery still runs over the
 * covered prefix.
 */
export const MAX_TARGET_BASELINE_ELEMENTS = 12_000;
/** Discovered target regions recorded per action; the rest is a count. */
export const MAX_DISCOVERED_TARGETS = 5;
/**
 * Minimum visible area (px²) an OBSERVED-evidence candidate must show. A 1×1
 * portal anchor or animation stub is not something a user "sees appear", and
 * without this gate such stubs consume the target budget ahead of the real
 * region. Declared relations are exempt — the author named them.
 */
export const MIN_DISCOVERED_TARGET_AREA = 16;
/** Normalized text sample stored per discovered target (content fingerprint). */
export const TARGET_TEXT_SAMPLE_LEN = 400;
/** Max characters of normalized text stored anywhere in this layer. */
export const TEXT_MAX_LEN = 200;
/** Max characters of an error message kept in an artifact. */
export const ERROR_MESSAGE_MAX_LEN = 300;

// --- locator policy (items 20–24) -------------------------------------------

/** Semantic ancestors recorded in a locator descriptor (item 20). */
export const MAX_ANCESTOR_DEPTH = 4;

/**
 * Ancestor tags that carry structural meaning on their own. Used for the
 * `semantic-ancestor` strategy so the path is anchored on landmarks rather than
 * on `<div>` nesting, which changes with every refactor.
 */
export const SEMANTIC_ANCESTOR_TAGS: readonly string[] = [
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "section",
  "article",
  "form",
  "dialog",
  "details",
  "table",
  "ul",
  "ol",
  "li",
];

/**
 * Attributes that may act as a strong IDENTITY signal in a locator.
 *
 * Deliberately excluded: `class` (whole framework utility strings that change
 * with any style edit), every `data-*` VALUE (arbitrary and framework-specific),
 * and `aria-controls` (its value is frequently a generated id — the very thing
 * item 21 warns about). Geometry is diagnostic only and never a match rule.
 */
export const IDENTITY_ATTRIBUTES: readonly string[] = [
  "aria-label",
  "name",
  "title",
  "placeholder",
  "alt",
];

// --- live capture vocabulary (items 28, 48) ---------------------------------

/** ARIA / plain attributes read verbatim off the live element. */
export const LIVE_ATTRIBUTE_NAMES: readonly string[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
  "aria-controls",
  "aria-disabled",
  "aria-hidden",
  "aria-modal",
  "aria-current",
  "role",
  "type",
  "popover",
  "popovertarget",
  "popovertargetaction",
];

/**
 * Boolean state read from the live DOM **property**, not the attribute.
 *
 * This distinction is the whole reason the field exists. Clicking a checkbox
 * flips `input.checked`; the `checked` *attribute* (the parse-time default)
 * never moves. Capturing the attribute would report `no-change` for a checkbox
 * that visibly toggled — so the property is what is recorded, with the attribute
 * only as a fallback for elements that do not expose the property.
 */
export const LIVE_STATE_PROPERTIES: readonly string[] = [
  "disabled",
  "readonly",
  "checked",
  "selected",
  "open",
  "hidden",
  "inert",
];

/** Computed style properties read before and after an action. */
export const LIVE_COMPUTED_PROPERTIES: readonly string[] = [
  "display",
  "visibility",
  "opacity",
  "pointer-events",
  "cursor",
];

/**
 * Attributes the MutationObserver watches (item 52). `class` and `style` are in
 * here because a large family of components signals open/closed with nothing
 * else — but they feed the mutation SUMMARY only, never the state diff, so a
 * transition animation can not by itself make an action `changed` (item 59).
 *
 * `characterData` is deliberately not observed at all: on a live site it is
 * dominated by clocks, counters and analytics text, and item 59 already rules
 * text mutation out as evidence of a state change.
 */
export const MUTATION_ATTRIBUTE_FILTER: readonly string[] = [
  "aria-checked",
  "aria-expanded",
  "aria-hidden",
  "aria-pressed",
  "aria-selected",
  "checked",
  "class",
  "disabled",
  "hidden",
  "inert",
  "open",
  "selected",
  "style",
];

/**
 * Container selectors inventoried before and after every action (item 51).
 * Compact by construction: the DOM itself is never copied, only this list of
 * `{tag, role, id, visible, open, ariaHidden}` records.
 */
export const CONTAINER_SELECTOR =
  "details,dialog,[popover],[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tabpanel],[aria-hidden]";

/** Selector for the interactive descendants counted inside a target (item 57). */
export const INTERACTIVE_DESCENDANT_SELECTOR =
  "a[href],button,input,select,textarea,summary," +
  "[role=button],[role=link],[role=menuitem],[role=menuitemcheckbox]," +
  "[role=menuitemradio],[role=option],[role=tab],[role=checkbox],[role=radio],[role=switch]," +
  "[tabindex]";

// --- network safety (item 42) -----------------------------------------------

/**
 * The only HTTP methods allowed once the initial page load has finished.
 * Everything else is aborted before it reaches the network, because this engine
 * observes public UI state and must never be the cause of a write on somebody
 * else's server. A blocked analytics beacon is an acceptable price and is
 * counted rather than hidden (item 43).
 */
export const ALLOWED_REQUEST_METHODS: readonly string[] = [
  "GET",
  "HEAD",
  "OPTIONS",
];

// --- eligibility policy (items 11–14) ---------------------------------------

/**
 * Guards that remove a candidate from the action plan outright. `hidden` and
 * `readonly` are NOT here: hidden is handled as its own skip reason (the
 * candidate is preserved, item 14) and readonly is an edit-time blocker that
 * says nothing about a click (item 15).
 */
export const EXCLUDED_GUARD_FLAGS: readonly GuardFlag[] = [
  "form-submit",
  "file-input",
  "navigation",
  "external-navigation",
  "disabled",
  "inert",
  "pointer-disabled",
];

/** P1 capabilities that make a candidate a stateful click target (item 11). */
export const ELIGIBLE_P1_CAPABILITIES: readonly InteractionCapability[] = [
  "state-toggle",
  "disclosure-trigger",
  "menu-trigger",
  "dialog-trigger",
  "tab-trigger",
  "toggle",
];

/** …or, failing that, one of these pieces of stored evidence (item 11). */
export const ELIGIBLE_P1_EVIDENCE: readonly InteractionEvidenceType[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
  "aria-controls",
  "native-disclosure",
];

/** The only `<input>` types P2 may execute (item 11). */
export const ELIGIBLE_P2_INPUT_TYPES: readonly string[] = ["checkbox", "radio"];

/**
 * Longest direct text a native `<button>` may carry and still qualify as an
 * "icon control" under the conservative P2 allowance (item 11). Two characters
 * covers the real shapes — `""` (an inline `<svg>`), `☰`, `×`, `≡` — while
 * keeping "Subscribe" or "Sign in" out. It is a global rule; there is no
 * per-site list of hamburger selectors anywhere in this module.
 */
export const ICON_CONTROL_TEXT_MAX_LEN = 2;

/** Rank used wherever priority ordering matters (P1 explored before P2). */
export const PRIORITY_RANK: Readonly<Record<InteractionPriority, number>> = {
  P1: 0,
  P2: 1,
  P3: 2,
};

// ---------------------------------------------------------------------------
// Locator descriptor & resolution
// ---------------------------------------------------------------------------

/** One semantic ancestor of a candidate, nearest first. */
export const LocatorAncestorSchema = z.object({
  tagName: z.string(),
  /** HTML `id`, when the ancestor has one. */
  domId: z.string().optional(),
  role: z.string().optional(),
  ariaLabel: z.string().optional(),
  /** True when the tag itself is structural (`nav`, `main`, `form`, …). */
  landmark: z.boolean(),
});
export type LocatorAncestor = z.infer<typeof LocatorAncestorSchema>;

/**
 * Everything needed to look for a stored candidate in a LIVE DOM — and nothing
 * that only means something inside the stored observation.
 *
 * `candidate.elementId` (`e000042`) is provenance ONLY. It is an index into one
 * saved `dom.json`, so re-opening the URL and asking for "the element that was
 * `e000042`" is meaningless: a single extra `<div>` renumbers everything after
 * it. Using it as a live locator is forbidden (item 2), and this descriptor is
 * the reason it never has to be.
 */
export const LocatorDescriptorSchema = z.object({
  tagName: z.string(),
  /** HTML `id` as written. A *hint* to try first, never proof (item 21). */
  domId: z.string().optional(),
  role: z.string().optional(),
  /** Normalized `<input>` type, when the candidate is an input. */
  inputType: z.string().optional(),
  /** `name` attribute. */
  name: z.string().optional(),
  ariaLabel: z.string().optional(),
  title: z.string().optional(),
  placeholder: z.string().optional(),
  alt: z.string().optional(),
  /** The Observer's normalized direct text, reused verbatim. */
  text: z.string().optional(),
  /** ARIA STATE values at observation time — diagnostic, never a match rule. */
  ariaState: z.record(z.string(), z.string()),
  /** Nearest-first semantic ancestors (max {@link MAX_ANCESTOR_DEPTH}). */
  ancestors: z.array(LocatorAncestorSchema),
  /** Index among same-tag siblings under the observed parent (0-based). */
  siblingIndex: z.number().int().nonnegative(),
  siblingCount: z.number().int().positive(),
  /** Deterministic `tag:nth-of-type` chain from the document root. */
  structuralPath: z.string(),
  /** Geometry at observation time. DIAGNOSTIC ONLY (item 20). */
  boundingBox: BoundingBoxSchema.optional(),
  /**
   * Whether this descriptor carries at least one strong semantic field
   * (`aria-label` / `name` / `title` / `placeholder` / `alt` / text). Without
   * one, the `semantic-exact` strategy is not attempted at all — "any
   * `<button>`" is not an identity.
   */
  hasStrongSemantics: z.boolean(),
});
export type LocatorDescriptor = z.infer<typeof LocatorDescriptorSchema>;

/**
 * The four strategies, tried in this order. There is deliberately no similarity
 * score anywhere: each strategy is an exact predicate that returns 0, 1 or N
 * matches, and only a strategy returning exactly 1 *verified* match may act.
 *
 *  - `id-exact`         : `#id` + tag/role/semantic verification (item 21).
 *  - `semantic-exact`   : tag ∧ role ∧ type ∧ (label|name|title|placeholder|text).
 *  - `semantic-ancestor`: the same predicate, narrowed by the ancestor path.
 *  - `structural-path`  : deterministic `tag:nth-of-type` chain.
 */
export const LocatorStrategySchema = z.enum([
  "id-exact",
  "semantic-exact",
  "semantic-ancestor",
  "structural-path",
]);
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

export const LOCATOR_STRATEGY_ORDER: readonly LocatorStrategy[] = [
  "id-exact",
  "semantic-exact",
  "semantic-ancestor",
  "structural-path",
];

/**
 * `resolved` is the ONLY status that may be acted on (item 23).
 *
 *  - `not-found`        : no strategy matched anything.
 *  - `ambiguous`        : a strategy matched several elements and nothing
 *                         narrowed it to one. Geometry is NOT used to pick a
 *                         winner — a false action is worse than a missed one.
 *  - `semantic-mismatch`: exactly one match, but it failed verification (the
 *                         classic case: a generated id reused by another
 *                         element between the observation and now).
 */
export const LocatorStatusSchema = z.enum([
  "resolved",
  "not-found",
  "ambiguous",
  "semantic-mismatch",
]);
export type LocatorStatus = z.infer<typeof LocatorStatusSchema>;

/** What one strategy found. Recorded for every strategy that was tried. */
export const LocatorAttemptSchema = z.object({
  strategy: LocatorStrategySchema,
  matchCount: z.number().int().nonnegative(),
  /** Present when `matchCount === 1`: did the match pass verification? */
  verified: z.boolean().optional(),
  /** Why verification failed (`tagName button vs a`), when it did. */
  mismatchReason: z.string().optional(),
});
export type LocatorAttempt = z.infer<typeof LocatorAttemptSchema>;

/** What the live element actually looked like, for drift diagnosis. */
export const LiveElementDescriptorSchema = z.object({
  tagName: z.string(),
  domId: z.string().optional(),
  role: z.string().optional(),
  inputType: z.string().optional(),
  ariaLabel: z.string().optional(),
  text: z.string().optional(),
  structuralPath: z.string(),
});
export type LiveElementDescriptor = z.infer<typeof LiveElementDescriptorSchema>;

export const LocatorResolutionSchema = z.object({
  status: LocatorStatusSchema,
  /** The strategy that resolved it (absent unless `status === "resolved"`). */
  strategy: LocatorStrategySchema.optional(),
  /** Matches found by the strategy that decided the outcome. */
  matchCount: z.number().int().nonnegative(),
  /** Every strategy tried, in order — the raw material of the locator table. */
  attempts: z.array(LocatorAttemptSchema),
  locatorDescriptor: LocatorDescriptorSchema,
  /** What was actually found live, when something was. */
  liveDescriptor: LiveElementDescriptorSchema.optional(),
});
export type LocatorResolution = z.infer<typeof LocatorResolutionSchema>;

// ---------------------------------------------------------------------------
// Live state
// ---------------------------------------------------------------------------

/** Live boolean state, read from DOM properties (see {@link LIVE_STATE_PROPERTIES}). */
export const LiveStateFlagsSchema = z.object({
  disabled: z.boolean().optional(),
  readonly: z.boolean().optional(),
  checked: z.boolean().optional(),
  selected: z.boolean().optional(),
  open: z.boolean().optional(),
  hidden: z.boolean().optional(),
  inert: z.boolean().optional(),
});
export type LiveStateFlags = z.infer<typeof LiveStateFlagsSchema>;

export const LiveComputedStyleSchema = z.object({
  display: z.string(),
  visibility: z.string(),
  opacity: z.string(),
  pointerEvents: z.string(),
  cursor: z.string().optional(),
});
export type LiveComputedStyle = z.infer<typeof LiveComputedStyleSchema>;

/**
 * A compact snapshot of ONE live element (item 48).
 *
 * `exists: false` is a normal outcome, not an error — a dialog that has not been
 * opened yet genuinely is not in the DOM, and that absence is precisely the
 * "before" half of the mount evidence Task 11 is looking for (items 49, 56).
 *
 * The full attribute set is never dumped: only the fixed state vocabulary above
 * is captured, so an artifact can not quietly become a second copy of the page.
 */
export const LiveElementStateSchema = z.object({
  exists: z.boolean(),
  tagName: z.string().optional(),
  role: z.string().optional(),
  text: z.string().optional(),
  visible: z.boolean().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  /** Raw attribute values from {@link LIVE_ATTRIBUTE_NAMES}; absent ones omitted. */
  attributes: z.record(z.string(), z.string()).optional(),
  /** Boolean state from live DOM properties. */
  state: LiveStateFlagsSchema.optional(),
  computed: LiveComputedStyleSchema.optional(),
});
export type LiveElementState = z.infer<typeof LiveElementStateSchema>;

/** Compact census of what is interactive inside a controlled region (item 57). */
export const DescendantInventorySchema = z.object({
  total: z.number().int().nonnegative(),
  buttonCount: z.number().int().nonnegative(),
  linkCount: z.number().int().nonnegative(),
  inputCount: z.number().int().nonnegative(),
  menuitemCount: z.number().int().nonnegative(),
  optionCount: z.number().int().nonnegative(),
  tabCount: z.number().int().nonnegative(),
  statefulCount: z.number().int().nonnegative(),
  /** At most {@link MAX_DESCENDANT_DESCRIPTORS} entries; counts stay complete. */
  samples: z.array(
    z.object({
      tagName: z.string(),
      role: z.string().optional(),
      text: z.string().optional(),
      ariaState: z.record(z.string(), z.string()).optional(),
    }),
  ),
  truncated: z.boolean(),
});
export type DescendantInventory = z.infer<typeof DescendantInventorySchema>;

/**
 * The bounded contents of a region the interaction MOUNTED (Task 16, items 68–73).
 *
 * Task 11 through 15 recorded only a *summary* of a dynamic target — its tag,
 * its role and how many interactive descendants it had — and Task 15 measured
 * what that costs: all nine of nextjs.org's verified menus mount a region with
 * real children, the clone mounted an empty one, and the pipeline could name the
 * gap (`dynamic-target-content-unobserved`) but never close it, because nothing
 * had ever looked inside.
 *
 * Four properties keep this from becoming a second page dump:
 *
 *  - **Bounded, globally.** {@link MAX_DYNAMIC_TARGET_ELEMENTS} /
 *    {@link MAX_DYNAMIC_TARGET_DEPTH} / {@link MAX_DYNAMIC_TARGET_TEXT_CHARS}
 *    are one policy for every site. Whole-page recursion is impossible by
 *    construction, and a capture that hit a cap says which one.
 *  - **Newly mounted only.** A region that already existed before the click is
 *    part of the static DOM and Task 09 observed it properly; re-capturing it
 *    here would duplicate page content into an action artifact.
 *  - **The Observer's own extraction.** These are `ElementObservation`s produced
 *    by `collectPageInBrowser` rooted at the region — same attribute whitelist,
 *    same style whitelist, same visibility derivation, same skip tags. There is
 *    no second miniature observer to drift out of sync (item 71).
 *  - **One instance, and it says so.** `provenance: observed` /
 *    `state: after-action` travel with the data all the way into the SiteSpec.
 *    This is what the region contained on one click at one moment — never a
 *    claim about the site's data or backend behavior (items 79, 80).
 */
export const CapturedSubtreeSchema = z.object({
  provenance: z.literal("observed"),
  state: z.literal("after-action"),
  /** The capture-local id of the region's own root element (always `e000001`). */
  rootElementId: z.string(),
  /** Observer-shaped elements, capture-local ids, document order. */
  elements: z.array(ElementObservationSchema),
  /** Capture-local shared computed-style table, same dedup policy as a viewport. */
  styleTable: StyleTableSchema,
  /** Asset references found inside the region (URLs + metadata only). */
  assets: z.array(AssetObservationSchema),
  elementCount: z.number().int().nonnegative(),
  /** Non-empty when a cap stopped the walk. The region is partial and says so. */
  truncations: z.array(z.enum(["element-cap", "depth-cap", "text-cap"])),
  /**
   * Task 17.1: the default-cap capture truncated, so it was retried once under
   * the EXPANDED caps ({@link EXPANDED_DYNAMIC_TARGET_ELEMENTS} …). Whatever
   * `truncations` remain describe the expanded attempt.
   */
  expanded: z.boolean().optional(),
});
export type CapturedSubtree = z.infer<typeof CapturedSubtreeSchema>;

/**
 * A controlled region's live state. `relation` and `targetDomId` come straight
 * from the stored candidate's `controls[]`, so a before/after pair always
 * answers "did the thing this trigger CLAIMS to control actually change?".
 */
export const LiveTargetStateSchema = z.object({
  relation: ControlRelationTypeSchema,
  /** The author's HTML id (absent for the native `<summary>`→`<details>` edge). */
  targetDomId: z.string().optional(),
  /** Whether the region was in the DOM at this moment. */
  resolved: z.boolean(),
  element: LiveElementStateSchema,
  /** Present when the region exists. */
  descendants: DescendantInventorySchema.optional(),
  /**
   * Present ONLY on the AFTER snapshot of a region that this action mounted
   * (Task 16). Absent everywhere else — including on the before snapshot, and
   * on every target that already existed.
   */
  capturedSubtree: CapturedSubtreeSchema.optional(),
});
export type LiveTargetState = z.infer<typeof LiveTargetStateSchema>;

/** One entry of the stateful-container inventory (item 51). */
export const StatefulContainerSchema = z.object({
  /** Deterministic identity within one snapshot (`dialog|menu-1|dialog`). */
  key: z.string(),
  tagName: z.string(),
  role: z.string().optional(),
  domId: z.string().optional(),
  visible: z.boolean(),
  open: z.boolean().optional(),
  ariaHidden: z.string().optional(),
  popover: z.string().optional(),
});
export type StatefulContainer = z.infer<typeof StatefulContainerSchema>;

export const ContainerInventorySchema = z.object({
  containers: z.array(StatefulContainerSchema),
  /** Total matched in the document, even when the list itself was capped. */
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ContainerInventory = z.infer<typeof ContainerInventorySchema>;

// ---------------------------------------------------------------------------
// Generic user-visible target discovery (Task 17 §4)
// ---------------------------------------------------------------------------

/**
 * How a discovered region relates to the static DOM the Observer saw:
 *
 *  - `existing-visibility`          the region existed before the click and only
 *                                   its visibility changed. The clone can reveal
 *                                   the SAME region — no content is missing.
 *  - `existing-with-mounted-content` the region existed (hidden) and gained new
 *                                   descendant elements when it opened. The
 *                                   static clone region is an empty shell; the
 *                                   after-state subtree is what a user sees.
 *  - `content-replaced`             the region stayed visible and its contents
 *                                   were swapped in place (a tab panel).
 *  - `newly-mounted`                the region itself did not exist before the
 *                                   click (a portal/popup mount).
 */
export const TargetDiscoveryKindSchema = z.enum([
  "existing-visibility",
  "existing-with-mounted-content",
  "content-replaced",
  "newly-mounted",
]);
export type TargetDiscoveryKind = z.infer<typeof TargetDiscoveryKindSchema>;

/**
 * Why this element was considered a target at all. Declared relations
 * (`aria-controls` / `popovertarget` / `details-summary` / `href-fragment`)
 * outrank observed evidence; observed evidence exists so a mega-menu that
 * declares nothing is still found. Every entry is `observed`-level — read from
 * the real page, never guessed.
 */
export const TargetRelationEvidenceSchema = z.object({
  kind: z.enum([
    "aria-controls",
    "popovertarget",
    "details-summary",
    "href-fragment",
    "visibility-change",
    "newly-mounted-subtree",
    "subtree-mutation",
    "bounding-box-appearance",
  ]),
  detail: z.string().optional(),
});
export type TargetRelationEvidence = z.infer<typeof TargetRelationEvidenceSchema>;

/** One side (before / after) of a discovered target's user-visible state. */
export const DiscoveredTargetStateSchema = z.object({
  exists: z.boolean(),
  visible: z.boolean().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  display: z.string().optional(),
  visibility: z.string().optional(),
  opacity: z.string().optional(),
  /** The `hidden` attribute / property. */
  hidden: z.boolean().optional(),
  /** Raw `aria-hidden` attribute value, when present. */
  ariaHidden: z.string().optional(),
});
export type DiscoveredTargetState = z.infer<typeof DiscoveredTargetStateSchema>;

/**
 * A region the user actually SAW appear, disappear or change when the trigger
 * was clicked — found from before/after DOM evidence, with no site-specific
 * selector anywhere. This is the observation Task 16's `behaviorEquivalent`
 * lacked: the trigger's state flip was recorded, the mega-menu it opened never
 * was.
 */
export const DiscoveredTargetSchema = z.object({
  /** Deterministic per-action id (`dt000001…`), rank order. */
  discoveryId: z.string(),
  kind: TargetDiscoveryKindSchema,
  /** Whether the region APPEARED or DISAPPEARED from the user's view. */
  direction: z.enum(["appeared", "disappeared", "content-changed"]),
  descriptor: z.object({
    tagName: z.string(),
    /** The author's own HTML id, when the region has one. */
    htmlId: z.string().optional(),
    role: z.string().optional(),
    /**
     * Element-child index path from the document root (`0/1/3/0`), computed on
     * the live DOM. Exact-match material for re-finding the region in a saved
     * observation tree — never a fuzzy locator.
     */
    structuralPath: z.string(),
    /**
     * Task 17.1: for a newly-mounted region, the structural path of the nearest
     * ancestor that existed in the PRE-CLICK baseline — computed from the
     * baseline walk's own child order, so it resolves against the static tree
     * even though the after-DOM's indices shifted when content mounted. This is
     * where the clone should attach the mounted copy.
     */
    mountHostPath: z.string().optional(),
    /** Tag of that baseline host (exact-match guard for resolution). */
    mountHostTag: z.string().optional(),
    /**
     * The mounted root's element-child index inside the host at after time
     * (skip-tag policy applied) — preserves observed sibling order on mount.
     */
    mountChildIndex: z.number().int().nonnegative().optional(),
  }),
  relationEvidence: z.array(TargetRelationEvidenceSchema).min(1),
  before: DiscoveredTargetStateSchema,
  after: DiscoveredTargetStateSchema,
  /** Elements inside this region that did NOT exist before the click. */
  mountedDescendantCount: z.number().int().nonnegative(),
  /** Normalized text content, capped at {@link TARGET_TEXT_SAMPLE_LEN}. */
  textSample: z.string().optional(),
  /** Full normalized text length (uncapped), for content-fingerprint compare. */
  textLength: z.number().int().nonnegative(),
  /** Bounded Observer-walk capture of the region in its AFTER state. */
  capturedSubtree: CapturedSubtreeSchema.optional(),
  provenance: z.literal("observed"),
});
export type DiscoveredTarget = z.infer<typeof DiscoveredTargetSchema>;

/** Accounting for one action's discovery pass. */
export const TargetDiscoverySummarySchema = z.object({
  baselineElementCount: z.number().int().nonnegative(),
  baselineTruncated: z.boolean(),
  /** Candidate regions found before the {@link MAX_DISCOVERED_TARGETS} cap. */
  candidateCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Discovery is skipped when the URL changed — the page is a different page. */
  skippedReason: z.enum(["url-changed", "baseline-missing"]).optional(),
});
export type TargetDiscoverySummary = z.infer<typeof TargetDiscoverySummarySchema>;

/** One complete before/after snapshot. Never contains DOM or HTML (item 62). */
export const InteractionStateSnapshotSchema = z.object({
  /** `document.location.href` at snapshot time (item 58: URL change). */
  url: z.string(),
  candidate: LiveElementStateSchema,
  /** One entry per stored control relation, in the candidate's own order. */
  targets: z.array(LiveTargetStateSchema),
  containers: ContainerInventorySchema,
});
export type InteractionStateSnapshot = z.infer<
  typeof InteractionStateSnapshotSchema
>;

// ---------------------------------------------------------------------------
// Live signal reconciliation (items 28, 15)
// ---------------------------------------------------------------------------

/**
 * Whether an action TYPE is possible right now — computed per action instead of
 * trusting Task 10's single `initiallyOperable` (item 15).
 *
 * A readonly `<input>` is the reason this exists: it can be focused, it can be
 * clicked, and it can not be edited. Collapsing that into one boolean would make
 * "readonly ⇒ nothing works" a rule of this engine, which is simply false. Task
 * 11 performs no edit, but the distinction is recorded so the next stage does
 * not have to re-derive it.
 */
export const ActionOperabilitySchema = z.object({
  clickOperable: z.boolean(),
  focusOperable: z.boolean(),
  toggleOperable: z.boolean(),
  editOperable: z.boolean(),
  /** Sorted, human-readable reasons the click is not possible (may be empty). */
  blockers: z.array(z.string()),
});
export type ActionOperability = z.infer<typeof ActionOperabilitySchema>;

/**
 * Attributes Task 09's Observer never stored (they are outside its whitelist)
 * read directly off the live element right before the action. This is the whole
 * answer to Task 10's biggest limitation, and it costs no re-observation of the
 * 52 saved pages (item 29).
 */
export const LiveSignalsSchema = z.object({
  attributes: z.record(z.string(), z.string()),
  state: LiveStateFlagsSchema,
  computed: LiveComputedStyleSchema,
  /** `<input>` bounds, when declared. */
  min: z.string().optional(),
  max: z.string().optional(),
  step: z.string().optional(),
  /** `<button type>` as resolved by the DOM (defaults to `submit` in a form). */
  buttonType: z.string().optional(),
  /** True when the live element has an associated `<form>`. */
  hasForm: z.boolean(),
  formId: z.string().optional(),
  contentEditable: z.string().optional(),
  operability: ActionOperabilitySchema,
});
export type LiveSignals = z.infer<typeof LiveSignalsSchema>;

// ---------------------------------------------------------------------------
// Mutations (items 52, 53)
// ---------------------------------------------------------------------------

export const MutationRecordSummarySchema = z.object({
  type: z.enum(["attributes", "childList"]),
  targetTag: z.string(),
  targetId: z.string().optional(),
  targetRole: z.string().optional(),
  attributeName: z.string().optional(),
  /** Length-capped; never the full value of a utility-class string. */
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  addedTags: z.array(z.string()).optional(),
  removedTags: z.array(z.string()).optional(),
});
export type MutationRecordSummary = z.infer<typeof MutationRecordSummarySchema>;

export const MutationSummarySchema = z.object({
  /** Records actually captured (≤ {@link MAX_MUTATION_RECORDS}). */
  recordCount: z.number().int().nonnegative(),
  /** Records the observer delivered, including those past the cap. */
  observedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  attributeMutationCount: z.number().int().nonnegative(),
  childListMutationCount: z.number().int().nonnegative(),
  addedNodeCount: z.number().int().nonnegative(),
  removedNodeCount: z.number().int().nonnegative(),
  /** Non-zero counts per watched attribute name, in fixed vocabulary order. */
  attributeNameCounts: z.record(z.string(), z.number().int().nonnegative()),
  records: z.array(MutationRecordSummarySchema),
});
export type MutationSummary = z.infer<typeof MutationSummarySchema>;

// ---------------------------------------------------------------------------
// Safety events (items 39–44)
// ---------------------------------------------------------------------------

/**
 * Something the page tried to do that this engine refused to let happen. Every
 * one of these is a *blocked* attempt, never a completed side effect.
 */
export const SafetyEventTypeSchema = z.enum([
  "navigation-blocked",
  "same-document-navigation",
  "popup-attempt",
  "download-attempt",
  "blocked-write-request",
  "dialog-dismissed",
]);
export type SafetyEventType = z.infer<typeof SafetyEventTypeSchema>;

export const SAFETY_EVENT_ORDER: readonly SafetyEventType[] = [
  "navigation-blocked",
  "same-document-navigation",
  "popup-attempt",
  "download-attempt",
  "blocked-write-request",
  "dialog-dismissed",
];

/**
 * Deliberately thin. A request body is NEVER stored — this engine must not
 * become a way to archive whatever a page was about to POST — and a URL is
 * reduced to `origin + pathname`, so query strings (which routinely carry
 * tokens and identifiers) never reach an artifact.
 */
export const SafetyEventSchema = z.object({
  type: SafetyEventTypeSchema,
  /** HTTP method, for request-shaped events. */
  method: z.string().optional(),
  /** `origin + pathname` only — never the query string, never the body. */
  url: z.string().optional(),
  sameOrigin: z.boolean().optional(),
  /** Free-form short note (dialog type, download suggested-filename presence). */
  detail: z.string().optional(),
});
export type SafetyEvent = z.infer<typeof SafetyEventSchema>;

// ---------------------------------------------------------------------------
// State diff (items 58, 59)
// ---------------------------------------------------------------------------

/**
 * Deterministic diff vocabulary. Every entry names WHAT changed and WHERE, and
 * nothing here is a pattern claim: `open-change` is an observation,
 * "accordion" would be an interpretation, and interpretation is Task 12.
 */
export const DiffCategorySchema = z.enum([
  "candidate-attribute-change",
  "candidate-visibility-change",
  "candidate-removed",
  "candidate-replaced",
  "target-mounted",
  "target-unmounted",
  "target-visibility-change",
  "target-attribute-change",
  "container-added",
  "container-removed",
  "container-visibility-change",
  "checked-change",
  "selected-change",
  "open-change",
  "url-change",
]);
export type DiffCategory = z.infer<typeof DiffCategorySchema>;

export const DIFF_CATEGORY_ORDER: readonly DiffCategory[] = [
  "candidate-attribute-change",
  "candidate-visibility-change",
  "candidate-removed",
  "candidate-replaced",
  "target-mounted",
  "target-unmounted",
  "target-visibility-change",
  "target-attribute-change",
  "container-added",
  "container-removed",
  "container-visibility-change",
  "checked-change",
  "selected-change",
  "open-change",
  "url-change",
];

/**
 * The categories that alone justify `status: changed` (item 59).
 *
 * `url-change` is deliberately absent: it is recorded as a diff entry and as a
 * flag, but item 59's list is the rule, and a navigation attempt is reported as
 * a safety event rather than as a successful state transition.
 */
export const MEANINGFUL_CHANGE_CATEGORIES: readonly DiffCategory[] = [
  "candidate-attribute-change",
  "candidate-visibility-change",
  "candidate-removed",
  "candidate-replaced",
  "target-mounted",
  "target-unmounted",
  "target-visibility-change",
  "target-attribute-change",
  "container-added",
  "container-removed",
  "container-visibility-change",
  "checked-change",
  "selected-change",
  "open-change",
];

export const StateChangeSchema = z.object({
  category: DiffCategorySchema,
  subject: z.enum(["candidate", "target", "container", "document"]),
  /** Container key / target dom id / relation name — whichever identifies it. */
  subjectKey: z.string().optional(),
  /** Attribute name, `visible`, `open`, `checked`, `url`, … */
  field: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type StateChange = z.infer<typeof StateChangeSchema>;

export const InteractionStateDiffSchema = z.object({
  /** Sorted by {@link DIFF_CATEGORY_ORDER}, then subject, key, field. */
  changes: z.array(StateChangeSchema),
  /** Non-zero counts per category, in fixed order. */
  categoryCounts: z.record(z.string(), z.number().int().nonnegative()),
  /**
   * True when at least one change is in {@link MEANINGFUL_CHANGE_CATEGORIES}
   * AND the two snapshots describe the same document (see `urlChanged`).
   */
  meaningfulChange: z.boolean(),
  /**
   * The click moved the URL without a document request — a client-side router
   * navigation, which the network guard cannot intercept.
   *
   * When this is true the before/after pair describes two different pages, so
   * every container and target difference is page replacement rather than a
   * state transition, and `meaningfulChange` is forced to false. The raw
   * differences are still recorded in `changes[]`: nothing is hidden, it just
   * stops counting as evidence of stateful UI behavior.
   */
  urlChanged: z.boolean(),
  /** Controlled regions that did not exist before and do now (item 56). */
  targetsMounted: z.number().int().nonnegative(),
  targetsUnmounted: z.number().int().nonnegative(),
});
export type InteractionStateDiff = z.infer<typeof InteractionStateDiffSchema>;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** Why a candidate did not become an action. Never "it was dropped". */
export const SkipReasonSchema = z.enum([
  "guard",
  "hidden",
  "priority",
  "capability",
  "shape-duplicate",
  "budget",
]);
export type SkipReason = z.infer<typeof SkipReasonSchema>;

export const SKIP_REASON_ORDER: readonly SkipReason[] = [
  "guard",
  "hidden",
  "priority",
  "capability",
  "shape-duplicate",
  "budget",
];

/**
 * One skipped candidate. Compact (six short fields) because ALL of them are
 * recorded — 3,106 candidates across four sites — and the point is that nothing
 * is silently discarded, not that the plan becomes a second candidate file.
 */
export const SkippedCandidateSchema = z.object({
  pageId: z.string(),
  viewportId: ViewportProfileSchema.shape.id,
  candidateId: z.string(),
  elementId: z.string(),
  priority: InteractionPrioritySchema,
  reason: SkipReasonSchema,
  /** For `shape-duplicate`: the candidate that represents this shape. */
  representativeCandidateId: z.string().optional(),
  /** For `guard`: which guards excluded it, in fixed order. */
  guardFlags: z.array(GuardFlagSchema).optional(),
});
export type SkippedCandidate = z.infer<typeof SkippedCandidateSchema>;

/**
 * ONE planned action. Everything a live run needs, and everything a reviewer
 * needs to argue with the choice — including the shape key that made this
 * candidate the representative of its group.
 */
export const InteractionActionPlanSchema = z.object({
  /** `ia000001…`, assigned after a stable (pageId, viewport, candidateId) sort. */
  actionId: z.string(),
  pageId: z.string(),
  url: z.string(),
  pageRole: SitePageRoleSchema,
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  viewportId: ViewportProfileSchema.shape.id,

  /** Provenance into Task 10 (item 118). */
  sourceCandidateId: z.string(),
  sourceElementId: z.string(),
  sourceInteractionCandidatesFile: z.string(),

  priority: InteractionPrioritySchema,
  capabilities: z.array(InteractionCapabilitySchema),
  guardFlags: z.array(GuardFlagSchema),

  actionType: z.literal("click"),
  /** Readable justification (`P1 disclosure-trigger; shape representative`). */
  planReason: z.string(),
  /** The deterministic shape key this action represents. */
  shapeKey: z.string(),
  /** How many candidates collapsed into this shape (this one included). */
  shapeMemberCount: z.number().int().positive(),

  locatorDescriptor: LocatorDescriptorSchema,
  /** Stored control relations, carried into the live run for target capture. */
  controls: z.array(
    z.object({
      relation: ControlRelationTypeSchema,
      targetDomId: z.string().optional(),
      /** Whether Task 10 could resolve it in the SAVED DOM (item 56's "before"). */
      storedResolved: z.boolean(),
    }),
  ),
  /** Task 10's stored state, kept so live drift is visible (item 80). */
  storedInitialState: z.object({
    effectiveVisible: z.boolean(),
    disabled: z.boolean(),
    readonly: z.boolean(),
    initiallyOperable: z.boolean(),
  }),
});
export type InteractionActionPlan = z.infer<typeof InteractionActionPlanSchema>;

export const InteractionPlanPolicySchema = z.object({
  concurrency: z.number().int().positive(),
  maxActionsPerViewport: z.number().int().nonnegative(),
  maxActionsPerPage: z.number().int().nonnegative(),
  maxActionsPerSite: z.number().int().nonnegative(),
  maxValidationPagesPerSite: z.number().int().nonnegative(),
  allowedPriorities: z.array(InteractionPrioritySchema),
  excludedGuardFlags: z.array(GuardFlagSchema),
  allowedRequestMethods: z.array(z.string()),
  actionTypes: z.array(z.literal("click")),
  /** Named policies applied, so a plan explains itself without the source. */
  safetyPolicy: z.array(z.string()),
});
export type InteractionPlanPolicy = z.infer<typeof InteractionPlanPolicySchema>;

export const InteractionPlanStatsSchema = z.object({
  /**
   * Every candidate Task 10 detected for the whole site, across ALL its
   * analyzed pages. Recorded so the headline reduction ("N candidates → M
   * actions") is answerable from the plan alone, without re-opening the
   * detector's manifest.
   */
  siteCandidateCount: z.number().int().nonnegative(),
  /** Pages Task 10 analyzed (representatives + validation samples). */
  sitePageCount: z.number().int().nonnegative(),
  /**
   * Candidates in the pages THIS plan covers. Lower than
   * `siteCandidateCount` whenever a validation sample was not worth exploring
   * (item 19) — the difference is the cost that page selection avoided.
   */
  totalCandidates: z.number().int().nonnegative(),
  /** Candidates that survived guard / hidden / priority / capability filters. */
  eligibleCandidates: z.number().int().nonnegative(),
  /** Distinct interaction shapes among the eligible candidates. */
  shapeGroups: z.number().int().nonnegative(),
  /** Eligible candidates removed because another candidate shares their shape. */
  deduplicatedByShape: z.number().int().nonnegative(),
  plannedActions: z.number().int().nonnegative(),
  skippedByPolicy: z.number().int().nonnegative(),
  skippedByBudget: z.number().int().nonnegative(),
  /** Pages / viewports that contributed at least one action. */
  plannedPages: z.number().int().nonnegative(),
  desktopActions: z.number().int().nonnegative(),
  mobileActions: z.number().int().nonnegative(),
  /** Non-zero counts per skip reason, in fixed order. */
  skipReasonCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type InteractionPlanStats = z.infer<typeof InteractionPlanStatsSchema>;

/**
 * The offline half's whole output.
 *
 * There is NO timestamp anywhere in this schema, on purpose (item 9): a plan is
 * a pure function of its input, so two runs against the same
 * `interaction-analysis.json` must produce byte-identical plans. Anything that
 * varies per run belongs in the exploration manifest, not here.
 */
export const InteractionPlanSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  engine: z.string(),
  rootUrl: z.string(),
  /** Provenance: the Task 10 manifest this plan was derived from. */
  sourceInteractionAnalysis: z.string(),
  sourceSiteObservation: z.string(),
  policy: InteractionPlanPolicySchema,
  stats: InteractionPlanStatsSchema,
  /** Pages the plan covers, in `pageId` order, with why each was included. */
  pages: z.array(
    z.object({
      pageId: z.string(),
      url: z.string(),
      role: SitePageRoleSchema,
      familyId: z.string(),
      familyType: PageFamilyTypeSchema,
      /** `representative` or the deterministic validation-eligibility reason. */
      selectionReason: z.string(),
      desktopActions: z.number().int().nonnegative(),
      mobileActions: z.number().int().nonnegative(),
    }),
  ),
  /** Sorted by `actionId`. */
  actions: z.array(InteractionActionPlanSchema),
  /** Sorted by (pageId, viewport, candidateId). Nothing is discarded. */
  skipped: z.array(SkippedCandidateSchema),
});
export type InteractionPlan = z.infer<typeof InteractionPlanSchema>;

// ---------------------------------------------------------------------------
// Interaction observation (item 62)
// ---------------------------------------------------------------------------

/**
 * One action's outcome. Exactly one primary status; safety events are recorded
 * beside it rather than folded into it (item 60), because "the click changed the
 * page AND a popup was blocked" is two facts, not one.
 *
 *  - `changed`             : a meaningful state transition was observed.
 *  - `no-change`           : the click ran and nothing in the diff moved. A
 *                            RESULT, not an error (item 77).
 *  - `not-found`           : the candidate was not in the live DOM.
 *  - `ambiguous`           : several equally-good matches; nothing was clicked.
 *  - `live-inoperable`     : re-found, but disabled/hidden/covered right now.
 *  - `blocked-by-policy`   : a live signal (form submit, file input) that the
 *                            stored guards did not carry refused the action.
 *  - `actionability-error` : Playwright's own actionability check failed. Never
 *                            retried, never forced (item 46).
 *  - `action-error`        : anything else that threw during the action.
 *  - `load-error`          : the page never loaded.
 */
export const ActionStatusSchema = z.enum([
  "changed",
  "no-change",
  "not-found",
  "ambiguous",
  "live-inoperable",
  "blocked-by-policy",
  "actionability-error",
  "action-error",
  "load-error",
]);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const ACTION_STATUS_ORDER: readonly ActionStatus[] = [
  "changed",
  "no-change",
  "not-found",
  "ambiguous",
  "live-inoperable",
  "blocked-by-policy",
  "actionability-error",
  "action-error",
  "load-error",
];

/** Statuses in which the physical click really was performed. */
export const EXECUTED_STATUSES: readonly ActionStatus[] = [
  "changed",
  "no-change",
  "action-error",
];

export const ActionErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  phase: z.enum(["load", "resolve", "reconcile", "before", "action", "after", "diff"]),
});
export type ActionError = z.infer<typeof ActionErrorSchema>;

export const InteractionObservationSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  engine: z.string(),
  actionId: z.string(),

  pageId: z.string(),
  url: z.string(),
  /** The URL actually loaded (after redirects). */
  finalUrl: z.string().optional(),
  viewportId: ViewportProfileSchema.shape.id,
  viewportProfile: ViewportProfileSchema,

  /** Provenance back into Task 10 / Task 09 (item 118). */
  sourceCandidateId: z.string(),
  sourceElementId: z.string(),
  sourcePageId: z.string(),
  sourceViewport: ViewportProfileSchema.shape.id,
  sourceInteractionCandidatesFile: z.string(),

  priority: InteractionPrioritySchema,
  capabilities: z.array(InteractionCapabilitySchema),
  planReason: z.string(),
  shapeKey: z.string(),

  locatorResolution: LocatorResolutionSchema,
  liveSignals: LiveSignalsSchema.optional(),

  action: z.object({
    type: z.literal("click"),
    /** False whenever a guard, the locator, or operability stopped it. */
    attempted: z.boolean(),
    /** Present when it was not attempted — the one-line reason. */
    notAttemptedReason: z.string().optional(),
  }),

  before: InteractionStateSnapshotSchema.optional(),
  after: InteractionStateSnapshotSchema.optional(),
  diff: InteractionStateDiffSchema.optional(),
  mutationSummary: MutationSummarySchema.optional(),

  /**
   * Task 17 §4 — regions the user actually saw change, discovered from
   * before/after DOM evidence. Absent on v1/v2 artifacts and on actions where
   * discovery could not run (navigation, no baseline).
   */
  discoveredTargets: z.array(DiscoveredTargetSchema).optional(),
  targetDiscovery: TargetDiscoverySummarySchema.optional(),

  /** Sorted by {@link SAFETY_EVENT_ORDER}, then method, then url. */
  safetyEvents: z.array(SafetyEventSchema),

  status: ActionStatusSchema,
  error: ActionErrorSchema.optional(),

  startedAt: z.string(),
  completedAt: z.string(),
  elapsedMs: z.number().int().nonnegative(),
  /** Time spent on the initial page load — usually most of the elapsed time. */
  loadMs: z.number().int().nonnegative(),
});
export type InteractionObservation = z.infer<
  typeof InteractionObservationSchema
>;

// ---------------------------------------------------------------------------
// Exploration manifest (item 65)
// ---------------------------------------------------------------------------

export const ExplorationConfigSchema = z.object({
  concurrency: z.number().int().positive(),
  planOnly: z.boolean(),
  viewportProfiles: z.array(ViewportProfileSchema),
  loadTimeoutMs: z.number().int().positive(),
  loadSettleMs: z.number().int().nonnegative(),
  afterSettleMs: z.number().int().nonnegative(),
  maxMutationRecords: z.number().int().nonnegative(),
  screenshots: z.boolean(),
});
export type ExplorationConfig = z.infer<typeof ExplorationConfigSchema>;

/** One action as listed in the manifest — never the full observation (item 62). */
export const ExplorationActionSummarySchema = z.object({
  actionId: z.string(),
  pageId: z.string(),
  viewportId: ViewportProfileSchema.shape.id,
  sourceCandidateId: z.string(),
  priority: InteractionPrioritySchema,
  status: ActionStatusSchema,
  locatorStatus: LocatorStatusSchema,
  locatorStrategy: LocatorStrategySchema.optional(),
  changeCount: z.number().int().nonnegative(),
  safetyEventCount: z.number().int().nonnegative(),
  /** `pages/p000001/desktop/ia000001.json`, relative to the run dir. */
  observationFile: z.string(),
  elapsedMs: z.number().int().nonnegative(),
});
export type ExplorationActionSummary = z.infer<
  typeof ExplorationActionSummarySchema
>;

export const ExplorationPageSummarySchema = z.object({
  pageId: z.string(),
  url: z.string(),
  role: SitePageRoleSchema,
  familyId: z.string(),
  desktopPlanned: z.number().int().nonnegative(),
  mobilePlanned: z.number().int().nonnegative(),
  desktopExecuted: z.number().int().nonnegative(),
  mobileExecuted: z.number().int().nonnegative(),
  desktopChanged: z.number().int().nonnegative(),
  mobileChanged: z.number().int().nonnegative(),
});
export type ExplorationPageSummary = z.infer<
  typeof ExplorationPageSummarySchema
>;

export const ExplorationStatsSchema = z.object({
  plannedActions: z.number().int().nonnegative(),
  /** Actions whose physical click really happened. */
  executedActions: z.number().int().nonnegative(),
  changedActions: z.number().int().nonnegative(),
  noChangeActions: z.number().int().nonnegative(),

  desktopPlanned: z.number().int().nonnegative(),
  mobilePlanned: z.number().int().nonnegative(),
  desktopExecuted: z.number().int().nonnegative(),
  mobileExecuted: z.number().int().nonnegative(),
  desktopChanged: z.number().int().nonnegative(),
  mobileChanged: z.number().int().nonnegative(),

  /** `resolved / plannedActions`, 4 decimals. */
  locatorResolutionRate: z.number(),
  /** `changed / executedActions`, 4 decimals. */
  changeRate: z.number(),

  totalLoadMs: z.number().int().nonnegative(),
  totalActionMs: z.number().int().nonnegative(),
  averageActionMs: z.number().int().nonnegative(),
  totalElapsedMs: z.number().int().nonnegative(),
});
export type ExplorationStats = z.infer<typeof ExplorationStatsSchema>;

export const SafetySummarySchema = z.object({
  formSubmitSkipped: z.number().int().nonnegative(),
  fileInputSkipped: z.number().int().nonnegative(),
  navigationGuardSkipped: z.number().int().nonnegative(),
  navigationAttemptsBlocked: z.number().int().nonnegative(),
  /**
   * Client-side (`history.pushState`) navigations, which no network guard can
   * block. Reported separately because they are the one way an action can leave
   * the page despite every guard — and because they invalidate that action's
   * state diff (see {@link InteractionStateDiffSchema}).
   */
  sameDocumentNavigations: z.number().int().nonnegative(),
  popupAttempts: z.number().int().nonnegative(),
  downloadAttempts: z.number().int().nonnegative(),
  writeRequestsBlocked: z.number().int().nonnegative(),
  dialogsDismissed: z.number().int().nonnegative(),
  /** Non-zero counts per blocked HTTP method. */
  blockedMethodCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type SafetySummary = z.infer<typeof SafetySummarySchema>;

export const DynamicTargetSummarySchema = z.object({
  /** Planned actions whose stored `controls[]` held an unresolved relation. */
  plannedUnresolvedTriggers: z.number().int().nonnegative(),
  executedUnresolvedTriggers: z.number().int().nonnegative(),
  /** …of those, how many mounted their target after the click (item 56). */
  resolvedAfterAction: z.number().int().nonnegative(),
  stillUnresolved: z.number().int().nonnegative(),
  failedBeforeAction: z.number().int().nonnegative(),
  /** Interactive descendants that appeared inside newly mounted targets. */
  newInteractiveDescendants: z.number().int().nonnegative(),
});
export type DynamicTargetSummary = z.infer<typeof DynamicTargetSummarySchema>;

/** Run-level accounting for Task 17 §4 generic target discovery. */
export const UserVisibleTargetSummarySchema = z.object({
  /** Executed actions on which discovery ran (same-document only). */
  actionsWithDiscovery: z.number().int().nonnegative(),
  /** Executed actions where at least one target region was discovered. */
  actionsWithDiscoveredTargets: z.number().int().nonnegative(),
  discoveredTargets: z.number().int().nonnegative(),
  /** Non-zero counts per {@link TargetDiscoveryKindSchema} value. */
  byKind: z.record(z.string(), z.number().int().nonnegative()),
  /** Discovered targets that carry a bounded after-state subtree capture. */
  withCapturedSubtree: z.number().int().nonnegative(),
  discoverySkipped: z.number().int().nonnegative(),
});
export type UserVisibleTargetSummary = z.infer<
  typeof UserVisibleTargetSummarySchema
>;

export const StorageSummarySchema = z.object({
  planBytes: z.number().int().nonnegative(),
  manifestBytes: z.number().int().nonnegative(),
  actionArtifactBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  averageBytesPerAction: z.number().int().nonnegative(),
});
export type StorageSummary = z.infer<typeof StorageSummarySchema>;

export const ExplorationRunStatusSchema = z.enum([
  "completed",
  "completed-with-errors",
  "plan-only",
]);
export type ExplorationRunStatus = z.infer<typeof ExplorationRunStatusSchema>;

/**
 * The live half's manifest (`interaction-exploration.json`).
 *
 * It records its two sources explicitly (item 8) and never claims to be an
 * atomic snapshot with them: Task 09 observed these pages at one moment and this
 * run clicked them at another, so a `not-found` locator can be honest live drift
 * rather than a resolver bug (item 70).
 */
export const InteractionExplorationSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  engine: z.string(),
  rootUrl: z.string(),

  sourceInteractionAnalysis: z.string(),
  sourceSiteObservation: z.string(),

  startedAt: z.string(),
  completedAt: z.string(),
  status: ExplorationRunStatusSchema,

  config: ExplorationConfigSchema,
  stats: ExplorationStatsSchema,

  /** Sorted by `pageId`. */
  pages: z.array(ExplorationPageSummarySchema),
  /** Sorted by `actionId` — never by completion order (item 69). */
  actions: z.array(ExplorationActionSummarySchema),

  /** Non-zero counts, in fixed vocabulary order. */
  actionStatusSummary: z.record(z.string(), z.number().int().nonnegative()),
  locatorStatusSummary: z.record(z.string(), z.number().int().nonnegative()),
  locatorStrategySummary: z.record(z.string(), z.number().int().nonnegative()),
  diffSummary: z.record(z.string(), z.number().int().nonnegative()),

  safetySummary: SafetySummarySchema,
  dynamicTargetSummary: DynamicTargetSummarySchema,
  /** Absent on v1/v2 artifacts (discovery did not exist yet). */
  userVisibleTargetSummary: UserVisibleTargetSummarySchema.optional(),
  storageSummary: StorageSummarySchema,

  /** Mutation caps hit across the run — a data-quality signal (item 53). */
  mutationTruncatedCount: z.number().int().nonnegative(),
});
export type InteractionExploration = z.infer<
  typeof InteractionExplorationSchema
>;
