# 14 — Minimal Implementation Order (Part R · 최소 구현 순서)

## Principles

- **Vertical slices.** Every slice ends with one template directory building **≥ 2 sites**, verified at the
  end of the slice (verification sized to the slice, CLAUDE.md §8).
- **Apartmentary first.** Generalize only when a second template supplies evidence.
- **No framework first.** Platform code is written only when the current slice consumes it.
- **Reuse boundary.**
  - New code may import modules marked **REUSE** in `02`: theme contract and contrast math, SEO rules and
    brand-isolation checks, brand-mark, safe-fetch and content addressing, `hashDirectory`, the static
    server.
  - Code marked **EXTEND (extract)** is copied into `platform/` with its tests, because its current files
    import legacy code directly or transitively (`01` supplementary anchors): truth modes, the validator,
    the SiteIdentity schema, the brand census (made a failing gate), package assembly and, in NEXT, the
    revision chain. The legacy files stay untouched.
  - The build copy, build runner and atomic write are re-implemented from their doctrines, because the
    new builds must be hermetic (`11`).
  - New code never imports the legacy DOM-replica pipeline (SUPERSEDE / REMOVE_FROM_NEW_PATH rows).
- **Not yet accepted.** This order is a proposal, and Step 0 is the acceptance decision.

## Step 0 — Decisions before code

Owner decisions:

| Decision | Blocks | Recommendation |
|---|---|---|
| Accept the authored-template direction for production: DOM-replica templates are superseded. Accept it as a **measured bet** with the re-evaluation rule below | Everything | Accept (`15` S1) |
| Set the **re-evaluation thresholds** for that bet | Slice 1 | Owner sets both numbers now. Suggested starting points, not evidence: an authoring-hours budget for `interior-01` v1 (home + list + detail); re-evaluate S1 Option C if actual hours exceed 2× the budget. Site build + QA ≤ 5 minutes per fixture site; above that, re-check the batch-rebuild economics in `10` |
| Repo layout: same repo vs separate product repo; workspace tooling | Slice 1 | Same repo first: top-level `templates/` + `platform/`, independent of the legacy pipeline in `src/` |
| Naming: product term "Recon Template" vs legacy `src/recon-template`; template id scheme | Slice 1 | New code under `templates/` + `platform/`; the legacy directory keeps its name and is documented as legacy |
| Legal/IP policy for templates derived from third-party sites | Template status `available` | Owner decision (`15` Q2) |
| Approve bounded Apartmentary captures (`13` items 1–3, 5, 6) | Slice 0 | Approve |

`docs/architecture/` and `docs/status/` change only after acceptance (CLAUDE.md). This study does not
change them.

## MVP NOW

### Slice 0 — Apartmentary list/detail evidence (in parallel with Slice 1)

- Bounded, read-only capture runs with existing tooling: `13` items 1, 2 and 3, plus 5 and 6 if cheap.
- Output: L1 packages and clones for `/portfolio?page=0|1` and 2 detail pages per family, plus a short
  evidence report under `docs/result/`.
- Independent of the separate JSON default-ON task. Item 4 (bodies) is picked up when that task lands.
- **Verify:** package integrity and clone render checks, as in Phases 1–2.

### Slice 1 — One content section, one template, three sites

Build only what this slice consumes.

**Platform:**

- **Extraction:** truth-mode rules, the validator and the SiteIdentity schema, as pure functions with
  their tests (see Reuse boundary)
- zod **published** schemas for `business`, `projects` and the `taxonomy` singleton. The draft schema
  arrives with the first editor (NEXT #4)
- `origin` on items with the `03` rules: no generated origin; `reference-fixture` rejected under
  `data/sites/**`
- JSON `ContentReader`: `getSingleton`, and `list` with the closed descriptor, deterministic sort and
  visibility rule
- `createSiteContext` binding `siteId`, `templateRef`, `mode` and T, with per-unit settings reads; the
  `SiteStore` stays operator tooling (`09`)
- `AssetResolver` + a minimal asset registry, because project cards already need `cover` media
- `mergeEffectiveSettings` + strict validation, `selectionToQuery`

**Template** `templates/interior-01/v1/`:

- `template.ts` with route `home` and sections `site.header`, `site.footer`, `home.projects-a`
- `app/layout.tsx`, `app/page.tsx`

**Three fictional fixture sites:**

| Site | Content | Settings | Theme |
|---|---|---|---|
| `fixture-large` | 173 projects, 2 categories | defaults | defaults |
| `fixture-small` | 12 projects | `limit: 4`, `selection: category`, copy `title` override | different tokens |
| `fixture-empty` | 0 projects | defaults | defaults |

**Command:** `site:build <siteId>` = hermetic workspace outside the repository (copy doctrine re-implemented;
dependencies installed from the templates/platform lockfile; allowlisted environment) + site snapshot
(`09`) → `next build` static export → extracted package assembly. Release snapshots arrive in Slice 5.
Until then builds come from the working tree and produce preview packages only.

**Verify:**

- All three sites build from the same directory. HTML differs only where data or settings differ.
- `fixture-empty`: the projects section is absent, with no empty wrapper.
- Negative controls:
  - unknown settings key → error
  - settings `templateRef` mismatch → refusal
  - missing manual id → warning
  - an item with `origin: "reference-fixture"` under `data/sites/**` → refusal
- Dependency lint:
  - `templates/**` imports only `platform/*`
  - no `siteId` literal, `node:fs` or `@supabase/*` under `templates/**`
  - no wall-clock reads (`Date.now`, `new Date()`) under `templates/**`

### Slice 2 — Collections across pages

- Routes `projects.index` (+ `/page/[n]`) and `projects.detail`.
  - The detail layout follows Slice 0 evidence.
  - If Slice 0 is late, a provisional layout from L2 evidence is used, marked draft.
- Reader: `listSlugs`, `getBySlug`. Pagination component; related-items query.
- **Route prune step** in the build workspace, driven by manifest routes + effective settings + reader
  results (`05` rules 1–3). The drift test covers the file mapping.
- **Slugs:** published items of types with detail pages require a slug (`03`); slug validation refuses
  static segment names such as `page` and `category` (`05`).
- **Reader conformance suite** (`09`), run against the JSON reader.
- SEO, reusing the existing rules:
  - `generateMetadata` helpers
  - `app/sitemap.ts`, `app/robots.ts` (preview `Disallow: /`; canonical only with a domain)

**Verify — Scenario 3 automated:** publish #174 in `fixture-large` → rebuild → check:

- 15 pages; last page 5 → 6 items
- `/portfolio` first item = #174
- sitemap gains one URL
- homepage subset follows its selection
- equal-`publishedAt` ordering is stable across two builds
- out-of-range page → 404; `/page/1` is never generated

**Verify — prune and conformance:**

- `fixture-empty`: the build succeeds with no `/portfolio` list or detail output. There are no links to
  them and no sitemap entries. This guards the Next.js 16.3.0 empty-params abort (`05`).
- A site with `total ≤ pageSize`: no `/portfolio/page/[n]` output.
- Prune unit tests over a synthetic route tree: a list route declaring `empty: {fallback}` over an empty
  collection keeps its empty-state page while `[slug]` is pruned; a disabled list route leaves its nested
  detail route intact.
- A slug `page` → validation error; a published project without a slug → validation error.
- The conformance suite passes on the JSON reader, including instance/settings/asset isolation and
  missing sort values.

### Slice 3 — Full homepage and honest empties

- Sections: `home.hero` (banners), `home.intro` (copy slots + media), `home.projects-b`, `home.reviews`,
  `home.image-band`, `site.floating-cta`. Footer from `business.registration` / `business.contact` +
  `identity`.
- Content: `banners` (interior vertical) and `reviews` schemas.
- Asset registry extended from Slice 1: reused content-addressed `/media/<sha256>.<ext>`, video and
  responsive variants. Fixture images must be license-clean (self-made or generated), never source media.
- `fixture-small` disables `home.projects-b`, so the fixtures differ by a disabled section.
- Pending-approval markers: `business.generatedFields` and `generatedCopy` in settings (`03`).
- Requirements/readiness report (REQUIRED / RECOMMENDED / OPTIONAL), reusing the gate semantics.
- needs-input markers in preview. The extracted validator and truth-mode rules run on copy slots.

**Verify — Scenario 4 automated:**

- `fixture-small` has `reviews = []` → section absent, no rating JSON-LD, readiness unaffected.
- Intro enabled without `title` → `INPUTS_REQUIRED`: preview builds with a marker; the indexable build is
  refused.
- A slot listed in `generatedCopy`, or a `business.generatedFields` entry, blocks the indexable build;
  approving it clears the marker. A generated, fact-shaped copy value is refused under `verified-only`.

**Verify — refusal and identity:**

- A review without `source`, or with `generatedFields` naming its text, author or rating → schema error.
- Changing `identity.brandName` in one fixture changes every surface that shows it: header wordmark
  fallback, titles, footer, JSON-LD. The census finds no stale name.

### Slice 4 — Production gates

- Reused isolated production QA on all fixture packages, extended with:
  - internal links resolve (pagination, detail, navigation)
  - sitemap = generated routes
  - empty sections are absent
  - no source hosts in the output
- Brand isolation: the census is extracted and made a gate — **any hit fails**. Terms come from a frozen
  list derived from `provenance.json` and the source SEO snapshot (Slice 5 freezes it into release
  snapshots). It scans template code, fixtures and every emitted file: HTML, RSC flight and JS chunks.
- Theme: site tokens → CSS variables, with the reused contrast check.

**Verify:**

- All packages pass.
- Negative controls: a planted source term in a fixture fails the census; a planted term inside a JS chunk
  fails the census; a planted source media host fails the host check; importing `provenance.json` from
  template code fails the lint.

### Slice 5 — Fidelity, release safety and metrics

- **Reference fixture builder** (private, `04`): Source Package static copy + the clone's Phase 3C
  synthetic items → `origin: "reference-fixture"` content in a gitignored, source-scoped location.
- **Fidelity:** the reference fixture renders `interior-01` home (plus list/detail once Slice 0 landed). It
  is compared with the Faithful Clone at standard widths, reusing the reconstruction-QA capture/compare
  modules where they fit. Gate 1 passes when a person accepts the report with its residuals named; the
  accepted report hash is recorded.
- **Release snapshots** (`11`):
  - `template:release` copies the snapshot **first** (template major without `fixtures/` and
    `provenance.json`, `platform/`, the scoped package manifest + lockfile, framework configs, frozen
    forbidden terms). It then installs dependencies from the frozen lockfile, runs gates 1–5 on the
    snapshot and stores the results under its hash.
  - `template:canary` (minimal): preview-mode builds for a named site list + a recorded human review.
  - `template:promote` refuses without recorded gate passes and a canary review. Promoting an older hash
    runs the settings compatibility check first (`08`).
  - `template:release --from <hash>` for frozen-major maintenance, exercised once.
- **Hermetic builds:** workspace outside the repository, snapshot-installed dependencies, allowlisted
  environment, builder run from the snapshot. Only promoted snapshots produce packages for live domains.
- **Build record:** `buildInputId` = release hash + site snapshot hash + mode + toolchain hash, plus
  `templateRef`, version, QA result and deployment state (EXTEND ProductionSpec lineage). A build is skipped
  only against the last successful, deployed build; one build per site runs at a time.
- **Regression:** fixture screenshot baselines inside the gates. `template:verify --all` must pass for
  every active major before a `platform/` change is accepted.
- **Batch and hold:** `sites:rebuild --release <hash>` over the fixture sites, with per-site QA. A failing
  site keeps its last good package and gets a last-good hold (`11`).
- **Metrics:** authoring hours per slice, logged by the developer, and build + QA minutes per fixture
  site. Both are compared with the Step 0 thresholds.

**Verify:**

- Scenario 1 rehearsal: a small CSS fix + PATCH bump → snapshot → gate diff confined to the fix → canary
  review → promote → batch rebuild passes.
- Hold: a planted failure in one fixture site after promotion → that site keeps its package and gets a
  hold, and a content change for it still builds on the held release.
- Rollback: promoting the older hash while one fixture uses a key the older release lacks → that site is
  reported and keeps its package.
- Platform variant: a `platform/` change that breaks one major's verify is refused.
- Refusals: `template:promote` without recorded results; a candidate build aimed at a live domain.
- Hermeticity: a dependency present only in the repository root is invisible to the build, and an
  operator environment variable does not reach it.
- Identity: the same inputs give the same `buildInputId` and no rebuild; a failed build with the same id
  can be retried.
- Scenarios 2 and 9 run as automated checks.
- Determinism: build the same input twice and compare HTML and build id. Record the result (`10` UNKNOWN).
- Fidelity report: residual differences named per section and width. They need not be zero; fidelity and
  production quality are measured separately (PRODUCT_VISION §10).

### MVP exit criteria (the proof the prompt asks for)

1. **Variation from data only.** One template directory builds ≥ 2 sites that differ in:
   - content: 173 vs 12 vs 0 projects; 24 vs 0 reviews
   - settings: limit, selection, a disabled section, copy
   - theme tokens
2. **No per-site code.** Zero per-site code; the dependency lint runs in the check suite.
3. **Scenarios.** Scenario 1 (rehearsal, including the platform variant) and Scenarios 2, 3, 4 and 9 pass
   as automated checks, together with the prune cases (0 items, `total ≤ pageSize`).
4. **Gates.** All packages pass isolated production QA, the brand census and the readiness gates. Previews
   are `noindex`.
5. **Fidelity.** A report for home (and list/detail if captured) against the clone, with residuals named.
6. **No source dependency.** No source runtime, API, media host or brand in any build.
7. **Stable boundary.** `ContentReader`, `AssetResolver` and `createSiteContext` have not changed since
   Slice 2. The conformance suite passes.
8. **Release safety.** Live packages come only from promoted snapshots whose gate results and canary
   review are recorded. Every package has a `buildInputId`. Builds are hermetic, and the hold and the
   rollback check work in rehearsal.
9. **Measured cost.** Authoring hours and build/QA minutes are recorded and compared with the Step 0
   thresholds. Exceeding one triggers its re-evaluation, not a silent continuation.

**Explicitly not in MVP:**

- Supabase, CMS / admin UI, server mode / tags
- `ContentChange` and writer services (NEXT #4)
- a second template, template switching
- revision history, draft schemas, uploads UI, forms
- `/faq`, `/service`, and journal/about/stores/legal routes
- hosting automation, catalog

## NEXT (each starts when its trigger appears)

| # | Work | Trigger | Reuses |
|---|---|---|---|
| 1 | `/faq` and `/service` as optional routes + `faqs`/`services` schemas (template minor) | Their capture is done | Route and collection machinery |
| 2 | First real onboarding: `site:create --template interior-01@1` + brief. The customer supplies facts, contact data, items and reviews. Generated drafts **only** for copy slots, `business.tagline`/`description`/`story` and descriptive item fields, each marked until a person approves it (`03` generation rules) → readiness | First pilot customer; needs #4 for approval records | ContentBrief, provider seam, extracted truth-mode rules |
| 3 | Per-site asset intake: uploads/imports, image variants, brand-mark fallback | First real customer assets | safe-fetch, content addressing, brand-mark |
| 4 | Write services for site data: draft schemas, `ContentChange` → build enqueue (`10`), file-mode edit history and approval records, atomic writes | Onboarding (#2), a second editor, customer editing, or the first undo need | Revision chain (extracted), atomic-write doctrine |
| 5 | Hosting target and per-site deploy: static host, redirects file, delta upload if determinism holds | First public launch | Package format, cache headers |
| 6 | Second interior template from the next preserved source | Evidence needed for vertical generalization | Whole platform; forces `transferSettings`, `site:switch` dry-run, redirects |
| 7 | `catalog.json` + site index command | ≥ 2 templates or ~5 sites | Registry doctrine |
| 8 | Batch rebuild at scale: queue, concurrency, canary lists, report | ~10 sites on one template | Slice 5 commands |

## LATER / DEFERRED

| Item | Trigger to start |
|---|---|
| Supabase as system of record (shared project, RLS), `exportSnapshot`, import | CMS work begins, or concurrent editors appear |
| Admin UI / CMS | Customers edit their own content |
| Server mode: data cache + tags + authenticated revalidation route + host → site resolution (spike the `app/[site]` route shell first) | Measured publish latency or rebuild cost (`10` criteria) |
| Scheduled publishing, slug redirects, category routes, search, interactive list filters | A template or customer needs them |
| Journal / about / stores / legal routes for `interior-01` | `13` observation items 11–12 |
| Forms / inquiry backend, review submission | Customer requirement + security review |
| Customer's own third-party integrations (chat, analytics) | Customer request + privacy review |
| Importer for a customer's own existing site (`imported-with-consent`) | A migration customer |
| i18n | A non-Korean customer |
| Catalog UI or DB mirror | Non-developers choose templates |
| JSON default-ON capture | Separate bounded task; not part of this plan |
| Generic captured-API replay | Stays deferred |
| Retirement of the legacy DOM-replica pipeline | The new path serves its first real customer. Until then the legacy path stays frozen |

## Parallelization and ownership (CLAUDE.md §5)

- Slice 0 (captures) and Slice 1 touch no shared files, so they run in parallel.
- `platform/` schemas and settings types are shared types: one writer per slice.
- Once the section contract (`defineSection`) exists, independent section components can be built in
  parallel in separate directories.
- Fixture sites and QA checks are a shared test fixture: one owner.
- The release store and build records are written by one command path only.
