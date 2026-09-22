# 01 — ProjectFilter contract, index and evaluator

**The key rule:** filter semantics do not live in React. The rules are in one pure module, `platform/content/project-filter.ts`. It has **no imports at all** (no React, DOM, zod, `Intl` or clock); a content `Project` satisfies its record type structurally. The browser island calls it now, and a future backend or NL adapter can call it or reproduce it.

## Contract

```ts
interface ProjectFilter {
  keyword: string;   // free text; whitespace-separated tokens, ALL must match
  type:  string[];   // category ids                      (OR)
  area:  string[];   // area bucket ids of the site scale  (OR)
  style: string[];   // style keywords, site's own words   (OR)
  price: string[];   // price bucket ids of the site scale (OR)
  sort: "newest" | "oldest" | "area-desc" | "area-asc" | "price-desc" | "price-asc";
}
```

- **Closed and typed.** Values are vocabulary ids, not predicates. There is no query language, no generic facet engine and no arbitrary field.
- **Dimensions combine with AND; values within one dimension combine with OR.** An empty dimension adds no constraint.
  - Example: `style=[Warm wood, Terrazzo]` AND `area=[60]` means a project must carry either style **and** be 60–90 m².
- **No source names.** Nothing is named `spaceSizes`, `styleTypes`, `prices`, `sortType` or `serviceTypes`, and there is no upper-bound bucket encoding.

| function | role |
|---|---|
| `toProjectFilterRecord(project)` | picks the only fields filtering may read: id, publishedAt, title, summary, location, scope, keywords (non-empty only), category, area, pricePerArea |
| `buildProjectFilterVocabulary(records, {groups, categories, areaScale, priceScale})` | what ONE site offers, derived deterministically from its served records and settings. It lists only options with ≥ 1 record, and hides a group that has no options |
| `normalizeProjectFilter(input, vocab)` | loose input (URL, UI, future parser) → canonical filter: unknown or unavailable values are dropped, duplicates removed, values put in vocabulary order, keyword normalized, unknown sort → `newest`. Idempotent |
| `evaluateProjectFilter(records, filter, vocab)` | filter + sort. Input order does not matter; output order is total and deterministic |
| `pageOfResults(items, page, 30)` | client page of a result list, clamped |
| `isDefaultProjectFilter` / `activeCriteriaCount` | default view detection and the reset badge |

## Dimensions

### A. Area (existing `area {value, unit}`)
- Buckets are half-open `[min, max)` in the scale's own unit. The bucket is **derived from the value**; no record stores a bucket id.
- Conversion uses fixed definitions and no rounding:
  - 1 평 = 400/121 m²
  - 1 sq ft = 0.09290304 m²
  - Same unit → identity, so there is no float round trip.
- Scales are vertical code (`AREA_SCALES`). A site picks one with the `portfolio.index.areaScale` setting.

| scale | buckets (id → label) |
|---|---|
| `m2` (default) | `lt60` < 60 m² · `60` 60–90 m² · `90` 90–120 m² · `120` 120–150 m² · `150plus` ≥ 150 m² |
| `pyeong` | `lt20` 20평 미만 · `20` 20평대 · `30` 30평대 · `40` 40평대 · `50plus` 50평 이상 |

- Ids are the lower bound. The source's odd upper-bound keys (20평형대 = `30`) are **not** copied.
- The m² labels are language-neutral numerals. 평 labels are Korean because the unit is Korean-market specific.

### B. Style (existing `keywords`)
- The options are the site's own words, taken from served projects and ordered by frequency (DESC), then code point.
- `keywords` absent or `[]` → the project never matches a style filter. `[]` is not even shipped in the index.

### C. Price (existing `pricePerArea`)
- A price scale is **currency + unit specific** (`PRICE_SCALES`): `usd-m2` (5 buckets), `krw-pyeong` (6 buckets, 평당 180만 원 … 400만 원 이상).
- There is **no FX conversion.**
  - A price in another currency counts as missing.
  - A missing price never matches a price filter.
- Per-unit conversion is supported (e.g. KRW per m² → per 평).
- Setting `priceScale: "none"` (the template default) means no price filter and no price sort. The template will not guess a currency.

### D. Service / type
**SERVICE_FILTER = DEFERRED** (canonical-model reason).
- The source's "service" axis is `OLD`/`NEW` building age. It has no control in the source UI and no field in the canonical project schema.
- Inventing a service ontology would pollute the model (spec §5 D).

**TYPE filter = implemented** on the existing semantic field `category`, the project's primary classification in the site taxonomy (for example Kitchen/Bathroom/Living room, or 주거/상업).
- Only categories with ≥ 1 served project are offered, in taxonomy (id) order.

### E. Keyword
**Fields.** Bounded and public: `title`, `summary`, `location`, `scope[]`, `keywords[]`. It never reads the body, quote or gallery.

**Normalization**
- NFC
- whitespace runs collapsed
- trimmed
- lower-cased: case-insensitive for Latin; Korean is unaffected
- capped at 80 chars and 8 tokens

**Match rules**
- Every token must be a substring of the haystack (AND).
- Fields are joined by `\n`, so a token never matches across two fields.
- Korean substring matching works (e.g. `34평`, `해안로 리모델링`).
- There is no fuzzy or vector search.

### F. Sort
- `newest` is the default and **the ContentReader "latest" order**: publishedAt DESC by instant, then id ASC.
- `oldest` is publishedAt ASC, then id ASC.
- `area-desc`/`area-asc` compare in m².
- `price-desc`/`price-asc` compare in the site's price scale.
- **A missing value sorts LAST in both directions.** Ties fall back to the default order.
- A sort is offered only when the data supports it. Price sorts need a price scale.
- There is **no "popular" sort**: no popularity data exists, and none is fabricated.

## Compact public index

**Where it is built.** `templates/interior-01/v1/sections/portfolioFilter.ts` builds it at build time from `ctx.content.list(latest)`.
- A public build therefore contains served projects only: drafts are never returned, and scheduled projects are outside the snapshot.
- The index is `ProjectFilterRecord` plus exactly what a card renders: `href`, `categoryLabel` and `cover {src,width,height,alt}`. This is the same card component and the same fields as the static list.
- A site without a price scale (`priceScale: "none"`) ships **no** `pricePerArea` in the index. No filter or sort could read it (throwaway-build test).

**What it never contains**
- body, gallery, customer quote, builtYear, period, duration
- status, placement flags, source fields
- anything from a draft or scheduled record (test D)

**How it ships**
- It is serialized once, as the props of the client island. React's flight payload is embedded in `portfolio.html` and also written to `portfolio.txt`.
- There is no extra request and no separate file.
- Size, fixture-large `/portfolio`, 173 projects: 57 KB → 157 KB uncompressed, **15.8 KB gzip**. fixture-small: 28 → 36 KB.
  - The 30 static cards are serialized twice (once as SSR props, once in the index).
  - Recorded budget: fine at this scale; revisit above ~1,000 projects (04 open items).

## Future BoostChat seam (documented, not built)

```
Future:   "서울 34평 아파트 리모델링입니다"
            → NL parser / AI (not built)
            → ProjectFilterInput { keyword: "서울 아파트 리모델링", area: ["30"] }   // 34평 → bucket "30" (30평대)
            → normalizeProjectFilter(input, siteVocabulary)
            → retrieval backend (evaluateProjectFilter over the site's served records, or an
              equivalent query that reproduces its documented semantics)
            → matching portfolio results

Now:      filter controls / search box
            → the same ProjectFilter semantics (normalizeProjectFilter)
            → evaluateProjectFilter over the static compact index
            → results
```

**Parity**
- The same vocabulary JSON + the same records + the same filter produce the same ids in any runtime.
- The integration test "parity" checks this: evaluator over the shipped index = evaluator over the stored canonical records.
- The visual smoke checks it too: browser card ids = the Node evaluator result.

**Not built:** an HTTP endpoint, embeddings, a vector DB, semantic search and an NL parser.

**Keyword note**
- The keyword dimension is the seam for free text the parser cannot map to buckets.
- Stop-word handling, such as dropping "입니다", is the parser's job, not the evaluator's.
