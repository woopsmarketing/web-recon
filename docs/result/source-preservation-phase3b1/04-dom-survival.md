# 04 — DOM survival (a separate dimension from boot and mount)

**hydrationStatus = `MIXED`** (adjudicated). The automatic value, `FAILED`, stays visible in
`runtime-result.json → hydrationStatusAutomatic`.

## Three measurement points

| point | how | name |
|---|---|---|
| **A** pre-execution | first runtime script held at the router, parsed accepted DOM | pre-execution |
| **B** commit point | synchronous snapshot inside the framework's `performance.measure("Next.js-hydration")`, emitted by `ne` (main @17869), which runs in the layout effect of Root `ae` (@18514, wired @20645). Root is the outermost component, so every descendant layout effect has already run (corrected per review MINOR 1) | **POST_HYDRATE_PLUS_LAYOUT_EFFECTS** |
| B′ | the first microtask after that measure call | first-microtask |
| **C** settled | load, then ≥1.5 s network quiet, then 2 s | settled |

**B is not pure hydration.** It is taken in the layout-effect phase of the hydrate commit, so
it includes the hydrate reconciliation and any direct DOM work done by layout effects.
State updates scheduled by those layout effects are flushed after the commit completes, which
is why B′ was also recorded.

## Summaries (`#__next`)

| measure | A pre-exec | B commit point | B′ first microtask | C settled |
|---|---|---|---|---|
| elements in `#__next` | 660 | 171 | 213 | 213 |
| textContent length | 1,769 | 497 | 522 | 522 |
| swiper-class nodes | 38 | 0 | 0 | 0 |
| `[data-aos]` nodes | 16 | 2 | 2 | 2 |
| buttons | 32 | 21 | 24 | 24 |
| images | 41 | 10 | 9 | 9 |
| pre-execution root nodes still in root | 660 | **60** | 59 | **59** |
| client-created root nodes | 0 | 111 | 154 | 154 |
| stand-in calls so far | 0 | **0** | **1** | 1 |
| top-level children | Backdrop + main Box (658) | **same two nodes**; main Box 169 | same; 211 | same; 211 |

Timing facts:
- **B → B′:** passive effects ran, since the stand-in count went 0 → 1. A synchronous re-render
  then inserted desktop header navigation (25 nodes) and re-created the two "more" buttons
  under a new parent. The desktop nav disappears again at 390 px (`05`). The pattern fits MUI
  `useMediaQuery` switching from its `false` default to desktop.
- **B′ → C:** **0 removed, 0 inserted, 0 class changes** in the root. The four empty API
  responses changed nothing further.
- The main Box at B held 169 elements. That is the same number the parent run found in its
  detached subtree, which is consistent with that subtree having been frozen at the commit
  point when the crash unmounted it.

## Where the loss is: data attribution (A, from `dom-before.html`)

| data-driven subtree (fed by a stubbed API) | roots | elements | text chars |
|---|---|---|---|
| main-banner carousel (`swiper-container`) | 1 | 115 | 0 |
| portfolio lists (area 1 + 2) | 2 | 238 | 828 |
| portfolio list arrows | 4 | 20 | 0 |
| reviews block (heading + cards) | 1 | 72 | 421 |
| **total data-driven** | 8 | **445 / 660** | **1,249 / 1,769** |
| **non-data remainder** | — | **215** | **520** |

At settle the root holds **213 elements / 522 text chars**, against 215 / 520 non-data before.
The page's non-data content is back at essentially its full size. **Node identity is not:**
only 59 of the 215 non-data nodes are the original Phase 2 nodes. The rest were removed and
re-created. **Exactly 156** removals fall outside the data subtrees: the review confirmed that all 445 data elements were removed intact.

Data-driven subtrees were identified from the removed-subtree descriptors and their text
samples (portfolio names and prices, review quotes). They were then counted in the serialized
pre-execution DOM (`tmp/source-preservation-phase3b1/adjudicate.mjs`, run-specific).

## Automatic `FAILED` on node identity; adjudicated `MIXED`

The automatic rule marks `FAILED` when fewer than 10% of pre-execution root nodes remain at the
commit point, and 60/660 = 9.1%. Most of that loss is expected empty data: 445 elements that the
client renders empty against stubs. Neither extreme fits:
- **`FAILED` is correct for node identity but overstates the result as a whole,** because
  non-data *content* is fully restored;
- **`SURVIVED` or `DEGRADED_EXPECTED_EMPTY_DATA`** is also wrong, because desktop-only layout was
  absent at the commit point and re-created by the media-query re-render. That replacement is
  node-identity loss that has nothing to do with data.

**Stated plainly (review MINOR 2):**
- **Node identity outside the data subtrees is mostly lost too:** 60/215 (≈28%) at the commit
  point and 59/215 at settle.
- **Content outside the data subtrees is restored.**
- **Only ≈42 re-created nodes are attributable to the media-query re-render** (commit point → first
  microtask). The remaining non-data replacement at the commit point has **no named cause**. It is
  a mismatch between the client render and a captured *post-data desktop* DOM, not SSR HTML.
- **Hydration mismatch depends on the DOM being hydrated,** so this loss may be partly specific to
  Strategy A.

## Stale classes

`swiper-slide-active` 4 → 0, `swiper-initialized` 4 → 0 (the carousels are gone).
`aos-animate` 16 → 2: the 2 remain on retained nodes, and the others went with data subtrees or
re-created nodes.

## Visual (screenshots in the artifact)

- **`after.png` (1440):**
  - present: header nav, intro block ("기대와 설렘이 가득한 리모델링 경험"), both portfolio section
    headings with their "more" buttons, the lifestyle photo, the footer;
  - blank or empty: the hero/banner area (empty carousel, hero video blocked) and the
    portfolio lists, with **two inserted "0" text nodes**, one after each "more" button. They are an empty-stub artefact and account for 522 − 520 = 2 chars, so the settled non-data text is otherwise character-identical;
  - absent: the reviews area.
- **Anomaly:** the footer's three columns overlap or collapse into a narrow column at 1440, which
  `before.png` does not show. It is recorded, not investigated, because 3B.1 makes no fidelity
  judgement.

## Limits

- Data attribution uses class and text evidence for this capture. It is not a general
  data-dependency analysis.
- The B snapshot shows *that* desktop-only nodes were absent at the commit point, but not which
  component's render produced each replacement.
- Why the footer layout breaks is not established. One lead: `dom-after.html` has one extra `<style data-emotion="css">` and one extra `<style data-emotion="css-global">` tag, inserted by the client emotion cache (before: 1 each; after: 2 each). Unproven.
- The empty-stub DOM is not a real site state and must not serve as a fidelity reference.
