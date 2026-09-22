# Phase 3C.1 — Strategy B hydration-base bounded control

## Verdict

**`HYDRATION_BASE_MISMATCH_CONFIRMED`**

Scope: this footer, this build (Next 12.3.4 / React 17 legacy hydrate / MUI `useMediaQuery`), one run per strategy at
1440×900 plus one resize to 390×844. The fresh independent reviewer reached the same verdict on its own
(0 BLOCKER / 0 MAJOR).

The same preserved source runtime ran with the same 9 byte-identical scripts, the same synthetic fixtures and the same
fail-closed network. Hydrating the Phase 1 initial response instead of the Phase 2 post-runtime DOM removed the footer
failure:
- **At the hydration commit (B1):** React reused all 4 SSR row children in place, and the content subtree stayed in
  its original `flex:1` wrapper node.
- **At the md re-render (B2):** the source removed the 60 px box and rewrote the logo and row classes. That wrapper
  kept `css-1rr4qq7` and expanded to 908 px.
- **Settled desktop (B3):** the footer reproduces the Phase 2 accepted footer: wrapper 908 px, columns 302.7 px, root
  1,386 px.
- **Mobile (B4):** the same wrapper node is 350 px.
- **Rule ownership:** the identical `.css-v7v99c { width:100px }` rule (same SSR tag, same rule index, same hash as in
  A) applies only to the real, empty spacer. In A it applied to the content wrapper.

The decisive difference is **which physical node React reuses at the hydration commit**.

```
CONTROL EQUIVALENCE: PASS (36/36; not a one-variable design, co-varying differences D2–D9 listed and tested in 03/07)
SSR HYDRATION:       BOOT_PROVEN · STAYED_MOUNTED · commit 171/171 SSR root elements reused, 0 removed, 0 inserted
                     (Strategy A: 60/660 reused, automatic status FAILED)
FOOTER B0→B4:        correct at every point: grid owner = original SSR node #2 (css-1rr4qq7);
                     B3 908 px wrapper, 3 × 302.7 px columns; B4 350 px wrapper, 175/175/350
NODE IDENTITY:       Strategy A positional reuse ABSENT; no content inserted into the spacer; spacer stays empty;
                     changes are source-driven: B0#1 removed at B2, a new 60 px box at B4, logo class rewritten both ways
STYLE/EMOTION:       not a material confounder: decisive rules byte-identical in both arms; client Emotion sheet at settle
                     hash-identical to A (150 rules); A-only Phase 2 tags only duplicate client rules
DATA:                4/4 fixtures fulfilled locally (9 / 10 / 4 / 6), rendered with fixture markers on every slide
SWIPER:              4 source-created instances; hero autoplay advanced; area-1 arrow click −463.333 px (identical to A)
RESPONSIVE:          390 switch identical to A (1,552 mutations, desktop nav removed, slidesPerView 1, reviews 6→3, 601 elements)
NETWORK ESCAPES:     0
SOURCE JS:           byte-identical yes (9/9 sha256 in transit)
BASELINES:           unchanged yes (13 directories, tree sha256 from prepare to end of run)
REVIEWER:            BLOCKER 0 · MAJOR 0 · MINOR 5 · NOTE 6 (all MINOR = report wording, fixed; no rerun)
```

## Artifacts

| item | path |
|---|---|
| authoritative Strategy B run | `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/` |
| gate-blocked earlier attempt (runtime never released; harness false positive in its own `matchMedia` check) | `data/apartmentary.com/runtime-experiments/2026-09-16T14-28-51-591Z/` (left as written) |
| Strategy A comparison (frozen, not re-run) | `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/` |
| harness | `tmp/source-preservation-phase3c1-strategy-b/`: `prepare.mjs`, `run.mjs` (copy of the 3C run, marked edits), `check-result.mjs`, generic `lib/initial-document.mjs`, `lib/local-mirror.mjs`, `lib/lifecycle-probe.mjs` |
| machine-readable result | `docs/result/source-preservation-phase3c1-strategy-b/strategy-b-result.json` |
| validation | preflight 118/118 · equivalence 36/36 · runtime preflight 5/5 · pre-execution gate 17/17 · consistency 34/34 |

## Limits (what this does NOT show)

- **Not a one-variable experiment.** The hydration document carries its own style-tag composition and preparation
  differences (`03`). The attribution rests on node identity at the commit plus rule identity (`06`, `07`).
- **The React 17 "no attribute patch during production hydration" step is inferred.** It explains why A's class went
  stale, but B never exercises it.
- **One run per arm.** No repeat runs, no other widths, no boot at 390, no live-site comparison.
- **B1 is post-hydrate-plus-layout-effects, not pure hydration.** B2 is a microtask queued inside B1 that runs after
  the hydrate call; it is not provably the first microtask.
- **Other components are not addressed.** No claim is made that B fixes them or explains 3B.1's unattributed node
  replacement.
- **Nothing here is production or preservation readiness.**

## Final questions

1. **Was the hydration base derived from the captured original initial response?** Yes. It is Phase 1
   `document/response.html` (sha `95eb46dd…`, = `manifest.document.initial`). Reverting the 21 script start-tag
   splices reproduces it byte for byte (`02`).
2. **Was the Phase 2 settled DOM excluded as the hydration root?** Yes. `#__next` is byte-identical to the response and
   differs from Phase 2. The served document sha equals the prepared B document. B0 has 171 root elements (Phase 2:
   660) and no `swiper-initialized` class and no desktop `css-17taob2` class.
3. **Same preserved source runtime scripts?** Yes: the same 9, same order, same graph ids/roles. The activated start
   tags are byte-identical to A's.
4. **All executed scripts byte-identical?** Yes, 9/9 sha256 of the bytes sent equal to the graph sha.
5. **Phase 3C fixtures reused unchanged?** Yes. The contract and fixture files are byte-identical to A's frozen
   copies; stub matchers, item counts and response bytes are identical; the synthetic image path+sha set is identical.
6. **All four API calls resolved locally?** Yes, 4/4 stub-fulfilled. 0 unmatched, 0 reached the source.
7. **Reached React/Next hydration and stayed mounted?** Yes. BOOT_PROVEN, `Next.js-hydration` measure present, legacy
   root and router present, STAYED_MOUNTED through settle, wait, click and resize.
8. **Footer child structure at B0?** Row `css-14mj874` (column) with 4 children: logo `ety3zj` (43 px, 1 child) ·
   `1gapyfo` (60 px high, empty) · `1rr4qq7` (flex 1 1 0%, 7 children incl. the grid) · `v7v99c` (100 px, empty).
9. **Did B1 preserve the expected initial node mapping?** Yes. At B1 the 4 children are the same 4 nodes, same order,
   same classes; 96/96 content descendants are the B0 nodes; the grid is the B0 node. This is confirmed independently
   by the 3B.1 commit snapshot.
10. **Strategy A positional reuse reproduced or absent?** Absent. No row child was emptied, nothing was inserted into
    `v7v99c`, and there was no client-created column subtree at the commit.
11. **What happened at B2?** The source's md re-render:
    - removed B0#1 (`1gapyfo`);
    - rewrote the logo `ety3zj→17taob2`, the row `14mj874→1qi39fj` (row direction) and the grid and typography to md
      hashes;
    - inserted 14 touch-ripple spans.

    B0#2 received no class change and became 908 px wide.
12. **Which physical DOM node became the content wrapper?** The original SSR node #2 (`css-1rr4qq7`), the same node at
    B0, B1, B2, B3 and B4.
13. **Its class at B1, B2, B3?** `MuiBox-root css-1rr4qq7` at all three (and at B4).
14. **Its computed flex-grow, flex-basis, width?**
    - B1: 1 / 0% / 1400 px (column layout);
    - B2: 1 / 0% / 908 px;
    - B3: 1 / 0% / 908 px;
    - B4: 1 / 0% / 350 px.
15. **Did the 100 px spacer remain logically separate?** Yes. B0#3 `v7v99c` has 0 children at every point, 100 px wide.
16. **Desktop grid and column widths?** Grid `css-1d3bbye`, 908 px. Columns 3 × 302.7 px at B2 and B3 (Phase 2
    reference: 303 px).
17. **Correct after the 390 resize?** Yes. The wrapper is the same node, `1rr4qq7`, 350 px. Columns 175 / 175 / 350. The
    logo is 43 px, a new 60 px box sits at index 1, and the spacer is empty.
18. **Did the same `css-v7v99c { width:100px }` rule still exist?** Yes. It is in the SSR `css` Emotion tag (hash
    `df812eac`, 20,339 B), rule 106, identical in A and B.
19. **Did it apply to the correct spacer?** Yes. In B its only holder is the empty spacer. In A it was held by the node
    containing the columns.
20. **Did Emotion/style differences materially confound?** No. The composition differs (A 11 sheets, B 8). But both
    decisive rules are shared byte for byte, and the A-only tags only duplicate client-tag rules for the row, logo and
    grid, with equal declarations. The client tag at settle is hash-identical across arms (`07`).
21. **All four source Swipers initialized?** Yes: 4 instances with 9 / 10 / 4 / 6 slides, none before release.
22. **Hero autoplay worked?** Yes. `autoplay.running`, realIndex 0 → 1 in 6 s, then 2.
23. **Responsive runtime switched at 390?** Yes, identically to A: 1,552 mutations, desktop nav subtree removed,
    slidesPerView 1, reviews regrouped 6 → 3, 601 root elements.
24. **Any fatal error?** No. 0 fatal; 1 console error (the blocked hero mp4), the same as A.
25. **Any real external request escaped?** No. 0 escaped. Blocked: the harness's own `example.com` probe and the hero
    mp4.
26. **Any source JS patched?** No.
27. **Phase 1 / Phase 2 / 3C baselines unchanged?** Yes. Tree sha256 is equal before prepare and after the run for 13
    directories (Phase 1 run, Phase 2 clone, 3B / 3B.1 / both 3C artifacts, 3A–3C reports, 3B–3C harnesses).
28. **Did B improve general non-data hydration node retention?** Yes, as supporting evidence only. At the commit,
    B reused 171/171 SSR root elements with 0 removed and 0 inserted, and its automatic status was SURVIVED. A reused
    60/660, of about 215 non-data per the 3B.1 adjudication, with automatic status FAILED. B was not attributed
    component by component.
29. **Confirm, reject or incomplete?** **Confirm**, within the limits above.
30. **The ONE next justified step?** Design (not implement) the real public API capture/replay policy on top of a
    bootstrap-document hydration base. Keep the Phase 2 settled DOM as the static baseline and fallback, and state the
    generic rule as "start from the source application's compatible bootstrap document/state", not "always SSR" (`12`).

## Report index

| # | file |
|---|---|
| 01 | `01-control-design.md` |
| 02 | `02-strategy-b-document-preparation.md` |
| 03 | `03-control-equivalence.md` |
| 04 | `04-runtime-result.md` |
| 05 | `05-footer-lifecycle-b0-b4.md` |
| 06 | `06-node-identity-forensic.md` |
| 07 | `07-style-emotion-control.md` |
| 08 | `08-swiper-responsive-runtime.md` |
| 09 | `09-network-integrity.md` |
| 10 | `10-independent-review.md` |
| 11 | `11-human-review-guide.md` |
| 12 | `12-next-step.md` |
| — | `strategy-b-result.json` |
