# 02. Source Package — Artifact Schema (Phase 1)

Date: 2026-09-15 · Schema: `SOURCE_PACKAGE_SCHEMA_VERSION = 1` · Code: `src/source-package/types.ts`

## 1. What a Source Package is

The structured record of what ONE browser load of ONE public page received: the initial network document (raw bytes as served), the runtime DOM snapshot, every stylesheet/style source as SOURCE MATERIAL, the scripts the page declared and the chunks it loaded, an asset inventory, a bounded network dependency map, and page-delivered runtime config — each entry classified conservatively.

It is capture evidence, not a promise. `LOCALIZABLE` means "downloadable and re-hostable after URL rewriting by the look of it"; no entry claims to be independently executable (`ScriptEntry.executionIndependence` is the literal `"unknown"` in Phase 1).

## 2. Location (reuses the observation run layout)

```
data/<host>/<run-id>/                         (pnpm observe)   — or —
data/<host>/site-observations/<run-id>/pages/<page-id>/   (pnpm observe:site)
  observation.json                    ← viewports.<id>.sourcePackage = pointer (optional)
  viewports/<id>/
    rendered.html, dom.json, styles.json, assets.json, links.json, frames.json,
    screenshot.png, document-response.html            (unchanged)
    source-package/                                    ← NEW, one per LOAD
      manifest.json
      document/response.html          raw main-document bytes as served
      document/runtime.html           page.content() after load/settle
      styles/manifest.json  + st0001.<sha12>.css, st0007.cssom.<sha12>.css …
      scripts/manifest.json + sc0001.<sha12>.js …
      assets/manifest.json            inventory only (no downloads)
      network/manifest.json + n0031.<sha12>.<ext>  (bodies no style/script owns)
      config/manifest.json  + cf0001.<sha12>.json …
```

One package per viewport load, because "what this load received" is the honest unit (different UA, possibly different chunks and DOM). A cross-viewport merge is a derived view for Phase 2.

## 3. Root manifest (`manifest.json`)

| Field | Content |
|---|---|
| `schemaVersion`, `packageKind` | `1`, `"web-recon-source-package"` |
| `source` | `requestedUrl`, `finalUrl`, `origin`, `capturedAt`, `route{host,pathname,search}`, `pageId?`, `viewportId`, `viewport{width,height,isMobile,deviceScaleFactor}`, `engine` |
| `observationWindow` | `startedAt`, `endedAt`, `durationMs`, description of the load window (recorder attached before navigation, stopped after the runtime DOM snapshot) |
| `document.initial` | status (`captured` / `unavailable` / `too-large` / `not-html` / `error`), `httpStatus`, `contentType`, `bytes`, `sha256`, `charset`, `declaredCharset`, `file` |
| `document.runtimeDom` | `captured`, `file`, `bytes`, `sha256`, note "DOM snapshot only" |
| `document.initialInventory` | parse5 counts over the served bytes: scripts, inline scripts, stylesheet links, style tags, preload, modulepreload |
| `limits` | every cap in force (see §8) |
| `bodyPolicy` | which response bodies were kept (`script`, `stylesheet` true; `font`, `image`, `media`, `json`, `other` false by default) |
| `evidence` | `initiator: cdp-available|cdp-unavailable`, `initialDocumentWitness: parsed|unavailable`, `directFetchFallback: enabled|disabled` |
| `counts` | styles / scripts / assets / network / config / byPreservability (§7) |
| `accounting` | `captured`, `skippedBySize`, `skippedByPolicy`, `failed`, `unavailable` — each `{count, bytes}` |
| `frameworkEvidence` | generic detections (`next.js`, `emotion (CSS-in-JS)`, …) with the evidence string |
| `files` | paths of the five sub-manifests |
| `contentHash` | sha256 over sorted `<url>\t<sha256>` lines of every captured blob + the document hash — stable across runs of an unchanged source |
| `limitations` | human-readable list, always present |

## 4. Sub-manifests

### styles/manifest.json — `StyleEntry[]`
`id` (`st0001`…, `document.styleSheets` order, `@import` children appended), `order`, `sourceType` (`linked` / `style-tag` / `cssom-runtime` / `adopted` / `import`), `url`, `sameOrigin`, `ownerTag`, `media`, `title`, `disabled`, `declaredIn` (`initial-document` / `runtime-injected` / `unknown`), `ownerAttributes`, `runtimeStyleMarkers` (`data-emotion`, `data-styled`, …), `cssom` (`readable`, `error`, `ruleCount`, `styleRules`, `mediaRules`, `containerRules`, `supportsRules`, `layerRules`, `importRules`, `fontFaceRules`, `keyframesRules`, `customPropertyDeclarations`, `mediaConditions[]`, `layerNames[]`, `walkCapHit`), `network{requestId,status,contentType}`, `methods{cssom, networkBody, directFetch, styleTagText}` (what each capture method produced), `authored` (BlobRef: raw bytes — network body, direct fetch, or the `<style>` text node), `cssomSerialized?` (BlobRef: CSSOM `cssText` — parser-normalized, NOT resolved to px), `rawBytesAvailable`, `preservability`, `reasons[]`.

Cascade evidence carried: sheet order, media attribute, `@layer` names, `@import` parent (`reasons`), `declaredIn`, and CSS-in-JS marker attributes. Not claimed: a full cascade reconstruction.

### scripts/manifest.json — `ScriptEntry[]`
`id` (`sc0001`… DOM order, then runtime-loaded chunks sorted by URL), `order?`, `inline`, `src`, `sameOrigin`, `kind` (`classic` / `module` / `nomodule` / `other`), `typeAttr`, `async`, `defer`, `crossorigin`, `integrity`, `referrerpolicy`, `nonceUsed` (value never stored), `declaredIn` (`initial-document` / `runtime-injected` / `runtime-loaded` / `unknown`), `network{requestId,status,contentType,initiatorType,initiatorUrl,loaded}`, `body` (BlobRef), `downloadable`, `executionIndependence: "unknown"`, `dependencyClass`, `thirdParty`, `providerHint`, `preservability`, `reasons[]`.

Data script tags (`application/json`, `ld+json`, `importmap`, …) are NOT here; they are config entries (§ config).

### assets/manifest.json — `AssetEntry[]` + `inlineSvg{count,bytes}` + `fontsLoaded[]`
`kind` ∈ image, srcset-candidate, picture-source, background-image, mask-image, svg-external, svg-use, object-embed, font-face, font-loaded, video, video-source, video-poster, audio, audio-source, iframe, link. Fields: `url`, `scheme` (http/https/data/blob/…), `sameOrigin`, `host`, `elementPath` (structural `tag[i]>…`, never a node id), `attributes` (`srcset`, `sizes`, `currentSrc`, `loading`, `naturalWidth/Height`, `autoplay/muted/loop/playsinline/controls`, `family/weight/style/display/unicodeRange/srcRaw`, `allow/sandbox/srcdocBytes`, …), `dataUrl{mediaType,bytes}`, `sheetHref` (for `@font-face` relative resolution), `network{requestId,status,contentType,bytes}` when the load fetched it, `providerHint`, `dependencyClass`, `thirdParty`, `preservability`, `reasons[]`. Sorted by (kind order, url, elementPath); ids assigned after sorting.

### network/manifest.json — `NetworkEntry[]`, `ordering: "url,method,seq"`
`id` (`n0001`… = arrival order), `seq`, `url` (redacted, see §6), `redaction`, `method`, `resourceType` (Playwright), `frame` (main / child / service-worker / unknown), `frameOrigin`, `navigation`, `sameOrigin`, `host`, `redirectedFrom`, `status`, `statusText`, `ok`, `failed`, `fromServiceWorker`, `headers` (allowlisted only), `hasPostData`, `postDataBytes`, `initiator{type,url,lineNumber,stackTopUrl}` (CDP), `timing{startedAtMs,responseEndMs}`, `dependencyClass`, `thirdParty`, `providerHint`, `apiLike`, `preservability`, `reasons[]`, `body` (BlobRef).

### config/manifest.json — `ConfigEntry[]`
`kind` ∈ next-data, json-script, ld-json, importmap, speculationrules, data-script, window-global, root-data-attributes, meta-generator, base-href, preload-link, modulepreload-link, manifest-link. Fields: `name`, `typeAttr`, `url`, `attributes`, `declaredIn`, `parseable`, `redactedKeys[]`, `body` (BlobRef), `preservability`, `reasons[]`.

## 5. BlobRef

`{ status, file?, bytes?, sha256?, contentType?, reason? }` with `status` ∈ `captured` / `skipped-by-policy` / `skipped-by-size` / `unavailable` / `failed` / `not-applicable`. A `captured` ref always names a file inside the package whose name carries the first 12 hex of its sha256.

## 6. Privacy rules (structural)

- Request headers are never read. Response headers are read one at a time from `SAFE_RESPONSE_HEADERS` (content-type, content-length, content-encoding, cache-control, last-modified, etag, vary, access-control-allow-origin, cross-origin-resource-policy, content-security-policy, x-content-type-options, timing-allow-origin, location). `allHeaders()` is never called.
- POST bodies are never read; only `postDataBytes`.
- URL query values whose key matches `SENSITIVE_QUERY_KEY_PATTERN` (token, key, auth, session, sig, password, …) become `[redacted]`; ANALYTICS-class URLs lose their whole query.
- Window globals are limited to `RUNTIME_CONFIG_WINDOW_GLOBALS` (`__NEXT_DATA__`, `__NUXT__`, `__INITIAL_STATE__`, `__PRELOADED_STATE__`, `__APOLLO_STATE__`, `__remixContext`, `__REDUX_STATE__`, `__APP_CONFIG__`, `__RUNTIME_CONFIG__`, `__ENV__`); secret-shaped keys inside them, and inside the COPY of JSON script blobs, are redacted and listed in `redactedKeys`.
- The initial document is stored as served (hash-exact); this is stated in `limitations`.
- API/data and analytics bodies are never captured.

## 7. Vocabularies

Dependency class: `DOCUMENT`, `STATIC_ASSET`, `JS_CHUNK`, `CSS`, `FONT`, `IMAGE`, `MEDIA`, `API_DATA`, `EMBED`, `ANALYTICS`, `UNKNOWN` (+ `thirdParty` flag, so "third-party N" is derivable).

Preservability: `PRESERVABLE`, `LOCALIZABLE`, `EXTERNAL_EMBED`, `ORIGIN_BOUND`, `STATEFUL_RUNTIME`, `UNAVAILABLE`, `UNKNOWN`. Rules live in `src/source-package/classify.ts` (`classifyPreservability`, `classifyEmbedUrl`); every entry carries `reasons[]`.

## 8. Limits (defaults, all reported in the manifest)

| Limit | Default |
|---|---|
| maxScriptBodyBytes / maxStylesheetBodyBytes / maxOtherBodyBytes | 4 MiB / 2 MiB / 2 MiB |
| maxTotalScriptBytes / maxTotalStylesheetBytes | 32 MiB / 8 MiB |
| maxInlineTextBytes / maxTotalInlineTextBytes | 1 MiB / 8 MiB |
| maxNetworkEntries | 2,000 (overflow counted in `counts.network.overflowNotRecorded`) |
| maxInventoryEntries (per category) | 2,000 |
| maxElementsWalked (background/mask images) | 20,000 |
| maxRulesPerSheet (CSSOM walk) | 20,000 |
| maxDirectFetchSheets / directFetchTimeoutMs | 16 / 10 s |
| Observation window | the observer's own load window (nav → load → network-idle ≤ 8 s → settle); no extra crawl |

## 9. Pointer embedded in `observation.json`

`viewports.<id>.sourcePackage` (optional): `{ schemaVersion, dir, manifest, bytes, fileCount, contentHash, counts{styles, stylesRawCaptured, scripts, scriptResponsesCaptured, assets, network, config}, initialDocument, runtimeDom }`; `sizes.sourcePackageBytes` is added to `viewportTotalBytes`. Observer `SCHEMA_VERSION` stays 5 — the field is additive and optional.
