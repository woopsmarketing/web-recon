# Task 26 — Linear First Fresh-Site Production Pilot (2026-08-26)

Final report per spec §53. Written by 26-Report-Writer from formal artifacts
only (no agent conversation context): `26-preflight.json`,
`26-source-scout.json`, `26A/26B/26C` handoffs + verifications,
`26-final-audit.json`, `26-screenshots-index.md`, the three phase reports, the
release project (`data/linear.app/release-projects/linear.app-2026-08-25T23-54-21-435Z/`),
and the regression logs under `docs/result/handoffs/26{A,B,C}-regression-logs/`.
Every number below is quoted from those artifacts (rule §56); nothing is
estimated. Git add/commit/push during Task 26: 0.

---

## Executive Summary

The frozen Task 01–25 engine took a genuinely fresh public source —
`https://linear.app/` — end-to-end for the first time: discovery (1,750 URLs)
→ verification (110) → family selection (65 families) → an 8-route pilot →
exact reconstruction (content exact **1.0** over 18,918 compared nodes, **0**
runtime/hydration errors, wide-viewport centered drift **0 px** on 24/24) →
lossless template (**3,079 slots / 9,929 bindings**, default parity 20/20) →
synthetic-brand content injection (**FlowPilot**, 1,395 values assigned / 543
changed / 117 needs-input, layout QA 1,265/1,265 applied) → **dark-accent**
theme (browser-proven no-op parity, 0 new contrast/overflow findings) →
copied-nothing SEO (56 forbidden-copy comparisons, 0 violations) → conservative
asset/font independence (448 inventory entries → 155 materialized / 84
replacement-required never fetched / 2 fonts license-needs-review; source-host
renders 206 → 60, all attributed) → a hash-pinned independent production
package (isolated-launch QA **75/75**) → an artifact-derived release project
(**378 requirements, 88 release-blocking**, state
**PRODUCTION_INPUTS_REQUIRED**). Sixteen latent Stripe-era engine defects were
exposed and fixed generically (zero Linear-specific code; every fix
fixture-backed), with the regression suite growing 1,755 → 1,776 → 1,782 →
1,794 checks, all green. Three adversarial verifiers (26A/26B/26C) each
returned PASS_WITH_LIMITATIONS after recomputing every headline number from
raw artifacts, and the independent Final Auditor answered all ten §52
questions and returned **ACCEPT**. No production inputs (domain, font
licenses, replacement assets, business facts) exist and none were invented, so
PRODUCTION_INPUTS_REQUIRED is the honest, spec-expected end state.

## Why Linear

Task 26's question (spec §PURPOSE) was whether the pipeline built and
repeatedly exercised on Stripe could run URL → Reconstruction → Template →
Content → Theme → SEO → Assets → ProductionSpec → Release Project on a
completely new complex production site *without redesigning the engine*. The
spec fixed the source as `https://linear.app/` (public, browser-accessible
pages only). Linear qualifies as a genuinely adversarial fresh pilot:

- **Provably fresh**: preflight (2026-08-26 03:08 KST) grepped the entire repo
  for `linear.app` / `*linear*` — 0 hits; `data/` hosts contained no Linear;
  `data/linear.app/` was born 2 minutes later with the first live discovery
  run (26-preflight.json, 26-final-audit q1).
- **Structurally different from Stripe**: a dark-mode Next.js marketing site
  that is inline-SVG-heavy rather than `<img>`-heavy (219 homepage asset refs,
  179 inline SVG), with a continuously animating hero product-UI mockup,
  portal-mounted menus, soft-404s served as HTTP 200, client-side category
  filtering, an audio page (`/fm`), and strong responsive divergence
  (homepage 1,727 vs 659 effective-visible elements desktop vs mobile) —
  exactly the kind of surface that exposed 16 latent Stripe-era assumptions
  (see Generic Findings).

## Source Discovery

Run by 26-Source-Scout (`26-source-scout.json`), first live Firecrawl use of
the stored key (validated on first call):

- Probe Map run `data/linear.app/2026-08-25T18-10-52-136Z` hit the 300-URL cap.
- Broad Map run `data/linear.app/2026-08-25T18-11-04-122Z` (cap 2,000)
  returned 1,753 raw URLs → **1,750 normalized** (3 duplicates), under the cap
  — effectively complete Firecrawl Map coverage of linear.app (subdomains
  excluded by policy).
- Deterministic bounded sampling (structural exclusions + per-first-segment
  K-sampling; full rule in `scout-sample-provenance.json`) reduced 1,145
  includable URLs to 107 verification candidates, plus a 7-URL supplement
  driven by homepage nav evidence.
- Verification (live Playwright): **110 verified URLs** (105 + 7 minus
  overlaps; 103 unique in the main run + 7 supplemental), 2 hard 404s
  (`/android`, `/ios`), 4 `/blog→/now` redirects, **23 soft-404s served as
  HTTP 200** (one shared content-duplicate fingerprint family), 0 blocked, 0
  navigation errors, no bot challenge. **81 genuinely distinct real pages**
  after fingerprint dedup.

## Site Families

`pnpm select` on the 103 verified main-run URLs produced **65 structural
families** (`page-families.json` / `selected-pages.json`): 51 singleton, 9
scope-structure, 4 content-duplicate, 1 sibling-pattern; largest family = the
23-URL soft-404 group. At whole-site URL level the dominant discovered
families are `/integrations` (309 URLs), `/changelog` (274), `/demo` (230,
excluded app shell), `/docs` (146, deferred), `/now` (104). Shared-shell
measurement over the 81 distinct pages: header/nav/main/footer landmarks
near-universal (77/76/76/72), 27 distinct landmark hashes clustering into a
small number of shell variants. Excluded by rule: 260 workspace app
permalinks, 332 app-shell routes, 3 auth routes, 8 non-HTML/RSC probes, the
soft-404 family, and `/join-slack` (redirect stub); `/docs`, `/now`+`/blog`,
`/careers`, `/developers`, and the detail templates of
`/integrations`/`/changelog` were deferred with recorded reasons.

## Pilot Route Selection

**8 pilot routes** (`selectedRoutes.length = 8` in 26-source-scout /
26A-handoff), selected from observed evidence covering all six spec kinds
A–F, nothing invented:

| route | kind | selection evidence (abridged) |
| --- | --- | --- |
| `/` | A | site root; 89 buttons/5 inputs; 1,997 elements; strongest responsive divergence |
| `/plan` | B | product-pillar representative (nav product block); 733 elements, maxDepth 23 |
| `/pricing` | C | sole pricing/conversion page; 340 media elements (highest static count) |
| `/customers` | D | index of the 50-URL customers family; 62-img logo wall (asset stress case) |
| `/customers/automattic` | D | richest verified case study (6,332 chars; brand-isolation stress case) |
| `/security` | E | trust/compliance surface; 29 headings |
| `/changelog` | F | head of the 274-URL family; 61 buttons/7 inputs; 57,035 chars (most content-heavy) |
| `/integrations` | F | head of the 309-URL family (largest); 84 third-party logos; client-side filter |

`/homepage` (exact-fingerprint alias of `/`) was deliberately excluded from
the pilot set.

## Interaction Profile

From the definitive Phase A runs (`26A-handoff.json`, report §1):

- `detect:interactions` (observation run `2026-08-25T19-23-01-716Z`):
  **526 candidates** (263 per viewport; P1 148 / P2 360 / P3 18), 122 control
  relations, 52 unresolved (client-mounted).
- `explore:interactions` (live, `2026-08-25T19-30-59-785Z`): 34 actions
  planned → **31 executed → 26 changed**, 3 actionability errors (overlaid
  animated-mockup internals on `/` and `/pricing`), locator resolution
  **100%** (id-exact 17 / semantic 2 / structural 15), 16/16 dynamic targets
  mounted, 56 candidates excluded by navigation guards, 0 live safety events.
- `model:interactions` (`2026-08-25T19-33-19-974Z`): **23 confirmed patterns**
  — disclosure 13, dialog 8, selection 2 (mechanisms: aria-expanded 13,
  target-mounted 8, aria-checked 2) — plus **11 unknowns** (style-only 2,
  already-in-target-state 2, execution-error 3, unsupported-dynamic-region 1,
  insufficient-evidence 3).

## Fresh Observation

Definitive `observe:site` run `data/linear.app/site-observations/2026-08-25T19-23-01-716Z`:
8/8 pages, 8 desktop + 8 mobile captures, prepare-scroll ON, 84.0 MB in
131.4 s (26A report §1). Scout homepage deep observation
(`2026-08-25T18-17-10-755Z`): 1,994 elements on both viewports, document
height 10,898 px desktop vs 6,382 px mobile, 1,727 vs 659 effective-visible
elements, 219 asset references (179 inline SVG), fonts.ready true, network
idle reached, no bot challenge. Known source instability recorded: soft-404s
as HTTP 200, `/blog→/now` rename drift, homepage promo drift, careers/Ashby
volatility, and the continuously animating hero mockup (live-original desktop
comparison is source-drift: 1,994 vs 2,024 elements).

## Exact Reconstruction

`compile:sitespec` (`2026-08-25T20-30-27-653Z`): 8 routes / 8 pages, 16/16
viewports rendered-html aligned, 148 supplemental attributes, 8/8 pages with
attached layout probe, round-trip PASS. `reconstruct` + Next build
(`data/linear.app/reconstructions/2026-08-25T20-30-33-313Z`): 8/8 routes
mapped, build PASS, **1,910 recovered layout rules** (centered 42 /
full-width 1,106 / percentage 52 / responsive-hidden 710). Site-level
fidelity (QA run `2026-08-25T20-30-41-209Z`, 16/16 page-viewport pairs):

| metric | value |
| --- | ---: |
| compared nodes / missing in clone | 18,918 / **0** |
| content exact ratio | **1.0** |
| geometry median-of-medians / median-of-p95 | 0.01 px / **0.085 px** |
| document height Δ max | **0.5 px** |
| style properties compared / mismatched | 1,381,062 / 627 (0.045%) |
| clone JS / page / hydration errors | **0 / 0 / 0** |
| wide-viewport worst centered drift (1440/1920/2048 × 8 routes) | **0 px on 24/24** |

One auto-fix correction applied (`document-canvas-background`). Superseded
correction-trail runs kept on disk (5 QA rounds drove the Phase A engine
fixes EC1–EC6).

## Reconstruction QA

Per-route gate (26A-handoff `perRouteGate`): all 8 routes render; runtime,
hydration, major-interaction and major-geometry failures **0 everywhere**;
content exact 1.0 per route. Localized decorative offsets honestly recorded:
`/changelog` desktop geometry p95 320.73 px (media-embed/feed internals,
median 0.53 px, height Δ 0), `/security` 80 px animated logo-marquee cluster,
`/` desktop p95 13.67 px (animated mockup). The independent
26-Reconstruction-Verifier recomputed every number from raw per-pair files,
launched the clone with its own Playwright script (clean consoles on 11
route-viewport visits; Product mega-panel mounts once at the claimed box;
mobile portal menu mounts), independently probed the `webassets.linear.app`
CORS claim (403 for foreign origins / 200+ACAO for linear.app), and found
only three minor discrepancies (one stale homepage screenshot-ratio row;
sub-pixel rounding presentation; console-vocabulary nuance on `/customers`
CORS entries). Verdict: **PASS_WITH_LIMITATIONS**; builder verdict READY FOR
TRANSFORMATION supported.

## Recon Template

`compile:recon-template` → `data/linear.app/recon-templates/2026-08-25T21-53-26-980Z`
(template id `linear.app-2026-08-25T21-53-26-980Z`): **3,079 slots / 9,929
bindings** over 8 routes, compile validation 9,929/9,929 resolved and
9,929/9,929 default no-ops. Default parity QA: **20/20 pairs** content-equal
and structure-equal (incl. `/` and `/customers/automattic` at 1920+2048),
doc-height Δ max **0 px**, geometry p95 **0 px**, template-introduced JS
errors 0, hydration 0 (24 inherited CORS errors on the `/customers` pairs are
identical on the exact side); interaction regression 5/5; mutation canary
**30/30** applied with structure unchanged and clean runtime. All numbers
recomputed identically by the 26B verifier from `slots.json` /
`slot-bindings.json` / `parity-qa.json` / `mutation-qa.json`.

## Slot Profile

From the template artifacts (26B-handoff):

- By type: text 2,441 / url 443 / image 195. Scope: global 131 / page 2,948.
- Editability: **editable 1,586 / review 1,493**.
- Bindings by surface: static 9,663 / dynamic-template 262 / paint-twin 4 /
  **svg-text 0** (honest zero — no rendered SVG text run satisfied the Task
  19.1 co-binding evidence on Linear); by target: text 7,433 / attribute
  2,496; by viewport: desktop 5,104 / mobile 4,825; multi-binding slots
  2,813; cross-surface slots 7.
- Excluded candidates: **1,435** (svg-opaque 1,359 / aria-hidden 66 /
  presentation-role 10). Over-slotization review: no explosion — product mock
  UIs are svg-opaque-excluded or review-flagged; the ~150 small editable hero
  mockup fragments on `/` are real visible text.

## Content Units

Content run `data/linear.app/content-runs/2026-08-25T21-54-40-120Z`:
**1,202 content units in 36 batches** over the 1,586 editable slots (1,493
review slots skipped per §25). Provider: the Task 19 manual seam
(`content:generate --result`, generator `claude-code-operator` /
`claude-fable-5`) — bounded packet only, raw slot list never used. Result:
**1,395 slot values assigned, 543 changed vs default, 117 needs-input**,
**73 image briefs** (61 replace-recommended / 12 keep-default decorative);
validation PASS (3 non-failing broken-internal-route warnings on kept default
deep-docs hrefs). Layout QA (final round): **16/16 pages PASS** at 390/1440
across all 8 routes, doc-height Δ **0 px**, applied-value checks
**1,265/1,265** (static 1,158 + dynamic-template 107, incl. the click-mounted
header panel on all 8 routes), interactions 5/5, content-introduced JS errors
0, repair candidates 0, 32 screenshots. Two earlier rounds honestly failed
(31 fixed-width micro-label clips, 4 unslotted-duplicate desyncs, 152 false
dynamic applied-failures = B-EC2) and drove content fixes plus the generic QA
fixes.

## Pilot Content Intent

Working brand **FlowPilot**, recorded as **`synthetic-pilot-brand`**
(`sitePlan.siteIdentity.workingName = "FlowPilot (synthetic-pilot-brand)"`).
Intent: English translation of the spec §23 canary intent — an enterprise AI
work-automation / AI-agent operations platform with demo-request conversion —
stored verbatim in `intent.json` (hash in the manifest). Anti-invention rules
verified by the 26B verifier's regex sweeps: 0 FlowPilot domains, 0 emails, 0
phone numbers, 0 addresses, 0 founding dates, 0 certification claims, 0
customer-count claims; testimonials and metrics are explicit placeholders
("Customer name / Role, Company (to be provided)", "(metric pending)",
certifications "will be published here once provided").

## Source Brand Isolation

- **0 brand tokens in all 543 changed values** (recomputed independently by
  the 26B verifier).
- Brand-leak scan: **91 warnings**, fully classified with no remainder — 73
  image-slot defaults on the source CDN, 11 external CTA URLs (needs-input),
  7 internal href token paths.
- **255 review-locked slots retain source-brand tokens** (customers logo wall
  76, integrations grid 115, changelog feed internals 31, home mock internals
  + testimonial twin 19, automattic body 12, pricing 2) — §27 deferred
  warnings, Phase C asset/operator territory.
- 2 `/pricing` price strings ($10/$16) reverted per the Task 19.1
  unslotted-duplicate rule; `blocked-visible-source-content` **0**.
- Browser reconciliation (26B + 26C verifiers): every visible "Linear"
  occurrence on every route maps to an accounted review-locked/asset category
  — **0 unaccounted leaks**; `/plan` and `/security` render 0 occurrences.
  Nothing presents Linear identity as a FlowPilot fact in changed surfaces.
- Finding surfaced by verification: the review-locked homepage testimonial
  twin naming real people (Gabriel Peal/OpenAI, Nik Koblov/Ramp) still
  renders on the injected homepage **mobile** variant — carried as a named
  operator priority (see Known Limitations).

## Theme

Extraction `data/linear.app/theme-extractions/2026-08-25T22-16-41-774Z` (from
the frozen template manifest, offline): **217 paint groups** — 27 themeable /
140 preserved / 50 review — **21 tokens assigned**; original theme
`original.linear.app` (mode **dark**, export-candidate). Library
compatibility: cool-neutral / warm-editorial / dark-accent all
compatible-with-warnings; **dark-accent selected** (single reasoned §28
choice: the one library theme whose dark mode matches the source's original
dark mode). QA:

- Original-parity no-op (`theme-runs/2026-08-25T22-23-53-486Z`): 16/16 pages
  PASS, DOM identical, geometry max 0 px, **157/157** paint checks, 0 new
  low-contrast, 5/5 interactions.
- Curated dark-accent over the FlowPilot overlay
  (`theme-runs/2026-08-25T22-24-00-120Z`): 16/16 pages PASS, DOM identical,
  **115/115** paint checks (mounted-panel text verified themed at
  rgb(235,240,248)), 0 new horizontal overflow, 0 new low-contrast, 0
  theme-introduced JS errors, coverage 20 themed groups / element weight
  22,032, 5/5 interactions incl. desktop mega-menu and mobile portal menu.
  The 26B verifier confirmed the palette live in its own preview launch
  (canvas rgb(15,19,28) vs upstream rgb(8,9,10)); known residue: 3
  preserved-gradient groups and raster/inline-SVG internal paint keep
  original colors.

## Source SEO

Snapshot `data/linear.app/source-seo-snapshots/2026-08-25T23-15-08-566Z`
(evidence only, never copied): 8 pages; titles 8/8 present 0 duplicates;
descriptions 8/8, 0 duplicates; canonical 8/8 self-referential; robots meta
none 6 / index 1 (`/customers/automattic`) / noindex 1 (`/integrations`);
hreflang alternates **0**; Open Graph 27 entries / Twitter 51; JSON-LD on 1
page; 164 headings, 0 pages missing H1; link graph 8 nodes / 51 edges / 700
internal link occurrences, 0 broken internal links, 178 unverified targets;
live `robots.txt` 200 with 2 disallow rules (`/api/`, `/cdn-cgi/`) and 1
sitemap URL; live sitemap urlset with 1,003 URLs (2 opt-in live requests
total). All values recomputed identically by the 26C verifier.

## Production SEO

Plan `data/linear.app/production-seo-plans/2026-08-25T23-27-49-099Z`, mode
**preview**, 8/8 routes content-injected: 8 derived titles + 8 descriptions
from the FlowPilot intent; **41 needs-input values**; forbidden-copy gate
**56 comparisons / 0 violations** (plus the 26C verifier's own
exact+containment recompute: 0); brand isolation **123 scanned strings vs
{linear, linear.app, @linear} / 0 violations**. Honest preview posture served
by the actual package: `noindex,nofollow` on all 8 routes, `robots.txt`
`Disallow: /` with no Sitemap line, canonical **null** (never invented),
`/sitemap.xml` 404, path-only `sitemap.preview.xml` as plan artifact only.
Structured data: WebSite + Organization with name/description only —
address/phone/prices/reviews/foundingDate/sameAs all needs-input and OMITTED.
`seo:qa` **69/69 PASS** (24 runtime errors all inherited upstream, 0
SEO-introduced — C-EC1); 57 head source-asset references measured (not
graded — C-EC2), 56/57 rewritten in the baked package. Noted operator item:
all 8 derived titles are currently the identical string (harmless under
preview noindex; flagged for real launch).

## Asset Inventory

Inventory `data/linear.app/asset-inventories/2026-08-25T23-19-27-365Z`:
**448 entries = 241 URL + 207 inline-SVG**, 0 truncated; hosts
webassets.linear.app 180 / linear.app 55 / static.linear.app 6; 192
slot-joined, 73 image-brief-joined. Conservative classification (0 invented
approvals): **safe-to-materialize 0 / replacement-recommended 155 /
replacement-required 84 / license-needs-review 2** (rules:
default-conservative 141, image-brief-warning 73, video-brand-content 14,
brand-social-card 8, brand-favicon 3, font-license-unknown 2).
Materialization `2026-08-25T23-28-36-880Z`: **155/155 fetched, 0 failed**, 86
skipped by classification, 155 unique media files / 209,680,490 bytes, 155
rewrite entries, 239 replacement-seam entries; **no replacement-required
asset was ever fetched** (verifier set-checked rewrite-map and media/). The
12 customer wordmark masks were materialized under default-conservative
(fixes the Phase A CORS console errors and restores mask cutouts) but are
honestly flagged replacement-required-equivalent for the operator —
materialization is a runtime-dependency fix, not production approval.

## Font Inventory

`font-inventory.json`: 2 font URLs discovered
(`static.linear.app/fonts/InterVariable.woff2`, `Tiempos/tiempos-headline-regular.woff2`);
**0 @font-face rules recoverable** (provenance live-fetched: 5 render-order
stylesheets, 0 rules — the source splits ~60 stylesheets and injects fonts
via JS; nothing invented). Families in use: **inter variable** (4,188
declarations) and **berkeley mono** (109) — both status
**license-needs-review**, selfHostApproved false, with measured fallback
stacks ("SF Pro Display"/-apple-system/… and ui-monospace/"SF Mono"/…). No
font file fetched, no license guessed anywhere; both carry release-blocking
`font-license` requirements. Fallback reflow QA honestly "unobserved" (the
harness refuses to guess the family-to-URL binding without a recovered
@font-face rule); the clone has rendered on the fallback stacks since Phase A
and the accepted geometry parity embeds that cost.

## Network Independence

`assets:qa` real-Chromium census (baseline vs asset-served, scroll-triggered
lazy loads, all 8 routes): baseline **206** source-host requests →
independent residual **60** (60 unique files; linear.app 25 +
webassets.linear.app 35), **60/60 attributed to replacement-required
(image-brief-warning), 0 unattributed** — per-file list in
`asset-materializations/2026-08-25T23-28-36-880Z/report/network-qa.json`;
per-route residual 15/16/2/3/12/12/0/0. Package census (`production:qa`, no
scroll): **31 external requests** {linear.app 12, webassets.linear.app 19},
**0 unexpected hosts** — exactly reproduced by the 26C verifier's own
independent census (31/12/19/0), with every external URL reconciling to the
classified replacement-required set.

## ProductionSpec

`production-spec-v1`, run id `2026-08-25T23-54-21-435Z`, hash method
`dir-sha256-v1`. Pinned lineage — template `linear.app-2026-08-25T21-53-26-980Z`
(41 files / 31,885,945 B), content run `2026-08-25T21-54-40-120Z` (46 /
32,246,465), theme `2026-08-25T22-24-00-120Z` dark-accent (40 / 30,103,050),
SEO plan `2026-08-25T23-27-49-099Z` preview (8 / 237,047), assets
`2026-08-25T23-28-36-880Z` (160 / 210,076,618) — **all five hashes
byte-recomputed by the 26C verifier with an independent dir-sha256-v1
implementation: every hash, file count and byte count matches.** baseUrl
{value null, status needs-input, mode preview}; buildMode static-export
(8-route path-only table); indexability gate = **preview** with exactly 6
blockers (production-domain, 41 seo needs-input, 84 replacement-required
assets, 2 font licenses, business facts, 207 source-brand inline-SVG);
`uninjected-route-content` correctly absent — all 8 routes injected (C-EC5).

## Production Build

Bake (`production-builds/2026-08-25T23-54-21-435Z`): 1,395 content slot
values baked (0 unknown overlay keys), theme overlay 262,039 bytes, SEO route
titles 8/8 baked (0 guard mismatches), head blocks spliced 8/8, **1,903 asset
rewrites** (HTML 718 / flight 1,132 / CSS 53); 1,162 residual source-URL
strings remain in served files (body anchors + never-fetched required
assets — disclosed). Package: 215 site files / 258,657,406 bytes (261 MB),
155 media files, 10 route HTML files, dependency-free `server.mjs`.
**Isolated QA: 75/75 checks, 0 failed** — package copied outside the repo,
spawned with env=[PATH] only; routes 8/8 HTTP 200, post-hydration titles 8/8,
hydration/JS errors 0 on all 8 routes desktop + mobile (the inherited
`/customers` CORS class eliminated by mask materialization), content proofs
5/5, theme probes 5/5, interactions (desktop 2 triggers → 4 regions/2 state
flips; mobile portal menu), overflow none, external census 31/12/19/0. All
five independence conditions 0 (no SiteSpec / exact-run / template-dir /
content-env / theme-proxy dependency). The 26C verifier repeated the isolated
launch with `env -i` from its own copy: 25/25 route-viewport visits with 0
console and 0 page errors.

## Release Project

`pnpm release:prepare` → project
`data/linear.app/release-projects/linear.app-2026-08-25T23-54-21-435Z/`
(release-project.json, requirements.json, operator-checklist.md,
technical-debt.json). **State: PRODUCTION_INPUTS_REQUIRED — 378 requirements
total, 88 release-blocking unresolved** (severity 88 / 289 high-value / 1
optional). Route readiness **8/8 CONTENT_READY** (unlike the Stripe canary's
19 uninjected routes, content-route requirements are honestly 0);
`release:plan` shows all 7 stages READY(fresh); `release:build --dry-run`:
WOULD RUN nothing — all seven stages WOULD REUSE, zero mutation. Derivation
proven artifact-derived by the 26C verifier via set-equality: 117
external-url slotKeys == content-run unresolved slotKeys, 239
replacement-image ids == replacement-manifest inventoryIds, 84 blocking ids
== classification replacement-required ids; grep of the collector for
hardcoded counts: 0 hits.

## Operator Requirements

By kind (requirements.json; total / release-blocking):

| kind | total | blocking |
| --- | ---: | ---: |
| replacement-image | 239 | 84 |
| external-url | 117 | 0 |
| seo-fact | 8 | 0 |
| business-fact | 7 | 0 |
| font-license | 2 | 2 |
| production-domain | 1 | 1 |
| source-brand-asset (207 inline-SVG entries) | 1 | 1 |
| og-image / organization-logo | 2 | 0 |
| social-handle | 1 | 0 |
| **total** | **378** | **88** |

Ordered NEXT ACTIONS in the checklist: production domain → 2 font license
decisions → 84 replacement images (plus the source-brand-SVG
acknowledgement/replacement seam). Every entry carries evidence paths into
real artifacts. One disclosed model gap: the machine-readable requirements
have no review-locked-content kind, so the real-people testimonial (and the
255 review-locked token slots generally) is named as an operator top
priority in the 26C report/handoff prose rather than as a machine
requirement — the recorded seam is a future generic content-review
requirement kind.

## Responsive QA

- Phase A: 390/1440/1920 on all routes + 2048 canary; wide-viewport centered
  drift **0 px on 24/24 route-width combos** (`wide-viewport-final-accepted.json`;
  the pre-fix file honestly shows the 480–612 px left-pin EC4 closed);
  document height Δ ≤ 0.5 px on every pair; no horizontal overflow.
- Phase B: 16/16 route-width pages at 390/1440 for content and for both theme
  runs, doc-height Δ 0 px, 0 new horizontal overflow.
- Phase D (isolated package): 25/25 visits (8 routes × 390/1440/1920 + home
  2048) with horizontal overflow **0 px everywhere** and clean consoles;
  A/B/C full-page screenshot heights pixel-identical per route at 390 and
  1440 (only home@1920 set A is ~64 px taller — live hero drift).
- New responsive findings from visual review: C-VR1 (desktop closing-CTA
  overlap on 4 routes) and C-VR2 (`/security` @390 hero overlap) — see Known
  Limitations.

## Interaction QA

- Phase A (snapshot ↔ clone): trigger-state equivalence **23/23**;
  user-visible-target **20/23** — all 3 mismatches are one 1×20 px blinking
  caret inside the homepage's animated mockup (blink phase at uncorrelated
  instants); by type dialog 8/8, disclosure 11/13, selection 1/2; dynamic
  target mounts **16/16** with matching child counts, 0 content gaps;
  unknowns replay: 8 sampled → 8 clone no-op, 2 gaps, 3 unverifiable, 0
  auto-implemented.
- Phase B: 5/5 interaction regression in template parity, content layout QA
  and both theme runs (incl. desktop mega-menu and mobile portal menu, panel
  text themed).
- Phase D (isolated package, verifier's own scripts): **18/18 executions
  equivalent, 0 mismatch, 0 unsupported** — disclosure 13/13 (header Product
  mega-menu on all 8 routes + `/changelog` Fixes + homepage combobox/menu +
  `/plan` expander), dialog 3/3 tested (8/8 by shared signature — mobile
  portal menu), selection 2/2 (aria-selected / aria-checked flips); 0 console
  errors during all executions.

## Visual Review

Three separated screen sets, indexed in
`docs/result/handoffs/26-screenshots-index.md`: **A** source observations,
**B** exact reconstruction (96 PNG: 8 routes × 4 widths × original/clone/diff,
plus 18 themed PNG from the 26B verifier), **C** the transformed production
package (captured by the 26C verifier from the isolated copy), judged as
A|B|C triptychs plus full-resolution crops.

- **A vs B (fidelity): HIGH on 7/8 routes** at both required widths (+ home
  1920) — the one visually significant deviation is the `/changelog` desktop
  feed body (~half-width column with overlapping paragraphs; numerically
  disclosed in Phase A as p95 320.73 px, height Δ 0; prose
  under-characterized = C-VR3; mobile clean).
- **B vs C (transformation safety): SAFE** — FlowPilot copy or honest
  placeholders on every sampled editable surface; testimonials placeholdered
  on desktop; `/customers/automattic` reframed as an explicit sample;
  compliance claims deferred; dark-accent applied consistently incl. open
  interaction states; every retained Linear surface reconciles to a disclosed
  review-locked/asset category; the 12 materialized wordmark masks render
  again on `/customers`.
- Two **new** minor findings in the transformed package: C-VR1 (injected
  closing-CTA heading wraps to 3 lines at desktop widths and the buttons
  overlap the third line on `/`, `/customers`, `/plan`, `/pricing`; mobile
  clean) and C-VR2 (`/security` @390 injected hero heading's third line
  overlaps the intro paragraph; 1440 clean) — undetectable by the current
  gates (doc-height/horizontal-overflow only); evidence PNGs in
  `26C-verification-screens/`.

## Generic Findings

**16 generic engine changes** — all discovered by this fresh source, none
Linear-specific (independent greps by both phase verifiers and the auditor:
zero Linear strings/selectors/branches in src/), each fixture-backed in the
regression suites:

- **Phase A (EC1–EC6)**: dynamic-region mount evidence-gated instead of
  taxonomy-gated (EC1); layout probe mirrors prepare-scroll (EC2); structural
  probe-prefix attachment, coverage floor removed (EC3); capped-fill variant
  of centered-max-width — closed the 480–612 px wide-viewport left-pin
  (EC4); declared/observed channel reconciliation for framework-portal
  disclosures — killed the ghost duplicate mount (EC5); additive
  `sourceHtmlId` IR evidence field (EC6).
- **Phase B (B-EC1–B-EC4)**: introduced-vs-inherited JS-error rule in
  template parity QA (B-EC1), content layout QA + observed-channel mount
  markers (B-EC2), theme QA error gate (B-EC3), theme QA dynamic-surface
  paint probe marker query (B-EC4).
- **Phase C (C-EC1–C-EC6)**: seo:qa inherited-error gate (C-EC1); SEO
  head-scan scope — grade SEO surfaces, measure app-emitted asset refs
  (C-EC2); hardcoded Stripe prose "89 hreflang / single-locale Korean site"
  replaced with snapshot-derived facts (C-EC3); unmodeled `audio` asset kind
  (C-EC4); unconditional `uninjected-route-content` blocker omitted at zero
  (C-EC5); hardcoded "(20 routes" build-mode prose interpolated (C-EC6).

The auditor's q2 verdict: real Stripe-era bias surfaced (taxonomy gates,
absolute console gates, literal Stripe facts in prose, unmodeled asset kinds)
and every fix is generic. Additionally recorded engine seams (not defects):
a generic vertical intra-section overlap detector (C-VR1/2 class) and a
content-review requirement kind (testimonial class).

## Regression

Full 17-suite regression after each engine-changing phase, all green, logs
with per-suite exit codes preserved:

| stage | checks | failures | delta | logs |
| --- | ---: | ---: | --- | --- |
| Task 25 / preflight baseline | 1,755 | 0 | — | 26-preflight.json |
| 26A | 1,776 | 0 | +4 multi-observer, +5 sitespec, +12 reconstruction | `26A-regression-logs/` |
| 26B | 1,782 | 0 | +6 recon-template | `26B-regression-logs/` |
| 26C (final) | **1,794** | **0** | +7 seo, +4 assets, +1 production | `26C-regression-logs/` |

Typecheck exit 0 at every stage. Every total was independently re-summed from
the suite logs by the phase verifiers and again by the Final Auditor
(26A=1,776, 26B=1,782, 26C=1,794; FAIL strings inside sitespec/
content-injection logs verified to be intentional negative-test fixtures).

## Historical Integrity

Auditor verdict **PASS**: Task 17–25 reports and handoffs all carry mtimes on
or before 2026-08-25 22:49 KST — before the Task 26 window opened;
`find data/stripe.com -newermt '2026-08-26 03:00'` → 0 files; Linear output
exists only under `data/linear.app/`, `docs/result/26*`,
`docs/result/handoffs/26*`, and the named src/ engine changes (§57 namespace
rule). Git check **PASS**: `git log --all` shows exactly the one foundation
commit (2777b41), reflog shows no commit ever made during Task 26, staged
diff empty, 0 stashes. The standing Task 25 uncommitted-workspace risk (120+
untracked / 6 modified files on a single commit) is reported, not fixed, per
spec §58.

## Production Input Requirements

PRODUCTION_INPUTS_REQUIRED is the end state because no real production inputs
exist and none were invented (spec §44/§54: the expected honest state). To
reach an indexable PRODUCTION_READY build the operator must supply, via the
release orchestrator:

1. **Production domain** (1, release-blocking) — canonical/OG/sitemap are
   null until then.
2. **Font license decisions** (2, release-blocking) — inter variable and
   berkeley mono: accept the measured fallback stacks or verify self-hosting.
3. **84 replacement-required images** (release-blocking) — brand/customer/
   real-people imagery never fetched; briefs exist for the slot-joined set.
4. **Source-brand inline-SVG disposition** (1 requirement, 207 entries,
   release-blocking) — incl. the header wordmark and the OpenAI/Ramp logo
   sprite; acknowledgement records the limitation but does not unlock
   indexable production.
5. High-value inputs: 117 external CTA URLs, 8 SEO facts, 7 business facts,
   og-image/organization-logo, social handle (optional).
6. **Content review of the 255 review-locked source-token slots** — top
   priority the real-people testimonial on the homepage mobile twin, plus
   `/pricing` $10/$16 and per-route differentiated SEO titles (prose-named;
   see the model gap under Operator Requirements).

## Known Limitations

Honesty list, carried verbatim from the phase artifacts (none is a euphemism
for a gate failure — 26A/26B/26C verifiers each audited the list):

- **Animated hero mockup** (`/`): the hero product-UI mockup is a continuous
  animation — live-original desktop comparison is source-drift, the layout
  probe attaches the 267-element structural shell prefix only, and the 3
  visible-target mismatches are its 1×20 px caret's blink phase. Exactly
  preserved per spec §16.
- **C-VR1 / C-VR2 injected-copy overlaps** (new, minor, generic
  content-fitting class): the injected closing-CTA heading overlaps its
  buttons at desktop widths on `/`, `/customers`, `/plan`, `/pricing`; the
  `/security` @390 injected hero heading overlaps the intro paragraph.
  Undetectable by today's gates; operator copy input or a generic
  vertical-overlap detector closes them.
- **C-VR3 `/changelog` desktop feed characterization**: the Phase A "media-embed
  internals" prose under-describes a visually significant desktop feed
  deviation (~half-width column with overlapping paragraphs); the numbers
  (p95 320.73 px, height Δ 0) were honest and published in 26A.
- **Identical derived SEO titles**: all 8 production titles are currently the
  same string — harmless under preview noindex, an operator quality item for
  real launch.
- **Real-people testimonial**: the review-locked homepage twin naming Gabriel
  Peal/OpenAI and Nik Koblov/Ramp still renders on the injected homepage
  mobile variant and ships in the package — replacement-required CONTENT,
  carried as a **named operator top priority** (the requirement model's
  review-locked-content gap is disclosed, never silently absorbed).
- **Review-locked token surfaces**: 255 review-locked slots retain
  source-brand tokens (logo walls, integrations grid, changelog feed
  internals, automattic long-form body, `/pricing` "Linear Agent"/"Linear
  Asks" and the reverted $10/$16 prices, header wordmark SVG) — Phase C
  asset/operator territory, inside the release-blocking source-brand-SVG
  requirement where applicable.
- **`/customers` wordmark masks**: the 12 customer wordmark mask SVGs were
  materialized under default-conservative (fixing the CORS console errors and
  restoring cutouts) but are customer-identity assets — honestly flagged
  replacement-required-equivalent; the deterministic ruleset had no evidence
  path to "required" on a review-locked surface.
- **Fonts unresolved**: both webfont licenses license-needs-review, nothing
  guessed; fallback reflow honestly unobserved; the clone has always rendered
  on the measured fallback stacks.
- Inherited/by-design: 60 residual source-host renders (all attributed) and
  1,162 source-URL strings / 316 linear.app mentions in served files; lazy
  below-fold images do not decode at scroll-0 capture; `/security` marquee
  80 px offset; mobile-menu cosmetics (translucent backdrop, no hamburger
  icon swap); 3 preserved-gradient theme groups + raster/inline-SVG internal
  paint; Task 17.1 inheritances incl. font-source-binding-unverified; the
  repo remains uncommitted on the single foundation commit.

**Auditor carry-forward recommendations** (26-final-audit q10): (1) generic
vertical intra-section overlap detector (C-VR1/2 seam); (2) a content-review
requirement kind so review-locked text like the testimonial becomes a machine
requirement; (3) `/changelog`-class deep-feed layout characterization
improvement; (4) per-route differentiation of derived SEO titles; (5) commit
the workspace (standing single-commit risk).

## Final Auditor

26-Final-Auditor (fresh, evidence-only; `26-final-audit.json`) answered the
ten §52 questions:

1. **Fresh source?** YES — zero pre-existing Linear artifacts (preflight
   greps), `data/linear.app/` born with the first live discovery run, no
   Stripe artifact in any Linear lineage.
2. **Stripe bias exposed?** YES — 16 real Stripe-era assumptions surfaced;
   every fix generic and fixture-backed, zero Linear-specific code by its own
   grep.
3. **Reconstruction sufficient?** YES — gates recomputed from raw pairs
   (content 1.0, 0 errors, drift 0), with the `/changelog` desktop feed
   deviation honestly carried (C-VR3).
4. **Transformation worked?** YES — template lossless (20/20, 30/30), content
   really injected (1,395/543/117, 1,265/1,265), theme browser-proven
   (157/157 no-op, 115/115 curated).
5. **Source identity as fact?** NO unaccounted identity — 0 tokens in changed
   values, all visible remnants reconcile to disclosed categories; the
   real-people testimonial is named, prioritized, and its model gap
   disclosed.
6. **SEO independent?** YES — derived never copied (0 violations twice
   recomputed), honest preview posture served by the package.
7. **Asset/runtime honesty?** YES — conservative classification, 84 required
   never fetched, 60/60 residuals attributed, fonts never guessed.
8. **Requirements artifact-derived?** YES — 378/88 recounted; set-equality to
   source artifacts proven; no hardcoded counts.
9. **Verdict inflation?** NO — the final state is the deflated
   PRODUCTION_INPUTS_REQUIRED; every phase verdict carried
   PASS_WITH_LIMITATIONS from an adversarial verifier.
10. **Proceed?** YES — the §60 success definition is met on evidence; five
    carry-forward recommendations recorded.

Historical integrity PASS, git check PASS, regression totals re-summed
(1,776 / 1,782 / 1,794, failures 0), key screenshots personally viewed.
**Overall verdict: ACCEPT**, with the final Task 26 verdict recommendation
below.

## Final Verdict

**LINEAR PILOT ENGINE PASS — PRODUCTION INPUTS REQUIRED**

Every gate the engine controls passed on a genuinely fresh source under three
layers of adversarial verification, with 16 generic fixes and a green
1,794-check regression; the missing pieces are exactly the real-world inputs
(domain, font licenses, replacement assets, business facts, content review)
that the release project enumerates — none of which exist yet and none of
which were invented.
