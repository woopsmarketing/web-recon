# Phase 3 — Verification Measurements

All measurements below were captured with Playwright (Chromium) against:
- **source**: `https://apartmentary.com/` and `https://apartmentary.com/service` (live)
- **clone**: the app started with the exact required command —
  `cd data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app && pnpm start --port 3212`
  (no build step run beforehand, confirming the CSS-only fix needs none)

Method: `getBoundingClientRect()` on seven page-level landmarks — the
`MuiBackdrop-root` overlay, the outer app-shell wrapper, the header, the
floating "상담 신청" action button, the main content region, a repeating
divider/spacer section, and the footer — resolved from the actual
`reconstruction-data/pages/p000001.json` / `p000006.json` node trees (source
side resolved via the equivalent DOM position, cross-checked by real MUI
class names: `MuiBox-root css-w16pwn` = header, `css-13o6z6d` = footer, etc.)
rather than guessed selectors.

## 1. Full landmark geometry, source vs. clone, all widths, both pages

x / width / right in CSS px. "match" = same `x` and `width` within 1px.

| route | width | landmark | source x,w,right | clone x,w,right | match |
|---|---|---|---|---|---|
| / | 1024 | backdrop | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1024 | wrapper | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1024 | header | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1024 | floatBtn | 944,80,1024 | 944,80,1024 | YES |
| / | 1024 | main | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1024 | midSection | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1024 | footer | 0,1024,1024 | 0,1024,1024 | YES |
| / | 1100 | backdrop | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1100 | wrapper | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1100 | header | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1100 | floatBtn | 1020,80,1100 | 1020,80,1100 | YES |
| / | 1100 | main | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1100 | midSection | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1100 | footer | 0,1100,1100 | 0,1100,1100 | YES |
| / | 1440 | backdrop | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1440 | wrapper | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1440 | header | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1440 | floatBtn | 1360,80,1440 | 1360,80,1440 | YES |
| / | 1440 | main | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1440 | midSection | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1440 | footer | 0,1440,1440 | 0,1440,1440 | YES |
| / | 1920 | backdrop | 0,1920,1920 | 0,1920,1920 | YES |
| / | 1920 | wrapper | 0,1920,1920 | 0,1920,1920 | YES |
| / | 1920 | header | 0,1920,1920 | 0,1920,1920 | YES |
| / | 1920 | floatBtn | 1840,80,1920 | 1840,80,1920 | YES |
| / | 1920 | main | 0,1920,1920 | 0,1920,1920 | YES |
| / | 1920 | midSection | 0,1920,1920 | 0,1920,1920 | YES |
| / | 1920 | footer | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1024 | backdrop | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1024 | wrapper | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1024 | header | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1024 | floatBtn | 944,80,1024 | 944,80,1024 | YES |
| /service | 1024 | main | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1024 | midSection | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1024 | footer | 0,1024,1024 | 0,1024,1024 | YES |
| /service | 1100 | backdrop | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1100 | wrapper | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1100 | header | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1100 | floatBtn | 1020,80,1100 | 1020,80,1100 | YES |
| /service | 1100 | main | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1100 | midSection | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1100 | footer | 0,1100,1100 | 0,1100,1100 | YES |
| /service | 1440 | backdrop | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1440 | wrapper | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1440 | header | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1440 | floatBtn | 1360,80,1440 | 1360,80,1440 | YES |
| /service | 1440 | main | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1440 | midSection | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1440 | footer | 0,1440,1440 | 0,1440,1440 | YES |
| /service | 1920 | backdrop | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1920 | wrapper | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1920 | header | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1920 | floatBtn | 1840,80,1920 | 1840,80,1920 | YES |
| /service | 1920 | main | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1920 | midSection | 0,1920,1920 | 0,1920,1920 | YES |
| /service | 1920 | footer | 0,1920,1920 | 0,1920,1920 | YES |

**56/56 landmark measurements match exactly** across every non-390 width on
both pages, on the exact `pnpm start --port 3212` verification command.

(390 is excluded from this table because the desktop subtree is
`display:none` at that width by design — see §3.)

## 2. Hero geometry (the actual bug surface)

| page | width | element | source w×h | clone w×h (before fix) | clone w×h (after fix) |
|---|---|---|---|---|---|
| / | 1440 | hero frame (n000050) | 1440×818 | 1440×818 | 1440×818 |
| / | 1920 | hero frame (n000050) | 1920×1091 | 1440×818 (frozen) | 1920×1091 |
| /service | 1440 | hero `<img>` (n000052) | 1440×525 | 1440×525 | 1440×525 |
| /service | 1920 | hero `<img>` (n000052) | 1920×700 | 1440×525 (frozen) | 1920×700 |

Both now match the source exactly, including the derived height (aspect
ratio preserved through the fix, not hardcoded).

## 3. 390 / 1440 non-regression check

- **1440**: every override added either (a) resolves to the exact same
  literal value the base class already had at exactly 1440px (e.g. `n000053`
  CTA box: `left:60%` × 1440 = 864px, identical to the original literal
  `left:864px`), or (b) is mathematically a no-op at the capture width by
  construction (`width:auto`/`width:100%` filling an already-1440-wide
  parent = 1440, matching the original literal value to sub-pixel precision
  — the `aspect-ratio` fix changes computed height from `818.172px` to
  `818.18px`, a 0.008px difference). Confirmed via the full landmark table
  above (`1440` rows, 14/14 match) and side-by-side screenshots
  (`evidence/*-1440.png`).
- **390**: not one of the changed rules is reachable at 390. The desktop
  subtree (`[data-wr-viewport="desktop"]`) is `display:none` below 801px per
  `app/globals.css`, which this task did not touch. The two shared
  class-level fixes (`.wr-st000129`, `.wr-st000132`) were checked against the
  live page HTML — the mobile subtree uses entirely different, separately
  numbered classes (`wr-st000128` for its own backdrop, not `wr-st000129`),
  confirmed via `curl` + `grep` on the rendered page, so there is zero
  possibility of the class-level edits reaching mobile. Screenshot comparison
  (`evidence/*-390.png`) shows the same layout/positions as before (remaining
  differences — hamburger icon glyph, a missing photo asset — are pre-existing
  content/asset gaps unrelated to this task, not something this fix touched
  or could have touched).
- No horizontal overflow introduced at any width: `document.documentElement.scrollWidth
  === clientWidth` at 390/1024/1100/1440/1920 on both routes (checked via
  Playwright, see report 02 verification section). No `pageerror` console
  events on any of the 20 width×route combinations checked with the
  production build.

## 4. Evidence files

`docs/result/apartmentary-fluid-desktop/evidence/`:
- `source-home-{390,1024,1440,1920}.png`, `clone-home-{390,1024,1440,1920}.png`
- `source-service-{1440,1920}.png`, `clone-service-{1440,1920}.png`

All captured full-page, same viewport width, source and clone side by side
by filename.
