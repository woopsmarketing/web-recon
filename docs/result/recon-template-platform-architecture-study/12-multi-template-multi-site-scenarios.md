# 12 — Multi-Template / Multi-Site Scenario Tests (Part O · 시나리오 검증)

Each scenario is traced through the proposed architecture (`03`–`11`). Mechanisms are referenced, not
re-explained.

**What a verdict means.** No code exists. Each verdict is a design-level trace: it names the mechanism
that must be built and tested (`14`). It is not a test result.

Common setup:

| Thing | Where |
|---|---|
| Template code | Exists once per major: `templates/<id>/v<major>/`. Customer builds use the major's **promoted release snapshot** (`11`) |
| One site | `data/sites/<siteId>/` = `site.json` + `settings/<templateRef>.json` + `content/` + `assets/` (`09`) |
| `site:build <siteId>` | Hermetic workspace outside the repository = promoted release snapshot (with its own installed dependencies) + site snapshot → route prune (`05`) → Next.js static export → isolated QA → package (`02` D, `11`). Skipped only when the last successful, deployed build has the same `buildInputId` |

| Mode | Meaning |
|---|---|
| **MVP** | Static per-site builds (`10`) |
| **LATER** | Server mode with tag revalidation, adopted only on the criteria in `10` |

---

## Scenario 1 — 10 templates, 100 customers; Template A (30 customers) has a bug

**Can it be fixed without editing 30 customer codebases?** Yes. There are no customer codebases.

Exactly how:

1. Fix the bug once in `templates/interior-a/v1/`. Bump the manifest version `1.3.0 → 1.3.1` (PATCH: no
   settings, slot, route, requirement or default change, `11`).
2. Run `template:release interior-a@1`. The immutable snapshot is copied **first**. The gates then render
   every fixture site from that snapshot, before and after the fix, at standard widths; diffs must be
   confined to the defect area. Results are stored under the release hash, and the snapshot becomes a
   **candidate**.
3. **Canary.** `template:canary <hash>` builds 2–3 pinned sites picked from the site index (different
   content sizes, different settings) from the candidate, in preview mode. Isolated QA runs, a person
   inspects the visual diff against the live packages, and the review is recorded under the hash.
4. `template:promote <hash>` (refused without recorded gate passes and a canary review), then
   `sites:rebuild --release <hash>`. The site index yields the 30 sites.
   - Each site builds from the same release snapshot plus its own site snapshot, in its own hermetic
     workspace, followed by per-site isolated QA.
   - Pass → deploy.
   - Fail → the currently deployed package stays live, the failure is reported, and the site gets a
     **last-good hold**. Its content publishing keeps working on the previous release until a later
     release passes for it (`11`).
5. Build records now show a new `buildInputId` (new release hash, version `1.3.1`) for every site.
   - Rollback = redeploy the retained previous packages, or promote the previous release hash and rebuild.
     Promoting the older hash first checks every pinned site's settings against its schemas; a site that
     already uses a key the old release lacks is reported and keeps its package (`08`).
6. The other 70 sites use other templates. Their promoted releases did not change, so each
   `buildInputId` still equals that site's last successful, deployed build and nothing is rebuilt.

**Variant: the bug is in the shared `platform/`** (all 10 templates, 100 sites):

- The change is accepted into `platform/` only when `template:verify --all` passes for **every** active
  major. A failure in one major means fixing the change first, never a partial platform.
- Each major then gets its own candidate → canary → promote, so the rollout is staged template by
  template, not all 100 sites at once.
- Frozen majors keep building from their existing snapshots, with their own platform copy and
  dependencies. If the bug is a security issue, the fix is released from a maintenance worktree
  materialized from the frozen snapshot, without later platform changes (`11`; blast radius `15` R14).

Why it works:

- Per-site differences are data: content, settings, theme tokens, identity and assets. None of them is
  code (`08` fork prevention).
- Workspaces are disposable, hermetic copies of the release snapshot outside the repository (the
  `copyTemplateApp` doctrine, re-implemented). They are never edited and never kept.

LATER (server mode): one deploy of the template major's app replaces 30 builds, behind the same gate.

- The blast radius becomes all 30 sites **at once**.
- The canary therefore becomes a preview deployment, checked against a sample of real site snapshots before
  promotion.

Today, by contrast, each site is its own app copy with baked data. A template fix reaches no existing site
without re-running that site's pipeline, and no upgrade path exists (`01` §16, §18, §22, §23).

**Verdict: PASS.**

---

## Scenario 2 — Template A default homepage portfolio = 8; customer #17 wants 4

**Template fork? No. DB schema change? No. Component copy? No.**

1. Template A declares `home.projects` with `limit` in its allowed values (for a 4-column grid, e.g.
   4/8/12), default 8 (`04`).
2. Customer #17's settings document gets one key:
   `{"templateRef": "interior-a@1", "sections": {"home.projects": {"settings": {"limit": 4}}}}`.
3. At build, `mergeEffectiveSettings` gives `limit: 4`. `selectionToQuery` turns it into
   `reader.list({type: "projects", …, limit: 4})`. The **same** component renders 4 cards.
4. Sites that did not override keep 8. Defaults never change within a major, so they keep 8 until they
   explicitly upgrade to a major with a different default (`08`, `11`).

Template A is hypothetical. In `interior-01` the same request is `limit: 4` within its allowed range 3–12
(default 10, `13`).

Edge cases:

| Request | Outcome |
|---|---|
| #17 wants 5, but the grid only supports multiples of 4 | Validation error listing allowed values. The site either picks an allowed value, or the template gains a variant for odd counts in a **minor** release, for every site. Never a copy for #17 |
| Template A never exposed `limit` | One-time template **minor**: add `limit` with default 8 (output-preserving). All other sites are unchanged |

The settings document is a validated JSON document (a JSONB row later, `09`). New keys never change a
table schema.

**Verdict: PASS.**

---

## Scenario 3 — 173 projects; homepage 4 featured; `/portfolio` all projects, 12 per page; #174 published

Settings in effect:

- `home.projects = {selection: {mode: "featured"}, limit: 4}`
- `projects.index.pageSize = 12`, `sort: ["publishedAt:desc"]` (the reader appends the `id` tie-breaker,
  `06`)

### Data behavior

- One item is added to `projects`: `status: "published"`, `publishedAt = now`, a new `id`, a unique
  `slug`. In JSON that is one array entry; later it is one `content_items` row.
- Nothing else is written: no page records, no bucket moves, no homepage list edit.
- The total (174) is derived by the query.

### Homepage behavior

| #174 state | Homepage |
|---|---|
| Not featured (default) | Query `where: {featured: true}, sort: ["order:asc", "publishedAt:desc"], limit: 4` returns the same 4. Output identical |
| Featured | It takes its place in the sort. The previous 4th item drops out. No manual placement |
| (Site uses `latest` instead) | #174 becomes first; the previous 4th drops |

### Pagination behavior

| | Before (173) | After (174) |
|---|---|---|
| Page count | ceil(173/12) = 15 | 15 |
| Last page (`/portfolio/page/15`) | 5 items | 6 items |
| `/portfolio` (page 1) | #173 … | #174 first. Its former 12th item becomes the first item of `/portfolio/page/2` |

- The shift cascades one position through every page. A 16th page appears only when the total passes 180.
  `generateStaticParams` derives `2..ceil(total/12)` (`05`).
- `/portfolio/[slug]` for #174 comes from `listSlugs("projects")`.

### Cache behavior

| Mode | What happens |
|---|---|
| MVP | Publish (operator edit; NEXT: a writer emits `ContentChange`) → site snapshot hash changes → `site:build` → every page is regenerated **together**, so page boundaries stay consistent (`06`) → QA → deploy. HTML is `no-cache`, so the next request gets the new pages. Hashed assets stay `immutable` |
| LATER | `ContentChange{kind: "item", type: "projects", visibilityChanged: true}` → the site deployment's authenticated revalidation route runs `revalidateTag(tag, {expire: 0})` for `s:{site}:list:projects` + `s:{site}:item:projects:{slug}` (`10`). Invalidated: homepage (it called `list(projects)`), all `/portfolio` pages, the sitemap, and detail pages that render related items. Each regenerates on its own next request, so pages are eventually consistent. Pages that read only `business` or other types stay cached |

**Verdict: PASS.** No template edit, no record movement.

---

## Scenario 4 — `reviews = []`; the template contains a Reviews section

Declaration assumed (as in `interior-01`, `13`):
`home.reviews`, `requires: {reviews: {level: "OPTIONAL"}}`, `empty: "hide"`.

Exact behavior:

1. At build, `reader.list({type: "reviews", limit: 6})` returns `{items: [], total: 0}`.
2. The section renders **nothing**: no heading, no carousel, no section image, no empty wrapper. Adjacent
   sections render normally.
3. Routes and navigation: `interior-01` has no reviews route, so nothing else changes. A template with a
   `/reviews` route and `empty: "hide"` would prune that route from the build workspace, and would not
   link it or list it in the sitemap (`05`, `06`).
4. SEO: no `Review` or `AggregateRating` structured data. Structured data is emitted only from real content
   (`05`).
5. Readiness depends on the declared level:
   - `OPTIONAL`: nothing; the site can go live.
   - `RECOMMENDED`: a warning in the requirements report.
   - `REQUIRED`: `INPUTS_REQUIRED`; preview only (`03`).
6. **Alternative, only if the template author declared it:** `empty: {fallback: "ConsultationCta"}`
   renders a reviewed template component, e.g. a consultation CTA built from `business.contact`. It
   contains no testimonial, rating, count or quote.
7. **Never:** placeholder reviews, lorem ipsum, AI-generated testimonials, or source-site reviews. The
   schema refuses them, not only a claim regex (`03`):
   - a review item without `source: customer-provided | imported-with-consent` is invalid
   - item `origin` has no generated value, and `generatedFields` may not name review text, author or
     rating
   - `origin: "reference-fixture"` is rejected under `data/sites/**` and in packaging

A customer with 24 reviews gets `limit` of them (default 6), chosen by the section's selection.

**Verdict: PASS.**

---

## Scenario 5 — Customer switches Template A → Template C

### Survives unchanged (template-independent)

- All content: `business`, `projects`, `reviews`, `banners`, `taxonomy`, … plus the asset registry and
  bytes
- Site Instance: `siteId`, identity, domains, status, SEO defaults
- Theme token **values**, which are re-validated against C
- Edit history

### Transfers only when compatible (`transferSettings`, NEXT, `07`)

| From A | Rule |
|---|---|
| Section `settings` | Carried when C has a section of the **same kind** and the value is allowed there. Otherwise clamped to the nearest allowed value and reported as *adjusted*, or dropped |
| Copy slots with standard names (`title`, `body`, `cta`, …) on the same kind | Carried, subject to C's `maxLength`. An overlong value becomes needs-input, never a silent truncation |
| `enabled: false` | Carried by section kind |
| Navigation labels | Carried by route key when C has the key |

### Cannot safely transfer

- `variant` values: per-template enums.
- Settings of sections C lacks (e.g. A's `home.projects-b` with no C counterpart): dropped and reported.
- Route toggles and `pageSize` for routes C lacks or where C allows different values.
- Manual selections whose section kind differs in C.
- Copy that fit A's layout and tone: carried, but flagged for human review in preview.
- URL paths: C may use `/projects/[slug]` where A used `/portfolio/[slug]`. A redirect list is required
  (`05`).

### Validation required

1. **Vertical:** C's vertical matches the site's content types.
2. **Settings:** the transferred document passes C's strict schemas.
3. **Requirements:** C's `REQUIRED` content and slots (e.g. `services ≥ 1`). Unmet → `INPUTS_REQUIRED`
   blocks indexable production.
4. **Theme:** tokens C consumes; reused contrast checks. Missing tokens → C's defaults.
5. **Assets:** C-specific media slots (e.g. a wide hero image) → needs-input.
6. **Routes:** redirects for changed paths; dead-link and last-route rules (`08`).
7. **Build gates:** brand isolation and isolated QA on the preview build.

### Flow

```
site:switch <siteId> --to interior-c@1 --dry-run
  → report {carried, adjusted, dropped, needs-input, redirects}
  → writes settings/interior-c@1.json (candidate; the live pin is untouched)
site:preview <siteId> --template interior-c@1    (noindex; the site snapshot takes settings/interior-c@1.json,
                                                  so candidate edits change the preview's buildInputId)
  → human acceptance
site:pin <siteId> interior-c@1 → build → QA → deploy (+ redirects)
```

A's settings document stays stored, so switching back restores A exactly (`08`).

**Verdict: PASS, with NEXT work** (transfer function, redirect output). It cannot be exercised before a
second template exists (`14`).

---

## Scenario 6 — Storage JSON → Supabase

**Modules that change** (`09` table):

- New Supabase reader backend, only if server mode is adopted
- New `exportSnapshot(siteId)` for static builds
- One-off import script, validated with the shared schemas
- CMS writer service with auth and RLS
- `AssetResolver` base URL and object storage
- Build trigger: an operator command becomes a mutation hook
- Revisions: file chain becomes a table

**Template modules that must NOT change:**

- Everything under `templates/**`: route files, sections, components, styles, manifest, fixtures
- Content model schemas and the reader type map
- `ContentReader` / `SiteStore` / `AssetResolver` interfaces and query-descriptor semantics
- Settings merge and validation
- SEO helpers and the readiness gate

What makes it true:

- Dependency lint: `templates/**` may import `platform/*` only; no `node:fs`, no `@supabase/*`.
- The reader conformance suite, written in MVP against the JSON reader (`09`), runs unchanged against the
  new backend. It covers item, instance, settings and asset isolation and the ordering of missing sort
  values, where Postgres and a JavaScript sort differ by default.
- The migration procedure's snapshot byte-compare and output compare (`09`).
- The new reader lives in `platform/`, so it ships through new release snapshots with the normal gates
  (`11`). Template directories stay byte-identical.

**Verdict: PASS**, conditional on the lint rule and conformance suite existing **from MVP**. Both are
scheduled in `14` Slice 2.

---

## Scenario 7 — Future CMS publishes a blog article (LATER)

Assumed template: `posts.index` `/blog` (pageSize 9) + `/blog/page/[n]`, `posts.detail` `/blog/[slug]`,
homepage `home.latest-posts` (`latest`, limit 3), `app/sitemap.ts`.

| Step | What happens |
|---|---|
| **Admin UI** | Customer edits a draft (preview mode shows drafts, `noindex`) and presses Publish |
| **Validation** | The writer service authenticates, resolves tenant → `siteId` (RLS), validates with the **published** `posts` schema (the same zod schema used in the JSON era) and runs the reused validator: URL allowlist, no raw HTML, control characters |
| **Persistence** | One transaction: `content_items` row → `status: published`, `publishedAt`, `updatedAt`; a revision row appended (reused chain semantics) |
| **Cache invalidation** | The writer emits `ContentChange{siteId, kind: "item", type: "posts", id, slug, visibilityChanged: true}`. Server mode: it resolves the site's deployment and calls its authenticated revalidation route, which runs `revalidateTag(tag, {expire: 0})` for `s:{site}:list:posts` and `s:{site}:item:posts:{slug}` (`updateTag` is Server-Action-only, `10`). Static mode: enqueue `site:build` (coalescing bursts of edits) |
| **`/blog`** | Next request re-runs `list({type: "posts", sort: ["publishedAt:desc"], limit: 9, offset: 0})`; the new post is first. All `/blog/page/n` carry the same tag, so all are invalidated at once, but each regenerates on its own next request (eventually consistent, `10`). A new last page appears when the total passes a multiple of 9 |
| **Homepage** | `home.latest-posts` called `list(posts)` and carries `list:posts`, so the page regenerates. Its `business` and `projects` data come from their still-valid cache entries |
| **Sitemap** | `app/sitemap.ts` called `listSlugs("posts")` (`list:posts`) and regenerates with the new URL. The URL is absolute only when the site has a domain |
| **`/blog/[slug]`** | Never rendered before: generated on first request (server mode) or in the build (static) |
| **Untouched** | `/about` (reads `business`), `/portfolio*` (reads `projects`), `/services/*`: no `list:posts` tag. Exception: the site's first visible post changes navigation on every page through `availability:posts` (`10`) |

**Verdict: PASS** in server mode. In static mode the same trace holds, except "untouched" means "rebuilt
with unchanged output" (`10` honest trade-off).

---

## Scenario 8 — A template update is visually breaking

1. The change is classified **MAJOR** (`11`): changed default visual output, removed or narrowed
   settings, new `REQUIRED` content.
2. It lands in a **new directory** `templates/interior-a/v2/`.
   - Manifest: `supersedes: "interior-a@1"`.
   - Its own fixtures.
   - `migrateSettings(v1 document)`.
3. Existing sites pin `interior-a@1`. Their builds keep using v1, so **nothing changes for them**. v1
   receives only critical fixes.
4. Each site upgrades explicitly: dry-run → preview → visual diff against the live package → acceptance →
   pin change (`11`). Settings per `templateRef` make rollback a pin flip.
5. Safety net if a breaking change is mislabeled PATCH or MINOR:
   - The fixture regression gate in `template:release` flags visual diffs over the threshold.
   - The candidate is canaried before promotion, and batch rebuilds run per-site QA.
   - Failing sites keep their live package.
   - Previous packages are retained for rollback.

Accepted cost: two majors are maintained until sites migrate. A major is deleted at zero pins (`11`).

**Verdict: PASS.**

---

## Scenario 9 — Template A uses projects on `/`, `/portfolio`, `/portfolio/[slug]`; 20 new projects over months

**Does anything require manual template editing? No.**

| Surface | Why no edit is needed |
|---|---|
| `/portfolio/[slug]` | Params = `listSlugs("projects")` |
| `/portfolio`, `/portfolio/page/[n]` | Page count = `ceil(total / pageSize)`; items = offset queries |
| Homepage sections | They run queries (`selection` + `limit`), not fixed lists |
| Sitemap and metadata | Derived from items |
| A new category | A taxonomy term is content; a section can target it through settings |

Each publish only causes a rebuild (MVP) or a tag revalidation (LATER).

Designs that **would** force edits, all excluded here:

- Per-item placement flags such as `isBottomArea1Display` (`03`)
- A closed crawl route table (`01` §10)
- Page data baked into per-page JSON (`02`, old-assumption row A8)

A template edit is legitimate only for a real template improvement for **all** sites: showing a new card
field, a new detail layout, a filter. It ships as a minor release only when it is opt-in (a new variant or
setting whose default keeps current output). Changing what every site shows by default is a major (`11`).

**Verdict: PASS.**

---

## Summary

| # | Scenario | Template fork | Component copy | DB schema change | Verdict |
|---|---|---|---|---|---|
| 1 | Bug in A, 30 sites (or in `platform/`) | no | no | no | PASS — release snapshot + canary + promote + batch rebuild |
| 2 | Limit 8 → 4 for one site | no | no | no | PASS — settings key |
| 3 | #174 published | no | no | no | PASS — queries, not buckets |
| 4 | `reviews = []` | no | no | no | PASS — declared empty behavior, no fake content |
| 5 | Switch A → C | no | no | no | PASS with NEXT work — transfer + redirects |
| 6 | JSON → Supabase | no | no | storage only; templates untouched | PASS — conditional on lint + conformance suite |
| 7 | CMS publishes a post | no | no | no | PASS (server mode); static mode rebuilds with identical unrelated output |
| 8 | Visually breaking update | new major directory (per template, never per customer) | no | no | PASS — explicit upgrades |
| 9 | 20 new projects | no | no | no | PASS |
