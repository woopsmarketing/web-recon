# 15 — Tradeoffs, Overengineering Check, Risks, Self-Critique (Parts P + S · 트레이드오프 / 리스크)

Contents:

1. Part S — decisions with more than one credible option
2. Part P — what not to build now
3. Risks
4. Independent self-critique, with the revisions it caused
5. Unresolved questions for the owner

Trivial decisions are not given alternatives.

---

## 1. Tradeoffs (Part S)

### S1 — What a Template is

- **OPTION A:** an authored Next.js code module per design, with a typed manifest, verified against the
  Faithful Clone (`04`).
- **OPTION B:** keep compiling templates from captured DOM, extending Slot V2 / Slotized V1 with
  collections and settings.
- **OPTION C:** a **generated scaffold**. Tooling turns the preserved source (clone DOM, computed styles,
  observed routes) into a first-draft Next.js module in A's shape: sections, route files, CSS. A person then
  refines it.
  - C1: one-shot. The generated draft becomes human-owned code, and generation never runs again.
  - C2: repeated regeneration with a three-way merge against human edits when the source is re-captured
    (the PRODUCT_VISION §15 idea applied to code).
- **TRADEOFFS:**
  - A costs human authoring time per template (the largest risk, R1; measured from MVP, `14`), and
    fidelity must be earned by hand. In return the code is maintainable, data-driven, supports collections
    and pagination natively, and one directory serves N sites.
  - B needs almost no authoring per source and inherits a pixel baseline. But it keeps:
    - a closed crawl route table and no data seam
    - per-site generated CSS (11 MB for one site)
    - content keyed to DOM paths
    - measured intermediate-width failures
    - no human-owned code (`01` §9–14, §17; PRODUCT_VISION §15)
  - Adding collections, pagination and settings to B means rebuilding A's capabilities inside a replica
    format.
  - C1 could cut A's authoring hours, and its output is A-shaped, so nothing else in this architecture
    changes. But building the generator is a project of its own, and the draft quality is unknown. The
    legacy pipeline shows that computed-style CSS is huge and fails at intermediate widths, so the refining
    step may cost most of what it saves.
  - C2 adds regeneration on top of C1. Three-way merges over generated markup and CSS are noisy, and they
    fight the human ownership that A depends on.
- **RECOMMENDED:** A now. Keep B frozen as evidence and for existing pilots. **C1 is the named fallback:**
  evaluate it when the Step 0 authoring-hours threshold is exceeded (`14`). Reject C2 unless C1 exists and
  source re-captures prove frequent.

### S2 — Template Mapper layer or not

- **OPTION A:** a declarative mapping layer from content to per-template view models.
- **OPTION B:** no layer. Settings → query helper (`selectionToQuery`) + item → props in component code + a
  transfer function for switches (`07`).
- **TRADEOFFS:**
  - A centralizes mappings and could serve non-web render targets. It duplicates component props, needs its
    own validation and debugging, and drifts toward configuration-as-code.
  - B keeps shaping next to the markup that uses it. Cross-template consistency then relies on the shared
    content model and standard section kinds.
- **RECOMMENDED:** B. Reconsider only for multiple render targets or no-code content binding (`07`).

### S3 — Content schema shape

- **OPTION A:** a small core + vertical extension modules (zod), singletons and collections (`03`).
- **OPTION B:** a generic schema — one universal type set, or key/value "fields" per item.
- **TRADEOFFS:**
  - A gives typed templates, a meaningful CMS form per type and cheap validation. It costs a module per
    vertical and discipline about core placement.
  - B needs no per-vertical code. But templates lose type safety, validation becomes stringly-typed, and
    either the universal schema bloats or meaning leaks into templates.
- **RECOMMENDED:** A, with the placement rule (core only when ≥ 2 verticals share meaning).

### S4 — Data access interface

- **OPTION A:** one generic site-scoped `ContentReader` + closed query descriptor (`09`).
- **OPTION B:** domain repositories (`ProjectRepository.listFeatured`, `PostRepository.getBySlug`, …).
- **TRADEOFFS:**
  - A has one implementation per backend for every type and vertical, and one place for tags and tenancy.
    Its risk is a generic API growing into a query language; the closed descriptor contains that.
  - B has readable call sites, but a new type means N methods × M backends × conformance tests, and each
    template invents new method names.
- **RECOMMENDED:** A. Templates may add one-line typed sugar locally.

### S5 — Routing

- **OPTION A:** Next.js file routes + manifest route metadata + a drift test (`05`).
- **OPTION B:** a route DSL or table + one catch-all dispatcher, as in the legacy runtime.
- **TRADEOFFS:**
  - A uses framework features as intended (static params, metadata, not-found, layouts). It needs a drift
    test to keep the metadata honest, and the `app/[site]` move later if server mode arrives.
  - B keeps a single source of truth for tools, but reimplements Next.js routing, loses per-route code
    splitting and conventions, and repeats the legacy closed-table problem.
- **RECOMMENDED:** A.

### S6 — Pagination

- **OPTION A:** offset over a total deterministic order, path-addressed pages (`06`).
- **OPTION B:** cursor / keyset.
- **TRADEOFFS:**
  - A gives numbered, crawlable, static-exportable pages. Items shift across pages when content is added,
    which is acceptable. Pages are consistent in static mode, where one build regenerates them together,
    and eventually consistent in server mode. Deep offsets are slower (not relevant at hundreds to
    thousands of items).
  - B is stable for infinite feeds but has no "page 7", is awkward for static export and weak for SEO.
- **RECOMMENDED:** A. Revisit for infinite scroll or collections beyond ~10k items.

### S7 — Template version pinning

- **OPTION A:** pin the major (`id@major`); semver inside the manifest; minor/patch delivered through
  promoted release snapshots (gates → candidate → canary → promote) at the next build; majors as explicit
  upgrades (`11`).
- **OPTION B:** pin an exact version per site, as today's exact-run pin.
- **OPTION C:** a single `version` field with no compatibility rule.
- **TRADEOFFS:**
  - A delivers fixes to 30 sites with one change. Its risk is auto-applied regressions, mitigated by the
    gate, canaries before promotion, per-site QA, keep-last-good and the automatic last-good hold.
  - B has zero surprise, but every fix needs N re-pins, and old versions accumulate.
  - C is simplest, but cannot say what is safe to apply.
- **RECOMMENDED:** A.

### S8 — Future database layout

- **OPTION A:** `content_items` with promoted, queryable columns + a `data jsonb` body, validated by the
  shared zod schemas (`09`).
- **OPTION B:** normalized tables per type (`projects`, `reviews`, …) with typed columns.
- **TRADEOFFS:**
  - A means no migration for optional vertical fields, one generic backend implementation, and a JSON
    snapshot mapping 1:1. Its costs: DB-level constraints on body fields are weaker (the app schemas are the
    contract), and ad-hoc analytics over bodies are clumsier.
  - B gives the strongest DB constraints and simple SQL per type. But every field or vertical change is a
    migration, and every type needs its own backend code, which runs against the "cheap migration" goal.
- **RECOMMENDED:** A (hybrid). Promote a body field to a column only when the closed query descriptor
  filters or sorts on it.

### S9 — Delivery and cache for MVP

- **OPTION A:** static export per site. A content change rebuilds the site (`10`).
- **OPTION B:** server mode from day one: framework data cache + tags + an authenticated revalidation
  route calling `revalidateTag(tag, {expire: 0})`, with one app per template major serving many sites.
- **TRADEOFFS:**
  - A needs no runtime infrastructure and no request-time DB, and reuses the existing static package, QA and
    cache headers. But a change rebuilds the whole site: unrelated pages are regenerated with identical
    output rather than left untouched, which misses the letter of the prompt's cache example until server
    mode. Publish latency equals build time.
  - B has per-tag invalidation and fast publishing, but pages regenerate independently (eventually
    consistent). It needs a hosting decision now, multi-tenant host resolution, `app/[site]` routes, a
    different `dynamicParams` value per route, a shared cache handler across instances, and no reuse of the
    static QA path. Blast radius per deploy covers every site on that template major.
- **RECOMMENDED:** A for MVP and NEXT, because there is no customer-driven mutation before a CMS. Keep the
  boundary that turns B into a bounded route-shell change instead of a rewrite: reads only through
  `createSiteContext`, per-unit reads, reader-derived tags. `ContentChange` arrives with the first writer
  (NEXT). The move is still not mechanical (R6). Adopt B only on the measured criteria in `10`.

### S10 — Where section copy lives

- **OPTION A:** copy slots inside the site settings document, per `templateRef` (`08`).
- **OPTION B:** copy as content items (a `pageCopy` collection keyed by section).
- **TRADEOFFS:**
  - A keeps template-shaped text out of the template-independent content model. Switches re-validate it by
    slot name, and settings + copy form one document per template. Its cost: copy history lives with
    settings history.
  - B makes copy editable like content, but pollutes the content model with template placement (the
    `isBottomArea1Display` anti-pattern in another form).
- **RECOMMENDED:** A. Durable, template-independent text (tagline, story, facts) stays in `business`.

### S11 — How major versions coexist

- **OPTION A:** a directory per major (`templates/<id>/v1`, `v2`) in the main branch (`11`).
- **OPTION B:** git branches or tags per major, checked out per build.
- **TRADEOFFS:**
  - A makes both majors visible, buildable and testable in one checkout, and batch rebuilds are simple. Its
    cost is duplicated code while both live; critical fixes may need to be applied twice.
  - B avoids the duplication in the tree, but builds need checkouts per site, CI must test several refs,
    and fixes need cherry-picks.
- **RECOMMENDED:** A. `v1/` exists from day one; create `v2/` only on the first real breaking change, and
  delete a major at zero pins.

---

## 2. Overengineering check (Part P)

```
DRAG-AND-DROP PAGE BUILDER
WHY NOT NOW = Customers need content edits, not layout design. Each layout degree of freedom multiplies
  QA states and breaks the fidelity gate. The prompt forbids an arbitrary page builder.
SIMPLE VERSION THAT IS ENOUGH = Declared sections with `enabled`, `limit`, `selection`, ≤ 3 variants and
  copy slots (08).

ARBITRARY COMPONENT COMPOSITION
WHY NOT NOW = No evidence of a site needing it. The combinations are untestable, and it needs schemas per
  placement.
SIMPLE VERSION THAT IS ENOUGH = A fixed section list per template. A new composition is a template minor
  (useful to all) or a new template.

ELEMENTOR-LIKE SYSTEM
WHY NOT NOW = Page builder + composition + per-element styling. It would recreate the DOM-replica problem
  as a UI: opaque per-site trees.
SIMPLE VERSION THAT IS ENOUGH = Theme tokens (theme-contract-v1) + declared variants.

PLUGIN MARKETPLACE
WHY NOT NOW = No third-party developers. Security and compatibility costs with no user.
SIMPLE VERSION THAT IS ENOUGH = Shared code in `platform/` (SEO, media, links); integrations as site
  settings later.

WORKFLOW ENGINE
WHY NOT NOW = A build is a pure function of (release snapshot, site snapshot, mode) = buildInputId (11).
  The legacy 7-stage DAG existed only for the DOM pipeline (02 D).
SIMPLE VERSION THAT IS ENOUGH = `template:release` / `template:promote`, `site:build` and `sites:rebuild`
  commands; a simple job queue once builds must be queued.

GIANT UNIVERSAL SCHEMA
WHY NOT NOW = Either too vague (key/value) or too big to validate. Vertical meaning gets lost.
SIMPLE VERSION THAT IS ENOUGH = Core + vertical zod modules with the placement rule (03).

COMPLEX PERMISSIONS
WHY NOT NOW = MVP is operator-only CLI. The first CMS needs tenant isolation and 2–3 roles, not policy
  engines.
SIMPLE VERSION THAT IS ENOUGH = Operator only now. Later: RLS by site + `role ∈ {owner, editor}`.

DISTRIBUTED CACHE PLATFORM
WHY NOT NOW = Static builds need none; server mode uses the framework data cache with the host's shared
  cache handler (10).
SIMPLE VERSION THAT IS ENOUGH = Static export + reused HTTP cache headers; later framework tags derived by
  the reader (10).

MICROSERVICES
WHY NOT NOW = One developer, one build command, one future CMS API. Network boundaries add failure modes
  and deploys.
SIMPLE VERSION THAT IS ENOUGH = One repository with `platform/`, `templates/`, CLI; one CMS app later.

EVENT BUS
WHY NOT NOW = One producer (the writer) and one consumer (build or revalidate).
SIMPLE VERSION THAT IS ENOUGH = A `ContentChange` value passed to a function (NEXT, with the first
  writer); a DB job table only if builds need queuing.

PER-CUSTOMER REPOSITORY
WHY NOT NOW = Never: forks turn one bug fix into N manual edits (12 Scenario 1) and defeat the product.
SIMPLE VERSION THAT IS ENOUGH = Site data directories (rows later) + disposable build workspaces.

PER-CUSTOMER SUPABASE PROJECT
WHY NOT NOW = Never by default: operations and migrations × 100 customers. The prompt forbids it.
SIMPLE VERSION THAT IS ENOUGH = One shared project, `site_id` on every row, RLS (09).

GENERIC API REPLAY PLATFORM
WHY NOT NOW = Production must not depend on source APIs, replay is preservation-layer evidence, and the
  prompt keeps it deferred.
SIMPLE VERSION THAT IS ENOUGH = Customer content in our model; source API bodies only as schema evidence
  (13 item 4).

CUSTOM ROUTING FRAMEWORK DUPLICATING NEXT.JS
WHY NOT NOW = File routes, generateStaticParams, metadata and not-found already exist. The legacy
  catch-all existed only for crawled tables.
SIMPLE VERSION THAT IS ENOUGH = File routes + manifest route metadata + drift test (05).
```

Also deliberately not built now: a package registry (`11`), a catalog service or UI (`11`), a Route
Model object (`05`), a Mapper layer (`07`) and repeatable or reorderable sections (`08`).

The release store (`11`) is not a package registry. It is a directory of immutable snapshots with one
promoted pointer per major. Nothing is published, and nothing resolves versions or dependencies.

---

## 3. Risks

| # | Risk | Likelihood / impact | Mitigation | Residual |
|---|---|---|---|---|
| R1 | **Authoring cost and fidelity of authored templates are unproven.** Hand-authored code may take long per template and may fall short of the clone at intermediate widths | High / High | Step 0 thresholds (authoring-hours budget, build + QA minutes); both metrics recorded per slice and compared at MVP exit (`14` exit criterion 9); exceeding the hours threshold triggers the S1 Option C1 evaluation; Slice 5 fidelity report; reuse clone evidence and authored source breakpoints (not the 801 px pipeline policy) | Business viability of "10+ templates per vertical" is unknown until measured |
| R2 | **Legal / IP.** Templates derived from a third-party site's design; source brand, assets, fonts or copy leaking into production | Medium / High | No source assets, copy or brand in templates; provenance only in `provenance.json`, never imported or snapshotted; brand census as a failing gate over HTML, RSC flight and JS chunks; license gate for fonts and media | How close a derived design may be is an owner/legal policy decision (Q2) |
| R3 | **Auto-applied minor/patch regressions** reach every pinned site | Medium / Medium | Classification rules (any default change is MAJOR), fixture regression gate, candidate → canary → promote, per-site QA, keep-last-good, the automatic last-good hold, retained packages and release hashes for rollback with the settings check (`11`, `12` S1) | Fixture coverage bounds what the gate sees |
| R4 | **Content model shaped by one source** (Apartmentary) churns when more templates arrive | Medium / Medium | Evidence-only optional fields; additive changes only, with readers stripping unknown keys so older release snapshots keep building (`11`); renames wait for a second template; a breaking change is an explicit content-model migration | Some rework at the second template |
| R5 | **Apartmentary evidence gaps.** 48 of 56 verified URLs never observed beyond crawl; 0 hrefs; no API bodies; two detail families unexplained | High / Medium | Slice 0 captures; v1 limited to home + list + detail; claim policy (`13`) | A v1 layout may need revision after bodies arrive |
| R6 | **Static → server-mode transition** is more than mechanical: literal `dynamicParams` per route, `app/[site]` move, host resolution, cache semantics per host. In Next.js 16.3.0 `updateTag` is Server-Action-only, publish-to-live needs `revalidateTag(tag, {expire: 0})` from a route handler, and multiple instances need a shared cache handler (`10`) | Medium / Medium | Thin route shells; per-unit reads only through `createSiteContext`; spike before CMS; re-verify the revalidation API on the Next.js version installed then | Hosting choice may force extra route-shell work; pages are eventually consistent |
| R7 | **Settings creep** turns templates into a page builder | Medium / High | Closed vocabularies; "serves more than one site" rule; ≤ ~3 variants; no reorder/add/duplicate; review settings count per template | Needs discipline under customer pressure |
| R8 | **Two systems named "template".** Legacy `src/recon-template` (Slot V2) vs new Recon Templates confuse people and tools | High / Low–Medium | Naming decision (Q6); legacy frozen and labeled; new code in separate top-level directories | Legacy suites keep running beside the new path |
| R9 | **Evidence built on an uncommitted tree.** Many `src/` files that `01` describes are uncommitted or untracked | Medium / Medium | Owner checkpoint before implementation (CLAUDE.md: git is not a gate, but evidence must be reproducible). Builds are identified by content hashes, not git SHAs, so uncommitted work cannot hide inside a build identity (`11`) | — |
| R10 | **Build determinism unknown.** "Unchanged output" and delta deploys are unverified | Medium / Low | Determinism check in Slice 5 | Full re-upload per build until verified |
| R11 | **Fonts.** Source fonts need license review; substitutes change layout and fidelity | Medium / Medium | License check at Slice 3; measured fallback (reused doctrine) | Fidelity residuals attributable to fonts |
| R12 | **Fixture sites mistaken for customer content**, or shipped. Includes the private reference fixture and `provenance.json`, which hold source-like values | Low / High | Fictional names, license-clean generated media, `noindex`, never deployable by the tooling; synthetic fixtures live only under `templates/**/fixtures/` and outside release snapshots; the reference fixture is gitignored and marked `origin: "reference-fixture"`, which is refused under `data/sites/**` and in packaging; `provenance.json` is never imported and never enters a build workspace; any census hit fails the build (`03`, `04`) | — |
| R13 | **Solo-developer load** grows with templates × majors × sites | Medium / High | Shared platform; one carousel/media/SEO implementation; majors deleted at zero pins; add templates only after MVP proves throughput | Throughput is bounded by R1 |
| R14 | **Platform blast radius.** A `platform/` change or dependency upgrade (Next.js, React, zod) can change every site of every template at once | Medium / High | Release snapshots contain `platform/`, the builder, a scoped lockfile and configs, with dependencies installed per snapshot; a platform change is accepted only when `template:verify --all` passes for every active major; rollout per major via candidate → canary → promote; frozen majors keep their snapshots and take security fixes from maintenance worktrees (`11`, `12` S1 variant) | Snapshots and per-snapshot installs cost disk and install time; fixture coverage bounds the gate; fixes may be applied twice |
| R15 | **Route prune drift.** The prune step depends on a directory-mapping convention and on Next.js static-export behavior that was verified only in 16.3.0 (empty params abort the build; `notFound()` pages are still written, `05`) | Medium / Medium | Fixed mapping verified by the drift test; only declared route directories may be removed; MVP tests for 0 items and `total ≤ pageSize` (`14` Slice 2); a Next.js upgrade is a platform change and re-runs those tests | Behavior may change in a future Next.js version |

---

## 4. Independent self-critique

Checked against the prompt's list. Where a check failed, the proposal was revised before these files were
finalized.

Two further passes followed the first draft:

- **Fact check.** 44 load-bearing claims were checked against code and run files. 42 held; 2 were wrong
  and are corrected (`01` findings 5.1 and 23.1).
- **Independent architecture review.** A fresh-context reviewer was asked for blockers and major risks,
  without a desired verdict. It reported 1 BLOCKER, 9 MAJOR and 7 MINOR findings. Each was verified against
  code or documents before being fixed. They are the "independent review" rows at the end of the table.
- **Second independent review** of the revised documents, again in a fresh context. It found no blocker,
  but 5 earlier findings only partly fixed, 8 new MAJOR and 7 new MINOR findings. The code-level claims
  were verified before fixing: transitive legacy imports, the census that only reports (`qa.ts:681`), the
  build inheriting `process.env` and resolving dependencies upward (`bake.ts:135-145`), and the Next.js
  tag-expiry code path. They are the "second review" rows.

| Criterion | Finding | Verdict | Revision made |
|---|---|---|---|
| Unnecessary abstraction | An early draft had a Mapper layer, a Route Model object and a catalog service | Revised | Mapper → one helper + component code (`07`); Route Model → manifest metadata on file routes (`05`); catalog → code registry (`11`) |
| Premature generalization | Tag vocabulary, section-kind lists, `posts`/`faqs`/`services` types and a clinic vertical appeared before any consumer | Revised | Tags defined but consumed only in server mode (`10`); kinds and slot names limited to v1 (`07`); types defined when a template renders them (`03`); clinic is illustration only |
| Duplicate concepts | Site Instance could be a "release-project-v2" in disguise; copy slots could duplicate content; three requirement levels could overlap | Pass, with justification | Site Instance drops everything pipeline- and host-shaped, and keeps the release project's doctrines (`08`). Slots vs content vs settings table (`07`). The three requirement levels have three owners (`03`) |
| Avoiding NewThingV2 | SiteIdentity, theme contract, truth modes, census, safe-fetch, package/QA are reused or extracted, not rewritten | Pass, with one exception | The build copy/runner and atomic write are re-implemented from their doctrines: their code sits in legacy-coupled files and the build must become hermetic (`02`, `14`) |
| Hidden template-specific coupling | Source per-item placement flags (`isBottomArea1Display`) tempt content-model coupling | Revised | Placement becomes settings (`selection: category`) + a lint ban on placement-named fields (`03`) |
| Customer-specific code forks | No per-site code directory; disposable workspaces; siteId lint | Pass | — |
| DB/storage coupling | Templates reach data only via `createSiteContext`; dependency lint; conformance suite | Pass, conditional | Lint + conformance suite moved **into MVP**, where they are cheap (`14` Slices 1–2, `12` S6) |
| Collections | Queries, offset pagination with a tie-breaker, detail pages, empty behavior | Pass | — |
| Multi-page sites | File routes + metadata; list/detail/pagination in MVP | Pass | The Apartmentary v1 scope is limited by evidence, not by architecture (`13`) |
| JSON → Supabase | Same schemas, interfaces, snapshot format; illustrative tables | Pass, conditional | Same conditions as storage coupling |
| Future CMS | Draft/published schemas, zod → forms, writer + `ContentChange`, preview mode | Pass | Draft schemas and `ContentChange` scheduled with the first writer (`14` NEXT #4) |
| Cache complexity | No cache infrastructure in MVP. **But** MVP rebuilds unrelated pages, against the prompt's example | Partial, by design | Stated as an honest trade-off with adoption criteria and tags ready (`10`, S9) |
| Template update blast radius | Auto minor/patch to all pinned sites | Revised | Canary step, keep-last-good and retained packages added; server-mode note that one deploy hits all sites (`11`, `12` S1). Release snapshots and platform staging added after independent review (R14) |
| Excessive configuration | `interior-01` v1 exposes 18 settings keys (sections, `projects.index`, navigation) + 12 copy slots (`13` allowed overrides) | Pass, watch | No reorder/duplicate; "serves more than one site" rule (`08`) |
| Reinventing Next.js | File routes, metadata API, `sitemap.ts`/`robots.ts`, static export | Pass | Legacy head splice and catch-all removed from the new path (`02`) |
| Reinventing a page builder | Fixed sections, closed variants | Pass | Two fixed carousel instances instead of repeatable sections (`07`) |
| Solo-developer maintainability | New MVP components: content model, template module + manifest, Site Instance, Site Settings, reader boundary + conformance suite, route prune step, release snapshots + build record with `buildInputId` (7). `ContentChange` waits for NEXT | Pass, with R1/R13 | Implementation order made slice-first (`14`) |
| Evidence integrity | An investigation note under-reported Apartmentary routes (34 URLs / 6 families) | Revised | Main agent verified the canonical crawl run (56 URLs / 16 families) and corrected `01`, `03`, `05`, `13` |
| Fake-content risk | Empty sections, reviews, hero copy, fixtures | Pass after revision (see review rows) | Declared empty behavior; needs-input; provenance on reviews; fictional fixtures (`03`, `12` S4, R12) |
| Scenario failures | All 9 scenarios traced (`12`). Verdicts are design-level traces, not test results | Pass; S5 needs NEXT work | Switch flow depends on the second template; settings kept per `templateRef` so it stays reversible |
| Independent review — BLOCKER: static export with empty collections | Next.js 16.3.0 aborts `output: "export"` when `generateStaticParams` returns `[]`, and writes `notFound()` pages as HTML, so "not generated" was unimplementable | Revised | Route prune step in the build workspace, mapping in the drift test, 0-item and `total ≤ pageSize` tests (`05`, `14` Slice 2, R15) |
| Independent review — MAJOR: fake-content path | A `generated-draft` item origin let AI draft items and reviews | Revised | No generated item origin; schema-level generation limits (copy slots + descriptive fields only); approval before indexable builds; `reference-fixture` origin (`03`, `07`, `14` NEXT #2) |
| Independent review — MAJOR: shared platform not versioned | A `platform/` change reached every site with no release unit | Revised | Release snapshots include `platform/` + lockfile; per-major staging; `template:verify --all` (`11`, R14) |
| Independent review — MAJOR: release order and build identity unenforced | Builds could read the working tree; identity used a git SHA that misses uncommitted work | Revised | Builds only from promoted snapshots; one `buildInputId` definition (`11`) |
| Independent review — MAJOR: S1 false binary, authoring cost unmeasured | Only "author by hand" vs "compile DOM" were compared | Revised | Option C1/C2 added; Step 0 thresholds; metrics in MVP exit criteria (S1, `14`, R1) |
| Independent review — MAJOR: legacy imports in "reuse as-is" modules | Truth modes, validator and SiteIdentity files import legacy pipeline types | Revised | Reclassified EXTEND (extract), with code anchors; extraction in Slice 1 (`01`, `02`, `14`) |
| Independent review — MAJOR: server-mode claims vs Next.js 16.3.0 | One-argument `revalidateTag`, no Server Action constraint, implied cross-page atomicity | Revised | Revalidation route with `{expire: 0}`, deployment lookup, shared cache handler, eventual consistency, all with file:line evidence (`10`, R6) |
| Independent review — MAJOR: identity duplicated | Brand and legal name existed in both `business` and the Site Instance | Revised | `identity` is the only source; `domains` holds aliases only; `titleTemplate` uses `{brandName}` (`03`, `08`, `13`) |
| Independent review — MAJOR: default changes within a major | A minor could change defaults for sites that never opted in | Revised | Any default change is MAJOR (`08`, `11`, `12` S2, S9) |
| Independent review — MAJOR: conformance suite unscheduled | `12` S6 depended on a suite that `14` never built | Revised | Written in Slice 2 against the JSON reader (`09`, `14`) |
| Independent review — MINOR (7) | Banners/tone placement; inconsistent examples (limit range, sort shape, featured overlap, `v1` directory timing); reserved slugs; taxonomy modeling and tags; unscheduled `ContentChange`/draft schemas; coarse copy tags; A-label citations without file or symbol | Revised | Fixed in place: vertical `banners` with `mediaTone`, `sort` arrays, honest overlap wording, `v1/` from day one, reserved-slug rule, taxonomy singleton, section/route tags, NEXT #4, `01` labels table + code anchors, `13` evidence index |
| Second review — MAJOR: build identity incomplete | Snapshots lacked the package manifest, configs and builder; builds resolved dependencies from the repository with the full environment; fixtures and the root lockfile widened the hash | Revised | Snapshot = template (no fixtures/provenance) + platform incl. builder + scoped manifest/lockfile + configs + frozen terms; per-snapshot installs; workspaces outside the repo; allowlisted env; `toolchainHash` (`11`) |
| Second review — MAJOR: candidate previews unbuildable | The site snapshot held only the pinned settings | Revised | The snapshot takes the settings of the templateRef being built (`09`, `11`, `12` S5) |
| Second review — MAJOR: strict settings break rollback | An older release rejects keys added later | Revised | Writes validate against the promoted release; promoting an older hash checks every pinned site first (`08`, `11`) |
| Second review — MAJOR: a failing site cannot publish | Keep-last-good kept the package but later builds still had to use the promoted release | Revised | Automatic last-good release hold (`11`, `12` S1) |
| Second review — MAJOR: prune rules vs static params | `{fallback}` detail routes and slug-less items still produced empty params; list pruning could delete nested detail routes | Revised | Prune every empty dynamic segment; file-level removal; slug required for detail types; route-level `empty` (`03`, `04`, `05`, `06`) |
| Second review — MAJOR: generated-text approval unenforceable | Markers existed only on items; approval records depended on later history | Revised | Markers on singleton fields and copy slots; readiness gate; typed generator targets; NEXT #2 needs #4 (`03`, `08`, `14`) |
| Second review — MAJOR: census does not gate | `qa.ts:681` reports only; terms from a legacy manifest; JS chunks unscanned; provenance importable | Revised | Census reclassified EXTEND, any hit fails, all emitted files scanned, terms frozen into snapshots, `provenance.json` never imported (`02`, `04`, `14`) |
| Second review — MAJOR: one shared platform for all majors | Staging only ordered the rollout; frozen-major fixes had no source tree | Revised | Platform accepted only when every active major verifies; maintenance worktrees from frozen snapshots (`11`, R14) |
| Second review — MINOR (7) + partials | Release order not tool-enforced; skip semantics; wrong Next.js citation; availability tags; strip-unknown-keys vs restrictive fields; MVP plan/summary mismatches; reader-boundary gaps; remaining legacy couplings (M5) and citations (m7) | Revised | Snapshot-first gates + promote preconditions; skip only vs deployed success + per-site lock + no wall clock; citation to `revalidation-utils.js:121` and `file-system-cache.js:61-72`; `availability:{type}` tag; `minReaderVersion`; AssetResolver in Slice 1, disabled-section fixture; `SiteStore` tooling-only, isolation and null-ordering cases; `01`/`02` coupling rows; `13` A8 section map |

---

## 5. Unresolved questions (owner decisions)

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Accept the authored-template direction (DOM-replica templates superseded for production)? | Everything | Nothing starts |
| Q2 | Legal/IP policy for templates derived from third-party sites: which sources, how close a design may be, attribution | Template status `available` | Fixture-only use |
| Q3 | Customer legal pages (privacy policy, terms): a platform-provided page in every template or template routes? Required whenever a site collects inquiries | First real launch | Operator-provided legal content via the `legal` singleton (NEXT) |
| Q4 | Hosting target for per-site packages, and when to adopt server mode | NEXT #5; LATER server mode | Static packages, manual deploy |
| Q5 | Repo layout: `templates/` + `platform/` in this repo vs a separate product repository; workspace tooling | Slice 1 | Same repo |
| Q6 | Naming: product "Recon Template" vs legacy `src/recon-template`; template id scheme (`interior-01` vs `interior-template-a`) | Slice 1 | New directories, legacy labeled |
| Q7 | Apartmentary v1 scope and capture approval (`13` items 1–6). Wait for JSON default-ON bodies before fixing the detail schema? | Slices 0 and 2 | Capture now; schema marked provisional until bodies arrive |
| Q8 | Rich-text format: markdown subset vs structured JSON | CMS editor (LATER) | Markdown subset |
| Q9 | Edit history in MVP or NEXT? | Slice scope | NEXT |
| Q10 | PRODUCT_VISION §15 three-way diff (Old SiteSpec / New SiteSpec / Current Production) at template level: superseded by git history + fidelity re-check when a source is re-captured? | Vision doc update after acceptance | Treat as template-author workflow, not a site-level mechanism |
| Q11 | Font policy: license source fonts vs substitutes (fidelity cost) | Slice 3/5 | Substitutes with measured fallback |
| Q12 | Fixture policy: fictional fixture sites with generated media in the repository | Slice 1 | Allowed under R12 controls |
