# 09 — Content Repository Boundary (Part K · 콘텐츠 저장소 인터페이스)

## Decision

- Templates read **all** site data through **one site-scoped, generic, read-only interface**
  (`ContentReader`), plus `AssetResolver`. The Site Instance and effective settings arrive already
  resolved in the site context; `SiteStore` is operator tooling only.
- Queries are closed descriptors (`06`). No storage syntax exists above this line.
- MVP backend = **JSON files**, which are also the **build snapshot format**.
- Later the system of record may be **Supabase**:
  - Static builds export the same snapshot format and keep the JSON reader.
  - Only a server-rendering mode (if ever chosen, `10`) needs a direct Supabase reader.
- A shared **reader conformance suite** keeps backends equivalent. It is written in MVP against the JSON
  reader (`14` Slice 2), so it exists before a second backend does.

Today nothing exists to extend: `src/storage/` holds only `.gitkeep`, there are three private `readJson`
copies, and there is no DB dependency (`01` §19). The design takes two existing doctrines:

- hashing inputs for reproducibility (`hashDirectory`, `01` §15.1)
- atomic writes (temp + rename, `01` §18.1; re-implemented, because the only code is private to a
  superseded module, `02`)

## Interface (illustrative)

```ts
interface ContentReader {
  getSingleton<S extends SingletonType>(type: S): Promise<Singleton<S> | null>;
  list<C extends CollectionType>(q: CollectionQuery<C>): Promise<{ items: Item<C>[]; total: number }>;
  getBySlug<C extends CollectionType>(type: C, slug: string): Promise<Item<C> | null>;
  listSlugs<C extends CollectionType>(type: C): Promise<string[]>;          // generateStaticParams, sitemap
}
interface AssetResolver { url(ref: AssetRef, variant?: string): string }     // /media/<sha>.<ext> now, CDN later

createSiteContext({ siteId, templateRef, mode: "public" | "preview", at /* build or request time */ })
  → { instance, settings, reader, assets, at }                               // the only entry point for templates

// effective settings (08) are read per unit, never as one blob, so later cache tags can be per unit (10)
settings.section(key)  → { settings, copy }         // one section's effective settings + copy slots
settings.route(key)    → { enabled, pageSize, seo }
settings.navigation()  → { labels, hidden, extraLinks }

// operator tooling only; never importable from templates/**
interface SiteStore {
  getInstance(siteId: string): Promise<SiteInstance>;
  getSettings(siteId: string, templateRef: string): Promise<SiteSettings>;  // sparse doc (08)
}
```

Properties:

- `siteId` is bound at construction. A template cannot ask for another site's data, and tenant scoping
  later lives in exactly one place. `SiteStore` takes a `siteId`, so it is operator tooling only;
  templates receive the already-resolved `instance` and `settings`.
- `at` (T) is bound too. Templates never read the wall clock (lint bans `Date.now` and `new Date()` in
  `templates/**`); sitemap `lastmod` comes from item `updatedAt`.
- `mode` is bound at construction. `public` applies the visibility rule (`06`); `preview` includes drafts.
  Components never branch on it.
- Type safety comes from a type map `{projects: InteriorProject, …}` generated from the vertical module
  (`03`). The item type follows from `type: "projects"`.
- Dependency rule, enforced by lint/grep: template code may import `platform/*` only. `node:fs`,
  `@supabase/*`, data paths and SQL are forbidden in `templates/**`.

### Why one generic reader instead of `listProjects` / `getPostBySlug` / …

- Storage is uniform: typed items per site (below). One implementation per backend serves every type and
  vertical. A new vertical type adds a schema, **not** repository methods on every backend.
- The closed descriptor stops the generic API from becoming a query language.
- A template that prefers named calls writes one-line typed sugar locally
  (`const listProjects = (q) => reader.list({type: "projects", ...q})`).
- Full tradeoff: `15` S4.

## MVP backend: JSON files (also the snapshot format)

```
data/sites/<siteId>/                       (gitignored like all of data/; fixture sites live under templates/**/fixtures/)
├── site.json                              Site Instance (08)
├── settings/<templateId>@<major>.json     Site Settings per templateRef (08)
├── content/
│   ├── business.json                      singleton
│   ├── taxonomy.json                      singleton {collection: [{slug, label, order}]} (03)
│   ├── projects.json                      [item, …]  (switch to projects/<id>.json only if size/concurrency demands)
│   ├── banners.json                       interior vertical type (03)
│   └── reviews.json
└── assets/
    ├── assets.json                        registry: {id: sha256, ext, mime, bytes, width, height, license, origin}
    └── <sha256>.<ext>                     content-addressed (reused naming)
data/site-builds/<siteId>/<runId>/         build records and packages — kept OUTSIDE inputs so QA/report files can
                                           never change the input hash (lesson from 01 §19 / freshness exclusions).
                                           Build workspaces themselves live outside the repository tree (11)
```

- **Read:** load and zod-validate each file once per build process (memoized). Filter/sort/slice in
  memory, which is trivial for hundreds to thousands of items.
- **Write (MVP tools only):** validate → write temp → `rename` (reused atomic doctrine). Single writer
  assumed. Append-only history is NEXT (`14`).
- **Build snapshot:** a build never reads `data/sites/<siteId>` directly. It first copies a canonical
  **site snapshot** into the disposable build workspace, then hashes it (reused `hashDirectory`). The
  snapshot contains exactly what the build can see:
  - `site.json`
  - the settings document of the `templateRef` **being built**: the pin for public builds, the candidate
    for a candidate preview (`11`, `12` Scenario 5); other settings documents are excluded
  - content visible in the build mode at build time T (`06`)
  - the asset registry entries those files reference
  
  Editing a draft or a candidate settings document therefore does not change the public build's hash,
  while a candidate preview hashes its own candidate document. The build input identity combines this
  hash with the release snapshot hash. It is defined once, in `11`.

## Later backend: Supabase (illustrative only — nothing is built in this study)

One shared project. Tenancy by row-level security. Never one project per customer.

| Table | Key columns | Body |
|---|---|---|
| `tenants`, `tenant_members` | ids, roles | — |
| `sites` | `id`, `tenant_id`, `status`, `template_ref`, `domains` | `identity jsonb`, `theme jsonb`, `seo jsonb` |
| `site_settings` | `site_id`, `template_ref` (PK pair) | `doc jsonb` |
| `content_singletons` | `site_id`, `type` (PK pair) — includes `business`, `legal` and `taxonomy` (`03`) | `data jsonb` |
| `content_items` | `id`, `site_id`, `type`, `slug`, `status`, `published_at`, `featured`, `sort_order`, `categories text[]`, `updated_at`; unique `(site_id, type, slug)`; index `(site_id, type, status, published_at desc, id desc)` | `data jsonb` (vertical fields) |
| `assets` | `site_id`, `sha256`, `ext`, `mime`, `width`, `height`, `license` | object storage (R2 or Supabase Storage) |
| `revisions` | `site_id`, `entity`, `seq`, `parent`, `hash` | `snapshot jsonb` (reused chain semantics) |

Promoted columns are exactly the fields the closed query descriptor filters and sorts on. Everything else
stays in `data jsonb`, so adding optional vertical fields needs **no migration** (`15` S7).

## What changes when JSON → Supabase

| Changes | Does NOT change |
|---|---|
| System of record: files → tables (one import script, validated by the **same** zod schemas) | Template components, pages, route files |
| New `exportSnapshot(siteId)` writing the JSON snapshot for static builds | Content model schemas and the type map |
| Supabase reader backend, **only if** server mode is adopted | `ContentReader` / `SiteStore` / `AssetResolver` interfaces |
| Write path: CLI file edits → CMS writer service with auth + RLS | Query descriptor semantics (sort, tie-break, visibility, pagination totals) |
| Asset bytes: local dir → object storage; `AssetResolver.url` base changes | `AssetRef` shape and content-addressed naming |
| Build trigger: operator command → mutation hook (`10`) | Settings schemas, merge and validation rules |
| History: file revision chain → `revisions` table | SEO/sitemap/robots helpers, requirements/readiness gate |

## Migration procedure (when the time comes)

1. Freeze writes for the site.
2. Import `data/sites/<id>` → tables, validated row by row with the shared schemas.
3. `exportSnapshot` → byte-compare with the original JSON after canonical sort. Identical, or stop.
4. Build the site from the exported snapshot → compare the build input hash and the HTML output with the
   last JSON build.
5. If server mode exists: run the **reader conformance suite** (written in MVP, see below) against both
   backends on the fixture sites.
6. Flip the site's system-of-record flag. Keep the JSON snapshot as the rollback point.

## Reader conformance suite (MVP, `14` Slice 2)

- One backend-agnostic test file, run in MVP against the JSON reader on the fixture sites.
- A later backend passes the same file unchanged before any site uses it.
- Cases:
  - sort ties broken by `id`; missing optional sort values sort last (`06`)
  - draft and future-`publishedAt` visibility in `public` vs `preview` mode
  - manual selection order, with missing ids skipped
  - category any-of
  - `total` and offset slicing at page boundaries
  - missing slug → `null`
  - singleton absent → `null`
  - `siteId` isolation: a context never returns another site's items, instance, settings or assets

## Not built

- per-domain repository classes
- an ORM layer over templates
- GraphQL
- query builders exposed to components
- per-customer databases
- a generic API-replay data layer, which the prompt keeps deferred and separate
