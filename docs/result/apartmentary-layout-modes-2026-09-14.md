# apartmentary.com `/` — Layout-mode correction (wide desktop rework)

**Date**: 2026-09-14 · **Target**: `data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app`
**Only file changed**: `app/public/wr/generated-styles.css` (no core / SiteSpec / observation / runtime / git changes)
**Sub-reports**: `docs/result/apartmentary-layout-modes/`
`01-why-previous-fix-failed.md` · `02-layout-modes-and-rules.md` · `03-geometry-source-vs-clone.md` · `evidence/` · `tools/`

---

## 1. Why the previous fix was insufficient

- **It checked the wrong things.** Its 7 landmarks were all full-bleed boxes whose right answer is always `x=0, w=viewport`. No content group, card row, CTA, track, height, column count or margin symmetry was measured. With 36 regions, the same BEFORE state has **139 failures**, **14 of them at 1440**, the width that was reported as "matches source exactly".
- **Proportional expansion hit the wrong nodes.** `width:100%` was forced on `n000170` (experience group) and `n000528` (testimonial column). In the source these are a content-sized centered group and an 85% column. Result: image pinned to the viewport's left edge, and testimonials spread across the full viewport at every desktop width.
- **Inner layers stayed at 1440 literals.** Heading rows were 1360px, slides 413/375px, arrows at `left:1340px`, banner and bottom image 1224/1440px, header 1440px. So you got 2 cards at 1024, 4–5 cards at 1920, and CTAs parked at x≈1170–1400.
- **Captured `min-height` on every section ancestor.** Sections could grow but never shrink, so the page was 843px too tall at 1024.
- **The hero was never really fixed.** It was captured mid-autoplay (`translateX(-6820px)` = 4.74 slides), so it showed two stitched slides at a fixed 813px height.
- **Floating 상담 button.** A frozen `top` beat `bottom:50px`, so it didn't follow the viewport bottom.
- **Correction to the task premise (measured on the live source).** At 1920 the portfolio sections are *full-width with 40px padding and 3 fluid cards*, not a narrow centered box. The centered cap (`max-width:1920px; margin:auto`) only takes effect **above 1920**, so 2560 was also verified.

## 2. Previous rules modified / removed

| rule | before | after |
|---|---|---|
| `n000170` experience group | `width:100%` | `width:auto` (content-sized, centered by parent) |
| `n000528` testimonial column | `width:100%` | `width:85%` (+ 40px gutter restored) |
| Hero track/slides "frozen at 1440" trade-off | literal 1440px + captured mid-transition transform | overridden: static pin of the captured active slide (`translateX(-300%)`), fluid slides, `aspect-ratio 1440/813` |
| `.wr-st000132` floating button | `left:auto` | `left:auto; top:auto` |

Nothing else was deleted. All other changes are additions, in one commented block (`LAYOUT-MODE PROTOTYPE`) at the end of the file.

## 3. Layout mode per section

| section | mode | what the clone now does (= source) |
|---|---|---|
| Hero (+ bottom media) | **A** viewport full-bleed | one slide, w = viewport, h = w/1.771; bottom image w = viewport |
| Hero arrows / pager | **D** hero-edge | arrows at 50% height, next arrow `right:40px`; pager bottom 43px, centered |
| Header row | **A** | viewport width; <1200 spacer 30px; ≥1920 nav padding 20px |
| Content wrapper, footer | **B** centered max-width | `max-width:1920px`, centered beyond 1920 |
| Experience (기대와 설렘…) | **B** centered content group | ≈992px group, equal L/R margins at every width |
| Portfolio ×2 heading + CTA | **B / D** | row = container width; CTA right edge = container right edge (vw−40, or 2200 at 2560) |
| Portfolio ×2 cards | **C** fluid grid in bounded container | always 3 visible, card = (container−100)/3, gap 50; <1200 card typography |
| Portfolio arrows / progress | **D** container-edge | next arrow `right:65px`, rail = container, thumb 12.5% / 50% |
| Testimonial | **B** column + **C** track | 85% column + 40px gutter; banner fills column; 3 visible, gap 50; arrows on column right |
| Footer link grid | **C** | 3 equal columns (no wrap below 1440) |
| Floating 상담 button | **E** viewport-edge | `right:0; bottom:50px` at every viewport width **and height** (desktop and mobile) |

## 4. Source-vs-clone geometry (x / width / right; full tables incl. BEFORE, centerX, margins, heights in sub-report 03)

| region | 1024 src → clone | 1100 src → clone | 1440 src → clone | 1920 src → clone |
|---|---|---|---|---|
| hero media | 0/1024/1024 ✅ (h 578=578) | 0/1100/1100 ✅ | 0/1440/1440 ✅ (h 813) | 0/1920/1920 ✅ (h 1084=1084) |
| experience group | 16/992/1008 ✅ | 54/992/1046 ✅ | 224/992/1216 ✅ | 464/992/1456 ✅ |
| experience image / text x | 16 / 606 ✅ | 54 / 644 ✅ | 224 / 814 ✅ | 464 / 1054 ✅ |
| portfolio 1 container | 40/944/984 ✅ | 40/1020/1060 ✅ | 40/1360/1400 ✅ | 40/1840/1880 ✅ |
| portfolio 1 CTA right | 984 ✅ | 1060 ✅ | 1400 ✅ | 1880 ✅ |
| portfolio 1 visible / card w / gap | 3/275/50 ✅ | 3/300/50 ✅ | 3/413/50 ✅ | 3/573/50 ✅ |
| portfolio 2 (same checks) | ✅ | ✅ | ✅ | ✅ |
| testimonial container | 114/870/984 ✅ | 125/935/1060 ✅ | 176/1224/1400 ✅ | 248/1632/1880 ✅ |
| testimonial visible / item w | 3/257 ✅ | 3/278 ✅ | 3/375 ✅ | 3/511 ✅ |
| bottom media | 0/1024 ✅ | 0/1100 ✅ | 0/1440 ✅ | 0/1920 ✅ |
| footer container | 0/1024 ✅ | 0/1100 ✅ | 0/1440 ✅ | 0/1920 ✅ |
| floating CTA x / y (vh 1000) | 944 / 784 ✅ | 1020 / 784 ✅ | 1360 / 784 ✅ | 1840 / 784 ✅ |
| page height | 5522 → 5457 | 5575 → 5554 | 6056 → 6057 | **6709 → 6709** |
| horizontal overflow | none | none | none | none |

**2560 (extra):** all regions ✅. Content sits in a centered 1920 box (320:320 margins), hero and bottom media are 2560 wide, page height 7073 = 7073.
**390:** mobile variant untouched except the floating button. Page height 4804 = 4804, no overflow. Full-page pixel diff BEFORE→AFTER is limited to the floating-button box, which now sits at y=839 (source 839; before 683).
Only non-✅ box rows: section heading text width is −26…−31px at every width with identical x. That is clone font metrics, not layout.

## 5. Screenshots (`docs/result/apartmentary-layout-modes/evidence/`)

- Full page at each width: `source-home-{390,1024,1100,1440,1920,2560}.png`, `clone-home-{…}.png` (after), `clone-BEFORE-home-{…}.png`
- Side-by-side panels (source | clone BEFORE | clone AFTER): `compare-1920-part{0,1,2}.png`, `compare-1440-part*.png`, `compare-1100-part*.png`, `compare-1024-part*.png`, `compare-2560-part*.png`, `compare-390-part*.png`
- CSS change: `generated-styles.diff`

**1920 eyeball check** (source vs clone full page, done before claiming completion): hero, experience, both portfolio sections, testimonial, bottom image and footer line up section by section at the same y positions (page heights identical). The first comparison pass found two leftover layout differences: the floating button was 100px too high, and the header nav was offset by up to 35px. Both were fixed and re-verified. The remaining visible differences are non-layout (list in §6).

## 6. Remaining differences (honest)

**Layout (small, below 1200px only):**
- **Page height at 1024 is −65px, at 1100 −21px.** Cause: testimonial quotes and the footer legal paragraph wrap onto one fewer line, because the clone's glyphs are narrower. Box x/width match.

**Not layout (pre-existing, not touched):**
- **Fonts.** Card body text renders in a serif fallback, and heading glyphs are ~4% narrower. These are the asset/font-licensing residuals from Task 22.
- **Missing images/icons.** Header wordmark logo and footer logo box are missing; carousel arrow icons render as faint outlines; testimonial nav arrows render as empty squares.
- **Experience media content.** The source `<video>` plays a different frame or clip than the clone poster at some widths (e.g. 1024 shows people). Box geometry is identical.

**Behavioral (by design, out of scope):**
- The hero is a static pin of the captured active slide (index 3). No autoplay, arrows or pager behavior.
- Portfolio and testimonial tracks stay at index 0, like the capture.

**Scope:**
- `/service` got only the floating-button fix. Its own wide-width composition was not reworked. Its page height at 1920 is 7331 vs source 7818, which is pre-existing.
- The other 6 recon pages were not checked.
- 801–1023px is not in the verification set. There is no overflow at 800/801/900, but the source's <900 breakpoints were not studied.

**Prototype nature:** every rule is source-specific (node ids, measured ratios, probed breakpoints). This is the "answer shape" to feed the generic inference task. It is not a generalizable fix.

## 7. Commands

```bash
# serve the clone (static CSS asset only changed → no rebuild needed)
cd data/apartmentary.com/reconstructions/2026-09-14T05-01-12-931Z/app
pnpm start --port 3212

# re-measure live source + clone at all widths (writes <out>/source.json, clone.json, screenshots)
cd /Users/woops/projects/web-recon
T=docs/result/apartmentary-layout-modes/tools; OUT=$(mktemp -d)
node $T/measure.mjs source 390,1024,1100,1440,1920,2560 $OUT 1 &
node $T/measure.mjs clone  390,1024,1100,1440,1920,2560 $OUT 1; wait
python3 $T/compare.py $OUT $OUT/table.md        # prints FAILS list, writes full table

# parallel source/clone subtree diff for any structural path (e.g. first portfolio card)
node $T/tdiff.mjs 1024 R.2.1.3.0.2.0.0.0.0 14 40
```

The clone server used for all measurements was the already-running `next start` on :3212, pid 64217, started 15:19. The CSS is served fresh from `public/` on each request.
