# Phase 3C.1 Strategy B — Human Live QA launcher

Local-only live view of the authoritative Strategy B environment. No new experiment, no fixes, nothing written to artifacts.

- Launcher: `tmp/source-preservation-phase3c1-live-qa/live.mjs`
- Start: `nohup node tmp/source-preservation-phase3c1-live-qa/live.mjs > tmp/source-preservation-phase3c1-live-qa/live.log 2>&1 &`
- Opens a headed Playwright Chromium at 1440x900 on the experiment origin (random 127.0.0.1 port).
- Control (default 4181, auto-increments): `/` status JSON, `/viewport?w=390&h=844`, `/viewport?w=1440&h=900`, `/reload`.

## Reused as-is (read-only)
- Run `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/`: `index.html` (sha256 checked vs manifest), manifest path maps, `data-contract.json` + `synthetic-fixtures.json` → `fixturesToStubs` (4 stubs)
- Harness config `tmp/source-preservation-phase3c1-strategy-b/experiment-config.json`
- Libs: 3B server + network guard, 3B.1 stand-ins + commit-point snapshot, 3C fixtures + style probe, 3C.1 local mirror (15 fonts) + lifecycle probe
- Same Chromium args incl. `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, service workers blocked

## Differences from run.mjs
- headed; no gate hold on the first runtime script (scripts still load in document order); no measurements/screenshots/files written; control endpoint for viewport switch (same `page.setViewportSize` used by run.mjs resize).

## Checks
- Outbound probe: BLOCKED. Page errors at boot: 0.
- SHA-256 of 207 files (run dir, Phase 2 clone, 3B/3B.1/3C/3C.1 harness) identical before/after launch.
