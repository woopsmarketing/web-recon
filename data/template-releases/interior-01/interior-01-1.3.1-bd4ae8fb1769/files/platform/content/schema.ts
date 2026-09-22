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

const ShortText = (max: number) => z.string().trim().min(1).max(max);
/** Calendar month "YYYY-MM" (no day, no time zone: a project period is not an instant). */
const YearMonthSchema = z.string().regex(/^(1[89]\d\d|2[01]\d\d)-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

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
    /** Floor area of the space. */
    area: z
      .object({ value: z.number().positive().max(100_000).refine(twoDecimals, TWO_DECIMALS), unit: AreaUnitSchema })
      .strict()
      .optional(),
    /** Year the building was completed (not the project). */
    builtYear: z.number().int().min(1800).max(2100).optional(),
    /** Spaces / work areas included in the project. */
    scope: z.array(ShortText(40)).min(1).max(20).optional(),
    /** Project period by calendar month; `end` omitted = a single-month project (end = start). */
    period: z
      .object({ start: YearMonthSchema, end: YearMonthSchema.optional() })
      .strict()
      .refine((p) => p.end === undefined || p.end >= p.start, { message: "period.end is before period.start" })
      .optional(),
    /** Construction duration in whole weeks. */
    durationWeeks: z.number().int().min(1).max(520).optional(),
    /** Style keywords in the site's own words. Absent or empty = no keyword row. */
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
  .strict();
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
