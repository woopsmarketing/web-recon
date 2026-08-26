# Task 26B — Linear Template + Content + Theme (Phase B)

- Date: 2026-08-26
- Agent: 26-Transformation-Builder (fresh agent; sections 20–30 of the Task 26 spec)
- Input: accepted Phase A Exact Reconstruction (`data/linear.app/reconstructions/2026-08-25T20-30-33-313Z`, verifier verdict PASS_WITH_LIMITATIONS), the 8 scout-selected pilot routes, the frozen Task 18/19.1 Slot V2 + Task 19 Content Injection + Task 20 Theme engines.
- Scope: Recon Template compile → default parity → Content Units → synthetic pilot content injection (all 8 routes) → source-brand cleanup accounting → Theme extraction → Original parity → one curated library theme.

All numbers below are computed from the run artifacts named in each section (none are estimates).

---

## 1. Template compile (Slot V2)

Run: `data/linear.app/recon-templates/2026-08-25T21-53-26-980Z` (template id `linear.app-2026-08-25T21-53-26-980Z`), compiled from the accepted reconstruction manifest + SiteSpec `2026-08-25T20-30-27-653Z`. Offline, 545 ms, 0 network/AI.

| measure | value |
| --- | ---: |
| routes / pages | 8 / 8 |
| slots | 3,079 |
| — text / url / image | 2,441 / 443 / 195 |
| — global / page | 131 / 2,948 |
| — editable / review | 1,586 / 1,493 |
| bindings | 9,929 |
| — static / dynamic-template | 9,663 / 262 |
| — paint-twin | 4 |
| — svg-text | **0** (honest zero — see below) |
| binding targets: text / attribute | 7,433 / 2,496 |
| binding viewports: desktop / mobile | 5,104 / 4,825 |
| multi-binding slots / cross-surface slots | 2,813 / 7 |
| excluded candidates | 1,435 (aria-hidden 66 · presentation-role 10 · svg-opaque 1,359) |
| compile-time validation | 9,929/9,929 bindings resolve; 9,929/9,929 default no-ops |

Per-route slot distribution (from `slots.json`): global 131, `/` 463, `/changelog` 1,011, `/customers` 475, `/customers/automattic` 97, `/integrations` 459, `/plan` 227, `/pricing` 140, `/security` 76.

**svg-text = 0 is real, not a gap.** Linear's product visuals are inline-SVG-heavy (1,359 svg-opaque exclusions), but no rendered `<text>`/`<tspan>` run satisfied the Task 19.1 co-binding evidence (same-anchor byte-equal DOM label). Stripe's cutout-mask "Sign in" pill has no Linear counterpart. Reported as zero.

**Paint-twin = 4 is real.** Two occurrences on `/` (a review-locked hero mockup string painted twice) and two on `/plan` mobile (`launch-postponed…`, `aug-30`). Linear does not paint its hero headline twice the way Stripe does, so the count is small.

**Over-slotization review (spec §22).** The animated hero and product mock-UIs did NOT explode into thousands of editable fields: the generic evidence rules held (svg-opaque killed 1,359 candidates; large uniform sibling lists — the customer logo wall, the integrations grid, the changelog feed internals — were flagged `review`, which is why review concentrates on /customers 381, /integrations 388, /changelog 380). The DOM-based hero mockup contributed ~150 small editable text fragments on `/` — real visible text, correctly editable, manageable. No generic exclusion/editability defect; no engine change was needed for slotting.

## 2. Template default parity (browser QA)

Runs: `report/parity-qa.json` + `report/mutation-qa.json` in the template run (final QA `pnpm qa:recon-template`, PASS in 136 s).

- 20/20 page-width pairs (8 routes × 390/1440 + `/` and `/customers/automattic` at 1920/2048): content equal 20/20, structure equal 20/20, doc-height delta max **0 px**, geometry p95 **0 px**.
- Hydration errors 0. Template-introduced runtime errors **0** (see engine change B-EC1: the 24 console errors on the `/customers` pairs are the Phase-A-disclosed CORS mask-image loads, byte-identical on the exact side — 12 per viewport on BOTH apps).
- Interaction regression 5/5 triggers equivalent.
- Slot mutation canary: 30/30 binding occurrences applied (including inside the click-mounted dynamic panel), structure unchanged, runtime clean.

## 3. Pilot content (synthetic, all 8 routes)

Content run: `data/linear.app/content-runs/2026-08-25T21-54-40-120Z`, prepared from the template manifest with the canary intent (English translation of the spec §23 intent; `intent.json`, hash in manifest) and routes `/,/changelog,/customers,/customers/automattic,/integrations,/plan,/pricing,/security`.

- Working brand: **FlowPilot**, recorded as `synthetic-pilot-brand` in the site plan (`sitePlan.siteIdentity.workingName = "FlowPilot (synthetic-pilot-brand)"`). No corporate facts, domains, customers, metrics, testimonials, prices, certifications, phones or addresses were invented anywhere; every slot needing such a fact is `needs-input` or an explicit visible placeholder ("to be provided" / "metric pending" / "Pricing TBA").
- Content Unit architecture reused: 1,202 units / 36 batches over the 1,586 editable slots; the 1,493 review slots were skipped (default per §25). The provider is the Task 19 **manual seam** (`content:generate --result`, generator `claude-code-operator` / `claude-fable-5`): the operator read the bounded packet (content-units + instructions), authored a complete `ContentGenerationResult` (site plan for all 8 routes + slot values + sources + unresolved + image briefs), and never saw or needed the raw slot inventory.
- Validation: PASS. **1,395 slot values assigned** (543 changed vs default; the rest deliberate `derived-copy` keeps: internal route URLs, dates, timestamps, counts, keyboard keys, generic single-word UI labels), **117 unresolved (needs-input)**, **73 image briefs** (60 replace-recommended with explicit warnings on product screenshots / demo avatars / customer-identity imagery; 12 keep-default decorative category icons with review warnings; 1 more replace-recommended on /customers cover), 3 non-failing warnings (kept default hrefs pointing at deep `/docs/*` routes outside the 8-route table).

Per-route coverage (assigned = slots with overlay values; preserved = kept-default assigned + not-in-overlay editable + review-locked):

| route | assigned | changed | needs-input | preserved (kept-default + no-overlay + review) | brand-leak warnings (scan) |
| --- | ---: | ---: | ---: | ---: | ---: |
| global (header/footer) | 127 | 18 | 4 | 109 + 0 + 0 | 4 |
| / | 228 | 107 | 2 | 121 + 20 + 213 | 19 |
| /changelog | 561 | 266 | 54 | 295 + 16 + 380 | 27 |
| /customers | 90 | 23 | 2 | 67 + 2 + 381 | 2 |
| /customers/automattic | 52 | 16 | 21 | 36 + 3 + 21 | 4 |
| /integrations | 33 | 4 | 26 | 29 + 12 + 388 | 12 |
| /plan | 172 | 79 | 2 | 93 + 21 + 32 | 21 |
| /pricing | 60 | 9 | 2 | 51 + 0 + 78 | 2 |
| /security | 72 | 21 | 4 | 51 + 0 + 0 | 2 |
| **total** | **1,395** | **543** | **117** | — | **91** |

Every route received meaningful injection — hero/headings/pillars/CTAs on `/`, a fully recomposed FlowPilot release feed on `/changelog` (266 changed values of original authored release notes), placeholder-scaffolded story index on `/customers`, an explicitly-labeled case-study template on `/customers/automattic`, FlowPilot connector-directory copy on `/integrations`, a full Workflows-pillar rewrite on `/plan`, tier structure with prices-TBA on `/pricing`, and a security-posture rewrite with certification claims replaced by to-be-provided placeholders on `/security`.

### Layout-safety QA (final: PASS)

`report/layout-qa.json`: **16/16 route-width pages PASS** at 390/1440, doc-height delta **0 px on every page**, hydration 0, content-introduced runtime errors 0 (the 12–15 console entries on the `/customers` pairs are the inherited CORS asset loads, present identically in the default capture), applied-value checks **1,265/1,265** (static 1,158 + dynamic-template 107, including the click-mounted header panel on all 8 routes), interaction regression 5/5, repair candidates 0, 32 screenshots (default vs injected per route/width) under `report/screenshots/`.

Two earlier QA rounds honestly FAILED and drove content fixes (operator-side authoring, not engine changes):

1. **31 fixed-width micro-label clips** — exact-reconstruction computed styles freeze some boxes to the original text's width, so any longer value clips. Repair per the existing constraint philosophy: values shortened to fit (module names Intake/Plan/Build/Diffs/Monitor/Asks/Method reverted to their original generic English words; mock-UI labels re-fit, e.g. "Approvals", "Audit", "Agent", "Coder").
2. **4 unslotted-duplicate desyncs** (Task 19.1 severity split): `/pricing` price strings `$10 / $16 per user/month` (6 copies in the page tree, only 2 slotted — the extra copies live in excluded toggle-panel duplicates) and two `/plan` mockup strings. Repair is the prescribed revert. Consequence recorded honestly: **the source's per-user price strings remain visible on /pricing** — a known source-fact leak requiring operator pricing input (see §4).

## 4. Source-brand cleanup (§27)

Scanned by the Task 19 brand-leak scan over everything that renders from unit slots (`report/brand-leak.json`, tokens derived from the source host) plus a review-surface audit computed from the template artifacts.

**Changed values: 0 brand-token hits.** No generated value contains "Linear"/"linear.app". The FlowPilot surfaces carry no source-brand claim: testimonials → explicit "Add a customer story here…" placeholders (no invented people), customer counts → capability positioning ("Built for teams of 10 to 10,000 people"), metrics tiles → "—" + "(metric pending)", certifications → "will be published here once provided", prices → "Per-user pricing TBA" (except the two reverted strings below).

**Retained source content, all recorded (91 scan warnings + review surface):**

| category | count | disposition |
| --- | ---: | --- |
| Image slots kept at default (source CDN URLs contain the brand token; includes all product screenshots and demo avatars) | 73 | WARNING — deferred to Phase C asset materialization/replacement; every one carries an image brief (60 replace-recommended + warnings) |
| External CTA URLs still pointing at source destinations (status page, X, GitHub, YouTube, app stores, automattic.com, partner sites) | 11 needs-input (3 flagged by the URL rule + 8 inside the token category) | needs-input per policy — never invented; operator must supply destinations |
| Internal hrefs whose kept route path contains the token (e.g. `/changelog/...-linear-agent` style slugs, 7) | 7 | route table is preserved by design; flagged for the production/SEO stage |
| /pricing price strings reverted due to unslotted duplicates | 2 | visible source prices — operator pricing input required; structural (excluded duplicate) — cannot be safely rewritten at the content layer |
| Review-locked slots whose defaults contain the brand token (customer logo wall 76, integrations grid 115, changelog feed internals 31, home mock internals 19, automattic body 12, pricing 2) | 255 | §27 decorative/deferred WARNING — these regions are review-locked by the generic anti-over-slotting rules (uniform lists, low-confidence surfaces) and are Phase C asset/operator-review territory; the /customers/automattic long-form body paragraphs are the largest visible-text block here and the page now opens with an explicit "sample story / to be provided" frame |
| `blocked-visible-source-content` (engine-blocked user-selected changes) | **0** | none — every slot targeted for change was applied |

## 5. Theme

Extraction run: `data/linear.app/theme-extractions/2026-08-25T22-16-41-774Z` (from the frozen template manifest; offline, deterministic).

- **217 paint groups** — themeable 27 · preserved 140 · review 50; **21 contract tokens** assigned on evidence; Original Theme `original.linear.app`, **mode dark** (Linear is a dark site; canvas `rgb(8,9,10)`, text `rgb(247,248,248)`, link `rgb(130,143,255)`).

Library compatibility (`pnpm theme:check`, gate not ranking): all three curated themes pass —`cool-neutral` (light) compatible-with-warnings, `warm-editorial` (light) compatible-with-warnings, `dark-accent` (dark) compatible-with-warnings (shared warnings: 3 preserved-gradient groups keep original accent colors; raster/inline-SVG internal paint is never auto-recolored).

**Selected for the pilot test: `dark-accent`** — the one library theme whose mode matches the site's original dark mode (reasoned single selection per §28, not a ranking; the two light themes remain available but a light palette over Linear's dark preserved surfaces would lean hardest on the preserved-paint warnings). Theme runs:

- Original parity: `data/linear.app/theme-runs/2026-08-25T22-23-53-486Z` (compatibility: compatible)
- dark-accent + injected FlowPilot content: `data/linear.app/theme-runs/2026-08-25T22-24-00-120Z` (compatibility: compatible-with-warnings; overlay dry-run 20 groups themed / 14 custom properties)

### Original parity (theme run `2026-08-25T22-23-53-486Z`, final QA after B-EC4)

**PASS — Original Theme applied is a no-op**: 16/16 route-width pairs (8 routes × 390/1440) DOM identical, geometry max **0 px**, doc-height Δ **0 px**, new low-contrast text 0, paint checks **157/157** applied (static 128 + pseudo 28 + dynamic-template 1 — the click-mounted header panel's text sampled inside the mounted region at the original `rgb(247, 248, 248)`), groups verified 26/27 (one themed group has no probe-able occurrence on the QA routes), interactions **5/5** equivalent (desktop disclosure + mobile menu open under theme).

### Curated theme `dark-accent` + injected FlowPilot content (theme run `2026-08-25T22-24-00-120Z`, final QA after B-EC4)

**PASS** (baseline "content-injected" — the theme is measured on top of the injected FlowPilot site): 16/16 pairs DOM identical, geometry max **0 px**, doc-height Δ **0 px**, new horizontal overflow 0, **new low-contrast text 0**, theme-introduced runtime errors 0, hydration 0; paint checks **115/115** applied (static 98 + pseudo 16 + dynamic-template 1 — the mounted panel's text verified at the themed `rgb(235, 240, 248)`), 20 groups themed / 19 verified by probes / element weight 22,032; interactions **5/5** equivalent in static AND open states (desktop mega-menu open, mobile portal menu open). Coverage per token recorded in `qa.json` (`color.text.primary` alone carries element weight 9,843).

Theme review measures (§29 checklist): paint groups 217 (themeable 27 / preserved 140 / review 50); dynamic-surface coverage — the mounted panels are reached by the interaction phase and by the dynamic-template paint probe (B-EC4); contrast — browser-computed, 0 new low-contrast nodes on every pair in both runs; geometry — 0 px deltas everywhere.

## 6. Engine changes (defect policy §13/§51)

Four generic engine changes were made in Phase B, all in QA gating/detection — none in compile, slotting, injection, or rendering; zero Linear-specific selectors, routes, or strings (verifiable by grep over the four changed files):

| id | classification | change | fixture |
| --- | --- | --- | --- |
| B-EC1 | generic template-QA defect | `src/recon-template/parity-qa.ts`: the parity/mutation gate demanded absolute zero template-side console errors while the exact reference emitted the identical errors (Linear's CDN CORS-refuses hotlinked mask-images → both apps log the same 12 errors per /customers viewport; Stripe never triggered this because its exact app logged 0). New rule: a pair fails only on **template-introduced** js errors — errors absent from the exact capture — with serve-origin normalization (the two apps run on different harness-chosen ports). Exported `normalizeJsError` / `findIntroducedJsErrors`; report rows now carry `templateIntroducedJsErrors`. | `smoke:recon-template` §15 unit block (5 checks incl. negative controls: template-only error still fails; different asset URL not normalized away) + §14 introduced-errors-0 assertion |
| B-EC2 | generic content-QA defect (same class) | `src/content-injection/layout-qa.ts`: same absolute gate vs the default capture of the same app → now fails only on **content-introduced** errors (reuses the B-EC1 helper). Also `verifyDynamicBatch`'s mounted-region query only knew the declared-mount markers (`[id^="wr-obs-"]`, `[data-wr-dynamic-target]`); Phase A's EC5 observed-channel mounts stamp `data-wr-obs-mounted`/`data-wr-dynamic-content`, so every observed-channel panel was invisible to the applied-value check (152 false "0 mounted regions" failures across 8 routes). The query now includes `[data-wr-obs-mounted]`. After the fix: applied 1,265/1,265. | helper covered by §15; marker fix exercised by the real Linear run (152→0) and by the existing smoke content-injection dynamic checks |
| B-EC3 | generic theme-QA defect (same class) | `src/theme/theme-qa.ts`: same absolute gate vs the unthemed baseline capture of the same app → now fails only on **theme-introduced** errors (same helper). | helper covered by §15; smoke:theme unchanged behavior on clean fixture |
| B-EC4 | generic theme-QA detector gap (same class as B-EC2's marker gap) | `src/theme/theme-qa.ts`: the dynamic-surface paint probes searched mounted regions via `[id^="wr-obs-"], [id^="wr-dyn-"]` only — Phase A's observed-channel mounts (`data-wr-obs-mounted` on a static host) were invisible, so `dynamicPaint` sampled 0 elements even though 12 themeable groups carry 582 dynamic-occurrence elements. The query now includes `[data-wr-dynamic-target], [data-wr-obs-mounted]`, and the re-run samples real paint inside the click-mounted panels. | exercised by the re-run (0 sampled → real samples); smoke:theme dynamic checks unchanged on its declared-mount fixture |

Classification note: the underlying phenomenon (source CDN allowlists its own origin, so any faithful clone logs CORS console errors) is a **site characteristic already accepted in Phase A**; the defect was that three QA gates measured "zero errors" instead of "no errors beyond the accepted reference". The fix direction is evidence-relative, site-agnostic, and cannot mask a real regression (introduced errors still fail; negative controls in the fixture).

### Full regression (required because engine code changed)

All 17 smoke suites + typecheck re-run after the final engine state (driver start 2026-08-25T22:38:18Z, done 22:56:23Z; logs + per-suite exit codes in `docs/result/handoffs/26B-regression-logs/`):

**17 suites · 1,782 checks · 0 failures · typecheck exit 0.** Baseline (26A): 17 suites / 1,776 / 0. Delta +6, all in `smoke:recon-template` (58 → 64: the §14 introduced-errors assertion + the 5-check §15 inherited-vs-introduced unit block with negative controls). Per suite: verifier 81, selector 81, multi-observer 62, interaction-detector 92, interaction-explorer 108, interaction-patterns 88, sitespec 257, reconstruction 217, reconstruction-qa 134, e2e 130, recon-template 64, content-injection 68, theme 47, seo 72, assets 113, production 84, release 84.

## 7. Limitations

0. **Homepage hero headline stays source copy.** The visible hero line ("The product development system…") is painted by aria-hidden nodes inside the ANIMATED hero (excluded by the generic aria-hidden rule); the only slotted address is a 1×1 screen-reader-only H1 span (`home.main.hero.headline`, review-flagged by `sibling-repetition:30`; constraints record the 1×1 box). Rewriting the sr-only H1 alone would desync it from the excluded animated paint layer — exactly what the Task 19.1 stale-twin detector fails, with revert as the prescribed repair — so it stays at default. This is the animated-hero limitation Phase A disclosed, now surfacing at the content layer; treatment requires the Phase C asset/animation replacement seam (or operator-approved animated-region strategy), not a content-layer patch. The string carries no source brand token; the rest of the hero section (headings, sub-copy, CTAs, mock-UI internals) is rewritten.
1. `/pricing` per-user price strings remain the source's values (unslotted-duplicate revert; operator pricing input required before production).
2. 255 review-locked slots retain source-brand tokens (logo walls, integrations grid, changelog media captions, automattic long-form body) — §27 deferred warnings; Phase C asset replacement + operator review territory. The case-study page frames itself as a sample pending real material.
3. All 73 image slots still reference source-CDN URLs (deferred to Phase C asset independence by design; every one carries a brief, 60 with replacement warnings).
4. External CTA destinations (11) are needs-input; their defaults still render until the operator supplies destinations.
5. The `/customers` route logs the Phase-A-disclosed inherited CORS console errors in every capture (asset-hotlink limitation; Phase C).
6. Content language is English (source-site language, per the intent translation note); the Task 19 Korean canary precedent shows the pipeline is language-neutral.
7. Theme: 3 preserved-gradient groups and all raster/inline-SVG internal paint keep original colors under any library theme (never auto-recolored) — visible as accent remnants under `dark-accent`.
8. Inherited Phase A limitations (hero mockup animation, lazy below-fold decode at scroll-0, /security marquee offset, mobile-menu cosmetics, font-source-binding-unverified) carry forward unchanged.

## 8. Verdict

Template compile lossless and parity-proven (20/20 pairs, 0 px, mutation 30/30); all 8 pilot routes carry injected synthetic FlowPilot content through the official Task 19 pipeline with layout QA 16/16 and applied 1,265/1,265; source-brand cleanup fully accounted (0 brand tokens in changed values; every retained source surface named, classified, and deferred with warnings per §27); Original Theme parity is a browser-proven no-op and the curated `dark-accent` theme passes the full theme QA on top of the injected content; four generic QA-layer engine fixes are fixture-backed with the full 17-suite regression green (1,782 checks, 0 failures).

**READY FOR PRODUCTION PIPELINE**
