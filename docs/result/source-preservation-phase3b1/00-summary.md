# Phase 3B.1 — Inert external-global stand-in boot rerun

## Verdict

**BOOT PROVEN — READY TO DESIGN PHASE 3C DATA REPLAY**

The preserved source runtime, with its bytes unchanged, booted locally over a copy of the
accepted Phase 2 desktop DOM, and this time it **stayed mounted**. One inert, network-free
`window.karrotPixel = { track() {} }` stand-in, installed before any source JS, absorbed the
`_app` `track("ViewPage")` call that crashed Phase 3B.

No other runtime error followed. Next and React stayed alive through settle and one resize.
All four content APIs were stubbed locally, and nothing escaped. The data-driven sections
render empty, as expected, and **missing API data is now the primary fidelity blocker**.

## Report

| item | value |
|---|---|
| experiment | `data/apartmentary.com/runtime-experiments/2026-09-16T09-59-25-874Z/` (parent `2026-09-16T08-42-21-971Z`) |
| boot | **`BOOT_PROVEN`** (stages S1–S7 all reached) |
| mounted state | **`STAYED_MOUNTED`**: 213 root elements at settle, 192 after the resize; React root and Next router present; no `_error` request |
| hydration status | automatic **`FAILED` on node identity** (60/660 kept at the commit point, 60/215 outside data); adjudicated **`MIXED`**, because non-data *content* is restored and 445/660 of the loss is data (`04`) |
| stand-ins installed | 1: `karrotPixel` {`track`}. Installed at `readyState=loading` with 0 script elements present, `preexisting=false` |
| stand-in calls | 1: `karrotPixel.track`, 1 string argument, at 722.9 ms, right after the hydrate commit |
| fatal errors | **0** (no `pageerror` and no React-caught `console.error` with a local stack, during boot or resize) |
| API interceptions | **4 / 4** attempted and fulfilled locally, including the corrected main-banner stub `{"data":[]}` |
| escaped outbound | **0** (1 blocked: the known hero MP4) |
| DOM survival | A 660 → B 171 → B′ 213 → C 213 root elements. Data subtrees = 445/660 elements and 1,249/1,769 chars. Non-data text restored (522 vs 520; the +2 are two empty-stub "0" nodes), but only 59/215 non-data nodes are original |
| responsive reaction | **yes**: 89 mutations, desktop nav removed, icon buttons inserted, mobile image variant requested, root 213 → 192 |
| source-JS integrity | unchanged: 9/9 served with 200 and graph sha256; document byte-identical to the parent experiment's |
| baseline integrity | unchanged: Phase 2 clone and Phase 1 run tree sha256 equal before and after, 0 changed files |
| validation | static preflight 98/98 · runtime preflight 4/4 · pre-execution gate 11/11 · 1 browser run · result consistency 96/96 |
| reviewer | 0 BLOCKER · 0 MAJOR · 3 MINOR · 3 NOTE. All accepted and corrected. Verdict independently confirmed; no rerun (`07`) |
| next justified step | design Phase 3C data replay, starting with the operator's API-body capture-policy decision (`08`) |

## The 18 questions

1. **Was the `karrotPixel` stand-in installed before source JS?** Yes. It was installed by an
   init script at `readyState=loading` with 0 script elements present, and the gate confirmed
   it before the first runtime script was released.
2. **Was `karrotPixel.track` actually called?** Yes, once, with 1 string argument. It happened
   after the hydrate commit and before the first microtask after it, which is the
   passive-effect flush.
3. **Did it do anything on the network or behave like the vendor?** No. It is a no-op that
   records counts and types only; the inertness guard found 0 network, timer, DOM or storage
   APIs; and every routed request is accounted for.
4. **Did webpack boot?** Yes. Chunks 9774, 179, 2888, 2924, 7925 and 5405 are registered.
5. **Did Next boot?** Yes. 12.3.4, with the router ready at `/`.
6. **Did the React hydrate commit?** Yes. The `Next.js-hydration` measure fired and the
   commit-point snapshot ran once.
7. **Did the application STAY mounted?** Yes, through settle and the resize.
8. **Were all four API calls still attempted and fulfilled locally?** Yes, 4/4.
9. **Did another external-global dependency crash the app?** No. No second run was needed.
10. **Did any real tracker or widget script execute?** No. Only the 9 activated scripts were
    executable, and there were 0 tracker or widget requests.
11. **Did any outbound request escape?** No, 0.
12. **What happened to the Phase 2 DOM after hydrate + layout effects?**
    - At the commit point, 60/660 original root nodes remained and 111 were client-created.
    - A media-query re-render then added desktop nav.
    - The empty API responses changed nothing further.
    - The loss is dominated by the 445 elements in data subtrees.
    - Non-data content is restored, but as mostly new nodes. Only ≈42 replacements are
      attributable to the media-query re-render (`04`).
13. **Did the resize trigger responsive behaviour in the source runtime?** Yes. React
    removed and inserted nodes, not just reflowed CSS (`05`).
14. **Did source JS stay byte-identical?** Yes.
15. **Did the accepted Phase 2 baseline stay unchanged?** Yes.
16. **Is missing API data now the primary fidelity blocker?** Yes (`08`).
17. **Is Strategy B still necessary?** Not for boot. Still open: whether the non-data
    node-identity loss and the footer anomaly are artefacts of booting over the Phase 2 DOM.
    B is the natural control for that fidelity question (`08`).
18. **What exact next step is justified?** Designing Phase 3C data replay, beginning with the
    operator's capture-policy decision for the four API bodies. Implementation is not yet
    justified.

## What changed on disk

- **New harness:** `tmp/source-preservation-phase3b1/`.
  - `lib/external-global-standin.mjs` and `lib/commit-point-snapshot.mjs` are generic.
  - `experiment-config.json` is site-specific.
  - `prepare.mjs`, `run.mjs`, `check-result.mjs` and `adjudicate.mjs` were derived from 3B.
  - The 3B `lib/` is reused unchanged.
- **New artifact:** `data/apartmentary.com/runtime-experiments/2026-09-16T09-59-25-874Z/`
  (includes `after-resize.png`).
- **New reports:** `docs/result/source-preservation-phase3b1/` 00–08.
- **Not touched:** `src/`, `package.json`, the Phase 1 run, the Phase 2 clone, the parent 3B
  experiment, and the 3B harness.

**STOP. Phase 3C not started.**
