# 16 — Proposed Architecture (최종 아키텍처 제안)

**Status: PROPOSAL — not accepted architecture.** Nothing in `docs/architecture/`, `docs/status/` or
`PRODUCT_VISION.md` changes until the owner accepts it (`15` Q1).

This file shows the shape. Reasons and details live in `03`–`11`. Evidence lives in `01`–`02` and `13`.

Markers used below:

| Marker | Meaning |
|---|---|
| `[R]` | Reused as-is (code or doctrine) |
| `[E]` | Existing concept extended (including rules extracted from legacy files) |
| `[N]` | New |

## 1. Top level

A build has exactly two inputs: a **promoted release snapshot** of shared template code and **one site's
data snapshot**. The preservation layer informs how template code is **written**. It is never an input to
a customer build.

```
        PRESERVATION / REFERENCE LAYER  (exists; frozen evidence)
        Source Package · Faithful Clone · runtime/data evidence · crawl/observation · source SEO snapshot
                         │
                         │ authoring reference · fidelity gate · forbidden brand terms
                         ▼
   CODE  (written once per design)                   DATA  (per siteId · JSON now, shared DB later)
   templates/<id>/v<major>/  +  platform/            Site Instance · Site Settings · Content · Assets
                         │                                              │
                         │ template:release (gates)                     │
                         ▼                                              │
   RELEASE SNAPSHOT  (immutable · per major ·                           │ site snapshot, read through
   candidate → canary → promoted)                                       │ one boundary
                         │ pinned by templateRef "id@major"             │
                         └───────────────────────┬──────────────────────┘
                                                 ▼
                          BUILD per site (buildInputId)  →  PACKAGE  →  PUBLIC SITE
                          (MVP: static export; LATER on measured need: server mode + tags)
```

## 2. Detailed view

```
PRESERVATION / REFERENCE LAYER — exists · frozen evidence · never a production dependency
│  Source Package capture → Faithful Clone → runtime / data-contract evidence            [R]
│  crawl + structural observation (families, layout probes)                            [R]
│  source SEO snapshot → forbidden terms for brand isolation                            [R]
│  private reference fixture (gitignored, origin "reference-fixture") → fidelity gate  [N]
▼  used while AUTHORING a template (04 workflow), never while building a customer site

CODE — one directory per template major, shared by every site that pins it
│
│  templates/<id>/v<major>/                        [N]   (v1/ from day one)
│  ├─ template.ts   manifest: id · version · vertical · status
│  │                routes[] metadata · sections{kind, settings, slots, defaults,
│  │                requires, empty, disableable} · requirements · theme.consumes · navigation
│  ├─ provenance.json  internal source record; never imported, never in a build workspace
│  ├─ app/          Next.js App Router file routes: the router (static · list · list/page/[n] · detail)
│  ├─ sections/     one component per declared section + its schemas and defaults
│  ├─ components/   template-internal building blocks
│  ├─ styles/       layout and breakpoints in code; brandable values only via var(--token)
│  ├─ theme.default.json   theme-contract-v1 file                                   [R format]
│  └─ fixtures/     fictional sites for regression (never source content; not in release snapshots)
│
│  platform/        shared by all templates                                          [N, built from R/E]
│  ├─ content model      core + vertical modules (zod; published now, draft with the first editor) [N]
│  ├─ site context       createSiteContext(siteId, templateRef, mode, T) → instance · settings ·
│  │                     ContentReader · AssetResolver; settings read per unit; SiteStore = tooling only [N]
│  ├─ settings           mergeEffectiveSettings · strict validation · selectionToQuery [N; doctrine R]
│  ├─ routes             route prune (every empty dynamic segment; file-level) · drift test [N]
│  ├─ builder            snapshot · hermetic build runner · QA · packaging          [N; doctrine R, code E]
│  ├─ SEO                metadata · canonical · sitemap · robots · JSON-LD helpers [E rules]
│  ├─ theme              contract tokens → CSS variables · contrast check          [R]
│  └─ gates              validator + truth modes (extracted) [E] · brand census (extracted; any hit fails) [E]
│                        · readiness incl. approval markers [E] · input hashing [R] · reader conformance suite [N]
│
│  rule: templates/** import platform/* only (no fs, no DB client, no siteId literals)
│
RELEASE STORE — immutable, content-addressed snapshots                               [N]
│  template:release   snapshot FIRST {template major (no fixtures/provenance) + platform/ incl. builder
│                     + scoped package.json/lockfile + configs + frozen forbidden terms}
│                     → install deps (frozen) → gates 1–5 on the snapshot → results stored by hash → candidate
│  template:canary    preview-mode builds for fixture/canary sites → recorded human review
│  template:promote   requires recorded gates + canary review; an older hash (rollback) first checks settings
│  platform or dependency change → accepted only if template:verify --all passes for every active major
│  frozen majors keep their snapshot; security fixes come from a maintenance worktree (--from <hash>)
│
DATA — partitioned by siteId · JSON files now · one shared multi-tenant Supabase (RLS) later
│
│  Site Instance   [N]   siteId · status · identity (SiteIdentity schema [R], extracted [E]):
│                        the ONLY source of brand name, legal name, canonical origin, locale
│                        domain aliases · templateRef "id@major" · theme token values · SEO defaults
│  Site Settings   [N]   one sparse doc per (siteId, templateRef):
│                        section settings · copy slots · route options · navigation
│  Content         [N]   singletons (business, legal, taxonomy) · collections (projects, reviews, …;
│                        interior vertical: banners)
│                        typed items: id · slug · status · publishedAt · featured · order · categories
│                        · origin (customer | operator | imported-with-consent; never generated)
│  Assets          [R/E] registry + content-addressed bytes /media/<sha256>.<ext>
│
│  write path: operator CLI now → validate with the SAME schemas → persist (atomic)
│              NEXT/LATER writers also emit ContentChange                            [N]
▼
BUILD & DELIVERY
│
│  MVP    operator → site:build <siteId>   (NEXT: ContentChange enqueues it · one build per site at a time)
│           buildInputId = hash(release, site snapshot, mode, toolchain)
│             skip only when equal to the last successful, deployed build          [N; hashing R]
│           hermetic workspace outside the repo: promoted (or held) release snapshot with its own
│             installed deps + site snapshot (settings of the templateRef built) · allowlisted env [N]
│           → route prune (manifest routes × effective settings × content)           [N]
│           → next build, static export                                               [R]
│           → isolated production QA · census (any hit fails) · readiness gate        [E]
│           → package + build record {buildInputId, templateRef, version, QA, deployed} [E]
│         new promoted release → sites:rebuild --release <hash>
│           (per-site QA · a failing site keeps its last good package and gets a last-good hold)
│
│  LATER  ContentChange → authenticated revalidation route → revalidateTag(tag, {expire: 0})
│           tags s:{site}:singleton|list|item|section|route|availability|config · eventually consistent
│           route shells under app/[site] · one server app per template major
│           only on the measured criteria in 10
▼
PUBLIC CUSTOMER SITE
   HTML no-cache · hashed assets and /media immutable                               [R]
   no source runtime · no source API · no request-time database (MVP)
```

## 3. What happens inside one page render

```
app/portfolio/page/[n]/page.tsx                                   (template code)
  ctx      = createSiteContext({ siteId, templateRef, mode, at })  siteId: SITE_ID at build (MVP) · host (LATER)
  route    = ctx.settings.route("projects.index")                 template defaults ⊕ site settings, validated
  q        = { type: "projects", sort: ["publishedAt:desc"],
               limit: route.pageSize, offset: (n - 1) · route.pageSize }   closed descriptor; reader appends id
  result   = await ctx.reader.list(q)                             JSON snapshot (MVP) · Supabase (server mode)
  render   <ProjectGrid items={result.items}/> <Pagination total={result.total}/>
  metadata SEO helpers(identity, route override, page n)          canonical only with a domain
  static params: 2..ceil(total / pageSize)                        directory pruned when total ≤ pageSize (05)
                                                                  a new item → rebuild (MVP) / tag (LATER)
```

## 4. Where each concern lives

| Concern | Lives in | Defined by | Changed by | Detail |
|---|---|---|---|---|
| **Standard content** | Site content storage (values); `platform/` core model (schemas) | Platform (zod) | Customer/operator writes → validation. Items are never generated | `03`, `09` |
| **Industry content** | Same storage, in the item body; `platform/` vertical module (e.g. `interior` adds `pricePerPyeong` to `projects` and a `banners` type) | Vertical module | Same as standard content | `03` |
| **Collections** | Storage: typed items per site. Views: closed queries built from settings in section/route code. Offset pagination by path | Content model + template sections | Content writes (items), site settings (limit/selection/pageSize) | `06` |
| **Template code** | `templates/<id>/v<major>/`: routes, sections, components, styles, manifest | Template author | Template releases (semver; major = new directory; customer builds use the promoted release snapshot) | `04`, `05`, `11` |
| **Site overrides** | Site Settings document per `(siteId, templateRef)`: section settings, copy slots, route options, navigation | Template manifest schemas (closed keys) | Operator now, customer via CMS later | `07`, `08` |
| **Theme** | Contract: platform (theme-contract-v1). Consumed tokens + default theme: template. Token values: Site Instance | Contract + template `theme.consumes` | Site theme edits (contrast-checked) | `04`, `08`, `13` |
| **SEO** | Rules/helpers: platform. Per-route title rules: template code. Site defaults (`titleTemplate` with `{brandName}`): Site Instance. Route overrides: Site Settings. Item SEO: content items. Source SEO snapshot: preservation (forbidden terms only) | Reused production SEO rules | The owner of each level | `05`, `13` |
| **Assets** | Customer media: site asset registry + content-addressed bytes (local now, object storage later). Template-intrinsic neutral assets: template directory. Source assets: preservation layer only | Asset registry schema; reused safe-fetch/addressing | Uploads/imports (NEXT) | `09` |
| **Storage** | Behind `ContentReader` / `SiteStore` / `AssetResolver`. JSON files = MVP system of record **and** build snapshot format; later one shared Supabase project with RLS | Platform interfaces + reader conformance suite (from MVP) | A backend swap without template changes | `09` |
| **Cache** | MVP: the static build output + HTTP cache headers; invalidation = site rebuild (operator now, `ContentChange` from NEXT), skipped when `buildInputId` equals the last deployed success. LATER: framework data cache tagged per unit by the reader; an authenticated route calls `revalidateTag(tag, {expire: 0})`; eventually consistent | Reader tag vocabulary | Rebuilds (MVP); writes (LATER) | `10` |
| **Template version** | Exact semver: manifest. Major: directory name. Pin: Site Instance `templateRef`. Promoted release: release store pointer, with gate and canary records by hash. Per build: `buildInputId` in the build record. Per-site exception: automatic last-good hold. Majors listed in the code catalog | Versioning rules (any default change is MAJOR) | Release flow (snapshot → gates → canary → promote; rollback checks settings); explicit per-site upgrades for majors | `11` |
| Shared platform + dependencies | `platform/` (incl. builder) + scoped lockfile + configs, copied into every release snapshot with its own installed dependencies | Platform author | Accepted only when `template:verify --all` passes for every active major → per-major candidates | `11` |
| Route availability | Manifest routes × effective settings × content → prune step in the build workspace (every empty dynamic segment; file-level removal). Navigation, sitemap and links use the same result | Platform | Settings and content changes | `05` |
| Site identity | Site Instance `identity` (reused SiteIdentity schema, extracted): the only source of brand name, legal name, canonical origin, locale | Reused schema | Operator | `08` |
| Requirements / readiness | Declared in the template manifest × evaluated against content at build; pending-approval markers on items, singleton fields and copy slots | Template + reused gate semantics | Content completion, approval of generated drafts | `03`, `04`, `08` |
| Edit history | Reused append-only revision chain beside the site data (NEXT) → revisions table later | Reused chain doctrine | Every write | `09`, `14` |
| Catalog | `templates/index.ts` + generated `catalog.json` (incl. release pointers); site index derived from Site Instances | Code + release store | Template releases | `11` |

## 5. Invariants

1. **No per-customer code.** Template code exists once per major. Build workspaces are disposable, hermetic
   copies of the release snapshot.
2. **One read boundary.** Templates read site data only through `createSiteContext`. No storage client,
   file path or `siteId` literal appears in template code.
3. **No placement in content.** Content is template-independent: no placement fields, no template ids.
4. **Only declared variation.** Every per-site variation is a key the template declared, validated
   strictly on every write and every build.
5. **No invented content.** Missing or empty content leads to a declared empty behavior or needs-input.
   Generators may draft only copy slots and descriptive text. Every stored draft carries a
   pending-approval marker, and a marker blocks indexable builds. Items, reviews, facts, contact and legal data are never generated. Indexable production requires
   readiness; preview is always `noindex`.
6. **No source dependency.** Production output never depends on source runtime, APIs, hosts, assets, copy
   or brand. The census and host checks enforce it, and any hit fails the build. Source-like values exist only in the private reference
   fixture, which site data and packaging refuse.
7. **Released, hermetic builds.** Live packages come only from promoted snapshots with recorded gate
   results and canary review. Builds run outside the repository with snapshot-installed dependencies and
   an allowlisted environment. Every build is identified by one `buildInputId` = release snapshot hash +
   site snapshot hash + mode + toolchain hash.
8. **Tenancy at the boundary.** `siteId` partitions everything. Tenancy is enforced at the reader/store
   boundary, never with a database per customer.
9. **Honest SEO.** Canonical URLs and absolute sitemap URLs exist only with a production domain.
   Structured data only from real content.
10. **Legacy stays out.** The legacy DOM-replica pipeline stays frozen, is not deleted, and is not a
    dependency of the new path.
11. **Stable defaults.** Defaults never change within a major. Any default change is a MAJOR.
12. **One identity source.** Brand name, legal name, canonical origin and locale come only from the Site
    Instance `identity`.
13. **Absent routes are absent at build time.** Every dynamic segment without parameters, and every route
    that must not exist for a site, is pruned from the build workspace. Navigation, sitemap and links use
    the same availability result.
14. **A regression never blocks a site's publishing.** A site that fails on a new release keeps its last
    good package and builds content on its held release until a release passes for it.

## 6. How it evolves without redesign

| Stage | Storage | Delivery / cache | Editing | Templates | What does NOT change |
|---|---|---|---|---|---|
| MVP (`14`) | JSON files per site | Static export per site; release snapshots; hermetic rebuild on change, skipped only when `buildInputId` equals the last successful, deployed build | Operator CLI | `interior-01@1` | — |
| NEXT | JSON files + history + asset intake | Static per site; batch rebuilds; hosting target | Operator CLI + onboarding from brief; writers + `ContentChange` + draft schemas | Second template, switch dry-run | Template code, reader interfaces, schemas |
| LATER | Shared Supabase + RLS; JSON export for builds | Static, or server mode with tags when measured | CMS (validate → persist → `ContentChange`) | More templates, majors as needed | Section components, reader interfaces, schemas, settings model. If server mode is adopted, route shells move under `app/[site]`: a bounded route-shell change, spiked first (`05`, `15` R6) |
