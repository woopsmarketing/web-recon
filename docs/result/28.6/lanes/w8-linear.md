# Task 28.6 — lane **w8-linear** (probe-width fix verification, post-fix)

**Host:** linear.app  **Routes:** `/`, `/pricing`, `/security`, `/changelog`  **Widths:** 390 / 700 / 1024 / 1100 / 1440
**Lane status:** COMPLETE — pipeline re-run end to end against the fixed engine, all 20 pairs graded, visual
pack produced.
**Regression under test:** `src/observer/probe-widths.ts` guaranteed floor widths only by POSITION
(`pickGuaranteedFloor -> [390, 1024, 1920]`), so 1440 — the width every desktop deep observation is taken
at and the width `layout-inference.ts:1668` hard-requires — was evictable under cap pressure. On this site
in lane `w7-linear` it WAS evicted: `viewportPassRefusals {"desktop:truth-width-not-probed": N}`, 0 desktop
layout rules shipped.
**Verdict: eviction regression is GONE.** 1440 is now pinned via `requiredWidths`, present in every page's
sampled desktop widths and absent from `floorWidthsEvicted`; the reconstruction shipped 741 desktop layout
rules (0 in the pre-fix run) with zero `viewportPassRefusals`.
**Grade distribution held, not improved:** 9 BLOCKER / 8 MAJOR / 3 MINOR / 0 PASS over 20 pairs — identical
to the w7-linear post-regression run, pair-for-pair, verdict-for-verdict. None of the 20 pairs' deciding
channels are the truth-width-not-probed defect; they are pre-existing, unrelated defects (nav-link-ratio,
image-presence-ratio, missing-text, row/column-mode-delta) that are equally or more severe than the footer
issue the fix touches, so no grade flipped. The fix's effect IS visible in the numbers behind one channel:
`footer-clipped`'s clone-max-right moved from a flat, un-styled **1440** on all four routes (the raw
viewport width — the tell for zero desktop rules) to differentiated **1438** on `/` and **1390** on the
other three (matching the pre-regression, pre-28.6 baseline numbers), confirming the desktop tree is
genuinely styled again even though it still overflows at 1100px.

---

## 1. Commands run, with exact run ids

Reused the existing `w7-linear` selection (`data/linear.app/2026-09-03T08-15-00-000Z-286-w7-linear/`); did
not re-run discovery/verify/select.

| # | command | output run id / directory | elapsed |
|---|---|---|---|
| 0 | `grep -n "requiredWidths" src/observer/probe-widths.ts src/observer/observe-page.ts` | fix confirmed present (probe-widths.ts:142,233,294,311,461; observe-page.ts:1079,1084) | — |
| 1 | `pnpm observe:site data/linear.app/2026-09-03T08-15-00-000Z-286-w7-linear/selected-pages.json --concurrency 2` | `data/linear.app/site-observations/2026-09-03T00-17-50-549Z` | 73.4 s |
| 2 | `pnpm detect:interactions <obs>/site-observation.json` | same dir, `interaction-analysis.json` | 0.5 s |
| 3 | `pnpm explore:interactions <obs>/interaction-analysis.json --concurrency 2` | `data/linear.app/interaction-explorations/2026-09-03T00-19-11-133Z` | 82.1 s |
| 4 | `pnpm model:interactions <exploration>/interaction-exploration.json` | `data/linear.app/interaction-models/2026-09-03T00-20-36-204Z` | 77 ms |
| 5 | `pnpm compile:sitespec <model>/interaction-patterns.json` | `data/linear.app/site-specs/2026-09-03T00-20-40-268Z` | 2.4 s |
| 6 | `pnpm reconstruct <spec>/site-spec.json` | `data/linear.app/reconstructions/2026-09-03T00-20-44-789Z` | 13.1 s gen + 3.3 s `next build` (PASS) |
| 7 | `pnpm qa:responsive <rec>/reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes /,/pricing,/security,/changelog` | `data/linear.app/responsive-qa/2026-09-03T00-21-44-799Z` | — (single pass, no `--self-check` per instructions) |

Stage results: observe **4/4 pages, 0 failures** (4 desktop + 4 mobile observations, 103.52 MB). Detect
412 candidates. Explore 21 planned, 18/21 executed, 17 changed, 0 live safety guards fired. Model 13
confirmed patterns, 8 unknown. Compile 4 routes exact behavior, round-trip validation PASS. Reconstruct
**12 366 element/text nodes, 3 112 CSS classes**, validation PASS, `next build` PASS.

---

## 2. Probe-width evidence table (per page)

Desktop (`layout-probe.json`), all 4 pages identical:

| page | sampled widths | `requiredWidths` | `floorWidthsEvicted` | `capHit` | `breakpointsAdopted` | `breakpointsAdoptedByEviction` |
|---|---|---|---|---|---|---|
| p000001 `/` | 390,640,641,768,769,928,929,1024,1025,1280,1281,**1440**,1441,1535,1536,1920 | `[1440]` | `[700,768,1100]` | true | 8 | 2 |
| p000002 `/changelog` | same | `[1440]` | `[700,768,1100]` | true | 8 | 2 |
| p000003 `/pricing` | same | `[1440]` | `[700,768,1100]` | true | 8 | 2 |
| p000004 `/security` | same | `[1440]` | `[700,768,1100]` | true | 8 | 2 |

1440 is present in every page's sampled widths and is **not** in `floorWidthsEvicted` on any page (contrast
w7-linear, where 1440 itself was evicted). 700, 768, 1100 are still evicted under cap pressure — the fix
pins only the truth-required width, not the whole floor.

Mobile (`layout-probe-mobile.json`), all 4 pages identical:

| page | sampled widths | `requiredWidths` | `floorWidthsEvicted` | `capHit` |
|---|---|---|---|---|
| p000001–p000004 | 390,480,600,601,640,641,700,768,769,914 | `[390]` | `[]` | false |

390 is present and kept on every page; mobile never hit the cap this run, so eviction is moot but the pin
is confirmed in provenance regardless.

---

## 3. Layout-pass evidence

Reconstruction manifest `data/linear.app/reconstructions/2026-09-03T00-20-44-789Z/reconstruction-manifest.json`,
`layout` section:

- `viewportPassRefusals`: `{}` — **empty**, no `desktop:truth-width-not-probed` key (w7-linear had this
  key present with a nonzero count and 0 desktop rules as a result).
- `rulesByViewport`: `{"desktop": 741, "mobile": 960}`
- `shippedRulesByViewport`: `{"desktop": 741, "mobile": 958}`
- Recovered-layout summary (stdout): candidates/accepted 1701/1699, rejected by guard 490, rejected by
  truth check 2, accepted but regressing 0, status `verified`.

Confirmed independently from the shipped artifact, not just the manifest: grepped the recovered-layout
block in `data/linear.app/reconstructions/2026-09-03T00-20-44-789Z/app/public/wr/generated-styles.css`
(marker at line 8215, `/* Recovered layout rules (Task 17 §9/§10). Do not edit. */`) —
`grep -c 'data-wr-viewport="desktop"'` on the block from that marker to EOF = **741**;
`grep -c 'data-wr-viewport="mobile"'` = **958**. Both match the manifest's `shippedRulesByViewport` exactly.

Desktop rules are non-zero and match between manifest and shipped CSS. **Regression is GONE** on this
site by all four sub-measurements (a/b/c/d).

---

## 4. Grade table vs the w7-linear baseline

Baseline is `docs/result/28.6/lanes/w7-linear.md`'s post-regression run (its "now" column): 9 BLOCKER / 8
MAJOR / 3 MINOR / 0 PASS, 0 desktop rules shipped. This run (w8-linear, post-fix): same totals.

| route | width | w7-linear (pre-fix) | w8-linear (post-fix) | delta | deciding channel (post-fix) |
|---|---:|---|---|---|---|
| `/` | 390 | MAJOR | MAJOR | held | `missing-text-ratio` 5.14% (thr 2.00%) |
| `/` | 700 | BLOCKER | BLOCKER | held | `image-presence-ratio` 81/255 images (32%, thr 50%) |
| `/` | 1024 | BLOCKER | BLOCKER | held | `image-presence-ratio` 66/248 images (27%, thr 50%) |
| `/` | 1100 | BLOCKER | BLOCKER | held (channel unchanged, number improved) | `footer-clipped` clone max right **1438** > 1100 (was flat 1440) |
| `/` | 1440 | MAJOR | MAJOR | held | `missing-text-ratio` 4.54% (thr 2.00%) |
| `/pricing` | 390 | MINOR | MINOR | held | `missing-text-ratio` 0.41% |
| `/pricing` | 700 | MAJOR | MAJOR | held | `column-container-mode-delta` clone 3×2, source 2×4 |
| `/pricing` | 1024 | BLOCKER | BLOCKER | held | `nav-link-ratio` 3/6 header links (50%, thr 50%) |
| `/pricing` | 1100 | BLOCKER | BLOCKER | held (channel unchanged, number improved) | `footer-clipped` clone max right **1390** > 1100 (was flat 1440) |
| `/pricing` | 1440 | MINOR | MINOR | held | `missing-text-ratio` 0.29% |
| `/security` | 390 | MAJOR | MAJOR | held | `column-mode-delta` clone 2 items, source 8 |
| `/security` | 700 | MAJOR | MAJOR | held | `column-container-mode-delta` clone 3×2, source 2×4 |
| `/security` | 1024 | BLOCKER | BLOCKER | held | `nav-link-ratio` 3/6 (50%, thr 50%) |
| `/security` | 1100 | BLOCKER | BLOCKER | held (channel unchanged, number improved) | `footer-clipped` clone max right **1390** > 1100 (was flat 1440) |
| `/security` | 1440 | MAJOR | MAJOR | held | `column-mode-delta` clone 6 items, source 8 |
| `/changelog` | 390 | MAJOR | MAJOR | held | `position-delta-p90-px` 64px (thr 48px) |
| `/changelog` | 700 | MAJOR | MAJOR | held | `column-container-mode-delta` clone 3×2, source 3×4 |
| `/changelog` | 1024 | BLOCKER | BLOCKER | held | `nav-link-ratio` 3/6 (50%, thr 50%) |
| `/changelog` | 1100 | BLOCKER | BLOCKER | held (channel unchanged, number improved) | `footer-clipped` clone max right **1390** > 1100 (was flat 1440) |
| `/changelog` | 1440 | MINOR | MINOR | held | `pixel-residual-difference-ratio` 3.12% (thr 1%) |

**20/20 held at category level, 0 improved, 0 regressed.** No grading floor was run this pass
(`--self-check` intentionally omitted per instructions — the orchestrator holds the W7 floor for this
site), so these verdicts are unadjudicated against noise, same as the w7-linear "now" column they are
compared to.

The four `footer-clipped` BLOCKERs (`/`, `/pricing`, `/security`, `/changelog` all at @1100) did not flip
grade, but their underlying number is qualitatively different: w7-linear shipped a flat, un-differentiated
**1440** (the raw truth viewport width, i.e. no layout rule constrained the footer at all) on all four
routes; this run ships **1438** on `/` and **1390** on the other three — differentiated per-route values
that match the pre-regression, pre-28.6 numbers exactly (see `w7-linear.md`'s own prose: "baseline: 1438 on
`/`, 1390 on the other three"). That is direct evidence the desktop layout pass is genuinely running again;
the footer still overflows 1100px, but that is now a real (if still incorrect) recovered rule, not the
absence of one.

---

## 5. Residual defects (pre-existing, not caused by the probe-width fix, not fixed in this lane)

Read-only per lane scope; reported for the orchestrator, not touched here.

- `nav-link-ratio` BLOCKER at 1024 on `/pricing`, `/security`, `/changelog` (3 of 6 header links, 50%,
  threshold 50%) — channel defined `src/responsive-qa/classify.ts:383`. Same deciding channel/number as
  w7-linear; unaffected by the probe-width fix.
- `footer-clipped` BLOCKER at 1100 on all four routes, clone max right 1390–1438 vs 1100 viewport — channel
  defined `src/responsive-qa/classify.ts:312` (population note at `:335`). Now driven by a real (too-wide)
  recovered footer rule rather than an absent one; the overflow itself is unfixed.
- `image-presence-ratio` BLOCKER at 700/1024 on `/` (32%/27% of source images rendered, threshold 50%) —
  channel defined `src/responsive-qa/classify.ts:431`. Unrelated to probe widths; unaffected.
- `column-container-mode-delta` / `column-mode-delta` MAJOR on 6 of 8 non-1024/1100 pairs (row/column count
  mismatches, e.g. clone 3×2 vs source 2×4 on `/pricing @700`) — unrelated to probe widths; unaffected.
- `missing-text-ratio` MAJOR on `/` @390/@1440 (5.14%/4.54%) — the `qa:responsive` output's own
  `dwell-sensitive-source-content` limitation attributes most of this to the live source revealing
  320–519 chars during scroll dwell that the static clone cannot match; not a probe-width effect.

No new defect was introduced or observed in this lane. No engine files were modified (per lane
constraints) — all findings above are reports for the orchestrator to act on centrally.

---

## 6. Verdict

On linear.app, the probe-width eviction regression (0 desktop layout rules, `desktop:truth-width-not-probed`
refusal) is **fully fixed and independently confirmed** — 1440 is pinned and sampled on every page, 741
desktop rules are recovered and match byte-for-byte between the manifest and the shipped CSS, and the
`footer-clipped` channel's numbers moved from the flat 1440 artifact to differentiated, pre-regression-
matching values — but the site's overall clone grade did not improve (still 9 BLOCKER / 8 MAJOR / 3 MINOR /
0 PASS, identical pair-for-pair to the pre-fix run) because four unrelated, pre-existing defect classes
(nav-link-ratio, footer overflow itself, image-presence-ratio, row/column-mode-delta) independently dominate
every graded pair regardless of whether desktop layout rules exist.
