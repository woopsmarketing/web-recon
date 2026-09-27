import type { Banner, Category, Project, Review, SingletonTypes, VisibleContent } from "./schema";

/**
 * Site-scoped ContentReader over the visible content of ONE site snapshot.
 *
 * Queries are CLOSED descriptors (no arbitrary filters/SQL). Ordering is always
 * deterministic: every sort ends with an `id` ascending tie-breaker.
 * The reader is storage-independent: JSON today, another store later, same API.
 *
 * Collections are stored once and queried per view: a page of `/portfolio` is an
 * OFFSET window over the same ordered query, never a stored page bucket.
 */

export type ProjectSelection =
  | { mode: "latest" }
  | { mode: "category"; category: string }
  | { mode: "manual"; ids: string[] };

export type CollectionQuery =
  | { type: "projects"; selection: ProjectSelection; limit: number }
  | { type: "categories" }
  /** Stored (operator) order, published only on public reads; no content = no items. */
  | { type: "reviews"; limit: number }
  /** PROVISIONAL hero slides, stored order = slide order; published only on public reads. */
  | { type: "banners"; limit: number };

/** Collections that are addressable one-by-one (have a slug). */
export type SlugCollection = "projects";

export interface QueryWarning {
  code: "manual-id-missing";
  message: string;
}

export interface ListResult<T> {
  items: T[];
  warnings: QueryWarning[];
}

/** One OFFSET page of an ordered collection query. `page` is 1-based. */
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** total matching items (all pages) */
  total: number;
  pageCount: number;
}

type ListItem<Q extends CollectionQuery> = Q extends { type: "projects" }
  ? Project
  : Q extends { type: "reviews" }
    ? Review
    : Q extends { type: "banners" }
      ? Banner
      : Category;

export interface ContentReader {
  getSingleton<K extends keyof SingletonTypes>(type: K): SingletonTypes[K];
  list<Q extends CollectionQuery>(query: Q): ListResult<ListItem<Q>>;
  /**
   * OFFSET pagination over a projects selection. Returns undefined when the page
   * does not exist (page < 1, non-integer, beyond the last page, or no items at
   * all), so a Template can 404 instead of rendering an empty page.
   */
  paginate(
    query: { type: "projects"; selection: ProjectSelection },
    opts: { page: number; pageSize: number },
  ): PageResult<Project> | undefined;
  /** One served item by slug (public: published only; preview: drafts too). */
  getBySlug(type: SlugCollection, slug: string): Project | undefined;
  /** Slugs of every served item, in the collection's default (latest) order. */
  listSlugs(type: SlugCollection): string[];
}

export class ContentReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentReaderError";
  }
}

/** Instant order (not string order: offsets / fractional seconds are allowed), then id. */
function byLatest(a: Project, b: Project): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createContentReader(content: VisibleContent, opts: { includeDrafts?: boolean } = {}): ContentReader {
  // Public reads never serve drafts, even if a snapshot carried one; preview reads may.
  const published = opts.includeDrafts ? content.projects : content.projects.filter((p) => p.status === "published");
  const projectsById = new Map(published.map((p) => [p.id, p]));
  const latest = [...published].sort(byLatest);
  const categories = [...content.categories].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const servedStatus = <T extends { status: "published" | "draft" }>(xs: readonly T[] | undefined) =>
    (xs ?? []).filter((x) => opts.includeDrafts || x.status === "published");
  const reviews = servedStatus(content.reviews);
  const banners = servedStatus(content.banners);

  // Every served item gets exactly one URL: a slug shared by two served items is a hard error
  // (the stored-document schema already refuses it; this guards any other snapshot producer).
  const bySlug = new Map<string, Project>();
  for (const p of latest) {
    if (bySlug.has(p.slug)) throw new ContentReaderError(`duplicate project slug "${p.slug}" (${bySlug.get(p.slug)!.id}, ${p.id})`);
    bySlug.set(p.slug, p);
  }

  function select(selection: ProjectSelection): ListResult<Project> {
    const warnings: QueryWarning[] = [];
    let items: Project[];
    switch (selection.mode) {
      case "latest":
        items = latest;
        break;
      case "category":
        items = latest.filter((p) => p.category === selection.category);
        break;
      case "manual":
        items = [];
        for (const id of selection.ids) {
          const hit = projectsById.get(id);
          if (hit) items.push(hit);
          else
            warnings.push({
              code: "manual-id-missing",
              message: `manual selection id "${id}" is not a visible published project — skipped`,
            });
        }
        break;
      default: {
        const never: never = selection;
        throw new Error(`unsupported selection ${JSON.stringify(never)}`);
      }
    }
    return { items, warnings };
  }

  function assertSlugCollection(type: string) {
    if (type !== "projects") throw new ContentReaderError(`collection "${type}" is not addressable by slug`);
  }

  return {
    getSingleton(type) {
      if (type !== "business") throw new Error(`unknown singleton type "${String(type)}"`);
      return content.business;
    },
    list(query) {
      if (query.type === "projects") {
        const { limit } = query;
        if (!Number.isInteger(limit) || limit < 1) throw new Error(`invalid projects limit ${limit}`);
        const { items, warnings } = select(query.selection);
        return { items: items.slice(0, limit), warnings } as ListResult<ListItem<typeof query>>;
      }
      if (query.type === "categories") {
        return { items: categories, warnings: [] } as unknown as ListResult<ListItem<typeof query>>;
      }
      if (query.type === "reviews" || query.type === "banners") {
        const { limit } = query;
        if (!Number.isInteger(limit) || limit < 1) throw new Error(`invalid ${query.type} limit ${limit}`);
        const items = query.type === "reviews" ? reviews : banners;
        return { items: items.slice(0, limit), warnings: [] } as unknown as ListResult<ListItem<typeof query>>;
      }
      throw new Error(`unknown collection type "${(query as { type: string }).type}"`);
    },
    paginate(query, { page, pageSize }) {
      if (query.type !== "projects") throw new ContentReaderError(`paginate: unknown collection type "${(query as { type: string }).type}"`);
      if (!Number.isInteger(pageSize) || pageSize < 1) throw new ContentReaderError(`invalid pageSize ${pageSize}`);
      const { items } = select(query.selection);
      const total = items.length;
      const pageCount = Math.ceil(total / pageSize);
      if (!Number.isInteger(page) || page < 1 || page > pageCount) return undefined;
      const start = (page - 1) * pageSize;
      return { items: items.slice(start, start + pageSize), page, pageSize, total, pageCount };
    },
    getBySlug(type, slug) {
      assertSlugCollection(type);
      return bySlug.get(slug);
    },
    listSlugs(type) {
      assertSlugCollection(type);
      return latest.map((p) => p.slug);
    },
  };
}
