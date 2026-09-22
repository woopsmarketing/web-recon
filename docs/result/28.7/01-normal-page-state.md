# Task 28.7 — 01 Normal Page State (Program A)

**Owner:** one agent, sole writer of `src/observer/**`, `src/multi-observer/**`,
`scripts/smoke-multi-observer.ts`.
**Independent verification by the orchestrator:** `pnpm typecheck` exit 0; a fresh
`smoke-multi-observer` run → **222/222**, exit 0, zero FAIL lines; `docs/result/28.7/evidence/`
confirmed clean of harness pollution.

---

## An architecture decision was made deliberately, not drifted into

The observer's header contract said it "never clicks". Task 28.7 makes obtaining the NORMAL page
state a product requirement, so the contract was changed **explicitly and in writing**: the observer
now has a bounded, evidence-gated PAGE-STATE NORMALIZATION phase that may perform a very small number
of conservative clicks before collection; **collection itself stays strictly read-only**. Silent
manipulation remains forbidden — every action is recorded on the artifact and in an evidence
directory.

---

## A1 — prepareScroll navigation safety (P0)

### Previous fact
`autoScrollPrepare`'s per-step `page.evaluate` (`layout-probe.ts:298-308`) was unguarded. A navigation
during the scroll destroyed the JS execution context; the throw propagated uncaught through
`stabilize()` → `observeViewport()` → `observePageWithBrowser()` and was caught only in
`observe-selected-pages.ts:305-315`, where `classifyObservationError` did not recognise
"Execution context was destroyed" and filed it as `observation-error` **with no observation**. The
page then had no `renderSourcePageId` (`compile-routes.ts:96`) and `route-plan.ts:158-163` threw,
killing the whole reconstruction. Reproduced on seoultone.kr by a single-variable A/B.

### Implemented change
The scroll loop is now `runScrollPass`, which after **every step** compares `page.url()` against the
observation URL. That check is the substantive part: Playwright only throws when a navigation lands
*inside* an in-flight evaluate — a navigation that completes during the 250 ms step settle is
**silent**, and the old code would happily keep scrolling the wrong document. Either shape raises out
of the pass; the wrapper catches, waits for `load`, and if the page left the observed document
performs ONE `goto` back (reinstalling the `__name` shim and the reveal probe) plus ONE scroll retry.
A second navigation stops everything, and a final non-retrying restore `goto` guarantees the
collection describes the page under observation.

Status vocabulary, exactly as specified:
`prepare-scroll-complete` | `prepare-scroll-navigated-recovered` | `prepare-scroll-navigated-fallback`
| `prepare-scroll-failed-fallback`, surfaced as `LoadStrategy.prepareScrollStatus` plus
`prepareScrollNavigation{navigatedUrl, observationUrl, leftObservedDocument, recoveryNavigated,
retryAttempted, retryNavigated, restoreNavigated, limitation, error}`, and `LayoutProbe.prepareScrollStatus`
for the probe path. Core logic `layout-probe.ts:392-566` and `:296-343`;
`observe-selected-pages.ts:178-195` routes the destroyed-context class through the shared detector.

**Under no circumstance does a navigation during scroll now throw out of the viewport observation.**

### Judgement calls recorded
- **A final restore navigation beyond the "one recovery attempt" bound.** After a failed retry the
  page sits on the intruding document; collecting *that* would be a worse defect than the lost route
  A1 removes. It is recorded separately as `restoreNavigated` so the artifact never conflates it with
  a recovery.
- **`navigation-error`, not a new `SitePageStatus` member.** A new enum value would stop every
  historical site manifest from parsing, and "the site navigated" is honestly a navigation error.

## A1b — THE SECOND DOOR TO THE SAME P0, found by rejecting a green report

The first report of this work package claimed 218/218. A fresh run by the orchestrator failed — and
a second run failed in a *different* section, always with `observation-error`. That non-determinism
was sent back for root cause rather than accepted or retried.

**Root cause, and the production path WAS implicated:** `page.screenshot({ fullPage: true })` in
`observeViewport` carried no explicit `timeout`, so it silently inherited Playwright's **30 s default
action timeout**. `page.setDefaultNavigationTimeout()` moves only the navigation budget, not this one.
It is the heaviest call in an observation — a tall document at the mobile profile's DPR 3 is a
hundreds-of-megapixels capture. On overrun it threw straight out of `observeViewport`, and the page
was filed as `observation-error` **with no artifact** — the whole route lost. **That is the exact P0
this program exists to remove, reached through a second door, and it would have fired on any slow
real site.**

Evidence: forcing a 1 ms budget reproduces the identical error shape and phase
(`observation-error [observe/TimeoutError: page.screenshot: Timeout 1ms exceeded.]`, versus the
coordinator's `Timeout 30000ms exceeded.`); an audit of every `await` in `observeViewport` shows the
screenshot is the **only** call subject to the 30 s default (`goto` is bounded at 45 s and classifies
as `navigation-error`; `page.evaluate` has no timeout; the other two are try-wrapped); and the two
sections that failed are the two heaviest screenshot contexts (concurrency-2 DPR-3 mobile captures,
and a page that fetches every 200 ms). Ruled out by measurement, not assumption: no harness time
budget, `ulimit -n` 1,048,576, no stray Chromium processes, fixture server answered every request.

**Fix:** explicit `SCREENSHOT_TIMEOUT_MS = 60_000` with a viewport-only fallback at
`SCREENSHOT_FALLBACK_TIMEOUT_MS = 20_000`, recorded honestly as `ViewportObservation.screenshotDegraded`
— **the observation is kept instead of the route being lost.** `normalizePageState` was also made
total (any unexpected throw returns a skipped result with a limitation, never propagates), and the
settle/scroll waits were made non-rejecting.

Two harness defects were fixed in passing: a `byRoute` loop that read `observation.json` for failed
pages, so one ENOENT aborted a section and hid every later check; and a test that ran the normalizer
with the **default** evidence root, writing into `docs/result/28.7/evidence/`. The leaked directory
was removed.

## A2 — conservative popup / modal normalization

### Previous fact
Defect B5: modal overlays were **counted, not removed** — a deliberate 28.6 decision, because a false
positive would delete a real fixed header. An entry popup open at capture time was reconstructed as a
permanent overlay covering the hero, seen on 2 of 12 scouted candidates.

### Implemented change
New module `src/observer/normalize-page-state.ts`, running after networkidle + fonts and before the
scroll. The documented predicate is **modal-SHAPED and ≥2 signals and ≥1 STRONG**, where

- **strong** = `declared-dialog` (`<dialog>` / `role=dialog|alertdialog` / `aria-modal`),
  `appeared-after-initial-paint`, `close-control-inside`;
- **weak** = `page-scroll-locked`, `stacked-above-page`.

That structure is what makes the explicitly-insufficient signals insufficient: `position: fixed`, a
high z-index and a locked page scroll are all weak, so no combination of them alone can qualify
anything. The shape gate (≥50% viewport width AND ≥50% height AND ≥50% area, wide-and-short refused
as header-like) is now a single shared constant `OVERLAY_SHAPE`, read by both the collector's census
and the normalizer, so the two cannot drift apart.

Action policy: click the close control found **inside** the overlay (label matched against a generic
multilingual vocabulary — `닫기`, `오늘 하루 보지 않기`, `오늘은 그만 보기`, `Close`, `Dismiss`, `×`,
`✕`, `X`, plus `aria-label`/`title` equivalents; symbols exact-match only), never `force`; `Escape`
only with declared-dialog evidence; **at most 2 attempts**; verified against measured geometry.
**There is no DOM-removal path at all** — not even off by default.

Evidence per attempt, successful or not, at
`docs/result/28.7/evidence/page-state/<host>/<pageId>-<viewport>-<n>/{before.png, after.png, record.json}`,
the record carrying url, viewport, overlay node identity, box, z-index, the signals that fired, the
close control and how it was found, the outcome, and whether page geometry actually changed.

### Judgement call recorded
**No last-resort DOM hide at all.** The brief permitted one, off by default. It was declined: the
honest fallback for "we could not dismiss it" is to record it and let the census describe the
overlay, rather than to delete a node on weaker evidence than a click.

## A3 — deterministic settle

`networkidle` is kept as one bounded input; the settle condition is now that **document height,
renderable-image settled-count and renderable-count all hold still for 3 consecutive 150 ms samples**,
capped at 40 samples / 6,000 ms so a page that never settles still terminates. A renderable candidate
is an `<img>` with a resolvable source, not `display:none`/`visibility:hidden`, that generates a box
at all (`getClientRects().length > 0`), with a non-zero box or within 2,000 px of the viewport; a
permanently failed image counts as settled. **`document.images` is not the denominator** — the
fixture declares 6 `<img>` tags and the denominator reads 4. Recorded as `LoadStrategy.settle`.

A real defect the new test caught during development: an `<img>` under a `display:none` ancestor keeps
its own computed `display` and reports a 0×0 box **at the origin**, which the proximity test read as
"just above the fold". Fixed with the `getClientRects()` test.

## A4 — reveal-state stability, minimal and honest

### Previous fact
The two marks that could prevent scroll-reveal blanking — `ElementObservation.scrollRevealRegressed`
and `revealedOpacity` — were recorded by the observer and **consumed by nobody**. I verified this
independently before the work started: zero references outside `src/observer/**`. So on a site that
re-hides on return to top, the collector ran after the scroll returned, recorded `opacity: 0`, and
the reconstruction shipped blank.

### Implemented change
A bounded `revealRegressionPolicy` at the observation→style-token boundary
(`dedupe-styles.ts:85-122`), applied before interning: when an element is marked
`scrollRevealRegressed`, its captured opacity is below the threshold, and it was observed during the
scroll at `revealedOpacity` at/above the threshold, the emitted token carries the **revealed** value.
Every other disagreement leaves the value alone and marks the element unstable with a reason — no
fabricated certainty. **Both real observations survive in the raw record** (`capturedOpacity` and
`revealedOpacity`), and the correction is counted on `ViewportObservation.revealRegressionPolicy` with
a bounded sample of corrected ids.

### Judgement call recorded
`revealedOpacity` is restored **verbatim** rather than snapping a mid-fade value to 1 —
observed-not-invented wins. The cost is that a corrected mid-fade element renders translucent; that
is counted as `correctedBelowFull` rather than hidden.

## TESTS — 45+ new checks, each proved against the pre-fix behaviour

Proof method: scratch mutation of the real source, backed up and restored with a byte comparison.

| test | mutation | result |
|---|---|---|
| `testPrepareScrollNavigationSafety` (`/nav-once`, `/nav-always`) | identity check off, catch rethrows | both fixtures become `observation-error` with no observation |
| `testPageStateNormalization` (2 positives, 5 negative controls) | normalizer disabled | 15/17 fail |
| same | bar relaxed so one weak signal qualifies | the scroll-locked negative control fails |
| `testDeterministicSettle` (`/endless-poll`, `/slow-images`) | settle dropped | 7/8 fail |
| same | `document.images` as denominator | 2 fail, reporting `renderableImages: 6` |
| A4 checks inside `testScrollRevealAndOverlayCensus` | policy short-circuited | 4 fail (`corrected: 0`, `unstable: 6`) |
| `testScreenshotDegradation` | — | forces a 1 ms budget every run, with a normal-budget negative control proving the field means something |

The five negative controls — fixed header, chat widget, accessibility control, full-viewport hero,
scroll-locked page — are untouched at **both** viewports. Header and small controls are refused by
*shape*; the hero and the scroll-locked cover ARE shape matches and are refused on *evidence*, which
is the harder and more meaningful case.

## VERIFICATION

| check | result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `smoke-multi-observer`, 3 consecutive runs by the builder | 222/222, 222/222, 222/222 (exit 0, 384 s each) |
| `smoke-multi-observer`, independent run by the orchestrator | **222/222**, exit 0, 0 FAIL |
| `smoke-responsive-qa` (cross-module `testRevealPolicyAgreement`) | 205/205, still passing |
| `docs/result/28.7/evidence/` pollution | clean |

## REMAINING LIMITATIONS

1. **Icon-only close controls with no accessible label are not found.** A bare `<svg>` X with no
   `aria-label`/`title`/`alt`/text yields no `close-control-inside` signal. Framework dismissal
   attributes (`data-bs-dismiss` and friends) are deliberately not read.
2. **CSS `background-image` loads are not counted by the settle** — there is no per-element load event
   for them, so a page whose hero is a background image settles on height stability alone.
3. **The census and the normalizer share thresholds, not a function** — Playwright serializes only the
   function handed to it, so a shared in-page helper cannot cross the bridge. They are bound by one
   constant plus a behavioural equivalence check on a fixture carrying both a shape match and a
   header-like refusal. One detail still differs: the collector's paint test is `opacity === 0`, the
   normalizer's is `opacity < 0.05`.
4. **`revealedOpacity` is a sampling floor**, so a corrected mid-fade element renders translucent.
5. **The normalization scan costs up to ~1.2 s per page-load** when nothing qualifies.
   `scanOverlaysInBrowser` walks all elements twice; making the baseline pass lazy would roughly halve
   that on the common no-overlay page. Deliberately not changed mid-determinism-run.
6. **The screenshot degradation was not reproduced under local load** (one run at load average 27.5
   still passed). The mechanism is proven by forced-budget reproduction and by exhaustive audit of the
   call site, not by reproducing the original saturation. Stated plainly rather than claimed.

---

## CORRECTION / ADDED LIMITATION (appended 2026-09-05, after the independent adjudication)

**A2's popup normalization did NOT fire at the desktop viewport on seoultone.kr — the very site used
to demonstrate it — and this report did not say so.** Measured from
`data/seoultone.kr/site-observations/2026-09-04T18-13-50-161Z/pages/p000001/observation.json`:

| viewport | `scans` | `structuralMatches` | `qualified` | `dismissed` | `headerLikeRefused` |
|---|---:|---:|---:|---:|---:|
| **desktop (1440)** | 5 | **0** | **0** | **0** | 6 |
| mobile (390) | 2 | 1 | 1 | **1** (`section#popup_slider`) | 7 |

The 1440 clone therefore ships the entry popup baked in, exactly the defect A2 exists to prevent,
while the 390 clone does not.

**The cause is generic, not seoultone-specific, and that makes it worse.** The modal-SHAPED gate reuses
`OVERLAY_SHAPE` (`src/observer/types.ts:1629-1636`), whose thresholds are **viewport-relative**:
`minWidthCoverage: 0.5`, `minHeightCoverage: 0.5`, `minAreaCoverage: 0.5`. A popup with a fixed pixel
width — this one is ~31% of 1440 — covers well over half of a 390px viewport and well under half of a
1440px one. **The same modal therefore qualifies at narrow widths and is invisible to the normalizer at
wide ones**, on any site, and the wider viewport is the one where entry popups are most common.

This does not change the module's design decisions — the ≥2-signals / ≥1-STRONG predicate and the
absence of any DOM-removal path stand, and a fixed-px overlay gate would be a different and riskier
choice. It changes what this report may claim: **A2 is demonstrated at mobile and undemonstrated at
desktop**, and the wave shipped without noticing because no check asserted normalization symmetry
across viewports on a real site. Carried to 28.8.

**A second, related asymmetry, also unstated here** (found by the visual audit and confirmed by the
adjudication): `normalizePageState` has **zero callers under `src/responsive-qa/`**. The observer
removes an entry popup and the QA source capture does not, so the clone is charged `missing-text` for a
popup the engine deliberately removed. On seoultone `/`@390 part of the `missing-text-ratio 0.3054`
BLOCKER is exactly this. The two capture paths now have different page-state policies and nothing
reconciles them.

**A count in this report that never reconciled:** §TESTS quotes `smoke-multi-observer` at 222/222. The
suite's authoritative count in the final regression is **263/263**. 222 was a mid-wave value taken
before later checks landed; the final battery figure is the one to use.
