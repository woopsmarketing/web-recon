# 01 — Content model and ContentReader

The Slice 1 content model and reader are **extended, not replaced**. Every 1.0.0 site document stays valid, because every new field is optional.

## Project schema additions (`platform/content/schema.ts`)

Only fields that the list or detail page actually consumes were added. Names are semantic, and nothing is copied from the source's API field names.

| field | contract | consumer |
|---|---|---|
| `summary` | ≤200 chars | list card line, detail lead, meta description |
| `body` | 1–20 paragraphs, each ≤1200 chars | detail "about the project" |
| `location` | ≤80 chars | fact row |
| `area` | `{value >0 ≤100000, unit: m2\|sqft\|pyeong}` | fact row |
| `builtYear` | int 1800–2100 | fact row |
| `scope` | 1–20 × ≤40 chars | fact row (joined) |
| `period` | `{start: YYYY-MM, end?: YYYY-MM}`, end ≥ start | fact row |
| `durationWeeks` | int 1–520 | fact row, via the `durationFormat` slot |
| `keywords` | ≤12 unique × ≤32 chars; **`[]` allowed** (the source has empty keyword rows) | fact row, rendered only when non-empty |
| `pricePerArea` | `{amount >0 finite ≤1e9, currency ISO-4217 /^[A-Z]{3}$/, unit}` | fact row |
| `galleryGroups` | 1–20 groups `{name ≤40 unique, items 1–80 [{image, before?}]}` | detail gallery, room tabs, before/after |
| `customerQuote` | `{text ≤600, attribution? ≤60}` | detail quote. Optional and never generated. |
| `cover` | now `MediaRefSchema {asset, alt?}` (same shape as before) | cards, gallery fallback |

- **Before/after is data.** It is `galleryGroups[].items[].before`, not a Template variant.
- **Unknown keys still fail.** `ProjectSchema` is strict, so a stray key such as `aptName` or `page` is refused.
- **Asset scan.** `projectAssetRefs()` returns cover + gallery + before refs. It is used by the snapshot loader, so only referenced assets are packaged (`platform/site/load.ts`).
- **Slug uniqueness.** The stored-document refinement rejects a **duplicate slug across the whole collection** (all statuses), not only among published items.

## ContentReader additions (`platform/content/reader.ts`)

| method | behaviour |
|---|---|
| `paginate({type:"projects", selection}, {page, pageSize})` | OFFSET window over the same ordered query that `list()` uses. Returns `undefined` for page <1, a non-integer page, page >pageCount, or an empty collection. The Template therefore 404s instead of rendering an empty page. |
| `getBySlug("projects", slug)` | One served item. Public mode: published only. Preview mode: drafts too. Unknown slug → `undefined` → `notFound()`. |
| `listSlugs("projects")` | Slugs of every served item, in the default (latest) order. |

**Ordering**
- The order is `publishedAt` DESC by instant (`Date.parse`, so offsets are safe), then **`id` ASC**.
- `id` ASC is the tie-breaker accepted in Slice 1. Keeping it means the Slice 1 home output does not change. A new tie-breaker would have been a silent behaviour change.
- The order is computed once per reader, and `list` and `paginate` share one `select()`.

**Validation failures**
- A duplicate served slug throws `ContentReaderError`. This is a second guard for snapshot producers other than the JSON schema.
- Reserved slugs are a route concern, so they are validated in the route plan (see [02](02-routes-pagination.md)).

**Pagination state**
- Nothing about pages is stored. No record has a `page` field (the schema refuses one), and a new newest project shifts every boundary naturally (test M).
- Filters would add a selection mode, not a stored index. Filters were deferred (see [06](06-open-items.md)).

## Tests

These checks are in `platform/test/step4.test.ts`:

| check | what it proves |
|---|---|
| C (unit) | 173 items → 30/30/30/30/30/23 |
| G (unit) | out-of-range page → `undefined` |
| K | storage order does not matter |
| L | equal instants → id ASC across a page boundary |
| M | newest item shifts boundaries; the stored items are byte-identical |
| J | duplicate slug fails in both the schema and the reader |
| — | draft slugs are served only in preview |
| — | every contract bound (period order, unique keywords, price NaN / negative / >1e9, lowercase currency, unknown unit, duplicate or empty gallery group, unknown key) |
