import { z } from "zod";

/**
 * Published content model — ONLY what the platform/Templates consume (Slice 1 cards +
 * Step 4 portfolio list/detail + Step 5 homepage). Not a mirror of any source API record.
 *
 *   Core         business                      (singleton; what the business IS)
 *   Interior     projects, categories, reviews (collections; what the business HAS)
 *   PROVISIONAL  banners                       (hero slides; presentation-level, not canonical)
 *
 * Content never carries Template placement: no display flags, display orders,
 * banner/area switches or template ids (architecture boundary 3). Brand/legal
 * identity lives on the Site Instance identity, not here (no duplicated names).
 */

/** Stable record id: lowercase, URL-safe, never a storage row number. */
export const RecordIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96);

/** Reference to an entry in the site's asset registry (platform/assets). */
export const AssetRefSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);

/**
 * Where a content document came from.
 * - customer:          operator/customer-provided content
 * - synthetic-fixture: clearly fictional platform test content
 * - reference-fixture: source-like content used ONLY for fidelity gates; it is
 *                      never valid customer content and is refused under data/sites/**
 */
export const CONTENT_ORIGINS = ["customer", "synthetic-fixture", "reference-fixture"] as const;
export const ContentOriginSchema = z.enum(CONTENT_ORIGINS);
export type ContentOrigin = z.infer<typeof ContentOriginSchema>;
export const SITE_ALLOWED_ORIGINS: readonly ContentOrigin[] = ["customer", "synthetic-fixture"];

const IsoInstantSchema = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------- Core ------

export const BusinessSchema = z
  .object({
    /** One-paragraph description of the business, shown in the footer. */
    summary: z.string().trim().min(1).max(280).optional(),
    contact: z
      .object({
        email: z.email().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Business = z.infer<typeof BusinessSchema>;

// ----------------------------------------------------------- Interior -------

export const CategorySchema = z
  .object({
    id: RecordIdSchema,
    name: z.string().trim().min(1).max(40),
  })
  .strict();
export type Category = z.infer<typeof CategorySchema>;

/** An image in the site's asset registry + optional alt text. */
export const MediaRefSchema = z
  .object({
    asset: AssetRefSchema,
    alt: z.string().trim().max(160).optional(),
  })
  .strict();
export type MediaRef = z.infer<typeof MediaRefSchema>;

/** Floor-area units. Display symbols are Template formatting, not content. */
export const AREA_UNITS = ["m2", "sqft", "pyeong"] as const;
export const AreaUnitSchema = z.enum(AREA_UNITS);

/**
 * What a floor-area figure measures (Step 5.2). A unit converts; a basis does NOT:
 *   supply    — 공급면적 (exclusive + the unit's share of common areas)
 *   exclusive — 전용면적 (the unit's own floor)
 *   unknown   — not stated / not known
 * Stored `basis` absent = "unknown" (never guessed from the value or the unit), so every
 * pre-5.2 area stays valid and means what it always meant. An explicit "unknown" is allowed
 * and means the same; read it through areaBasisOf().
 *
 * Korean residential AUTHORING rule: a bare "34평" ("34평 아파트") is recorded as
 * { value: 34, unit: "pyeong", basis: "supply" } — see defaultAreaBasis(). 34평 supply ≈ 112㎡
 * is a unit conversion of the same figure. "34평형 ≈ 전용 84㎡" is contextual market knowledge
 * only: supply → exclusive differs per building, so no function ever derives one basis from
 * the other.
 */
export const AREA_BASES = ["supply", "exclusive", "unknown"] as const;
export const AreaBasisSchema = z.enum(AREA_BASES);
export type AreaBasis = z.infer<typeof AreaBasisSchema>;

/** The basis a stored area states; absent = "unknown" (pre-5.2 data, or an unstated figure). */
export function areaBasisOf(area: { basis?: AreaBasis }): AreaBasis {
  return area.basis ?? "unknown";
}

/**
 * The basis an authoring step (operator form, import, future chat/NL) records when the
 * author gave a figure WITHOUT saying which area it is. Korean residential context + 평 →
 * "supply" (the market convention: "34평 아파트" = 34평형 = supply area). Anything else is
 * not decided by convention → "unknown". A stated basis (공급/전용, supply/exclusive) always
 * wins and never reaches this function. The value is never changed.
 */
export function defaultAreaBasis(context: { unit: (typeof AREA_UNITS)[number]; locale: string; residential: boolean }): AreaBasis {
  const locale = context.locale.toLowerCase().replace(/_/g, "-"); // BCP 47 is case-insensitive
  const korean = locale === "ko" || locale.startsWith("ko-");
  return korean && context.residential && context.unit === "pyeong" ? "supply" : "unknown";
}

const ShortText = (max: number) => z.string().trim().min(1).max(max);
/** Calendar month "YYYY-MM" (no day, no time zone: a project period is not an instant). */
const YearMonthSchema = z.string().regex(/^(1[89]\d\d|2[01]\d\d)-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

// ------------------------------------------- built-space structured facts ---

/**
 * The CLOSED vocabularies of the Integration Contract V0.2 built-space annex
 * (docs/reports/integration/07-integration-contract-v0.2-candidate.md §5, §6, §7.3).
 *
 * They are DEFINED here rather than in platform/integration/contract.ts because platform/content
 * is a Template Release runtime source (platform/release/release.ts PLATFORM_RUNTIME_DIRS) and a
 * release workspace does not contain platform/integration — the content model may not import it.
 * platform/integration/contract.ts re-exports these as the contract-side constants, so producer
 * and content model can never disagree about the vocabulary.
 *
 * Every field below is AUTHORED. Nothing here is inferred from the title, the body, `category`,
 * `scope` or a price (07 PT3, WS4, ST4 — V0 ND1).
 */

/**
 * How much of the dwelling the project remodelled (07 §5, PT2):
 *   full_remodel    — the source presents the project as a remodel of the dwelling AS A WHOLE;
 *   partial_remodel — a bounded subset of spaces; `totalPrice` covers only that subset.
 * ABSENT = breadth not established (PT1/PT4). There is no "unknown" value: MD1/MD2 already fix
 * how unknown is written, and a second spelling of it would be a second source of truth.
 */
export const PROJECT_TYPES = Object.freeze(["full_remodel", "partial_remodel"] as const);
export type ProjectType = (typeof PROJECT_TYPES)[number];

/** What kind of built space the project was in (07 §6). Absent = unknown. */
export const PROPERTY_TYPES = Object.freeze(["apartment", "officetel", "villa", "detached_house", "mixed_use", "commercial"] as const);
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * The 26 canonical work-scope ids (07 §7.3), as two tables that the contract keeps apart:
 *   SPACES — a room or a defined area of the dwelling;
 *   WORKS  — a trade applied across spaces.
 * The split is machine-readable because INV-29 needs it: a `full_remodel` must have remodelled at
 * least one SPACE. A job that ran only trades across the dwelling (바닥·도배·조명) touches every
 * room without being a remodel of it — 07 PT4(c) — and must never feed D-1.
 *
 * Closed: a source item that cannot be mapped to an id without judgement is OMITTED, never passed
 * through as free text (WS1/WS9). The gloss that fixes what each id covers lives in the contract;
 * visitor-language aliases (부엌→kitchen) belong to the consumer and are never emitted (WS6).
 */
export const WORK_SCOPE_SPACE_IDS = Object.freeze([
  "entrance",
  "living_room",
  "dining",
  "kitchen",
  "pantry",
  "bedroom",
  "kids_room",
  "dressing_room",
  "study",
  "bathroom",
  "hallway",
  "balcony",
  "storage",
  "utility",
] as const);
export const WORK_SCOPE_WORK_IDS = Object.freeze([
  "flooring",
  "wallpaper",
  "lighting",
  "windows",
  "doors",
  "tiling",
  "painting",
  "plumbing",
  "electrical",
  "built_in_furniture",
  "expansion",
  "demolition",
] as const);
/** The union, in 07 §7.3's order (spaces first, then works) — the vocabulary every id comes from. */
export const WORK_SCOPE_IDS = Object.freeze([...WORK_SCOPE_SPACE_IDS, ...WORK_SCOPE_WORK_IDS] as const);
export type WorkScopeId = (typeof WORK_SCOPE_IDS)[number];


/**
 * One photo of a gallery group. `image` is the primary (after) photo; `before`
 * is an OPTIONAL earlier photo of the same view. Before/after is data: a
 * Template renders its before/after interaction only when `before` exists.
 */
export const GalleryItemSchema = z
  .object({
    image: MediaRefSchema,
    before: MediaRefSchema.optional(),
  })
  .strict();

/** Photos grouped by room/space ("Living room", "Kitchen", …). Names are the site's own words. */
export const GalleryGroupSchema = z
  .object({
    name: ShortText(40),
    items: z.array(GalleryItemSchema).min(1).max(80),
  })
  .strict();

/** Displayed numbers are stored with ≤ 2 fraction digits so Templates render them exactly (no rounding). */
const twoDecimals = (v: number) => Math.round(v * 100) / 100 === v;
const TWO_DECIMALS = { message: "at most 2 decimal places" };

/** 07 §9 — a positive amount in the currency's major unit, ≤ 2 fraction digits, ≤ 1e9 (V0 PR1 shape). */
const PriceAmountSchema = z.number().positive().max(1_000_000_000).refine(twoDecimals, TWO_DECIMALS);
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code");

/**
 * The price of the work this case describes, as authored (07 §9.1 TP2). EXACT xor RANGE is a
 * STRUCTURAL guarantee (the `kind` discriminant), not a validator rule. A total is NEVER derived
 * from `pricePerArea` × `area` (TP3 = V0 PR5, retained in full), and the inclusion scope (VAT,
 * demolition, furniture) stays unknown for every record (PR3).
 */
export const TotalPriceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("exact"), amount: PriceAmountSchema, currency: CurrencySchema }).strict(),
    z.object({ kind: z.literal("range"), minAmount: PriceAmountSchema, maxAmount: PriceAmountSchema, currency: CurrencySchema }).strict(),
  ])
  // TP1: equal bounds are not a range — author them as `exact`.
  .refine((t) => t.kind !== "range" || t.minAmount < t.maxAmount, { message: "totalPrice range requires minAmount < maxAmount; equal bounds are an exact total (TP1)" });
export type TotalPrice = z.infer<typeof TotalPriceSchema>;

export const ProjectSchema = z
  .object({
    id: RecordIdSchema,
    slug: SlugSchema,
    title: z.string().trim().min(1).max(80),
    status: z.enum(["published", "draft"]),
    /** Publication instant; also the deterministic "latest" ordering key. */
    publishedAt: IsoInstantSchema,
    /** The project's primary classification (site taxonomy), e.g. "Kitchen", "Full renovation". */
    category: RecordIdSchema,
    cover: MediaRefSchema,

    // ---- detail facts (Step 4). All OPTIONAL: absent = unknown, never invented. ----
    /** One-line description (cards, detail subtitle, meta description). */
    summary: ShortText(200).optional(),
    /** Longer plain-text story, one string per paragraph. No HTML. */
    body: z.array(ShortText(1200)).min(1).max(20).optional(),
    /** Public, display-level location (e.g. district/city). Not a street address requirement. */
    location: ShortText(80).optional(),
    /** Floor area of the space; `basis` = what the figure measures (absent = "unknown"). */
    area: z
      .object({
        value: z.number().positive().max(100_000).refine(twoDecimals, TWO_DECIMALS),
        unit: AreaUnitSchema,
        basis: AreaBasisSchema.optional(),
      })
      .strict()
      .optional(),
    /** Year the building was completed (not the project). */
    builtYear: z.number().int().min(1800).max(2100).optional(),
    /**
     * Spaces / work areas included in the project, in the site's own words. DISPLAY text: it is
     * rendered on the site and is NOT the structured work scope (see `workScopeIds`). V0.2 retires
     * the `scope` FACET, not this field.
     */
    scope: z.array(ShortText(40)).min(1).max(20).optional(),

    // ---- built-space structured facts (Integration Contract V0.2, 07). All AUTHORED, all ----
    // ---- OPTIONAL: absent = unknown, never a placeholder (MD1/MD2, ND1, PT3, WS4, ST4).  ----
    /** 07 §5 — how much of the dwelling was remodelled. Never inferred; absent = not established. */
    projectType: z.enum(PROJECT_TYPES).optional(),
    /** 07 §6 — what kind of built space this is. Emitted as `property.type`. */
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    /**
     * 07 §7 — the canonical spaces and works the project covered, as a SET (WS3: quantity is not
     * represented). Non-empty when present; `[]` is never authored (WS5). When `projectType` is
     * `partial_remodel`, only the SPACES within it are CLOSED — `workScopeIds ∩ Spaces` is the
     * complete set of spaces that were remodelled (WS7a). An absent space id means that space was
     * not remodelled; it does NOT mean no work reached it. The WORKS in the set stay open even for
     * a partial (WS7b). A `partial_remodel` authored with no `workScopeIds` at all is still an
     * authoring error (INV-28).
     */
    workScopeIds: z
      .array(z.enum(WORK_SCOPE_IDS))
      .min(1)
      .max(WORK_SCOPE_IDS.length)
      .refine((v) => new Set(v).size === v.length, { message: "workScopeIds must be unique (WS3: it is a set)" })
      .optional(),
    /** 07 §9.1 — the total price of the work this case describes, exact XOR range. */
    totalPrice: TotalPriceSchema.optional(),
    /**
     * 07 §8 ST1 — style / mood words only (colour, material feel, atmosphere), feeding `facets.style`.
     * The classification is AUTHORED, never computed (ST2: 간접조명 is a lighting technique and
     * 수납 특화 a functional feature — both stay tags).
     *
     * `styles` is normally a SUBSET of `keywords`: the operator tags 화이트 once and then marks it
     * as a style. The emitter therefore emits `facets.tag` as `keywords` MINUS `styles`, so ST4 /
     * INV-24 (no value in both facets) holds by construction. Overlap here is the NORMAL case and
     * is not an error.
     */
    styles: z
      .array(ShortText(32))
      .max(12)
      .refine((s) => new Set(s).size === s.length, { message: "styles must be unique" })
      .optional(),
    /** Project period by calendar month; `end` omitted = a single-month project (end = start). */
    period: z
      .object({ start: YearMonthSchema, end: YearMonthSchema.optional() })
      .strict()
      .refine((p) => p.end === undefined || p.end >= p.start, { message: "period.end is before period.start" })
      .optional(),
    /** Construction duration in whole weeks. */
    durationWeeks: z.number().int().min(1).max(520).optional(),
    /**
     * Descriptive keywords in the site's own words, feeding `facets.tag`. Absent or empty = no
     * keyword row. V0.2 (07 §8): a value that is a STYLE belongs in `styles` instead — 간접조명
     * (a lighting technique) and 수납 특화 (a functional feature) stay here (ST2).
     */
    keywords: z
      .array(ShortText(32))
      .max(12)
      .refine((k) => new Set(k).size === k.length, { message: "keywords must be unique" })
      .optional(),
    /**
     * Price per unit of area. Validation contract: a positive, finite amount ≤ 1e9
     * in an ISO 4217 currency. Plausibility (e.g. a data-entry outlier) is NOT
     * judged here; Templates must render any in-contract value without breaking.
     */
    pricePerArea: z
      .object({
        amount: z.number().positive().max(1_000_000_000).refine(twoDecimals, TWO_DECIMALS),
        currency: z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code"),
        unit: AreaUnitSchema,
      })
      .strict()
      .optional(),
    /** Photos by room/space. Absent = the Template shows the cover only. */
    galleryGroups: z
      .array(GalleryGroupSchema)
      .min(1)
      .max(20)
      .refine((g) => new Set(g.map((x) => x.name)).size === g.length, { message: "gallery group names must be unique" })
      .optional(),
    /**
     * Customer quote: operator-provided PERSONAL content only — never generated.
     * `attribution` is how the customer agreed to be named (may be omitted).
     */
    customerQuote: z
      .object({ text: ShortText(600), attribution: ShortText(60).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    // ST4 / INV-24 is NOT a rule about the authored fields: `styles` is normally a subset of
    // `keywords`, and the emitter makes the two facets disjoint by subtraction. Only the emitted
    // document is checked (platform/integration/validate.ts).

    // WS7a/INV-28 — an empty workScopeIds leaves `workScopeIds ∩ Spaces` (WS7a's closed set of
    // spaces that were remodelled) empty too, which cannot carry the closed-set meaning the
    // contract gives it, and its `totalPrice` would be uninterpretable.
    if (p.projectType === "partial_remodel" && (p.workScopeIds ?? []).length === 0) {
      ctx.addIssue({ code: "custom", path: ["workScopeIds"], message: "projectType \"partial_remodel\" requires a non-empty workScopeIds: its spaces are the closed set the total covers (WS7a, INV-28)" });
    }
    // INV-29 — a `full_remodel` remodelled the dwelling's SPACES. A set of trades alone (바닥·도배·
    // 조명) is 07 PT4(c): all the spaces are touched, but the total is not a remodel's total, and
    // such a record must never feed D-1.
    if (p.projectType === "full_remodel" && !(p.workScopeIds ?? []).some((id) => (WORK_SCOPE_SPACE_IDS as readonly string[]).includes(id))) {
      ctx.addIssue({ code: "custom", path: ["workScopeIds"], message: "projectType \"full_remodel\" requires at least one SPACE work scope (07 §7.3 spaces table): a set of trades alone is PT4(c), not a full remodel (INV-29)" });
    }
    // INV-30 — the mirror of INV-29, and the reason INV-28 is not enough. PT5 authors a partial as a
    // BOUNDED SET OF SPACES; a record whose scopes are trades only (도배·바닥) names no boundary, so
    // `workScopeIds ∩ Spaces` — the closed set WS7a reads and the set `pricing.total` covers — is
    // empty, and the total means nothing. Such a job is breadth-ABSENT (PT5's authoring sentence,
    // bi-19's case), never a partial.
    if (p.projectType === "partial_remodel" && !(p.workScopeIds ?? []).some((id) => (WORK_SCOPE_SPACE_IDS as readonly string[]).includes(id))) {
      ctx.addIssue({ code: "custom", path: ["workScopeIds"], message: "projectType \"partial_remodel\" requires at least one SPACE work scope (07 §7.3 spaces table): a trades-only job names no bounded set of spaces, so leave projectType unset (PT5, INV-30)" });
    }
  });
export type Project = z.infer<typeof ProjectSchema>;

// ----------------------------------------------------- Interior (1.3.0) -----

/**
 * Review — what a customer said about the business, as the customer agreed to be
 * named. Operator-provided PERSONAL content only: never generated, never padded, no
 * invented rating (none is stored). No review = the Template shows no review section.
 * Stored order is the operator's order (no display-order field, no placement).
 */
export const ReviewSchema = z
  .object({
    id: RecordIdSchema,
    status: z.enum(["published", "draft"]),
    text: ShortText(600),
    /** How the customer agreed to be named (may be omitted = anonymous). */
    attribution: ShortText(60).optional(),
  })
  .strict();
export type Review = z.infer<typeof ReviewSchema>;

// ------------------------------------------- PROVISIONAL (not canonical) ----

/**
 * Banner — one hero slide. PROVISIONAL (docs/architecture/recon-template-platform.md,
 * "Explicitly provisional"): hero slide data is presentation-level content of the
 * interior-01 homepage, NOT an accepted canonical Interior collection. Promote it only
 * when a second Template or stronger evidence shows cross-template meaning.
 *
 * Deliberately NOT modelled (source-implementation baggage): pc/mobile display
 * switches, display order fields, banner type enums, text-colour flags, video flags,
 * free-form link URLs. Array order = slide order. A call to action names a TARGET
 * (a project by id, or the site's contact destination), never a Template route, so
 * the content stays route-independent and a target that is not served hides the CTA.
 * Image only: video media is deferred (the asset registry is image-only).
 */
export const BannerCtaSchema = z
  .object({
    label: ShortText(32),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("project"), project: RecordIdSchema }).strict(),
      z.object({ kind: z.literal("contact") }).strict(),
    ]),
  })
  .strict();
export const BannerSchema = z
  .object({
    id: RecordIdSchema,
    status: z.enum(["published", "draft"]),
    image: MediaRefSchema,
    headline: ShortText(80).optional(),
    text: ShortText(160).optional(),
    cta: BannerCtaSchema.optional(),
  })
  .strict();
export type Banner = z.infer<typeof BannerSchema>;
/** Upper bound of stored slides (a hero is a short sequence, not a gallery). */
export const MAX_BANNERS = 8;
/** Content types that exist for one Template's presentation and are not canonical yet. */
export const PROVISIONAL_CONTENT_TYPES = ["banners"] as const;

/** Every asset a project references (cover, gallery images, before images). */
export function projectAssetRefs(p: Project): string[] {
  const refs = [p.cover.asset];
  for (const g of p.galleryGroups ?? []) {
    for (const it of g.items) {
      refs.push(it.image.asset);
      if (it.before) refs.push(it.before.asset);
    }
  }
  return refs;
}

// ------------------------------------------------------ Stored documents ----

export const BusinessDocSchema = z
  .object({
    schema: z.literal("business@1"),
    origin: ContentOriginSchema,
    data: BusinessSchema,
  })
  .strict();

function collectionDoc<T extends z.ZodTypeAny>(schema: string, item: T) {
  return z
    .object({
      schema: z.literal(schema),
      origin: ContentOriginSchema,
      items: z.array(item),
    })
    .strict()
    .superRefine((doc, ctx) => {
      const seen = new Set<string>();
      const slugs = new Set<string>();
      for (const it of doc.items as Array<{ id: string; slug?: string }>) {
        if (seen.has(it.id)) ctx.addIssue({ code: "custom", message: `duplicate id "${it.id}"` });
        seen.add(it.id);
        // A slug addresses one record for its whole life (drafts/scheduled included):
        // a collision would surface later as two records on one URL.
        if (it.slug !== undefined) {
          if (slugs.has(it.slug)) ctx.addIssue({ code: "custom", message: `duplicate slug "${it.slug}"` });
          slugs.add(it.slug);
        }
      }
    });
}

export const ProjectsDocSchema = collectionDoc("projects@1", ProjectSchema);
export const CategoriesDocSchema = collectionDoc("categories@1", CategorySchema);
/** OPTIONAL documents (1.3.0): absent file = no such content (the build snapshot omits the key). */
export const ReviewsDocSchema = collectionDoc("reviews@1", ReviewSchema);
export const BannersDocSchema = collectionDoc("banners@1", BannerSchema).refine((d) => d.items.length <= MAX_BANNERS, {
  message: `at most ${MAX_BANNERS} banners`,
});

/** The singleton / collection types a ContentReader serves. */
export interface SingletonTypes {
  business: Business;
}
export interface CollectionTypes {
  projects: Project;
  categories: Category;
  reviews: Review;
  banners: Banner;
}

/**
 * Published content visible to one build (already filtered by mode + at).
 * `reviews` / `banners` are optional: a snapshot of a site without those documents
 * has no such key (older Template Releases' strict snapshot schemas stay valid).
 */
export interface VisibleContent {
  business: Business;
  projects: Project[];
  categories: Category[];
  reviews?: Review[];
  banners?: Banner[];
}
