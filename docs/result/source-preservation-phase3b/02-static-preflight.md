# 02 — Static preflight

`prepare.mjs` → `preflight-static.json`: **80 / 80 pass**. The browser run refuses to start
unless `passed === true`. A second, runtime preflight ran inside the browser before the
experiment page loaded (4 / 4 pass).

## The §21 assertions, mapped to checks

| required assertion | check(s) | result |
|---|---|---|
| accepted Phase 2 artifact unchanged / read-only | `preflight.acceptedCloneUnchangedDuringPrepare` (tree sha256 before prepare = after prepare), `preflight.acceptedCloneMatchesOwnResourceMap` (every localized file still matches its own ledger sha256) | PASS |
| experiment copy exists separately | `preflight.experimentOutsideAcceptedClone`, artifact at `data/apartmentary.com/runtime-experiments/2026-09-16T08-42-21-971Z/` | PASS |
| exactly the intended first-party scripts active | `preflight.exactlyIntendedScriptsActive`: the parsed experiment document has exactly 9 executable `<script>` nodes, equal in order to the replay set's served paths | PASS |
| no tracker/widget script active | `preflight.noTrackerOrWidgetScriptActive`: every executable node carries the activation marker; 22 neutralized nodes remain `text/plain`; the only other inert node is `__NEXT_DATA__` (`application/json`) | PASS |
| every activated external script resolves to a local preserved body | `replay.N.domNode`, `replay.N.shaAgree` (graph = Phase 1 manifest = preserved file), `replay.N.serverMapping` | 27 checks PASS |
| every required root-relative runtime path has a mapping | `requiredPath.mapped /_next/static/css/80139ea3111436a9.css`, `…/d7c08271dabb56dd.css` (from the document's `data-preservation-source-href` and a text scan of `_buildManifest`) | PASS |
| CSS required by the homepage resolves locally | `preflight.documentCssResolvesLocally /styles/c9a8….css`, `/styles/2a45….css`, plus the two mapped `/_next/static/css/*` paths (byte-identical to the Phase 1 authored CSS) | PASS |
| API interception installed before navigation | runtime preflight `runtime.guardInstalledBeforeAnyNavigation`, `runtime.stubInterceptionWorks` | PASS |
| outbound network default is BLOCK | runtime preflight `runtime.outboundDefaultBlock` (a live `fetch("https://example.com/")` failed at the router) | PASS |
| no source JS bytes modified | `activation.revertReproducesAcceptedDocument` (the spliced document reverts to the accepted one byte-for-byte), sha agreement above; confirmed in transit after the run (see `05`) | PASS |

## Additional checks

- `pathMap.noShaConflicts`, plus `pathMap.fileIntegrity` for all 28 evidence-map entries
  (9 scripts, 2 CSS, 17 other same-origin assets)
- `replay.domOrderMatchesGraphStepOrder`
- `buildId.presentInReplayPaths`, `buildId.matchesDocumentHydrationData`
- `preflight.hydrationDataUnchanged`: the `__NEXT_DATA__` element is byte-identical
- `preflight.phase1ExecutionIndependenceUntouched`: all 9 replay entries still read `"unknown"`

## One harness defect found and fixed before the browser run

The first `prepare` run failed `activation.revertReproducesAcceptedDocument`. The revert
helper applied a cumulative offset shift that is wrong when edits are reverted in ascending
order. This was a bug in the *check*, not in activation. The fix makes the helper verify
each replacement at its offset before reverting it. The failed artifact directory was
deleted and never used for a browser run. The accepted run is the second `prepare`.

## Pre-execution state actually observed in the browser

`preExecution` in `runtime-result.json`:
`{"readyState":"interactive","webpackGlobals":[],"nextType":"undefined","activatedNodes":9,"gateHeld":true}`.
The DOM was fully parsed, no source JS had run, and the first script was held at the router.
`dom-before.html` and `before.png` were taken in this state.
