# 07 — Phase 3B recommendation

> **Revised after independent review.** First version: B_FIRST. Now: **A_FIRST**. See
> `05` and `08-independent-review.md`.

## Recommendation: **A_FIRST**, scoped as a boot experiment

Activate the minimum replay set **on a copy** of the accepted Phase 2 desktop clone, by
reversing the `data-preservation-*` attributes on those nodes only. Judge it on two
separately instrumented questions:

1. **Does the runtime boot?** — sets `executionIndependence` for this build, open since Phase 1.
2. **Does the accepted DOM survive hydration?** — measured as a diff against the untouched clone.

Keep Strategy B as the diagnostic fallback if boot failure and DOM state prove inseparable.

## The one thing that would change everything

**Capture the four API response bodies.** Phase 1's `bodyPolicy.json = false` is why the
homepage's whole visible content layer is missing. With same-origin API bodies captured,
both strategies turn from boot experiments into fidelity experiments.

This is a **capture-policy decision, not a runtime one**, and it deserves a deliberate
answer. API responses can carry personal data, which is presumably why §12 excluded them.
The options are a same-origin-only allowlist, a size-bounded opt-in flag, or accepting that
content APIs stay out of scope and that runtime replay will render empty regions on
data-driven pages. Whichever is chosen, choose it on purpose.

## Bounded experiment 1 — definition

**Input:** a *copy* of `preservation-clones/2026-09-16T06-42-28-282Z/desktop/`. The accepted
clone is not modified.

**Activation:** reverse `data-preservation-src` / `-original-type` / `-bytes` on exactly
sc0022, sc0023, sc0024, sc0025, sc0026, sc0027, sc0028 (+ optionally sc0029, sc0030). No
other script node is touched. Trackers and widgets stay neutralized.

**Serving — a new, separate runtime mode, not a flag on the Phase 2 preview:**

- scripts permitted (the Phase 2 preview's `script-src 'none'` stays as it is)
- variant served at a **server root**, so root-relative `/_next/` resolves
- `buildId` path segment `yMHNQjHujDVTgIp539WqR` reproduced exactly
- both CSS chunks `80139ea3111436a9` and `d7c08271dabb56dd` resolvable

**Interception:** **browser-level request routing** of the API host to a local stub —
automation-layer interception or host-resolver mapping. *Not* a same-origin proxy and *not*
a service worker: the requests are absolute cross-origin and fire during first load, so
neither would see them. Every interception is recorded as a residual.

**Stub shape:** well-formed empty collections in the shape the code reads —
`e.data.data.data` and `.totalCount`. A wrong shape throws an unhandled rejection and
pollutes observable 1.

**Boot observables** (none require content to render):

1. no uncaught exception during bootstrap
2. `window.next` present; a React root attached to `#__next`
3. the four XHRs attempted, at the stub, with the expected paths
4. `useMediaQuery` responds to a viewport change

**Survival observables** (measured separately):

5. DOM diff against the untouched clone — which subtrees were removed, inserted, or kept
6. on kept nodes, stale classes and inline styles (`swiper-slide-active`, `aos-animate`,
   Swiper transforms) — React 17 hydration does not repair attribute mismatches, so a mixed
   DOM is the predicted result

**Explicit non-goals:** content, carousel motion, visual equivalence with Phase 2.

A clean boot sets `executionIndependence` for this build. A boot failure is equally
informative — and if it cannot be separated from the DOM state, run B as the control.

## What Phase 3B must not do

1. **Do not modify the accepted Phase 2 clone.** Work on a copy.
2. **Do not regenerate markup.** Activation is attribute reversal on selected nodes.
   Rebuilding the document re-inherits the cascade-ordering problem Phase 2 avoided.
3. **Do not weaken the Phase 2 preview's `script-src 'none'`.** Runtime replay is a separate
   serving mode; the static preview's guarantee stays intact.
4. **Do not rewrite `__NEXT_DATA__`.** It is hydration input and must stay byte-exact, even
   though it contains unrewritten absolute URLs.
5. **Do not merge the desktop and mobile variants** because their bundles are
   byte-identical. They are two runtime states of one program.
6. **Do not build a Next.js-shaped engine.** Recognizers enrich a generic graph.
7. **Do not turn the observed breakpoint into a rule.**
8. **Do not present a vanilla Swiper over the frozen DOM as preservation.** The corrected
   evidence makes it *more* viable — core discovers slides from the DOM, and the
   parameters are recoverable as bundle literals — but it drops every store-driven
   behaviour. If it is built, it is a faithful-parameter reconstruction and must be named
   that way.

## Carried forward

| item | from | state |
|---|---|---|
| Residual ledger records no runtime API dependency | 3A `04` | open — Phase 2's own rule says record it |
| Web-manifest icon URLs unrewritten | Phase 2 MINOR 7, confirmed | open — safe to rewrite |
| `__NEXT_DATA__` embeds unrewritten absolute URLs | 3A `04`, new | **record, do not rewrite** — hydration input |
| Phase 1 classifier miss: Karrot pixel UMD body (17,860 B) captured despite `analyticsScript=false`, because it has no provider hint | 3A review MINOR 8 | open — provider table gap |
| 98 MB hero video residual | Phase 2 | unchanged |
| `sourceType: "import"` and `"adopted"` stylesheet paths never exercised | Phase 2 | unchanged |
| Phase 1 capture debt (duplicate stylesheet listener, camelCase query-key redaction, aggregate byte budget, `@import` metadata) | Phase 1 | unchanged |
| 32 uncaptured route chunks → `<Link>` navigation 404s under replay | 3A `02` | scope limit, named |
| Production site calls a `dev-` API host | 3A `04` | operator observation, not a defect here |
