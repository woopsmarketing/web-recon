# 01 — Experiment design

One bounded experiment: can the captured homepage's own Next.js/React runtime boot from
local preserved bytes, activated over a **copy** of the accepted Phase 2 DOM (Strategy A)?

## Inputs (read-only)

| input | path |
|---|---|
| Accepted Phase 2 clone (frozen) | `data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z/` (variant `desktop`) |
| Phase 1 source package | `data/apartmentary.com/2026-09-16T05-27-10-722Z/viewports/desktop/source-package/` |
| Phase 3A runtime graph | `docs/result/source-preservation-phase3a/runtime-graph.json` |

## Experiment artifact

`data/apartmentary.com/runtime-experiments/2026-09-16T08-42-21-971Z/`

| file | what it is |
|---|---|
| `index.html` | the accepted desktop document with 9 `<script>` start tags spliced. Nothing else changed |
| `experiment-manifest.json` | replay set, activated start tags (before/after), evidence path map, stubs, buildId |
| `preflight-static.json` | 80 static assertions (all pass) |
| `baseline-before.json` | per-file sha256 trees of the Phase 2 clone and Phase 1 run, taken before anything else ran |
| `runtime-result.json` | the RuntimeExecutionResult: automatic observables plus an `adjudication` block |
| `network-log.json` | router decisions, browser request/response/failure events, server log with sha256 of every byte sent |
| `console-log.json` | console messages and page errors, tagged by phase |
| `dom-before.html` / `dom-after.html` | DOM serialized before source JS ran, and after settle |
| `before.png` / `after.png` | diagnostic screenshots only |
| `result-consistency.json` | 65 checks recomputed from the raw logs (all pass) |

Phase 2 asset trees are **not** copied. The server reads them in place.

## Harness (`tmp/source-preservation-phase3b/`)

| file | generic? | role |
|---|---|---|
| `lib/activate.mjs` | yes | reverses `data-preservation-*` on selected `<script>` nodes by **splicing start tags at parse5 source offsets**. No re-serialization. A revert check proves every other byte is identical |
| `lib/resource-map.mjs` | yes | builds the request-path → local-file map only from records that hold **both** the original URL and a local body: Phase 1 script/style manifests and Phase 2 `resource-map.json`. Same-origin only. sha256 must agree |
| `lib/server.mjs` | yes | separate root-serving mode. The experiment document is at `/`, `/_next/...` goes through the evidence map, other relative files resolve read-only against the frozen clone. No CSP. Logs the sha256 of every response |
| `lib/network-guard.mjs` | yes | fail-closed Playwright routing: local → continue, configured stub → fulfill, everything else → abort. WebSockets closed |
| `lib/dom-probe.mjs` | yes | node-identity snapshot through a Playwright JSHandle (no page global), plus summaries and a retained/removed/inserted diff |
| `lib/integrity.mjs` | yes | content-tree fingerprints |
| `experiment-config.json` | **site-specific** | every host, endpoint, buildId source, probe expression and selector |
| `prepare.mjs` | experiment | build the artifact and run the static preflight |
| `run.mjs` | experiment | the one browser run |
| `adjudicate.mjs` | experiment | evidence-based adjudication, appended without removing automatic values |
| `check-result.mjs` | experiment | consistency checks plus the `lib/` genericity guard |

No `src/` file was changed and no Phase 1/2 file was touched, so no repo-wide validation was run.

## Replay set (verified against the graph, the capture and the DOM)

All 9 `minimumReplaySet` steps. For each one, the graph sha256, the Phase 1 manifest sha256
and the sha256 of the `data-preservation-bytes` file were all equal. DOM order matched step
order.

| step | graph id → served path | role |
|---|---|---|
| 1 | `/_next/static/chunks/webpack-3d4d997a6d82a026.js` | BUNDLER_RUNTIME |
| 2 | `/_next/static/chunks/framework-a070cbfff3c750c5.js` | FRAMEWORK_RUNTIME |
| 3 | `/_next/static/chunks/main-58aeb610bf878a93.js` | BOOTSTRAP_RUNTIME |
| 4 | `/_next/static/chunks/pages/_app-9c2508f77b107208.js` | APP_RUNTIME |
| 5 | `/_next/static/chunks/2924-2d8edfe2e564207a.js` | UI_LIBRARY |
| 6 | `/_next/static/chunks/7925-44556921d193a2a3.js` | APP_RUNTIME |
| 7 | `/_next/static/chunks/pages/index-798ca695bc5c80ee.js` | PAGE_CHUNK |
| 8 | `/_next/static/yMHNQjHujDVTgIp539WqR/_buildManifest.js` | RUNTIME_CONFIG |
| 9 | `/_next/static/yMHNQjHujDVTgIp539WqR/_ssgManifest.js` | RUNTIME_CONFIG |

The two "optional" manifests were included for two reasons. The captured document declared
them. And the bootstrap's route loader waits for `__BUILD_MANIFEST` with a 3,800 ms timeout
(main @33395) before it resolves the route's CSS.

Activation example: `<script defer data-preservation-src="https://…/webpack-….js"
data-preservation-bytes="../scripts/9d7e….js" type="text/plain" …>` →
`<script src="/_next/static/chunks/webpack-3d4d997a6d82a026.js" defer
data-runtime-experiment-activated="https://…">`.

**buildId** `yMHNQjHujDVTgIp539WqR` was read from `runtime-graph.json`. It was asserted
equal to `__NEXT_DATA__.buildId` in the document and present in the mapped manifest paths.
It appears only in the config and the result files.

## API stub shapes (short static verification before running)

One read-only subagent checked the four call sites in `pages/index`. Three of the four shapes
were right. The main-banner shape was wrong and was caught by the independent review.

| diagnostic label | stub body | evidence |
|---|---|---|
| main banner | **used:** `{"data":{"data":[]}}` · **correct:** `{"data":[]}` | sc0028 @6111 `e=i.sent(),t=e.data.data; y.mainBanners=t`. Here `e` is the AxiosResponse, so `t` = body`.data`. **No `\|\|[]` fallback**, so the value must be a real array. **The subagent's shape was wrong for this one endpoint** (independent review MINOR 3). In this run `mainBanners` became `{data:[]}`. That had no effect, because the response arrived after the tree was already unmounted. The config is corrected for any future run |
| portfolio area 1 | `{"data":{"data":[],"totalCount":0}}` | sc0028 @5233 `i=t.data,n=i.data,i.totalCount; y.firstPortfolios=n\|\|[]` |
| portfolio area 2 | `{"data":{"data":[],"totalCount":0}}` | sc0028 @5460, same pattern |
| reviews | `{"data":{"data":[],"totalCount":0}}` | sc0028 @2128 `t=e.data.data.data; n.reviews=t\|\|[]` |

Headers: the shared axios instance has `withCredentials:false`, and its request interceptor
sets `Authorization` on **every** call (sc0027 @260290). When there is no `accessToken`
cookie, the value is the empty string. That makes each call a non-simple CORS request. Under Playwright the preflight is answered
inside Playwright itself (see `05`). The stubbed GET carries an echoed origin, and no
`Allow-Credentials` is needed. No response interceptor exists, and no other service fires on the
homepage.

## Run protocol

1. **Server**: root mode on a random loopback port.
2. **Browser**: Chromium (Playwright 1.62.1), headless, `serviceWorkers: "block"`. It was
   launched with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, a second
   fail-closed layer under the router, plus background-networking flags turned off.
3. **Router installed before any navigation.** A runtime preflight page then showed that an
   outbound fetch is **blocked** and that a stub URL returns the exact stub body.
4. **Pre-execution gate.** The router **holds** the request for the first replay script
   (webpack). All scripts are `defer`, so nothing can run until it is released. The harness
   waits for `readyState !== "loading"` and for the gate to be hit. It then asserts no
   `webpackChunk*` global exists and `window.next` is undefined, takes the identity
   snapshot, and saves `dom-before.html` and `before.png`.
5. **Release** the gate, wait for the `load` event, then settle: 1.5 s of network quiet
   (15 s cap) plus 2 s.
6. **After settle**: run the boot probes, summary and identity diff, then save
   `dom-after.html` and `after.png`.
7. **One resize**, 1440×900 → 390×844. A MutationObserver runs for 3 s.
8. Close everything and re-hash the Phase 2 clone and the Phase 1 run.

Viewport 1440×900, desktop only. One primary attempt. There was **no second attempt**,
because the failure was not a harness bug (see `03`).
