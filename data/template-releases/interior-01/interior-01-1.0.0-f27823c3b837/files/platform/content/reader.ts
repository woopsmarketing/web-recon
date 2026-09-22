import type { Category, Project, SingletonTypes, VisibleContent } from "./schema";

/**
 * Site-scoped ContentReader over the visible content of ONE site snapshot.
 *
 * Queries are CLOSED descriptors (no arbitrary filters/SQL). Ordering is always
 * deterministic: every sort ends with an `id` ascending tie-breaker.
 * The reader is storage-independent: JSON today, another store later, same API.
 */

export type ProjectSelection =
  | { mode: "latest" }
  | { mode: "category"; category: string }
  | { mode: "manual"; ids: string[] };

export type CollectionQuery =
  | { type: "projects"; selection: ProjectSelection; limit: number }
  | { type: "categories" };

export interface QueryWarning {
  code: "manual-id-missing";
  message: string;
}

export interface ListResult<T> {
  items: T[];
  warnings: QueryWarning[];
}

type ListItem<Q extends CollectionQuery> = Q extends { type: "projects" } ? Project : Category;

export interface ContentReader {
  getSingleton<K extends keyof SingletonTypes>(type: K): SingletonTypes[K];
  list<Q extends CollectionQuery>(query: Q): ListResult<ListItem<Q>>;
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
  const categories = [...content.categories].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  function listProjects(selection: ProjectSelection, limit: number): ListResult<Project> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`invalid projects limit ${limit}`);
    const warnings: QueryWarning[] = [];
    let items: Project[];
    switch (selection.mode) {
      case "latest":
        items = [...published].sort(byLatest);
        break;
      case "category":
        items = published.filter((p) => p.category === selection.category).sort(byLatest);
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
    return { items: items.slice(0, limit), warnings };
  }

  return {
    getSingleton(type) {
      if (type !== "business") throw new Error(`unknown singleton type "${String(type)}"`);
      return content.business;
    },
    list(query) {
      if (query.type === "projects") {
        return listProjects(query.selection, query.limit) as ListResult<ListItem<typeof query>>;
      }
      if (query.type === "categories") {
        return { items: categories, warnings: [] } as unknown as ListResult<ListItem<typeof query>>;
      }
      throw new Error(`unknown collection type "${(query as { type: string }).type}"`);
    },
  };
}
