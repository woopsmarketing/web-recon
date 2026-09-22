# 05 — Footer lifecycle B0 → B4

Source: `runtime-result.json → lifecycle.B0…B4` (identity + style), `footerForensic`. Elements are located structurally:
- row `div:has(> * > * > .MuiGrid-container)`;
- anchor `.MuiGrid-container`.

Widths are CSS px at the probed viewport. "B0#n" means the node that was child n of the row at B0.

## Row and children

| point | row class · direction · width | row children (node · class · children · width · flex-grow/basis) | node owning the grid | grid items |
|---|---|---|---|---|
| **B0** initial SSR, 1440 | `14mj874` · column · 1440 | B0#0 `ety3zj` 1 · 43 · 0/auto ‖ B0#1 `1gapyfo` 0 · 1400 (h 60) · 0/auto ‖ **B0#2 `1rr4qq7` 7 · 1400 · 1/0%** ‖ B0#3 `v7v99c` 0 · 100 (h 0) · 0/auto | **B0#2 `1rr4qq7`** | 3 × 466.7 (`1d4lhyj`) |
| **B1** commit (437.1 ms) | `14mj874` · column · 1440 (same node) | identical to B0: same 4 nodes, same order, same classes, 96/96 descendants of B0#2 retained | **B0#2 `1rr4qq7`**; grid is the B0 node | 3 × 466.7 |
| **B2** microtask after the hydrate call (451.0 ms) | **`1qi39fj` · row** · 1440 (same node) | B0#0 **`17taob2`** 1 · 432 · 0/auto ‖ **B0#2 `1rr4qq7` 7 · 908 · 1/0%** ‖ B0#3 `v7v99c` 0 · 100 · 0/auto. B0#1 (`1gapyfo`) disconnected | **B0#2 `1rr4qq7`**; grid is the B0 node, now `1d3bbye` | 3 × **302.7** |
| **B3** settled 1440 | `1qi39fj` · row · 1440 | same as B2 (B0#0 `17taob2` 432 ‖ **B0#2 `1rr4qq7` 908, flex 1 / 0%** ‖ B0#3 `v7v99c` 100, empty) | **B0#2** | 3 × **302.7** |
| **B4** 390 | `14mj874` · column · 390 (same node) | B0#0 `ety3zj` 43 ‖ **new** `1gapyfo` 350 (h 60) ‖ **B0#2 `1rr4qq7` 7 · 350 · 1/0%** ‖ B0#3 `v7v99c` 100 (h 0), empty | **B0#2**; grid is the B0 node (`1d4lhyj`) | 175 / 175 / 350 |

Footer root height:

| | B0 | B3 | B4 |
|---|---|---|---|
| Strategy B | 1,496 | **1,386** | 1,527 |

References: Phase 2 static desktop (A F0) 1,386, A settled 2,058, A at 390 1,901.

**B3 reproduces the accepted Phase 2 desktop footer.** The wrapper is 908 px, the columns 302.7 px (Phase 2: 303 px)
and the root 1,386 px (Phase 2: 1,386 px). A settled at a 100 px wrapper, 33 px columns and a 2,058 px root.

B0/B1 show the below-md layout at a 1440 viewport. This is how the server-rendered markup is styled before the client
md re-render. It is the live site's normal pre-hydration state, not a defect.

## Strategy A vs Strategy B at the decisive points

| | Strategy A (3C) | Strategy B |
|---|---|---|
| hydration base row | 3 md children: `17taob2` · `1rr4qq7` (7) · `v7v99c` (empty) | 4 below-md children: `ety3zj` · `1gapyfo` · `1rr4qq7` (7) · `v7v99c` |
| commit (F1 / B1) | 4 children: orig#0 · orig#1 `1rr4qq7` **emptied** · **orig#2 `v7v99c` holding 7 client-created children** · new `v7v99c` | 4 children = the 4 B0 nodes unchanged; content stays in B0#2 `1rr4qq7`; 0 client-created nodes in the row |
| md re-render | orig#1 removed; orig#2 keeps `v7v99c`, so the content is 100 px | B0#1 (`1gapyfo`) removed; B0#0 class rewritten `ety3zj→17taob2`; row class `14mj874→1qi39fj`; **B0#2 keeps `1rr4qq7`**, so the content is 908 px |
| settled wrapper | `v7v99c` · 100 px · flex-grow 0 | **`1rr4qq7` · 908 px · flex 1 1 0%** |
| columns | 3 × 33 px | **3 × 302.7 px** |
| 390 | wrapper `v7v99c` 100 px; columns 50/50/100 | **wrapper `1rr4qq7` 350 px; columns 175/175/350** |

## Mutation sequence (row MutationObserver, B0 → B3: 50 records, not truncated; B3 → B4: 36 records)

- **Md re-render.** All records were delivered in one MutationObserver callback at 456.3 ms. The mutations themselves
  happened before B2 (451.0 ms), which already shows the md state:
  - row child `1gapyfo` (B0#1) removed;
  - B0#0 `class ety3zj → 17taob2`;
  - row `class 14mj874 → 1qi39fj`;
  - inside the content subtree: typography, caption and grid class updates (`1d4lhyj`/`dsw18m`/`15p9n5u`/`uanaa8` →
    md hashes) plus 14 `MuiTouchRipple` spans inserted.
  - **B0#2 receives no class mutation.** It never needs one, because its class is the same in both branches.
- **Resize to 390.** The same set is reversed:
  - `17taob2 → ety3zj` on the same logo node;
  - a new `1gapyfo` box inserted at index 1;
  - row `1qi39fj → 14mj874`;
  - grid/typography back to the below-md hashes.
  - B3 registry: the grid-owning child after the resize is the B3 wrapper node (`B3#1`, `1rr4qq7`), and the anchor is
    the B3 anchor.

## Answer

The correct logical content node owns the flex-expanding wrapper at every point: after hydration (B1), after the
responsive re-render (B2), at settle (B3) and after the resize (B4). The 100 px spacer is a separate, empty node
throughout.
