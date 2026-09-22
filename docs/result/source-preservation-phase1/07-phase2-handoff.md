# 07. Phase 2 handoff — prerequisites, not implementation

Phase 1 stops at **capture and classification**. Nothing below is implemented; each item is a prerequisite Phase 2 (faithful Preservation Clone) must settle before the first line of renderer code. Items are ordered by how much of Phase 2 depends on them.

## A. Decisions that must be taken by a human first

1. **Which package is the source of truth when desktop and mobile disagree.** Every viewport load produces its own package (`viewports/<id>/source-package/`). On Apartmentary the two packages share every same-origin blob hash and differ only in third-party responses (Facebook config URLs carry `im=1` on mobile, different bytes). A Phase 2 merge rule is needed: union by content hash for same-origin, per-viewport record for third-party, and a documented tie-break when the same URL yields different bytes.
2. **Whether third-party CSS-in-JS runtime output is treated as source.** `cssom-runtime` entries (`data-emotion` / `data-styled` empty tags filled by `insertRule`) are captured as a CSSOM-serialized snapshot — parser-normalized, state-dependent, not authored bytes. Phase 2 must decide whether the clone (a) re-executes the CSS-in-JS runtime (needs the JS runtime, out of Phase 2 scope), (b) ships the snapshot as a static stylesheet, or (c) ships both snapshots (desktop + mobile) behind the authored breakpoints.
3. **Analytics/ads scripts.** Bodies are not kept by default (`bodyPolicy.analyticsScript=false`). Phase 2 decides whether the clone drops them, stubs them, or replaces them with operator-provided tags. Nothing in the package supports "re-host the original pixel".
4. **`nomodule` polyfills.** `polyfills-*.js` is document-declared but never loaded by modern Chromium (`body.status: unavailable`, "no network response observed"). Decide: fetch directly for legacy-browser parity, or drop.

## B. Capture-side prerequisites (Phase 1 code, additive)

5. **Fold the observer's stylesheet bridge into the recorder.** `captureStylesheetBodies` (observe-page.ts) and the Source Package recorder both listen to `page.on("response")` for stylesheets. They are independent today so the observer's CORS bridge is untouched; before Phase 2 relies on both, one listener should feed both consumers (single seam, per CLAUDE.md §7).
6. **Font and image materialization through the existing SSRF-hardened `safeFetchAsset`.** The package inventories 24 `@font-face` sources and 41 images with hashes/URLs but downloads none (policy). The Task 22 asset materializer already does bounded downloads; Phase 2 wires the inventory into it rather than adding a downloader to the package.
7. **Separate `@import` children.** They are appended as `sourceType: "import"` entries with their own bytes, but their rule counts are folded into the parent's CSSOM summary.
8. **Cross-viewport style-tag identity.** Style entries are numbered per package (`st0001…`). A stable cross-package key (owner attribute signature + text hash) exists implicitly; Phase 2 should make it explicit before merging.
9. **Child-frame recursion decision.** Child-frame requests are recorded as metadata (`frame: "child"`) and never bodied. Decide whether embedded documents (YouTube players, chat widgets) are ever captured or always `EXTERNAL_EMBED`.
10. **`streamAborted` media.** Range-loaded media (HTTP 206) is inventoried with its network entry but never bodied; if Phase 2 wants the hero video, it goes through item 6 with a size policy (the Apartmentary MP4 is 97.9 MB by `content-length`).

## C. Evidence the package does NOT provide (do not assume it in Phase 2)

- **No CSS cascade reconstruction.** The package preserves sheet order (`order` = index in `document.styleSheets`), `@layer` names and media conditions, but does not compute specificity, winning declarations or the cascade result for any node.
- **No execution independence for scripts.** `downloadable: true` means bytes were obtained; `executionIndependence` is the literal `"unknown"` for every entry.
- **No event listeners or component state.** `document/runtime.html` is `page.content()` after load — markup only.
- **No API responses.** Same-origin and third-party API calls are metadata-only (`API_DATA`, `ORIGIN_BOUND`); the four `dev-api.apartmentary.com` calls that hydrate banners/portfolios/reviews are known by URL, never by body.
- **No interaction or carousel state.** Swiper transforms, AOS transitions and autoplay position are runtime state; the snapshot holds whatever settled at capture.
- **CSSOM serialization is lossy for unknown properties.** Chromium's `cssText` drops declarations it does not parse (vendor prefixes it does not implement); measured on Apartmentary the emotion SSR tag's authored text is 20,339 bytes and its CSSOM snapshot 14,250 bytes. Authored text is the primary artifact whenever it exists.

## D. Suggested Phase 2 entry criteria

- Human sign-off on decisions A1–A4.
- Items B5–B6 implemented and covered by the existing smoke suite (`pnpm smoke:source-package`).
- A written mapping from `StyleEntry` → clone stylesheet emission order, using `order`, `media`, `layerNames` and `declaredIn` — before any CSS is rewritten.
