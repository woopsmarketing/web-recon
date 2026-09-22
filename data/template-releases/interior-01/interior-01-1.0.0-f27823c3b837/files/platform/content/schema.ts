import { z } from "zod";

/**
 * Published content model — ONLY what Slice 1 consumes.
 *
 *   Core      business            (singleton; what the business IS)
 *   Interior  projects, categories (collections; what the business HAS)
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

export const ProjectSchema = z
  .object({
    id: RecordIdSchema,
    slug: SlugSchema,
    title: z.string().trim().min(1).max(80),
    status: z.enum(["published", "draft"]),
    /** Publication instant; also the deterministic "latest" ordering key. */
    publishedAt: IsoInstantSchema,
    category: RecordIdSchema,
    cover: z
      .object({
        asset: AssetRefSchema,
        alt: z.string().trim().max(160).optional(),
      })
      .strict(),
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

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
      for (const it of doc.items as Array<{ id: string }>) {
        if (seen.has(it.id)) ctx.addIssue({ code: "custom", message: `duplicate id "${it.id}"` });
        seen.add(it.id);
      }
    });
}

export const ProjectsDocSchema = collectionDoc("projects@1", ProjectSchema);
export const CategoriesDocSchema = collectionDoc("categories@1", CategorySchema);

/** The singleton / collection types a ContentReader serves in Slice 1. */
export interface SingletonTypes {
  business: Business;
}
export interface CollectionTypes {
  projects: Project;
  categories: Category;
}

/** Published content visible to one build (already filtered by mode + at). */
export interface VisibleContent {
  business: Business;
  projects: Project[];
  categories: Category[];
}
