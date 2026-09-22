# 12 — Next step

Verdict: `HYDRATION_BASE_MISMATCH_CONFIRMED`. The prompt §35 rule therefore applies.

## Architecture implication (recommendation, not built)

Separate the two preservation roles:

| role | document | used for |
|---|---|---|
| **INITIAL / BOOTSTRAP DOCUMENT** | the document state the source program's bootstrap expects (here: the captured initial response) | interactive runtime starting point (`HydrationBase`) |
| **SETTLED RUNTIME DOM** | the Phase 2 post-runtime DOM | static preservation, visual baseline, no-JS fallback, evidence |

Generic principle to carry forward, **not** "SSR is always correct":

> Runtime replay should start from the source application's compatible bootstrap document/state.

A future `RuntimeBootstrapPlan` must **detect and classify** the site's bootstrap model before it chooses a base. The
possible models include:
- SSR/SSG + hydration;
- SPA client mount (an empty root);
- classic HTML + jQuery/vanilla (the initial document is simply the page);
- islands / partial hydration.

This result is one proof on one stack (Next 12 / React 17 legacy `hydrate` / MUI `useMediaQuery` defaulting to false).
Only a second and third stack will show how it generalises.

## The ONE next justified step

**Design (not implement) the real public API response capture/replay policy**, now on top of a Strategy B bootstrap
base. The work is to decide:
- which API bodies may be captured: the 4 homepage endpoints from the 3C data contract, on the cross-origin API host;
- size bounds and PII handling;
- how replayed data enters the page. Here it enters through the runtime's own XHRs **after** the initial-document
  hydration, which this control showed works unchanged.

Implementation of capture and a generic `RuntimeBootstrapPlan` architecture come after that design is approved.

## Carried forward (not started)

- **Record reused-lib sha256 in every experiment manifest** (review MINOR 3).
- **Other components:** 3B.1's unattributed non-data node replacement is *consistent with* the same mechanism. At the
  commit, A reused 60 of about 215 non-data elements, while B reused 171/171 SSR elements. It has **not** been
  attributed component by component, and this phase does not claim it.
- **Not tested here:**
  - repeated runs;
  - other widths, and booting directly at 390;
  - live-site comparison;
  - the React 17 "no attribute patch during hydration" step. It is inferred, and B never exercises it.
- **Latent items from earlier phases, unchanged:**
  - `fbq`/`Kakao` handler calls;
  - the uncaptured `_error` chunk;
  - the unproven banner-video host;
  - the blocked hero mp4.

## Not justified by this result

- Footer CSS patches.
- Emotion tag manipulation.
- Source-JS patches.
- A production runtime engine or SSR transformer.
- Whole-site runtime, route crawling, slotization, content replacement, the Boost Interior demo.
- Contract v2.
- Multi-framework recognizers.
