# Task 28.6 — O3.1: the probe-width eviction regression, and its fix

Orchestrator-owned correction. Single change, measured from both ends.

## 1. What broke

Wave 6b shipped O3: floor probe widths stopped being unconditionally preserved so that
an authored breakpoint could take a slot from a width the site never authored. Only a
`MIN_GUARANTEED_FLOOR_WIDTHS = 3` core survived every input, and that core was chosen by
**position** in the sorted floor list (`pickGuaranteedFloor`, `src/observer/probe-widths.ts:174`).

Choosing by position rather than by pixel value was deliberate and correct in itself — naming a
pixel value inside the derivation is the host-specific hack the engine forbids. The defect is that
position is the wrong protection criterion when a *downstream* stage hard-requires a specific width.

For the 7-width desktop floor `[390, 700, 768, 1024, 1100, 1440, 1920]`, evenly spaced indices
0/3/6 give `[390, 1024, 1920]`. **1440 was evictable.** 1440 is the width every desktop deep
observation is taken at (`DESKTOP_PROFILE.width`, `src/observer/types.ts:114`) and the width
`src/reconstruction/layout-inference.ts:1668` requires before it will run the desktop pass at all.

## 2. What it cost, measured

Wave 7 ran seven pilots. **Four of the seven hit it**: linear.app, seoultone.kr,
xn--ok0b408a79cba430b.net, interiorteacher.com.

Linear, 4 of 4 pages:

| artifact | value |
|---|---|
| `widthProvenance.floorWidthsEvicted` | `[700, 768, 1100, 1440]` |
| `widthProvenance.capHit` | `true` |
| `breakpointsAdoptedByEviction` | 2 |
| manifest `viewportPassRefusals` | `{"desktop:truth-width-not-probed": 4}` |
| manifest `shippedRulesByViewport` | `{mobile: 1006}` — **desktop absent** |
| generated `globals.css` recovered block | 1006 rules, 1006 mobile, **0 desktop** |
| baseline run `2026-09-02T20-18-05-741Z` (pre-O3) | 1135 rules, all desktop, no eviction |

The refusal was honest — the pass declined rather than guessing — but the input that forced the
refusal was manufactured by the engine itself, not by the site.

A second consequence rode along: with 768 also evicted, the tree switch landed at 1025 instead of
769, so both 700 and 1024 served the 390-observed DOM, and `nav-link-ratio 3 of 6` became the
deciding BLOCKER at 1024 on all four Linear routes.

## 3. The fix

`DeriveProbeWidthsInput` gains an optional `requiredWidths`. The **caller** states which widths its
own downstream consumers hard-require; the derivation unions them into the guaranteed core, so they
can be neither evicted for an authored bracket nor missing from the result. No pixel value is named
inside `probe-widths.ts`.

`src/observer/observe-page.ts` passes each probe pass its own live profile width — desktop
`DESKTOP_PROFILE.width` (1440), mobile `mobileProfile.width` (390) — read from the profile in use,
not written as a constant at the call site.

Files changed:

| file | change |
|---|---|
| `src/observer/probe-widths.ts` | `requiredWidths` input; unioned into `guaranteedSet`; excluded from `evictableRemaining`; seeded into `chosen` when outside the floor list; recorded in provenance |
| `src/observer/types.ts` | `ProbeWidthProvenanceSchema.requiredWidths`, optional — pre-O3.1 artifacts stay readable, no schema bump needed |
| `src/observer/observe-page.ts` | `deriveFor` takes `requiredWidths`; both call sites pass their profile width |
| `scripts/smoke-multi-observer.ts` | 6 permanent checks (§4) |

## 4. Verification — the guard is not vacuous

The pressure shape matters. A tally whose brackets each need **two** fresh widths can only reach
three evictions on the 7-width floor (7 + 2k − e ≤ 16 has no solution with e = 4), so it would have
hidden this regression entirely. The check therefore uses a tally of brackets that each add exactly
**one** fresh width — `(min-width: X)` whose low side `X−1` is already sampled — which walks the cap
up one slot at a time and gives up every evictable floor width in turn. That reproduces the field
result exactly.

Measured, `tmp/wr286/orch/o31.ts`:

```
unpinned  widths 390,391..403,1024,1920   evicted [700,768,1100,1440]  adopted 13
pinned    widths 390,391..402,1024,1440,1920  evicted [700,768,1100]   adopted 12  required [1440]
mobile    390 kept under 40-condition pressure
every shipped viewport profile keeps its own observation width: 20/20 pressure shapes
```

Pinning cost exactly **one** authored bracket (13 → 12) and never broke the cap.

The six permanent checks in `scripts/smoke-multi-observer.ts`:

1. the regression is REAL without `requiredWidths` — the observation width is evicted
2. …and `requiredWidths` removes it under the identical pressure
3. …pinning costs at most one authored bracket and never breaks the cap
4. the MOBILE pass pins its own observation width, not the desktop one
5. EVERY shipped viewport profile keeps its observation width across 20 distinct pressure shapes
6. **`observe-page` actually WIRES it** — asserted on source text, because a passing unit test on
   `deriveProbeWidths` proves nothing if the caller never passes the field. That is the fake-coverage
   failure class this task exists to eliminate.

`pnpm exec tsc --noEmit` exits 0.

## 5. What this does NOT fix

- `no-branch-matched` is visible but largely unreduced.
- The DOM-swap width remains unobservable from two observation widths; the engine refuses with
  `tree-switch-dom-width-not-observed` rather than guessing.
- Whether the four re-run sites' grades actually improve is measured in Wave 8, not asserted here.
