# 01 — External-global stand-in policy and implementation

## Policy (operator-approved, 3B.1 prompt §3)

Inert, network-free stand-ins are allowed only for external services that meet all four
conditions:
1. they are intentionally neutralized;
2. preserved first-party code references them without a guard;
3. without the stand-in, the source runtime would crash;
4. a no-op surface can represent them without contacting the service.

The stand-in reproduces the *shape* the environment is expected to have. It does not re-enable
tracking, analytics, ads, third-party networking or vendor SDKs.

## What was installed in this run: exactly one stand-in

| globalPath | methods | callable root | behavior |
|---|---|---|---|
| `karrotPixel` | `track` | no (plain object) | `noop` |

**Call-site evidence**, also recorded in `experiment-config.json`:

| role | script | offset | code |
|---|---|---|---|
| first-party caller (activated) | sc0025 `pages/_app` | @219938 | `(0,v.useEffect)((function(){window.karrotPixel.track("ViewPage")}),[r.pathname])`, with no guard |
| crash in parent run | 3B `console-log.json` t=1183 | — | `TypeError: Cannot read properties of undefined (reading 'track')` at `_app:74:189114` |
| vendor definer (neutralized, **not executed**) | sc0013 | @17838 | `window.karrotPixel=new W` |
| vendor init (neutralized, **not executed**) | sc0014 (inline) | @7 | `window.karrotPixel.init('…')` |

A full-text scan of all 19 captured desktop scripts found that first-party code uses only one
`karrotPixel` member: `track`. `init` is called only by the neutralized vendor inline script,
so it was not given a stand-in.

**Not installed:** `fbq` and `Kakao`. Their unguarded call sites exist only in
interaction and onLoad handlers (3B `03`), and this run did not crash on them (§6).

## Implementation (generic)

`tmp/source-preservation-phase3b1/lib/external-global-standin.mjs`:
- `installExternalGlobalStandIns(context, {standIns, recorderKey})` registers one Playwright
  `context.addInitScript` **before any page exists**. The script runs at document creation,
  before any parser-inserted `<script>`.
- The in-page function, for each config entry:
  - leaves a global that already exists untouched (it records `preexisting`);
  - otherwise builds `{}` (or a no-op function when `callable`) and puts a no-op function at
    each method path;
  - defines the result on `window`.
- Each no-op records only `{globalPath, methodPath, argumentCount, argumentTypes, perfMs,
  epochMs, readyState}` and returns `undefined`. **No argument values are stored.**
- The record lives under a **non-enumerable** `window` property, so
  `Object.keys(window)`-style probes (such as the webpack-global check) cannot see it.
- The lib contains no site, vendor or framework token. `check-result` enforces this with the
  genericity guard, which now also forbids `karrot`, `fbq`, `kakao`, `ViewPage` and
  `Next.js-hydration`, and applies to both the 3B and the 3B.1 `lib/`.
- **Inertness guard:** `check-result` scans the in-page function source for
  `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `createElement`,
  `appendChild`, `insertBefore`, `setTimeout`, `setInterval`, `requestAnimationFrame`,
  `cookie`, `localStorage`, `sessionStorage`, `indexedDB`, `importScripts`, `Image`,
  `postMessage`, `eval`, `Function(` and `import(`. **0 hits.** A mutation self-test confirms
  the guard catches an injected `sendBeacon`.

Site-specific values (global name, methods, reason, evidence) live only in
`experiment-config.json → externalGlobalStandIns`.

## Recorded outcome

| | value |
|---|---|
| installed | `karrotPixel` installed=true, preexisting=false, `readyState=loading`, script elements at install = **0**, perf 5.3 ms |
| surface at the pre-execution gate | `typeof karrotPixel === "object"`, `typeof karrotPixel.track === "function"` |
| calls before release | **0** |
| calls total | **1**: `karrotPixel.track`, 1 argument (`string`), perf 722.9 ms, `readyState=interactive` |
| call timing vs hydrate | `Next.js-hydration` measure ends at ≈720 ms. The call count was 0 in the commit-point snapshot and 1 in the first-microtask snapshot (see `04`) |
| network caused | none: the router saw no request that is not accounted for as local, stub or the known hero video block (`06`) |

## One measurement seam added (not a stand-in)

`lib/commit-point-snapshot.mjs` wraps `performance.measure`. It calls the original first and
returns its value unchanged. When the configured measure name (`Next.js-hydration`) is emitted,
it snapshots DOM identity synchronously, and again in the first microtask after it. This
answers §16 "earliest practical post-hydrate state". It is instrumentation of a browser API,
installed the same way as the stand-in. It changes no source bytes and implements no
application behaviour.
