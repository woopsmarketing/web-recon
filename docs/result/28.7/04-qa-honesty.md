# Task 28.7 — 04 QA Honesty (Program D)

**Owner:** one agent, sole writer of `src/responsive-qa/**` + `scripts/smoke-responsive-qa.ts`.
**Independent verification by the orchestrator:** suite re-run → **205/205**; `pnpm typecheck` exit 0;
grep for hostname/selector keying across `src/responsive-qa/` returns only *comments recording where a
threshold was measured* — no code branches on a site.

---

## PREVIOUS FACT — what the instrument did wrong

Three defects from the 28.6 ledger, all in the false-direction for a gate (they inflate or misdirect):

- **A14** — `httpStatus` is captured per side (`capture.ts:324-337,378`) and read in exactly ONE place
  in the repo: a display-only evidence string at `run.ts:422`. `classify.ts` never referenced it. So a
  clone route that 404s was graded by the identical path as a 200, producing a full BLOCKER stack on
  every content channel. **5 of the program's 13 `image-presence-ratio` BLOCKERs were one route the
  clone never built.**
- **A15** — a source capture whose population swings 4× at one width and reverts (1225/1225/1263/**4191**/1265)
  was graded as truth. No cross-width view existed anywhere: each (route,width) was captured,
  classified and discarded in isolation.
- **A11** — `overlap-excess-ratio` could not tell a layout collapse from two `<picture>` crossfade
  layers whose assets failed to load. Leading BLOCKER on 5 of 5 pairs of one site at 24.57%. Per-leaf
  image load state did not exist in the instrument at all.
- Plus: a pair the harness could not measure defaulted to BLOCKER in one tally path — a harness hole
  charged to the clone.

## IMPLEMENTED CHANGE

### Guard 1 — `clone-route-missing`
Source 2xx + clone ≥400 (or never built) → exactly ONE finding, `clone-route-missing`, BLOCKER.
Implemented as a **short-circuit**, not by retrofitting `eligible:` onto ~15 call sites — six firing
channels (`overlap-excess-ratio`, both `scroll-height-ratio-*`, both `logo-row-*`,
`pixel-visible-difference-ratio`) take no `eligible` argument at all, so the per-call approach would
have silently missed them. `cloneRouteGate` (`classify.ts:274`) runs as the first channel while the
accumulator is ungated; `RubricAccumulator.suppressEveryFurtherChannel` (`classify.ts:114`, tripped at
`:336`) then makes every later channel — **including any channel added in future** — record its
measured value with `firedAt: null`, `threshold: null` and a stated `ineligibleReason`. The artifact
stays internally consistent: the measured values are still there, they just did not fire.
3xx is deliberately NOT treated as missing (Playwright follows redirects; treating any non-2xx as
missing would false-positive every trailing-slash normalisation).

### Guard 2 — `source-capture-unstable`
A post-hoc second pass over the complete `pairs` array (`run.ts:1306`), grouped by route and sorted by
width, so `classifyPair` stays a pure per-pair function and the capture loop is not restructured.
`detectSourceInstability` (`run.ts:684`) flags a width whose `source.totalNodes` deviates ≥0.5 from
**both** neighbours in the same direction **and** whose neighbours agree within 0.25 — the required
"deviates from both AND reverts" discriminator, so a genuine monotone breakpoint step is not flagged.
`applyInstabilityOverride` (`run.ts:754`) moves volatile findings into
`classification.override.demotedFindings`, re-records those channels with a reason, recomputes counts,
and **labels the rewrite** (`guard`, `demoted`, `originalVerdict`) so nobody can mistake it for a real PASS.

### Guard 3 — duplicate image layers vs true layout overlap
The overlap sweep was moved OUT of the in-page probe into a pure module (`src/responsive-qa/overlap.ts`,
`computeOverlapAccounting` `:142`) operating on the leaf array the probe already returns — same
traversal, same totals, but the judgement is now testable without a browser. `classifyOverlapPair`
(`overlap.ts:113`) attributes each overlapping pair in priority order:
1. `failed-image-layer` — either leaf's asset failed to load;
2. `duplicate-image-stack` — both image leaves, same key **or** same `ownerKey`, **and** every edge
   within 2px;
3. `true-overlap` — everything else.

`overlap-excess-ratio` now reads `trueOverlapAreaRatio` only. Per-leaf load state is new
(`probe.ts:414`, `complete && naturalWidth > 0`, left `undefined` for svg/canvas/iframe) — it did not
exist before and is what keeps a failed asset's `image-presence` finding as the PRIMARY defect
instead of double-counting it as overlap. Geometry is required in addition to the shared key,
because two genuinely different repeated components stacked by a real layout bug also share a key.

### Guard 4 — measurement failure and coverage
`accountForCoverage` (`run.ts:911`) assigns exactly one bucket per pair (priority: measurement-failed →
clone-route-missing → source-capture-unstable → graded). `carriesLayoutVerdict` (`run.ts:878`) gates
both the verdict tallies and the floor comparison. **The old `pair.classification?.verdict ?? "BLOCKER"`
default is deleted** — that line charged a harness hole to the clone.

The numeric, script-readable coverage block lives at `artifact.summary.coverage` (`run.ts:1453`):

```ts
export interface CoverageAccounting {
  pairsTotal; pairsGraded; pairsCloneRouteMissing;
  pairsSourceCaptureUnstable; pairsMeasurementFailed;
  pairsAccountedFor; conserved; pairsVerdicted; pairsStabilityUntested;
  duplicateImageStackPairsDemoted; failedImageLayerOverlapPairsDemoted;
  overlapFindingsDemoted; unstableFindingsDemoted;
}
```

with the invariant `blockerPairs + majorPairs + minorPairs + passPairs === coverage.pairsVerdicted`
asserted in the suite. **This is the specific defence against "fewer blockers because we stopped
measuring".**

## NEW EXPERIMENT — how the tests were proved to be real tests

Every guard was **inverted in the real source** (backups + checksum-verified restore, driver at
`tmp/wr287/mutate.py`) and the suite re-run. A test that still passes against a broken implementation
is not coverage.

| mutation | suite result |
|---|---|
| clone-route gate forced off | 193/202 — **9 FAIL** |
| stability reversion clause dropped | 204/205 — **1 FAIL** |
| instability override made a no-op | 195/202 — **7 FAIL** |
| duplicate-layer geometry requirement dropped | 200/202 — **2 FAIL** |
| rubric reads undemoted overlap | 198/202 — **4 FAIL** |
| `loaded === false` branch removed | 199/202 — **3 FAIL** |
| unstable bucket disabled | 197/202 — **5 FAIL** |

**An honest finding from that exercise:** the profile named in the brief (1200/1200/2400/2450) is
already separated by the "deviates from both" clause alone, so dropping the reversion clause caught
nothing. A **minimal pair** was added — 1000/3000/1050 (flagged) vs 1000/3000/1800 (not), identical
deviations, only the reversion differs — specifically to make the discriminator load-bearing. That is
now the check that goes red.

## THE THREE DECISIONS I REQUIRED BE MADE EXPLICITLY

1. **Edge widths.** The lowest and highest width of a route, and any route swept at fewer than three
   widths, are `testable: false` and **graded normally**, never flagged. A 2-point rule is exactly the
   rule that cannot tell a breakpoint from a spike. Counted in `coverage.pairsStabilityUntested` and
   named in the limitation `source-stability-untested-at-edge-widths`. **Consequence, stated plainly:
   an unstable capture at 390 or 1440 is not detected by this instrument.**
2. **Self-check reconciliation.** In `mode: "self-check"` the guard detects, labels and counts but does
   **not** demote. The pair keeps its verdict and stays in `pairsMeasured`, the tallies and the floor.
   Demoting there would make the floor quieter than the instrument really is, and every clone verdict
   is read against that floor.
3. **Volatile channel list.** Demoted under Guard 2: the text, image, nav, overlap, column, position,
   logo, scroll-height and pixel channels. **Preserved:** `clone-route-missing` (HTTP only),
   `source-under-render-suspected` (it is *about* the bad capture), `footer-clipped`,
   `landmark-wide-element-excess`, `horizontal-overflow-excess-px` (facts about the clone's own box
   model). It is expressed as a volatile *list*, so a newly added channel is preserved by default —
   failing toward keeping a finding, not hiding one.

## VERIFICATION

| check | result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `scripts/smoke-responsive-qa.ts` | **120/120 → 205/205** (+85 checks, 5 new sections) |
| `testRevealPolicyAgreement` (cross-module invariant) | untouched, still passing |
| hostname/selector keying in `src/responsive-qa/` | none in code; only measurement-provenance comments |

## REMAINING LIMITATIONS

1. **A 3xx clone route is invisible to Guard 1.** A clone route that redirects *into* a 404 records
   the 3xx and is graded by the content channels exactly as before.
2. **Guard 2 needs ≥3 widths per route and reads only `source.totalNodes`.** A source unstable at
   *every* width, or unstable in text without a node-count change, is not detected. Edge widths are
   never tested (see decision 1).
3. **`sameDirection` in the stability rule is mathematically implied** by the other two clauses. No
   test isolates it; mutating it changes nothing. It is kept for readability and commented as such
   rather than claimed as covered.
4. **`RUBRIC_VERSION` bumped 3 → 4.** Rubric-4 verdicts can be BETTER than rubric-3 verdicts on the
   same clone — the first time a bump goes in that direction. Counts from before and after must not be
   summed, and **pre-existing self-check floors are no longer comparable**, so new canary runs need
   fresh floors.
5. **`image-layer-state` fires MAJOR at ≥1 excess broken asset — a judgement, not a measurement.**
   Deliberately not a BLOCKER band: a guard that removes one finding while inventing a more severe one
   has not made the instrument more honest.
6. **Guard 3's demotion depends on `getBoundingClientRect` rounding.** Two duplicated layers separated
   by >2px on any edge are still counted as true overlap — the safe direction.

---

## CORRECTION / ADDED LIMITATIONS (appended 2026-09-05, after the independent audits)

Three things about this work package that the report as first written did not say, all of them
found by independent review rather than by me, and all of them recorded here rather than in a
summary that the next wave will not read.

### L1 — `failed-image-layer` is checked FIRST and demotes on EITHER leaf

`classifyOverlapPair()` (`src/responsive-qa/overlap.ts:113`) resolves in the order
`failed-image-layer` → `duplicate-image-stack` → `true-overlap`, and the first branch fires when
**either** participating leaf failed to load. The `duplicate-image-stack` branch is genuinely tight
— both leaves must be images, share a key *and* an `ownerKey`, and agree on every edge within 2px,
with key-alone explicitly rejected. The `failed-image-layer` branch is not.

**The failure this admits:** a real layout collapse, where a correctly loaded element lands on top
of a broken image, is demoted out of `overlap-excess-ratio` (BLOCKER-capable) into
`image-layer-state`, which is banded MAJOR at most. That is an under-report, in a work package
whose entire purpose was to stop the instrument lying in the other direction.
`overlap-excess-ratio-undemoted` is recorded for exactly this case but **no channel fires on it**,
so the mitigation is inert.

**Blast radius on everything 28.7 reported: provably zero.** Measured on all four final canary runs:

| site | `duplicateImageStackPairsDemoted` | `failedImageLayerOverlapPairsDemoted` | `overlapFindingsDemoted` | `unstableFindingsDemoted` |
|---|---:|---:|---:|---:|
| linear.app | 0 | 0 | 0 | 0 |
| hobbang.net | 0 | 0 | 0 | 0 |
| gs.severance.healthcare | 0 | 0 | 0 | 0 |
| seoultone.kr | 0 | 0 | 0 | 0 |

Not one pair in the corpus was demoted by any guard, so no reported verdict in this wave depends
on the branch ordering. The defect is real in code and is carried forward, not fixed here: fixing
it means making `overlap-excess-ratio-undemoted` a firing channel, which is a rubric change, and a
rubric change invalidates every self-check floor and every verdict measured in this wave.

### L2 — the guards were never exercised by the corpus, only by fixtures

The same table is the honest statement of what this work package demonstrated. All four guards are
implemented and each is verified by mutation in `scripts/smoke-responsive-qa.ts`. **None of them
fired on a real site in this wave.** The improvement they represent is therefore fixture-verified,
not corpus-verified, and a reader should not credit any part of the 28.6 → 28.7 change in counts to
them. Coverage conservation (`conserved: true`, all buckets zero) is the part that *was* exercised
on real runs.

### L3 — the pixel diff silently crops to the narrower capture, which is where the frozen-width defect lives

`gatePixels()` (`src/responsive-qa/pixel-gate.ts:164-165`) computes over
`min(source.width, clone.width) × min(source.height, clone.height)`, top-left anchored. The code
says so. The consequence was not stated anywhere and is sharp, because captures are
`fullPage: true` and therefore as wide as the document's scroll box, not the viewport:

| pair | source PNG | clone PNG | diffed at |
|---|---|---|---|
| linear `/` @700 | 700 × 9587 | **862** × 9960 | 700 × 9587 |
| severance `/gs/index.do` @1100 | **1280** × 2700 | 1100 × 2700 | 1100 × 2700 |
| severance `/gs/news/news/notice.do` @1100 | **1280** × 1493 | 1100 × 1493 | 1100 × 1493 |

**The horizontal overflow band — the exact region the A9 frozen-width defect produces — is never
pixel-diffed.** It is measured, by `horizontal-overflow-excess-px` and
`offscreen-text-excess-chars`, so the defect is not invisible to the rubric; but it is invisible to
every pixel channel and to the visual pack, and a human comparing a 700px source against an
862px clone side by side is being shown two different scales without being told. The independent
visual auditor hit this directly and correctly refused to trust the pixel/position numbers on
those rows.

Neither L1 nor L3 is fixed in this wave. Both are in the 28.8 input contract.
