# Task 28.7 idea lane (Program G) — the frozen width CHAIN ROOT

Owner scope: `src/reconstruction/**`, `scripts/smoke-layout-safety.ts`.
Working area: `tmp/wr287-ideas/frozen-width-chain-root/`.
Recommendation: **ADOPT** (flag removed, behaviour unconditional).

---

## Hypothesis

From the B1 residual freeze audit (`docs/result/28.7/02-residual-freeze-audit.md`,
`docs/result/handoffs/28.7-residual-freeze.json`): `width` is 91.3% of the residual on
linear.app and 99.1% on hobbang.net, and **16 of the 30 top-ranked residuals already carry a
recovery rule the truth check verified** and still measure a constant clone width. A correct
`full-width` rule on a child resolves against its parent's box; if an ANCESTOR is frozen at the
1440-observation width and got no rule, every correctly-ruled descendant below it still renders
at the frozen ancestor's width.

**Tested hypothesis:** the highest-leverage generic fix is not more recovery kinds but
unfreezing the ROOT of each frozen width chain — a node whose observed geometry proves it tracks
its containing block across the probe widths, but which received no width rule.

**What the evidence then narrowed it to.** Reading the actual chain roots (not the ranked leaves)
on three corpora, the roots split into three disjoint populations:

| root population | linear.app | hobbang.net | gs.severance |
| --- | ---: | ---: | ---: |
| out-of-flow, both inline insets definite, width moves | 47 | 0 | 15 |
| in-flow full-bleed (`width: 100vw` + `margin-left: -50vw` + `left: 50%`) | 8 | 0 | 0 |
| grid track list that changes across authored bands | — | 4 (`n000269`, …) | — |

Only the first is answerable without building a responsive solver, and this experiment
implements only that one. §Regression risk records why the other two were declined, with the
arithmetic.

## Current mechanism

`layout-inference.ts` re-derives a responsive width from the multi-width probe through the
inline-size funnel: centered max-width → capped-fill → full-width → percentage-width →
`no-branch-matched`. Every branch that divides by, or makes a claim about, the parent's content
box is gated by `containingBlockGuard()` (`layout-inference.ts:833-893`), which refuses
`fixed-position`, `abs-containing-block-not-parent`, `abs-containing-block-is-padding-box`,
`grid-item` and `flex-item-basis-governed`.

That guard is correct and is not touched here. Its consequence, though, is that an out-of-flow
box can NEVER be answered by any existing branch: the parent's content box is not its containing
block, so every measurement the funnel takes about the parent is meaningless for it. It reaches
the end of the funnel with no rule and ships the exact tier's used value — a px number Chromium
serialized at 1440 — at every width. On linear.app that is the `position: fixed` site header
(`n000009`, `width: 1440px`, 49 descendants, present on all 8 page × viewport passes), which the
audit ranked as an `offscreen` residual on every route.

## Proposed mechanism

**Read the browser's own inset equation backwards.** For an absolutely or fixed positioned box
with `left` and `right` both definite and `width: auto`, CSS 2.1 §10.3.7 solves

```
left + margin-left + border + padding + width + padding + border + margin-right + right
  = containing block width
```

for `width`. The px value the exact tier froze IS that equation's answer, taken at the truth
viewport. Emitting `width: auto` hands the same equation back to the browser to re-solve at every
width. This needs no denominator and no guard relaxation — it is the identical argument the
module already makes for `stretch` ("`width: auto` names no denominator"), applied to the
out-of-flow case `inlineSizeBehaviour()` declines with "the exact tier does not GENERALLY give
us" both insets. It generally does not; `insetResolvedWidth()` is the test for when it does.

Nothing is assumed. The containing block is identified by walking the spec tree with the rules
`establishesAbsoluteContainingBlock()` already encodes (plus a narrower fixed-position variant:
`position` alone does not capture a fixed box, only transform/filter/perspective/containment),
its width is read from ITS probe — or from the probe's own viewport width list when the
containing block is the viewport or the initial containing block — and

```
w[i] + left + right + margin-left + margin-right === containingBlock[i]
```

is verified at EVERY width the variant is displayed at and the node is visible. One width off the
curve refuses. That is a stronger gate than the post-emit truth check can apply, because the
truth check renders only at 1440/390, where the frozen px and the re-solved `auto` agree by
construction.

The branch is reached ONLY from an exit the parent-relative branches have already refused (a
containing-block guard, or the final fall-through), so it never competes with a rule the existing
funnel would have shipped. Every emitted rule goes through `verifyLayoutRules()` exactly like
every other kind.

## Why it may be simpler or better

* **No new theory.** It is one CSS equation the module already relies on, run in reverse. It
  introduces no viewport units, no new denominator, no positional rewriting, no band awareness.
* **No guard is relaxed.** `containingBlockGuard()` is byte-for-byte unchanged and still refuses
  every node it refused before; the new branch simply answers a question the guard was never
  asking.
* **The refusal is the common case.** 214 of 300 out-of-flow candidates on linear.app and 60 of
  78 on gs.severance are refused `width-constant` — the mechanism speaks only where the source
  demonstrably moved.
* **It is the opposite of A4.** A4 (WONTFIX-PROVEN-HARMFUL) unfroze DESCENDANTS transitively. This
  unfreezes 47 + 15 chain ROOTS on direct per-width evidence and lets the descendants' existing,
  already-truth-checked rules resolve correctly on their own.

## A/B setup

Offline, no network, from existing site-specs. Flag `recoverInsetResolvedWidth` on
`InferLayoutInput` (default OFF) during measurement, removed on adoption.

| site | site-spec | flag OFF run | flag ON run | breakpoint |
| --- | --- | --- | --- | ---: |
| linear.app | `2026-09-03T11-43-37-946Z` | `2026-09-04T14-57-33-959Z` | `2026-09-04T14-58-48-875Z` | 1025 |
| hobbang.net | `2026-09-03T11-42-36-333Z` | `2026-09-04T15-01-10-260Z` | `2026-09-04T14-59-23-246Z` | 768 |
| gs.severance.healthcare | `2026-09-03T15-25-43-151Z` | `2026-09-04T15-00-41-163Z` | `2026-09-04T15-00-55-942Z` | 1025 |

**Byte-identity with the flag off, proved not asserted.** `generated-styles.css` from the
pre-experiment build `linear.app/2026-09-04T13-56-34-051Z` (produced before any edit) and from
the flag-off build `2026-09-04T14-57-33-959Z` share SHA-256
`5bdd220f917d6484811bd8032e53a9edfb5dc933e1836fc0b88500cef3e8b2ee`. Every `manifest.layout` key
is identical except the three new counters, which read `0`/`0`/`{}`. hobbang.net is byte-identical
across all three of pre-change / flag-off / flag-on
(`614ca22af936abbfc8b73a9fd5cc1fed088e4e9a723eca1e1db39860f01eb7cc`), because its out-of-flow
population is 2 nodes and both are refused `width-constant`.

After the flag was removed, linear.app was rebuilt unconditionally
(`2026-09-04T15-08-59-396Z`) and its stylesheet matches the flag-ON build exactly
(`639d64fbcc183c03b588a50578c52b4fbfb24c90dc8cc769a1e91e32dbe9eb5f`).

## Before measurements

| counter | linear OFF | hobbang OFF | gs OFF |
| --- | ---: | ---: | ---: |
| candidateRules | 1733 | 2036 | 461 |
| recoveredRules | 1731 | 2036 | 461 |
| rejectedByTruthCheck | 2 | 0 | 0 |
| acceptedRegressed | 0 | 0 | 0 |
| refused-containing-block-guard | 502 | 222 | 11 |
| **residualsDetected** | **2995** | **2232** | **231** |
| residual `offscreen` | 1017 | 536 | 14 |
| residual `clipping` | 0 | 0 | 1 |
| residual `neither` | 1978 | 1696 | 216 |
| residual family `width` | 2734 | 2212 | 219 |

## After measurements

| counter | linear ON | hobbang ON | gs ON |
| --- | ---: | ---: | ---: |
| candidateRules | 1780 (+47) | 2036 (0) | 476 (+15) |
| recoveredRules | 1778 (+47) | 2036 (0) | 476 (+15) |
| **rejectedByTruthCheck** | **2 (flat)** | **0 (flat)** | **0 (flat)** |
| **acceptedRegressed** | **0** | **0** | **0** |
| rejectedUnverifiable / rejectedByBandCheck | 0 / 0 | 0 / 0 | 0 / 0 |
| refused-containing-block-guard | 457 (−45) | 222 (0) | 0 (−11) |
| insetResolved (shipped) | 47 | 0 | 15 |
| **residualsDetected** | **2967 (−28)** | **2232 (0)** | **217 (−14)** |
| **residual `offscreen`** | **1005 (−12)** | **536 (0)** | **5 (−9, −64%)** |
| residual `clipping` | 0 | 0 | **0 (−1)** |
| residual `neither` | 1962 (−16) | 1696 (0) | 212 (−4) |
| residual family `width` | 2706 (−28) | 2212 (0) | 205 (−14) |
| fullWidth / centered / percentage / gridTrack | unchanged | unchanged | unchanged |

Refusal histogram of the new test (`insetResolvedRefusalsByReason`):

| reason | linear | hobbang | gs |
| --- | ---: | ---: | ---: |
| `width-constant` (the negative control) | 213 | 2 | 59 |
| `identity-fails` | 4 | 0 | 1 |

**Every one of the 62 emitted rules survived the truth check on all three sites. Nothing was
rejected, nothing regressed, and no other rule kind moved by one.**

## Visual or geometric evidence

The decisive collateral measurement (`tmp/wr287-ideas/frozen-width-chain-root/geom.mjs`): both
builds' SHIPPED stylesheets rendered in Chromium at every probe width the variant is displayed
at, every `[data-wr-node]` border box measured, and compared **against the source's own probe at
the same width**. A node is IMPROVED when its error shrinks by more than 2px and WORSENED when it
grows by more.

| site | comparisons | width improved | **width worsened** | x improved | x worsened | Σ width error OFF → ON |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| linear.app | 79,183 | **285** | **0** | 0 | 0 | 3,454,683 → 3,367,738 px (−2.5%) |
| gs.severance | 9,066 | **99** | **2** | 18 | 2 | 321,639 → 293,656 px (−8.7%) |
| hobbang.net | — | 0 | 0 | 0 | 0 | stylesheet byte-identical |

The two worsened comparisons on gs are ONE node at two widths (`p000002` mobile `n003159` at
320px and 321px): the source is 360px wide inside a 320px viewport — it overflows in the source —
and the clone moves from a frozen 390px (30px error) to 320px (40px error). Ten pixels, twice,
against improvements of up to 524px.

Named cases, straight out of the residual list:

* `linear.app p000001 desktop n000009 <header>` — `position: fixed; left: 0; right: 0`, frozen
  `width: 1440px`, `offscreen`, 49 descendants, refusal `inline-size:refused-containing-block-guard`.
  It leaves the residual list on all four routes, **and so does its child `n000010 <nav>`**, whose
  `full-width` rule was already correct and was resolving against the frozen header. That is the
  chain-root cascade, measured: unfreeze the root, the verified descendant rule starts working.
* `gs.severance p000001 mobile n003638 <div>` — `position: absolute; left: 0; right: 0`, frozen
  `width: 390px`, 196 descendants. Renders 914px at a 914px viewport after the change, 390px
  before.
* `linear.app p000001 desktop n000116 <div>` — the audit's #1 residual, 416 descendants. **Still
  frozen.** It is `position: relative` and its width is `100vw`, not an inset equation; see
  Regression risk.

## Complexity impact

| file | added | what |
| --- | ---: | --- |
| `src/reconstruction/layout-inference.ts` | 253 lines (135 code, 118 doc) for `insetResolvedWidth()` + `definitePx()` + `establishesFixedContainingBlock()`; 42 lines for the `tryInsetResolved()` closure; 5 one-line call sites; 1 rule kind; 1 outcome; 2 counters | the whole mechanism |
| `src/reconstruction/plan-reconstruction.ts` | 0 | unchanged after flag removal |
| `src/reconstruction/generate-app.ts` | 8 | three manifest counters |
| `src/reconstruction/types.ts` | 16 | three optional manifest fields |
| `src/reconstruction/index.ts` | 6 | barrel exports |
| `scripts/smoke-layout-safety.ts` | 334 | Parts 11e + 11f, 19 checks, plus the `p8` render fixture |

**New concepts: one.** "An out-of-flow box's frozen width is a SOLVED value, and the equation that
solved it is re-runnable." No new tolerance constant (it reuses `FULL_WIDTH_TOLERANCE_PX` and
`PARENT_GROWTH_MIN_PX`), no new guard, no new width syntax — the emitted declaration is
`width: auto`, which the module already emits.

## Cross-site evidence

Three sites, two viewports each, 12 reconstruction runs. **Improves 2 of 3 (linear.app,
gs.severance), exactly neutral on the third (hobbang.net, whose entire out-of-flow population is
2 nodes and both are correctly refused).** Both improving sites are structurally different:
linear.app's population is `position: fixed` headers whose containing block is the viewport;
gs.severance's is `position: absolute` overlays whose containing block is a positioned ancestor's
padding box. The same equation answers both, keyed only on the computed style and the probe.

## Regression risk

1. **Percentage or `@media`-dependent insets.** `left`/`right` are read from the exact tier, so
   an authored `left: 5%` arrives as one frozen px value. The per-width identity check is exactly
   what catches this: 5 of the 5,227 candidates across the corpus were refused `identity-fails`.
   Residual risk is an inset whose change is under 2px across the whole width axis, where the
   error it can introduce is also under 2px.
2. **The truth check cannot see off-truth-width errors** — it renders at 1440/390 only. That is
   why the identity is verified at every probe width BEFORE emission rather than relying on the
   render. The render still runs and still rejects: Part 11f proves a restatement of an authored,
   over-constrained width is rejected by it with a 550px error.
3. **DECLINED — the in-flow full-bleed class** (`width: 100vw; margin-left: -50vw; left: 50%`),
   linear's 8 remaining roots including the audit's #1. The naive one-declaration version
   (`width: 100vw` alone, leaving the frozen `margin-left: -720px` and `left: 672px`) was worked
   out arithmetically and is a REGRESSION at wide viewports: at 1920 the box would render
   `240 → 2160`, a NEW 240px overhang where the frozen 1440px box has none. Doing it correctly
   needs three co-emitted declarations plus a proof that the parent's content box is centred in
   the viewport — a full-bleed pattern recogniser. That is the "universal responsive solver" the
   brief forbids, and it is not here.
4. **DECLINED — hobbang.net's grid-track roots** (`n000269`, `grid-template-columns:
   638.391px 425.609px`, refused `tracks-not-reproducible-at-every-width`). The track list
   genuinely changes across authored bands; recovering it needs band-aware track inference, a
   different and much larger mechanism.
5. **`containingBlockGuard` untouched.** Not relaxed, not consulted differently, still refusing
   `grid-item` at `:872-878`. Part 11e asserts all three refusals still fire on the fixtures the
   new branch then answers.
6. **Not attempted.** Height, vertical overflow, `inset-block`, logical-property authoring, and
   `direction: rtl` (where an over-constrained box drops `left` rather than `right` — the
   negative control still refuses those, because their width does not move).

## Recommendation

**ADOPT.**

The number that decides it is the two-directional geometric measurement, because it is the only
one that can distinguish "fewer residuals" from "fewer residuals and more wrong boxes":
**285 nodes improved and 0 worsened on linear.app; 99 improved and 2 worsened on
gs.severance.healthcare; byte-identical on hobbang.net.** Total rendered width error against the
source probe falls 2.5% and 8.7% on the two sites with a population, `rejectedByTruthCheck` and
`acceptedRegressed` do not move on any site, and the audit's own `offscreen` residual count falls
14 → 5 on gs.severance (−64%) and 1017 → 1005 on linear.app.

The improvement on linear.app's residual TOTAL is honest but modest (−0.9%), because linear's
largest single root is the full-bleed `100vw` box this mechanism deliberately does not touch. The
adoption case does not rest on that total; it rests on 384 nodes moving closer to their observed
boxes and 2 moving away by 10px, for 135 lines of code that relax no guard and add no new
concept.

## What changed in the end

* `src/reconstruction/layout-inference.ts` — new `RecoveredRuleKind` `"inset-resolved-width"`,
  new `InlineSizeOutcome` `"emitted-inset-resolved-width"`, `insetResolvedWidth()`,
  `definitePx()`, `establishesFixedContainingBlock()`, `InsetResolvedRefusalReason` +
  `INSET_RESOLVED_REFUSAL_REASONS`, the `tryInsetResolved()` closure, and five one-line call
  sites at the exits that had already refused.
* `src/reconstruction/generate-app.ts`, `types.ts` — `insetResolved`, `insetResolvedWidth`,
  `insetResolvedRefusalsByReason` on `manifest.layout` (all optional).
* `src/reconstruction/index.ts` — barrel exports.
* `scripts/smoke-layout-safety.ts` — Parts 11e and 11f, 19 permanent checks, suite 260 → 279.
* The experiment flag was REMOVED; the behaviour is unconditional and no dead toggle remains.

## Tests, and how pre-change failure was established

Not by argument. `layout-inference.ts` was hashed, copied, and the mechanism reverted in place by
forcing `tryInsetResolved()` to return `false`; the suite was re-run and the original restored and
verified with `shasum -a 256 -c`.

**10 of the 19 new checks FAIL against the reverted implementation (269/279).** The failures are
every check that asserts an emission, the padding-box arithmetic, the discriminating twin, both
negative controls' counters, and the funnel partition. The checks that still pass under the revert
are the three labelled `PRE-FIX REPRODUCTION` (they assert the pre-fix predicate directly, so they
must pass before and after), the fixture-arithmetic check, the type-list membership check, and
"a node the ordinary branches CAN answer for keeps its existing rule" — an invariant that has to
hold in both worlds, which is the point of it.

Part 11f's three truth-check checks pass under that particular revert because they hand
hand-built rules to `verifyLayoutRules()`. They cannot compile at all against the true pre-change
tree: `"inset-resolved-width"` is not a member of `RecoveredRuleKind` there.

Named checks:

* `a fixed box with two definite insets is restated as \`width: auto\``
* `…and its evidence names the VIEWPORT as the box it was solved against`
* `an absolute box inside a padded positioned ancestor is restated too`
* `…solved against the ancestor's PADDING box, which its evidence names`
* `…and the padding box is the BORDER box minus the border, not the border box` — the fixture's
  border makes the two boxes differ by 10px, five times the tolerance
* `THE DISCRIMINATING TWIN: the same geometry with \`absolute\` is REFUSED` — identical widths,
  identical insets, different `position`, different answer
* **NEGATIVE CONTROL** `an out-of-flow box whose width does NOT move is refused` — the
  genuinely-fixed-width node, refused `width-constant`
* **NEGATIVE CONTROL** `one definite inset is not a solved width` — refused `inset-not-definite`
* `a node the ordinary branches CAN answer for keeps its existing rule` — proves the branch never
  steals from a shipping rule
* `every candidate still leaves through exactly ONE outcome, new kind included`
* `a correct inset restatement ships, having been RENDERED — never exempted`
* `…and one that re-solves an AUTHORED width is rejected by the same render`, `…by exactly the
  550px the dropped \`right\` inset accounts for`

## Verification

| command | result |
| --- | --- |
| `pnpm typecheck` | PASS, 0 errors (none under `src/observer/**` or `scripts/smoke-multi-observer.ts` either) |
| `npx tsx scripts/smoke-layout-safety.ts` | **279/279 PASS** (was 260/260) |
| `npx tsx scripts/smoke-reconstruction.ts` | **227/227 PASS** |

## Remaining limitations

1. The mechanism answers ONE of the three chain-root populations. linear's full-bleed `100vw`
   roots (8, including the #1 residual with 416 descendants) and hobbang's banded grid-track roots
   (4) are named, quantified and untouched.
2. `direction: rtl` is not modelled; an rtl over-constrained box drops `left`, not `right`. Those
   nodes are refused today only because their width happens not to move — the identity check does
   not know about writing direction.
3. Logical inline insets (`inset-inline-start/end`) are not read; only `left`/`right` are.
4. The containing-block walk uses the SPEC tree, so a node whose real containing block is outside
   the observed tree (a portal reparented at runtime) can only be refused, never mis-resolved —
   the identity check fails and the node keeps its frozen width.
