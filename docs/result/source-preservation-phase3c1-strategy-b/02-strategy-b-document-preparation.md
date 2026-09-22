# 02 — Strategy B document preparation

Harness: `tmp/source-preservation-phase3c1-strategy-b/prepare.mjs` + `lib/initial-document.mjs`.
Output: `…/2026-09-16T14-30-58-205Z/index.html` (sha in `experiment-manifest.json → experimentDocumentSha256`).

## Input located from existing evidence (no recapture)

- Phase 1 `viewports/desktop/source-package/manifest.json → document.initial`:
  - `file: document/response.html`, `url: https://apartmentary.com/`;
  - `httpStatus 200`, `status: captured`;
  - `sha256 95eb46dd666eb9fc…13b`, 81,794 bytes.
- It is byte-identical to `viewports/desktop/document-response.html`.
- It is **not** the runtime DOM (`document/runtime.html`, sha `98b47458…`), which is what the Phase 2 clone was built
  from (`manifest.variants[desktop].domSource = runtime-dom`).

## What was changed: `<script>` start tags only

`prepareInitialDocument` uses parse5 only to find start-tag byte ranges, then splices them. The document is never
re-serialized.

| action | count | rule |
|---|---|---|
| activated | 9 | the replay-set URLs (resolved against the page URL); the tag is built with the same attribute composition as `activate.mjs` |
| neutralized | 12 | every other executable `<script>`: `type="text/plain"` + `data-preservation-neutralized` + `data-preservation-original-type` + `data-preservation-src`. These are the Kakao SDK, the GTM inline, `kp.js` + `kakaoPixel` inline, the Karrot pixel UMD + `karrotPixel.init` inline, `wcslog` + inline, the `fbq` inline, 2 ChannelIO inlines, and `polyfills` (nomodule, neutralized in A too) |
| untouched | `__NEXT_DATA__` (`application/json`) | not executable |

The 9 activated start tags are **byte-identical** to Strategy A's `activatedStartTags[].after`.

## Static proof that nothing else changed (preflight 118/118)

- `revertEdits(index.html)` reproduces `response.html` byte for byte, and every edit range is a `<script` start tag.
- The `#__next` outer markup is byte-identical to the response and differs from the Phase 2 `#__next`.
- The edit ranges all lie outside `#__next`.
- `__NEXT_DATA__` is present, unchanged, and its buildId equals the runtime graph.
- All 5 `<style>` elements and 10 `<link>` tags are byte-identical to the response. No Emotion tag was deleted,
  reordered or edited.
- Exactly the 9 replay scripts are executable, in replay order, each with the activation marker, and there is no inline
  executable.
- 0 inline event-handler attributes exist in the response, so none needed neutralizing.
- No instrumentation key or synthetic-image prefix appears in the document.

## Serving (reused mechanisms)

- **Document at `/`** by the 3B `server.mjs`. Root-relative paths go through the same evidence path map as A:
  - 61 entries, sha-identical; 3C equivalence check `pathMap.sameEvidencePathMap`;
  - the 9 scripts, both CSS chunks, `/_next/static/media/*`, favicons and fonts.
- **Font URLs in unmodified `<style>` text** (`fonts.gstatic.com`): A received these bytes by rewritten `../assets`
  URLs. B must not edit style text, so `lib/local-mirror.mjs` serves the **same Phase 2 bytes** at the original URLs.
  It covers 15 URLs, matches exact URLs only, is sha-verified, never serves scripts, and falls back to the fail-closed
  guard for everything else. **Observed use: 0.** Neither A nor B requested a gstatic font, and the 6 fonts B loaded
  are sha-identical to the 6 font bodies A loaded (`04`).
- **Unmapped root-relative reference:** `/_next/static/chunks/polyfills-…js` only. It is neutralized, so it is never
  requested.

## Not done (by design)

- No DOM transform toward the Phase 2 runtime DOM.
- No class/layout normalization.
- No synthetic content in HTML.
- No copied runtime style tags.
- No tracker execution.
