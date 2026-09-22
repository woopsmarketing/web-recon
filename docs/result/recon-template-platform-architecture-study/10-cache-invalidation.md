# 10 — Cache / Invalidation (Part L · 캐시 / 무효화)

## Decision

**MVP NOW — the static per-site build is the cache.**

- Each site is built with Next.js static export (reused mechanism, `01` §11.1, §16.1).
- Content is read **once, at build time**, through the reader (`09`). Public requests never touch a
  database or the content files.
- A content, settings, template or platform change leads to a **rebuild of that site**.
  - The operator runs `site:build <siteId>`.
  - The build is skipped only when the site's last **successful, deployed** build has the same build input
    identity (`11`). A failed or undeployed build never blocks a retry.
  - Builds of one site run one at a time (per-site lock), so an older build cannot deploy last.
- HTTP caching reuses the existing server policy: hashed `/_next/static/*` and `/media/*` are
  `immutable`; HTML is `no-cache` (revalidated) (`01` §20.1).

**The boundary that must exist now** is small:

1. All reads go through `createSiteContext` (`09`), **per unit**: singleton, collection query, item,
   section settings, route settings. That is the single place a data cache and tags attach later.
2. One **build input identity** per site build (`11`). It decides whether a build is needed and makes
   every deployed package traceable.

**NEXT — with the first write service (CMS or customer editing):** every write path ends by naming what
changed (`ContentChange`). In static mode that enqueues one site build. MVP operator tools write files
directly, and the operator runs the build.

**LATER — only if static rebuild latency or cost becomes a measured problem:** a server-rendering mode
with cached data and **tag-based revalidation**, using the tag vocabulary below.

- No self-built distributed cache, no event bus, no hand-managed cache keys.

## Cache layers

| Layer | MVP NOW | LATER (server mode) |
|---|---|---|
| Page cache | Pre-rendered HTML files on static hosting/CDN | Framework full-route cache / ISR |
| Query/data cache | In-process memo per build (`09`) | Reader calls wrapped in the framework data cache with tags |
| Revalidation | Rebuild the site | An authenticated route handler in the site deployment calls `revalidateTag(tag, {expire: 0})`; pages regenerate on their next request |
| Change-triggered invalidation | Operator runs `site:build` (no-op when the identity equals the last deployed success). NEXT: `ContentChange` → enqueue the build | `ContentChange` → tags → revalidation request |
| Asset cache | Content-addressed names + `immutable` (reused) | Same (CDN/R2) |

## `ContentChange` (NEXT — the only invalidation input once writers exist)

```ts
type ContentChange =
  | { siteId; kind: "item"; type: CollectionType; id: string; slug?: string; prevSlug?: string; visibilityChanged: boolean; countCrossedZero: boolean }
  | { siteId; kind: "singleton"; type: SingletonType }                      // business, legal, taxonomy (03)
  | { siteId; kind: "section"; templateRef: string; sectionKey: string }    // settings or copy of one section
  | { siteId; kind: "route"; templateRef: string; routeKey: string; structural: boolean } // SEO text vs enable/pageSize
  | { siteId; kind: "config"; templateRef?: string }                         // instance, theme, SEO defaults; navigation carries its templateRef
  | { kind: "release"; templateRef: string; releaseHash: string };          // new release snapshot → pinned sites (11)
```

A change to a settings document whose `templateRef` is **not** the site's pin (a switch or upgrade
candidate) is not a public change. It only affects that candidate's preview build (`11`, `12`).

## Tag vocabulary (defined now, consumed LATER)

The reader and the settings accessor derive tags from the call they serve. **Template code never
mentions tags.**

| Call | Tags attached |
|---|---|
| `getSingleton(type)` (business, legal, taxonomy) | `s:{site}:singleton:{type}` |
| `list({type: "posts", …})` (any filter/limit/offset, including counts) | `s:{site}:list:posts` |
| `listSlugs("posts")` (static params, sitemap) | `s:{site}:list:posts` |
| `getBySlug("posts", slug)` | `s:{site}:item:posts:{slug}` |
| `settings.section(key)` | `s:{site}:section:{key}` |
| `settings.route(key)` | `s:{site}:route:{key}` |
| route availability helper (navigation, link-producing sections; `05`) | `s:{site}:availability:{type}`, **not** `list:{type}` |
| instance / theme / `settings.navigation()` | `s:{site}:config` |

| Change | Tags invalidated |
|---|---|
| Item created/published/unpublished/deleted | `list:{type}` + `item:{type}:{slug}` (+ `item:{type}:{prevSlug}` on slug change) (+ `availability:{type}` when the visible count crosses 0) |
| Item edited, still published | `item:{type}:{slug}` + `list:{type}` (lists render titles, covers and order) |
| Singleton edited (including taxonomy labels) | `singleton:{type}` |
| One section's settings or copy | `section:{key}`: only the pages that render that section |
| Route SEO text | `route:{key}` |
| Route enable/disable or `pageSize` (structural) | `route:{key}` + `config`: the route's own pages, navigation, sitemap and link-producing sections all change |
| Instance / theme / navigation / SEO defaults | `config` → every page of the site (rare) |
| New release snapshot (template or platform) | not a tag: redeploy (server mode) or batch rebuild (static) of pinned sites (`11`) |

Why `list:{type}` is deliberately coarse: page boundaries shift when an item is added (`06` worked
example), so all list pages, counts and the sitemap must refresh **together**. Finer per-page tags would
add complexity and invite inconsistent pages.

Why section tags are fine-grained: a copy edit in one homepage section must not invalidate every page.
`config` is kept for changes that really reach every page.

## Scenario — a new blog article is saved and published

| Target | MVP NOW (static) | LATER (server mode, tags) |
|---|---|---|
| `/blog` | Rebuilt in the site build | Invalidated (`list:posts`) |
| `/blog/page/2…n` (shifted items, new last page) | Rebuilt | Invalidated (`list:posts`) |
| Homepage "latest posts" section | Rebuilt | Invalidated: the homepage called `list(posts)` |
| `sitemap.xml` | Rebuilt | Invalidated (`list:posts` via `listSlugs`) |
| `/blog/[new-slug]` | Generated in the build (new static param) | Generated on first request (dynamic params allowed in server mode) |
| `/about` (reads `business` + navigation) | Regenerated by the full build with **no content difference** | **Untouched** (no `list:posts` tag), unless this is the first visible post: navigation then gains the blog link through `availability:posts` |
| `/portfolio`, `/portfolio/[slug]` | Regenerated, no content difference | **Untouched** |
| Unrelated `/services/*` | Regenerated, no content difference | **Untouched** |

- **Static mode is atomic.** All pages come from one build and are deployed together.
- **Server mode is eventually consistent.** Each invalidated page regenerates on its own next request.
  For a short window `/blog` can show the new post while `/blog/page/2` still shows the old page
  boundary (`06`).

**Honest MVP trade-off.** In static mode "untouched" means *unchanged output*, not *not rebuilt*.

- Cost: one site build is roughly one `next build` of tens to hundreds of pages, plus isolated QA.
- Weighed against it: zero runtime infrastructure, zero request-time DB, deterministic and reviewable
  output, and it reuses the existing static-export, package and QA pipeline.
- The build input identity (`11`) is one hash of the release snapshot, the site snapshot, the mode and the
  toolchain. An identity equal to the last successful, deployed build means no build.
- Delivery can later upload and purge only changed files **if** unchanged pages are byte-stable across
  builds. That requires a deterministic build id. **UNKNOWN** — verify in MVP (`14`).

## When to move to server mode (decision criteria, not a plan)

Adopt tag revalidation only when one of these is **measured**:

- CMS editors need publish-to-live in seconds, not a build.
- Sites reach thousands of pages, so full rebuilds cost too much.
- Scheduled publishing or forms need a runtime anyway.
- Build queue cost across 100+ sites exceeds hosting cost.

Before adopting it:

- **Spike the route shell.** Move route files under `app/[site]` (`05`).
- **Re-verify the revalidation API** in the Next.js version installed at that time. Facts for the installed
  16.3.0:

  | Fact | Evidence (under `node_modules/next/dist/server/`) |
  |---|---|
  | `revalidateTag(tag, profile)` takes a second argument; the one-argument form is deprecated | `web/spec-extension/revalidate.js:42-53` |
  | `updateTag` throws in route handlers and outside a request store; its message points route handlers to `revalidateTag` | `web/spec-extension/revalidate.js:54-59` |
  | A profile's `expire` becomes the tag's expiry. The file-system cache marks the tag stale now and expired at now + `expire`. So `{expire: 0}` expires at once, while `"max"` keeps serving stale content during revalidation | `revalidation-utils.js:121`; `lib/incremental-cache/file-system-cache.js:61-72` |

  Consequence: the CMS writer is a separate service and cannot use `updateTag`. It calls an authenticated
  route handler in the site deployment, which calls `revalidateTag(tag, {expire: 0})`.
- **Deployment lookup.** The writer resolves `siteId` → that deployment's revalidation endpoint and secret.
  With one multi-tenant deployment this is a single endpoint, and the `s:{site}` tag prefix scopes the
  change.
- **Shared tag cache.** With more than one server instance, tags work only if every instance shares the
  cache. Next.js exposes this as a configured cache handler (`cacheHandler` / `cacheHandlers`,
  `node_modules/next/dist/server/config-shared.d.ts:1301-1307`). Use the host's managed implementation;
  building our own distributed cache is out of scope.
- **Consistency.** Accept eventual consistency across pages (above) and tell editors about it.

## Template and platform updates

A new **release snapshot** (template change or shared platform change, `11`) → rebuild the sites pinned to
that major from that snapshot:

- Canary sites first, then promotion to the rest (`11` release flow).
- Batched. Each site builds and runs isolated QA. A failing site keeps its previously deployed package and
  gets an automatic **last-good release hold**, so its later content builds still succeed on its last good
  release until a release passes for it (`11`).
- In server mode a release is a redeploy that reaches every site at once, so canarying needs a separate
  canary deployment (`15` R14).

## Scheduled publishing (DEFERRED)

- Data already supports it (`publishedAt` in the future is invisible, `06`).
- The feature needs either a timed rebuild (static) or a timed revalidation (server).
- Not built until a customer needs it.

## Not built

- a self-built distributed/shared cache platform
- event bus or queue infrastructure beyond a simple build queue
- per-page or per-query hand-written cache keys
- CDN purge orchestration (MVP)
- stale-while-revalidate tuning
- cache warming
