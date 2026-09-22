# Task 28.75 — regression at Phase A core freeze

**Result: GREEN.** 36 smoke files · 35 assertion suites · **4,663 checks** · **0 failures** ·
0 crashes · 0 non-zero exits · `pnpm typecheck` exit **0** · **no negative per-suite delta**.

This is the single full regression §51–§52 permits at Phase A core freeze. It was run twice: once
*before* any repair, which is what found the damage, and once after. Both are reported, because the
first one is the evidence and the second one alone would be a misleading picture of the wave.

## Reconciliation against the 28.7 floor

| | suites | checks | failures |
| --- | ---: | ---: | ---: |
| 28.7 input floor (§2, must not regress) | 35 | 4,326 | 0 |
| 28.75 core freeze | 35 | **4,663** | **0** |

4,326 + 337 = 4,663, and the 337 is fully accounted for by four positive deltas — no suite shrank:

| suite | 28.7 | 28.75 | delta | what bought it |
| --- | ---: | ---: | ---: | --- |
| `smoke-responsive-qa` | 205 | 349 | **+144** | the blank-region channel, plus the L1/L3 honesty work |
| `smoke-layout-safety` | 325 | 455 | **+130** | the frozen-width chain-root mechanisms and the grid-track banded pass |
| `smoke-multi-observer` | 263 | 318 | **+55** | the page-state/popup gate and the probe starvation gate |
| `smoke-sitespec` | 466 | 474 | **+8** | structural-path attachment and alignment reporting |

The 36th file, `scripts/smoke-playwright.ts`, is an environment probe with no assertions
(`NO-ASSERTIONS` baseline); it launched Chromium and exited 0. It is counted as a suite run, never as
checks.

## Run 1 — before repair, the one that found the damage

Four suites regressed. Recorded here in full, unedited, because a wave that reports only its clean
second run has not reported its regression at all.

| suite | run 1 | baseline | disposition |
| --- | --- | ---: | --- |
| `smoke-e2e` | 129/130, 1 failed | 130 | real defect — probe evidence discarded below a 100-element floor |
| `smoke-theme` | 40/47, 7 failed | 47 | **6 real product defects** + 1 stale test |
| `smoke-reconstruction-qa` | 207/211, 4 failed | 211 | 4 stale tests — asserted the very bug that was fixed |
| `smoke-visual-editor` | died at check 37, `TimeoutError` | 50 | test-side synchronisation defect |

Every other suite was already at or above baseline.

### What each repair actually was

Classification mattered more than the fix in every case: a test edited when production was at fault
buries a defect, and production edited when the test was stale invents one.

1. **`smoke-e2e` — production defect.** Correction cycle 2 rewrote probe→node attachment and folded away
   an exemption the committed baseline had: `attachCount: aligned ? elementTags.length : prefixUsable ? prefix : 0`
   became `usable = pairs.length >= PROBE_PREFIX_MIN_ELEMENTS`. That 100-element floor exists to guard
   *weak partial prefixes*; applying it to a fully **aligned** page throws away complete, valid evidence.
   Any real page under 100 walked elements — a thin legal page, a 404, a redirect stub — silently lost
   100% of its layout evidence while still reporting `aligned: true`. Fixed at
   `src/sitespec/compile-page.ts:336` with `usable = aligned || pairs.length >= PROBE_PREFIX_MIN_ELEMENTS`.
   Observed on a 52-element aligned walk: `attachCount` **0 → 52**, `structuralPrefix: 52` both before
   and after — the evidence was being computed and then discarded. Detail in `03d-`.
2. **`smoke-theme` — 6 of 7 production defects.** §CANVAS moved the root/body background onto
   `html:has([data-wr-page=…])`, and the theme layer's reader never learned that shape
   (`src/theme/stylesheet.ts:49`), so canvas ranking and binding never saw a canvas: `color.canvas`
   vanished from the adapter and white was rebound as `color.surface.secondary`. The serious one is that
   `compatibility.ts:24` stopped firing `contrast-failure`, so **near-white-on-white silently degraded
   from `incompatible` to `compatible-with-warnings`** — a safety check that had stopped working. Fixed
   in `src/theme/` with a `document-canvas` rule kind. Only a selector allowlist was test-side. Detail
   in `03e-`.
3. **`smoke-reconstruction-qa` — 4 of 4 stale tests.** Measured, not argued: the clone's real `<html>`
   is now `rgb(17, 24, 39)` at all four page/viewport combinations, so the "white canvas" named in the
   checks' own titles *was* the bug being fixed. The **fixture** was changed to construct a mismatch
   deliberately, with a promoted page as a positive control; three assertions untouched, one
   **strengthened**, count still 211. Detail in `03e-`.
4. **`smoke-visual-editor` — test-side synchronisation.** `src/editor/client.ts:428` always re-assigns
   `#wr-frame.src`, so selecting the route already on screen still reloads the preview ~600 ms later; the
   suite's helper waited on conditions that were already true, and the click straddled the document swap
   — mousedown and mouseup on two documents, so **no `click` event was produced at all**. A replay
   harness reproduced it at 1/20 idle and 2/80 under CPU load, and 0/80 after the fix. No timeout was
   raised. Detail in `03f-`.

## Anti-gaming evidence

No assertion was deleted, weakened, skipped or made vacuous. Each repair carries a measurement that
would have caught it if it had been:

| repair | pre-fix failure count | negative control |
| --- | --- | --- |
| probe floor | reverted in place → 129/130, exactly the one expected check; restored, `shasum -a 256` byte-identical | — |
| theme canvas | 40/47 | inject `.card` into every paint group → **46/47** |
| rqa fixture | 207/211 | neuter `canvasMismatchedProperties` → **206/211**, exactly the 4 target checks + the unit-level detector |
| editor sync | 1/20 idle, 2/80 loaded | 0/80 loaded after fix; three consecutive clean runs, 50/50 each |

Both mutations were reverted and confirmed by `shasum -c`.

## Two defects in the regression harness itself, found by this run

The harness is `tmp/wr2875/orch/run-regression.sh`. It enumerates suites from disk rather than from a
list, so a new suite cannot hide, and it carries a per-suite delta column against the 28.7 baseline.
Both of the following were found while reading its own output, and both are fixed:

1. **It under-reported failures.** `smoke-theme` was recorded as `failures=0` while its own trailer said
   `40/47 checks passed`. The parser only understood the `N checks, M failures` form and left the `N/M
   checks passed` form at zero. The suite was caught by its non-zero exit code — meaning the column built
   to make the run auditable was itself reading zero. Now the `N/M` form derives `total − passed`, and
   every suite additionally gets an independent count of `FAIL` lines in its own log, annotated
   `fails(log:N)` whenever the two disagree. Two measurements that must agree, instead of one that can
   quietly say zero.
2. **A third trailer form was unrecognised.** `smoke-visual-vocab` prints `smoke-visual-vocab: 88 passed,
   0 failed` and was recorded `UNPARSED`. Its 88 checks are real and independently confirmed by 88 `PASS`
   lines in its log; they are included in the 4,663. The parser now understands that form too.

A cosmetic bug in the first fix (a stray newline inside the `failures` field, from `grep -c` printing `0`
*and* a fallback `echo 0` firing on grep's non-zero exit) split rows in `index.tsv` for this run. It is
fixed. It did not affect any check count, exit code or delta — the authoritative numbers above were read
from `freeze-run2.log`, and the suite-level facts are unambiguous there.

## Artifacts

| | path |
| --- | --- |
| run 1 (pre-repair) | `tmp/wr2875/regression-run1/freeze-run.log`, `…/index.tsv` |
| run 2 (core freeze) | `tmp/wr2875/regression/freeze-run2.log` |
| per-suite logs | `tmp/wr2875/regression/<suite>.log` |
| 28.7 baseline | `tmp/wr2875/regression/baseline-287.tsv` |
