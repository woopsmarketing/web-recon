# Pre-Overnight Architecture & Implementation Readiness Audit (2026-08-26)

**Mode:** READ-ONLY architecture investigation. No production source, schema, `package.json`,
dependency, or existing artifact was modified. Zero git operations. No build, test, smoke suite,
or live crawl was executed. The only two files created are this report and
`docs/result/handoffs/pre-overnight-audit.json`.

**Method:** one orchestrator + seven fresh, mutually isolated read-only specialists (A–G) +
one completely fresh aggregator. No specialist saw another's conversation; all inter-agent
transfer was via small disk handoffs. Where a report and the code disagreed, **the code was
recorded as current reality**.

**Corpus inspected:** 333 source/script files, `data/linear.app` and `data/stripe.com` artifact
namespaces, `docs/result/handoffs/*.json`, and the Task 17.1–26 reports.

---

# Executive Summary

The engine is in materially better shape than the planning documents suggest, and the single
biggest finding is that **much of the proposed Overnight Mega Program already exists in
`src/release/`** — shipped by Task 25 and exercised by Task 26, but documented in neither
`README.md` nor `ROADMAP.md`.

A `release-project` already carries a deterministic project id, an immutable `acceptedLineage`
of seven stages as `{id, path, hash}` *references* (not copies), per-stage `fresh | stale | blocked`
status, an explicit dependency graph, sha256 input-hash staleness with cascade prediction,
selective rebuild through typed APIs (never `exec`), a proven zero-mutation dry run,
retry/resume, a closed requirement-kind taxonomy, and a `production-resolution-v1` pack whose
vocabulary already includes `urls[slotKey]`, `assets[assetId]` and `routeContent[route].slotValues`.
That is simultaneously a proto-SiteInstance, a proto-Site-Factory-Controller, and — unrecognised
until this audit — **an editor write format**.

Five findings decide the shape of tonight's work:

1. **SiteInstance must extend `release-project.json`, not replace it.** Stop condition A is
   TRIGGERED — the proposed model seriously duplicates a shipped one. The alternative is
   cheap and is the plan of record. Three real defects must be fixed: identity is run-scoped
   (`projectId = ${host}-${spec.runId}`; two projects already exist for linear.app), re-prepare
   **destroys authored state** (`prepare.ts:223` hardcodes `resolutions: []`), and the vocabulary
   is value-substitution only. Weight that both the SiteInstance and editor analyses missed:
   **`release:resolve` and `release:build` have never run on real data** — all five `run.json`
   files on disk are `kind:"prepare"`. Every write path the program depends on is unexercised code.

2. **Route scope filtering is nearly free, and the prize is large.** Nobody filters today
   (`route-plan.ts:131` is a strict 1:1 over `siteSpec.routes`). The narrowest seam is
   `recon-template/compile.ts:87` — filter `input.pagesById` before `extractAllPages`. Everything
   downstream is a pure function of the extraction, so a filtered page yields zero slots with
   **zero schema change**, and because `generateTemplateApp` copies the exact app *whole*, a
   slot-less route still **renders byte-identically**. `STRUCTURE_ONLY` is therefore free.
   Measured effect: stripe `−47.8%` slots from `/resources/more/*` alone, `−62.8%` with locale
   routes and `/cookie-settings`.

3. **Visual Editor V1 needs no renderer rewrite — and is still cut tonight, for capacity.**
   The serve-boundary overlay pattern already ships three times (theme, SEO, assets);
   `seo/serve.ts:81-84` already splices arbitrary HTML before `</head>`. Slot→DOM selection is
   already solved: `data-wr-node` is on every element and `parity-qa.ts:858` already resolves
   bindings to live DOM. Two specialists reached this independently. **No new DOM attribute
   should be added** — it would flip parity risk from LOW to MEDIUM against the very sequence
   comparison parity QA exists to perform.

4. **One genuine measurement defect, cross-validated by two specialists.** The production bake's
   residual brand count is a *network-host* metric mislabelled as residual presence: stripe's
   package contains **11,061** `stripe.com` occurrences across 15 subdomains against a reported
   430; Linear's contains 782 URLs, 208 `aria-label…Linear`, 128 `symbol id`, and **294 `src=`**
   at the source CDN. `qa.ts:436-443` compares observed hosts against `knownResidualSourceHosts`,
   which for Linear **is the source host** — the assertion is unfalsifiable. `sourceHostMentionsInHtml`
   is computed and returned with **zero consumers**. Important boundary: the *blocker* accounting
   is honest and the gate is **not** falsely green — 84 release-blocking requirements hold Linear
   at `INPUTS_REQUIRED`. What is broken is the measurement and its falsifiability, not the gate.

5. **The working tree is the highest operational risk, and it is cheap to fix.** 83,336 LOC across
   333 files are uncommitted against 18 files in HEAD. `data/` is verified gitignored (18 GB), so
   there is **no gigabyte risk**, and a secret scan returned 0 matches. But `.gitignore:26 (*.log)`
   silently excludes all 90 regression logs — **the entire measured basis for "1,794 checks" would
   not be committed** and dies to a `git clean -xfd`.

**Verdict: READY WITH ARCHITECTURE CHANGES** (10 required changes, §Final Recommendation).
One stop condition is TRIGGERED with a clean, cheap alternative already identified.

---

# Current Architecture Reality

Verified from code, not from reports.

| Layer | CLI | Artifact namespace | Mutability |
|---|---|---|---|
| Discovery | `recon` | `data/<host>/<run>/discovery.json` | run dir is a **mutable accumulator** |
| Verification | `verify` | writes **into** the discovery run dir | additive |
| Page Family / Selector | `select` | writes **into** the discovery run dir | additive |
| Deep Observation | `observe`, `observe:site` | `site-observations/<run>/` | additive |
| Interaction Detect | `detect:interactions` | writes **into** the observation run | additive |
| Interaction Explore | `explore:interactions` | `interaction-explorations/` | new run |
| Interaction Patterns | `model:interactions` | `interaction-models/` | new run |
| SiteSpec | `compile:sitespec` | `site-specs/` | new run |
| Exact Reconstruction | `reconstruct` | `reconstructions/` | new run |
| Reconstruction QA | `qa:reconstruction` | `reconstruction-qa/` + `iterations/q00N/` | append-only chain |
| Recon Template + Slot V2 | `compile:recon-template` | `recon-templates/` | new run; **QA writes back in** |
| Content Injection | `content:*` (5) | `content-runs/` | **edited in place** by `revalidateSlotValues` |
| Theme | `theme:*` (5) | `theme-extractions/`, `theme-runs/` | new run |
| SEO | `seo:*` (4) | `source-seo-snapshots/`, `production-seo-plans/` | new run |
| Assets | `assets:*` (4) | `asset-inventories/`, `asset-materializations/` | new run |
| ProductionSpec + Build | `production:*` (2) | `production-specs/`, `production-builds/` | same run id |
| Release orchestrator | `release:*` (4) | `release-projects/<host>-<specRunId>/` | project mutable, `runs/` append-only |

A second, disjoint orchestrator exists: `src/e2e` (13 stages, `e2e-runs/`) with **no reuse, no
hashing, and no resume**. There is no invalidation across the `e2e` ↔ `release` seam.

**Slot V2 is not a separate layer.** `SLOT_SCHEMA_VERSION = 2` is a constant inside the
recon-template module (`recon-template/types.ts:50`).

## Run identity

Format is `new Date().toISOString().replace(/[:.]/g,'-')`, **copy-pasted across 11 store modules**;
`createdAtFromRunId` is duplicated 6× with **4 different failure behaviours**. Downstream selection
is **always an explicit path argument** — a deliberate, documented invariant
(`e2e/run-context.ts:14-17`) — with exactly one exception: `reconstruction-qa/load-inputs.ts:151`
picks the lexically-greatest matching run. **There are zero pointer files**: no `latest`, no
`index.json`, no `HEAD` anywhere under `data/`.

`revision` has **0 hits in `src/`**. No history, no rollback, no GC, no index — on 18 GB of artifacts.

## Documentation drift (ACTUAL CODE IS CURRENT REALITY)

| Claim | Claimed in | Reality |
|---|---|---|
| Roadmap ends at Task 24 | `ROADMAP.md` | Tasks 25–26 absent entirely (0 hits for `Task 25`/`release:prepare`); 3,666 shipped LOC undocumented |
| `README.md` project tree | `README.md:2017+` | stops around Task 07; no `src/assets/`, `src/production/`, `src/release/`, `src/reconstruction-qa/`, 11 CLIs missing |
| ProductionSpec, theme system, asset materialization, SEO engines "not implemented" | `PRODUCT_VISION.md:501-517` | all five shipped with real artifacts |
| "Recon Template stays immutable" | Task 18 | its own `qa:recon-template` writes 3 files into the run dir (`cli-qa-recon-template.ts:96,110`) |
| "a run never writes a byte into anything it read" | `content-injection/store.ts:5-16` | true across layers, false within: a content run dir spans 46 min with `manifest.json` written last |
| "no absolute local path reaches an artifact" | `observer/store.ts:246-248` | violated by `content-runs .templateManifestFile` and all four `theme-runs` pointers (`/Users/woops/...`) |
| "16 suites / 1,671 checks" | Task 24 / stored memory | stale; current verified reality is **17 suites / 1,794 checks** |
| `THEME_SELECTION_IMPACTS` part of the model | `release/graph.ts:16` | zero **engine** call sites — but asserted by `scripts/smoke-release.ts:1210` |
| `manual-visual-review/` namespace | — | orphan: zero `src/`/`scripts/` references; 129 MB on linear.app, produced by `.ts` files stored inside `data/` |

---

# Current Artifact / Data Flow

```
Source Website
  → Discovery (candidate URLs)      → Verification (reachability, fingerprints)
  → Selector (page families, representatives)
  → Multi-Observer (desktop+mobile deep observation)
  → Interaction: detect → explore → pattern-model
  → SiteSpec  (observed fact; immutable)
  → Exact Reconstruction (the QA answer key; frozen at Task 17.1)
      ⇅ Reconstruction QA (iterations/q00N append-only)
  → Recon Template + Slot V2 (editable content contract)
  → Content Injection (slot-values overlay)
  → Theme (extraction → adapter → overlay CSS at the serve boundary)
  → SEO (source snapshot | production plan — two models, zero sharing)
  → Assets (inventory → materialize → /media/<sha256>)
  → ProductionSpec (lineage receipt) → Production Build (static export package)
  → Release Project (requirements, resolutions, stage freshness, selective rebuild)
```

Three preview/serve-boundary proxies exist and are the architecturally important detail: theme
(`theme/serve.ts:60-117`), SEO (`seo/serve.ts:98-184`), and assets (`assets/serve.ts:70,118-131`).
Each fronts an **unmodified** app, forcing `accept-encoding: identity` so edits are plain
concatenation. `seo/serve.ts:68-86` splices arbitrary HTML before `</head>` and rewrites the RSC
flight payload — required, or React reverts the change at hydration.

---

# Source-of-Truth Matrix

| Information | Authoritative | Derived / duplicated copies |
|---|---|---|
| Routes | `recon-templates/<run>/manifest.json .routes` | **11 physical copies** (site-spec, site-map, 2× route-map.json, content manifest, template-summary ×2, layout-qa, theme qa, seo plan, deploy-manifest, exported HTML). Absent from production-spec and release-project |
| SiteGraph / site-map | `recon-templates/<run>/site-map.json` | routes from the route map, families from the SiteSpec; **`inferredRoutePattern` is dropped** at `site-map.ts:44-47` |
| Page Family | `site-specs/<run>` `FamilySpec` | template keeps only 4 of ~12 fields |
| Exact page structure | `reconstructions/<run>/app/reconstruction-data/pages/p*.json` | template app copy, build app copy |
| Slot definitions / bindings / defaults | `recon-templates/<run>/{slots,slot-bindings,default-content}.json` | **3× each** (canonical, `app/template-data/`, build) ≈ 13 MB per build |
| Default content | same as above | ditto |
| **Content values** | `content-runs/<run>/slot-values.json` | **5 copies**. `generation-result.json .slotValues` is the release merge base; `production-builds/.../slot-values.baked.json` is byte-identical (both sha1 `3de1062b…`, 1,395 entries). **A hand-edit to `slot-values.json` is silently discarded on rebuild** |
| Content plan / intent | `content-runs/<run>/intent.json` | `release-project.json .intent` snapshot; editing intent does **not** stale the content stage |
| Theme tokens / adapter | `theme-extractions/<id>/{original.theme.json,site-theme-adapter.json}` | `theme-runs/<id>/theme-adapter.json` byte-identical (788,731 B ×2); overlay CSS stored 3× |
| SEO | source snapshot vs production plan — **two schemas by design, zero sharing** | baked head/robots/sitemap byte-identical to the plan; production domain duplicated 3× |
| Assets | inventory `.entries` (448 linear) vs materialization `media/` + rewrite-map | largest byte duplication; every release-derived materialization is a full `cp` of the base run |
| Production lineage | `production-spec.json .lineage` (5 slots, `dir-sha256-v1`) | `release-project.json .acceptedLineage` (7 slots, **independently re-hashed**) + `.stageStatus[].artifact.hash` — well managed, mismatch is detectable |
| QA results | **NO SINGLE AUTHORITY** — each QA writes back into the artifact it measured | see Risk 1 |
| Revision history | **DOES NOT EXIST** | nearest: append-only `release-projects/<id>/runs/<id>/run.json` + `.resolutions[]` |
| Technical debt register | `docs/result/handoffs/24-aggregation-phase1.json` — **a doc, not an artifact** | copied to each project's `technical-debt.json` |

**Duplicated-truth cases requiring an explicit ruling tonight:** content values (5 copies, two
mutually exclusive editing doctrines), theme adapter (byte-identical 788 KB twin), and QA results
(no authority at all).

---

# Template Factory Findings

**Route ownership.** `src/reconstruction/route-plan.ts:131 buildRoutePlan` — a strict 1:1 over
`siteSpec.routes` with no cap and no allowlist. Its output becomes `route-map.json`, read verbatim
by `recon-template/load-input.ts:93-99` and restated as `manifest.routes` (`compile.ts:133`). The
template compiler performs **no selection of its own**. Upstream, `sitespec/compile-routes.ts:58`
is 1:1 over `verifiedUrls.urls`, deliberately (doc comment at `:14-19`).

**Family info reaching the template: PARTIAL.** `site-map.json` carries `familyId`, `representative`,
and a `pageFamilies[]` block. But `SlotDefinitionSchema` is `.strict()` with **no family field**, and
`manifest.routes` is a bare `z.array(z.string())`.

**Existing filter seam: NONE.** `pnpm select` takes only `--verification`. `--slot-overrides`
addresses slots by key, never routes. `--max-urls` is a Firecrawl crawl cap. `load-input.ts:100-104`
actively **throws** if the route map is shorter than the manifest. The gap is already named in-repo:
`release/prepare.ts:227-229` records "template routes are a CLOSED set from observation… future
collection task".

**Narrowest insertion point: `recon-template/compile.ts:87`** — filter `input.pagesById` immediately
before `extractAllPages`. Narrowest because all evidence is already loaded; every downstream step is
a pure function of `extraction`; counts recompute automatically at `:135-151`; `buildSiteMap` reads
`routeMap`, not the filter; and `generateTemplateApp` still copies the exact app whole, so a
slot-less route **renders byte-identically** — that *is* `STRUCTURE_ONLY`, for free. Additions are
all optional fields: `scopePolicy`/`scopePolicyReason` on `SiteMapRouteSchema`, two manifest counts,
and a `--route-policy` flag mirroring `--slot-overrides`. **SiteSpec, Slot V2, selector, multi-observer
and reconstruction are all untouched.**

The selector-side alternative is **rejected**: it would bump `selector/types.ts:45 SCHEMA_VERSION`,
which `multi-observer/load-selection.ts` validates as a `z.literal` — every existing
`selected-pages.json` would stop loading. It would also decide policy before any page has been rendered.

**Critical constraint.** `template` and `reconstruction` are declared FROZEN stages
(`release/types.ts:52`, enforced at `build.ts:137/164/276`). Template Factory V2 changes the
*compiler*, not existing runs, so no pinned hash moves — **the freeze survives provided V2 never adds
a `template` StageRunner**. Separately, `report/` must be added to the template stage's `excluded[]`
hash set (mirroring how `node_modules`/`.next`/`out` are already excluded at `prepare.ts:129-136`),
or running `qa:recon-template` after `release:prepare` will brick `release:build`.

---

# Route Scope / Blog / Docs Findings

**SiteGraph can keep every route, essentially free.** `site-map.ts:35` derives routes from the route
map and `:43` derives families from the SiteSpec (`compile-families.ts:51` walks *every* family,
observed or not). The only slot-derived field is `internalLinks`. Linear's site-map already lists
**194 internal links against 8 emitted routes** — the "keep all, slot a subset" shape is effectively
present today. The honest consequence of filtering is a smaller `internalLinks` set.

**SEO is SPLIT, and this asymmetry is currently invisible.** The two stages read *different* route
sources: `seo/source-observe.ts:111` reads `site-observation.json .pages[]` and never touches the
template → a `STRUCTURE_ONLY` route **still appears** in the source audit. `seo/production-plan.ts:172`
is 1:1 over the template's `route-map.json` → it **does not appear** in the production plan. This is
masked today because every Linear layer converges at 8 routes. Any route policy must be reconciled
against `production/run.ts:392-394`, which **throws** when SEO plan routes are missing from the route
map — plan and route map must be regenerated together.

**Measured reduction (the actual prize):**

| Site | Filter | Slots removed |
|---|---|---|
| stripe | `/resources/more/*` 9 routes → 1 representative | 5,301 → 747 (**−47.8%**) |
| stripe | + 4 locale routes + `/cookie-settings` | **−62.8%** |
| stripe | + careers fold | **−66.4%** |
| linear | `/changelog` (1,011 slots = 32.8%) + `/customers/automattic` | **−36.0%** |

**The filter must key on `pageId`, not route** — 18 stripe pages back 20 routes.

---

# Collection Findings

Roughly half of a Collection model already exists, scattered and lossy.

| Field | Status | Exists as |
|---|---|---|
| kind | PARTIAL | `PageFamilyType.sibling-pattern` — a *grouping reason*, explicitly not semantic |
| indexRoute | PARTIAL | `signals.sharedParent` — **dropped at the SiteSpec boundary** |
| detailPattern | **EXISTS** | `inferredRoutePattern` (`/blog/<*>`) on `FamilySpec` — **dropped at the template boundary** |
| representativeRoutes | **EXISTS** | `representativeUrl` / `routes[].representative` |
| discovered count | PARTIAL | `memberCount` / `exactObserved` / `representedOnly` — a **floor, not an estimate** (crawl-capped); **zero pagination detection anywhere** |
| field hints | PARTIAL | one detail page's slots are its field set; no cross-member alignment |
| source relationship | **MISSING** | nothing (`sitespec/dynamic-template.ts` is *interaction* capture, not collections) |
| render policy | PARTIAL | `RouteCoverage` + `renderSourcePageId` already render unobserved members from the representative |

Real collections on disk: nextjs `/blog/<*>` (5 members / 2 observed), `/docs/messages/<*>` (4/1);
stripe f000012 + f000013 are **two families sharing one pattern** `/resources/more/<*>`, split by the
2.0 element-count guard.

**Recommendation: extend `SiteMapSchema` (`recon-template/types.ts:472`)** with an optional
`collections[]`, built in `buildSiteMap` — it already receives both inputs. Derive `indexRoute` from
the pattern string to avoid any SiteSpec change. `estimated` count must stay `null` until pagination
detection exists. Full Blog CMS remains out of scope.

---

# Slot V2 Findings

**Measured reality.** stripe: 9,529 slots / **24,518** bindings (the Task-18 v1 lineage is 24,512
exactly as documented — not drift). linear: 3,079 slots / 9,929 bindings.

**Why page scope dominates** — `grouping.ts:450-485 promote()`, three conjunctive gates:
GATE 1 (`:459`) only header/footer are eligible, so stripe's body 3,470 + main 403 + nav 113 = **3,986
structurally blocked**; GATE 2 excludes locale-prefixed routes; GATE 3 requires the byte-identical unit
on **every** pool page with that landmark. Result: stripe header|page **3,466** vs header|global **1**.
Linear (8 uniform non-locale pages) gets header|page 0 vs header|global 47 — the gates work exactly as
designed, and the stripe outcome is a corpus property, not a bug.

**`slot.scope:'global'` is NOT a usable shared-shell primitive.** It is byte-exact content-tuple
equality, not subtree detection — it worked on linear (131 global) and largely failed on stripe
(150 global against 3,467 page-scope *header* slots).

**Decorative exclusion is substantial and DOM-shape based:** `aria-hidden` (stripe 14,301),
`svg-opaque` (4,371), `role=presentation`, skipped tags, whitespace, `javascript:` — **18,672 excluded
against 9,529 kept**. Repetition ≥16 is *flagged, not excluded* (`editability:"review"` — 2,079 stripe /
1,493 linear).

**Identity: deterministic, but not stable.** Key = `[pagePrefix, section, ...nameParts]`, where
nameParts derive from the **original content text** (`grouping.ts:782-790`). Changed by route path,
landmark move, source copy edits, and collision ordinals — **277/9,529 stripe (2.9%) and 199/3,079
linear (6.5%) keys already carry a `-N` suffix**. `id` is a dense ordinal that renumbers on any
insertion. **An editor must select by `key`, never by `id`.**

**Region evidence: PARTIAL.** Landmark level is complete (`landmark:` on 100% of slots, `groupId` on
6,763/9,529). Sub-landmark is absent: `ancestorIds` *is* computed at `extract.ts:73` and then discarded
in `grouping.ts` — but it is **truncated to 12** (`extract.ts:315/360/385/416`), and a 12-entry
nearest-first chain on a maxDepth-20 page silently omits the top ancestors, which is exactly where
region roots sit. Persisting it would actively mislead.

**Two undocumented lossy boundaries.** `inferredRoutePattern` is dropped at `site-map.ts:44-47`.
And stripe's 2 family-represented routes render but contribute zero slots and appear in no slot's
`.route` (`grouping.ts:291-295` records first-route-only) — **editing one slot silently edits both
routes**, recorded nowhere.

---

# SiteInstance Feasibility

**Verdict: `PROTO_SITEINSTANCE` — right skeleton, wrong scope, four defects. Extend, never rebuild.**

`release-project.json` already holds the four things a SiteInstance needs: site identity
(`source.host/rootUrl`), `ArtifactRef{id,path,hash}` **references** to every upstream run
(`release/types.ts:333-345`), the operator's authored deltas (`resolutions[]`), and per-stage
derivation state. The machinery is already SiteInstance-shaped: every stage runner reads
*current artifact + effective operator pack* and emits a **new** run without mutating inputs
(`stages.ts:65-271`). It copies exactly three things: the resolution pack (inline + a file copy),
`intent.rawIntent`, and the debt register. `routeContent[route].slotValues` already accepts **any**
template slot key, validated against `slots.json` at resolve time (`resolve.ts:74-89`) — per-slot
override of all 3,079 slots is already expressible.

**The four defects:**

1. **Identity is run-scoped, not site-scoped** — `projectId = ${host}-${spec.runId}` (`prepare.ts:98`).
   Two projects exist for linear.app, 22 minutes apart. No registry, no site concept.
2. **Re-prepare destroys authored state** — `prepare.ts:223` hardcodes `resolutions: []`, `:238`
   hardcodes `runs: []`, and `:162` passes an empty applied array to `mergeRequirements`.
3. **Vocabulary is value-substitution only** — no page/region enablement, ordering, or structure.
   Adding it is a deliberate schema-version event (the schema is `.strict()`).
4. **Two divergent lineages after a build** — `acceptedLineage` is frozen while
   `stageStatus[*].artifact` advances; every real consumer reads `stageStatus`.

**And it has never run.** All five `run.json` files across `data/*/release-projects` are
`kind:"prepare"` — **zero resolve, zero build on real data**. That path was proven only in the smoke
fixture and the synthetic canary. Every Tier-2 → Tier-3 arrow in the target architecture is
unexercised code.

## Answers to the six posed questions

- **A. Which artifacts become derived?** Fully derived: theme-run, seo-plan, asset-materialization,
  production-spec, production-build. **Hybrid:** content-run — `slot-values.json` becomes instance
  state, the other ~31 MB stays provenance. **Never instance state** (per-source masters):
  recon-template, theme-extraction adapter, asset-inventory, source-seo-snapshot.
- **B. Content: reference the run, copy the values.** Production reads **exactly one file** of the
  31 MB run — `slot-values.json`, 112 KB, 1,395 flat entries, already an overlay
  (`production/run.ts:234,:375` → `bake.ts:67-85`). Moving it to the instance also resolves a live
  doctrine contradiction: `content-injection/run.ts:216-244` sanctions in-place editing of a lineage
  run while `release/store.ts:13-15` forbids it.
- **C. Theme: `themeId` + `adapterRef` + token overrides.** `generateThemeOverlay(adapter, theme)` is
  pure (`theme/overlay.ts:65`) over a **1,297-byte / 15-token** file, and the theme run already stores
  both inputs as *paths*. Token overrides are safe — the generator validates against the closed
  contract and throws on non-themeable properties. Residual friction: those refs are **absolute
  machine paths**, so a relocated repo breaks a rerun.
- **D. SEO: production-derived, with a thin authored surface.** Routes come from the template's
  `route-map.json`. Only authored: `productionBaseUrl` + the 7 canonical facts + record-only
  `twitterSite`. `og-image`/`organization-logo` are recorded with **no consumption seam**
  (`prepare.ts:233`).
- **E. Assets: reference + override, already built** (`resolve-assets.ts:56-185`). Two carry-forwards:
  `:69` does a full **210 MB `cp` per edit** (fatal for interactive editing), and QA censuses are
  inherited, not re-measured.
- **F. Boundary is already correct and should not move.** ProductionSpec is 5,638 bytes of lineage +
  computed gates with **zero authored fields and no route list**. It needs exactly one added field:
  `{siteInstanceId, instanceHash}`.

## Principle validation: PARTIAL

- "Recon Template = **reusable** immutable master" is **false**. A template is bound to one source
  five ways: manifest pins, route-embedded slot keys, a per-template adapter and inventory, and one
  11.2 MB per-template stylesheet. Corrected: **per-source immutable master**.
- "ProductionSpec = derived build **input**" **inverts the flow**. It is a **receipt** the compiler
  writes — `run.ts` computes `indexabilityGate` from measured facts — and then a lineage anchor the
  release layer reads. Draw no arrow `ProductionSpec → Production Build`.
- The model has **no tier** for the ~240 MB of regenerable-but-not-authored stage runs (content-run
  31 MB + materialization 210 MB + theme artifacts). Name them the instance's **materialized cache**.

---

# Region Feasibility

**No Region concept exists.** The closest is the 5-value `Section` enum, and it fails on measured
data twice: `main` is **94%** of Linear's slots, and the distribution **inverts on stripe**
(main 403, header 3,467). The extractor labels only the outermost header/footer/main and never reads
`<section>`, `<aside>`, or `role=banner`. `groupId` averages 4.8 slots — it selects an anchor, not a
section.

**Recommendation: Option B — a deterministic region compiler**, emitted as a new read-only sibling
artifact.

```
regionId = <scope>#<landmark>/<childPath>
  scope     = "global" when the subtree fingerprint is present on every non-locale route (min 2),
              otherwise the route key
  childPath = element-child index chain from the landmark — NEVER the global nNNNNNN ordinal
              (a single inserted <div> renumbers everything after it; the codebase says so at
              interaction-explorer/types.ts:443-448)
  + a tag-skeleton sha256 recorded BESIDE the id, for drift detection
  + versioned behind regionSchemaVersion
```

Region roots selected by a closed structural rule: direct landmark child, or
`section|article|aside|role=region`, unwrapping single-child wrappers, depth cap 4.

**Nothing needs inventing.** All three primitives ship today at page scope: the child-index path form
(`interaction-explorer/discover-targets.ts:614-626`), the tag:nth path form
(`build-locator.ts:107-120`), and the domain-separated sha256 skeleton hasher
(`verifier/structural-profile.ts:588-626`). **Lifting the skeleton hasher to subtree scope also
repairs the stripe shared-shell failure**, because a skeleton hash is immune to the per-page text
variation that defeats byte-exact equality.

Two constraints that keep this cheap and safe:

- **Ids must be computed from the doc tree, not from persisted `ancestorIds`** (truncated to 12).
- **The slot→region join goes through `slot-bindings.json` `(pageId, viewport, nodeId)`** — which
  needs **zero slot-schema change**, keeping `src/recon-template/types.ts` (25 importers) entirely
  out of the Region subsystem. This is what makes Region parallelizable with Template Factory V2.

**Naming:** call it `PageRegion` or `Block`. Both "region" (dynamic interaction target) and "Section"
(the landmark enum) are already taken.

Invalidated by: a template recompile changing landmark child ordering, re-observation, a
`regionSchemaVersion` bump, or a route-set change (globals only).

---

# Region Disable Impact

Two findings dominate and constrain the design.

1. **Routes → pages is many-to-one** (stripe: 20 routes over **18** `pageSourceId`). Disabling a
   route is not dropping a page, and a region disable is inherently *per-page* — it **silently
   affects sibling routes**.
2. **Dead internal links are already the steady state.** Linear ships **116 out-of-table links on
   `/`** with QA passing; `link-rewriter.ts:89-93` keeps the local path and 404s by design.

| Surface | Effect | Enforcement point | Risk |
|---|---|---|---|
| DOM | region subtree omitted from the bake's app copy | new | — |
| CSS | **one global 11.2 MB file**; dead rules pass (`validate-output.ts:265-270` is one-directional) | none | LOW |
| Interaction | asymmetric cut leaves a live trigger pointing at a removed target; `runtime-template.ts:672`'s declared-region `querySelector` has an **unverified null path**; the compiler throw does not fire (`plan-reconstruction.ts:195` spans all SiteSpec pages) and reconstruction is frozen so the real validator never re-runs | none today | **HIGH** |
| Navigation | link keeps its path and 404s — shipping behaviour; editorially poor since nav anchors are global shell slots | `link-rewriter.ts:12-15` | MEDIUM |
| SEO | cleanest surface: plan routes, sitemap `<loc>`, canonical, og:url, head and deploy manifest all shrink for free — **but order matters**, strip a route after the plan was built and the bake throws | `production/run.ts:392-393` | MEDIUM |
| Assets | copied **wholesale** with classification-only filtering; `sourcePageIds` gives complete page attribution (all 721 stripe entries verified) | `resolve-assets.ts`, `bake.ts` | LOW |
| ProductionSpec / QA | `production/qa.ts:404-410` samples 3 triggers on `/` and needs an observable response — a header-region disable **legitimately fails the build** | `qa.ts` | MEDIUM |

**Minimal cascade rules (R0 is new and load-bearing):**

- **R0** — reference-count pages before pruning; **refuse** a per-route region disable on a shared page.
- **R1** — one disable set, applied once, to the bake's app copy.
- **R2** — regenerate the SEO plan from the filtered route map, together.
- **R3** — refuse any cut that separates an interaction trigger from its target (targets are **never**
  validated today).
- **R4** — links degrade to 404; surface a `dead-internal-link` requirement; **never auto-rewrite**.
- **R5** — do not prune assets in v1.
- **R6** — draw QA samples from the enabled set.
- **R7** *(added by cross-audit)* — a disabled route must be excluded from `collect.ts:258-283`, or it
  becomes an **unclearable blocker**.

---

# Content Generation V2 Feasibility

**The current architecture stretches to V2. No second engine is needed.**

| V2 layer | Status | Maps to |
|---|---|---|
| Brief | extensionRequired | `ContentIntent` (`types.ts:108`) — missing a veracity mode and user-declared tone (tone is currently *invented* by the generator) |
| Site Blueprint | renameOnly | `SiteContentPlan` (`types.ts:148`) — caveat: an output embedded in `generation-result.json`, not a reviewable input |
| Page Blueprint | renameOnly | `PageContentPlan` (`types.ts:135`); an operator-side mirror already exists at `release/types.ts:194` |
| **Region Plan** | **newConcept** | **nothing.** Closest is `GenerationBatch` (right shape, never executed). The one genuinely missing layer |
| Content Unit | existingConcept | `buildContentUnits` (`units.ts:76`) — deterministic and AI-free. Do not re-architect |
| Slot Values | extensionRequired | `slot-values.json` must stay **bare**; the extension is a sibling accounting artifact + provenance |

**Repair granularity — the decisive answer: the smallest regenerable unit today is an arbitrary set
of slot keys, and the merge machinery already works.** `buildRepairRequest` emits one `RepairItem`
per candidate slot (`repair.ts:39-68`), `unitsForRepair` narrows the generator's view to only the
units containing those slots (`:81-84`), and `mergeRepairValues` merges **only** the requested keys,
reporting the rest as `ignoredKeys` (`:91-107`). Whole-site regeneration is **not** required.

Three granularities must not be conflated: **initial generation** forks a whole new run and its
smallest unit is a *route set* (`packet.ts:214`); **repair** is slot-subset and in place;
**manual** editing of any subset costs zero LLM calls (`run.ts:221`).

**The blocker is the trigger, not the granularity.** Repair is reachable only through layout
evidence — `repair.ts:35` returns `undefined` unless `layoutQa.repairCandidates` is non-empty, and
candidates come solely from clipping / sibling overlap / line-count blowup / unslotted-twin findings.
`RepairItem` carries `{slotKey, currentValue, constraints?, observedLineCounts?, overflowEvidence[]}`
with **no reason field**, so "this claim is wrong" or "off-brand" is inexpressible. Cap is 2 iterations.

**Missing for region-level repair:** (a) a region identity; (b) a route/region field on
`RepairRequest`; (c) a non-layout trigger; (d) a content-only entry point (today rewriting three
sentences costs a full Next build plus a Playwright pass over every route); (e) provenance on merge —
sources are merged at the call site and never written back, so post-repair the two files disagree.

**Batching is declared but never executed.** `buildBatches` produces `(scope, route, 40-unit chunk)`
batches — stripe 10, linear 36 — but `cli-content-generate.ts:74` passes **all** units in one call
(linear: 1,202 units / 1,586 slots), directly contradicting the schema's own comment that "one
request never carries the whole site" (`types.ts:237`). **`GenerationBatch` already has
`id + scope + route + unitIds[]` — exactly a Region's contract.** Replacing the document-order
chunker with a deterministic grouper and adding `regionId` is the path; the engine must then actually
loop.

---

# Fact / Synthetic Content Policy

**Current strength: declarative only, near-zero enforcement.** `content-policy-v1` is 7 prose
statements (`policy.ts:19`) restated as 8 instruction strings (`packet.ts:197-206`). `validate.ts`
enforces *safety* — HTML/script injection, control chars, a `javascript:/data:/vbscript:/file:/blob:`
blocklist, an `http/https/tel/mailto` allowlist, unknown-key and out-of-scope failure, review-slot
write protection, image shape, provenance presence — and **no factual category whatsoever**. A
fabricated "10,000 customers" passes with `pass:true`. The blocked-category list exists as prose
**twice, inconsistently**: `policy.ts:46` lists 11 categories; `packet.ts:202` silently drops revenue,
certifications, history and legal claims. Neither is machine-readable; neither is imported by any checker.

**Existing provenance is the same axis, not a new one.** `SLOT_VALUE_SOURCES =
[user-provided, derived-copy, generated-marketing]` (`types.ts:274`), stored as `sources` in
`generation-result.json` only. Extending it is the right move — it is already per-key validated
(`validate.ts:175`) and mirrored into `generation-schema.json`. It is **orthogonal** to `editability`
(which lives on the immutable template and gates *scope*, not origin). Two cautions: `derived-copy`
has no home in a 4-way scheme — the real target is **5-way**; and `UNKNOWN` collides with the
`assigned-and-unresolved` invariant (`validate.ts:194`).

**The "no question bombardment" constraint is already satisfied by shipped code.** Nothing is asked
up front — `content:prepare` takes one `rawIntent` and produces a full draft offline. Questions are
collected from artifacts *after* the draft exists (`collect.ts:366`). The operator pack is explicitly
not an intake form: `release/types.ts:210` literally comments **"Every field optional — this is NOT
an intake form"**. The checklist renders Why / How to resolve / Used on / Expected / Evidence per item
and **collapses any group over 8 into one summary** (`checklist.ts:104-115`) — verified on the real
artifact: **378 requirements → a 238-line checklist**, where 84 replacement-images render as one
section. **Content V2 must emit into this seam, not build a second one.**

**But content needs-input does not gate production.** Unresolved slots map to `external-url` /
`business-fact`, both **`high-value`** in `SEVERITY_POLICY` (`release/types.ts:456-468`). Linear's
**117 unresolved content slots contribute 0 of the 88 blockers** (font-license ×2, production-domain
×1, replacement-image ×84, source-brand-asset ×1). All 91 brand-leak warnings collapse into one prose
string at `collect.ts:520-526`, literally commented `---- warnings (never blockers) ----`. An operator
can reach `PRODUCTION_READY` with unanswered factual questions and source copy on the page, provided
it lacks the source host's name.

**Verified-vs-synthetic seam (design only, implement nothing):** add
`veracityMode: 'verified-business' | 'synthetic-site'` to `ContentIntentSchema` — **one question, in
the Brief**, hashed into `intentHash`. It selects a *policy variant* keyed by `policyId`, so the
existing `manifest.policyId/policyVersion` audit trail records which ruleset ruled. `verified-business`
forbids `SYNTHETIC_FACT` and promotes the resulting requirements to `release-blocking` in the one table
that already encodes severity with rationale; `synthetic-site` permits it behind an explicit
acknowledgement.

---

# Accuracy-first Generation & All-Core-Slot Accounting

**Pipeline feasibility:** Site planning → Page planning → Region writing → Slot writing →
Cross-page consistency → Browser visual QA → Brand QA → Targeted region repair is reachable as an
**extension**, given a Region Plan and a non-layout repair trigger. The batch key becoming a Region is
the single highest-leverage change: it unlocks region repair, real batching, cross-page consistency
scoping, and per-region telemetry at once.

**Accounting conflict: the 7 proposed statuses collapse two axes.** Today three disjoint
representations partition a run: `sources[key]` (origin), `unresolved[]` (disposition), `imageBriefs[]`
(image-only disposition). PROVIDED / GENERATED / SYNTHETIC are **origins**; PRESERVED / REMOVED /
REVIEWED / UNRESOLVED are **dispositions**. One enum makes "a preserved value whose origin was the
source site" unrepresentable — exactly the measured 133-slot case. **Use two fields** (`origin` +
`disposition`), with the invariant that every in-scope slot has exactly one of each. Rename `REVIEWED`
to `HUMAN_APPROVED` — it collides with `editability='review'`, a pre-write scope flag.

**Storage: a sibling `slot-accounting.json` in the content run**, written by `writeReviewArtifacts`
(`run.ts:125-184`) next to `validation.json` / `brand-leak.json`. The template is immutable and feeds
multiple runs; `slot-values.json` must stay bare because the app consumes it verbatim;
`generation-result.json` is provider output never rewritten on hand-edit. A derived sibling regenerates
idempotently, like the files already there — and the release layer already reads
`content-runs/<run>/report/*.json`.

**Gate hook:** `collect.ts:366` (swap `unresolved[]` for slot-accounting) → `release/types.ts:431` →
`requirements.ts:209` → `gate.ts:37`. The build-time proof already exists at `production/qa.ts:314`
(`content-proof:<slotKey>` asserts injected values are literally in the served HTML) — extend that
sampler to assert coverage.

**The headline number: the target statement is not met, and the gap is measurable.**

| | stripe canary | linear pilot |
|---|---|---|
| in-scope slots | 566 | 1,586 |
| assigned / unresolved / image-briefed | 361 / 64 / 8 | 1,395 / 117 / 73 |
| **slots with NO status of any kind** | **133 (23.5%)** | **1** |
| review slots never in scope, never brand-scanned | 2,079 | 1,493 |
| brand-leak warnings (all `warning`, 0 `blocker`) | 66 | 91 |

Stripe's 133 break down as text 81 / url 26 / image 26. **Nothing in the pipeline computes or reports
this number** — `report.ts:99-109` never does in-scope-minus-accounted. Linear's 1 is generator
discipline, not a stronger contract; the contract is identical.

**Customer-facing evidence: PARTIAL.** Sufficient: aria-hidden / presentation / svg-opaque candidates
are excluded *before* slotting, and text/image slots carry measured geometry (2,334/2,441 text slots
have a desktop box; 54 have neither viewport — a strong not-rendered signal). Insufficient: **url slots
have zero constraints (443 = 14%)**; dynamic-template occurrences carry no geometry at all (262 linear /
1,921 stripe bindings); `TextViewportReferenceSchema` records w/h/lineCount but **no x/y**, so fold
position is unrecoverable; role is 87.4% generic; the only section axis is 94% `main`. **Cheapest
missing signal:** persist a per-binding rendered box (x, y, w, h) per viewport at compile time —
layout-qa already measures exactly this shape but never persists it.

---

# Cost Telemetry

**There is no real LLM call site in the repository.** No vendor SDK (`rg anthropic|openai|@ai-sdk`
over `src/` hits only comments). `FakeContentGenerator` is the only name `resolveGenerator` accepts.
100% of real content came through the out-of-process manual seam (`providers.ts:214`); both the stripe
and linear runs record `generator = {name:"claude-code-operator", model:"claude-fable-5"}`.

Captured today: **provider ✓, model ✓** (optional, self-reported). **✗** for requestCount, inputTokens,
outputTokens, cacheTokens, retries, cost, and timing (`cli-content-qa.ts:202` prints elapsed seconds and
discards it). Route is run-level only; region does not exist; stage exists in memory and is never persisted.

**Recommended insertion point — two halves, one record shape:**

1. **Decorate the return of `resolveGenerator`** (`providers.ts:239`) rather than returning it raw —
   covers both in-process call sites with **zero call-site changes**.
2. **Add an optional `telemetry` field to `ContentGenerationResult.generator`** (`types.ts:318-323`),
   persisted verbatim by `ingestGenerationResult` — the only way an out-of-process operator session's
   tokens and cost can ever be recorded.

Record shape: `{seamId, provider, model?, stage, callIndex, requestCount, unitCount, slotCount,
routes[], batchIds[], startedAt, elapsedMs, retries, outcome, usage?{input, output, cacheRead,
cacheCreation, costUsd}}` → append-only `<runDir>/telemetry.json` + a manifest summary. Every numeric
optional, so the manual seam omits honestly.

**One helper covers all three AI seams**, which are structurally identical named-object-with-one-async-
method factories: `ContentGenerator` (`providers.ts:49`), `UnknownInteractionAnalyzer`
(`interaction-patterns/ai/types.ts:212`), and `ResolutionParser` (`release/nl.ts:20`). Note that
`analyzer.ts:119-129` swallows provider errors into per-case `status:"error"`, so a wrapper is the only
place transport failure becomes countable.

---

# Brand Sanitization

## Surface matrix

| Surface | Status | Owner |
|---|---|---|
| visible text | **partial** — warning only | content-injection |
| slot default value | **partial** — warning only | content-injection |
| slot injected value | handled (0 real hits) | content-injection |
| URL / href | **partial** — fires only when `urlKind==='external'` **and** value === default | content-injection |
| page title / meta description / canonical | handled | seo |
| Open Graph / Twitter meta | handled (gated on `status==='known'`) | seo |
| JSON-LD | handled; source identity harvested as *forbidden* | seo |
| logo image asset | **partial** — the `brand-filename` rule fired **0×** on both corpora | assets |
| other images | **partial** — 294 `src=` still at the linear CDN in the built site | assets |
| image alt | **partial** — scanned, same warning-only path | content-injection |
| inline SVG `<text>` | handled (Task 19.1) | recon-template |
| **inline SVG path mark** | **MISSING** — opaque `node.v` | recon-template |
| **inline SVG attributes** | **MISSING** — `aria-label="Linear"` ×208, `<symbol id="Linear">` ×128 | recon-template |
| raw HTML / `dangerouslySetInnerHTML` | **MISSING** — one site, SVG-only | recon-template |
| CSS `content` / `url()` | handled — **0 external `url()`** in an 11.2 MB stylesheet | assets |
| font family names / script ids | handled — **0 external `<script src>`** | assets / reconstruction |
| asset filenames | handled — `/media/<sha256>.<ext>` erases names | assets |
| sitemap / robots URLs | handled | seo |
| internal link targets | **partial** — 1,122 broken internal links measured, not gated | seo |

## The measurement defect

`bake.ts:264` counts only `https://${host}` for hosts in `residualHosts`, itself derived from
*network requests* (`run.ts:243-247`). It misses hrefs, visible text, aria-labels and symbol ids.
Ground truth from the real packages: **stripe 11,061** `stripe.com` occurrences across 15 subdomains
against a reported 430; **linear** 782 URLs, 208 aria-labels, 128 symbol ids, 89 plain-text "Linear"
in `index.html` alone, 294 `src=` at the source CDN. Compounding it, `qa.ts:436-443` filters observed
hosts against `knownResidualSourceHosts` — for Linear, `["linear.app","webassets.linear.app"]` — so
the assertion is **vacuous by construction**. `sourceHostMentionsInHtml` is computed at `qa.ts:216`,
returned at `:459`, and has **zero consumers anywhere in `src/`**. Independently corroborated by
Specialist G from a different direction: `smoke-production.ts:266` asserts
`residualSourceUrlOccurrencesInSite === 1` *exactly*, while linear reports `sourceHostAbsolute: 0`
alongside 316 real mentions.

**What is NOT broken, and must not be overstated:** the network-request blocker path is honest
(60 linear / 4 stripe residuals → 84 blocking `replacement-image` requirements), head/SEO isolation is
independently verified clean, content-hashed media erases source filenames, and the gate is **not
falsely green** — `source-brand-asset` plus the 84 blockers hold linear at `INPUTS_REQUIRED`.

## SVG brand mark — feasible, right seam

`compile-node.ts:460-477` emits `{n: nodeId, t:'span', p:{className:'wr-svg-host'}, v: <whole svg
markup>}`. Identity is the same `nodeId` every binding uses, and **`aria-label`, symbol ids and all
root attributes live *inside* `node.v`** — so a whole-string host swap fixes the attribute leak for
free. Additive member on the `target` enum at `recon-template/types.ts:349`. Layout risk **LOW–MEDIUM**:
the wrapper is `display:contents`, so preserving class + `data-wr-node` + `viewBox`/width/height keeps
the box byte-stable. Bare *removal* is the risky variant — prefer a same-sized placeholder. Caveat:
this seam is inside the exact-reconstruction emitter, which is on the read-only list.

## Production blocker recommendation

**A new release-blocking requirement kind `brand-leak`** — an additive member at
`release/types.ts:86` plus `SEVERITY_POLICY` at `:444`, collected from the existing brand-leak report
by editing the one line at `collect.ts:520-526`. Because `requirements.ts:47-49` already matches by
`slotKey`, an operator supplying replacement copy resolves it with **zero new plumbing**.

**Not a QA assertion** — `qa.ts:436-443` makes the source host unfalsifiable, asserting
`sourceHostMentionsInHtml === 0` would flip both pilots out of any ready state, and
`smoke-production.ts:266` asserts residual `=== 1` exactly. **Not a gate rule** — it would deadlock the
way `source-brand-inline-svg` does today, whose only listed resolutions cannot unlock indexable
production (acknowledgements still block, `requirements.ts:209-216`), meaning **any source with an
inline-SVG logo is structurally unable to reach `PRODUCTION_READY` today**.

## Asset / SEO reality vs reports

**Verified exactly:** linear 378 requirements / 88 blocking; stripe 278/278 fetched and 31→4 residual.
**Drift:** 278/278 and 31→4 are **stripe-only** (linear is 155/155, 206→60); linear carries **6**
carried blockers, not 7; linear's "measured fallback cost" is **unmeasured** (`appReflow: null`) while
`collect.ts:466` still emits "measured fallback stacks render"; `open-license-verified` is
**unreachable** (`fonts.ts:200` hardcodes the other arm); the `brand-filename` logo rule fired **0×**;
and **no production-mode SEO plan has ever been generated** — all five plans on disk are preview, so
every `https://${domain}` canonical/sitemap/robots branch is unverified.

**Production bake: no incremental path.** `patch.ts` is five one-shot source-text patches applied to a
fresh copy *before* `next build` — nothing in it can update a built artifact. One content-value change
re-runs 4 of 7 stages plus a full bake, dominated not by Next (2.8 s linear / 3.7 s stripe) but by a
218-file app copy, **155 media files / 209.7 MB**, and two full-text passes over every exported file.
Additive fix seams exist (restore the `slot-values` overlay indirection for preview mode, or a
per-route re-export that skips `copyMedia` when assets are fresh) and touch no frozen stage.

---

# Visual Editor Feasibility

**FEASIBLE with zero changes to any generated file.** (Cut tonight for capacity, not architecture.)

- **Preview.** `static-server.ts` is **not** a preview server — it is a code generator emitting
  `server.mjs` into the deployment package. The real preview path is a live `next start`
  (`parity-qa.ts:114-173`), and `pnpm content:preview` is already a long-running human preview that
  prints its baseUrl and blocks on SIGINT. **Iframe preview works today with no new code.**
- **Same-origin.** Not by default (differing port). Recommended: **postMessage** — inject the selection
  script into the preview at the serve boundary, hit-test inside the iframe against `data-wr-node`, post
  the slot key up. Works cross-origin with zero route collision. True same-origin is a later option
  (the route table is a known finite list).
- **Overlay hook.** `seo/serve.ts:81-84` already splices arbitrary HTML before `</head>` — the exact
  operation needed, in production-tested code. It is **structurally prevented from leaking to
  production**, because the bake path enumerates exactly four layers and an editor layer simply gets no
  bake step.
- **Viewports.** Both render into **one document** as `.wr-variant[data-wr-viewport="desktop"|"mobile"]`,
  media-query switched, inactive `display:none`. **Desktop/mobile toggle = resize the iframe.** Canonical
  sizes already fixed at 1440×900 / 390×844 DPR3.
- **Slot ↔ DOM: already complete.** `data-wr-node` is on every element (`compile-node.ts:249`), and
  `slot-bindings.json` carries `{slotId, pageId, viewport, surface, nodeId, target, …}`. The selector is
  literally the one QA already builds (`parity-qa.ts:858`). DOM→slot is an in-memory inversion.
  **Add no new attribute** — `data-wr-slot` would flip parity risk LOW→MEDIUM against
  `parity-qa.ts:245-248`, which compares the `{tag, data-wr-node}` *sequence* between clone and template
  app, precisely the asymmetry it exists to catch. The `data-wr-viewport` qualifier is mandatory.
- **Portals are selectable**, in a parallel namespace: click `[data-wr-node=trigger]` → region mounts →
  select `[data-wr-dyn-node=tNNNNNN]`. Only after the trigger is activated.

**V1 scope: 10 existing / 7 small / 1 large.**

- *existingBackendSupport (10):* page switch, desktop/mobile preview, rendered preview, text editing\*,
  URL editing, image replacement, logo replacement, theme selection, save, QA trigger.
- *smallExtension (7):* element highlight, slot selection, Page ON/OFF, safe theme token edit,
  AI rewrite (scoped to *slots*), revision, undo.
- *largeMissingSystem (1):* **Region ON/OFF** — slot `.type` is a closed `text|url|image` set with no
  visibility notion, `groupId` is field- not section-granularity, and hiding a subtree has no parity or
  bake semantics.

\* **Two operational unknowns that must be measured before an editor is built, not during:** whether an
injected `<script>` before `</head>` survives React 19 hydration (strong precedent from the title/RSC
rewrite, but untested for a script element), and restart latency — the slot contract is module-memoized
(`app-templates.ts:109,155-158`) and pages are cached (`:411-419`), so **every value change needs a
`next start` restart**, not a rebuild. There is no hot reload.

**Placement.** Not a monorepo — `pnpm-workspace.yaml` has no `packages:` key. **Load-bearing discovery:
generated apps have no `node_modules` and deliberately resolve upward to root** ("pinning the root to
the app directory would cut that lookup off and the build could not find Next.js itself"). Workspace
conversion is therefore **HIGH risk** — `npx --no-install next build|start` depends on that upward walk.
Recommended: `editor/` at repo root with its own `package.json`/`tsconfig` and no `node_modules`,
resolving upward exactly as every generated app already does, plus `src/editor/` for services and
`src/cli-editor.ts`. **Zero workspace change, zero new dependencies.** Do not add the editor app to the
root `tsconfig.json` (`tsc --noEmit` would break — no `jsx`, `types:["node"]`).

---

# Editor Write Path

Never hand-edit: the template app, the reconstruction app, generated CSS, the production package —
all carry "Generated — do not edit" banners and are enforced by the rule that "a content run never
writes a byte into anything it read".

**One write path, resolving a three-way disagreement between specialists:**

```
Editor
  → SiteInstance.authored.slotValues          (AUTHORITATIVE; validated against slots.json
                                               exactly as resolve.ts:72-96 already does)
  → contentStageRunner merges over generation-result.json   (merge base UNCHANGED — correct today)
  → content-runs/<run>/slot-values.json        (DERIVED; stays BARE — the app consumes it verbatim)
  → derived preview (serve boundary)  |  derived build (bake)
```

Verified: `contentStageRunner` (`stages.ts:66-113`) takes its merge base from `generation-result.json`
and its overrides from `context.effective.routeContent[*].slotValues`; it never reads
`slot-values.json`. Production reads exactly that one file (`production/run.ts:234,:375`). So the
"silently discarded hand-edit" is a **storage bug, not a merge bug** — the merge base is right.
Hand-editing a lineage run is deprecated; it is already a live doctrine contradiction
(`content-injection/run.ts:216-244` sanctions it, `release/store.ts:13-15` forbids it) and must at
minimum warn that the edit will not survive a rebuild.

**Three services, not five.** `SiteService` (wraps `release/store.ts:54-95` + `content-injection/run.ts`),
`PreviewService` (wraps `parity-qa.ts:114,128` + the three proxies), `RevisionService`. **Rejected:**
`TemplateService` — a 30-line directory read, fold into a registry module; `BuildService` — `release:build`
already exists and wrapping it adds no capability.

**Filesystem repository: YES**, and largely already built. `release-project.json` is the mutable
aggregate; `runs/<id>/run.json` is append-only — exactly the SiteInstance + Revision split. Two caveats:
`data/` is gitignored so any registry is machine-local, and **no atomic writes or locking exist anywhere
in the repo**.

---

# Revision

**Nothing exists** — `rg` finds only incidental prose. But every primitive does: content-hashed
`acceptedLineage` (7 stages, sha256 each), `hashFile`, immutable run dirs, and the strongest precedent,
**`iterations/q000…q00N/`** — a shipped numbered append-only chain where "a CORRECTED clone is generated
inside `iterations/q00N/`, never on top of the baseline" (`reconstruction-qa/store.ts:34-35`).

**Design: a revision is an immutable JSON *pointer record*, never a byte copy.**

```
{ revisionId, parentRevisionId, createdAt, summary,
  lineage: <verbatim acceptedLineage>,
  editState: { slotValues, themeId, assetResolutions },
  hash }
stored at  release-projects/<projectId>/revisions/<id>/revision.json
head pointer on the aggregate
```

**Restore is forward-only**: re-point lineage, then write a *new* revision whose parent is the current
head. `undo === restore(head.parent)`. This fits immutable runs perfectly — where new bytes are genuinely
needed (a replacement image), `applyAssetResolutions` already derives a new run without touching the base.
Cost is **O(slotValues), not O(site)**: a 210 MB asset run is referenced, never duplicated. No branching,
no merge.

---

# Template / Site Library

**Filesystem index is sufficient — no database.** Of 16 required fields, **13 already exist** and 3 are
additive:

- *Template* (from `manifest.json`): `templateId` ✓, `source` ✓, `routes` ✓, `createdAt` ✓,
  `limitations` ✓, `counts` ✓ — **only `preview` missing** (derivable from 1,384 existing PNGs).
- *Site* (from `release-project.json`): `projectId` ✓, lineage `templateId` ✓, `releaseState` ✓,
  `updatedAt` ✓ — **`name` and `preview` missing**.

**Recommendation: no index file.** Enumerate by scan + lexical sort — the shipped idiom
(`reconstruction-qa/load-inputs.ts:184-258`). No index-of-runs or "latest" pointer exists anywhere in the
repo, and `"latest"` is explicitly called out as something to avoid (`app-template.ts:11`). Two honest
caveats: `data/` is gitignored so any registry is machine-local, and 9 smoke suites write
`data/.smoke-<name>-<pid>` dirs that a namespace enumerator will see mid-run.

---

# Site Factory Controller

**It already exists as `src/release/graph.ts` + `stages.ts`** — a stage DAG with pluggable runners. A
second controller would duplicate `smoke:release`.

Real and cited: `STAGE_DEPENDENCIES` (`graph.ts:25-38`), `STAGE_ORDER`, `downstreamOf()` (`:65`),
`RESOLUTION_FIELD_IMPACTS` (`:52-59`), content-hash freshness with per-stage resolution slices and
operator-file byte hashing (`freshness.ts:34-101`), drift detection (`:151-160`), a staleness-cascade
fixpoint (`build.ts:112-127`), mid-build re-propagation (`:256-280`), dry run (`:146-161`), crash-safe
per-stage save (`:252-255`), failure records (`:316-338`), target-mode blocking (`freshness.ts:199-212`),
derived state with no writable ready flag (`gate.ts:5,27-50`), and a pluggable runner seam
(`build.ts:60-61,176`).

**Verdict: can host the controller for content→production; cannot for discovery→template.** Three
concrete blockers: frozen roots have **no runner and refuse on drift** (`build.ts:163-172`);
`auxiliary.siteSpecDir` is **hardcoded `null`** (`prepare.ts:213`, null on disk) so `assets:inventory`
can never re-run; and the only entry point demands an already-built spec + package (`prepare.ts:79-104`).
**In short: release can finish a site but can never create one.**

## Invalidation matrix (current code)

| Change | Must re-run | Supported today | Evidence |
|---|---|---|---|
| content edit | content → theme, seo → production | **YES** | `graph.ts:55-56`, cascade `build.ts:112-127`. **Gap:** assets not invalidated |
| theme edit | theme → production | **NO** | `THEME_SELECTION_IMPACTS` (`graph.ts:62`) has zero engine call sites; no `theme` field in `ProductionResolutionSchema`; theme files live outside every hashed dir |
| image / asset edit | assets → production | **YES** | `graph.ts:57-58`, file-byte hashing. **Gap:** QA census inherited; og-image/logo have no consumption seam |
| region OFF | — | **NO — concept absent** | nearest: compile-time slot `exclude` overrides, a frozen-stage input |
| page OFF | — | **NO — concept absent** | routes closed in the frozen template; omission is a release-blocking `content-route` defect |
| domain edit | seo → production | **YES** | `graph.ts:53`; flips target mode and blocks production; cannot shortcut `PRODUCTION_READY` |
| business facts | content, seo, production | YES | `graph.ts:54`; `twitterSite` is record-only |
| source site changed | everything | **NO** | `build.ts:167-171` refuses; only path is a full `e2e:reconstruct` |
| acknowledgement / note | nothing | YES (by design) | still blocks indexable |

**Theme-edit fix (3 additive edits):** add a `theme` field to `ProductionResolutionSchema`; add
`theme: THEME_SELECTION_IMPACTS` to `RESOLUTION_FIELD_IMPACTS` (converting dead code to live);
add the theme slice to `computeStageInputsHash`. **Do not delete the constant** —
`scripts/smoke-release.ts:1210` asserts its value.

---

# GED-D / E / F / G

| ID | Verdict | Core code | Fixture on disk |
|---|---|---|---|
| **GED-E** proxy entity-title | **YES** | `seo/serve.ts:77-79` literal `split/join` | `domainchecker/production-seo-plans/2026-08-19T07-23-36-101Z/report/qa.json` |
| **GED-G** per-file residual list | **YES** | `cli-assets-qa.ts:57` `?? ["/"]` | `stripe/asset-materializations/2026-08-19T05-54-55-204Z/report/network-qa.json` |
| **GED-D** repair non-convergence | **YES, ORDERING CONSTRAINT** | `providers.ts:75 Math.max(4,target)`; `repair.ts:34-35` | byte-identical iteration pairs on **two** sites |
| **GED-F** body-anchor neutralization | **YES, ORDERING CONSTRAINT** | absence — `rg neutraliz\|rewriteAnchor` → **0 hits** | stripe `qa.json` 4,424; linear 316 |

- **GED-E** is the natural warm-up and the best-isolated of the four: **both halves of the fix already
  exist in-repo** (`assets/rewrite.ts:17-24 rewriteVariants`, `bake.ts:295-297 escapeForTitle`).
  Production is genuinely closed since Task 23. **Stripe's 0-failure SEO QA is a sampling artifact** —
  it has an entity-bearing title on a route that was never proxied. The blind spot that let it survive:
  `smoke:seo` §7 uses a pure-ASCII fixture title (`"Root Original Title"`). Land it with a negative
  assertion covering an entity-escaped title.
- **GED-G** — the data already exists (`network-qa.ts:21-40` captures per-route `sourceUrls`); it is a
  scope + join gap. **Task 26 did not fix it** — it hand-passed `--routes` and joined in prose;
  `technical-debt.json` still carries it open. Expect to update the hardcoded `residual=5` expectations
  at `smoke-production.ts:423/:442`.
- **GED-D** — take **only the no-progress guard** now; the provider length-awareness half is subsumed by
  Content Generation V2 and patching it separately means fixing code about to be replaced. **Blast radius
  warning: changing `fakeText` changes every generated string** — `smoke:seo`, `smoke:release` and
  `smoke:production` all depend on literal fake output.
- **GED-F** — this **is** the Brand Sanitization subsystem, not a standalone patch. Sequence it **after**
  Content V2 and **after** Region/Page ON-OFF, both of which change which routes are uninjected (the root
  cause). **Fix at bake, never in the template compiler** — `grouping.ts:625 defaultValue: unit.href` is
  under frozen 46/46 parity. Hard blocker: `smoke-production.ts:266` asserts
  `residualSourceUrlOccurrencesInSite === 1` exactly, and linear shows `sourceHostAbsolute: 0` against
  316 real mentions — **the existing detector is insufficient**. Ship **detector-only** tonight, with any
  neutralization opt-in and defaulting OFF.

---

# Git / Working Tree

**Verdict: `NEEDS_REVIEW_BEFORE_CHECKPOINT`** — for deliberate-decision reasons, not blocking ones.

- Branch `main`; HEAD `2777b41` — **the only commit**, 18 tracked files.
- Working tree: 6 modified, 2 deleted, 125 untracked paths = **501 real files, 83,336 LOC**.
- **`data/` IS gitignored** — verified via `git check-ignore -v data/stripe.com` → `.gitignore:14`.
  `data/` is **18 GB** (stripe 12 G, linear 3.2 G, nextjs 1.7 G). **No gigabyte risk.**
  `node_modules/` (394 M), `tmp/`, `.env`, `.claude/`, `prompt`, `prompt2` all correctly ignored.
- **Real commit size: 47 MB / 501 files** — 40 MB is 93 evidence PNGs; 6.5 MB is 330 `.ts` + 37 `.md` +
  37 `.json` + 3 `STATUS`. No `node_modules`, `.next` or `dist` in the committable set.
- **Secrets: CLEAN.** `.env` is ignored and holds one key *name*. A scan of every committable non-PNG
  file for `fc-*` / `sk-ant-*` / `sk-*` / `AKIA*` / `ghp_*` returned **0 matches**. Only three env vars
  are read anywhere: `WR_SLOT_VALUES_FILE`, `PORT`, `PATH`.
- Both deletions are benign: `src/observer/.gitkeep`, and a byte-identical 5,333-byte rename of the
  Korean doc (whose new name carries a doubled `.md.md` extension worth fixing in the same commit).

**Why review rather than "safe":**

1. No revert point, no bisect, no stash net for a multi-agent overnight program. Task 26's own auditor
   already lists "workspace commit" as a carry-forward.
2. **Evidence-loss trap — `.gitignore:26 (*.log)` excludes all 90 regression logs.** The entire measured
   basis for "1,794 checks" would not be committed and dies to a `git clean -xfd`. Only 3 extension-less
   `STATUS` files survive.
3. 40 MB of PNGs are genuine cited evidence but permanent once in history — decide deliberately, not via
   a blanket `git add -A`.

**Recommended pre-steps (recommendation only — not run, and this audit performed no git operation):**
decide the PNG question explicitly; negate the `*.log` rule for `docs/result/handoffs/**` (or convert the
per-suite tails to extension-less summaries); checkpoint on
`checkpoint/pre-overnight-2026-08-26`, **not on main**, so the single-commit history stays intact if the
program is abandoned.

---

# Test Impact

**Baseline verified exactly: 17 suites / 1,794 checks / 0 failures**, independently recomputed from
`docs/result/handoffs/26C-regression-logs/` (2026-08-25T23:56:32Z → 2026-08-26T00:14:43Z, 18 m 11 s,
typecheck exit 0). Task 25's 1,755 also matches exactly. My stored memory's "16 suites / 1,671" is the
stale Task-24 figure. Task 23's "1,656" is not reproducible from any log; the nearest set is 1,671 and
the +15 is legitimately reconciled by Task 24's corrections.

Per-suite: verifier 81, selector 81, multi-observer 62, interaction-detector 92, interaction-explorer 108,
interaction-patterns 88, sitespec 257, reconstruction 217, reconstruction-qa 134, e2e 130,
recon-template 64, content-injection 68, theme 47, seo 79, assets 117, production 85, release 84.

**Wiring is clean.** `scripts/smoke-playwright.ts` **exists** (961 B, and is the one smoke script tracked
in HEAD). All 18 smoke files present, all 18 wired, all 37 CLIs wired — **zero drift**. `smoke:playwright`
is excluded from the baseline by standing convention (the only suite needing the public internet).

**Critical gap: no suite validates its own check count** (`rg EXPECTED_CHECK|TOTAL_CHECKS` → 0 matches).
A suite could silently lose 40 checks and still exit 0 and print PASS. **A per-suite count diff against
the baseline table must be a mandatory gate step**, not an optional one.

**Time is concentrated:** e2e 614 s + reconstruction-qa 145 s + interaction-explorer 93 s = **78%**.
The 7 offline suites cost ~13 s for 640 checks — the right fast inner loop. Parallelism is **safe**:
every in-repo server binds an ephemeral port (`listen(0)`; `qa.ts:72 --port 0`).

**Five new suites only** — `smoke:collection`, `smoke:site-instance`, `smoke:visibility`,
`smoke:revision`, `smoke:editor-contract` (contract only, not UI E2E). **No** new suite for Template
Factory V2, Slot policy, Region model, Content V2, Brand Sanitization, Template/Site Library, Site
Factory Controller, or cost telemetry — each has an existing owner.

| Subsystem | Existing suites at risk | New suite |
|---|---|---|
| Template Factory V2 / Route Scope | recon-template, content-injection, theme, release, reconstruction | no |
| Collection Foundation | recon-template, release | **smoke:collection** |
| Slot policy | recon-template, content-injection, theme, release | no |
| SiteInstance | release, production | **smoke:site-instance** |
| Region model | recon-template, content-injection | no |
| Region/Page ON-OFF | release, production, seo, recon-template | **smoke:visibility** |
| Content V2 | content-injection, theme, release | no |
| Brand Sanitization | content-injection, assets, seo, release | no |
| Visual Editor | recon-template | **smoke:editor-contract** |
| Revision | release, content-injection | **smoke:revision** |
| Template/Site Library | theme | no |
| Site Factory Controller | release, e2e, production | no |
| Cost telemetry | content-injection, release | no |

**Two carried defects survived only because of fixture blind spots**, so "suite passes" is weak evidence
for those paths: `smoke:seo` §7 uses an entity-free ASCII title (why GED-E survived), and no suite
exercises `assets:qa` with a multi-route census (why GED-G's `['/']` default went unnoticed).

---

# Conflict Matrix

| Pair | Level | Reason |
|---|---|---|
| SiteInstance ↔ ProductionSpec | **LOW** | Boundary already correct: 5,638 bytes of lineage + computed gates, zero authored fields, no route list. Gains exactly one field. Only care: do not redraw it as a build *input* |
| SiteInstance ↔ Content Run | **HIGH** | The content run holds the only authored bytes production consumes, and two mutually exclusive editing doctrines govern one file (`content-injection/run.ts:216-244` vs `release/store.ts:13-15`). Getting it wrong silently discards operator work on every rebuild |
| SiteInstance ↔ Theme Run | **LOW** | Already a pure function of two path refs; the instance needs only `{themeId, adapterRunId, tokenOverrides?}`. Residual: those refs are absolute machine paths |
| Region ↔ Exact Reconstruction | **LOW** | The compiler reads `pages/p*.json` and emits a sibling; changes no emitter and no schema. Stays low **only while the compiler has no consumer** |
| Region OFF ↔ Interaction | **HIGH** | An asymmetric cut leaves a live trigger pointing at a removed target; `runtime-template.ts:672` has an unverified null path; the compiler throw does not fire and reconstruction is frozen so the real validator never re-runs. `production/qa.ts:404-410` samples 3 triggers on `/`, so a header-region disable legitimately fails the build |
| Page OFF ↔ Navigation | **MEDIUM** | Links keep their path and 404 — shipping behaviour, 116 tolerated per linear page. Functionally safe, editorially poor: nav anchors are global shell slots. Fix is a pure exact join to a `dead-internal-link` requirement; never auto-rewrite |
| Page OFF ↔ SEO | **MEDIUM** | Cleanest surface — everything is a straight map over the route list and shrinks for free. One hazard is **order**: strip a route after the plan was built and the bake throws (`production/run.ts:392-393`) |
| Content V2 ↔ Content Injection v1 | **LOW** | Every V2 layer maps onto an existing concept; only Region Plan is new. Caveat: making `GenerationBatch` real means adding an execution loop that has never run |
| Brand Sanitization ↔ Asset policy | **MEDIUM** | They overlap on what counts as brand. The `brand-filename` rule fired **0×** on both corpora, so every protected logo was protected by a different rule; and the residual census Brand would trust is the one GED-G proves is route-scoped to `['/']`. Sequencing fixes the file conflict, not the shared measurement basis |
| Brand Sanitization ↔ SVG limitation | **HIGH** | The logo ships as opaque `<path>` geometry inside `node.v`, plus 208 aria-labels and 128 symbol ids that **no module detects**. `source-brand-asset` is release-blocking and its only resolutions cannot unlock indexable production — so **any source with an inline-SVG logo cannot reach `PRODUCTION_READY` today**. The right seam touches the exact-reconstruction emitter, which is read-only |
| Collection Policy ↔ SiteGraph | **LOW** | `buildSiteMap` derives routes from the route map and families from the SiteSpec, never from slots. Verified: linear's site-map names 194 link targets against 8 emitted routes. One honest consequence: a smaller `internalLinks` set |
| Collection Policy ↔ SEO observation | **MEDIUM** | The two SEO stages read **different** route sources, so a STRUCTURE_ONLY route stays in the source audit and vanishes from the production plan. Invisible today because every linear layer converges at 8. Must be reconciled against the `production/run.ts:392-393` throw |
| Editor ↔ generated app | **LOW** | The editor script arrives through a serve-boundary proxy performing the identical splice `seo/serve.ts:81-84` already ships; the on-disk app parity QA builds stays bit-identical. Stays LOW only by forbidding any new attribute |
| Editor ↔ hydration | **MEDIUM** | A `<script>` in `<head>` is materially different from a `<title>` text swap and is untested against React 19. Compounded by no hot reload — every value change needs a `next start` restart. Both must be measured before an editor is built |
| Revision ↔ artifact immutability | **LOW** | A consequence of the existing rule, not a compromise with it: lineage is already addressed by `{id, path, sha256}`, and the one case needing new bytes is already solved by `applyAssetResolutions`. Storage is O(slotValues). Single caveat: `writeJson` is non-atomic with no locking |
| Library ↔ filesystem namespaces | **LOW** | 13 of 16 fields exist; the 3 missing are additive. Scan + lexical sort matches the shipped idiom. Caveats: `data/` is gitignored so any registry is machine-local, and 9 smoke suites write `data/.smoke-*` dirs an enumerator will see mid-run |

---

# File Ownership Plan

**The 27 single-owner files** (no two agents may hold any of these concurrently):

```
src/recon-template/{types,compile,site-map}.ts
src/release/{types,store,prepare,graph,stages,collect,freshness}.ts
src/content-injection/{types,providers,repair,run}.ts
src/production/{bake,qa,run,types}.ts
src/assets/{rewrite,network-qa}.ts
package.json
scripts/{smoke-release,smoke-production,smoke-content-injection,smoke-seo,smoke-assets,smoke-recon-template}.ts
```

**Worst collisions:**

- **`src/recon-template/types.ts`** — 25 importers; holds the entire slot contract; wanted simultaneously
  by Template Factory V2, Slot policy, Region model, Brand Sanitization/GED-F and the Visual Editor.
  **Single-owner it.** The C4 resolution (join regions via `slot-bindings.json`) is what removes the
  Region subsystem from this file entirely.
- **`package.json`** — 57 script entries and no unified dispatcher, so every subsystem must edit the same
  block. **Defer all script additions to a wave integrator.**
- **`src/release/types.ts`** — wanted by SiteInstance, Brand Sanitization and Revision. Sequence, do not
  parallelize.

**Hot files by import count** (`src/observer/types.ts` 61, `src/sitespec/index.ts` 43,
`src/reconstruction-qa/types.ts` 28, `src/interaction-explorer/types.ts` 27,
`src/recon-template/types.ts` 25 — #5 by count but **#1 by contention**).

**Do-not-touch list (non-negotiable):**

- The 7 frozen stripe artifacts `smoke:release` hardcodes at `scripts/smoke-release.ts:1623` and
  byte-checks. `data/` is gitignored, so loss is **unrecoverable**.
- **`docs/result/handoffs/24-aggregation-phase1.json` — HIGHEST PRIORITY.** This is **not documentation,
  it is a runtime input**: `src/release/debt.ts:15` hardcodes it and reads it at prepare time, filtering
  on `decision === 'post-mvp'`. Moving, renaming or reformatting it **silently empties every release
  project's technical-debt register — and the miss degrades to a warning, never an error**. An agent
  tidying `docs/` would break a shipped feature with no failing test.
- The three GED reproduction fixtures (domainchecker repair pair, nextjs repair pair, domainchecker SEO
  qa.json, stripe 3-route network-qa.json).
- `docs/result/handoffs/*-regression-logs/` — the only measured evidence for 1,794, and gitignored.
- `src/reconstruction/{runtime-template,app-template}.ts` and `src/recon-template/app-templates.ts` —
  these embed complete Next.js/React source inside template literals (`INTERACTION_RUNTIME_TSX` alone
  spans `runtime-template.ts:379-959`). **`tsc` cannot detect corruption here**, and their inner
  `import` statements are not real module edges.
- All historical run dirs; accepted task reports (append, never edit).

---

# Parallel / Sequential Execution Plan

Assumed capacity: 8–10 h, with a full regression (~18 min) × 5 gates ≈ 90 min of pure verification.
**Realistic landing zone: 8–10 items, not 23.**

**Wave 0 — Checkpoint & baseline (serial, blocking).**
Branch (not main) · negate `.gitignore:26` for `docs/result/handoffs/**` · fix the doubled `.md.md` ·
**re-measure the 1,794 baseline** (the 26C logs predate current `src/` mtimes).
*Gate:* 17 suites / 1,794 / 0 failures with **per-suite counts matching the table**, typecheck exit 0.

**Wave 1 — Isolated defects + read-only new artifacts (3 parallel).**
GED-E · GED-G · Region compiler (read-only, consumer-free).
*Falsely parallel:* GED-E and GED-G both want `src/assets/rewrite.ts` — **GED-E owns it, GED-G must not
open it**. Region would want `recon-template/types.ts` under a naive design; the C4 resolution removes
the overlap.
*Gate:* full regression + count diff.

**Wave 2 — Schema owners (3 parallel, exactly one hot file each).**
(a) Template Factory V2 + Route Scope + Collections → owns `recon-template/*`
(b) SiteInstance + theme-edit enablement + non-destructive prepare + template `report/` hash exclusion →
owns `release/*`
(c) Content V2 + GED-D no-progress guard + slot accounting + cost telemetry → owns `content-injection/*`
*Falsely parallel:* (b) and (c) both change how content values are written — **contract: SiteInstance
defines `authored.slotValues` and owns `stages.ts`; Content V2 consumes it read-only and does not touch
`contentStageRunner`.** (a) needs a one-line change in `release/prepare.ts` — filed as a change request
to owner (b), never edited directly. All three want `package.json` — deferred to the integrator.
*Gate:* full regression + count diff + an **additivity proof** (every existing on-disk artifact still
validates).

**Wave 3 — Cross-layer (2 items, serialized on `release/types.ts`).**
Brand Sanitization (new requirement kind + SVG attribute scan + GED-F **detector half only**;
neutralization opt-in, default OFF) **then** Revision + Library registry.
*Not parallel:* Brand lands its `REQUIREMENT_KINDS` + `SEVERITY_POLICY` additions first; Revision rebases
and appends. Two sequential slots inside one wave.

**Wave 4 — Verify & hand off.**
Full 17-suite regression · **mandatory per-suite count diff** · typecheck · final audit + machine handoff.

---

# Proposed Target Architecture

The proposed chain is broadly right but needs nine corrections. Corrected form:

```
Source Website
   │
   ▼
[Tier 0 — OBSERVED FACT, immutable]
   Discovery → Verification → Selector → Observation → Interaction → SiteSpec
   → Exact Reconstruction (frozen QA answer key)
   │
   │  ── Route Scope Policy is an INPUT to the template compiler,
   │     NOT a stage between SiteGraph and Recon Template
   ▼
[Tier 1 — PER-SOURCE DERIVED MASTERS, immutable, reusable across instances of ONE source]
   Recon Template + Slot V2   (per-source, NOT source-agnostic)
   Site Map / "SiteGraph"     (see correction 4)
   PageRegion set             (derived; the region SET is Tier 1)
   Theme Extraction + Adapter
   Asset Inventory
   Source SEO Snapshot
   Brand DETECTION report
   │
   ▼
[Tier 2 — SITE INSTANCE, the only authored state]   ← extends release-project.json
   siteId (stable, site-scoped)
   ├ acceptedLineage        (refs by {id, path, hash})
   ├ authored.slotValues    (AUTHORITATIVE content)
   ├ authored.theme         ({themeId, adapterRunId, tokenOverrides?})
   ├ authored.assets        (asset resolutions / replacements)
   ├ authored.brand         (DECISIONS only — detection is Tier 1)
   ├ authored.enablement    (route + region ON/OFF — NOT "Pages"; see correction 8)
   ├ authored.facts, productionBaseUrl
   └ revisions/             (immutable pointer records)
   │
   ▼
[Tier 3 — MATERIALIZED CACHE, regenerable, ~240MB, not authored]
   content-run · theme-run · production-seo-plan · asset-materialization
   │
   ▼
[Tier 4 — BUILD]
   Production Build (static export package)
   → ProductionSpec  (a RECEIPT the compiler WRITES, then a lineage anchor the release layer READS)
```

**The nine corrections:**

1. "Recon Template = **reusable** immutable master" → **per-source** immutable master (bound to one
   source five ways, including an 11.2 MB per-template stylesheet).
2. **ProductionSpec is a receipt, not a build input.** Draw no arrow `ProductionSpec → Production Build`.
3. **Insert Tier 3, the materialized cache** — ~240 MB of regenerable-but-not-authored stage runs had no
   home in the proposed model.
4. **SiteGraph is not one artifact today; it is three** (discovery page-families, SiteSpec
   families/routes, template site-map), and the chain back to `page-families.json` is **broken at the
   template boundary**. Either name `site-map.json` the SiteGraph, or record the break as a limitation —
   do not draw a single clean node.
5. **Route Scope Policy is an input to the template compiler**, not a stage before it. Selector-side
   placement is rejected: it forces a hard-validated `SCHEMA_VERSION` bump and decides policy before any
   page has been rendered.
6. **Regions split:** the region *set* is Tier 1 (per-source derived); only region *enablement* is Tier 2.
7. **Brand splits:** *detection* is Tier 1 derived; only *decisions* are Tier 2 authored.
8. **"Pages" inside SiteInstance is misleading.** Routes are a closed set inside the frozen template, and
   routes→pages is **many-to-one** (stripe 20 routes / 18 pageSourceIds). The instance holds route
   *enablement*, not pages.
9. **The arrow the whole model depends on is unexercised.** `release:resolve` and `release:build` have
   never executed against real data — every Tier 2 → Tier 3 arrow is untested code. Record it on the
   diagram.

---

# Overnight Scope Recommendation

**DO TONIGHT**

| Item | Reason |
|---|---|
| Git checkpoint | Highest operational risk, cheapest fix. Blocking prerequisite for everything else |
| Baseline re-measure | 26C logs predate current `src/` mtimes; no suite self-asserts its count |
| GED-E | Smallest, best-isolated defect; both halves of the fix already exist in-repo |
| GED-G | Data already captured; a scope + join gap. Pairs cleanly with GED-E |
| Full Regression | Gate at every wave boundary |
| Final Audit | Machine handoff for the next program |

**DO TONIGHT AFTER PREREQUISITE**

| Item | Prerequisite |
|---|---|
| Template Factory V2 + Route Scope | checkpoint; **must add no `template` StageRunner**; must add `report/` to the frozen hash exclusion |
| SiteInstance (extend release-project) | checkpoint; owns `src/release/*` exclusively |
| Region Model (**compiler only, consumer-free**) | must not touch the slot contract; join via `slot-bindings.json` |
| Content V2 + GED-D no-progress guard | same agent (GED-D's provider half is subsumed by V2) |
| Cost telemetry | Content V2 owns `providers.ts` |
| Brand Sanitization detector | after SiteInstance's schema lands |

**OPTIONAL IF TIME** — Collection Foundation · GED-F **detector half only** · Revision · Template/Site
Library.

**DEFER POST-PILOT**

- *Accuracy review* — no real provider exists; there is nothing to be accurate against yet.
- *Slot Quality Audit* — this audit already measured it; a task would restate the numbers.
- *Full Production Canary* — no incremental bake path, so each iteration costs a 210 MB copy.

**DO NOT IMPLEMENT (tonight)**

- **Visual Editor V1** — cut for **capacity, not architecture**. The feasibility is proven (zero renderer
  change needed), but it is blocked on two unmeasured operational unknowns (React-19 `<script>` injection
  survival, `next start` restart latency), has no hot reload, and has no generated/overrides boundary yet.
- **Site Factory Controller** — it already exists as `release/graph.ts` + `stages.ts`; the missing half
  (create a site, not just finish one) is blocked on `auxiliary.siteSpecDir` being hardcoded `null` and
  frozen roots having no runner, and it collides with SiteInstance on every `src/release` file.
- **Region/Page ON-OFF behaviour** — only the compiler ships tonight. The consumer needs the routes→pages
  reference count, the trigger/target cut check, and the `collect.ts:258-283` exclusion, or every disabled
  page becomes an unclearable blocker.
- **GED-F neutralization** — detector only; `smoke-production.ts:266` asserts residual `=== 1` exactly.
- **Any `THEME_SELECTION_IMPACTS` deletion** — `smoke-release.ts:1210` asserts its value; wire it live
  instead.
- **Any new DOM attribute** — the slot→DOM map is already complete.

---

# Post-Overnight Scope

1. Visual Editor V1 — after measuring the two hydration/restart unknowns.
2. Region/Page ON-OFF consumers, with the R0–R7 cascade rules.
3. GED-F anchor neutralization, once Content V2 and enablement have changed which routes are uninjected.
4. Incremental bake / preview overlay seam (a content edit must not cost a 210 MB copy).
5. Site creation in the release layer (`auxiliary.siteSpecDir`, frozen-root runners).
6. A real LLM provider behind the existing `ContentGenerator` seam, and the `ResolutionParser`.
7. A production-mode SEO plan — **no such plan has ever been generated**; that entire branch is unverified.
8. Collection/blog engine behind the already-recorded limitation.
9. QA-result authority (today every QA writes back into the artifact it measured).
10. Atomic writes / locking (none exist anywhere in the repo).
11. Artifact GC and an index for the 18 GB `data/` tree.
12. `README.md` / `ROADMAP.md` / `PRODUCT_VISION.md` reconciliation for Tasks 25–26.

---

# Stop Conditions

| # | Condition | Status | Deciding evidence |
|---|---|---|---|
| **A** | SiteInstance seriously duplicates an existing model | **TRIGGERED** | `release-project.json` already carries site identity, hash-pinned lineage refs, authored deltas and per-stage derivation state. **Alternative (the plan of record): extend it — add a site-scoped `siteId`, make prepare non-destructive, declare an additive `authored` object. Never build a parallel model.** |
| B | Region identity cannot be made stable | NOT TRIGGERED | A deterministic doc-tree compiler with element-child paths + a skeleton hash, built from three primitives that already ship |
| C | Visual Editor needs a large renderer rewrite | NOT TRIGGERED | Proven false: serve-boundary injection + `data-wr-node` + `parity-qa.ts:858` require **zero** renderer change |
| D | Content V2 requires destroying the frozen content architecture | NOT TRIGGERED | Every V2 layer maps onto an existing concept; only Region Plan is new; slot-subset repair already works |
| E | A working-tree checkpoint is impossible | NOT TRIGGERED | 47 MB / 501 files, `data/` ignored, zero secrets. Needs two deliberate decisions, not a blocker |
| F | Widespread file-ownership conflict | NOT TRIGGERED **as planned** | Would be triggered by the naive 23-item plan (four subsystems want the slot contract concurrently). The wave plan + 27 single-owner files defuses it |

---

# Final Recommendation

## READY WITH ARCHITECTURE CHANGES

The engine is more capable than its own documentation, and the program is safe to run **provided the
ten changes below are applied to the plan before any implementation agent starts.** One stop condition
is TRIGGERED (SiteInstance duplication) and its alternative is cheap, well-evidenced, and already the
plan of record.

1. **SiteInstance EXTENDS `release-project.json` — no new model.** Add a stable site-scoped `siteId`,
   make prepare non-destructive (it currently resets `resolutions[]` and `runs[]` at
   `prepare.ts:223/:238`), and declare an additive `authored` object on the `.strict()` schema.
2. **ONE content write path.** `SiteInstance.authored.slotValues` is authoritative;
   `content-runs/<run>/slot-values.json` becomes derived and stays **bare**; the `generation-result.json`
   merge base is unchanged; hand-editing a lineage run is deprecated and must at minimum warn that the
   edit will not survive a rebuild.
3. **Region identity from a doc-tree compiler** using element-child paths — **not** persisted
   `ancestorIds` (truncated to 12), **not** global `nodeId` ordinals. Join slots to regions through
   `slot-bindings.json` so `src/recon-template/types.ts` is never opened by the Region subsystem.
   Name it `PageRegion` or `Block`.
4. **Theme edit:** add a `theme` field to `ProductionResolutionSchema`, wire `THEME_SELECTION_IMPACTS`
   into `RESOLUTION_FIELD_IMPACTS`, add the theme slice to `computeStageInputsHash`. **Do not delete the
   constant** — `smoke-release.ts:1210` asserts it.
5. **Template Factory V2 must add no `template` StageRunner** (it produces new template run ids consumed
   by a new production-spec). Separately, add `report/` to the template stage's `excluded[]` hash set, or
   running `qa:recon-template` after `release:prepare` will brick `release:build`.
6. **Brand leak becomes a new release-blocking requirement KIND**, collected from the existing brand-leak
   report — **never a new production QA assertion** (`qa.ts:436-443` whitelists the source host against
   itself, and asserting `sourceHostMentionsInHtml === 0` would flip both pilots out of any ready state).
   Add an SVG `aria-label`/`symbol id` scan, which nothing detects today.
7. **GED-F ships detector-only**; any anchor neutralization is opt-in and defaults OFF, because
   `smoke-production.ts:266` asserts `residualSourceUrlOccurrencesInSite === 1` exactly.
8. **Add no new DOM attribute.** The slot→DOM map is complete; `data-wr-slot` would flip parity risk from
   LOW to MEDIUM against `parity-qa.ts:245-248`.
9. **Region/Page ON-OFF is cut tonight** — only the consumer-free compiler ships. When the consumer lands
   it must carry the routes→pages reference count, the trigger/target cut check, and the
   `collect.ts:258-283` exclusion.
10. **Re-measure the 1,794 baseline in wave 0** before any agent starts, and make a per-suite check-count
    diff a mandatory gate at every wave boundary — **no suite asserts its own total**, so an exit code
    alone is not evidence.

---

**PRE-OVERNIGHT AUDIT COMPLETE — READY WITH ARCHITECTURE CHANGES.**

이번 실행에서 구현한 것은 없다. Repository 수정은 이 보고서와
`docs/result/handoffs/pre-overnight-audit.json` 두 파일뿐이며, git operation은 0건이다.
