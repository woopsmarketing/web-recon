# 05 — Network isolation

**Escaped outbound requests: 0.** Every non-loopback request the page made was either
fulfilled by a local stub (the 4 configured API requests) or aborted at the router (1).

## Two independent fail-closed layers

1. **Router** (`lib/network-guard.mjs`, `context.route("**/*")`, installed before any page
   existed). Loopback origin → continue. Configured stub (origin + pathname + required query
   pairs) → `route.fulfill`, which never reaches the network. Everything else → `abort`.
   WebSockets are closed through `routeWebSocket` (none were opened). Service workers are
   blocked at context level.
2. **Resolver** (`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`). Only loopback
   resolves. This covers anything that bypasses the router, such as preconnect or
   browser-internal fetches. Background networking, component updates, domain reliability,
   sync and hyperlink pings are disabled.

Runtime preflight, before the experiment page: `fetch("https://example.com/")` → **blocked**.
A stub URL → 200 with the exact configured body.

## What happened in the experiment phases

| phase | allow-local | stub-fulfilled | blocked |
|---|---|---|---|
| pre-execution | 43 | 0 | 1 |
| boot | 2 | 4 | 0 |
| resize | 0 | 0 | 0 |

(Runtime preflight, excluded from experiment counts: 1 local, 1 stub, 1 blocked.)

### API interceptions (4/4 attempted, 4/4 local)

| label | request | router decision | browser status |
|---|---|---|---|
| reviews | `GET …/api/v1/reviews/action/get-by-paging?count=6` | stub-fulfilled | 200 |
| portfolio area 1 | `GET …/api/v1/portfolios/action/get-by-paging?count=10&isBottomArea1Display=true&page=0` | stub-fulfilled | 200 |
| portfolio area 2 | `GET …/api/v1/portfolios/action/get-by-paging?count=10&isBottomArea2Display=true&page=0` | stub-fulfilled | 200 |
| main banner | `GET …/api/v1/main-banners/action/get-displays` | stub-fulfilled | 200 |

The router recorded each request's `authorization` header as `<empty>`, which matches the
static finding (no `accessToken` cookie → empty Bearer).

**Preflight note (corrected after review MINOR 5):** the router saw **no OPTIONS** requests.
Playwright 1.62 answers intercepted CORS preflights **itself**: `isInterceptedOptionsPreflight`
in playwright-core replies 204 with permissive CORS headers and never calls the user route.
So preflights never show up in these logs, and the guard's own OPTIONS branch is
unreachable under Playwright. The preflights did not leak: the real GETs were routed and
fulfilled locally, all four with status 200.

### Blocked (1)

| phase | request | bucket |
|---|---|---|
| pre-execution | `GET https://apartmentary-static.s3.ap-northeast-2.amazonaws.com/main-introduce.mp4` (media) | logged as `other-external`; it is really a **source-owned** static host (review NOTE 14; the config now buckets it as source-other). It is the 98 MB hero video residual already known from Phase 2 |

It surfaced as `net::ERR_BLOCKED_BY_CLIENT.Inspector` in the console. This is expected; §19
allows it.

### Trackers and widgets

- **Executable in the document: 0.** All 22 neutralized script nodes stayed `text/plain`
  (static preflight).
- **Requests attempted: 0.** No tracker or widget host appears in any router decision or
  browser event during the experiment phases.
- **Runtime-injected tracker/widget scripts: 0** observed. The only runtime-inserted script
  was the local `_error` chunk attempt.

### Local server

46 responses: experiment document 1, evidence path map 10 (the 9 replay scripts plus one
root-relative font, `/_next/static/chunks/fonts/SpoqaHanSansNeo-Regular-….otf`, requested
after boot), frozen-clone static 33, and two 404s (`/__runtime_preflight_probe__` and
`/_next/static/chunks/pages/_error-46dc075e4a0d5370.js`). The two mapped CSS chunk paths
were **not requested** in this run. The route loader's CSS fetch was not exercised before
the crash.

## Limits of the isolation evidence (from the review)

- **The resolver layer was configured but not independently tested.** The runtime preflight
  probe was stopped at the router, so it shows only that the router blocks. B7/B8 evidence is
  now recorded as data rather than a fixed string (`run.mjs`, for future runs).
- **Hostname-only resolver rules:** raw-IP connections and WebRTC/STUN would bypass both
  layers. Neither was observed.
- **No in-page script-execution audit:** a script inserted and removed during boot would show
  up only if it made a request. No tracker code ran here, because the tree died first.
- **Static root:** the server served the *whole* frozen clone root, and that root includes
  preserved tracker/widget bodies under `scripts/`. Nothing requested them: all 33 static
  hits were `/assets/` or `/styles/`. For future runs, `run.mjs` limits the root to the
  `staticServePrefixes` set in the config.

## Byte identity in transit

The server hashed every body it sent. All 9 replay scripts: status 200 and **sha256 equal to
the runtime-graph / Phase 1 manifest value**. `check-result.mjs` recomputes this from
`network-log.json` independently of `run.mjs`.

## Baseline integrity

| tree | before (sha256 of file-hash tree) | after | changed files |
|---|---|---|---|
| Phase 2 clone `2026-09-16T06-42-28-282Z` | recorded in `baseline-before.json` | equal | **0** |
| Phase 1 run `2026-09-16T05-27-10-722Z` | recorded in `baseline-before.json` | equal | **0** |

Phase 1 `executionIndependence` is still `"unknown"` for every replay entry. No Source
Package file was written. The execution result lives only in the new experiment artifact.
