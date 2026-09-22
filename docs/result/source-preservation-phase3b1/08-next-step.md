# 08 — Next step

**Phase 3C has not been started.** This file records only what the evidence now justifies.

## Established for this captured build (desktop, 1440)

1. Unmodified preserved source JS boots locally and **stays mounted**:
   webpack → React 17 → Next 12.3.4 → legacy hydrate commit → passive effects → 4 API calls →
   settle → resize, with 0 fatal errors.
2. The only environmental dependency that blocked mounting was **the shape of one neutralized
   tracker global** (`karrotPixel.track`). One inert, network-free stand-in removed the block,
   with no byte patch and no tracker execution.
3. The `pages/_error` chunk was **not needed**. In the parent run, the 404 was only a
   consequence of the tracker crash.
4. The running program **responds to viewport state** with component-tree changes, not just
   CSS reflow.
5. With empty stubs, **every content loss sits in the four data-driven subtrees**: 445/660
   elements and 1,249/1,769 text chars. Non-data content is fully restored at settle
   (522 vs 520 chars), though as largely **new nodes** rather than the Phase 2 nodes.

## Ordered blockers now

| # | blocker | class | evidence |
|---|---|---|---|
| 1 | **The 4 content API response bodies are not captured** | DATA / capture policy (Phase 3A) | `04` data attribution; B′ → C shows 0 DOM change from the empty responses |
| 2 | Footer column layout overlaps at 1440 after the runtime render | UNEXPLAINED fidelity anomaly | `after.png` vs `before.png` (`04`) |
| 3 | Node identity of non-data layout is mostly replaced (59/215 kept) | RUNTIME + possibly STRATEGY-A-SPECIFIC: ≈42 nodes from the media-query re-render; the rest is an unattributed mismatch between the client render and the captured post-data DOM | `04` A vs B vs B′ |
| 4 | Unguarded `fbq(…)` / `Kakao.*` in interaction and onLoad handlers | ENVIRONMENT, same class as `karrotPixel`; latent | 3B `03` offsets; not exercised |
| 5 | `pages/_error` chunk not captured | CAPTURE SCOPE; latent | only needed if a genuine runtime error occurs |

## Is missing API data the primary fidelity blocker? **Yes**

It is the only blocker that explains the missing *content*. Blockers 2 and 3 are presentation
and identity issues on content that is otherwise present.

## Is Strategy B still necessary? **Not for boot**

Boot and mount are proven under A.

It is **still open** whether the non-data node-identity loss (#3) and the footer anomaly (#2)
come from booting over the Phase 2 DOM (corrected per review MINOR 3). Hydration mismatch
depends on the DOM React hydrates, and `dom-after.html` shows duplicated client emotion style
tags. B is the natural control for that **fidelity** question. It is not required before
designing data replay, but data replay should run with real bodies before judging either issue.

## The exact next step justified

**Design Phase 3C data replay.** It is a design and policy step, not an implementation.
1. **Capture-policy decision (operator):** whether and how the four same-origin content API
   bodies may be captured (Phase 3A `07`: same-origin allowlist, size-bounded opt-in, and PII
   handling).
2. **Replay-seam design:** how captured bodies would be served in a non-experiment context.
   Playwright routing is experiment-only.
3. **Acceptance for the next bounded experiment:** the same 3B.1 harness with captured bodies
   instead of empty stubs, measuring the same A/B/B′/C points. Only then judge fidelity,
   including the footer anomaly.

**Not yet justified:**
- API capture implementation;
- a production fetch/XHR shim;
- a runtime-preservation engine;
- mobile boot;
- `_error` or route-chunk capture;
- Swiper reconstruction;
- visual fidelity patches;
- pre-emptive `fbq`/`Kakao` stand-ins.

## Reusable pieces (not promoted to `src/`)

- `tmp/source-preservation-phase3b1/lib/external-global-standin.mjs`: a generic
  ExternalGlobalStandIn with an inertness guard.
- `tmp/source-preservation-phase3b1/lib/commit-point-snapshot.mjs`: a generic commit-point DOM
  identity snapshot keyed on a named performance measure.
- The 3B `lib/` is reused unchanged.
