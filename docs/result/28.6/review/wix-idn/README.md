# Review pack — lane `w7-wix-idn` · `www.xn--ok0b408a79cba430b.net` (여기여주소.net)

Wix Thunderbolt, 29 inline `<style>` tags, **zero** `<link>` stylesheets. IDN punycode host.

- Clone grade: `data/www.xn--ok0b408a79cba430b.net/responsive-qa/**2026-09-02T23-24-48-801Z**`
- Self-check floor: `…/responsive-qa/**2026-09-02T23-27-36-145Z**` — **10/10 PASS, every
  channel 0.00**. The source is perfectly stable between two captures, so **everything you
  see below is the clone**, not instrument noise.
- Full report: `docs/result/28.6/lanes/w7-wix-idn.md`

**20 images, 17 MB — all 10 pairs kept, nothing dropped.** Files sort route-then-width:
`<route>_<width>_source.png` next to `<route>_<width>_clone.png`.

## Three things to know before you open anything

1. **The source is a fixed 980 px desktop page at every width.** Wix serves the desktop HTML
   to a desktop browser and that document has a hard 980 px floor. `root_0390_source.png`
   and `root_0700_source.png` are *the same picture* (identical byte size) because they are
   the same 980 px document photographed twice.
2. **The clone is a fixed 1440 px page below 1440.** The generated stylesheet carries
   **210 `width: 1440px` declarations**. That single fact is four of the eight BLOCKERs.
3. **The clone renders no bitmaps.** Every image is a broken-image `alt` placeholder — the
   logo, the pink texture tiles, the social icons. The clone hotlinks
   `static.wixstatic.com`, which refuses the request (`asset-hotlink-blocked` ×107,
   `assetMode: "reference"`, `assetDownloads: 0`). Asset materialization is a **separate
   pipeline stage that was not run here**, so this is a declared limitation, not a
   reconstruction failure — but it is the first thing you will notice, and it is why every
   pixel-residual number is large. Judge layout, not imagery.

## The pairs

| Files | Verdict | Deciding channel | Look at this |
|---|---|---|---|
| `root_0390_source.png` / `root_0390_clone.png` | **BLOCKER** | `nav-link-ratio` (1 of 6) | The top bar. The source has a **six-item text nav** (Main/About/Link/Contact/Service/Blog); the clone has a **single hamburger button**. Both are right — the source thinks it is on a desktop, the clone obeys its own 481 px switch — so read this pair as a grader/profile mismatch, not a broken clone. |
| `root_0700_source.png` / `root_0700_clone.png` | **BLOCKER** | `missing-text-ratio` 35.49% | Scroll to the **blog section near the bottom**. The source shows **six** post cards with Korean titles and view counts; the clone shows **two**, then **a tall empty band** where the other four belong. That hole is the whole 35%. |
| `root_1024_source.png` / `root_1024_clone.png` | **BLOCKER** | `footer-clipped` (clone right edge 1440 > 1024) | The **footer**. In the clone the subscribe box, the social icons and the copyright line run off the right-hand side and are cut; in the source they sit inside the page. Same empty blog band as above. |
| `root_1100_source.png` / `root_1100_clone.png` | **BLOCKER** | `footer-clipped` (1440 > 1100) | Same footer overrun, 76 px less severe. Compare the right margin of the pink footer wash against the source's. |
| `root_1440_source.png` / `root_1440_clone.png` | **BLOCKER** | `missing-text-ratio` 35.38% | **This is the geometrically perfect pair** — zero position findings, gutters match to the pixel. Everything that is wrong here is *content*: put the two side by side at the blog section and count the cards — **6 in the source, 2 in the clone**. |
| `link_0390_source.png` / `link_0390_clone.png` | **BLOCKER** | `nav-link-ratio` (1 of 6) | Same nav story as the homepage. Also note the clone's content stops at 370 px in a 390 px viewport — a thin dead strip down the right edge. |
| `link_0700_source.png` / `link_0700_clone.png` | MAJOR | `landmark-wide-element-excess` (29 boxes, widest 1440 px) | The **header and footer**, not the body. The body text lines up; the header/footer boxes are built for a 1440 px page and spill out of a 700 px window. |
| `link_1024_source.png` / `link_1024_clone.png` | **BLOCKER** | `footer-clipped` (1440 > 1024) | **The clearest pair in the pack — start here.** In the source the six-item nav ends with `Blog` and the footer sits inside the window. In the clone the nav is cut mid-word at `Servi…`, the pink hero band and both horizontal rules run off the right edge, and the footer's right column (`개인정보 처리방침` / `접근성 표시 정보`) is sliced in half by the viewport edge. The whole page is a 1440 px canvas with 416 px of it amputated. |
| `link_1100_source.png` / `link_1100_clone.png` | **BLOCKER** | `footer-clipped` (1440 > 1100) | Same, slightly less clipped. |
| `link_1440_source.png` / `link_1440_clone.png` | MINOR | `pixel-residual` 6.08% | **The best pair in the run.** Layout, columns, gutters and text all line up — check the footer's two-column rule and the Subscribe button against the source. The residual is the missing bitmaps plus glyph rasterisation; every Korean character on both sides is drawn by the OS fallback font, because the site ships 38 Latin `@font-face` blocks and no Korean face at all. |

## The shape of the failure, in one line

At **1440** the clone is right. At every width **below** 1440 it is the same page frozen at
1440 px and clipped — so flip between `link_1440_clone.png` and `link_1024_clone.png` and
watch the layout not change while the window does.
