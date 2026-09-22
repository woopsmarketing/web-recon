# Task 28.6 — Engine Defect Ledger

Single source of truth for every defect proven by measurement during 28.6, with its assignment
state. A defect leaves this ledger only when a fresh independent verifier confirms the fix, or
when a measurement refutes the defect. Nothing is closed on a builder's own say-so.

Status values: `PROVEN` (measured, unassigned) / `ASSIGNED` (a lane owns it now) /
`FIXED-UNVERIFIED` (builder claims done, no independent confirmation) / `CLOSED` (verifier
confirmed) / `REFUTED` (measurement showed the defect does not exist) /
`WONTFIX-PROVEN-HARMFUL` (a fix was attempted and measured worse).

---

## A. Reconstruction engine

### A1. `hiddenRanges` off-by-one inverts the responsive band
- **Status:** CLOSED (Wave 2 RECON; verifier reproduced 83/586/586/83 becoming 586/586/586/83 independently and could not falsify it)
- **Where:** `src/reconstruction/layout-inference.ts:661-684`
- **What:** When the hidden sample is the lowest desktop probe entry, `start` is set to the
  observation width itself instead of a midpoint below it. The emitted band therefore runs
  *upward* from the observation. The rule hides the node across a range where it was observed
  visible and leaves it visible where it was observed hidden.
- **Proof:** 503 nodes on linear.app `/pricing`. Rendered boundary counts: 21 hidden at 1023,
  524 at 1024, 524 at 1231, 21 at 1232. Exactly inverted about the observed sample.

### A2. `width:auto` is intrinsic sizing, not stretch
- **Status:** CLOSED (Wave 2 RECON; 909 stretch / 44 fill-percentage / 38 counted refusals; rejectedByTruthCheck 5 to 0; per-node rect diff at 1440 and 1920 across 8 pages found zero collateral movement)
- **Where:** `src/reconstruction/layout-inference.ts:482`, `:560` (centered-max-width), `:586` (full-width)
- **What:** Three rule kinds emit `width:auto`, which resolves to max-content, not to the
  stretch behaviour the observation recorded. The shipped build is correct only by accident:
  frozen descendants prop up max-content (77 + 1282 + 77 = 1436, which happens to equal the
  element's own max-width). Latent today; detonates the moment any descendant is unfrozen.
- **Proof:** Program A. The naive swap is also wrong: setting `width:100%` on a genuinely-stretch
  anchor collapsed its container to 742px. The fix must be bidirectional and evidence-keyed.

### A3. No active-range verification; banded rules ship unchecked
- **Status:** CLOSED (Wave 2 RECON + Wave 3 RECON-C; acceptedUnchecked 738 to 0, and independent discrimination 233/738 to 738/738 at zero extra renders)
- **Where:** `src/reconstruction/layout-truth-check.ts`, `isAcceptedUnchecked()`, doc comment at `:328-333`
- **What:** The truth check renders at `TRUTH_WIDTH` 1440 only, and exempts every
  `responsive-hidden` rule carrying a media band. The doc comment claims such rules ship without a
  render because that is "a proof, not an exemption."
- **Proof:** The claim is false. A rule generated for the band 1024-1232 is not verified by
  rendering at 1440, where it does not apply at all. This exemption is exactly what let A1 ship
  503 inverted rules through a green truth check. **This is a fake-coverage defect**: the gate
  reported PASS on rules it never looked at.

### A4. Transitive descendant unfreeze
- **Status:** WONTFIX-PROVEN-HARMFUL. Must never be built.
- **Proof:** Program A measured it targeting probe-invariant nodes: a 32px track became 6px, a
  1px hairline became 1183px, overlapping-element count went 1 to 17.

### A5. No recovery kind for grid tracks; `containingBlockGuard` refuses grid items
- **Status:** BUILT, REFUSES ON LINEAR FOR WANT OF DATA (Wave 3 RECON-C). 23 rules emitted, 413 refused across 17 named reasons, all 23 truth-checked. On /pricing 1 of 58 containers refuses container-width-constant and 57 refuse tracks-not-reproducible-at-every-width because their children are hidden at 1024 and the next probe sample is 1440. The containingBlockGuard relaxation was built, measured net-negative (100 nodes moved up to 2px away from observed, overflow byte-identical) and reverted. Root cause is A7, not this kind.
- **What:** 71 guard refusals on grid items, and no rule kind can express a grid track. The
  Linear `/pricing` root cause is a grid-template-columns switch, so this is the last mile of
  that specific defect.

### A6. The responsive-QA instrument under-reports defects (FAILED independent audit)
- **Status:** ASSIGNED (Wave 4a, INSTRUMENT lane — the highest-priority lane in the task)
- **Why it outranks everything:** this subsystem grades the Linear closure gate and all six pilots.
  Every defect found points the same way — it under-reports — which for a gate is the false-pass direction.
- **The primary BLOCKER channel has three wrong-value paths**, `src/responsive-qa/correspondence.ts`
  around `:298-325`: the numerator sums unique truncated keys against an all-occurrences denominator
  (up to 40x understated); `missingChars += candidate.length` uses the 120-char truncated key (8.3x on
  a 1,000-char paragraph); and `haystack.indexOf` matches across token boundaries, so the source token
  `US` reads present because the clone contains `customers`. **That third path is why the channel
  reported 0.00% missing text on the exact pair where the clone drops the `US` prefix from `US$10`** —
  a number Wave 2 had cited as proof that only the pixel channel could see the defect.
- **The trust gate is inverted on the pair its headline rests on:** `:238-243` divides a numerator
  containing pass-3 structural matches by a denominator of content-keyed leaves only. `/`@700 reports
  0.3841 against a true 0.3374 and a 0.35 threshold. The `min(1, …)` cap fires silently on 4 of 10 pairs.
- **The pixel threshold is uncalibrated against ink:** erasing the whole page to its background yields
  residual 0.0284, so the 1% MINOR threshold equals 35.2% of all non-background ink; a full-width
  1440x400 band of erased content reads 0.0032 and is silent.
- **Zero automated coverage:** nothing imports the subsystem except its CLI.

### A7. Probe widths are a fixed global list that knows nothing about the site
- **Status:** FIXED (Wave 6b RECON-D + OBS-D). The fix introduced A8, closed in Wave 8; site grades re-measured in Wave 8.
- **What:** `LAYOUT_PROBE_WIDTHS` is fixed, and the engine builds every responsive band edge as the
  MIDPOINT of two adjacent probe samples. So sample placement sets how wrong every band edge can be.
- **Proof, defect 1:** Linear `/pricing` rows ship with `(max-width: 1231.98px)`. 1232 is
  `floor((1024+1440)/2)`. The source's authored breakpoint is 1024/1025. **The clone hides the
  comparison table across 1025-1231 where the source shows it**, and the responsive QA harness
  independently graded `/pricing`@1100 a BLOCKER whose missing-text samples are comparison-table cell
  strings ("multiple tenants", "google + saml", "15 pipelines", "5 levels", "1 level").
- **Proof, defect 2:** 57 grid containers refuse track recovery because no sampled width has the
  children visible AND the container width differing.
- **Root of both:** the 28.5B spec probed `[390, 768, 1024, 1440, 1920]` — no 1100, no 700, no mobile
  probe. The `authoredBreakpoints` histogram exists precisely so band edges can land where the site
  authored its change; it was built in Wave 2 and never wired to the band builder.


### A8. Derived probe widths evict a width a downstream pass hard-requires
- **Status:** CLOSED (Wave 8 O3.1). Full write-up: `docs/result/28.6/07-o31-probe-width-eviction-fix.md`.
- **What:** the A7 fix (Wave 6b O3) made floor widths evictable, protected only by POSITION
  (`pickGuaranteedFloor`, `src/observer/probe-widths.ts:174`). Evenly spaced indices over the 7-width
  desktop floor give `[390, 1024, 1920]`, so **1440 — the desktop observation width, which
  `src/reconstruction/layout-inference.ts:1668` hard-requires — was evictable.**
- **Proof:** 4 of 7 Wave 7 pilots (linear.app, seoultone.kr, xn--ok0b408a79cba430b.net,
  interiorteacher.com). Linear 4/4 pages: `floorWidthsEvicted [700,768,1100,1440]`, `capHit true`,
  manifest `viewportPassRefusals {"desktop:truth-width-not-probed": 4}`, generated `globals.css`
  recovered block 1006 rules **all mobile, 0 desktop** (pre-O3 baseline: 1135, all desktop).
  Second-order: with 768 also evicted the tree switch landed at 1025, so 700 AND 1024 served the
  390-observed DOM and `nav-link-ratio 3 of 6` became the deciding BLOCKER at 1024 on all 4 routes.
- **Fix:** optional `requiredWidths` on `DeriveProbeWidthsInput`, unioned into the guaranteed core.
  The CALLER names what it needs — `observe-page` passes each pass its own live profile width — so
  no pixel value is written into the derivation. Cost measured at exactly one authored bracket
  (13 -> 12 adopted) under the worst pressure shape; cap never broken.
- **Coverage:** 6 permanent checks in `scripts/smoke-multi-observer.ts`, including a
  reproduce-the-regression-first check (a two-fresh-widths tally can only reach 3 evictions and would
  have hidden this) and a source-text check that `observe-page` actually WIRES the field — a passing
  unit test on the derivation alone would have been fake coverage.

### A9. A REFUSED recovery ships the exact tier's frozen px, and nothing checks it at any other width
- **Status:** PROVEN (Wave 8 diagnosis, independent fresh-context lane). **This is the top-ranked
  open defect.** Not yet fixed.
- **The finding that inverts a program assumption:** "a refusal is always acceptable, a wrong value
  never is" does NOT hold here. The exact-computed tier already carries a used value recovered at
  1440. When recovery refuses to emit a rule, that frozen px is what ships. **Declining to emit IS
  shipping a wrong value.** The truth check cannot see it, because the check is rule-scoped
  (`layout-truth-check.ts:880-911` walks rules) and the frozen px lives in nodes that carry no rule.
- **Second blindness:** `layout-truth-check.ts:811-813` renders each variant at ONE width — its own
  observed width. `224px x 6` IS correct at 1440. Every rule on the failing chain passes honestly at
  the only width anyone renders. Measured gate activity: linear `rejectedByTruthCheck` 2 of 1699;
  wix-idn 0 of 341. The gate essentially never fires.
- **Proof, exact arithmetic:** linear.app `/pricing`,`/security`,`/changelog` @1100 — clone footer
  right edge **1390** = `padding-left 46 + 6 x 224`, from a frozen `grid-template-columns:
  224px x6` on `n001467` that recovery refused with `child-count-not-multiple-of-tracks` (10 element
  children over 6 tracks: one is a `display:none` child, one is a 672px spanning row). linear `/`
  @1100 — **1438** = `margin-left 2 + width 1436` on `n002745`, which received no recovered rule at
  all. Both reproduce to the pixel.
- **Population, linear's 4 desktop pages (6,196 element nodes):** 97 grid containers carry >=2 all-px
  frozen tracks and **30 ship the freeze**; 4,567 nodes carry a frozen px `width` and **3,736 get no
  width rule**. `gridTrackRefusalsByReason`: container-width-constant 199, no-computed-tracks 124,
  child-count-not-multiple-of-tracks 32, children-do-not-tile-tracks 14, no-probe 34, tracks-not-px 6,
  tracks-not-reproducible-at-every-width 4 (413 refused vs 70 emitted).
  seoultone.kr is the same class: 47 exact-tier tokens carry `width: 1296px`, and `1296px` occurs
  **zero** times in the recovered block.
- **Distinct from A2** — checked, not assumed. A2's fix is present and working (`widthModeStretch
  1389`; the 1,387 shipped `width: auto` declarations are the CORRECT stretch emission). Under A2
  these containers would stay at max-content 1436 at every viewport; measured, `n001466` narrows to
  1100 correctly. The unfreezing works. What fails is that the tracks INSIDE stayed frozen.
- **Proposed fix, in this order:**
  1. `layout-truth-check.ts:verifyLayoutRules` — a **node-scoped residual-freeze audit**: render each
     page at every desktop probe width (the banded path already renders 9 extra widths) and compare
     EVERY node holding probe arrays against `probe.x/probe.w`. Report `residualFrozenNodes`.
     **Reporting only — must NOT become a gate.** Refusing `width:auto` on `n001467` would leave the
     container at 1436 and make the clipping WORSE (290px overhang traded for 336px).
  2. `layout-inference.ts:recoverGridTracks` :1383-1432 — teach it **spans and hidden children**:
     skip children invisible at the truth width, allow a child to match a RUN of k consecutive tracks,
     require every track covered equally. Addressable population 46 of 413 refusals on linear
     (`child-count-not-multiple-of-tracks 32` + `children-do-not-tile-tracks 14`). Refuses nothing that
     ships today — it converts refusals into normally-gated candidates. Worked case: linear's footer
     becomes `repeat(6, minmax(0, 1fr))` and its right edge lands at 1100.
  3. Cheap and high-leverage for every future instance: `LayoutInferenceCounters`
     (`layout-inference.ts:341`) records refusals as aggregate histograms with **no node
     attribution**, so "why did node X ship frozen" is unanswerable from artifacts. Add a bounded
     per-node refusal log (top N by frozen-vs-observed px delta).

### A10. `prepareScroll` defaulted OFF in the observer while the grading instrument always scrolls
- **Status:** FIXED (Wave 8 RC2). Verified by 5 permanent checks in `scripts/smoke-responsive-qa.ts`
  (`testRevealPolicyAgreement`, source-text cross-module assertion), suite 120/120.
- **What:** `observe-page.ts` defaulted `prepareScroll` to `false`; `responsive-qa/capture.ts:353`
  calls `scrollThroughPage` unconditionally. So the clone was BUILT from a pre-reveal instant and
  GRADED against a revealed source, and every entrance animation holding its element at `opacity: 0`
  until scrolled into view was baked into the clone as a permanent `opacity: 0`.
- **Proof:** www.xn--ok0b408a79cba430b.net, page `p000005` node `e000222` (footer social-icon
  container), two observation runs differing only in this flag — identical 124x22 box at y=1887.56,
  opacity **1** with the scroll and **0** without. 136 of 6,144 shared nodes flip; baked `opacity: 0`
  classes 23 -> 38; its four `<img>` children are byte-identical and killed purely by the ancestor.
  linear `/pricing`: 56 image nodes suppressed the same way in BOTH variant trees.
- **Fix:** default flipped to `true` in `observe-page.ts`, `multi-observer/observe-selected-pages.ts`
  and all three observe CLIs, which gain `--no-prepare-scroll` so defect B4's other instant stays
  capturable.
- **Known residual:** the two-instant verify gate (read opacity before AND after the scroll; refuse to
  bake when they disagree, rather than freezing either instant) is the correct end state and is NOT
  built. B4 (re-hide animations left blank by a scroll that returns to top) is unchanged by this.

### A11. `overlap-excess-ratio` cannot tell a layout collapse from a duplicated element
- **Status:** PROVEN (Wave 8). Instrument defect. Not fixed.
- **What:** the channel reports "visible boxes overlap over N% more of the viewport than the source's
  do", which reads as a layout failure. On www.xn--ok0b408a79cba430b.net `/` it is the leading
  BLOCKER on 5 of 5 pairs at 24.57%, and the actual cause is two `<img>` sharing one style token,
  both `position:absolute; top:0; left:0` in the same containing block — a Wix `<picture>`
  placeholder/full-res crossfade with BOTH layers captured at `opacity: 1` — rendering as broken-image
  placeholders because the assets fail to load. `266 x 199.5 = 53,067` per pair x 6 pairs = 318,402px2,
  **unchanged at 390/700/1024/1100/1440**; only the ratio moves, because it divides by viewport area.
- **It misdirected a diagnosis.** A lane read the wording and concluded `recoverGridTracks` was
  emitting overlapping grid tracks. Every `grid-template-columns` wix ships is a single-column
  `minmax(0, 1fr)`, which cannot overlap siblings horizontally. See E4.
- **Proposed fix:** (a) report `aKey === bKey` pairs under a separate channel (duplicate-element
  stacking, not layout overlap); (b) stop letting leaves whose image resource failed to load inflate
  overlap — `image-presence-ratio` already names that defect correctly, so the overlap is derivative
  double-counting. Removes zero real defects.

### A12. One site-wide tree-switch breakpoint, where a real site's pages disagree
- **Status:** PROVEN (Wave 8). Architectural. Not fixed.
- **What:** `route-map.json` carries ONE `breakpoint` for the whole site, and only two DOM trees
  exist (observed at 390 and 1440). linear's pages disagree about where the switch belongs:
  `/` changes between 390 and 700 (93 -> 255 images), `/pricing` between 1024 and 1100 (95 -> 262).
  `rankTreeSwitchCandidates` (`tree-switch.ts:387-404`) picks 1025 — right for `/pricing` and
  `/changelog`, wrong for `/`. No single value can be right; the ranker is not the defect.
- **Consequence, measured:** at 1024 the clone serves linear's 390px mobile snapshot. Clone
  `scrollHeight` is byte-identical at 390/700/1024 (5876) and at 1100/1440 (9960) — two states, no
  continuum — while the source varies continuously 5876/9587/10131/9710/9960. This is what produces
  the `nav-link-ratio 3 of 6` BLOCKER at 1024 on 3 routes and 2 of the 13 `image-presence-ratio`
  BLOCKERs. Confirmed visually: source at 1024 shows the full desktop header (6 links); the clone
  shows the collapsed mobile header.
- **`nav-link-ratio` is NOT the defect.** It already exempts a source that has itself collapsed
  (`NAV_LINK_MIN_SOURCE_LINKS = 3`, `classify.ts:382-393`); here the source shows 6, so it fires
  correctly. Fixing the channel would be treating the symptom.
- **Proposed fix:** make the tree switch PER-ROUTE, not per-site (`chooseTreeSwitch` already holds
  per-page `measureObservedChange` data and aggregates it away), and REFUSE with a recorded
  limitation `variant-tree-not-observed-at-<px>` where a page changes at a width neither observed
  tree covers — rather than silently serving the 390px tree at 1024px.

### A13. The mobile probe's width envelope cannot reach the tree switch
- **Status:** PROVEN (Wave 8). Not fixed.
- **What:** `MOBILE_LAYOUT_PROBE_WIDTHS` tops out at 914 (`types.ts:1837`), but the mobile tree is
  the tree actually rendered up to the switch. **5 of 7 pilots have an unobserved band:**

  | site | switch | mobile ceiling | unobserved |
  |---|---|---|---|
  | seoultone.kr | 1025 | 914 | 915-1024 |
  | gs.severance.healthcare | 1025 | 914 | 915-1024 |
  | linear.app | 1025 | 914 | 915-1024 |
  | interiorteacher.com | 1280 | 914 | 915-1279 |
  | interiorbay.co.kr | 915 | 914 | 915 (1px, low-confidence fallback) |
  | hobbang.net | 768 | 914 | none |
  | www.xn--ok0b408a79cba430b.net | 481 | 914 | none |
- **Why it is not simply a constant to raise:** the switch is inferred DOWNSTREAM, in reconstruction,
  from a per-page desktop-vs-mobile walk comparison. At observe time the information does not exist.
  Raising the constant on foreknowledge would be a guess.
- **Proposed fix:** have the mobile pass's `deriveFor` also consume the DESKTOP context's authored
  media conditions (or the union). The authored pixel governing the switch — 1024/1025 — is usually
  present in the desktop-loaded stylesheet already, so the envelope can be extended on observed
  authored evidence rather than on a guess.

### A14. The QA harness grades a route the clone never built
- **Status:** PROVEN (Wave 8). Instrument defect. Not fixed.
- **What:** interiorbay.co.kr `/kwa-38941-515` — `cloneProvenance.httpStatus: 404`. Clone DOM is 8
  nodes / 3 visible / 0 images (the `wr-not-found` page); source is 521 / 292 / 32. `httpStatus` is
  recorded at `capture.ts:324-335,378` and read exactly once, at `run.ts:422`, **for a log string
  only**; `classify.ts` never references it. So a missing route is graded as content loss and emits a
  full stack of BLOCKERs on every channel at every width. **5 of the 13 `image-presence-ratio`
  BLOCKERs in the program are one route that was never reconstructed.**
- **Proposed fix:** when the clone's status is non-2xx and the source's is 2xx, emit ONE
  `clone-route-missing` BLOCKER and mark every content channel ineligible for that pair. Pair it with
  a route-coverage assertion so the falling blocker count cannot be read as improvement.

### A15. A source capture that will not hold still is graded anyway
- **Status:** PROVEN (Wave 8). Instrument defect. Not fixed.
- **What:** interiorteacher.com `/furniture/list` source population by width — nodes
  1225/1225/1263/**4191**/1265, images 98/92/99/**416**/117, while the clone is stable at
  98/98/98/98/89. Lazy-load or pagination fired during one capture. A baseline that swings 4x
  between adjacent widths and reverts is not a comparison population, and 1 of the 13
  `image-presence-ratio` BLOCKERs is that false positive.
- **Proposed fix:** mark the pair `source-capture-unstable` and make content channels ineligible when
  a width's source population deviates from BOTH neighbours and reverts. The discriminator must be
  "deviates from both and reverts" — a genuine breakpoint also produces a single jump.

---

## B. Observer

### B1. Cross-origin stylesheets silently skipped
- **Status:** CLOSED (Wave 1, W1, verifier-confirmed)
- **Proof of fix:** linear.app/pricing 30 blocked / 30 recovered / 0 missed; stripe.com 6 / 6 / 0.
  Stripe had been reconstructed with zero authored CSS and no signal that anything was missing.

### B2. `@supports` / `@container` / `@layer` declarations recorded as unconditional
- **Status:** CLOSED (Wave 1, W1, verifier-confirmed)
- **Proof of fix:** stripe.com, 69 declarations under `@supports` and 36 under `@container` now
  carry their condition. Both classes had been *wrong values*, not missing ones.

### B3. Sheet-level `media` attribute never read
- **Status:** CLOSED (Wave 2 OBS-FIX; sheet media list now read and seeded, 18 permanent checks in a real two-origin Chromium suite)
- **Where:** `src/observer/collect-dom.ts` (iterates `document.styleSheets`, touches only `sheet.cssRules`)
- **What:** A `<link media="print">` or `<style media="print">` contributes its declarations with
  no media field. The same-origin half is pre-existing; the cross-origin half is **newly
  introduced by the B1 fix**, because that sheet used to be invisible and is now recovered as a
  fabricated unconditional declaration.
- **Proof:** Verifier fixture at `tmp/wr286/W1-verify/`, 44 assertions. `.print-canary`
  (`width: 987px`, `origin: fetched`) and `.print-canary2` (`height: 654px`) both land with no
  media field.

### B4. Scroll-reveal blanking
- **Status:** FIXED-UNVERIFIED-CORRECTIONS-PENDING (Wave 3 OBS-C; detector plus counters landed, verifier requires revealedOpacity to be documented as a sampling floor and a false-refutation comment removed)
- **Where:** `src/observer/layout-probe.ts`, end of scroll preparation
- **What:** The probe returns to the top of the page after scrolling. On a site using AOS in
  re-hide mode, the majority of the page is then observed at `opacity: 0`. The reconstruction
  ships blank **and screenshot-diff QA passes it blank-against-blank**.
- **Proof:** mystarskin.co.kr, roughly 4,000 of 6,157 desktop pixels.
- **Why it is urgent:** this is a fake-coverage defect. The instrument agrees with the defect.
- **Negative control:** interiorteacher.com does NOT re-hide. After returning to the top, 0 of 708
  sized elements sit below 0.05 opacity. The fix must not assume every site re-hides, and must not
  penalise a site that legitimately animates once.

### B5. Modal overlays baked as permanent
- **Status:** COUNTED, NOT AUTO-REMOVED (Wave 3 OBS-C; candidates flagged and surfaced rather than deleted, because a false positive would delete a real fixed header. Verifier requires recording WHICH signal fired: a legitimate hero is flagged whenever page scroll happens to be locked)
- **What:** An entry popup open at capture time is reconstructed as a permanent overlay covering
  the hero. Seen on 2 of the 12 scouted candidates.

### B6. Per-element declaration cap keeps the first 32 in sheet order
- **Status:** PROVEN, unassigned (carried; pre-existing, surfaced by B1)
- **Where:** `MAX_MATCHED_RULES_PER_ELEMENT = 32`
- **What:** The cap now actually bites (54 elements on Linear, 4 on Stripe) and keeps matches in
  index order rather than by specificity, so a capped element can hold losing declarations and
  miss the winner. `layoutRulesTruncated` marks them honestly; nothing resolves specificity.

### B7. `dom.json` storage growth
- **Status:** ASSIGNED for measurement only (Wave 2, OBS-FIX item C1.3); the de-duplication fix is carried
- **Measured:** +5.06 MB per viewport per page, roughly 81 MB for an eight-page two-viewport site.
  Six more pilot sites are coming.

---

## C. Measurement instruments

### C1. `PASS` is unreachable in the responsive QA harness
- **Status:** ASSIGNED (Wave 2, RQA-FIX lane, item C3.1)
- **What:** The pixel-JND channel fires at or above 1% on every real reconstruction, observed
  floor 1.72% on a pair an independent verifier judged structurally identical. The clean end of
  the scale carries no information, and an operator gate written as "require PASS" can never fire.

### C2. Lazy-loaded content is outside every numeric channel
- **Status:** ASSIGNED (Wave 2, RQA-FIX lane, item C3.2)
- **What:** The probe does not scroll; the full-page screenshot does. Lazy-revealed content is
  therefore unmeasured on both sides while still appearing in the images a human reviews.
- **Blast radius:** pilot 6 (interiorteacher.com) has 101 of 102 images lazy-loaded.

### C3. `measureLandmark` excludes elements wider than 1.5x viewport
- **Status:** ASSIGNED (Wave 2, RQA-FIX lane, item C3.3)
- **What:** Fail-silent pointing the wrong way. The worse the horizontal overflow, the likelier
  the offending element is dropped from the measurement that exists to catch it.

### C4. `matchedFraction` is not a quality signal
- **Status:** ASSIGNED (Wave 2, RQA-FIX lane, item C3.4)
- **What:** The `p:` tag-path correspondence pass matched **zero** nodes on every pair, so the
  third pass is dead code and the fraction is depressed in proportion to a page's unlabelled-icon
  count.

### C5. Full-page screenshot cap blindness
- **Status:** FIXED-UNVERIFIED-CORRECTIONS-PENDING (Wave 3 QA-C)
- **Where:** `src/reconstruction-qa/screenshot-diff.ts`
- **What:** A 12,000px screenshot cap over an 18,981px page makes visual QA structurally blind
  below the cap rather than reporting that it stopped looking. Another fake-coverage defect.

### C6. Balanced garbage parses clean in the media tokenizer
- **Status:** ASSIGNED (Wave 2, SPEC lane, item C2.1)
- **What:** The nested-group branch returns `width-irrelevant` by default, so `(())` reports a
  successful parse and the module's own `unparsedCount` gate cannot fail.

### C7. Unsatisfiable media conditions inject phantom snap targets
- **Status:** ASSIGNED (Wave 2, SPEC lane, item C2.2)
- **What:** `foldMediaBreakpoints` never consults `interval.empty`, so
  `(min-width: 64px) and (max-width: 32px)` still contributes two histogram entries. The
  reconstruction lane snaps band edges to that histogram.

### C8. `document.images` is the wrong denominator for image-completeness metrics
- **Status:** PROVEN, no fix required in `src/responsive-qa` (checked: it already filters correctly);
  applies to any future image metric and to the pilot gate wording
- **What:** Structurally hidden images (0x0 box inside a `display: none` ancestor) are a large,
  width-dependent share of `document.images`. Counting them makes a fully-loaded page look broken.
- **Proof:** interiorteacher.com scores 80.4% loaded at 1440 and 55.9% at 390 on the naive
  denominator, and 100% at both widths on the renderable denominator. A 44-point error at 390.
- **Checked and clear:** `src/responsive-qa/probe.ts:95-110` builds its visible set from
  `display !== none`, `visibility !== hidden`, `opacity !== 0` and a non-zero rect, and
  `imageLeafCount` at `:233` only counts members of that set. The harness's Linear `/` @700
  BLOCKER ("84 of 234 visible images") therefore **stands**. Recorded so it is not re-litigated.


---

## D. Coverage

### D1. Two of three Wave 1 deliverables have zero CI coverage
- **Status:** PARTIALLY ASSIGNED (Wave 2, OBS-FIX item C1.2 covers the observer; the responsive
  QA harness is still uncovered because `scripts/` was outside its lane)
- **What:** W1 rewrote ~870 lines and added a CORS subsystem with no repo check. W3 built a whole
  new subsystem with no repo check. The mobile-probe element-identity invariant, which would
  silently corrupt every future mobile layout rule, is asserted by nothing.
- **Carried:** `scripts/smoke-responsive-qa.ts` does not exist and needs an owner.

---

## E. Refuted

### E4. `recoverGridTracks` truth-checks only the container box and ignores child tiling
- **REFUTED (Wave 8), twice over.** `recoverGridTracks` DOES compute and return witnesses
  (`layout-inference.ts:1530-1543`); the tiling test itself is at `:1400-1432` (each child must match
  exactly one track in both offset and width, else `children-do-not-tile-tracks`), with a per-width
  reproduction test at `:1441-1466`. Emission attaches them at `:1899` alongside the container `truth`
  at `:1896`, and the truth check consumes them — `responsibleBoxes` (`layout-truth-check.ts:456-471`),
  the per-box loop (`:880-911`), rejections carrying `witnessNodeId` (`:901`).
- The narrower real gaps, which A9 records: the witnesses are compared at ONE width; `Rect` is
  `{x, w}` with no `y`/`h`; and no cross-box invariant asserts non-overlap or parent containment.
- **How the false claim arose:** the `overlap-excess-ratio` wording (see A11) reads as a layout
  failure, and a lane reasoned from it to grid tracks without checking the code. Every
  `grid-template-columns` the site in question ships is a single-column `minmax(0, 1fr)`, which
  cannot overlap siblings horizontally.

### E5. Shipping the recovered desktop rules caused the wix-idn grade regression
- **REFUTED (Wave 8).** The W8 lane attributed wix-idn's 8 BLOCKER -> 10 BLOCKER move to the 341
  newly-shipping desktop rules. Independent diagnosis found the cause is an OBSERVER capture
  difference: the newer observation ran with `prepareScroll` off (see A10) and additionally captured
  lazy-loaded card images the older run missed, baking BOTH layers of a `<picture>` crossfade at
  `opacity: 1`. The old build does not contain those images at all. Same class as B4, not a
  layout-rule regression.
- **Orchestrator error recorded:** the W8 re-run briefs copied `observeFlags` from the W7 lane
  reports, and only interiorteacher's carried `--prepare-scroll`. So three of the four W8 re-runs
  changed the capture policy relative to their W7 baselines, which makes those three pre/post grade
  comparisons non-comparable in that respect. A10 removes the flag's ability to cause this by making
  the correct policy the default.


### E1. Desktop/mobile toggle mismatch at 1024/1100/1440
- **Status:** REFUTED. The 28.5C plan assumed this defect existed in the shipped build. An
  independent render proved pixel-identity at all three widths. It was an artifact of the AC5
  experiment, not of the engine.

### E2. The 700px defect is a desktop-tree defect
- **Status:** REFUTED. It is a **mobile-tree** defect. The fix is symmetry (a mobile probe plus a
  viewport-parameterised emit), not raising the breakpoint, which would lose mobile-only nodes.

### E3. CORS recovery requires a second fetch
- **Status:** REFUTED. `page.on('response')` yields cross-origin bodies the browser already
  fetched. No extra request is issued.
