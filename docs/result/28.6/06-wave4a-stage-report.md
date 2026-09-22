# Task 28.6 — Wave 4a Stage Report

- Date: 2026-09-03. 8 agents, 0 errors. No git mutation.
- All four builders COMPLETE; all four independent verifiers PASS_WITH_CORRECTIONS.
- `pnpm typecheck` exits 0.

| Lane | Scope | Verdict |
|---|---|---|
| INSTRUMENT | responsive-QA repair after its FAIL | PASS_WITH_CORRECTIONS |
| RECON-D | band edges snapped to authored breakpoints | PASS_WITH_CORRECTIONS |
| OBS-D | probe widths derived from authored breakpoints | PASS_WITH_CORRECTIONS |
| MISC-D | sitespec + reconstruction-qa corrections | PASS_WITH_CORRECTIONS |

## 1. The instrument is repaired, and no verdict moved

The subsystem that FAILED its Wave-3 audit now measures what it claimed to. Critically, **the
repair changed what is measured, not who is graded**: all ten Linear pairs held their verdict
(5 BLOCKER / 3 MAJOR / 2 MINOR / 0 PASS) across the before and after runs.

What did move went one way only. Missing-text rose on **10 of 10 pairs**, monotone in the
anti-false-pass direction:

| Pair | before | after | Pair | before | after |
|---|---|---|---|---|---|
| `/`@390 | 112 | 180 | `/pricing`@390 | 0 | 9 |
| `/`@700 | 3467 | 4041 | `/pricing`@700 | 13 | 22 |
| `/`@1024 | 659 | 716 | `/pricing`@1024 | 29 | 38 |
| `/`@1100 | 551 | 608 | `/pricing`@1100 | 69 | 80 |
| `/`@1440 | 266 | 323 | `/pricing`@1440 | **0** | **7** |

That last row is the whole point. `/pricing`@1440 read a false 0.0000, and its `samples[0]` is now
literally `"us$"` — the dropped currency prefix is in the channel. The trust gate on `/`@700
flipped to `false` at its measured 0.3374, correctly suppressing a position MAJOR that had rested
on 23 ambiguous icon pairings.

**Attribution is clean.** `sourceVisibleChars` is byte-identical before and after on all five `/`
pairs and exactly +38 on all five `/pricing` pairs, +38 being precisely the shadow-root text the
new census can see. The live source did not drift, so every delta above is the code.

The subsystem went from **zero** automated checks to 68, and all ten are mutation-proven: each
breaks one invariant, runs the suite, restores the file and verifies the sha256 matches.

The lane also independently reproduced the auditor's ink measurement **to the pixel**
(`sourceInkPixels` 259,703 = 0.028357 of area), which establishes that the 1% MINOR band is 35% of
everything the page draws, and the best-in-class 1.51% residual is 53.29% of it.

## 2. Band snapping works, and is inert on the corpus we have

The mechanism is correct and pinned by 38 permanent checks and 8 mutations, including a real
Chromium proof that the midpoint band hides at 1024/1025/1231 while the snapped band does not.

But two measurements have to be read together:

- **Counterfactual:** adding one authored `(max-width: 1024px)` declaration to `/pricing` moves all
  **503** rules from `(max-width: 1231.98px)` to `(max-width: 1024.98px)`. 503 snapped, 0 ambiguous.
- **Reality on this corpus:** with snapping live versus forced inert, the output is *identical* —
  1742 rules, same sha256, 198,645 bytes of layout CSS, same sha256.

Both are true because the 28.5B SiteSpec is schemaVersion 4 and carries no `authoredBreakpoints`.
The mechanism cannot fire on an artifact that predates the field. **This is precisely why the
Linear closure gate re-observes from scratch rather than reusing 28.5B.**

## 3. Probe widths now come from the site, not from a constant

`linear.app/pricing`: 31 authored conditions to 14 screen breakpoints to the width set
`390, 640, 641, 700, 768, 769, 928, 929, 1024, 1025, 1100, 1280, 1281, 1440, 1441, 1920`.
**1024 and 1025 are both sampled** — the boundary the whole Linear defect turns on.
`stripe.com`: 40 conditions to 21 breakpoints.

Honest about its costs and its caps:

- ~0.29 s per added width on Linear, ~0.37 s on Stripe; `layout-probe.json` +121% / +119%.
- **The cap bites and says so**: Linear refused 4 of 14 breakpoints, named individually in the
  artifact (min@1536, max@600, max@1140, max@1439); Stripe desktop refused 12 of 21.
- Provenance per width: `1024 = {source: "floor", alsoAuthored: true}`,
  `1025 = {source: "authored-above"}`. Counters reconcile: folded 14 = adopted 6 + alreadyBracketed
  4 + outOfRange 0 + droppedByCap 4.
- Determinism is pinned by a *falsifiable* check, and the lane said so rather than overselling the
  weaker one: the 120-permutation test is a regression guard because the fold's output is already
  sorted; the real pin is a rank-order assertion under the cap.
- Six distinct degradation states are checked separately, so "authors no breakpoints", "stylesheets
  unreadable", "floor already brackets them" and "width budget full" can never be confused.

## 4. Suite counts after Wave 4a

| Suite | Checks |
|---|---|
| sitespec | 466 |
| reconstruction | 222 |
| reconstruction-qa | 211 |
| layout-safety | 183 |
| multi-observer | 145 |
| e2e | 130 |
| custom-properties | 92 |
| **responsive-qa (new)** | **68** |

All 0 failures. The responsive-QA suite did not exist before this wave.

## 5. What this wave hands to Wave 5

Every engine change is now landed and the corpus that would prove it is stale. Wave 5 runs the
Linear closure gate on a fresh observation plus the first three pilots, in parallel, and its
measurements are the verification — a real Korean site nobody tuned the engine against is stronger
evidence than any further code audit.
