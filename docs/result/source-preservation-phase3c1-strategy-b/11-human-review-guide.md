# 11 — Human review guide

Human review is **secondary** evidence. The causal verdict comes from the structural B0–B4 probes (`05`, `06`).

## Files

| label | desktop | footer crop | mobile (390) |
|---|---|---|---|
| **A** Phase 2 accepted static (pre-runtime) | `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/desktop-before.png` | `…10-50-02-746Z/footer-before.png` | Phase 2 mobile preview (`data/apartmentary.com/preservation-clones/2026-09-16T06-42-28-282Z/mobile/`) |
| **B** Phase 3C Strategy A runtime | `…10-50-02-746Z/desktop-synthetic.png` | `…10-50-02-746Z/footer-synthetic.png` | `…10-50-02-746Z/mobile-synthetic.png` |
| **C** Strategy B runtime | `data/apartmentary.com/runtime-experiments/2026-09-16T14-30-58-205Z/desktop-strategy-b.png` | `…14-30-58-205Z/footer-b3.png` | `…14-30-58-205Z/mobile-strategy-b.png`, `footer-b4-mobile.png` |
| C, initial SSR (before JS) | `…14-30-58-205Z/desktop-ssr-before.png` | `…14-30-58-205Z/footer-b0.png` | — |

- `footer-b1.png` and `footer-b2.png` do not exist. B1 and B2 happen inside one synchronous hydrate task, so no
  screenshot can be taken there without suspending the runtime. They are recorded structurally only.
- Full-page captures are taken at scroll 0. Client-created AOS cards stay `aos-init` (invisible) there, in both
  runtime arms (3C trap).

## Desktop (1440) checklist — compare A, B, C

| item | what to look at | structural expectation (from probes) |
|---|---|---|
| hero placement | first screen | B = C (same slides, same transform) |
| major section order | whole page | identical in B and C (660 root elements each) |
| portfolio geometry | two card rows | 3 visible per row, 413 px slides, in B and C |
| reviews | review carousel | 3 visible, 375 px slides |
| **footer content width** | footer crop | A ≈ C: logo box 432 px (30%), then a content block about 908 px wide. B: content squeezed to 100 px |
| **footer 3-column distribution** | 정보 / 안내 / 고객센터 | A ≈ C: 3 columns of about 303 px. B: 3 × 33 px, text stacked vertically |
| **footer total height** | footer crop height | A 1,386 · **C 1,385 px crop (probe 1,386)** · B 2,058 |

## Mobile (390) checklist — compare B, C (A: Phase 2 mobile preview)

| item | expectation |
|---|---|
| header mode | mobile header in both (desktop nav subtree removed) |
| hero mobile structure | 390 px slides, mobile hero images |
| card behaviour | 1 card per view, 350 px |
| review grouping | 3 slides, 2 reviews per slide |
| footer grouping | logo 43 px → 60 px gap → content → spacer |
| **footer content width** | **C: 350 px (columns 175 / 175 / 350). B: 100 px (columns 50 / 50 / 100)** |

## Known, not a regression

- Hero video (`main-introduce.mp4`) is blocked in every arm, so a poster or blank area appears there.
- All content is fictional synthetic fixture data with placeholder images, identical in B and C.
