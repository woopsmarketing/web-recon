import { z } from "zod";

/**
 * Recon Template Foundation & Slot V2 — types (Task 18).
 *
 * This layer turns TWO immutable inputs — an accepted Exact Reconstruction run
 * and the SiteSpec it was generated from — into ONE new artifact: a Recon
 * Template. The separation is the whole architecture:
 *
 *   SiteSpec              = observed facts             (immutable, Task 13)
 *   Exact Reconstruction  = the answer sheet           (immutable, Task 14–17.1)
 *   Recon Template        = design kept, content freed (THIS Task's artifact)
 *
 * A Recon Template is "the cloned site's design + an editable content
 * contract". It never edits the Exact Reconstruction and never adds slot
 * fields to the SiteSpec — it is compiled FROM them into its own namespace:
 *
 *   data/<host>/recon-templates/<run-id>/
 *     manifest.json               recon-template-v1, lineage back to both inputs
 *     site-map.json               minimal site map from facts already on disk
 *     slots.json                  Slot V2 definitions (this file's schemas)
 *     default-content.json        original values — rendering these MUST equal
 *                                 the Exact Reconstruction (the core invariant)
 *     slot-bindings.json          slot → DOM occurrence bindings
 *     slot-overrides.example.json documented no-op override file
 *     report/slot-summary.json    human-reviewable catalog
 *     app/                        the template app (exact app + slot layer)
 *
 * Slot V2 philosophy (site-specific key + canonical role): slot KEYS are
 * derived from THIS site's structure and differ between sites; the ROLE field
 * is the small shared vocabulary (`hero.headline`, `navigation.label`, …).
 * Role assignment is deterministic and conservative — an uncertain slot gets a
 * generic role, never a guessed semantic one. There is no AI and no fuzzy
 * score anywhere in this module.
 */

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** Bumped when the shape of anything this Task persists changes. */
export const RECON_TEMPLATE_SCHEMA_VERSION = 1 as const;

/**
 * The Slot V2 contract version. Version 2 (Task 19.1) is ADDITIVE over
 * version 1: the `paint-twin` binding surface and the `svg-text` binding
 * target exist only in v2 artifacts, and every v2 reader still accepts v1
 * artifacts unchanged — historical Task 18 runs are never rewritten.
 */
export const SLOT_SCHEMA_VERSION = 2 as const;

/** Slot schema versions a reader accepts (writers always emit the current one). */
export const ACCEPTED_SLOT_SCHEMA_VERSIONS = [1, 2] as const;

/** Bumped when the compiler's output changes without a schema change. */
export const TEMPLATE_COMPILER_VERSION = 2 as const;

/** Recorded in the manifest so a reader can tell what produced the artifact. */
export const TEMPLATE_ENGINE = "deterministic-exact-to-recon-template";

/** Fixed file / directory names inside a recon-template run directory. */
export const TEMPLATE_MANIFEST_FILE = "manifest.json";
export const SITE_MAP_FILE = "site-map.json";
export const SLOTS_FILE = "slots.json";
export const DEFAULT_CONTENT_FILE = "default-content.json";
export const SLOT_BINDINGS_FILE = "slot-bindings.json";
export const SLOT_OVERRIDES_EXAMPLE_FILE = "slot-overrides.example.json";
export const REPORT_DIR = "report";
export const SLOT_SUMMARY_FILE = "slot-summary.json";
export const TEMPLATE_APP_DIR = "app";
/** The app-local copy of the content contract (template app independence). */
export const TEMPLATE_DATA_DIR = "template-data";

// ---------------------------------------------------------------------------
// Slot vocabulary
// ---------------------------------------------------------------------------

/**
 * MVP slot types. Deliberately closed: arbitrary HTML slots are forbidden by
 * contract — no script, style, event handler or raw markup may ever be a slot
 * value, so no type exists that could carry one.
 */
export const SlotTypeSchema = z.enum(["text", "url", "image"]);
export type SlotType = z.infer<typeof SlotTypeSchema>;

/** MVP scopes. Global grouping is conservative; uncertain content stays page. */
export const SlotScopeSchema = z.enum(["global", "page"]);
export type SlotScope = z.infer<typeof SlotScopeSchema>;

/**
 * Editable-content relevance. `review` marks a slot the extractor admitted on
 * evidence but flags for a human pass (e.g. one item of a very large uniform
 * list, such as a 200-entry locale menu). Excluded candidates (aria-hidden
 * decorative subtrees etc.) never become slots at all — they are counted in
 * the report instead.
 */
export const EditabilitySchema = z.enum(["editable", "review"]);
export type Editability = z.infer<typeof EditabilitySchema>;

/**
 * Where a binding's DOM occurrence lives.
 *
 *   static           — a node of the reconstructed page tree
 *   dynamic-template — a node inside a captured open-state template that the
 *                      InteractionRuntime mounts on interaction (Task 17.1
 *                      observed targets, carried in `data-wr-obs`)
 *   paint-twin       — an aria-hidden static-tree occurrence that is PROVEN
 *                      (Task 19.1 deterministic evidence: same page+viewport,
 *                      byte-equal text, close ancestry, overlapping observed
 *                      boxes) to be the painted visual duplicate of a slotted
 *                      visible occurrence — e.g. Stripe's gradient heading
 *                      copies. A paint twin is never its own slot; it is an
 *                      additional occurrence of the visible slot so the two
 *                      layers can never desynchronize.
 *
 * All are first-class: a nav label that exists in the desktop static header
 * AND in the mobile portal menu is ONE logical slot with two bindings, and a
 * template that only slotized the static DOM would leave the mobile menu
 * showing stale content.
 */
export const SlotSurfaceSchema = z.enum(["static", "dynamic-template", "paint-twin"]);
export type SlotSurface = z.infer<typeof SlotSurfaceSchema>;

/**
 * Canonical role vocabulary (Slot V2). Site-specific keys + this shared role
 * axis. Only deterministically certain structures get a specific role; the
 * generic fallbacks are `content.text` / `link.label` / `link.href` /
 * `image.content`.
 */
export const SLOT_ROLES = [
  "brand.logo",
  "navigation.label",
  "navigation.href",
  "heading.primary",
  "heading.secondary",
  "hero.headline",
  "hero.description",
  "cta.label",
  "cta.href",
  "content.text",
  "link.label",
  "link.href",
  "image.content",
  "footer.text",
] as const;
export const SlotRoleSchema = z.enum(SLOT_ROLES);
export type SlotRole = z.infer<typeof SlotRoleSchema>;

/** URL classification recorded on `url` slots. */
export const UrlKindSchema = z.enum(["internal", "external", "tel", "mailto", "hash"]);
export type UrlKind = z.infer<typeof UrlKindSchema>;

/**
 * Attribute names a URL slot may bind. Closed on purpose: script src,
 * stylesheet href, preload href, form action, iframe src and every other
 * infrastructure URL is structurally unreachable (the extractor only ever
 * reads `href` off `<a>`/`<area>` and image props off `<img>`), and this
 * list documents that contract where a reviewer will look for it.
 */
export const URL_SLOT_ATTRIBUTES = ["href"] as const;

/** Deterministic id helpers (zero-padded like every other id in this repo). */
export function slotId(n: number): string {
  return `sl${String(n).padStart(6, "0")}`;
}
export function bindingId(n: number): string {
  return `b${String(n).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Slot values
// ---------------------------------------------------------------------------

/**
 * An image slot value is an object, not a bare string: the alt text belongs to
 * the image it describes, and a future content generator needs both together.
 * `srcset` is carried when the original had one so the default render can keep
 * the exact responsive sources; a replacement value may omit it (the applier
 * then drops the original srcset so the new src actually wins).
 */
export const ImageSlotValueSchema = z
  .object({
    src: z.string(),
    alt: z.string().optional(),
    srcset: z.string().optional(),
  })
  .strict();
export type ImageSlotValue = z.infer<typeof ImageSlotValueSchema>;

export const SlotValueSchema = z.union([z.string(), ImageSlotValueSchema]);
export type SlotValue = z.infer<typeof SlotValueSchema>;

// ---------------------------------------------------------------------------
// Constraints — observed references, never invented limits
// ---------------------------------------------------------------------------

/**
 * Text constraints record what the ORIGINAL did, per viewport, so the next
 * (content generation) phase can be told "the original was 2 lines on desktop
 * and 3 on mobile". No `maxCharacters` is invented here — deriving a safe
 * maximum is explicitly a later problem.
 */
export const TextViewportReferenceSchema = z
  .object({
    /** Bounding box of the element that directly contains the text. */
    width: z.number(),
    height: z.number(),
    /** height / line-height, when line-height resolved to a pixel value. */
    lineCount: z.number().optional(),
  })
  .strict();

export const TextConstraintsSchema = z
  .object({
    sourceCharacterCount: z.number(),
    sourceWordCount: z.number(),
    desktop: TextViewportReferenceSchema.optional(),
    mobile: TextViewportReferenceSchema.optional(),
    whiteSpace: z.string().optional(),
    lineClamp: z.string().optional(),
    overflow: z.string().optional(),
  })
  .strict();
export type TextConstraints = z.infer<typeof TextConstraintsSchema>;

export const ImageViewportReferenceSchema = z
  .object({
    renderedWidth: z.number(),
    renderedHeight: z.number(),
    /** renderedWidth / renderedHeight, rounded to 4 decimals. */
    aspectRatio: z.number().optional(),
  })
  .strict();

export const ImageConstraintsSchema = z
  .object({
    desktop: ImageViewportReferenceSchema.optional(),
    mobile: ImageViewportReferenceSchema.optional(),
    objectFit: z.string().optional(),
    objectPosition: z.string().optional(),
  })
  .strict();
export type ImageConstraints = z.infer<typeof ImageConstraintsSchema>;

export const SlotConstraintsSchema = z.union([TextConstraintsSchema, ImageConstraintsSchema]);
export type SlotConstraints = z.infer<typeof SlotConstraintsSchema>;

// ---------------------------------------------------------------------------
// Slot definition (slots.json)
// ---------------------------------------------------------------------------

export const SlotDefinitionSchema = z
  .object({
    /** Deterministic `sl000001…`, assigned after a stable sort. */
    id: z.string().regex(/^sl\d{6}$/),
    /** Site-specific key, unique per template, e.g. `home.header.nav.payments.label`. */
    key: z.string().min(1),
    /** Human-readable label derived from the key. */
    label: z.string().min(1),
    /** Canonical role — the cross-site semantic axis. */
    role: SlotRoleSchema,
    type: SlotTypeSchema,
    scope: SlotScopeSchema,
    /** Page-scope slots: the page source this slot belongs to. */
    pageId: z.string().optional(),
    /** Page-scope slots: the page's canonical route (first route serving it). */
    route: z.string().optional(),
    /** Related slots (e.g. a CTA's label + href) share a groupId. */
    groupId: z.string().optional(),
    editability: EditabilitySchema,
    /** URL slots only: deterministic classification of the default href. */
    urlKind: UrlKindSchema.optional(),
    defaultValue: SlotValueSchema,
    /** Binding ids in `slot-bindings.json`, in deterministic order. */
    bindingIds: z.array(z.string()).min(1),
    constraints: SlotConstraintsSchema.optional(),
    /**
     * Why this slot exists / why it was classified this way — compact
     * observed-evidence tags (`landmark:header`, `tag:h1`, `surface:dynamic-template`).
     */
    evidence: z.array(z.string()),
    /** Everything in this file is derived from observed artifacts by rules. */
    provenance: z.literal("derived"),
    /** Manual override operations that touched this slot, in applied order. */
    appliedOverrides: z.array(z.string()).optional(),
  })
  .strict();
export type SlotDefinition = z.infer<typeof SlotDefinitionSchema>;

/** Reader-side acceptance: v1 (Task 18) and v2 (Task 19.1) artifacts both load. */
const AcceptedSlotSchemaVersion = z
  .union([z.literal(1), z.literal(2)])
  .refine((v): v is 1 | 2 => (ACCEPTED_SLOT_SCHEMA_VERSIONS as readonly number[]).includes(v));

export const SlotsFileSchema = z
  .object({
    schemaVersion: z.literal(RECON_TEMPLATE_SCHEMA_VERSION),
    slotSchemaVersion: AcceptedSlotSchemaVersion,
    templateId: z.string(),
    slots: z.array(SlotDefinitionSchema),
  })
  .strict();
export type SlotsFile = z.infer<typeof SlotsFileSchema>;

// ---------------------------------------------------------------------------
// Slot bindings (slot-bindings.json)
// ---------------------------------------------------------------------------

/**
 * One binding = one DOM occurrence of a slot's value. A slot may have many
 * (desktop + mobile, static + dynamic-template, repeated CTAs), and applying a
 * value MUST change every occurrence.
 *
 * Addressing:
 *   static            (pageId, viewport, nodeId [, childIndex for text])
 *   dynamic-template  (pageId, viewport, nodeId = TRIGGER element,
 *                      discoveryId, templateNodeId [, childIndex for text])
 *
 * Text bindings address ONE text node (`childIndex` into the runtime node's
 * children array; `textSegment` is the same position counted among text
 * children only, kept for human readability) — never `element.textContent`,
 * so nested markup like `<p>Start with <strong>Stripe</strong> today</p>`
 * survives a replacement of any one of its segments.
 *
 * `expectedValue` is a guard: the applier verifies the addressed value still
 * equals it before writing, so a stale or hand-edited binding can never
 * silently rewrite the wrong node.
 */
export const SlotBindingSchema = z
  .object({
    bindingId: z.string().regex(/^b\d{6}$/),
    slotId: z.string().regex(/^sl\d{6}$/),
    /** Image slots: which field of the image value this binding writes. */
    field: z.enum(["src", "alt", "srcset"]).optional(),
    pageId: z.string(),
    viewport: z.enum(["desktop", "mobile"]),
    surface: SlotSurfaceSchema,
    /** Static: the element owning the text/attribute. Dynamic: the trigger. */
    nodeId: z.string(),
    /** Dynamic-template only: which observed-target entry on the trigger. */
    discoveryId: z.string().optional(),
    /** Dynamic-template only: the element inside that entry's template. */
    templateNodeId: z.string().optional(),
    /**
     * `svg-text` (Slot V2 v2): the occurrence is a rendered character run
     * inside the owner's opaque inline-SVG markup (`node.v`), addressed by
     * `svgTextIndex`. Only the run's text may ever be rewritten — the applier
     * splices an entity-escaped string between the run's existing tags, so
     * fill/stroke/gradient/geometry are structurally untouchable.
     */
    target: z.enum(["text", "attribute", "svg-text"]),
    /**
     * Attribute targets: the property name as it exists on that surface —
     * React prop vocabulary on the static tree (`srcSet`), raw DOM attribute
     * vocabulary inside dynamic templates (`srcset`).
     */
    attributeName: z.string().optional(),
    /** Text targets: absolute index into the owning element's children. */
    childIndex: z.number().int().nonnegative().optional(),
    /** Text targets: index among the element's TEXT children (readability). */
    textSegment: z.number().int().nonnegative().optional(),
    /**
     * svg-text targets: index of the character run among ALL text/tspan runs
     * of the owner's SVG markup in document order (counted before any
     * visibility filtering, so the address is stable).
     */
    svgTextIndex: z.number().int().nonnegative().optional(),
    /** svg-text targets: human-readable element path, e.g. `svg>defs>mask>text`. */
    svgTextPath: z.string().optional(),
    expectedValue: z.string(),
  })
  .strict();
export type SlotBinding = z.infer<typeof SlotBindingSchema>;

export const SlotBindingsFileSchema = z
  .object({
    schemaVersion: z.literal(RECON_TEMPLATE_SCHEMA_VERSION),
    templateId: z.string(),
    bindings: z.array(SlotBindingSchema),
  })
  .strict();
export type SlotBindingsFile = z.infer<typeof SlotBindingsFileSchema>;

// ---------------------------------------------------------------------------
// Default content (default-content.json)
// ---------------------------------------------------------------------------

/**
 * Keyed by slot KEY (not id) because this file is the one an operator or a
 * later content stage edits by hand; keys are meaningful, ids are bookkeeping.
 * Values are the ORIGINAL reconstruction's values — rendering this file must
 * be browser-equivalent to the Exact Reconstruction (the Task 18 invariant).
 */
export const DefaultContentFileSchema = z
  .object({
    schemaVersion: z.literal(RECON_TEMPLATE_SCHEMA_VERSION),
    templateId: z.string(),
    values: z.record(z.string(), SlotValueSchema),
  })
  .strict();
export type DefaultContentFile = z.infer<typeof DefaultContentFileSchema>;

// ---------------------------------------------------------------------------
// Manual overrides (input to the compiler, not part of the artifact contract)
// ---------------------------------------------------------------------------

/**
 * Manual override file (`--slot-overrides <path>`), applied between automatic
 * extraction and artifact emission. MVP operations only — the point is that
 * when automatic extraction is 90% right, a human fixes the rest in JSON, not
 * in code and not in a UI. Every operation addresses slots by their AUTOMATIC
 * key (the key the compiler prints without overrides), so an override file is
 * reproducible against a fresh compile of the same inputs.
 */
export const SlotOverridesSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Remove a slot (and its bindings) from the template. */
    exclude: z
      .array(z.object({ key: z.string(), reason: z.string().optional() }).strict())
      .optional(),
    /** Rename a slot key (default-content keys follow). */
    rename: z.array(z.object({ from: z.string(), to: z.string() }).strict()).optional(),
    /** Override the canonical role. */
    role: z.array(z.object({ key: z.string(), role: SlotRoleSchema }).strict()).optional(),
    /**
     * Relabel the scope. Promoting to `global` relabels and drops the page
     * linkage; it does not invent new bindings — merging occurrences across
     * pages is what `merge` is for.
     */
    scope: z.array(z.object({ key: z.string(), scope: SlotScopeSchema }).strict()).optional(),
    /**
     * Merge logical slots: every `from` slot's bindings move onto `into`, and
     * the `from` slots disappear. Refused unless all defaults are identical —
     * merging two slots that currently render different content would silently
     * change the default render and break the lossless invariant.
     */
    merge: z
      .array(z.object({ into: z.string(), from: z.array(z.string()).min(1) }).strict())
      .optional(),
    /** Override the human label. */
    label: z.array(z.object({ key: z.string(), label: z.string() }).strict()).optional(),
    /** Override the editability state. */
    editability: z
      .array(z.object({ key: z.string(), editability: EditabilitySchema }).strict())
      .optional(),
  })
  .strict();
export type SlotOverrides = z.infer<typeof SlotOverridesSchema>;

// ---------------------------------------------------------------------------
// Site map (site-map.json)
// ---------------------------------------------------------------------------

/**
 * The minimal site map: facts the pipeline already established, restated in
 * one place. No new crawling, no SiteGraph inference — routes come from the
 * reconstruction route map, families from the SiteSpec, internal links from
 * the URL slots this compiler extracted.
 */
export const SiteMapRouteSchema = z
  .object({
    route: z.string(),
    url: z.string(),
    pageId: z.string(),
    familyId: z.string().optional(),
    representative: z.boolean(),
    renderCoverage: z.string(),
  })
  .strict();

export const SiteMapSchema = z
  .object({
    schemaVersion: z.literal(RECON_TEMPLATE_SCHEMA_VERSION),
    root: z.string(),
    routes: z.array(SiteMapRouteSchema),
    pageFamilies: z.array(
      z
        .object({
          familyId: z.string(),
          familyType: z.string(),
          representativeUrl: z.string(),
          memberCount: z.number(),
        })
        .strict(),
    ),
    representatives: z.array(z.string()),
    /** Distinct internal link targets observed in URL slots, sorted. */
    internalLinks: z.array(z.string()),
  })
  .strict();
export type SiteMap = z.infer<typeof SiteMapSchema>;

// ---------------------------------------------------------------------------
// Manifest (manifest.json)
// ---------------------------------------------------------------------------

export const TemplateManifestSchema = z
  .object({
    schemaVersion: z.literal(RECON_TEMPLATE_SCHEMA_VERSION),
    schemaName: z.literal("recon-template-v1"),
    slotSchemaVersion: AcceptedSlotSchemaVersion,
    compilerVersion: z.number().int().min(1).max(TEMPLATE_COMPILER_VERSION),
    engine: z.literal(TEMPLATE_ENGINE),
    templateId: z.string(),
    /** Derived from the run id — the run directory name is the only clock. */
    createdAt: z.string(),
    source: z
      .object({
        host: z.string(),
        rootUrl: z.string(),
        siteSpecRunId: z.string(),
        siteSpecFile: z.string(),
        reconstructionRunId: z.string(),
        reconstructionManifestFile: z.string(),
        siteSpecSchemaVersion: z.number(),
        reconstructionSchemaVersion: z.number(),
      })
      .strict(),
    routes: z.array(z.string()),
    counts: z
      .object({
        pages: z.number(),
        routes: z.number(),
        slots: z.number(),
        bindings: z.number(),
        globalSlots: z.number(),
        pageSlots: z.number(),
        textSlots: z.number(),
        urlSlots: z.number(),
        imageSlots: z.number(),
        reviewSlots: z.number(),
        staticBindings: z.number(),
        dynamicTemplateBindings: z.number(),
        /** v2 compiler only: aria-hidden paint duplicates co-bound to slots. */
        paintTwinBindings: z.number().optional(),
        /** v2 compiler only: rendered inline-SVG text runs bound as occurrences. */
        svgTextBindings: z.number().optional(),
        excludedCandidates: z.number(),
        overridesApplied: z.number(),
      })
      .strict(),
    limitations: z.array(z.string()),
    provenance: z.literal("derived"),
  })
  .strict();
export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Bad input (missing file, version mismatch, broken lineage). */
export class TemplateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateInputError";
  }
}

/** An invariant of the compiler itself failed — a bug, not an input problem. */
export class TemplateCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCompileError";
  }
}

/** A manual override could not be applied as written. */
export class TemplateOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateOverrideError";
  }
}
