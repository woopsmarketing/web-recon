# 05 — Replay feasibility

Nothing in this report was executed. Every judgement is static.

> **Revised after independent review.** The first version recommended **B_FIRST**. That
> rested on four wrong premises (review M1–M4), each verified against code or capture
> before correcting. The recommendation is now **A_FIRST**. The reasoning for the
> reversal is in full below, and in `08-independent-review.md`.

## Minimum plausible replay set

Derived from DOM order (all `defer`), webpack's own `e.O(0,[…])` gates, and
`_buildManifest`. Real ids, not an assumed convention.

| # | id | role | why |
|---|---|---|---|
| 1 | sc0022 `webpack-*` | BUNDLER_RUNTIME | defines `__webpack_require__`, sets `publicPath = "/_next/"` |
| 2 | sc0023 `framework-*` | FRAMEWORK_RUNTIME | React + ReactDOM 17.0.2 |
| 3 | sc0024 `main-*` | BOOTSTRAP_RUNTIME | Next 12.3.4 client runtime; installs manifest callbacks |
| 4 | sc0025 `pages/_app-*` | APP_RUNTIME | app shell, Emotion, AOS, generated API client + axios adapter |
| 5 | sc0026 `2924-*` | UI_LIBRARY | Swiper core + React binding, MUI Portal/ModalManager |
| 6 | sc0027 `7925-*` | APP_RUNTIME | service registry, effective API base URL, Carousel wrapper |
| 7 | sc0028 `pages/index-*` | PAGE_CHUNK | homepage; module 2937; direct caller of all four endpoints |
| 8 | sc0029 `_buildManifest` | RUNTIME_CONFIG | route→chunk table (OPTIONAL for a single frozen route) |
| 9 | sc0030 `_ssgManifest` | RUNTIME_CONFIG | empty SSG set (OPTIONAL) |

Plus two CSS chunks: `80139ea3111436a9` (`_app`) and `d7c08271dabb56dd` (route `/`).

**OPTIONAL** sc0029, sc0030 · **BLOCKED until intercepted** sc0025, sc0027 · **EXTERNAL**
Channel Talk ×3, Kakao SDK · **TRACKER** 16 nodes · **UNKNOWN** polyfills (`nomodule`,
structurally never executed).

Everything in steps 1–9 is on disk. No dynamic chunk loading exists on this page
(`__webpack_require__.e(` call sites = 0). **No chunk the homepage needs is missing.**

## The fact that dominates both strategies

**The code is complete. The data is gone.**

The four visible content sections are `RUNTIME_COUPLED` to four XHRs whose bodies Phase 1
never captured (`bodyPolicy.json = false`, §12), with no `__NEXT_DATA__` fallback. Neither
strategy can render that content. Any Phase 3B experiment must be judged on whether the
runtime **boots**, not on what it renders.

## Infrastructure both strategies need — none of which exists

*(Corrected after review. The first version claimed the Phase 2 preview server already
satisfied these. It satisfies none of them.)*

| need | current state | evidence |
|---|---|---|
| scripts permitted | preview sends `content-security-policy: script-src 'none'` on every response | `src/preservation-clone/serve.ts` (M1) |
| served at a server root, so `/_next/` resolves | variants live at `/desktop/` and `/mobile/` | clone `index.html` (M1) |
| API calls redirected to a stub | calls go to an **absolute cross-origin host**; a same-origin server never sees them, and a service worker does not control first load | sc0027 @260409 (M3) |
| stub returns the shape the code reads | code reads `e.data.data.data` and `.totalCount`; a wrong shape throws an unhandled rejection that pollutes the boot signal | review MINOR 9 |

The request-routing need is met by **browser-level interception** — automation-layer
request routing, or host-resolver mapping of the API host — not by the preview server.

**CSP is not an unknown.** *(Corrected, M2.)* The first version called the source's CSP "a
real unknown". It is answered: `content-security-policy` is on Phase 1's response-header
allowlist, the document response n0001 carries none, and `response.html` has 0 CSP meta
tags. **The source sends no CSP.** The only CSP in play is the project's own preview server.

## Strategy A — Phase 2 runtime DOM + localized source JS

**Feasibility: the better first experiment.**

Run it on a **copy** of the accepted clone — the accepted artifact itself is never touched.

Why it is the stronger starting point:

1. **It uses the activation channel that already exists.** Every neutralized script
   carries `data-preservation-src` / `-original-type` / `-bytes`. Activation is reversing
   those attributes on the chosen nodes. No new transform system.
2. **Trackers stay neutralized by construction.** Activation is selective: only the
   replay set is reversed. The 16 trackers and 4 widget scripts are simply not selected.
3. **Boot and hydration survival are separately observable in one run.** Boot signals —
   no uncaught exception, `window.next` present, a root attached to `#__next`, the four
   XHRs attempted at the stub — do not depend on whether content survives. Survival is a
   separate DOM diff against the unmodified clone.
4. **It tests the question the product actually has**: can the accepted DOM come alive.

Expected result, stated precisely *(mechanism corrected after review, MINOR 2)*: the Phase 2
DOM was captured **after** the XHRs resolved; this build takes React 17's legacy `hydrate`
path (`sc0024:20658`), with empty stores. In production, React 17 hydration **deletes
unclaimed DOM siblings and inserts missing nodes, but does not repair attribute or
`className` mismatches**. The likely outcome is therefore not a clean re-render but a
**mixed DOM**: carousel subtrees removed, while surviving nodes keep stale Swiper inline
styles and `swiper-slide-active` / `aos-animate` classes. The server's own output supports
this — `response.html` renders the portfolio counts as `0`, the empty-collection state.

This is a prediction to measure, not a result.

## Strategy B — initial response document + localized CSS/assets + source JS

**Feasibility: lower than first reported.**

`response.html` is the raw server byte stream, and that is exactly its problem *(M4)*:

1. **It contains live third-party tags** — `kakao.js`, `kp.js`, `karrot-pixel.umd.js`, and
   inline GTM, `fbq`, `ChannelIO` and Naver snippets. Serving it as-is would run the very
   trackers this phase classifies as blocked.
2. **It carries zero `data-preservation-*` attributes.** The activation channel does not
   exist in this document.
3. So B requires **a second neutralize-and-localize pass over a second document** — a
   second transform system, running parallel to Phase 2's. The project's working rules
   forbid building a second system for a job an existing one does.

It also needs everything in the infrastructure table above, same as A.

B keeps **one** real advantage: it separates boot failure from hydration damage *by
construction*, since the source runtime was built to hydrate exactly this markup. But A
can separate the two by instrumentation (point 3 above), so the advantage does not justify
B's cost. "Zero mismatch by construction" is also plausible rather than proven: client-only
inputs such as the `accessToken` cookie read and `useMediaQuery` were not analysed.

The first version described B's document as "no content there to lose". That was wrong
*(MINOR 1)*: it holds the hero copy, CTAs, portfolio headings and full footer.

## Recommendation: **A_FIRST**

1. It reuses the existing activation channel; B needs a second transform system.
2. It keeps trackers neutralized by construction; B's document runs them unless a new
   pass removes them.
3. It measures boot and survival separately in one run, which removes B's one advantage.
4. It answers the question the product has.

Keep B available as a **diagnostic fallback**: if experiment A fails to boot and the
cause cannot be separated from the DOM state, B is the controlled comparison.

## What evidence would make this recommendation wrong

- **Boot signals that cannot be separated from DOM state in practice.** If hydration over
  the Phase 2 DOM throws early enough to abort bootstrap, A cannot tell "the bytes cannot
  run" from "the bytes cannot run *over this DOM*". Then B earns its cost.
- **Client-only inputs the capture lacks.** An `accessToken` cookie read, storage state, or
  other client state Phase 1 deliberately does not store could change the boot path in
  either strategy.
- **A different Phase 3 goal.** If the aim is "keep the accepted pixels and add motion"
  rather than "run the source program", neither strategy is the right tool. The corrected
  Swiper finding makes that third path more viable than first reported: Swiper core
  discovers slides from the DOM, and its parameters are recoverable as bundle literals. It
  would still drop every store-driven behaviour, so it belongs on the *reconstruction*
  axis, under that name.
- **Capturing the four API bodies.** If capture keeps same-origin API responses, the data
  gap closes and both strategies become fidelity experiments. This is the
  highest-leverage change available to Phase 3, and it is a capture-policy decision, not
  a runtime one.
