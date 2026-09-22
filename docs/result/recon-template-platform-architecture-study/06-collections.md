# 06 — Collection Model (Part F · 컬렉션 모델)

## Decision

- A collection is **a typed list of items per site** (`03`), stored once.
- It is read through **closed query descriptors** (`09`). Every view is a query over the same data:
  - homepage "4 featured"
  - `/portfolio` page 3
  - "related projects"
  - the sitemap
- Records are never moved, bucketed or copied into pages.
- Pagination is **offset-based** over a **total, deterministic order** (`ORDER BY <sort key>, id`).
  Pages are addressed by path (`05`).
- Scheduled publishing, cursors, facets and search are DEFERRED.

Nothing to reuse exists: collections are detection-only and pagination, filtering and sorting are absent
(`01` §12–14).

## Item lifecycle

```
draft ──publish──▶ published (publishedAt set) ──archive──▶ archived
  ▲                    │
  └──────unpublish─────┘
```

- **Public visibility** = `status === "published" && publishedAt <= T`.
  - T is the build time in static mode, or request time in server mode (`10`).
- A future `publishedAt` is therefore representable for free. **Scheduled publishing as a feature is
  DEFERRED.** Static mode would need a timed rebuild; server mode a timed revalidation.
- Preview mode (operator/CMS preview only) includes drafts (`09`).

## Query descriptor (template-facing)

```ts
type CollectionQuery<T extends CollectionType> = {
  type: T;
  where?: {
    featured?: true;
    categories?: string[];     // any-of, taxonomy slugs
    ids?: string[];            // manual selection; result keeps this order
    excludeIds?: string[];     // e.g. "related items" excluding the current one
    // + filterable fields a vertical explicitly declares (e.g. interior pricePerPyeong range), later
  };
  sort?: SortKey<T>[];         // ordered list of closed keys per type, e.g. ["order:asc", "publishedAt:desc"]
  limit: number;               // capped per type (e.g. ≤ 48)
  offset?: number;
};
// result: { items: Item<T>[]; total: number }
```

There is no free-form field filter, no OR/AND expression tree and no raw SQL/PostgREST syntax. The
descriptor is closed so JSON and Supabase backends can both implement it exactly (`09`).

**Determinism.** Every sort appends `id` as a tie-breaker, e.g. `publishedAt desc, id desc`. Without it,
imported items that share a timestamp can swap pages between two builds. This is the collection-level
version of the determinism the pipeline already insists on (`01` §15.1 hashing).

**Missing values.** Optional sort values that are absent (`order`, a draft's `publishedAt`) sort **last** in
every backend: an explicit comparator in JSON, `NULLS LAST` in SQL. The conformance suite checks it (`09`).

## Selection modes (set by site settings, turned into queries by section code)

| Mode | Query | When fewer than `limit` match |
|---|---|---|
| `latest` | `sort: ["publishedAt:desc"]` | Render what exists |
| `featured` | `where.featured` + `sort: ["order:asc", "publishedAt:desc"]` | Render what exists. Auto-fill from latest only if the section declares `fillWithLatest` and the site enables it |
| `category` | `where.categories: [slug…]` + `sort: ["publishedAt:desc"]` | Render what exists |
| `manual` | `where.ids: [...]` (order preserved) | Missing/unpublished ids are skipped **and reported** in validation (`08`) |

One shared helper (`selectionToQuery`) in the platform package converts the declared selection into a
descriptor. It is a function, not a layer (`07` mapper decision).

Apartmentary's two homepage carousels ("30평대 아파트", "구축 아파트") are two instances of one
`projects-showcase` section with `selection: {mode: "category"}`. The customer's projects carry taxonomy
slugs. The source's per-item `isBottomArea1Display` flags are **not** reproduced (`03`).

## Pagination

| | Offset (recommended default) | Cursor |
|---|---|---|
| URL model | `/blog`, `/blog/page/2` — numbered, shareable, crawlable | Opaque `?after=…`; poor for static export and SEO |
| Static generation | Enumerate `2..ceil(total/pageSize)` | Must walk the chain; awkward |
| JSON backend | slice after sort | Same |
| Supabase | `.order(...).order('id').range(o, o+l-1)` with `count: 'exact'` | Keyset `where (published_at, id) < (…)` |
| Weakness | Items shift across page boundaries when new items arrive; deep offsets are slower | Stable for infinite feeds; no "page 7" |
| Fit here | Hundreds to low thousands of items per site, numbered page UI, static builds | Not needed until infinite scroll or very large feeds exist |

**Recommendation:** offset with deterministic ordering. Revisit cursor only for an infinite-scroll UI or
collections beyond ~10k items. Neither is on the roadmap.

### Worked example — blog, `pageSize = 9`

Before: 27 posts, 3 pages. `/blog` shows #27…#19. `/blog/page/2` shows #18…#10.

Publish #28:

- The query `publishedAt desc, id desc, limit 9, offset 0` now returns #28…#20. `/blog` gains #28 and
  loses #19.
- `/blog/page/2` (offset 9) returns #19…#11. The former page-1 item #19 is naturally page-2 item #1.
- The total becomes 28 and pages become 4 (`/blog/page/4` holds #1).
- No record moved. Only the query results changed.
- **Static mode (MVP):** every list page is regenerated **together** in one build and deployed together.
  A reader never sees page 1 from before the publish next to page 2 from after it.
- **Server mode (LATER):** all list pages are invalidated by the same tag, but each page regenerates on
  its own next request. Pages are eventually consistent, with no cross-page atomicity (`10`).

## Page size

- Declared per list route by the template: `pageSize: {default, allowed[]}` (`05`).
- A site may pick an allowed value in settings (`08`). Allowed values are the counts the grid layout
  supports, such as 9/12/18 for a 3-column grid.

## Categories, filters, sorting on list pages

| Need | MVP approach | Later |
|---|---|---|
| Section shows one category | `selection.mode = category` | — |
| Category landing pages | Only if a template declares `…/category/[category]` routes (static-exportable) | — |
| Interactive filter on a list page (e.g. Apartmentary's price-per-pyeong buckets, if the capture confirms a filter UI on `/portfolio`) | Client-side filtering over a compact build-time index of that site's published items. Filtered states are `noindex` | Server-rendered filters (server mode) or declared filterable fields in the reader |
| User-selectable sort | Not in MVP. The template picks one sort per list; the site may choose among declared sorts | Same, if a template needs it |

Filterable fields must be **declared per vertical type** (for example
`interior.projects.filterable = ["pricePerPyeong"]`) and implemented generically by each backend. They
are never arbitrary.

## Detail pages and related items

- `getBySlug(type, slug)` returns the item or `null`, which becomes `notFound()`.
- Related items use a normal query:
  `where: {categories: item.categories, excludeIds: [item.id]}, sort: ["publishedAt:desc"], limit: 3`.
- Two detail layouts (Apartmentary has two structural detail families, A8 §1):
  - Prefer a layout derived from **content shape**, such as whether a gallery or before/after set exists.
  - Add a per-item `presentation` enum only if the capture proves an editorial choice.
  - UNKNOWN until captured (`13`).

## Empty behavior (declared by the template, `04`)

| Declaration | Section | List route | Detail route |
|---|---|---|---|
| `empty: "hide"` (default) | not rendered | pruned from the build (`05`), not linked, not in sitemap | pruned whenever it has no published slugs (`05` rule 1); otherwise only published slugs generate |
| `empty: {fallback: "Component"}` | template-authored alternative (no fabricated content) | template empty state (honest copy, `noindex`); `page/[n]` pruned | pruned whenever it has no published slugs (`05` rule 1) |
| `requires: {level: "REQUIRED"}` | as above **plus** readiness `INPUTS_REQUIRED` (blocks indexable production) | same | — |

## Not built now

- cursor pagination
- facet engines and search indexes
- infinite scroll
- scheduled publish jobs
- per-item manual page placement
- per-page caches
- collection-specific repository classes
- a query language
