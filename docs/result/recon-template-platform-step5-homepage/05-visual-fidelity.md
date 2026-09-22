# 05 — Visual fidelity (structure, not pixels)

**Reference.** The design reference is the existing Step 2 capture:
- `data/apartmentary.com/2026-09-18T08-30-49-211Z/viewports/{desktop,mobile}/screenshot.png`
- Step 2 comprehensive observation, read-only.

No new source observation was run in Step 5 (G15).

**Candidate.** The template screenshots are in `screens/`: the final repo-root smoke, fixture content only.

**Target: layout and interaction parity.** Nothing was copied: no brand, copy, media, CSS or runtime came from the source. Every template image is a generated fictional SVG illustration, so photographic "look" is not comparable and was not a goal.

## Section-by-section

| # | Source homepage | interior-01 1.3.0 | Match |
|---|---|---|---|
| 1 | Header: logo left, text nav + highlighted pill right, **transparent over the hero** | Logo left, "Projects" + "Contact" pill right, **solid bar above the hero** | structure ✓ · treatment differs (intentional, 06) |
| 2 | Full-bleed image carousel, edge arrows, dot pill at bottom centre, autoplay | Full-bleed carousel: edge arrows (desktop), a pill with pause/play + dots at bottom centre, 5s autoplay with pause rules, swipe on mobile. Optional headline/text/CTA per slide over a scrim | ✓ (optional slide copy is additive) |
| 3 | Intro: media block left (~510px), title + body + dark pill right; stacked on mobile | Same geometry: media 510px, gap 80px, title / paragraphs / pill link; stacked on mobile; text-only when there is no media | ✓ |
| 4 | Showcase A: title left, dark "view all" pill right, 3 cards per view (image, title, summary, meta), progress rail below | Same: title + description, pill top-right, 3 per view (84% peek on mobile, 2 per view at 600–899), image / title / summary / category, rail + thumb + prev/next | ✓ · card meta shows the category, not the area (carry-forward 1) |
| 5 | Showcase B: second instance of the same pattern | The same component, `home.projects-b`, a second selection of the one projects collection | ✓ |
| 6 | Reviews: banner photo over a right-anchored ~85% column, title, arrows beside the title, numbered quotes (01/02/03) with an attribution line, rail | Same column and banner when reviews media exists; title; numbered quotes; attribution; rail. **Arrows sit on the rail row** (the shared SnapTrack bar), not beside the title | structure ✓ · arrow position differs (minor) |
| 7 | Full-width image band | Full-width band, cover, 280–760px | ✓ |
| 8 | Footer: logo mark, three menu columns, legal/business block | Brand name + summary + company/email facts. The menu columns and the legal block are **excluded sections** (no legal pages and no dead links) | structure reduced (by spec) |
| 9 | Floating round consult button, bottom-right | Fixed bottom-right **pill** (icon + label), a crawlable `mailto:` link inside the footer landmark | position ✓ · shape differs (06) |

**Responsive.** The source's observed home breakpoint of ~900px is kept as the single desktop band. The mobile order equals the desktop order; nothing is hidden per device, and there are no placement flags.

## Differences and why

**Intentional**
- **Solid header.** A floating transparent header needs per-slide contrast handling. It is left to the Whole-site Visual / UX Polish pass, together with the hero copy inset.
- **Pill CTA instead of a circle.** The label stays readable in any language (Korean "상담 문의" / English "Contact").
- **Reduced footer.** Legal, menu and "about" content are excluded sections (spec §excluded).
- **No placement flags and no per-device variants.** The source's CMS placement flags (`isPcDisplay`, …) are defects of the source model, not features.

**Minor / polish** (tracked in 06):
- review arrows on the rail row;
- "view all" links both go to `/portfolio` (the source linked subsets);
- the 600–899 band is stretched-mobile;
- blank space below reviews when every review fits.

**Additive** (source-compatible):
- optional hero headline, text and CTA, with a copy-anchored scrim (contrast ≥ 5.08:1 worst pixel, even at maximum copy length; 03);
- pause/play control;
- keyboard and screen-reader semantics;
- reduced-motion behaviour.

## Screens

The final smoke writes every visit to `screens/`:
- `*--home-top--<viewport>.png`: the first view;
- `*--home--<viewport>.png`: full page;
- `*--home-hero-long-copy--<viewport>.png`: the maximum-length copy stress;
- portfolio / detail pages.

`screens/summary.json` records each visit's checks, requests, console and overflow results. The fixtures are fictional (en-US "Harbor & Pine", ko-KR "마루 아틀리에 (가상)", en-GB fixture-empty).
