import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  BannersDocSchema,
  BusinessDocSchema,
  CategoriesDocSchema,
  ProjectsDocSchema,
  ReviewsDocSchema,
  SITE_ALLOWED_ORIGINS,
  projectAssetRefs,
  type ContentOrigin,
} from "../content/schema";
import { AssetRegistryDocSchema, publicAssetPath, svgProblems, type SnapshotAsset } from "../assets/assets";
import { SiteSettingsDocSchema } from "../settings/settings";
import { SiteThemeDocSchema } from "../theme/theme";
import { SiteSlotsDocSchema } from "../slots/slots";
import { sha256 } from "../util/hash";
import { SiteInstanceSchema, SiteSnapshotSchema, type BuildMode, type SiteSnapshot } from "./instance";

/**
 * JSON store (Slice 1): data/sites/<siteId>/
 *   site.json               Site Instance (identity + exact release pin)
 *   settings.json           sparse overrides for the pinned template
 *   theme.json              optional sparse theme overrides
 *   slots.json              optional sparse section slot values (copy/link/media)
 *   content/business.json   Core singleton
 *   content/projects.json   Interior collection
 *   content/categories.json Interior taxonomy
 *   content/reviews.json    OPTIONAL Interior collection (1.3.0+ Templates)
 *   content/banners.json    OPTIONAL, PROVISIONAL hero slides (1.3.0+ Templates)
 *   assets/registry.json    customer-owned media registry (+ files)
 *   integration.json        OPTIONAL builder input (NOT part of the snapshot): first-party
 *                           integration opt-in — read by platform/integration/config.ts
 *
 * This module is the ONLY place that knows the snapshot paths. It turns them into a
 * canonical SiteSnapshot for one (mode, at). siteId partitions everything.
 */

export const SITES_DIR = "data/sites";

export class SiteDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteDataError";
  }
}

export function siteDir(repoRoot: string, siteId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId)) throw new SiteDataError(`invalid siteId "${siteId}"`);
  return path.join(repoRoot, SITES_DIR, siteId);
}

async function readJson(file: string, optional = false): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"), (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new SiteDataError(`forbidden key "${key}"`);
      return value;
    });
  } catch (error) {
    if (error instanceof SiteDataError) throw new SiteDataError(`${file}: ${error.message}`);
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new SiteDataError(`cannot read ${file}: ${(error as Error).message}`);
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, what: string): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new SiteDataError(`${what} invalid: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  }
  return r.data;
}

function assertSiteOrigin(origin: ContentOrigin, what: string) {
  if (!SITE_ALLOWED_ORIGINS.includes(origin)) {
    throw new SiteDataError(`${what}: origin "${origin}" is not allowed under ${SITES_DIR}/** (reference fixtures are never customer content)`);
  }
}

export async function loadSiteInstance(repoRoot: string, siteId: string) {
  const dir = siteDir(repoRoot, siteId);
  const site = parse(SiteInstanceSchema, await readJson(path.join(dir, "site.json")), `${siteId}/site.json`);
  if (site.siteId !== siteId) throw new SiteDataError(`${siteId}/site.json declares siteId "${site.siteId}"`);
  return site;
}

export interface BuildSiteSnapshotResult {
  snapshot: SiteSnapshot;
  /** absolute source file for each snapshot asset, for copying into the package */
  assetFiles: Map<string, string>;
  /** stored projects NOT served by this build (drafts, scheduled) — never in the snapshot; for early warnings only */
  unserved: { id: string; slug: string; status: string }[];
}

export async function buildSiteSnapshot(opts: {
  repoRoot: string;
  siteId: string;
  mode: BuildMode;
  at: string;
}): Promise<BuildSiteSnapshotResult> {
  const { repoRoot, siteId, mode, at } = opts;
  const dir = siteDir(repoRoot, siteId);
  const site = await loadSiteInstance(repoRoot, siteId);
  const settings = parse(SiteSettingsDocSchema, await readJson(path.join(dir, "settings.json")), `${siteId}/settings.json`);
  if (settings.templateId !== site.template.templateId) {
    throw new SiteDataError(
      `${siteId}/settings.json is for template "${settings.templateId}" but the site is pinned to "${site.template.templateId}"`,
    );
  }
  const themeRaw = await readJson(path.join(dir, "theme.json"), true);
  const theme = themeRaw === undefined ? undefined : parse(SiteThemeDocSchema, themeRaw, `${siteId}/theme.json`);

  const slotsRaw = await readJson(path.join(dir, "slots.json"), true);
  const slots = slotsRaw === undefined ? undefined : parse(SiteSlotsDocSchema, slotsRaw, `${siteId}/slots.json`);
  if (slots && slots.templateId !== site.template.templateId) {
    throw new SiteDataError(`${siteId}/slots.json is for template "${slots.templateId}" but the site is pinned to "${site.template.templateId}"`);
  }

  const business = parse(BusinessDocSchema, await readJson(path.join(dir, "content/business.json")), `${siteId}/content/business.json`);
  const projects = parse(ProjectsDocSchema, await readJson(path.join(dir, "content/projects.json")), `${siteId}/content/projects.json`);
  const categories = parse(CategoriesDocSchema, await readJson(path.join(dir, "content/categories.json")), `${siteId}/content/categories.json`);
  const registry = parse(AssetRegistryDocSchema, await readJson(path.join(dir, "assets/registry.json")), `${siteId}/assets/registry.json`);
  // Optional documents: absent → no snapshot key (so sites without them snapshot exactly as before).
  const reviewsRaw = await readJson(path.join(dir, "content/reviews.json"), true);
  const reviews = reviewsRaw === undefined ? undefined : parse(ReviewsDocSchema, reviewsRaw, `${siteId}/content/reviews.json`);
  const bannersRaw = await readJson(path.join(dir, "content/banners.json"), true);
  const banners = bannersRaw === undefined ? undefined : parse(BannersDocSchema, bannersRaw, `${siteId}/content/banners.json`);
  assertSiteOrigin(business.origin, `${siteId}/content/business.json`);
  assertSiteOrigin(projects.origin, `${siteId}/content/projects.json`);
  assertSiteOrigin(categories.origin, `${siteId}/content/categories.json`);
  assertSiteOrigin(registry.origin, `${siteId}/assets/registry.json`);
  if (reviews) assertSiteOrigin(reviews.origin, `${siteId}/content/reviews.json`);
  if (banners) assertSiteOrigin(banners.origin, `${siteId}/content/banners.json`);

  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) throw new SiteDataError(`invalid --at "${at}"`);
  // Visibility: public = published and not scheduled after `at`; preview = everything (drafts, scheduled).
  const visibleProjects = projects.items
    .filter((p) => (mode === "preview" ? true : p.status === "published" && Date.parse(p.publishedAt) <= atMs))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const categoryIds = new Set(categories.items.map((c) => c.id));
  for (const p of visibleProjects) {
    if (!categoryIds.has(p.category)) throw new SiteDataError(`${siteId}: project "${p.id}" references unknown category "${p.category}"`);
  }

  // Reviews / banners have no schedule: public = published, preview = everything. Stored order is kept.
  const visibleReviews = reviews?.items.filter((r) => mode === "preview" || r.status === "published");
  const visibleBanners = banners?.items.filter((b) => mode === "preview" || b.status === "published");
  // A banner CTA names a project by id: an unknown id is a typo (fail); a stored but
  // unserved (draft/scheduled) project only hides that CTA at render time.
  const storedProjectIds = new Set(projects.items.map((p) => p.id));
  for (const b of banners?.items ?? []) {
    if (b.cta?.target.kind === "project" && !storedProjectIds.has(b.cta.target.project)) {
      throw new SiteDataError(`${siteId}: banner "${b.id}" CTA targets unknown project "${b.cta.target.project}"`);
    }
  }

  // cover + gallery (after and before) images of every visible project
  const referenced = new Set<string>(visibleProjects.flatMap(projectAssetRefs));
  for (const b of visibleBanners ?? []) referenced.add(b.image.asset);
  if (site.identity.logo) referenced.add(site.identity.logo);
  // media slot values reference customer assets too
  for (const section of Object.values(slots?.values ?? {})) {
    for (const v of Object.values(section)) {
      const asset = (v as { asset?: unknown } | null)?.asset;
      if (typeof asset === "string") referenced.add(asset);
    }
  }
  const registryById = new Map(registry.items.map((a) => [a.id, a]));
  const assets: SnapshotAsset[] = [];
  const assetFiles = new Map<string, string>();
  for (const ref of [...referenced].sort()) {
    const entry = registryById.get(ref);
    if (!entry) throw new SiteDataError(`${siteId}: asset "${ref}" is referenced but not in assets/registry.json`);
    const assetsDir = path.join(dir, "assets");
    const file = path.join(assetsDir, entry.file);
    let bytes: Buffer;
    try {
      const st = await lstat(file);
      if (!st.isFile()) throw new SiteDataError(`${siteId}: asset "${ref}" is not a regular file (symlinks are refused)`);
      if (!(await realpath(file)).startsWith(`${await realpath(assetsDir)}${path.sep}`)) throw new SiteDataError(`${siteId}: asset "${ref}" escapes assets/`);
      bytes = await readFile(file);
    } catch (error) {
      if (error instanceof SiteDataError) throw error;
      throw new SiteDataError(`${siteId}: asset file missing for "${ref}" (${entry.file})`);
    }
    if (entry.mediaType === "image/svg+xml") {
      const problems = svgProblems(bytes.toString("utf8"));
      if (problems.length) throw new SiteDataError(`${siteId}: SVG asset "${ref}" is not inert/self-contained: ${problems.join(", ")}`);
    }
    const hash = sha256(bytes);
    const publicPath = publicAssetPath(hash, entry.mediaType);
    assets.push({ ...entry, sha256: hash, publicPath });
    assetFiles.set(publicPath, file);
  }

  const snapshot = parse(
    SiteSnapshotSchema,
    {
      schemaVersion: 1,
      siteId,
      mode,
      site,
      settings,
      ...(theme ? { theme } : {}),
      ...(slots ? { slots } : {}),
      content: {
        business: business.data,
        projects: visibleProjects,
        categories: [...categories.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        ...(visibleReviews ? { reviews: visibleReviews } : {}),
        ...(visibleBanners ? { banners: visibleBanners } : {}),
      },
      assets,
    },
    `${siteId} snapshot`,
  );
  const served = new Set(visibleProjects.map((p) => p.id));
  const unserved = projects.items.filter((p) => !served.has(p.id)).map((p) => ({ id: p.id, slug: p.slug, status: p.status }));
  return { snapshot, assetFiles, unserved };
}
