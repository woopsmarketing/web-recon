# 04 — Strategy B behaviour (§5)

Run `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/`.

| Item | Value | Evidence |
|---|---|---|
| media element exists | **yes** in B0 initial, B3 settled, B4 mobile | `dom-b0-initial.html`, `dom-b3-settled.html`, `dom-b4-mobile.html`: `<video style="object-fit:cover;width:510px;max-width:55%" muted loop autoplay playsinline><source src=…main-introduce.mp4>` |
| src / currentSrc | `<source src>` = S3 URL (currentSrc not probed in that run; same markup gives S3 URL in repro) | DOM dumps |
| poster | none | DOM dumps |
| request attempted | **yes, once**, `phase: pre-execution` (SSR parser, before any runtime script) | `network-log.json` |
| network decision | `blocked` | `network-log.json`; `runtime-result.json` `blockedOutbound[0]` |
| bucket / reason | `bucket: "source-other"`; `requestfailed net::ERR_BLOCKED_BY_CLIENT.Inspector` | runtime-result.json, network-log.json, `console-log.json` (only console error in the run) |
| retry after hydration | none recorded (hydration reuses the SSR node; no second request) | network-log.json has 1 attempt |
| readyState / networkState | not probed in the run; repro arm B with identical markup + block = 0 / 3 | repro |
| geometry | not probed; `desktop-strategy-b.png` region (224,1026→734,1348) pure white, stddev 0; heading at x≈814 row position unchanged | pixel check |
| display / visibility / opacity | not probed in run; repro arm B: block / visible / 1 | repro |

**Is THAT blocked request responsible for THIS section? Yes** — it is the only `<video>`/`<source>` on the page, the
only request to that URL, and its initiator is the parser line carrying this section's markup (01).

**Explicitly:** in Strategy B the element **is present, displayed, visible, opacity 1, left column position correct**,
but **media bytes are unavailable** (fail-closed router), no poster exists, so the box paints nothing (transparent over
white). Height collapses from 700 to ~322 because intrinsic size (1020×1400) is never learned. Not AOS, not timing,
not hydration, not autoplay policy (muted+playsInline autoplay succeeded in headless repro arm A).
