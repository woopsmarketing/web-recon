# Phase 2 → Phase 3 handoff

Phase 2 is closed for the Apartmentary homepage: source-preservation-first
reproduces the source visual layout, pending the human's visual verdict.

## What Phase 3 inherits

**A working preservation substrate.** `src/preservation-clone/` consumes any
viewport Source Package and emits a browser-runnable variant. It is generic —
no host, path or site name in any production path — so any Phase 1 capture can
be cloned with `pnpm preserve:build <run-dir>`.

**Every source JS byte, on disk and untouched.** 19 distinct files, 1.2 MB, at
`<clone>/scripts/<sha256>.js`, referenced by no document. The DOM records where
each one belongs: every neutralized `<script>` carries
`data-preservation-src` (its source URL), `data-preservation-original-type`
(its original `type`) and, where bytes exist, `data-preservation-bytes`
(the local path). Re-enabling a script is therefore a matter of reversing three
attributes — the information was never discarded.

`executionIndependence` remains **UNKNOWN**. Nothing in Phase 2 establishes
that these chunks can run outside their origin.

## The runtime dependencies Phase 3 must answer

Recorded as `PHASE_3_RUNTIME_DEPENDENCY`, all observed and none solved:

| Dependency | What is missing |
|---|---|
| Swiper carousels | hero and portfolio sliders are frozen on the captured slide |
| Mobile menu | the hamburger does not open |
| Modals | consultation/detail modals do not open |
| AOS scroll animations | `data-aos` elements never animate in |
| Next.js runtime | webpack runtime, `main`, `_app` and page chunks are inert |
| React hydration | the tree is markup; there are no listeners or component state |
| Source APIs | `main-banners`, `portfolios`, `reviews` are frozen as captured |
| Navigation | this page has **zero** `<a href>` elements — every route change is JS-driven, so route navigation is entirely a Phase 3 problem |
| Channel Talk | the chat widget iframe is script-created and absent |
| Desktop/mobile tree switch | the source swaps DOM trees around 900px with JS; the clone has two static variants instead |

## Carried-forward items

**From the independent review (MINOR 7):** `<link rel=manifest>` is localized,
but the icon URLs *inside* the manifest JSON are not parsed or rewritten. A PWA
install prompt could therefore contact the source host without appearing in
`residual-dependencies.json`. Narrow, but it is a real gap in the residual
ledger and should be closed when web-manifest handling matters.

**Untested code paths.** `sourceType: "import"` (nested `@import` sheets) and
`"adopted"` stylesheets are implemented generically but the canonical run
contains zero of each, so neither has ever run against real data.

**Phase 1 capture debt**, untouched because none of it blocked Phase 2: the
duplicate stylesheet response listener, the camelCase query-key redaction edge
case, the whole-site aggregate byte budget, and the `@import` metadata nuance.

**The 98 MB hero video.** Left as a deliberate residual under an 8 MB media cap.
If Phase 3 wants a source-independent artifact, this is the one file standing in
the way — raise `--max-media-bytes` and the clone localizes it.

## Design decisions Phase 3 should not casually reverse

1. **The runtime DOM is edited in place.** Cascade correctness is a consequence
   of never regenerating the document. Any Phase 3 step that rebuilds markup
   inherits the cascade-ordering problem Phase 2 avoided by construction.
2. **One representation per stylesheet.** Authored text wins; a CSSOM snapshot
   is used only where authored text never existed, and is always labelled
   `runtimeDerived`. Emitting both doubles the cascade.
3. **Desktop and mobile are never merged.** Their runtime stylesheets genuinely
   differ (23,857 vs 11,117 bytes for one entry). Automatic tree switching is a
   Phase 3 feature, not a reason to merge the evidence.
4. **Nothing is derived from measured geometry.** This is the whole premise.
5. **Unlocalized means absolutized and recorded.** Silence about a residual is
   the failure; a recorded residual is not.

## Commands

```bash
pnpm preserve:build <observation-run-dir> [--out DIR] [--viewport ID]... [--max-media-bytes N]
pnpm preserve:preview <clone-dir> [--port N]
pnpm preserve:sanity <clone-dir> <screenshot-dir> [--expect-text "..."] [--min-height N]
pnpm smoke:preservation-clone
```
