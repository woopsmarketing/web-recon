# Task 28.6 — Orchestrator Plan (v1, after read-only reconnaissance)

Six fresh read-only readers mapped the observer, SiteSpec, reconstruction, QA, e2e and test surfaces. This plan is derived from that map; every file:line below was verified by a reader.

## What the reconnaissance changed about the 28.5C plan

1. **The probe already measures the source's true layout at any width.** `probeLayout` does ONE page load in a desktop-like context (1440x900, DPR1, no touch) and then resizes, re-measuring the SAME parked element references (`src/observer/layout-probe.ts:240-269`). So a 700px sample is a live resize of the real page, not an inference. Adding 700 and 1100 to `LAYOUT_PROBE_WIDTHS` (`src/observer/types.ts:1103`) is the single highest-leverage change in the task.
2. **The 700px defect is a MOBILE-TREE defect, not a desktop one.** The clone emits two frozen subtrees switched at 915px (`src/reconstruction/responsive-plan.ts:75`, `app-template.ts:294-308`). Below 915 the mobile tree shows, and it receives ZERO inferred rules because inference walks only `page.viewports.desktop` (`layout-inference.ts:331`), probe arrays are attached only to desktop nodes (`sitespec/compile-page.ts:305-317`), and `generateLayoutCss` hardcodes `[data-wr-viewport="desktop"]` (`layout-inference.ts:700-702`). The fix is symmetry: a mobile-side probe, mobile probe attachment, and a viewport-parameterised emit. Raising the breakpoint instead would show the desktop DOM at 700 and lose the source's mobile-only nodes.
3. **The toggle defect does not exist in the shipped build.** Investigation I2 proved the shipped clone renders the Basic/Business switch pixel-identically to the source at 1024/1100/1440 (track 32x20, knob 14x14, identical white/blue pixel counts). The thin sliver is an AC5 experiment artifact: AC5's transitive `width:auto` pass collapsed a probe-INVARIANT empty knob div to 0px and its padding-only parent to 6px. This converts the toggle item from "fix a defect" into "prove the coherent unfreeze cannot cause it" — a mandatory safety rule plus a generic switch fixture.
4. **CORS recovery has a zero-extra-fetch channel.** `page.on('response')` filtered on `resourceType() === 'stylesheet'` returns cross-origin stylesheet bodies (verified in Chromium by the reader). Installed before `page.goto` in `observe-page.ts:235-240`, it needs no second network request. The recovered text is fed back in-page through `new CSSStyleSheet().replaceSync(text)` (never adopted, so it cannot affect rendering) and runs through the SAME `visit()` + `el.matches()` code — no CSS parser is added.
5. **`CSSRule.type` is unreliable.** Chromium 151 reports `CSSContainerRule.type === 0` and `CSSLayerBlockRule.type === 0`, so the `type === 4` test at `collect-dom.ts:376` records `@container` / `@supports` / `@layer` declarations as UNCONDITIONAL. A numeric fix (type 17) would still be wrong; discrimination must use `constructor.name`. Two adjacent silent gaps: the layout visitor never recurses into `CSSStyleRule.cssRules` (all CSS-nesting breakpoints are lost) and `@import` sheets are never visited.
6. **Additive schema fields are safe.** No `.strict()` or `.passthrough()` exists in `src/sitespec` or `src/observer`; zod 4 `z.object` strips unknown keys. New optional fields parse against every on-disk artifact.
7. **The QA engine has no verdict and no five-width mode.** `qa:reconstruction` is hard-wired to desktop 1440 / mobile 390 (`run-qa.ts:130`); BLOCKER/MAJOR/MINOR in 28.5C were hand-assigned in throwaway scripts, never code. A new standalone harness is required, built on the exported primitives (`newQaContext` already accepts a `widthOverride`).

## Work packages

| WP | Lane | Scope | Depends on |
|---|---|---|---|
| **W1 — Observer truth recovery** | OBS (single writer) | CORS stylesheet fallback via response capture; grouping-rule correctness (`constructor.name`, nesting recursion, `@import`); coverage counters; probe widths default `[390,700,768,1024,1100,1440,1920]` + `probeExtraWidths` plumbing + `--probe-widths`; **mobile-side layout probe** attached to the mobile tree | — |
| **W2 — Media condition tokenizer** | SPEC (pure new module) | `src/sitespec/media-condition.ts`: condition text → width breakpoints, handling `(max-width: 640px)`, compound `and`, range syntax `(width >= 1024px)`, em/rem, `not`/`only`, non-width conditions | — |
| **W3 — Five-width responsive QA harness** | RQA (new dir) | `src/responsive-qa/`: per (route,width) source-vs-clone metrics + SOURCE&#124;FINAL composites + contact sheets + manifest; generic logo-row, footer-completeness, overlap, whitespace, layout-mode and nav/footer checks; BLOCKER/MAJOR/MINOR rubric in code | — |
| **W4 — SiteSpec authored breakpoints** | SPEC | `authoredBreakpoints` histogram at ViewportPageSpec + PageSpec + ResponsiveModel; observer coverage counters carried through | W1, W2 |
| **W5 — Destructive inference safety** | RECON | `hiddenRanges` stops extrapolating: snap band edges to a preserved authored breakpoint, else the nearest bracketing measured sample, else REFUSE to emit. Unknown is not hidden | W4 |
| **W6 — Active-range verification** | RECON | Per-width truth carried on the rule; truth check renders at every distinct emitted band and every required width; responsive-hidden rules verified in-band; `acceptedUnchecked` → 0 | W5 |
| **W7 — Coherent unfreeze** | RECON | Emit the frozen layout property SET coherently when the probe proves fluidity; never `max-width:none`; never unfreeze a probe-invariant node or a node with no intrinsic content (the I2 rule) | W6, I1 |
| **W8 — Mobile subtree inference** | RECON | Un-hardcode `data-wr-viewport="desktop"`; run inference for the mobile tree against the mobile probe; 390 must not regress | W1, W7 |
| **W9 — New regression suites** | TEST | `smoke-responsive-truth`, generic switch fixture, logo-row/footer fixtures; honesty-reviewed independently | W5-W8 |

## Acceptance bar (carried from 28.5C, unchanged)

- All five widths RENDERED and compared against source, never inferred.
- No regression at 390 or 1440 on either the clip metric or the new distribution metric.
- 1024 and 1100: offscreen normal-flow text 0; horizontal overflow at or below the source's own noise floor.
- 700: measurably improved or formally declared out of scope with evidence.
- `acceptedUnchecked` = 0 for any rule kind that can affect a required width.
- Re-run on BOTH linear and stripe with no per-site code edits.
- Independent fresh-context visual audit at all five widths before acceptance.

## Standing safety rules for every builder

- `max-width: none` is never emitted (Stripe-verified 28.5C correction).
- A node whose probe width is invariant across all sampled widths is PROVEN FIXED and must never be unfrozen (I2).
- A destructive rule (`display:none`, `visibility:hidden`, variant removal) requires positive evidence: browser observation inside the range, or a preserved source rule. Interpolation is not evidence.
- No host-specific branches. No `if (host === ...)`.
- Every new persisted field is optional; `SCHEMA_VERSION` bumps only if a field changes meaning.
