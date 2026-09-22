# Independent review: responsive reconstruction core (P0)

Read-only review. Smoke tests: `smoke-responsive-decl` **209/209, exit 0**. `smoke-responsive-ownership` **137/137, exit 0**.

No BLOCKER found.

## MAJOR

1. **An owned-form mismatch does not stop the build.** `generate-app.ts:528-541`
   - Problem: `confirmOwnedForm` mismatches only throw under `strictOwnership`. Production ships the owners anyway. `acceptedJointRegressions` (`layout-truth-check.ts:3033`) is also only counted.
   - Scenario: a split token or a dropped measured declaration renders differently from the verified overlay. That group still ships.
   - Fix: reject the mismatching or jointly regressed groups, regenerate, and confirm again.

2. **Co-damage guard only covers the owner and its direct children.** `layout-truth-check.ts:2732-2780`
   - Problem: siblings, parents, following content and phase-A rule nodes are never re-verified after ownership.
   - Scenario: a flex item or inline-block goes from frozen px to `width:auto`, shrinks, and moves its siblings 100px at 1024. The group is still accepted.
   - Fix: add the parent, siblings and the nodes of accepted phase-A rules in the pass as witnesses. Alternatively, re-run the phase-A predicate on the final set.

3. **No gate on stylesheet coverage, and every visible element gets an offer.** `layout-inference.ts:7150-7237`
   - A node with no width-family records passes the `cascade-metadata-absent` gate (`.some()` on an empty list). It is then offered an all-initial plan.
   - `fallbackMissed`, `ruleIndexCapHit`, `importRulesUnresolved` and `groupingRulesSkipped` (`@scope`) never reach sitespec or the planner.
   - Scenario: an unrecovered CORS sheet holds `.card{width:320px}` for a flex item. The plan says `width:auto`, and the truth-contradiction check skips `width` for flex/grid items. The plan ships if the content happens to match at the sampled widths.
   - Fix: refuse offers when coverage is incomplete. Only offer nodes that have at least one width-family candidate.

4. **Performance.** Offer count is O(visible elements).
   - The "all failed jointly" path (`layout-truth-check.ts:2989`) renders N isolated sets × up to 17 widths, each a full restyle. Any damage to an accepted group sends the whole batch there (`:2966`). Halving then gives O(N log N) renders.
   - Only recursion depth is bounded, not the number of renders.
   - Fix: add a global render budget, and apply the gate from finding 3.

5. **The grade-3 switch trusts one bisection that was never re-measured.** `tree-switch.ts:575-640`, `responsive-plan.ts:442`
   - The lo and hi fingerprints are taken at different times. A structure-only "changed" verdict (`tree-switch.ts:334`) is accepted even with `familyChange` 0.
   - Scenario: carousel autoplay or lazy-load produces a converged 1px bracket, and the whole site's switch moves from 801 to an arbitrary width.
   - Fix: re-measure hi-1 and hi in both directions before accepting. Also require magnitude > 0 or at least 2 pages.

6. **Old artifacts produce different output.**
   - (a) `attachIntervalSamples` builds samples from `node.probe`, which already exists in pre-P0 sitespec v6. Old artifacts therefore enter the interval stage: they can lose rules and need extra page loads. The comment at `layout-truth-check.ts:175` says the opposite.
   - (b) Grade 2 reads the 28.8 fingerprints, so older artifacts that have them no longer serve 801.
   - (c) Every manifest now contains `layout.ownership`.
   - Fix: gate on a P0 evidence marker, or record this as an approved change and correct the comment.

## MINOR

- **Phase-A interval stage over-rejects.** It rejects every regressor in the same sweep (`layout-truth-check.ts:2475-2506`). A child rule displaced by a bad parent rule is lost for good. Rules without samples are not re-checked at the truth width after these rejections.
- **`var()` values are resolved at the truth width only.** They are checked against custom properties from `:root` at the truth width (`layout-inference.ts:5399`). A `--x` redefined under `@media` is never split into pieces, so the value is wrong at other widths.
- **UA margins of `hr` and `dialog` are frozen as px** (`plan.ts:101`), though the browser's default stylesheet sets them to `auto`.
- **The 16-width cap can leave a rule unchecked.** A sampled rule can end up with zero verification widths and still count as checkable.
- **`flex: 1 1 0` is treated as unparsed.** This is safe but loses coverage.

## Site-specific logic

None in code. `900`, apartmentary and Swiper appear only in comments and test fixtures.

## Test quality

- No assertions were deleted.
- `smoke-layout-safety`: `check(` count went 514 → 568. The A1 and unserved-width checks were rewritten for served-switch semantics and strengthened.
- `smoke-reconstruction`: 236 → 236, with 3 checks tightened.
- Missing tests: a plain element with no authored declarations being offered, an incomplete-coverage gate, co-damage to siblings, and rollback after a confirm mismatch.
