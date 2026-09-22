# 05 — Visual fidelity

## Method

- **References:** the Step 2 faithful clone captures in `data/apartmentary.com/comprehensive-observation-2026-09-18/clone-qa/`, covering the portfolio list at desktop and mobile, detail A (before/after) and detail B at desktop, and detail at mobile. These are the only references. No new source observation was run, and the Source Package observer was never pointed at a detail page (G15).
- **Build under test:** the Template renders fictional fixture content with locally generated SVG assets. The comparison is therefore **structure, layout and behaviour**, never pixels, copy or photography.
- **Checks:** `scripts/template-platform-step4-visual-smoke.ts`. It serves each package with try_files resolution (`$uri` → `$uri.html` → `$uri/index.html`, then 404 → `404.html`) and loads it in Chromium at 1440 / 1000 / 390.
  - HTTP status, console errors and page errors
  - non-local requests (aborted and recorded)
  - subresource ≥400
  - visible images decoded, plus every `img` src fetched and required to return 200
  - horizontal overflow
  - every internal link returns 200
  - list column count per band
  - pagination click
  - room tabs, show-more and the before/after toggle
  - 404 routes
- **Screens:** [screens/](screens/) (file names are `<site>--<route>--<viewport>.png`).

## Result (repo packages, release `interior-01-1.1.0-512e4dd932b4`)

**24/24 visits pass.** Across all visits: 0 console errors, 0 page errors, 0 non-local requests, 0 broken images, 0 overflow, and 0 dead internal links.

| visit | viewports | checked |
|---|---|---|
| large `/portfolio` | 1440 / 1000 / 390 | 30 cards; columns **3 / 2 / 1** |
| large `/portfolio/page/2` | 1440 | 30 cards; current page = 2 |
| large `/portfolio/page/6` | 1440 | 23 cards; no "next" link |
| large pagination click | 1440 | `/portfolio` → page 2 → prev → `/portfolio` |
| large detail `hp-0174` (before/after) | 1440 / 1000 / 390 | band order (gallery-first <1281, title-first ≥1281); tabs switch; show-all reveals tile 6+; before/after toggles both ways (1440 and 390) |
| large detail `hp-0175` (no before/after) | 1440 / 390 | no toggle, no quote |
| large detail `hp-0173` (outlier) | 1440 / 390 | no overflow |
| large `/` | 1440 | every card → its detail; click lands on the right project; view-all → `/portfolio` |
| 404 | — | `/portfolio/page/1`, `/page/7`, `/page/0`, `/portfolio/no-such-project` all → 404 |
| small `/portfolio` + `maru-012` detail | 1440 / 390 | ko-KR; 12 cards; no pager; before/after |
| empty `/` | 1440 | no portfolio link; `/portfolio` → 404 |

The 14 PNGs and `summary.json` are in [screens/](screens/).

## Structural comparison

| surface | reference (observed) | Template | verdict |
|---|---|---|---|
| list hero | full-bleed photo, title overlaid at right | full-bleed media slot (400/320/200 px), title + intro **below** it | **residual (intentional):** an overlay needs per-image contrast guarantees the Template cannot make for operator images. With no media, the title stands alone (fixture-small). |
| list filters | filter panel (area / keyword / price / sort) + search | not implemented | **residual:** FILTERS = DEFERRED (see 06) |
| list grid | 3 columns desktop, 1 column mobile, image + title + description + caption | 1 / 2 / 3 columns (<900 / 900–1280 / ≥1281), image + title + summary + category | match (the 2-column tablet band is authored) |
| pagination | `‹ 1 2 3 … 22 ›`, JS-driven `?page=0`, zero `<a>` | `‹ 1 2 3 4 5 6 ›` / windowed with gaps, real `<a href>`, `aria-current` | match in look; the source defect is not copied |
| detail desktop head | title + share, summary, room pills with counts | title + summary, room pills with counts; no share button | **residual:** share is out of scope (no share target, no JS share API) |
| detail desktop gallery | lead tile (½ width) + 2×2, before/after pill on paired photos, "사진 더보기" over the last tile | lead 2×2 tile + 2×2 block (5 tiles), before/after pill only on paired photos, "show all photos" over the block | match |
| detail desktop info | story + client quote on the left, facts (2 columns) + CTA on the right | same | match |
| detail mobile | app bar (back, room dropdown, share) → square gallery with 1/N counter → title → facts (2 columns) → story → quote → CTA | back bar + scrollable room pills → square swipe strip with 1/N counter → title → facts (2 columns) → story → quote → CTA | match, except the room selector is pills instead of a dropdown in the app bar |
| detail tablet (900–1280) | (source follows its mobile layout up to 1280) | gallery-first strip of 72% 4:3 slides, facts in 4 columns | authored within the observed band structure |
| empty values | source renders empty keyword rows | no row for an absent or empty value | the source defect is not copied |

## Band behaviour

- **Mechanism.** Band switching is CSS media queries only (`grid-template-areas`, flex strip to grid). Server HTML is byte-identical at every width, and nothing switches during hydration.
- **Interactive parts.** The client island owns only the room tab state, the before/after toggle, show more/fewer and the strip counter.
- **Checked.** The smoke checks gallery-before-title below 1281 and title-before-gallery at ≥1281.
