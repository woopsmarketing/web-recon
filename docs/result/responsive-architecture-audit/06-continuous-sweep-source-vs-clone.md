# 06 — Continuous resize sweep: apartmentary.com SOURCE vs CLONE (P / C)

READ-ONLY. Nothing under `src/`, `data/`, existing docs, the generated app or git was modified. The clone was served with `next start -p 3291` from the existing build (`data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app`, `.next` already built — **no rebuild**), stopped at the end of this task. Work dir: `tmp/wr-resp-audit/sweep/`.

This extends `05-seven-region-provenance.md` (6 discrete widths: 390/700/1024/1100/1440/1920) to a **continuous resize sweep**: 99 widths from 390 to 2560, measured by actually resizing the viewport (`page.setViewportSize`) rather than reloading, so the sweep reproduces what a user dragging the browser edge would see — including the intervals *between* the widths the manual CSS patch (variant C) was hand-tuned at.

## 0. Method

- **Widths (99 total)**: 390→1920 step 20 (77 values), plus fine triplets around every known breakpoint — `{599,600,601}` `{800,801,802}` `{899,900,901}` `{930,940}` `{1199,1200,1201}` `{1439,1440,1441}` `{1535,1536,1537}` `{1919,1920}` — plus `2560` once. Viewport height fixed at 1000.
- **SOURCE** (`sweep.mjs source`, live `https://apartmentary.com/`): one page load (`networkidle`, `document.fonts.ready`), `reducedMotion:'reduce'` + injected `*{animation/transition-duration:0}` to kill CSS transitions, one lazy-scroll pass (0→bottom in 700px steps, back to top) at the initial width and a second pass on first crossing into the desktop range (≥901) to trigger any desktop-only lazy content. From there widths are swept **ascending, in place**, via `setViewportSize` + 280ms settle (no reload) — this is what makes it "continuous": MUI's `useMediaQuery` listeners and Swiper's resize handler both react to `resize`, exactly as in a real drag-resize.
- **CLONE-P / CLONE-C**: existing build served locally; Playwright request interception (`context.route('**/wr/generated-styles.css*', …)`) swaps the stylesheet body before any request — **no file on disk was changed**. Two variant bodies used, both frozen (read once) before the sweep:
  - **P** = `generated-styles.PIPELINE-reconstructed.css` (pure pipeline output, from `05`'s provenance dir)
  - **C** = the **current** `app/public/wr/generated-styles.css` (pipeline + manual fluid-desktop + layout-mode patches)
  Same ascending in-place resize technique (both trees — mobile and desktop — exist in the static markup; the 801px CSS breakpoint just toggles which one renders, so no reload is needed either).
- **Nodes**: the 22 ids named in the task (18 core provenance nodes + `n000039`/`n000040` floating CTA pair + `n000005` root + `n000053` hero track), addressed exactly as `05` does — SOURCE by structural child-index path under the first visible `.css-8atqhb`, CLONE by `[data-wr-viewport="desktop"] [data-wr-node="…"]` (first match with non-zero rect; null below the 801 breakpoint where the clone's desktop tree isn't rendered → recorded **n/a**, not mapped to a mobile node — the prior tooling has no mobile-node id table, matching the task's fallback instruction). Two extra container-only nodes (`n000207` pf1-wrapper, `n000546` ts-wrapper) were added solely to enumerate slide children for the card-count metric.
- **Per sample**: page `vw`, `scrollWidth`, `scrollHeight`, `overflowX = scrollWidth > vw+1`; per node `x/y/w/h/right` (`getBoundingClientRect`, page scrolled to `(0,0)` first); visible-child counts for the portfolio-1 (`n000207`), portfolio-2 (`n000433`), testimonial (`n000546`) wrappers (`right ≤ vw+1 && x ≥ -1`); footer link-row (`n000628`) distinct child x-count.
- **Deviation rule**: `FAIL` if `|Δx| > max(8, 2%·vw)` or `|Δw| > max(8, 2%·vw)`, evaluated independently per width, then consecutive failing sampled widths are merged into intervals. **`x` is excluded (`ignoreX`) for the three JS-driven swiper/track nodes** (`n000053`, `n000208`, `n000434`, `n000547`) per the task's instruction to ignore autoplay-driven transform/track position; their **width** is still compared.
- Raw output: `raw-source.json`, `raw-clone-P.json`, `raw-clone-C.json` (one file per target, `{widths, samples:{ [width]: {...} }}`). Derived: `summary.json` (fail intervals, overflow, count mismatches, height ratios). Scripts: `sweep.mjs`, `analyze.mjs`, `widths.mjs`, `nodes-sweep.json`.
- Server: `next start -p 3291` (root project's `node_modules/.bin/next`, no dependency install into the app dir, no build step — `.next/BUILD_ID` unchanged) — **stopped after this run**.

## 1. Per-node failing width intervals (P vs C)

Threshold = `max(8px, 2%·vw)`. "(none)" = passes at every sampled width from 390 to 2560. Intervals below 801 don't occur because desktop nodes are `n/a` there for the clone (excluded from the FAIL/PASS computation, not counted as failing).

| node | CLONE-P failing intervals | CLONE-C failing intervals |
|---|---|---|
| `n000005` page root | 1470–2560 | **(none)** |
| `n000050` hero box | 801–1410, 1470–2560 | **(none)** |
| `n000051` swiper-container | 801–1410, 1470–2560 | **(none)** |
| `n000053` swiper track (x ignored, width only) | 801–1410, 1470–2560 | **(none)** |
| `n000166` content wrapper | 1470–2560 | **(none)** |
| `n000170` exp group | 801–899, 1510–2560 | 801–899 |
| `n000174` exp text | 801–899, 1510–2560 | 801–899 |
| `n000192` pf1 heading row | 801–1410, 1470–2560 | 801–899 |
| `n000196` pf1 CTA | 900–1410, 1470–2560 | **(none)** |
| `n000208` pf1 slide0 (x ignored) | 801–1350, 1535–2560 | 801–899 |
| `n000418` pf2 heading row | 801–1410, 1470–2560 | 801–899 |
| `n000433` pf2 swiper-wrapper | 801–899, 1470–2560 | 801–899 |
| `n000434` pf2 slide0 (x ignored) | 801–1350, 1535–2560 | 801–899 |
| `n000528` ts 85% column | 900–1390, 1490–2560 | 801–899 |
| `n000530` ts banner img | 801–1390, 1490–2560 | 801–899 |
| `n000547` ts slide0 (x ignored) | 801–1330, 1550–2560 | 801–899 |
| `n000621` bottom img | 1470–2560 | **(none)** |
| `n000623` footer container | 1470–2560 | **(none)** |
| `n000628` footer link row | 900–1390, 1490–2560 | **(none)** |
| `n000700` footer link col3 | 900–1310, 1490–2560 | **(none)** |
| `n000039` floating wrapper | 801–1410, 1470–2560 | 801–899 |
| `n000040` floating button | 801–1410, 1470–2560 | 801–899 |

**Reading this**: for **P**, every node except the two that were already pipeline-correct in `05` (`n000170`/`n000433` at ≤1440) fails almost the *entire* desktop range — it only "passes" in a narrow band close to 1440 (e.g. 1411–1469 for most nodes) because P's frozen values happen to equal the source's value exactly at 1440, and the `max(8, 2%vw)` tolerance absorbs the surrounding few samples. **For C, 10 of 22 nodes fail nowhere in 390→2560, and the other 12 fail in exactly one interval, `801–899`, and nowhere else** — not at 1024/1100/1201/1439/1536/1920/2560, and not in any of the gaps between those points either.

## 2. Widths that PASS for every core node

| variant | PASS-all interval(s) (of the widths where clone data exists, i.e. ≥390 with desktop data ≥801) |
|---|---|
| CLONE-P | `1430–1450` only |
| CLONE-C | `900–2560` (i.e. everything except `801–899`) |

## 3. Overflow (`scrollWidth > innerWidth+1`)

**No overflow width was found for SOURCE, CLONE-P, or CLONE-C at any of the 99 sampled widths.** P's frozen-width nodes (e.g. `n000628` footer link row at `x=101–110` instead of `432` at ~1024–1200) are pushed *inward*/mispositioned inside their still-full-width parents, not pushed past the viewport edge — so P's defects show up as internal misplacement and squashed/duplicated card rows, not as a horizontal scrollbar. This is a distinct failure mode from the per-node position/width deviations above; scanning it separately across the full grid confirms it never occurs here.

## 4. Card / column count mismatches (clone vs source, desktop range only)

Visible-card definition: direct children of the row wrapper with `right ≤ vw+1 && x ≥ -1`.

| metric | CLONE-P mismatch intervals | CLONE-C mismatch intervals |
|---|---|---|
| portfolio-1 visible cards (`n000207` children) | `900–1370`, `1870–2560` | `801–899` |
| portfolio-2 visible cards (`n000433` children) | `900–1370`, `1870–2560` | `801–899` |
| testimonial visible cards (`n000546` children) | `801–1210`, `1830–2560` | `801–899` |
| footer link-row distinct columns (`n000628` children) | **(none)** | **(none)** |

Footer column *count* (3) is preserved by both variants everywhere it renders — only the row's *position* diverges (§1, `n000628`/`n000700`), not the column count. Portfolio/testimonial "3 visible per row" breaks for P in the mid-desktop band (900–1370/1210) *and* again above ~1830–1870, because P's per-slide width is frozen at the single width it was captured at (413.328px etc., per `05` region 3/4/5); C tracks the source's continuously-recomputed `calc((100% - 100px)/3)` slide width and only mismatches in the same `801–899` breakpoint-policy band as everything else.

## 5. Page height ratio (`cloneScrollHeight / sourceScrollHeight`), coarse sample

| width | source h | P clone h | P ratio | C clone h | C ratio |
|---|---|---|---|---|---|
| 390 | 4804 | 4804 | 1.000 | 4804 | 1.000 |
| 600 | 5447 | 4804 | 0.882 | 4804 | 0.882 |
| 800 | 5748 | 4804 | 0.836 | 4804 | 0.836 |
| 801 | 5762 | 6056 | 1.051 | 5493 | 0.953 |
| 900 | 6240 | 6056 | 0.971 | 5441 | 0.872 |
| 1200 | 5694 | 6056 | 1.064 | 5748 | 1.009 |
| 1440 | 6056 | 6056 | 1.000 | 6057 | 1.000 |
| 1920 | 6709 | 6056 | 0.903 | 6709 | 1.000 |
| 2560 | 7073 | 6056 | 0.856 | 7073 | 1.000 |

P's total page height is **frozen at 6056px from 801px upward** (it never grows), so the ratio drifts to 0.86 by 2560. C's height matches source almost exactly (≤1px) at 1440/1920/2560 and is only off in the 801–900 band (mobile-vs-desktop breakpoint mismatch, same root cause as everything else) and — separately — **below 801 both P and C are pinned at a constant 4804px while the source's mobile height keeps growing from 4804 (390) to 5748 (800)**. That mobile-side flatness is a page-level anomaly outside this task's 18-node desktop scope; flagging it here since page height was an explicitly requested metric, not diagnosing further.

## 6. Does variant C hold *between* its tuned widths, or only *at* them?

**It holds between them.** The task's hypothesis was that C — hand-patched at 1024/1100/1440/1920 — might regress in the gaps (801–899, 901–1023, 1201–1439, >1920). The continuous sweep does not support that: C's patches (`width:100%`, `margin:auto`, `width:85%`, `calc((100% - 100px)/3)`, `top/left:auto`) are unit-relative/formula-based, not point values, so they interpolate correctly at every intermediate sampled width — verified concretely at, e.g., **1201, 1300, 1536, 1810, 2560** (none of them tuning points) where every node in the table above is within tolerance. The only place C fails is **801–899**, and that is not an "in-between" regression of the manual patch — it is the same root-cause breakpoint-policy gap `05` already identified for the *pipeline* (product serves the desktop tree from 801px; the source's own React breakpoint is 900px, so at 801–899 the source is still rendering its mobile layout while the clone renders desktop). C did not fix that policy mismatch (nothing in the manual patch touches the served breakpoint), so it shows up identically in C as in P for the nodes whose authored behavior differs by breakpoint (`n000170/174/192/208/418/433/434/528/530/547/039/040`), while the nodes whose authored behavior doesn't depend on the 900 vs 801 split (`n000005/050/051/053/166/196/621/623/628/700`) pass even through 801–899 in C.

## 7. Worst offenders

- **CLONE-P**: essentially every one of the 22 nodes, across essentially the entire desktop range (`801–2560` minus a ~40–60px pass-band around 1440). The single 1440px capture point the pipeline froze values at is the only width it's correct at.
- **CLONE-C**: no node is broken outside `801–899`; within that band the worst are the ones whose authored source layout itself changes shape at 900 (`n000528` ts column: 85%→100% mobile; `n000192`/`n000418` heading rows: 40px padding→20px mobile; the three JS-sized slide nodes).

## Caveats

- This reuses the exact node-addressing approach from `05` (unchanged `source_probe.mjs`/`clone_probe.mjs` selector logic), extended to continuous in-place resize instead of per-width reload/navigation — chosen because MUI's `useMediaQuery` and Swiper's resize handler are both live listeners, so resizing without reload reproduces an actual drag-resize and is far faster than 99×3 navigations (it is also kinder to the live source site: one navigation instead of 99).
- SOURCE's full lazy-scroll pass runs twice (at 390 and on first crossing ≥901), not at every one of the 99 widths — a cheap trade-off; heights/positions below and within each regime were consistent with `05`'s independently-captured 6-point values (cross-checked: `exp_group` 390/900/1440 and `pf1_container` @900 = 40/820 matched exactly), so this is not believed to have introduced drift, but it wasn't re-verified at all 99 points.
- Card/column visible-count and `n/a` semantics: below 801 the clone's desktop tree isn't in the render (both variants share the identical static mobile markup, so P and C are indistinguishable there by construction — differences only exist ≥801).
- `n000053`/`n000208`/`n000434`/`n000547` x/position is intentionally excluded from FAIL scoring (JS/autoplay-driven); their width is still scored.
- The `900–1370`/`1870–2560` (P) portfolio-card-count intervals and the `801–899` (C) ones come from the same automatic width-grid merge as §1; they are not exhaustively re-verified frame-by-frame between grid points (20px steps, finer near breakpoints) — a genuine one-off flicker strictly between two adjacent sampled widths would not be caught.
- Page height is a whole-document metric; it is influenced by every node on the page, not just the 22 tracked here, so §5 is reported for completeness (it was an explicit requested metric) but not decomposed further.
- Server: `next start -p 3291` against the existing `.next` build in `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app` — no install, no build, no file writes; stopped at the end of this task.

## Raw JSON / script paths

- `tmp/wr-resp-audit/sweep/widths.mjs`, `nodes-sweep.json` — the 99-width grid and 24-node map (22 requested + 2 container-only for card counts)
- `tmp/wr-resp-audit/sweep/sweep.mjs` — the sweep driver (`node sweep.mjs source|clone-P|clone-C <out.json>`)
- `tmp/wr-resp-audit/sweep/raw-source.json`, `raw-clone-P.json`, `raw-clone-C.json` — one record per width per target
- `tmp/wr-resp-audit/sweep/analyze.mjs` → `tmp/wr-resp-audit/sweep/summary.json` — fail intervals, overflow, count mismatches, height ratios feeding the tables above
