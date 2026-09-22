# Task 28.6 Wave 8 — SITE LANE: seoultone.kr (probe-width eviction fix, re-run)

**Host:** `http://seoultone.kr` — Korean dermatology clinic, gnuboard g5 CMS.
**Change under test:** `src/observer/probe-widths.ts` optional `requiredWidths` input, pinned into the
guaranteed probe core; `src/observer/observe-page.ts` now passes each probe pass its own live profile
width (desktop 1440, mobile 390). Fix write-up: `docs/result/28.6/07-o31-probe-width-eviction-fix.md`.
Ledger entry: `docs/result/28.6/00-defect-ledger.md` §A8 (status CLOSED, Wave 8 O3.1).
**Baseline this lane compares against:** `docs/result/28.6/lanes/w7-seoultone.md` (same site, same two
routes, same five widths, run on the PRE-fix code — its own §6 ED-1 measured `1440` evicted on 2 of 13
pages of THIS site).
**Engine untouched:** no file under `src/` or `scripts/` was written by this lane (read-only throughout).
**No git operation of any kind was run.**

> **Content note**, carried from the baseline lane: Korean dermatology clinic, a regulated advertising
> category. Everything here is a local fidelity test against already-public pages, nothing was deployed,
> and surfaces are described by role, never by content.

---

## 0. Headline

**The eviction regression is GONE, confirmed at all four levels the brief asked for.** On every one of
13 observed pages, both viewport passes: `widthProvenance.requiredWidths` is present and non-empty, the
required width (1440 desktop / 390 mobile) is in the sampled `widths`, and it is never present in
`floorWidthsEvicted`. `reconstruction-manifest.json → layout.viewportPassRefusals` is `{}` (was
`{"desktop:truth-width-not-probed": 2}`). The two pages that lost their ENTIRE desktop pass pre-fix —
`p000002` (`/bbs/board.php?bo_table=Event`) and `p000004` (`/page/intro02.php`) — now ship 20 and 46
desktop rules respectively (were 0 and 0), confirmed byte-exact in the shipped stylesheet, not just the
manifest counter. Total desktop rules rose 554 → **620 (+66, +11.9%)**, and **+66 is exactly** `+20 +46`
from those two pages — every other page's rule count is byte-identical to the pre-fix run.

**The grade on the two routes this lane grades (`/`, `/page/intro04.php`) is unchanged: 6 BLOCKER /
4 MAJOR / 0 MINOR / 0 PASS, identical verdict-for-verdict to the W7 pre-fix clone grade on all 10
pairs.** This is expected, not a miss: neither graded route was one of the two pages the eviction bug hit
on this site. The BLOCKER/MAJOR causes (baked `opacity:0` scroll-reveal text, a frozen 1296px footer
container) are separate, already-documented, still-open defects unrelated to probe-width eviction — see
§5.

---

## 1. Commands run and run ids

Fix presence confirmed before running anything:
```
$ grep -n "requiredWidths" src/observer/probe-widths.ts src/observer/observe-page.ts
probe-widths.ts:142,233,294,311,461   observe-page.ts:1079,1084
```

| # | Command | Result | Run id / path |
|---|---|---|---|
| 1 | `pnpm observe:site data/seoultone.kr/2026-09-02T23-12-19-842Z/selected-pages.json --concurrency 2` | 13/13 pages OK, 0 failed, 150.9s | `data/seoultone.kr/site-observations/2026-09-03T00-18-20-930Z/` |
| 2 | `pnpm detect:interactions <obs>/site-observation.json` | 197 candidates, 13 pages analyzed, 0 skipped | written into the same obs dir |
| 3 | `pnpm explore:interactions <obs>/interaction-analysis.json --concurrency 2` | 4/4 executed, 2 changed / 2 no-change | `data/seoultone.kr/interaction-explorations/2026-09-03T00-21-02-364Z/` |
| 4 | `pnpm model:interactions <expl>/interaction-exploration.json` | 4 action artifacts validated, 0 patterns, 4 unknown | `data/seoultone.kr/interaction-models/2026-09-03T00-21-16-777Z/` |
| 5 | `pnpm compile:sitespec <model>/interaction-patterns.json` | 13 page specs, round-trip PASS | `data/seoultone.kr/site-specs/2026-09-03T00-21-19-971Z/` |
| 6 | `pnpm reconstruct <spec>/site-spec.json` | `next build PASS in 2607ms` | `data/seoultone.kr/reconstructions/2026-09-03T00-21-25-309Z/` |
| 7 | `pnpm qa:responsive <manifest> --widths 390,700,1024,1100,1440 --routes "/,/page/intro04.php"` | 10/10 pairs measured, 0 failed | `data/seoultone.kr/responsive-qa/2026-09-03T00-23-07-347Z/` |

No stage failed. No `--self-check` was run this pass, per the brief — the orchestrator holds the W7
self-check floor for this site (`data/seoultone.kr/responsive-qa/2026-09-02T23-24-44-987Z/`: 0 BLOCKER /
1 MAJOR / 6 MINOR / 3 PASS, `worst pixel residual 8.05%`, machine-noise MAJOR at `/ @700`).

Discovery/selection were reused unchanged from `data/seoultone.kr/2026-09-02T23-12-19-842Z/` (19 verified
→ 11 families → 13 pages incl. 2 validation samples) — no Firecrawl call was made by this lane.

---

## 2. Probe-width evidence, per page (Step 2a/2b)

Read from `data/seoultone.kr/site-observations/2026-09-03T00-18-20-930Z/pages/<id>/layout-probe{,-mobile}.json
→ widthProvenance`. `hasRequired` = the observation width is present in the sampled `widths`.
`reqInEvicted` = that width appears in `floorWidthsEvicted` (the failure mode this fix closes).

### Desktop (required width = 1440, this is the truth-observation width `layout-inference.ts:1668` anchors on)

| page | route | widths sampled | `floorWidthsEvicted` | `capHit` | `breakpointsAdopted` | `breakpointsAdoptedByEviction` | 1440 kept? | 1440 evicted? |
|---|---|---|---|---|---:|---:|---|---|
| p000001 | `/` | 390,500,501,768,769,1024,1025,1100,1200,1201,1280,1281,**1440**,1600,1601,1920 | `[700]` | false | 6 | 1 | **yes** | no |
| p000002 | `/bbs/board.php?bo_table=Event` | 390,420,421,499,500,501,769,1024,1025,1100,1280,1281,**1440**,1600,1601,1920 | `[700,768]` | **true** | 7 | 2 | **yes** | no |
| p000003 | `/page/intro01.php` | 390,499,500,501,769,1024,1025,1100,1200,1201,1280,1281,**1440**,1600,1601,1920 | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000004 | `/page/intro02.php` | 390,400,401,499,500,501,769,1024,1025,1100,1280,1281,**1440**,1600,1601,1920 | `[700,768]` | **true** | 7 | 2 | **yes** | no |
| p000005 | `/page/intro03.php` | 390,499,500,501,769,1024,1025,1100,1200,1201,1280,1281,**1440**,1600,1601,1920 | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000006 | `/page/intro04.php` | 390,499,500,501,769,1024,1025,1100,1200,1201,1280,1281,**1440**,1600,1601,1920 | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000007 | `/page/lifting01.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000008 | `/page/lifting04.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000009 | `/page/lifting05.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000010 | `/page/signature01.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000011 | `/page/signature09.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000012 | `/page/lifting02.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |
| p000013 | `/page/signature02.php` | (same shape) | `[700,768]` | false | 7 | 1 | **yes** | no |

`requiredWidths: [1440]` on all 13. **1440 is present in `widths` and absent from `floorWidthsEvicted` on
13/13 pages — 0/13 evictions of the truth width.** The two pages capHit (p000002, p000004) are exactly the
two ED-1 named in the W7 baseline as having LOST 1440 pre-fix; now the cap is met by evicting `700`+`768`
(authored-below/above brackets adopted instead) and 1440 is untouched.

### Mobile (required width = 390)

All 13 pages: `requiredWidths: [390]`, `floorWidthsEvicted: []`, `capHit: false`, `hasRequired: true`.
Sampled widths per page range `390,480,(499|500),(500|501),700,768,769,914` (± one or two extra authored
brackets on p000002/p000004/others). **390 kept on 13/13, evicted on 0/13.** The mobile floor was never
under eviction pressure on this site (`breakpointsAdopted` 2–6, cap 16 never hit), so this axis was not
actually at risk here — but the artifact confirms the guarantee holds regardless.

---

## 3. Layout-pass evidence (Step 2c/2d)

**Manifest** (`data/seoultone.kr/reconstructions/2026-09-03T00-21-25-309Z/reconstruction-manifest.json`):

| field | pre-fix (W7, `…23-17-40-791Z`) | post-fix (this run, `…00-21-25-309Z`) |
|---|---|---|
| `layout.viewportPassRefusals` | `{"desktop:truth-width-not-probed": 2}` | **`{}`** |
| `layout.viewportPasses` | `{desktop:13, mobile:13}` | `{desktop:13, mobile:13}` |
| `layout.viewportPassesUsed` | `{desktop:**11**, mobile:13}` | `{desktop:**13**, mobile:13}` |
| `layout.rulesByViewport` | `{desktop:554, mobile:813}` | `{desktop:**620**, mobile:813}` |
| `layout.shippedRulesByViewport` | `{desktop:554, mobile:813}` | `{desktop:**620**, mobile:813}` |
| `config.inferredBreakpoint.value` | 1025 | 1025 (unchanged — this fix does not touch tree-switch inference) |

Desktop rules are **620 > 0** and every one of the 13 desktop passes is now used (13/13 vs 11/13 pre-fix).

**Shipped CSS, independently grep-counted** (not trusting the manifest counter — Step 2d):
`public/wr/generated-styles.css`, recovered-layout marker at line 3934 in both runs.

```
tail -n +3934 generated-styles.css | grep -c 'data-wr-viewport="desktop"'   → 620  (pre-fix: 554)
tail -n +3934 generated-styles.css | grep -c 'data-wr-viewport="mobile"'    → 813  (pre-fix: 813, unchanged)
```

Byte-exact match to the manifest's `rulesByViewport` in both runs. Per-page breakdown (same grep, scoped
by `[data-wr-page="pNNNNNN"]`), pre-fix vs post-fix, all 13 pages:

| page | desktop pre-fix → post-fix | mobile pre-fix → post-fix |
|---|---:|---:|
| p000001 (`/`) | 79 → 79 | 106 → 106 |
| **p000002** (bbs/board) | **0 → 20** | 33 → 33 |
| p000003 | 33 → 33 | 46 → 46 |
| **p000004** (intro02) | **0 → 46** | 59 → 59 |
| p000005 | 64 → 64 | 27 → 27 |
| p000006 (`/page/intro04.php`) | 36 → 36 | 49 → 49 |
| p000007 | 46 → 46 | 66 → 66 |
| p000008 | 44 → 44 | 63 → 63 |
| p000009 | 57 → 57 | 79 → 79 |
| p000010 | 70 → 70 | 95 → 95 |
| p000011 | 36 → 36 | 59 → 59 |
| p000012 | 44 → 44 | 64 → 64 |
| p000013 | 45 → 45 | 67 → 67 |
| **TOTAL** | **554 → 620** | **813 → 813** |

**Every page except the two ED-1 pages is byte-identical between the two runs.** The entire +66 desktop
delta is `+20` (p000002) `+46` (p000004) — the fix's blast radius on this site is exactly, only, and
completely the two pages it was supposed to repair, nothing else moved. `app/globals.css` breakpoint
queries unchanged: `@media (max-width: 1024.98px)` / `@media (min-width: 1025px)`.

**Answer to Step 2: the eviction regression is GONE** — 0/13 pages evict the truth width on either
viewport, `viewportPassRefusals` is empty, desktop rules are shipped on all 13 pages including both
previously-broken ones, and the shipped stylesheet confirms the manifest's counters to the rule.

---

## 4. Grade vs W7 baseline (Step 3)

`pnpm qa:responsive` run `2026-09-03T00-23-07-347Z`, single pass, widths 390/700/1024/1100/1440,
routes `/` and `/page/intro04.php`. **6 BLOCKER / 4 MAJOR / 0 MINOR / 0 PASS**, 10/10 pairs measured,
0 failed. W7 baseline clone grade (pre-fix, same manifest shape, same site/routes/widths): **6 BLOCKER /
4 MAJOR / 0 MINOR / 0 PASS**.

| Route | Width | W7 (pre-fix) | W8 (post-fix, this run) | Verdict delta | Deciding channel this run |
|---|---:|---|---|---|---|
| `/` | 390 | BLOCKER | BLOCKER | **held** | `missing-text-ratio` 0.3095/0.10 |
| `/` | 700 | BLOCKER | BLOCKER | **held** | `missing-text-ratio` 0.3095/0.10 |
| `/` | 1024 | BLOCKER | BLOCKER | **held** | `missing-text-ratio` 0.3165/0.10 |
| `/` | 1100 | BLOCKER | BLOCKER | **held** | `footer-clipped` (clone max-right 1296 > 1100) |
| `/` | 1440 | BLOCKER | BLOCKER | **held** | `missing-text-ratio` 0.3462/0.10 |
| `/page/intro04.php` | 390 | MAJOR | MAJOR | **held** | `missing-text-ratio` 0.0224/0.02 |
| `/page/intro04.php` | 700 | MAJOR | MAJOR | **held** | `missing-text-ratio` 0.0224/0.02 + `pixel-visible-difference-ratio` 0.5003/0.50 |
| `/page/intro04.php` | 1024 | MAJOR | MAJOR | **held** | `missing-text-ratio` 0.0224/0.02 + `position-delta-p90-px` 634/48 |
| `/page/intro04.php` | 1100 | BLOCKER | BLOCKER | **held** | `footer-clipped` (1296 > 1100) |
| `/page/intro04.php` | 1440 | MAJOR | MAJOR | **held** | `missing-text-ratio` 0.0227/0.02 |

**All 10 pairs HELD.** `missing-text-ratio` values moved by a few points between runs (0.3307→0.3095,
0.3492→0.3095, 0.3438→0.3165, 0.3253→0.3462 on `/`; intro04 held near-exact at 0.0224/0.0224/0.0224/0.0227
both runs) — consistent with W7's own documented finding that this channel tracks a live scroll-reveal
source capture, not clone drift. `footer-clipped` fired at the identical numeric value (1296 > 1100) both
runs, on both routes, both times.

**Why held and not improved, honestly:** of the 13 pages this site observes, the probe-width eviction bug
pre-fix only hit `p000002` and `p000004` (§3) — neither is `/` (`p000001`) or `/page/intro04.php`
(`p000006`). The fix has zero mechanical path to change these two routes' grades because neither route's
desktop pass was ever refused. The grade evidence in §3 (the two ED-1 pages' rule counts) is the correct
place to see this fix's effect on this site, not this grade table.

**No self-check floor was run this pass** (per brief — deliberately reusing W7's floor rather than paying
for a second sweep). Every verdict above should be read against W7's own floor
(`data/seoultone.kr/responsive-qa/2026-09-02T23-24-44-987Z/`: 0 B / 1 M / 6 m / 3 PASS) since nothing about
the floor-relevant machinery (grader rubric, source, routes, widths) changed between the two lanes.

---

## 5. Residual defects (measured, generic — not this-fix's doing)

### R-1 — Mobile probe ceiling is still a frozen constant that no longer reaches the tree switch

**Measured, unrelated to this fix, present in this run's own artifacts.**
`MOBILE_LAYOUT_PROBE_WIDTHS = [390, 480, 700, 768, 914]`, `src/observer/types.ts:1837-1838`. The tree
switch on this site is **1025** (`config.inferredBreakpoint.value`, §3), so the mobile tree is rendered
over `[0, 1024]` while the mobile probe's widest sample is 914 — confirmed in this run's own mobile probe
artifacts (`data/seoultone.kr/site-observations/2026-09-03T00-18-20-930Z/pages/*/layout-probe-mobile.json`):
every page's mobile `widths` tops out at 914, none contain anything above it. **The band 915–1024 (110px,
10.7% of the mobile tree's rendered range) carries zero mobile probe evidence on any of the 13 pages in
this run**, and 1024 is one of the five graded widths in §4. This is the same defect the W7 baseline named
ED-2; the `requiredWidths` fix pins the mobile floor's OWN observation width (390) but does not touch this
constant, so R-1 is untouched by Wave 8 O3.1 and remains open.

### R-2 — The two BLOCKER/MAJOR drivers in §4 are pre-existing, already-diagnosed, not moved by this fix

Not a new finding — carried forward from W7 §5 for completeness, since they are what actually decided
every grade in §4: `missing-text-ratio` on `/` (opacity-hidden scroll-reveal content baked at `opacity:0`
in the recovered tier — W7 measured 2,455 such declarations) and `footer-clipped` at 1100 on both routes
(a frozen `1296px` container width, `1296px` occurs 49× in the exact tier and 0× in the recovered tier in
both the pre-fix and post-fix stylesheet, confirmed identical by the per-page grep in §3). Neither channel
is sensitive to which widths were probed; both are downstream of the inline-size funnel's own
`no-branch-matched` / `emitted-centered-max-width` classification, not of probe-width selection.

No new engine defect was found by this lane. R-1 and R-2 are both already in the program's defect ledger
(`docs/result/28.6/00-defect-ledger.md` A8 write-up names R-1's mechanism directly; R-2 is W7 §5
BLOCKER-A/B) — this lane's contribution is confirming both are still measurably present, unmoved, after
the fix landed, on fresh artifacts.

---

## 6. Verdict

**On seoultone.kr, the floor-width truth-width eviction regression is fully closed** — 0/13 pages evict
1440 or 390 on either viewport pass (was 2/13 desktop pages pre-fix), `viewportPassRefusals` is empty
(was `{"desktop:truth-width-not-probed": 2}`), and the two previously-zero-desktop-rule pages now ship
20 and 46 desktop rules respectively, accounting for the entire +66 (+11.9%) site-wide desktop rule
increase with every other page byte-identical to the pre-fix run — while the two graded routes' responsive
QA grade holds exactly at 6 BLOCKER / 4 MAJOR / 0 MINOR / 0 PASS because neither graded route was ever
one of the two pages this bug hit on this site, and their grades are driven entirely by two separate,
already-open, unrelated defects (R-1, R-2 above).

---

## Files a reader may want

- **This report:** `docs/result/28.6/lanes/w8-seoultone.md`
- **W7 baseline (pre-fix):** `docs/result/28.6/lanes/w7-seoultone.md`
- **Human review pack (41 PNGs + README):** `docs/result/28.6/final-human-review/seoultone/`
- **Post-fix observation:** `data/seoultone.kr/site-observations/2026-09-03T00-18-20-930Z/`
- **Post-fix reconstruction manifest:** `data/seoultone.kr/reconstructions/2026-09-03T00-21-25-309Z/reconstruction-manifest.json`
- **Post-fix shipped stylesheet:** `data/seoultone.kr/reconstructions/2026-09-03T00-21-25-309Z/app/public/wr/generated-styles.css` (recovered tier starts line 3934)
- **Post-fix responsive-QA run:** `data/seoultone.kr/responsive-qa/2026-09-03T00-23-07-347Z/`
