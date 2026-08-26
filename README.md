# web-recon

An independent **Web Reconstruction Engine**: observe a public website, turn its
structure / design / behavior into data, then reconstruct it in a different
technology stack.

## Pipeline (long-term vision)

```
URL
→ Discover
→ Observe
→ Understand
→ Reconstruct
→ Verify
→ Learn
```

## Current status

- Firecrawl Discovery ✓
- Discovery Candidate Verification (Playwright, lightweight) ✓
- Deterministic Structural Family Signals ✓
- Page Family & Representative Selection (offline, deterministic) ✓
- Single Page Responsive Deep Observation — Desktop ✓ / Mobile ✓
- Multi-page Deep Observation (whole site, one run) ✓
- Interaction Candidate Detection (offline, deterministic) ✓
- Safe Rule-Based Interaction Exploration (live Playwright, deterministic) ✓
- Interaction Pattern Modeling & Unknown Strategy (offline, deterministic) ✓
- SiteSpec Compiler — self-contained reconstruction IR (offline, deterministic) ✓
- Reconstruction-Critical Attribute Recovery hardening (offline, deterministic) ✓
- Next.js Reconstruction Engine — SiteSpec → runnable clone (offline, deterministic) ✓
- Reconstruction QA & Automated Correction Loop — snapshot vs live original vs
  clone, root-cause attribution, three closed correction types ✓
- Full End-to-End Reconstruction — one fresh public URL through every stage
  above in one process, with a machine-readable run manifest ✓
- Exact Reconstruction Fidelity Hardening + Final Acceptance — 27/27
  interaction equivalence on stripe.com; frozen as the template phase's
  answer sheet ✓
- Recon Template Compiler — Exact Reconstruction → lossless editable
  template (Slot V2: text / URL / image slots, static + dynamic-template
  bindings, default-content parity) ✓
- Natural Language Content Injection — one natural-language intent →
  content units → provider-neutral generation → validated slot-values
  overlay → layout-safety-QA'd injected site (template stays immutable) ✓
- Visible Content Injection Completeness — Slot V2 v2 additive extensions:
  aria-hidden paint twins co-bound (`paint-twin` surface) and inline SVG
  `<text>` runs injectable (`svg-text` target); Content Injection FROZEN ✓
- Theme Extraction, Token Contract & Theme Adapter Foundation — a common
  versioned Theme Token Contract, per-site Original Theme extraction, a Site
  Theme Adapter binding tokens to this site's own paint identity (never a
  forced common class), and an additive serve-boundary Theme Overlay proven
  browser-equivalent for the Original Theme and layout/interaction-safe for
  curated themes ✓
- Source SEO Observation & Production SEO Foundation — an immutable
  source-seo-snapshot audit of how the ORIGINAL site does SEO (head evidence
  from stored rendered.html, link graph, canonical clusters, live robots/
  sitemap), a structurally separate production-seo-plan derived from the
  injected content run (never a copy — forbidden-copy + source-brand-isolation
  checks), preview domain-state safety (noindex, no invented domain/canonical/
  facts), and a serve-boundary SEO head overlay that puts the production
  title/meta/JSON-LD — including the previously un-slotted document title —
  into the real browser head ✓
- Asset & Font Independence Foundation — a versioned asset + font inventory
  read from stored lineage artifacts (asset catalog, generated CSS `url()`,
  rendered-html head evidence: favicon / og:image / font preloads),
  conservative source-brand classification (brand marks, people and
  customer-identity assets are never auto-fetched; fonts are always
  license-needs-review), an SSRF-hardened fetcher (DNS-validated, redirect-
  re-validated, size/MIME-bounded), content-hash `/media/<sha256>` storage,
  serve-boundary URL rewriting (HTML + RSC flight + CSS), an operator image
  replacement seam joined to the Task 19 imageBriefs, and browser-measured
  runtime-network + fallback-font QA ✓
- ProductionSpec & Independent Production Build — one reproducible
  `production-spec-v1` pinning template/content/theme/SEO/asset lineage by
  id + dir-sha256-v1 hash, every serve-boundary layer BAKED into a copied
  app (content env seam removed, theme overlay a linked static asset, plan
  titles + head blocks + robots baked, media + rewrite map applied to built
  files), a full static export (audited: path-only route table, no dynamic
  APIs), a credential-free deployment package with a dependency-free
  server, and isolated-launch browser QA (package copied outside the repo,
  env=PATH only) — honest PREVIEW verdict with machine-recorded
  indexability blockers ✓
- MVP Final Acceptance — stripe re-acceptance with fresh samples on the
  isolated package; pipeline generality proven end-to-end on
  domainchecker.co.kr and nextjs.org (every FAIL classified, none silent);
  Task 20 theme paint-coverage debt CLOSED (31/31 themeable groups
  browser-verified, 0 mismatch, 20 routes × 2 viewports + dynamic
  surfaces); 7 canonical generic defects consolidated, 3 corrected and
  independently verified (production QA re-runs 152/152 · 299/299 ·
  159/159 unchanged), 4 roadmapped post-MVP; full regression 16 suites /
  1,671 checks / 0 failures — **MVP PREVIEW READY — PRODUCTION INPUTS
  REQUIRED** (7 operator-input blockers; indexable production is one
  documented recompile away) ✓

```
URL
→ Firecrawl Discovery      (pnpm recon)        — enumerate candidate URLs
→ Candidate URLs
→ Playwright Verification  (pnpm verify)       — check each candidate is real & usable
→ Verified URLs
→ Family / Representative  (pnpm select)       — group pages, pick one per family
→ Selected Pages
→ Multi-page Deep Observation (pnpm observe:site) — deep-observe the whole selection
→ Site Observation Run
→ Interaction Candidates   (pnpm detect:interactions) — what could be interacted with
→ Safe Rule-Based Interaction Exploration (pnpm explore:interactions)
                                                — what actually changes when you click
→ Interaction Pattern Modeling (pnpm model:interactions)
                                                — which reusable behavior that is,
                                                  and why some of it has no name yet
→ SiteSpec Compiler        (pnpm compile:sitespec)
                                                — compile everything above into ONE
                                                  self-contained reconstruction IR
→ SiteSpec
→ Next.js Reconstruction   (pnpm reconstruct)   — generate a runnable Next.js /
                                                  React / TypeScript clone from the
                                                  SiteSpec and nothing else
→ Generated App
→ Reconstruction QA        (pnpm qa:reconstruction)
                                                — compare the saved snapshot, the
                                                  LIVE original and the clone;
                                                  classify WHY they differ
→ Correction Loop          (… --auto-fix)       — apply only the repairs the
                                                  pipeline actually observed
→ Full E2E Reconstruction  (pnpm e2e:reconstruct <url>)
                                                — every stage above, in ONE
                                                  process, from a URL nobody
                                                  has looked at before
```

Every arrow above is also a standalone CLI, and that is deliberate: the E2E
orchestrator calls each stage's **public API**, never `exec("pnpm verify …")`,
so a stage boundary is a TypeScript contract rather than a shell string, and any
stage can still be re-run alone against the artifact the previous one wrote.

### The SiteSpec consumer contract

`compile:sitespec` is the seam between observation and reconstruction, and the
contract is deliberately one sentence:

> **A reconstruction engine reads the SiteSpec directory and nothing else.**

```
data/<host>/site-specs/<run-id>/
  site-spec.json          routes · families · page index · responsive model · stats
  style-catalog.json      site-wide deduplicated computed styles (styleTokenId)
  asset-catalog.json      site-wide deduplicated asset references (assetId)
  interaction-spec.json   verified patterns · unknown cases · (opt-in) inferences
  pages/p000001.json …    per page: desktop + mobile node trees with text nodes
```

Everything before it — `discovery.json`, `verification.json`, `page-families.json`,
`site-observation.json`, `dom.json`, `styles.json`, `rendered.html`, the Task 10–12
interaction artifacts — is **debug / audit source only**. `site-spec.json` records
where those runs were (`source`), but `loadSiteSpec()` never opens them, and a
SiteSpec whose source runs have been deleted still validates and still holds every
byte a renderer needs. That property is asserted by the fixture test, which deletes
the entire input tree before loading.

A SiteSpec is an **IR, not a dump**: it is framework-neutral (no React, Next.js,
Vue or Tailwind concept appears in the schema), it carries browser-computed style
rather than source CSS, and it contains no original JavaScript, no inline event
handler, and no form action endpoint.

`dom.json` is the source of truth for structure, computed style, geometry and
visibility. Where a viewport's `rendered.html` was **proven** to describe the
same tree (element count + tag sequence + parent relation, 104/104 real
viewports), that parse is also a **bounded supplemental source for a closed
allowlist of reconstruction-critical declarative attributes** — `colspan`,
`rowspan`, `scope`, `open`, `hidden`, `disabled`, `readonly`, `checked`,
`selected`, `required`, `min`/`max`/`step`, `contenteditable`, the Popover
attributes and a few more (Task 13.1). The allowlist is asserted disjoint from
what the Observer records, so it can only ever fill a gap: an attribute already
in `dom.json` is never overwritten, `class` / `style` / `data-*` / `on*` /
`action` / `formaction` / input `value` are unreachable by construction, and a
viewport that failed alignment recovers nothing and says so. Every recovered
name is listed in that node's `recoveredAttributeNames`, so a renderer can tell
the two channels apart.

### Rules first, AI last

The engine's standing order for interpretation, enforced structurally rather than
by convention:

```
Known fixed procedure                → deterministic Pattern Rule
Known observation, thin semantics    → Unknown Case (a named cause, never a shrug)
Unknown semantics                    → AI analysis, provenance `inferred`
AI finds reusable evidence           → human validation → fixture → rule promotion
```

A deterministic pattern is never produced by AI, never overridden by AI, and an
AI proposal is never promoted into the registry on its own. AI is an annotation
on the part the rules could not explain — with no provider configured, every
stage still produces its full deterministic result.

Eight distinct roles, deliberately never mixed:

- `pnpm recon` — **Firecrawl** URL discovery (the only step that calls the
  Firecrawl API). Produces `discovery.json`.
- `pnpm verify` — **local Playwright** verification of already-discovered
  candidates. Never calls Firecrawl; reuses `discovery.json`
  ("Explore Once → Reuse Data"). Produces `verification.json` + `verified-urls.json`.
- `pnpm select` — **offline deterministic** grouping + representative choice. No
  Firecrawl, no Playwright, no network at all: it reads only what `verify`
  already wrote, so it costs 0 crawl and 0 browser time. Produces
  `page-families.json` + `selected-pages.json`.
- `pnpm observe` — **local Playwright** deep observation of **one** URL
  (desktop + mobile). The single-page entry point.
- `pnpm observe:site` — **local Playwright** deep observation of a whole
  **selection**: it feeds `selected-pages.json` into that same observer, one page
  at a time, and binds the results into one site run. Never calls Firecrawl and
  never re-runs discovery / verification / selection.
- `pnpm detect:interactions` — **offline deterministic** detection of which
  elements could be interacted with, from a site observation run already on disk.
  No Firecrawl, no Playwright, no network, no AI — and it performs **no
  interaction**: nothing is clicked, hovered, focused, typed into, or submitted.
  Produces `interaction-analysis.json` + one `interaction-candidates.json` per page.
- `pnpm explore:interactions` — **local Playwright** execution of that plan against
  the live site: one fresh anonymous `BrowserContext` per action, click, before/after
  diff, dispose. The only stage that touches a site with intent.
- `pnpm model:interactions` — **offline deterministic** interpretation of an
  exploration run: verified transitions become named patterns, and everything else
  becomes a *classified* unknown. No Firecrawl, no Playwright, no network, and no
  AI unless `--ai` is passed. Produces `interaction-patterns.json` +
  `unknown-interactions.json`.

### Two structure signals, two different questions

The single most important distinction in this pipeline. `pnpm verify` computes
**both** for every valid HTML page, and they are never mixed:

```
Exact Fingerprint          →  duplicate / identity
  textHash + structureHash    "are these two URLs the same page?"
  SHA-256 over the whole DOM tag/depth sequence and the whole body text.
  Byte-exact on purpose: one extra <script> changes it.

Coarse Structural Profile  →  template / page family
  shallowSkeletonHash + landmarkHash + tagHistogramHash + compact counts
  Deliberately blunt: depth-capped, repeat-collapsed, metadata-stripped.
  Three MDN reference pages with 930/932/935 elements share one skeleton.
```

A **duplicate** collapses into a single logical node (`content-duplicate`), and
only the exact pair may declare one — a coarse match never can. A **family** is a
set of genuinely *different* pages that a single Deep Observation can stand in
for (`sibling-pattern` / `scope-structure`), and only the coarse profile forms
one. Both are deterministic; there is no AI, embedding, or similarity score
anywhere in either.

### Phase 2 — Firecrawl URL Discovery

```
URL
→ Firecrawl Map
→ Normalize
→ Deduplicate
→ Same-site filter
→ Discovery JSON
```

- Firecrawl behind a `DiscoveryProvider` abstraction so it is not coupled into
  the rest of the engine
- Deterministic URL normalization, deduplication, and same-site filtering,
  validated with zod
- Raw and normalized results persisted under `data/<host>/<run-id>/`

### Task 06 — Discovery Candidate Verification

```
discovery.json
→ Candidate URLs
→ Playwright Chromium (one fresh context per candidate)
→ HTTP status / redirect chain / final URL / content-type
→ page identity signals (title / canonical / meta robots / body-text len / DOM count)
→ deterministic EXACT fingerprints (text + structure)
→ deterministic COARSE structural profile (Task 08 — skeleton / landmark / histogram)
→ deterministic duplicate hints (final-url / canonical / content-fingerprint)
→ verification.json + verified-urls.json
```

A Firecrawl Map result is a list of **candidates**, not confirmed pages
(redirects, 404/403/500, non-HTML files, external redirects, duplicates all mix
in). `pnpm verify` visits each candidate **once** in real Chromium as a
**lightweight filter** — it does NOT collect computed styles, geometry,
screenshots, assets, or a mobile pass (that is the Observer's job). It is
strictly read-only (GET navigation + inspection; never click/type/submit).

- Each candidate runs in its **own fresh `BrowserContext`** (shared browser
  process) so cookies / localStorage / sessionStorage cannot leak between
  candidates and change a result by visit order
- Conservative default **concurrency 3** (`--concurrency 1–8`); bounded
  navigation timeout (25s), `domcontentloaded` + short settle (no mandatory
  `networkidle`)
- Deterministic status taxonomy: `valid-html`, `http-error`, `navigation-error`,
  `non-html`, `external-redirect`, `blocked`
- Same-site decision reuses Discovery's `isSameSite()`; query parameters are
  preserved (never stripped by name); canonical is a **hint**, never enforced
- Fingerprints are SHA-256 of normalized `body.innerText` and of a lightweight
  DOM tag-structure signature — for finding near-identical candidates, **not**
  semantic similarity or template clustering. No AI anywhere
- `verified-urls.json` keeps only usable Deep-Observation candidates (final HTTP
  success + HTML + same-site) and dedups by **final URL**; canonical/fingerprint
  duplicates are preserved for the later Page Selection step
- Verification **extends the discovery run directory** (no new run id), so
  `discovery → verification` provenance stays in one run. Isolated under
  `src/verifier/`; zod-validated (schema v2)

### Task 08 — Deterministic Structural Family Signals

```
already-loaded DOM
→ one tag-only walk (no text, no attribute values, no styles, no geometry)
→ raw material: depth-tagged token stream / landmark stream / per-tag counts
→ Node-side normalization under ONE global policy
    shallowSkeletonHash  depth-capped (6), repeat-collapsed, noise-stripped skeleton
    landmarkHash         landmark-only nesting signature
    tagHistogramHash     per-category counts, bucketed 0|1|2|3-4|5-8|9-16|17-32|33+
    elementCount / maxDepth / landmarkCounts / structuralCounts / histogramBuckets
→ verification.json + verified-urls.json (hashes + compact counts only)
```

Task 07 measured the problem: exact `structureHash` is the right tool for
duplicates and an unusable one for templates, so 110 of 112 verified URLs stayed
singletons. Task 08 adds a second, coarser signal beside it — still deterministic,
still no AI — and points the Selector's two structural rules at it.

- **Content-volume insensitive by construction**: text nodes and attribute values
  are never read; `<head>` / `<script>` / `<style>` / `<meta>` / `<link>` and
  their subtrees are dropped; inline `<svg>` (and `<iframe>` / `<video>` / …) is
  one opaque node; the skeleton stops at depth 6; repeated sibling *shapes*
  collapse to one, so three related cards and eight related cards are one template
- **Not one magic hash.** Three independent hashes plus raw counts, so a family
  can always be explained — and blamed — after the fact
- **Every constant was measured, not chosen by taste.** Depth cap 4–8 × raw-tag vs
  semantic-category labels × dedupe vs repeat-marker were each evaluated against
  all 112 verified URLs of the four test sites before `{6, tag, dedupe}` was fixed
- The exact Task 06 fingerprints keep their meaning **byte for byte**; the two
  policies differ on purpose (the exact hash sees the extra `<script>`, the coarse
  one must not)
- Costs 1–3 ms of in-page work per candidate (measured 529–9,711 DOM elements),
  under 0.2% of a ~1.5 s verification. No computed styles, geometry, screenshots,
  assets, or mobile pass — verification stays a fast filter

### Task 07 — Page Family & Representative Selection (rules updated by Task 08)

```
verified-urls.json + verification.json
→ deterministic route features (path / depth / locale prefix / route scope /
  parent / query keys / terminal-segment shape)
→ hierarchical grouping
    1. content-duplicate  (EXACT textHash AND structureHash identical)
    2. sibling-pattern    (≥3 same-depth siblings, one parent, one COARSE key)
    3. scope-structure    (same locale prefix + route scope + COARSE key)
    4. singleton          (everything else — left alone on purpose)
→ one deterministic representative per family
→ page-families.json + selected-pages.json
```

Rules 2 and 3 compare the **coarse** structural key — `shallowSkeletonHash` AND
`landmarkHash` AND the element-kind presence mask — guarded by route context, a
path-ancestor exclusion (a section index is never absorbed by its own detail
pages), and an element-count ratio ceiling of **2.0**. Rule 1 is untouched and a
coarse match can never produce a duplicate.

Not every verified URL needs its own Deep Observation: a site's twenty blog posts
may be one template. `pnpm select` answers *which pages actually need observing*
using only data already on disk — **no Firecrawl call, no Playwright launch, no
network request, no AI**.

- **A false merge is worse than a missed merge.** Merging two genuinely different
  pages means the next stage observes one and permanently loses the other, so
  every rule is a conjunction of exact matches (byte-identical hashes, identical
  scope strings) — never a similarity score. The one numeric threshold is the
  element-count ratio guard, and it only ever *splits* a group. Grouping is
  layered, not union-find: each URL is claimed by the first rule that applies, so
  signals cannot chain together into one giant component
- This is **not** semantic classification. Nothing is labelled `homepage` /
  `blog-detail` / `product-detail`. `sibling-pattern` families record an
  `inferredRoutePattern` (`/blog/<*>`) that is explicitly named as
  observation-derived — never a claim about the site's real framework routes
- **Duplicate ≠ Page Family.** A duplicate is the same content behind several
  URLs; a family is *different* pages likely sharing a structural pattern. Only
  the former collapses into one logical node (aliases preserved as members)
- **canonical never merges anything.** Task 06 found real pages declaring an
  unrelated canonical (a blog index claiming the homepage); canonical is stored
  as a hint and only lowers representative priority
- A locale-looking first segment (`xx` / `xx-YY`) is recorded as `localePrefix`
  metadata and never removed — it only shifts where `routeScope` is read from
  (`/en-US/docs/Web/HTML` → scope `docs`). No locale database
- The site root is force-isolated into its own family so it can never lose a
  representative contest and vanish from the selection
- Representative rule, in order: self-canonical/none → no query → shallower depth
  → shorter URL → lexical. Total order, so input order never matters
- Invariants enforced before writing: every verified URL in **exactly one**
  family, exactly **one** representative per family, `selectedCount ===
  familyCount`, deterministic `f000001…` ids assigned only after a stable sort,
  and — since Task 08 — that each family really satisfies its own rule (a
  `content-duplicate` shares both exact hashes; a structural family satisfies all
  three coarse conditions, the ratio guard, and the ancestor guard)
- Every family records **why** it formed: `signals.familyMatch` (which coarse
  signals agreed, the element-count range and ratio, and whether the exact hash
  would also have matched) plus a readable `structuralMatchReason`
- Unselected URLs are never dropped — they stay full family members and are also
  listed in `selected-pages.json` with the representative that covers them
- No `--max-pages` cap: the point is to measure what deterministic signals really
  achieve, not to make the number look good
- Isolated under `src/selector/`; zod-validated (schema v2); extends the existing
  run directory (no new run id). Fixture test: `pnpm smoke:selector`

**Measured result.** With Task 06's exact `structureHash` the four test sites
reduced 112 verified URLs to 110 families (1.8%) — three MDN reference pages from
one template (930/932/935 elements) produced three different hashes. Re-verified
with the Task 08 coarse profile and re-selected, the same 112 URLs reduce to 41
families (63.4%):

| site | verified | Task 07 selected | Task 08 selected | Task 07 | Task 08 |
| --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 19 | 4 | 0.0% | 79.0% |
| seoworld.co.kr | 30 | 28 | 16 | 6.7% | 46.7% |
| nextjs.org | 40 | 40 | 12 | 0.0% | 70.0% |
| developer.mozilla.org | 23 | 23 | 9 | 0.0% | 60.9% |
| **total** | **112** | **110** | **41** | **1.8%** | **63.4%** |

All 19 non-singleton families were reviewed by hand and by mechanical check:
**0 obvious false merges**, no family mixing a section index with its detail
pages, no family spanning route scopes or locales, and the two known canonical
anomalies still isolated. See
`docs/result/08-deterministic-structural-family-signals-2026-08-13.md`.

### Phase 3 — Single Page Responsive Deep Observation (Task 03 → 04 → 05)

```
URL
→ for each viewport profile (desktop 1440×900, mobile 390×844):
    Chromium context (viewport / DPR / touch / UA + pinned locale/timezone)
    → render (Playwright)
    → stabilize (load → bounded networkidle → bounded fonts.ready
                 → [optional read-only prepare-scroll] → settle)
    → Page metadata / rendered HTML / DOM / computed styles (deduplicated)
      / geometry / visibility (local + effective)
    → Assets (incl. inline-SVG markup) / Links / iframe + shadow inventory
    → Environment metadata
    → full-page screenshot
→ observation.json (target + per-viewport summaries + responsive summary)
→ Filesystem (viewports/<id>/…)
```

- Renders ONE URL in real Chromium at **both** a desktop and a mobile viewport,
  running the **same** deep-observation pipeline for each (mobile is not a
  reduced screenshot-only variant); **read-only** — no click / hover / form
  input / AI. The only motion is an optional read-only **prepare-scroll** that
  triggers lazy-loaded content (never a click/submit)
- One shared pipeline parameterized by a **`ViewportProfile`**
  (`id` / `width` / `height` / `deviceScaleFactor` / `isMobile` / `hasTouch` /
  `userAgent`); locale/timezone (`ko-KR` / `Asia/Seoul`) and
  colorScheme/reducedMotion are pinned per context for reproducibility
- Real responsive differences are **preserved per viewport, never normalized or
  merged** — element ids (`e######`) and style ids are stable only *within* a
  viewport (no cross-viewport semantic matching in this phase)
- Per-element observation with stable ids (`e000001…`): whitelisted attributes,
  normalized direct text, `getBoundingClientRect` geometry, and two derived
  visibility levels — `localVisible` (own box) and `effectiveVisible`
  (accounting for ancestor `display:none` / `opacity:0` /
  `content-visibility:hidden`)
- **Computed-style deduplication**: identical style maps collapse into a shared
  table (`styles.json`); each element carries a `styleId` reference. Element and
  pseudo-element styles share the one table
- Asset + link references (URLs and metadata only; no binaries downloaded),
  including `<img>` `currentSrc` / intrinsic size, `background-image` /
  `mask-image` URLs, and **inline `<svg>` markup** (preserved verbatim; treated
  as untrusted content for any future re-render)
- iframe inventory (`frames.json`) and open-shadow-root inventory; closed shadow
  roots are treated as unobservable and never bypassed
- Observation **environment** recorded per viewport (browser/version, UA,
  viewport, DPR, locale, timezone, color-scheme, reduced-motion) for reproducible
  QA; a deterministic top-level **responsive summary** (element / effective-visible
  / document-size / unique-style / asset / link counts per viewport)
- Desktop (1440×900) and mobile (390×844) each get the full deep observation +
  a full-page screenshot; each viewport keeps its **own** style table and the
  no-dangling-`styleId` invariant (never shared across viewports)
- Observer isolated under `src/observer/`; zod-validated (schema v3); persisted
  under `data/<host>/<run-id>/viewports/<id>/`

### Task 09 — Multi-page Deep Observation

```
selected-pages.json
→ schema + provenance validation (fail-fast, before any browser launches)
→ deterministic page plan (p000001…, stable order, validation samples)
→ ONE Chromium process
→ for each page: the existing Task 03–05 responsive deep observer
    (fresh BrowserContext per viewport — no state leaks between pages)
→ data/<host>/site-observations/<run-id>/
    site-observation.json           — manifest (pages, provenance, coverage, stats)
    pages/<page-id>/observation.json + viewports/{desktop,mobile}/…
```

`pnpm observe` renders one URL; this renders a whole *selection*. The important
constraint is what it does **not** contain: no multi-page DOM collector, no
multi-page style dedup, no multi-page viewport logic. Every page goes through
`observePageWithBrowser()` — the same primitive `pnpm observe` calls — so a page
observed either way produces byte-comparable artifacts (schema v3).

- **Orchestration only.** The Observer was refactored by *extraction*, not
  addition: `observePage()` is now a launch/close wrapper around
  `observePageWithBrowser()`, and `saveObservation()` a directory choice around
  `saveObservationIntoDir()`. Single-page behavior is unchanged
- **Reuses the existing run** — no Firecrawl call, no discovery, no
  re-verification, no re-selection. `selected-pages.json` is the only input, and
  it is validated against the real Selector zod schema plus provenance
  cross-checks against its siblings before a browser starts
- **Deterministic page ids.** URLs are not usable directory names, so pages get
  opaque `p000001…` ids assigned after a lexical URL sort — the same selection
  always yields the same ids, and validation samples are numbered in a second
  block so turning sampling on/off never renumbers a production page
- **Failure isolation.** One page failing never destroys the run: it is recorded
  as `navigation-error` / `observation-error` / `storage-error` and every
  successful page keeps its artifacts. Only input/invariant violations abort.
  Errors store `{name, message, phase}` — never a stack trace
- **Representative provenance** is mandatory on every page (`familyId` /
  `familyType` / `familyMemberCount`), so "this one observation stood in for 11
  URLs" stays answerable. Coverage counts only representatives that *succeeded*
- **Validation sampling** (max 3 families per site, ≥3 members, one member each,
  deterministically chosen) deep-observes a few *non*-representatives and records
  deterministic representative↔sample ratios — measurements only, no verdict
- **Conservative concurrency**: default 2 (`--concurrency 1–4`), far below the
  Verifier's 3, because every page here is a full desktop + mobile deep
  observation with two full-page screenshots
- No resume, no cache, no retry — a run observes its list and records what
  happened. Isolated under `src/multi-observer/`; zod-validated (schema v1).
  Fixture test: `pnpm smoke:multi-observer` (58 checks)

**Measured result.** All four test sites ran from their existing
`selected-pages.json` with **0 Firecrawl calls, 0 failures across 52 pages**:

| site | verified | representatives | samples | observed | reduction | time | storage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 4 | 2 | 6 | 68.4% | 39.0s | 57.67 MB |
| seoworld.co.kr | 30 | 16 | 3 | 19 | 36.7% | 74.5s | 68.03 MB |
| nextjs.org | 40 | 12 | 3 | 15 | 62.5% | 94.1s | 149.81 MB |
| developer.mozilla.org | 23 | 9 | 3 | 12 | 47.8% | 57.5s | 75.34 MB |
| **total** | **112** | **41** | **11** | **52** | **53.6%** | **265.2s** | **350.86 MB** |

Selection alone reduces 112 → 41 (63.4%); paying for 11 validation samples brings
the real figure to 112 → 52 (**53.6%**), and that surcharge is reported rather
than hidden. Estimated cost of deep-observing all 112 URLs at the measured
average: ~834 MB. Screenshots are 45.7% of all bytes (still uncompressed PNG on
purpose). See
`docs/result/09-multi-page-deep-observation-2026-08-13.md`, including the three
validation pairs where a representative visibly did **not** stand in well for its
family.

### Task 10 — Deterministic Interaction Candidate Detection

```
site-observation.json (Task 09, immutable input)
→ per page: observation.json + viewports/{desktop,mobile}/{dom,styles}.json
→ zod + cross-file validation (fail-fast: styleId integrity, element counts, viewport ids)
→ per viewport, INDEPENDENTLY:
    signals   native tag / input type / role / ARIA state / handlers / state attrs
              / computed cursor + pointer-events / tabindex / data-* hints
    → candidates (one per element, max)  priority P1|P2|P3 + capabilities[] + evidence[]
    → targets    aria-controls / popovertarget / <summary>→<details> + stateful containers
    → guards     form-submit / file-input / navigation / hidden / pointer-disabled / …
→ pages/<page-id>/interaction-candidates.json + interaction-analysis.json
```

Answers "**what could be interacted with?**" and deliberately not "what happens if
you do?" — that needs a browser and is the next phase. Offline deterministic
processing: **0 Firecrawl calls, 0 Playwright launches, 0 network requests, 0 AI**,
verified at the import-graph level. It performs no interaction of any kind.

- A candidate is a claim about **evidence**, never about behavior: *"stored data
  justifies attempting an interaction here"*. Never that it works, is safe, has a
  JS handler, or is an accordion. Every candidate traces back to a specific value
  in `dom.json` / `styles.json`, and each evidence entry is marked `observed`
  (read from the file) or `derived` (computed here). There is no `inferred` level
- **One element → at most one candidate.** A `<button role=button aria-expanded
  aria-controls onclick>` with `cursor:pointer` is five signals, one candidate,
  and the highest priority any of them justifies
- **P1/P2/P3 are deterministic tiers, not confidence scores.** P1 = the markup
  *declares* a state relationship (`aria-expanded` / `aria-pressed` /
  `aria-selected` / `aria-checked` / `aria-haspopup` / `aria-controls`,
  `role=tab|switch`, `<summary>`, `popovertarget`); P2 = a native/explicit
  affordance (`<button>` `<input>` `<select>` `<textarea>`, a recognized role,
  `contenteditable`, `draggable`, an inline handler); P3 = heuristic
- **Pattern names are never asserted.** No page is labelled Accordion / Tabs /
  Modal / Carousel. Only ARIA/native-derived *trigger* capabilities
  (`tab-trigger`, `dialog-trigger`, `menu-trigger`, `disclosure-trigger`) are
  claimed, because those are written in the markup
- **Normal `<a href>` links are excluded** — they are already in `links.json`, and
  admitting them would bury the real controls: the four test sites hold **29,094
  anchors and 0 of them became candidates**. An anchor is admitted only with a
  non-navigation signal (role, ARIA state, handler, `popovertarget`, `javascript:`)
- **`cursor:pointer` fires only on the pointer-cursor root.** `cursor` is an
  inherited property, so 49.4% of all 148,373 observed elements compute to
  `pointer` — mostly from a parent. Only an element whose nearest observed
  ancestor is *not* `pointer` may qualify. Measured: that single global CSS rule
  takes the heuristic tier from **13,874 candidates down to 114**, with no
  per-site threshold anywhere
- **Nothing is deleted for being hidden or disabled.** A hidden mobile menu button
  is a candidate with `effectiveVisible:false`; a disabled control keeps its
  `disabled` state and guard. Both may become operable after some other
  interaction, so the state is recorded and the candidate preserved
- **Guards, never a safety claim.** `guardFlags[]` (`form-submit`, `file-input`,
  `navigation`, `disabled`, `hidden`, `pointer-disabled`, …) tell the next stage
  what to be careful with. There is no `safe: true` field anywhere
- Handler and `data-*` evidence store the attribute **NAME only** — never the
  JavaScript source, never an arbitrary framework value. No site-specific or
  library-specific rule exists (`data-radix-*`, `data-headlessui-*`, class names
  like `accordion` are all deliberately unused)
- Existing observation artifacts are **immutable input**: verified across all 784
  Task 09 files (mtime + size unchanged). Task 10 only adds two file kinds.
  Isolated under `src/interaction-detector/`; zod-validated (schema v1). Fixture
  test: `pnpm smoke:interaction-detector` (92 checks)

**Measured result.** All four site runs analyzed from disk with **0 network
calls**, in 2.1 s total for 148,373 elements:

| site | pages | desktop | mobile | P1 | P2 | P3 | targets | unresolved | added | time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 6 | 187 | 187 | 110 | 264 | 0 | 98 | 0 | 460.5 KB | 190 ms |
| seoworld.co.kr | 19 | 214 | 214 | 32 | 346 | 50 | 32 | 0 | 518.3 KB | 246 ms |
| nextjs.org | 15 | 688 | 688 | 322 | 990 | 64 | 42 | 118 | 1.76 MB | 1,062 ms |
| developer.mozilla.org | 12 | 464 | 464 | 928 | 0 | 0 | 928 | 0 | 1.47 MB | 623 ms |
| **total** | **52** | **1,553** | **1,553** | **1,392** | **1,600** | **114** | **1,100** | **118** | **4.18 MB** | **2,121 ms** |

Every one of the 2,992 native controls in the observations was detected (0 missed),
no element produced two candidates, and all 1,392 P1 candidates trace to a real
ARIA state attribute or a native `<details>/<summary>`. The added artifacts are
1.19% of the 350.86 MB of deep observation they index.

Two findings point straight at the next phase: **118 of nextjs.org's 152 control
relations do not resolve**, because Radix mounts dropdown/dialog content only when
it opens — the boundary of static observation in real data. And seoworld's empty
tool shells yield exactly 3 candidates (the site header), which is recorded as
*"no interaction candidate was observable in the saved initial static state"* —
never as "this page has no interactions". See
`docs/result/10-interaction-candidate-detection-2026-08-13.md`.

### Task 11 — Safe Rule-Based Interaction Exploration

```
interaction-analysis.json (Task 10, immutable input)
→ OFFLINE  page selection → eligibility → shape dedup → budget → interaction-plan.json
           deterministic, timestamp-free, byte-identical across runs
→ LIVE     ONE Chromium process
             per action: fresh anonymous BrowserContext
               → load + settle → ARM guards
               → re-identify the candidate in the LIVE DOM (4 exact strategies)
               → live signal reconciliation (what the Observer never stored)
               → MutationObserver → before snapshot
               → click (never `force`) → 2 rAF + settle + bounded network quiet
               → after snapshot → deterministic state diff
               → context.close()   ← this IS the restore strategy
→ data/<host>/interaction-explorations/<run-id>/
```

Answers "**what actually changes when you click?**" — and deliberately not "what
pattern is this?". `aria-expanded false→true` plus `target hidden→visible` is
recorded as exactly that; Accordion / Tabs / Modal / Dropdown naming is Task 12.

- **`candidate.elementId` is never a locator.** `e000042` indexes one saved DOM
  walk; one extra `<div>` renumbers everything after it. Every planned action
  carries a `LocatorDescriptor` built offline from the candidate + `dom.json`
  (tag / id / role / type / name / aria-label / title / placeholder / text /
  semantic ancestor path / structural path), and the live run re-finds the
  element from that alone. The whole `class` string, every `data-*` value, and
  `aria-controls` are excluded from identity; geometry is diagnostic only
- **Four exact strategies, no similarity score**: `id-exact` (an HTML id is a
  *hint* — Next.js/Radix ids like `_R_6spaivb_` change between renders, so a hit
  must still pass semantic verification and a miss must fall through),
  `semantic-exact`, `semantic-ancestor`, `structural-path`. Only **exactly one
  verified match** may be acted on; a structural path may pick from the semantic
  match set (responsive sites ship the same control twice) but never from
  outside it. Otherwise the answer is `ambiguous` and nothing is clicked
- **Not every candidate is executed.** 3,106 candidates become **161 actions**:
  guards (`form-submit` / `file-input` / `navigation` / `disabled` / `inert` /
  `pointer-disabled`) exclude 140, hidden candidates are preserved but not run
  (1,018), P3 is never run (114), a conservative P2 allowance admits only
  checkboxes/radios and icon-only native buttons (307 refused), deterministic
  **interaction-shape deduplication** collapses 1,080, and global budgets
  (8/viewport, 16/page, 80/site) drop 38. Every one of them is in `skipped[]`
  with a reason — nothing is silently discarded
- **Safety is two independent layers.** The plan excludes guarded candidates
  before a browser exists; the live run then blocks main-frame navigations,
  closes popups immediately, cancels downloads, dismisses dialogs, and aborts
  every non-GET request (`POST`/`PUT`/`PATCH`/`DELETE`) once the initial load is
  done. A blocked analytics beacon is an accepted cost and is counted, not hidden
- **Fresh `BrowserContext` per action**, always anonymous: no user cookies, no
  login session, no saved passwords, no storage-state reuse. Restoration is
  context disposal rather than a fragile "click it again to close it"
- **A URL change invalidates the diff.** One `<button>` inside an `<a href>` on
  domainchecker produced 96 containers added and 113 removed purely because the
  client-side router swapped the document. `meaningfulChange` is forced to false
  whenever the URL moved, so page replacement can never masquerade as a state
  transition. Measured effect: 5 false `changed` results removed
- No retry, no recursive exploration (1 action deep), no screenshots by default,
  no pattern naming, no AI. Isolated under `src/interaction-explorer/`;
  zod-validated (schema v1). Fixture test: `pnpm smoke:interaction-explorer`
  (95 checks, real Chromium + local HTTP server)

**Measured result.** All four sites explored live, **161 planned actions, 100%
locator resolution, 0 ambiguous, 0 not-found**:

| site | candidates | actions | resolved | executed | changed | no-change | dynamic targets mounted | elapsed | storage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 374 | 23 | 23 | 23 | 13 | 10 | 0 | 56.6s | 637.3 KB |
| seoworld.co.kr | 428 | 23 | 23 | 23 | 23 | 0 | 0 | 45.5s | 299.3 KB |
| nextjs.org | 1,376 | 80 | 80 | 79 | 45 | 34 | **9** | 180.2s | 2.68 MB |
| developer.mozilla.org | 928 | 35 | 35 | 35 | 33 | 2 | 0 | 59.6s | 918.3 KB |
| **total** | **3,106** | **161** | **161** | **160** | **114** | **46** | **9** | **341.9s** | **4.49 MB** |

The headline finding answers Task 10's open question directly: **all 9 planned
nextjs.org triggers whose `aria-controls` target did not exist in the saved DOM
mounted that target after the click** (+18 interactive descendants inventoried) —
the boundary of static observation, crossed. And **0 of the 114 `changed` results
are driven only by container-inventory churn**: every one is anchored to the
candidate's own state, its declared target, or a native `<details>`. See
`docs/result/11-safe-rule-based-interaction-exploration-2026-08-13.md`.

### Task 12 — Interaction Pattern Modeling & Unknown Interaction Strategy

```
interaction-exploration.json (Task 11, immutable input)
→ zod + cross-file validation (fail-fast: plan↔result, viewport, provenance, counts)
→ per action: ActionFacts   the only view a rule may read
→ eligible?  status=changed ∧ ¬navigation-tainted
    YES → 10 deterministic rules, ALL evaluated, winner by specificity
            └→ InteractionPatternInstance   (provenance: derived)
    NO  → 9-reason unknown taxonomy
            └→ UnknownInteractionCase       (provenance: derived)
→ data/<host>/interaction-models/<run-id>/
    interaction-patterns.json + unknown-interactions.json
    [--ai]  ai-analysis.json                (provenance: inferred)
```

Answers "**which reusable UI behavior is this verified transition — and when it is
none, why?**". Offline deterministic processing: **0 Firecrawl calls, 0 Playwright
launches, 0 network requests, 0 AI calls** by default. It performs no interaction;
it interprets evidence Task 11 already recorded.

- **A rule list, not an if/else chain.** Each rule carries an id, a version, a
  specificity, and readable `requiredEvidence` / `optionalEvidence` /
  `rejectionConditions` — and the whole ruleset is published into
  `interaction-patterns.json`, so "what decided this, on what grounds?" is
  answerable from the artifact without the source. `registryVersion` is separate
  from `schemaVersion`: the schema can hold still while the rules move
- **Every rule is evaluated; specificity picks the winner.** `aria-expanded` +
  `aria-haspopup=menu` + a mounted `role=menu` is a correct disclosure AND a
  correct menu — menu wins, exactly one instance is produced, and the outranked
  rule is recorded in `limitations` rather than vanishing. All ten specificity
  values are distinct, and an equal-specificity tie is **recorded as a registry
  conflict**, never resolved by a coin flip (0 conflicts across 161 actions)
- **Taxonomy v1 is small and earned**: `disclosure` `tabs` `menu` `dialog`
  `toggle` `selection` `dismiss` `generic-state-toggle`. No `carousel`, `slider`,
  `parallax` or `mega-menu` — nothing in the corpus could confirm one, and a
  registry entry nothing can match is a claim, not a rule
- **The rules survive real markup.** A `role=tab` whose `aria-controls` points at
  itself and then drifts to a fresh generated id is still a tab (6/6): the
  control relation is supporting evidence, never a requirement. A `role=combobox`
  with **no** `aria-haspopup` opening a `role=listbox` is still a menu (9/9),
  because the region that opened is allowed to declare what it is
- **`no-change` is not one thing.** Task 11's 46 no-change results decompose into
  five distinct causes — `already-in-target-state` 33, `navigation-tainted` 5,
  `style-only-change` 5, `blocked-navigation` 2, `opaque-action` 1 — and the
  first-match-wins order encodes which cause *explains* the others when several
  are true at once
- **A URL change disqualifies an action before any rule runs.** before/after
  describe two different pages, so no amount of DOM difference may become pattern
  evidence. The URLs are still kept, compactly, for future SPA modeling
- **Nothing is named that cannot be evidenced.** seoworld's mobile hamburger
  signals open/closed by flipping `aria-label` from "메뉴 열기" to "메뉴 닫기".
  That is a real transition, `aria-label` is not a state attribute, and no
  close-word dictionary exists in this repo — so all 16 stay
  `unmatched-transition`. They are the entire gap between 100% and the measured
  86.0% changed-coverage, and that gap is the honest number
- **Exact accounting is a code-level invariant**: `patterns + unknowns == actions`,
  `changed == patterns + changed-unknowns`, `no-change == its reason counts`. A run
  whose numbers do not add up throws instead of writing authoritative-looking files
- **AI is a boundary, not a feature.** `analyze(cases) → analyses` is the whole
  provider surface; only a deterministic `fake` test provider ships. AI sees a
  compact **allowlisted** payload (never HTML, DOM, styles, cookies, storage,
  request bodies, or a URL with its query string), receives **one representative
  per eligible signature group** rather than one per occurrence, and returns
  `inferred` results into a separate file. `--ai` with no provider prints one line
  and still writes both deterministic artifacts
- Isolated under `src/interaction-patterns/`; zod-validated (schema v1, registry
  v1); additive to a separate run namespace. Fixture test:
  `pnpm smoke:interaction-patterns` (88 checks, fully offline)

**Measured result.** All four Task 11 runs modeled from disk with **0 network
calls**, 161 actions in 199 ms, adding 382.7 KB (8.3%) to 4.49 MB of exploration:

| site | executed | changed | patterns | unknown | changed coverage | executed coverage |
| --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 13 | 13 | 10 | **100.0%** | 56.5% |
| seoworld.co.kr | 23 | 23 | 7 | 16 | **30.4%** | 30.4% |
| nextjs.org | 79 | 45 | 45 | 35 | **100.0%** | 57.0% |
| developer.mozilla.org | 35 | 33 | 33 | 2 | **100.0%** | 94.3% |
| **total** | **160** | **114** | **98** | **63** | **86.0%** | **61.3%** |

98 patterns: `disclosure` 50, `selection` 30, `menu` 9, `tabs` 6, `dismiss` 3.
`dialog`, `toggle` and `generic-state-toggle` matched **0** on real data and are
reported as zero rather than left to look like coverage.

The cost result is the other headline: 63 unknown occurrences collapse into 13
signature groups, of which **4 are AI-eligible — so an enabled AI pass costs 4
calls, not 63** (93.7% fewer). nextjs.org alone contributes 35 unknowns and
exactly 1 of them is worth asking about. See
`docs/result/12-interaction-pattern-modeling-and-unknown-strategy-2026-08-13.md`.

### Task 14 — Next.js Reconstruction Engine

```
site-spec.json (Task 13, immutable input — the ONLY input)
→ loadSiteSpec()                    the one door; version-checked, fail-fast
→ ReconstructionPlan                routes · breakpoint · runtime trees · CSS ·
                                    assets · interaction bindings · every count
→ data/<host>/reconstructions/<run-id>/
    reconstruction-manifest.json
    app/                            Next.js 16 + React 19 + TypeScript
      app/[[...slug]]/page.tsx      ONE catch-all route for the whole site
      src/runtime/                  server loaders + node renderer +
                                    InteractionRuntime + FormSafetyRuntime
      reconstruction-data/          compact runtime derivative (NOT a SiteSpec copy)
      public/wr/generated-styles.css
```

Answers "**can this SiteSpec alone produce a site that runs?**". The generator is
offline and deterministic: **0 Firecrawl calls, 0 Playwright launches, 0 network
requests, 0 AI calls, 0 asset downloads**, and it writes only into its own
`reconstructions/` namespace.

- **Task 14's consumer surface is the SiteSpec, and only the SiteSpec.** No Task 09
  `dom.json`, no Task 11 action file, no Task 12 pattern file is opened — the
  fixture proves it by deleting the entire Task 06–12 tree before generating, and
  proves the *runtime* side by deleting the SiteSpec before `next build`
- **112 verified URLs → 112 clone routes, 1:1.** One `[[...slug]]` route and a
  route map, not 112 page files. The lookup key is a normalized pathname plus a
  sorted query, so `/search?q=a` and `/search?q=b` are two different pages while
  `?a=1&b=2` and `?b=2&a=1` are one. A path outside the table is the clone's own
  404 — never a quiet fallback to "a similar page"
- **Render coverage and behavior coverage stay two axes.** A family-represented
  route renders the representative's tree AND says so
  (`data-wr-render-coverage="family-represented"`, `verifiedOnThisRoute=false`).
  Implementation reuse is not evidence promotion
- **The 157 MB of SiteSpec never reaches a browser.** The page tree is a Server
  Component reading a compact server-only derivative; what crosses to the client is
  one generic runtime that reads `data-wr-*` attributes off the DOM. Measured: the
  client chunk total is **567 KB for all four sites**, identical byte count whether
  the SiteSpec was 11 MB or 83 MB, with 0 SiteSpec fields and 0 page text in it
- **HTML → React is an explicit adapter layer**, not scattered special cases:
  `for`→`htmlFor`, `colspan`→`colSpan` (number), boolean attributes → `true`,
  `checked`→`defaultChecked`, `<option selected>` → the parent select's
  `defaultValue`, `<textarea>` text → `defaultValue`. Measured 0 React warnings and
  0 console errors across every page opened
- **Style truth stays exact computed style.** `styleTokenId st000123` becomes
  `.wr-st000123` with the browser's own values — no Tailwind, no semantic token, no
  global reset (every element already carries its complete computed style, so a
  reset could only add error)
- **Verified behavior only.** 98/98 confirmed patterns become runtime bindings
  (27 native, 71 scripted); 63 unknown cases become inert `data-wr-unknown`
  annotations. seoworld's 16 `메뉴 열기` triggers stay unknown, nextjs's 9 dynamic
  menus mount an **empty** region with the observed tag and role, and no behavior
  is invented anywhere
- **Nothing the SiteSpec excluded comes back.** 0 source `class` / `style` /
  `data-*` / `on*`, 0 form action endpoints, 0 original scripts in any generated
  app; every form submit is `preventDefault`ed in the capture phase
- Isolated under `src/reconstruction/`; zod-validated manifest; deterministic
  (same SiteSpec → byte-identical output, verified 4/4). Fixture test:
  `pnpm smoke:reconstruction` (178 checks — generate → build → start → Chromium)

**Measured result.** All four SiteSpecs reconstructed and built:

| site | routes | rendered 200 | element nodes | style rules | CSS | runtime data | bindings | unknowns | generation | next build | JS errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| domainchecker.co.kr | 19 | **19** | 6,658 | 1,615 | 3.18 MB | 1.15 MB | 13 | 10 | 208 ms | 2.85 s | **0** |
| seoworld.co.kr | 30 | **30** | 9,188 | 2,198 | 4.35 MB | 1.44 MB | 7 | 16 | 253 ms | 2.71 s | **0** |
| nextjs.org | 40 | **40** | 87,191 | 4,068 | 8.63 MB | 12.52 MB | 45 | 35 | 1,007 ms | 2.62 s | **0** |
| developer.mozilla.org | 23 | **23** | 45,336 | 2,824 | 5.95 MB | 6.62 MB | 33 | 2 | 586 ms | 2.52 s | **0** |
| **total** | **112** | **112** | **148,373** | **10,705** | **22.1 MB** | **21.7 MB** | **98** | **63** | **2.05 s** | **10.7 s** | **0** |

164.9 MB of SiteSpec becomes 46.1 MB of generated app (28.0%) — a derivative, not a
copy. See `docs/result/14-nextjs-reconstruction-engine-2026-08-14.md`.

### Task 16 — Full End-to-End Reconstruction

```
pnpm e2e:reconstruct <url>
  → discovery → verification → selection → deep observation
  → interaction detection → exploration → pattern modeling
  → SiteSpec → Next.js reconstruction → next build
  → QA (+ --auto-fix) → [family escalation → recompile → rebuild → re-QA]
  → generated-app independence audit
  → data/<host>/e2e-runs/<run-id>/e2e-manifest.json
```

One URL in, one runnable independent Next.js app plus one machine-readable
manifest out. The orchestrator adds no observation, no interpretation and no
generation of its own; what it adds is the two properties that make a
thirteen-stage pipeline trustworthy:

- **Every stage is its own module's public API, called in one process.** There
  is no `exec("pnpm verify …")` anywhere, so a stage boundary is a TypeScript
  contract and a failure is an exception carrying a phase, not an exit code.
- **Every artifact path is passed explicitly from this run's context.** Nothing
  searches the filesystem for "the newest file". `assertLineage()` re-checks the
  chain before the SiteSpec compile, because a pipeline that silently mixed two
  runs would produce a manifest that reads perfectly and describes two different
  sites.

`finalStatus` is a classification, not a grade: `complete` /
`complete-with-known-limitations` / `partial` / `failed`. There is no overall
score anywhere in this repo, and the middle value is what an honest run of a
real site usually is.

**Upstream hardening this Task shipped**, each measured by Task 15 first and
fixed here:

| what | Task 15 evidence | Task 16 change |
| --- | --- | --- |
| **A1 asset occurrence** | 325 `asset-missing` on nextjs.org, all one bug | `collect-assets.ts` deduplicated URL assets on `type\|url`, so the second `<img>` on a shared URL got no record and compiled to `assetRefs: []`. Dedup now keys on the element too; the SiteSpec catalog still collapses them to one asset |
| **A2 nested scroll** | 19,739px median y delta on one MDN page whose document height matched exactly | The Observer records `scrollState` on real scroll containers (`scrollHeight > clientHeight` ∧ `overflow` `auto`/`scroll`, never `<html>`/`<body>`); the SiteSpec carries it, the clone emits `data-wr-scroll-top`, and the client runtime restores it two frames after hydration |
| **A3 grid placement** | `grid-template-rows` 78 / `grid-template-columns` 74 mismatches with no way to see WHERE items landed | `grid-template-areas` · `grid-area` · `grid-auto-flow` · `grid-auto-rows` · `grid-auto-columns` · `place-items` · `place-content` · `place-self` · `order` added to the Observer style whitelist |
| **dynamic target contents** | 9/9 nextjs menus `dynamic-target-content-unobserved` | The explorer captures a newly-mounted target's subtree with the **Observer's own walk**, bounded at 300 elements / depth 12 / 20,000 chars; the SiteSpec carries it as a `dynamicTemplate` marked `observed` / `after-action`; the clone mounts it instead of an empty region |

Schema versions moved with them — observation v3→**v4**, SiteSpec v2→**v3**,
exploration v1→**v2** — and every reader accepts BOTH, because every addition is
an optional field and item 26 forbids rewriting a historical run. `siteSpecVersion`
stays **1**: a v1 renderer run against a v3 SiteSpec produces a more accurate
page, not a wrong one.

Isolated under `src/e2e/` (18 files); CLI `src/cli-e2e-reconstruct.ts`; fixture
test `pnpm smoke:e2e` (104 checks — a local synthetic site through the REAL
chain, no artifact injection anywhere). See
`docs/result/16-full-e2e-reconstruction-2026-08-14.md`.

### Task 16 final correction — the DOM→HTML→DOM round trip

The fresh stripe.com run shipped with two defects that shared one cause: **the
clone receives the observed DOM as HTML, and HTML cannot express everything a
DOM can hold.**

| what | symptom on stripe.com | fix |
| --- | --- | --- |
| **parser-invalid nesting** | React error #418 on 15 of 19 pages (30 occurrences); the same edge also made Task 13's `rendered.html` alignment fall back on those 30 page/viewports, costing supplemental attribute recovery | The Observer saw a script-built `<li>` inside an `<li>` — legal for `appendChild`, impossible for the parser, which closes the outer tag and hands React a tree with the two as siblings. `src/reconstruction/nesting.ts` detects every edge the tree-construction stage would rewrite and expresses the relationship the way HTML requires (`<li><ul><li>`), with the interposed container at `display: contents` so no box is added. Anything it cannot express losslessly is refused, not shipped |
| **pseudo-element stacking** | 15 verified interactions `unverifiable` — Playwright could not click stripe's nav at all | `PSEUDO_STYLE_WHITELIST` carried every property needed to PAINT a decorative `::after` and not the one that puts it behind: `z-index`. Reconstructed at `z-index: auto`, a white full-bleed bar meant for *behind* the header covered it and swallowed every click. `z-index` and `pointer-events` are now observed on pseudo-elements |

Both are generic — no site condition, no `suppressHydrationWarning`, no
client-only escape — and both are covered by a minimal reproducer **and** a
negative fixture in `pnpm smoke:reconstruction`, which also proves in a real
browser that the naive serialization *is* rewritten by the parser and the
adapted one is not.

`finalStatus` now reads clone JavaScript errors. Task 16 could report
`complete-with-known-limitations` while every page threw, because status was
computed from diff classifications and an exception is not a diff; a clone that
throws is now `partial`. See
`docs/result/16-final-hydration-correction-2026-08-16.md`.

### Task 17 — Exact Reconstruction Fidelity Hardening

The Task 16 Manual Visual Review found three defects the automatic QA could not
see — no homepage, `28/28 behaviorEquivalent` coexisting with 2/28 correct
user-visible after-states, and wide-viewport layout drift. Task 17 hardens the
pipeline against all of them, generically:

- **Root URL Invariant.** The candidate set is now
  `normalize(provider.links UNION rootUrl)` — the input root is seeded when the
  discovery provider omits it (`rootSeeded`, discovery schema v2). The E2E
  manifest tracks `inputRootIncluded / Verified / SelectedOrRepresented /
  Reconstructed`, and a run whose root verified but was not reconstructed can
  never classify `complete`.
- **Behavior metric split.** `behaviorEquivalent` is renamed for what it
  measured: `triggerStateEquivalence` (declared attribute transitions) is now
  published beside `userVisibleTargetEquivalence` (did the user actually see
  the after-state?). Absent target evidence is `not-observed` / `not-declared`,
  never `equivalent`. Historical artifacts are untouched; the split lives in
  QA schema v2.
- **Generic user-visible target discovery.** The explorer records a bounded
  pre-click baseline (existence + visibility, Observer walk policy) and diffs
  it after the click: hidden→visible roots, newly-mounted subtree roots,
  in-place content replacement (removals + mounts in a stable host), and
  visible→hidden roots — each with declared-relation evidence
  (`aria-controls` / `popovertarget` / `<summary>` / `href="#id"`) when the
  markup offers any, and observed evidence when it offers none. Every
  discovered region carries descriptor + structural path + before/after state
  + content fingerprint + a bounded Observer-walk capture (exploration schema
  v3). No site-specific selector exists anywhere in the channel.
- **Observed-target reconstruction.** Discovered targets flow through pattern
  instances (schema v2) into the SiteSpec (`observedTargets` on compiled
  patterns, resolved by html id or exact structural path) and into the clone:
  existing hidden regions are revealed with their OBSERVED open-state paint
  (per-target CSS at higher specificity), regions that gained or replaced
  contents mount the captured after-state subtree with the same safe node
  construction as dynamic templates, and unresolved mounts reuse the Task 16
  mount mechanism. The runtime interprets one `data-wr-obs` annotation; no
  `innerHTML` anywhere.
- **Interaction QA on both axes.** QA replays now compare trigger state AND
  target existence / visibility direction / content fingerprint (geometry
  recorded, not gated) per observed region on both sides, and capture the
  Manual Visual Review's four before/after screenshots per pattern under the
  QA run's `interactions/` directory.
- **Layout rule recovery.** The Observer records the layout-critical AUTHORED
  declarations the browser itself matched to each element
  (`document.styleSheets` + `element.matches`, closed property allowlist,
  observation schema v5) and runs a lightweight multi-width layout probe
  (390/768/1024/1440/1920 — one load, `setViewportSize`, DOM-identity across
  widths). The SiteSpec carries both; the generator's deterministic inference
  turns them into recovered rules — centered max-width (`max-width` +
  `margin-inline: auto`), full width, percentage width, responsive
  hide/show — each emitted at higher specificity than the exact computed
  class and each required to reproduce the observed truth-viewport geometry.
  Styling priority is structural: recovered rule → observed responsive rule →
  exact computed fallback, and a page with no probe generates exactly as
  before.

**Measured result** (fresh stripe.com E2E,
`e2e-runs/2026-08-17T14-40-16-120Z`): the provider again returned no root and
the seeded `/` verified, was selected and reconstructed (`inputRoot*` 4/4);
20/20 routes rendered with 0 runtime errors and content exact ratio 1.0. The
explorer discovered **79 user-visible target regions** on 39 of 55 actions
(58 existing-visibility / 16 newly-mounted / 4 content-replaced / 1 with
mounted content, all 79 with a bounded open-state capture), and the split
metrics read **triggerState 23/25 equivalent · userVisibleTarget 17/25
equivalent, 3 mismatch, 5 not-declared** — where Task 16's honest number was
2/28. All 16 observed pages carried an aligned layout probe; **4,775 layout
rules** were recovered, and the `/use-cases/saas` centered-container drift the
Manual Visual Review found by hand went from **480px @1920 / 608px @2048 to
0px at 1440, 1920 and 2048** (homepage and every other checked route also
0px). All 10 smoke suites pass with the final code — 1,360 checks.

SVG internal paint remains a known limitation (deliberately out of scope). See
`docs/result/17-exact-reconstruction-fidelity-hardening-2026-08-17.md`.

### Task 17.1 — Exact Reconstruction Final Acceptance Correction

Task 17's three remaining user-visible interaction mismatches and five
`not-declared` patterns turned out to be five symptoms of ONE generic
observation blind spot, confirmed by live probing: framework portals. stripe's
locale listbox, bento dialog and mobile menu all mount inside a body-level
wrapper whose own rect is **0×0** (every child is `position: fixed/absolute`),
so the mounted root failed the discovery visibility gate — and the
`aria-controls` relation that names the panel only appears AFTER the click.
Task 17.1 closes the blind spot end to end, generically:

- **Discovery**: descend into invisible mounted roots (portal descent), admit
  declared-after-click elements that demonstrably changed as candidates,
  dedupe nested candidates to the outermost (a panel inside a fixed overlay
  must not be mounted without its positioning context), and record each
  mounted region's nearest BASELINE ancestor as its mount host in
  baseline coordinates (exploration schema v4).
- **Capture**: adaptive bounded expansion — only a capture that RECORDED a
  truncation retries once under expanded caps (1,200 elements / depth 48 /
  80k chars; the dialog nests 25+ levels), with a capture-only per-element
  text cap of 2,000 chars and text-run POSITIONS (`textSegments`) so mixed
  text/element order survives into templates.
- **Reconstruction**: mounted copies attach under their resolved host at the
  observed child index; a captured single root IS the region (no wrapper,
  declared-dynamic mounts included); template style tokens are finally
  emitted into the stylesheet (mounted regions had rendered unstyled since
  Task 16); mount-kind targets get the open-state ROOT style graft (the
  `height: 0px` closed-state pin); and a region that CONTAINS its own trigger
  is never content-replaced (`observed-target-contains-trigger`) — that
  destruction was the entire trigger-mismatch story.
- **QA**: regions are addressed by discovery id (`wr-obs-<pattern>-<dtN>`),
  content is compared by textLength even when a side has no sample, and the
  contains-trigger case is a NAMED limitation
  (`trigger-inside-target-content-not-replayed`), never a silent pass.

**Measured result** (fresh stripe.com E2E, `e2e-runs/2026-08-17T21-23-33-002Z`):
**27/27 triggerStateEquivalent and 27/27 userVisibleTargetEquivalent — 0
mismatch, 0 not-observed, 0 not-declared** (Task 17: 23/2 and 17/3/0/5). The
five formerly not-declared patterns were all TYPE B discovery gaps and now
verify equivalent. Nothing regressed: `inputRoot*` 4/4 with the homepage
exact-observed, content exact 1.0, document height ≤0.5px, geometry p95 1px,
runtime/hydration errors 0, `/use-cases/saas` centered drift 0px at
1440/1920/2048 (targeted run; the provider's link set drifted this round),
5,317 recovered layout rules on 18/18 probe-aligned pages. The open mega-menu
is pixel-exact at 1440 and keeps identical content at 1920/2048 with a
240–304px left offset (open-state coordinates are truth-viewport observations
— a named limitation), and the mobile visual outlier decomposed cleanly:
source↔source variance 0.005–0.011 vs source↔clone 0.477 — deterministic
font-fallback reflow, an explicit non-goal. All 10 smoke suites pass with the
final code — 1,229 checks (the per-suite table in Task 17 summed to 1,220;
its published 1,360 total was an arithmetic slip). **Exact Reconstruction is
frozen: READY FOR TEMPLATE PHASE.** See
`docs/result/17.1-exact-reconstruction-final-acceptance-2026-08-18.md`.

### Task 18 — Recon Template Foundation & Slot V2

```
SiteSpec (immutable)  +  Exact Reconstruction (immutable)
        ↓ pnpm compile:recon-template
data/<host>/recon-templates/<run-id>/
  manifest.json               recon-template-v1 + lineage back to both inputs
  site-map.json               routes · families · representatives · internal links
  slots.json                  Slot V2 definitions (site-specific key + canonical role)
  default-content.json        original values — renders EXACTLY the exact clone
  slot-bindings.json          slot → DOM occurrence bindings (static + dynamic)
  slot-overrides.example.json manual override surface (exclude/merge/rename/…)
  report/slot-summary.json    human-reviewable catalog
  app/                        the exact app + a server-only slot layer
```

The first step from Exact Reconstruction to an OPERABLE site: keep the cloned
design, layout and verified behavior byte for byte, and separate the CONTENT
into an editable data contract. The Exact Reconstruction stays the immutable
answer sheet; the template is a new compiled artifact beside it.

- **Slot V2 = site-specific key + canonical role.** `home.header.nav.products`
  is this site's key; `navigation.label` is the shared semantic axis. Role
  assignment is deterministic and conservative (landmark ancestry, heading
  levels, anchor containment) — an uncertain slot gets a generic role
  (`content.text` / `link.*`), never a guess. No AI anywhere.
- **Three slot types, closed on purpose**: `text` (one TEXT NODE per binding —
  `<p>Start with <strong>Stripe</strong>` keeps its markup because each segment
  is addressed by child index, never `textContent`), `url` (`<a href>` only;
  script src, stylesheet href, form action and every other infrastructure URL
  is structurally unreachable), `image` (`{src, alt, srcset}` as one object,
  with the measured box, aspect ratio and object-fit recorded as constraints).
  Arbitrary HTML slot values are forbidden by contract.
- **One logical slot → many bindings, across surfaces.** Merging is exact
  equality only (page + landmark + value, or + href + every label segment).
  stripe's `Products` nav label is ONE slot with three bindings: desktop
  static, mobile static, and the label inside the captured mobile portal menu
  (`data-wr-obs` template node) — so editing it can never leave the mobile
  menu stale. Global scope is promoted conservatively (header/footer content,
  identical on every non-locale page, ≥2 pages); everything uncertain stays a
  page slot, and the manual override file can merge later.
- **Anti-over-slotting is generic evidence, not site rules**: `aria-hidden`
  subtrees (stripe's invoice-mockup visuals: 14,301 candidates excluded),
  `role=presentation`, opaque inline SVG, whitespace-only text; very large
  uniform sibling lists (≥16, e.g. the 200-entry locale menu) stay slots but
  are flagged `review`.
- **The applier is one server-only hook.** `load-page.ts` applies slot values
  to the parsed runtime tree BEFORE React renders — no querySelector patching,
  no MutationObserver, no innerHTML, hydration 0 by construction. Every
  binding carries the value it expects to find and skips loudly on mismatch,
  and re-serializes a `data-wr-obs` payload only when a dynamic value actually
  changed.
- **Lossless by proof, twice.** Compile-time: every binding resolves in the
  emitted app and `default == expected` for all of them (24,512/24,512 on
  stripe). Browser: `pnpm qa:recon-template` builds and serves BOTH apps and
  compares template(default) against the exact clone — not the live site, so
  source drift cannot contaminate the measurement.

**Measured (stripe.com, Task 17.1 accepted artifacts):** 9,529 slots (6,292
text / 3,178 url / 59 image; 150 global; 2,079 review) from 24,512 bindings
(22,591 static + 1,921 dynamic-template) across 20 routes; 18,672 candidates
excluded on evidence; compile 1.9s, fully offline. Default parity: **46/46
page-width pairs content-equal and structure-equal at 390/1440 (+1920/2048 on
home, customers, media-entertainment), doc-height delta 0px, geometry p95 0px,
runtime 0, hydration 0**; interaction regression 8/8 equivalent; mutation
canary (hero headline, CTA label + href, nav label, image alt via the overlay
file — the artifact itself is never edited) **15/15 occurrences applied
including inside the mounted mobile menu**, structure unchanged, runtime
clean. The targeted `/use-cases/saas` lineage compiles and passes the same QA
at all four widths (568 slots, 1,245/1,245). Fixture test:
`pnpm smoke:recon-template` (58 checks — synthetic SiteSpec through the REAL
reconstruction generator, then the REAL template compiler, then build → start
→ Chromium). See
`docs/result/18-recon-template-slot-v2-foundation-2026-08-18.md`.

### Task 19 — Natural Language Content Injection Foundation

```
Recon Template (Task 18, immutable)
        ↓ pnpm content:prepare <template-manifest> --intent "<natural language>"
data/<host>/content-runs/<run-id>/
  intent.json               the user's words, verbatim + immutable (hash in manifest)
  content-policy.json       content-policy-v1 — the FIXED system policy copy
  template-summary.json     bounded facts (never the raw slot inventory)
  content-units.json        deterministic writing units (groupId/role/section rules)
  generation-request.json   batched, prompt-budgeted request + output schema
        ↓ pnpm content:generate <run> (--provider fake | --result <json>)
  generation-result.json    versioned JSON (values + provenance + needs-input)
  slot-values.json          the overlay — the ONLY thing applied to the site
        ↓ pnpm content:qa <run>   (and content:preview / content:validate)
  report/                   validation · brand-leak · layout-qa · operator-review
                            · screenshots (default vs injected)
```

Turns one natural-language sentence into a rewritten site WITHOUT touching the
template: the LLM never sees the 9,529 raw slots (a deterministic Content Unit
Builder groups them into bounded writing units), its output is versioned JSON
that must pass a deterministic validator (unknown keys fail, HTML/`javascript:`
rejected, review slots protected, provenance required), and the only path to
the page is Task 18's official overlay (`WR_SLOT_VALUES_FILE`).

- **Provider-neutral by contract.** `ContentGenerator` is the whole surface: a
  deterministic fake provider for tests, a manual JSON seam for the MVP
  (Claude Code reads the packet, authors the result), and any future remote
  API — the engine never changes.
- **Facts are never invented.** Metrics, customers, testimonials, phone
  numbers, legal names and unspecified external destinations become
  `needs-input` (with reasons), and retained source-brand content is reported
  as `source-brand-leak` warnings — never silently shipped.
- **Layout Safety QA asks the right question**: not "is it identical?" (the
  content changed on purpose) but "did the layout survive?" — clipping,
  horizontal overflow, section collision, sibling overlap, stale-twin desync,
  runtime/hydration errors, applied-value verification on every changed
  binding (static + mounted dynamic portal templates), and interaction
  regression, with reference line counts kept as diagnostic evidence.
- **The stripe.com homepage canary** (Korean AI-automation intent): 370 units
  → 357 validated values + 68 needs-input; layout QA 3/3 page-widths PASS
  (390/1440/1920), applied 438/438, interactions 8/8, runtime/hydration 0,
  doc-height Δ 0px — with the desktop mega-menu and the click-mounted mobile
  portal menu fully rewritten. The first QA round honestly FAILED and yielded
  a new generic detector: **aria-hidden paint-twin desync** (Stripe paints its
  hero headline twice; injecting only the slotted copy double-exposes — now
  detected deterministically and excluded from text-rewrite repair).
- **Bounded repair loop** (max 2 iterations): rewrite flagged CONTENT only,
  from evidence (current sentence + reference constraints + measured line
  counts + overflow evidence) — the LLM can never touch CSS or layout.
- Operators stay in charge: `slot-values.json` is hand-editable, and
  `content:validate` / `content:preview` / `content:qa` re-run without any
  LLM call. Isolated under `src/content-injection/`; fixture test
  `pnpm smoke:content-injection` (68 checks). See
  `docs/result/19-natural-language-content-injection-2026-08-18.md`.

### Task 19.1 — Visible Content Injection Completeness (Content Injection FROZEN)

Closes the two "user-visible but unchangeable" gaps the Task 19 canary named,
as ADDITIVE Slot V2 v2 extensions compiled into a NEW template run (historical
artifacts untouched; v2 readers still load v1 artifacts):

- **Paint-twin co-binding** (`paint-twin` binding surface). Stripe paints its
  hero headings twice — a visible node plus an `aria-hidden` gradient copy.
  The compiler now attaches the hidden copy to the EXISTING slot as an extra
  occurrence, but only under simultaneous deterministic evidence: same
  page+viewport, byte-equal text, aria-hidden boundary, common ancestor ≤ 4
  hops, and observed boxes byte-identical or ≥ 50%-overlapping. No aria-hidden
  content becomes editable; the layers simply can never desync again. The
  stale-twin detector still fails unsynchronized duplicates in the same
  landmark section, and downgrades far-section coincidences (decorative
  mockup strings) to non-failing `stale-duplicate-text-remnant` notes.
- **SVG text injection** (`svg-text` binding target). A deterministic scanner
  reads ONLY rendered `<text>`/`<tspan>` character runs out of the opaque SVG
  markup (defs runs count only when mask/href-referenced — exactly Stripe's
  cutout-mask "Sign in" pill). Same-anchor byte-equal runs co-bind into the
  existing DOM label slot; mutation is server-side, entity-escaped string
  surgery on the addressed run — fill/stroke/gradient/geometry are
  structurally unreachable, and SVG paint restoration stays a named
  limitation.
- **Canary** (same intent hash as Task 19, new template run): 9,529 slots
  unchanged, 24,518 bindings (+4 paint-twin, +2 svg-text), parity 46/46 with
  mutation 17/17; content run: 361 values + 64 needs-input, layout QA 3/3
  PASS @390/1440/1920, applied **450/450** (static 291 + paint-twin 4 +
  dynamic 155), interactions 8/8, runtime/hydration 0, `blocked-visible-
  source-content` blockers 0 — the hero headline is finally rewritten (both
  layers, zero double text) and the SVG "Sign in" pill renders 로그인.
  See `docs/result/19.1-visible-content-injection-completeness-2026-08-18.md`.

### Task 20 — Theme Extraction, Token Contract & Theme Adapter Foundation

```
Recon Template (Task 19.1, frozen)
        ↓ pnpm theme:extract <template-manifest>
data/<host>/theme-extractions/<run-id>/
  original.theme.json       the site's current design as contract tokens (export candidate)
  site-theme-adapter.json   token → THIS site's paint occurrences (wr-st… identity)
  paint-groups.json         every deterministic paint identity, incl. raw groups
        ↓ pnpm theme:check / theme:preview <template-manifest> --theme <file> --adapter <file>
data/<host>/theme-runs/<run-id>/
  selected-theme.json  theme-adapter.json  theme-overlay.css  compatibility.json  qa.json
        ↓ pnpm theme:qa <theme-run>
```

Theme is a **visual skin, never a redesign**: colors, border colors, radius and
shadow may change; width/margin/padding/grid/flex/position/DOM order
structurally cannot. Three artifacts stay strictly apart — the **Theme File**
says what the colors are (site-agnostic, closed `theme-contract-v1` token
vocabulary; a CSS selector, className or nodeId has no field to live in), the
**Site Theme Adapter** says where they land (this site's `.wr-st…` classes and
node-scoped rules — site A's `.wr-st00123` and site B's `.wr-st90882` can both
mean `color.action.primary`), and the **Theme Overlay** is CSS appended AFTER
the template app's own stylesheet at the serve boundary, so the frozen
template's bytes and no-theme behavior are untouched by construction.
Composition order is fixed: Template → Content Overlay (env) → Theme Overlay
(stylesheet append) → Render; the two overlays never touch each other's files.

- **Extraction is deterministic evidence, no AI**: document/root paint, heading
  / body / anchor text census over the template's own runtime trees (incl.
  captured dynamic templates), CTA slot paint (with an opaque-own-background
  guard so a text link is never "the action color"), visible-border and
  radius/shadow distributions. An unexplained color stays a RAW paint group
  (`semanticToken: null`, status `review`/`preserved`) — never force-named.
- **Borders are shorthands** in this pipeline (`border-top: 1px solid rgb(…)`),
  so border theming substitutes only the color component and copies the
  observed `width style` prefix byte-for-byte.
- **Compatibility is a gate, not a ranking** (`compatible` /
  `compatible-with-warnings` / `incompatible`): missing required tokens, token
  contrast pre-check (WCAG ratio), preserved-gradient and asset-color
  conflicts, typography-not-applied, and the §23 dark gates — a dark theme on
  an adapter with too much preserved (unbound) dark text is honestly
  `incompatible`, and stripe.com's is (20.7% > 10%).
- **Theme QA re-asks the Content QA question for paint**: DOM identity,
  geometry delta 0, document height 0, runtime/hydration 0, computed paint
  application verified per group (static + pseudo + click-mounted dynamic
  surfaces), browser-computed contrast (new low-contrast text fails),
  interaction equivalence, and changed-paint coverage (§28 — a theme that
  changes nothing is not a success).

**Measured (stripe.com, frozen Task 19.1 template):** 14,057 stylesheet rules
→ **293 paint groups (31 themeable · 180 preserved · 82 review)**, 21 contract
tokens assigned on evidence (`color.text.inverse` honestly unassigned — the
white text value is claimed by `action.primaryText`). Original Theme applied =
**no-op: 3/3 widths (390/1440/1920) DOM identical, geometry max 0px over
1,754–1,763 nodes, height Δ 0px, 67/67 computed-paint checks, 8/8
interactions, runtime/hydration 0**. Curated canary (Task 19.1 injected Korean
homepage + `cool-neutral`): same zeros with the palette visibly swapped —
66,182 element occurrences themed (static 40 / pseudo 24 / dynamic-template 3
verified checks), teal CTAs in the static page, the open desktop mega-menu AND
the click-mounted mobile portal menu. `warm-editorial` swaps onto the SAME
adapter (Level 2: radii flattened, shadows softened) and passes identically.
Fixture test: `pnpm smoke:theme` (47 checks — synthetic paint-rich SiteSpec
through the REAL reconstruction generator, REAL template compiler, then
extraction → adapter → overlay → build → Chromium).

### Task 21 — Source SEO Observation & Production SEO Foundation

```
Stored site-observation run (immutable) + verification.json
        ↓ pnpm seo:observe <site-observation> --verification <file> [--live-site-files]
data/<host>/source-seo-snapshots/<run-id>/
  source-seo-snapshot.json   source-seo-snapshot-v1 — EVIDENCE of the original
                             site's SEO (provenance observed, never edited)
        ↓ pnpm seo:plan <template-manifest> --content-run <dir> --source-snapshot <dir> [--domain …]
data/<host>/production-seo-plans/<run-id>/
  production-seo-plan.json   production-seo-plan-v1 — independent plan for the
                             NEW brand/content/domain (provenance derived)
  rendered-head.json  robots.txt  sitemap.preview.xml|sitemap.xml
  report/needs-input.json  manifest.json (forbidden-copy + brand-isolation checks)
        ↓ pnpm seo:preview / pnpm seo:qa <plan-run-dir>
serve-boundary SEO head overlay → browser QA (report/qa.json + report/link-qa.json)
```

Source SEO and Production SEO are **two data models that share nothing**
(PRODUCT_VISION §9: 원본 SEO를 그대로 복사하지 않는다). The snapshot is an
audit: page-level title / description / canonical / robots / hreflang / OG /
Twitter / JSON-LD / heading outline / image-alt from the stored
`rendered.html` of every observed page, plus site-level link graph, route
depth, orphan candidates (scoped honestly to the observed subgraph),
duplicate titles/descriptions, canonical clusters, broken internal links
(only where a verified non-2xx proves it — unobserved targets are counted as
*unverified*, never "broken"), indexability verdicts, and live-fetched
robots.txt/sitemap (the one bounded network access, opt-in, because no stored
artifact carries those files).

The plan derives every value from the **injected content run** (the Korean
플로우데스크 identity), never from the source: copying a source SEO value is a
checked failure (`forbiddenCopy`), and a derived forbidden-term set (source
host, JSON-LD organization identity, og:site_name, sameAs social links) is
scanned over every rendered production surface (`brandIsolation`). Every value
is classified `known` / `needs-input`: no domain → **preview mode** (robots
`noindex,nofollow`, robots.txt `Disallow: /`, canonical never finalized,
`/sitemap.xml` 404 — a path-only `sitemap.preview.xml` documents the plan) and
business facts (address / phone / prices / reviews / ratings / foundingDate /
sameAs) stay needs-input rather than invented.

- **The serve boundary closes the document-title gap.** The immutable template
  app serves the ORIGINAL observed titles from `route-map.json`
  (`document-title-not-slotted`, known since Task 18). The SEO proxy rewrites
  the title in the head element AND in the RSC flight payload (else React
  would revert the tab title at hydration — QA checks `document.title` *after*
  hydration settle), injects the rendered head block, and answers
  `/robots.txt` + `/sitemap.xml` per domain state. Composition: Template →
  Content Overlay (env) → Theme Overlay (CSS append) → SEO Head Overlay (HTML
  head splice) → Render.
- **Uninjected routes never leak the source title.** Routes outside the
  content run's scope get a needs-input title with the brand name as preview
  fallback — already-known data, nothing invented, no Stripe copy served.
- **Internal Link QA over the production candidate** fetches every route
  through the proxy and classifies anchors: route-resolves / broken-internal
  (outside the verified route table — the clone 404s them by design) /
  source-host-absolute / external / non-navigational. Measurement, not a
  grade.

**Measured (stripe.com, accepted Task 19.1 template + content run):** snapshot
18 pages (augmented accepted observation run) — 0 duplicate titles, 18
self-referential canonical clusters, 89 hreflang alternates on 16 pages, 0
robots meta anywhere, 0 broken internal links among verified targets, 1,692
unverified targets, live robots.txt (17 disallow rules) + sitemap index (9
partitions); plan 20 routes in preview mode — home title/description known
from the injected content, 19 routes needs-input with brand fallback, 182
needs-input values consolidated, forbidden-copy 83 comparisons 0 violations,
brand isolation 265 strings vs 20 derived terms 0 violations; browser QA
**29/29** (post-hydration `document.title` = 플로우데스크 title on injected
AND fallback routes, noindex present, JSON-LD parses with production
identity, 0 source-brand terms in served heads, robots/sitemap behavior
correct, 20/20 routes 200, 0 runtime errors); link audit 13,570 anchors —
244 route-resolving, 10,420 broken-internal (source routes outside the
20-route table), 4 source-host-absolute. Fixture test: `pnpm smoke:seo`
(72 checks — real observer/planner/proxy over synthetic fixtures + Chromium).

### Task 22 — Asset & Font Independence Foundation

```
Stored lineage artifacts (immutable): asset-catalog.json · generated-styles.css
url() · template slots.json (image slots) · content-run imageBriefs ·
observation rendered.html head (favicon / og:image / font preloads)
        ↓ pnpm assets:inventory <site-spec-dir> --template <dir> [--content-run <dir>] [--live-font-css]
data/<host>/asset-inventories/<run-id>/
  asset-inventory.json   asset-inventory-v1 — every asset/font reference + provenance
  classification.json    conservative per-asset verdict + rule id + evidence
  font-inventory.json    font-inventory-v1 — font URLs, @font-face (live-fetched,
                         opt-in), family usage, license verdicts, fallback plan
        ↓ pnpm assets:materialize <inventory-run-dir>
data/<host>/asset-materializations/<run-id>/
  media/<sha256>.<ext>   content-hashed bytes (only safe + recommended classes)
  manifest.json  rewrite-map.json  replacement-manifest.json (operator seam)
        ↓ pnpm assets:preview / pnpm assets:qa <materialization-run-dir> --template <dir>
serve-boundary asset proxy → browser QA (report/network-qa.json + report/font-qa.json)
```

The production candidate ran on the ORIGINAL site's asset hosts until now
(`asset-load-failure ×47` was a named non-goal since Task 17). This task
removes that runtime dependency **without ever pretending the content became
ours**:

- **Conservative classification is the gate, not an afterthought.** Four
  classes: `safe-to-materialize` needs POSITIVE evidence (a Task 19
  keep-default brief); everything unproven is `replacement-recommended`
  (fetched so the dependency dies, but flagged in the replacement manifest);
  brand marks (favicon, og/social cards, logo-named files), photos of real
  people and customer-identity assets (via the Task 19 imageBrief warnings)
  are `replacement-required` and are NEVER fetched — a webp rendition of a
  required asset is escalated too (`sibling-variant-escalation`, same
  host+pathname). Fonts are always `license-needs-review`: **no font is
  self-hosted without a verified open license, and no license is guessed.**
- **The fetcher assumes the inventory could lie to it.** http/https only, no
  credentials, standard ports; the hostname is DNS-resolved BEFORE any
  connection and every resolved address must be public (10/8, 172.16/12,
  192.168/16, 127/8, 169.254/16 incl. the cloud metadata endpoint, CGNAT,
  IPv6 loopback/link-local/ULA/IPv4-mapped all reject); the connection is
  pinned to the validated resolution; EVERY redirect hop re-runs the full
  validation; bytes are counted while streaming (one byte over the cap kills
  the socket); Content-Type must match the expected asset kind; host
  allowlist = exactly the hosts the inventory observed; concurrency 2 with
  request spacing.
- **Storage is content-addressed**: `/media/<sha256>.<ext>` (extension from
  the RESPONSE MIME, not the URL — a `.png` URL serving JPEG stores as
  `.jpg`), identical bytes under different URLs collapse into one file.
- **Rewrite happens at the serve boundary** (Task 20/21 precedent — the
  immutable app is untouched): a proxy serves `/media/*` and substitutes
  every materialized source URL in HTML, RSC flight payloads and the
  generated stylesheet — raw, `&amp;`-escaped and `&`-escaped variants,
  longest URL first so query renditions never get prefix-clobbered.
- **The replacement seam connects to Task 19.** `replacement-manifest.json`
  lists every recommended/required asset with its slot keys and joined
  imageBrief — the structured place where an operator later supplies real
  replacement images. Nothing in this repo generates images.
- **QA measures, in a real browser, what actually still leaves.** Request
  census per route, baseline (no asset layer) vs independent, classified
  local / source-host / other-external — the residual count is reported, not
  hidden. Fallback font QA loads the SOURCE webfonts over today's
  fallback-rendered page (bytes fetched via the safe fetcher and injected as
  data: URLs because the source CDN sends no CORS header; measurement only,
  never stored) and reports per-element width/height deltas.

**Measured (stripe.com, accepted lineage):** inventory
`asset-inventories/2026-08-19T05-54-47-361Z` — 721 entries (347 URL-bearing,
374 inline-SVG, 15 truncated by the Observer's 500-char attribute cap), 2
CSS `url()` refs, 4 favicons + 8 og/twitter images + 3 font preloads from
stored head evidence, 128 slot-joined, 28 brief-joined; classification 4
safe / 289 recommended / 51 required / 3 license-review; fonts — 3 URLs, 3
@font-face rules live-fetched from source CSS (`sohne-var` w1–1000
woff2-variations + `SourceCodePro` w500), both families license-needs-review,
fallback stacks recorded from 7,473 observed declarations. Materialization
`asset-materializations/2026-08-19T05-54-55-204Z` — **fetched 278/278, 0
failures**, 230 unique media files (57.5 MB), 278 rewrite entries, 340
replacement-seam entries. Browser network QA (3 routes, scroll-triggered
lazy loads): source-host requests **baseline 31 → independent 4** — the 4
residuals are all replacement-required surfaces on `/` (customer logo,
person photo, branded product screenshots) that must wait for operator
replacements, and 0 other-external. Fallback font QA: both webfonts loaded,
app reflow 93/264 text elements changed, width Δ p95 12.2px / max 79.4px,
height Δ p95 3.8px, **docHeight Δ 0px**; isolated samples — sohne-var vs its
fallback stack +0.05% width, SourceCodePro vs `sans-serif` −20.9%. Fixture
test: `pnpm smoke:assets` (111 checks — 45 of them fetcher-safety: private
ranges incl. metadata endpoints, DNS-based rejection, per-hop redirect
re-validation, streaming size cap, MIME gates).

### Task 23 — ProductionSpec & Independent Production Build

```
Accepted lineage (immutable): recon-template 10-45-40-007Z · content-run
10-46-26-129Z · theme-run 12-07-34-566Z (cool-neutral) · seo-plan
19-26-12-572Z (PREVIEW) · asset-materialization 05-54-55-204Z
        ↓ pnpm production:compile --host <h> --template <dir> --content-run <dir>
        |                         --theme-run <dir> --seo-plan <dir> --materialization <dir>
data/<host>/production-specs/<run-id>/
  production-spec.json   production-spec-v1 — per-layer ids + dir-sha256-v1 hashes,
                         baseUrl state, build-mode audit, machine-readable blockers
data/<host>/production-builds/<run-id>/
  app/                   baked template-app copy (content/theme/SEO baked, static export)
  package/               deployment bundle: site/ + server.mjs + deploy-manifest.json
                         + sitemap.preview.xml (artifact only) + RUN.md
  report/                bake-report.json · qa.json
        ↓ pnpm production:qa <build-run-dir>
package copied OUTSIDE the repo, launched via its own server.mjs with env={PATH}
→ HTTP + real-Chromium QA (routes, titles, meta, content, theme paint, interactions,
  request census, robots policy)
```

Everything Tasks 20–22 delivered through serve-boundary proxies is now BAKED
into one self-contained production candidate:

- **The ProductionSpec comes first.** Before anything is copied, every
  consumed layer is pinned by id AND a `dir-sha256-v1` hash over its actual
  artifact files (per-file sha256 → sorted `path\thash` manifest → sha256).
  The spec also records the base-URL state (needs-input/preview), the
  build-mode decision with its reason, and the blocker list — reproducibility
  is a record, not a promise.
- **Baking is anchor-guarded patching of a COPY.** Content: the accepted
  slot-values overlay becomes `template-data/slot-values.baked.json` and the
  `WR_SLOT_VALUES_FILE` env seam is removed from `slot-content.ts` (guard and
  srcset semantics intact). Theme: `theme-overlay.css` becomes a static asset
  linked in the head after the exact stylesheet (same React precedence group
  → same cascade as the proxy's append). SEO: plan titles are baked into
  `route-map.json` (head AND RSC flight derive from it — no string splicing
  at serve time), the rendered head block is spliced into every exported
  HTML, robots.txt is emitted; preview keeps `/sitemap.xml` a 404. Assets:
  `media/` is copied in and the Task 22 rewrite map is applied to the BUILT
  files (HTML + flight .txt + generated CSS, all three URL encodings). Every
  patch fails loudly on a missing/ambiguous/already-applied anchor.
- **Build mode was audited, not assumed.** The 20-route table is path-only,
  pages render from data the app holds at build time, and there are no route
  handlers/middleware/dynamic APIs — so the candidate is a full
  `output: "export"` static site (next build 3.7 s). Recorded behavior
  deltas: query strings no longer 404, prerender instead of per-request.
- **Runtime independence is proven structurally.** QA copies `package/` to a
  temp dir OUTSIDE the repository and launches its own dependency-free
  `server.mjs` (node:http/fs only, smoke-tested over real HTTP) with
  `env = { PATH }` — no WR_* vars, no run directories, no node_modules, no
  Next server. Any static host can serve `site/` with the documented rules.
- **The indexability gate stays honest.** No domain, 182 SEO needs-input
  values, 51 replacement-required assets, unverified font licenses, absent
  business facts → the output is a PREVIEW build (noindex,nofollow +
  Disallow-all + no served sitemap) with all 7 blockers machine-recorded in
  the spec.

**Measured (stripe.com, accepted lineage):** spec+build
`2026-08-19T06-36-35-798Z` — lineage hashed (template 51 files / content 29 /
theme 14 / seo 8 / assets 235); bake: 361 content keys (0 unknown), theme
overlay 742 KB, titles 20/20 baked (0 guard mismatches) + head blocks 20/20
spliced, media 230 files (57.5 MB), rewrite **10,523 occurrences** (HTML
4,207 · flight 6,312 · CSS 4); site 350 files / 146.8 MB. Isolated-package
QA **159/159**: all 20 routes HTTP 200, browser titles 20/20, injected
Korean content 5/5 visible, theme computed-paint 5/5 classes match the
cool-neutral tokens, hydration/JS errors **0**, interactions alive on
desktop + mobile portal, external requests **4 total — all
images.stripeassets.com replacement-required surfaces** (2 on `/`, 2 on the
newsroom route; 0 other hosts), robots preview policy served. Fixture test:
`pnpm smoke:production` (71 checks).

## Requirements

- Node.js **>= 22**
- pnpm (via `corepack enable pnpm`)

## Setup

```bash
pnpm install
pnpm exec playwright install chromium

cp .env.example .env   # then fill in FIRECRAWL_API_KEY (optional in Phase 1)
```

## Usage

```bash
# Discover a site's URLs via Firecrawl Map (needs FIRECRAWL_API_KEY in .env)
pnpm recon https://example.com

# Cap the number of discovered URLs (default 100)
pnpm recon https://example.com --max-urls 20

# Verify discovered candidates (local Playwright; no Firecrawl call; read-only)
pnpm verify data/<host>/<run-id>/discovery.json

# Verify with a custom concurrency (1–8, default 3)
pnpm verify data/<host>/<run-id>/discovery.json --concurrency 3

# Group verified URLs into page families and pick one representative each
# (offline: no Firecrawl, no Playwright, no network)
pnpm select data/<host>/<run-id>/verified-urls.json

# Point at a verification.json that is not the sibling of verified-urls.json
pnpm select data/<host>/<run-id>/verified-urls.json --verification path/to/verification.json

# Observe a single page (real Chromium render; read-only)
pnpm observe https://domainchecker.co.kr

# Observe with a read-only preparation auto-scroll (triggers lazy-loaded content)
pnpm observe https://domainchecker.co.kr --prepare-scroll

# Deep-observe every selected page of a site (no Firecrawl; reuses the selection)
pnpm observe:site data/<host>/<run-id>/selected-pages.json

# Same, with an explicit concurrency (1–4, default 2) and lazy-content scroll
pnpm observe:site data/<host>/<run-id>/selected-pages.json --concurrency 2 --prepare-scroll

# Detect interaction candidates in an existing site observation run
# (offline: no Firecrawl, no Playwright, no network — and no interaction is performed)
pnpm detect:interactions data/<host>/site-observations/<run-id>/site-observation.json

# Build the deterministic action plan WITHOUT launching a browser (recommended first)
pnpm explore:interactions data/<host>/site-observations/<run-id>/interaction-analysis.json --plan-only

# Safely execute that plan on the live site (fresh anonymous context per action)
pnpm explore:interactions data/<host>/site-observations/<run-id>/interaction-analysis.json --concurrency 2

# Model verified transitions into patterns + a classified unknown taxonomy
# (offline: no Firecrawl, no Playwright, no network, no AI)
pnpm model:interactions data/<host>/interaction-explorations/<run-id>/interaction-exploration.json

# Same, plus the AI fallback over AI-eligible unknown signature representatives.
# With no provider configured this prints one line and still writes both
# deterministic artifacts — it never fails the run.
pnpm model:interactions data/<host>/interaction-explorations/<run-id>/interaction-exploration.json --ai

# Drive the contract end-to-end with the bundled deterministic test provider
pnpm model:interactions data/<host>/interaction-explorations/<run-id>/interaction-exploration.json --ai-provider fake

# Compile everything into one self-contained reconstruction IR
# (offline: no Firecrawl, no Playwright, no network, no AI, no asset download)
pnpm compile:sitespec data/<host>/interaction-models/<run-id>/interaction-patterns.json

# Opt in to AI inference. Without this flag a sibling ai-analysis.json is IGNORED,
# and even with it the output stays in inferredInteractions[] — never merged into
# the verified patterns.
pnpm compile:sitespec data/<host>/interaction-models/<run-id>/interaction-patterns.json \
  --ai-analysis data/<host>/interaction-models/<run-id>/ai-analysis.json

# Override the recorded Task 09 path when the run tree has been moved
pnpm compile:sitespec data/<host>/interaction-models/<run-id>/interaction-patterns.json \
  --site-observation data/<host>/site-observations/<run-id>/site-observation.json

# Generate a runnable Next.js clone from a SiteSpec — and from nothing else
# (offline: no Firecrawl, no Playwright, no network, no AI, no asset download)
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json

# Write somewhere other than data/<host>/reconstructions/<run-id>/
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json --output ./my-clone

# Generate without running `next build`, or print the plan and write nothing
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json --skip-build
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json --plan-only

# Override the inferred responsive breakpoint (default: observed-endpoint midpoint)
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json --breakpoint 768

# Apply a Task 15 correction set (opt-in; without it the output is the Task 14
# baseline, byte for byte)
pnpm reconstruct data/<host>/site-specs/<run-id>/site-spec.json \
  --corrections data/<host>/reconstruction-qa/<run-id>/corrections/proposed.json

# Run a generated clone
cd data/<host>/reconstructions/<run-id>/app && npx next start

# QA a reconstruction against the saved snapshot AND the live original
# (Playwright against the public site + the local clone; no Firecrawl, no AI)
pnpm qa:reconstruction data/<host>/reconstructions/<run-id>/reconstruction-manifest.json

# Measure only; never touch the network for the original
pnpm qa:reconstruction <manifest> --snapshot-only

# Propose AND apply corrections, then re-measure and accept or reject each one
pnpm qa:reconstruction <manifest> --auto-fix --max-fix-iterations 2

# Audit more family-represented routes, keep every screenshot
pnpm qa:reconstruction <manifest> --family-audit 4 --save-all-screenshots

# EVERYTHING above, in one process, from a URL nobody has looked at before
pnpm e2e:reconstruct https://example.com

# The full run: bigger URL budget, QA corrections, exact observation of the
# routes whose family representative turned out to be the wrong page
pnpm e2e:reconstruct https://example.com \
  --max-urls 20 --concurrency 2 --auto-fix --max-fix-iterations 2 \
  --family-escalation 4

# Compile a Recon Template from an accepted Exact Reconstruction + its SiteSpec
# (offline: no Firecrawl, no Playwright, no network, no AI; both inputs immutable)
pnpm compile:recon-template data/<host>/reconstructions/<run-id>/reconstruction-manifest.json \
  --site-spec data/<host>/site-specs/<run-id>/site-spec.json

# Same, with a manual slot override file (exclude / merge / rename / role / scope / …)
pnpm compile:recon-template <reconstruction-manifest> --site-spec <site-spec> \
  --slot-overrides my-overrides.json

# Prove the template: default-content parity vs the EXACT clone (not the live
# site), interaction regression, and the slot mutation canary (via the overlay
# file — the artifact is never edited). Builds and serves both apps.
pnpm qa:recon-template data/<host>/recon-templates/<run-id>/manifest.json

# Turn ONE natural-language intent into a bounded Content Task Packet
# (offline, deterministic; the LLM never sees the raw slot inventory)
pnpm content:prepare data/<host>/recon-templates/<run-id>/manifest.json \
  --intent "이 사이트를 AI 업무자동화 회사 홈페이지로 만들고 싶다 …" --routes /

# Generate content: deterministic fake provider (tests) or a manually authored
# result JSON (the MVP seam) — both pass the SAME deterministic validator
pnpm content:generate data/<host>/content-runs/<run-id> --provider fake
pnpm content:generate data/<host>/content-runs/<run-id> --result my-result.json

# Revalidate hand-edited slot-values.json (no LLM call needed)
pnpm content:validate data/<host>/content-runs/<run-id>

# Serve the immutable template with the run's overlay (Ctrl+C to stop)
pnpm content:preview data/<host>/content-runs/<run-id>

# Layout safety QA: default vs injected render of the SAME template app —
# clipping / overflow / collisions / stale twins / applied values /
# interaction regression + screenshots (optionally --repair --provider fake)
pnpm content:qa data/<host>/content-runs/<run-id> --widths 390,1440,1920

# Extract the Original Theme + Site Theme Adapter from a frozen Recon Template
# (offline: no network, no browser, no AI; the template is read-only input)
pnpm theme:extract data/<host>/recon-templates/<run-id>/manifest.json

# List the theme library; with --adapter, print each theme's deterministic
# compatibility verdict for that site (a gate — never a recommendation)
pnpm theme:list
pnpm theme:list --adapter data/<host>/theme-extractions/<run-id>/site-theme-adapter.json

# Deterministic compatibility check + overlay dry-run (no serving)
pnpm theme:check <template-manifest> --theme themes/library/cool-neutral.theme.json \
  --adapter data/<host>/theme-extractions/<run-id>/site-theme-adapter.json

# Create a theme run (selected theme + adapter + overlay CSS + compatibility)
# and serve the IMMUTABLE template app with the overlay appended at the serve
# boundary; --content-run composes the Task 19 overlay underneath (§34 order)
pnpm theme:preview <template-manifest> --theme <theme-file> --adapter <adapter> \
  [--content-run data/<host>/content-runs/<run-id>] [--no-serve]

# Browser QA a theme run: DOM/geometry/height zeros, computed paint application
# (static + pseudo + mounted dynamic surfaces), contrast, interactions
pnpm theme:qa data/<host>/theme-runs/<run-id> --widths 390,1440,1920

# Source SEO Observer — audit how the ORIGINAL site does SEO, from the STORED
# observation run (rendered.html + links.json + verification.json). Offline
# and deterministic; --live-site-files adds the one bounded network access
# (robots.txt + sitemaps, which no stored artifact carries)
pnpm seo:observe data/<host>/site-observations/<run-id> \
  --verification data/<host>/<discovery-run>/verification.json [--live-site-files]

# Production SEO Plan — independent SEO for the NEW brand/content/domain,
# derived from the injected content run (copying source SEO is a checked
# failure). No --domain → preview mode: noindex,nofollow, no canonical, no
# invented URLs; business facts stay needs-input unless --facts provides them
pnpm seo:plan <template-manifest> \
  --content-run data/<host>/content-runs/<run-id> \
  --source-snapshot data/<host>/source-seo-snapshots/<run-id> \
  [--domain <production-domain>] [--facts <json>]

# Serve the immutable template app behind the SEO head overlay proxy
# (plan title/meta/JSON-LD reach the browser head; /robots.txt + /sitemap.xml
# answered per domain state)
pnpm seo:preview data/<host>/production-seo-plans/<run-id> [--no-serve]

# Browser QA: post-hydration document.title, preview noindex, JSON-LD parse +
# production identity, source-brand isolation of served heads, robots/sitemap
# behavior, internal link audit over every route
pnpm seo:qa data/<host>/production-seo-plans/<run-id>

# Type check
pnpm typecheck

# Playwright environment smoke test
pnpm smoke:playwright

# Verifier local fixture test (spins up an in-process HTTP server; no network)
pnpm smoke:verifier

# Selector local fixture test (pure in-memory; no server, no browser, no network)
pnpm smoke:selector

# Multi-page observer fixture test (local HTTP server + real Chromium)
pnpm smoke:multi-observer

# Interaction detector fixture test (pure in-memory + file round-trip; no browser)
pnpm smoke:interaction-detector

# Interaction explorer fixture test (local HTTP server + real Chromium, full pipeline)
pnpm smoke:interaction-explorer

# Interaction pattern fixture test (pure in-memory + file round-trip; no browser, no AI)
pnpm smoke:interaction-patterns

# SiteSpec compiler fixture test (writes a full Task 06→12 fixture to a temp dir,
# compiles it, then DELETES the sources and reloads — no browser, no network, no AI)
pnpm smoke:sitespec

# Reconstruction fixture test — the only smoke test that is NOT offline, on purpose:
# fixture → compile SiteSpec → delete the Task 06–12 tree → generate → delete the
# SiteSpec → next build → next start → Chromium (both viewports). A generated file
# snapshot cannot prove a clone runs.
pnpm smoke:reconstruction

# Reconstruction QA fixture test — an offline half (screenshot metrics, alignment,
# classification, correction eligibility, the data-URI safety gate, the
# no-regression gate) plus a live half that runs a local server as the ORIGINAL
# through the real observer → SiteSpec → clone → QA, then CHANGES that server to
# prove source drift is attributed to the site and not to the clone.
pnpm smoke:reconstruction-qa

# Full E2E fixture test — a local synthetic site through the REAL chain with no
# artifact injection anywhere: a DiscoveryProvider enumerates its URLs and
# everything from the verifier onward is production code, including next build
# and the Task 15 QA. The fixture deliberately contains three <img> on one URL,
# an 800px scroller holding 20,000px at scrollTop 12,345, a grid using
# template-areas / grid-area / order, a menu that mounts children on click, and
# a 메뉴 열기 trigger that must stay uninvented.
pnpm smoke:e2e

# Theme fixture test — a synthetic PAINT-RICH SiteSpec (distinct text/link/CTA
# colors, bordered+shadowed cards, a gradient block that must stay preserved,
# an unexplained raw color, a click-mounted menu) through the REAL
# reconstruction generator + REAL template compiler, then the Task 20 chain:
# extraction → adapter → compatibility gates → overlay → build → Chromium
# (original no-op parity, curated palette/border/radius/shadow application,
# dynamic-surface theming, content+theme composition, hydration safety).
pnpm smoke:theme

# SEO fixture test — synthetic observation run through the REAL Source SEO
# Observer (duplicates, canonical clusters, orphans, broken vs unverified
# links, indexability, determinism), the REAL plan run creator (preview +
# domain modes, fact safety, forbidden-copy + brand-isolation gates), and the
# REAL serve-boundary head proxy verified with fetch + Chromium.
pnpm smoke:seo

# Recon Template fixture test — a synthetic two-page SiteSpec (nested text
# segments, a shared header, an aria-hidden decorative block, a captured
# dynamic menu template) through the REAL reconstruction generator and the
# REAL template compiler, then next build → next start → Chromium for the
# default-parity, interaction, mutation and hydration halves.
pnpm smoke:recon-template
```

Discovery output is written to `data/<host>/<run-id>/`:

- `discovery.raw.json` — links exactly as Firecrawl returned them
- `discovery.json` — normalized, deduplicated, same-site `DiscoveryResult`

Verification output is written to the **same** `data/<host>/<run-id>/` directory
(it extends the discovery run rather than making a new one):

- `verification.json` — full per-candidate verification: status, HTTP status,
  content-type, final URL, redirect chain, page identity signals, exact
  fingerprints, the coarse `structuralProfile` (hashes + compact counts only —
  never the skeleton text itself), timings, plus top-level counts and
  `duplicateGroups`
- `verified-urls.json` — compact set of usable Deep-Observation candidate URLs
  (final HTTP success + HTML + same-site), deduplicated by final URL, each
  carrying its exact hashes and coarse `structuralProfile` so the offline
  Selector needs nothing else

Selection output extends that **same** run directory as well:

- `page-families.json` — every verified URL grouped into exactly one family, with
  the full member record kept (title, canonical + its target, text/structure
  hashes, coarse structural profile, source candidates, route features) and the
  deterministic evidence for the grouping (`familyMatch` +
  `structuralMatchReason`)
- `selected-pages.json` — one representative per family (`url`, `familyId`,
  `familyType`, `memberCount`, `reason`, `reasonDetail`), the reduction summary,
  and an `unselected[]` list naming the representative that covers each skipped
  URL

Observation output is written to `data/<host>/<run-id>/`:

- `observation.json` — run summary: `target`, applied `observationProfile`
  (locale/timezone/colorScheme/reducedMotion), `viewports.{desktop,mobile}`
  (each: profile, environment, metadata, load strategy, stats, style-dedup
  metrics, shadow inventory, measured sizes, file paths), a deterministic
  `responsiveSummary`, and run-level byte totals
- `viewports/<id>/` — one folder per viewport (`desktop`, `mobile`), each with:
  - `rendered.html` — final **rendered** DOM HTML (post-JS `page.content()`, not
    the raw HTTP response body; re-analyzable asset)
  - `dom.json` — per-element observation (attributes / text / local+effective
    visibility / geometry) with `styleId` references
  - `styles.json` — per-viewport shared computed-style table (`styleId` →
    deduplicated style map)
  - `assets.json` — referenced assets (URLs + metadata; inline-SVG markup)
  - `links.json` — anchors with resolved URLs
  - `frames.json` — iframe inventory
  - `screenshot.png` — full-page screenshot

Multi-page (site) observation gets its **own** run namespace, so hundreds of MB of
deep-observation data never mix into the small, re-runnable discovery run:

```
data/<host>/site-observations/<run-id>/
  site-observation.json    — manifest: config, selection provenance, coverage,
                             per-page status/timestamps/summary/byte totals,
                             validationSamples[] (no DOM data is ever embedded)
  pages/<page-id>/         — one folder per observed page, in the EXACT layout
    observation.json         above (observation.json + viewports/<id>/…), so a
    viewports/…              site page and a single-page run are comparable
```

Interaction detection **extends that same site run** with derived artifacts only —
every file above stays byte-identical:

- `interaction-analysis.json` — site manifest: per-page candidate/priority/target
  counts with a relative path to each page artifact (candidates are never embedded
  twice), site-wide capability / priority / guard summaries, skipped failed pages,
  representative↔sample interaction comparisons, byte and timing totals
- `pages/<page-id>/interaction-candidates.json` — desktop AND mobile in one file,
  each with `candidates[]` (id, element id, priority, capabilities, initial state,
  guard flags, evidence, control relations, form ancestry), `targets[]` (the
  controlled regions and their *before* visibility) and per-viewport stats

Live interaction exploration gets its **own** run namespace — a click happens at a
different moment than the observation did, and mixing the two would imply an
atomic snapshot that does not exist:

```
data/<host>/interaction-explorations/<run-id>/
  interaction-plan.json          — deterministic + timestamp-free: policy, stats,
                                   pages (with why each was selected), actions[]
                                   (locator descriptor, plan reason, shape key,
                                   provenance) and skipped[] (every non-planned
                                   candidate with its reason)
  interaction-exploration.json   — live manifest: config, per-page and per-action
                                   summaries, action-status / locator-status /
                                   locator-strategy / diff / safety / dynamic-target
                                   summaries, storage and timing
  pages/<page-id>/<viewport>/<action-id>.json
                                 — one action: locator resolution (every strategy
                                   attempted), live signals, before/after snapshot,
                                   state diff, mutation summary, safety events,
                                   status. No HTML, no DOM copy, no screenshot
```

`data/<host>/site-observations/<old-run>/` is **read-only** to this stage — verified
across all 840 Task 09/10 files (mtime + size unchanged) after all four live runs.

Pattern modeling gets its **own** namespace again, for the same reason: an
interpretation is a different kind of statement from an observation, and mixing
them would let a future rule change appear to rewrite what was seen.

```
data/<host>/interaction-models/<run-id>/
  interaction-patterns.json      — the full ruleset (id / version / specificity /
                                   required + optional evidence / rejection
                                   conditions / match count), coverage, pattern
                                   type + mechanism + viewport summaries, a
                                   per-page pattern index for the SiteSpec
                                   compiler, every InteractionPatternInstance
                                   (with its evidence, supporting evidence and
                                   the limitations it explicitly does NOT claim),
                                   signature groups, and rule conflicts
  unknown-interactions.json      — every action that produced no pattern, each with
                                   ONE named reason, before/after state summaries,
                                   diff + mutation + safety categories, partial
                                   rule hints, AI eligibility and its reason, and
                                   a `preferredProbeState` recommendation where the
                                   cause was probe selection
  ai-analysis.json               — ONLY when --ai actually ran. `inferred` results,
                                   one per eligible signature representative, plus
                                   the rule-promotion policy as a literal string
```

A full E2E run gets its own namespace too, and writes exactly ONE file into it —
every stage artifact stays in the namespace its own Task owns, and the manifest
references them:

```
data/<host>/e2e-runs/<run-id>/
  e2e-manifest.json              — schema/pipeline version, input + options,
                                   environment (node/platform/browser/Next/React/TS,
                                   AI calls, Firecrawl calls), every stage in
                                   PIPELINE order with status/artifact/counts/
                                   warnings/elapsed, the full lineage chain, the
                                   QA + correction runs, the chosen final
                                   reconstruction and WHY, coverage, the Task 16
                                   upstream accounting (asset occurrence, scroll
                                   state, grid properties, dynamic templates),
                                   every unresolved issue with its upstream owner
                                   and recommendation, per-stage timings and
                                   bytes, and one `finalStatus`
```

Both deterministic artifacts are **timestamp-free**: modeling is a pure function
of an exploration run, and re-running it over the same directory produces
byte-identical files (verified on all four sites). Wall-clock timings are printed
by the CLI and never enter an artifact.

`data/<host>/interaction-explorations/<run>/` and
`data/<host>/site-observations/<run>/` are **read-only** to this stage — verified
across all 1,009 Task 09/10/11 files (mtime + size unchanged) after all four
modeling runs.

> `run-id` is a timestamp-based **uniqueness/run-tracking** identifier
> (`2026-08-13T06-19-25-364Z`), not a deterministic/reproducible id.

The Firecrawl API key is never printed.

> The two test sites used going forward are `https://domainchecker.co.kr` and
> `https://seoworld.co.kr` (both self-managed). `example.com` is no longer the
> default observation target.
>
> Task 07 additionally used `https://nextjs.org` and
> `https://developer.mozilla.org/en-US/` as read-only stress tests, capped at
> `--max-urls 40` with `--concurrency 2`. Public pages only — no login, no forms,
> no personalized areas, no bulk crawling.

## Project structure

```
web-recon/
├── src/
│   ├── cli.ts               # discovery CLI entry point (pnpm recon)
│   ├── cli-detect-interactions.ts # interaction candidate CLI (pnpm detect:interactions)
│   ├── cli-explore-interactions.ts # interaction explorer CLI (pnpm explore:interactions)
│   ├── cli-compile-sitespec.ts # SiteSpec compiler CLI (pnpm compile:sitespec)
│   ├── cli-model-interactions.ts # pattern modeling CLI (pnpm model:interactions)
│   ├── cli-reconstruct.ts   # Next.js reconstruction CLI (pnpm reconstruct)
│   ├── cli-e2e-reconstruct.ts # full E2E CLI (pnpm e2e:reconstruct)
│   ├── cli-compile-recon-template.ts # Recon Template compiler CLI (pnpm compile:recon-template)
│   ├── cli-qa-recon-template.ts # template parity/mutation QA CLI (pnpm qa:recon-template)
│   ├── cli-content-prepare.ts  # intent → Content Task Packet (pnpm content:prepare)
│   ├── cli-content-generate.ts # provider/manual result → validated overlay (pnpm content:generate)
│   ├── cli-content-validate.ts # §29 human-override revalidation (pnpm content:validate)
│   ├── cli-content-preview.ts  # template + overlay preview server (pnpm content:preview)
│   ├── cli-content-qa.ts       # layout safety QA + bounded repair (pnpm content:qa)
│   ├── cli-theme-extract.ts    # Original Theme + adapter extraction (pnpm theme:extract)
│   ├── cli-theme-list.ts       # theme library listing + per-site verdicts (pnpm theme:list)
│   ├── cli-theme-check.ts      # deterministic compatibility gate (pnpm theme:check)
│   ├── cli-theme-preview.ts    # theme run creation + overlay preview server (pnpm theme:preview)
│   ├── cli-theme-qa.ts         # browser theme QA (pnpm theme:qa)
│   ├── cli-seo-observe.ts      # source SEO snapshot from stored evidence (pnpm seo:observe)
│   ├── cli-seo-plan.ts         # production SEO plan run (pnpm seo:plan)
│   ├── cli-seo-preview.ts      # SEO head overlay preview server (pnpm seo:preview)
│   ├── cli-seo-qa.ts           # browser SEO QA + link audit (pnpm seo:qa)
│   ├── cli-observe.ts       # single-page observation CLI (pnpm observe)
│   ├── cli-observe-site.ts  # multi-page site observation CLI (pnpm observe:site)
│   ├── cli-select.ts        # selection CLI entry point (pnpm select)
│   ├── cli-verify.ts        # verification CLI entry point (pnpm verify)
│   ├── config/env.ts     # env loading + validation (zod)
│   ├── discovery/        # Phase 2 Firecrawl URL discovery
│   │   ├── types.ts          # provider interface + zod schemas
│   │   ├── normalize-url.ts  # deterministic normalization + same-site
│   │   ├── build-result.ts   # normalize/dedupe/filter → DiscoveryResult
│   │   ├── firecrawl.ts      # FirecrawlDiscoveryProvider (Map API)
│   │   └── store.ts          # persist raw + normalized JSON
│   ├── observer/         # Phase 3 Playwright static observation
│   │   ├── types.ts          # zod schemas + style/attr whitelists + config
│   │   ├── collect-dom.ts    # in-page DOM/style/geometry/inventory walk (browser)
│   │   ├── dedupe-styles.ts  # shared style table + styleId refs (Node side)
│   │   ├── collect-links.ts  # derive LinkObservation[] (Node side)
│   │   ├── collect-assets.ts # derive AssetObservation[] incl. inline SVG (Node)
│   │   ├── observe-page.ts   # observePageWithBrowser (shared primitive) + observePage
│   │   └── store.ts          # saveObservationIntoDir (one page) + saveObservation
│   ├── multi-observer/   # Task 09 multi-page site observation (orchestration only)
│   │   ├── types.ts             # zod schemas + concurrency / sampling policy
│   │   ├── load-selection.ts    # selected-pages.json schema + provenance validation
│   │   ├── plan-pages.ts        # deterministic pageIds / order / validation sampling
│   │   ├── observe-selected-pages.ts # pool, failure isolation, coverage + byte stats
│   │   ├── store.ts             # site run dir + site-observation.json
│   │   └── index.ts             # barrel export
│   ├── verifier/         # Task 06 Playwright candidate verification
│   │   ├── types.ts             # zod schemas + status taxonomy + config
│   │   ├── fingerprint.ts       # in-page identity signals + EXACT SHA-256 fingerprints
│   │   ├── structural-profile.ts# COARSE structural profile (Task 08: skeleton /
│   │   │                        #   landmark / histogram + counts; policy in Node)
│   │   ├── verify-candidate.ts  # verify ONE candidate (fresh context, read-only)
│   │   ├── verify-discovery.ts  # concurrency pool over all candidates
│   │   ├── duplicate-groups.ts  # final-url / canonical / content-fingerprint groups
│   │   ├── build-verified-urls.ts # compact verified-urls.json (eligibility + dedup)
│   │   └── store.ts             # load discovery.json; persist verification outputs
│   ├── selector/         # Task 07 offline page family / representative selection
│   │   ├── types.ts                   # zod schemas + thresholds + terminal-kind rules
│   │   ├── route-features.ts          # path/locale/scope/query/terminal features
│   │   ├── build-families.ts          # layered grouping + hard invariants
│   │   ├── select-representatives.ts  # representative rule + PageSelection
│   │   ├── store.ts                   # load Task 06 pair; persist selection outputs
│   │   └── index.ts                   # barrel export
│   ├── interaction-explorer/ # Task 11 safe rule-based live interaction exploration
│   │   ├── types.ts                # zod schemas + safety/budget/capture policy
│   │   ├── load-analysis.ts        # Task 10/09 input loading + fail-fast validation
│   │   ├── build-locator.ts        # candidate + dom.json → LocatorDescriptor
│   │   ├── plan-actions.ts         # eligibility → shape dedup → budget → actionIds
│   │   ├── resolve-live-candidate.ts # 4 exact strategies + verification (in-page)
│   │   ├── reconcile-live-state.ts # live safety re-check + per-action operability
│   │   ├── safety-guards.ts        # navigation / popup / download / write / dialog
│   │   ├── capture-state.ts        # before/after snapshot + live signals + mutations
│   │   ├── diff-state.ts           # deterministic state diff + meaningful-change rule
│   │   ├── execute-action.ts       # ONE action: fresh context → click → diff → close
│   │   ├── explore-site.ts         # site orchestration (pool, manifest, summaries)
│   │   ├── store.ts                # separate interaction-explorations/ namespace
│   │   └── index.ts                # barrel export
│   ├── interaction-detector/ # Task 10 offline interaction candidate detection
│   │   ├── types.ts             # zod schemas + signal/capability/guard vocabularies
│   │   ├── load-observation.ts  # offline input loading + fail-fast validation
│   │   ├── classify-signals.ts  # element → observed signals (no judgement)
│   │   ├── detect-candidates.ts # signals → candidate / priority / capability / guard
│   │   ├── detect-targets.ts    # aria-controls / popovertarget / details relations
│   │   ├── summarize.ts         # deterministic site/capability/guard aggregation
│   │   ├── analyze-site.ts      # site-run orchestration (sequential, offline)
│   │   ├── store.ts             # additive artifacts only (never rewrites Task 09)
│   │   └── index.ts             # barrel export
│   ├── interaction-patterns/ # Task 12 pattern modeling + unknown strategy (offline)
│   │   ├── types.ts             # zod schemas + pattern/unknown vocabularies + policy
│   │   ├── load-exploration.ts  # Task 11 input loading + fail-fast cross-validation
│   │   ├── facts.ts             # action → the ONLY fact view a rule may read
│   │   ├── registry.ts          # explicit rule list + specificity ladder + integrity
│   │   ├── rules/               # shared contract + the 10 deterministic rules
│   │   ├── match-pattern.ts     # run every rule, resolve by specificity, record ties
│   │   ├── classify-unknown.ts  # 9-reason unknown taxonomy (first match wins)
│   │   ├── signature.ts         # pattern / unknown fingerprints (no id, URL or text)
│   │   ├── build-patterns.ts    # orchestration + deterministic ids + exact accounting
│   │   ├── summarize.ts         # coverage / groups / page index / AI cost estimate
│   │   ├── store.ts             # separate interaction-models/ namespace
│   │   ├── ai/                  # provider-neutral boundary + fake test provider
│   │   └── index.ts             # barrel export
│   ├── sitespec/         # Task 13 SiteSpec compiler (offline reconstruction IR)
│   │   ├── types.ts             # zod schemas + limitation vocabulary + attr policy
│   │   ├── load-inputs.ts       # walks the Task 12→11→09→08/07→06 provenance chain
│   │   ├── content-tree.ts      # rendered.html re-parse + Observer-identical walk
│   │   ├── safe-attributes.ts   # reconstruction attribute policy + IDREF relations
│   │   ├── style-catalog.ts     # site-wide exact-equality computed-style dedup
│   │   ├── asset-catalog.ts     # site-wide asset dedup + inline-SVG sanitization
│   │   ├── compile-viewport.ts  # ONE viewport → node tree (elements + text nodes)
│   │   ├── compile-page.ts      # ONE page → PageSpec (desktop + mobile)
│   │   ├── compile-routes.ts    # every verified URL → RouteSpec + coverage axes
│   │   ├── compile-families.ts  # Task 07/08 families, preserved (never "component")
│   │   ├── compile-interactions.ts # Task 12 behaviors joined onto the node trees
│   │   ├── compile-site.ts      # orchestration + catalog id resolution + stats
│   │   ├── validate-sitespec.ts # referential invariants, run by producer AND consumer
│   │   ├── summarize.ts         # deterministic reporting figures
│   │   ├── store.ts             # separate site-specs/ namespace
│   │   ├── load-sitespec.ts     # the Task 14 consumer API (root-confined)
│   │   └── index.ts             # barrel export
│   ├── reconstruction/   # Task 14 SiteSpec → Next.js app (offline, deterministic)
│   │   ├── types.ts             # runtime/manifest schemas + limitation vocabulary
│   │   ├── load-input.ts        # the ONE input door: loadSiteSpec + version gate
│   │   ├── route-plan.ts        # verified URLs → clone routes (pathname + query key)
│   │   ├── responsive-plan.ts   # breakpoint inference (observed-endpoint midpoint)
│   │   ├── react-attributes.ts  # HTML semantics → React-safe props
│   │   ├── relations.ts         # generated DOM ids + IDREF rewriting
│   │   ├── compile-node.ts      # SpecNode → runtime node (generic, tag-preserving)
│   │   ├── compile-runtime-page.ts # PageSpec → compact runtime derivative
│   │   ├── style-generator.ts   # style catalog → exact-computed-style CSS
│   │   ├── pseudo-generator.ts  # ::before / ::after, scoped per page + viewport
│   │   ├── asset-resolver.ts    # element assetRefs → src / srcSet / sanitized SVG
│   │   ├── link-rewriter.ts     # same-origin verified URL → clone route
│   │   ├── interaction-bindings.ts # confirmed patterns → data-wr-* runtime bindings
│   │   ├── plan-reconstruction.ts  # the deterministic plan (--plan-only)
│   │   ├── app-template.ts      # generated Next.js shell (layout, route, config)
│   │   ├── runtime-template.ts  # generated app runtime (server loaders + client)
│   │   ├── generate-app.ts      # writes the app; nothing is decided here
│   │   ├── validate-output.ts   # reads the app back off disk and checks the claims
│   │   ├── build-app.ts         # the ONE `next build` both callers use
│   │   ├── store.ts             # separate reconstructions/ namespace
│   │   └── index.ts             # barrel export
│   ├── e2e/              # Task 16 full end-to-end orchestration (no new logic)
│   │   ├── types.ts             # manifest schema, failure + status vocabularies
│   │   ├── run-context.ts       # the run's explicit artifact paths + lineage check
│   │   ├── execute-stage.ts     # the ONE stage wrapper (timing, failure naming)
│   │   ├── stage-registry.ts    # the pipeline as data (order, browser/network cost)
│   │   ├── run-discovery.ts     # Firecrawl (or an injected provider) — the ONLY one
│   │   ├── run-verification.ts  # verification + selection
│   │   ├── run-observation.ts   # multi-page responsive deep observation
│   │   ├── run-interactions.ts  # detection + exploration + modeling
│   │   ├── run-sitespec.ts      # compile, validate, re-load through the consumer API
│   │   ├── run-reconstruction.ts # generate + next build
│   │   ├── run-qa.ts            # Task 15 QA, unchanged
│   │   ├── escalation-policy.ts # what may be escalated, and why the rest may not
│   │   ├── family-escalation.ts # exact observation into a NEW augmented run
│   │   ├── final-validation.ts  # generated-app independence audit
│   │   ├── summarize.ts         # coverage, upstream accounting, finalStatus
│   │   ├── store.ts             # e2e-runs/ namespace — writes ONE file
│   │   ├── run-e2e.ts           # the thirteen-stage line
│   │   └── index.ts             # barrel export
│   ├── recon-template/   # Task 18 Exact Reconstruction → Recon Template (Slot V2)
│   │   ├── types.ts             # recon-template-v1 + Slot V2 zod schemas + role vocabulary
│   │   ├── load-input.ts        # two immutable lineage inputs + cross-checks
│   │   ├── extract.ts           # DOM walk → text/url/image occurrences + exclusions
│   │   ├── roles.ts             # deterministic canonical-role assignment
│   │   ├── grouping.ts          # exact-equality merging + conservative global scope
│   │   ├── svg-text.ts          # 19.1: deterministic SVG text-run scanner + safe splice
│   │   ├── twin-binding.ts      # 19.1: aria-hidden paint-twin co-binding evidence pass
│   │   ├── assemble.ts          # keys → ids → slots/bindings/default content
│   │   ├── overrides.ts         # manual exclude/merge/rename/role/scope/…
│   │   ├── constraints.ts       # observed text/image references (never invented limits)
│   │   ├── site-map.ts          # minimal site map from facts already on disk
│   │   ├── app-templates.ts     # the injected slot-content.ts + load-page.ts source
│   │   ├── generate-template-app.ts # exact app copy + slot layer + template-data
│   │   ├── validate-output.ts   # every binding resolves; defaults are a no-op
│   │   ├── report.ts            # report/slot-summary.json builder
│   │   ├── parity-qa.ts         # exact-vs-template browser QA + mutation canary
│   │   ├── compile.ts           # orchestration (offline, deterministic)
│   │   ├── store.ts             # separate recon-templates/ namespace
│   │   └── index.ts             # barrel export
│   ├── theme/            # Task 20 theme contract · extraction · adapter · overlay · QA
│   │   ├── types.ts             # theme-contract-v1 tokens + zod schemas + paint allowlist
│   │   ├── stylesheet.ts        # generated-stylesheet reader + border/color parsing
│   │   ├── occurrences.ts       # style-token census over the template's runtime trees
│   │   ├── extract.ts           # deterministic evidence → paint groups + original theme
│   │   ├── overlay.ts           # adapter + theme → additive overlay CSS (allowlist-gated)
│   │   ├── compatibility.ts     # deterministic gate (contrast / dark / gradient / assets)
│   │   ├── serve.ts             # immutable app + serve-boundary stylesheet append proxy
│   │   ├── theme-qa.ts          # browser QA (parity zeros, paint application, contrast)
│   │   ├── run.ts               # extraction/run artifacts + theme library loader
│   │   ├── report.ts            # extraction review (token evidence catalog)
│   │   ├── store.ts             # theme-extractions/ + theme-runs/ namespaces
│   │   └── index.ts             # barrel export
│   ├── seo/              # Task 21 source SEO evidence · production SEO plan · serve QA
│   │   ├── types.ts             # source-seo-snapshot-v1 + production-seo-plan-v1 (separate models)
│   │   ├── head-parse.ts        # rendered.html → head/heading/img-alt SEO facts (parse5)
│   │   ├── source-observe.ts    # stored observation run → source SEO snapshot
│   │   ├── live-fetch.ts        # bounded opt-in robots.txt/sitemap fetch
│   │   ├── production-plan.ts   # content-run-derived plan + forbidden-copy check
│   │   ├── brand-isolation.ts   # source-derived forbidden terms + surface scan
│   │   ├── render-head.ts       # plan → injectable head block per route
│   │   ├── robots-sitemap.ts    # robots.txt + sitemap per domain state
│   │   ├── serve.ts             # SEO head overlay proxy (title + flight rewrite)
│   │   ├── link-qa.ts           # anchor classification over the served candidate
│   │   ├── seo-qa.ts            # browser QA (post-hydration title, noindex, JSON-LD)
│   │   ├── run.ts               # plan run artifacts (manifest/robots/sitemap/needs-input)
│   │   ├── store.ts             # source-seo-snapshots/ + production-seo-plans/ namespaces
│   │   └── index.ts             # barrel export
│   ├── assets/           # Task 22 asset & font independence (inventory → fetch → rewrite → QA)
│   │   ├── types.ts             # asset-inventory-v1 + asset-materialization-v1 + replacement seam
│   │   ├── store.ts             # asset-inventories/ + asset-materializations/ namespaces
│   │   ├── inventory.ts         # stored-artifact readers (catalog, css url(), head evidence, slots)
│   │   ├── classify.ts          # conservative brand/person/license classification rules
│   │   ├── fonts.ts             # font inventory + license safety (never self-hosted unverified)
│   │   ├── safe-fetch.ts        # SSRF-hardened fetcher (DNS pinning, per-hop re-validation)
│   │   ├── materialize.ts       # content-hash /media storage + rewrite map + replacement manifest
│   │   ├── rewrite.ts           # raw/&amp;/& URL substitution over buffered bodies
│   │   ├── serve.ts             # asset proxy (/media + HTML/flight/CSS rewrite) at the serve boundary
│   │   ├── network-qa.ts        # browser request census: residual source-host requests
│   │   ├── font-qa.ts           # fallback font reflow metrics (source webfont vs fallback stack)
│   │   ├── run.ts               # inventory run creator/loader
│   │   └── index.ts             # barrel export
│   ├── production/       # Task 23 ProductionSpec + independent production build
│   │   ├── types.ts             # production-spec-v1 (zod) + bake report + deploy manifest
│   │   ├── hash.ts              # dir-sha256-v1 lineage hashing (paths + bytes only)
│   │   ├── patch.ts             # anchor-guarded bakes (content env removal / theme link /
│   │   │                        #   static-export page / route-title bake)
│   │   ├── bake.ts              # copy → bake → next build (output: export) → post-process
│   │   ├── static-server.ts     # generated dependency-free server.mjs (node:http/fs only)
│   │   ├── packaging.ts         # package/ assembly (site + server + manifest + RUN.md)
│   │   ├── qa.ts                # isolated-package launch (env=PATH) + HTTP/Chromium QA
│   │   ├── run.ts               # compile orchestration (spec first, then the bake)
│   │   ├── store.ts             # production-specs/ + production-builds/ namespaces
│   │   └── index.ts             # barrel export
│   ├── content-injection/ # Task 19 natural language → validated slot-values overlay
│   │   ├── types.ts             # versioned schemas (intent/plan/units/result/QA/manifest)
│   │   ├── policy.ts            # content-policy-v1 — the fixed system policy artifact
│   │   ├── load-template.ts     # read-only Recon Template consumer
│   │   ├── units.ts             # deterministic Content Unit Builder (no AI clustering)
│   │   ├── packet.ts            # bounded Content Task Packet + batched request
│   │   ├── providers.ts         # ContentGenerator contract + fake + manual JSON seam
│   │   ├── validate.ts          # deterministic generated-content validator
│   │   ├── brand-leak.ts        # source-brand-leak scan (warnings, never rewrites)
│   │   ├── overlay.ts           # slot-values overlay assembly + effective values
│   │   ├── layout-qa.ts         # layout safety QA (default vs injected, one app)
│   │   ├── repair.ts            # bounded repair loop input (content only, max 2)
│   │   ├── report.ts            # operator review (markdown + JSON)
│   │   ├── run.ts               # run orchestration (ingest / revalidate / record)
│   │   ├── store.ts             # separate content-runs/ namespace
│   │   └── index.ts             # barrel export
│   └── storage/          # persisted observation data
├── scripts/
│   ├── smoke-assets.ts
│   ├── smoke-content-injection.ts
│   ├── smoke-e2e.ts
│   ├── smoke-interaction-detector.ts
│   ├── smoke-interaction-explorer.ts
│   ├── smoke-interaction-patterns.ts
│   ├── smoke-multi-observer.ts
│   ├── smoke-playwright.ts
│   ├── smoke-recon-template.ts
│   ├── smoke-reconstruction.ts
│   ├── smoke-reconstruction-qa.ts
│   ├── smoke-selector.ts
│   ├── smoke-sitespec.ts
│   ├── smoke-theme.ts
│   ├── smoke-seo.ts
│   └── smoke-verifier.ts
├── themes/
│   └── library/          # curated Theme Files (theme-contract-v1; site-agnostic)
├── data/                 # runtime output (gitignored)
├── .env.example
├── README.md
└── ROADMAP.md
```

## Working principles

- **Small Task Principle** — one clear goal per task.
- **Stop at Task Boundary** — do not start the next task on your own.
- **Persist Decisions** — record important design decisions in Markdown, not just chat context.

See `ROADMAP.md` for the phased plan.
