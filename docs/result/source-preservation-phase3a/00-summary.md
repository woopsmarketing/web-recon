# Phase 3A — Generic JS runtime forensic & dependency graph

**READ-ONLY investigation. No source JavaScript was executed, no API was contacted, no
Phase 1 or Phase 2 artifact was modified, no production code was touched.** Verified after
the fact: zero files changed outside `docs/result/source-preservation-phase3a/` and
`tmp/source-preservation-phase3a/`.

Inputs: Phase 1 run `2026-09-16T05-27-10-722Z`, accepted Phase 2 clone
`2026-09-16T06-42-28-282Z`. Method: four parallel fresh-context read-only agents
(inventory · bundler forensic · feature mapping · source-bound analysis), merged and
adjudicated here, then one independent fresh-context reviewer.

## Verdict

**READY FOR PHASE 3B REPLAY EXPERIMENT**

The graph is coherent, the minimum replay set is identified, every blocker is located
to a file and offset with a named remedy, and no dependency class is unexplained.

What READY covers is narrow: it is ready to *run one bounded **boot** experiment*.
**Replaying content is blocked by capture policy**, and the serving and interception
infrastructure that experiment needs does not exist yet (see `05`).

## The finding that shapes everything

**The code graph is complete. The data graph is empty.**

Every byte of JavaScript the homepage needs to boot is on disk, in a known order. Its
publicPath is *not* tied to the source origin, and there are no dynamic chunks to
resolve. What is missing is the content those bundles fetch at runtime: four API
responses. Phase 1 never captured them, because `bodyPolicy.json = false` (§12) leaves
out API bodies by design, and `__NEXT_DATA__` has no fallback copy.

## The independent review changed the recommendation

The reviewer found **0 BLOCKER, 6 MAJOR, 9 MINOR**. Every MAJOR was checked at the cited
offset and all six held up. Four of them (M1–M4) knocked out the premises behind the
first recommendation, **B_FIRST**. The recommendation is now **A_FIRST**. Full record:
`08-independent-review.md`.

## Answers to the 17 decision questions

1. **The 19 preserved JS files.** 12 external and 7 inline, out of 30 distinct scripts
   across both viewports. 9 are the site's own Next.js runtime. The rest are third-party
   widgets, trackers and inline snippets. Cross-checked against the Phase 1 manifest,
   the Phase 1 files, the clone's 19 files and `resource-map.json`: **0 mismatches**.
2. **Load order.** webpack → framework → main → `_app` → 2924 → 7925 → `pages/index`, then
   the two manifests. Every script is `defer`, so DOM order is execution order. Webpack's
   own `e.O(0,[…])` dependency checks back up each step. HIGH.
3. **Minimum replay set.** Those 7 scripts, plus the 2 manifests (optional) and 2 CSS chunks.
4. **Swiper.** The library is in shared vendor chunk **2924**, the wrapper in **7925**, and
   the calls in `pages/index`. Verdict **B**.
5. **Can Swiper run without React? NO**, but for narrower reasons than first reported.
   *Corrected (M5):* Swiper core does find slides through DOM queries, and its settings
   are recoverable as literals in the bundle. The behaviour is what can't be separated:
   slide state is copied into a mobx store through React callbacks, `slidesPerView` comes
   from a React hook, and five controls reach Swiper through a React ref.
6. **AOS** is bundled *inside* `pages/_app`, so it can't be isolated or dropped.
7. **Responsive switching** uses MUI `useMediaQuery` (`matchMedia`) in `_app`, and the
   decision is made in `pages/index`. Mobile ships **byte-identical chunks**, so desktop
   and mobile are two runtime states of one program.
8. **Menu, modal and navigation.** MUI Portal + ModalManager in 2924, `createPortal` in
   framework, and `next/router` in `_app`, with 8 `router.push` calls in `pages/index`.
   The page has zero `<a href>` elements.
9. **Scripts that reference source APIs** *(corrected, M6)*. **`pages/index` calls all
   four endpoints directly.** 7925 supplies the base URL actually used plus the service
   registry. `_app` holds the generated client, the axios adapter and a default base URL
   that gets overridden.
10. **UI/data coupling: `RUNTIME_COUPLED`**, not just sharing a bundle. All four carousels
    check the length of mobx arrays that only `useEffect` axios calls fill. With no API
    response, the components return `null`.
11. **Missing chunks? No.** Nothing the homepage requires is missing. `polyfills-*` is
    `nomodule`, which modern browsers never run. 32 *other* route chunks were never
    captured, so `<Link>` navigation would return 404.
12. **Source-origin publicPath? No.** It is `r.p = "/_next/"`, root-relative, so the
    replay must be served from a server root.
13. **Safe candidates for local replay.** webpack, framework, `_buildManifest` and
    `_ssgManifest` as they are. `main`, 2924 and `pages/index` once their dependencies
    are loaded.
14. **Should stay blocked.** `_app` and 7925 until the API host is intercepted, plus all
    16 trackers and the 4 external widget scripts.
15. **Strategy: A_FIRST** *(reversed from B_FIRST after review)*. Activate the replay
    set on a *copy* of the Phase 2 DOM. It reuses the existing `data-preservation-*`
    channel and keeps trackers neutralized. It can also measure boot and hydration
    survival separately in one run. B would need a second transform system, and served
    raw it runs the trackers.
16. **What could make it wrong.** A hydration crash early enough to hide whether boot
    worked. Client-only state Phase 1 doesn't store (an `accessToken` cookie read). Or a
    Phase 3 goal of "keep the pixels, add motion", which neither strategy serves.
17. **Generic architecture.** A generic core (scripts, DOM order, initiators, edges with
    evidence), with *optional* framework recognizers layered on top. Role and execution
    are separate axes. Phase 1's `executionIndependence: "unknown"` stays as it is. API
    calls are intercepted in the browser rather than by editing bytes, and runtime replay
    gets its own serving mode (see `06`).

## Stack

webpack 5 · Next.js 12.3.4 (Pages Router) · React 17.0.2 on the **legacy** root
(`hydrate`, not `createRoot`) · Emotion ≥11.9 · SSR only, zero SSG · build
`yMHNQjHujDVTgIp539WqR`.

## Blockers, located

| blocker | where |
|---|---|
| 4 content XHRs, response bodies never captured | desktop n0030–n0033, mobile n0032–n0035; `bodyPolicy.json = false` |
| API base URL is a build-time literal | effective: `sc0027` @260409; default: `sc0025` @257488; no env indirection |
| Calls go to an absolute cross-origin host | a same-origin proxy or service worker can't intercept them; needs browser-level routing |
| Phase 2 preview blocks scripts and serves from subdirectories | `serve.ts` `script-src 'none'`; `/desktop/`, `/mobile/` |
| `/_next/image` and `/_next/data/` need a live Next server | `sc0024` @16480/48641, @25240/74808/76686 |

The source site itself sends **no CSP**.

## Ledger findings

1. The residual ledger records **no** runtime API dependency. That breaks Phase 2's own
   rule that silence about a residual counts as a failure.
2. Phase 2's MINOR 7 is confirmed: icon URLs inside the web-manifest JSON were not
   rewritten. **Safe to rewrite.**
3. New: `__NEXT_DATA__` contains two absolute URLs that were not rewritten. **Record them,
   but do not rewrite.** It is hydration input and must stay byte-for-byte identical.
4. New: Phase 1 captured the Karrot pixel UMD body even though `analyticsScript=false`,
   because the provider table has no entry for it.

## Validation

`tmp/source-preservation-phase3a/validate-graph.mjs`: **300 checks, all pass.** It checks
that ids are unique and in a fixed order, and that every edge endpoint resolves and
carries evidence and a confidence level. It checks that the replay-set ids exist, local
paths exist, and sha256 and byte counts match. It checks that all 19 clone bodies are
accounted for and that roles and execution classes use closed vocabularies. It checks
that no graph edge type is missing from `06`. Last, a generality guard scans `06`'s type
and recognizer definitions for source-specific names. The guard was mutation-tested:
**3 of 3 injected violations were caught.**

## Reports

| file | contents |
|---|---|
| `01-script-inventory.md` | 30 scripts, id rule, capture gaps, reconciliation |
| `02-dependency-graph.md` | stack, publicPath, load order, chunk table, Mermaid graph |
| `03-feature-mapping.md` | feature→bundle map, Swiper separability, UI/data coupling |
| `04-source-bound-and-api.md` | endpoints, base URL, interception, widgets vs trackers, ledger |
| `05-replay-feasibility.md` | replay set, required infrastructure, strategies A and B |
| `06-generic-runtime-architecture.md` | generic core + recognizers, serving mode, generality guard |
| `07-phase3b-recommendation.md` | the bounded experiment, what not to do, carry-forwards |
| `08-independent-review.md` | review findings, verification, dispositions, the reversal |
| `runtime-graph.json` | 30 scripts, 26 edges, 9-step replay set, strategies |
