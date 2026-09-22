# 01 — Existing network/body capture system (Phase 1 read-only inventory)

Scope: what Phase 1 (Source Package Capture, `src/source-package/`) actually implements today,
for judging reuse toward capturing real public API request/response bodies. Read-only research;
no code changed. Every claim below is cited to `file:line`; anything not evidenced in the repo is
marked UNKNOWN.

## Request observation

- `attachSourceRecorder()` in `src/source-package/recorder.ts:141` attaches Playwright `Page`
  listeners **before navigation** (its own doc comment says a response arriving before the
  listener exists cannot be recovered — `recorder.ts:12-14`).
- Listeners: `page.on("request", onRequest)`, `"response"`, `"requestfailed"`,
  `"requestfinished")` — `recorder.ts:426-429`.
- `onRequest` (`recorder.ts:209-285`) captures: url, method, resourceType (Playwright's own
  classification), frame (`main`/`child`/`service-worker`/`unknown`, `recorder.ts:226-238`),
  `navigation` flag (`request.isNavigationRequest()`), `redirectedFrom`, `hasPostData` +
  `postDataBytes` (byte length only — see Privacy below), `startedAtMs`.
- A hard cap `limits.maxNetworkEntries` (default 2,000, `types.ts:74`) is enforced at the request
  stage: once `entries.length >= limits.maxNetworkEntries`, further requests are only counted as
  `stats.overflowNotRecorded` and never recorded (`recorder.ts:212-215`).
- **Request headers are never read anywhere in this module** (stated in the module doc comment,
  `recorder.ts:19-21`, and structurally true — no `request.headers()`/`allHeaders()` call exists
  in `recorder.ts`).
- **Request/POST bodies are never read.** Only `request.postDataBuffer().byteLength` is kept
  (`recorder.ts:252-262`); the buffer itself is discarded.

## Response observation

- `onResponse` (`recorder.ts:300-397`) is pushed onto a `pending: Promise<void>[]` array and
  awaited (`Promise.allSettled(pending)`) inside `finish()` (`recorder.ts:440`) so the recorder
  never returns before in-flight body reads settle.
- Response status, statusText, `fromServiceWorker()` are captured (`recorder.ts:308-318`).
- Redirects (3xx) are marked `body: {status: "not-applicable", reason: "redirect"}` and skipped
  (`recorder.ts:321-324`).
- Child-frame / service-worker responses are **never body-captured** — `skipped-by-policy` always
  (`recorder.ts:325-329`).
- The main navigation document is explicitly **not** captured here; a comment says it is captured
  separately (`recorder.ts:330-334`) by `src/observer/navigate-document.ts` (see "body capture
  mechanism" below).
- `onRequestFailed` (`recorder.ts:399-418`) distinguishes a genuine failure from a
  2xx-response-then-aborted-stream case (media range reads, beacons the page navigated away
  from): if a 2xx status was already recorded, the failure text is stored as `entry.streamAborted`
  and the existing `body` decision stands (`recorder.ts:409-414`); otherwise `entry.failed` is set
  and `stats.failed++`.

## Request/response ID scheme

- Every network entry gets `id: pad("n", seq + 1)` — e.g. `n0007` — assigned in
  `src/source-package/capture.ts:1180`, via `pad()` at `capture.ts:122`
  (`` `${prefix}${String(n).padStart(4, "0")}` ``).
- `seq` is 0-based arrival order within the load, assigned at record time:
  `seq: entries.length` in `recorder.ts:264`. The manifest documents this as "Arrival order in
  this load (0-based). Deterministic within a run only." (`types.ts:268`).
- The **persisted** network manifest is NOT in arrival order: `NetworkManifestSchema.ordering`
  is the literal `"url,method,seq"` (`types.ts:727`), and entries are sorted
  `(a,b) => url, then method, then seq` before being written (`capture.ts:1213`,
  `store.ts` writes it verbatim). `seq` is kept as a field precisely so arrival order is still
  recoverable after the sort.
- Style/script/asset/config entries each have their own independent id namespaces from the same
  `pad()` helper: styles `st####` (e.g. `capture.ts` style loop, prefix `"st"` implied by
  `pad("st", ...)` pattern used throughout — confirmed pattern at `store.ts:26` comment
  `st0001.<sha12>.css`), scripts `sc####` (`store.ts:26` comment `sc0001.<sha12>.js`), assets
  `as####` (`capture.ts:1146`), config `cf####` (`store.ts:26` comment `cf0001.<sha12>.json`,
  built via `nextId()` calls e.g. `capture.ts:968`). There is no cross-kind global id; a script
  body and its underlying network entry are linked by `requestId: pad("n", netEntry.seq + 1)`
  (e.g. `capture.ts:689,828,875,1043`), not by sharing an id.

## Response metadata captured

Per `NetworkEntrySchema` (`types.ts:266-307`): `id`, `seq`, `url` (+ optional `redaction`),
`method`, `resourceType`, `frame`, optional `frameOrigin`, `navigation`, `sameOrigin`, `host`,
`redirectedFrom`, `status` (nullable int), `statusText`, `ok`, `failed`, `streamAborted`,
`fromServiceWorker`, `headers` (allowlisted — see below), `hasPostData`, `postDataBytes`,
`initiator`, `timing: {startedAtMs, responseEndMs}`, `dependencyClass`, `thirdParty`,
`providerHint`, `apiLike`, `preservability`, `reasons[]`, `body` (`BlobRefSchema`).

- **Timing** is only two numbers: `startedAtMs` (relative to recorder attach, `recorder.ts:274`)
  and `responseEndMs` (set in `onRequestFailed`/`onRequestFinished`, `recorder.ts:408,423`).
  There is no DNS/connect/TLS/TTFB breakdown — only start and end of the whole request.
- **Headers**: response headers only, and only from a fixed allowlist —
  `SAFE_RESPONSE_HEADERS` (`types.ts:123-137`): `content-type`, `content-length`,
  `content-encoding`, `cache-control`, `last-modified`, `etag`, `vary`,
  `access-control-allow-origin`, `cross-origin-resource-policy`, `content-security-policy`,
  `x-content-type-options`, `timing-allow-origin`, `location`. Read one-by-one via
  `response.headerValue(name)` (`recorder.ts:287-298`); `response.allHeaders()` is never called
  anywhere in the module (stated explicitly, `recorder.ts:20-22`), so `set-cookie` and any custom
  auth header never enters process memory in this path.

## Body capture mechanism

- Bytes come from Playwright's `response.body()` (`recorder.ts:364`), inside the `onResponse`
  handler, wrapped in try/catch (`recorder.ts:362-370`) — on failure, `body: {status:
  "unavailable", reason}` and `stats.bodyUnavailable++`.
- The **main HTML document** is captured through a **separate** mechanism, not the recorder:
  `navigateMainDocumentCapturingBody()` in `src/observer/navigate-document.ts:87-107`, which
  calls `captureDocumentBody()` (`navigate-document.ts:112-155`) on the `Response` object that
  `page.goto()` itself returned (the final, post-redirect attempt) — "no second HTTP request is
  made, and `page.content()` is never used as a substitute" (`navigate-document.ts:83-86`).
  This body is capped separately at `MAX_DOCUMENT_RESPONSE_BYTES = 8 * 1024 * 1024`
  (`src/observer/types.ts:828`) and only accepted when `content-type` matches
  `text/html`/`application/xhtml+xml` (`navigate-document.ts:135-137`); otherwise
  `status: "not-html"`.
- Style bodies additionally have a **direct-HTTP fallback** (`capture.ts` styles section,
  `authored` via `safeFetchAsset`, e.g. `capture.ts:591-599`) used only when neither CSSOM nor the
  network body yielded bytes — routed through the SSRF-hardened fetcher in
  `src/assets/safe-fetch.ts` (see Privacy section).
- All response-derived bodies are hashed at capture time with Node's `createHash("sha256")`
  (`recorder.ts:391`, and independently `capture.ts:120`).

## bodyPolicy

- Type: `SourceBodyPolicy` (`types.ts:89-104`) — nine independent booleans:
  `script`, `analyticsScript`, `stylesheet`, `font`, `image`, `media`, `json`, `other`.
- Default: `SOURCE_BODY_POLICY_DEFAULT` (`types.ts:106-115`) = `script: true,
  analyticsScript: false, stylesheet: true, font: false, image: false, media: false,
  json: false, other: false`.
- It gates **which response bodies are downloaded at all**, keyed by a coarse
  `bodyKindOf(resourceType, contentType)` classifier in `recorder.ts:117-126` (script /
  stylesheet / font / image / media / json / other — **not** the richer `DependencyClass` from
  `classify.ts`). Enforcement point: `recorder.ts:348-352` — `if (!bodyPolicy[kind]) { body =
  {status: "skipped-by-policy", ...}; return; }`.
- `analyticsScript` is checked first and separately (`recorder.ts:336-347`): even with
  `bodyPolicy.script = true`, a script body is skipped if it matches a known
  analytics/tag-manager/ads provider (`matchProvider`) and `analyticsScript` is false.
- **`json: false` by default is the load-bearing fact for this task**: JSON responses (the shape
  most real public API responses take) are classified `kind === "json"` by `bodyKindOf` and, with
  the default policy, are always `skipped-by-policy` — i.e. **Phase 1 as configured never
  downloads API response bodies today.** This is also stated in the schema doc comment: "API/data
  bodies are never kept in Phase 1 (§12)" (`types.ts:87-88`), and independently confirmed by
  `docs/result/source-preservation-phase1/02-source-package-schema.md:85` ("API/data and
  analytics bodies are never captured") and by `docs/result/source-preservation-phase3a/
  04-source-bound-and-api.md:32-41` (four real content XHRs on a live pilot site, "those four
  response bodies were never captured" because "Phase 1's body policy ... is `json: false`").
- `bodyPolicy` is a plain option (`SourceCaptureOptions.bodyPolicy?: Partial<SourceBodyPolicy>`,
  `capture.ts:74`) merged over the default in `resolveSourceCaptureOptions()`
  (`capture.ts:110-118`) — i.e. **the plumbing to turn `json` on already exists**; only the
  default value says no, and turning it on has no distinct cap of its own (see Size limits below —
  json falls into the generic "other" cap, since `perBodyCap`/`totalCap` in `recorder.ts:128-139`
  only special-case `script` and `stylesheet`).

## JSON/text/media classification logic

Two independent classifiers exist, serving different purposes:

1. **`bodyKindOf()`** (`recorder.ts:117-126`) — coarse, used ONLY to pick which `bodyPolicy` flag
   and byte cap applies. JSON is detected by `/json/.test(ct)` on the content-type essence
   (`recorder.ts:124`); everything else falls through to `"other"`.
2. **`classifyRequest()`** (`classify.ts:253-356`) — the rich classifier that assigns
   `DependencyClass` (`DOCUMENT`, `STATIC_ASSET`, `JS_CHUNK`, `CSS`, `FONT`, `IMAGE`, `MEDIA`,
   `API_DATA`, `EMBED`, `ANALYTICS`, `UNKNOWN`) and the `apiLike` boolean. For `xhr`/`fetch`/
   `eventsource`/`websocket` resource types it distinguishes: analytics-shaped (path/host
   pattern match, `ANALYTICS_PATH`/`ANALYTICS_HOST_WORDS`, `classify.ts:215-216`) vs. `API_DATA`
   (content-type matches `json|graphql|xml|text/plain|octet-stream`, or `API_PATH` pattern
   matches the URL path, or the HTTP method is not `GET` — `classify.ts:300-303`) vs. a fetch that
   actually returned a script (`JS_CHUNK`, `classify.ts:304-306`). `API_PATH` regex:
   `/(^\/api\/|\/api\/|\/graphql|\/_next\/data\/|\/wp-json\/|\/rest\/|\/rpc\b|\/v[0-9]+\/|\.json(\?|$))/i`
   (`classify.ts:219`).
3. These two classifiers are **not unified**: a JSON API response is `dependencyClass: API_DATA,
   apiLike: true` in the persisted manifest, but its body was gated by the coarser
   `bodyKindOf() === "json"` check against `bodyPolicy.json`, independently of `apiLike`.

## Size limits

All in `SourceCaptureLimits` (`types.ts:37-64`), defaults in `SOURCE_CAPTURE_LIMITS_DEFAULT`
(`types.ts:66-80`):

| limit | default | enforced at |
|---|---|---|
| `maxScriptBodyBytes` | 4 MiB | `recorder.ts:129` (`perBodyCap`) |
| `maxStylesheetBodyBytes` | 2 MiB | `recorder.ts:130` |
| `maxOtherBodyBytes` | 2 MiB | `recorder.ts:131` (covers font/image/media/**json**/other) |
| `maxTotalScriptBytes` | 32 MiB | `recorder.ts:135` (`totalCap`) |
| `maxTotalStylesheetBytes` | 8 MiB | `recorder.ts:136` |
| (other-kind total cap) | `max(32 MiB, 8 MiB)` = 32 MiB, shared across font/image/media/json/other | `recorder.ts:137-138`, explicitly "a conservative ceiling" |
| `maxNetworkEntries` | 2,000 | `recorder.ts:212-215` (request-count cap; excess = `overflowNotRecorded`, never even recorded) |
| `maxInlineTextBytes` / `maxTotalInlineTextBytes` | 1 MiB / 8 MiB | inline script/style/config text, not network bodies |
| `maxDirectFetchSheets` / `directFetchTimeoutMs` | 16 / 10,000 ms | direct-HTTP CSS fallback only |
| `MAX_DOCUMENT_RESPONSE_BYTES` (separate constant, main doc only) | 8 MiB | `src/observer/types.ts:828`, enforced `navigate-document.ts:145-149` |

Enforcement order for a body (`recorder.ts:353-383`): declared `content-length` checked against
per-body cap BEFORE reading bytes (fails fast without downloading, `recorder.ts:356-361`); then
after `response.body()` resolves, actual byte length is checked against the same per-body cap
(`recorder.ts:372-377`); then the running per-kind total is checked against the total cap
(`recorder.ts:378-383`). Every skip records a `reason` string and increments `stats.skippedBySize`
/ `stats.skippedBySizeBytes` — nothing is silently truncated (mirrors the design comment at
`types.ts:34`, "every cap is REPORTED in the manifest; nothing is truncated silently").

## MIME/content-type detection logic

- No sniffing of bytes: content-type comes solely from the response's `content-type` header,
  read through the allowlisted `readSafeHeaders()` (`recorder.ts:287-298`) and reduced to its
  "essence" (stripped of `; charset=...` etc.) by `essence()`/inline equivalents
  (`classify.ts:249-251`, `recorder.ts:118`).
- Fallback to `resourceType` (Playwright's own MIME-derived classification) when content-type is
  absent or ambiguous, throughout both `bodyKindOf()` and `classifyRequest()`.
- The main document has its own charset-decode path: `decodeCapturedBody()` /
  `detectCharset()` in `src/observer/document-charset.ts` (re-exported from
  `navigate-document.ts:14`), producing `charset` and `declaredCharset` fields recorded in
  `SourceDocumentRecordSchema.initial` (`types.ts:550-551`). Not read in full here — file exists
  and is imported by `capture.ts:3`; UNKNOWN beyond that (out of the primary read list).

## Body file storage

Documented layout (`store.ts:16-32`, matches implementation):

```
<dir>/                       viewports/<id>/source-package inside an observation
  manifest.json              root manifest: source, document, limits, counts, hash
  document/response.html     initial network document, RAW bytes as served
  document/runtime.html      runtime DOM snapshot (page.content())
  styles/manifest.json  + st0001.<sha12>.css …
  scripts/manifest.json + sc0001.<sha12>.js …
  assets/manifest.json       inventory only (no downloads in Phase 1)
  network/manifest.json + n0007.<sha12>.<ext>  (bodies no style/script entry already owns)
  config/manifest.json  + cf0001.<sha12>.json …
```

- `writeSourcePackage()` (`store.ts:62-100`) validates every manifest with its zod schema before
  writing, `rm`s the target directory first ("a package is written whole", `store.ts:73-75`,
  preventing stale blobs from a previous run at the same path), then writes each `SourceBlob`
  (`{file, data: Buffer}`) via `writeFile` and every manifest via `stableStringify()`
  (deep-sorted-keys JSON, `store.ts:34-51`) so two captures of an unchanged page diverge only
  where the evidence itself differs.
- Blob filenames embed a short content hash (`<sha12>` = presumably first 12 hex chars of the
  sha256, per the comment convention in `store.ts:23-27`; exact truncation site is inside
  `capture.ts`'s blob-naming helpers, e.g. `inlineBlob`/`networkBlob` at `capture.ts:501-522` —
  not fully traced to a `.slice(0,12)` call in this pass; treat as UNKNOWN exact truncation length
  beyond the doc-comment convention `st0001.<sha12>.css`).
- Network bodies that are **not already owned** by a style or script entry (i.e. plain
  `network/n####.<ext>` files) are written via `networkBlob("network", pad("n", e.seq+1), e,
  "bin")` (`capture.ts:1159`) — this is the path a captured JSON API body would land on if
  `bodyPolicy.json` were enabled and the response were neither `stylesheet` nor `script`
  resourceType.

## sha256 / content hashing

- Every captured blob is sha256-hashed at the moment its bytes are read:
  `sha256: createHash("sha256").update(data).digest("hex")` (`recorder.ts:391`, and the shared
  helper `sha256()` at `capture.ts:120`, also used for inline text `capture.ts:509` and network
  blobs `capture.ts:519`).
- The main document body is separately hashed in `navigate-document.ts:150`
  (`createHash("sha256").update(body).digest("hex")`).
- A package-level `contentHash` (`SourcePackageManifestSchema.contentHash`, `types.ts:694-699`) is
  computed as `sha256` over sorted `"<url or id>\t<sha256>"` lines covering the initial document
  plus every captured style and script body (`capture.ts:1304-1310`) — **note this rollup only
  walks styles and scripts, not the generic `network/` blobs or config blobs**, per the loop at
  `capture.ts:1306-1308` (`for (const s of styles)`, `for (const s of scripts)` — no equivalent
  loop over `networkEntries` or `config`). This means a captured API/JSON body (were the policy
  turned on) would **not** currently feed into `contentHash`, though its own per-entry
  `body.sha256` would still be recorded in `network/manifest.json`.

## Initiator evidence

- Comes from a CDP `Network.requestWillBeSent` listener, Chromium-only (module comment,
  `recorder.ts:26-29`), opened via `page.context().newCDPSession(page)` (`recorder.ts:174`).
- `CdpInitiatorRecord {type, url?, lineNumber?, stackTopUrl?}` (`recorder.ts:108-113`) captured
  from the CDP event's `initiator` object and the top frame of its call stack
  (`recorder.ts:175-190`).
- Joined to Playwright's own request records **at `finish()` time**, matched FIFO by URL
  (`takeInitiator()`, `recorder.ts:202-206`, joined at `recorder.ts:442-445`) — explicitly because
  "the CDP event for a request can arrive AFTER Playwright's own `request` event, so joining here
  would race" (comment at `recorder.ts:280-281`).
- Best-effort: on any failure opening the CDP session, `initiatorEvidence = "cdp-unavailable"` and
  every entry simply lacks `initiator` (`recorder.ts:192-200`); this is recorded in the manifest
  as `evidence.initiator: "cdp-available" | "cdp-unavailable"` plus optional
  `initiatorReason` (`types.ts:679-680`).
- Initiator URLs are redacted before persistence (`redactInitiator()`, `capture.ts:20-26`).

## Network manifest

- `NetworkManifestSchema` (`types.ts:723-729`): `{schemaVersion, viewportId, ordering:
  "url,method,seq", entries: NetworkEntry[]}`.
- Built in `capture.ts:1149-1213` by iterating every `RecordedRequest` from the recorder, running
  it through `classifyRequest()` + `redactUrl()` + `classifyPreservability()`, resolving its body
  (reusing a style/script blob already written for the same `seq` via
  `blobFileByNetworkSeq.get(e.seq)`, `capture.ts:1155-1167`, or capturing a fresh `network/n####`
  blob), then sorted deterministically (`capture.ts:1213`) and written to
  `network/manifest.json` via `writeSourcePackage()` (`store.ts:96`).
- Aggregate `counts.network` block in the root manifest (`types.ts:610-620`): `total`,
  `overflowNotRecorded`, `byClass` (per `DependencyClass`), `sameOrigin`, `thirdParty`, `apiLike`,
  `bodiesCaptured`, `failed`, `childFrame` — computed at `capture.ts:1265-1274`.

## Relationship between network manifest and asset manifest

- They are **separate, non-overlapping enumerations built from different sources**: the asset
  manifest (`AssetsManifestSchema`, `types.ts:714-722`) comes from the **in-browser DOM walk**
  (`inventory-in-browser.ts`, e.g. `<img>`, `background-image`, `<video>`, `<iframe>` etc. —
  `AssetKindSchema`, `types.ts:427-446`), while the network manifest comes from the **recorder's**
  observed HTTP traffic. They are cross-referenced, not merged: an `AssetEntry` carries an
  optional `network: {requestId, status, contentType, bytes}` (`types.ts:463-470`) pointing at the
  matching network entry's id, and asset network bodies are explicitly **never downloaded** in
  Phase 1 — "assets/manifest.json inventory only (no downloads in Phase 1)" (`store.ts:25`,
  `types.ts:82-88`). So an image referenced in the DOM shows up in BOTH manifests (as an
  `AssetEntry` with no body, and as a `NetworkEntry` whose own `body` is governed by
  `bodyPolicy.image`, default `false`) but bytes for it are stored in neither place by default.
- Styles/scripts sit in a third relationship: their own manifests (`StyleEntry`/`ScriptEntry`)
  each carry a `network: {requestId, status, contentType, ...}` back-reference too
  (`types.ts:354-360`, `400-409`), and when a style/script body IS captured, the same physical
  blob file is what the network manifest's corresponding entry also points to — achieved via the
  `blobFileByNetworkSeq` map so the bytes are written once and referenced from both places
  (`capture.ts:576,755,799,859,1155-1157`).

## Request normalization/canonicalization logic

- URL redaction/normalization lives in `classify.ts`: `redactUrl()` (`classify.ts:48-77`) strips
  embedded credentials (`user:pass@`) unconditionally, replaces sensitive query **values** (not
  keys) matching `SENSITIVE_QUERY_KEY_PATTERN` (`types.ts:145-146`) with `[redacted]`, or drops
  the entire query string when `dropQuery` is requested (analytics-classified or
  site-external-API-classified traffic, decided in `classifyRequest()`, `classify.ts:344-347`).
- `registrableDomain()` / `isSameSite()` (`classify.ts:133-148`) implement a simplified
  (non-PSL) same-site comparison used to decide whether a same-site API keeps its query string vs.
  a cross-site one gets it dropped (`classify.ts:344-347`).
- No general request **coalescing/dedup** logic was found (e.g. no merging of repeated identical
  GETs); every observed request becomes its own `NetworkEntry`. UNKNOWN whether retries/duplicate
  requests are collapsed anywhere else in the pipeline — not evidenced in the read files.
- No query-parameter canonical ordering / cache-key normalization exists — the URL is redacted but
  otherwise kept as observed (verbatim spelling preserved when nothing needed redaction,
  `classify.ts:74`).

## Privacy/auth filtering already present

- **Request headers**: never read at all (`recorder.ts:19-21`, structurally — no call site exists).
- **Response headers**: allowlist-only via `SAFE_RESPONSE_HEADERS` (`types.ts:123-137`); anything
  else (cookies, `authorization`, custom auth/fingerprint headers) is never read, since
  `response.allHeaders()` is never invoked (`recorder.ts:20-22`, and no such call found in the
  file).
- **Cookies/storage/browser context**: explicitly untouched (`recorder.ts:23`); no code path in
  the read files accesses `context.cookies()` or storage state.
- **POST bodies**: never read; only byte length via `postDataBuffer().byteLength`
  (`recorder.ts:252-262`).
- **URL secrets**: query values matching `SENSITIVE_QUERY_KEY_PATTERN` (token/auth/session/key/
  secret/signature/password/credential/bearer/jwt/csrf/nonce-shaped keys, `types.ts:145-146`) are
  redacted to `[redacted]` wherever a URL is persisted — enforced not just on the primary
  `url`/`src` fields but also on `srcset`, CSS `url()`, and generic attribute records via
  `redactUrlText`/`redactSrcsetText`/`redactCssUrls`/`redactAttributeRecord`
  (`classify.ts:87-126`), per the "Review B1" note that every persisted URL surface goes through
  redaction, not only dedicated url fields.
- **Window-global config values**: keys matching `SENSITIVE_CONFIG_KEY_PATTERN`
  (`types.ts:152-153`) are redacted inside captured hydration-state JSON (`__NEXT_DATA__` etc.),
  with only an allowlist of framework globals ever read (`RUNTIME_CONFIG_WINDOW_GLOBALS`,
  `types.ts:160-171`); evidence of the key's presence is kept, its value is not
  (`types.ts:148-153`, corroborated by `docs/result/source-preservation-phase1/
  03-implementation.md:93`, "`apiToken`-shaped keys → `[redacted]`").
- **Domain skipping**: no explicit "skip this domain" denylist was found in the read files for
  network *recording* itself (every request up to the 2,000-entry cap is recorded regardless of
  host) — filtering happens at the **body-download** stage via `bodyPolicy` and provider
  detection (`matchProvider`, `classify.ts:160-212`), not by refusing to record the request's
  metadata. UNKNOWN whether any separate allow/deny host list exists elsewhere in the observer
  pipeline outside the files read for this task.
- **SSRF hardening** applies only to the **direct-HTTP fallback fetcher** used for stylesheets
  (and, per Task 22 memory, general asset materialization) — `src/assets/safe-fetch.ts:1-24`:
  http/https only, credential-bearing URLs rejected, port allowlist (default 80/443), DNS
  pre-resolution with every resolved address checked against private/reserved ranges before
  connecting, the same resolution reused for the actual socket (anti-TOCTOU), manual redirect
  following with full re-validation per hop, streamed byte-count cap, content-type validation
  against the expected asset kind, and an overall deadline. This hardening does **not** apply to
  the recorder's `response.body()` path (`recorder.ts:364`), because that path never issues its
  own HTTP request — it reads the body of a request the browser already made.

## Existing replay helpers

- **None found for network bodies in `src/`.** `page.route()` / `context.route()` occurrences in
  the codebase are for unrelated purposes: aborting all network for offline/CSS-only checks
  (`src/reconstruction/layout-truth-check.ts:1862-1863` and 5 similar sites; `scripts/
  smoke-layout-safety.ts:2479-2480,6032-6033`), a fail-closed allow-list router in
  `src/interaction-explorer/safety-guards.ts:81`, serving generated CSS in
  `src/responsive-qa/continuous/session.ts:117`, and stubbing a single YouTube iframe URL in the
  Phase 1 smoke test `scripts/smoke-source-package.ts:157`. None of these read a Source Package's
  captured `network/n####.*` blob and serve it back to a page.
- **A route.fulfill-based "replay" mechanism DOES exist**, but only inside **one-off experiment
  harnesses under `tmp/`, not in `src/`**: `tmp/source-preservation-phase3b{,1}/run.mjs`,
  `tmp/source-preservation-phase3c/run.mjs`, `tmp/source-preservation-phase3c1-strategy-b/
  run.mjs` + `lib/local-mirror.mjs`. Per the Phase 3A/3C/3C.1 docs read for this task
  (`docs/result/source-preservation-phase3a/05-replay-feasibility.md:57-58`; `docs/result/
  source-preservation-phase3c/07-network-and-integrity.md:21-22`; `docs/result/
  source-preservation-phase3c1-strategy-b/09-network-integrity.md:10-13`), those harnesses
  install a `context.route` router that fulfills the four Apartmentary API endpoints from
  **hand-written synthetic JSON fixtures**, not from any Phase 1 captured body — because, per
  §12/`bodyPolicy.json=false`, no real captured body existed to replay. These harnesses are
  experiment-scoped (site-specific selectors/config in `experiment-config.json` per the
  genericity-guard note, `09-network-integrity.md:90-94`) and were never merged into
  `src/source-package/` or any other production module.
- Conclusion: **Phase 1 has no code path, in `src/`, that takes a captured `BlobRef`/body and
  serves it back over the network to a page.** UNKNOWN whether any such helper exists outside the
  files/areas read for this task.

---

## 1. What can be reused for public API body capture?

- **`attachSourceRecorder()` / `SourceRecorder.finish()`** (`src/source-package/recorder.ts:141-466`)
  — the whole request/response observation loop, ID scheme, timing, header allowlisting, and
  failed-vs-stream-aborted distinction is generic to any request, already includes `xhr`/`fetch`
  in what it observes (it doesn't discriminate by resource type at the listener level), and needs
  no change to *observe* API traffic — only `bodyPolicy.json` needs to be `true` to *keep* the
  bytes.
- **`bodyKindOf()` + `bodyPolicy` plumbing** (`recorder.ts:117-139`, `types.ts:89-115`) — the
  size-capped, policy-gated body-download mechanism (per-body cap, running per-kind total cap,
  declared-length fast-fail, reported skip reasons) is exactly the shape a bounded API-body
  capture needs; enabling it for JSON is a policy-default flip plus (per the gap below) probably a
  dedicated cap rather than reuse of the shared "other" bucket.
- **`classifyRequest()` / `API_DATA` + `apiLike` classification** (`src/source-package/
  classify.ts:253-356`) — already identifies API-shaped traffic by content-type, path pattern
  (`API_PATH`), and non-GET method, and already separates it from analytics-shaped traffic; this
  is the natural place to key a future "is this a public API worth capturing" decision.
- **`redactUrl()` / `redactUrlText()` / `SENSITIVE_QUERY_KEY_PATTERN`** (`classify.ts:17-126`,
  `types.ts:145-146`) — token/secret query-value redaction, credential stripping, and same-site
  query-drop logic (`isSameSite`, `classify.ts:145-148`) are directly reusable for sanitizing
  captured API URLs.
- **sha256 content-addressing + `store.ts` persistence layout** (`recorder.ts:391`, `store.ts:
  62-100`) — the manifest/blob-on-disk pattern (`network/n####.<sha>.<ext>` +
  `network/manifest.json`) already accepts arbitrary captured network bodies; a captured JSON body
  would land in exactly this path today if the policy allowed it (`capture.ts:1159`).
- **`SAFE_RESPONSE_HEADERS` allowlist + never-read-request-headers/cookies contract**
  (`types.ts:123-137`, `recorder.ts:19-24`) — the existing privacy boundary is a sound base to
  extend for API responses, since it already never touches `set-cookie`, `authorization`, or any
  request header.
- **`safeFetchAsset` SSRF hardening** (`src/assets/safe-fetch.ts`) — reusable if a future capture
  path needs to *fetch* an API response directly (rather than only observing the browser's own
  requests), the same way it is already reused for the stylesheet direct-fetch fallback.

## 2. What is actually missing?

- **No captured real API bodies exist anywhere in the evidence today.** `bodyPolicy.json = false`
  by default and (per the Phase 3A/3C docs) has never been observed turned on for a real site —
  `docs/result/source-preservation-phase3a/04-source-bound-and-api.md:32-41` states this as the
  Phase 3 blocker outright. There is no prior run to learn "does turning it on work" from.
- **No dedicated size cap for API/JSON bodies.** `perBodyCap`/`totalCap` (`recorder.ts:128-139`)
  only special-case `script` and `stylesheet`; json/font/image/media/other all share
  `maxOtherBodyBytes` (2 MiB default) and a shared, comment-flagged-as-approximate total ceiling
  (`recorder.ts:137-138`, "a conservative ceiling"). A real API body policy would need its own
  `maxJsonBodyBytes`/`maxTotalJsonBytes` (or equivalent) rather than sharing this bucket with
  fonts/images/media.
- **No request-body (POST payload) capture at all.** Only byte length is kept
  (`recorder.ts:252-262`); many real APIs are POST/GraphQL with meaningful request bodies
  (queries, mutations, parameters) that determine the response — none of that is preserved, so a
  captured response body cannot be matched back to what request produced it beyond method + URL +
  timing.
- **No request-header capture at all**, including headers that determine API response content
  (`Accept-Language`, custom `X-*` API version headers, `Authorization` itself). The system is
  explicitly designed never to read these (privacy-by-construction), which is safe but also means
  a captured API body has no record of what request context produced it.
- **`contentHash` rollup excludes network/config blobs** (`capture.ts:1306-1310` only walks
  `styles`/`scripts`) — a newly-enabled captured API body's bytes would not affect the
  package-level content hash even though the bytes are on disk, which is a correctness gap for any
  "did the API response change" comparison workflow.
- **No replay/mocking mechanism in `src/`.** As documented above, the only `route.fulfill`-based
  replay that exists in this repo is site-specific, fixture-based (not fed from captured bytes),
  and lives in throwaway `tmp/` experiment harnesses, not integrated into `src/source-package/` or
  any other production module. Serving a captured API body back to a running page (for the stated
  future goal — reusable public API replay) would be new code.
- **No shape/schema recording for API responses.** Nothing here records JSON structure, GraphQL
  operation name, or response envelope shape — only raw bytes + content-type would be captured
  under the existing mechanism. Downstream consumers (e.g. a future replay server) would need to
  parse the raw JSON blob from scratch each time; there's no indexed-by-endpoint or
  indexed-by-operation view, only the flat `network/manifest.json` array sorted by
  `url,method,seq`.
- **No pagination/parameterization awareness.** `classifyRequest()`'s query-drop logic
  (`classify.ts:340-347`) is a privacy measure, not an API-identity measure; there is no concept of
  "this GET with these query params is a distinct cacheable endpoint variant" versus "this is the
  same endpoint, different noise" — relevant if multiple real requests to the same API path with
  different pagination/params need to be captured and later replayed distinctly.
- **No safety/rate-limit consideration for calling a real API repeatedly.** The whole system as
  read is a **passive observer** of whatever the browser does during one page load; there is no
  mechanism here for deliberately, safely, and boundedly *driving* additional real API calls
  (e.g. paging through results) — that would be new capture-orchestration logic, not present in
  any file read for this task.
- **Auth/session handling for authenticated APIs is entirely absent by design** (cookies, storage,
  `Authorization` headers are all structurally unreadable here) — reasonable for *public* API
  capture as scoped, but explicitly means this system cannot, as built, capture anything requiring
  auth without a deliberate, separate design decision (out of scope for this read-only report).
