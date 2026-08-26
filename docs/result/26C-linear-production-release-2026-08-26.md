Task: 26 — Phase C
Title: Linear Production Release — SEO + Assets + ProductionSpec + Build + Release Project
Agent: 26-Production-Builder (fresh agent; sections 32–45 of the Task 26 spec)
Previous: 26B-linear-template-content-theme-2026-08-26.md (verified PASS_WITH_LIMITATIONS)
Status: Complete

# Task 26C — Linear First Fresh-Site Production Pilot, Phase C

Inputs were the accepted formal handoffs only (26A/26B handoffs + verifications,
26-source-scout.json) plus repository state — no builder conversation. Every
number below is read or recomputed from an on-disk artifact named next to it.
Git add/commit/push 0. No Task 17–25 artifact and no Stripe artifact was
modified. All Linear outputs live under `data/linear.app/` only.

Final state, honestly: **PRODUCTION_INPUTS_REQUIRED** — the expected, correct
end state for a pilot with no real production inputs (spec §44).

```
Accepted 26B lineage (immutable):
  template  recon-templates/2026-08-25T21-53-26-980Z   (8 routes, 3,079 slots)
  content   content-runs/2026-08-25T21-54-40-120Z      (FlowPilot synthetic-pilot-brand, 1,395 values)
  theme     theme-runs/2026-08-25T22-24-00-120Z        (dark-accent over injected content)
    ↓ seo:observe      source-seo-snapshots/2026-08-25T23-15-08-566Z   (8 pages + live robots/sitemap)
    ↓ seo:plan         production-seo-plans/2026-08-25T23-27-49-099Z   (preview; 8/8 titles known; 41 needs-input)
    ↓ seo:qa           69/69 PASS (introduced-error rule; measured head asset refs)
    ↓ assets:inventory asset-inventories/2026-08-25T23-19-27-365Z      (448 entries; 84 required never fetched)
    ↓ assets:materialize asset-materializations/2026-08-25T23-28-36-880Z (155/155 fetched, 200 MB)
    ↓ assets:qa        network census 8/8 routes: baseline 206 → residual 60 (per-file list below)
    ↓ production:compile production-specs/2026-08-25T23-54-21-435Z + production-builds/2026-08-25T23-54-21-435Z
    ↓ production:qa    75/75 on the isolated package (env=PATH only, outside the repo)
    ↓ release:prepare  release-projects/linear.app-2026-08-25T23-54-21-435Z
    ↓ release:plan     PRODUCTION_INPUTS_REQUIRED — 378 requirements (88 release-blocking)
```

## 1. Source SEO Snapshot (§33) — evidence, never copied

`pnpm seo:observe` over the stored pilot observation run
(`site-observations/2026-08-25T19-23-01-716Z`, 8 pages) + the pilot
verification (`2026-08-25T18-28-28-180Z-pilot/verification.json`). The only
live access was the documented opt-in `--live-site-files` fetch of robots.txt
and the sitemap (2 requests; both files exist in no stored artifact).

Run: `data/linear.app/source-seo-snapshots/2026-08-25T23-15-08-566Z`

| item | measured |
| --- | --- |
| title | 8/8 present, 0 duplicates |
| meta description | 8/8 present, 0 duplicates |
| canonical | 8/8 present, all self-referential (8 clusters, 0 cross-canonical) |
| robots meta | 6/8 none; `/customers/automattic` = `index`; **`/integrations` = `noindex`** (real source SEO decision, recorded as-is) |
| hreflang | **0 alternates on all 8 pages** (Linear ships none — vs Stripe's 89/page) |
| Open Graph / Twitter | og 3/page (6 on /pricing); twitter 6/page (9 on /pricing); `twitter:site` = `@linear` |
| JSON-LD | 1/8 pages only (`/pricing`: WebPage), parseable |
| headings | 164 total; 0 pages missing h1 |
| image alt audit | recorded per page (e.g. /integrations 84 imgs) |
| link graph | 8 nodes · 51 dedup edges · 700 internal link occurrences |
| orphan candidates (within observed subgraph) | 0 |
| broken internal links | 0; **178 unverified targets = unobserved, not broken** (outside the 8-route pilot scope) |
| indexability | 7/8 `no-observed-blocker`, 1/8 `robots-noindex` (/integrations) |
| robots.txt (live) | 200; Disallow `/api/`, `/cdn-cgi/`; Allow `/api/og/`; Sitemap → sitemap.xml |
| sitemap (live) | urlset, **1,003 URLs**, bounded sample recorded |

This snapshot is audit evidence only. Nothing from it is served by the
production candidate (proven below by forbidden-copy and brand-isolation).

## 2. Production SEO (§34) — derived from FlowPilot, preview mode

`pnpm seo:plan` from the template manifest + the accepted FlowPilot content
run + the source snapshot (audit-only input). No domain was provided and none
was invented → **preview mode**.

Run: `data/linear.app/production-seo-plans/2026-08-25T23-27-49-099Z`

| item | value |
| --- | --- |
| routes | 8, **all 8 content-injected** (the whole pilot scope carries FlowPilot content) |
| titles / descriptions | **8/8 known**, derived from `sitePlan.siteIdentity` + per-route `pagePlan.primaryMessage` (e.g. `/`: "FlowPilot (synthetic-pilot-brand) \| Enterprise AI work-automation and AI-agent operations platform") |
| robots meta | `noindex,nofollow` on every route (preview) |
| canonical | intent `self-on-production-domain`, finalized **false**, value **null** — never invented |
| og:url / og:image / twitter:site | needs-input (no domain / no asset / no account is invented) |
| robots.txt | full `Disallow: /`, **no Sitemap line** (an absolute URL would require inventing a domain) |
| sitemap | `/sitemap.xml` 404 in preview; path-only `sitemap.preview.xml` shipped as a plan artifact only |
| needs-input total | **41** (`report/needs-input.json`: domain, locale, 7 business facts, per-route og:url/og:image/twitter:site) |
| forbidden-copy check | **PASS — 56 comparisons, 0 violations** (every plan string vs every source title/description/og/twitter value) |
| brand isolation | **PASS — 123 rendered production strings vs 3 source-derived terms (`linear`, `linear.app`, `@linear`), 0 violations** |

Preview posture (`noindex,nofollow`, robots disallow-all, canonical
unresolved, sitemap 404) is the EXPECTED state, not a failure.

Honest characterization: the working name renders literally as
"FlowPilot (synthetic-pilot-brand)" in titles/JSON-LD — the brand-class
marker is carried into the visible preview by design (the content run's
recorded identity); real branding is an operator input anyway.

## 3. Structured data (§35) — no invented facts

Per-route JSON-LD emits a `WebSite` + `Organization` graph with **name and
description only** (from the content run identity). All seven business facts —
address, phone, prices, reviews, ratings, foundingDate, sameAs — are
`needs-input` with null values; the JSON-LD omits them rather than inventing
them (`omittedNeedsInput` recorded per route). Locale is honestly
`needs-input`: the Linear pilot intent declares no language and the content
run derives none. `seo:qa` verified in-browser that every route's JSON-LD
parses and carries the production identity, and a regex sweep class of checks
from 26B still holds (no FlowPilot domains/emails/phones/addresses anywhere).

## 4. SEO browser QA — 69/69 PASS

`pnpm seo:qa` (real Chromium over the SEO-proxied app + un-proxied upstream
reference): `report/qa.json`, `report/link-qa.json`.

- document.title + head `<title>` = plan title post-hydration: 8/8 routes.
- robots noindex / description / no-canonical / og / JSON-LD: 8/8.
- **SEO-controlled head surfaces contain no source-brand term: 8/8** (title,
  every meta content, canonical, JSON-LD — the surfaces this layer emits).
- **App-emitted head asset references measured, not graded**: 57 URLs across
  4 routes (/ 1, /customers 1, /customers/automattic 1, /integrations 54) —
  body `<link rel="preload" as="image">` elements React hoists into the head,
  still pointing at the source CDN at this boundary. They are asset-layer
  territory; after materialization + rewrite, 56/57 are served from `/media`
  in the final package (the 1 remaining is a replacement-required asset — see
  §8).
- Runtime errors: 24 on /customers-class pages, **all inherited** (identical
  on the upstream reference: the Phase-A-disclosed webassets CORS refusals);
  **SEO-introduced errors 0** — the gate that matters.
- robots.txt 200 disallow-all-no-sitemap; sitemap.xml 404; 8/8 routes 200.
- Link audit: 1,564 anchors — 172 route-resolve, 1,122 broken-internal
  (source paths outside the 8-route table, 404-by-design), **0 source-host
  absolute**, 164 external, 106 non-navigational.

## 5. Asset Inventory (§36) — conservative, evidence-ruled

`pnpm assets:inventory` from the SiteSpec asset catalog + generated CSS +
template image slots + content-run imageBriefs + observation head evidence,
with the opt-in bounded `--live-font-css` fetch (5 stylesheets).

Run: `data/linear.app/asset-inventories/2026-08-25T23-19-27-365Z`

448 entries: **241 URL assets + 207 inline-SVG** (0 truncated). Hosts:
webassets.linear.app 180, linear.app 55, static.linear.app 6. Kinds include
image 194, mask-image 12, video 11, video-poster 6, og-image 8, audio 1,
font 2. Slot joins 192; imageBrief joins 73.

| classification | count | rules |
| --- | ---: | --- |
| safe-to-materialize | **0** | no asset had positive keep-default evidence without a warning — honest zero |
| replacement-recommended | **155** | default-conservative 141 · video-brand-content 14 |
| replacement-required | **84** | image-brief-warning 73 · brand-social-card 8 (og images) · brand-favicon 3 |
| license-needs-review | **2** | font-license-unknown (both webfont families) |

Notable, named explicitly:

- **Real-people testimonials (26B priority item)** — the homepage
  testimonial region naming real people at real companies (Gabriel Peal /
  OpenAI; Nik Koblov / Ramp) is TEXT in review-locked slots
  (`home.main.link.you-ll-probably-build-a-better-product-j.label.*`,
  `home.main.link.our-speed-is-intense-and-linear-helps-us.label.*`), whose
  review-locked twin still renders on the injected homepage's mobile variant
  and ships in the built package (4 occurrences of each name in
  `site/index.html`). The editable twins (and the `/plan` sibling) correctly
  render "Customer name / Role, Company (to be provided)" placeholders.
  **Classification: replacement-required content** — real people/testimonials
  must never ship as the new brand's production content. The asset layer
  cannot touch text and the release requirement model has no kind for
  review-locked slot content, so this is carried as a NAMED release
  consideration + limitation (below), not silently absorbed. It is the
  operator's highest-priority content replacement together with pricing.
- **OpenAI/Ramp tokens on every route** are inline-SVG `<symbol>` customer
  logo definitions in the shared shell sprite — inside the 207 inline-SVG
  entries covered by the release-blocking `source-brand-inline-svg`
  requirement.
- **/customers wordmark masks (Phase A CORS item)** — the 12 `mask-image`
  customer wordmark SVGs are classified `replacement-recommended /
  default-conservative` (they sit in review-locked surfaces, so no imageBrief
  evidence reaches them and no filename/brand rule fires on their CDN-hash
  names). They were therefore materialized and rewritten: the clone now
  serves them same-origin from `/media`, which BOTH removes the CORS console
  errors (production QA: 0 console errors on /customers) AND renders the mask
  cutouts. They remain **customer-identity assets in the replacement seam
  (awaiting-input)** — materialization is a runtime-dependency fix, not
  production approval; the report flags them as replacement-required-
  equivalent for the operator.
- The 8 og/social-card images and 3 favicon assets are replacement-required
  and were never fetched.

## 6. Asset Materialization (§37) — 155/155, required never fetched

`pnpm assets:materialize` (SSRF-hardened fetcher, allowlist = the 3 observed
hosts, concurrency 2, spacing 100 ms, `--max-bytes 134217728`).

Run: `data/linear.app/asset-materializations/2026-08-25T23-28-36-880Z`

| item | value |
| --- | ---: |
| candidates (safe + recommended) | 155 |
| fetched | **155/155 (0 failed)** |
| skipped-by-classification (required 84 + fonts 2) | 86 |
| unique media files `/media/<sha256>.<ext>` | 155 (209,680,490 bytes ≈ 200 MB, incl. 2 brand-footage mp4s 92.7+41.4 MB and 1 mp3) |
| rewrite entries | 155 |
| replacement-seam entries | **239** (155 recommended + 84 required), each joined to slot keys (192) and imageBriefs (73), `replacement: awaiting-input` |

A first materialization run (`2026-08-25T23-20-21-743Z`, superseded, kept as
correction trail) fetched 152/155: the two mp4s exceeded the default 30 MB
cap (CLI `--max-bytes` re-run) and `pulse-audio.mp3` exposed engine change
C-EC4 (below).

## 7. Fonts (§38) — nothing guessed

Font inventory (in the inventory run):

- Font URLs from stored head preload evidence: `InterVariable.woff2` (8
  pages) and `Tiempos/tiempos-headline-regular.woff2` (7 pages), both on
  static.linear.app.
- **@font-face rules recovered: 0** (provenance `live-fetched`: the 5
  render-order stylesheets fetched contain none; Linear's ~60-stylesheet
  split + a JS-injected font path keep the rule out of stored evidence and
  the bounded probe). Nothing was invented.
- Family usage from the clone's generated CSS: `inter variable` 4,188
  declarations, `berkeley mono` 109 — **both `webfontUndefinedInClone:
  true`**, i.e. the clone has rendered on its observed fallback stacks
  (`"SF Pro Display", -apple-system, system-ui, …` / `ui-monospace, "SF
  Mono", Menlo, monospace`) since Phase A.
- **License: both families `license-needs-review`, selfHostApproved false**
  ("no verifiable open-license evidence in observed artifacts") — even Inter,
  plausibly open-licensed, is not guessed; verification is an operator step.
- Fallback layout QA (`report/font-qa.json`): **reflow honestly unobserved**
  — the measuring harness needs the @font-face family↔URL binding it refuses
  to guess. The practical fallback cost is already embedded in the accepted
  Phase A fidelity numbers (geometry vs live source measured with the clone
  on fallback fonts; named limitation `font-source-binding-unverified`
  carried since 17.1/26A).

## 8. Network Independence (§39) — per-file residual render list

`pnpm assets:qa` over ALL 8 pilot routes (real Chromium, scroll-triggered
lazy loads, baseline = un-proxied app vs independent = asset-served app):
`report/network-qa.json` records every residual request URL per route — the
per-file list the Task 24 GED-G debt asked for comes straight from this
artifact plus a classification join; **no new diagnostic was needed**.

| route | baseline source-host | independent residual | residual classification |
| --- | ---: | ---: | --- |
| `/` | 20 | 15 | 15× replacement-required (image-brief-warning; linear.app/cdn-cgi imagedelivery) |
| `/changelog` | 28 | 16 | 16× replacement-required (feed media, webassets) |
| `/customers` | 74 | **2** | 2× replacement-required (story covers) — wordmark masks now local, CORS errors gone |
| `/customers/automattic` | 3 | 3 | 3× replacement-required (case-study hero + portrait SVGs) |
| `/integrations` | 66 | 12 | 12× replacement-required (third-party integration logos) |
| `/plan` | 15 | 12 | 12× replacement-required (product screenshots/imagedelivery) |
| `/pricing` | 0 | 0 | — |
| `/security` | 0 | 0 | — |
| **total** | **206** | **60** | **60/60 replacement-required — 0 from any other class, 0 unattributed** |

60 residual requests = 60 unique files (linear.app 25, webassets.linear.app
35), every one traced to the `image-brief-warning` replacement-required class
that policy forbids fetching. **The only legitimate path to residual 0 is
operator replacement input.** The independent serve never exceeds baseline
(the assets:qa exit-2 gate passed).

The final static package's own census (production QA, no scroll, all 8
routes): 31 external requests, hosts {linear.app 12, webassets.linear.app
19}, 0 unexpected hosts — same conclusion under the second measurement
method (both recorded, methods differ as in Task 23).

## 9. ProductionSpec (§40) — production-spec-v1, all lineage pinned

`data/linear.app/production-specs/2026-08-25T23-54-21-435Z/production-spec.json`
(dir-sha256-v1 over every artifact file):

| layer | id | hash | files | bytes |
| --- | --- | --- | ---: | ---: |
| template | linear.app-2026-08-25T21-53-26-980Z (slot v2) | `2558f2c0bd2847c3…` | 41 | 31,885,945 |
| contentRun | 2026-08-25T21-54-40-120Z (1,395 values) | `656fee57c11e2bfe…` | 46 | 32,246,465 |
| theme | 2026-08-25T22-24-00-120Z · dark-accent | `bcb83de075a70c92…` | 40 | 30,103,050 |
| seoPlan | 2026-08-25T23-27-49-099Z · preview · needs-input 41 | `676ce2008a805c1d…` | 8 | 237,047 |
| assets | 2026-08-25T23-28-36-880Z · media 155 · seam 239 | `e83710a19e68a0e5…` | 160 | 210,076,618 |

`baseUrl: { value: null, status: "needs-input", mode: "preview" }`. Build
mode `static-export` (route table is path-only — 8 routes, no query
variants). Indexability gate: **preview, 6 blockers**, each with evidence
paths: production-domain-needs-input · seo-needs-input-values (41) ·
replacement-required-assets (84 never fetched; 60 residual renders) ·
fonts-license-needs-review (2) · business-facts-needs-input ·
source-brand-inline-svg (207). The Stripe-era 7th blocker
(uninjected-route-content) is correctly ABSENT: all 8 routes are injected
(engine change C-EC5).

## 10. Production Build + Independence (§41)

Build run `data/linear.app/production-builds/2026-08-25T23-54-21-435Z`
(bake-report.json):

- **Content baked**: 1,395 slot values → `slot-values.baked.json`, env seam
  removed (0 unknown keys). Content env dependency 0.
- **Theme baked**: dark-accent overlay (262,039 bytes) emitted as a linked
  static sheet after the generated stylesheet. Theme preview-proxy
  dependency 0.
- **SEO baked**: 8/8 route titles into route-map (0 upstream-title guard
  mismatches), 8/8 head blocks spliced into exported HTML, robots.txt
  emitted; preview sitemap policy (404 + plan artifact only).
- **Assets baked**: 155 media files (209.7 MB) copied into `site/media/`;
  rewrite applied to built files: HTML 5 files / 718 occurrences + RSC
  flight 17 files / 1,132 + CSS 1 file / 53 = **1,903 rewrites**. Residual
  source-URL strings in the site: 1,162 (body anchors + the 84 never-fetched
  replacement-required assets — the named content/asset-input limitation
  class).
- **Static export**: `next build` 2,777 ms; 10 HTML files (8 routes + 404 +
  _not-found); site 215 files / 258,657,406 bytes; package 261 MB with the
  dependency-free `server.mjs` + deploy-manifest + RUN.md.
- **Isolated-package QA (Task 23 conventions): 75/75, 0 failed** — package
  copied OUTSIDE the repo (`/var/folders/**/wr-production-qa-*`), launched
  with **env = { PATH } only**: 8/8 routes HTTP 200 + served titles + head
  blocks + preview noindex + browser titles post-hydration + meta/JSON-LD;
  **hydration/JS errors 0 on all 8 routes desktop + mobile home — including
  /customers** (the inherited CORS class is gone: masks serve from /media);
  5/5 content proofs (FlowPilot strings differing from defaults, e.g. "Run
  your operations on autopilot."); theme link + 5 computed-paint probes;
  desktop interactions (2 triggers → 4 regions, 2 state flips) + mobile
  portal menu (1 trigger → 1 region); no horizontal overflow; internal links
  in-table 7/7; robots/sitemap/unknown-route behavior; external census 31
  requests, all on the two known residual source hosts, **0 unexpected
  hosts**.

Independence conditions: external SiteSpec runtime dependency 0, Exact-run
dependency 0, template external-directory dependency 0, content env
dependency 0, theme preview-proxy dependency 0 — the package runs from a
copied directory with only PATH in the environment.

## 11. Release Project (§42–43) — everything artifact-derived

`pnpm release:prepare data/linear.app/production-specs/2026-08-25T23-54-21-435Z`
→ `data/linear.app/release-projects/linear.app-2026-08-25T23-54-21-435Z/`
(release-project.json + requirements.json + operator-checklist.md +
technical-debt.json). No count is hardcoded; the collector reads the SEO
plan, content run, replacement manifest, font inventory and the spec gate.

**State: PRODUCTION_INPUTS_REQUIRED — 378 requirements, 88 release-blocking
unresolved.**

| kind | total | release-blocking | source artifact |
| --- | ---: | ---: | --- |
| replacement-image | 239 | 84 | replacement-manifest (84 required + 155 recommended) |
| external-url | 117 | 0 | content-run unresolved `.href` slots |
| business-fact | 7 | 0 | seo plan businessFacts |
| seo-fact | 8 | 0 | seo plan needs-input |
| font-license | 2 | 2 | font inventory license[] |
| production-domain | 1 | 1 | seo plan domainState |
| source-brand-asset | 1 (207 svg entries) | 1 | inventory inline-SVG count |
| og-image / organization-logo | 2 | 0 | seo needs-input + JSON-LD omissions |
| social-handle | 1 | 0 (optional) | twitter:site needs-input |
| **total** | **378** | **88** | |

`release:plan` output: all 7 stages READY(fresh); route readiness **8/8
CONTENT_READY** (content:injected; seo-needs-input 4 each — og:url/og:image/
twitter:site/canonical-domain class; residual-assets per route 15/16/2/3/12/
12/0/0); NEXT ACTIONS ordered (domain → font decisions → replacement
images). `release:build --dry-run`: **WOULD RUN: nothing — all stages
fresh; zero mutation** (all seven stages WOULD REUSE).

Content-route requirements are honestly 0 — unlike the Stripe canary (19
uninjected routes), this pilot injected all 8 routes.

Carried project warnings (from artifacts): 91 content brand-leak warnings on
untouched defaults, theme compatible-with-warnings, and the standing
workspace-versioning risk (uncommitted tree).

## 12. Engine changes + regression (§50, defect policy §13/§51)

Six generic engine changes, all discovered by this fresh source, none
Linear-specific (grep over every changed file: zero `linear` hits; comments
carry no source-brand names). Each is fixture-backed:

| id | classification | change | files | fixture |
| --- | --- | --- | --- | --- |
| C-EC1 | generic-seo-qa-defect (26B introduced-vs-inherited class) | seo:qa console gate failed on errors the un-proxied app already emits (source-CDN CORS refusals). Now each route is also captured on the upstream serving and only SEO-introduced errors fail (shared `findIntroducedJsErrors`); inherited count reported | src/seo/seo-qa.ts | real run: 24 inherited / 0 introduced; suite section 9 helpers |
| C-EC2 | generic-seo-qa-scope-defect | The head brand-term scan graded the ENTIRE hydrated head, so body-hoisted `<link rel=preload>` asset URLs (React 19 float) failed the SEO layer for asset-layer state. Now: SEO-controlled surfaces (title/meta/canonical/JSON-LD) FAIL on brand terms; app-emitted head asset refs are MEASURED per route (`headSourceAssetReferences`), never graded | src/seo/seo-qa.ts, src/seo/index.ts | smoke:seo §9: 6 checks incl. negative + positive controls |
| C-EC3 | generic-prose-defect (Stripe-era hardcoded facts) | `no-hreflang` decision claimed "89 hreflang alternates / single-locale Korean site" verbatim on every plan. Now derived from the actual snapshot (`0 alternates across 8 observed pages`) and the plan's locale state; language basis string genericized | src/seo/production-plan.ts | smoke:seo §4 evidence-derivation check |
| C-EC4 | generic-materializer-defect (unmodeled asset kind) | Catalog kind `audio` fell through to expected-kind `image`, so every audio asset was mime-rejected (Stripe had none). Added `audio` expected-kind (audio/* only), extension map, materializer mapping | src/assets/safe-fetch.ts, src/assets/materialize.ts | smoke:assets: 4 checks (fetch as audio; still rejected as image; mimeAllowed matrix; extension) |
| C-EC5 | generic-gate-defect | `uninjected-route-content` blocker emitted unconditionally — a fully-injected pilot got a "0 of 8 routes" blocker. Now omitted at zero | src/production/run.ts | smoke:production: fully-injected inputs → 6 blockers |
| C-EC6 | generic-prose-defect | buildMode reason hardcoded "(20 routes" (Stripe's count) — now interpolates the actual route-table count | src/production/run.ts | recompiled spec reads "(8 routes" |

**Full regression (mandatory — engine changed): 17 suites, 1,794 checks, 0
failures; typecheck exit 0.** Baseline 26B: 1,782/0. Delta +12 = seo 72→79,
assets 113→117, production 84→85. Logs + per-suite exit codes:
`docs/result/handoffs/26C-regression-logs/` (driver run twice: once after the
engine changes — 1,794/0 — and once more on the byte-final tree after three
smoke-comment neutralizations; the kept logs are the final run, start
2026-08-25T23:56:32Z, done 2026-08-26T00:14:43Z, identical 1,794/0). Per-suite: verifier 81 · selector 81 ·
multi-observer 62 · interaction-detector 92 · interaction-explorer 108 ·
interaction-patterns 88 · sitespec 257 · reconstruction 217 ·
reconstruction-qa 134 · e2e 130 · recon-template 64 · content-injection 68 ·
theme 47 · seo 79 · assets 117 · production 85 · release 84.

Superseded intermediate runs from this phase, kept on disk as the correction
trail: seo plan `2026-08-25T23-15-43-499Z` (pre-C-EC3 prose; its 64/69 QA is
the C-EC1/C-EC2 discovery evidence), materialization
`2026-08-25T23-20-21-743Z` (pre-C-EC4, 3 failures), production spec/build
`2026-08-25T23-32-42-075Z` + release project
`linear.app-2026-08-25T23-32-42-075Z` (pre-C-EC5/6; 7 blockers incl. the
spurious one). The canonical candidate is `2026-08-25T23-54-21-435Z`.

## 13. Limitations

1. **PRODUCTION_INPUTS_REQUIRED is the end state** — no domain, facts,
   licenses, or replacement assets exist; none were invented (spec §45).
2. **Real-people testimonial content**: the review-locked homepage
   testimonial twin (Gabriel Peal/OpenAI, Nik Koblov/Ramp) still renders on
   the injected homepage's mobile variant and ships in the package. It is
   replacement-required CONTENT, but the release requirement model has no
   kind for review-locked slot text, so it is carried here and in the
   handoff as a named operator priority, not as a machine requirement — an
   honest model gap (a future generic `content-review` requirement kind is
   the seam). The same applies in principle to all 255 review-locked
   source-brand token slots from 26B (logo walls, integrations grid,
   changelog media internals, automattic long-form body, /pricing $10/$16
   strings, header wordmark SVG).
3. **60 residual source-host renders remain by design** (all
   replacement-required; per-file list in network-qa.json); 1,162 source-URL
   strings and 316 `linear.app` mentions remain in served files (body
   anchors + never-fetched asset URLs — content/asset-input classes).
4. **Fonts**: fallback reflow cost unmeasured for this source (no @font-face
   recoverable from stored evidence; the harness refuses to guess the
   family↔URL binding); the clone has always rendered on the measured
   fallback stacks, and Phase A fidelity numbers embed that state. Licenses
   unverified — never guessed.
5. **12 customer wordmark masks materialized under default-conservative**:
   runtime-localized but customer-identity assets; flagged in the seam and
   in this report as replacement-required-equivalent. The deterministic
   ruleset had no evidence path to `required` for them (review-locked
   surface → no briefs) — recorded as a classification-evidence limitation,
   not silently accepted.
6. **@font-face / hreflang / og:image inventory depends on stored + bounded
   live evidence** — the ~60-stylesheet split of this source defeats the
   top-5 bounded CSS probe (recorded, not widened unilaterally).
7. **seo:qa measures the SEO boundary before the asset layer**: the 57
   measured head asset refs are expected to (and 56/57 do) disappear in the
   baked package; the check design records them instead of failing them.
8. Inherited from 26A/26B unchanged: hero-animation source drift, lazy
   below-fold decode at scroll-0, /security marquee offset, mobile-menu
   cosmetics, 3 preserved-gradient theme groups, inline-SVG paint.
9. Repository remains uncommitted on the single foundation commit — the
   standing workspace-versioning operational risk (Task 25 §29), unchanged.

## 14. Verdict

**PRODUCTION_INPUTS_REQUIRED — and that is the honest PASS condition for
this phase.** The full production pipeline (source SEO evidence → derived
production SEO → conservative asset/font independence → pinned
production-spec-v1 → independent static package proven by isolated-launch QA
→ artifact-derived release project) ran end-to-end on the fresh Linear pilot
with six generic engine corrections, zero Linear-specific code, and a green
1,794-check regression. What separates this candidate from
PRODUCTION_READY is exactly the operator-input list the Release Orchestrator
prints: a domain, 2 font decisions, 84 replacement-required images (plus the
named review-locked content surfaces incl. the real-people testimonial), and
the high-value facts/URLs — nothing technical, nothing invented.
