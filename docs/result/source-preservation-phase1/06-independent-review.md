# 06. Independent review — findings and what was done

Reviewer: one fresh-context, READ-ONLY agent (Opus), neutral prompt: *"Review the Source Package Capture implementation for correctness, missing capture classes, privacy/security issues, duplicate-system risk, artifact determinism, and backward-compatibility blockers."* It read the code, the tests, the design docs and the first two live artifacts; it ran `tsc --noEmit` and made no changes.

Verdict of the review: 1 BLOCKER, 6 MAJOR, 13 MINOR, 11 NOTEs, and 21 items verified OK (defaults off at all entry points, header/POST privacy, window-global allowlist, config redaction, `rm` target provably a leaf, backward compatibility, attach-before-goto, no second document request, redirect resolution, bounded CSSOM walk, no hostname-specific logic).

Per the task, only BLOCKER and MAJOR findings were fixed; MINOR/NOTE items are listed with a disposition and carried to Phase 2.

## 1. Fixed (BLOCKER + MAJOR)

| id | finding (reviewer's evidence) | fix | where |
|---|---|---|---|
| **B1** | Redaction covered only the dedicated `url`/`src` fields. `headers.location`, `initiator.url` / `stackTopUrl`, script `initiatorUrl`, a URL interpolated into a `reasons` string, image `srcset` / `currentSrc`, `@font-face` `srcRaw`, `sheetHref`, and owner-node attributes (`data-href`) were persisted raw. Proven on the live artifact (`location` with a full Google beacon query; 81 raw initiator URLs). | New helpers `redactUrlText` (keeps the original spelling when nothing is redacted), `redactSrcsetText`, `redactCssUrls`, `redactAttributeRecord`; applied at every one of those sites plus `source.requestedUrl` / `finalUrl` / `route.search` / `document.initial.url`. `assetFor` now redacts every attribute record and `sheetHref` in one place. | `classify.ts`, `capture.ts` |
| **M1** | `redactUrl` stripped `user:pass@` but returned the *original* string when no query key matched. | Returns the rebuilt href whenever credentials were stripped and records `redaction.credentialsStripped: true` (new optional schema field). Verified: `https://user:s3cr3t@cdn…/app.js` → `https://cdn…/app.js`. | `classify.ts`, `types.ts` |
| **M2** | `www.google.com/measurement/conversion` fell through to `API_DATA` with its full query (GA client ids, `uafvl` browser fingerprint, `u_w/u_h`). | `ANALYTICS_PATH` gained `/measurement/`, `/1p-conversion`, `/conversion`, `/ccm/`, `/pagead/`. Additionally, an `API_DATA` request to a host outside the page's **site** (registrable-domain approximation, `isSameSite`) now drops its query with the reason recorded; same-site APIs (`dev-api.<site>`) keep theirs because that query is the endpoint shape. | `classify.ts` (`registrableDomain`, `isSameSite`, `pageHost` input), `capture.ts` |
| **M3** | `document.adoptedStyleSheets` was counted and discarded; `sourceType: "adopted"` was unreachable. | The in-page sheet loop now walks `document.styleSheets` followed by `document.adoptedStyleSheets` (owner-less, index continues, same CSSOM visitor → `adopted` entries with CSSOM snapshots). A limitation names the count. | `inventory-in-browser.ts`, `capture.ts` |
| **M4** | No shadow-DOM capture and no limitation saying so. | The bounded element walk counts open shadow roots on host elements; `document.runtimeDom.shadowRoots` is written and, when > 0, an explicit limitation states that shadow trees (styles, assets, markup) are not captured and that `page.content()` does not serialize them; closed roots are not even countable. | `inventory-in-browser.ts`, `capture.ts`, `types.ts` |
| **M5** | The second CSSOM pass re-indexed `document.styleSheets` by a stale index with no identity check: a CSS-in-JS insertion between passes would attach the wrong sheet's CSS to a linked entry silently. | `serializeSheetsInBrowser` returns the `href`/`ownerTag` found at the index NOW; the assembler rejects any result whose href is not the one the entry names (`cssomSerialized: unavailable`, reason, plus a package limitation). | `inventory-in-browser.ts`, `capture.ts` |
| **M6** | The smoke suite loaded `https://www.youtube.com/embed/abc` live; "215/215 on loopback fixtures" was not hermetic. | Every page the suite drives routes the embed host to an in-memory stub (`page.route` → HTML + one script), so provider classification is still exercised without a network request; the two `observePage` runs (which own their browser) load a `/no-embed` variant of the fixture. | `scripts/smoke-source-package.ts` |

Re-verification after the fixes: `npx tsc --noEmit` 0 errors; `pnpm smoke:source-package` 215/215 in 82 s; unit spot-checks of the new redaction helpers (`tmp/source-preservation-phase1/redaction-check.mts`); one further live capture (the reviewer gave a concrete reason: the two existing artifacts contained the raw beacon query and raw initiator URLs) — see `04-apartmentary-capture.md`.

## 2. Not fixed (MINOR / NOTE) — disposition

| id | finding | disposition |
|---|---|---|
| m1 | body-skip policy (`analytics|tag-manager|ads`) narrower than the `EXTERNAL_EMBED` provider set (`+monitoring|chat|embed`) | Phase 2 knob decision; today chat/monitoring/embed script bodies are small on the measured site (Channel Talk 1.8 KB). Listed in `07-phase2-handoff.md`. |
| m2 | no run-level byte budget for site runs | Per-viewport caps only. Add an aggregate ceiling to `observe-site` before enabling the flag on large site runs. |
| m3 | `SENSITIVE_QUERY_KEY_PATTERN` requires `_`/`-` boundaries; camelCase keys (`accessToken`) pass | Carry-forward; the JSON config redactor already matches camelCase. |
| m4 | redaction re-encodes the whole query (`%20` → `+`) so a redacted URL is not byte-identical | Only URLs that had a redaction are rewritten (clean URLs are kept verbatim as of B1). Phase 2 must not re-fetch from a URL carrying a `redaction` marker anyway. |
| m5 | accounting excludes the two document blobs and unclaimed network bodies | Pointer `bytes` is the on-disk truth; accounting counts capture *decisions*. Documented in `02`. |
| m6 | `contentHash` excludes `cssomSerialized` and config blobs | Intentional: the hash tracks *served* bytes so desktop/mobile agree (proven identical); snapshots are viewport-dependent. Doc comment to be corrected in Phase 2. |
| m7 | `attachSourceCapture` not individually guarded in observe-page | It only attaches listeners and a CDP session, which catches its own failure; carry-forward. |
| m8 | network blob filenames are arrival-ordered | `contentHash` and sorted manifests are the determinism contract; filenames of skipped-body entries do not exist, captured ones are also referenced by sha256. Carry-forward. |
| m9 | `@import` children hard-coded `declaredIn: initial-document` | Carry-forward (rare; noted in `07`). |
| m10 | `FONT` preservability ignores HTTP outcome | Carry-forward. |
| m11 | assets past `maxInventoryEntries × 4` dropped without a limitation | Carry-forward. |
| m12 | inventory-only limitation gated on `bodyPolicy.font` alone | Carry-forward. |
| m13 | 13 sequential `headerValue()` awaits per response | Measured cost is inside the 28–32 s observation window; carry-forward. |
| NOTE | sixth `stableStringify` copy in `store.ts` | Should import `responsive-qa/continuous/json.ts`; trivial, carry-forward. |
| NOTE | stylesheet bodies read twice (recorder + observer bridge) | Already `07-phase2-handoff.md` B5. |
| NOTE | recorder comment overstates `headerValue` vs `allHeaders` | Persistence is allowlisted either way; comment wording only. |
| NOTE | same-origin iframe `EMBED`→`EXTERNAL_EMBED` vs `classifyEmbedUrl` `UNKNOWN`; websocket → `ORIGIN_BOUND` | Vocabulary alignment for Phase 2. |
| NOTE | `<template>` content counted by the witness | Carry-forward. |
| NOTE | `bodyPolicy.json=false` is a default, not structural | CLIs pass only `true`; the options object is API-only. |
| NOTE | direct-fetch fallback not exercised on the live site | Covered by smoke T4 only; `07` B6. |
