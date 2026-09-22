# 04 — Portfolio list `/portfolio` (Level C)

## Evidence

**Level C captures** (desktop 1440 + mobile 390, `--source-package`, JSON default-ON):

| URL | Run | API body (both viewports) |
|---|---|---|
| `/portfolio?page=0` | `data/apartmentary.com/2026-09-18T08-28-29-279Z/` | 268,038 B |
| `/portfolio?page=1` | `…08-29-45-950Z/` | 233,911 B |

**Faithful references (preservation clones):**
- page0 = `data/apartmentary.com/preservation-clones/2026-09-18T08-39-42-788Z/`
- page1 = `…/2026-09-18T08-39-50-607Z/`
- QA in §7.

**Other evidence:**
- Live interactions (`interactions/interactions.json`: `portfolio-list-desktop`, `-edge`, `-mobile`; follow-up `portfolio-list-url-params`, `home-area-more-desktop`, `fresh-w900/w1280-portfolio-list`).
- Responsive probe (`09`).
- Code: `static-analysis/portfolio.md` §1–§4.

## 1. Routing and URL state

| Aspect | Observed |
|---|---|
| Route | `/portfolio` (gSSP returns only the shell props `bannerData`/`popupData`/`footerData`; the list itself is **client-fetched**) |
| Entry URL | Every nav entry lands on `/portfolio?page=0` |
| `page` | **0-based** in URL and API; the UI shows 1-based numbers. `?page=1` = UI "2" |
| Page size | **30**, a hard-coded store constant (not in the URL) |
| Total | `totalCount` **659** gives **22 pages** (`ceil`) |
| Out of range | `?page=99` → 200, empty grid, no redirect |
| Filter/sort state | URL query, kept in sync by shallow `router.replace`: `spaceSizes`, `styleTypes`, `prices`, `services`, `sortType`, `keyword` (all comma-joined). Direct loads with these params are honoured (live: `?page=0&spaceSizes=30&prices=250`) |
| Transition | Clicks mutate MobX. A `useEffect` then does a shallow URL replace and refetches. There is no full navigation, and the page scrolls to top on page change |

Live URL transitions (desktop):

| Action | URL after |
|---|---|
| page "2" | `/portfolio?page=1` |
| 30평형대 | `/portfolio?page=0&spaceSizes=40` (page reset to 0) |
| + 우드가 포인트 | `…&styleTypes=WOOD_POINT` |
| + 인기 순 | `…&sortType=POPULAR` |
| 초기화 (n) | `/portfolio?page=0` |
| 3D 집 구경 | `#experience-3d` (dialog) |

**Filter value encodings (OBSERVED keys):**
- `spaceSizes`: **bucket upper bound**, e.g. 20평형대 = `30`, 30평형대 = `40`, …, 이외 = `-1`.
- `prices`: `180 / 250 / 300 / 350 / 400 / -1`.
- `styleTypes`: enum constants (`WOOD_POINT`, …).
- `sortType`: `DISPLAY_ORDER` (default, sent when nothing is chosen). The UI offers `RECENT` / `EXPENSIVE` / `CHEAP` /
  `POPULAR` / `BIG` / `SMALL`. The generated client enum also has `OLD` and `RECOMMEND`, with no UI. `POPULAR` was seen live;
  the others come from the code (`sc0025` enum).

## 2. Page anatomy

**Desktop ≥ 1281:**
1. **Hero**: full-bleed image with the transparent site header over it, title "포트폴리오" and a subtitle.
   - The subtitle **differs by band**: desktop "아파트멘터리가 바꾼 공간을 만나보세요." vs mobile "그동안 저희가 기록해온 아파트멘터리를 감상해보세요."
2. **Controls row**:
   - "3D 집 구경" button: opens the `experience-3d` dialog with 3 hard-coded example links to the external `ersatz.kr`.
   - Keyword search field, placeholder "아파트 또는 지역을 검색하세요.". It updates on keystroke with a 200 ms debounce; there is no submit.
3. **Inline filter panel**, 4 columns:
   - **평형**: 6 options.
   - **키워드**: 9 of 10 options; `드레스룸이 있는` is hidden by `display:false`.
   - **평당 견적**: **5 of 6** options. The `180만 원 이하` bucket is omitted on desktop only (source defect).
   - **정렬**: 6 options, single-select; clicking again clears.
   - A "초기화 (n)" reset shows the active-filter count.
4. **Card grid**: 3 columns, 30 cards.
5. **Pagination**: ‹ · 1 2 3 4 5 6 7 … 22 · ›, a window of 9 slots.
6. The shared bottom banner, then the footer.

**900–1280 (tablet):**
- Mobile header.
- **2-column** grid.
- "3D 집 구경 · 필터 · 🔍" controls: the filter is a **bottom sheet**, not the inline panel.

**< 900 (mobile):**
- **1-column** grid.
- "필터" opens the bottom sheet (`#portfoilo-filter`, a typo in the source).
  - The sheet has all **6** price buckets.
  - Edits are **staged** and only applied on "적용".
- Pagination "1 2 3 4 … 22" (window 6).

**No service filter UI exists in any band**, although `serviceTypes` is always sent and `?services=OLD` is honoured. The home
"구축 아파트 더 보기" link uses it. So there is a filter capability without a control.

## 3. Card anatomy

| Element | Field | Notes |
|---|---|---|
| image | `pcThumbnailImageUrl` (md-up) / `mobileThumbnailImageUrl` | JS `src` swap, no `srcset`/`<picture>`. No observed hover effect (§5) |
| title | `title` | |
| description | `description` | only if non-empty |
| caption | "평당 " + price-bucket label from `pricePerSize` | bucket, not a number |
| click | `router.push("/portfolio/<uuid>")` | lands on `/portfolio/<uuid>?FILTER=<first room>&TOGGLED_UUIDS=[]` (live). There is **no `<a>`** |

Fields fetched but not shown on the card: `serviceTypes`, `styleTypes`, `spaceSize`, `price`, address and all placement flags.
The shared `PortfolioItem` component has a hard-coded `"Hong Kong"` title special case ("*By Appointment Only"). It is used
by the store cards, not by portfolio data.

## 4. API / data

- `GET https://dev-api.apartmentary.com/api/v1/portfolios/action/get-by-paging?count=30&isListDisplay=true&keyword=&page=<n>&prices=&serviceTypes=&sortType=DISPLAY_ORDER&spaceSizes=&styleTypes=`
- Every filter param is always present (empty when unset).
- `isListDisplay=true` is hard-coded: the list shows only records flagged for list display.
- Response: `{data:{cursor, totalCount:659, page, sortType:null, data:[30 × full 45-key record]}, error:null}`.
- The response **`page` echoes 0 even for `page=1`** (the items differ; there is no overlap between page 0 and page 1). This is a
  source API quirk; the client ignores the field.
- Desktop and mobile page-0 bodies differ only in `lastModifiedDate` on 2 records, i.e. a live edit between the two viewport
  loads of the same 57-s capture run. The order is identical.
- ~9 KB per record, 268 KB per page. The list over-fetches the whole record, including `imageSets` and `content`.
- The full record census is in `10` §3.

## 5. Interactions (live summary; step log in `09` §2)

| Interaction | Result |
|---|---|
| hover card | no change on the hovered `<img>` (transform/opacity/filter/background identical before and after; `cursor:pointer`, `transition:all`). No hover effect was observed |
| page number | shallow URL `?page=N`, 1 API GET, grid replaced, scroll to top |
| filter chip | page reset to 0, URL param appended, 1 API GET |
| sort | `sortType=…`, 1 API GET |
| reset | URL back to `?page=0`, 1 API GET |
| 3D 집 구경 | hash dialog `#experience-3d`, no API |
| mobile 필터 | hash sheet `#portfoilo-filter` |
| mobile page "2" | `?page=1`, grid replaced (numbered pagination on mobile too; **not** infinite scroll) |
| card click | client transition to detail (`_next/data` fetch) |
| direct load `?keyword=반포` | API `keyword=반포` → **28** results, every one matching 반포 in apartment name/title/road address. Keyword search is server-side over those fields (INFERRED from the matches) |
| direct load `?services=OLD` | API `serviceTypes=OLD` → 553 results, all `serviceTypes:["OLD"]`. The filter works although no control exists |
| direct load `?page=1&sortType=POPULAR` | API `page=1&sortType=POPULAR` → 659 total; response `page` again echoes 0 |
| home "30평대 아파트 더 보기" → `?spaceSizes=40` | 289 results |

## 6. Template implications

- `projects` collection + a list view: 30 per page, 0-based or 1-based page param (a template decision; the source uses a
  0-based `page` with 1-based labels), a total count, and filters over closed vocabularies:
  - size bucket
  - style keywords
  - price bucket
  - optional service type
  - sort
- Queries are platform collection queries (boundary 4/6). Bucket definitions are **template/vertical settings**, not content.
- Placement flags on the source records (`isListDisplay`, `isBottomArea*`, …) map to collection queries or settings, never
  to content fields (boundary 3).
- For a **static per-site build** (boundary 10), filter combinations cannot all be pre-rendered. Options:
  - page-param routes pre-rendered, with client-side filtering over a static index
  - no filters in v1
  - decide in Slice 4. **Not an evidence gap.**
- Source defects not to copy:
  - 0 `<a>` links
  - desktop price bucket omission
  - hidden keyword
  - `page` echo
  - `#portfoilo-filter` typo
  - JS image swap without `srcset`
  - different subtitle copy per band (the template picks one slot)

## 7. Faithful reference (preservation clones) — QA

Method (`tmp/aco/clone-qa.mjs`, output `clone-qa/clone-qa.json`, `*-clone.png`, `*-diff.png`):
- Each clone is served statically with CSP `script-src 'none'` (no JS) and every non-localhost request is aborted.
- It is rendered with the same desktop (1440, DPR 1) and mobile (390, DPR 3) profiles as the capture.
- The result is compared with **the capture-time screenshot of the same run**: per 100-CSS-px band, a pixel counts as a
  mismatch when its max channel difference is > 40.

| Clone | Viewport | doc height clone / source | Δh | overall mismatch | bands > 5% | broken img | local 404 | external attempts | console errors | live scripts | overflow |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `2026-09-18T08-39-42-788Z` (portfolio-page0) | desktop | 9408 / 9408 | 0 | 0.00% | 0/95 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-39-42-788Z` (portfolio-page0) | mobile | 14251 / 14251 | 0 | 0.03% | 0/143 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-39-50-607Z` (portfolio-page1) | desktop | 9380 / 9380 | 0 | 0.00% | 0/94 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-39-50-607Z` (portfolio-page1) | mobile | 14207 / 14207 | 0 | 0.03% | 0/143 | 0 | 0 | 0 | 0 | 0 | 0 |

Build facts:
- `pnpm preserve:build`, all 4 clones: 0 failed resources and 0 resources still fetched from source hosts.
- Residuals: 2 analytics beacons neutralised per viewport (Facebook-pixel `<img>`, GTM noscript iframe) and 1 unresolved
  style reference per viewport, reported by the builder. That reference was not investigated further: QA shows no local
  404 and no visual effect.
- The only mismatch sits in the mobile bands at y = 700–900 CSS px (≤ 2.6% of the band). That is where the fixed bottom
  consult bar and floating widgets overlap the viewport edge in a full-page screenshot.

**Verdict:** the clones are **faithful static references** of the captured state: 0 mismatching pixels on desktop (> 40 channel-difference threshold), and ≤ 0.08%
mismatch on mobile. By design (Strategy A, preservation layer) they are **not interactive**. Filters, pagination, room tabs,
before/after and dialogs need JS, so their behaviour evidence is the live interaction log (`09` §2), not the clone. The
clones are authoring/fidelity references and are never a customer-build input (architecture §Position).
