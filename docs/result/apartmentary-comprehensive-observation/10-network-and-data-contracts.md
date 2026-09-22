# 10 — Network and data contracts

Evidence index: `data/apartmentary.com/comprehensive-observation-2026-09-18/network/api-table.json` (every first-party
API call, all Source Package runs of this pass, both viewports), per-family field census
`…/network/census/*.census.txt`, SSR fingerprints `…/level-a/ssr-fingerprints.json`, interaction-triggered calls
`…/interactions/interactions.json` (+ `json-bodies/`).

Label rules: **OBSERVED** = in a captured response or DOM · **INFERRED** = meaning from rendering or code ·
**UNKNOWN** = not proven.

## 1. Transport facts (OBSERVED)

- One API origin, `https://dev-api.apartmentary.com`, cross-origin from the page. Every response has
  `content-type: application/json;charset=UTF-8` and `access-control-allow-origin: https://apartmentary.com`.
- A fresh anonymous context gets **200** for every public GET. Request headers were not recorded (policy).
- Envelope for every family: `{ data, error }`, with `error: null` in every captured response.
- Paged envelope: `data = { cursor, totalCount, page, data:[…] (, sortType) }`. **`page` in the response is `0` even
  when `page=1` was requested**, although the items are the correct second page (`/portfolio?page=1`:
  first uuid differs, `cursor` differs). Do not trust the echoed `page`. `sortType` echoes `null` although
  `DISPLAY_ORDER` was requested.
- Timestamps are `YYYY-MM-DDTHH:mm:ss` with no zone. Values track Asia/Seoul (INFERRED from capture time).
- Records are **edited live**: two `lastModifiedDate` values changed between the desktop and mobile loads of
  `/portfolio?page=0`, within the same 57-s capture run (desktop body `98928bcf470e…` vs mobile `19640f1c3c…`, 2 diffs).
- **Page-view side effects:**
  - `/portfolio/[uuid]` fires `POST /api/v1/portfolios/action/add-view-count/{uuid}`, and `/journal/[uuid]` fires
    `POST /api/v1/journals/action/add-view-count/{uuid}`.
  - A plain load fires **one** attempt. That held for every harness load: 7 portfolio-detail and 9 journal-detail loads or
    transitions, including room-tab, before/after and share clicks.
  - In the observer captures, each portfolio viewport produced **3** POSTs (at ≈0.7 s, ≈5.7 s, ≈7.1 s). Each came with a full
    set of analytics page-view beacons and a Channel.io boot, i.e. three page-view cycles. The cause of the extra cycles in
    the observer was not isolated (INFERRED: the observer's own page normalisation).
  - The standard observer does not block these POSTs, so this pass's Source Package captures incremented view counters: 4 portfolio pages ×
  2 viewports × 3 = 24, and 4 journal pages × 2 × 1 = 8. The two failed `/journal/jqodqrfdpw` attempts timed out on `load`
  and wrote no network record, so whether they fired the POST is unknown (at most 2 more). The pass's own
  harnesses (nav map, responsive probe, interactions, clone QA) **abort every first-party non-GET** request,
  so they caused none. No form, login or other mutation was performed.

## 2. PAGE → (INTERACTION) → REQUEST → RESPONSE → RENDERED REGION

| Page | Trigger | Request | Response (OBSERVED) | Rendered region |
|---|---|---|---|---|
| every route | SSR (`getServerSideProps`) | document | `__NEXT_DATA__.props.pageProps` = `bannerData`, `popupData`, `footerData` (+ page data below) | top band banner, entry promo popup, footer company block |
| `/` | mount `useEffect` | `GET /api/v1/main-banners/action/get-displays` | `data[9]` | hero Swiper (image per slide, pc/mobile art) |
| `/` | mount | `GET /api/v1/portfolios/action/get-by-paging?count=10&isBottomArea1Display=true&page=0` | `data.data[10]`, total 10 | portfolio carousel 1 |
| `/` | mount | `…get-by-paging?count=10&isBottomArea2Display=true&page=0` | `data.data[5]`, total 5 | portfolio carousel 2 |
| `/` | mount (review component) | `GET /api/v1/reviews/action/get-by-paging?count=6` | `data.data[6]`, total 8 | review carousel |
| `/portfolio?page=N` | mount / page / filter / sort change | `GET /api/v1/portfolios/action/get-by-paging?count=30&isListDisplay=true&keyword=&page=N&prices=&serviceTypes=&sortType=DISPLAY_ORDER&spaceSizes=&styleTypes=` | `data.data[30]`, total **659** | card grid (30 cards) + pagination (22 pages) |
| `/portfolio/[uuid]` | SSR | document | `pageProps.portfolio` (full 45-key record), `imageDetailUuid: null` | whole detail page (no client data fetch) |
| `/portfolio/[uuid]` | mount | `POST …/add-view-count/{uuid}` (1 per plain load; 3 per observer capture, §1) | full record | none (side effect) |
| `/portfolio/[uuid]/images` | mount, when the store has no portfolio (direct load) | `GET /api/v1/portfolios/{uuid}` | full record | mobile/tablet image gallery (desktop direct load renders blank, see `05-…`) |
| `/journal?page=N` | mount | `GET /api/v1/journals/action/get-by-paging?count=1&page=0` | `data.data[1]`, total 23 | featured (latest) post block, same on every page |
| `/journal?page=N` | mount / page change | `GET …/journals/action/get-by-paging?count=4&exceptFirst=true&page=N` | `data.data[4]` | 4-card grid |
| `/journal/[uuid]` | SSR | document | `pageProps.journal` (19 keys incl. `html`, `design`, `nextUuid`, `prevUuid`) | inline body (title/subtitle live inside `html`) + prev/next row |
| `/journal/[uuid]` | mount | `GET /api/v1/journals/{uuid}` + `POST …/journals/action/add-view-count/{uuid}` | same record | re-render of the same content (INFERRED; the DOM matches SSR) |
| `/brand` | mount | `GET /api/v1/newses/action/get-displays` | `data = { "2021":[12], "2022":[12], "2023":[9], "2024":[14], "2025":[13] }` | press/news list grouped by year |
| `/terms` | mount | `GET /api/v1/terms/action/get-displays?termsType=SERVICE_USE` | single document `{html, design, termsType}` | terms body |
| `/terms?termsType=PERSONAL_INFO` | mount | `GET …/terms/action/get-displays?termsType=PERSONAL_INFO` (fired **twice**, identical body) | same shape | privacy-policy body |
| `/service`, `/faq`, `/stores` | — | **no first-party API call** | — | content is bundled in the JS/SSR markup (static) |

Interaction-triggered rows (pagination, filter, sort, tabs) are in §5.

## 3. Record contracts (field census over the captured bodies)

### 3.1 Portfolio record — 45 keys. Sources: list pages 0+1 (60 records), home areas (15), detail SSR (29 crawl URLs, fingerprints)

| Group | Fields | OBSERVED | INFERRED meaning |
|---|---|---|---|
| identity | `uuid` (10-char lowercase slug-like, also the route segment) | always present | primary key + URL slug |
| audit | `createdDate`, `createdBy`, `lastModifiedDate`, `lastModifiedBy`, `isActive` | always present | CMS audit (not displayed) |
| copy | `title`, `description`, `content` | non-empty in all 60 | card/detail title, subtitle, "상세 내용" body (plain text with `\n`, `✓`, `-` bullets; **not HTML**) |
| building | `aptName`, `spaceSize` (number, 평), `constructionEndYear` (ISO date string; building completion year → "준공연도") | always present | spec table |
| address | `zipCode` (sometimes `""`), `address`, `roadAddress`, `addressDetail` (always null), `displayAddress` (null in 60/60; non-null in 1 home item) | present | detail "주소" = `displayAddress ‖ roadAddress` (static analysis) |
| project | `constructionStartMonth`, `constructionStartDate`, `constructionEndDate`, `constructionPart` (comma-joined Korean room list), `finalConstructionPrice` (number), `pricePerSize` (number, 만원/평) | always present | "시공 시기", "시공 기간" (weeks computed), "시공 범위", "평당 견적" (bucket label, never the raw number) |
| customer | `customerName`, `customerReview` | empty string in 60/60 recent; non-empty in 1 of the 29 crawl-era detail pages | optional "고객의 한마디" block |
| media | `pcThumbnailImageUrl`, `mobileThumbnailImageUrl` | always present | list/home card image, swapped at the md breakpoint |
| gallery | `imageSets[]` (14–81 per record): `{uuid, displayOrder, name, beforeImageUrl, afterImageUrl, isActive, changeLog:null}` | `name` = room label ("거실", "욕실-A", …); `afterImageUrl` always set; `beforeImageUrl` set in **12 of 1,737** recent images, and in 3–10 per record for the 20 crawl-era records of old family f000011 | room tabs "거실 (6)" = group by `name`; before/after toggle only for pairs |
| taxonomy | `serviceTypes[]` (always exactly 1: `OLD` / `NEW` observed), `styleTypes[]` (0–8 of `WOOD_POINT, MIDDLE_ROOM, SPECIAL_BATHROOM, IRELAND_KITCHEN, SPECIAL_MARBLE, SPECIAL_TILE, PARQUET_FLOORING, CHILDREN_ROOM, COLOR_TILE`), `storeType` (`BANPO, DALMAGI, DONGTAN, DOSAN, GONGDEOK, GWACHEON, GWANGGYO, GWANGHWAMUN, GWANGJIN, ICHON, JAMSIL, MAGOK, MAPO, MOKDONG, OKSU, PANGYO, SONGDO, SUJI, NONE`, or null; all values observed across this pass's list, home and detail bodies) | observed values | service label ("5년 이상 구축" for OLD), "키워드" row (empty row when `[]`), store branch (not displayed on detail) |
| placement flags | `isListDisplay`, `isMainBannerDisplay`, `isBottomArea1Display`, `isBottomArea2Display` (true/false/null), `displayOrder`, `recommendDisplayOrder`, `bottomArea1DisplayOrder`, `bottomArea2DisplayOrder`, `mainBannerDisplayOrder` | tri-state booleans | **template placement data inside the content record.** Architecture boundary 3 forbids placement fields in content; see `11-…` |
| legacy banner fields | `pcMainBannerImageUrl`, `mobileMainBannerImageUrl`, `mainBannerText`, `mainBannerSubText`, `mainBannerTextColor` | null in 60/60 (`""` in some crawl-era records) | a superseded "portfolio as hero banner" mechanism (INFERRED) |

UNKNOWN: whether `serviceTypes` can hold more than one value or `KITCHEN`/`PET`/`GARDEN`
(declared in the bundle enums, never observed), and what `recommendDisplayOrder` feeds (no consumer found in
the list/detail code).

### 3.2 Main banner — 9 items (see `03-…`)

`uuid, audit, isActive, isDisplay, displayOrder (−5…3), type ("GENERAL"), linkUrl/text/subText (all ""), pcUrl,
mobileUrl, textColor (boolean), isPcVideo/isMobileVideo (false), portfolio/portfolioUuid (null)`.

### 3.3 Review — 6 of total 8

`uuid, audit, isActive, isDisplay, displayOrder (1…6), customerName (real names), text`.

### 3.4 Journal (post) record — 19 keys (list: 5 records; detail SSR: 15 crawl URLs)

| Field | OBSERVED | INFERRED |
|---|---|---|
| `uuid` | 10-char slug | route segment |
| `title` | non-empty | card + detail title |
| `subTitle` | non-empty (e.g. "<apartment> 49PY") | card second line (apartment + size) |
| `description` | **null in 20/20** | unused |
| `html` | full XHTML e-mail-style document exported by **Unlayer** (`<!DOCTYPE … XHTML 1.0 Transitional>`, mso conditionals), 15–73 KB | rendered **inline** into the page DOM (`u-row-container` markup), not an iframe |
| `design` | Unlayer design JSON string (`counters`, `body.rows[].columns[].contents[]`) | editor source-of-truth; the page does not render it (static-analysis claim) |
| `imageDetailPcUrl` | present | list card image, desktop (static reading) |
| `imageMobileUrl` | present | list card image, mobile + detail `og:image` (static reading) |
| `imagePcUrl`, `imageDetailMobileUrl` | present | no reader found in the list or detail chunks. The detail page renders no cover (`07` §2) |
| `viewCount` | number (tens of thousands) | not displayed on the list |
| `nextUuid`, `prevUuid` | **null in list responses**; populated in detail SSR. `prevUuid` is null on `ibrdwjrdqw`, which is the **newest** post (the featured item of `/journal`), so "prev" points to newer posts (OBSERVED: SSR chain + live clicks, `07` §2/§5) | detail prev/next navigation |
| `isDisplay`, audit | present | — |

No `category`, `author`, `publishDate` or `tags` field exists. The only date is `createdDate` (audit).
Body composition across the 15 crawl URLs (from `design`): **10 native Unlayer block posts** (rows of `image`,
`text`, `heading`, `divider`; cells `1`, `1:1`, `2:1`, `1:2`, `50`), and **5 posts whose whole body is one Unlayer `html`
block** (pasted raw HTML, 26–41 `<img>`). 5 more posts classified from captured list bodies give 14 native / 6 html-block of 23 (`07` §3). `htmlIframe = 0` and `htmlVideo = 0` in all 15.

### 3.5 Terms document

`{uuid, audit, isActive, html, design, termsType}`. `termsType` values observed: `SERVICE_USE` (default for `/terms`),
`PERSONAL_INFO`, `MARKETING` (live tab switch, `08` §3). `design` is Unlayer JSON again (`u_content_text/heading/divider`). The legal wording is not reused.

### 3.6 News (press) item — 60 items grouped by year key

`id` (number), `idHash`, `createdUserId`, `lastModifiedUserId`, `forceSaveBySystem`, audit, `isActive`, `isDisplay`,
`pressName`, `publishDate`, `title`, `url` (external article), `displayOrder`. A **different entity style** (numeric
id + hash, user ids) from the uuid-keyed records. INFERRED: a separate or newer backend module.

## 4. Synthetic vs actual

See `03-home-api-json-refresh.md` §Synthetic vs actual. Summary: the synthetic fixtures were a correct
**read-subset** of the actual shapes. The only content-path divergence is that the synthetic hero exercised text overlays the
live data does not use.

## 5. Interaction-triggered requests

Sources: `interactions/interactions.json` + `interactions-followup.json`. The DOM-side effects are in `09` §2.
- First-party API responses fired during interactions are stored in `interactions/json-bodies/` (31 files, sha-named).
- No request headers or bodies are stored. URL secrets are redacted.

### 5.1 First-party (apartmentary.com / dev-api)

| Trigger | Request(s) | Response used for |
|---|---|---|
| portfolio list: page / filter / sort / reset / direct query | 1 × `GET …/portfolios/action/get-by-paging?count=30&isListDisplay=true&…` with every param present | grid + pagination. Totals seen: 659 (none), 289 (`spaceSizes=40`), 553 (`serviceTypes=OLD`), 28 (`keyword=반포`) |
| any internal route change (card, CTA, cross-sell, more-links, prev/next) | `GET /_next/data/yMHNQjHujDVTgIp539WqR/<route>.json[?query]` | gSSP props for the target page |
| portfolio detail in-page (room tab, before/after, 사진 더보기, share, swipe) | **none** | — (client state + shallow URL replace) |
| portfolio detail mount | `POST …/portfolios/action/add-view-count/{uuid}` | **aborted by the harness** (see §1) |
| journal detail mount / prev / next | `GET /api/v1/journals/{uuid}` + `POST …/journals/action/add-view-count/{uuid}` (aborted) | re-render of the same record |
| journal list mobile load-more | `GET …/journals/action/get-by-paging?count=4&exceptFirst=true&page=N` | 4 appended cards; response `page` echoes 0 |
| terms tab | `GET …/terms/action/get-displays?termsType=<T>` | full `{html, design}` replace |
| FAQ, service, stores, brand-year interactions | **none** | local state only |

**Mutations:**
- The only first-party mutation any observed page attempted on its own is the view-count POST.
- The harnesses aborted all 16 attempts they saw (7 portfolio, 9 journal).
- Nothing else (forms, reviews, inquiries) was attempted or triggered.

### 5.2 Third-party (evidence only; IDs are never reused)

**When they fire:** every route change and many clicks fire marketing/analytics beacons. They were **not** blocked (they are
not first-party mutations):

| Beacon | Seen as |
|---|---|
| GA4 | `POST …/g/collect?…tid=G-37HT928R4X…` (`analytics.google.com`, `stats.g.doubleclick.net`) |
| GTM | `GTM-M8JGCP6` → `www.google.com/ccm/collect`, `ad.doubleclick.net/ccm/s/collect` |
| Google Ads | conversion `GET …/pagead/conversion/10998713121/`, `POST www.google.com/measurement/conversion` |
| Kakao pixel | `GET bc.ad.daum.net/bc?d={track_id:6488840723959691705, event_code: PageView / Participation / viewContent…}` |
| Naver analytics | `POST wcs.naver.com/b` |
| Karrot pixel | `POST collect.daangn.com/p/c` |
| Facebook | `connect.facebook.net`, `www.facebook.com` |
| Channel.io | `POST api.channel.io/front/v8/elastic/plugins/<plugin id>/boot` → **401** (anonymous; the chat launcher still renders) |

**Harness classification caveat:**
- The interaction harness's per-step `requests` list selects URLs containing `apartmentary.com` and strips the host.
- So third-party beacons whose **query** carries the page URL (`/g/collect`, `/pagead/…`, `/bc?…`, `/ccm/collect`) also
  appear there, host-less.
- They are distinguishable by path. Only `API/…`, `/_next/data/…` and document paths are first-party.
- The mutation-abort rule itself keys on the **hostname** and is unaffected.

**Gotcha:** the harness `redact()` pattern (`key|token|secret|…`) also masks the portfolio `keyword` param in stored URLs
(`keyword=REDACTED`). The keyword value is visible in the page URL and in the response contents.
