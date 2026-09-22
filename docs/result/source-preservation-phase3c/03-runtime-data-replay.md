# 03 — Runtime data replay (Track A)

**Result: the preserved source runtime renders all four data-driven areas from synthetic data, stays
mounted, and produces the same structural counts as the accepted Phase 2 DOM.**

## Runs

| attempt | experiment | status |
|---|---|---|
| 1 | `data/apartmentary.com/runtime-experiments/2026-09-16T10-47-09-345Z/` | **superseded, kept unmodified** (`SUPERSEDED.json`) |
| 2 | `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/` | **authoritative** |

Attempt 1 had two harness defects, found by me when inspecting its screenshots:
1. **Boot scroll.** The pre-release footer *element* screenshot scrolled the window to the footer before
   the source JS was released, so the runtime booted at a non-zero scroll position. 3B.1 booted at 0.
2. **F1 footer probe anchor.** It was anchored on the emotion hash `.css-1d3bbye`, which does not exist
   at the commit point, so the F1 computed layout was not captured.

Attempt 2 fixes both:
- crop from a full-page capture, and fail closed unless scroll is `[0,0]` at release;
- anchor on the static MUI class `.MuiGrid-container`, unique in all captured DOMs.

The inputs were identical: fixtures, contract, replay set and experiment document bytes. Attempt 1's
results agree with attempt 2 on every item listed in `SUPERSEDED.json`. This is the only rerun.

## Unchanged conditions (asserted in the 117/117 static preflight)

- **Strategy and document:**
  - Strategy A over the accepted Phase 2 desktop DOM;
  - experiment document byte-identical to the 3B.1 document;
  - same 9 activated scripts with graph sha256; same buildId.
- **Runtime:** root serving mode, 1440×900, one resize to 390×844, same settle rule.
- **Probes and stand-in:** same boot probes, DOM probe, commit-point snapshot and mounted probe; only
  the `karrotPixel {track}` inert stand-in (identical config).
- **Network:** same fail-closed guard and host-resolver layer; same classification hints.
- **Primary difference: empty stubs → the 4 synthetic fixtures.**
- **Added read-only probes:**
  - footer and style forensic, at F0 and at the commit point via the same `performance.measure` hook;
  - carousel instance probe;
  - footer-row MutationObserver.
- **One source-driven interaction** (clicking the portfolio area-1 next arrow). No component was
  constructed and no state was set (`instances.harnessConstructsNoComponent` passed).

## Boot, mount, errors

| item | value |
|---|---|
| gates | runtime preflight 4/4 · pre-execution gate 11/11 · scroll at release `[0,0]` |
| boot | **BOOT_PROVEN**: webpack chunks 9774/179/2888/2924/7925/5405, Next 12.3.4 router ready, `Next.js-hydration` measure at 868 ms |
| mounted | **STAYED_MOUNTED**: 660 root elements at settle, 601 after resize; React root and router present; no `_error` request; 0 local 404 |
| fatal errors | **0** (boot and resize). The single console error is the known blocked hero mp4 (`ERR_BLOCKED_BY_CLIENT`) during pre-execution |
| stand-in calls | 1 (`karrotPixel.track`, 1 string argument, 888 ms) |
| new same-class external-global crash | **none**, so no `fbq`/`Kakao` stand-in was considered |

## API interceptions: 4/4 from fixtures

| endpoint | fixtureId | decision | bytes | items | `authorization` |
|---|---|---|---|---|---|
| reviews | fixture-reviews-v1 | stub-fulfilled | 949 | 6 | `<empty>` |
| portfoliosArea1 | fixture-portfolios-area1-v1 | stub-fulfilled | 3,425 | 10 | `<empty>` |
| portfoliosArea2 | fixture-portfolios-area2-v1 | stub-fulfilled | 1,390 | 4 | `<empty>` |
| mainBanners | fixture-main-banners-v1 | stub-fulfilled | 2,041 | 9 | `<empty>` |

## Three states at 1440

| measure | A — Phase 2 static clone | B — 3B.1 empty-data runtime | C — 3C synthetic-data runtime |
|---|---|---|---|
| `#__next` elements | 660 | 213 | **660** |
| carousel-class nodes | 38 | 0 | **38** |
| `[data-aos]` nodes | 16 | 2 | **16** |
| buttons | 32 | 24 | **32** |
| images in root | 41 | 9 | **41** |
| root textContent chars | 1,769 | 522 | 1,884 (fictional text lengths differ) |
| document height (px) | 5,678 | 4,533 | 6,254 |
| hero exists | yes (captured) | no | **yes**, 9 slides |
| carousels initialised | frozen classes only | none | **4 live source instances** |
| portfolio sections populated | yes | no ("0" nodes) | **yes**, 10 + 4 cards |
| reviews populated | yes | section absent | **yes**, 6 cards |
| arrows / progress | frozen | absent | **present** (source-rendered) |
| fatal errors / mounted | — | 0 / yes | **0 / yes** |

### Page height

6,254 vs 5,678 = +576 px:
- **Footer: +672 px.** The footer root is 1,386 → 2,058 px tall, because its columns are collapsed
  (Track B, `05`).
- **Everything above the footer: −96 px.** For example, the review block is 36 px shorter with
  fictional text, and portfolio area 2 starts 30 px higher.

Apart from the footer, section geometry is essentially restored. The hero keeps 1440 wide and about 806 px
tall (Phase 2: 813). Both portfolio lists are 451 px tall, as in Phase 2.

## Data subtrees versus the commit point

The commit point (B) is unchanged from 3B.1, because data arrives after the commit:
- 171 elements;
- 60/660 pre-execution nodes kept;
- the stand-in not yet called.

From the first microtask after the commit (213 elements) to settle, **447 elements were inserted in 4
subtrees and 0 removed**:
- hero container, 114 descendants;
- portfolio lists, 177 and 81;
- review block, 71.

All four subtrees contain synthetic text. The automatic hydration status stays `FAILED` on node identity
at the commit point: 60/660 kept, 59 at settle. That is still correct for **node identity**. Data
subtrees are client-created by design, and Track B explains part of the non-data replacement.

## Visual caveat for human review: blank portfolio cards in `desktop-synthetic.png`

In the full-page desktop screenshot, the two portfolio lists show arrows and progress bars but **blank
card areas**. The cause is the source's scroll animation, not missing data:
- the instance probe reports 10/10 and 4/4 images loaded and 3 visible slides of 413 px;
- in `dom-after.html`, the **14 per-card `data-aos="fade-up"` elements** (10 + 4, all containing synthetic
  text) are `aos-init` without `aos-animate`;
- the 2 section wrappers are `aos-animate`. AOS adds `aos-animate` only when an element scrolls into
  view, and a full-page capture does not scroll;
- Phase 2 captured all 16 as `aos-animate`;
- attempt 1, which booted scrolled to the footer, shows the cards rendered;
- in `mobile-synthetic.png`, area 1 is visible, because the arrow click scrolled it into view, while
  area 2 is still blank.
