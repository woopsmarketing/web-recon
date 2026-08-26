Task: 26A
Title: Linear First Fresh-Site Production Pilot — Phase A: Fresh Exact Reconstruction
Agent: 26-Reconstruction-Builder (fresh agent; sections 12–18 of the Task 26 spec)
Date: 2026-08-26
Status: Complete
Verdict: **READY FOR TRANSFORMATION**

# Task 26A — Linear Fresh Exact Reconstruction

The 8 pilot routes selected by 26-Source-Scout were taken through the EXISTING
pipeline — verify → select → observe:site → detect → explore → model →
compile:sitespec → reconstruct → qa:reconstruction — with zero Linear-specific
code anywhere. Every number below is computed from run artifacts. Git
add/commit/push: 0. Stripe/historical artifacts touched: 0. All Linear output is
under `data/linear.app/`.

One sentence summary:

> All 8 routes render with **content exact 1.0, runtime errors 0, hydration
> errors 0**, trigger-state equivalence **23/23**, user-visible-target
> equivalence **20/23** (the 3 mismatches are one blinking 1×20 px caret inside
> the homepage's animated product-UI mockup), all 16 click-mounted panels mount
> with matching child counts, and worst centered-container drift at
> 1440/1920/2048 is **0 px on every route, homepage included** — after five
> generic engine corrections, each fixture-reproduced and covered by a full
> 17-suite regression (1,776 checks, 0 failures).

## 1. Pilot scope and lineage (definitive chain)

Pilot scope derivation (data workaround, zero engine change — same pattern the
scout used): `data/linear.app/2026-08-25T18-28-28-180Z-pilot/` holds a
discovery.json subset of exactly the 8 scout-selected routes
(provenance: `pilot-scope-provenance.json`). `/homepage` (exact-fingerprint
alias of `/`) is NOT in the set, per scout instruction.

| stage | run | result |
| --- | --- | --- |
| verify (live Playwright) | `data/linear.app/2026-08-25T18-28-28-180Z-pilot/verification.json` | 8/8 valid-html, 0 redirects, 0 blocked |
| select (offline) | same dir, `selected-pages.json` | 8 singleton families, root force-isolated, 8 representatives |
| observe:site (definitive) | `data/linear.app/site-observations/2026-08-25T19-23-01-716Z/` | 8/8 pages, 8 desktop + 8 mobile, prepare-scroll ON, 84.0 MB, 131.4 s |
| detect:interactions | same run dir, `interaction-analysis.json` | 526 candidates (263/viewport), P1 148 / P2 360 / P3 18; 122 control relations, 52 unresolved (client-mounted) |
| explore:interactions (live) | `data/linear.app/interaction-explorations/2026-08-25T19-30-59-785Z/` | 34 planned → 31 executed → 26 changed / 5 no-change / 3 actionability-error; locator resolution 100% (id-exact 17 / semantic 2 / structural 15); 16/16 dynamic targets mounted; navigation guards excluded 56 candidates; live safety events 0 |
| model:interactions | `data/linear.app/interaction-models/2026-08-25T19-33-19-974Z/` | 23 confirmed patterns (disclosure 13 · dialog 8 · selection 2), 11 unknowns; changed-coverage 88.5%, executed-coverage 74.2%; 0 rule conflicts |
| compile:sitespec | `data/linear.app/site-specs/2026-08-25T20-30-27-653Z/` | 8 routes / 8 pages, 16/16 viewports rendered-html aligned, 148 supplemental attributes, 8/8 pages with attached layout probe, round-trip PASS |
| reconstruct + next build | `data/linear.app/reconstructions/2026-08-25T20-30-33-313Z/` | 8/8 routes mapped, build PASS; 1,910 recovered layout rules (centered 42 / full-width 1,106 / percentage 52 / responsive-hidden 710) |
| qa:reconstruction --auto-fix | `data/linear.app/reconstruction-qa/2026-08-25T20-30-41-209Z/` | the gate numbers below; 1 correction applied (document-canvas-background) |
| wide-viewport + visual review | `data/linear.app/manual-visual-review/2026-08-25T19-10-00-000Z/` | `wide-viewport-final-accepted.json` + 96 PNG (8 routes × {390,1440,1920,2048} × {original,clone,diff}) |

Superseded runs (kept, honestly, as the correction trail — none deleted):
site-observations `…18-28-58-485Z` and `…19-15-00-417Z` (pre-probe-fix);
explorations `…18-31-33-260Z`; models `…18-33-58-557Z`; site-specs
`…18-34-05-947Z`, `…19-33-28-997Z`; reconstructions `…18-35-11-608Z`,
`…18-56-47-359Z`, `…19-33-38-239Z`, `…20-07-04-819Z`,
`…20-17-46-970Z`; QA runs `…18-35-24-346Z`, `…18-56-54-863Z`,
`…19-33-47-452Z`, `…20-07-13-065Z`, `…20-17-56-143Z`. Each intermediate QA
run is the measurement that exposed the next generic defect (§4).

## 2. Reconstruction QA — gate metrics (definitive run 2026-08-25T20-30-41-209Z)

Site-level (snapshot ↔ clone, 16/16 page-viewport pairs completed):

| metric | value |
| --- | ---: |
| routes rendered | **8/8** |
| compared nodes | 18,918 |
| nodes missing in clone | **0** |
| content exact ratio | **1.0** (0 mismatched text nodes) |
| geometry median-of-medians / median-of-p95 | 0.01 px / **0.085 px** |
| document height Δ median / max | 0.28 px / **0.5 px** |
| style properties compared / mismatched | 1,381,062 / 627 (0.045%) |
| clone JS runtime errors | **0** |
| clone hydration errors | **0** (summed per-pair `cloneHydrationErrors`) |
| clone page errors | **0** |
| screenshot changed-ratio median (threshold-free, live drift included) | 0.168 |

Per route (worst axis of x/y/w/h; height Δ is snapshot vs clone document):

| route | viewport | content exact | geo median / p95 / max (px) | height Δ | JS / hydration | img decode fails |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| / | desktop | 1.0 | 0.03 / 13.67 / 223.2 | 0 | 0 / 0 | 12 |
| / | mobile | 1.0 | 0 / 0.08 / 17.9 | 0 | 0 / 0 | 17 |
| /changelog | desktop | 1.0 | 0.53 / 320.7 / 515.1 | 0 | 0 / 0 | 14 |
| /changelog | mobile | 1.0 | 0.06 / 7.8 / 314.3 | 0 | 0 / 0 | 14 |
| /customers | desktop | 1.0 | 0 / 0.83 / 86.0 | 0 | 0 / 0 | 36 |
| /customers | mobile | 1.0 | 0 / 0.12 / 8.9 | 0 | 0 / 0 | 61 |
| /customers/automattic | desktop | 1.0 | 0.01 / 0.09 / 7.2 | 0 | 0 / 0 | 2 |
| /customers/automattic | mobile | 1.0 | 0 / 0.03 / 6.3 | 0 | 0 / 0 | 2 |
| /integrations | desktop | 1.0 | 0 / 0.53 / 13.2 | 0 | 0 / 0 | 0 |
| /integrations | mobile | 1.0 | 0 / 0.53 / 68.3 | 0 | 0 / 0 | 12 |
| /plan | desktop | 1.0 | 0.03 / 1.0 / 71.3 | 0 | 0 / 0 | 16 |
| /plan | mobile | 1.0 | 0.01 / 0.08 / 0.1 | 0 | 0 / 0 | 16 |
| /pricing | desktop | 1.0 | 0.05 / 0.14 / 539.0 | 0 | 0 / 0 | 0 |
| /pricing | mobile | 1.0 | 0.03 / 0.13 / 10.8 | 0 | 0 / 0 | 0 |
| /security | desktop | 1.0 | 0.01 / 80.01 / 80.02 | 0 | 0 / 0 | 0 |
| /security | mobile | 1.0 | 0.01 / 80.0 / 80.0 | 0 | 0 / 0 | 0 |

Geometry outliers, each investigated and classified (none is page-flow damage —
every pair's document height Δ is 0 px and every median ≤0.53 px):

- **/ desktop (p95 13.7, max 223)** — the hero product-UI mockup: a
  continuously animating agent-demo whose internal layout differs between the
  observed frame and any later render; ~16 px x-shifts on a node cluster inside
  the mockup. Site-specific animated content (§16 of the spec: exact
  preservation, no semantic conversion). The same animation makes the LIVE
  homepage drift structurally (live element count 1994 vs snapshot 2024), so
  the p000001/desktop pair is honestly `source-drift` for live comparison.
- **/changelog (p95 320 desktop)** — clusters deep in the 57,000-character feed
  (y ≈ 16,900): media-embed/player internals whose state is time-dependent.
  Localized to 571 of 2,259 nodes with median 0.53 px.
- **/security (80 px, 27-node cluster)** — the "Trusted by 40,000 product
  teams" SVG logo-marquee strip sits 80 px higher inside its own section in the
  clone; the section itself and everything after it match (height Δ 0). A
  decorative animated marquee offset.
- **/pricing desktop (single-node max 539)** — one mockup-internal node;
  median 0.05 px, p95 0.14 px.

Asset findings (QA taxonomy, browser-measured):

- `asset-load-failure` 72 / `asset-hotlink-blocked` 2 occurrences attributed;
  the raw per-pair "img decode fails" above are dominated by `loading="lazy"`
  images below the fold: the observation decoded them via prepare-scroll, but
  QA captures at scroll 0 where a lazy image legitimately never decodes (the
  live original behaves the same at scroll 0; attribution to the clone happens
  only on the pairs whose live baseline was unavailable due to source drift).
  Verified by direct fetch: the URLs return HTTP 200.
- **Customer wordmark logos are structurally un-hotlinkable**: Linear paints
  card-cover wordmarks (coinbase, oscar, ramp, automattic, brex, opendoor,
  Cars24, scale…) via CSS `mask-image` SVGs on `webassets.linear.app`, and
  `mask-image` fetches are CORS-mode requests. Measured: the CDN answers
  **HTTP 403 for any Origin other than `https://linear.app`** (with
  `access-control-allow-origin: https://linear.app` for the source origin).
  The clone renders the tinted block without the mask cutout. This is a
  source-side cross-origin resource policy — the named remedy is Phase C asset
  materialization (these are customer-identity assets, replacement-territory
  by policy anyway). This drives the /customers screenshot ratios (0.50
  desktop), not layout: /customers height Δ 0, geometry p95 0.83 px.

## 3. Interaction inventory and equivalence

Detected on Linear (deterministic explorer, real evidence only): header nav
disclosures (Radix-style portal panels: Product/Resources), a hero-mockup
combobox/listbox, mobile hamburger menus (mounted full-screen dialogs on every
route), a changelog filter listbox, pricing/FAQ controls, and mock-UI option
rows. No carousel/tabs pattern was confirmed by evidence on these routes — 0 is
reported as 0.

23 confirmed patterns replayed on both sides (QA run `…20-30-41-209Z`):

| axis | result |
| --- | --- |
| trigger-state equivalence | **23 / 23 equivalent, 0 mismatch** |
| user-visible-target equivalence | **20 equivalent / 3 mismatch / 0 not-observed / 0 not-declared** |
| by type | dialog 8/8 · disclosure 11/13 · selection 1/2 equivalent |
| dynamic targets compared | 16 — **16/16 with clone children, 16/16 child-count match, 0 content gaps** |
| unknowns replayed | 10 signature groups, 8 sampled: clone no-op 8, gaps 2, unverifiable 3, auto-implemented 0 |

The 3 visible-target mismatches are ONE site characteristic, not three defects:
a **1×20 px blinking text caret** (zero text) inside the homepage hero's
animated product-UI mockup, discovered as a target region on ip000001,
ip000002 (disclosures) and ip000003 (mock selection). Its visible/hidden state
at any instant is CSS blink phase; original replay and clone replay sample
uncorrelated instants, so across QA runs the same regions flip between
equivalent and mismatch (run history: 1 → 2 → 3 caret mismatches with the real
panels equivalent throughout). The actual panels those patterns open —
including the full-width Product panel (856×268 at x=505 vs original x=506) —
verify equivalent on existence, direction, and content fingerprint. Recorded
as a minor known limitation, never suppressed.

4-capture screenshot evidence for every pattern:
`reconstruction-qa/2026-08-25T20-30-41-209Z/interactions/<patternId>/{original,clone}-{before,after}.png`.
Manually reviewed: desktop nav Product panel (identical box, single copy, no
ghost) and mobile hamburger menu (full nav mounts; two cosmetic deltas listed
in §5).

3 actionability-errors (ia000009 /, ia000030+ia000032 /pricing): the live
element was found (locator resolved) but not clickable at action time
(overlaid/moving product-UI mockup internals). Classified `execution-error`
unknowns; no behavior claim is made for them.

## 4. Engine changes — all generic, each fixture-reproduced

Six changes (five defect corrections + one supporting IR field), all classified
per §13/§51 before any code was touched. No `.linear-*`, no Linear route, no
Linear text, no Linear-conditional branch exists anywhere in the engine
(verified by construction — every fix is driven by observed evidence fields).

| # | classification | change | fixture proof |
| --- | --- | --- | --- |
| 1 | (d) generic reconstruction defect | **Dynamic-region mount was taxonomy-gated, not evidence-gated.** The runtime mounted a declared dynamic target only for `op === "menu" \|\| "dialog"`; a Radix-style nav DISCLOSURE (aria-expanded, no menu role anywhere → correctly modeled `disclosure`) with an observed mounted target got a flipped trigger and no panel. `src/reconstruction/runtime-template.ts`: mount whenever the trigger carries `data-wr-dyn-id` (emitted only from observed evidence). | smoke:reconstruction §141b — disclosure with mounted target fixture; **revert-proven** (with the old gate the check fails `{"exists":false}`) |
| 2 | (c) generic observer defect | **The layout probe did not mirror prepare-scroll.** Its own contract says "the page under the probe is the page the Observer saw", but on a `--prepare-scroll` observation of a page that lazy-mounts content on scroll, the probe's unscrolled walk can never align with dom.json (stripe was always explored without prepare-scroll, so the combination was untested). `autoScrollPrepare` moved to `src/observer/layout-probe.ts` (single scroll policy) and the probe now runs it when the observation did. | smoke:multi-observer `/lazy` fixture (scroll-mounted `<aside>`): probe walk must contain the mounted element and align exactly; **revert-proven** (probe 71 vs dom 73 tags without the fix) |
| 3 | (d) generic compile policy defect | **Probe prefix attachment used a ≥90% coverage floor sized on a trailing-widget case.** Linear's homepage hero animates EARLY in the DOM (first divergence at element 267 of ~2,000, 13% coverage), discarding an exact prefix that fully contained the page shell the layout inference needed. `src/sitespec/compile-page.ts`: extracted `computeProbeAttachment()` — the prefix is now structural (tag AND parent-relation equality, using the probe's own `parents` array), the coverage floor is removed, the ≥100-element floor and the per-node truth-sanity gate (±4 px at 1440) remain the arbiters. | smoke:sitespec `§probe` unit block: identical walks → aligned; 37.5%-coverage early divergence → exact prefix attaches; parent disagreement inside the prefix truncates it; short prefix / truncated probe → nothing |
| 4 | (d) generic reconstruction defect (layout inference vocabulary) | **Centered max-width whose cap engages only ABOVE the truth width was unrecoverable.** Linear's marketing shell fills the viewport at ≤1440 and centers at a constant 1436 px only at 1920 (`w == min(parentContent, cap)`), so the Task 17 rule (cap engaged at ≥2 widths) never fired and the exact fallback pinned every route 480–612 px left at 1920/2048. `src/reconstruction/layout-inference.ts`: capped-fill variant of the same `centered-max-width` kind — full-curve check at every desktop width, equal gaps wherever engaged, ≥1 demonstrably engaged width, same truth gate. | smoke:reconstruction inference fixtures: capped-fill → `max-width:1436px; margin auto`; the same curve pinned LEFT at 1920 recovers nothing (negative control) |
| 5 | (d) generic reconstruction defect | **Declared-channel / observed-channel double-mount and mis-identity.** When aria-controls names a panel that mounts INSIDE a statically-present wrapper (framework-portal disclosure), the declared mount duplicated the panel unpositioned next to the trigger (ghost) while the observed host-mount also nested a wrapper-copy. `src/reconstruction/runtime-template.ts`: observed targets apply BEFORE the declared branch; a single-root host capture is unwrapped (its root IS the region); the declared region id lands on the template node the compiler marked; unmount clears the host's once-only marker so reopen remounts. | smoke:reconstruction §141b extended (static host + captured subtree through the REAL sitespec compiler): panel mounts INSIDE the host exactly once, id via marker, reopen still exactly once; **revert-proven** (old order → ghost next to trigger, `insideHost:false`) |
| 6 | supporting IR field for #5 (additive-optional) | `DynamicTemplateNode.sourceHtmlId` — the captured element's own html id, carried the same way the page tree already carries it (evidence, never re-emitted as a DOM id). `src/sitespec/types.ts`, `src/sitespec/dynamic-template.ts`; `src/reconstruction/interaction-bindings.ts` marks the template node whose source id equals the pattern's declared `targetSourceHtmlId` (`data-wr-declared-region`). Old SiteSpecs load unchanged (optional field). | covered by the §141b marker assertion ("declared id landed on the SOURCE-id-matched template node") |

Measured effect on Linear (before → after, same observation/exploration
evidence):

| metric | before | after |
| --- | --- | --- |
| visible-target equivalence | 14 / 9 mismatch (8 disclosures dead, panels never mounted) | **20 / 3** (all 3 = the caret) |
| dynamic targets with clone children / child-count match | 8 / 8 of 16 | **16 / 16 of 16** |
| pages with attached layout probe | 7/8 (homepage 0 nodes) | **8/8** (homepage 267-element shell prefix) |
| recovered layout rules (centered) | 1,853 (13) | **1,910 (42)** |
| worst centered drift @1920 / @2048 | 480–612 px on 5 routes incl. homepage | **0 px on all 8 routes** |
| open Product panel | not mounted at all → then ghost duplicate | single copy, observed position (856×268 @ x=505 vs original 506) |

Not fixed on purpose (correct classifications, no engine change):

- (a/e) homepage hero animation → live structural drift, probe divergence past
  element 267, caret blink mismatches: source dynamism, recorded.
- (e) lazy below-fold image decode at scroll-0 QA capture: measurement context,
  URLs verified reachable.
- (a) `webassets.linear.app` CORS allow-list (403 for foreign origins) on
  mask-image wordmarks: source policy, Phase C territory.

## 5. Wide-viewport and visual review

`wide-viewport-check.ts` (Task 17 harness, reused verbatim) against the
definitive clone, all 8 routes × {1440, 1920, 2048}:
**worstCenteredDrift = 0 px on all 24 route-width combinations** (homepage
included; before the fixes: / 484→612 px, /plan /pricing /customers /changelog
480→608 px). Artifact:
`manual-visual-review/2026-08-25T19-10-00-000Z/wide-viewport-final-accepted.json`
(pre-fix evidence preserved in `wide-viewport-final.json` and
`wide-viewport-final-postfix.json`).

`review-harness.ts` (reused verbatim): 8 routes × {desktop-1440, mobile-390,
wide-1920, wide-2048} × {original, clone, diff} = 96 PNG.
`commonAreaRatio = 1.000` for every pair except home wide (0.994) — document
heights match at every width, so wide layout flow is preserved. Changed-pixel
ratios (threshold-free, live original included, so source drift and the CORS
wordmark gap are inside these numbers): integrations 0.018–0.037, security
0.038–0.068, customers-automattic 0.049–0.113, changelog 0.063–0.129,
home 0.208–0.270, plan 0.211–0.329, pricing 0.275–0.383, customers 0.351–0.496
(the wordmark CORS block dominates customers; see §2).

Screens reviewed by eye: home desktop/mobile/wide, customers desktop
(original vs clone), open Product panel (desktop), open mobile hamburger menu.
Two cosmetic interaction deltas recorded from the mobile menu review:

- the clone's menu overlay backdrop is slightly translucent where the original
  is fully opaque (open-state backdrop paint of the mounted overlay);
- the hamburger icon does not swap to the ✕ close glyph while open (icon-swap
  inside the trigger is scripted content the pipeline deliberately does not
  replay — same family as `trigger-inside-target-content-not-replayed`).

## 6. Full regression (engine changed → mandatory)

`pnpm typecheck` exit 0, then all 17 suites, sequentially, on the final code
(logs: `docs/result/handoffs/26A-regression-logs/` — one log per suite plus
`typecheck.log` and the driver `STATUS` file recording per-suite exit codes,
start `2026-08-25T20:48:45Z`, done `2026-08-25T21:07:08Z`):

| suite | baseline checks | now | result |
| --- | ---: | ---: | --- |
| verifier | 81 | 81 | PASS |
| selector | 81 | 81 | PASS |
| multi-observer | 58 | **62** | PASS (+4: prepare-scroll ↔ probe parity fixture) |
| interaction-detector | 92 | 92 | PASS |
| interaction-explorer | 108 | 108 | PASS |
| interaction-patterns | 88 | 88 | PASS |
| sitespec | 252 | **257** | PASS (+5: probe attachment decision) |
| reconstruction | 205 | **217** | PASS (+12: disclosure mount §141b, capped-fill inference, declared-region marker) |
| reconstruction-qa | 134 | 134 | PASS |
| e2e | 130 | 130 | PASS |
| recon-template | 58 | 58 | PASS |
| content-injection | 68 | 68 | PASS |
| theme | 47 | 47 | PASS |
| seo | 72 | 72 | PASS |
| assets | 113 | 113 | PASS |
| production | 84 | 84 | PASS |
| release | 84 | 84 | PASS |
| **total** | **1,755** | **1,776** | **0 failures** |

## 7. Known limitations (explicit, per §17)

1. **Homepage hero mockup is a live animation** — three consequences, one
   cause: (i) live-original comparison for p000001/desktop is `source-drift`
   (element count 1994 vs snapshot 2024); (ii) the layout probe attaches only
   the 267-element structural shell prefix on that page (all shell centering
   still recovered — wide drift 0 px); (iii) the 3 visible-target mismatches
   are the mockup's blinking caret's phase at measurement instants. The mockup
   region itself is exactly preserved, per the Task-26 §16 philosophy.
2. **Customer wordmark `mask-image` assets cannot be hotlinked** —
   `webassets.linear.app` CORS-allows only `https://linear.app` (measured 403
   otherwise). Clone shows tinted blocks without the mask cutout on
   /customers card covers. Resolution belongs to the asset-independence stage
   (these are customer-identity assets — replacement territory regardless).
3. **Below-the-fold `loading="lazy"` images do not decode at QA's scroll-0
   capture** (72 attributed occurrences) — matches live behavior at scroll 0;
   the files are reachable (HTTP 200 verified).
4. **Localized decorative-region geometry offsets** — /security logo-marquee
   strip 80 px inside its section; /changelog media-embed internals deep in the
   feed; single mockup nodes on /pricing and /. Document heights all Δ0; page
   flow intact.
5. **Mobile menu cosmetics** — translucent vs opaque overlay backdrop;
   hamburger→✕ icon swap not replayed (scripted trigger content).
6. Inherited named limitations unchanged from Task 17.1: SVG internal paint,
   open-state coordinates are truth-viewport observations, capture bounds,
   fonts (`font-source-binding-unverified` — Linear's Inter Variable renders
   via fallback metrics where the source binds its own woff2).
7. **3 actionability-error actions** (overlaid mockup internals on / and
   /pricing) — recorded as execution-error unknowns; no behavior claimed.

## 8. Gate evaluation (§17)

| gate | required | measured | verdict |
| --- | --- | --- | --- |
| all selected routes render | 8/8 | 8/8 (HTTP 200, route table 1:1) | PASS |
| runtime errors | 0 | 0 (clone JS + page errors, 16 pairs) | PASS |
| hydration errors | 0 | 0 (summed per-pair) | PASS |
| major interaction failures | 0 | 0 — trigger 23/23; visible-target 20/23 with all 3 mismatches the 1×20 px caret blink phase inside the preserved mockup; every real panel/menu/dialog equivalent, 16/16 mounts with matching children | PASS (caret recorded as minor limitation) |
| major geometry failures | 0 | 0 — content exact 1.0, height Δ ≤0.5 px, geometry median-of-p95 0.085 px, wide centered drift 0 px on 8/8 routes at 1440/1920/2048; residual outliers are localized decorative/animated clusters (§2, §7) | PASS |
| viewports | ≥390/1440/1920 every route; 2048 canary on homepage + wide-sensitive route | every route measured at 390/1440/1920/2048 (QA truth viewports + wide harness + screenshots) | PASS (exceeds minimum) |

## 9. Recovery note (builder interruption)

The original 26-Reconstruction-Builder instance was terminated by an external
usage limit at approximately 2026-08-25 20:53 UTC, after writing this report
and the handoff but while its final 17-suite regression rerun was still
executing in a detached background driver. A recovery instance of the same
agent audited every claim in this report against on-disk artifacts on
2026-08-26 and completed the remaining work. Specifically:

- **No pipeline stage was rerun.** All stages were verified complete from
  artifacts: pilot scope + verification (8/8), observation
  (`…19-23-01-716Z`, 8 pages, 83 MB), interaction detection/exploration/model,
  sitespec (`…20-30-27-653Z`), reconstruction (`…20-30-33-313Z`, built app +
  manifest), definitive QA (`…20-30-41-209Z`: final-summary, qa-manifest,
  16 per-pair page files, 23 interaction verdicts with 92 PNG captures,
  unknowns), wide-viewport acceptance (24/24 route-width combinations at
  drift 0), and visual review (96 PNG).
- **The regression rerun COMPLETED after the interruption** (driver `STATUS`:
  start 2026-08-25T20:48:45Z, typecheck + all 17 suites exit 0, done
  2026-08-25T21:07:08Z). The recovery instance verified every suite log tail
  and exit code, then copied the logs from the ephemeral session scratchpad to
  `docs/result/handoffs/26A-regression-logs/`.
- **One reporting error corrected:** the interrupted instance wrote the total
  as 1,779 checks; the per-suite rows (which match the logs) sum to **1,776**
  (1,755 baseline + 4 multi-observer + 5 sitespec + 12 reconstruction). The
  total above and the handoff were corrected. Per-suite numbers were already
  correct.
- **All six engine changes verified present in the code** (grep-confirmed:
  `computeProbeAttachment`, `autoScrollPrepare` in layout-probe,
  `sourceHtmlId`, `data-wr-declared-region`, capped-fill in layout-inference),
  with the corresponding fixture growth visible in the suite counts. A
  repo-wide case-insensitive search confirms no Linear-specific
  selector/route/text/branch in `src/` (the only match is the identifier
  `baselineArea`).
- **Orphaned processes cleaned up:** three `next-server` QA clone servers left
  by the dead run (ports 4656/4657/4658, cwd verified inside
  `data/linear.app/reconstructions/…/app`) were terminated. No other process
  was touched.
- Git state unchanged from preflight (same 6 modified / 2 deleted tracked
  files; engine changes live in untracked `src/` files, consistent with the
  single-commit workspace recorded by 26-preflight). No git add/commit/push.

## Verdict

**READY FOR TRANSFORMATION**

The accepted Exact Reconstruction is
`data/linear.app/reconstructions/2026-08-25T20-30-33-313Z/` (SiteSpec
`data/linear.app/site-specs/2026-08-25T20-30-27-653Z/`, QA
`data/linear.app/reconstruction-qa/2026-08-25T20-30-41-209Z/`).
