# 09 — Next step

**Real API capture and replay were not implemented. Strategy B was not built.**

## Established by 3C

1. **Data replay works mechanically.**
   - Schema-faithful synthetic responses make the unmodified source runtime render all four data areas.
   - It builds 4 live Swiper instances with the source's own slides-per-view, loop and autoplay, and
     prev/next handling.
   - It restores Phase 2's structural counts (660 elements, 38 carousel nodes, 32 buttons, 41 images).
   - It stays mounted with 0 fatal errors.
2. **The runtime still switches layout at 390.** Slides-per-view 3 → 1, reviews re-grouped 6 → 3 slides,
   mobile header, mobile hero images, and counts equal to the Phase 2 mobile capture.
3. **The frontend data contract is small and known** (`01`): 4 endpoints, non-null items required, portfolio `uuid`
   needed for a valid key/link, one crash-prone field (`pricePerSize` outside the price ranges), and no
   `next/image` path.
4. **The footer anomaly is not about data or styles.**
   - It is a positional hydration mismatch: the first client render uses the below-md branch
     (`useMediaQuery` default `false`), while the Strategy A hydration base is the desktop post-runtime
     DOM.
   - The mismatch leaves a stale class on a reused node, at 1440 and at 390.
   - Duplicate Emotion tags were disproven as the cause (`05`, `06`).

## Ordered blockers now

| # | blocker | class | evidence |
|---|---|---|---|
| 1 | **Hydration base mismatch** (Strategy A post-runtime DOM vs the first client render). Visible as the footer collapse at both widths, and as client re-creation of subtrees | FIDELITY / STRATEGY | `05` F1 identity + mutation sequence |
| 2 | Real content data not captured | DATA / capture policy | fixtures prove the contract and mechanics only |
| 3 | Scroll-triggered AOS cards start hidden until scrolled (source behaviour; affects static captures only) | REVIEW/CAPTURE artefact | `03` visual caveat |
| 4 | Latent `fbq` / `Kakao` calls; uncaptured `_error` chunk; banner-video host unproven | latent | 3B.1 `08`, `01` |

## Is Strategy B control now justified? **Yes, as one bounded control. Not as a build.**

The brief's condition is met. The evidence points to the footer anomaly being caused by **hydrating the
Phase 2 post-runtime DOM**, not by ordinary source-runtime behaviour:
- the SSR `response.html` carries the below-md footer classes the first client render expects;
- the observed mismatch sequence requires the captured DOM to be in the md state.

Strategy A has no in-bounds fix:
- source JS must not be patched;
- a CSS override or tag reordering is forbidden;
- neither would address the underlying node re-use.

The claim is unproven until a hydration base that matches the first client render is tried.

**Proposed control (for operator approval, not started):** the same harness and fixtures, with the
experiment document built from the captured SSR `response.html` (Strategy B) instead of the Phase 2 DOM.
One desktop run and one resize. Measure the same F0/F1/F2 footer probes, commit-point node identity,
carousel instances and structural counts.

Decisive outcomes:
- **B footer correct and non-data nodes retained at commit** → the hydration base is the fix. The
  preservation strategy should hydrate SSR markup, with the Phase 2 DOM kept as the static fallback.
- **B footer also collapses** → reject this explanation, and reopen `05`.

Reviewer additions (accepted):
- Judge the control on **commit-point row identity and classes**: 4 children, no stale class, no
  client-created column subtree. Screenshots are not enough.
- The SSR document also changes the style-tag makeup, so a correct footer shows the hydration base
  matters but does not by itself validate the whole strategy.
- A **cheaper discriminator** within Strategy A: hydrate the **Phase 2 mobile DOM** at 390, which should
  match the first client render, then resize to 1440. This is also a single bounded run and needs
  operator approval.

## Is Strategy A still viable?

- **For boot, mount, data and responsive behaviour: yes.**
- **For a faithful hydrated DOM: not without a matching hydration base.** The mismatch is structural, not
  cosmetic, and the same class of defect can recur in any media-query-dependent component.

## Is real API-body capture/replay the next step? **Not yet the next experiment.**

- The operator can make the **capture-policy decision** now: which 4 endpoints on the shared cross-origin API host (`dev-api.apartmentary.com`),
  host/CORS handling, size bounds and PII handling (corrected per review MINOR 1). The contract in `01` is the input.
- Implementation should wait for the Strategy B control, because the hydration base decides where and how
  replayed data enters the page.
- Real data would not fix blocker 1: the footer fails identically with empty and synthetic data.

## Not justified yet

- Real API harvesting or snapshot capture.
- A production fetch/XHR replay shim.
- Backend replication.
- A footer CSS patch or Emotion tag manipulation.
- Source-JS patches.
- Pre-emptive `fbq`/`Kakao` stand-ins.
- A width sweep or generic breakpoint constants.
- Promotion of the 3C libs into `src/`.

## Reusable pieces (in `tmp/`, generic, not promoted)

| module | purpose |
|---|---|
| `tmp/source-preservation-phase3c/lib/synthetic-fixtures.mjs` | FrontendDataContract validation, stub building |
| `…/lib/style-fidelity-probe.mjs` | StyleFidelityProbe: CSSOM inventory, rule origins, computed winner, commit-point hook |
| `…/lib/instance-probe.mjs` | component instance probe, subtree mutation recorder, source-control click |
