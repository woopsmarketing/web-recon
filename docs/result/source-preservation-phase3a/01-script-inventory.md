# 01 — Script inventory

Full machine-readable inventory: `runtime-graph.json` → `scripts[]` (30 nodes).
Reconciliation and verbatim inline bodies: `tmp/source-preservation-phase3a/agentA.md`.

## Counts

| | |
|---|---|
| Distinct scripts across both viewports | **30** |
| Bodies captured | **19** (12 external + 7 inline) — matches the 19 files in the Phase 2 clone |
| Skipped by analytics policy | 10 |
| Unavailable | 1 (`polyfills-*`, `nomodule`) |
| Viewport-local entry counts | desktop 31, mobile 30 |

## The stable-id rule

Script ids are **not** stable across viewports, so the inventory is keyed on a
viewport-independent analysis id:

- external → `url:` + origin + pathname (query dropped)
- inline → `inline:sha256:<hash>`

One documented exception: `www.googletagmanager.com/gtm.js` fires twice on desktop
with different queries, so the real load keeps the plain id and the `is_td=1`
self-diagnostic beacon takes `#is_td`.

**Why this matters.** Desktop `sc0004` — `googletagmanager.com/gtm.js?…is_td=1` — is a
real `<script>` node in the desktop runtime DOM *and* a real network request (status
204, initiator: gtm.js pinging itself). It is entirely absent from mobile, in both DOM
and network manifest. That single extra entry shifts **every desktop id from `sc0005`
onward by one** relative to mobile. Any future cross-viewport work must correlate by
URL or sha256, never by id.

## First-party runtime (the replay candidates)

Byte-identical across desktop and mobile. All carry `defer`.

| desktop id | file | bytes | webpack chunk | role | execution class |
|---|---|---|---|---|---|
| sc0022 | `webpack-3d4d997a6d82a026.js` | 4,961 | 2272 | BUNDLER_RUNTIME | LOCAL_EXECUTABLE_CANDIDATE |
| sc0023 | `framework-a070cbfff3c750c5.js` | 129,980 | 9774 | FRAMEWORK_RUNTIME | LOCAL_EXECUTABLE_CANDIDATE |
| sc0024 | `main-58aeb610bf878a93.js` | 105,636 | 179 | BOOTSTRAP_RUNTIME | LOCAL_EXECUTABLE_WITH_DEPENDENCIES |
| sc0025 | `pages/_app-9c2508f77b107208.js` | 306,476 | 2888 | APP_RUNTIME | **SOURCE_BOUND** |
| sc0026 | `2924-2d8edfe2e564207a.js` | 166,826 | 2924 | UI_LIBRARY | LOCAL_EXECUTABLE_WITH_DEPENDENCIES |
| sc0027 | `7925-44556921d193a2a3.js` | 274,186 | 7925 | APP_RUNTIME | **SOURCE_BOUND** |
| sc0028 | `pages/index-798ca695bc5c80ee.js` | 21,146 | 5405 | PAGE_CHUNK | LOCAL_EXECUTABLE_WITH_DEPENDENCIES |
| sc0029 | `_buildManifest.js` | 3,230 | — | RUNTIME_CONFIG | LOCAL_EXECUTABLE_CANDIDATE |
| sc0030 | `_ssgManifest.js` | 77 | — | RUNTIME_CONFIG | LOCAL_EXECUTABLE_CANDIDATE |
| sc0021 | `polyfills-c67a75d1b6f99dc8.js` | — | — | BOOTSTRAP_RUNTIME | UNKNOWN (never captured) |

### One adjudication, recorded

Agent D classified `sc0028` (`pages/index`) as SOURCE_BOUND. I have downgraded it to
LOCAL_EXECUTABLE_WITH_DEPENDENCIES. Agent C established that `sc0028` contains **zero**
fetch/axios/XHR primitives and no origin literal — it holds call sites only. It will
execute; it simply renders nothing without data. The functional dependency is real and
is recorded on the feature axis as `uiDataCoupling = RUNTIME_COUPLED`, which is where
it belongs. Conflating "cannot run" with "runs and produces nothing" would have
hidden a distinction Phase 3B needs.

## Inline scripts (7, all captured, byte-identical across viewports)

| bytes | what it is | class |
|---|---|---|
| 413 | Google Tag Manager bootstrap — creates `dataLayer`, injects `gtm.js` | TRACKER |
| 595 | Meta/Facebook Pixel loader — injects `fbevents.js`, `fbq('init', …)` + PageView | TRACKER |
| 738 | Channel Talk official install snippet — defines the `ChannelIO` command queue | EXTERNAL |
| 165 | Channel Talk `boot()` call with the plugin key | EXTERNAL |
| 139 | Naver Analytics config + `wcs_do()` | TRACKER |
| 50 | Karrot pixel init | TRACKER |
| 45 | Kakao Ads pixel pageView | TRACKER |

## Capture gaps — both benign

1. **`polyfills-*.js` is `nomodule`** (`response.html:28416`). A browser that
   understands `type="module"` never fetches or executes a `nomodule` script. The gap
   is structural, not a defect, and the chunk is not required.
2. **10 analytics bodies skipped by policy.** All returned 200/204 on the wire; Phase 1
   deliberately does not keep analytics script bodies. Their inventory, metadata and
   classification are all present.

## Reconciliation: clean

All 19 captured bodies match 1:1 across Phase 1 manifest ↔ Phase 1 files ↔ the 19 clone
files ↔ `resource-map.json`, verified by `shasum -a 256`. **Zero mismatches, zero
orphans.**

The 7 inline sha-named files in the clone's `scripts/` are referenced by no
`data-preservation-bytes` attribute — verified intentional: inline content is preserved
as the literal text of the neutralized `<script type="text/plain">` node itself.

DOM attribute audit (parsed, not grepped — naive substring counts are inflated by
query-string false positives): desktop 32 `<script>` tags, 24 external all carrying
`-src`, 12 carrying `-bytes` (exactly those with captured bodies), 31 carrying
`-neutralized`/`-original-type` (everything except `__NEXT_DATA__`). Mobile: 31 / 23 /
12 / 30.

## Three traps recorded for later phases

1. `developers.kakao.com/sdk/js/kakao.js` **redirects** to
   `t1.kakaocdn.net/kakao_js_sdk/v1/kakao.js`. The analysis id keys on the declared src.
2. Both Facebook pixel config calls carry a mobile-only `&im=1` query parameter.
3. `fbevents.js` is declared as two separate `<script>` tags per viewport but the
   browser issues one coalesced request. Do not double-count.
