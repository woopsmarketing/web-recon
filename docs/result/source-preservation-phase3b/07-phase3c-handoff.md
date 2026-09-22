# 07 — Phase 3C handoff

**Phase 3C was not started.** This file records only what the evidence justifies next.

## What is now established for this captured build

1. **The preserved bytes can execute locally, unmodified, from a root-served copy.**
   webpack 5 → React 17 → Next 12.3.4 bootstrap → `_app`/`pages/index` registration →
   **legacy hydrate commit over the Phase 2 DOM** → first passive-effect flush. Nothing needed
   the source origin, a Next server, or byte edits to get that far.
2. **The first-party app is coupled to live third-party tracker globals.**
   `window.karrotPixel.track("ViewPage")` runs unguarded in an `_app` effect on every
   pathname. With trackers neutralized, the whole tree is unmounted immediately.
3. **There is no safety net.** The app has no error boundary of its own. Next's `Container`
   boundary catches the error and routes it to the error page, but the `pages/_error` chunk was
   never captured, so any runtime exception blanks the page.
4. **Data is still missing and still decisive for content** (Phase 3A). This run cannot say
   whether data is the *main* blocker, because the tracker crash comes first.
5. **Network isolation for runtime experiments works.** The two-layer router plus resolver
   produced 0 escapes, and the stub shapes are verified.

## Ordered blocker list (evidence-backed)

| # | blocker | class | evidence |
|---|---|---|---|
| 1 | unguarded `window.karrotPixel.track` in `_app` passive effect | ENVIRONMENT: neutralized tracker global | sc0025 @219931; console t = 1183 ms |
| 2 | `pages/_error` chunk not captured | CAPTURE SCOPE | local 404 `/_next/static/chunks/pages/_error-46dc075e4a0d5370.js` |
| 3 | 4 content API bodies not captured | CAPTURE POLICY (Phase 3A) | stubs → carousels/data sections render nothing |
| 4 | bare `fbq(…)` / `Kakao.*` in click and onLoad handlers | ENVIRONMENT: same class as #1, interaction-time | sc0027 offsets listed in `03` |

## Decision needed from the operator before any rerun

**Tracker-global policy for runtime replay.** The options:

- **(a) Keep trackers fully dead (as now).** Source runtime replay of this build cannot stay
  mounted without byte patching. Record `BYTE_PATCH_REQUIRED` as the only remaining path.
- **(b) Allow inert environment stand-ins.** Provide network-free, no-op objects/functions
  for the specific globals that first-party code calls unguarded (`karrotPixel.track`;
  later `fbq`, `Kakao.init`/`Kakao.Share.sendDefault`). They would be injected before source
  JS, derived from static call-site evidence, and never loaded from the tracker's code.
  Trackers still send nothing: the router and resolver stay fail-closed. The bytes stay
  untouched.
- **(c) Run real tracker code.** Out of the question under §13.

(b) is the smallest change consistent with every standing rule (no byte patching, no tracker
execution, no network). It is a **policy decision**, not a harness fix, so it was not applied
here.

## The exact next step this evidence justifies

**Phase 3B.1 — rerun the same boot experiment with one added input: inert tracker-global
stand-ins (option b), if approved.** Keep everything else the same: the same artifact
recipe, replay set, stubs and 1440×900 viewport. In the same run, fix the one measurement gap
this run exposed:

- snapshot DOM identity **as close to the hydrate commit as possible**. Note that layout-effect
  re-renders, such as MUI `useMediaQuery` switching at desktop width, run synchronously in the
  same commit phase, so even an early snapshot will include them. Report the result as
  "hydrate + layout effects", not as pure hydration.
- keep one resize probe. It becomes meaningful once the tree stays mounted.

Already applied to the harness after review, not yet exercised by a run:
- B2 now also counts React-caught `console.error` entries with a stack into served local code.
- A non-clean pre-execution snapshot is now a hard failure.
- The static root is restricted to `/assets/` and `/styles/`.
- B7 evidence is recorded as data.
- The main-banner stub is corrected to `{"data":[]}`.

Expected outcomes and how to read them:

| 3B.1 result | conclusion |
|---|---|
| stays mounted, carousels empty, rest of page kept | **BOOT PROVEN — READY TO DESIGN PHASE 3C DATA REPLAY** (data then becomes the main blocker) |
| stays mounted but most non-data markup deleted by hydrate + layout effects | mismatch against the post-fetch Phase 2 DOM is plausible → Strategy B control justified to separate it |
| another unguarded global throws | add it from evidence, same policy, one more bounded run |

**Not justified yet:** API capture/replay design, Strategy B, a runtime-preservation engine,
mobile boot, capturing `_error`/other route chunks. Each depends on 3B.1.

## Reusable pieces available to later phases (not promoted into `src/`)

`tmp/source-preservation-phase3b/lib/` is generic, and the check confirms no site strings:
start-tag splice activation with a revert proof, an evidence-only path map, a root-serving
experiment server with in-transit sha256, a two-layer fail-closed network guard, and a
JSHandle node-identity DOM diff. If a later phase needs them in production code, promote
them deliberately. Never exercised in this run: the CSS-chunk path mapping and the resolver layer. The guard's
OPTIONS branch is unreachable under Playwright, which answers intercepted preflights itself.

## Carried forward, unchanged

Everything in Phase 3A `07` carry-forwards, plus:

- the Phase 2 residual ledger still records no runtime API dependency. This run adds a
  second silent class: **runtime tracker-global dependencies**
- Phase 1 provider-table gap (Karrot UMD captured despite `analyticsScript=false`). It is now
  also the *global* that first-party code needs
