import { z } from "zod";
import type { IdentitySurfaceResult, RenderProvenance, SiteIdentity } from "./site-identity.js";

/**
 * Slotized Recon Template V1 — schema (Task 29).
 *
 * The invariant this module exists to enforce:
 *
 *   TEMPLATE (layout/CSS/DOM) + VALUES (content pack) = RENDERED SITE
 *
 * Definitions (`slots.json`, `bindings.json`, `groups.json`, `repeaters.json`,
 * `theme.json`) say WHAT is editable and WHERE it lives; values live in a
 * separate, swappable `content-pack` / `theme-pack`. Rendering the DEFAULT
 * pack must reproduce the accepted reconstruction byte for byte — that
 * neutrality is asserted by the renderer, not assumed.
 *
 * Everything here is template-local: ids are hashes of THIS template's stable
 * inputs, keys are derived from THIS site's structure. There is no shared
 * Hero/Card/FAQ vocabulary and no industry schema — `role` and `patternHint`
 * are optional labels a UI may use, and rendering never depends on them.
 */

// ---------------------------------------------------------------------------
// Versions & file names
// ---------------------------------------------------------------------------

export const SLOTIZED_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const SLOTIZED_TEMPLATE_SCHEMA_NAME = "slotized-template-v1";
export const CONTENT_PACK_SCHEMA = "content-pack-v1";
export const THEME_PACK_SCHEMA = "theme-pack-v1";
export const SLOTIZED_COVERAGE_SCHEMA = "slotized-coverage-v1";
export const SLOTIZED_AUTHORING_SCHEMA = "slotized-authoring-v1";
export const SLOTIZED_RENDER_REPORT_SCHEMA = "slotized-render-report-v1";
export const SLOTIZED_ENGINE = "deterministic-slot-v2-to-slotized-template";

export const MANIFEST_FILE = "manifest.json";
export const SLOTS_FILE = "slots.json";
export const BINDINGS_FILE = "bindings.json";
export const GROUPS_FILE = "groups.json";
export const REPEATERS_FILE = "repeaters.json";
export const THEME_FILE = "theme.json";
export const AUTHORING_FILE = "authoring.json";
export const COVERAGE_FILE = "coverage.json";
export const CONTENT_PACKS_DIR = "content-packs";
export const THEME_PACKS_DIR = "theme-packs";
export const DEFAULT_PACK_FILE = "default.json";
export const TEMPLATE_DIR = "template";
export const TEMPLATE_SOURCE_FILE = "source.json";
export const TEMPLATE_ROUTE_MAP_FILE = "route-map.json";
export const TEMPLATE_PAGES_DIR = "pages";
export const RENDER_REPORT_FILE = "render-report.json";

/** The CSS class the renderer emits for `onEmpty: "hide-node" | "hide-group"`. */
export const HIDDEN_CLASS = "wr-slot-hidden";
export const HIDDEN_CSS_RULE = `.${HIDDEN_CLASS}{display:none!important}`;
export const OVERRIDE_HEADER = "\n/* wr-slotized overrides */\n";

export class SlotizedInputError extends Error {}
export class SlotizedCompileError extends Error {}
export class SlotizedRenderError extends Error {}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Closed type list. `rich-text`, `number`, `boolean`, `icon` and `structured`
 * exist in the schema because later phases need them; the Phase B compiler
 * assigns only `text | url | email | phone | image | video` (see
 * `slotize.ts` — numeric typing is deliberately NOT inferred because a
 * number→string round trip cannot be proven neutral).
 */
export const SlotTypeSchema = z.enum([
  "text",
  "rich-text",
  "number",
  "boolean",
  "url",
  "email",
  "phone",
  "image",
  "video",
  "icon",
  "structured",
]);
export type SlotType = z.infer<typeof SlotTypeSchema>;

/** `global` = shared across pages of THIS template only. Never cross-site. */
export const SlotScopeSchema = z.enum(["global", "page", "group", "repeater-item"]);
export type SlotScope = z.infer<typeof SlotScopeSchema>;

export const VariantSchema = z.enum(["desktop", "mobile"]);
export type Variant = z.infer<typeof VariantSchema>;

/**
 * Where a binding's occurrence lives.
 *   static            a node of the reconstructed page tree
 *   dynamic-template  a node inside a trigger's captured open-state template
 *   paint-twin        a proven aria-hidden painted duplicate of a visible slot
 *   svg-text          a character run inside a node's opaque inline SVG markup
 *   css-rule          a declaration of one generated stylesheet rule
 *   route-map         page metadata carried by the route map (title)
 *   repeater-field    a per-item field: a RELATIVE path inside a repeater item,
 *                     resolved against each rendered item root rather than a
 *                     global node id (Phase C — clones share their prototype's
 *                     `n`, so a global lookup would be ambiguous)
 */
export const BindingSurfaceSchema = z.enum([
  "static",
  "dynamic-template",
  "paint-twin",
  "svg-text",
  "css-rule",
  "route-map",
  "repeater-field",
]);
export type BindingSurface = z.infer<typeof BindingSurfaceSchema>;

export const BindingTargetSchema = z.enum([
  "textContent",
  "innerHTML",
  "attribute",
  "style",
  "metadata",
]);
export type BindingTarget = z.infer<typeof BindingTargetSchema>;

export const ImageFieldSchema = z.enum(["src", "alt", "srcset", "poster"]);
export type ImageField = z.infer<typeof ImageFieldSchema>;

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * `src: null` is a first-class state: SLOT CERTAINTY > ASSET FIDELITY — a
 * media slot is created whenever structure says media exists, even when the
 * asset could not be resolved.
 */
export const ImageSlotValueSchema = z
  .object({
    src: z.string().nullable(),
    alt: z.string().optional(),
    srcset: z.string().optional(),
  })
  .strict();
export type ImageSlotValue = z.infer<typeof ImageSlotValueSchema>;

export const VideoSlotValueSchema = z
  .object({
    src: z.string().nullable(),
    poster: z.string().nullable().optional(),
  })
  .strict();
export type VideoSlotValue = z.infer<typeof VideoSlotValueSchema>;

export const StructuredSlotValueSchema = z.record(z.string(), z.unknown());

export const SlotValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  ImageSlotValueSchema,
  VideoSlotValueSchema,
  StructuredSlotValueSchema,
]);
export type SlotValue = z.infer<typeof SlotValueSchema>;

// ---------------------------------------------------------------------------
// Slot definition
// ---------------------------------------------------------------------------

/**
 * Fit hints are CHEAP by contract: character counts from the source value and
 * geometry that was already measured. Nothing here re-measures, re-renders or
 * rewrites text — a violated hint is a CONTENT_FIT_WARNING, never an edit.
 */
export const FitHintsSchema = z
  .object({
    sourceChars: z.number().int().nonnegative().optional(),
    sourceWords: z.number().int().nonnegative().optional(),
    recommendedMaxChars: z.number().int().positive().optional(),
    lineCount: z.number().optional(),
    aspectRatio: z.number().optional(),
    orientation: z.enum(["landscape", "portrait", "square"]).optional(),
    recommendedWidth: z.number().optional(),
    recommendedHeight: z.number().optional(),
  })
  .strict();
export type FitHints = z.infer<typeof FitHintsSchema>;

export const SlotConstraintsSchema = z
  .object({
    required: z.boolean().optional(),
    minChars: z.number().int().nonnegative().optional(),
    maxChars: z.number().int().positive().optional(),
    pattern: z.string().optional(),
    /** url/email/phone slots: which schemes a replacement value may use. */
    allowedSchemes: z.array(z.string()).optional(),
    /** media slots: acceptable file kinds, purely advisory for an editor. */
    mediaKinds: z.array(z.string()).optional(),
  })
  .strict();
export type SlotConstraints = z.infer<typeof SlotConstraintsSchema>;

export const SlotBehaviorSchema = z
  .object({
    onEmpty: z.enum(["keep", "hide-node", "hide-group", "placeholder"]),
    /** `hide-group` needs to know WHICH group collapses. */
    hideGroupId: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .strict();
export type SlotBehavior = z.infer<typeof SlotBehaviorSchema>;

export const SlotEditorSchema = z
  .object({
    control: z
      .enum(["text", "textarea", "url", "email", "phone", "image", "video", "toggle", "number"])
      .optional(),
    multiline: z.boolean().optional(),
    order: z.number().int().optional(),
    help: z.string().optional(),
  })
  .strict();
export type SlotEditor = z.infer<typeof SlotEditorSchema>;

export const SlotProvenanceSchema = z
  .object({
    /** `slot-v2` = carried from the Task 18/19.1 contract; `surface-scan` = new. */
    source: z.enum(["slot-v2", "surface-scan"]),
    slotV2Id: z.string().optional(),
    /** Compact observed-evidence tags (`landmark:header`, `tag:img`, …). */
    evidence: z.array(z.string()),
    /** Merge decisions this slot is the result of (`global:certain`, …). */
    notes: z.array(z.string()).optional(),
  })
  .strict();
export type SlotProvenance = z.infer<typeof SlotProvenanceSchema>;

export const SLOT_ID_RE = /^slot_[0-9a-f]{12}$/;
export const BINDING_ID_RE = /^bind_[0-9a-f]{12}$/;
export const GROUP_ID_RE = /^grp_[0-9a-f]{12}$/;
export const REPEATER_ID_RE = /^rep_[0-9a-f]{12}$/;
export const ITEM_ID_RE = /^item_[0-9a-f]{12}$/;
export const TOKEN_ID_RE = /^tok_[0-9a-f]{12}$/;

export const SlotDefinitionSchema = z
  .object({
    id: z.string().regex(SLOT_ID_RE),
    /** Template-local, unique, human-meaningful (`home.main.image.f0283`). */
    key: z.string().min(1),
    type: SlotTypeSchema,
    role: z.string().optional(),
    label: z.string().optional(),
    scope: SlotScopeSchema,
    /** page-scope slots only. */
    pageId: z.string().optional(),
    route: z.string().optional(),
    /**
     * Set on `repeater-item` field slots (the repeater they are a field of)
     * AND on page slots that live INSIDE a repeater item — the latter keep
     * working (default render stays byte-neutral) but are superseded whenever
     * a content pack drives that repeater. See `repeaters.ts`.
     */
    repeaterId: z.string().optional(),
    defaultValue: SlotValueSchema,
    bindingIds: z.array(z.string()).min(1),
    constraints: SlotConstraintsSchema.optional(),
    fitHints: FitHintsSchema.optional(),
    behavior: SlotBehaviorSchema.optional(),
    editor: SlotEditorSchema.optional(),
    provenance: SlotProvenanceSchema.optional(),
  })
  .strict();
export type SlotDefinition = z.infer<typeof SlotDefinitionSchema>;

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

/**
 * DIRECT COMPILE: a binding addresses an EXISTING node/attribute/CSS
 * declaration. No wrapper element is ever inserted, so a value change cannot
 * change layout by itself.
 *
 * `nodeId`/`variant` are absent for surfaces that have no DOM node — the
 * route-map metadata surface. (This is the one shape adaptation over the
 * frozen contract sketch: making them required would have forced a fake node.)
 */
export const BindingAddressSchema = z
  .object({
    surface: BindingSurfaceSchema,
    /** dynamic-template: which observed-target entry on the trigger. */
    discoveryId: z.string().optional(),
    /** dynamic-template: the element inside that entry's template. */
    templateNodeId: z.string().optional(),
    /** textContent: absolute index into the owner's children array. */
    childIndex: z.number().int().nonnegative().optional(),
    /** textContent: index among TEXT children only (human readability). */
    textSegment: z.number().int().nonnegative().optional(),
    /** svg-text: index of the character run in document order. */
    svgTextIndex: z.number().int().nonnegative().optional(),
    svgTextPath: z.string().optional(),
    /** css-rule: the exact selector of the generated stylesheet rule. */
    cssSelector: z.string().optional(),
    /** css-rule: the enclosing at-rule prelude, when the rule is nested. */
    mediaCondition: z.string().optional(),
    /** route-map: which metadata key (only `title` is representable today). */
    metadataKey: z.string().optional(),
    routeId: z.string().optional(),
    /** repeater-field: which repeater this field belongs to. */
    repeaterId: z.string().optional(),
    /**
     * repeater-field: `.`-joined child indexes from the ITEM ROOT to the owner
     * element (`""` = the item root itself). Indexes address `node.c`, so they
     * count text children too — the same coordinate system `childIndex` uses.
     */
    itemPath: z.string().optional(),
    /** repeater-field: position of the field within the item (stable order). */
    fieldIndex: z.number().int().nonnegative().optional(),
  })
  .strict();
export type BindingAddress = z.infer<typeof BindingAddressSchema>;

export const BindingSchema = z
  .object({
    id: z.string().regex(BINDING_ID_RE),
    slotId: z.string().regex(SLOT_ID_RE),
    pageId: z.string(),
    nodeId: z.string().optional(),
    variant: VariantSchema.optional(),
    target: BindingTargetSchema,
    /** attribute: the prop name; style: the CSS property. */
    property: z.string().optional(),
    /** Which field of a composite (image/video) value this binding writes. */
    field: ImageFieldSchema.optional(),
    address: BindingAddressSchema,
    /** Guard: the applier refuses to write if the address no longer holds it. */
    expectedValue: z.string().optional(),
    /**
     * How the value is projected onto the target. `background-image-url-replace`
     * swaps only the first `url(...)` of a multi-layer background value, so
     * gradients and layer order survive a replacement.
     */
    transform: z.enum(["identity", "background-image-url-replace"]).optional(),
    condition: z.string().optional(),
  })
  .strict();
export type Binding = z.infer<typeof BindingSchema>;

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export const GroupKindSchema = z.enum(["page", "section", "cluster", "action", "global"]);
export type GroupKind = z.infer<typeof GroupKindSchema>;

export const GroupDefinitionSchema = z
  .object({
    id: z.string().regex(GROUP_ID_RE),
    key: z.string().min(1),
    label: z.string().optional(),
    kind: GroupKindSchema,
    pageId: z.string().optional(),
    /** Desktop-tree anchor; groups are logical and span both variants. */
    rootNodeId: z.string().optional(),
    slotIds: z.array(z.string()),
    childGroupIds: z.array(z.string()),
    repeaterIds: z.array(z.string()).optional(),
    /** Optional label only. Rendering NEVER depends on it. */
    patternHint: z.string().optional(),
  })
  .strict();
export type GroupDefinition = z.infer<typeof GroupDefinitionSchema>;

// ---------------------------------------------------------------------------
// Repeaters (shape frozen here; Phase C implements the engine)
// ---------------------------------------------------------------------------

export const RepeaterItemSchema = z
  .object({
    id: z.string().regex(ITEM_ID_RE),
    /** field slot id → value. */
    values: z.record(z.string(), SlotValueSchema),
    /** Index of the source item this default came from. */
    sourceIndex: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RepeaterItem = z.infer<typeof RepeaterItemSchema>;

/**
 * The prototype is an EXISTING reconstructed item subtree (never synthesized):
 * clone + inject. `variantPrototypes` keeps one prototype per variant because
 * desktop and mobile items are independent trees.
 */
export const RepeaterPrototypeSchema = z
  .object({
    protoNodeId: z.string(),
    variantPrototypes: z.record(z.string(), z.string()).optional(),
    sourceItemIndex: z.number().int().nonnegative().optional(),
    /** How many source items the prototype was chosen from. */
    sourceItemCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RepeaterPrototype = z.infer<typeof RepeaterPrototypeSchema>;

export const RepeaterOperationsSchema = z
  .object({
    add: z.boolean(),
    remove: z.boolean(),
    reorder: z.boolean(),
    duplicate: z.boolean(),
  })
  .strict();

/**
 * `fixed`   the container cannot take a different item count (explicit grid)
 * `bounded` it can, within a verified range
 * `flow`    wraps freely (flex-wrap / auto-fill grid)
 * `stack`   vertical list, effectively unbounded
 * Inferred CONSERVATIVELY from CSS; `verifiedCapacity` is only ever written
 * after an actual render test (Phase C), never from inference.
 */
export const GrowthPolicySchema = z.enum(["fixed", "bounded", "flow", "stack"]);

/**
 * One variant's concrete geometry. Desktop and mobile are independent trees,
 * so every node id below is variant-local; `itemNodeIds` is aligned index by
 * index with `defaultItems`.
 */
export const RepeaterVariantLayoutSchema = z
  .object({
    containerNodeId: z.string(),
    protoNodeId: z.string(),
    protoSourceIndex: z.number().int().nonnegative(),
    itemNodeIds: z.array(z.string()),
    /** Sibling children of the container that are NOT items (kept static). */
    staticSiblings: z.number().int().nonnegative(),
  })
  .strict();
export type RepeaterVariantLayout = z.infer<typeof RepeaterVariantLayoutSchema>;

export const RepeaterDefinitionSchema = z
  .object({
    id: z.string().regex(REPEATER_ID_RE),
    key: z.string().min(1),
    label: z.string().optional(),
    pageId: z.string().optional(),
    scope: SlotScopeSchema.optional(),
    containerNodeId: z.string(),
    variantContainers: z.record(z.string(), z.string()).optional(),
    itemPrototype: RepeaterPrototypeSchema,
    /** Slot ids that are per-item fields (scope `repeater-item`). */
    itemSlots: z.array(z.string()),
    defaultItems: z.array(RepeaterItemSchema),
    operations: RepeaterOperationsSchema,
    growthPolicy: GrowthPolicySchema,
    minItems: z.number().int().nonnegative(),
    maxItems: z.number().int().positive().optional(),
    verifiedCapacity: z
      .object({
        min: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
        method: z.string(),
        verifiedAt: z.string(),
      })
      .strict()
      .optional(),
    layoutPolicy: z
      .object({
        display: z.string().optional(),
        wrap: z.string().optional(),
        columns: z.number().int().positive().optional(),
        gap: z.string().optional(),
        notes: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    variants: z.array(VariantSchema).optional(),
    /** variant → that variant's container/prototype/item node ids. */
    variantLayouts: z.record(z.string(), RepeaterVariantLayoutSchema).optional(),
    /** Number of source items (= defaultItems.length). */
    itemCount: z.number().int().nonnegative().optional(),
    /**
     * True when the desktop and mobile candidates were proven to be the SAME
     * logical list (identical item count AND identical ordered field values)
     * and therefore share one set of items. False = variant-local repeater.
     */
    paired: z.boolean().optional(),
    groupId: z.string().optional(),
    patternHint: z.string().optional(),
    provenance: SlotProvenanceSchema.optional(),
  })
  .strict();
export type RepeaterDefinition = z.infer<typeof RepeaterDefinitionSchema>;

// ---------------------------------------------------------------------------
// Theme (shape only; Phase D implements extraction + overlay)
// ---------------------------------------------------------------------------

export const ThemeTokenKindSchema = z.enum([
  "color",
  "font-family",
  "radius",
  "shadow",
  "spacing-candidate",
]);

/**
 * `risk` exists so a theme edit can never reach layout: display/grid/position/
 * width/height/transform/z-index/font-size/line-height are not expressible as
 * tokens at all, and `locked` tokens are read-only even among those that are.
 */
export const ThemeTokenDefinitionSchema = z
  .object({
    id: z.string().regex(TOKEN_ID_RE),
    key: z.string().min(1),
    label: z.string().optional(),
    kind: ThemeTokenKindSchema,
    value: z.string(),
    risk: z.enum(["safe", "guarded", "locked"]),
    targets: z.array(
      z
        .object({
          cssSelector: z.string(),
          property: z.string(),
          mediaCondition: z.string().optional(),
        })
        .strict(),
    ),
    usageCount: z.number().int().nonnegative().optional(),
    provenance: SlotProvenanceSchema.optional(),
  })
  .strict();
export type ThemeTokenDefinition = z.infer<typeof ThemeTokenDefinitionSchema>;

export const ThemePackSchema = z
  .object({
    schemaVersion: z.literal(SLOTIZED_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal(THEME_PACK_SCHEMA),
    templateId: z.string(),
    templateVersion: z.string(),
    label: z.string().optional(),
    /** token id → replacement value. */
    tokens: z.record(z.string(), z.string()),
    /** Escape hatch for Phase D overlay CSS the token model cannot express. */
    extraCss: z.string().optional(),
  })
  .strict();
export type ThemePack = z.infer<typeof ThemePackSchema>;

// ---------------------------------------------------------------------------
// Content pack
// ---------------------------------------------------------------------------

export const ContentPackSchema = z
  .object({
    schemaVersion: z.literal(SLOTIZED_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal(CONTENT_PACK_SCHEMA),
    templateId: z.string(),
    templateVersion: z.string(),
    label: z.string().optional(),
    slots: z.record(z.string(), SlotValueSchema),
    repeaters: z.record(
      z.string(),
      z
        .object({ items: z.array(RepeaterItemSchema) })
        .strict(),
    ),
  })
  .strict();
export type ContentPack = z.infer<typeof ContentPackSchema>;

// ---------------------------------------------------------------------------
// Manifest + template source pointer
// ---------------------------------------------------------------------------

export const TemplateSourceSchema = z
  .object({
    host: z.string(),
    rootUrl: z.string(),
    /** The Slot V2 run this template was compiled from. */
    reconTemplateDir: z.string(),
    reconTemplateRunId: z.string(),
    reconstructionAppDir: z.string(),
    reconstructionRunId: z.string(),
    siteSpecDir: z.string(),
    generatedStylesRelPath: z.string(),
    breakpoint: z.number(),
  })
  .strict();
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;

export const SlotizedManifestSchema = z
  .object({
    schemaVersion: z.literal(SLOTIZED_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal(SLOTIZED_TEMPLATE_SCHEMA_NAME),
    engine: z.literal(SLOTIZED_ENGINE),
    templateId: z.string(),
    /** sha256 over the definition files — changes iff the template changes. */
    templateVersion: z.string(),
    runId: z.string(),
    createdAt: z.string(),
    source: TemplateSourceSchema,
    counts: z.record(z.string(), z.number()),
    limitations: z.array(z.string()),
  })
  .strict();
export type SlotizedManifest = z.infer<typeof SlotizedManifestSchema>;

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export const COVERAGE_CLASSES = [
  "visibleText",
  "links",
  "images",
  "backgroundMedia",
  "video",
  "alt",
  "ariaLabel",
  "titlePlaceholder",
  "metadata",
] as const;
export type CoverageClass = (typeof COVERAGE_CLASSES)[number];

/** Why an ELIGIBLE surface did not become a slot. Honest, not cosmetic. */
export const UnslottedReasonSchema = z.enum([
  "aria-hidden",
  "svg-internal",
  "decorative",
  "script-style",
  "whitespace",
  "unresolved",
  "framework-attr",
  "infrastructure",
  "duplicate-occurrence",
  "not-represented",
]);
export type UnslottedReason = z.infer<typeof UnslottedReasonSchema>;

export const CoverageFileSchema = z
  .object({
    schemaVersion: z.literal(SLOTIZED_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal(SLOTIZED_COVERAGE_SCHEMA),
    templateId: z.string(),
    classes: z.array(
      z
        .object({
          class: z.enum(COVERAGE_CLASSES),
          eligible: z.number().int().nonnegative(),
          slotted: z.number().int().nonnegative(),
          unslotted: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    unslotted: z.array(
      z
        .object({
          class: z.enum(COVERAGE_CLASSES),
          pageId: z.string(),
          variant: VariantSchema.optional(),
          nodeId: z.string().optional(),
          detail: z.string().optional(),
          reason: UnslottedReasonSchema,
        })
        .strict(),
    ),
    /**
     * Slots that look shared across pages but were NOT merged into a global:
     * same value + same target shape, outside the header/footer shell. A wrong
     * merge is worse than two slots, so these stay local and get reported.
     */
    likelyGlobal: z.array(
      z
        .object({
          signature: z.string(),
          sampleKey: z.string(),
          pageCount: z.number().int().nonnegative(),
          slotIds: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export type CoverageFile = z.infer<typeof CoverageFileSchema>;

// ---------------------------------------------------------------------------
// Authoring projection (derived view — NEVER a source of truth)
// ---------------------------------------------------------------------------

export interface AuthoringSlot {
  id: string;
  key: string;
  label?: string;
  type: SlotType;
  role?: string;
  scope: SlotScope;
  value: SlotValue;
  fitHints?: FitHints;
  constraints?: SlotConstraints;
  bindingCount: number;
  variants: Variant[];
}

export interface AuthoringRepeater {
  id: string;
  key: string;
  label?: string;
  patternHint?: string;
  itemCount: number;
  growthPolicy: z.infer<typeof GrowthPolicySchema>;
  minItems: number;
  maxItems?: number;
  operations: z.infer<typeof RepeaterOperationsSchema>;
  variants: Variant[];
  paired: boolean;
  /** The per-item FIELDS (scope `repeater-item`), with item 0's values. */
  fields: AuthoringSlot[];
}

export interface AuthoringGroup {
  id: string;
  key: string;
  label?: string;
  kind: GroupKind;
  patternHint?: string;
  slots: AuthoringSlot[];
  repeaters?: AuthoringRepeater[];
  groups: AuthoringGroup[];
}

export interface AuthoringPage {
  pageId: string;
  route?: string;
  title?: string;
  groups: AuthoringGroup[];
}

export interface AuthoringFile {
  schemaVersion: typeof SLOTIZED_TEMPLATE_SCHEMA_VERSION;
  schemaName: typeof SLOTIZED_AUTHORING_SCHEMA;
  templateId: string;
  templateVersion: string;
  globals: AuthoringGroup[];
  pages: AuthoringPage[];
}

// ---------------------------------------------------------------------------
// Render report
// ---------------------------------------------------------------------------

export interface RenderWarning {
  code:
    | "CONTENT_FIT_WARNING"
    | "MEDIA_SRC_EMPTY"
    | "UNKNOWN_SLOT"
    | "TYPE_MISMATCH"
    | "MISSING_SLOT"
    | "DUPLICATE_ID"
    /** A stale `srcSet` was dropped after its node's `src` was replaced. */
    | "STALE_SRCSET_STRIPPED"
    | "NEUTRALITY_DRIFT"
    /** A theme pack changed a `guarded` token (large blast radius); applied anyway. */
    | "THEME_GUARDED_TOKEN"
    /** The pack asks a `bounded` repeater for more items than were observed. */
    | "REPEATER_CAPACITY_UNVERIFIED"
    /** The pack asks a `fixed` repeater for more items than were observed. */
    | "REPEATER_FIXED_EXCEEDED"
    /** A `fixed` repeater was asked for a different item count at all. */
    | "REPEATER_FIXED_COUNT_CHANGED"
    /** A field's address no longer holds the value it was compiled against. */
    | "REPEATER_GUARD_MISMATCH"
    /** Non-item children sat BETWEEN items; they moved after the item block. */
    | "REPEATER_STATIC_SIBLING_MOVED"
    /** Page-slot bindings inside a driven repeater were not applied. */
    | "REPEATER_SUPERSEDED_BINDINGS"
    /** An inner repeater was skipped because its outer one was driven too. */
    | "REPEATER_NESTED_SKIPPED"
    /** The pack references a repeater/item/field this template does not have. */
    | "REPEATER_UNKNOWN"
    /** A SiteIdentity surface could not be patched (anchor missing) — left as copied. */
    | "SITE_IDENTITY_SURFACE_UNPATCHED"
    /** SiteIdentity has no publicOrigin: route-map URLs were made root-relative. */
    | "SITE_IDENTITY_ORIGIN_MISSING";
  slotId?: string;
  bindingId?: string;
  repeaterId?: string;
  message: string;
}

/** Per-repeater accounting for one variant of one page. */
export interface RepeaterRenderEntry {
  id: string;
  key: string;
  pageId: string;
  variant: Variant;
  defaultCount: number;
  renderedCount: number;
  added: number;
  removed: number;
  reordered: boolean;
  clonedNodes: number;
  namespacedIds: number;
  fieldsApplied: number;
  fieldsSkipped: number;
  /** Nodes this repeater claimed; their page-slot bindings are skipped. */
  supersededNodes: number;
  warnings: string[];
}

export interface RenderReport {
  schemaVersion: typeof SLOTIZED_TEMPLATE_SCHEMA_VERSION;
  schemaName: typeof SLOTIZED_RENDER_REPORT_SCHEMA;
  templateId: string;
  templateVersion: string;
  contentPackTemplateVersion: string;
  themePack?: string;
  runId: string;
  createdAt: string;
  outDir: string;
  applied: number;
  skipped: number;
  failed: Array<{ bindingId: string; reason: string }>;
  warnings: RenderWarning[];
  overrides: number;
  routes: number;
  pages: number;
  repeaters: RepeaterRenderEntry[];
  duplicateIds: {
    /** Duplicate DOM ids the ACCEPTED reconstruction already contained. */
    baseline: number;
    /** Duplicates this render introduced — the gate. Must be 0. */
    introduced: number;
    samples: string[];
  };
  /** Where the template came from. Always recorded; never rewritten by identity. */
  provenance: RenderProvenance;
  /** Task 29.1: the rendered site's identity, when `--identity` was given. */
  siteIdentity?: SiteIdentity;
  identitySurfaces?: IdentitySurfaceResult[];
  /** `--assert-neutral`: default pack must reproduce the source byte for byte. */
  neutralityChecked: boolean;
  neutral?: boolean;
  neutralityDiffs?: string[];
}
