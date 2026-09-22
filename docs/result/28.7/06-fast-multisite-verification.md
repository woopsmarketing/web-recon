# Task 28.7 — 06 Fast Multi-Site Verification (Program H)

Task 28.7 deliberately avoided another 7-site × many-width run. This is the fast canary matrix
instead: **24 pairs across 4 sites**, all with a freshly measured self-check floor, all under rubric 4,
all with coverage conservation asserted.

---

## FINAL MATRIX

| canary | site | routes | widths | pairs | BLOCKER | MAJOR | MINOR | PASS |
|---|---|---|---|---|---|---|---|---|
| A — hard | linear.app | `/`, `/pricing` | 390, 700, 1024, 1100, 1440 | 10 | 6 | 2 | 2 | 0 |
| B — easy/static | hobbang.net | `/`, `/링크모음/검색/` | 390, 1100, 1440 | 6 | **0** | 2 | 4 | 0 |
| C — medium/dynamic | gs.severance.healthcare | `/gs/index.do`, `/gs/news/news/notice.do` | 390, 1100, 1440 | 6 | 2 | 3 | 1 | 0 |
| D — observer safety | seoultone.kr | `/` | 390, 1440 | 2 | 2 | 0 | 0 | 0 |
| | | | **total** | **24** | **10** | **7** | **7** | **0** |

Run ids: linear `2026-09-04T17-25-07-319Z` · hobbang `2026-09-04T18-17-44-481Z` ·
severance `2026-09-04T18-15-04-161Z` · seoultone `2026-09-04T18-18-47-244Z`.
**Coverage conserved on all four runs**; 0 clone-route-missing, 0 source-capture-unstable,
0 measurement-failed. Every pair was actually graded — none of the improvement is from having
stopped measuring.

## CANARY D — THE 28.6 P0, ANSWERED

The primary question for seoultone.kr was: *does observation and reconstruction complete at all,
after navigation-safe scroll preparation?* In 28.6 it did not — `prepareScroll` navigated
mid-observation, the execution context was destroyed, the page recorded `observation-error`, the route
lost its `renderSourcePageId`, and `pnpm reconstruct` refused outright.

**It completes.** All 13 pages observed, reconstruction built, QA ran, both pairs graded. The brief did
not require perfect visual closure here and does not get it (2 BLOCKERs, `missing-text-ratio` 0.305 /
0.278), but the whole-route-loss failure mode is gone.

## WHAT THE BLOCKERS ACTUALLY ARE NOW

The value of this run is not the tally — it is that the causes are cleanly separated.

### linear.app — 5 of 6 BLOCKERs are ONE defect class

| pair | leading findings |
|---|---|
| `/`@700 | `footer-clipped 1.000`, `offscreen-text-excess-chars 1127`, `missing-text-ratio 0.107` |
| `/`@1024 | `footer-clipped 1.000`, `offscreen-text-excess-chars 918` |
| `/`@1100 | `footer-clipped 1.000`, `offscreen-text-excess-chars 733` |
| `/pricing`@1100 | `footer-clipped 1.000`, `offscreen-text-excess-chars 175` |

All four are **the A9 residual frozen width**: the right DOM tree is now mounted, the content is all
present, and it is in the wrong place — a footer laid out at its 1440-resolved pixel width, overflowing
a narrower viewport. `/`@390 is the fifth (`offscreen-text-excess-chars 200`), same family.

**This is honest progress that the tally hides.** Before the DOM-family fingerprint landed, `/`@700 and
`/`@1024 were BLOCKERs for a *different* reason — the clone was serving the 390 px mobile snapshot, so
`image-presence-ratio 0.379`, `visible-text-ratio 0.478` and `nav-link-ratio 0.500` all fired. Those
channels are now silent and `missing-text-ratio` fell 0.4915 → 0.1071 at 700 and 0.5425 → 0.0774 at
1024. The count did not move; the defect underneath it was replaced by a narrower one.

`/pricing`@1024 is the one remaining tree-selection BLOCKER (`nav-link-ratio 0.500`): the fingerprint
places that route's swap at 1025, so 1024 is served the mobile tree, while the live source at 1024
shows the desktop navigation. Only two DOM trees are ever observed, so this width has no third variant
to serve — it is recorded as a named limitation, not silently papered over.

### gs.severance.healthcare — 2 BLOCKERs, both real
`overlap-excess-ratio` 0.448 @1100 and 0.343 @1440 on the homepage, with `position-delta-p90-px`
1205 / 1308. **Zero pairs were demoted by the duplicate-image-layer guard on this site**, so these are
true layout overlaps, not the crossfade artefact the guard exists to separate. A genuine defect.

### seoultone.kr — 2 BLOCKERs, real content loss
`missing-text-ratio` 0.305 / 0.278. Roughly 30% of the source's visible text is absent from the clone
at both widths. Not a measurement artefact.

### hobbang.net — the easy/static case holds
**0 BLOCKERs.** Two MAJORs, both at 1100: an `overlap-excess-ratio 0.056` on the homepage and a
`horizontal-overflow-excess-px 28` on the list route. Existing easy/static fidelity did not regress,
which was one of the task's explicit success conditions.

## TWO THINGS THE CANARY ITSELF CAUGHT

**1. A live-site outage was silently reconstructed as content.** The first linear run
(`2026-09-04T15-30-50-831Z`) captured, at the desktop viewport of `/` and `/changelog`, linear.app's own
proxy error page — `upstream connect error or disconnect/reset before headers` — as a 3-element
document. Observation status: `success`. The site-spec, the reconstruction and the QA all processed it
faithfully; QA graded `image-presence-ratio 0.000` and `missing-text-ratio 0.999` as *clone* defects.
The observer recorded no HTTP status for the main document at all. That gap is now closed (report 01),
and the run was discarded and re-run rather than reported.

**2. A green report was wrong.** The observer work package reported its suite at 218/218. A fresh run
by the orchestrator failed, and a second failed in a *different* section. Sent back for root cause
rather than retried, it turned out to be `page.screenshot({fullPage: true})` inheriting Playwright's
30 s default action timeout and throwing out of the viewport observation — losing the whole route.
The same P0 this task exists to close, through a second door, and it would fire on any slow real site.

## PROTOCOL NOTES

- No pair was excluded to improve a count. `coverage.conserved` is `true` on all four runs and the
  numeric buckets are all zero.
- `RUBRIC_VERSION` was bumped 3 → 4 by the QA-honesty work, and rubric-4 verdicts can be *better* than
  rubric-3 verdicts on the same clone. **28.6 and 28.7 pair counts must therefore not be summed or
  directly differenced**, and pre-existing self-check floors are not comparable — which is why every
  run here measured its own fresh floor.
- Driver: `tmp/wr287/orch/canary-site.sh`, carrying `set -o pipefail` from the start. The 28.6 wave lost
  a whole run because `pnpm reconstruct | tail` returned `tail`'s exit status and QA silently graded the
  previous day's reconstruction.

---

## APPENDED 2026-09-05 — the layout-counter delta between the gate run and the final run

The independent architecture audit flagged that the final linear reconstruction reports different
layout counters from the Program-E gate baseline and that no report tabulated it. It is tabulated
here. Both runs are linear.app; the left column is the §26 baseline reconstruction
`2026-09-04T16-18-35-699Z`, the right is the final canary reconstruction `2026-09-04T17-24-33-839Z`.

| counter | §26 baseline | final | |
|---|---:|---:|---|
| `candidateRules` | 1863 | 2123 | +260 |
| `recoveredRules` | 1861 | 2123 | |
| `acceptedRules` | 1861 | 2123 | |
| `acceptedUnchecked` | 0 | **0** | |
| `acceptedRegressed` | 0 | **0** | |
| `rejectedByTruthCheck` | 2 | **0** | the flagged change |
| `rejectedUnverifiable` | 0 | 0 | |
| `truthCheckable` | 1754 | 1660 | −94 |
| `bandCheckable` | 109 | 463 | +354 |
| `truthCheckRounds` | 9 | 8 | |
| `bandWidthsRendered` | 8 | 6 | |
| `fullWidth` / `percentage` / `gridTrackColumns` | 1556 / 46 / 84 | 1505 / 15 / 75 | |

**`rejectedByTruthCheck: 0` is not the gate going quiet.** The conservation holds:
`truthCheckable 1660 + bandCheckable 463 = 2123 = acceptedRules`, and `acceptedUnchecked` is **0**.
Every shipped rule went through one of the two verification paths; none regressed. What changed is
*which* path each rule took — the per-route tree switch changes the pageId/viewport buckets and the
band edges, moving 354 rules from the truth-check path to the band-check path — and the two rules
the earlier run rejected are not candidates in the new observation at all.

**These two runs are not a controlled A/B.** They were built from different observations
(`2026-09-04T15-48-30-262Z` vs `2026-09-04T17-21-07-726Z`) *and* across the per-route tree-switch
landing, so the +260 candidates cannot be attributed to either variable alone from these artifacts.
No such attribution is claimed anywhere in this wave's reports.
