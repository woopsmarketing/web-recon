# 06 — Node identity forensic

## Mechanism

1. Before the runtime was released (B0), the harness stored **references** on a non-enumerable window recorder
   (`__runtimeExperimentLifecycleProbe__`, `registerIdentity`) to:
   - the row node;
   - its 4 children;
   - the descendants of each child;
   - the grid anchor node.
2. No attribute, class or style was written.
3. The same in-page function (`inPageIdentityProbe`) ran:
   - synchronously inside the hydration measure (B1);
   - in the first microtask (B2);
   - from the automation layer at B3 and B4.
4. A second registry was taken at B3 for B3→B4.
5. Independent cross-checks:
   - 3B.1 commit-point whole-document snapshot (`rowAtCommit`);
   - 3C row MutationObserver (B0→B3);
   - a second MutationObserver (B3→B4).

## Fates of the B0 row children

| B0 node | B1 | B2 | B3 | B4 |
|---|---|---|---|---|
| #0 logo box `ety3zj` | index 0, `ety3zj` | index 0, **`17taob2`** (class written by React) | index 0, `17taob2` | index 0, **`ety3zj`** (rewritten back) |
| #1 60 px spacer `1gapyfo` | index 1, `1gapyfo` | **disconnected** (branch removed it) | disconnected | disconnected; a **new** `1gapyfo` is created at index 1 |
| #2 content wrapper `1rr4qq7` | index 2, `1rr4qq7`, 7 children, 96/96 descendants are B0 nodes | index 1, `1rr4qq7`, 96 of 110 descendants are B0 nodes (14 new = touch-ripple spans) | index 1, `1rr4qq7` | index 2, `1rr4qq7` |
| #3 final spacer `v7v99c` | index 3, `v7v99c`, 0 children | index 2, `v7v99c`, 0 children | index 2, `v7v99c`, 0 children | index 3, `v7v99c`, 0 children |

Anchor (`.MuiGrid-container`): **the B0 node at B1, B2, B3 and B4**. Its owner is always B0#2.

Cross-check (3B.1 commit snapshot, `footerForensic.rowAtCommit`): the children at the commit are B0#0 `ety3zj` (1),
B0#1 `1gapyfo` (0), B0#2 `1rr4qq7` (7) and B0#3 `v7v99c` (0). This agrees with B1.

## Answers

- **Which B0 nodes survive hydration?** All 4 row children, the row itself and the whole content subtree (96/96).
  Whole-root: 171/171 elements at B1.
- **Which nodes receive client-created children?**
  - None at B1.
  - At B2, only touch-ripple spans (14) inside the content subtree. These are source-runtime decoration of the icon
    buttons.
- **Which are removed?** B0#1 (`1gapyfo`), by the md branch at B2. This is an ordinary source-driven update.
- **Which are inserted?**
  - In the row: nothing until the resize.
  - At B4, one new `1gapyfo`, again source-driven.
- **Class mutations:** B0#0 (both directions), the row, and descendants inside the content subtree. **None on B0#2 or
  B0#3.**
- **Subtree movement:** none. The content subtree never changes parent. Index shifts are caused by siblings being
  removed or inserted.

## Strategy A positional reuse: absent

In A at the commit point (3C `05`):
- the empty spacer node (orig#2, `v7v99c`) received the 7 client-created column children;
- orig#1 (`1rr4qq7`) was emptied.

In B none of this happens:
- no row child is emptied;
- no content is inserted into `v7v99c`;
- no client-created column subtree exists at B1.

The reviewer-requested discriminator from 3C `09` holds: "4 children, no stale class, no client-created column
subtree" at the commit point.

## Why B0#2 keeps the right class

The source emits the same Emotion class for `Box{flex:"1"}` in both branches. React therefore never rewrites that
node's `className` after hydration. That is harmless when the hydrated node already carries `1rr4qq7` (B), and fatal
when it carries `v7v99c` (A).

The difference between the arms is **which physical node React reuses at the hydration commit**. It is not a
difference in what React later writes.
