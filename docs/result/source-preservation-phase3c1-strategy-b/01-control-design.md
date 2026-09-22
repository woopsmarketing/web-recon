# 01 — Control design

## Question

> Does hydrating the captured original initial/SSR response document eliminate the footer failure seen under Strategy A?

This is one bounded control. It does not implement Strategy B.

## Arms

| | Strategy A (Phase 3C, frozen) | Strategy B (this phase) |
|---|---|---|
| hydration base | Phase 2 clone `desktop/index.html`, built from Phase 1 **runtime DOM** (`document/runtime.html`, post-runtime desktop state) | Phase 1 **initial response** `document/response.html` (sha `95eb46dd…`) with script start-tag splices only |
| source runtime | 9 preserved scripts, byte-identical | the same 9 (activated start tags byte-identical to A) |
| data | 4 synthetic fixtures (hero 9 / area 1 10 / area 2 4 / reviews 6) | same bytes |
| network | fail-closed router + host-resolver isolation | same libs, same policy |
| stand-ins | inert `karrotPixel.track` | same |
| viewport / resize / settle | 1440×900 → 390×844; load + 1.5 s quiet (max 15 s) + 2 s | same config values |
| artifact | `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/` | `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/` |

Strategy A was **not** re-run. Its evidence is compared as recorded.

## Hypothesis under test (H1, not assumed)

The source footer calls `useMediaQuery(up("md"))`, which returns `false` on the first client render, so the first
client tree is the below-md list of 4 children. Strategy A hands React the settled md DOM (3 children), and positional
hydration then puts the content subtree into the 100 px spacer. If H1 holds, a base whose structure matches the first
client render should keep the content subtree in the `flex:1` wrapper through the commit, the md re-render, settle and
the resize.

## Lifecycle points

| point | when | how |
|---|---|---|
| **B0** | document parsed, first runtime script held at the router, before release | `page.evaluate` probes; identity registered on a non-enumerable recorder |
| **B1** | inside the framework's `Next.js-hydration` `performance.measure` (Root layout effect of the hydrate commit) | init-script wrapper, synchronous, same hook as 3B.1/3C |
| **B2** | a microtask queued inside B1 (review MINOR 5: not provably the *first*; the 3B.1 commit-point wrapper queues its own microtask earlier) | runs after the synchronous hydrate call returns, so it follows the layout-effect `useMediaQuery` re-render and the passive effects React 17 flushes before it. Observed order: B1 at 437.1 ms, the `karrotPixel.track` passive effect at 441.8 ms, B2 at 451.0 ms |
| **B3** | settled desktop | same settle rule as 3C |
| **B4** | one resize 1440×900 → 390×844, +3 s | same as 3C |

B1 is post-hydrate-plus-layout-effects, not pure hydration. Child layout effects run before the Root's.
`setState` calls made in them are queued but not yet flushed at B1. That is why B1 still shows the first-render DOM.

## Probes

- **Lifecycle identity probe** (new, `lib/lifecycle-probe.mjs`): locates the row (`div:has(> * > * > .MuiGrid-container)`)
  and the content anchor (`.MuiGrid-container`) structurally, with no Emotion hash anchor. It records:
  - every row child: index, B0 index, classes, child count, descendant retention from B0, bounding box and computed
    flex/size properties;
  - which child owns the anchor, and whether the anchor is the B0 node;
  - the fate of every B0 child.
- **3C StyleFidelityProbe** (reused unchanged) at B0, B1, B2, B3 and B4: sheet inventory, CSSOM hashes and rule origins
  per footer element.
- **3B.1 commit-point identity snapshot** (reused) → whole-root retention at B1/B2.
- **3C row MutationObserver** B0→B3 (reused), plus a second recorder B3→B4 (fills 3C review MINOR 3).
- **3C instance probe / click / autoplay wait** (reused).

## Verdict rules (prompt §21–22)

`HYDRATION_BASE_MISMATCH_CONFIRMED` requires all 12 criteria. They are computed as `criteria.C1…C12` in
`result-consistency.json` and adjudicated in `00-summary.md`.
