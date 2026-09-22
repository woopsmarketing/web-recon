# 10 — Human review guide

**Judge structure and behaviour. Ignore the fictional content** (colour blocks labelled `FIXTURE …`,
text such as `테스트 리모델링 A01` and `가상 후기 01`). Nothing here is scored automatically.

Images are in `data/apartmentary.com/runtime-experiments/2026-09-16T10-50-02-746Z/` (attempt 2, authoritative):

| file | what it is |
|---|---|
| `desktop-before.png` | A: accepted Phase 2 static clone at 1440, before any source JS ran |
| `desktop-synthetic.png` | C: source runtime plus synthetic data at 1440, settled, scroll 0 |
| `mobile-synthetic.png` | the same page after one resize to 390×844 (after one arrow click on portfolio area 1) |
| `footer-before.png` / `footer-synthetic.png` | footer crops at 1440, before and after |

For B (3B.1 empty data), see `…/2026-09-16T09-59-25-874Z/after.png`.

## Before you look: two known, explained artefacts

1. **Blank portfolio cards in `desktop-synthetic.png`.** Do not read this image alone as proof that the
   cards render; the pixel evidence is attempt 1's desktop image and area 1 in `mobile-synthetic.png`
   (review NOTE 8). The arrows and progress bars are present, but the
   cards are invisible. The 14 cards use the source's scroll-triggered `data-aos="fade-up"`, and a
   full-page capture never scrolls, so they stay `aos-init` (opacity 0). The cards are laid out, and
   their images are loaded (`03`). To see card structure at 1440, use attempt 1's
   `…/2026-09-16T10-47-09-345Z/desktop-synthetic.png`, where the cards animated. Its fixed header is
   drawn mid-page because that run booted scrolled.
2. **Fixed header position.** Full-page captures draw a fixed header at the scroll offset at capture
   time. It is at the top in attempt 2.

## Desktop 1440: compare A (`desktop-before.png`) with C (`desktop-synthetic.png`)

| target | what to look for | expected from measurement |
|---|---|---|
| hero geometry | full-width banner about 806 px tall, dots bottom-centre, prev/next arrows at the sides, header over it | 1440 × about 806 (A: 813); 9 dots |
| portfolio card count / visible count | 3 cards per row visible, progress bar under each list, arrows at the sides | 3 visible of 10 (area 1) and 3 of 4 (area 2); card width 413 |
| review cards | "01 02 03" numbered cards, 3 per view, progress bar, arrows at the top right | 3 visible of 6 |
| section spacing | order and vertical rhythm: hero → intro block → area 1 → area 2 → lifestyle photo → reviews → photo → footer | above-footer content within about 100 px of A in total height |
| footer columns | **known broken:** A shows 3 columns (정보 / 안내 / 고객센터) across about 900 px; C squeezes them into a 100 px strip with overlapping text | wrapper 100 px, columns 33 px (`05`) |

## Mobile 390: `mobile-synthetic.png` (no Phase 2 mobile screenshot here; the Phase 2 mobile clone is the reference)

| target | what to look for |
|---|---|
| header | mobile header: logo on the left, menu icon on the right, no desktop nav links |
| hero | tall mobile banner (`FIXTURE HERO 03 (MOBILE)` image), dots at the bottom |
| portfolio stacking/slides | one card per view (350 px), "더 보기" button under the list; area 1 card visible, area 2 card blank (AOS not scrolled; see above) |
| review layout | 2 reviews stacked per slide ("01", "02"), progress bar below |
| footer grouping/spacing | **known broken:** stacked vertically as it should be, but the column block is only 100 px wide, so labels wrap and overlap (`05`) |

## Questions for the operator

1. Apart from the footer, do the desktop sections match Phase 2 in position and proportion?
2. Does the 390 layout look like the site's mobile structure (header, stacking, one card per view)?
3. Is the footer defect the only structural difference you see?
