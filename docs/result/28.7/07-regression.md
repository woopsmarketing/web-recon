# Task 28.7 — 07 Regression (Program I)

ONE authoritative full regression, at the end of the wave, enumerated by filename from disk rather
than from `package.json`. Runner: `tmp/wr287/orch/run-regression.sh`. Re-parse of every suite log
with all four trailer formats: `tmp/wr287/orch/parse-regression.py` → `tmp/wr287/regression/parsed.json`.

---

## HEADLINE

| | |
|---|---|
| suite files on disk (`scripts/smoke-*.ts`) | **36** |
| suites carrying assertions | **35** |
| suites carrying **no** assertions | **1** — `smoke-playwright` |
| checks | **4,326** |
| failures | **0** |
| non-zero exit codes | **0** |
| `pnpm typecheck` | exit **0** |
| negative count deltas vs the 28.5B battery | **0** |
| suites wired to a `package.json` script | 36 of 36 |

**Two suites failed on the first pass. Both were pre-existing breaks, both are repaired, and both
are described below rather than re-run until green.** The headline is the state after the repairs,
each of which was verified by re-running the affected suite plus its downstream consumer.

`smoke-playwright` is a Chromium connectivity probe. Its entire output is
`[smoke] OK — Chromium launched, title: "Example Domain"`. It asserts nothing and contributes 0 to
the check total. It is enumerated, not counted — §40 asked for exactly this to be identified
separately.

## THE PARSER, AND WHY THE FIRST NUMBER WAS WRONG

The suites print four different trailer formats. The runner's parser knew two, so its live table
reported `UNPARSED` for four suites and would have silently under-counted by 293 checks had the
totals been taken from it:

| format | example | suites |
|---|---|---|
| `N/N checks passed` | `[smoke:layout-safety] 325/325 checks passed` | 22 |
| `… — N checks, M failures` | `smoke:release — 275 checks, 0 failures` | 9 |
| `N passed, M failed` | `smoke-visual-vocab: 88 passed, 0 failed` | 1 |
| failure trailers | `FAILED: 2`, `[smoke:multi-observer] FAILED — 1 check(s) failed` | 2 (pre-repair) |
| none | `[smoke] OK — Chromium launched` | 1 (`smoke-playwright`) |

Every log is additionally grepped for `FAIL`-prefixed lines independently of the trailer, so a suite
that printed a green trailer while failing a check would still be caught. Nothing is dropped: a log
that matches no pattern is reported as `UNPARSED` with its last line, and `smoke-playwright` is the
only one left in that state.

## THE TWO FAILURES

### F1 — `smoke-qa-independence`, 2 checks. A 28.6 change broke a 28.5B invariant, and no full regression had run since.

```
FAIL  QA keeps every property the Observer records (no coverage loss)
      — missing border-collapse, border-spacing, table-layout, caption-side, empty-cells
FAIL  every property the old alias covered is still captured (no coverage loss) — (same five)
```

**Cause, located at file:line.** Task 28.6 W6 O5 added five table-formatting properties to the
Observer's `STYLE_WHITELIST` (`src/observer/types.ts:551-564`) and did not mirror them into QA's
independent vocabulary `QA_STYLE_PROPERTIES` (`src/reconstruction-qa/capture-page.ts:84`). The
28.5B design makes the two lists deliberately separate but requires QA to be a **superset** — the
file's own header says "every property in `STYLE_WHITELIST` at the time of writing appears below,
because QA must never lose coverage" — and `smoke-qa-independence` asserts it.

**28.6 ran no full regression** (its master report says so, §4: "No full regression suite was run
this wave"), so this has been red since 28.6 landed. This is the first authoritative full
regression after it, and finding this is the argument for the §40 contract.

**Consequence while it was red:** reconstruction-QA was blind to exactly the property family 28.6
had just measured growing hobbang.net's five tables by up to +82px and overflowing their wrappers.
The observer recorded the properties; the QA that is supposed to catch their divergence did not
capture them.

**Repair.** The five properties added to `QA_STYLE_PROPERTIES`, in the same position and grouping
`STYLE_WHITELIST` uses, with the provenance in a comment. Direction is the documented one (QA is
the superset); no assertion was weakened.

- `smoke-qa-independence` 99/101 → **101/101**, exit 0.
- `smoke-reconstruction-qa` re-run: **211/211**, exit 0 — unchanged. The addition widens capture and
  moves no verdict, because `diffStyles` iterates the SPEC's properties and cannot manufacture a
  mismatch from a property the spec never stored.

### F2 — `smoke-multi-observer`, 1 check. A 28.7 check of mine, brittle to 1ms.

```
FAIL  …and it reports honestly which conditions it reached and how long each took
      — {"dcl":true,"networkIdleMs":7999,"scrollMs":766,"tailMs":1200}
```

**Cause.** The check asserted `poll.settle.networkIdleMs >= 8000` on the endless-poll fixture.
`networkIdleMs` is `Date.now() - niStart` bracketing Playwright's own `waitForLoadState` timer
(`src/observer/observe-page.ts:1146-1156`), and `NETWORK_IDLE_TIMEOUT_MS` is 8,000. Two `Date.now()`
reads around another clock's 8,000 ms timeout land at the budget ±1–2 ms. Under full regression load
it read 7,999. **The implementation is correct; the assertion had a 1 ms race.**

**Repair, without weakening it.** The literal `8000` replaced by
`NETWORK_IDLE_TIMEOUT_MS - 50`, importing the real constant so an edit to the budget can no longer
silently desynchronise the test. Discriminating power is unchanged: this fixture polls forever, so
the wait can only end by exhausting its budget, and an early resolve would read ~0 — three orders of
magnitude from the threshold. The stronger, timing-free half of the claim is asserted on its own
separate check that passed throughout ("the endless-poll fixture really never reaches networkidle").

- `smoke-multi-observer` 262/263 → **263/263**, exit 0.

**Not blamed on the concurrent load.** A parallel agent was running the same suite when this fired,
and the temptation was to file it as contention and re-run. The measured value 7,999 against a
threshold of 8,000 is a specific, reproducible-in-principle defect in the assertion, and it is
recorded as one.

## RECONCILING 36 SUITES ON DISK AGAINST 28.5B's 34 — NO RESIDUE

Task 28.7's own start report flagged this delta as unreconciled. It reconciles exactly:

| | |
|---|---|
| Task-28 baseline battery (`docs/result/handoffs/28-final-regression.json`) | 29 suites |
| 28.5B new suites (visual-vocab, layout-safety, video-honesty, qa-independence, custom-properties) | +5 |
| **28.5B reported battery** | **34** |
| on disk | 36 |
| difference | `smoke-playwright` + `smoke-responsive-qa` |

**`smoke-responsive-qa` has never appeared in a counted regression battery.** It is not in the
Task-28 handoff's 29 and it is not among 28.5B's 5. It carries 205 real assertions and it grades the
responsive rubric — the instrument this whole wave depends on. It is included from now on. That it
was outside every previous reported total is a reporting gap in earlier waves, found here.

## PER-SUITE DELTA — EVERY SUITE, AGAINST THE 28.5B BATTERY

Zero negative deltas. Sources: `task28` per-suite counts from `docs/result/handoffs/28-final-regression.json`;
28.5B's five new-suite counts from its own master report §"New suite counts".

| suite | 28.5B | 28.7 final | Δ |
|---|---:|---:|---:|
| layout-safety | 67 | 325 | **+258** |
| sitespec | 257 | 466 | **+209** |
| multi-observer | 62 | 263 | **+201** |
| reconstruction-qa | 134 | 211 | +77 |
| brand-assets | 141 | 162 | +21 |
| selector | 81 | 93 | +12 |
| reconstruction | 217 | 227 | +10 |
| production | 132 | 133 | +1 |
| the other 26 suites | — | — | **+0 each** |
| **34-suite battery total** | **3,332** | **4,121** | **+789** |
| `smoke-responsive-qa` (newly counted) | — | 205 | |
| **35 assertion suites** | | **4,326** | |

`3,332 + 22 = 3,354`, 28.5B's reported figure — the 22 being the `+1 production` / `+21 brand-assets`
that 28.5B itself attributed to the intermediate 28.5A window, and both are visible in the table
above. Everything ties with nothing left over.

### The part of that growth attributable to Task 28.7

Measured against each suite's value at this wave's own start, taken as each work package began:

| suite | at 28.7 start | 28.7 final | Δ |
|---|---:|---:|---:|
| multi-observer | 173 | 263 | +90 |
| layout-safety | 222 | 325 | +103 |
| responsive-qa | 120 | 205 | +85 |
| selector | 84 | 93 | +9 |
| reconstruction | 227 | 227 | 0 |
| sitespec | 466 | 466 | 0 |
| **28.7 total** | | | **+287** |

The remaining +502 of the +789 predates this wave and belongs to 28.6, whose additions to
`sitespec`, `reconstruction-qa`, `reconstruction` and `layout-safety` were never counted in a full
battery. **This is derived by subtraction, not measured**: no per-suite snapshot was taken at the
28.7 baseline, which is a gap in this wave's own start record. It is corroborated on the one suite
with values at both ends — `layout-safety` 67 (28.5B) → 222 (28.7 start) → 325 (now).

## HONESTY NOTES

- **No suite was retried to get a pass.** The two failures were diagnosed to a file and line and
  repaired at the cause; each was then re-run once to confirm.
- **The counts are the suites' own trailers**, re-parsed with every format, cross-checked against an
  independent `FAIL`-line grep. The independent architecture auditor separately re-ran typecheck,
  selector, layout-safety, responsive-qa and multi-observer and reproduced every count.
- **`smoke-e2e` runs a real pipeline** (observation → reconstruct → build → QA on a local fixture
  site) and took ~7 minutes. It is a real suite, 130 checks, exit 0.
- **The battery ran serially**, but other agents were running suites concurrently on the same
  machine during part of it. That is a real risk to timing-sensitive checks and it materialised
  exactly once, as F2 — which was a genuine assertion defect, not contention.
- **Wall time** ≈ 50 min for the 36-suite pass, plus the repair re-runs.

---

## APPENDED 2026-09-05 — which regression artifact is authoritative

The independent adjudicator flagged that `tmp/wr287/regression/index.tsv` still shows
`multi-observer` and `qa-independence` at exit 1. **That file is correct and is deliberately left
alone: it is the FIRST-PASS record**, written live by the runner before either repair existed. Deleting
or rewriting it would erase the evidence that the two failures happened.

The authoritative post-repair artifacts are:

| artifact | what it is |
|---|---|
| `tmp/wr287/regression/index.tsv` | the first pass, as it ran, including both failures |
| `tmp/wr287/regression/parsed.json` | every suite re-parsed with all trailer formats, after the repairs |
| `tmp/wr287/regression/index-final.tsv` | the same, as a table — **the authoritative one** |
| `tmp/wr287/regression/*.log` | per-suite output; `multi-observer.log` and `qa-independence.log` are the post-repair re-runs |
| `tmp/wr287/regression/typecheck.log` | `pnpm typecheck`, exit 0 (run after the battery; the runner script omitted it) |
