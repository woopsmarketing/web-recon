import { z } from "zod";
import { AssetRefSchema, BannerSchema, BusinessSchema, CategorySchema, MAX_BANNERS, ProjectSchema, ReviewSchema } from "../content/schema";
import { AssetEntrySchema } from "../assets/assets";
import { SiteSettingsDocSchema } from "../settings/settings";
import { SiteThemeDocSchema } from "../theme/theme";
import { SiteSlotsDocSchema } from "../slots/slots";

/**
 * Site Instance = who the site is + which exact Template Release it is pinned to.
 * Content is NOT inlined here; it lives in the site's content/ documents.
 *
 * Identity fields follow the Task 29.1 SiteIdentity schema (extracted, not
 * imported: the legacy module pulls in slotized-template types), plus the logo
 * asset reference that the header consumes.
 */

export const SiteIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "siteId must be lowercase words joined by single hyphens")
  .max(64);

function normalizeOrigin(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return undefined;
  return url.origin;
}

function isWellFormedLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export const SiteIdentitySchema = z
  .object({
    brandName: z.string().trim().min(1).max(80),
    legalName: z.string().trim().min(1).max(120).optional(),
    publicOrigin: z
      .string()
      .refine((v) => normalizeOrigin(v) !== undefined, {
        message: "publicOrigin must be an http(s) origin with no path, query, hash or credentials",
      })
      .transform((v) => normalizeOrigin(v)!)
      .optional(),
    locale: z.string().trim().min(1).refine(isWellFormedLocale, { message: "locale must be BCP 47" }),
    logo: AssetRefSchema.optional(),
  })
  .strict();
export type SiteIdentity = z.infer<typeof SiteIdentitySchema>;

/** Exact immutable Template Release pin. Never "latest in major". */
export const TemplateReleasePinSchema = z
  .object({
    templateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    /** <templateId>-<x.y.z>-<releaseHash[0:12]> — an id, never a path. */
    releaseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d+\.\d+\.\d+-[0-9a-f]{12}$/),
    releaseHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .refine((p) => p.releaseId === `${p.templateId}-${p.templateVersion}-${p.releaseHash.slice(0, 12)}`, {
    message: "releaseId must equal <templateId>-<templateVersion>-<releaseHash[0:12]>",
  });
export type TemplateReleasePin = z.infer<typeof TemplateReleasePinSchema>;

export const SiteInstanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    siteId: SiteIdSchema,
    identity: SiteIdentitySchema,
    template: TemplateReleasePinSchema,
    theme: z.object({ base: z.literal("template-default") }).strict(),
  })
  .strict();
export type SiteInstance = z.infer<typeof SiteInstanceSchema>;

export const BUILD_MODES = ["public", "preview"] as const;
export const BuildModeSchema = z.enum(BUILD_MODES);
export type BuildMode = z.infer<typeof BuildModeSchema>;

/**
 * Canonical per-build site snapshot. Everything a site build reads, and nothing
 * else: visible content (already filtered by mode + at), referenced assets,
 * raw sparse settings/theme documents. Its hash is the siteSnapshotHash.
 * `at` is recorded beside it (build record), never inside it: time affects the
 * output only through which content is visible.
 */
export const SiteSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    siteId: SiteIdSchema,
    mode: BuildModeSchema,
    site: SiteInstanceSchema,
    settings: SiteSettingsDocSchema,
    theme: SiteThemeDocSchema.optional(),
    slots: SiteSlotsDocSchema.optional(),
    content: z
      .object({
        business: BusinessSchema,
        projects: z.array(ProjectSchema),
        categories: z.array(CategorySchema),
        // 1.3.0: present only when the site stores the document (absent ≠ empty list,
        // so snapshots of sites without them — and older releases' schemas — are unchanged)
        reviews: z.array(ReviewSchema).optional(),
        banners: z.array(BannerSchema).max(MAX_BANNERS).optional(),
      })
      .strict(),
    assets: z.array(
      AssetEntrySchema.extend({
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        publicPath: z.string().regex(/^\/assets\/[0-9a-f]{20}\.[a-z]+$/),
      }).strict(),
    ),
  })
  .strict();
export type SiteSnapshot = z.infer<typeof SiteSnapshotSchema>;
