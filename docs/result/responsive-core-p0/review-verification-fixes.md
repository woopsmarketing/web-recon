# Independent review: RECI2 verification fixes

This was a read-only review; nothing in `src/` or `scripts/` was edited.

- `npx tsx scripts/smoke-responsive-ownership.ts`: **176/176 checks passed, exit 0**.
- Repro script: `tmp/review-vf-repro.ts`. It uses real Chromium and generic fixtures.

No BLOCKER found.

## MAJOR

### 1. Co-damage guard is off for offered parents and siblings (re-opens MAJOR-2)

**Where:** `layout-truth-check.ts:3229`

**Problem:** the filter `!ownerIds.has(witness.nodeId)` removes every *offered* node from the witness lists. It does this before settling, so it also removes nodes whose groups are later **rejected**. After a rejection, only M serves that node, and nothing guards it. `damageToAccepted` only covers accepted owners, and so do the final joint check and rollback.

**Repro S2:**
- Setup: a flex row holds A and B. A's plan has the wrong `margin-right:280px`, but A's own box is correct. B is pushed 280px.
  - If B is not offered, A is rejected `co-damage:b`.
  - If B is offered (bad plan, rejected), A is **accepted** and `jointRegressed=[]`.
- Result: the damaged layout ships.
- Offers are common, so this hole is the normal case rather than an edge case.

### 2. The independent-set test is unsound, so correct groups get rejected

**Where:** `layout-truth-check.ts:3337` and `:3405`

**Problem:** `related()` only looks at the parent's subtree and the parent's ancestors. Cousins can still move each other: a shrink-to-fit parent (flex or inline-block), auto grid tracks, or table cells pass size changes up and across. The set step then rejects a group from a render that includes its set-mates. That breaks the old rule that only a group judged alone is rejected.

**Repro S1:**
- Setup: `row{display:flex} > P2{flex:0 0 auto} > k2` (bad), and `P1 > k1` (correct).
- Result: both are rejected `interval-sample`. Judged alone, k1 is accepted.
- The failure goes in the safe direction: nothing wrong is accepted, because survivors are still re-settled jointly. But good rules are lost.
- The smoke only tests block wrappers.

## MINOR

- **Truth re-check skipped when the stage does not settle.** At `:2709`, the remaining sampled rules are dropped, but the non-sampled geometry survivors are not re-checked at the truth width.
- **Silent budget fallback in phase A.** When `INTERVAL_ISOLATION_RENDER_BUDGET` runs out, the stage returns `groupFailures` (`:2606`), which means joint co-rejection again. No counter records that the budget was exhausted.
- **Cost:**
  - One persistently failing load now costs up to 30+120+120s, charged per width. Phase A loads up to about 18 widths per pass.
  - The phase-B budget is capped at 8000 renders per pass, but there is no global cap across pages × viewports.
  - The set step uses up recursion depth. Survivors can reach depth 24 and be rejected `non-convergence` without ever being judged.
- **Retry counter incomplete.** Phase B, the joint re-measure and the confirm (`:3292`, `:3561`, `:3650`) retry without `onRetry`, so `renderLoadRetries` undercounts.
- **Stale code in `layout-inference.ts`.**
  - `:7198` still says the fallback "runs only for nodes no plan was offered for".
  - `planOfferedNodes` is now dead code.

## Checked: no problem found

- **Retry:** each retry reloads the page and measures again, so it cannot hide a real failure. A load that fails every attempt still rejects.
- **Phase-A bisection:** the stage settles only after a full joint sweep with zero rejections. No subset that passes only jointly survives. Each sweep rejects at least 1 rule, so the loop terminates.
- **Truth re-check (normal path):** it runs after every change until nothing more is removed.
- **Fallback plus owned rules:** `applyOwnership` removes all 12 width-family and logical declarations from an owner's measured rules, so the same property never ships twice. Differences between the verified overlay and the shipped form are caught on owner boxes by the confirm-and-rollback step.
- **Tests:** the re-specified fallback check is a documented semantic reversal, not a weakened assertion. All new checks are additive.
- **Site-specific logic:** none in the code.
