# 09 — Network and integrity

Source: `network-log.json` (every router decision, the local-mirror decisions, browser events and the server log with
the sha256 of the bytes sent), `runtime-result.json → integrity`.

## Network decisions (whole run, including the runtime preflight)

| class | count | notes |
|---|---|---|
| local served (`allow-local`) | 70: experiment document 1 + preflight probe page 1, scripts 9, stylesheets 2, images 51 (1 pre-execution, 25 boot, 25 resize), fonts 6 | all served from the 127.0.0.1 experiment server; 69 × 200 plus one 404 for the harness's own `/__runtime_preflight_probe__` |
| synthetic fixture fulfilled | 5: 4 runtime XHRs (mainBanners, portfoliosArea1, portfoliosArea2, reviews) + 1 runtime-preflight probe fetch | route.fulfill, never network |
| local mirror fulfilled | **0** | 15 exact font URLs configured; none requested |
| intentionally blocked | 2: `https://example.com/` (the runtime preflight's own outbound test) and `apartmentary-static…/main-introduce.mp4` (hero video, also blocked in A) |  |
| unexpected | **0** | |
| WebSocket | 0 | |

- **Escaped outbound: 0** (`escapedOutbound: []`, `B8_zeroTrackerWidgetEscapes: true`).
- The real Apartmentary API was never contacted (`B7_zeroApiCallsReachedSource: true`; all 4 API-origin requests were
  stub-fulfilled).
- Tracker/widget attempts: 0. All 12 vendor/tracker scripts were inert (`type=text/plain`), and the `<noscript>`
  beacons are inert text.
- Host-resolver isolation is unchanged: `MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`.

## Source JS

| step | path | sha256 in transit = graph |
|---|---|---|
| 1 | webpack-3d4d997a6d82a026.js | ✅ |
| 2 | framework-a070cbfff3c750c5.js | ✅ |
| 3 | main-58aeb610bf878a93.js | ✅ |
| 4 | pages/_app-9c2508f77b107208.js | ✅ |
| 5 | 2924-2d8edfe2e564207a.js | ✅ |
| 6 | 7925-44556921d193a2a3.js | ✅ |
| 7 | pages/index-798ca695bc5c80ee.js | ✅ |
| 8 | _buildManifest.js | ✅ |
| 9 | _ssgManifest.js | ✅ |

- There was no source-JS patch, no string replacement and no React/`useMediaQuery` override.
- `matchMedia`, `MediaQueryList.prototype.addListener` and the `matches` getter were verified native before release.
  `matchMedia` was verified native again at settle.
- The harness text scan (`V.harness.noForcingOrDomWriteApis`) found no `matchMedia` assignment, no
  `insertRule`/`deleteRule`, no `.style.x =`, no `class`/`className`/`classList` writes, no React-internal writes and
  no DOM insert/remove calls in `run.mjs`, `prepare.mjs` or the new libs.
- The only in-page wrapping is `performance.measure`, which is measurement instrumentation used identically in 3B.1/3C.
  It calls the original first and returns its value.

## Experiment document immutability

The `index.html` sha was the same at prepare, before the run, as served at `/` (1 request) and after the run.

## Baseline immutability (tree sha256 before prepare = after run; 0 changed files each)

| baseline | tree sha256 (prefix) |
|---|---|
| Phase 1 run `data/apartmentary.com/2026-09-16T05-27-10-722Z` | `e13a81f3…` |
| Phase 2 clone `…/preservation-clones/2026-09-16T06-42-28-282Z` | `cfd97f47…` |
| 3B artifact `…/2026-09-16T08-42-21-971Z` | `d62793c8…` |
| 3B.1 artifact `…/2026-09-16T09-59-25-874Z` | `c4e595b0…` |
| 3C superseded attempt `…/2026-09-16T10-47-09-345Z` | `37a0b869…` |
| **3C authoritative artifact `…/2026-09-16T10-50-02-746Z`** | `b637b774…` |
| reports 3A / 3B / 3B.1 / 3C | `d4cf6d5d…` / `7510b14b…` / `9c2a5f02…` / `d3f37a8c…` |
| harness dirs 3B / 3B.1 / 3C | `aba30aa5…` / `ad35ce94…` / `5d18c79e…` |

**Scope (review MINOR 4).** The claim covers exactly these 13 directories, from the start of the authoritative prepare
(`14-30-58-205Z`) to the end of its run. It does **not** cover:
- the 3C.1 harness directory (`run.mjs`'s gate expression was edited between the gate-blocked attempt and the
  authoritative prepare);
- the gate-blocked directory `…14-28-51-591Z`;
- the B artifact and report directory after the run;
- anything `check-result.mjs` did after the second hash (it writes only `result-consistency.json` in the B artifact
  and `strategy-b-result.json` in this report dir).

The gate-blocked attempt ran before this window. It read the same inputs and wrote only into its own new directory.

`anyBaselineMutated: false`. The earlier gate-blocked Strategy B directory `…/2026-09-16T14-28-51-591Z` is left as
written. It is not part of the authoritative evidence.

No git commit and no push.

## Validation summary

| suite | result |
|---|---|
| static preflight | 118/118 |
| control equivalence | 36/36 |
| runtime preflight | 5/5 |
| pre-execution gate | 17/17 |
| result consistency, including genericity guard + harness forcing scan + strongest-form check | 34/34 |

Genericity: the new libs (`initial-document`, `local-mirror`, `lifecycle-probe`) and the reused 3B/3B.1/3C libs contain
none of the forbidden site strings. Those are `apartmentary`, `dev-api`, the build id, `swiper`, `__NEXT`, `_next`,
`css-v7v99c`, `css-1rr4qq7`, `footer`, `gstatic`, `MuiBox`, `useMediaQuery`, `karrot`, endpoint names, `900px` and
others (the full list is in the config). Site-specific selectors and class labels live only in `experiment-config.json`
and the reports.
