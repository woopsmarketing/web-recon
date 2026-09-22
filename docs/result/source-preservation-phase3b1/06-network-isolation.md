# 06 — Network isolation

**Escaped outbound requests: 0.** Protections are unchanged from Phase 3B:
- a fail-closed `context.route` router, installed before any navigation;
- a host resolver that maps everything except 127.0.0.1 to NOTFOUND;
- WebSockets closed and service workers blocked;
- background networking disabled.

## Router decisions per phase

| phase | allow-local | stub-fulfilled | blocked |
|---|---|---|---|
| runtime preflight (not counted as experiment traffic) | 1 | 1 | 1 |
| pre-execution | 43 | 0 | 1 |
| boot | 3 | 4 | 0 |
| resize | 1 | 0 | 0 |

WebSocket attempts: 0. No routed request had a non-local origin other than the 4 stubbed API
calls and the 1 blocked media request.

## API interceptions: 4/4 attempted, 4/4 fulfilled locally

| stub | request | decision | `authorization` | body served |
|---|---|---|---|---|
| reviews | `GET …/api/v1/reviews/action/get-by-paging?count=6` | stub-fulfilled | `<empty>` | `{"data":{"data":[],"totalCount":0}}` |
| portfolio area 1 | `GET …/portfolios/action/get-by-paging?…isBottomArea1Display=true…` | stub-fulfilled | `<empty>` | `{"data":{"data":[],"totalCount":0}}` |
| portfolio area 2 | `GET …/portfolios/action/get-by-paging?…isBottomArea2Display=true…` | stub-fulfilled | `<empty>` | `{"data":{"data":[],"totalCount":0}}` |
| main banner | `GET …/api/v1/main-banners/action/get-displays` | stub-fulfilled | `<empty>` | `{"data":[]}` (**corrected shape**) |

CORS preflights are answered inside Playwright and never reach the route handler (3B trap).
The real GETs were routed and fulfilled without touching the network.

## Blocked: 1

| phase | request | bucket |
|---|---|---|
| pre-execution | `GET https://apartmentary-static.s3.ap-northeast-2.amazonaws.com/main-introduce.mp4` (media) | source-other: the known 98 MB hero video residual |

## Trackers, widgets and stand-ins

- **Tracker or widget requests attempted: 0.** `check-result` compares every experiment-phase
  router decision against every tracker and widget host pattern.
- **Executable tracker, widget or vendor scripts: 0.** Checked statically (98/98) and by the
  live pre-execution gate: 9 activated scripts, 0 unmarked executable.
- **Real Karrot code executed: no.** The vendor UMD (sc0013) and inline init (sc0014) stayed
  `text/plain`. `window.karrotPixel` was the stand-in, which was installed with
  `preexisting=false`.
- **Stand-in network activity: none possible and none observed.** The in-page stand-in contains
  no network, timer, DOM-injection or storage API (inertness guard, 0 hits). The single
  `track` call at 722.9 ms has no request to account for, because every boot-phase decision is
  accounted for (below).

## Local server (48 responses)

| resolved by | count | notes |
|---|---|---|
| experiment document | 1 | `/` |
| evidence path map | 13 | the 9 replay scripts; 1 font; bottom images `main-bottom.7109b56f.jpg` ×1 and `main-bottom-mobile.ba94f0cd.jpg` ×2 (runtime-selected responsive image) |
| frozen-clone static (`/assets/`, `/styles/` only) | 33 | |
| 404 | 1 | `/__runtime_preflight_probe__` (runtime preflight only) |

No `pages/_error` request and no other local 404.

All 9 replay scripts were served with status 200 and **sha256 equal to the runtime-graph value**.
`check-result` recomputes this from `network-log.json`.

## Baseline integrity

| tree | before | after | changed files |
|---|---|---|---|
| Phase 2 clone `2026-09-16T06-42-28-282Z` | `cfd97f47…a2a568` | identical | **0** |
| Phase 1 run `2026-09-16T05-27-10-722Z` | `e13a81f3…991cb5` | identical | **0** |

The parent experiment `2026-09-16T08-42-21-971Z` was not rewritten, and the new run is a separate
directory. `check-result` only checks that the parent exists (review NOTE 5). The reviewer
confirmed independently that every parent file predates 3B.1 (`find -newer` returned nothing).
Future runs should hash the parent tree.

## Limits (carried from 3B, unchanged)

- The resolver layer is configured but was not exercised independently.
- Resolver rules are hostname-only, so raw-IP or WebRTC traffic would bypass them. None was
  observed.
- There is no in-page audit of script execution. A script that is inserted and removed without
  making a request would not be seen.
