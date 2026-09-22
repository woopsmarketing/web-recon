# Phase 3C — Synthetic data replay + footer fidelity forensic

## Verdicts

**Primary: RUNTIME DATA REPLAY WORKS — FIDELITY BLOCKER REMAINS**

**Footer: FOOTER_STRATEGY_A_MISMATCH_SUSPECTED**

With schema-faithful synthetic API responses, the preserved source runtime, with its bytes unchanged:
- rendered the hero, both portfolio lists and the reviews;
- built 4 live Swiper instances with the source's own configuration;
- restored Phase 2's structural counts exactly;
- stayed mounted, with 0 fatal errors and 0 escaped requests;
- still switched its React tree at 390 px.

Data replay is therefore not the blocker. The footer anomaly is not caused by missing data or duplicated
Emotion styles. At the commit point it was observed as a positional hydration mismatch: the source's
first client render takes the below-md branch, while Strategy A hydrates a DOM captured after the md
re-render, so a reused node keeps a stale 100 px class, at 1440 and at 390. That is a fidelity blocker of
the hydration base, and it justifies one bounded Strategy B control. Nothing was built for it.

## Report

| item | value |
|---|---|
| experiment | `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/` (attempt 2; attempt 1 `…10-47-09-345Z` superseded for 2 harness defects, `03`) |
| data contract | 4 endpoints; 80/80 evidence snippets re-found at byte offsets; items must be non-null objects; portfolio `uuid` needed for a valid key/link; `pricePerSize` crash-prone outside price ranges; no `next/image` (`01`, `data-contract.json`) |
| fixtures | 4 deterministic fictional fixtures: hero 9, area 1 10, area 2 4, reviews 6; 46 local placeholder PNGs; 216/216 contract checks; no source text or bytes (`02`, `synthetic-fixtures.json`) |
| rendered data sections | **4/4**: hero 9 slides, area 1 10 cards, area 2 4 cards, reviews 6 cards; every slide carries fixture content |
| Swiper | **4 live source instances** (`el.swiper`, initialized); none before release; hero loop+autoplay advanced on its own; a click on the source next arrow moved area 1 by one slide (−463.333 px) |
| structural counts at 1440 | Phase 2 → 3B.1 empty → **3C**: root elements 660 → 213 → **660**; carousel nodes 38 → 0 → **38**; buttons 32 → 24 → **32**; images 41 → 9 → **41** |
| responsive (390) | slidesPerView 3 → 1; reviews 6 → 3 slides (2 per slide); desktop nav removed; mobile hero images; counts 35 carousel nodes / 21 buttons = Phase 2 mobile capture; 0 errors; mounted |
| footer | **not fixed by data**: wrapper `css-v7v99c` 100 px (Phase 2: `css-1rr4qq7` flex:1, 908 px); columns 33 px; also broken at 390 (`05`) |
| style/Emotion | 2 client speedy tags inserted (CSSOM-only rules); rule texts duplicated, byte-identical; **disproven as cause**: `width:100px` is a single preserved rule, unchanged from F0 to F2, and F1 was already collapsed (`06`) |
| network | escaped **0**; 4/4 API from fixtures; 1 blocked (known hero mp4); 0 tracker/widget attempts; source API never contacted (`07`) |
| source JS | byte-identical (9/9 sha256 in transit); no patch |
| baselines | Phase 1 run and Phase 2 clone tree hashes unchanged |
| validation | preflight 117/117 · gate 11/11 · runtime preflight 4/4 · consistency 147/147 |
| reviewer | 0 BLOCKER · 0 MAJOR · 5 MINOR · 4 NOTE, all accepted and corrected in the reports; both verdicts and the bounded Strategy B control independently confirmed; no rerun (`08`) |
| next justified step | one bounded hydration-base control, subject to operator approval: Strategy B (SSR response document + same fixtures), or the cheaper Strategy A mobile-DOM-at-390 discriminator. The capture-policy decision may proceed in parallel; no capture implementation (`09`) |

## The 15 questions

1. **Was the frontend data contract recovered without guessing?** Yes. Every field comes from code with a
   byte offset and snippet, all 80 re-verified. Things no code shows are listed as unproven: reviews
   `totalCount`, other `type` values, the `textColor` type, and the banner-video host.
2. **Did all four synthetic fixtures match the actual consumed contract?** Yes: 216/216 checks, no
   unconsumed fields, envelopes exactly as the code reads them, and all 4 fulfilled and rendered with 0 errors.
3. **Did the source runtime render all four data-driven areas?** Yes: hero 9, area 1 10, area 2 4,
   reviews 6.
4. **Did the source Swiper runtime initialize?** Yes: 4 live instances created by source React components,
   and autoplay and prev/next working. The harness constructed nothing.
5. **Did portfolio/review visible counts behave as the source runtime dictates?** Yes. At 1440: 3 visible
   per list (slidesPerView 3), hero 1. At 390: 1, with reviews regrouped into 2 per slide. These match
   the bundle literals.
6. **Did the app stay mounted?** Yes, through settle, autoplay, a click and the resize.
7. **Did responsive runtime still switch at the narrow viewport?** Yes: component-tree changes, Swiper
   recalculation, and counts equal to the Phase 2 mobile capture.
8. **Did synthetic data require any source-JS change?** No.
9. **Did any real external request escape?** No, 0.
10. **Did restoring data fix the footer anomaly?** No. It is identical with empty and with synthetic data,
    and already present at the commit point, before any API response.
11. **If not, what changed in footer computed layout?** The column wrapper went from class `css-1rr4qq7`
    (`flex:1 1 0%`, 908 px) to `css-v7v99c` (`width:100px`, flex 0 1 auto). The grid became 100 px, and
    the three columns shrank from 303 to 33 px. The footer grew from 1,386 to 2,058 px tall. Display,
    direction, wrap, gap, grid-template, font, white-space and overflow are unchanged.
12. **Were Emotion/style duplicates proven causal, disproven, or unresolved?** Disproven as the cause.
    They exist (2 client tags, duplicated identical rules), but the breaking rule is a single preserved
    rule, applied because of a stale class.
13. **Is Strategy A still a viable preservation path?** Viable for boot, mount, data replay and
    responsive behaviour. Not viable as-is for a faithful hydrated DOM, because the hydration base
    mismatches the first client render, and there is no in-bounds fix without patching.
14. **Is Strategy B control now justified?** Yes, as **one bounded control run**, because the evidence
    points at hydrating the post-runtime DOM: the SSR `response.html` carries the below-md footer classes
    the first client render expects. It has not been built.
15. **Is real API-body capture/replay the next step?** Not as the next experiment. The capture-policy
    decision can be made now, using `01` as input. Implementation should follow the hydration-base
    decision, because real data would not fix the footer.

## On disk

- **Harness** (new): `tmp/source-preservation-phase3c/`
  - generic `lib/`: `synthetic-fixtures.mjs`, `style-fidelity-probe.mjs`, `instance-probe.mjs`;
  - site-specific: `experiment-config.json`, `build-contract.mjs`, `generate-fixtures.mjs`;
  - derived from 3B.1: `prepare.mjs`, `run.mjs`, `check-result.mjs`;
  - `synthetic-assets/`, `contract-evidence/`.
- **Artifacts:** attempt 2 (authoritative) plus attempt 1 (superseded).
- **Reports:** `docs/result/source-preservation-phase3c/` 00–10, `data-contract.json`,
  `synthetic-fixtures.json`.
- **Not touched:** `src/`, `package.json`, the Phase 1 run, the Phase 2 clone, the 3B/3B.1 artifacts and
  harnesses.

**STOP. No real API capture or replay, no Strategy B build, no footer patch.**
