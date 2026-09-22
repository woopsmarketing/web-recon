# 01 — Frontend data contract (diagnostic)

Machine-readable: [`data-contract.json`](data-contract.json). This is the **minimum contract the homepage
code reads** for this captured build, recovered statically. It is **not** a production API schema.

## How it was recovered

- Read-only static reading of the preserved minified chunks: `pages/index` (sc0028), chunk 7925
  (sc0027: the shared carousel wrapper module 3640 and the PortfolioItem component), and `_app` (sc0025:
  the generated axios client, the shared image component and the price-range table).
- Every field cites a file, a byte offset and a verbatim snippet. `build-contract.mjs` re-finds
  **all 80 snippets of the evidence file (`tmp/…/contract-evidence/contract-evidence.json`) at their stated offsets**; 77 of them are carried into `data-contract.json` (review NOTE 6) in the preserved bytes before it writes the JSON
  (`evidenceVerification.problems = []`).
- Captured DOM was used only for **counts and aspect ratios**. No names, text or URLs were copied.
- A field that no code reads is not in the contract. Unproven items are listed separately.

## The four endpoints

All four are `GET` on **one shared cross-origin API host** (`https://dev-api.apartmentary.com`; the page origin differs, so CORS applies), called by the generated axios client. `response.data` is the HTTP body.

| diagnosticName | request | body envelope | collection | totalCount |
|---|---|---|---|---|
| `mainBanners` | `/api/v1/main-banners/action/get-displays` | `{data:[ITEM]}` | `data`. Must be an array: `N.length` is read with no fallback; `[]` hides the hero | none |
| `portfoliosArea1` | `/api/v1/portfolios/action/get-by-paging?count=10&isBottomArea1Display=true&page=0` | `{data:{data:[ITEM]\|null,totalCount}}` | `data.data` (`\|\|[]`; `body.data` must be an object) | read into a discarded expression, not used |
| `portfoliosArea2` | same path, `isBottomArea2Display=true` | same | same | same |
| `reviews` | `/api/v1/reviews/action/get-by-paging?count=6` | `{data:{data:[ITEM]\|null}}` | `data.data` (`\|\|[]`); section returns null when empty | never read (unproven whether the API sends it) |

### `mainBanners` item (all optional; the item itself must be a non-null object)

| field | kind | used for (evidence in JSON) |
|---|---|---|
| `isPcVideo` / `isMobileVideo` | behaviour | truthy → `<video><source src=pcUrl\|mobileUrl>`; autoplay stops, video plays, advances on `ended` (sc0028 @17401, @6840) |
| `pcUrl` / `mobileUrl` | image | `<img src>` via the shared image component, no URL prefixing; falls back to `portfolio?.pcMainBannerImageUrl` / `…mobileMainBannerImageUrl` then `""` (@17538) |
| `portfolio.{uuid, pcMainBannerImageUrl, mobileMainBannerImageUrl}` | link / image fallback | `?.`-guarded everywhere; `uuid` is the non-GENERAL click target `/portfolio/{uuid}` |
| `text` (may contain `\n`) / `subText` | display | headline / sub-headline (@17830, @18032) |
| `textColor` | conditional | truthiness only: black vs white text and icons. Real type unproven |
| `type` | behaviour | `=== "GENERAL"` → `window.open(linkUrl)`, else `router.push`. Only `"GENERAL"` appears as a literal |
| `linkUrl` | link | the detail button is hidden when `type==="GENERAL"` and `linkUrl` is falsy (@18086) |

### Portfolio item (areas 1 and 2)

| field | required | kind | evidence |
|---|---|---|---|
| `uuid` | **needed for a valid key/link** (unguarded, but a missing value does not throw: key becomes `undefined-i`, link `/portfolio/undefined`) | key + link | React key `` `${uuid}-${i}` `` and `router.push("/portfolio/"+uuid)` (sc0028 @11714). What throws is a **null item** (`e.title` unguarded). Corrected per review MINOR 5 |
| `title` / `description` | no (`\|\|""`) | display | PortfolioItem; description paragraph only when truthy |
| `pcThumbnailImageUrl` / `mobileThumbnailImageUrl` | no (`\|\|""`) | image | plain `<img>`; container aspect 580/380 (sc0027 @37320) |
| `pricePerSize` | no, but **risky** | display | caption `"평당 " + (pricePerSize && filterPrices.filter(range)[0].name)`. Falsy prints `평당 undefined/null/0`. Truthy but outside every range (negative, non-numeric) → `[0].name` TypeError → render crash. Area 1 uses `<` for the upper bound; area 2 uses `<=` |

### Review item

| field | required | kind |
|---|---|---|
| `text` | no | display (card body) |
| `customerName` | no | display, rendered as `{name} 님` |

No review image fields exist; section images are bundled static files.

## UI facts that set cardinality (bundle literals)

- **Hero:** Swiper `loop:true`, `autoplay{delay:5000, disableOnInteraction:true}`, 1 slide per view,
  one dot per item; prev/next and keyboard arrows only at `md` and up.
- **Carousel wrapper (portfolios, reviews):** `slidesPerView: Q||(md?3:1)`, `spaceBetween` default 50,
  no loop or autoplay. Progress bar width = `swiper.width/(count-(md?2:0))`: 2 items → division by 0;
  1 → negative; 3 → full width and static; ≥4 → moving bar.
- **Reviews:** one per slide at `md` and up; 2 stacked per slide below `md` (`ceil(n/2)` slides).
- **Media queries:** `theme.breakpoints.up("md")` = `(min-width:900px)` (MUI defaults, sc0025 @58397);
  `(max-width:1280px)` in PortfolioItem; `(min-width:1920px)` evaluated on the homepage with its
  result discarded. These are the literal values of this build. No generic breakpoint is inferred.
- **Images:** no homepage API image goes through `next/image`. `_app` has a next/image config, but
  every API image uses the shared `<img>` component. **No `/_next/image` routing is needed.**

## Unproven (not guessed)

- `totalCount` in the reviews response.
- `type` values other than `"GENERAL"`.
- The real type of `textColor`.
- Where banner videos would be hosted. The captured mp4 comes from a hard-coded URL in chunk 7925,
  not from API data.
- Any item field the homepage does not read.
