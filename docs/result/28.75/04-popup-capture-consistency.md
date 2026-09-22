# 28.75 / 04 — Popup capture consistency

**Lane:** `src/observer/**`, `src/multi-observer/**`, `src/cli-observe*.ts`,
`scripts/smoke-multi-observer.ts`.
**Three defects closed:** a modal gate that was blind at wide viewports; a
page-state policy the QA capture could not reach; an evidence root that wrote
into a frozen wave's artifact directory.

---

## 1. Defect 1 — the old gate's exact failure arithmetic

### 1.1 The gate, as it stood

`src/observer/normalize-page-state.ts` admitted an element as a modal candidate
only if it cleared `OVERLAY_SHAPE` (`src/observer/types.ts`):

```
minWidthCoverage  0.5
minHeightCoverage 0.5
minAreaCoverage   0.5
```

computed against `window.innerWidth` / `window.innerHeight`. The width clause
was a bare `continue` — an element narrower than half the viewport was dropped
**before any evidence was read**, and was not even counted in
`headerLikeRefused` (that counter only fires once `widthCoverage >= 0.5`).

### 1.2 The arithmetic on real data

seoultone.kr `/`, `section#popup_slider` (the "가을이벤트 · 26.09.01–26.10.31"
entry popup) — one page, one load, measured directly:

| viewport | box | widthCoverage | heightCoverage | areaCoverage | old gate |
|---|---|---|---|---|---|
| 390×844 | 351×533 @ (20,50) | **0.900** | 0.631 | 0.568 | admits |
| 1440×900 | 500×813 @ (470,80) | **0.347** | 0.904 | 0.314 | **refuses — 0.347 < 0.5** |

It is the same element with the same evidence. It is refused at 1440 purely
because the viewport got wider. That produced the asymmetric record in
`data/seoultone.kr/site-observations/2026-09-04T18-13-50-161Z/pages/p000001/observation.json`:

```
mobile   { structuralMatches: 1, qualified: 1, dismissed: 1 }   evidence: p000001-mobile-1
desktop  { structuralMatches: 0, qualified: 0, dismissed: 0 }   evidence: (none)
```

The only evidence directory on disk for that run was `p000001-mobile-1`. The
1440 clone therefore shipped the popup baked permanently over the desktop
homepage — at exactly the width reconstruction is graded at.

Miss margin: **0.153 of viewport width**, i.e. the gate needed 720px and the
popup was 500px. There is no threshold nudge that fixes this without also
admitting every wide-and-short header, which is why the fix is a second tier
rather than a smaller number.

---

## 2. The new predicate

### 2.1 Shape: two tiers, additive

```
admitted  ⇔  painting
             AND position ∈ {fixed, absolute}
             AND intersects the viewport
             AND ( COVER  OR  PANEL )

COVER  (OVERLAY_SHAPE, UNCHANGED, shared with the collector's overlay census)
       widthCoverage ≥ 0.5  AND heightCoverage ≥ 0.5  AND areaCoverage ≥ 0.5

PANEL  (PANEL_SHAPE, NEW)
       NOT ( widthCoverage ≥ 0.85 AND heightCoverage < 0.5 )   ← header/cookie-bar class
       AND widthCoverage  ≥ 0.20
       AND heightCoverage ≥ 0.25
       AND areaCoverage   ≥ 0.08
       AND ( min(insetLeft, insetRight) ≥ 0.06
             OR min(insetTop, insetBottom) ≥ 0.06 )            ← it FLOATS
       AND ( position == fixed OR explicit z-index > 0 )       ← it is LIFTED
```

### 2.2 Evidence: unchanged

```
qualified  ⇔  strongSignals.length ≥ 1  AND  signals.length ≥ 2
```

**28.75 widened which shapes are looked at. It did not widen what counts as
evidence, and it added no new STRONG signal.** Shape now corroborates a
strongly-evidenced modal instead of vetoing one, which is the whole point.

### 2.3 Why each signal is weighted the way it is

| signal | weight | why |
|---|---|---|
| `declared-dialog` | **STRONG** | `<dialog open>`, `role="dialog"`, `role="alertdialog"`, `aria-modal="true"`. The page has *declared itself* modal in the accessibility tree. Nothing legitimate and non-modal claims this. |
| `appeared-after-initial-paint` | **STRONG** | Not painting in the census taken right after `load`. A hero, a header and a cookie bar are all there at first paint; an entry popup is not. This is the only time-based discriminator in the system. |
| `close-control-inside` | **STRONG** | A visible, enabled control *inside the box* whose accessible label is in the generic multilingual dismissal vocabulary (닫기 / 오늘 하루 보지 않기 / close / dismiss / 关闭 / …). A page section does not carry a control that says "close this". |
| `page-scroll-locked` | weak | The page scroller is locked while the document is taller than the viewport. True of a modal — and equally true of an open nav drawer, a scroll-jacking library and an intro animation. Never a verdict. |
| `stacked-above-page` | weak | Positive `z-index` at or above every element painting at first paint, plus a painted own background. True of a modal — and of every chat widget and floating CTA ever shipped. |
| `backdrop-behind` | weak (**new in 28.75**) | A full-viewport *painted* scrim the box sits inside of or beside — the structural pairing a centered panel has instead of covering the viewport itself. Weak because a dark full-bleed hero wrapping a lazily-rendered card is indistinguishable from here. |

The three STRONG signals are each a statement the page made *about itself*. The
three weak ones are all descriptions of appearance, and appearance is exactly
what a legitimate header, widget or hero shares with a modal.

### 2.4 Why the four PANEL clauses, specifically

Each clause names the thing it refuses, and each was measured against real
pages, not imagined:

* **`maxFullBleedWidth 0.85` + short** — the header / banner / toolbar /
  cookie-bar class, refused outright and unconditionally. This is the clause
  that refuses linear.app's decorative hero frame
  (`WS84WW_frameBackground`, width 0.915 @1440 / 0.954 @390, height 0.413 /
  0.382) and its grain layer at both viewports.
* **`0.20 / 0.25 / 0.08` minimums** — a modal panel is a substantial rectangle.
  A 64×64 chat bubble is 0.044 of a 1440 width and 0.012 of a 390 area; a 52×190
  accessibility rail is 0.036 / 0.030. Both fail at least two of the three at
  both viewports.
* **`minAxisInset 0.06`** — a modal *floats*. A header is welded to the top edge
  and both sides; a cookie bar to the bottom edge and both sides; a drawer to
  one side. seoultone's panel sits 0.326 in from both sides at 1440. Linear's
  frame sits 0.042 in — refused.
* **lifted (`fixed` or explicit `z-index > 0`)** — `z-index: auto` on an
  absolutely positioned box means it paints in the page's own order. That is
  decoration, not an overlay. This clause alone refuses every remaining
  linear.app hero layer (`WS84WW_shine`, `WS84WW_shineInner`, `WS84WW_glow` —
  all `z-index: auto`).

### 2.5 What was deliberately NOT changed

* The action policy: click a labelled close control inside the overlay, `Escape`
  only with `declared-dialog` evidence, never `force: true`, at most 2 attempts,
  2s per action.
* **No DOM-deletion path.** There is still none in the module — not even an
  off-by-default one. `scripts/smoke-multi-observer.ts` asserts this on the
  source text with comments stripped, the way an auditor greps.
* `structuralMatches` and `headerLikeRefused` keep their exact pre-28.75
  arithmetic, so the collector's read-only overlay census and the normalizer
  stay pinned element-for-element. The new tier is counted separately in
  `panelMatches`.
* The collector's overlay census is **not** widened. Only the normalizer looks
  at panels; the census keeps describing cover-shaped overlays as before.

---

## 3. False-positive analysis

### 3.1 What the widened gate now admits that it did not

Exactly one new class: a **lifted, inset, substantial box that is not full-bleed
and not short**. In shipped terms: a centered desktop dialog, a centered
promo/newsletter panel, a side-anchored drawer that is inset top and bottom.

Admission is not qualification. A newly admitted box still needs ≥1 STRONG
signal and ≥2 total. Measured on the three real sites in §4, the widened tier
admitted **1** new candidate in total (seoultone's popup, at desktop), and it
was a true positive.

### 3.2 The five negative controls, and why each still refuses

All five are re-asserted at **both** 1440 and 390 in
`scripts/smoke-multi-observer.ts`, on `qualified === 0` **and**
`panelMatches === 0` — i.e. the widened tier does not even admit them as
candidates.

| control | geometry | refused by |
|---|---|---|
| (a) fixed header, `100% × 72px` | wc 1.00 / hc 0.08 @1440, 1.00 / 0.085 @390 | `fullBleedShort` (wc ≥ 0.85, hc < 0.5), and independently `hc < 0.25`. Also inset-on-an-axis = 0 on both axes. |
| (b) chat widget, `64×64` bottom-right | wc 0.044 @1440, 0.164 @390; area 0.005 / 0.012 | `wc < 0.20` at 1440; `wc < 0.20` **and** `area < 0.08` at 390. Two independent reasons. |
| (c) accessibility rail, `52×190` left edge | wc 0.036 @1440, 0.133 @390; area 0.007 / 0.030 | `wc < 0.20` at both; `area < 0.08` at both. Also `insetLeft = 0`. |
| (d) full-viewport hero (not a modal) | cover-shaped at both | Unchanged path: it is a COVER match, and it is refused **on evidence** — no dialog semantics, present at first paint, no dismissal vocabulary → `strong.length === 0`. |
| (e) scroll-locked page, no modal | cover-shaped at both | Unchanged path: two WEAK signals (`page-scroll-locked`, `stacked-above-page`) and no strong one. This is the fixture that fails if the bar is ever relaxed. |

Note the shape of the argument: (a)–(c) are refused by *shape* and never reach
the evidence bar; (d)–(e) are modal-**shaped** and are refused by *evidence*.
Both halves of the gate are load-bearing and both are proven.

### 3.3 The discriminating twin

A new fixture, `/neg-panel-weak-only`, is the positive fixture's twin: the same
`min(440px, 90vw) × 70vh` centered box, the same `position: fixed`, the same
`z-index: 9999`, the same painted background, on a scroll-locked page — but
present from the first paint, no dialog semantics, and its control reads
`계속하기 / Continue`, which is not in the dismissal vocabulary.

The suite asserts it **is** admitted by the panel tier at 1440
(`panelMatches >= 1` — otherwise the test proves nothing) and is then **refused**
at both viewports (`qualified === 0`, zero attempts). If the panel tier ever
starts qualifying on shape, this is the check that fails.

---

## 4. Real-site acceptance

All three sites were re-observed with the widened gate, evidence root
`docs/result/28.75/evidence/page-state`.

### 4.1 New observation run ids

Two waves of re-observation, because the scope addition (§6A) landed after the
first wave. **Wave 2 is the one the closure canary should rebuild from** for
every site it covers.

| site | run id | pages | popup gate | float/text-indent | scroll-pass |
|---|---|---|---|---|---|
| gs.severance.healthcare | `2026-09-04T22-33-34-567Z` | 2 | ✓ | ✓ | ✓ |
| linear.app | `2026-09-04T22-34-32-296Z` | 4 | ✓ | ✓ | ✓ |
| hobbang.net | `2026-09-04T22-39-01-787Z` | 10 | ✓ | ✓ | ✓ |
| **seoultone.kr** | `2026-09-04T22-16-43-848Z` | 13 | ✓ | **✗** | **✗** |

**seoultone.kr could not be re-observed for wave 2.** The site began serving a
Cafe24 daily-traffic-cap interstitial (§4.2) before the scope addition was
implemented, so a wave-2 run would have captured the error page rather than the
site. Its newest run carries the popup-gate fix only and must be re-observed once
the cap resets (midnight KST) before the closure canary uses it for anything that
depends on `float` or on below-the-fold reveal content.

Wave 1 (popup gate only, superseded for the three re-observed sites):
`linear.app/…/2026-09-04T22-20-02-199Z`, `hobbang.net/…/2026-09-04T22-22-16-108Z`.
Pre-fix, left untouched: `seoultone.kr/…/2026-09-04T18-13-50-161Z`,
`linear.app/…/2026-09-04T17-21-07-726Z`,
`hobbang.net/…/2026-09-04T18-13-50-162Z`,
`gs.severance.healthcare/…/2026-09-04T18-13-50-154Z`.

### 4.2 Acceptance 1 — seoultone.kr `/` at 1440

**Which demonstration this is: the LIVE SITE.** Not an artifact replay, not a
fixture. The observation below was taken against `http://seoultone.kr/` on
2026-09-04 at 22:16 KST and the popup was present and dismissed at both
viewports.

This matters because the site became unavailable shortly afterwards. At 07:2x
KST on 2026-09-05 `http://seoultone.kr/` answers HTTP 200 with a Cafe24
traffic-cap interstitial — title `오늘 일일 방문 한도에 도달했습니다 | Cafe24`,
body `지금은 사이트에 접속할 수 없습니다 … 사이트 트래픽은 자정에 초기화됩니다`,
`documentHeight` 937, no `#popup_slider` — so a fresh load of the site today
cannot exercise the popup, which is consistent with the diagnostic lane's note
that it could not reproduce it. The run below predates that and is a genuine
capture of the real page: all 13 pages carry the real title and document heights
identical to the pre-fix run (4,892 / 2,408 / 3,944 / … px).

The permanent smoke fixture (`/popup-panel`, §7.1) reproduces the measured
geometry so the gate stays covered when the site does not.

`pageStateNormalization` for **both** viewports, same page, same run:

| | cover matches | panelMatches | headerLikeRefused | qualified | dismissed | censusStatus |
|---|---|---|---|---|---|---|
| **desktop 1440×900** | 0 | **1** | 6 | **1** | **1** | available |
| **mobile 390×844** | 1 | 0 | 7 | 1 | 1 | available |

The attempt, at desktop:

```json
{
  "fingerprint": "section#popup_slider",
  "signals": ["close-control-inside", "stacked-above-page"],
  "shapeClass": "panel",
  "widthCoverage": 0.347,
  "heightCoverage": 0.904,
  "method": "close-control",
  "closeControlLabel": "닫기",
  "closeControlLabelSource": "text",
  "outcome": "dismissed",
  "overlayCoverageBefore": 0.314,
  "overlayCoverageAfter": 0,
  "evidenceDir": "docs/result/28.75/evidence/page-state/seoultone.kr/p000001-desktop-1"
}
```

Evidence PNGs:

* `docs/result/28.75/evidence/page-state/seoultone.kr/p000001-desktop-1/before.png`
  — the 가을이벤트 popup covering the hero at 1440.
* `.../p000001-desktop-1/after.png` — the real hero
  ("함부로 대하지 마세요 / 소중한 당신의 피부 어디든"). The site's own floating
  "서울톤 바로가기" widget is still there: it was not dismissed, which is the
  correct answer.
* `.../p000001-mobile-1/{before,after}.png` — the same, at 390.

Before this wave, `p000001-desktop-1` did not exist: the only evidence directory
for the whole site was `p000001-mobile-1`. **The 1440 clone is no longer built
from an observation with the popup baked in.**

### 4.3 Acceptance 2 — symmetry

seoultone.kr, all 13 pages, `dismissed` per viewport
(`desktop` / `mobile`), from the new run:

| page | desktop | mobile | symmetric |
|---|---|---|---|
| p000001 `/` | 1 | 1 | ✓ |
| p000002 … p000013 (12 pages) | 0 | 0 | ✓ |

Before: `p000001` was `desktop 0 / mobile 1` — the only asymmetry in the entire
`data/` tree, and exactly the defect. A permanent check
(`testRealSiteNormalizationSymmetry` in `scripts/smoke-multi-observer.ts`) now
walks the latest site-observation run of every host on disk and fails on any
comparable pair that disagrees. Run against the pre-fix data it fails on
seoultone `p000001`; against the post-fix data it passes.

### 4.4 Acceptance 3 — no new false positives

Wave-2 runs (both content-loss fixes in as well), plus the seoultone wave-1 run:

| site | run | pages × viewports | panelMatches | qualified | dismissed |
|---|---|---|---|---|---|
| linear.app | `…22-34-32-296Z` | 4 × 2 | **0** | **0** | **0** |
| hobbang.net | `…22-39-01-787Z` | 10 × 2 | **0** | **0** | **0** |
| gs.severance.healthcare | `…22-33-34-567Z` | 2 × 2 | **0** | **0** | **0** |
| seoultone.kr (12 non-home pages) | `…22-16-43-848Z` | 12 × 2 | 0 | 0 | 0 |

Wave-1 runs agreed exactly (linear `…22-20-02-199Z` 4 × 2 all zero; hobbang
`…22-22-16-108Z` 10 × 2 all zero), so the widened gate's answer on those sites is
not sensitive to the scroll change either.

The widened tier admitted **exactly one** new candidate across all four sites —
seoultone's entry popup at desktop — and it was a true positive. On linear.app
the tier admitted nothing at either viewport on any page: its decorative hero
layers are refused by `fullBleedShort` (width 0.915 / 0.954, height 0.413 /
0.382) and by the lifted requirement (`z-index: auto`), and its header by both.

Only one evidence directory tree exists for this wave:
`docs/result/28.75/evidence/page-state/seoultone.kr/{p000001-desktop-1,p000001-mobile-1}`.
linear.app, hobbang.net and gs.severance.healthcare wrote none, because nothing
qualified.

**One honest miss, recorded not hidden.** gs.severance.healthcare
`/gs/index.do` DOES carry an entry popup — its accessible text includes
`오늘하루 열지않기 Close` — and the phase did not dismiss it, at either
viewport, before or after this wave (`panelMatches 0, qualified 0`). It is not a
regression and it is out of this wave's scope, but it is a live example that the
gate is still narrower than "every entry popup": the widened tier moved the gate
from "blind to every centered desktop modal" to "sees the substantial, floating,
lifted ones", not to "sees everything".

### 4.5 Acceptance 4 — evidence location

Every attempt this wave wrote to `docs/result/28.75/evidence/page-state/…`.
`docs/result/28.7/evidence/page-state/` is unchanged: it still holds exactly the
one pre-existing directory, `seoultone.kr/p000001-mobile-1`.

---

## 5. Defect 2 — the observer and the QA source capture disagreed

`normalizePageState` had zero callers outside `src/observer/**`. The observer
dismissed entry popups; the QA source capture did not. On seoultone @390 the
source screenshot showed the popup, the clone correctly showed the hero
underneath, and the clone was charged `missing-text-ratio` for content the
engine had deliberately removed — a structural bias against the clone on any
site with an entry modal.

**This lane's half of the fix** (the QA capture is a different lane and was not
touched):

* The initial-paint census moved out of `observe-page.ts` into
  `src/observer/initial-paint-census.ts`. There is now exactly ONE
  implementation; `observe-page.ts` imports it, so the observer and an external
  caller run the same code.
* `src/observer/index.ts` exports the two-call API:
  `markInitialPaintCensus(page)` then `normalizePageState(page, options)`.
* Both entry points install the `__name` shim their own serialized functions
  need, so an external caller cannot lose a phase to a missing shim.
* The real coupling is documented and **recorded, not silent**: a caller that
  skips the census loses the STRONG `appeared-after-initial-paint` signal, and
  the returned record now carries `initialPaintCensusStatus`
  (`available` | `absent` | `partial` | `unreadable`) plus a limitation string
  that names `markInitialPaintCensus` and points at the contract file.
* Contract: **`docs/result/28.75/page-state-api-contract.md`**.

The smoke suite drives the API against a raw Playwright page — not through the
observer — twice on the same fixture, with and without call 1, and asserts the
signal is present in one, absent in the other, and that the degradation is
recorded both times.

---

## 6. Defect 3 — the evidence root

`PAGE_STATE_EVIDENCE_ROOT = "docs/result/28.7/evidence/page-state"` was
hardcoded into permanently-enabled production code, so every observation run
after 28.7 closed was writing new evidence into a frozen wave's artifact
directory.

* Renamed to `PAGE_STATE_EVIDENCE_ROOT_DEFAULT` and repointed to
  `data/page-state-evidence` — wave-neutral, and outside `docs/result/`
  entirely.
* Overridable everywhere: `normalizePageState({ evidenceRoot })`,
  `observeSelectedPages({ pageStateEvidenceRoot })`, and two new CLI flags:
  `pnpm observe … --page-state-evidence-root=DIR` and
  `pnpm observe:site … --page-state-evidence-root=DIR`. Both CLIs print the
  active root at start.
* A permanent smoke check asserts the default does not start with
  `docs/result/` and does not contain `28.7/`, and that `src/observer/types.ts`
  carries no hardcoded `docs/result/28.7/evidence` path.
* This wave's runs wrote to `docs/result/28.75/evidence/page-state/`. **No
  existing 28.7 evidence was deleted, moved or rewritten.**

---

## 6A. SCOPE ADDITION — two content-loss defects (Task 28.75, folded in)

Root-cause narrative: `docs/result/28.75/02-js-dependent-content-root-cause.md`.
This section records the FIX, the tests and the measured effect.

### 6A.1 FIX 1 — `float` was missing from the Observer's computed-style whitelist

`STYLE_WHITELIST` (`src/observer/types.ts`) carried no float property at all, so
every floated element in every observation reconstructed as `float: none`.

**Added:** `float`, `clear` (a float list without its terminator produces the
opposite failure) and `text-indent` (the `text-indent: -9999px` off-screen-text
idiom, unobservable without it).

**Mandatory mirror:** all three were checked against `QA_STYLE_PROPERTIES` in
`src/reconstruction-qa/capture-page.ts` (the only change made to that file).
`float` and `clear` were added; **`text-indent` was already there**, in the
typography tail and in `QA_ONLY_STYLE_PROPERTIES`. Adding it a second time made
the list carry it twice and turned two checks in `smoke-qa-independence` red
(`the QA list has no duplicates — 152 entries, 151 distinct`). The duplicate was
removed and a note left in its place. `QA_ONLY_STYLE_PROPERTIES` keeps
`text-indent`, which is correct by that constant's own documented contract
("if the Observer later adopts one of these, this constant stays correct as
properties QA added on its own initiative").

**Measured on gs.severance.healthcare `/gs/index.do`**, desktop, comparing the
pre-fix run `2026-09-04T18-13-50-154Z` with the post-fix run
`2026-09-04T22-33-34-567Z`:

| | pre-fix | post-fix |
|---|---|---|
| `float` present anywhere in `styles.json` | **no** | yes — 348 `none`, **24 `left`**, 2 `right` |
| `clear` present | no | yes |
| `text-indent` present | no | yes |
| `.slick-slide` elements observed | 68 | 68 |
| …carrying `float: left` | **0** | **all of them** |
| slick arrows carrying `text-indent: -9999px` | 0 | 4 |

Source geometry of the visible slides in the post-fix observation:
x = 176, 433 (`slick-current slick-active`), 690, 947 — positive and inside the
`.slick-list` clip; the off-track clones sit at −594, −337, −80, which is what a
slick carousel is supposed to look like. The clone can now reproduce that,
because `float: left` is finally in the artifact it is built from.

`smoke-qa-independence`: **101 checks before → 101 after, 101/101 PASS.**

### 6A.2 FIX 2 — the preparation scroll never scrolled a `scroll-behavior: smooth` page

`runScrollPass` (`src/observer/layout-probe.ts`) issued
`window.scrollBy(0, step)` and read `window.scrollY` **in the same evaluate**,
then `break`-ed when the difference was `<= 0`. Under
`html { scroll-behavior: smooth }` — one CSS declaration — `scrollBy` is
asynchronous: it starts an animation and returns. The synchronous read therefore
always saw zero movement, the loop broke on step 1, and **the Observer never
scrolled the page at all.**

**The fix, in three parts:**

1. Scroll with `window.scrollTo({ top, left: 0, behavior: "instant" })` — an
   explicit behaviour that overrides the page's own `scroll-behavior`.
2. Measure progress from a **second** `evaluate` taken **after** the settle wait,
   so a deferred or animated scroll is measured once it has landed. The bottom
   check uses that post-settle reading too, because a page that grows as it
   loads has a different `scrollHeight` after the dwell than before it.
3. Tolerate `SCROLL_NO_PROGRESS_TOLERANCE = 3` consecutive stalls instead of
   breaking on the first. Not zero-tolerance: a genuinely pinned page
   (`overflow: hidden` scroll-jacked intro) would otherwise burn the whole step
   budget on every pass, four passes per page.

**Dwell and step size**, per the measured guidance: `SCROLL_STEP_FRACTION`
0.85 → **0.5**, `SCROLL_STEP_SETTLE_MS` 250 → **700**. An 0.85-viewport jump can
carry an element past an IntersectionObserver trigger band between two samples,
and 250 ms is shorter than a typical 300–600 ms reveal transition, so the sample
landed mid-fade. `SCROLL_MAX_STEPS` 40 → **70** and `SCROLL_MAX_TOTAL_MS`
15 s → **60 s** keep the reach and the time budget consistent with the smaller
step.

The step cap is not a free number. Halving the step halves the reach at a fixed
cap, so a page the OLD pass reached the bottom of would have been silently
truncated by the fix: `40 × 0.85 = 34` viewport heights before, `60 × 0.5 = 30`
after. The first post-fix suite run caught exactly this — check 34 below is the
inequality, and it went red at 60 — so the cap is 70 (`70 × 0.5 = 35 vh`) and the
wall clock is 60 s so that `70 × 700 ms = 49 s` of dwell is not what stops the
pass. **This costs throughput on long pages**: `hobbang.net /` went from 28.3 s
to 120.4 s per page across both viewports and all probes. Correctness over
throughput, but the closure canary has to budget for it.

#### The defect, measured on real artifacts already on disk

`scrollSteps` / `scrollDistancePx` recorded by the **old** code:

| site / page | viewport | documentHeight | steps | distance |
|---|---|---|---|---|
| seoultone.kr `/` | desktop | 4,892 | **1** | **0** |
| seoultone.kr `/` | mobile | 5,632 | **1** | **0** |
| hobbang.net `/` | desktop | 10,863 | **1** | **0** |
| hobbang.net `/` | mobile | 17,230 | **1** | **0** |
| gs.severance `/gs/index.do` | desktop | 2,700 | 3 | 1,800 |

Two of the four canary sites were never scrolled at all. gs.severance was, which
is why it does not show the defect: it declares `scroll-behavior: auto`.

#### The fix, measured LIVE on hobbang.net (old pass vs new pass, same load path)

`hobbang.net` computes `scroll-behavior: smooth` on `<html>`:

| viewport | documentHeight | OLD steps / distance | NEW steps / distance |
|---|---|---|---|
| 1440×900 | 10,863 | **1 / 0 px** | **23 / 9,963 px** |
| 390×844 | 17,230 | **1 / 0 px** | **39 / 16,323 px** |

Reproduce with `npx tsx tmp/wr2875/page-state/scroll-check.ts https://hobbang.net/`,
which runs a faithful copy of the pre-28.75 pass and the shipped
`autoScrollPrepare` back to back on the same URL.

The wave-2 observation reproduces it end to end. `hobbang.net`
`2026-09-04T22-39-01-787Z` vs the pre-fix `2026-09-04T18-13-50-162Z`:

| page | viewport | documentHeight | steps before → after | distance before → after |
|---|---|---|---|---|
| `/` | desktop | 10,863 | 1 → **23** | 0 → **9,963** |
| `/` | mobile | 17,167 | 1 → **39** | 0 → **16,323** |
| `/링크모음/검색/` | desktop | 3,317 | 1 → **6** | 0 → **2,417** |
| `/링크모음/검색/` | mobile | 5,817 | 1 → **12** | 0 → **4,973** |

`10,863 − 900 = 9,963` and `17,167 − 844 = 16,323`: the pass now lands exactly at
the bottom of the document at both viewports, on a page it previously never
scrolled a single pixel of.

On gs.severance (`scroll-behavior: auto`) the two passes reach the same depth —
1,800 px desktop / 3,081 px mobile — and the new one simply takes more, smaller
steps (3 → 4 desktop, 5 → 8 mobile). The declaration, not the fix, was what
changed the answer.

#### What could NOT be measured, and why

The acceptance asked for `zeroOpacityNodes` and `opacityHiddenTextChars` on
seoultone.kr `/` before and after. Both counters are produced by
`src/responsive-qa/probe.ts` — a different lane's QA probe, not by an
observation — and, more decisively, **seoultone.kr became unreachable before the
fix could be re-observed** (§4.2: Cafe24 daily traffic cap, resets at midnight
KST). So:

* seoultone.kr was **not** re-observed with these two fixes. Its newest run,
  `2026-09-04T22-16-43-848Z`, carries the popup-gate fix only.
* The scroll defect is instead demonstrated on **hobbang.net**, live, where it is
  the same mechanism (`scroll-behavior: smooth`) and the same measured symptom
  (1 step, 0 px on a 10,863 px page).
* The `zeroOpacityNodes` / `opacityHiddenTextChars` figures must be re-measured
  by the responsive-qa lane against the new observation run ids in §4.1.

---

## 7. Tests

All permanent, in `scripts/smoke-multi-observer.ts` (plus the mirror invariant,
which also guards `scripts/smoke-qa-independence.ts`).
**263 checks before → 298 after. No check was removed or weakened.**
`smoke-qa-independence`: 101 → 101, 101/101 PASS.

### 7.1 New fixtures

| route | what it is |
|---|---|
| `/popup-panel` | A centered `min(440px, 90vw) × 70vh` modal, `position: fixed`, `z-index: 9999`, painted background, appearing 350 ms after load with an `aria-label="닫기"` control. At 1440 it covers 0.306 of the width → the **old gate refuses it**; at 390 it covers 0.900 → cover-shaped. Same element, two viewports. |
| `/neg-panel-weak-only` | Its **discriminating twin**: identical box, identical lift, identical painted background, on a scroll-locked page — but present from the first paint, no dialog semantics, and a control reading `계속하기 / Continue` which is not in the dismissal vocabulary. Two WEAK signals, no strong one. |

Both fixtures declare `<meta name="viewport">`. Without one, Chromium's mobile
emulation lays a page out in a **980px** layout viewport, so every mobile
coverage fraction is computed against the wrong width — the first version of
this fixture measured 0.449 at "390" for that reason, and the check caught it.
The five pre-existing negative controls are left exactly as they were.

### 7.2 New checks (35 in total — items 1–25 here, 26–35 in §7.2b)

| # | check | what it proves |
|---|---|---|
| 1 | a centered desktop modal at ~30% of 1440 is dismissed | the defect is closed |
| 2 | …recorded as `shapeClass: "panel"` with `widthCoverage < OVERLAY_SHAPE.minWidthCoverage`, `panelMatches ≥ 1`, `structuralMatches === 0` | the OLD gate's exact refusal arithmetic, asserted rather than argued |
| 3 | …the same element gets the same answer at 390 | one element, two viewports, one verdict |
| 4 | …the dismissal is VERIFIED (coverage → 0, scroll lock released) | not assumed |
| 5 | …the collector's cover-only census still flags nothing | only the normalizer was widened |
| 6–10 | **all five negative controls re-asserted at BOTH 1440 and 390**: `qualified === 0` and `panelMatches === 0` on each side | the widened gate does not admit a header, a chat widget, an a11y rail, a hero or a scroll-locked cover as a candidate at either viewport |
| 11 | the weak-only twin **IS** admitted by the panel tier | the twin test is not vacuous |
| 12 | …and is refused anyway at both viewports | two weak signals never clear the bar |
| 13 | fixture normalization symmetry across viewports | every fixture route answers the same at 1440 and 390 |
| 14 | no DOM-deletion/mutation form in `normalize-page-state.ts`, comments stripped | the auditor's grep, as a check: 13 forbidden forms (`.remove(`, `removeChild`, `replaceChild`, `innerHTML =`, `outerHTML =`, `.style.`, `setProperty`, `setAttribute`, `removeAttribute`, `classList.`, `.hidden =`, `force: true`, `dispatchEvent`) |
| 15 | …and that matcher is not vacuous | it fires on a source that carries one, and not on a comment |
| 16 | the default evidence root is outside `docs/result/` and free of `28.7/` | defect 3 cannot recur |
| 17 | …and `types.ts` hardcodes no `docs/result/28.7/evidence` path | same, at the source |
| 18 | `PANEL_SHAPE` is genuinely a wider admission than `OVERLAY_SHAPE` and still refuses full-bleed | the constants themselves are pinned |
| 19 | the API is usable from OUTSIDE the observer (raw Playwright page, two calls) | defect 2's deliverable, exercised not asserted |
| 20 | with call 1: census `available`, `appeared-after-initial-paint` contributes | the contract works |
| 21 | **without call 1**: status `absent`, a limitation naming `markInitialPaintCensus`, that signal gone | the degradation is RECORDED, not silent |
| 22 | …and the degraded call still dismisses on the remaining evidence | it degrades, it does not fail |
| 23 | …evidence written under the root the CALLER passed | no hardcoded path |
| 24 | **real-site** symmetry across every latest site-observation run on disk | acceptance 2, on real data |
| 25 | …and the sweep reports how much real data it examined | it cannot pass silently on none |

### 7.2b Checks added by the scope addition (items 26–35)

| # | check | what it proves |
|---|---|---|
| 26 | `STYLE_WHITELIST ⊆ QA_STYLE_PROPERTIES` | the 28.6 mistake (five table properties added without the mirror, red until 28.7 found it) cannot be re-made silently |
| 27 | `float`, `clear`, `text-indent` present on BOTH sides | this wave's three additions specifically |
| 28 | a `scroll-behavior: smooth` page is traversed to the bottom | the scroll defect is closed |
| 29 | …and the reveal fired on every block (0 of 8 left at opacity 0) | the CONSEQUENCE, not just the step count |
| 30 | …and it matches the identical page WITHOUT the declaration | `scroll-behavior` no longer changes the answer |
| 31 | …and both report `prepare-scroll-complete` | the status is not quietly degraded |
| 32 | a genuinely pinned page ends after `SCROLL_NO_PROGRESS_TOLERANCE` stalls | the stall guard bounds a scroll-jacked page instead of burning the budget |
| 33 | …and the tolerance is below the step cap | the guard, not the cap, does the stopping |
| 34 | the step budget still reaches as far as the pre-28.75 policy | the smaller step did not shrink the reach |
| 35 | the slow reveal fixture's fade-IN outlasts every sample taken while a block is on screen | the sampling-floor check cannot go vacuous under the new dwell |

#### Two pre-existing checks the new dwell broke, and why the fixture changed

Raising `SCROLL_STEP_SETTLE_MS` to 700 ms and halving the step also changed what
the **existing** scroll-reveal fixture proves, and the suite said so rather than
quietly passing:

* **The step-budget inequality (check 34)** went red at `SCROLL_MAX_STEPS = 60`.
  That is the check doing its job — the constant, not the check, was wrong.
  Fixed at the source: 70 steps (§6A.2).
* **The sampling-floor checks** went red because `revealedOpacity` is the
  *maximum* opacity the probe sampled, and a block is now on screen for
  `⌈(900 + 300) / 450⌉ = 3` samples instead of 2. Its last on-screen sample
  therefore lands ~2,100 ms after the reveal fires, by which time any fade the
  **ordering** pin admits (`SLOW_FADE_MS × 0.95 < SCROLL_STEP_SETTLE_MS +
  SETTLE_MS`, i.e. `< 2,000 ms`) has already completed. The maximum reads exactly
  1, and the floor check says nothing.

  Both pins are real and neither may be dropped, so the fixture now uses **two
  durations instead of one**: a CSS transition is taken from the after-change
  style, so `.rv.is-in { transition }` governs the fade IN (`SLOW_FADE_IN_MS =
  2,600 ms`) and `.rv { transition }` governs the fade OUT (`SLOW_FADE_MS =
  1,300 ms`, the ordering pin, unchanged in meaning). Measured at 1440×900 with
  8 blocks: 7 of them record 0.532–0.808. Check 35 asserts the fade-in
  arithmetic against the fixture's own geometry, so this cannot silently go
  vacuous the next time a dwell constant moves.

The pinned fixture is worth a note: its first version used `html,body { overflow: hidden }`
alone, and the check caught that this is **not** a pinned page — `hidden` blocks
user scrolling but leaves the viewport programmatically scrollable, and the
reverted pass reported 40 steps and 30,600 px of travel on it. A `scroll`
listener that snaps back to 0 is what actually pins it, which is also what real
scroll-jacking libraries do. Under the OLD code that fixture reports 30,600 px of
travel that never happened — the same synchronous-read lie, in its purest form.

### 7.3 Pre-fix failure, established honestly

1. Hash the three files the fixes live in:
   ```
   442acbd7b84266f808292c4bb03274eb039692af8f7f6b6df0de1f01269b8f91  src/observer/normalize-page-state.ts
   37b01642616ef38c485c0d27ccde3440d62ab5c80443bad24e8533677f078d1a  src/observer/types.ts
   8f1d3f93ccfc93e82ca184f6475e2ea0e9fc75895dd6f831bcfc4c31b728a135  src/observer/layout-probe.ts
   ```
2. All three fixes reverted **in place** by `tmp/wr2875/page-state/revert-all.py off`:
   the panel tier becomes a `continue`; `float` / `clear` / `text-indent` are
   removed from `STYLE_WHITELIST`; `runScrollPass` returns to `scrollBy` + a
   synchronous read + `break` on the first non-progress, with the four scroll
   constants back at 0.85 / 40 / 250 ms / 15 s. Nothing else is touched, so the
   delta isolates the three fixes.
3. Full suite re-run: **287/297 — 10 checks FAIL.** Attribution:

   | fix | failing checks |
   |---|---|
   | A — the panel tier | 5 (modal dismissed; panel-tier arithmetic; dismissal verified; twin admitted; fixture symmetry, which reports `/popup-panel desktop=0 mobile=1` — the exact asymmetry the real defect had) |
   | B — the scroll pass | 4 (smooth page traversed; reveal fired; smooth ≡ non-smooth; pinned page bounded) |
   | C — the style whitelist | 1 (the three properties on both sides) |

   The remaining 287 pass in both states, as they should: they do not test these
   three changes.
4. Restored, and verified with `shasum -a 256 -c`:
   ```
   src/observer/normalize-page-state.ts: OK
   src/observer/types.ts: OK
   src/observer/layout-probe.ts: OK
   ```
5. `src/observer/types.ts` was amended **after** that verification — and only
   after it — by the two constant corrections in §6A.2 (`SCROLL_MAX_STEPS`
   60 → 70, `SCROLL_MAX_TOTAL_MS` 45 s → 60 s). Its shipped hash is therefore
   `46e197d483a04a8058673d5e3467b732233a4c13a75961e109ee1a917fe8f2c4`, not the
   `37b0164…` above. The other two files are byte-identical to the restored
   copies.

The pre-fix run is recorded at a suite total of **297**, not 298. It was taken
before check 35 existed: check 35 and the two constant corrections in §6A.2 are
consequences of the *post-fix* suite going red, and adding them afterwards would
have meant re-running the revert cycle to move a denominator without changing a
single one of the 10 attributed failures. The 10 failures and their attribution
are what that run establishes, and they are unaffected.

The real-site symmetry check (#24) was independently established as non-vacuous:
run against the pre-fix `data/seoultone.kr/…/2026-09-04T18-13-50-161Z` it fails
on `p000001` (`desktop 0 / mobile 1`) — the single asymmetric pair in the entire
`data/` tree — and passes against the post-fix run.

---

## 8. Verification table

| # | claim | how it was verified | result |
|---|---|---|---|
| V1 | The old gate refused seoultone's popup at 1440 by construction | measured geometry on the live page: width 0.347 vs required 0.5 | **confirmed** |
| V2 | The new gate detects and dismisses it at 1440 | re-observation `seoultone.kr/…/2026-09-04T22-16-43-848Z`, `p000001` desktop `{panelMatches 1, qualified 1, dismissed 1}` | **PASS** |
| V3 | before/after evidence exists for BOTH viewports | `docs/result/28.75/evidence/page-state/seoultone.kr/p000001-{desktop,mobile}-1/{before,after}.png` + `record.json` | **PASS** |
| V4 | Symmetry on a real site | all 13 seoultone pages agree across viewports; permanent check #24 sweeps every host's latest run | **PASS** |
| V5 | No new false positives on linear.app | 4 pages × 2 viewports: `panelMatches 0`, `qualified 0`, `dismissed 0` | **PASS** |
| V6 | No new false positives on hobbang.net | 10 pages × 2 viewports: `panelMatches 0`, `qualified 0`, `dismissed 0` | **PASS** |
| V7 | The five negative controls still refuse, at BOTH viewports | 10 permanent checks (5 pre-existing + 5 new) | **PASS** |
| V8 | The widened tier is not vacuous | the weak-only twin IS admitted (`panelMatches ≥ 1`) and still refused | **PASS** |
| V9 | No DOM-deletion path in the module | source-text check over 13 forbidden forms, comments stripped, plus a non-vacuity check | **PASS** |
| V10 | The API is usable outside the observer | driven against a raw Playwright page in the smoke suite | **PASS** |
| V11 | Skipping the census is recorded, not silent | `initialPaintCensusStatus: "absent"` + a limitation naming `markInitialPaintCensus` | **PASS** |
| V12 | Evidence root no longer points at a frozen wave | default is `data/page-state-evidence`; checked against `docs/result/` and `28.7/` | **PASS** |
| V13 | 28.7 evidence untouched | `docs/result/28.7/evidence/page-state/` still holds exactly `seoultone.kr/p000001-mobile-1` | **confirmed** |
| V14 | `pnpm typecheck` | `tsc --noEmit` | **exit 0** |
| V15 | `npx tsx scripts/smoke-multi-observer.ts` | full suite | **298/298 PASS, 0 FAIL** |
| V16 | Pre-fix failure count | gate reverted in place, suite re-run, module restored and hash-verified | **287/297 — 10 checks FAIL** (5 popup gate / 4 scroll pass / 1 whitelist) |

---

## 9. Remaining risk

1. **The panel thresholds are calibrated on three sites.** `PANEL_SHAPE`'s five
   numbers were chosen against measured geometry from seoultone.kr,
   linear.app and hobbang.net plus seven fixtures. A site with a modal smaller
   than 0.20 × 0.25 of the viewport, or one welded to a viewport edge on both
   axes, is still refused by shape. That is the deliberate trade: this wave
   moved the gate from "blind to every centered desktop modal" to "sees the
   substantial, floating, lifted ones", not to "sees everything".

2. **`backdrop-behind` has not fired on a real site yet.** It is new, it is
   WEAK, and none of the three sites in this wave produced a scrim/panel pair.
   It is covered by reasoning and by the module's bounds (≤8 ancestors, ≤4
   siblings per level), not by a real-site observation. It cannot qualify
   anything alone.

3. **The QA half of defect 2 is not done here.** `src/responsive-qa/**` is a
   different lane. Until that lane calls `markInitialPaintCensus` +
   `normalizePageState` in its source capture, the source screenshot on a site
   with an entry modal still shows the popup and the clone is still charged for
   content the engine removed. The interface is ready and documented; the wiring
   is theirs.

4. **`headerLikeRefused` and `panelMatches` can now double-count.** An element
   with `0.5 ≤ width < 0.85` that fails the cover height/area test increments
   `headerLikeRefused` (its pre-28.75 meaning, kept so the collector census stays
   pinned) and may ALSO be admitted as a panel. The counters describe two
   different gates, not one; anyone reading them as a partition will be wrong.
   Documented on the schema fields.

5. **A partial initial-paint census is still treated as no census.** Unchanged
   from 28.7 and still the right call, but on a document larger than 20,000
   elements `appeared-after-initial-paint` never fires. It is now visible as
   `initialPaintCensusStatus: "partial"` rather than being folded into a bare
   `false`.

6. **Symmetry is asserted on `dismissed > 0`, not on the element.** Two viewports
   could dismiss *different* overlays and still look symmetric. In practice the
   attempt records carry the `domPath` and could be compared; this wave did not,
   because a responsive site legitimately renders different DOM at the two
   viewports and a stricter check would produce false alarms.

7. **seoultone.kr was never re-observed with the two content-loss fixes.** Its
   newest run, `2026-09-04T22-16-43-848Z`, carries the popup-gate fix only,
   because the site began serving a Cafe24 daily-traffic-cap interstitial before
   the scope addition landed. Anything downstream that rebuilds seoultone from
   that run gets a page whose `float` values and scroll-revealed content are
   still missing. **Re-run it before the closure canary** (§4.1 carries the exact
   command); the cap resets at midnight KST.

8. **The scroll pass is now much slower on long pages.** `hobbang.net /` went
   from 28.3 s to 120.4 s across both viewports and all probes, and the raised
   caps (§6A.2) allow up to 49 s of dwell per pass on a page that keeps moving.
   Nothing is wrong, but a whole-site canary's wall-clock budget has to be
   re-estimated from these runs, not from the pre-28.75 ones.

9. **gs.severance's own entry popup is still not dismissed** — before or after
   this wave, at either viewport. Its `/gs/index.do` overlay carries the
   accessible text `오늘하루 열지않기 Close`, and the phase leaves it alone. Not
   a regression, and not something this wave claims to have fixed: it is the
   clearest live evidence that the gate remains narrower than "every entry
   popup" (risk 1, in the field).
