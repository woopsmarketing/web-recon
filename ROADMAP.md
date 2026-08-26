# web-recon — Roadmap

High-level plan only. Details are decided per-phase, not up front.

## Phase 1 — Foundation ✅

Project init, toolchain, directory skeleton, Firecrawl/Playwright ready to run.

## Phase 2 — Firecrawl URL Discovery ✅

Use Firecrawl **Map** as a Discovery Provider to enumerate a site's URLs, then
normalize / deduplicate / same-site-filter into a validated `DiscoveryResult`
persisted to disk. Firecrawl is kept behind a `DiscoveryProvider` boundary so it
is not coupled into the rest of the engine.

Done: provider abstraction, deterministic normalization (fragment/port/tracking
params), dedup, same-site filtering, zod-validated schema, raw+normalized
persistence, `pnpm recon <url> [--max-urls N]`.

Not in this phase: crawling page content, subdomain discovery by default,
public-suffix handling, retry systems.

## Phase 3 — Playwright Responsive Deep Observation ✅

Per single URL, **for each viewport profile (desktop + mobile)**: render in real
Chromium, stabilize (load → bounded networkidle → bounded `fonts.ready` →
optional read-only prepare-scroll → settle), then collect page metadata,
rendered HTML, per-element DOM with stable ids, **deduplicated** computed styles
(shared `styles.json` table + `styleId` refs), `getBoundingClientRect` geometry,
local + effective visibility, asset/link references (incl. inline-SVG markup),
iframe + open-shadow inventory, environment metadata, and a full-page screenshot.
One shared pipeline parameterized by a `ViewportProfile`; real responsive
differences are preserved per viewport (no normalization/merge, no cross-viewport
matching). Read-only (no interaction/AI). Isolated under `src/observer/`,
zod-validated, persisted to `data/<host>/<run-id>/viewports/<id>/`. CLI:
`pnpm observe <url> [--prepare-scroll]`.

Done (Task 03): single-page observer, stable observation ids, attribute/style
whitelists, direct-text-only policy, deterministic visibility, asset + link
derivation, desktop deep observation + screenshot, mobile screenshot, data-size
measurement.

Done (Task 04 — quality hardening): `fonts.ready` stabilization + per-phase
timings; `raw.html`→`rendered.html`; **computed-style deduplication** (shared
table); inline-SVG preservation; asset augmentation (`currentSrc` / natural size,
`mask-image`); local vs effective visibility; expanded high-value CSS whitelist;
environment metadata; read-only prepare-scroll; iframe + shadow inventory;
no-dangling-`styleId` invariant.

Done (Task 05 — responsive): single shared observer pipeline parameterized by a
`ViewportProfile`; **mobile now gets the full deep observation**, not just a
screenshot; per-viewport storage under `viewports/<id>/`; viewport-aware
environment + pinned locale/timezone/colorScheme/reducedMotion recorded in a
top-level `observationProfile`; deterministic `responsiveSummary`; schema v3.
Both viewports keep independent style tables and the no-dangling-`styleId`
invariant. Verified real responsive differences (nav→hamburger, hero font-size
60→36px, hero image reflow, grid/height changes) on both test sites.

Not in this phase (deferred): tablet observation, automatic breakpoint discovery,
desktop↔mobile semantic element matching, multi-page automation, Discovery→Observer
wiring, frame/shadow **deep** observation, interaction.

**Quality follow-ups (future):**

- **Raw HTTP response body** — store `response.html` (original server response)
  alongside `rendered.html` (post-JS DOM), so pre- and post-hydration states can
  be compared. Task 04 stores only `rendered.html`.
- **Browser-side collector bundle** — the in-page collector still relies on a
  `__name` no-op shim injected before `page.evaluate` (tsx/esbuild `keepNames`
  leaks a `__name` helper into the serialized function). A dedicated
  browser-side bundle would remove the shim; kept minimal for now.
- **Frame / shadow deep observation** — a later phase can observe open shadow
  trees and same-origin iframe documents; Task 04 records only their inventory.
- **Font/asset completeness** — `@font-face` URLs are read only from same-origin
  stylesheets (cross-origin `cssRules` access throws); asset binaries are not
  fetched; inline-SVG markup is stored but not sanitized (untrusted).
- **Adaptive prepare-scroll** — prepare-scroll stays default OFF (no measurable
  gain on the two test sites in Task 04). A future policy should scroll only when
  a lazy-loading candidate is detected (`lazy-loading candidate detected →
  prepare-scroll`) rather than always; the Lazy Candidate Detector itself is not
  built yet.
- **Interactive SVG deep exploration** — static inline SVG is preserved as root
  `outerHTML` and the DOM walk does not descend into the SVG subtree (Task 04
  policy, kept in Task 05). If an *interactive* SVG is found, the Interaction
  Explorer phase will need a separate SVG deep-exploration step; not in scope now.
- **Desktop↔mobile semantic matching** — element/style ids are stable only within
  a viewport; a later step can align semantically-equivalent desktop/mobile
  elements (needed before any responsive reconstruction).
- **WebKit / iOS-Safari observation profile** — the default mobile profile is now
  Chromium-consistent (Android Chrome UA on the Chromium engine). Real iPhone
  Safari behavior differs at the *engine* level, so it should be a separate
  observation profile running on Playwright's **WebKit** engine — not a UA swap on
  Chromium (which would only produce a Safari-content / Chromium-render hybrid).
  Not built yet.

## Task 06 — Discovery Candidate Verification ✅

A Firecrawl Map result is a list of **candidates**, not confirmed pages. Before
any multi-page Deep Observation, verify each candidate **once** in real Chromium
(Playwright) as a **lightweight filter** — check real reachability, HTTP status,
redirect chain, final URL, content-type, and a few page-identity signals; derive
deterministic duplicate hints. Strictly read-only (GET + inspect). Reuses the
existing `discovery.json` (never calls Firecrawl) and extends the discovery run
directory with `verification.json` + `verified-urls.json`. Isolated under
`src/verifier/`, zod-validated (schema v2 since Task 08). CLI:
`pnpm verify <discovery.json> [--concurrency 1–8]`.

Done: per-candidate fresh `BrowserContext` (no state leakage across candidates);
bounded concurrency (default 3); deterministic status taxonomy (`valid-html`,
`http-error`, `navigation-error`, `non-html`, `external-redirect`, `blocked`);
redirect-chain reconstruction from Playwright's request graph; content-type
gating (non-HTML kept in verification data, excluded from Deep-Observation
candidates); same-site reuse of Discovery's `isSameSite()`; canonical extraction
as a **hint** only; text + structure SHA-256 fingerprints (no AI, no semantic
similarity); `final-url` / `canonical` / `content-fingerprint` duplicate groups
(only `final-url` is treated as a strong duplicate); `verified-urls.json` with
final-URL dedup; local deterministic fixture test (`pnpm smoke:verifier`);
verified live on `domainchecker.co.kr` and `seoworld.co.kr`.

Not in this task (deferred): retry of transient failures, deep observation of
verified URLs, representative/pattern selection across duplicate hints,
tablet/WebKit verification profiles.

## Task 07 — Page Family & Representative Selection ✅

Group verified URLs into **Page Families** with deterministic route + structure
signals, then pick exactly one representative per family for the next stage.
**Offline deterministic processing**: no Firecrawl call, no Playwright launch, no
network request, no AI — it consumes only `verified-urls.json` +
`verification.json`, so it costs 0 crawl and 0 browser time. Isolated under
`src/selector/`, zod-validated (schema v1), extends the existing run directory
with `page-families.json` + `selected-pages.json`. CLI:
`pnpm select <verified-urls.json> [--verification PATH]`.

Done: deterministic route features (path segments/depth, `xx`/`xx-YY` locale
prefix as metadata only, route scope, parent path, sorted query keys, terminal
segment shape `root|numeric|uuid|date-like|hex-id|text`); **layered** grouping
(content-duplicate → sibling-pattern → scope-structure → singleton) instead of a
union-find that would chain signals into one giant component; content-duplicate
collapse consuming Task 06 `content-fingerprint` groups while preserving every
alias as a member; `inferredRoutePattern` (`/blog/<*>`) named as
observation-derived, never a framework-route claim; canonical used **only** as a
hint + representative tie-break (never a merge cause); site-root force-isolation;
deterministic representative rule (self-canonical → no query → shallower → shorter
→ lexical); stable `f000001…` ids assigned after a data-derived sort; hard
invariants (exactly one family per URL, exactly one representative per family,
`selectedCount === familyCount`, full coverage) enforced before writing; no
selection cap; offline fixture test (`pnpm smoke:selector`, 67/67); run on
`domainchecker.co.kr`, `seoworld.co.kr`, `nextjs.org`, `developer.mozilla.org`.

**Measured result — the important finding:** deterministic grouping reduced 112
verified URLs to 110 families across the four sites (1.8%). Per site:
domainchecker 19→19 (0%), seoworld 30→28 (6.7%), nextjs.org 40→40 (0%), MDN 23→23
(0%). No false merges, and the two Task 06 canonical anomalies correctly stayed
unmerged. The cause is not the grouping rules but the available signal: Task 06's
`structureHash` is an exact SHA-256 over the whole DOM tag/depth sequence, so it
only matches when two pages have a byte-identical structure — the two families
that did form have *identical* DOM element counts (144/144, 172/172), while three
MDN reference pages from one template (930/932/935 elements) produce three
different hashes. It is a correct duplicate detector and an unusable template
detector. **Task 08 fixed the signal; the grouping hierarchy was kept.**

Not in this task (deliberately): AI/LLM clustering, semantic labels, fuzzy or
embedding similarity, multi-page Deep Observation, any selection cap.

## Task 08 — Deterministic Structural Family Signals ✅

Add a second, deliberately COARSER structure signal in the Verifier **next to**
the exact fingerprints (never replacing them), and point the Selector's two
structural rules at it:

```
Exact  textHash + structureHash  →  duplicate / identity   (unchanged)
Coarse StructuralProfile         →  template / page family (new)
```

Still deterministic and still no AI, embedding, or similarity score. Schema v2 on
both sides; both CLIs unchanged.

Done: one tag-only in-page walk (no text, no attribute values, no styles) yielding
a depth-tagged token stream, a landmark stream and per-tag counts, with all
normalization on the Node side under ONE global policy — `shallowSkeletonHash`
(depth cap 6, repeated sibling *shapes* collapsed, `<head>`/`<script>`/`<style>`/
`<meta>`/`<link>` subtrees dropped, inline `<svg>` opaque), `landmarkHash`,
bucketed `tagHistogramHash`, plus `elementCount` / `maxDepth` / `landmarkCounts` /
`structuralCounts` / `histogramBuckets`; three separate hashes rather than one
magic hash so a family stays explainable; Selector `sibling-pattern` /
`scope-structure` now key on skeleton + landmark + element-kind presence, guarded
by route context, a path-ancestor exclusion (a section index is never absorbed by
its own detail pages) and a global element-count ratio ceiling of 2.0; every
family records `familyMatch` + `structuralMatchReason`; new rule invariants throw
before writing; `pnpm select` still touches no network (import graph re-verified);
fixtures extended to 81 + 81 checks with the §18 positive and §19 negative cases
served as real HTML; all four sites re-verified from their existing
`discovery.json` (no Firecrawl call) and re-selected.

**Measured result:** the same 112 verified URLs now reduce to **41 families
(63.4%)**, up from 110 (1.8%).

| site | verified | Task 07 | Task 08 | largest family |
| --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 19 (0.0%) | 4 (79.0%) | 11 |
| seoworld.co.kr | 30 | 28 (6.7%) | 16 (46.7%) | 9 |
| nextjs.org | 40 | 40 (0.0%) | 12 (70.0%) | 9 |
| developer.mozilla.org | 23 | 23 (0.0%) | 9 (60.9%) | 9 |
| **total** | **112** | **110 (1.8%)** | **41 (63.4%)** | |

All 19 non-singleton families were reviewed by hand and by mechanical check:
**0 obvious false merges**. The three MDN `Temporal/PlainDateTime/*` pages
(846/851/848 elements, three different exact hashes) are now one family, as are
`Reference/Errors/*`, `nextjs.org/docs/messages/*`, and every `/blog/*` group.
Every index page (`/`, `/blog`, `/docs`, `/tools`, `/domains`, `/services`) stayed
a singleton, and both Task 06 canonical anomalies are still isolated from the
homepage. Verification cost 1–3 ms more per candidate (<0.2% of a ~1.5 s
verification); `verification.json` grew 79–132% and `verified-urls.json` 198–251%,
which is ~1.3 KB per URL against a 6.85 MB deep observation.

Not in this task (deliberately): AI/LLM/embedding, semantic page labels,
screenshot comparison, computed styles, interaction, re-discovery, multi-page
Deep Observation.

## Task 09 — Multi-page Deep Observation ✅

Feed `selected-pages.json` into the existing Task 03–05 Responsive Deep Observer
and bind the results into ONE site observation run. **Orchestration only** — no
new observer, no multi-page DOM collector, no AI, no interaction, no
reconstruction, no visual diff. Reuses the existing discovery/verification/
selection run (0 Firecrawl calls). Isolated under `src/multi-observer/`,
zod-validated (schema v1), persisted to a separate
`data/<host>/site-observations/<run-id>/` namespace. CLI:
`pnpm observe:site <selected-pages.json> [--concurrency 1–4] [--prepare-scroll]`.

Done: Observer refactored by *extraction* so observation logic stays singular —
`observePage()` is now a launch/close wrapper around the shared
`observePageWithBrowser()`, and `saveObservation()` a directory choice around
`saveObservationIntoDir()` (single-page behavior unchanged); one Chromium process
per site run with a fresh `BrowserContext` per viewport (no state leaks between
pages); fail-fast input validation (real Selector zod schema + internal
consistency + cross-checks against sibling `page-families.json` /
`verified-urls.json` / `verification.json`) **before** any browser launches;
deterministic `p000001…` page ids from a lexical URL sort, with validation samples
in a second block so sampling policy never renumbers a production page;
deterministic manifest ordering independent of completion order; per-page failure
isolation with a 4-value status taxonomy and `{name, message, phase}` errors (no
stack traces); mandatory Selector provenance per page; deterministic validation
sampling (≥3-member families, ≤3 per site, one member each) with
representative↔sample ratio measurements and **no verdict**; conservative
concurrency (default 2, 1–4); full byte/coverage accounting; fixture test
`pnpm smoke:multi-observer` (58 checks, real Chromium + local HTTP server,
including a genuine navigation failure).

**Measured result:** all four sites ran from their existing selections with
**0 failures across 52 pages** and **0 Firecrawl calls**.

| site | verified | reps | samples | observed | reduction | time | storage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 19 | 4 | 2 | 6 | 68.4% | 39.0s | 57.67 MB |
| seoworld.co.kr | 30 | 16 | 3 | 19 | 36.7% | 74.5s | 68.03 MB |
| nextjs.org | 40 | 12 | 3 | 15 | 62.5% | 94.1s | 149.81 MB |
| developer.mozilla.org | 23 | 9 | 3 | 12 | 47.8% | 57.5s | 75.34 MB |
| **total** | **112** | **41** | **11** | **52** | **53.6%** | **265.2s** | **350.86 MB** |

Selection alone is 112 → 41 (63.4%); the 11 validation samples bring the real
figure to 53.6%, reported rather than hidden. Concurrency 2 gave a 1.97× speedup;
browser reuse saved only 0.06–0.11 s/page (Chromium launch is ~85 ms) and was kept
for structure, not speed. Screenshots are 45.7% of all bytes and mobile is up to
2× desktop (DPR 3 full-page PNGs) — measured, not yet compressed.

Three validation pairs did **not** match well and are recorded as evidence rather
than acted on: nextjs `f000005` (document height 2.42×, +79 assets, +73 links),
MDN `f000003` (−80 links), and seoworld `f000005` where a perfect 1.00× turned out
to mean *both* pages are empty client-rendered shells — a direct warning against
reading representativeness off ratios alone. Task 08's grouping rules were left
untouched.

Not in this task (deliberately): resume, cache, skip-already-observed,
incremental refresh, retry engine, HTTP-status awareness in the Observer,
screenshot compression, interaction, SiteSpec, reconstruction, AI.

## Phase 4 — Interaction Candidate Detection ✅ (Task 10)

Analyze an existing Task 09 site observation run **offline** and produce the list
of elements a later stage could interact with, plus the regions they control and
the guards that stage must respect. **Detection only** — no click, hover, focus,
input, select, drag, scroll exploration, navigation, or form submit; no Firecrawl,
no Playwright, no network, no AI. Isolated under `src/interaction-detector/`,
zod-validated (schema v1), additive to the existing site run. CLI:
`pnpm detect:interactions <site-observation.json>`.

Done: fail-fast layered input validation (Task 09 + Task 05 zod schemas, dom/style
schemas, `styleId` integrity via the Observer's own invariant, element-count and
viewport-id cross-checks) with failed Task 09 pages skipped-and-counted rather than
fatal; one candidate per element carrying `capabilities[]` + `evidence[]` +
`guardFlags[]` + `initialState` + `controls[]`; deterministic P1/P2/P3 tiers where
several signals promote to the highest; ARIA state / role / native control / input
type / inline handler / `contenteditable` / `draggable` / Popover-API / `tabindex` /
`data-*` hint / computed `cursor` + `pointer-events` signal vocabulary with every
evidence entry marked `observed` or `derived` (no `inferred` level anywhere);
`aria-controls` IDREF-list resolution with unresolved targets preserved as a normal
result, `popovertarget`, and the native `<summary>`→`<details>` relation; target
inventory including unreferenced stateful containers; normal navigation anchors
excluded (they are already in `links.json`); the `cursor:pointer` heuristic
restricted to the *pointer-cursor root* because `cursor` is an inherited property;
hidden/disabled/readonly/inert candidates preserved with their state instead of
deleted; submit-capability derived from HTML default semantics via the `parentId`
form ancestry; strictly viewport-independent detection (no desktop↔mobile matching);
byte-identical re-runs (every list sorted by a fixed vocabulary); O(n) ancestry
from one forward pass; fixture test `pnpm smoke:interaction-detector` (92 checks,
including a full on-disk round trip and two fail-fast corruption cases).

**Measured result:** all four site runs analyzed from disk with **0 network calls**,
148,373 elements in 2.1 s, adding 4.18 MB (1.19%) to 350.86 MB of observation.

| site | pages | desktop | mobile | P1 | P2 | P3 | targets | unresolved | time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 6 | 187 | 187 | 110 | 264 | 0 | 98 | 0 | 190 ms |
| seoworld.co.kr | 19 | 214 | 214 | 32 | 346 | 50 | 32 | 0 | 246 ms |
| nextjs.org | 15 | 688 | 688 | 322 | 990 | 64 | 42 | 118 | 1,062 ms |
| developer.mozilla.org | 12 | 464 | 464 | 928 | 0 | 0 | 928 | 0 | 623 ms |
| **total** | **52** | **1,553** | **1,553** | **1,392** | **1,600** | **114** | **1,100** | **118** | **2,121 ms** |

0 of 2,992 native controls missed, 0 duplicate candidates, 0 of 29,094 anchors
admitted, and all 1,392 P1 candidates traceable to a real ARIA state attribute or a
native `<details>/<summary>`. The pointer-cursor-root rule is the single most
consequential decision: the naive `cursor:pointer` rule yields 13,874 heuristic
candidates on the same data instead of 114.

Two results point directly at the next phase: **118 of nextjs.org's 152 control
relations do not resolve** (Radix mounts dropdown/dialog content only on open), and
seoworld's empty tool shells produce exactly 3 candidates — recorded as *"no
interaction candidate was observable in the saved initial static state"*, never as
"this page has no interactions".

Not in this task (deliberately): interaction execution, before/after diff, pattern
naming (Accordion / Tabs / Modal / Carousel), a site-level execution queue,
desktop↔mobile semantic matching, class-name inference, AI. The Observer was NOT
extended — signals outside its attribute whitelist (`on*` handlers, `disabled`,
`readonly`, `contenteditable`, `open`, `hidden`, `inert`, `popover*`) are
implemented and fixture-tested but read 0 on real data, and the report says so
rather than letting a silent zero look like an absence of such controls.

Still open as a smaller parallel task: storage policy (screenshot compression —
45.7% of all Task 09 bytes, measured).

## Task 12 — Interaction Pattern Modeling & Unknown Interaction Strategy ✅

Turn Task 11's verified state transitions into named, reusable behaviors — and,
where no name is justified, into a *classified* unknown with a stated cause.
Three layers kept logically separate: a deterministic pattern registry, an
unknown taxonomy, and a provider-neutral AI boundary that is off by default.
**Interpretation only** — no browser, no Firecrawl, no network, no re-exploration,
no SiteSpec. Isolated under `src/interaction-patterns/`, zod-validated (schema v1,
registry v1), persisted to a separate `data/<host>/interaction-models/<run-id>/`
namespace. CLI:
`pnpm model:interactions <interaction-exploration.json> [--ai] [--ai-provider <name>]`.

The standing order, enforced structurally: **rules first, unknown second, AI
last.** A deterministic pattern is never produced by AI, never overridden by AI,
and an AI proposal is never promoted into the registry on its own.

Done: fail-fast input validation against Task 11's own zod schemas (manifest ↔
plan ↔ every action artifact, plus provenance, viewport, count and
`status ⇔ meaningfulChange` invariants); an `ActionFacts` layer that is the only
view a rule may read, so a rule structurally cannot reach for a class string,
geometry or a mutation value; an explicit **rule list** (10 rules, each with id /
version / specificity / required + optional evidence / rejection conditions)
published in full into the artifact; all rules evaluated with the winner chosen by
specificity, the outranked rules recorded in `limitations`, ten distinct
specificity values, and an equal-specificity tie recorded as a **registry
conflict** rather than coin-flipped (`assertRegistryIntegrity()` makes a colliding
pair unshippable); a taxonomy of eight earned pattern types with no unmatched
aspirational entries; a `menu` rule pair that accepts popup semantics from either
the trigger or the region that opened, because Radix comboboxes ship no
`aria-haspopup`; a `tabs` rule that survives self-referential and drifting
`aria-controls`; a single stated checkbox policy (`selection`, with the native /
ARIA distinction preserved in `mechanism`) so one behavior never yields two
instances; a 9-reason unknown taxonomy whose first-match-wins order encodes which
cause *explains* the others; navigation-tainted actions excluded before any rule
runs, with their URLs preserved for future SPA modeling; compact pattern and
unknown signatures that exclude ids, URLs and text; exact accounting enforced as a
code-level invariant (`patterns + unknowns == actions`, and per-status); a
per-page pattern index built for the SiteSpec compiler; timestamp-free
deterministic artifacts (byte-identical re-runs, verified on real data); and an
AI boundary that is one method wide, sends an **allowlisted** compact payload, is
called once per eligible signature group rather than once per occurrence, ships
only a deterministic `fake` provider, and degrades to a single printed line when
no provider is configured. Fixture test: `pnpm smoke:interaction-patterns`
(88 checks, fully offline — no server, no browser, no AI credential).

**Measured result:** all four Task 11 runs modeled from disk in **199 ms** with
0 network calls, adding 382.7 KB (8.3% of the exploration data they interpret).

| site | executed | changed | patterns | unknown | changed coverage | executed coverage |
| --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 23 | 13 | 13 | 10 | 100.0% | 56.5% |
| seoworld.co.kr | 23 | 23 | 7 | 16 | 30.4% | 30.4% |
| nextjs.org | 79 | 45 | 45 | 35 | 100.0% | 57.0% |
| developer.mozilla.org | 35 | 33 | 33 | 2 | 100.0% | 94.3% |
| **total** | **160** | **114** | **98** | **63** | **86.0%** | **61.3%** |

98 patterns: `disclosure` 50, `selection` 30, `menu` 9, `tabs` 6, `dismiss` 3.
`dialog`, `toggle` and `generic-state-toggle` matched **0** on real data and are
reported as zero rather than left to look like coverage.

Task 10's and Task 11's open questions are answered: **all 9 nextjs.org dynamic
mounts are `menu/listbox`**, and **all 6 tabs survive an `aria-controls` that
points at itself and then drifts to a fresh generated id**. Task 11's 46
`no-change` results decompose exactly into `already-in-target-state` 33,
`navigation-tainted` 5, `style-only-change` 5, `blocked-navigation` 2 and
`opaque-action` 1 — five distinct causes, not one bucket.

The one deliberate gap is the whole 14%: seoworld's mobile hamburger signals
open/closed by flipping `aria-label` from "메뉴 열기" to "메뉴 닫기". That is a real
transition, `aria-label` is not a state attribute, and no close-word dictionary
exists in this repo — so all 16 stay `unmatched-transition` and go to the AI
fallback with their evidence intact.

The cost result: 63 unknown occurrences collapse into 13 signature groups, of
which **4 are AI-eligible — so an enabled AI pass costs 4 calls, not 63** (93.7%
fewer). Verified end-to-end with the fake provider, which returns
`carousel`/`high` for the unmatched cases and produces **zero** carousels in
`interaction-patterns.json`.

Not in this task (deliberately): SiteSpec, reconstruction, a real AI provider or
vendor SDK, executing an AI-suggested probe, re-exploration, any change to Task 11's
planner or shape-representative rule, visual/layout analysis, component identity.

### Rule promotion policy

Promoting an AI-discovered behavior into the deterministic registry requires all
six, in order, and none of them happens automatically. The policy string travels
inside every `ai-analysis.json`.

1. repeated cases across sites
2. a deterministic observable evidence rule (ARIA / native / structural — never
   text or class names)
3. a synthetic fixture where the rule fires
4. a negative fixture where it must NOT fire
5. a live canary run with no false positives
6. a human false-positive review

## Phase 5 — Safe Rule-Based Interaction Explorer ✅ (Task 11)

Re-find each Task 10 candidate in the LIVE page, click it safely, and record the
observable state transition. Eight ideas that were separate stages on paper —
safe action planning, live candidate re-identification, live signal
reconciliation, rule-based Playwright interaction, before/after capture, state
diff, and action isolation — are one Task because they only make sense together.
**Execution only** — no pattern naming, no AI, no recursion, no Firecrawl, no
re-discovery, no re-observation. Isolated under `src/interaction-explorer/`,
zod-validated (schema v1), persisted to a separate
`data/<host>/interaction-explorations/<run-id>/` namespace. CLI:
`pnpm explore:interactions <interaction-analysis.json> [--concurrency 1–3] [--plan-only]`.

Done: a deterministic, timestamp-free offline plan (byte-identical across runs and
independent of input array order) that is a complete product on its own via
`--plan-only`; `LocatorDescriptor` built from the candidate + `dom.json` so
`candidate.elementId` is never used as a live locator; four exact locator
strategies (`id-exact` → `semantic-exact` → `semantic-ancestor` →
`structural-path`) with mandatory verification, no similarity score anywhere, and
`ambiguous` rather than an arbitrary pick; a structural path allowed to choose
only from within the semantic match set; live signal reconciliation reading the
attributes Task 09's `ATTR_WHITELIST` never stored (`disabled` / `readonly` /
`open` / `hidden` / `inert` / `checked` / `popover*` / `min` / `max` / `step` /
button type / form association) plus per-action operability
(`clickOperable` / `focusOperable` / `toggleOperable` / `editOperable`); one
anonymous fresh `BrowserContext` per action with disposal as the restore
strategy; navigation / popup / download / dialog / non-GET-request guards armed
only after the initial load; bounded `MutationObserver` (cap 500, `truncated`
flag); compact before/after snapshots with a stateful-container inventory and a
newly-mounted-descendant census; a deterministic 15-category state diff whose
`changed` rule refuses mutation noise and refuses a navigated page; global
budgets (8 / viewport, 16 / page, 80 / site) with every non-planned candidate
preserved in `skipped[]`; fixture test `pnpm smoke:interaction-explorer`
(95 checks, real Chromium + local HTTP server, running the real Task 09 → 10 → 11
chain including genuine generated-id drift and a control that becomes disabled
between the observation and the exploration).

**Measured result:** 3,106 candidates → **161 actions**, **100% locator
resolution**, 0 ambiguous, 0 not-found, 1 actionability error.

| site | candidates | actions | executed | changed | no-change | targets mounted | elapsed | storage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| domainchecker.co.kr | 374 | 23 | 23 | 13 | 10 | 0 | 56.6s | 637.3 KB |
| seoworld.co.kr | 428 | 23 | 23 | 23 | 0 | 0 | 45.5s | 299.3 KB |
| nextjs.org | 1,376 | 80 | 79 | 45 | 34 | **9** | 180.2s | 2.68 MB |
| developer.mozilla.org | 928 | 35 | 35 | 33 | 2 | 0 | 59.6s | 918.3 KB |
| **total** | **3,106** | **161** | **160** | **114** | **46** | **9** | **341.9s** | **4.49 MB** |

Task 10's open question is answered: **all 9 planned nextjs.org triggers whose
`aria-controls` target was missing from the saved DOM mounted it after the click**
(+18 interactive descendants). Two global rules were tightened by measurement
rather than by taste: a URL change now invalidates a diff (one `<button>` inside
an `<a href>` had produced 96 containers added / 113 removed from a client-side
route change), and the before/after snapshot reads every `aria-*` attribute
(seoworld's mobile hamburger signals open/closed only by flipping `aria-label`,
and a fixed vocabulary reported that real transition as `no-change`). 0 of the 114
`changed` results are driven by container-inventory churn alone.

Also settled: the Observer's `ATTR_WHITELIST` was **not** extended and the 52
pages were **not** re-observed. Live reconciliation reads those signals at action
time instead, which is both cheaper and more truthful — it reports the state at
the moment of the click rather than a state from days ago.

Not in this task (deliberately): pattern naming, recursive exploration beyond one
action, retry, type/select/drag/upload/submit actions, screenshots, WebSocket /
Service Worker interception, desktop↔mobile control matching, AI.

## Phase 6 — AI Explorer for Unknown Behaviors (contract done, provider pending)

Task 12 built the boundary: a provider-neutral `UnknownInteractionAnalyzer`, an
allowlisted compact payload, signature-representative batching, a closed
next-probe enum, an `inferred` artifact kept apart from the deterministic ones,
and a written promotion policy. What remains is a real provider behind that
interface — plus the harder half: an AI explorer that can *propose* a probe for a
future exploration run. Task 12 records suggestions and executes none of them.

## Phase 7 — Pattern Registry ✅ (Task 12)

Core philosophy: **Explore Once → Automate Forever.** Shipped as an explicit rule
list with independent `registryVersion`, published inside every artifact.

## Task 13 — SiteSpec Compiler ✅

Everything observed so far, compiled into ONE self-contained reconstruction IR:

```
Static Observation (Task 09)
+ Page Family            (Task 07/08)
+ Responsive Observation (Task 05)
+ Verified Routes        (Task 06)
+ Verified Interaction Patterns   (Task 12)
+ Unknown Interaction Metadata    (Task 12)
        ↓
   SiteSpec  (pnpm compile:sitespec)
```

Offline deterministic processing: 0 Firecrawl, 0 Playwright, 0 network, 0 AI, 0
asset downloads. One CLI argument — a Task 12 `interaction-patterns.json` — and
the compiler walks the provenance chain back to Task 06 on its own.

What it produces, per site, under `data/<host>/site-specs/<run-id>/`:

- **Route table** holding **every verified URL**, not just the selected ones.
  112 verified URLs across the four sites → 112 routes, 0 duplicates, 0 missing.
  Two independent coverage axes: `coverage` (was this exact URL observed?) and
  `behaviorCoverage` (was interaction verified on this exact URL?), so a
  family-represented URL never inherits the representative's evidence as its own.
- **Content trees with real text nodes.** `dom.json` caps direct text at 200
  characters and records no element/text child ordering at all, so each viewport's
  `rendered.html` is re-parsed as a second observation channel and aligned against
  `dom.json` by element count, tag sequence and parent relation. 104/104 real
  viewports aligned; 320/326 capped texts recovered in full (longest: 4,234 chars);
  `<p>Hello <strong>world</strong> !</p>` keeps its three children in order.
  A mismatch falls back to `dom.json` with named limitations — never a fuzzy merge.
- **Site-wide catalogs.** Computed styles deduplicated on exact canonical equality
  across every page and viewport (32,395 local records → 11,674 tokens, 49–73% per
  site); asset references deduplicated the same way, with inline SVG sanitized of
  `<script>`, `on*` handlers and `javascript:` URLs.
- **Interaction spec.** All 98 confirmed patterns and all 63 unknown cases, with
  every trigger resolved to a SiteSpec node (an unresolvable trigger fails the
  compile). 9 dynamically-mounted nextjs menu targets are preserved as
  `dynamic: true` with no invented subtree; seoworld's 16 `unmatched-transition`
  hamburgers stay unknown.
- **Safety by omission.** No original JavaScript, no inline handler, no `class` /
  `style` / `data-*`, no password / hidden / file input value, and no form action
  endpoint — a clone built from a SiteSpec cannot post to the original backend.

Consumer contract: `loadSiteSpec()` reads the SiteSpec directory and nothing else.
Verified by a fixture that deletes the entire Task 06–12 input tree and reloads.

## Task 13.1 — Reconstruction-Critical Attribute Recovery Hardening ✅

A short hardening step between the SiteSpec Compiler and the reconstruction
engine. Task 13 proved that every real viewport's `rendered.html` reproduces its
`dom.json` exactly (104/104) and then used that verified alignment for text and
child ordering only. Task 13.1 uses the **same** alignment to recover a **closed
allowlist of 29 declarative attributes** the Task 03/04 Observer whitelist never
captured. **No new observation**: 0 Firecrawl, 0 Playwright, 0 network, 0 AI, and
the only new read is a parse tree the compiler was already building.

Done: closed `SUPPLEMENTAL_ATTRIBUTES` allowlist with a per-attribute value kind
(`boolean` presence / `enumerated` verbatim / `value` verbatim) and an
import-time policy assertion that rejects a denied name, a denied prefix
(`data-` / `on` / `aria-` / `xlink:`) or **any overlap with the Observer's own
`ATTR_WHITELIST`** — so the supplemental channel is provably a gap-filler and
`dom.json` can never be overwritten; harvesting done inside the existing walk
(no second parse, sparse map, HTML-namespace and unprefixed attributes only);
`recoveredAttributeNames` written **only** on nodes that recovered something;
per-viewport and per-site recovery counters cross-checked by the validator;
`popovertarget` resolved into a viewport-local `popover-target` relation; the
blanket `table-cell-attributes-not-observed` limitation replaced by a conditional
`table-cell-attributes-not-recovered` (aligned viewports no longer warn about
attributes they now carry); `supplemental-attributes-not-recovered` on every
fallback viewport; eight new referential invariants plus four tamper fixtures;
`pnpm smoke:sitespec` 168 → **252 checks**; schema v2 / compiler v2 with
`siteSpecVersion` deliberately held at 1 (fields were added, no field's meaning
changed).

**Measured result:** the four sites recompiled from disk recovered **344
attributes on 324 elements**, with **0 overwritten** observed values.

| site | aligned | recovered | elements | biggest contributors |
| --- | ---: | ---: | ---: | --- |
| domainchecker.co.kr | 12/12 | 20 | 20 | hidden 12 · datetime 8 |
| seoworld.co.kr | 38/38 | 26 | 26 | disabled 12 · selected 8 |
| nextjs.org | 30/30 | 166 | 146 | selected 64 · hidden 30 · required 30 |
| developer.mozilla.org | 24/24 | 132 | 132 | open 62 · scope 34 · datetime 24 |
| **total** | **104/104** | **344** | **324** | |

The gap this closes is not cosmetic: without it a generated clone shows 54
elements the original hides, collapses 62 open `<details>`, defaults 72
`<option>`s to the wrong choice, renders 12 disabled buttons as clickable, and
numbers an `<ol start="2">` from 1. `colspan` / `rowspan` — the two attributes
Task 13 named as the known gap — turned out to occur **0** times in this corpus,
while `selected` / `open` / `hidden` were the real cost; both facts are reported
as measured rather than as expected.

Storage cost: **+52,648 bytes (+0.032%)** across 157 MB of SiteSpec. Compile time
change is not separable from run-to-run variance. Task 06–12 artifacts:
SHA-256 tree hash identical before and after. All four sites recompile
byte-identically.

Not in this task (deliberately): any new observation, re-observation or
whitelist change in the Observer, `class` / `style` / `data-*` / `on*` /
`action` / `formaction` / input `value` recovery, fuzzy matching of any kind,
partial (sub-tree) alignment, Task 11 live interaction state injected as initial
state, and Task 14 itself.

## Phase 8 — SiteSpec ✅

A structured specification describing an observed site. Delivered by Task 13,
hardened by Task 13.1.

## Phase 9 — Next.js Reconstruction ✅ (Task 14)

```
site-spec.json (the ONLY input)
        ↓
Deterministic Reconstruction Compiler
        ↓
Next.js 16 + React 19 + TypeScript application
```

`pnpm reconstruct <site-spec.json>` → `data/<host>/reconstructions/<run-id>/`
(`reconstruction-manifest.json` + `app/`). Offline and deterministic: 0 Firecrawl
calls, 0 Playwright launches, 0 network requests, 0 AI calls, 0 asset downloads,
and 0 bytes written into any run it read.

**Delivered**

- SiteSpec-only input, enforced structurally through `loadSiteSpec()` and proved
  by deleting the whole Task 06–12 tree before generating
- Generated-app runtime independence, proved by deleting the SiteSpec before
  `next build` / `next start`
- One `[[...slug]]` catch-all route + route map; 112 verified URLs → 112 clone
  routes, 0 duplicates, 0 missing, all rendering HTTP 200. Query variants are
  distinct routes; a path outside the table is the clone's own 404
- Both observed viewports rendered and switched by an inferred breakpoint
  (observed-endpoint midpoint, 915px), labeled `inferred` with its method and
  both source widths — never as an observation
- Exact-computed-style CSS (10,705 rules, 4,814 pseudo rules, 0 dangling refs);
  no Tailwind, no semantic tokens, no global reset
- HTML → React adapter layer (`htmlFor`, `colSpan`, boolean presence,
  `defaultChecked` / `defaultValue`, `<select>` selection); 344 recovered
  declarative attributes all present in the generated DOM; 0 React warnings
- 98/98 confirmed patterns bound at runtime (27 native, 71 scripted);
  63 unknown cases annotated and implemented 0 times
- SiteSpec never enters the client bundle: 568 KB of client chunks, byte-for-byte
  identical for an 11.9 MB and an 86.9 MB SiteSpec, with 0 SiteSpec fields and 0 page
  text in it
- `validateGeneratedApp()` reads the written app back off disk and checks route
  completeness, style-class resolution, DOM id uniqueness, trigger presence,
  path safety and manifest accounting
- Determinism: same SiteSpec → byte-identical output, 4/4 sites
- Fixture: `pnpm smoke:reconstruction` — 178 checks, generate → build → start →
  Chromium, the first non-offline smoke test in the repo and deliberately so

**Inference this Task owns** (Tasks 13 / 13.1 deliberately do not): the
responsive breakpoint, and the decision to render both viewport variants rather
than merge them. Both are recorded as this generator's claim.

**Deliberately not done**: original-vs-clone comparison of any kind, asset
download/materialization, component or shared-header extraction, CSS
tree-shaking, viewport tree merging, and any promotion of an unknown interaction.

## Phase 10 — Original vs Clone QA / Automatic Repair ✅ (Task 15)

```
reconstruction-manifest.json (Task 14, immutable)
        ↓
  serve the clone · re-observe the LIVE original · read the saved snapshot
        ↓
  S ↔ C   the reconstruction CONTRACT      (snapshot vs clone)
  S ↔ O   source drift                     (snapshot vs live original)
  O ↔ C   canary, drift-free pages only    (live original vs clone)
        ↓
  classify (24 causes, explicit precedence) → route (9 recommendations)
        ↓
  [--auto-fix]  propose → apply → regenerate → re-measure → accept / reject
        ↓
data/<host>/reconstruction-qa/<run-id>/
```

- **Three truth sources, never merged.** A clone that matches the snapshot and
  differs from today's live site is source drift, not a defect, and Task 15 is
  forbidden from reshaping a past SiteSpec to match the present
- **Diff collection and causal classification are separate passes.** A layout
  cascade is one finding standing for N nodes; an inherited-style mismatch is one
  finding at its first mismatching ancestor; a `font-family` mismatch becomes
  `font-binding-missing` only in conjunction with text geometry drift
- **No overall quality score, no PASS threshold.** Per-dimension raw metrics and
  per-dimension worst-N rankings only
- **Three closed correction types**, each gated on direct observation:
  `document-canvas-background`, `interaction-target-state-style` (from a NEW live
  open-state observation this Task makes), `safe-data-image-recovery`. Fonts,
  remote assets, unknown behavior, family gaps and source drift are detect-and-
  route only
- **Acceptance is a re-measurement, not a diff.** Every correction carries the
  metric that will decide it, and a no-regression gate (routes · runtime errors ·
  content · behavior · unknown-implemented · form writes · generator invariants)
  can reject a whole iteration
- **Task 14's baseline is untouched.** `pnpm reconstruct` with no corrections is
  byte-identical to the Task 14 output; a corrected clone is generated inside the
  QA run and records `sourceQaRun` / `correctionSet` / `correctionCount`
- Fixture: `pnpm smoke:reconstruction-qa` — 127 checks, an offline half plus a
  live half that runs a local server as the ORIGINAL through the real pipeline and
  then CHANGES it to prove the drift attribution

See `docs/result/15-reconstruction-qa-and-automated-correction-loop-2026-08-14.md`.

## Phase 11 — Full Site Reconstruction ✅ (Task 16)

```
pnpm e2e:reconstruct <url>
        ↓
discovery → verification → selection → deep observation
→ interaction detection → exploration → pattern modeling
→ SiteSpec → Next.js reconstruction → next build
→ QA (+ --auto-fix) → [family escalation → recompile → rebuild → re-QA]
→ generated-app independence audit
        ↓
data/<host>/e2e-runs/<run-id>/e2e-manifest.json
```

Thirteen stages in ONE process, each called through its own module's public API.
Isolated under `src/e2e/`, zod-validated (schema v1, pipeline v1), writing
exactly one file of its own — every stage artifact stays in the namespace its
own Task owns and the manifest references it. CLI:
`pnpm e2e:reconstruct <url> [--max-urls 1-40] [--concurrency 1-4] [--auto-fix]
[--max-fix-iterations 0-5] [--family-escalation 0-12] [--prepare-scroll]`.

**Phase A — upstream hardening.** Three defects Task 15 root-caused and one it
could only name were fixed before any fresh run, each with a synthetic fixture
AND a targeted canary on the real page that produced the original evidence:

- **A1 asset occurrence mapping.** `collect-assets.ts` deduplicated URL assets on
  `type|url`, so the second `<img>` sharing a URL produced no record at all and
  Task 13 compiled that node with `assetRefs: []` — all 325 of nextjs.org's
  `asset-missing` findings. Asset IDENTITY (deduplicated site-wide in the
  SiteSpec catalog) and asset OCCURRENCE (per element, always) are now separate.
  Canary on `nextjs.org/`: 57 `<img>`, **18 would have lost their mapping under
  the old rule, 0 do now**, with the catalog unchanged at 124 unique assets.
- **A2 nested scroll state.** `getBoundingClientRect()` records a descendant's
  position AT the scroller's current offset, and the Observer stored no offset —
  MDN's sidebar was 18,106px down and the clone rendered it from 0, producing a
  19,739px median y delta on a page whose document height matched exactly.
  `scrollState` is now observed on real scroll containers, carried through the
  SiteSpec, emitted as `data-wr-scroll-*` and restored by the client runtime two
  frames after hydration. Canary on `/docs/Glossary/Safe/HTTP`: the `<aside>` is
  recorded at **scrollTop 18,106** — the exact value Task 15 found by hand.
- **A3 grid placement properties.** Nine properties added to the Observer style
  whitelist (`grid-template-areas`, `grid-area`, `grid-auto-flow`,
  `grid-auto-rows`, `grid-auto-columns`, `place-items`, `place-content`,
  `place-self`, `order`). Task 15 could see the tracks disagree and not where the
  items landed.
- **Dynamic target contents.** The explorer captures a newly-mounted region's
  subtree using the **Observer's own in-page walk** rooted at that element —
  same whitelists, same visibility derivation, no second miniature observer —
  bounded at 300 elements / depth 12 / 20,000 characters. The SiteSpec carries
  it as a `dynamicTemplate` marked `observed` / `after-action`, and the clone
  mounts it instead of the empty region Task 14 could only produce. Canary on
  nextjs.org's Radix menu: **16 elements, 3 assets, 0 truncations**, with the
  real item text, where Task 15 measured 9/9 `dynamic-target-content-unobserved`.

**Escalation is closed and small.** The only action this Task adds beyond Task
15's three correction types is *look again*: `requires-exact-observation` and
`requires-new-interaction-observation` unconditionally, `requires-reobserve`
once per route. Font binding, remote asset materialization, unknown-behavior
naming and pattern promotion are refused in code, each with a stated reason.

**Family escalation** observes the exact URLs the audit called a major mismatch
(default ≤4, deterministic worst-first selection) into a NEW augmented
observation run — the original is never edited — and recompiles from it. Task
07/08's family definition is left untouched: the point is to observe the page,
not to relitigate the grouping.

Fixture test `pnpm smoke:e2e` — **104 checks**, an offline half (registry
integrity, escalation policy, escalation selection determinism, final-status
classification, whitelist and cap constants) plus a live half that runs a local
synthetic site through the REAL chain with no artifact injection: a
`DiscoveryProvider` enumerates the fixture's URLs and everything from the
verifier onward is production code, including `next build` and the Task 15 QA.

Not in this task (deliberately): a real AI provider, remote asset
materialization, `@font-face` compilation, Tailwind or component extraction,
unbounded re-observation, and any promotion of an unknown interaction.

### Final correction — the DOM→HTML→DOM round trip

The first fresh run shipped with two renderer defects that turned out to share
one cause: **the clone receives the observed DOM as HTML**, and a DOM can hold
things HTML cannot carry. Both were found by reproducing the production error in
`next dev` and reading React's own diagnostic rather than guessing from the
minified string.

- **Parser-invalid nesting.** stripe.com's header holds a script-built `<li>`
  inside an `<li>`: `appendChild` accepts it, the HTML parser does not — it
  closes the outer tag, so React hydrated against a tree with the two as
  siblings and threw error #418 on 15 of 19 pages, discarding and re-rendering
  that subtree on the client. `src/reconstruction/nesting.ts` now detects every
  edge the tree-construction stage would rewrite and writes the relationship the
  way HTML requires (`<li><ul><li>`), with the container at `display: contents`
  so the observed geometry is unchanged; edges HTML cannot express losslessly
  are refused rather than shipped. Measured: 30 adapted on stripe.com, **0
  across all 142,611 elements of the four-site corpus**, 0 refusals anywhere.
  The same edge had also
  been quietly failing Task 13's `rendered.html` alignment
  (`parent-relation-mismatch`) on exactly those 30 page/viewports, which is why
  they carried `supplemental-attributes-not-recovered`.
- **Pseudo-element stacking.** `PSEUDO_STYLE_WHITELIST` observed every property
  needed to PAINT a decorative `::after` and not the one that puts it behind the
  content. A white full-bleed bar meant for `z-index: -1` was reconstructed at
  `z-index: auto`, covered stripe's nav, and made 15 verified interactions
  impossible to replay — Playwright's hit-target check found the pseudo-element,
  not the button. `z-index` and `pointer-events` are now observed on
  pseudo-elements.

`finalStatus` also learned to read clone JavaScript errors: the first run could
call itself `complete-with-known-limitations` while every page threw, because
status was computed only from diff classifications and an exception is not a
diff. A clone that throws is a defect in this pipeline, never an observation
boundary, so it is now `partial`.

Both fixes carry a minimal reproducer and a negative fixture in
`pnpm smoke:reconstruction` (197 checks), including a real-browser demonstration
that the naive serialization *is* rewritten by the parser and the adapted one is
not. See `docs/result/16-final-hydration-correction-2026-08-16.md`.

## Task 17 — Exact Reconstruction Fidelity Hardening ✅

From "구조적으로 작동하는 clone" to Exact Reconstruction: the three Manual
Visual Review findings, fixed generically (no Stripe selector, class or route
anywhere).

Done: Root URL Invariant (candidate set = `normalize(links ∪ rootUrl)`,
`rootSeeded`, four `inputRoot*` manifest fields, `finalStatus` gate);
`behaviorEquivalent` split into `triggerStateEquivalence` and
`userVisibleTargetEquivalence` with `not-observed`/`not-declared` states (QA
schema v2, historical artifacts untouched); generic user-visible target
discovery in the explorer (pre-click baseline + after diff → four target kinds
with structural paths, content fingerprints and bounded Observer-walk captures,
exploration schema v3); observed-target reconstruction (reveal with observed
open-state paint, safe subtree mounts, `data-wr-obs` runtime channel);
two-axis interaction QA with per-pattern before/after screenshots; authored
layout-rule recovery (matched `document.styleSheets` declarations, observation
schema v5); the multi-width layout probe (390/768/1024/1440/1920, DOM-identity
across widths, `layout-probe.json`); deterministic layout-rule inference
(centered max-width / full width / percentage / responsive hide-show) emitted
as a higher-specificity CSS tier with the exact computed style as fallback.

**Measured (fresh stripe.com E2E):** root seeded → verified → reconstructed
(`inputRoot*` 4/4, homepage present); triggerState 23/25 ·
**userVisibleTarget 17/25 equivalent / 3 mismatch / 5 not-declared** (Task 16:
2/28); 79 discovered target regions with open-state captures; 16/16 pages
probe-aligned, 4,775 recovered layout rules; `/use-cases/saas` centered drift
480px@1920 / 608px@2048 → **0px at 1440/1920/2048**; content 1.0, runtime
errors 0, 10 smoke suites / 1,360 checks PASS.

Not in this task (deliberately): SVG internal paint reconstruction (known
limitation, evidence only), Slot/Template/Theme engines, SEO, asset
materialization, font self-hosting, CMS/blog/production infrastructure, LLM
content generation.

---

## Task 17.1 — Exact Reconstruction Final Acceptance Correction ✅

Narrow acceptance pass over Task 17's remaining user-visible defects — no new
feature surface. Live probing converged the 3 interaction mismatches and all
5 `not-declared` patterns onto ONE generic blind spot: framework-portal
overlays behind 0×0 body-level wrappers, with `aria-controls` appearing only
after the click. Closed generically at five points: discovery (portal descent,
declared-after-click candidates, containment dedupe, baseline-coordinate mount
hosts — exploration schema v4), capture (truncation-gated adaptive expansion
to 1,200 els / depth 48, capture-only per-element text cap, text-run
positions), reconstruction (host-anchored mounts, captured root as the region,
template style tokens finally emitted, mount-kind open-state root graft,
contains-trigger protection — sitespec schema v4), and QA (discovery-id
addressing, textLength-only content gate, named
`trigger-inside-target-content-not-replayed`).

**Measured (fresh stripe.com E2E, 2026-08-17T21-23-33-002Z):**
**triggerState 27/27 · userVisibleTarget 27/27 — 0 mismatch / 0 not-observed /
0 not-declared** (Task 17: 23/2 · 17/3/0/5). No regression: `inputRoot*` 4/4,
content exact 1.0, doc height ≤0.5px, geometry p95 1px, runtime/hydration 0,
saas wide drift 0px (targeted run), 5,317 recovered rules on 18/18 aligned
pages. Open-menu geometry pixel-exact at 1440, content-identical at 1920/2048
with a 240–304px truth-viewport offset (named limitation); the mobile visual
outlier is deterministic font-fallback reflow (source↔source 0.005–0.011 vs
source↔clone 0.477), an explicit non-goal. 10 suites / 1,229 checks PASS.
**Freeze decision: READY FOR TEMPLATE PHASE** — next phase starts at
Exact Reconstruction → Recon Template → Slot V2.

---

## Task 18 — Recon Template Foundation & Slot V2 ✅

First step of the template phase: compile the frozen Exact Reconstruction into
a **Recon Template** — the cloned design/layout/behavior kept byte for byte,
the user-visible CONTENT separated into an editable data contract. Both inputs
(SiteSpec, Exact Reconstruction) stay immutable; the template is a new
artifact under `data/<host>/recon-templates/<run-id>/` (`manifest.json` +
`site-map.json` + `slots.json` + `default-content.json` + `slot-bindings.json`
+ `slot-overrides.example.json` + `report/slot-summary.json` + `app/`).
CLIs: `pnpm compile:recon-template` (offline, deterministic, AI 0) and
`pnpm qa:recon-template` (the one browser stage).

Done: `recon-template-v1` / Slot V2 v1 versioned zod schemas; slot types
`text` / `url` / `image` (closed — arbitrary HTML slot values forbidden);
site-specific keys + a 14-entry canonical role vocabulary assigned only from
certain structural evidence (landmark ancestry, heading levels, anchor
containment, hero container), generic roles otherwise; text bindings address
ONE text node (`childIndex`/`textSegment`, never `textContent`, so nested
markup survives); URL slots read `<a href>` only, classified
internal/external/tel/mailto/hash, with label and href as independent slots in
one group; image slots as `{src, alt, srcset}` objects with measured
box/aspect-ratio/object-fit constraints; text constraints record the
original's counts, per-viewport boxes and line counts (no invented max
length); exact-equality occurrence merging across viewports AND surfaces (one
logical slot → many bindings; stripe's `Products` = desktop static + mobile
static + mobile portal-menu template node); conservative global promotion
(header/footer, identical on every non-locale page, ≥2 pages); generic
anti-over-slotting evidence (aria-hidden subtrees, presentation roles, opaque
SVG, whitespace; ≥16-sibling lists flagged `review`); manual overrides
(exclude / merge / rename / role / scope / label / editability) with merges
refused on differing defaults; a server-only applier hooked into
`load-page.ts` before React renders (no client patching, hydration 0 by
construction) with per-binding expected-value guards; compile-time validation
proving every binding resolves and default content is an exact no-op; and a
parity QA that compares template(default) against the EXACT clone plus a
mutation canary through the overlay file (`WR_SLOT_VALUES_FILE`), never by
editing the artifact.

**Measured (stripe.com, Task 17.1 accepted lineage):** 9,529 slots / 24,512
bindings (1,921 dynamic-template) on 20 routes, 18,672 candidates excluded on
evidence, compile 1.9 s; default parity 46/46 pairs content- and
structure-equal at 390/1440 (+1920/2048 wide subset), doc-height Δ 0px,
geometry p95 0px, runtime/hydration 0; interaction regression 8/8; mutation
canary 15/15 occurrences applied incl. inside the mounted mobile portal menu.
Targeted `/use-cases/saas` lineage: 568 slots, 1,245/1,245, PASS at all four
widths. `pnpm smoke:recon-template` 58 checks; all prior suites re-run PASS.
Historical artifacts modified: 0; git operations: 0.

Not in this task (deliberately): natural-language content generation, any LLM
call, theme extraction/selection, SEO, asset/font materialization, CMS/admin,
semantic React component rewrite, Tailwind conversion, document-title and
SVG-internal slots (named limitations).

---

## Task 19 — Natural Language Content Injection Foundation ✅

On top of the Task 18 Recon Template: turn ONE natural-language intent into a
site content plan, deterministic content units, and a VALIDATED slot-values
overlay — and prove in a browser that the injected site keeps the template's
layout and verified behavior. The template stays immutable; the only path to
the page is Task 18's official overlay (`WR_SLOT_VALUES_FILE`). Isolated under
`src/content-injection/`; CLIs `content:prepare` / `content:generate` /
`content:validate` / `content:preview` / `content:qa`; artifacts under
`data/<host>/content-runs/<run-id>/`.

Done: `content-policy-v1` as a versioned artifact (layout preserved by
default, content-only surface, observed constraints as references, no invented
facts, needs-input over fabrication, no source-brand carryover); versioned
Content Intent with the raw sentence verbatim + immutable (hash in the
manifest) and interpretation kept apart in the generated Site Content Plan;
a deterministic Content Unit Builder (groupId / hero-context / single-slot
rules — no AI clustering) so the LLM never sees the 9,529 raw slots; a
bounded, batched Content Task Packet (global first, ≤40 units per batch);
a provider-neutral `ContentGenerator` contract with a deterministic fake
provider and a manual JSON seam (the MVP path where Claude Code authors the
result — same schema, same validator); a deterministic validator (unknown
keys fail, HTML/`javascript:`/control-char injection rejected, review slots
protected, image shape strict, provenance required, broken internal routes
warned); a source-brand-leak scan; layout safety QA comparing default vs
injected renders of the SAME template app (clipping, horizontal overflow,
section collision, block-level sibling overlap, stale-twin desync, applied
values on every changed binding incl. mounted dynamic portal templates,
interaction regression, screenshots; document-height change and line-count
growth stay diagnostic evidence); a bounded content repair loop (max 2,
content rewrites only); operator review reports; and the §29 human-override
path (hand-edit `slot-values.json`, revalidate + re-QA with no LLM call).

**Measured (stripe.com homepage canary, Korean AI-automation intent):** 370
units / 566 editable slots / 399 review listed; manual provider produced 357
validated values (260 changed) + 68 needs-input (metrics, customers,
testimonials, phone, legal entity, unspecified external destinations — none
invented); validation 0 errors / 0 warnings; brand-leak 66 warnings (untouched
defaults, reported not rewritten); layout QA 3/3 page-widths PASS
(390/1440/1920), applied 438/438 (static 285 + dynamic-template 153),
interactions 8/8, runtime/hydration 0, doc-height Δ 0px; desktop mega-menu
and click-mounted mobile portal menu fully rewritten (screenshot-reviewed).
The first QA round honestly FAILED and produced this Task's headline finding:
**aria-hidden paint-twin desync** — Stripe paints its hero headings twice
(an aria-hidden gradient copy Slot V2 rightly never slotted), so injecting
only the slotted copy double-exposes; now detected deterministically
(occurrences vs bound occurrences per page tree), excluded from text-rewrite
repair, and the four affected slots reverted as needs-input. A sibling
boundary was confirmed visually: SVG-internal labels (the header "Sign in"
pill) remain out of reach (`svg-internal-content-not-slotted`).

Fixture test `pnpm smoke:content-injection` (51 checks — the Task 18
synthetic fixture extended with a review list, an overflow badge and an
aria-hidden twin probe, through the REAL reconstruction → template → content
chain into Chromium). All 11 prior suites re-run PASS (1,338/1,338 total).
Historical artifacts modified: 0 (template file mtimes untouched); git
operations: 0. Verdict: **READY FOR THEME PHASE**.

Not in this task (deliberately): theme extraction/change, font change, asset
materialization, image generation, SEO rewrite, route slug redesign, blog
engine/CMS/admin, customer intake form, template marketplace, automatic
template selection, any LLM edit to CSS/React/layout, and any remote LLM
provider coupling (the contract is ready; no vendor SDK ships).

---

## Task 19.1 — Visible Content Injection Completeness ✅

**Goal.** Close the two Task 19 gaps — user-visible text the engine could not
change — and FREEZE the Content Injection phase. No Task 19 architecture
change, no theme/SEO/asset work, no historical artifact modification.

**A. aria-hidden paint twins → `paint-twin` binding surface (Slot V2 v2,
additive).** The compiler's new twin pass co-binds an aria-hidden duplicate to
its already-slotted visible occurrence only under simultaneous deterministic
evidence: same page+viewport, byte-equal text, aria-hidden boundary (never
svg/script/style), nearest common ancestor ≤ 4 element hops from both owners,
and SiteSpec boxes for BOTH owners that are byte-identical (covers the 0×0
mobile variant) or ≥ 50%-intersecting. aria-hidden content is never reopened
as editable; the applier treats `paint-twin` as static, so both layers change
in one server-side pass. Stripe: 4 twins (hero.headline d/m + the
accept-payments heading d/m). The stale-twin detector gained a severity
split: same-landmark-section unbound duplicate = desync (page FAIL, as
before); different-section duplicate (the "Crypto" string inside the
decorative aria-hidden mockup) = `stale-duplicate-text-remnant`, recorded and
excluded from repair but non-failing — which is what finally made the two
Crypto nav labels injectable.

**B. inline SVG `<text>` → `svg-text` binding target (Slot V2 v2, additive).**
A deterministic markup scanner enumerates rendered `<text>`/`<tspan>`
character runs (index over ALL runs in document order, so addresses never
move), excludes aria-hidden/css-hidden/title/desc runs, and admits
`<defs>` runs only when an ancestor id is referenced via `url(#id)`/`href` —
exactly Stripe's cutout-mask "Sign in" pill. Same-anchor byte-equal runs
co-bind into the existing DOM label slot (ONE slot, DOM + SVG bindings);
others become standalone `content.text` slots. Mutation is render-time,
entity-escaped string surgery on the addressed run — fill/stroke/gradient/
mask/geometry are structurally unreachable (SVG paint stays a named
limitation by spec §12).

**Canary** (new template run `2026-08-18T10-45-40-007Z`, new content run
`2026-08-18T10-46-26-129Z`, byte-identical intent hash to Task 19): slots
9,529 (unchanged — everything co-binds), bindings 24,518 (24,512 + 4 + 2),
24,518/24,518 resolve + default no-op; parity QA 46/46 (geometry p95 0px,
doc-height Δ 0), mutation 17/17 incl. both hero paint-twin bindings;
content: 361 values (264 changed) + 64 needs-input, validation 0/0,
brand-leak 66 warnings with the new `blocked-visible-source-content` blocker
class at 0; layout QA 3/3 PASS @390/1440/1920, applied 450/450 (static 291 +
paint-twin 4 + dynamic-template 155), interactions 8/8, runtime/hydration 0,
docHeight Δ 0px. Visually verified: Korean hero on BOTH paint layers at three
widths (double text 0), the SVG "Sign in" pill rendering 로그인, Korean
mega-menu and mobile portal menu.

Fixture test `pnpm smoke:content-injection` grew 51 → 68 checks (all ten
spec §15 fixtures: co-bound twin, decorative exclusion, twin mutation
propagation, unsynchronized-twin FAIL + far-section remnant, svg candidate/
exclusion/mutation/multi-binding/paint-integrity, hydration-safe render,
plus §13 blocker severity); `smoke:recon-template` 58/58 unchanged. Full
regression PASS. Historical artifacts modified 0; git operations 0.
Verdict: **CONTENT INJECTION FROZEN — READY FOR THEME PHASE**.

---

## Task 20 — Theme Extraction, Token Contract & Theme Adapter Foundation ✅

**Goal.** On top of the frozen Recon Template + Content Injection, a Theme
layer that swaps the site's visual skin (colors / surfaces / borders / radius
/ shadow) without redesigning anything: layout is locked, Theme is paint.
Three artifacts kept strictly apart — a common versioned **Theme Token
Contract** (`theme-contract-v1`, 24 closed tokens, all optional), site-agnostic
**Theme Files** (token → value; no selector/className/nodeId field exists),
and a per-site **Theme Adapter** binding tokens to THIS site's paint identity
(`.wr-st…` style tokens, doc-root classes, node-scoped rules) — no common CSS
class is ever forced onto a reconstruction (§8).

Done: deterministic Original Theme extraction from the template's OWN
stylesheet + runtime trees + slot catalog (document/root paint, heading/body/
anchor census, CTA slot paint with an opaque-own-background guard, visible
border and radius/shadow distributions; 0 AI); raw paint groups for every
color the closed rules cannot explain (`semanticToken: null`, themeable /
preserved / review status); border-shorthand color substitution that copies
the observed `width style` prefix byte-for-byte; a serve-boundary overlay
(CSS appended after the app's own stylesheet — the frozen template's bytes
and no-theme behavior untouched by construction, §34 composition order
structural); a deterministic compatibility GATE (token coverage, WCAG
contrast pre-check, preserved-gradient / asset-color warnings,
typography-not-applied, §23 dark gates); manual adapter overrides
(bind/unbind/preserve/themeable); a 3-theme curated library + extracted
originals as export candidates (never auto-promoted); operator-driven CLI
selection only (no recommendation engine, no industry metadata); and a theme
QA harness measuring DOM identity, geometry Δ, doc height, runtime/hydration,
computed paint application on static + pseudo + click-mounted dynamic
surfaces, browser-computed contrast, interaction equivalence, and
changed-paint coverage.

**Measured (stripe.com, frozen Task 19.1 lineage):** 14,057 rules → 293 paint
groups (31 themeable / 180 preserved / 82 review), 21 tokens assigned
(`color.text.inverse` honestly unassigned). Original Theme = browser no-op:
3/3 widths DOM identical, geometry max 0px (1,754–1,763 nodes), height Δ 0px,
67/67 paint checks, 8/8 interactions, runtime/hydration 0. Curated canary
(injected Korean homepage + cool-neutral): same zeros, palette visibly
swapped across 66,182 element occurrences incl. the desktop mega-menu and the
click-mounted mobile portal menu; warm-editorial swaps on the SAME adapter
(radii flattened, shadows softened) and passes identically; dark-accent is
judged `incompatible` (preserved dark text 20.7% > 10%) and is refused, not
applied. Fixture test `pnpm smoke:theme` (47 checks). Full regression PASS.
Historical artifacts modified 0; git operations 0. Verdict: **READY FOR SEO
PHASE**.

Not in this task (deliberately): automatic/industry theme recommendation,
theme marketplace or customer UI, Tailwind conversion, component semantic
rewrite, layout variation or section reorder, font materialization (typography
tokens are contract-only, apply OFF), image/SVG recoloring, asset
materialization, SEO, CMS, cloud infrastructure.

---

## Task 21 — Source SEO Observation & Production SEO Foundation ✅

**Goal.** Structurally separate Source SEO (immutable audit evidence of how
the ORIGINAL site does SEO) from Production SEO (independent artifacts for the
NEW content/brand/domain) — two versioned data models that share nothing —
and make the production plan actually reach the browser head of the
reconstructed app, closing the `document-title-not-slotted` gap open since
Task 18.

Done: `src/seo/` (14 files) + 4 CLIs (`seo:observe` / `seo:plan` /
`seo:preview` / `seo:qa`) + `pnpm smoke:seo` (72 checks); Source SEO Observer
reading ONLY stored evidence (per-page rendered.html head facts — title,
description, canonical, robots, hreflang, OG, Twitter, JSON-LD, heading
outline, image-alt audit — plus links.json graph, verification httpStatus)
with a bounded opt-in live fetch solely for robots.txt/sitemap (stored
nowhere), writing `source-seo-snapshot-v1` under a new
`source-seo-snapshots/` namespace with provenance `observed`; site-level
analysis (route depth, link graph, orphan candidates scoped to the observed
subgraph, duplicate titles/descriptions, canonical clusters, broken internal
links only where a verified non-2xx proves it — unverified targets counted
separately, indexability verdicts incl. `robots-noindex`); Production SEO
Plan (`production-seo-plan-v1`, new `production-seo-plans/` namespace,
provenance `derived`) generated from Recon Template + Content Run + Source
Snapshot + Domain State — every value classified known/needs-input with a
recorded basis, titles/descriptions derived from the injected 플로우데스크
content (copying a source SEO value is a checked failure: `forbiddenCopy`),
source-brand isolation via a forbidden-term set DERIVED from source evidence
(host, JSON-LD organization identity, og:site_name, sameAs social links)
scanned over every rendered production surface; preview domain state (no
domain → robots `noindex,nofollow`, robots.txt `Disallow: /` with no Sitemap
line, canonical intent recorded but never finalized, `/sitemap.xml` 404 with
a path-only `sitemap.preview.xml` plan artifact — inventing a domain is
impossible by construction); fact safety (address/phone/prices/reviews/
ratings/foundingDate/sameAs stay needs-input unless user-provided); metadata
rendering at the SERVE boundary (Task 20 precedent) — the proxy rewrites the
title in the head element AND the RSC flight payload (else React reverts the
tab title at hydration), injects the rendered head block, and answers
robots/sitemap; internal link QA classifying every anchor of every served
route; browser QA checking `document.title` AFTER hydration settle.

**Measured (stripe.com, accepted lineage — augmented observation run
2026-08-17T21-23-54-037Z, template 2026-08-18T10-45-40-007Z, content run
2026-08-18T10-46-26-129Z):** snapshot
`source-seo-snapshots/2026-08-18T19-25-49-810Z` — 18 pages, 0 duplicate
titles/descriptions, 18 self-referential canonical clusters, 89 hreflang
alternates on 16 pages, 0 robots meta observed anywhere, JSON-LD on 12 pages,
0 broken internal links among verified targets, 1,692 unverified internal
link targets, live robots.txt 200 (17 disallow rules) + sitemap index (9
partitions); plan `production-seo-plans/2026-08-18T19-26-12-572Z` — 20
routes, preview mode, home title/description known from injected content, 19
uninjected routes needs-input with brand-only fallback, 182 needs-input
values, forbidden-copy 83 comparisons 0 violations, brand isolation 265
strings vs 20 derived terms 0 violations; browser QA **29/29 PASS**
(post-hydration document.title = production title on injected AND fallback
routes, noindex served, JSON-LD parses with production identity, 0
source-brand terms in served heads, robots.txt 200 / sitemap.xml 404, 20/20
routes 200, 0 runtime errors); link audit 13,570 anchors — 244
route-resolving, 10,420 broken-internal (source routes outside the 20-route
table, by design), 4 source-host-absolute (newsroom page), 2,138 external,
764 non-navigational. Fixture test `pnpm smoke:seo` (72 checks). Full
regression PASS. Historical artifacts modified 0; git operations 0. Verdict:
**READY FOR ASSET INDEPENDENCE**.

Not in this task (deliberately): CMS, customer UI, theme ranking, Tailwind,
blog engine, cloud deploy, asset/font materialization (Task 22), production
static baking of the SEO overlay (deploy task, with the theme overlay),
redirects (no production URL space exists yet), Core Web Vitals /
performance audit, SEO Delta Report (needs a production domain to compare
against), body-content source-route link rewriting (owned by the
content/asset independence phases).

---

## Task 22 — Asset & Font Independence Foundation ✅

**Goal.** Remove the production candidate's runtime dependency on the
original site's asset/CDN/font hosts — the `asset-load-failure ×47`
non-goal carried since Task 17 — without ever auto-approving source brand
content or guessing a font license.

Done: `src/assets/` (13 files) + 4 CLIs (`assets:inventory` /
`assets:materialize` / `assets:preview` / `assets:qa`) + `pnpm smoke:assets`
(111 checks, 45 of them fetcher-safety); versioned asset + font inventory
(`asset-inventory-v1`, new `asset-inventories/` namespace) read from STORED
lineage artifacts only — SiteSpec asset catalog, generated-stylesheet
`url()`, template image slots, Task 19 imageBriefs, and observation-run
rendered.html head evidence (favicon / og:image / font preloads — data no
downstream artifact modelled); conservative classification
(safe-to-materialize needs positive evidence; unproven → replacement-
recommended, fetched but flagged; brand marks / people / customer identity →
replacement-required, never fetched, with same-pathname sibling escalation
so a webp rendition of a person photo stays required; fonts always
license-needs-review — never self-hosted, never guessed); SSRF-hardened
fetcher (http/https only, credential/port gates, DNS-resolved-before-connect
with the connection pinned to the validated addresses, private/link-local/
metadata/CGNAT/IPv6-private rejection, full re-validation on EVERY redirect
hop, streaming byte cap, MIME validation, inventory-host allowlist,
concurrency 2 + spacing); content-hash storage `/media/<sha256>.<ext>`
(extension from response MIME; byte-identical dedup) under a new
`asset-materializations/` namespace with manifest / rewrite map / operator
replacement manifest (the Task 19 imageBrief seam); serve-boundary asset
proxy (immutable app untouched) serving `/media/*` and rewriting HTML + RSC
flight + generated-CSS references in raw, `&amp;` and `&`-escape
variants; browser-measured runtime network QA (baseline vs independent
request census per route) and fallback font QA (source webfonts loaded over
today's fallback rendering via data: URLs — the font CDN sends no CORS
header — measurement only, bytes never stored).

**Measured (stripe.com, accepted lineage):** inventory
`asset-inventories/2026-08-19T05-54-47-361Z` — 721 entries (347 URL, 374
inline-SVG, 15 truncated), classification 4 safe / 289 recommended / 51
required / 3 license-review; fonts 3 URLs + 3 live-fetched @font-face rules
(`sohne-var`, `SourceCodePro`), 2 families license-needs-review with
recorded fallback stacks. Materialization
`asset-materializations/2026-08-19T05-54-55-204Z` — fetched **278/278, 0
failures**, 230 unique media files (57.5 MB), 278 rewrite entries, 340
replacement-seam entries. Browser QA over 3 routes: source-host runtime
requests **baseline 31 → independent 4** (all four are replacement-required
surfaces on `/` awaiting operator replacements; 0 other-external); fallback
font reflow measured — 93/264 text elements change when the real webfont
loads, width Δ p95 12.2px / max 79.4px, docHeight Δ 0; sohne-var vs its
fallback stack +0.05% sample width, SourceCodePro vs `sans-serif` −20.9%.
Full regression 15 suites PASS. Historical artifacts modified 0; git
operations 0. Verdict: **READY FOR PRODUCTION BUILD WITH INPUT
REQUIREMENTS**.

Not in this task (deliberately): static baking of media + rewrites into the
built app (Task 23, with the theme/SEO overlays), inline-SVG brand paint
(template-layer named limitation since 17.1), font self-hosting (license
unverified — operator decision), image generation/replacement execution
(operator seam only), cloud deploy, CMS, Tailwind, blog engine.

---

## Task 23 — ProductionSpec & Independent Production Build ✅

**Goal.** Combine Template + Content + Theme + SEO + Assets into ONE
reproducible ProductionSpec and produce a production candidate that runs
with NO external run-directory or proxy dependencies — the serve-boundary
stack of Tasks 20–22 baked into a self-contained artifact.

Done: `src/production/` (10 files) + 2 CLIs (`production:compile` /
`production:qa`) + `pnpm smoke:production` (71 checks); `production-spec-v1`
(new `production-specs/` namespace) pinning all five consumed layers by id +
`dir-sha256-v1` hash over the actual artifact files (per-file sha256 →
sorted path\thash manifest → sha256; build byproducts excluded and
recorded), plus baseUrl state, build-mode audit and machine-readable
indexability blockers; anchor-guarded bake of a template-app COPY (new
`production-builds/` namespace): content overlay baked to
`slot-values.baked.json` with the `WR_SLOT_VALUES_FILE` env seam removed,
theme overlay emitted as `public/wr/theme-overlay.css` and linked in the
head (same precedence group → same cascade as the proxy append), SEO plan
titles baked into route-map.json (head AND RSC flight derive from it) with
the rendered head block spliced into every exported HTML + plan robots.txt
(preview: no served sitemap), media/ copied in with the Task 22 rewrite map
applied to the BUILT html/flight/css files (all three URL encodings,
10,523 occurrences); build-mode audit chose full static export
(`output: "export"`) because the 20-route table is path-only with no
dynamic APIs — recorded behavior deltas (query strings no longer 404;
prerender instead of per-request); deployment package (site/ +
dependency-free server.mjs + deploy-manifest.json + RUN.md +
sitemap.preview.xml as artifact) generatable without credentials; QA
launches the package COPIED OUTSIDE the repo via its own server with
env={PATH} only and exercises it over HTTP + real Chromium.

**Measured (stripe.com, accepted lineage):** spec+build
`2026-08-19T06-36-35-798Z` — bake 361 content keys (0 unknown) · theme
cool-neutral 742 KB · titles 20/20 (0 guard mismatches) · head blocks 20/20
· media 230 files 57.5 MB · site 350 files 146.8 MB (next build 3.7 s).
Isolated-package QA **159/159**: 20 routes HTTP 200, browser titles 20/20,
injected Korean content 5/5 visible, theme computed-paint 5/5 token match,
hydration/JS errors 0, desktop + mobile-portal interactions alive, external
requests **4 total (all images.stripeassets.com replacement-required
surfaces; 0 other hosts)**, preview robots policy served, unknown routes
404. Blockers stay honest: 7 machine-recorded (domain, 182 SEO
needs-input, 51 replacement-required assets, font licenses, business
facts, 19 uninjected routes, inline-SVG brand marks) → the output is a
PREVIEW build by design. Full regression 16 suites / 1,656 checks PASS
(previous 15 suites unchanged at 1,585). Historical artifacts modified 0;
git operations 0. Verdict: **PRODUCTION PREVIEW READY**.

Not in this task (deliberately): actual cloud deploy/CDN/domain wiring,
indexable production (blocked on operator inputs, never forced), CMS,
Tailwind, blog engine, replacement-image generation, font self-hosting.

---

## Task 24 — MVP Final Acceptance ✅

**Goal.** Certify the MVP: re-derive every quality axis on the accepted
stripe production package with fresh samples, prove pipeline generality on
two non-stripe sites, discharge the Task 20 theme paint-coverage debt,
consolidate every generic-engine defect found by the parallel validation
agents into one canonical list, fix the fix-now subset, and issue one
honest final verdict.

Done (parallel agents; all handoffs under `docs/result/handoffs/`):
**stripe re-acceptance** (`24-site-stripe.json`) — isolated package, PATH-only
launch, deliberately different samples than Task 23: interactions 5/5 vs
frozen QA targets (incl. static-target disclosures verified by visibility
diff), baked slot values 10/10, fact safety clean (every $-price traced to
frozen source artifacts), theme spot 10/10 across 3 routes, 20/20 heads
source-brand-free, residual asset census, template+assets lineage hashes
recomputed from scratch → ACCEPT_WITH_LIMITATIONS. **Generality**
(`24-site-domainchecker.json`, `24-site-nextjs.json`) — the full chain
(offline v4 SiteSpec recompile from 6-day-old observation artifacts →
reconstruction → template → injection → theme → SEO → assets →
ProductionSpec → isolated package QA) ran to completion on
domainchecker.co.kr (19 routes; parity 40/40; total asset independence
28→0) and nextjs.org (40 routes, 87,191 nodes; parity 12/12; mutation
126/126; asset independence near-zero BY POLICY — 154/214 brand assets
correctly refused) → both PIPELINE_GENERALIZES; every FAIL classified, no
silent wrong artifacts. **Theme debt closure** (`24-theme-coverage.json`):
31/31 themeable groups `verified`, 0 mismatch, over all 20 routes × 2
viewports + 4 dynamic surfaces with a negative control — see the closure
record in the Deferred section below. **Defect consolidation**
(`24-aggregation-phase1.json`): 7 canonical generic defects — 3 fix-now
corrected by a fresh agent (`24-correction-1.json`, verified PASS in
`24-correction-1-verification.json`): GED-A production:qa interaction
metric now accepts state-flip evidence (mount path unchanged, inert-trigger
negative control), GED-B blocker summaries derived from the artifacts their
evidence paths cite (zero hardcoded literals), GED-C fragment-only CSS
url(#id) refs excluded from the fetch set (`fragmentRefsSkipped`,
schema-optional). Re-verification on the EXISTING untouched builds:
domainchecker 150/152 → **152/152**, nextjs 297/299 → **299/299**, stripe
accepted build **159/159 unchanged**; stripe spec recompile reproduces all
5 lineage hashes byte-identically; nextjs inventory re-run removes exactly
the phantom entry (292→291). 4 defects roadmapped post-MVP (GED-D
micro-slot repair non-convergence, GED-E preview-proxy entity-escaped
titles — production path proven closed by baking, GED-F body-anchor source
identity, GED-G per-file residual-render list).

**Measured.** Full regression after corrections: **16 suites / 1,671
checks / 0 failures** (chain 1,402 → 1,474 → 1,585 → 1,656 → 1,671;
production 71→84, assets 111→113, other 14 suites byte-match). Frozen
artifacts modified: 0 (mtime + hash audits at every step). Git operations:
0. Named residual reconciliation: the unique residual render set is **5
files** (not the /-scoped "4"), single known host, all
replacement-required awaiting-input. Named sampler limitation F1: the
GED-A state-flip criterion has a bounded masking window (attribute flip
with nothing rendered would pass the SAMPLER; the frozen 27/27 + parity QA
remain the fidelity authorities).

Report: `docs/result/24-mvp-final-acceptance-2026-08-19.md` · Final handoff:
`docs/result/handoffs/24-final.json`.

Verdict: **MVP PREVIEW READY — PRODUCTION INPUTS REQUIRED** — every
machinery gate passes or fails honestly; the 7 machine-recorded blockers
(domain, SEO needs-input values, replacement images, font licenses,
business facts, 19 uninjected routes, inline-SVG brand marks) are all
operator inputs; indexable production is one documented recompile away
once they arrive.

---

## Deferred / Future

- Competitive analysis over stored observation data

### Deferred Validation Debt — Theme Multi-route / Multi-site Paint Coverage (from Task 20)

Task 20 baseline: 31 themeable paint groups. Browser verification covered only
the ~14 groups that render on the homepage (67/67 paint checks), plus 3 dynamic
paint samples (mega-menu, mobile portal, hover). The remaining themeable groups
were never exercised in a browser.

MUST be recovered in Task 24 (MVP Final Acceptance): expand representative
routes and dynamic surfaces (mega-menu, dialog, locale, mobile portal) so every
one of the 31 themeable groups is classified as exactly one of `verified`,
`not-exercised`, or `mismatch` — with browser computed-style evidence for every
group that renders on a reachable route. Mismatches are classified as generic
defects and delegated to a fresh correction agent, not patched in place. This
debt must NOT be deferred again after Task 24.

**CLOSED in Task 24 (2026-08-19).** Evidence:
`docs/result/handoffs/24-theme-coverage.json`. All **31/31 themeable groups
classified `verified`** (0 `not-exercised`, 0 `mismatch`) with browser
computed-style evidence, measured against the ACCEPTED production package
(`data/stripe.com/production-builds/2026-08-19T06-36-35-798Z/package`,
served by its own dependency-free server, env=PATH only) across **all 20
routes × 2 viewports (1440/390)** plus 4 dynamic surfaces (3 desktop
mega-menu triggers, 1 mobile portal menu). Every group matched its
cool-neutral token at a 100% rate over every visible element; borders
verified as color+style+width, shadows as full box-shadow strings; negative
control proven (pg000003 on `/`: 434/434 elements token-valued, 0 source-
valued — the comparator can fail). Zero mismatches → no correction agent
was needed for this debt. Scope note: this closure is stripe-scoped;
multi-SITE exhaustive paint coverage is not claimed (domainchecker verified
10/27 sampled groups, nextjs homepage-only) and remains a post-MVP item.
