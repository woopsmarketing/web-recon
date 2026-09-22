# 05 — Footer fidelity forensic (Track B)

**Footer verdict: `FOOTER_STRATEGY_A_MISMATCH_SUSPECTED`.**

- **Restoring data does NOT fix the footer.** The collapse is identical with empty stubs (3B.1) and with
  synthetic data (3C).
- The mechanism was **observed directly** at the commit point: a positional hydration mismatch between
  the source's first client render and the post-runtime desktop DOM captured by Phase 2.
- It is labelled *suspected* because no control run has hydrated a DOM that matches the first client
  render.

## Elements, located structurally

The footer Grid container carries the static MUI class `.MuiGrid-container`, which is unique in every
captured DOM (config selectors: `fidelityProbes.style.elements`):

- footer root: `div:has(> * > * > * > * > .MuiGrid-container)`
- footer row: `div:has(> * > * > .MuiGrid-container)`
- column wrapper: `div:has(> * > .MuiGrid-container)`, and the grid items

## F0 / F1 / F2 at 1440, plus 390

| point | row children (class → computed width) | column wrapper | grid container | grid items |
|---|---|---|---|---|
| **F0** Phase 2 pre-runtime | `17taob2` 432 · **`1rr4qq7` (flex:1) 908, 7 children** · `v7v99c` 100, empty | `1rr4qq7`, flex-grow 1, basis 0%, **908 px** | `1d3bbye`, 908 px | 3 × **303 px** (33.33%) |
| **F1** commit point (887 ms, inside `Next.js-hydration` measure) | **4 children:** `17taob2` 432 · `1rr4qq7` 808, **empty** · **`v7v99c` 100, 7 client-created children** · new `v7v99c` 100 | `v7v99c`, **100 px** | `1d4lhyj` (not yet desktop hash), 100 px | 3 × **33 px** |
| **F2** settled synthetic (4.5 s) | `17taob2` 432 · **`v7v99c` 100, 7 children** · `v7v99c` 100, empty | `v7v99c`, **100 px** | `1d3bbye`, 100 px | 3 × **33 px** |
| **390** after resize | row `14mj874` (column) · `ety3zj` 43 (reused original #0) · `1gapyfo` 60 h · **`v7v99c` 100, 7 children** · `v7v99c` 0 h | `v7v99c`, **100 px** | 100 px | 50 / 50 / 100 px |
| Phase 2 mobile capture (reference) | row `14mj874` · `ety3zj` · `1gapyfo` · **`1rr4qq7`** · … | `1rr4qq7` (flex:1) | | |

Unchanged throughout: footer root 1440 px, `display:block`; row `display:flex`,
`flex-direction:row` at 1440 and `column` at 390; `max-width` 1920 px.
The footer root height grows from 1,386 px to 2,058 px at settle, because the 33 px columns wrap text
into tall stacks.

Measured computed properties per element are in `runtime-result.json → footerForensic`:
display, grid-template-columns, grid-template-areas, flex-direction, flex-wrap, gap, flex-grow,
flex-shrink, flex-basis, width, max-width, min-width, height, position, font-size, line-height,
white-space, overflow, padding. Between F0 and F2 the **only differences are `width`, `flex-grow`/`flex-basis` (the
wrapper: 1 / 0% → 0 / auto) and the resulting heights**. Display, flex-direction, flex-wrap, gap,
grid-template-*, font-size, line-height, white-space, overflow, position, min-width and max-width are
identical for every probed element.

## Node identity of the row children (live)

Commit-point identity snapshot (`footerForensic.rowAtCommit`) and a MutationObserver on the row from
pre-release to settle (`footerForensic.rowAtSettle`, 65 records, not truncated):

1. **Commit point:** the row node is retained with its class. Its children are (parent/class/identity
   from `rowAtCommit`; child counts from `F1.elements[*].childElementCount`, because
   `rowAtCommit.childrenAtCommit[*].childElementCountNow` is read at settle; review MINOR 4):
   - [original #0 `17taob2`]
   - [original #1 `1rr4qq7`, now with no children]
   - [original #2, the empty `v7v99c` spacer, **now holding the 7 column children**]
   - [a new `v7v99c`]

   The 7 column children and the Grid inside were **client-created** with mobile-branch classes, for
   example grid `css-1d4lhyj` and captions `css-swqxbl`.
2. **First post-commit sync re-render** (layout-effect `setState`: MUI `useMediaQuery` uses module 6600 = `useLayoutEffect` in the browser, sc0025 @80019; the mutation records are at 896.7–896.9 ms, just after the 887 ms commit-point probe; corrected per review MINOR 2): original #1 (`1rr4qq7`) is **removed from the row**. The client-created
   descendants change class to the desktop hashes (`1d4lhyj` → `1d3bbye`, `swqxbl` → `wtobzy`/`10pgdo2`,
   …). **Original #2 receives no class mutation** and keeps `v7v99c`.
3. **Settle:** children are [original #0, original #2 (content, `v7v99c`), new `v7v99c`]. Original #1 is
   disconnected.

## Mechanism

Source (chunk 7925 footer, sc0027, verified at byte offsets):
- `E = useMediaQuery(theme.breakpoints.up("md"))`;
- the row box is `flexDirection:E?"row":"column"` with children:
  - `Box{width:E?"30%":"43px"}` (@45048);
  - `E?null:Box{height:"60px"}`, then `Box{flex:"1"}` (@45883);
  - `Box{width:"100px"}` (@56181).

**What happens:**
1. On the first client render, `useMediaQuery` returns `false` (its default before the effect), so React
   hydrates the **below-md list of 4 children** against the **3 desktop children** captured by Phase 2.
2. React 17 matches children by position:
   - `Box 43px` ↔ original logo box;
   - `Box height 60` ↔ original wrapper (its 7 extra DOM children are deleted);
   - `Box flex:1` ↔ original spacer (the column children are inserted into it);
   - `Box width 100` → created new.
3. React 17 does **not** patch attribute mismatches when hydrating in production, so the matched nodes
   keep their captured `class`.
4. When `E` flips to `true` in the layout-effect re-render right after the commit, React removes the height-60 box (original #1) and updates only the props
   that changed. The `flex:1` box's emotion class is the same in both branches, so React never writes
   its `className`. The DOM keeps `v7v99c`, `width:100px`, and the grid is squeezed to 100 px.
5. At 390 the branch flips back. The 60 px box is a new node; the logo box is the reused original #0
   with its class rewritten (`css-ety3zj`); the content box keeps the stale `v7v99c`. There is no
   node-identity record after the resize, so this follows from the source child list plus the probed
   classes (corrected per review MINOR 3). **The mobile footer is broken too.**

**Why this points at Strategy A:**
- The captured SSR `response.html` (Phase 1 source package) contains the below-md footer classes
  `css-ety3zj` (43 px box) and `css-1gapyfo` (60 px box). So the server renders the same branch as the
  first client render.
- On the live site, hydration would match the SSR DOM, and the flip to md is an ordinary client update
  that writes the correct classes.
- In Strategy A the hydration base is the **post-flip desktop DOM**, which the first client render
  cannot match.

This is an inference from SSR markup plus the observed mechanism. It was **not** verified by hydrating
the SSR document.

## Hypotheses from the Phase 3C brief

| hypothesis | verdict | evidence |
|---|---|---|
| caused indirectly by empty-data geometry | **rejected** | identical 100 px wrapper with full synthetic data (F2), and already at F1, before any API response |
| duplicated Emotion/style injection | **rejected** (`06`) | `width:100px` comes from a single `.css-v7v99c` rule in the preserved SSR emotion tag, unchanged from F0 to F2 |
| cascade/order change | **rejected** | same winning rule sheet; duplicated rules are byte-identical; F1 collapsed before the client tag held any footer rule |
| hydration / client re-render mismatch | **supported, observed** | row children identity at F1 plus the mutation sequence above |
| other source-runtime style behaviour | not needed | — |

## Also explains part of 3B.1's "unattributed" non-data node replacement

In the footer, the column subtree (7 children and all descendants) is client-created instead of reused.
Any component whose first client render differs from the captured post-runtime DOM is exposed to the
same class of mismatch. That is only demonstrated for the footer here; it is **not** claimed for other
components.

**No footer patch was made.** There is no CSS override, no style-tag change and no source-JS change. No
diagnostic mutation was needed, because the commit-point identity snapshot shows the mechanism directly.
