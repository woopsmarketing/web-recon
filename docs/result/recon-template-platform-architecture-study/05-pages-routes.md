# 05 — Page / Route Model (Part E · 페이지 / 라우트 모델)

## Decision

- **Next.js App Router file routes are the router.** No route DSL, no catch-all dispatcher, no per-site
  path configuration.
- The template manifest carries only **metadata about** those routes. Tools that cannot execute Next.js
  need it: sitemap, navigation defaults, route toggles, requirements, invalidation mapping, catalog.
- A build-time **drift test** asserts that manifest routes and route files match. The anchor-guard
  lesson from `01` §16.1 applies: fail loudly, never half-apply.

A separate Route Model is **not** necessary. Today's `RuntimeRouteMap` (`01` §10) exists only because the
legacy app had one catch-all over a crawl table. Authored templates have real route files.

## What is machine-readable vs what stays code

| Machine-readable (manifest `routes[]`) | Stays Next.js code |
|---|---|
| `key` — standard route key for the vertical (`home`, `projects.index`, `projects.detail`, …) | `app/**/page.tsx` files, layouts, `loading`/`not-found` |
| `path` — the template's URL pattern (`/portfolio/[slug]`) | `generateStaticParams`, `generateMetadata`, `notFound()` |
| `kind` — `static \| list \| detail` | Data fetching through the platform reader (`09`) |
| `collection` — for list/detail kinds | How the page composes its sections |
| `optional` — whether a site may disable it | Pagination UI, breadcrumbs, related items |
| `pageSize` — `{default, allowed[]}` for list kinds | Per-route `<title>` rule (a function) |

## Route kinds in template code

| Kind | File pattern (static-export compatible) | Data |
|---|---|---|
| Static | `app/page.tsx`, `app/faq/page.tsx` | Singletons, section settings, bounded collection queries |
| List, page 1 | `app/portfolio/page.tsx` | `list({type, sort, limit: pageSize, offset: 0})` + `total` |
| List, page n ≥ 2 | `app/portfolio/page/[n]/page.tsx` | Same query, `offset = (n-1)·pageSize`. Params `2..ceil(total/pageSize)` |
| Detail | `app/portfolio/[slug]/page.tsx` | `getBySlug(type, slug)`. Params from `listSlugs(type)` |
| Nested / category (only if a template needs it) | `app/portfolio/category/[category]/page.tsx` (+ `/page/[n]`) | `list({where: {categories: [category]}})` |

Rules:

- **Path pagination, not `?page=`.** The existing static bake refuses any route key containing `?`,
  because static hosts ignore query strings (`01` §11.1). Path pages are also stable, crawlable URLs.
  Apartmentary uses `/portfolio?page=0` and `?TOGGLED_UUIDS=%5B%5D` on detail URLs (A8 §1). These are **not
  reproduced**; the difference is tracked as a production SEO improvement (PRODUCT_VISION §9).
- Page 1 exists only at the list root. `/page/1` is never generated. Out-of-range pages are 404.
- In static export mode detail and page routes use `dynamicParams = false` (reused mechanism, `01`
  §11.1). A new item appears after the next site build (`10`).
- Slugs are unique per (site, collection) and stable once published. Slug-change redirects are DEFERRED
  (`14`).
- **Reserved slugs.** Static segment names beside a collection's `[slug]` (e.g. `page`, `category`) are
  reserved. Slug validation refuses them, because the static segment would shadow the item.

### Static export constraints (verified in the installed Next.js 16.3.0)

| Fact | Evidence |
|---|---|
| With `output: "export"`, a dynamic route whose `generateStaticParams` returns `[]` **aborts the build** (`missing "generateStaticParams()"`) | `node_modules/next/dist/build/index.js:1446-1449` |
| A statically exported page that calls `notFound()` is **still written** as an HTML file | `node_modules/next/dist/export/routes/app-page.js`: HTML appended before the status check |

"Not generated" can therefore only mean **not present at build time**. The mechanism is a **route prune
step**:

- **When and where:** in the disposable, hermetic build workspace, after the release snapshot and the site snapshot
  are copied and before `next build`.
- **What drives it:** manifest route metadata + effective settings + reader results for the site snapshot.
- **Rules:**
  1. **Every dynamic segment whose own parameter list is empty is removed, whatever the declared empty
     behavior.** That covers `[slug]` with no published slugs, `page/[n]` when `total ≤ pageSize`, and
     `category/[category]` when no category has published items. This rule alone prevents the build abort.
  2. Disabled `optional` route → remove that route's **own files only**: `<path>/page.tsx` and
     `<path>/page/[n]/` for a list route, `<path>/[slug]/` for a detail route.
  3. List route over an empty collection:
     - `empty: "hide"` → remove `<path>/page.tsx` and `<path>/page/[n]/`
     - `empty: {fallback}` → keep `<path>/page.tsx`, which renders the template's empty state (`noindex`)
- **Mapping:** a manifest route `path` maps to files by fixed convention: `<path>/page.tsx`,
  `<path>/page/[n]/`, `<path>/[slug]/`, `<path>/category/[category]/` and its `page/[n]/`. The drift test
  verifies that convention (`04` gate 5).
- **Limits:** only files and dynamic-segment directories of declared routes are removed, never a parent
  directory, so a nested detail route survives when its list route is pruned. Template source is never
  modified.
- **Slugs:** published items of types with detail pages must have a slug (`03`), so a non-empty collection
  always yields a non-empty `[slug]` parameter list.
- **Tests (`14` Slice 2):** 0 items under `hide` and under `{fallback}`; `total ≤ pageSize`; a disabled list
  route with a live detail route.

Navigation, sitemap and link-producing sections use the **same** route-availability result, so no link
points at a pruned route.

## Standard route keys (vertical level) vs template paths

- A vertical defines **route keys and conventional paths**. Templates in that vertical should use the
  conventional path unless their design needs a different one.
- Sites **cannot change paths**. Switching templates may change paths, and the switch dry-run then emits a
  redirect list (`12` Scenario 5).

Apartmentary evidence levels (defined in `13`):

- **L1**: byte-exact Source Package + Faithful Clone (`/` only)
- **L2**: structural observation (DOM, layout probes, screenshots)
- **L3**: crawl-verified only (discovered + HTTP 200 + title + structure fingerprint; content never examined)

| Key (interior) | Conventional path | Apartmentary source path and evidence |
|---|---|---|
| `home` | `/` | `/` — L1 |
| `projects.index` | `/portfolio` | `/portfolio?page=0` — L2; `?page=1` — L3 |
| `projects.detail` | `/portfolio/[slug]` | L2: 4 pages (2 per structural family). L3: 25 more (families of 20 and 9) |
| `faq` | `/faq` | `/faq` — L2 |
| `services` | `/services` | `/service` — L2 |
| `about` | `/about` | `/brand` ("…소개") — L3 |
| `locations` | `/stores` | `/stores` ("직영점 안내") — L3; also the hidden band banner's `url` |
| `legal.terms`, `legal.privacy` | `/terms`, `/privacy` | `/terms`, `/terms?termsType=PERSONAL_INFO` — L3 |
| `posts.index`, `posts.detail` | `/blog`, `/blog/[slug]` | `/journal`, `/journal?page=1`, 15 × `/journal/{slug}` in 5 structural families (one family = 4 content-identical URLs) — L3 |
| — | — | `/parts` ("파츠") — L3; a product-line page whose vertical meaning is unknown, so no key |

- Only L1/L2 routes are candidates for the first Apartmentary template version (`13`).
- L3 keys are listed so the vertical vocabulary is not homepage-shaped. Each needs observation before any
  template work.

## Site-level route toggles

- Only routes with `optional: true` can be disabled (`enabled: false` in site settings, `08`).
- A disabled route is pruned from the build workspace (see above). It is removed from navigation and the
  sitemap, and link-producing sections stop linking to it.
- **Validation refuses** a disable that would leave a dead internal link from a non-disableable section.
  Example: disabling `projects.detail` while `home.projects-a` renders detail links. The site must also
  disable that section, or the template must declare a no-link card variant. This is the reused
  enablement doctrine (`02`) without the region analysis.
- Empty list routes follow `empty` behavior. The default `hide` means pruned, not linked and not in the
  sitemap.

## SEO per page (reuses `01` §7.1 rules; applied through framework metadata)

| Route kind | Title / description source (first available wins) | Notes |
|---|---|---|
| Static | site override for this route key → template rule (e.g. `"{sectionTitle} \| {brandName}"`) → `needs-input` with a brand-only preview fallback | Home: brand + tagline rule |
| List | site override → `"{collectionLabel} \| {brandName}"`; page n adds `" – {n}"` | Keeps list pages unique (reused title-uniqueness check) |
| Detail | `item.seo.title` → `"{item.title} \| {brandName}"` | Description from `item.seo.description` → `item.summary` → none |

- `canonical` and absolute sitemap URLs exist only when the site has a production domain (reused rule:
  never invented).
- Preview sites: `robots` → `Disallow: /`, no sitemap URL (reused `generateRobotsTxt` semantics).
- Structured data (JSON-LD) is emitted only from real content: Organization/LocalBusiness from
  `business`, `CreativeWork`-style detail data from items. Never a rating or review aggregate that the
  content lacks (PRODUCT_VISION §9).
- Implemented with `generateMetadata`, `app/sitemap.ts` and `app/robots.ts`. These work with static export
  and replace the legacy head splice (`02`, REMOVE_FROM_NEW_PATH).

## Navigation

```
manifest.navigation (ordered keys + default labels)
  − routes disabled by the site
  − routes hidden because their collection is empty (hide behavior)
  + site overrides: labels, hidden keys, ≤ N extra external links (validated by the reused URL allowlist)
= rendered navigation
```

Apartmentary renders navigation with `router.push` click handlers and **zero `<a href>`** (A8 §2).
Templates must render real anchors (`<Link>`), a production-quality improvement and not a fidelity loss.

## Site context: the one place multi-tenancy later touches routing

- Route files are thin. They obtain the site context from one platform helper and call page/section
  components.
  - MVP (static per-site build): the helper reads `SITE_ID` at build time.
  - Later (server mode, if chosen in `10`): host → siteId resolution in middleware.
- The usual multi-tenant pattern also moves route files under an `app/[site]/…` segment. With it come
  per-route segment config changes (e.g. `dynamicParams`, which static export forces to `false`) and
  host → site resolution.
- That is a **route-shell change**, not a section/component change. Its size is unverified: **spike it
  before choosing server mode** (UNKNOWN; `15` R6).

## Not built

- a custom router or route DSL
- a catch-all dispatcher over a route table
- per-site URL paths
- query-string routing for static builds
- automatic route invention from service-client names or labels
