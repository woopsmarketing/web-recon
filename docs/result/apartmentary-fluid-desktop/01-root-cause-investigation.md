# Phase 1 — Root Cause Investigation

**Task**: apartmentary.com clone, wide/fluid desktop responsive fix
**Target app**: `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app`
**Date**: 2026-09-14

## 1. How desktop styling is wired

- `app/globals.css` switches between two independently-rendered subtrees
  (`page.desktop.doc` / `page.mobile.doc`, see `src/runtime/PageRenderer.tsx`)
  at the single observed breakpoint (801px). Only 390 (mobile) and 1440
  (desktop) were ever observed by the recon engine — there is no captured
  data for any other width.
- `src/runtime/NodeRenderer.tsx` renders each JSON node as
  `createElement(tag, { className, "data-wr-node": id, ... })`. Every node
  carries a `data-wr-node` id (page-scoped, not globally unique — reused
  across pages, but only one page's tree is ever mounted at a time for a
  given route) and a `className` referencing one generated style class in
  `public/wr/generated-styles.css` (e.g. `wr-st000900`).
- `public/wr/generated-styles.css` (3.9MB) has two layers:
  1. One `.wr-stNNNNNN{...}` rule per unique **literal computed style**
     captured by `getComputedStyle()` at the single observed viewport —
     dozens of nodes across the site share a class when their computed
     styles are byte-identical (global dedup catalog).
  2. ~3,100 **per-node override rules**, scoped as
     `[data-wr-page="pNNNNNN"][data-wr-viewport="desktop"|"mobile"] [data-wr-node="nNNNNNN"] { ... }`
     (specificity (0,3,0), beats the single-class base rule (0,1,0)
     regardless of source order). These already existed in the shipped file
     — they are the generator's own pass to relax certain literal widths so
     the layout is not glued to exactly 1440px. This mechanism was already
     used by ~1,556 desktop rules and ~1,607 mobile rules across all 7 pages
     before this task began.

## 2. What was actually broken (not assumed — measured)

Booted the app with `pnpm build && pnpm start` (see gotcha below on `pnpm dev`)
and used Playwright against both the live source (`https://apartmentary.com/`,
`/service`) and the local clone at 390/1024/1100/1440/1920, reading
`getBoundingClientRect()` + `getComputedStyle()` for the seven page-level
landmarks (backdrop overlay, outer app wrapper, header, floating action
button, main content, a repeating divider section, footer) identified by
walking `reconstruction-data/pages/p000001.json` / `p000006.json`.

Source (`https://apartmentary.com/`) result: **every one of these landmarks is
already 100% fluid** — `x=0`, `width=viewport`, at every tested width up to
1920, with zero `max-width` cap at the top-chrome level. The one exception is
the floating action button, which stays a fixed 80px wide anchored to the
**right** edge (`right: 0`) at every width.

Clone (pre-fix) result:

| width | header/main/footer/backdrop | floatBtn |
|---|---|---|
| 1024 | correctly fluid (`width` = viewport) | correctly tracks right edge |
| 1100 | correctly fluid | correctly tracks right edge |
| 1440 | fluid (coincides with capture width) | correctly tracks right edge (coincidence) |
| 1920 | **stuck at 1440**, not growing | **stuck at `x=1360`**, not tracking the right edge |

So the 801–1440 range was already working via the pre-existing override
mechanism. The bug is specifically about the **wide** end (>1440) plus two
fixed-position elements that were never covered by that mechanism at all.

## 3. Isolating the exact defect

### 3a. The `max-width:100%`-only pattern (the dominant bug)

Node `n000005` (`p000001` desktop) — the block wrapping header, floating
button, main content, divider, and footer — had exactly one override:

```
[data-wr-page="p000001"][data-wr-viewport="desktop"] [data-wr-node="n000005"] {
  max-width: 100%;
}
```

Its base class (`wr-st000952`) still carries the literal captured
`width: 1440px`. `max-width: 100%` only ever *caps* a width from above — it
cannot stretch a smaller, already-fixed `width` value past itself. Used-width
algorithm: `min(specified width, max-width)`. Below 1440 this correctly
shrinks (`min(1440, 1024) = 1024` ✓). At/above 1440 it does nothing
(`min(1440, 1920) = 1440` ✗) — which is exactly the observed "stuck at 1440"
symptom, and why 1024/1100 already looked fine while 1440/1920 didn't
(1440 only "worked" because it coincides with the frozen value).

Scanning both target pages' full desktop node trees found **42 nodes** across
`p000001` and `p000006` with this exact defect (`max-width: 100%` present,
no `width` override) — confirmed via `grep`/regex over the actual override
blocks in `generated-styles.css`, not by assumption.

### 3b. Two fixed-position elements had no override at all

- `wr-st000129` (`MuiBackdrop-root`, aria-hidden overlay): base rule sets
  `position: fixed; top:0; right:0; bottom:0; left:0;` **and also**
  `width: 1440px; height: 900px` — over-constrained. Per CSS2.1 §10.3.7, when
  `left`/`right`/`width` (and analogously `top`/`bottom`/`height`) are all
  non-auto simultaneously, `right`/`bottom` are dropped for LTR content and
  `left`+`width` win — so the backdrop was pinned to a literal 1440×900 box
  anchored top-left, never covering the full viewport at any other size.
- `wr-st000132` (floating action button): `position: fixed; left: 1360px;
  right: 0px; width: 80px` — same over-constraint. `1440 - 0 - 80 = 1360`
  (internally consistent, i.e. both values were captured at 1440 and are
  redundant with each other), so `right` was dropped and the button was
  pinned 1360px from the **left** edge forever, never actually tracking the
  right edge as the live source does.

Neither node appeared in the ~1,556 pre-existing desktop overrides at all —
the original generator pass never touched `position:fixed` elements.

### 3c. `aspect-ratio` + frozen literal `height` fights `width:auto` (hero banners)

Node `n000050` on both pages (the hero banner) already had a pre-existing
`width: auto;` override — but its base class also carries
`aspect-ratio: 1.76 / 1` (p000001) / `2.74 / 1` (p000006) **and** an explicit
literal `height` (e.g. `818.172px`). CSS aspect-ratio sizing: when `height`
is definite and `width` is `auto`, the used width is derived **from height**
(`height × ratio`), not from the parent. So `width: auto` was silently
computing `818.172 × 1.76 ≈ 1439.97px` — a value that has nothing to do with
the (now-fluid) parent's real width, confirmed live via
`getComputedStyle().width` returning `"1439.97px"` at a 1920 viewport where
the parent was genuinely 1920px wide. The direction is backwards from the
source, which scales height *from* a fluid width (confirmed: source hero
height at 1920 / height at 1440 = 1.334, exactly matching 1920/1440 =
1.3333, i.e. `width:100%` + `aspect-ratio` + `height:auto`).

The same class of bug existed one level deeper on `/service` only: the hero
`<img>` and its wrapper (`n000051`/`n000052`) had literal
`width:1440px;height:525px` with **no** override at all (no aspect-ratio
this time, just two frozen literal dimensions on a plain `<img>`).

### 3d. A decorative absolutely-positioned text box (`/service` hero CTA)

`n000053` (the "기대와 설렘만..." text card over the service hero) has
`position:absolute; left:864px; right:272.516px; width:303.484px` — all three
set simultaneously (again over-constrained; `864+303.484+272.516=1440`
exactly, i.e. redundant at capture time). Measuring the live source at every
width showed its `x` position is always exactly `0.6 × containerWidth`
(864/1440 = 0.6, and 1152/1920 = 0.6 exactly) — a percentage-based left
offset, not a fixed-pixel anchor on either edge.

### 3e. A generator inconsistency that only becomes visible once the frame is fluid

Two image carousels (the home hero swiper `n000053`→8 slides, and a small
`/service` content carousel `n000101`→6 slides) use a JS-computed
`transform: matrix(1,0,0,1,<large negative px>,0)` on their track element to
show the active slide (baked in as a literal computed value from capture
time). The **pre-existing** override set (already shipped, not written by
this task) had — inconsistently — given the *track* `width:auto` (home) /
`width:100%` (service) and *some but not all* of the individual slides
`width:100%`, while the transform offset stayed frozen at its 1440-capture
value. As long as the outer hero frame was itself frozen at 1440 (the bug
this task fixes), the mismatch was invisible — the overflow-clipped viewport
never got wider than the frozen content. Once the outer frame was made
correctly fluid (3c above), this pre-existing inconsistency became visible as
garbled/misaligned slide content at >1440px. See report 02 for the fix
(freeze the whole track+slides subtree back to the literal capture value, so
it renders consistently — full detail with root cause and reasoning is in
report 02, section "carousel coupling").

## 4. Scope boundary used throughout

All fixes are additive `[data-wr-page="..."][data-wr-viewport="desktop"]
[data-wr-node="..."]` overrides (or, for the two fixed-position elements,
plain `.wr-stNNNNNN{}` class rules, justified because those two classes are
shared byte-identically across all 7 recon pages — same real header/backdrop/
button everywhere) appended at the end of `public/wr/generated-styles.css`.
Nothing in `src/reconstruction/`, `src/observer/`, `src/sitespec/`, or any
other repo-root engine code was touched. No file outside this app directory
was read for anything other than reference (e.g. `scripts/smoke-playwright.ts`
as a Playwright usage example).

## Gotchas encountered

- **`pnpm dev` (Turbopack dev mode) crashes on this app**: React throws
  `Failed to execute 'removeChild' on 'Node'` during hydration in dev mode,
  wiping the rendered tree entirely (confirmed via `page.on('pageerror', ...)`
  — the DOM literally has zero `[data-wr-viewport]` elements afterward). This
  reproduces even with no edits at all, so it predates this task and is
  unrelated to the fix. `pnpm build && pnpm start` (production mode, no
  StrictMode double-invoke) does not exhibit it — all iteration and every
  measurement in this task used the production build.
- `public/wr/generated-styles.css` is served as a static asset by
  `next start` directly from disk on every request (`Cache-Control:
  public, max-age=0`), confirmed via `curl`. Edits to it need no rebuild —
  matches what the task brief already expected.
- Node ids (`data-wr-node`) are **page-scoped, not globally unique** — every
  page's JSON restarts numbering from `n000001`. Never rely on the id alone;
  always pair it with `[data-wr-page="..."]` (or accept that a class-level
  fix intentionally applies everywhere the identical computed style is
  reused).
