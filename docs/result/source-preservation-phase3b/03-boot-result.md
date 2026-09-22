# 03 — Boot result

**bootStatus = `BOOT_FAILED`.** The source runtime bootstrapped all the way through the
React hydrate commit and its first effect flush. An unguarded call to a neutralized tracker
global then threw, and React unmounted the whole application. **Runtime blocker identified.**

The automatic rule in `run.mjs` also produced `BOOT_FAILED`, but for a narrower reason: B4
was false at settle time. The adjudication (`runtime-result.json` → `adjudication`) keeps
the automatic values and records why three observables need correcting.

## Stage ledger

| stage | reached | evidence |
|---|---|---|
| S1 webpack runtime executed | **yes** | `self.webpackChunk_N_E` holds chunk ids `[9774, 179, 2888, 2924, 7925, 5405]`, all six JS chunks of the replay set pushed and processed |
| S2 React/ReactDOM 17 executed | **yes** | chunk 9774 registered; `#__next` carries `_reactRootContainer`, `__reactContainer$…`, `__reactEvents$…` |
| S3 Next.js client bootstrap executed | **yes** | `window.next.version = "12.3.4"`, `router.pathname = "/"`, `router.asPath = "/"`, `router.isReady = true` |
| S4 `_app`, `pages/index` and manifests registered | **yes** | `__NEXT_P` array, `__BUILD_MANIFEST`, `__SSG_MANIFEST` present; `__NEXT_DATA__.buildId` = `yMHNQjHujDVTgIp539WqR` |
| S5 React legacy **hydrate committed** over the Phase 2 DOM | **yes** | `performance` measure `Next.js-hydration` (start 720 ms, duration 17 ms). Next emits it only from the hydrate root's `useLayoutEffect` callback: main @20657 `t(ee?ne:re)` → `L.hydrate`, callback `Q` @17473 → `ne` @17752 `performance.mark("afterHydrate")`. Layout effects run inside the commit |
| S6 first passive-effect flush ran | **yes** | all 4 content XHRs dispatched from the `pages/index` `useEffect` (sc0028 @6197), and the `_app` effect below ran. Ordering comes from React semantics (child effects run before parent effects). The logged timestamps (1183 / 1186 ms) are driver receive times and cannot establish order on their own |
| S7 application stayed mounted | **no** | see the blocker below. `#__next` is empty after settle |

## The runtime blocker

```
t=1183ms console.error (reported by React, fatal to the tree)
TypeError: Cannot read properties of undefined (reading 'track')
    at /_next/static/chunks/pages/_app-9c2508f77b107208.js:74:189114
    at Ui (framework-a070cbfff3c750c5.js) … unstable_runWithPriority … (passive effect flush)
```

`_app` line 74, column 189114 is sc0025 char offset **219931**:

```js
(0,v.useEffect)((function(){window.karrotPixel.track("ViewPage")}),[r.pathname])
```

`window.karrotPixel` is defined by the Karrot Pixel UMD script and its inline init. Both are
TRACKER nodes and stay **neutralized, as §13 requires**. The first-party `_app` calls it with
no existence check.

The app has no error boundary of its own. Next's `Container` component is one (main @14241
`componentDidCatch(e,t){this.props.fn(e,t)}`). It catches the TypeError, unmounts its
children, and hands off to the error-page render (@16139). That render requests
`/_next/static/chunks/pages/_error-46dc075e4a0d5370.js` (never captured → local 404, not an
outbound request), and logs `Error rendering page: Error: Failed to load script: …_error-….js`
at t = 1190 ms. Nothing renders.

### Why this is a *runtime* blocker and not something else

| alternative | ruled out because |
|---|---|
| infrastructure (missing/unloadable dependency) | all 9 scripts served 200 with sha256 equal to the graph; all executed (S1–S4). The only 404 is `_error`, requested *after* the crash |
| hydration against the Phase 2 DOM | the throwing expression reads a `window` global and never touches the DOM. The hydrate commit had already completed (S5) |
| empty API data | the throw is in `_app`, not in a data consumer, and it reads `window.karrotPixel`. The effect flush throws synchronously, and every XHR response is asynchronous, so no response had arrived yet. (The main-banner stub shape was wrong in this run; see `01`. It cannot be the cause for the same reason) |
| harness bug | the tracker is dead because the task requires it. The harness did what was specified. **So there was no rerun** (§22 permits a rerun only for a trivial harness bug) |
| byte patch required | no. An inert, network-free stand-in for the global would avoid the throw without touching bytes. **Not applied**: it is a policy decision (see `07`) |

### Same class, not on the boot path (static scan, not executed)

| location | call | when it would throw |
|---|---|---|
| sc0027 @10325, @71188, @207464, @208403, @212971, @213761, @214290 | bare `fbq("track", …)` | on search / "inquiry" clicks |
| sc0027 @249284 | `Kakao.init(…)` in a script `onLoad` | when that script loads (the router would block it) |
| sc0027 @251362 | `Kakao.Share.sendDefault(…)` | on the share click |
| sc0025 @220044 | `window.wcs…` | **guarded** (`&&window.wcs`), not a blocker |

## Boot observables B1–B9

| # | observable | automatic | adjudicated | note |
|---|---|---|---|---|
| B1 | all selected local scripts loaded | PASS | PASS | 9/9 served 200, byte-identical, executed |
| B2 | no fatal uncaught bootstrap exception | PASS | **FAIL** | the automatic rule counted only `pageerror`. The fatal TypeError was caught by React and surfaced through `console.error` |
| B3 | Next runtime present | PASS | PASS | `window.next` 12.3.4, router ready |
| B4 | React attached/hydrated at `#__next` | FAIL | **PARTIAL** | attached and hydrate committed (S5), not retained (S7). No fibers at settle because the tree was unmounted |
| B5 | all expected content API calls attempted | PASS | PASS | 4/4 |
| B6 | all intercepted locally | PASS | PASS | 4/4 fulfilled by the router |
| B7 | zero configured API calls reached the source | PASS | PASS | see `05` |
| B8 | zero tracker/widget requests escaped | PASS | PASS | see `05` |
| B9 | runtime responded to one resize | FAIL | **NOT MEASURABLE** | 0 mutations. Nothing was mounted to respond |

## Responsive probe

1440×900 → 390×844, observed for 3 s: **0 mutation records**, 0 nodes removed or inserted
relative to post-settle, 0 page errors. This does not show that responsive switching is
broken. The React tree no longer existed, so no `useMediaQuery` listener was alive.
