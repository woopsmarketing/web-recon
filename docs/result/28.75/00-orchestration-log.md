# Task 28.75 — orchestration log

A running record of lane dispatch, findings that changed the plan, and scope moved between
lanes. Written by the master orchestrator as the program runs, so the final report does not
have to reconstruct the sequence from memory.

---

## Wave 0 — reconnaissance (read-only, 4 parallel agents)

Mapped `src/responsive-qa/**`, `src/observer/**` + `src/multi-observer/**`,
`src/reconstruction/**`, and the end-to-end pipeline + test battery. Output was file:line
anchors only, kept out of the final reports. Two facts from this wave changed the plan:

- The human-review pack's `index.html` / `manifest.json` are **not** produced by any committed
  code — 28.6 and 28.7 each built them with an ad-hoc Python script under `tmp/`. This wave
  writes ONE parameterized generator (`tmp/wr2875/orch/build-review-pack.py`) used by both
  28.75 and 28.8 rather than forking it a third time.
- No wave has ever captured a per-suite regression baseline at its own start, so "no
  unexplained negative per-suite delta" has never been measurable. 28.7's
  `index-final.tsv` is now pinned as `tmp/wr2875/regression/baseline-287.tsv` and the runner
  emits a per-suite delta column against it.

## Wave 1 — four lanes, file-partitioned

| lane | owns | target |
| --- | --- | --- |
| blank-region channel | `src/responsive-qa/{probe,blank-region,classify,types,correspondence,run,index}.ts` | B2 detection |
| width chain root | `src/reconstruction/**` | B1 |
| popup / page state | `src/observer/**`, `src/multi-observer/**` | B6, B7 |
| JS-content trace | READ-ONLY | B2 root cause |

Partitioned by file, not by topic, because the four programs overlap in subject. Where two
programs needed the same file, they were serialized rather than merged: the L1/L3 rubric work
shares `classify.ts` and `types.ts` with the blank-region channel and therefore runs **after**
it, not beside it.

## Finding that reframed the wave — "JS-dependent content" is not JS-dependent

The trace lane returned four regions, **three mechanisms, and no need for any runtime
emulation.** The category the brief anticipated (D — "the source runtime creates a final DOM
subtree after settle") did not occur at all.

| region | category | owner | mechanism |
| --- | --- | --- | --- |
| severance hero | C | reconstruction | the `<body>` background is emitted as an in-flow block background instead of being propagated to the document canvas, so it paints **over** the `z-index:-1` hero and leaves white text on white |
| severance NEWS row | C | observer | `float` is absent from `STYLE_WHITELIST`, so slick's `float:left` slides stack at the track origin, land at x = −543 under `translateX(-981px)`, and are clipped by `.slick-list{overflow:hidden}` |
| severance promo carousel | C | observer | the same missing `float:left`, on a second slick track |
| seoultone doctor biography | A | observer | `html{scroll-behavior:smooth}` makes `scrollBy` async; `runScrollPass` reads `scrollY` synchronously, measures `moved ≤ 0` after one step and breaks — **the Observer never scrolled the page**, so ScrollReveal never fired and the collector recorded `opacity:0` |

All four judged fully recoverable by generic mechanisms. Three of the four are **one-line-class
fixes to existing whitelists and loops**, not new subsystems.

### Scope moved as a result

- `float` / `clear` / `text-indent` whitelist + the mandatory `QA_STYLE_PROPERTIES` mirror, and
  the `runScrollPass` fix → **observer lane** (it already had to re-observe; folding these in
  saves an entire re-observation cycle). It was also given `gs.severance.healthcare` so all
  four canary sites are observed once with every fix in.
- The document-canvas background propagation → **reconstruction lane** (it already had to
  rebuild), with the explicit requirement that a root-element background must still win over
  the body's, and that the declaration be **re-homed, never dropped**.

### Correction sent to the blank-region lane

The brief's framing — "the content is present in the clone and displaced thousands of pixels" —
is true for the two carousel regions and **false for the hero**, which sits at exactly the
source geometry with `opacity: 1` and a decoded image. Every DOM-census signal reads normal
there. A DOM-only detector would report the severance hero as healthy, which is the precise
failure this channel exists to prevent. Region-level ink/screenshot occupancy was therefore
made a required evidence channel rather than an optional one, and the lane must publish a
per-mechanism × per-channel table so any mechanism caught by only one channel is visible.

### Risk raised to the popup lane

The seoultone popup **could not be reproduced on a fresh load on 2026-09-05**. Its identity is
known from the 2026-09-04 artifact (`section#popup_slider`, `500 × 813` at 1440 = 35% width
coverage, which is exactly what the 0.5 shape gate refuses). The lane was told to attempt the
live site, fall back to replaying the captured `rendered.html`, keep a fixture for the
permanent check — and to **state which of the three it actually got**, rather than reporting
the fix as working on a site that no longer exercises it.

### seoultone missing-text split, quantified and self-checking

@390: 393 chars missing (30.54%). Popup-attributed **37 chars / 4 strings** (bounded 21–41);
real content loss **356 chars / 27.66%**. The self-check: @1440, where the popup is present on
*both* sides and contributes nothing, missing is **356 chars** — the same number. Carried
honestly: both sides' captures still exclude ~521–535 opacity-hidden chars from the census, so
true loss is understated on both sides by roughly that amount.

## Phase B preliminary HTTP preflight (run early — free and read-only)

All four target sites return 200 and none blocks its public marketing surface.
One finding worth carrying: **`vipgunma.com` has no `/sitemap.xml` (404)** — it publishes five
numbered sitemaps via `robots.txt`, so a discovery run assuming the conventional path gets
nothing. Detail: `tmp/wr2875/phaseb-preflight/00-http-preflight.md`.

---

## Lane result — blank-region channel (Phase A first priority)

`blank-region-ratio` shipped; `RUBRIC_VERSION` 4 → 5. Suite `205 → 271` checks, all passing;
typecheck 0. Pre-fix failure count **21 of 271** (mechanism reverted in place, restored and
verified with `shasum -a 256 -c`).

**Mechanism:** an in-page region census on both sides selects visible non-media containers
≥20% viewport-wide / ≥60px tall / ≥2% viewport-area, rejecting the rest with one of ten
enumerated reasons — and the accounting conserves: **32,652 examined = 790 selected + 31,862
rejected** across 12 real sides. Correspondence is tag-path **suffix** matching (≥2 segments)
with a geometric-IoU tie-break. Two independent evidence legs — DOM paint occupancy and
region-level **screenshot ink** — are ORed, unioned exactly, and divided by one viewport's area.

### Three findings worth carrying beyond this lane

1. **Exact tag-path matching is 0% on every pair measured.** The generator bolts a fixed shell
   prefix onto every clone path, so any future cross-side correspondence work must match on a
   suffix, not a path. This was measured, not assumed, and it is why the naive design fails.
2. **Paint occlusion is caught by ONE channel.** With screenshots the severance pairs report
   1.4533 over three regions; **without them, 0.6435 over two — and the hero is not among
   them.** If the ink leg goes quiet on a fresh site (missing or wrong-size screenshot, or DOM
   coverage below the 0.8 floor) the rubric returns to grading a white hero healthy. This is
   the single most fragile point in the new instrument and it is named as such.
3. **Two false positives were found and cured on evidence, not by taste.** The ink leg fired
   BLOCKER-sized holes on hobbang — a human-graded-excellent page. Root cause measured:
   hobbang's *source* census reaches only 51%/50% down its own page, so the DOM boxes name the
   wrong pixels. Cure: `REGION_INK_DOM_COVERAGE_MIN = 0.8` (hobbang 0.51/0.50 against 0.98–1.00
   everywhere else). **Two other candidate guards were measured and rejected** — offset-residual
   (both hobbang findings sit at residual 0px) and per-region DOM↔screenshot agreement (healthy
   linear scores 0.30–0.74 against misaligned hobbang's 0.93). Rejecting two guards on
   measurement is worth more than adopting one on intuition.

`paintSuppression.suppressedBelowFold` — the pre-existing unread signal — was evaluated as a
candidate evidence leg and **rejected**: it separates must-fire from must-not-fire at site level
(9.3% / 18.2% vs ≤1.3% / 0%) but measures the *source* capture rather than the clone, names no
box, is **0 on severance mobile where the defect is present**, and lives in a different artifact
captured at a different time. Retained as run-artifact context only.

### Acceptance

| pair | required | result |
| --- | --- | --- |
| severance `/gs/index.do` @1100, @1440 | MUST FIRE | **BLOCKER, 1.4533** — names the hero, the NEWS band and the carousel |
| linear `/pricing` @390, @1440 | MUST NOT FIRE | **0** |
| hobbang `/` @390, @1440 | MUST NOT FIRE | **0** |
| seoultone `/` @390, @1440 | MUST FIRE | **NOT MEASURED — source unavailable** |

## External blocker — seoultone.kr is down

Confirmed independently at 07:2x on 2026-09-05: HTTPS fails at the TLS handshake
(`curl (35) tlsv1 alert internal error`); HTTP returns a **406-byte** stub whose only content is
a script redirecting to `hostinfo.cafe24.com/overTraffic/503.html`. The origin is over its
Cafe24 traffic quota. linear.app, hobbang.net and gs.severance.healthcare are all up.

This is `SOURCE_UNAVAILABLE`, not a reconstruction failure, and it is recorded as such
everywhere it lands. It affects two of the blank-region channel's eight acceptance fixtures and
two of the eighteen closure-canary pairs. A background waiter
(`tmp/wr2875/orch/wait-seoultone.sh`, 150s interval, 3h cap, discriminating on body size rather
than status code because the stub returns 200) will report recovery; the seoultone leg is run
if and when the origin returns, and reported as unmeasured if it does not. The 2026-09-04
artifacts remain a legitimate **offline** substrate — the captured desktop `rendered.html` still
contains the popup and the missing bio block — but they cannot substitute for a live
source-vs-clone pair.

---

## Lane result — frozen-width chain root + document canvas

**Width.** 6,927 residual frozen boxes across the four canaries reduce to **1,107 chain roots** —
the number that justifies attacking roots instead of leaves. Three mechanisms shipped, each
reached only from an exit that had already refused: `trackedFillWidth()` (in-flow blocks under a
*banded* parent padding — linear authors 28/10/46px via a custom property inside `@media`, which
defeats the single-truth-width `contentAt()`), `viewportBleedWidth()` (the whole five-declaration
bleed set co-emitted, which dissolves 28.7's 240px-overhang objection to the naive version), and
`damageClampWidth()` (§19's permitted last resort — **150 clamps against 7,194 refusals**).
`containingBlockGuard()` byte-for-byte unchanged.

Two-directional geometry over **190,590 comparisons: 2,810 improved / 37 worsened**, Σ width
error 14,415,916 → 13,572,665 px (**−5.85%**), with all 37 worsened rows named individually.
`rejectedByTruthCheck` and `acceptedRegressed` stayed 0 on every site. Flag-OFF byte-identity
proven by SHA-256 on all four sites; flags removed on adoption.

A bug the discriminating twin caught, worth recording because it would have shipped silently: the
clamp compared against the parent's **border** box while `100%` names its **content** box —
measured +62.0px on linear `n000575` @1280 and +307.9px on its child @1101.

**Canvas.** The `<body>` background is now resolved to the document canvas, spec-keyed, with
root-wins precedence actually exercised in production (linear carries its background on `<html>`).
Declarations are **moved, not dropped**, and scoped per page via `html:has([data-wr-page=…])`
because a global rule would tint hobbang's nine backgroundless routes. Paint proof on
gs.severance at 1440, natural render with no injection: the hero band was flat `255,255,255` at
all seven sample points before, and carries real hero content after. **That BLOCKER is cleared.**

Suites: `smoke-layout-safety` 325 → **394/394**, `smoke-reconstruction` **227/227**, typecheck 0.
Pre-fix failure **30 of the 69 new checks** (22 width, 8 canvas), files restored under checksum.

### Acceptance NOT MET on linear `/` at 700 / 1024 / 1100 — and the reason is not "more rule kinds"

This is the honest result and it reframes gate clause B. Three facts, all from the probe rather
than from argument:

- **700 px was never observed.** That page's probe widths are `[390, 640, 641, 769, 900, 901,
  928, 929, 1024, 1025, 1101, 1280, 1281, 1440, 1441, 1920]`; the nearest samples are 641 and 769.
- **The SOURCE's own desktop DOM overflows its viewport at every observed width** — maxRight
  1661 at 641/769/928/1024, 1665 at 1101, 1840 at 1440. The clone's 1839 *is* the source's 1840.
  `maxRight` is therefore the wrong acceptance metric on this route: those boxes exist in the
  source too, clipped by an ancestor's `overflow-x`. What actually scrolls — `scrollWidth` — is
  862 at 700 (162px of horizontal scroll) and **exactly the viewport at 1024, 1100 and 1440**.
- **All 8 remaining outermost overflow roots at 700 are refused for stated reasons**, each of the
  three branches asked directly: four because *the source's own box overflows its parent*, one
  because the source width is genuinely constant at 1320px across the whole desktop range (so it
  is authored, not frozen), one is inline text with no frozen width, one is refused by
  `containingBlockGuard()`. **Not one is a case a further inline-size rule kind would answer.**

The residue at 700 is a question about *which tree is served there*, not about width recovery:
the site's family-change widths on `/` are 641 and 929, only two trees are ever observed, and the
switch was inferred at 641. That is B3, which §6 says to carry rather than block on.

## Hypothesis raised and killed: the mobile probe envelope

I suspected linear `/pricing` @1024 — "a 2×2 plan grid rendered as one narrow column with
two-thirds of the page empty" — was the mobile tree being served at 1024 with no probe evidence
up there. **Wrong.** The mobile probe envelope for `/pricing` is `[390, 560, 561, 640, 641, 700,
701, 768, 769, 900, 901, 914, 928, 929, 1024, 1025]` — it reaches 1024. Recorded because a killed
hypothesis is a result, and because it removes the one explanation that would have required
re-observing with different probe widths.

## Next lane — band-aware grid track recovery

Three independent lines of evidence converge on it:
1. `/pricing` @1100's three remaining outermost roots are all 1344px and all refused
   `containing-block-not-parent` — **grid items inside a frozen grid track**. The width lane's own
   conclusion names this as the highest-value follow-on it can identify.
2. hobbang's four banded grid-track roots from 28.7, refused
   `tracks-not-reproducible-at-every-width`.
3. `/pricing` @1024's collapsed plan grid, now that the probe-envelope explanation is dead.

`containingBlockGuard()` refusing `grid-item` is correct and stays. The chain-root argument
applies exactly: do not fix the items — make the container's tracks responsive and the items
resolve on their own. Banded emission already exists (`bandMedia()`, used by `responsive-hidden`),
so this extends a capability rather than inventing one. 28.7 declined this population as "a
different and much larger mechanism"; it is now the top remaining lever, which is what justifies
paying for it.

---

## Lane result — popup gate, shared page-state API, and the two content fixes

**The gate.** `OVERLAY_SHAPE` was left byte-untouched (the collector's read-only census shares
it); a second **additive** `PANEL_SHAPE` tier now looks only at elements the cover tier already
dropped. The evidence bar is unchanged and **no new STRONG signal was added** — shape now
corroborates rather than vetoes, which is exactly what the brief asked for:

```
admitted  ⇔ painting ∧ position ∈ {fixed, absolute} ∧ intersects viewport ∧ (COVER ∨ PANEL)
PANEL     ⇔ ¬(w ≥ .85 ∧ h < .5) ∧ w ≥ .20 ∧ h ≥ .25 ∧ area ≥ .08
            ∧ (min(insetL,insetR) ≥ .06 ∨ min(insetT,insetB) ≥ .06) ∧ (fixed ∨ z-index > 0)
qualified ⇔ admitted ∧ strongSignals ≥ 1 ∧ signals ≥ 2      (UNCHANGED)
```

**seoultone `/` @1440 was dismissed on the LIVE site**, not a replay and not a fixture:
`panelMatches 1 / qualified 1 / dismissed 1`, `widthCoverage 0.347`, closed via the 닫기 control,
coverage 0.314 → 0, with before/after PNGs and `record.json` on both viewports. This is the
clause 28.7 was judged on first and failed; it is now met on real evidence. The capture is from
22:16 on 2026-09-04 — the host began serving its Cafe24 traffic-cap interstitial afterwards.

**No false positives.** 56 page×viewport combinations across linear.app (8), hobbang.net (20),
gs.severance (4) and seoultone's non-home pages (24): `panelMatches 0` everywhere, one new
candidate admitted in total across all sites. The five negative controls hold at both viewports.

**Symmetry is now a permanent, non-vacuous check** — it sweeps every host's latest run, and it
was proven to fail on the pre-fix seoultone pair (`desktop 0 / mobile 1`), the only asymmetry in
`data/`. A check that cannot fail proves nothing; this one was shown to.

**Shared API.** The initial-paint census was extracted to its own module so there is one
implementation, and the two-call contract is exported and documented. Skipping call 1 is recorded
as `initialPaintCensusStatus: "absent"` with a limitation naming the missing call — never silent.

**Evidence root** is now `data/page-state-evidence` by default and overridable per call and per
CLI flag. 28.7's evidence directory is byte-untouched.

**The two content fixes landed here.** `float` / `clear` / `text-indent` added to
`STYLE_WHITELIST` and mirrored into `QA_STYLE_PROPERTIES` — and the mirror caught something:
`text-indent` was already present, so the duplicate turned two `smoke-qa-independence` checks red
and was removed. `runScrollPass` rewritten to `scrollTo({behavior:"instant"})` plus a second
post-settle `evaluate` and a 3-stall tolerance.

Two defects the lane's own post-fix run caught and fixed **at source rather than in the
assertion**, which is the behaviour the brief demands: `SCROLL_MAX_STEPS` 60 gave *less* reach
than the pre-28.75 policy (60 × 0.5 vh = 30 vh against 40 × 0.85 = 34 vh) and was raised to 70;
and the 700 ms dwell had made a reveal sampling-floor check vacuous, so the fixture now uses
separate fade-in / fade-out durations with the arithmetic asserted.

Suites: `smoke-multi-observer` 263 → **298/298**, `smoke-qa-independence` **101/101**, typecheck
0. Pre-fix failure **10** (5 panel tier, 4 scroll pass, 1 whitelist), restored under checksum.

### Fresh observation run ids

| host | run | carries |
| --- | --- | --- |
| gs.severance.healthcare | `2026-09-04T22-33-34-567Z` | popup gate + float + scroll |
| linear.app | `2026-09-04T22-34-32-296Z` | popup gate + float + scroll |
| hobbang.net | `2026-09-04T22-39-01-787Z` | popup gate + float + scroll |
| seoultone.kr | `2026-09-04T22-16-43-848Z` | **popup gate ONLY** — predates the content fixes |

seoultone must be re-observed when the traffic cap resets; anything rebuilt from that run gets
missing `float` values and unscrolled content. Tracked as an open item, not papered over.

### Carried risks from this lane

- **Throughput regressed 4×**: hobbang `/` went 28.3 s → 120.4 s per page. Correctness bought with
  wall clock; the closure canary and Phase B budgets are re-estimated accordingly.
- `PANEL_SHAPE` is calibrated on three sites; the `backdrop-behind` signal has never fired on a
  real site; and **gs.severance's own entry popup is still not dismissed** — not a regression, but
  live evidence that the gate remains narrower than "every entry popup". Recorded rather than
  tuned away.

## Pipeline scheduling

Site-spec compilation (`detect → explore → model → compile:sitespec`) was started for the three
healthy hosts as soon as their observations existed, because those stages do not depend on
`src/reconstruction/**` — which the grid-track lane is still editing. Reconstruction and the
closure canary run once that lane freezes.

## Verification — the content fixes actually reach the SiteSpec

Site-specs were recompiled from the fresh observations for the three healthy hosts
(`detect → explore → model → compile:sitespec`, ~2.5 min total):

| host | observation | site-spec |
| --- | --- | --- |
| gs.severance.healthcare | `2026-09-04T22-33-34-567Z` | `2026-09-04T23-32-44-789Z` |
| linear.app | `2026-09-04T22-34-32-296Z` | `2026-09-04T23-34-15-786Z` |
| hobbang.net | `2026-09-04T22-39-01-787Z` | `2026-09-04T23-34-52-203Z` |

The whitelist change is confirmed present in the compiled style catalogs — not inferred from the
observer lane's own report, but counted in the artifact the reconstruction will consume:

| catalog | tokens | `float` decls | `float` values |
| --- | ---: | ---: | --- |
| gs.severance **before** (`…T18-14-45-426Z`) | 971 | **0** | — |
| gs.severance **after** (`…T23-32-44-789Z`) | 974 | **870** | `none` 828, **`left` 40**, **`right` 2** |
| linear.app after (`…T23-34-15-786Z`) | 3,270 | 3,150 | `none` 3,150 |

The 40 `float: left` declarations on gs.severance are the slick carousel slides — the exact
mechanism that put the NEWS cards at x = −543 and had them clipped away. Linear's floats are
100% `none`, so that site carries no behavioural change from this fix, which is the expected
and desired null result on a site that does not use floats.

`text-indent` and `clear` follow the same 0 → 870 / 0 → 3,150 pattern. Distinct property count
per catalog moved 120 → 123, matching exactly the three properties added.

---

## Lane result — QA honesty (L1, L3, B7, M6)

Suite `271 → 349`, **349/349 PASS**, typecheck 0. Pre-fix failure counts, each established by
reverting that mechanism in place and restoring under checksum: **L1 = 12, L3 = 12, B7 = 11**.
`RUBRIC_VERSION` **5 → 6**.

**L1 — overlap demotion.** `classifyOverlapPair` now tests geometry and ownership FIRST: only an
*image pair with the same visual owner in the same box* can be demoted at all, and inside that
population a failed asset picks `failed-image-layer` while everything else stays `true-overlap`.
The area the guard still demotes is now graded by a firing channel,
`overlap-demoted-excess-ratio`, **relative to the source's own demoted area** — the source is
rendered by the same browser under the same pinning policy, so a genuine `<picture>` or crossfade
cancels exactly. Two existing assertions that pinned the old defect were inverted, and that is
stated explicitly rather than quietly.

**L3 — the never-diffed overflow band.** Option (A). `gatePixels` keeps the identical crop and
produces byte-identical numbers (the clone modal is derived in a separate pass so palette slots
cannot shift), and adds 19 fields measuring the excess band in **area and ink**, with a
conservation identity the suite asserts. New MAJOR channel `pixel-uncompared-band-ink-ratio`. The
composite now prints a red `CAPTURE WIDTH MISMATCH` banner and **hatches the uncompared strip on
the wider panel with its width** — a reviewer cannot now compare two canvases without seeing it.

**B7 — page-state symmetry.** `captureSide` runs the observer's two-call contract on **both**
sides, the clone side justified as a check rather than only a fix. `SideProvenance.pageState`
records it per side. A source overlay that qualified and did not close makes `missing-text-ratio`
and `visible-text-ratio` **ineligible with a stated reason** instead of charging the clone.

**M6 — both false-alarm channels deliberately LEFT ALONE, on evidence.** This is the right
outcome and the reasoning is worth preserving: `offscreen-text-excess-chars` is already relative
(200 excess against a 427-char source, floor 0); and `position-delta-p90-px`'s principled
comparison — its own self-check floor — reads **0 px source-vs-source** on linear `/` @1440
across three runs, against the clone's 63 px. **The floor contradicts the false-alarm
hypothesis.** Retuning either threshold would have produced a nicer tally and a worse instrument.
Both thresholds are now frozen by permanent checks, and the principled per-key re-basing is
specified and carried with its risk measured.

### Fired on real corpus vs fixture only — stated, because the last wave was caught eliding this

| mechanism | real corpus? | evidence |
| --- | --- | --- |
| `pixel-uncompared-band-ink-ratio` | **YES** | linear `/` @700 (run `2026-09-04T23-44-43-588Z`): 700px source vs 862px clone, the 162px band is **1,613,196 of 1,613,520 px ink = 99.98%**, ratio 0.2404 → MAJOR, **only 78% of the capture was ever compared**. gs.severance @1100 (run `2026-09-04T23-40-51-897Z`): 1280 vs 1100, 180px band 69.8% ink → MAJOR. The equal-width @1440 pairs in the *same runs* read 0 — negative controls in situ. |
| B7 normalization | **YES** | ran on every side of every pair, census `available` each time, number-for-number agreement against the observer's own API in real Chromium. Its not-comparable branch is fixture-only. |
| L1 reorder | **fixture only** | both demotion populations are empty on all 16 real pairs across four sites; the reorder changes no number on any canary. Mutation-proved instead: PASS → BLOCKER on the demoted area alone. |

### Consequences for the closure canary

- **Rubric 5 → 6 means every self-check floor must be re-measured.** L1 can only add findings and
  B7 can only remove them, so rubric-5 and rubric-6 verdicts are not comparable and no floor from
  an earlier run may be reused. The canary runs with a fresh floor.
- `pixel-uncompared-band-ink-ratio` will **add** MAJOR findings to already-graded width-mismatched
  pairs. That is the instrument getting more honest, not the clone getting worse — and on
  linear `/` @700 the mismatch is itself a symptom of the frozen width, so it should shrink as
  that is fixed.

### Carried, not fixed

`src/reconstruction-qa/screenshot-diff.ts:209-210` repeats the same silent min-crop. It is
outside this lane's ownership, so it was **not edited** — and a check was added that will fail
the day someone fixes it, so the carry cannot be forgotten.

---

## Interruption — the grid-track lane was cut off mid-work

The band-aware grid-track lane terminated on an API session limit before it implemented its
mechanism. State on resume, verified rather than assumed:

- `pnpm typecheck` — **exit 0**
- `npx tsx scripts/smoke-reconstruction.ts` — **227/227 PASS**
- `npx tsx scripts/smoke-layout-safety.ts` — **445/451, 6 FAILED**

The 6 failures are all the lane's own newly-written tests for a mechanism that was never
written: `inferLayoutRules() emits the banded kind, with its @media and its numeric band` (got
`[]`), the `generateLayoutCss` band-wrapping check, the two band-histogram accounting checks, and
two grid-item checks whose observed outcomes (`emitted-damage-clamped-width`,
`refused-containing-block-guard`) show the item is currently answered by the *clamp*, not by
track recovery. It added 57 checks in total; **51 pass, 6 fail, and every failure is an
unimplemented feature rather than a broken one.**

Reconstruction *behaviour* is therefore exactly the width lane's verified state. The tests were
written before the implementation — which is the right order to write them in, and it left an
unambiguous, self-describing red.

### Decision: measure before deciding whether to pay for the mechanism

The closure canary was started against the tree exactly as it stands, deliberately, for two
reasons:

1. The grid lane was scoped on inference from the **pre-float, pre-width-fix** reconstruction.
   Since then the float whitelist, the scroll traversal, three inline-size mechanisms, the damage
   clamp and the document-canvas fix have all landed. The remaining defect profile is now an
   empirical question, and §31's correction cycles are meant to be evidence-driven.
2. Running the canary and editing `src/reconstruction/**` concurrently would make the canary's
   artifacts non-reproducible.

The canary therefore measures the real state of the engine; the grid mechanism is then either
justified by that measurement and implemented as a correction cycle, or the 6 premature checks
are removed with the reason recorded. **This is stated here so no reader mistakes the 451-check
suite for a green one at the time the canary ran.**

## seoultone.kr — still unavailable

Re-checked at 19:12 KST: HTTP 200 with the same 406-byte Cafe24 over-traffic stub; HTTPS still
fails at the TLS handshake. Down for ~10.5 hours. The first waiter expired at its 3h cap. A
second waiter now runs an 8h window so it crosses 00:00 KST, when a daily traffic cap would
reset. `SOURCE_UNAVAILABLE` stands until it returns; the closure canary runs 16 of the 18 pairs.

---

## Correction cycle 1 — and a correction to this log

**Correction to my own earlier entry.** I recorded the interrupted grid lane's 6 red checks as
"tests for a mechanism that was never implemented". That was wrong. `recoverGridTracksBanded()`
and `gridAreaFillWidth()` **were fully built and unit-tested**, behind two `process.env` A/B flags
defaulting OFF; with the flags on the suite was already 451/451. The lane was cut off during the
*measurement* that decides adoption, not during implementation. The behavioural conclusion drawn
from it was still correct — flags off means the shipped behaviour was the width lane's verified
state, which is what the canary measured.

### What cycle 1 established

**`/pricing` @1100 was exactly the brief's diagnosis.** `n000353`, `n001421`, `n000324` are grid
items refused `containing-block-not-parent`; all three are now answered by `grid-area-fill-width`
from measured area vectors. One BLOCKER cleared on that pair: `offscreen-text-excess-chars`
175 BLOCKER → 70 MAJOR.

**The damage clamp's 150-vs-7,194 ratio is correct conservatism, with one named exception.** 6,231
of the refusals are `no-material-damage`, where a clamp would be a guess. The 363
`containing-block-not-parent` refusals were damaged nodes refused *correctly*, because the clamp's
arithmetic is against the parent's content box while a grid item's containing block is its **area**
— a missing mechanism, not an over-tight predicate. That is now supplied.

**A regression the cycle caught in its own adoption, and cured.** The banded pass initially
published no grid areas, so it moved hobbang's mobile items to the source's exact x while their
frozen truth-widths stayed — taking `/` @768 from MAJOR to **BLOCKER on a new `footer-clipped`**
(clone footer 820 against a 768 viewport). Cured by having the banded pass publish `areas` — per
child, per width, the width of the column it sat in. Counters on hobbang: `gridAreaFill` 155 →
**328**, `container-tracks-not-recovered` 190 → **17**, `containing-block-not-parent` 188 → **15**,
`residualFrozenOmitted` 1370 → **814**.

**Geometry, two-directional, against the flag-OFF baseline:**

| site | axis | compared | improved | worsened | Σ error before → after |
| --- | --- | ---: | ---: | ---: | --- |
| hobbang | width | 34,466 | 4,922 | **12** | 2,001,045 → 1,263,017 (−36.9%) |
| hobbang | x | 34,466 | 2,985 | **110** | 1,633,993 → 676,898 (−58.6%) |
| linear | width | 77,688 | 2,789 | **62** | 2,959,679 → 2,451,862 (−17.2%) |
| linear | x | 77,688 | 3,048 | **44** | 7,680,951 → 6,905,405 (−10.1%) |

hobbang's 12 worsened width rows top out at 22.4px; the 110 worsened x rows are 69 nodes in one
shared footer where a grid item's width error falls 124px → 28px and the residual 28px moves a
wrapping flex list's break point — **reflow discretisation, not a wrong rule.**

**PROTECT held.** `/pricing` @1440 exact (cmr 1392 = 1392, gutter 48 = 48), `/` @1440 exact,
`/pricing` @390 MINOR, hobbang MINOR/MAJOR/MINOR with exact extents and a clean PASS×3 self-check
floor, gs.severance's **entire app tree byte-identical** across all three builds. Suites now
**455/455** layout-safety and 227/227 reconstruction, typecheck 0 — the tree is green again.

**Acceptance still NOT met**: `footer-clipped` 1 → 1 on `/` @1024, `/` @1100 and `/pricing` @1100.

**Carried risk:** `min-width: 0px` trades extent error for in-box overlap — hobbang `/` mobile
`overlap-excess-ratio` goes 0.0333/0.0205/silent → 0.1195/0.1078/0.0876 at 640/700/768, crossing
the 0.10 BLOCKER line at 640 and 700 while curing the BLOCKER at 768. Neither width is in the
acceptance or PROTECT set. Reported rather than hidden.

## The real root cause, and correction cycle 2

Cycle 1's most valuable output was a negative result: **`/` @1024 and @1100 cannot be fixed by any
width mechanism, because the nodes holding the page at 1838px have no measurement to recover
from.** The extent holder `n002162` and the footer overflow root `n002946` carry **no layout-probe
record at all**; `p000001` is the only page in the corpus with `aligned: false`, 927 of 2306
desktop nodes (40.2%) and 100% of its mobile tree unprobed.

I verified the cause directly against the wave's own baseline, and it is a **regression this wave
introduced**:

| observation | p000001 desktop | **p000001 mobile** | p000002 | p000003 | p000004 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `2026-09-04T17-21-07-726Z` (28.7, pre-lane) | 2306 | **2283** | 2230 | 1363 | 364 |
| `2026-09-04T22-34-32-296Z` (28.75, post-lane) | 2291 | **3** | 2230 | 1363 | 364 |

The mobile layout probe for linear `/` collapsed from **2,283 elements to 3**. Every other page on
the site is byte-stable, so it is specific to `p000001` and it appeared inside this wave.
`probeLayout` parks its element list once and measures per width; a parked list surviving as three
handles is what a torn-down DOM looks like.

Correction cycle 2 — the last one — targets this, plus the separate probe→spec alignment failure,
with one explicit constraint: **the fix must not be "turn the scroll improvement back off."** That
change cured a measured defect (seoultone's entire below-fold content captured at `opacity: 0`
because the Observer never scrolled). If the two genuinely conflict, the trade must be quantified
and surfaced, not silently made.

The durable deliverable is the instrumentation: **a 2,283 → 3 collapse survived a full lane, a spec
compile, a reconstruction and a QA run without a single number going red.** Probe coverage and
probe→spec alignment become asserted quantities with a floor, so this class cannot regress
silently again — the failure most likely to bite on a fresh Phase B site.

### The probe regression is isolated to linear `p000001`

Checked directly, 28.7 against 28.75, `layoutProbe` / `layoutProbeMobile` `elementCount`:

| host | page | 28.7 | 28.75 |
| --- | --- | --- | --- |
| gs.severance.healthcare | p000001 | 1674 / 1658 | **1674 / 1658** |
| gs.severance.healthcare | p000002 | 1335 / 1335 | **1335 / 1335** |
| hobbang.net | p000001…p000008 | 852/852, 313/313, 288/288, 318/318, 335/335, 241/241, 304/304, 288/288 | **all identical** |
| linear.app | p000002 / p000003 / p000004 | 2230/2230, 1363/1363, 364/364 | **all identical** |
| linear.app | **p000001** | 2306 / **2283** | 2291 / **3** |

Every page in the corpus is byte-stable except linear `/`. Three consequences:

1. gs.severance.healthcare and hobbang.net **do not need re-observing** — the artifacts are the
   proof they are unaffected — so their closure-canary runs remain valid and only linear.app has
   to be re-run through observe → spec → reconstruct → QA after correction cycle 2.
2. The distinguishing property is **the page, not the site**. linear `/` is the largest and most
   JS-heavy page in the corpus; a root cause that does not explain why a 1,674-element hospital
   homepage and an 852-element blog homepage survive the same code is probably not the root cause.
   That constraint was handed to the lane.
3. It settles the hobbang overlap hypothesis in the negative: hobbang's probe counts never moved,
   so cycle 1's `min-width: 0px` overlap trade at 640/700 is a **genuine mechanism trade, not a
   measurement gap**. Hypothesis raised, tested against artifacts, killed — recorded as a result.

### Correction: the probe collapse was NOT introduced by this wave

I logged the linear `p000001` probe collapse as "a regression this wave introduced," on the strength of
the 28.7 → 28.75 elementCount delta (2283 → 3). Correction cycle 2 disproved that from the artifacts,
and the correction matters because it changes what the defect is:

- `probeLayout` called `page.goto()` and **discarded the response**, so the probe's own load never read
  its HTTP status. A transient upstream error body (`text/plain`, Chrome-wrapped in `<pre>`) was walked
  and recorded as a legitimate 3-element probe. 28.7 B1 had built exactly this gate — but private to
  `observe-page.ts`, covering only the deep load. The pipeline makes **four** loads per URL; the probe's
  two were ungated. Pre-existing, site-side trigger.
- The same `html/body/pre` shape had already hit the **desktop deep observation** of both `p000001` and
  `p000002` in this wave's own pre-lane run `2026-09-04T15-30-50-831Z`, where `rendered.html` preserved
  the body: *"upstream connect error or disconnect/reset before headers…"*. So the wave is exonerated by
  its own earlier artifact, not by argument.
- My asymmetry constraint ("the distinguishing property is the page, not the site") pointed at SPA
  weight. The real distinguishing property is **exposure to a flaky edge**: linear `/` makes ~690
  subresource requests × 4 loads. A useful constraint that named the wrong mechanism.
- The stale-parked-list hypothesis I offered is also dead: `disconnected: 0` at all 16 widths and
  `tags.length === 3` — the collapse is in the walk, before any resize.

Second defect found underneath it: `computeProbeAttachment` matched by **leading index prefix**, so one
element-count difference shifts every position after it — a 1% (23-element) difference discarded 86.5%
of linear `/` mobile. Pre-existing by construction (Task 17 design, Task 26 revision), identical
311/2306 in every run back to 2026-09-03, and already written down verbatim at `tree-switch.ts:701-709`.
Now matched by structural path identity (`tag[nth-of-type]` chain). A diff-with-resync was built and
measured first, then **rejected** because it must guess at divergences and silently shifts sibling boxes.

| | coverage | alignment |
| --- | --- | --- |
| linear p000001 mobile | 3 / 2291 (0.1%) → 100% | 311 (13.5%) → 2261/2263 (0.9991) |
| linear p000001 desktop | 2291 / 2306 → 100% | 1379 (59.8%) → 2291/2291 (`aligned=true`) |
| severance (8 rows) / hobbang (60 rows) | 100% | 100% → 100%, unchanged |

Equal-or-better on all 172 rows, worse on none. `smoke-multi-observer` 318/318, `smoke-sitespec`
474/474, typecheck 0. Pre-fix failure count by revert-in-place: observer 14 failures (including
`walked 3 of 128` — the defect reproduced in-suite), sitespec 1 (`attached 150 of 400`).

Observation `2026-09-05T11-51-47-573Z` · SiteSpec `2026-09-05T12-07-20-025Z`.

### The core-freeze regression was not clean — four suites regressed

The single full regression required at Phase A core freeze (`tmp/wr2875/regression/freeze-run.log`,
36 suites enumerated from disk, per-suite delta against the 28.7 baseline) did **not** come back green.
Against a 28.7 floor of 35 suites / 4,326 checks / **0 failures**:

| suite | result | baseline | status |
| --- | --- | --- | --- |
| `smoke-e2e` | 129/130, 1 failed | 130 | regression |
| `smoke-reconstruction-qa` | 207/211, 4 failed | 211 | regression |
| `smoke-theme` | 40/47, 7 failed | 47 | regression |
| `smoke-visual-editor` | died at check 37 on a Playwright `TimeoutError` | 50 | regression |
| `smoke-responsive-qa` | 349/349 | 205 | **+144** |
| `smoke-sitespec` | 474/474 | 466 | **+8** |
| all others (30) | 0 failures | — | delta +0 |

That is the honest number and it is recorded before any repair. The wave grew two suites substantially
and broke four. Three causes, two of them already established:

1. **`smoke-e2e`** — cycle 2 rewrote probe→node attachment and dropped an exemption the committed
   baseline had: `attachCount: aligned ? elementTags.length : prefixUsable ? prefix : 0` became
   `usable = pairs.length >= PROBE_PREFIX_MIN_ELEMENTS`. The 100-element floor was only ever meant to
   guard *partial prefixes*; applying it to a fully aligned page voids the evidence of any page under
   100 walked elements. The e2e fixture walks 52. **This is not test-only** — a thin legal page, a 404
   or a redirect stub would silently lose 100% of its layout evidence in production while still
   reporting `aligned: true`. No corpus site is small enough to have shown it.
2. **`smoke-theme` + `smoke-reconstruction-qa`** — both cluster on canvas background, and the width
   lane's §CANVAS change (`resolveDocumentRootCanvas()`, root-wins document-canvas propagation) is the
   probable common cause. Handed out as a hypothesis to verify, not a conclusion, with the real
   question being per-check: is the new behaviour correct and the test asserting the old bug, or is the
   canvas change itself incomplete? A test edited under the first answer when the truth was the second
   would bury a product defect.
3. **`smoke-visual-editor`** — a locator timeout at `scripts/smoke-visual-editor.ts:953`. The *same*
   locator succeeds earlier in the same run at line 702, so the likely cause is panel state or timing
   after the Region-panel test rather than a missing slot. Held rather than measured, because three
   concurrent browser suites would make a timeout diagnosis meaningless.

### A gap in my own regression harness, found by this run

`smoke-theme` was recorded as `failures=0` while its trailer plainly said `40/47 checks passed`. The
parser only extracted a failure count from the `N checks, M failures` trailer form and left the
`N/M checks passed` form at zero. I caught the suite through its non-zero exit code, not through the
failures column — meaning the column I built to make the run auditable was itself lying.

Fixed in `tmp/wr2875/orch/run-regression.sh`: the `N/M` form now derives `total - passed`, and every
suite additionally gets an independent count of `FAIL` lines in its own log, with a `fails(log:N)`
annotation whenever the two disagree. Two independent measurements that must agree, rather than one
that can silently read zero.

### The probe-floor fix does not invalidate the closure canary

The fix at `src/sitespec/compile-page.ts:336` (`usable = aligned || pairs.length >= PROBE_PREFIX_MIN_ELEMENTS`)
changes behaviour **only** for aligned pages with fewer than 100 walked elements. For an aligned page at
or above the floor, `usable` was already true and the expression is unchanged.

Measured, rather than assumed — every probe in the three canary observations:

| host | observation | probes | min | max | any under 100 |
| --- | --- | ---: | ---: | ---: | --- |
| linear.app | `2026-09-05T11-51-47-573Z` | 8 | 364 | 2306 | no |
| hobbang.net | `2026-09-04T22-39-01-787Z` | 20 | 241 | 852 | no |
| gs.severance.healthcare | `2026-09-04T22-33-34-567Z` | 4 | 1335 | 1674 | no |

The smallest page anywhere in the corpus walks 241 elements. So no canary reconstruction can change, the
16-pair verdict matrix stands, and the canary is not re-run. This is also precisely why the defect
survived a full wave undetected: the corpus has no page small enough to expose it, and only the
52-element synthetic e2e fixture does.

Verification of the fix itself: typecheck 0 · `smoke-sitespec` 474/474 (no drop) · `smoke-e2e` **130/130**.
Pre-fix failure count by revert-in-place: 129/130 with exactly the one expected check failing, then
restored and confirmed byte-identical by `shasum -a 256`. Direct observation on a 52-element aligned
walk: `attachCount` 0 → **52**, with `structuralPrefix: 52` in both cases — the evidence was being
computed and then thrown away.

### The canvas fallout was mostly a real product defect, not stale tests

The canvas lane's split came out the opposite way on the two suites, which is why the (a)/(b)
classification was made the whole job rather than a formality:

- **`smoke-theme`: 6 of 7 were genuine product defects (b).** §CANVAS moved the root/body background off
  the `.wr-doc-*` wrapper onto `html:has([data-wr-page="pNNNNNN"])`, and the theme layer's stylesheet
  reader never learned that shape — `src/theme/stylesheet.ts:49` classified the new rule as
  `node-scoped`, so canvas ranking (`extract.ts:289`) and binding (`:592`) never saw a canvas at all.
  `color.canvas` disappeared from the adapter (13 tokens instead of 15) and the white canvas was
  rebound as `color.surface.secondary`, displacing the card. Worst of it: `compatibility.ts:24` stopped
  firing `contrast-failure`, so **near-white-on-white silently degraded from `incompatible` to
  `compatible-with-warnings`** — a safety check that had quietly stopped working. Fixed in `src/theme/`
  with a new `document-canvas` rule kind. Only check 6 (a selector allowlist) was a test-side update.
- **`smoke-reconstruction-qa`: 4 of 4 were stale tests (a).** Measured rather than argued: the clone's
  real `<html>` is now `rgb(17, 24, 39)` at all four page/viewport combinations. The "white canvas" named
  in the check's own title *was* the bug being fixed. The **fixture** was changed so the mismatch is
  constructed deliberately (viewport-disagreeing `background-position`, hitting the documented
  `viewports-disagree` refusal) with a promoted page as a positive control; three assertions are
  untouched and one was **strengthened**. Check count still 211.

Negative controls prove neither suite went vacuous: injecting `.card` into every paint group drops theme
to 46/47; neutering `canvasMismatchedProperties` drops rqa to 206/211 — exactly the 4 target checks plus
the unit-level detector. Both mutations reverted, `shasum -c` OK.

Results: typecheck 0 · theme **47/47** · reconstruction-qa **211/211** · downstream theme consumers
`authoring-preview` 41/41 and `release` 275/275.

Three things found and deliberately **not** fixed, because they sit in `src/reconstruction/` under a
spent correction budget — named here so they are not lost:
1. `qa-corrections.ts:178` emits the canvas correction as a **global** `html{…}`, which is exactly the
   multi-route tinting that §CANVAS-2 scoped around everywhere else.
2. `style-generator.ts:302` treats a viewport that paints nothing as *absent* rather than as a
   disagreement, so one viewport's canvas can be guessed onto both.
3. Five source files contain literal NUL bytes (below).

### Literal NUL bytes in five source files — intentional, but a review hazard

`src/theme/extract.ts`, `src/reconstruction/style-generator.ts`, `src/sitespec/validate-sitespec.ts`,
`src/interaction-patterns/build-patterns.ts`, `src/recon-template/assemble.ts`.

They are **correct code**, not corruption — a NUL used as a composite-key delimiter (safe precisely
because it cannot occur in a CSS property or value) and inside a character-class guard, written in the
source as a literal byte rather than as an escape:

    const key = `${occ.property}\0${occ.value}\0${semanticToken ?? ""}\0${preservedKey}`;
    if (/[\0n\0r\0f\00]/.test(value)) return false;

The consequence is not correctness but **reviewability**: git classifies those files as binary, so
`git diff` shows no hunks for them, and `grep` silently returns nothing without `-a`. Two of the five are
`style-generator.ts` and `theme/extract.ts` — among the most-changed files of this wave. Anyone reviewing
this work through `git diff` would see none of it.

I re-ran the genericity check binary-safely because of this, reading every file as bytes rather than
trusting `grep`: across all of `src/`, hostname mentions appear on exactly **2 non-comment lines**
(`src/production/brand-bake.ts:79` and `src/responsive-qa/run.ts:1452`), and both are string literals
inside human-readable evidence messages, not branching logic. The independent architecture auditor's
"no target-host branching" verdict therefore survives a check its own tooling could have silently failed.

Recommended (not applied — not a product blocker, and the budget is spent): write these as `\u0000`
escape sequences rather than literal NUL bytes. Identical runtime behaviour, and the files become
diffable text again.

### An attempted determinism proof that failed, and a trap I set and defused

I wanted to prove — not argue — that the four post-canary repairs left the closure canary's artifacts
valid, by recompiling linear's site-spec with current code and diffing it against the one the canary
consumed. The attempt did not work, and the reason is worth recording.

`compile:sitespec` takes an interaction-patterns file, and the newest one on disk
(`2026-09-04T23-34-13-255Z`) resolves the **pre-cycle-2** observation `2026-09-04T22-34-32-296Z` — the
one with the collapsed `p000001` mobile probe. Correction cycle 2's spec `2026-09-05T12-07-20-025Z`
points at the **new** observation `2026-09-05T11-51-47-573Z` from the same patterns file, so the two
specs are not comparable: mine differs because it read different observation input, not because the
compiler changed. A byte-diff would have measured the wrong thing entirely.

Worse, the recompile wrote `data/linear.app/site-specs/2026-09-05T18-07-32-095Z`, which is now the
**newest site-spec on disk**. Every `newest()` helper in this wave's scripts is `ls -1dt … | head -1`.
That is exactly the failure mode that cost Task 28.6 a full run — a stray artifact silently
substituting itself for the pinned one. I left the directory in place (artifacts are not deleted) and
wrote `DO-NOT-USE.md` inside it naming the authoritative spec, so the trap is visible to anyone who
trips over it.

The claim itself stands on the measurement already made, which does not depend on this: the only
behavioural change in `compile-page.ts` requires a page under 100 walked elements, and the smallest
page anywhere in the corpus walks 241. `src/reconstruction/` was not modified after the canary was
built (checked UTC-correctly — `find -newermt` reads *local* time, and reading the run id as local
initially produced a false list of twelve files). The other post-canary edits are `src/theme/*`
(not used by reconstruction or responsive-QA), `src/reconstruction-qa/qa-page.ts` (a different
pipeline from the `qa:responsive` the canary runs), and test scripts.
