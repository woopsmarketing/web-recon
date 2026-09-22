# Phase 3B — A_FIRST local runtime boot experiment

## Verdict

**BOOT FAILED — RUNTIME BLOCKER IDENTIFIED**

The preserved source runtime ran locally from unmodified bytes through webpack, React,
the Next bootstrap and a **completed React hydrate commit** over a copy of the accepted
Phase 2 DOM. It fired all four content requests into local stubs. Then `_app` called
`window.karrotPixel.track("ViewPage")` in a `useEffect` without checking that the global
exists. The Karrot tracker is neutralized, as required, so the call threw.

Next's error boundary unmounted the app and tried to load the `_error` page chunk. That chunk
was never captured, so the request got a local 404 and the page stayed blank. **The program
boots but does not stay mounted.**

This is not an infrastructure failure: every dependency loaded. It is not a hydration or DOM
problem: the throw reads a window global. It is not a data problem: the throw is in `_app`,
before any response. And it does not require byte patching.

## Report

| item | value |
|---|---|
| experiment | `data/apartmentary.com/runtime-experiments/2026-09-16T08-42-21-971Z/` |
| boot status | `BOOT_FAILED` (stages S1–S6 reached, S7 "stayed mounted" not reached) |
| hydration status | `UNKNOWN`: not measured, because the crash unmounted the tree first |
| final DOM survival | `LOST`: 0 / 660 `#__next` elements remain |
| active script count | **9** (webpack, framework, main, `_app`, 2924, 7925, `pages/index`, `_buildManifest`, `_ssgManifest`) |
| intercepted API count | **4 / 4** attempted, 4 / 4 fulfilled locally |
| escaped outbound requests | **0** (1 attempt blocked: the known 98 MB hero video) |
| fatal errors | `TypeError: Cannot read properties of undefined (reading 'track')` at `_app` sc0025 @219931; then `Error rendering page: Failed to load script: /_next/static/chunks/pages/_error-46dc075e4a0d5370.js` |
| DOM survival summary | before: 734 elements (660 in root), 1,957 chars of text, 38 swiper nodes. After: 70 elements, root empty, 0 text. Both root children removed. The detached main subtree held 169/658 at settle, which mixes hydrate, layout-effect re-renders and cleanup, so it is **not** a survival figure |
| responsive probe | 1440 → 390: 0 mutations. **Not measurable**, because nothing was mounted |
| baseline mutation | **no** (Phase 2 tree and Phase 1 tree sha256 unchanged; `executionIndependence` still `unknown`) |
| source JS mutation | **no** (all 9 served 200 with graph sha256; activation reverts byte-exact) |
| reviewer findings | 0 BLOCKER · 1 MAJOR · 6 MINOR · 7 NOTE. All accepted. Reports and result labels corrected. Harness defects fixed for future runs. No rerun needed (`06`) |
| validation | static preflight 80/80 · runtime preflight 4/4 · one browser run · result consistency 65/65 |
| recommended next step | **3B.1**: operator decision on inert tracker-global stand-ins, then rerun this same bounded experiment once (`07`) |

## The 15 questions

1. **Did all required preserved source scripts load locally?** Yes. 9/9 were served from
   the evidence path map with status 200, byte-identical, and executed (webpack registry holds
   chunks 9774, 179, 2888, 2924, 7925, 5405).
2. **Did webpack boot?** Yes.
3. **Did Next.js boot?** Yes. `window.next.version` is 12.3.4, the router is ready at
   pathname `/`, and `__NEXT_P`, `__BUILD_MANIFEST` and `__SSG_MANIFEST` are present.
4. **Did React hydrate/attach?** It attached, and the legacy hydrate **committed**. The
   `Next.js-hydration` measure (17 ms) is emitted only from the hydrate root's layout-effect
   callback. The tree **did not stay mounted**: it was unmounted in the first passive-effect
   flush.
5. **Were the four data requests attempted?** Yes, all four, from the `pages/index` effects.
6. **Were all four intercepted without contacting the source API?** Yes. The router fulfilled
   them (`route.fulfill` never touches the network). Their preflights are answered inside
   Playwright.
7. **Did any tracker/widget/source external request escape?** No. 0 escapes. The only
   non-local attempt apart from the API calls was the hero MP4, which was blocked.
8. **Did source JS bytes remain unchanged?** Yes.
9. **Did the accepted Phase 2 clone remain unchanged?** Yes.
10. **What happened to the Phase 2 runtime DOM after hydration?** It was entirely removed
    from the document when the app crashed. How much would have survived hydration alone is
    **unmeasured**.
11. **Did the runtime respond to one viewport resize?** It could not be measured, because the
    tree was already unmounted (0 mutations).
12. **Is source runtime execution now proven possible for this captured build?** *Execution*
    and *bootstrap through hydrate commit* are proven. A *running application* is not: with
    trackers dead, it cannot stay mounted unless the tracker-global dependency is satisfied.
13. **Is missing DATA now the main blocker?** **No, not yet.** The first blocker is the
    unguarded tracker global, and the second is the missing `_error` chunk. Data (Phase 3A) is
    still certain to block content, but this run cannot rank it until the app stays mounted.
14. **Is Strategy B needed as a diagnostic control?** Not to explain *this* failure, because
    the cause is DOM-independent and B would crash the same way. Whether the Phase 2 DOM
    survives hydration is still open under either strategy. B may become justified after 3B.1.
15. **What exact Phase 3C step is justified?** None of Phase 3C yet. The justified step is
    **3B.1**:
    - the operator decides to allow **inert, network-free stand-ins** for tracker globals that
      first-party code calls unguarded (`karrotPixel.track`, and later `fbq` and `Kakao.*`);
    - with the same artifact recipe, replay set, stubs and viewport, rerun the boot experiment
      once;
    - take an earlier identity snapshot, and read it as "hydrate + layout effects".

    Only if the app then stays mounted with the carousels empty does
    *BOOT PROVEN — READY TO DESIGN PHASE 3C DATA REPLAY* follow.

## What changed on disk

- **New experiment artifact:** `data/apartmentary.com/runtime-experiments/2026-09-16T08-42-21-971Z/`
- **New harness:** `tmp/source-preservation-phase3b/`.
  - `lib/` is generic, and the guard confirms it holds no site tokens.
  - `experiment-config.json` holds every site value.
  - `run.mjs` and `adjudicate.mjs` are experiment- and framework-specific by design.
- **New reports:** `docs/result/source-preservation-phase3b/` 00–07.
- **Not touched:** anything in `src/`, `package.json`, the Phase 1 run, the Phase 2 clone, and
  the Phase 2 preview server.

## Reports

| file | contents |
|---|---|
| `01-experiment-design.md` | artifact, harness, replay set, stub shapes (with the banner correction), run protocol |
| `02-static-preflight.md` | §21 assertions → checks, 80/80 |
| `03-boot-result.md` | stage ledger S1–S7, the blocker, B1–B9 automatic and adjudicated |
| `04-hydration-survival.md` | before/after, node identity, why survival is UNKNOWN |
| `05-network-isolation.md` | router and resolver layers, interceptions, blocked requests, byte identity, integrity, limits |
| `06-independent-review.md` | findings, verification, dispositions, rerun decision |
| `07-phase3c-handoff.md` | ordered blockers, operator decision, the 3B.1 step |

**STOP. Phase 3C not started.**
