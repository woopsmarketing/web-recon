# 04 — Runtime result

Artifact `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/` (`runtime-result.json`,
`run-stdout.json`).

## Gate sequence

| gate | result |
|---|---|
| static preflight | 118/118 |
| control equivalence | 36/36 |
| runtime preflight (guard before navigation, outbound default block, stub interception, gate untouched, local mirror installed) | 5/5 |
| pre-execution gate (first runtime script held, stand-in installed before any script, not yet called, only activated scripts executable, no webpack/next/measure yet, API routing ready, outbound blocked, **served document = Strategy B sha, `__NEXT_DATA__` present, `matchMedia`/`MediaQueryList` native, lifecycle recorder ready, scroll [0,0]**, preflight+equivalence passed) | 17/17 |
| B0 identity registration (row + anchor found, 4 children) | ✅ |
| result consistency (`result-consistency.json`) | 34/34 |

The superseded attempt `…14-28-51-591Z` failed the pre-execution gate on `gate.B.noMatchMediaForcing`. It was a
harness false positive: WebIDL puts `matchMedia` on the Window instance, so `hasOwnProperty` is natively true.
This was verified in a blank Chromium page, and the check was corrected. The runtime was **never released** in that
attempt. Its directory is left unmodified.

## Boot / mount / hydration

| | Strategy A (3C) | **Strategy B** |
|---|---|---|
| bootStatus | BOOT_PROVEN | **BOOT_PROVEN** |
| mountedStatus | STAYED_MOUNTED | **STAYED_MOUNTED** (settle, autoplay wait, click, resize) |
| fatal errors | 0 | **0** |
| console errors | 1 (blocked hero mp4) | **1** (the same blocked hero mp4) |
| `Next.js-before-hydration` / `Next.js-hydration` | present | present (0–419 ms / 419–432 ms) |
| stand-in `karrotPixel.track` calls | 1 | **1** (after B1, before B2) |
| hydration automatic (commit vs pre-execution root) | **FAILED**: 60/660 retained, 600 removed, 111 inserted | **SURVIVED**: 171/171 retained, 0 removed, 0 inserted |
| first microtask after commit | 59/660 retained | 156/171 retained, 15 removed, 57 inserted (the md re-render) |
| settled root elements | 660 | **660** |
| tracked at settle (carousel nodes / aos / buttons / root images / videos) | 38 / 16 / 32 / 41 / 1 | **38 / 16 / 32 / 41 / 1** |
| after 390 resize: root elements, carousel nodes, buttons, root images | 601, 35, 21, 34 | **601, 35, 21, 34** |

The pre-execution root sizes differ by design: A 660 elements with Phase 2 data subtrees, B 171 SSR elements without
data. The commit-point comparison is therefore about **reuse of what was there**.

- **B:** every SSR element was reused at the commit.
- **A:** only 60 were reused. 3B.1 adjudicated A's non-data share as about 215 elements, so A reused 60/215 non-data
  nodes.

## Data (4/4 local)

| stub | decision | items | response bytes |
|---|---|---|---|
| mainBanners | stub-fulfilled | 9 | same as A |
| portfoliosArea1 | stub-fulfilled | 10 | same as A |
| portfoliosArea2 | stub-fulfilled | 4 | same as A |
| reviews | stub-fulfilled | 6 | same as A |

There were 0 unmatched API-origin requests and 0 preflights reaching the route: Playwright answers intercepted
preflights internally, the same as A. The synthetic images served all matched the manifest sha.

## Source JS

9/9 scripts were served with the sha256 of the bytes sent equal to the runtime-graph sha, in replay order. There was no
patch, and `sourceJsBytesModified:false`.

## Fonts / assets

- B loaded 6 font files through the evidence path map.
- A loaded 8 font requests (6 distinct bodies: 2 `/_next/…otf` + 6 `../assets/*.otf`).
- **The distinct font sha sets are identical (6 = 6).**
- The router local mirror for gstatic URLs was not used.
- The only blocked resource in both arms is `main-introduce.mp4` on the S3 host.
