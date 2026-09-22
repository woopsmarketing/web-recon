# 03 — Boot and mounted result

**bootStatus = `BOOT_PROVEN`. mountedStatus = `STAYED_MOUNTED`.** One browser run
(attempt 1). No second run was needed, because no new blocker appeared.

## Stage ledger

| stage | reached | evidence |
|---|---|---|
| S1 all 9 replay scripts loaded, byte-identical | yes | server log: 9 × 200 with sha256 equal to the graph; browser 200 for each |
| S2 webpack runtime | yes | `webpackChunk_N_E` registry holds chunks 9774, 179, 2888, 2924, 7925, 5405 |
| S3 Next bootstrap | yes | `window.next.version` 12.3.4, router ready at `/`, emitter present |
| S4 legacy hydrate committed | yes | `Next.js-hydration` measure (start 706 ms, 14 ms long); `_reactRootContainer` on `#__next`; the commit-point snapshot fired exactly once |
| S5 first passive-effect flush, including `karrotPixel.track` | yes | stand-in call count 0 at the commit point, 1 by the first microtask; call at 722.9 ms |
| S6 four API calls stubbed | yes | 4/4 `stub-fulfilled` |
| S7 stayed mounted through settle and one resize | **yes** | see below |

In the parent run, S7 failed at the `track` call. In this run the same effect ran against the
stand-in, returned `undefined`, and nothing followed.

## Mounted evidence

| | at settle (1440×900) | after resize (390×844) |
|---|---|---|
| `#__next` element count | 213 | 192 |
| React legacy root container | present | present |
| `window.next.router` | present | present |
| elements with a React fiber / props key | 213 / 213 | — |
| `pages/_error` chunk requested | **no** | **no** |
| local 404s (excluding the preflight probe path) | **0** | **0** |

## Fatal errors: **0**

- `pageerror` events: 0.
- `console.error` entries with a stack into served local code (boot + resize): 0.
- Console log in total: **1 entry**, `Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector`
  during pre-execution. That is the blocked hero video (`06`), not a runtime error.

## Boot observables (automatic)

| | pass |
|---|---|
| B1 all selected local scripts loaded | ✅ |
| B2 no uncaught bootstrap exception (including React-caught console errors) | ✅ |
| B3 Next runtime present | ✅ |
| B4 React hydrated at root | ✅ |
| B5 all four API calls attempted | ✅ |
| B6 all intercepted locally | ✅ |
| B7 zero API calls reached the source | ✅ |
| B8 zero tracker or widget escapes | ✅ |
| B9 runtime responded to resize | ✅ |

`bootStatusRule`:
- B1 fails → `INFRASTRUCTURE_BLOCKED`;
- any fatal-shaped error or error-page request → `BOOT_FAILED_NEW_RUNTIME_BLOCKER`;
- B3 ∧ B4 ∧ B5 ∧ `STAYED_MOUNTED` → `BOOT_PROVEN`;
- anything else → `INCONCLUSIVE`.

Hydration survival never enters this rule.

## Answers to §15

1. **Does the app now stay mounted?** Yes.
2. **Does Next stay alive after the passive-effect flush?** Yes: router present and ready,
   no error path, and still present after the resize.
3. **Do all four API requests still occur?** Yes, 4/4, from the `pages/index` effects.
4. **Does empty API data become the next meaningful limitation?** Yes (`04`, `08`).
5. **What do hydration and layout effects do to the Phase 2 DOM?** See `04`.
6. **Does the running app react to a viewport resize?** Yes (`05`).

## The stand-in did not mask a different error

Three things differ from the parent run in ways that can reach runtime behaviour:
- `window.karrotPixel`;
- the corrected main-banner stub, which fed an empty array;
- the `performance.measure` wrapper, which calls the original and returns its value.

In the parent run, the first fatal error was the `track` TypeError. Here, no fatal-shaped entry was
recorded at all, during boot or during resize.
