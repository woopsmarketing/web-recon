# 03 — Home `/` public JSON refresh

Scope: the only new `/` evidence collected in this pass is the real JSON response bodies. All earlier visual/runtime
evidence for `/` (Phase 1/2/3B/3C/3C.1) is reused unchanged and was not recaptured or mutated.

## Capture

| Item | Value |
|---|---|
| Run | `data/apartmentary.com/2026-09-18T08-30-49-211Z/` (`pnpm observe https://apartmentary.com/ --source-package --no-layout-probe`, JSON body capture default-ON) |
| Build | `yMHNQjHujDVTgIp539WqR`, the same buildId as the frozen 2026-09-16 capture, so the earlier bundle evidence still applies to the live site |
| Context | fresh anonymous Chromium context, no cookies. Request headers were not recorded (policy) |
| Result | all 4 first-party calls returned **200** to an anonymous visitor and all 4 bodies were captured. Desktop and mobile bodies are byte-identical (same sha256) |

This closes the Phase 3D-A "biggest open UNKNOWN" (`source-preservation-phase3d-api-policy/02-…`): the real API **does**
answer an anonymous visitor with no login state, and the response content type is now observed.

| diagnosticName | request | status | content-type | bytes | sha256 (12) | desktop file |
|---|---|---|---|---|---|---|
| `mainBanners` | `GET /api/v1/main-banners/action/get-displays` | 200 | `application/json;charset=UTF-8` | 4,896 | `be79c78b01c1` | `…/desktop/source-package/network/n0034.be79c78b01c1.json` |
| `portfoliosArea1` | `GET /api/v1/portfolios/action/get-by-paging?count=10&isBottomArea1Display=true&page=0` | 200 | same | 88,592 | `f7866664a875` | `…/n0032.f7866664a875.json` |
| `portfoliosArea2` | `GET …/get-by-paging?count=10&isBottomArea2Display=true&page=0` | 200 | same | 48,821 | `4e573d534a46` | `…/n0033.4e573d534a46.json` |
| `reviews` | `GET /api/v1/reviews/action/get-by-paging?count=6` | 200 | same | 2,457 | `89d542d9a243` | `…/n0031.89d542d9a243.json` |

Origin: `https://dev-api.apartmentary.com` (cross-origin; `access-control-allow-origin: https://apartmentary.com`).
All 4 calls are XHR and start about 350 ms after navigation, from the page's first `useEffect` (consistent with Phase 3A).
Other JSON seen on `/`: `nam.veta.naver.com/nac/2` (23 B, analytics) and Channel.io plugin boot calls (child frame,
skipped by policy). Neither is site content.

## Actual response structure (OBSERVED)

### Common envelope

Every response is `{ data, error }`, and `error` was `null` in all 4.

- Paged endpoints: `data = { cursor, totalCount, page, sortType?, data: [ITEM] }`. `cursor` is the uuid of the last item.
  `sortType` is present on portfolios (value `null`) and absent on reviews.
- `mainBanners`: `data = [ITEM]`, a bare array.

### `mainBanners` — 9 items

| field | observed type / values | notes |
|---|---|---|
| `uuid` | string | |
| `createdDate`, `lastModifiedDate` | string `YYYY-MM-DDTHH:mm:ss` (no zone; values track KST) | audit |
| `createdBy`, `lastModifiedBy` | string (opaque id) | audit |
| `isActive`, `isDisplay` | boolean, all `true` | display flag |
| `displayOrder` | number, `-5 … 3`, ascending in the response | ordering (negative values exist) |
| `type` | string, all `"GENERAL"` | |
| `linkUrl`, `text`, `subText` | string, **empty in all 9** | the hero shows images only; the detail button is hidden |
| `pcUrl`, `mobileUrl` | string, non-empty, `media-landing.apartmentary.com`, jpg/png | separate PC and mobile art |
| `textColor` | **boolean** (1 `true`, 8 `false`) | resolves the Phase 3C UNKNOWN "real type of textColor" |
| `isPcVideo`, `isMobileVideo` | boolean, all `false` | no video banners at capture time |
| `portfolio`, `portfolioUuid` | `null` in all 9 | optional link to a portfolio; unused now |

### `portfoliosArea1` (10 items, `totalCount` 10) / `portfoliosArea2` (5 items, `totalCount` 5)

Each item is the **full portfolio record**: the same 45 keys as the `/portfolio` list and `/portfolio/[uuid]` SSR
props. See `10-network-and-data-contracts.md` §Portfolio record for the full field census. Points specific to the home page:

- Area membership is a per-record flag: `isBottomArea1Display` / `isBottomArea2Display` (`true` / `false` / `null`).
  In each area's items, that area's ordering field (`bottomArea1DisplayOrder` / `bottomArea2DisplayOrder`) is `0`; the other
  area's field is `0` or `null`. So the effective order is API order.
- The fields the home card reads (`uuid`, `title`, `description`, `pc/mobileThumbnailImageUrl`, `pricePerSize`) are
  present and non-empty in all 15 items.
- `pricePerSize` ranges 180–428 in 14 items. One area-1 item has **3435**, roughly 10× the others. It falls into the
  open-ended top bucket `[400,∞)`, so it renders the top bucket's label rather than crashing (bucket table from `source-preservation-phase3c/data-contract.json`). That it is a data-entry error
  (e.g. meant 343.5) is **INFERRED**, not proven.
- Each item also carries `imageSets` (19–47 images), `content`, address fields etc. The home page receives far more
  data than it renders (inefficiency, not a defect we should copy).

### `reviews` — 6 items, `totalCount` 8

Fields: `uuid`, audit fields, `isActive`, `isDisplay` (`true`), `displayOrder` (1…6 ascending), `customerName`
(string, non-empty, 3 chars, real customer names; **not reproduced here**), `text` (43–77 chars).
Resolves the Phase 3C UNKNOWN: **reviews do return `totalCount`** (8 > 6 requested).

## Synthetic (Phase 3C/3C.1) vs actual

| Aspect | Synthetic fixture (`source-preservation-phase3c/synthetic-fixtures.json`) | Actual (2026-09-18) | Consequence |
|---|---|---|---|
| Envelope | `{data:…}` only | `{data:…, error:null}`; paged: plus `cursor`, `page`, `sortType` | Synthetic was a **subset**. The code never reads the extra keys, so replay behaviour is unaffected |
| `mainBanners` count | 9 | 9 | match |
| `mainBanners.text/subText` | non-empty in 2 of 9 (exercised the multi-line title path) | empty in 9 of 9 | the real hero shows **no text overlay** at capture time. 3C exercised a text path the live data does not use |
| `mainBanners.textColor` | omitted ("type unproven") | boolean | now proven |
| `mainBanners.type` | `GENERAL` | `GENERAL` | match (still the only observed value) |
| `mainBanners.portfolio` | omitted | `null` | match in effect (optional-chained) |
| `portfoliosArea1` count | 10 | 10 (`totalCount` 10) | match |
| `portfoliosArea2` count | 4 | **5** (`totalCount` 5) | **data drift**: the fixture's `cardinalityReason` records that the 09-16 page showed 4. Cardinality is data-driven, not structural |
| Portfolio item fields | 6 fields the card reads | 45 fields | synthetic = minimal read-contract; real = full record |
| `pricePerSize` | in-range values | one outlier 3435 | top bucket is open-ended, so no crash |
| `reviews` fields | `text`, `customerName` | plus `uuid`, `isDisplay`, `displayOrder`, audit | read-contract subset held |
| `reviews.totalCount` | omitted ("unproven") | present (8) | now proven |

## Schema-confidence change

| Item | Before (3C) | Now |
|---|---|---|
| Envelopes | INFERRED from code | **OBSERVED** |
| `textColor` type | UNKNOWN | **OBSERVED boolean** |
| `reviews.totalCount` | UNKNOWN | **OBSERVED** |
| Anonymous access / content-type | UNKNOWN | **OBSERVED** 200, `application/json;charset=UTF-8` |
| Full portfolio record shape | UNKNOWN beyond 6 read fields | **OBSERVED** 45 keys (see `10-…`) |
| `type` values other than `GENERAL`; video banner hosting | UNKNOWN | still UNKNOWN (no live example) |
| Semantics of `displayOrder` negatives, `bottomArea*DisplayOrder` all 0 | — | OBSERVED values, semantics INFERRED (sort key; ties fall back to API order) |

Use: schema-confidence evidence only. **None of this data is template default content** (architecture invariant 5/6).
