# Visual review — interiorbay.co.kr (Task 28.6, lane P5 / W7)

14 PNGs, 34 MB. Full report: `docs/result/28.6/lanes/w7-interiorbay.md`.

**Read this first.** `interiorbay.co.kr` serves **two different HTML documents at the same URL** depending on the user agent — 2 622 elements and 155 `<table>`s to a desktop UA, 2 211 elements and 31 `<table>`s to a mobile one — and it authors **zero width media queries**. Its desktop document is a fixed 1 525 px wide at every viewport (1 620 px at 1440) and simply overflows horizontally on a narrow screen; it never reflows. The grader captures both sides with one desktop-shaped browser at every width, so **the SOURCE image is always the desktop document**, while the clone switches subtree at 915 px. That single fact explains every image below.

Naming: `home_*` = `/`, `sub_*` = `/kwa-38941-515`; `<route>_<width>_source.png` is the live site, `<route>_<width>_clone.png` is the reconstruction, both full-page.

---

## `/` — 2 BLOCKER, 3 MAJOR, 0 PASS (floor at the same 5 pairs: 1 PASS, 1 MINOR, 3 MAJOR)

| Pair | Verdict | Deciding channel | Look at this |
|---|---|---|---|
| `home_390_source.png` ↔ `home_390_clone.png` | **BLOCKER** | `missing-text-ratio` 63.26 % | **They are not the same page.** The source is the desktop site — dark hero, two side-by-side estimate tables, four portfolio galleries, a wide corporate footer. The clone is a phone app: hamburger bar, big yellow and blue tiles, an orange call-to-action button. Nothing in the clone's top half exists in the source's top half. |
| `home_700_source.png` (use `home_390_source.png`) ↔ `home_700_clone.png` | **BLOCKER** | `missing-text-ratio` 63.26 % | Same two documents as at 390; the clone's phone layout is now stretched across 700 px, so its tiles and cards are wider but the content is still the mobile document's. The source image is byte-for-byte the 390 one (15 bytes apart) — the source did not change. |
| `home_1024_source.png` ↔ `home_1024_clone.png` | **MAJOR** | `missing-text-ratio` 4.44 % | The clone has switched to the desktop tree and the page now reads as the same site. Two things to look at. **Right of the first estimate table:** the source shows a second table (견적대기리스트) beside it; the clone shows white. **The 인테리어 트렌드 band:** the source has two large trend cards and a strip of four thumbnails; the clone has the filter chips over empty white. The harness measures the clone's largest empty band at 8.74 % of the page against the source's 2.22 %, and records this pair as one of four with clipped overflow — the clone's document is exactly 1 024 px wide where the source's is 1 525. |
| `home_1100_source.png` (use `home_1024_source.png`) ↔ `home_1100_clone.png` | **MAJOR** | `missing-text-ratio` 4.44 % | Identical story to 1024 with 76 px more room: same missing second table, same blank trend band, same 8.74 % empty band. The source document is the same 1 525 × 5 402 as at 1024. |
| `home_1440_source.png` ↔ `home_1440_clone.png` | **MAJOR** | `missing-text-ratio` 4.44 % | The best pair in the lane — same total page height to the pixel (5 402 px), median matched-box offset 2 px. Two differences are plainly visible: the **hero carousel is showing a different slide** (source "…100% 맞춤인테리어", clone "…'어떤 회사' 입니다" — the clone froze whichever slide was up when the page was observed), and the **wide white gaps** where the source paints its second estimate table and its two trend cards. Clone largest empty band 8.74 % of the page against the source's 2.81 %. |

## `/kwa-38941-515` — 5 BLOCKER, 0 PASS (floor at the same 5 pairs: **5 PASS, 0.00 % pixel residual**)

| Pair | Verdict | Deciding channel | Look at this |
|---|---|---|---|
| `sub_1440_source.png` ↔ `sub_390_clone.png` … `sub_1440_clone.png` | **BLOCKER** ×5 | `empty-band-excess-ratio` 73.8–80.0 %, `missing-text-ratio` 100 % | The clone is a white page reading **"Route not reconstructed — This path is not in the SiteSpec route table."** It is an HTTP 404 with 8 elements against a source of 521 elements and 12 706 px of portfolio detail page. This measures route *presence*, not layout: URL discovery never returned this path (though the homepage links it twice), and the dedicated pipeline run that would have generated it crashed at `interaction-modeling`. |

One source image stands for all five sub-route pairs: the source document is the **identical** 1 525 × 12 706 px page at 390, 700, 1024, 1100 and 1440, and each capture is 18.9 MB. Keeping five copies would have cost 94 MB.

---

## Source images deliberately omitted (budget), and why

- `home_700_source.png` — the same 1 525 × 5 402 document as `home_390_source.png`; the two captures differ by 15 bytes. Use the 390 source.
- `home_1100_source.png` — the same 1 525 × 5 402 document as `home_1024_source.png`; the 1.8 % byte difference is live per-request content. Use the 1024 source.
- `sub_{390,700,1024,1100}_source.png` — identical to `sub_1440_source.png` (see above).

**No BLOCKER or MAJOR clone image was dropped: all ten are here.** No MINOR pairs existed to drop. Nothing was resized, cropped or recompressed.
