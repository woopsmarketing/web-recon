# 02 — Existing Architecture Reuse Audit (Part B)

Evidence for every row is in `01-current-system-forensic.md` (the `§` numbers point there). This file
gives only the verdict and the reason. The target concepts named in the last column are defined in
`03`–`11`.

## Verdict vocabulary

| Verdict | Meaning in this study |
|---|---|
| **REUSE** | Use as-is (code or doctrine) in the new multi-site path. |
| **EXTEND** | Keep the concept and widen or retarget it (new input shape, new consumer). |
| **SUPERSEDE** | Its role in the new path is taken by a different concept. **Legacy code stays frozen, not deleted**, for existing pilots and evidence. |
| **REMOVE_FROM_NEW_PATH** | No role in the new path and no replacement needed. It may remain in legacy/preservation tooling. |
| **UNKNOWN** | Might help template authoring. No evidence yet; decide only when a real need appears. |

**Code vs rule.**

- **REUSE** of *code* is claimed only for modules with no legacy-pipeline imports (checked in `01`
  § Supplementary anchors).
- When a rule is sound but its module imports Slot V2 or reconstruction types, the verdict is **EXTEND
  (extract)**: the pure rule functions move into `platform/` without those imports (`14` Slice 1).

## The one assumption that changes everything

Tasks 13–29 assumed that **fidelity and templating come from regenerating captured DOM**. The chain was
Observation → SiteSpec → Exact Reconstruction → Slot V2 → slotized packs → baked production copy.
Three facts end that assumption for the multi-site path:

1. **The reference role has moved.** PRODUCT_VISION §4 now names the Source-Preserved Faithful Clone the
   strongest fidelity baseline. Exact Reconstruction is "historical / production evidence", not the only
   fidelity path.
2. **The DOM replica cannot carry the product requirements.** It has a closed crawl route table (§10),
   no collections, pagination or filtering (§12–14), content keyed to captured DOM paths (§5.2), and a full
   app copy with baked data for every site (§16, §18). It also has no human-owned code boundary (§17),
   against PRODUCT_VISION §5/§7/§15.
3. **Measured fidelity limits.** Intermediate-width failures in 28.75–28.8 and the responsive audits. This
   is DOC evidence of the model, not re-measured here.

The new path therefore treats a Template as **maintainable code authored once**, using the clone and
runtime/data evidence as its reference (`04`). Most of the machinery *around* the old template does not
depend on the DOM replica, and it is kept.

## A. Template, slots, regions

| Concept (evidence §) | Verdict | Reason | Role in new path |
|---|---|---|---|
| Exact Reconstruction app as production template base (§1.2, §9) | **SUPERSEDE** | Opaque DOM trees + per-site 11 MB CSS; not maintainable; no data seam | Authored template code (`04`) |
| Exact Reconstruction artifacts as measurement (computed-style buckets, layout probes) | **UNKNOWN** | May speed up CSS authoring; unproven | Optional authoring aid |
| Recon Template Slot V2 compile: slots, bindings, default-content, app copy (§1.1, §2.1) | **SUPERSEDE** | DOM-occurrence granularity, template-specific keys, per-site app copy | Copy slots + settings declared by sections (`07`) |
| Slot role vocabulary (14 roles) (§2.1) | **EXTEND** | The one cross-site semantic axis; never used for transfer | Seed for standard copy-slot names and section kinds (`07`) |
| `WR_SLOT_VALUES_FILE` applier, `expectedValue` guards, paint-twin, svg-text bindings (§2.1) | **REMOVE_FROM_NEW_PATH** | Exist only to mutate captured trees | — |
| `editability: review`, `REVIEW_REPETITION_THRESHOLD` (§2.1) | **REMOVE_FROM_NEW_PATH** | Sections declare their editable slots explicitly | — |
| Route Scope Policy (§12.2) | **REMOVE_FROM_NEW_PATH** | Prunes extraction over crawled routes; no runtime meaning | Evidence when deciding a template's routes |
| CollectionSpec, page families (§12.1, §12.2) | **REUSE** (as analysis only) | Deterministic "these source routes form a list/detail family" signal | Input to template route design (`05`, `13`) |
| Slotized V1 slots, bindings, groups, hashed ids (§1.3, §2.2) | **SUPERSEDE** | Same DOM granularity; hashed ids cannot be content keys | Content model + site settings |
| Repeater detection (structural fingerprint) (§2.2) | **UNKNOWN** | Could flag card grids on the clone as collection candidates | Optional authoring aid |
| Repeater apply (prototype cloning, duplicated node ids) (§2.2) | **REMOVE_FROM_NEW_PATH** | Collections render from data in components | — |
| ContentPack / ThemePack file formats (§2.2) | **SUPERSEDE** | Keyed by per-template hashed ids | Content model (`03`), site settings (`08`), theme file |
| Pack ↔ template **hard identity check** + negative control (§2.2) | **REUSE** (doctrine) | Refuse data built for another template | Site settings validated against the pinned `templateRef` (`08`) |
| Default-pack **neutrality** (`--assert-neutral`) (§2.2) | **EXTEND** | "Default inputs reproduce the reference" is a strong regression idea | Fixture-site regression for template changes (`11`) |
| `MECHANICAL_REPEATERS`, corpora keyed by generated slot keys (§2.2) | **REMOVE_FROM_NEW_PATH** | Hardcoded pilot facts | — |
| **SiteIdentity** schema + provenance/identity split (§3.1) | **REUSE (schema) / EXTEND (extract)** | Strict, generic, already the right fields. The module also imports reconstruction page types for its anchor patches | Schema extracted into `platform/`: identity block of the Site Instance, authoritative for brand/legal name, public origin and locale (`08`); provenance on the template manifest (`04`) |
| SiteIdentity anchor-text patches (§3.1) | **REMOVE_FROM_NEW_PATH** | Authored layout reads identity directly | — |
| PageRegions compiler (§21.2) | **REMOVE_FROM_NEW_PATH** | Sections are declared, not inferred | (UNKNOWN value as authoring aid) |
| Enablement safety engine (§21.2) | **SUPERSEDE** | Blast-radius/interaction-cut analysis exists because sections were undeclared | `disableable` sections + `optional` routes (`04`, `08`) |
| Enablement **doctrine**: no dead internal links, last-route refusal, re-validate at every build (§21.2) | **REUSE** | Still true for declared sections | Settings validation rules (`08`) |

## B. Content

| Concept (§) | Verdict | Reason | Role in new path |
|---|---|---|---|
| `ContentBrief` (§5.1) | **EXTEND** | Template-independent intake, but unstructured | Onboarding input for the customer's own facts and for generated drafts of copy slots and descriptive text only (`03` generation rules). Not stored as canonical content |
| `ProvidedFact {kind, value}` (§5.1) | **SUPERSEDE** | Free-form; no phone/address/hours | Typed `business` singleton + `business.facts[]` with basis (`03`) |
| Content units, `slot-values.json`, generation result keyed by slot keys (§5.2) | **SUPERSEDE** | Not portable across templates | Content model items + copy slots |
| `ContentGenerator` provider seam (§5.3) | **EXTEND** | Vendor-neutral, provider-agnostic validation | Retargeted to copy slots and descriptive text fields **only**. Never items, reviews, facts, contact or legal data (`03` origin rules) |
| Truth modes, `FACT_CLAIM_PATTERNS`, `source-fact-carried-over` (§5.3) | **EXTEND (extract)** | The rules enforce "never invent" (PRODUCT_VISION §9). But `truth-mode.ts` takes `LoadedReconTemplate`, slot values and `ProvidedFact` | Pure claim patterns + fact-backing check in `platform/`, retargeted to copy slots, generated descriptive text and `business.facts` |
| Validator: URL scheme allowlist, HTML injection, control chars (§5.3) | **EXTEND (extract)** | The rules are template-agnostic. `validate.ts` imports Slot V2 types | Extracted checks for all text/link fields of content and settings |
| Origin × Disposition accounting (§5.3) | **EXTEND** | Origin axis maps to item/field provenance; disposition was slot-population-specific | `origin` on items/fields; requirements report replaces disposition |
| Site/Page/Region content plans (§5; `content-injection/types.ts:252,265`) | **REMOVE_FROM_NEW_PATH** | Derivation chain for DOM slot generation | — |

## C. Theme, SEO, assets, brand

| Concept (§) | Verdict | Reason | Role in new path |
|---|---|---|---|
| theme-contract-v1, `isSafeThemeValue`, `themes/library/*` (§6.1) | **REUSE** | Closed, safe, already cross-site | Site theme = contract tokens → CSS variables |
| Contrast math (`theme/stylesheet.ts`: `contrastRatio`, `relativeLuminance`) (§6.1) | **REUSE** | Pure functions, no legacy imports | Theme validation per template |
| Compatibility verdict `checkThemeCompatibility(adapter, theme)` (§6.1) | **EXTEND** | It needs the superseded `SiteThemeAdapter` | Re-targeted to the template's `theme.consumes` token list |
| Site Theme Adapter, overlay generation, preview proxy, `bakeTheme` (§6.2) | **REMOVE_FROM_NEW_PATH** | Authored components consume `var(--…)` directly | — |
| Extracted "original theme" export candidate (§6.2; `theme/run.ts:94,127`) | **EXTEND** | Source palette → proposed template default theme (manual promotion) | Template authoring input |
| Typography tokens (contract-only) (§6.1) | **EXTEND** | Must become applied tokens in authored templates | Font license gate first (`15`) |
| Source SEO snapshot (§7.1) | **REUSE** | Evidence + forbidden-term source | Brand-isolation QA of templates and builds |
| Production SEO rules: `PlannedValue` basis/needs-input, brand-only preview fallback, canonical only with a domain, preview `Disallow: /` (§7.1) | **REUSE** | Exactly the "improve, never copy, never invent" doctrine | Shared SEO metadata helpers (`16`) |
| Plan route universe from template route-map (§7.1) | **EXTEND** | Must come from template manifest routes + content items | Sitemap + metadata (`05`) |
| `deriveRouteHeadings` (hero-headline / nav-label slot lookup) (§7.1) | **SUPERSEDE** | Tied to slot keys | Per-route title rule in template code |
| Head splice, route-map title bake, SEO serve proxy (§7.1, §16) | **REMOVE_FROM_NEW_PATH** | Next.js metadata API renders head | — |
| `checkTitleUniqueness`, `checkForbiddenCopy`, `deriveForbiddenTerms`/`checkBrandIsolation` (§7.1) | **REUSE** | Measurement gates | Build QA |
| `safe-fetch`, content-addressed `/media/<sha256>.<ext>`, immutable cache (§8.1) | **REUSE** | Generic, hardened | Customer asset storage + imports (`09`) |
| Asset classification doctrine (logo/brand → replacement-required; fonts → license-needs-review) (§8.1) | **REUSE** | Policy is template-agnostic | Template-intrinsic assets + imports |
| Source asset inventory, materialization, rewrite map (§8.1) | **REMOVE_FROM_NEW_PATH** | Customer sites never serve source assets | Preservation layer only |
| Replacement manifest seam (§8.1) | **SUPERSEDE** | Never closed; wrong unit (source URL) | Per-site asset registry with uploads |
| Brand census over HTML **and** RSC flight (`production/brand-census.ts`) (§8.2) | **EXTEND (extract + gate)** | Catches hydration-only leaks, but imports `brand-surfaces.ts` (legacy constants); `qa.ts:681` reports and never gates; terms come from `DeployManifest.sourceHost`; JS chunks are not scanned (`01` supplementary anchors) | Extracted census that **fails on any hit**, scans every emitted file (HTML, RSC flight, JS chunks), with the term list frozen into the release snapshot (`04`, `11`) |
| Brand surface detector (`content-injection/brand-surfaces.ts`) (§8.2) | **EXTEND** | Imports reconstruction route-map constants | Only if needed: term extraction for census input |
| `bakeBrand` resolver over captured IR (§8.2) | **REMOVE_FROM_NEW_PATH** | No source surfaces exist in authored code | — |
| Generated wordmark/monogram (`brand-mark.ts`) (§8.2) | **REUSE** | Honest fallback from the customer's own name | Logo fallback in preview |

## D. Production and orchestration

| Concept (§) | Verdict | Reason | Role in new path |
|---|---|---|---|
| ProductionSpec: lineage-by-hash, `baseUrl` planned value, `buildMode`, `indexabilityGate` superRefine (§15.1) | **EXTEND** | Sound; only the lineage shape is legacy | Site Build record: `buildInputId` = release snapshot hash + site snapshot hash + mode, plus `templateRef` and version (`11`, `14`) |
| `hashDirectory` (dir-sha256-v1) (§15.1) | **REUSE** | Deterministic input hashing | Site input + template hashes |
| `copyTemplateApp` disposable build copy, pristine input (§16.1, §18.1) | **REUSE (doctrine) / re-implement** | The doctrine allows concurrent per-site builds of one template dir. The code lives in `bake.ts` beside legacy imports, and `buildStaticExport` inherits `process.env` and resolves dependencies upward (`bake.ts:135-145`) | Hermetic site build workspace outside the repository: snapshot-installed dependencies, allowlisted environment (`11`) |
| Anchor patches, `bakeContent/Theme/SeoTitles/Brand`, `convertToStaticExport`, `postProcessExport` (§16.1) | **REMOVE_FROM_NEW_PATH** | Authored templates already read data, emit metadata, export statically | — |
| Static export mode: `output:"export"`, `generateStaticParams`, `dynamicParams=false`, path-only routes (§11.1) | **REUSE** | Proven here; forces path pagination (good for SEO) | MVP build mode, written in template code (`05`, `10`) |
| `assemblePackage`, `server.mjs`, static-server cache split (§16.1, §20.1) | **REUSE** (static server, format) / **EXTEND (extract)** (`assemblePackage`) | Per-site deliverable + sane cache policy. `static-server.ts` is clean; `packaging.ts` type-imports legacy brand-bake/census reports through `production/types.ts` | MVP package format |
| Isolated production QA (temp copy, PATH-only env, Playwright, brand census twice) (§16.1) | **EXTEND** | Generic per package, but `qa.ts:19` imports `brand-surfaces.ts` and the census is not a gate | Add pagination/sitemap/prune/empty-section/requirements checks; census hits fail the gate |
| `release-project-v1` as the site record (§4.1) | **SUPERSEDE** | Mixes identity, config, content, 7-stage pipeline bookkeeping, host | Site Instance + Site Settings + build records (`08`) |
| Authored-last fold precedence (§21.1) | **REUSE** (doctrine) | "Explicit site value beats default" | Effective settings merge (`08`) |
| 7-stage DAG + per-stage freshness (§4.1; `release/types.ts:46`, `release/graph.ts:43`, `release/freshness.ts`) | **SUPERSEDE** | A build is a pure function of template version + site snapshot | One build input hash (`10`) |
| Requirements + release gate (`INPUTS_REQUIRED`, blocking only for indexable) (§4.1) | **EXTEND** | Honest preview vs refused production | Requirements derived from template manifest × content (`03`, `04`) |
| Revision chain: append-only, hash-verified, `wx`, undo-as-append (`release/revisions.ts`) | **REUSE (doctrine) / EXTEND (extract)** | History primitive that works on files, but the code is bound to the release-project store and `AuthoredState` (`revisions.ts:36-37`) | File-mode history of site data and approval records (NEXT, `14`) |
| `createSite` flow (§22.1) | **EXTEND** | Already "template never mutated, new site = new record" | `site:create` from `templateRef` + brief (`14`) |
| siteId derivation doctrine (never host; collision-safe) (§3.2) | **REUSE** | Fixes a real cross-customer overwrite defect | Site Instance id |
| Resolution packs (natural-language operator intake) (`release/nl.ts:48`, `release/instance.ts:80`) | **UNKNOWN** | May survive as an operator intake before a CMS exists | Decide when an operator UI is scoped |
| `release/debt.ts` reading `docs/result/handoffs/24-aggregation-phase1.json` (§4.1) | **REMOVE_FROM_NEW_PATH** | docs/ must not be a runtime input | — |
| Registry code (host × run dir scan) (§19.1) | **SUPERSEDE** | Templates are registered in code; sites keyed by siteId | Code catalog + site index (`11`) |
| Registry doctrine ("cache never authoritative, rebuildable") (§19.1) | **REUSE** | Applies to any generated index (catalog JSON, DB mirrors) | `11` |
| Editor server (single-tenant `127.0.0.1`, ~20 endpoints) (§22.1) | **SUPERSEDE** | No auth/tenancy/concurrency; tied to legacy runtime | Future Admin UI/CMS (LATER) |
| Editor API ideas: preview-value vs save transaction, undo as append, refusal as data (`editor/server.ts:401,413,438`) | **REUSE** (design input) | Good contracts regardless of backend | CMS API design (LATER) |
| Authoring preview (build once + overlay epoch) (§18.1) | **SUPERSEDE** | Authored templates preview with `next dev` over site files | Preview reader mode (`09`) |
| Atomic write (temp + rename) (§18.1) | **REUSE (doctrine)** | Absent from project/registry writes today; the only implementation is private in the superseded `authoring-preview/workspace.ts:62` | Re-implemented (a few lines) for all site-data writes in file mode |

## E. Preservation / evidence (feeds template authoring, never production runtime)

| Concept | Verdict | Role |
|---|---|---|
| Source Package capture, Faithful Clone, runtime/data contract evidence (`docs/architecture/runtime-preservation.md`) | **REUSE** | Reference oracle for layout, behavior and data shapes while authoring a template; never a production dependency |
| Observation / SiteSpec / selector outputs | **REUSE** (analysis) | Route inventory, families, computed styles as authoring evidence |
| Reconstruction QA capture/compare modules (`src/reconstruction-qa/*`) | **EXTEND** (fit UNKNOWN in detail) | Candidate harness for template-vs-clone fidelity and template regression screenshots; verify API fit at implementation |

## Old assumptions — explicit disposition

| # | Old assumption | New-path position |
|---|---|---|
| A1 | Fidelity = regenerate captured DOM | The Faithful Clone is the reference; templates are measured against it (`04`, `11`) |
| A2 | A template is compiled automatically from one crawl | A template is authored once, with provenance; tooling assists, it does not generate the product |
| A3 | Routes = URLs the crawl verified | Routes = template route files + content-driven params (`05`) |
| A4 | Customer content = values for captured DOM occurrences | Typed, template-independent content model (`03`) |
| A5 | Customization = subtract or replace captured surfaces | Declared sections, typed settings, copy slots (`07`, `08`) |
| A6 | Theme = overlay onto generated selectors | Contract tokens → CSS variables consumed by components |
| A7 | Everything is partitioned by source host | Templates by `templateRef`; sites by `siteId`; source host = template provenance only |
| A8 | One compile per host; data baked into page JSON | One build per site, reading a site snapshot through the content reader |
| A9 | Brand removal is a bake-time resolution problem | Authored templates contain no source brand; census is a gate |
| A10 | SEO head is spliced after the build | Framework metadata from site SEO + content, generated under the reused SEO rules |

## What must not be lost

The honesty and safety layer is independent of the DOM replica, and it is kept:

- truth modes
- validator
- SEO needs-input and source/production split
- brand census (HTML + RSC flight), extracted and made a failing gate
- asset SSRF hardening and license doctrine
- hash-pinned lineage and the indexability gate
- isolated package QA
- append-only revisions
- siteId doctrine
- SiteIdentity
- theme contract and library

These are the parts that encode hard-won product rules, not the parts that produced pixels.
