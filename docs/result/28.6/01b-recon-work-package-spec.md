# Task 28.6 — RECON Lane Specification (derived from the Program A investigations)

This is the build contract for the reconstruction lane. Every requirement below traces to a measurement in `01a-program-a-investigation-findings.md`, which was produced by three investigators and survived three adversarial verifiers. Read that document first.

The lane owns `src/reconstruction/layout-inference.ts`, `layout-truth-check.ts`, `generate-app.ts`, `plan-reconstruction.ts`, `responsive-plan.ts`, `style-generator.ts`, `compile-node.ts` and `src/cli-reconstruct.ts`. It owns nothing else.

## Standing rules

- `max-width: none` is never emitted. This was a mandatory correction from the 28.5C Stripe check: it destroys authored caps.
- A node whose probe width is invariant across every sampled width is PROVEN FIXED and must never be unfrozen. Violating this collapsed a 32px toggle track to 6px and rendered a 1px hairline at 1183px.
- A destructive rule, meaning `display: none`, `visibility: hidden` or variant removal, requires positive evidence: browser observation inside the range, or a preserved authored rule. Interpolation is not evidence. Unknown is not hidden. When uncertain, keep content visible.
- No host-specific branches and no per-site constants anywhere.
- Every generated rule must be rendered inside a range where it is actually active before it ships.

---

## W5 — Destructive inference safety

### W5.1 The off-by-one is the first fix and it is small

`hiddenRanges` opens a band at the midpoint between a hidden width and its lower visible neighbour. When the hidden sample is the lowest desktop entry there is no lower neighbour, and the code falls back to the observed width itself, so the band runs *upward* from the observation instead of downward. The observation "hidden at 1024" means hidden at and below 1024; the emitted band hides 1024 through 1231.98.

Verified by executing the shipped function: inputs `[1024,1440,1920]` with `hidden=[1024]` return `(min-width: 1024px) and (max-width: 1231.98px)`, byte-identical to the shipped stylesheet, and the rendered clone's `display:none` count steps 21 → 524 exactly at 1024 and returns to 21 at 1232. Reach on the pricing page alone: 503 nodes including the entire comparison table.

When the hidden sample is the lowest desktop entry, the correct emission is a max-width band bounded above at the observed width, and bounded below by the generated breakpoint (below which the desktop subtree is not shown at all).

### W5.2 Snap band edges to authored evidence, and refuse when there is none

Priority for every band edge:

1. A preserved authored breakpoint from the SiteSpec histogram that brackets the observation. An authored `max-width: N` means the boundary sits between N and N+1, so a band whose upper edge falls in that gap snaps to exactly N.
2. Failing that, the nearest bracketing measured probe sample. Never extrapolate past the outermost sample on either side.
3. Failing both, REFUSE to emit the rule and count the refusal.

Both edges, not just the upper one. Record refusals by reason so the manifest shows what was declined rather than silently dropping it.

### W5.3 Correct the docstring that justifies the gap

`layout-truth-check.ts` currently states that responsive-hidden rules "can never apply at the truth viewport… They ship WITHOUT a render — that is a proof, not an exemption." The proof covers only 1440. The band applies at 1024 through 1231, where nothing is ever rendered, and that is exactly where the 503 nodes vanish. Correct this comment in the same change or it will keep justifying the hole.

---

## W6 — Active-range verification

The truth check renders only at 1440 and serialises only the desktop tree. Every responsive-hidden rule is therefore `acceptedUnchecked`: 738 of them in the shipped build.

Carry per-width truth onto the rule. The data already exists at inference time in `node.probe.x/w/v`, indexed to the page's probe widths; today only a single truth-width rect is carried.

Render at every distinct emitted band and at every required width that is at or above the generated breakpoint. For a responsive-hidden rule, compare the source's recorded visibility at an in-band width against the clone's rendered visibility at that width. The measurement function currently returns only `x` and `w`; it needs a visibility field.

Two constraints the reader identified. The harness CSS includes the generated breakpoint switch, so a render below the breakpoint hides the entire desktop wrapper and every node measures null; extra widths must be at or above the breakpoint, or the harness must render the correct subtree for that width. And per-node visibility is the right comparison, not ancestor-aware visibility, because the emitted `display:none` sits on the node itself.

`acceptedUnchecked` must reach 0 for any rule kind that can affect a required width. Removing the "responsive-hidden-only skips the browser entirely" short-circuit is part of this.

---

## W7 — Coherent unfreeze

### W7.1 The auto-versus-percentage predicate, gated in both directions

This is the single missing rule. Neither blanket emission is safe.

Emit `width: auto` only when the box's resolved inline-axis self-alignment is stretch: an in-flow block-level box in a block container, or a grid or flex item whose resolved `justify-self` or `align-self` is stretch or normal, **and** which has no auto inline margin.

Otherwise emit `width: 100%`, or `calc(100% - <own padding>px)` when the box is content-box. The percentage-width branch already performs this padding correction; the full-width and centered branches never needed it while emitting `auto`.

Both directions are load-bearing and both were measured. Setting `100%` on a genuinely-stretch anchor created a cyclic dependency against its auto-width ancestor and collapsed the container to 742px. Leaving `auto` on a box with auto inline margins in a column-flex parent gave fit-content 1436 where stretch would give 1100.

Every input to the predicate is already observed: `place-items`, `justify-items`, `justify-self`, `place-self`, `margin-left`, `margin-right`, parent `display`, `flex-direction`.

This applies to the already-shipped `centered-max-width` rules too, not only to `full-width`. Those emit `margin-inline: auto` together with `width: auto`, which is exactly the combination that suppresses stretch.

### W7.2 The percentage base is the riskiest derivation in this task

A percentage on a grid item resolves against the **grid area**, not the parent content box. Using the wrong denominator fails silently and large: the first attempt sized a grid cell to 149.3px instead of 448px and produced 184 visibility flips.

The grid-area inline size is reconstructible from data already observed: the parent's used `grid-template-columns`, the item's `grid-column`, and `column-gap`. Derive it, or use the post-emit truth check as the verifier. Do not guess.

An invariant the change relies on and which must be written down: `width: auto` on an in-flow block subtracts horizontal margins from the containing block, and `width: 100%` does not. A node with nonzero horizontal margins would overflow by their sum. The full-width branch predicate forces those margins to be near zero, and the centered branch keeps `margin-inline: auto`, where `100%` leaves zero free space and the auto margins correctly resolve to 0 until `max-width` engages.

Keep the frozen `max-width`. It is what brings `100%` of 1440 down to 1436 and gives the auto margins their 2px. Any change that drops or recomputes it re-opens the symptom.

### W7.3 New recovery kind for grid tracks

No recovery kind exists for `grid-template-columns`, so `repeat(6, minmax(0,1fr))` stays frozen as six 224px tracks and demands 1344px inside a 1008px content box at 1100.

For a grid container with a multi-width probe: if the used track list has the same track count at every desktop sample, each track's share of the total is constant within the existing ratio tolerance, and the track sum plus gaps equals the node's own content box within the existing width tolerance, then the authored list was fractional. Emit normalised fractional tracks. Tracks whose pixel value is constant across widths stay in pixels, because those are genuinely fixed. A track count that changes between samples means a media-query track switch: refuse, or emit per band, but never freeze.

Single-track grids are the same rule at N=1 and are required, not optional: a single 1344px track was the pin that made every other unfreeze a no-op.

Resolve the internal inconsistency the verifier caught: decide once whether equal ratios collapse to `repeat(N, minmax(0,1fr))` or to a bare `1fr`, state the reason, and apply it consistently. `minmax(0, …)` removes the min-content floor a bare `1fr` keeps.

### W7.4 Reach grid items instead of refusing them

`containingBlockGuard` refuses grid items outright, 71 times in the shipped manifest. Lift the refusal only for the full-width-against-the-grid-area case, where used width equals grid-area inline size at every probe sample. Keep the refusal for the percentage-width branch, which genuinely is untestable against the wrong denominator.

The verifier confirmed the predicate is correctly discriminating: the node an earlier ablation had to exclude by hand is refused generically by this rule, because its used width is 20px against a 224px grid area at every sample.

**Ordering hazard.** Converting a parent's tracks to fractions while simultaneously using those tracks as a child's denominator is order-dependent, and the wrong order reintroduces the percentage failure the guard was added to prevent. Fix the order explicitly and state it.

### W7.5 What must not be built

No transitive descendant unfreeze. It targets nodes the probe proved fixed and is the sole cause of the collision, hairline and toggle-collapse symptoms.

---

## W8 — Mobile subtree inference

Inference walks only the desktop viewport, probe arrays attach only to desktop nodes, and the CSS generator hardcodes the desktop selector. The mobile subtree therefore receives no inferred rules and renders a 390px layout inside a 700px viewport.

With the observer lane supplying a mobile-side probe, run the same inference against the mobile tree and parameterise the emitted selector by viewport. The two probes walk different DOMs and their identities must never be mixed.

390 must not regress. It is the one width a human has already accepted as good.

---

## W9 — Tests, with the verifiers' corrections applied

Four existing assertions encode the defect and will fail: `smoke-layout-safety.ts:358` and `smoke-reconstruction.ts:2017`, `:2022`, `:2048` each assert `declarations["width"] === "auto"`. Rewrite each with a recorded justification naming this task.

Both fixture designs proposed by the investigators were shown by the verifiers to pass the broken build. Do not implement them as specified.

- Logo-strip discovery must use vertical-interval overlap or centre comparison, not top-edge spread against median height. Measured on the real logo row the spread is 11.5px against a 5.75px threshold, so the proposed rule finds zero subjects at the width where the defect lives.
- The "no central pile" check must compare against the truth width, not an absolute gap threshold. An absolute threshold flags all 56 pricing comparison rows in the **live source**.
- The free-space invariant is the check that actually separates every variant: for each visible row-flex container with a distributing `justify-content` and at least two visible children, free space that is at least 8px in the frozen render must not fall below 1px in the unfrozen render.
- Pair it with a sibling-overlap count, which separates the transitive-unfreeze class cleanly: 1 overlap in every good variant, 17 in the bad ones.
- The unfreeze-safety fixture must assert that no emitted rule reduces a node below its own minimum probe width, expressed as a diff against the baseline build and enforced where nodes are actually painted. Applied naively it is swamped by false positives from suppressed content.
- The switch fixture needs a containment predicate: the knob's rendered box must lie inside the track's box. Without it, an absolutely-positioned pseudo knob survives its host's collapse and the assertion passes in the broken state.

A fixture that passes against current `main` is a regression lock, not a reproduction of the pre-fix failure. Label each one honestly as whichever it is.
