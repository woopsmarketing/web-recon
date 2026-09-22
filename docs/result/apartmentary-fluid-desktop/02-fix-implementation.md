# Phase 2 — Fix Implementation

**File touched (only file touched)**:
`data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app/public/wr/generated-styles.css`
(12,367 → 12,477 lines; a static asset served as-is by `next start`, no
rebuild required)

All changes are additive: existing rules were either completed (one missing
declaration added to an existing override block) or new rules were appended
at the end of the file. Nothing was deleted from the file's original content
except two single-declaration override rules that were themselves added
earlier in this same task and then found to be unsafe (see "carousel
coupling" below) — net effect versus the file as originally shipped is
purely additive.

## 1. The 42-node `max-width:100%` completion (root cause 3a)

For each of the 42 nodes found in report 01 §3a (27 on `p000001`, 15 on
`p000006`), the existing override block:

```css
[data-wr-page="pNNNNNN"][data-wr-viewport="desktop"] [data-wr-node="nNNNNNN"] {
  max-width: 100%;
}
```

had one `width` declaration inserted. Which value depends on the node's
**parent's** `display` (read from the actual page JSON tree, not guessed):

- Parent `display: flex` → `width: 100%;` — required because in a flex
  container, `flex-basis:auto` (the default, and what every one of these
  nodes has) pulls its value from the `width` property. `auto` there means
  "hug content" on the main axis, which would have **shrunk** these items,
  not filled them. `100%` is what actually fills the flex container's
  available space on either axis, in both flex-direction:row (main-axis) and
  flex-direction:column (cross-axis, under default stretch) contexts.
- Parent `display: block` (normal flow, not a flex item) → `width: auto;` —
  matches the convention already used by ~300 other, already-correct,
  pre-existing overrides in this same file for exactly this situation
  (standard CSS block-box behavior: `auto` fills the containing block).

15 of the 42 nodes are `flex-basis:0%; flex-grow:1` items already (repeating
testimonial-caption text blocks) — for these the added `width: 100%;` is a
verified no-op (flex-basis already governs their main-axis size, independent
of `width`), kept only for uniformity/consistency with the rest of the patch.

The critical node in this batch is `n000005` on both pages — the block
wrapping header + floating button + main + divider + footer — since it was
the actual reason those five landmark sections stayed frozen at 1440px even
though several of *their own* overrides were already correct.

## 2. Fixed-position elements (root cause 3b) — two new class rules

Appended as plain `.wr-stNNNNNN{}` rules (not page/node-scoped) because both
classes are shared byte-identically across all 7 recon pages — same real
header/backdrop/button everywhere, confirmed via `grep -l` across every page
JSON file.

```css
.wr-st000129 {           /* MuiBackdrop-root, aria-hidden overlay */
  width: auto;
  height: auto;
}
.wr-st000132 {           /* floating action button (상담 신청) */
  left: auto;
}
```

- Backdrop: dropping the literal `width`/`height` back to `auto` lets the
  four already-correct `inset:0` offsets size the box (CSS2.1 §10.3.7
  resolution once the over-constraint is removed) — now genuinely covers the
  viewport at any width.
- Floating button: clearing `left` leaves only `right: 0` (already present
  and correct in the base rule) driving the horizontal position, so it now
  tracks the right edge exactly like the source does at every width.

## 3. Hero banners — `aspect-ratio`/height fix (root cause 3c)

`n000050` on both pages: appended `height: auto;` to its existing `width:
auto;` override, so aspect-ratio now derives height from the (correctly
fluid) width instead of the reverse.

`/service` only — `n000051` (wrapper) and `n000052` (`<img>`) had no override
at all; added:

```css
[data-wr-page="p000006"][data-wr-viewport="desktop"] [data-wr-node="n000051"] {
  width: auto;
  height: auto;
}
[data-wr-page="p000006"][data-wr-viewport="desktop"] [data-wr-node="n000052"] {
  width: 100%;
  height: auto;
}
```

(Home page's hero uses a swiper carousel instead of a bare `<img>`, so this
particular pair doesn't apply there — see §5.)

## 4. `/service` hero CTA text overlay (root cause 3d)

```css
[data-wr-page="p000006"][data-wr-viewport="desktop"] [data-wr-node="n000053"] {
  left: 60%;
  right: auto;
}
```

`864px / 1440px = 0.6` exactly, and the live source's own measured position
resolves to exactly 60% of the hero's width at every tested viewport — so
`left: 60%` reproduces both the original 1440 position **exactly** (864px,
byte-identical, zero regression risk at the capture width) and the correct
scaling behavior elsewhere. Width is deliberately left as the captured
`303.484px` (not chased further — the source's own width only drifts
slightly with viewport, 303px→313px over the 1440→1920 range, which reads as
internal text reflow this clone does not reconstruct; documented as a named,
minor residual in the synthesis report).

## 5. Carousel transform coupling — found and corrected mid-task

While verifying the home hero visually at 1920, the swiper carousel content
rendered **garbled** (two different slide images overlapping with a blank
gap) — not merely capped at 1440, actively broken. Root cause: the swiper
track (`n000053` on `/`, `n000101` on `/service`) carries a captured
`transform: matrix(1,0,0,1,<translateX>,0)` computed once, at 1440, to
position the currently-active slide. This offset is only valid if the track
and every slide keep the exact same width relationship they had at capture
time.

Investigation found this coupling was **already broken before this task
touched anything**: the pre-existing (shipped) override set had, already,
`width:auto` on the home track and `width:100%` on 7 of its 8 slides (and
`width:100%` on the small `/service` carousel's track) — inconsistent with
each other and with the frozen transform, but invisible as long as the outer
hero frame was itself capped at 1440 (this task's root cause 3c) and thus
never rendered anything past that width in the first place. Fixing 3c
unmasked this latent, pre-existing inconsistency.

Fix applied (this task's own `n000054` addition was reverted first, then the
pre-existing conflicting overrides were also removed, restoring the whole
subtree to one consistent, self-referential state matching how it always
rendered at ≤1440):

- Removed the `width: 100%;` this task had added to `n000054` (one of the 8
  home slides) — reverted to its original `max-width: 100%;`-only state.
- Removed the **pre-existing** `width: auto;` override on `n000053` (home
  track) entirely.
- Removed the **pre-existing** `width: 100%;` override on `n000101`
  (`/service` small carousel track) entirely.

Net effect: both carousel tracks (and all their slides) now render at their
literal captured 1440px width, consistently cropped/left-aligned within
their (correctly fluid, full-bleed) parent frame — no growth past 1440 for
the carousel's own pixel content, but no garbling either. This is a
deliberate, honest, documented trade-off: implementing a live-recalculated
carousel transform would mean synthesizing new interactive/JS behavior this
task is explicitly scoped to avoid ("Do NOT implement... hero carousel").
Visually confirmed clean via full-page screenshots at 1024/1440/1920 after
this change (see `evidence/`).

## Verification that only the intended file changed

```
$ find . -newer package.json -type f   # (mtimes checked individually; package.json is stale/uninformative)
$ stat -f "%Sm" public/wr/generated-styles.css app/globals.css app/layout.tsx src/runtime/*.tsx
2026-09-14 15:09:24  public/wr/generated-styles.css   <- only this one changed
2026-09-14 14:01:12  app/globals.css
2026-09-14 14:01:12  app/layout.tsx
2026-09-14 14:01:12  src/runtime/*.tsx
```

No bundled file (`app/*`, `src/runtime/*`, `next.config.mjs`) was modified,
so `pnpm build` is not required before `pnpm start` — confirmed by running
the exact verification command from a cold `next start` process and
re-measuring against the live source (see report 03).
