# 00 — Executive Summary · Recon Template Platform Architecture Study

**Task type:** read-only forensic + architecture proposal (2026-09-17).

**Status: PROPOSAL, not accepted architecture.**

- No source, runtime, authoritative document (`docs/architecture/`, `docs/status/`, `PRODUCT_VISION.md`)
  or frozen artifact was changed.
- No commit, no push.

## The answer in one paragraph

Today web-recon's "Recon Template" is a **compiled DOM replica of one crawled site, copied per customer**.
It cannot carry growing collections, pagination, per-site settings or one fix shared by many sites.

The proposal makes a Recon Template a **maintainable Next.js code module, written once per design** and
verified against the Source-Preserved Faithful Clone. It renders **typed customer content** read through
**one site-scoped reader**. Sites vary only through what the template **declares**: settings, copy slots,
theme tokens, identity/SEO and assets. Each site pins a **template major** and builds only from that
major's **promoted release snapshot**. Sites ship as **static per-site builds** until a CMS makes
server-side tag revalidation worth running.

Most of the existing honesty, SEO, asset, brand, QA and hashing machinery is **reused or extracted**. The
DOM-replica production chain is **superseded**: frozen, not deleted.

```
promoted release snapshot of a template major + site content + site settings + theme tokens
  + identity/SEO + assets  →  one site build (buildInputId)
```

---

## CURRENT STATE

Verified in the current working tree, including uncommitted files (`01`).

| Area | Today |
|---|---|
| Template system | Compiled DOM replica of one crawled host (`templateId = <host>-<runId>`); the whole Next.js app is copied per compile. Slotized Template V1 is a second, CLI-only prototype on the same replica |
| Slot system | DOM text/attribute occurrences with template-specific keys (Slot V2) or hashed ids (Slotized V1). The 14 role labels were never used for cross-template transfer |
| ProductionSpec | Hash-pinned lineage + indexability gate. Bake = copy + anchor-guarded patches → static export → package → isolated QA |
| Site identity | SiteIdentity schema (CLI prototype) and a siteId doctrine; storage is still partitioned by source host |
| Multi-site reuse | Every site runs its own full pipeline and gets its own app copy with baked data. No shared runtime artifact |
| Route/page model | One catch-all over a closed crawl route table; desktop + mobile JSON node trees per page |
| Collections | Detected (page families), not implemented. No pagination, filtering or sorting |
| Data/storage | Host-partitioned files; `src/storage/` is empty; no database dependency |
| Cache | Static-server headers only (hashed → immutable, else no-cache). No revalidation code |
| Template versioning | Exact run-directory pin by hash; no semver, no upgrade path |

## WHAT ALREADY EXISTS (and matters)

1. **A preservation layer usable as the fidelity reference.** Source Package capture, Faithful Clone, and
   runtime/data-contract evidence for Apartmentary `/`.
2. **An honesty and safety layer independent of the DOM replica.** Truth modes, validator, SEO
   needs-input rules, brand census over HTML + RSC flight, safe-fetch, license doctrine. Some of these rules
   live in files that import legacy types, so they must be extracted (below).
3. **Production mechanics.** Static export, package format, isolated QA, hash lineage, revision chain,
   theme contract + library.

## WHAT SHOULD BE REUSED (as-is, code or doctrine — `02`)

| Area | Reused parts |
|---|---|
| SEO | Production SEO rules (needs-input values, canonical only with a domain, preview `Disallow: /`); title uniqueness; source SEO snapshot as the forbidden-term source |
| Brand | Brand-isolation checks (`checkBrandIsolation`, forbidden copy); generated brand mark from the customer's own name |
| Assets | safe-fetch; content-addressed `/media/<sha256>.<ext>`; immutable cache split; asset and font license doctrine |
| Theme | theme-contract-v1 + theme library + contrast math |
| Identity | siteId derivation doctrine; SiteIdentity **schema** (extracted, see below) |
| Build and delivery | `hashDirectory`; static export mode; static server and its cache split; the disposable-copy doctrine (code re-implemented, below) |
| History and writes | Doctrines only: append-only revision chain, atomic writes; registry doctrine "a generated index is never authoritative" |
| Safety doctrines | Data ↔ template hard identity check; no-dead-link and last-route rules; authored-value-wins precedence |
| Evidence | Preservation layer and page-family analysis, as authoring evidence |

## WHAT SHOULD BE EXTENDED

| Existing | Extended into |
|---|---|
| Truth modes + fact-claim patterns; validator (URL allowlist, HTML injection, control chars); SiteIdentity schema | Pure rules **extracted** into `platform/` with their tests. The current files import legacy pipeline types; they stay untouched |
| Brand census (HTML + RSC flight) | Extracted and made a **failing gate** over every emitted file (HTML, RSC flight, JS chunks), with a term list frozen into each release snapshot. Today it imports legacy code transitively, only reports (`qa.ts:681`) and skips JS chunks |
| `assemblePackage`; revision chain | Extracted from legacy-coupled files (package format kept; history in NEXT) |
| `copyTemplateApp` + `buildStaticExport`; `writeAtomic` | Re-implemented: hermetic builds outside the repository with snapshot-installed dependencies and an allowlisted environment (today: full `process.env`, dependencies resolved upward, `bake.ts:135-145`); atomic write re-implemented (today private to a superseded module) |
| ProductionSpec lineage | Site build record: `buildInputId` = release snapshot hash + site snapshot hash + mode + toolchain hash, plus `templateRef`, version, QA result and deployment state |
| Isolated QA | + pagination, sitemap, prune and empty-section checks; census hits fail |
| Requirements / release gate | Readiness = template manifest requirements × content |
| ContentBrief, provider seam, origin accounting | Onboarding intake. Generated drafts **only** for copy slots and descriptive text, stored with pending-approval markers that block indexable builds; `origin` on items with no generated value |
| Slot role vocabulary | Standard section kinds + slot names |
| Default-pack neutrality check | Fixture-site regression gate inside `template:release` |
| `createSite` | `site:create` from a `templateRef` |
| SEO route universe | Manifest routes + content items |
| Extracted original theme | Template default theme |
| Typography tokens | Applied once fonts pass license review |
| Reconstruction-QA capture/compare | Fidelity + regression harness (API fit UNKNOWN) |

## WHAT SHOULD BE SUPERSEDED (frozen, not deleted)

**Superseded:**

- Exact Reconstruction app as the production template base
- Slot V2 compile and app copies; Slotized V1 slots and packs
- `release-project-v1` as the site record, with its 7-stage DAG
- Enablement engine, `ProvidedFact`, slot-keyed content units
- Replacement manifest seam, registry code, editor server, overlay authoring preview

**Removed from the new path** (they exist only to mutate captured trees):

- slot applier / paint-twin bindings
- anchor patches and bakes, head splice
- theme overlay / adapter, brand bake
- source asset materialization
- route scope policy, region compiler, repeater cloning
- docs used as runtime input

## WHAT NEW ABSTRACTIONS ARE ACTUALLY NEEDED

The prompt's hypotheses, evaluated:

| Hypothesis | Verdict | Becomes |
|---|---|---|
| Canonical Content Model | Needed, but smaller than "canonical" | Core + vertical zod modules; singletons (business, legal, taxonomy) + collections; published schemas now, draft schemas with the first editor (`03`) |
| Template Mapper | **Not needed as a layer** | `selectionToQuery` helper + component code; `transferSettings` for template switches (NEXT) (`07`) |
| Repository Boundary | Needed, as **one generic site-scoped reader** | `createSiteContext(siteId, templateRef, mode, at)` → `ContentReader` + per-unit settings + `AssetResolver`; `SiteStore` is operator tooling only; closed query descriptor; conformance suite from MVP (`09`) |
| Slot Model | Needed, **narrowed** | Section-level copy slots only (text / richText / link / media). No DOM, CSS or per-item slots (`07`) |
| Site Instance | Needed, **minimal** | Identity/config record whose `identity` is the only source of brand/legal name, origin and locale + one Site Settings document per `(siteId, templateRef)` (`08`) |
| Template Versioning | Needed, **minimal but enforced** | Major pin + semver + content-addressed release snapshots (template + `platform/` incl. builder + scoped lockfile + configs), gated **after** snapshotting, promoted only with recorded gates and canary review; hermetic builds; `buildInputId`; automatic last-good hold; rollback settings check. `v1/` from day one; any default change is MAJOR (`11`) |

New MVP components, 7 in total:

1. content model
2. template module + manifest (`defineSection`)
3. Site Instance
4. Site Settings + merge/validation
5. site-scoped reader boundary + reader conformance suite
6. manifest-driven route prune step
7. release snapshots (snapshot-first gates, promote preconditions, last-good hold) + hermetic site builds +
   build record (`buildInputId`) + batch rebuild

NEXT, with the first writer: `ContentChange`.

**Not needed:**

- a mapper layer
- a route DSL or route model
- a catalog service
- a cache platform or workflow engine
- a package registry (the release store is only a directory of immutable snapshots)
- per-customer repositories or databases

## PROPOSED TARGET ARCHITECTURE

```
        PRESERVATION / REFERENCE  (exists; frozen evidence)
                  │ authoring reference · fidelity gate · forbidden brand terms
                  ▼
   CODE (once per design)                         DATA (per siteId)
   templates/<id>/v<major>/ + platform/           Site Instance · Site Settings · Content · Assets
                  │ template:release (snapshot → gates)         │
                  ▼                                             │
   RELEASE SNAPSHOT (immutable; candidate → canary → promoted)  │ site snapshot via createSiteContext
                  │ pinned by templateRef "id@major"            │
                  └──────────────────────┬──────────────────────┘
                                         ▼
                   HERMETIC BUILD per site (buildInputId) → PACKAGE → PUBLIC SITE
                   (MVP static export; LATER server mode + tags on measured need)
```

| Aspect | Proposal |
|---|---|
| **Pages/routes** | Next.js file routes are the router; the manifest carries route metadata; path pagination (`/portfolio/page/2`). Routes that must not exist for a site are pruned from the build workspace, because Next.js 16.3.0 static export aborts on empty static params (`05`) |
| **Collections** | Typed items per site; views are closed queries (latest / featured / category / manual) with `sort` arrays; offset pagination with an `id` tie-breaker. Publishing #174 moves no records (`06`) |
| **Site overrides** | `EffectiveSettings = TemplateDefaults(templateRef) ⊕ SiteSettings(siteId, templateRef)`; strict, closed keys; no reorder, no arbitrary composition (`08`) |
| **Content honesty** | No generated items, reviews, facts, contact or legal data (schema-enforced). Generators draft only copy slots and descriptive text; every stored draft carries a pending-approval marker that blocks indexable builds. Source-like values exist only in a private reference fixture that site data and packaging refuse (`03`) |
| **Storage** | JSON files now, also the build snapshot format; later one shared Supabase project with RLS, JSONB bodies + promoted query columns. Template code unchanged; the conformance suite guards equivalence (`09`) |
| **Cache** | MVP: the static build is the cache; a change rebuilds that site, skipped only when `buildInputId` equals the last successful, deployed build. LATER: per-unit reader-derived tags; an authenticated route calls `revalidateTag(tag, {expire: 0})`; pages are eventually consistent (`10`) |
| **Versions / catalog** | Minor/patch ship as release snapshots (snapshot → gates → canary → promote) and reach pinned sites at their next build; a site that fails keeps its package and gets a last-good hold; rollback checks settings compatibility; a `platform/` change is accepted only when every active major verifies; majors are explicit per-site upgrades; code-registry catalog (`11`) |
| **Apartmentary** | `interior-01@1` = home + portfolio list + detail, after bounded captures of the list and both detail families (`13`) |

Full diagram and the table of where each concern lives: `16`. All nine prompt scenarios are traced in `12`
as design-level traces (all pass; the template switch needs NEXT work).

## MVP IMPLEMENTATION RECOMMENDATION (`14`)

**Step 0 — owner decisions:** direction (as a measured bet), re-evaluation thresholds, repo layout, naming,
legal/IP policy, capture approval.

| Slice | Delivers | Verified by |
|---|---|---|
| 0 | L1 captures of `/portfolio?page=0\|1` and 2 details per family (parallel with Slice 1) | Package integrity and clone render checks |
| 1 | Extracted rules; one content section (`home.projects-a`) plus header/footer; `AssetResolver`; one template, **three fictional sites** (large, small, empty) | Negative controls incl. origin refusal; dependency and wall-clock lint |
| 2 | List + pagination + detail; route prune; reserved slugs; reader conformance suite; sitemap/robots/metadata | Scenario 3 automated; 0-item and `total ≤ pageSize` prune tests |
| 3 | Full homepage; honest empties; readiness with approval markers | Scenario 4 automated; review-refusal, approval-marker and identity tests |
| 4 | Production gates: isolated QA, census as a failing gate over all emitted files, host checks, theme contrast | Planted-leak negative controls incl. JS chunks |
| 5 | Reference fixture builder; fidelity report vs clone; snapshot-first `template:release`, `template:canary`, `template:promote` preconditions; hermetic builds; `buildInputId`; batch rebuild with holds; rollback check; cost metrics | Scenario 1 rehearsal incl. hold, rollback and platform variant; refusals; hermeticity and determinism checks |

**Exit criteria (all nine in `14`):**

- One template directory builds ≥ 2 sites that differ in content, settings and theme.
- No per-site code.
- Scenario 1 (rehearsal incl. the platform variant), Scenarios 2, 3, 4 and 9, and the prune cases pass as
  automated checks.
- All packages pass isolated QA, the census gate and readiness; previews are `noindex`.
- A fidelity report against the clone names its residuals.
- No source runtime, API, host or brand in any build.
- `ContentReader`, `AssetResolver` and `createSiteContext` have not changed since Slice 2, and the
  conformance suite passes.
- Live packages come only from promoted snapshots with recorded gates and canary review; builds are
  hermetic; the hold and the rollback check work in rehearsal.
- Authoring hours and build/QA minutes are recorded and compared with the Step 0 thresholds.

**Not in MVP:**

- Supabase, CMS, server mode
- `ContentChange`, writer services, draft schemas
- a second template, switching
- uploads, history
- `/faq`, `/service` and the other routes

## BIGGEST TRADEOFFS (`15` §1)

1. **Authored template code instead of a compiled replica (S1).** Human authoring cost per template, in
   exchange for maintainable, data-driven templates with collections and one-fix-for-all-sites. A one-shot
   generated scaffold (Option C1) is the named fallback if measured authoring cost exceeds the Step 0
   threshold.
2. **Static per-site rebuilds instead of server-side tag revalidation (S9).** No runtime infrastructure
   and reuse of the existing package/QA path. In exchange, unrelated pages are rebuilt (with identical
   output) and publish latency equals build time, until a CMS justifies server mode.
3. **Automatic minor/patch delivery within a pinned major (S7).** Fixes reach every pinned site, so
   regressions can too. Mitigated by the regression gate, candidate → canary → promote, per-site QA,
   keep-last-good, the automatic last-good hold, and the rule that any default change is MAJOR.
4. **No mapper, one generic reader, JSONB bodies (S2, S4, S8).** Less code and cheap storage migration, in
   exchange for fewer database-level constraints; the shared app schemas are the contract.

## BIGGEST RISKS (`15` §3)

| # | Risk |
|---|---|
| R1 | **Authoring cost and fidelity of hand-written templates are unproven.** This decides whether "10+ templates per vertical" is viable; measured in MVP against Step 0 thresholds |
| R2 | **Legal / IP** of templates derived from third-party designs. Needs an owner policy beyond the technical brand and asset gates |
| R5 | **Apartmentary evidence gaps.** 48 of 56 verified URLs never observed beyond crawl; 0 `<a href>`; no API response bodies; two unexplained detail families |
| R14 | **Platform blast radius.** A `platform/` or dependency change reaches every template; contained by all-majors verification, per-major staging and frozen snapshots |
| R7 | **Settings creep** toward a page builder |
| R15 | **Route prune drift**, which depends on Next.js static-export internals verified only in 16.3.0 |
| R8 | **Two systems named "template"** (legacy `src/recon-template` vs new templates) |
| R9 | **Evidence based on an uncommitted working tree** |

## UNRESOLVED QUESTIONS (`15` §5, top items)

1. Accept the authored-template direction, superseding DOM-replica templates for production, and set the
   re-evaluation thresholds?
2. Legal/IP policy for templates derived from third-party sites?
3. Customer legal pages (privacy/terms): platform page or template routes?
4. Hosting target, and when to adopt server mode?
5. Repo layout (same repo vs separate) and naming ("Recon Template" vs legacy `src/recon-template`)?
6. Apartmentary v1 scope and capture approval. Wait for JSON default-ON response bodies before fixing the
   detail schema?
7. How PRODUCT_VISION §15's three-way diff applies at template level, and the font licensing policy.

## Evidence note

- **Current code is authoritative.** Findings describe the current working tree, which includes
  uncommitted files. Claims supported only by documents are labeled DOC-ONLY (`01`).
- **Main-agent re-checks.** Load-bearing claims were re-checked in code and artifacts. Framework claims
  (static export with empty params, `notFound()` output, `revalidateTag` / `updateTag`) were checked in the
  installed Next.js 16.3.0 with file:line references (`05`, `10`).
- **Corrections.**
  - An investigation reported 34 crawl-verified Apartmentary URLs in 6 families. The canonical crawl run
    holds **56 URLs in 16 families**, including `/journal`, `/brand`, `/stores`, `/terms` and `/parts`.
    `01`, `03`, `05` and `13` were corrected.
  - A fact check of 44 claims found 2 wrong; both were corrected in `01`.
- **Independent reviews.** A fresh-context architecture review reported 1 BLOCKER, 9 MAJOR and 7 MINOR
  findings. A second fresh-context review of the revised documents found no blocker, 5 partial fixes, 8
  new MAJOR and 7 new MINOR findings. Their code-level claims were verified before fixing: transitive
  legacy imports, the census that only reports, the build environment, the Next.js tag-expiry code path.
  All findings were fixed across `01`–`16`; both reviews are listed in `15` §4.

## Reading map

| File | Part | Contents |
|---|---|---|
| `01-current-system-forensic.md` | A | 23 forensic findings with FILE / SYMBOL / behavior / reuse verdict; investigation labels; supplementary anchors |
| `02-old-system-reuse-audit.md` | B | REUSE / EXTEND / SUPERSEDE / REMOVE / UNKNOWN per concept; old assumptions |
| `03-standard-content-model.md` | C | Core + vertical content model, origin and generation rules, requirement levels, empty content |
| `04-template-definition.md` | D | Template module, manifest fields, CODE vs CONFIG, authoring gates, reference fixture |
| `05-pages-routes.md` | E | File routes + metadata, path pagination, Next.js 16.3.0 static-export constraints and route prune, route keys and evidence, SEO per page |
| `06-collections.md` | F | Query descriptor, selection modes, offset vs cursor, blog pageSize 9 example |
| `07-slots-and-mapper.md` | G + H | Slot definition and types, the explicit questions, mapper evaluation |
| `08-site-overrides-and-instance.md` | I + J | Effective settings, stable defaults, validation, fork prevention; Site Instance and identity authority |
| `09-content-repository.md` | K | Reader interfaces, per-unit settings reads, JSON layout and build snapshot, Supabase sketch, conformance suite, migration |
| `10-cache-invalidation.md` | L | Static build as cache, `ContentChange` (NEXT), tag vocabulary, blog publish trace, Next.js 16.3.0 revalidation facts |
| `11-template-versioning-catalog.md` | M + N | Major pin, release snapshots and hermetic builds, build input identity, platform rules, release flow, last-good hold, change classes, upgrade flow; code-registry catalog |
| `12-multi-template-multi-site-scenarios.md` | O | Scenarios 1–9 traced |
| `13-apartmentary-first-template.md` | Q | Evidence levels and index, template mapping, required observations |
| `14-implementation-order.md` | R | Step 0 (incl. thresholds), Slices 0–5, exit criteria, NEXT, DEFERRED |
| `15-tradeoffs-risks.md` | P + S | Tradeoffs, overengineering check, risks, self-critique incl. independent review, open questions |
| `16-proposed-architecture.md` | — | Diagrams, where each concern lives, invariants, evolution |
