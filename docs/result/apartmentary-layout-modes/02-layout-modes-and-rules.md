# 02 — Layout modes per section and CSS rules changed

**Only file changed**: `app/public/wr/generated-styles.css` (static asset served by
`next start`, no rebuild). 12,477 → 12,750 lines. Unified diff vs the pre-task backup:
`evidence/generated-styles.diff` (299 lines). No core (`src/`), SiteSpec, observation,
runtime TSX, or package file was touched; no navigation/carousel/FAQ behavior added.

All new rules are appended in one block headed `LAYOUT-MODE PROTOTYPE`, scoped
`[data-wr-page="p000001"][data-wr-viewport="desktop"] [data-wr-node=…]` (so `/service`,
other pages and the mobile variant are unaffected), except the two floating-button class
rules (`.wr-st000132` desktop, `.wr-st000131` mobile) — each class is used only by the
same floating button on every page, verified on `/` and `/service`.

## A. Modified / removed previous rules

| rule (previous fluid-desktop pass) | was | now | why |
|---|---|---|---|
| `n000170` (experience group) | `max-width:100%; width:100%` | `max-width:100%; width:auto` | source is content-sized and centered; 100% pinned image to viewport left |
| `n000528` (testimonial column) | `max-width:100%; width:100%` | `max-width:100%; width:85%` | source column is 85% + 40px gutter |
| hero carousel "frozen at 1440" trade-off (track `n000053` + slides at literal 1440px) | kept frozen | overridden by the hero pin rules below | frozen track showed two stitched slides at 813px height |
| `.wr-st000132` floating button | `left:auto` only | + `top:auto` | frozen `top:684px` beat `bottom:50px` |

Nothing else from the previous pass was removed. The other 40 width completions were not
audited one by one: on `/` the 36-region measurement and the depth-4 page-tree diff show
no divergence attributable to them; the 15 on `/service` were not re-audited (out of scope).

## B. Section → layout mode → rules

| section | mode | source behavior (measured) | rules added |
|---|---|---|---|
| Hero | **A** full-bleed | one slide, width = viewport, height = width/1.7712 | `n000051`,`n000052` height:auto; track `n000053` width/height:auto + `transform:translateX(-300%)` (static pin of captured active slide, index 3); slides width:100%; slide `<img>` width:100% + `aspect-ratio:1440/813`; overlay `left:60%` |
| Hero arrows / pager | **D** hero-box anchored | arrows vertically centered, next at right 40px; pager bottom 43px centered | `n000135`,`n000140` `top:calc(50% − 17.5px)`; `n000140` `left:auto; right:40px`; `n000145` `top:auto; bottom:43px; margin:0 auto` |
| Header row | **A** | row = viewport width | `n000008` width:auto; <1200 spacer `n000013` 30px; ≥1920 nav padding 20px + source-measured button widths, `n000014` width:auto |
| Page content wrapper | **B** | `max-width:1920px`, centered beyond | `n000166` `margin-left/right:auto` |
| Experience (기대와 설렘…) | **B** centered content group | group ≈992px, equal L/R margins | `n000170` width:auto (fix of previous rule) |
| Portfolio ×2 heading row | **B/D** | row = container (40px padding); CTA at row's right edge via space-between | `n000192`,`n000418` width:auto |
| Portfolio ×2 card track | **C** fluid grid in bounded container | 50px side padding, 3 per view, gap 50 → slide = (wrapper−100)/3 | slides `calc((100% − 100px) / 3)`; swiper `n000206`,`n000432` height:auto; card image wrapper height:auto + `<img>` width:100% height:auto (captured aspect-ratio drives height); text + wrapper `min-height:0`; <1200 card typography 16/28, 14/23, spacer 16 |
| Portfolio ×2 controls | **D** container-edge | next arrow right 65px; rail = wrapper; thumb 12.5% / 50% | `n000407`,`n000519` `left:auto; right:65px`; rails `n000400`,`n000512` width:auto; thumbs `n000401` `calc((100% − 100px)·0.125)`, `n000513` `·0.5`, `right:auto` |
| Testimonial | **B** bounded column + **C** track | 85% column + 40px gutter (flex-end); banner fills column; 3 per view, gap 50; arrows at column right | `n000528` 85%; gutter `n000617` flex-shrink:0 height:auto; banner `n000530` width:100% height:auto; swiper `n000545` height:auto; slides `calc((100% − 100px) / 3)`; slide text column + children width:auto; thumb `n000616` 25%; `min-height:0` on `n000544`,`n000546` and slide text |
| Bottom media | **A** | `<img>` = viewport width | `n000620` height:auto; `n000621` width:100% height:auto |
| Footer | **B** | `max-width:1920px` centered; 3 equal link columns | `n000623` margin auto; grid items `n000628 > *` max-width:33.3333%; side columns `n000624`,`n000768` height:auto |
| Section ancestors | — | height follows content | `min-height:0` on `n000001-3, n000005, n000049, n000166, n000189-190, n000204-205, n000415-416, n000430-431, n000527-529, n000619, n000622-623, n000626-628` |
| Floating 상담 button | **E** viewport-edge | `right:0; bottom:50px` at every viewport size | `.wr-st000132 { top:auto }` (desktop), `.wr-st000131 { top:auto; left:auto }` (mobile) |

## C. Why each value is not a guess

Every numeric value was taken from the live source, not inferred:
- ratios (`85%`, `12.5%`, `50%`, `25%`, `/3`, `100px`, `1.7712`) were confirmed at ≥3
  widths (e.g. testimonial 870.4/1024 = 935/1100 = 1224/1440 = 1632/1920 = 0.85);
- breakpoints were bracketed by probing (nav padding: 25px at 1536/1700/1800/1900/1919,
  20px at 1920);
- per-node subtree diffs (`tools/tdiff.mjs`) walked source and clone in parallel and
  reported 0 diverging boxes for portfolio card subtrees at 1024/1100 and for the whole
  page tree at 1440 and 1920 (depth 4), and only glyph-width text boxes in the header.
