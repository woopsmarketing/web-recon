# 02 — Preflight

Artifact: `data/apartmentary.com/runtime-experiments/2026-09-16T09-59-25-874Z/`
(parent: `2026-09-16T08-42-21-971Z`, untouched)

## Static preflight: 98/98 pass (`preflight-static.json`)

The 80 Phase 3B checks were reused unchanged. They cover the replay set's sha agreement, DOM
nodes, same origin, buildId, the path map, required runtime paths, the activation revert proof,
exactly 9 active scripts, no tracker or widget script active, unchanged `__NEXT_DATA__`, the
accepted clone being unchanged and self-consistent, and Phase 1 `executionIndependence` still
`unknown`.

18 new checks confirm that 3B.1 differs from the parent only where intended:

| check | result |
|---|---|
| parent experiment exists; **same replay set** (path + sha256); same buildId; same accepted input sha | pass |
| same activated start tags; **experiment document byte-identical to the parent's** | pass |
| same `viewport`, `resizeProbe`, `settle`, `staticServePrefixes`, `bootProbes`, `domProbe` as the reviewed 3B config | pass (6) |
| stubs identical to the **reviewed** 3B config | pass |
| stubs differ from what the parent **run** used only where the config records `CORRECTED` | pass: only main banner, `{"data":{"data":[]}}` → `{"data":[]}` |
| stand-ins non-empty, `noop`, with evidence | pass |
| `karrotPixel.track` is referenced by activated first-party code | pass (sc0025 `_app`) |
| the real definer is not executable (no active inline script, no active non-replay src) | pass |
| the experiment document carries no stand-in markup | pass (installed by init script, not in HTML) |

### Brief stub verification (§11)

The main-banner call site sc0028 reads `t=e.data.data`, where `e` is the AxiosResponse, so it
gets `BODY.data`, which must be an array. The stub is `{"data":[]}`. The other three stubs read
`e.data.data.data` and `.totalCount`, and the stub is `{"data":{"data":[],"totalCount":0}}`.
The run recorded exactly these bodies being served.

## Runtime preflight: 4/4 (before the experiment page, with no source JS)

| check | result |
|---|---|
| router installed before any navigation | pass |
| outbound default = block (`fetch("https://example.com/")` failed) | pass |
| stub interception returns the exact configured body | pass |
| gate not yet touched | pass |

## Pre-execution gate (§13): 11/11 held before the first runtime script was released

| assertion | result |
|---|---|
| first runtime script (`webpack-…js`) held at the router | pass |
| stand-ins installed (installed=true, preexisting=false) | pass |
| installed at `readyState=loading` with 0 script elements in the document | pass |
| `karrotPixel` exists; `typeof` = object; `typeof karrotPixel.track` = function | pass |
| stand-ins not yet called | pass (0) |
| only activated scripts are executable in the live DOM, so no Karrot, tracker, widget or vendor script is | pass (9 marked, 0 unmarked) |
| source runtime not begun: no `webpackChunk*` global | pass |
| source runtime not begun: `window.next` undefined | pass |
| source runtime not begun: no hydration measure; commit-point recorder idle | pass |
| API routing ready (runtime preflight stub check) | pass |
| outbound default = block (runtime preflight) | pass |

Any failure would have written `INFRASTRUCTURE_BLOCKED` and exited before release.

## Reviewed 3B harness fixes: all in effect

| fix | where |
|---|---|
| React-caught `console.error` with a stack into served local code counts as fatal (boot **and** resize) | `run.mjs` `isFatalShaped`; recomputed in `check-result` |
| dirty pre-execution state is a hard failure | extended into the 11-assertion gate |
| static root limited to `/assets/` and `/styles/` | `staticServePrefixes` (same as parent config) |
| B7 evidence is data | carried over |
| main-banner stub corrected | above |

## Harness self-test (synthetic page, no source JS, before the experiment)

A scratch smoke test ran both new libs on a synthetic page. Results:
- the stand-in installs at `loading` with 0 scripts;
- nested (`b.c`) and callable surfaces record calls without argument values;
- snapshots are taken at the measure and in the microtask;
- no enumerable globals leak;
- the synthetic page made exactly 1 request (its own document).

This self-test was not a browser run of the experiment.
