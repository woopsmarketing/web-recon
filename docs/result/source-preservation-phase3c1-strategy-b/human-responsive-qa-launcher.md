# Phase 3C.1 Strategy B — Human Responsive QA Launcher (2026-09-17)

Disposable, for human QA only. No artifact, source JS, CSS, fixture, stub, stand-in or guard was modified. No commit/push.

## What changed
- New file `tmp/source-preservation-phase3c1-live-qa/live-resizable.mjs`, copied from `live.mjs` (which is untouched and still runs).
- `browser.newContext({ viewport: null })`: no viewport emulation, so the real window size is the page viewport. `deviceScaleFactor` is removed (it can't be combined with `viewport: null`).
- Launch args `--window-size=1440,900 --window-position=40,40` (outer size, so inner is 1440×813).
- Removed the `/viewport` endpoint (`setViewportSize` would turn emulation back on).
- Viewport readout: Node polls `innerWidth/innerHeight` read-only every 300 ms and prints changes to the terminal/log. Nothing is added to the page DOM. No matchMedia override and no breakpoint forcing.
- Added `/window?w=&h=`, which resizes the real OS window through CDP `Browser.setWindowBounds`. It was used only for the self-check.

## Unchanged (same as live.mjs)
Authoritative run `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/index.html` (sha256 checked against manifest), same served path maps, 4 synthetic stubs, 15 mirrored fonts, inert stand-ins, passive probes, fail-closed guard (outbound probe BLOCKED).

## Self-check (real window resize → page viewport)
| window (outer) | innerWidth×innerHeight |
|---|---|
| 1000×800 | 1000×713 |
| 768×900 | 768×813 |
| 390×844 | 500×757 (macOS Chromium minimum window width is 500) |
| 1920×1000 | 1920×913 |
| 1440×900 (restored) | 1440×813 |

`emulatedViewport: null`, `pageErrors: []`.

## Run / stop
`node tmp/source-preservation-phase3c1-live-qa/live-resizable.mjs` (log: `live-resizable.log`, status: `http://localhost:4191/`). Stop with Ctrl+C or by closing the window.
Note: a Chromium window can't be narrower than 500 px, so 390 px mobile checks need the old `live.mjs` `/viewport` emulation or DevTools device mode.
