# 04 — Hydration survival (reported separately from boot)

**hydrationStatus = `UNKNOWN`.** This run did **not** measure whether the Phase 2 DOM survives
hydration.

**finalDomSurvival = `LOST`.** None of the accepted `#__next` DOM remains after settle. The
cause is the post-commit crash and unmount described in `03`, not empty data, and nothing shows
a hydration mismatch.

The first draft adjudicated `hydrationStatus = FAILED`. The independent review (MINOR 4)
objected that the label makes a post-boot crash read like a hydration failure. It was changed
to `UNKNOWN`, with the final-DOM loss recorded in its own field. This status does not change
the boot status, and the boot status does not change it.

## Before / after

Before = parsed accepted DOM with source JS held at the gate. After = settle (load event, then ≥ 1.5 s network quiet, then 2 s) after
release.

| measure | before | after |
|---|---|---|
| elements in document | 734 | 70 |
| elements inside `#__next` | 660 | **0** |
| `body.innerText` length | 1,957 | 0 |
| `#__next` textContent length | 1,769 | 0 |
| document height (px) | 5,678 | 900 |
| swiper-class nodes | 38 | 0 |
| `[data-aos]` nodes | 16 | 0 |
| buttons | 32 | 0 |
| images (document / in root) | 42 / 41 | 1 / 0 |
| videos | 1 | 0 |
| stale tokens `swiper-slide-active` / `swiper-initialized` / `aos-animate` | 4 / 4 / 16 | 0 / 0 / 0 |

## Node identity (a JSHandle to the pre-execution elements, compared after settle)

| | total | inside `#__next` |
|---|---|---|
| pre-execution elements | 734 | 660 |
| **retained** (same node, still connected) | 67 | **0** |
| **removed** | 667 | **660** |
| **inserted** | 3 | 0 |

`#__next` children before: `div.MuiBackdrop-root` (0 descendants) and `div.MuiBox-root.css-8atqhb`
(658 descendants: header, hero, portfolio, reviews, footer). **Both were removed.**
`#__next` itself survives as an empty container that still holds the React root.

Outside the root: 7 `<meta>` tags were removed from `<head>`, and 1 `<style>`, 1 `<meta>` and
1 `<script>` were inserted. That is Next's head manager and the error-path script tag. The
other 67 head/body nodes were retained.

## Detached subtree at settle (NOT a hydration-survival figure)

When React unmounts, it detaches the top-level host node, and the subtree beneath it stays
together. At settle, the detached main subtree held:

| | before execution | detached, at settle |
|---|---|---|
| descendants of `div.MuiBox-root.css-8atqhb` | 658 | **169** |
| textContent length | 1,769 | 497 |

This number mixes at least three causes that this run cannot separate:
1. the hydrate commit with empty stores (data-guarded components return `null`);
2. **synchronous layout-effect re-renders before the crash.** Under React 17, MUI
   `useMediaQuery` starts from `defaultMatches=false` and switches at 1440 px inside a layout
   effect (sc0025 @55262; index uses `breakpoints.up("md")`). That forces a mobile→desktop
   re-render;
3. unmount cleanup running on the detached nodes (e.g. Swiper destroy).

The first draft presented 169/658 (~26%) as the DOM "after the hydrate commit and before any
later render". **That claim was withdrawn** after independent review MAJOR 1.

**Limits, stated plainly:**
- **Not measured:** which 169 nodes remained (retained vs client-inserted), and whether
  attribute drift (stale Swiper or AOS classes on kept nodes) occurred. The harness recorded
  node identity only for connected nodes.
- The ~74% reduction cannot be split between "empty data" and "genuine markup mismatch"
  from this run.
- A second browser run to refine this was **not** performed. The task allows a rerun only for
  a harness bug, and the primary failure is a real runtime blocker.

## Answer to "how much of the accepted Phase 2 DOM survived hydration?"

- **Final state: none.** 0 / 660 root elements. The page is blank.
- **Through the hydrate commit alone:** **not measured.** The 169 / 658 detached count mixes
  hydration, layout-effect re-renders and cleanup.
- **Which loss is caused by what:** the total loss comes from the tracker-global crash. No
  hydration-specific loss can be attributed from this run.

Carousel loss was expected (Phase 3A, RUNTIME_COUPLED). This result is **not**
`DEGRADED_EXPECTED_EMPTY_DATA`. That label would claim the degradation is explained by empty
data, and the dominant loss here has a different cause. The survival question stays open for
the next bounded run (`07`).
