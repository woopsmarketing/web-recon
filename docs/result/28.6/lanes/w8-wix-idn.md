# W8 — www.xn--ok0b408a79cba430b.net (wix-idn) — requiredWidths eviction-fix rerun

Lane: W8, single-site read-only remeasurement lane. Engine change under test:
`src/observer/probe-widths.ts` / `src/observer/observe-page.ts` — `requiredWidths` pins each
viewport's own truth-observation width (desktop 1440 / mobile 390) into the guaranteed probe
core so it can no longer be evicted under cap pressure, which is what happened to this site
under the pre-fix engine (W7 baseline, `docs/result/28.6/lanes/w7-wix-idn.md`).

**Fix presence confirmed before running** (Step 0):
`grep -n "requiredWidths" src/observer/probe-widths.ts src/observer/observe-page.ts` — both
files reference it (`probe-widths.ts:142,233,294,311,461`; `observe-page.ts:1079,1084`).

Pre-existing artifacts under `data/www.xn--ok0b408a79cba430b.net/{site-observations,...}` with
today's-looking timestamps were checked first and confirmed to be the **W7 pre-fix baseline
itself** (its `layout-probe.json` has no `widthProvenance.requiredWidths` key at all and lists
1440 under `floorWidthsEvicted`) — not reusable, so the full pipeline below was re-run fresh
against the current (fixed) engine.

## 1. Commands + run ids

Reused selection (no Firecrawl rerun): `data/www.xn--ok0b408a79cba430b.net/2026-09-02T23-13-51-284Z/selected-pages.json`.

| # | command | run id | headline result |
|---|---|---|---|
| 1 | `pnpm observe:site .../selected-pages.json --concurrency 2` | `site-observations/2026-09-03T00-18-42-597Z` | 7/7 pages OK, 0 failed, 139.7s |
| 2 | `pnpm detect:interactions .../site-observation.json` | (writes into same dir) | 277 candidates, 7 pages, 0 skipped |
| 3 | `pnpm explore:interactions .../interaction-analysis.json --concurrency 2` | `interaction-explorations/2026-09-03T00-21-10-596Z` | 20/20 executed, 18 changed |
| 4 | `pnpm model:interactions .../interaction-exploration.json` | `interaction-models/2026-09-03T00-22-08-052Z` | 4 confirmed patterns, 16 unknown |
| 5 | `pnpm compile:sitespec .../interaction-patterns.json` | `site-specs/2026-09-03T00-22-12-415Z` | 12 routes, 7 pages, round-trip PASS |
| 6 | `pnpm reconstruct .../site-spec.json` | `reconstructions/2026-09-03T00-22-16-705Z` | 341/341 layout rules accepted, next build PASS |
| 7 | `pnpm qa:responsive .../reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes /,/link` (no `--self-check`, per lane instructions) | `responsive-qa/2026-09-03T00-23-53-218Z` | 10 BLOCKER / 0 MAJOR / 0 MINOR / 0 PASS |

All 7 stages exited 0. No stage failed, no stderr captured.

## 2. Probe-width evidence (per page)

### Desktop (`layout-probe.json`, truth width **1440**)

| page | route | sampled widths | requiredWidths | guaranteedFloorWidths | floorWidthsEvicted | capHit | 1440 evicted? |
|---|---|---|---|---|---|---|---|
| p000001 | `/` | 300,301,390,480,481,500,501,659,660,685,686,979,980,**1024,1440**,1920 | [1440] | [390,1024,1920] | [700,768,1100] | true | **no** |
| p000002 | `/정보` | 390,480,481,659,660,685,686,979,980,981,**1024,1100**,1181,1182,**1440**,1920 | [1440] | [390,1024,1920] | [700,768] | true | **no** |
| p000003 | `/about` | 390,480,481,700,768,**1024,1100,1440**,1920 | [1440] | [390,1024,1920] | [] | false | **no** |
| p000004 | `/contact` | 390,480,481,700,768,**1024,1100,1440**,1920 | [1440] | [390,1024,1920] | [] | false | **no** |
| p000005 | `/link` | 390,480,481,700,768,**1024,1100,1440**,1920 | [1440] | [390,1024,1920] | [] | false | **no** |
| p000006 | `/post/...여기여` | 390,480,481,659,660,685,686,746,747,900,901,979,980,**1024,1440**,1920 | [1440] | [390,1024,1920] | [700,768,1100] | true | **no** |
| p000007 | `/post/...(sample)` | 390,480,481,659,660,685,686,746,747,900,901,979,980,**1024,1440**,1920 | [1440] | [390,1024,1920] | [700,768,1100] | true | **no** |

Every page: `widthProvenance.requiredWidths` exists and equals `[1440]`; 1440 is present in the
sampled widths; 1440 never appears in `floorWidthsEvicted` on any page.
`breakpointsAdopted` / `breakpointsAdoptedByEviction`: p1 6/2, p2 6/1, p3–5 1/0, p6–7 6/2.

### Mobile (`layout-probe-mobile.json`, truth width **390**)

| page | sampled widths | requiredWidths | guaranteedFloorWidths | floorWidthsEvicted | capHit | 390 evicted? |
|---|---|---|---|---|---|---|
| p000001 | 300,301,**390**,481,500,501,659,660,685,686,700,739,740,885,886,914 | [390] | [390,700,914] | [480,768] | false | **no** |
| p000002 | 300,301,**390**,480,481,659,660,685,686,700,739,740,768,885,886,914 | [390] | [390,700,914] | [] | false | **no** |
| p000003 | **390**,480,481,700,768,914 | [390] | [390,700,914] | [] | false | **no** |
| p000004 | **390**,480,481,700,768,914 | [390] | [390,700,914] | [] | false | **no** |
| p000005 | **390**,480,481,700,768,914 | [390] | [390,700,914] | [] | false | **no** |
| p000006 | **390**,481,659,660,685,686,700,739,740,745,746,747,768,900,901,914 | [390] | [390,700,914] | [480] | true | **no** |
| p000007 | **390**,481,659,660,685,686,700,739,740,745,746,747,768,900,901,914 | [390] | [390,700,914] | [480] | true | **no** |

390 was already inside the positional guaranteed core (`[390,700,914]`) pre-fix for this site's
mobile floor, so this axis was never the failure mode here — confirmed unaffected either way.

## 3. Layout-pass evidence (reconstruction manifest, `layout.*`)

```
                       PRE-FIX (W7 baseline)        POST-FIX (this run)
viewportPasses         { desktop: 7, mobile: 7 }     { desktop: 7, mobile: 7 }
viewportPassesUsed     { desktop: 3, mobile: 5 }     { desktop: 7, mobile: 5 }
viewportPassRefusals   { "desktop:truth-width-       { "mobile:fewer-than-two-
                          not-probed": 4,               widths": 2 }
                          "mobile:fewer-than-two-
                          widths": 2 }
rulesByViewport        { desktop: 147 }              { desktop: 341 }
shippedRulesByViewport { desktop: 147 }              { desktop: 341 }
```

`desktop:truth-width-not-probed` is **gone** — 0 occurrences, not merely a smaller count.
`viewportPassesUsed.desktop` went 3/7 → 7/7 (every desktop pass now resolves). Desktop rules
more than doubled, 147 → 341, because the 4 pages that were previously refused outright (p1,
p2, p6, p7 per the W7 per-page table) now contribute rules too.
`mobile:fewer-than-two-widths: 2` is unchanged — a pre-existing, unrelated refusal (2 pages
whose mobile-side width count under the inferred breakpoint is <2), already documented in the
W7 baseline (§3.7) and not touched by this fix.
`layout.truthCheckStatus: "verified"`, `truthCheckConverged: true`, `rejectedByTruthCheck: 0` —
all 341 accepted rules passed the truth-width re-render check.

## 4. Shipped-CSS confirmation (independent of the manifest's own claim)

`data/www.xn--ok0b408a79cba430b.net/reconstructions/2026-09-03T00-22-16-705Z/app/public/wr/generated-styles.css`,
recovered-layout block starts at line 3898 (`/* Recovered layout rules (Task 17 §9/§10). */`):

```
grep -c 'data-wr-viewport="desktop"'  → 341   (matches layout.rulesByViewport.desktop exactly)
grep -c 'data-wr-viewport="mobile"'   → 0
```

Per-page desktop rule-selector counts inside that block: p000001 64, p000002 44, p000003 49,
p000004 49, p000005 49, p000006 43, p000007 43 — sums to 341, and **all 7 pages** now carry
desktop rules (pre-fix only 3 of 7 did, per the W7 per-page eviction table).

**Eviction regression verdict: GONE.** Confirmed at three independent levels — the probe
artifact (1440 sampled and never evicted on any page), the manifest (no
`desktop:truth-width-not-probed` refusal, `rulesByViewport.desktop = 341 > 0`), and the shipped
CSS file itself (341 desktop rule blocks, physically present on disk, matching the manifest's
claim exactly).

## 5. Grade table vs W7 baseline

W7 baseline (`docs/result/28.6/lanes/w7-wix-idn.md` lines 94-103): 8 BLOCKER / 1 MAJOR /
1 MINOR across 10 pairs, against a `--self-check` floor of 10/10 PASS with every channel
exactly 0.00 — so every non-PASS grade on either run is a genuine clone defect, not instrument
noise.

| route | width | W7 grade (deciding channel) | W8 grade (deciding channel) | delta |
|---|---|---|---|---|
| `/` | 390 | BLOCKER (`nav-link-ratio`) | BLOCKER (`image-presence-ratio`, 12/24=50%) | held |
| `/` | 700 | BLOCKER (`missing-text-ratio` 35.49%) | BLOCKER (`offscreen-text-excess-chars` 951 chars) | held |
| `/` | 1024 | BLOCKER (`footer-clipped`) | BLOCKER (`footer-clipped`, same) | held |
| `/` | 1100 | BLOCKER (`footer-clipped`) | BLOCKER (`footer-clipped`, same) | held |
| `/` | 1440 | BLOCKER (`missing-text-ratio` 35.38%, *0 geometry findings*) | BLOCKER (`overlap-excess-ratio` 24.57%, **new** geometry defect) | held (but underlying defect changed — see §5b) |
| `/link` | 390 | BLOCKER (`nav-link-ratio`) | BLOCKER (`missing-text-ratio` 36.41%) | held |
| `/link` | 700 | **MAJOR** (`landmark-wide-element-excess`) | **BLOCKER** (`image-presence-ratio`, 3/7=43%) | **regressed** |
| `/link` | 1024 | BLOCKER (`footer-clipped`) | BLOCKER (`footer-clipped`, same) | held |
| `/link` | 1100 | BLOCKER (`footer-clipped`) | BLOCKER (`footer-clipped`, same) | held |
| `/link` | 1440 | **MINOR** (`pixel-residual-difference-ratio` 6.08%) | **BLOCKER** (`image-presence-ratio`, 3/7=43%) | **regressed** |

**Totals: W7 8 BLOCKER/1 MAJOR/1 MINOR/0 PASS → W8 10 BLOCKER/0 MAJOR/0 MINOR/0 PASS.**
0 pairs improved, 8 held at BLOCKER, 2 regressed (MAJOR→BLOCKER, MINOR→BLOCKER). The
eviction fix this wave targets is fully verified fixed (§3-4), but on this site fixing it
exposed two new content/geometry defects that did not fire pre-fix and are the reason the
aggregate grade got worse, not better — detailed next.

### 5b. What changed underneath the two regressed pairs (measured, not inferred)

- **`/` @1440 — new overlap, at the truth width itself.** `clone.overlapAreaRatio` went
  **0.0 → 0.2457** (source stayed 0.0) between the W7 clone run
  (`responsive-qa/2026-09-02T23-24-48-801Z`) and this run. `worstOverlaps` in the pair JSON
  names 6 image pairs where the SAME content-keyed image (`aKey === bKey`) overlaps itself
  (~53,200px² each) — the signature of a grid whose columns collapsed to one and rows stacked
  on top of each other instead of tiling. The recovered-CSS block for this page
  (`p000001` node `n000029`) accepts a `grid-template-columns: minmax(0, 1fr)` rule (single
  fractional track). `recoverGridTracks()` (`src/reconstruction/layout-inference.ts:1334`)
  emits that rule with `truth: { x: box.x, w: box.width }` as its only truth-check payload
  (`src/reconstruction/layout-inference.ts:1896-1897`) — i.e. the truth check validates the
  CONTAINER's own box against the truth-width render, not whether its children tile without
  overlapping. A wrong track-count recovery that still lands the container box in the right
  place can pass that check and still stack children. This is a plausible, evidence-backed
  mechanism, not a confirmed fix — reported for the orchestrator to isolate centrally, per lane
  scope (read-only, no engine edits).
- **`/link` @700 and @1440 — 4 of 7 images stopped rendering, at both widths.**
  `clone.imageLeafCount` was **7/7** (matching source exactly) at both widths in the W7 clone
  run; it is **3/7** at both widths in this run — an unchanged count across two different
  viewport widths, so it is not a scaling/visibility artifact of one width, it is a fixed
  content loss on this route. Root cause not isolated within this lane's scope; flagged for
  centralized investigation, possibly the same grid/guard-refusal path
  (`layout.guardRefusalsByReason.grid-item: 49`, `layout.rejectedByGuard: 56` in this run's
  manifest) collapsing an image container's width.

### 5c. Carried-forward, unrelated to this fix

`rulesByViewport` / `shippedRulesByViewport` have no `mobile` key in either run (0 mobile
layout rules shipped, before and after). This is the pre-existing condition documented in the
W7 baseline §3.7-3.8 (this site's mobile subtree is ~91-100% `no-branch-matched` even when
given every possible width) — unchanged by the `requiredWidths` fix in either direction, so
it is not counted as a regression here.

## 6. Verdict

The `requiredWidths` fix eliminates the desktop layout-rule eviction regression on this site
completely and verifiably (0 desktop rules → 341, `desktop:truth-width-not-probed` refusal
gone, confirmed independently in the probe artifact, the manifest, and the shipped CSS file),
but the site's overall responsive QA grade got worse, not better (8B/1M/1m → 10B/0/0), because
shipping those 341 real desktop rules surfaced two new, previously-invisible defects — a
truth-width-itself grid-overlap and a fixed 4-image content loss on `/link` — that a
zero-desktop-rules clone could never have exhibited in the first place.
