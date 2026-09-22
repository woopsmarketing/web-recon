# 03. Implementation — Source Package Capture (Phase 1)

Date: 2026-09-15

## 1. Files

New module `src/source-package/` (single writer for this phase):

| File | Role |
|---|---|
| `types.ts` | zod schemas for all manifests, limits, body policy, header allowlist, redaction patterns, vocabularies, in-memory `SourcePackageCapture`, observation pointer |
| `recorder.ts` | `attachSourceRecorder(page, …)` — Playwright `request`/`response`/`requestfailed`/`requestfinished` listeners + CDP `Network.requestWillBeSent` initiator side-channel; body capture under policy and caps; allowlisted headers only |
| `inventory-in-browser.ts` | `collectSourceInventoryInBrowser(arg)` — the self-contained in-page pass (styleSheets with CSSOM counts and runtime serialization, scripts, links, images/picture, background/mask images, media, iframes, SVG, `@font-face`, `document.fonts`, data scripts, allowlisted window globals); `serializeSheetsInBrowser` second pass |
| `initial-document.ts` | parse5 witness over the served bytes: declared script srcs / inline hashes / stylesheet hrefs / style hashes / preload / modulepreload |
| `classify.ts` | pure: `classifyRequest`, `classifyPreservability`, `classifyEmbedUrl`, `matchProvider`, `redactUrl`, `detectFrameworks` |
| `capture.ts` | `attachSourceCapture(page)` → `finish(input)`; `assembleSourcePackage` joins network × inventory × witness, applies caps/accounting, direct-fetch fallback, ids, ordering, `contentHash` |
| `store.ts` | `writeSourcePackage(dir, capture)` (fresh whole-directory write, sorted-key JSON), `makeSourcePackagePointer`, `loadSourcePackage` |
| `index.ts` | barrel |

Observer integration (additive):

| File | Change |
|---|---|
| `src/observer/types.ts` | `ViewportObservationSchema.sourcePackage?` (pointer), `ViewportSizeReportSchema.sourcePackageBytes?`, `ObservedViewport.sourcePackage?` |
| `src/observer/observe-page.ts` | `ObserveOptions.sourcePackage?: boolean \| SourceCaptureOptions` (default off); recorder attached BEFORE `page.goto` (next to the existing stylesheet bridge listener); `finish()` right after `page.content()` while the page is open; failure logged, observation stands |
| `src/observer/store.ts` | `saveViewport` writes `viewports/<id>/source-package/` and embeds the pointer + bytes |
| `src/cli-observe.ts` | `--source-package`, `--no-layout-probe`, package summary print |
| `src/multi-observer/observe-selected-pages.ts`, `src/cli-observe-site.ts` | `sourcePackage` option / `--source-package` passthrough |

## 2. Capture flow (per viewport load)

```
newContext → newPage
  attachSourceCapture(page)         ← recorder + CDP Network.enable, BEFORE goto
  captureStylesheetBodies(page)     ← existing W1.1 bridge (unchanged)
  goto (navigateMainDocumentCapturingBody: raw document bytes, existing)
  census / stabilize / normalize / collect (existing, unchanged)
  renderedHtml = page.content()
  finish():
    1. installBrowserNameShim + collectSourceInventoryInBrowser   (page open)
    2. recorder.finish()  — waits pending body reads, joins CDP initiators FIFO per URL, detaches
    3. parse5 witness over the initial bytes
    4. styles: per document.styleSheets entry → authored bytes (network → direct fetch)
       + CSSOM-serialized text for runtime style tags / adopted sheets
       + second in-page pass for linked sheets that yielded no bytes
       + @import children from the wire
    5. scripts: DOM scripts (classic/module/inline) + runtime-loaded chunks
       (main-frame script responses with no DOM element)
    6. config, assets, network entries; classification; counts; accounting;
       framework evidence; contentHash; limitations
context.close()
```

## 3. Decisions

- **One package per load, under the viewport directory.** Reuses the run/page layout byte-for-byte; no new artifact namespace. The observer's `document-response.html` and `rendered.html` remain; the package holds its own self-contained copies so Phase 2 reads one directory.
- **Separate listener rather than generalizing the stylesheet bridge.** The W1.1 bridge is a specialized consumer that must keep behaving identically when the package is off; folding it into the recorder is a Phase 2 refactor candidate (documented in the handoff), not a Phase 1 risk.
- **CSS-in-JS is the expected case, not an edge case.** A `<style data-emotion>` whose text node is empty while its CSSOM holds rules (emotion speedy mode) is `sourceType: cssom-runtime` and its `cssText` serialization is stored. The forensic V2 map named MUI/emotion on the diagnostic site; the smoke fixture reproduces it with `insertRule`.
- **Raw bytes first, normalized text second.** For linked sheets: network body → SSRF-hardened direct fetch (`safeFetchAsset`, bounded) → CSSOM serialization as the last resort. Each method's outcome is recorded in `methods`.
- **Scripts: downloadable ≠ executable.** Every script entry carries `downloadable` from evidence and `executionIndependence: "unknown"` by construction.
- **Document-declared vs runtime-injected** is decided by two independent witnesses: the parse5 pass over the served bytes and the CDP initiator (`parser` / `script` / `preload`).
- **Initiator join happens at `finish()`**, not at request time — the CDP event can arrive after Playwright's `request` event (measured on the fixture: the dynamic-import chunk and the fetch had no initiator when joined eagerly).
- **`__name` shim.** tsx/esbuild's `__name` helper does not exist in the page; the observer's `installBrowserNameShim` is called before both in-page passes (the first fixture run failed exactly there).
- **Privacy is structural**: header allowlist read one-by-one, no request headers, no POST bodies, URL/key redaction, window-global allowlist.
- **No Apartmentary-specific logic anywhere** (`grep -ri apartmentary src/source-package/` returns nothing).

## 4. Backward compatibility

- Default off. With the option off, the observer's code path adds nothing: no listener, no evaluate, no directory, no field.
- `sourcePackage` on the viewport and `sourcePackageBytes` on sizes are optional; `SCHEMA_VERSION` stays 5, `READABLE_SCHEMA_VERSIONS` unchanged; historical `observation.json` files parse unchanged.
- No downstream stage (SiteSpec, reconstruction, QA, template, release) reads the package yet. Reconstruction priority is unchanged.

## 5. Known gaps (Phase 1, documented in `limitations`)

- Child-frame requests are recorded (metadata) but their bodies are never kept; frame documents are not recursed.
- Service-worker-served responses are marked `STATEFUL_RUNTIME`; no SW script capture.
- `@import` children are counted inside the parent's CSSOM summary (their own rule counts are not separated).
- Constructed/adopted stylesheets are serialized when readable but have no authored source by definition.
- Bodies of fonts/images/media are inventory-only (policy); the existing materializer downloads them later.
- CSSOM serialization is parser-normalized (colors, shorthand expansion), never px-resolved; the manifest labels it `cssomSerialized`, distinct from `authored`.

## 6. Corrections made after inspecting the dry-run capture

The first real capture (`data/apartmentary.com/2026-09-15T11-06-29-416Z`, a DRY RUN on pre-final code — see `04-apartmentary-capture.md`) exposed four classification defects. All are fixed in the code the official capture and the smoke suite run against.

| # | Defect seen in the dry run | Fix | Files |
|---|---|---|---|
| 1 | The hero `main-introduce.mp4` (HTTP 206) and six 2xx analytics beacons were marked `failed` → `UNAVAILABLE`. Playwright fires `requestfailed` (`net::ERR_ABORTED`) when a body stream is abandoned after the response arrived. | A `requestfailed` on an entry that already holds a 2xx status now records `streamAborted` instead of `failed`; `ok` stays true, the body decision stands, `stats.failed` is not incremented. New optional field `NetworkEntry.streamAborted`. | `recorder.ts` (`onRequestFailed`), `types.ts`, `capture.ts` |
| 2 | All five document-declared `<style>` tags (emotion SSR, Next.js `data-href` inlined CSS) were typed `cssom-runtime` (`styleTags: 0`), because any CSS-in-JS/framework marker forced that type. | A `<style>` **with text** is `style-tag` (authored text captured verbatim; a CSSOM snapshot is kept alongside when a marker is present). Only an **empty** `<style>` is `cssom-runtime`. | `capture.ts` (sourceType) |
| 3 | Three **empty** runtime style tags were all attributed to `initial-document` because the hash of an empty string matched the empty SSR tag in the served bytes. | Three-pass attribution with per-tag consumption: exact text hash → owner attribute signature (the parse5 witness now records `styleTagSignatures`, shaped like the in-page `ownerAttributes`) → `runtime-injected` only when every initial `<style>` is spoken for, otherwise `unknown`. Recorded in the new optional `StyleEntry.declaredInEvidence`. | `initial-document.ts` (`styleSignature`), `capture.ts` (`declaredStyle`), `types.ts` |
| 4 | 2.7 MB of the 4.5 MB per viewport were Facebook Pixel / GTM / gtag / Google Optimize script bodies — code the clone will never ship, already classified `EXTERNAL_EMBED`. | New body-policy knob `analyticsScript` (default **false**): scripts served by a recognised analytics / tag-manager / ads provider get `skipped-by-policy` bodies; inventory, metadata, initiator and classification are unchanged. `googleoptimize.com` added to the generic provider rules. Manifest schema accepts packages without the knob. | `types.ts`, `recorder.ts`, `classify.ts` |

Two further changes from the sanity fixture, before the dry run: `writeSourcePackage` clears the target directory first (stale blobs from an earlier run were otherwise left next to a fresh manifest), and JSON config copies (`__NEXT_DATA__` and other data scripts) pass through `redactJsonText` (`apiToken`-shaped keys → `[redacted]`, keys listed in `redactedKeys`; the raw document stays hash-exact).

The `__NEXT_DATA__` redaction behaves conservatively by design: on Apartmentary no key matched (`redactedKeys: []`) and the copy is the served JSON.

## 7. Corrections made after the independent review

See `06-independent-review.md` for the findings. Seven code changes landed for the BLOCKER and MAJOR items, all inside `src/source-package/` plus the smoke suite: redaction of every persisted URL surface (`redactUrlText` / `redactSrcsetText` / `redactCssUrls` / `redactAttributeRecord`, applied in `assetFor`, owner attributes, initiators, `location`, source/document URLs); credential stripping always returned; Google `measurement/*` and other beacon paths as ANALYTICS plus query-drop for site-external API hosts (`isSameSite`); `document.adoptedStyleSheets` walked as `adopted` entries; open shadow roots counted and reported; second-pass CSSOM identity check by href; hermetic smoke suite (embed host routed to a loopback stub). Schema additions are all optional (`redaction.credentialsStripped`, `runtimeDom.shadowRoots`), so packages written earlier still load.
