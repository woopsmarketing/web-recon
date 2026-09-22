# Task 28.6 Program A — Investigation Findings (three investigations, three adversarial verifiers)

Three fresh investigators worked on disposable copies; three fresh verifiers tried to refute them. All three findings survived, and the verifiers added corrections that materially change the fix specification. Nothing under `src/` was modified by any of them.

## Headline: the responsive defect is not one bug, it is four, and two of them are already live

The 28.5C adjudicator hypothesised that the jammed logo row, the displaced navigation, the colliding cells and the collapsed toggle were one mechanism. That hypothesis is **refuted**. They are two mechanisms, cleanly separated by bisection, plus two independent band defects.

### Defect 1 — `width: auto` is an intrinsic-sizing instruction, and the generator emits it as if it meant "fill your parent"

`width: auto` means "size me from my content". It only means "fill my containing block" for an in-flow block-level box in a block container with no auto inline margin. The generator emits it in three places (`layout-inference.ts:482`, `:560`, `:586`) as the unfreeze for a frozen pixel width.

In the shipped build this resolves to the right number **by accident**: the node's max-content is propped up by the still-frozen pixel widths of its descendants. Measured exactly on the Linear pricing page: `max-content(n000011) = 77 + 1282 + 77 = 1436`, which equals its own frozen `max-width`. Remove the prop by unfreezing the descendants and the box collapses to its intrinsic size, and the correct `margin-inline: auto` re-centres the shrunken box.

| Node n000011 at 1440 | x | width | margin-left | margin-right |
|---|---|---|---|---|
| Shipped | 2 | 1436 | 2px | 2px |
| AC5 (descendants unfrozen) | 281.5 | 876.9 | 281.5px | 281.5px |

Every other property is byte-identical between the two: `justify-content`, `gap`, `flex-basis`, `flex`, `align-items`, `max-width`. Only `width` changed. The jammed logo row follows arithmetically: free space of `1344 - 64 - 587 = 693px` goes to zero, so `justify-content: space-between` degenerates to flex-start with 0px gaps. Child widths are identical in both builds.

**This defect is latent in the shipped build and is detonated, not created, by an unfreeze.** It is also already live in one form: the verifier measured `n000290`, whose shipped `centered-max-width` rule pairs `width: auto` with `margin-inline: auto` inside a column-flex parent. The auto margin suppresses stretch, so `width: auto` resolves to fit-content 1436 instead of the 1100 that stretch would give. Setting either `margin-inline: 0` or `width: 100%` restores 1100.

**The fix, corrected by the verifier, is bidirectional.** Neither blanket `auto` nor blanket `100%` is safe: setting `width: 100%` on the logo anchor, which is genuinely a stretch box, creates a cyclic dependency against its auto-width ancestor and collapses the container to 742px. The predicate must gate both emissions. Emit `auto` only when the box's resolved inline-axis self-alignment is stretch with no auto inline margin. Otherwise emit `100%`, or `calc(100% - <own padding>px)` when the box is content-box. Every input is already in the observed property set.

### Defect 2 — transitive descendant unfreeze applied to nodes the probe proved fixed

Separately bisected. Adding the transitive pass raises sibling overlaps from 1 to 17, collapses the billing toggle's track from 32px to 6px and its knob to 0px, and blows up 19 hairlines the probe recorded as invariant, one of them rendering at 1183.6px where its probe width was 1px at every sample. **The rule is simply: never unfreeze a node whose probe width is invariant across sampled widths.** No production code does this today; it must never be added.

### Defect 3 — the hidden-band off-by-one, now root-caused exactly

`hiddenRanges` at `layout-inference.ts:668-670` reads `const previous = sorted[i-1]; start = previous ? floor((previous.width + entry.width)/2) : entry.width;`. When the hidden probe is the **lowest** desktop sample there is no predecessor, so the band starts *at* the observed width and runs *upward* to the midpoint. That inverts the observation: "hidden at 1024" means hidden at and below 1024, but the emitted band hides from 1024 up to 1232.

The verifier executed the shipped function with `desktopIdx = [1024, 1440, 1920]` and `hidden = [1024]` and got exactly `(min-width: 1024px) and (max-width: 1231.98px)`, byte-identical to the generated stylesheet. The boundary was then confirmed by rendering: the clone's `display:none` count is 21 at 1023, jumps to 524 at 1024, holds at 524 through 1231, and returns to 21 at 1232.

**Reach: 503 nodes on the pricing page alone, including 34 text leaves and the entire comparison table.** All 738 bands in the build carry that one identical condition. The correct emission for this case is a max-width band at the observed width.

### Defect 4 — no recovery kind exists for grid tracks, and grid items are refused outright

`repeat(6, minmax(0,1fr))` is observed as `224px x6` and `width: 100%` on a grid item is observed as `224px`. `RecoveredRuleKind` has no grid-track kind at all, and `containingBlockGuard` refuses grid items (71 refusals recorded in the shipped manifest), so neither freeze is ever undone. At 1100 the footer's six 224px tracks demand 1344px inside a 1008px content box and push the Connect column to right = 1390.

## What the verifiers corrected

The verifiers were harsher on the proposed tests than on the mechanisms, and they were right.

**Both proposed fixture tests would have passed the broken build.** I3's logo-row discovery rule requires all children to share a visual row within 25% of median item height; measured on the real logo row the heights are 17/19/40/26/24/18/23 and the y-spread is 11.5px against a 5.75px threshold, so the row is rejected and the rule finds zero subjects at the very width where the defect lives. Its "no central pile" check, run at 1440, fails all 56 pricing comparison rows **in the live source** as well as the clone, so it cannot gate anything. Discovery must use vertical-interval overlap rather than top-edge spread, and the pile check must compare against the truth width rather than an absolute gap threshold.

**One ablation result was site-tuned.** I3's step E contained a hardcoded `if (className === 'wr-st003070') continue`. Removed, step E is not a no-op: one node moves 204px. The verifier then showed the *specified* predicate refuses that node correctly and generically, so the fix survives but its evidence must be rebuilt without the skip.

**Four existing suite assertions encode the defect** and will fail when it is fixed: `smoke-layout-safety.ts:358` and `smoke-reconstruction.ts:2017`, `:2022`, `:2048` all assert `declarations["width"] === "auto"`. Each rewrite needs a recorded justification.

**The percentage base is the riskiest part of the fix.** A percentage on a grid item resolves against the grid area, not the parent content box. The investigator's first attempt used the parent content box and produced 184 visibility flips, sizing a grid cell to 149.3px instead of 448px. The verifier confirmed the grid-area denominator is reconstructible from data already observed: the parent's used track list, the item's `grid-column`, and `column-gap`.

**A measurement gotcha for anyone re-measuring.** The clone renders both subtrees and `data-wr-node` ids are duplicated across them. Querying by node id without first scoping to `[data-wr-viewport="desktop"]` silently collapses to the mobile copy and reports a false "nothing hidden".

## The corrected candidate

A variant that changes nothing but `width` declarations restores 1440 to byte-identical with both the shipped build and the live source on the navigation and logo row, while keeping the 1024 and 1100 gains.

| Metric | Source @1440 | Shipped @1440 | AC5 @1440 | Corrected @1440 |
|---|---|---|---|---|
| Sign-up right edge | 1361 | 1361 | 1081.5 | 1361 |
| Logo row width | 1344 | 1344 | 651 | 1344 |
| Logo gaps | 115.5 x6 | 115.5 x6 | 0 x6 | 115.5 x6 |
| Sibling overlaps | 1 | 1 | 17 | 1 |

The verifier independently diffed every node rect at 1440 and measured 0 moved nodes and 0 maximum delta for the corrected width change alone.

## Residual, un-root-caused

Horizontal **padding** is still frozen at its 1440 value across every width: 77px where the source uses 41px at 1100 and 35px at 1024. This is why the corrected build is fluid at 1100 and 1024 but not source-matching. It degrades spacing rather than clipping content, and fixing width alone cannot close it. A padding unfreeze needs the same treatment as width, a definite measured relation and never `auto`, and the two must be fitted together or the width percentages are re-derived against the wrong base. The footer link-column grid also retains 90 movers up to 33.9px at 1440, which is a nested-grid family that was not bisected.

## Scope honesty

Every measurement here is one page, `linear.app/pricing`, of one build. The mechanisms are CSS specification behaviour and generalise in principle, but the empirical claim that 502 of 506 fluid nodes are plain fill-my-base boxes is one page of one site. The 1024 column compares the clone's desktop subtree against the source's mobile-mode layout, because the source switches at 1025px and the clone at the generated 915px, so those numbers are directionally useful rather than like-for-like.
