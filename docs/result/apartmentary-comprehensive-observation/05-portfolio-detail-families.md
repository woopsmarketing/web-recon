# 05 — Portfolio detail families (Level C)

## Evidence

**Level C captures** (desktop 1440 + mobile 390, `--source-package`, JSON default-ON):

| Sample | Run | Prior crawl family | Variant data |
|---|---|---|---|
| `jqodqijldp` | `2026-09-18T08-36-39-411Z` | f000011 | 7 before-images, **customer review present**, `styleTypes` empty |
| `bjqdfjoidl` | `…08-37-04-015Z` | f000011 | 9 before-images, service `NEW`, 3 style keywords |
| `ibrdwqlfdq` | `…08-37-31-968Z` | f000012 | **0 before-images**, 2 keywords |
| `woqdjqrldj` | `…08-37-58-818Z` | f000012 | **0 before-images**, 4 keywords |
| `/portfolio/bjqdfjoidl/images` | `…08-38-20-043Z` | (sub-route) | — |

**Level A:** SSR fingerprints of all 29 crawl-known detail URLs (`level-a/ssr-fingerprints.json` → `portfolio`: image-set,
before-image and room counts, service/style/store values, null/empty fields, placement flags).

**Faithful references (preservation clones, frozen after build):**
- A = `data/apartmentary.com/preservation-clones/2026-09-18T08-39-58-786Z/` (from `jqodqijldp`)
- B = `…/2026-09-18T08-40-04-730Z/` (from `ibrdwqlfdq`)
- QA in §6.

**Other evidence:**
- Live interactions (`interactions.json`: `portfolio-detail-A-desktop`, `-A-cta`, `-B-desktop`, `-A-mobile`).
- Responsive probe (`09`).
- Code: `static-analysis/portfolio.md` §1, §5.

## 1. Family classification — verified

The earlier crawler's two portfolio-detail families, **f000011 (20 URLs)** and **f000012 (9 URLs)**, share the same skeleton
and landmark hashes. Re-checked against all 29 SSR records:

| Discriminator | f000011 | f000012 |
|---|---|---|
| before-images (`imageSets[].beforeImageUrl`) | **3–10 in every record** | **0 in every record** (9/9) |
| everything else (image-set count 18–57, rooms 4–9, services, keywords, null patterns) | overlapping ranges | overlapping ranges |

**Verdict: ONE page template, and the split is data-driven.**
- A record with before/after pairs renders the before/after toggle UI (extra DOM per pair). A record without them does not.
- The crawler's structural hash picked this up as two families.
- There is **no** second layout, route or component tree. Both families are served by the same page module (`9871`) and the
  same SSR prop shape (`portfolio`, `imageDetailUuid`).

**Other data-driven variants inside the one template** (code guards confirmed against live samples):

| Variant | Condition | Observed in |
|---|---|---|
| before/after toggle (desktop tile switch; mobile Swiper "before/after" pill) | image set has both `beforeImageUrl` and `afterImageUrl` | A (`jqodqijldp`), `bjqdfjoidl` (not B / `woqdjqrldj`) |
| "고객의 한마디" quote block | `customerName && customerReview` | **only `jqodqijldp`** (1 of 29 crawl records; 0 of 60 most recent list records) |
| description line | `description` non-empty | all samples |
| 시공 기간 / 시공 시기 rows | start/end dates / start month present | all 4 samples |
| 평당 견적 row | `pricePerSize` truthy | all 4 samples |
| 키워드 row | **always rendered**. It shows an **empty value** when `styleTypes = []` | A: empty row (source defect) |
| 주소 value | `displayAddress || roadAddress`. The cell always renders | `displayAddress` null (19) or "" (4) in 23/29, so `roadAddress` is shown |
| room tabs / dropdown | one per distinct `imageSets[].name` (4–9) with counts | all |
| "사진 더보기" | desktop-wide only, when non-switchable images exceed the cap (8/4/0 depending on pair count) | A, B |

## 2. Page anatomy (desktop ≥ 1281, top → bottom)

1. **Site header** (desktop).
2. **Title** (`title`) + **공유하기** (opens a share dialog; 2 MUI dialog roots appear, no URL change).
3. **Description** (`description`).
4. **Room tabs** "거실 (6) · 주방 (11) · …" (from `imageSets[].name`).
   - The active room is URL state: `?FILTER=<room name>`, via shallow `router.replace`.
5. **Photo grid** for the active room.
   - Before/after pairs are 2-col tiles with a before/after switch.
   - The toggled state is URL state: `?TOGGLED_UUIDS=["<imageSetUuid>",…]`. Every detail URL gains `?TOGGLED_UUIDS=%5B%5D` on load.
   - "사진 더보기 / 사진 닫기" expands the non-switchable tiles (no network).
6. **Two-column row:**
   - left: "상세 내용" + `content` (plain text), then "고객의 한마디" (conditional)
   - right: info grid — 아파트 · 주소 · 평형 (`spaceSize`+"평형") · 서비스 · 준공연도 · 시공 범위 · 시공 기간 · 시공 시기 · 키워드 · 평당 견적
   - "서비스" labels: `OLD` "5년 이상 구축", `NEW` "5년 이하 신축", `KITCHEN` "주방 전용"
   - 평당 견적 shows the **bucket label**, not the number
   - then CTA "해당 포트폴리오로 상담 받아보세요." + **간편 상담 신청하기** → `/inquiry` (live)
7. **Cross-sell 1**: "비슷한 평형대의 다른 아파트를 둘러보세요." + 더 보기 → `/portfolio?page=0&spaceSizes=<bucket>`.
   - Live: a 25평 record goes to `spaceSizes=30`, i.e. the 20평형대 bucket, whose key is its upper bound.
8. **Cross-sell 2**: "비슷한 견적의 포트폴리오가 더 있어요." + 더 보기 → `/portfolio?page=0&prices=<bucket>`.
   - Both are static banners. There is **no related-projects API**.
9. Shared bottom banner "기대와 설렘이 가득한 리모델링 경험 … 서비스 알아보기", then the footer.

**Below 1281 (tablet 900–1280 and mobile < 900):**
- A **page-level app bar replaces the site header**: back ‹, room dropdown "거실 (6) ⌄", share icon.
- Then **gallery first**: a Swiper with a before/after pill and a "1/6" counter.
- Then title, description, content, review, and the info grid (4 cols tablet / 2 cols mobile).
- The CTA is **duplicated 3× in code**, one per band; exactly one renders.
- Tapping a slide → `/portfolio/<uuid>/images[?filter=<room>]`.

**Head:**
- `<title>` = **`aptName`**, not `title`. They differ on 2 of 4 samples ("… 인테리어" vs "… 아파트").
- **No `meta description`.** `og:description` is the static "시공 자세히 보기". `og:image` = the thumbnail.
- Trackers fire a Kakao pixel `viewContent` with `{id: uuid, name: aptName}`.

**Network per view:**
- SSR only for content.
- `POST …/add-view-count/{uuid}`: 1 per plain load, 3 per observer capture (`10` §1).
- Live interactions trigger **no first-party fetch**:
  - room tab, before/after toggle, 사진 더보기 and share only update client state and URL, plus GA4 `collect` beacons (third party)
  - leaving the page (CTA, cross-sell, card) fetches `/_next/data/<buildId>/<route>.json`
  - details in `10` §5

## 3. `/portfolio/[uuid]/images` (sub-route)

- SSR with the same props as the detail page.
- On a **direct** load the client also calls `GET /api/v1/portfolios/{uuid}` (3× observed), because the store is empty.
- **Mobile:** a full-screen gallery (back, room dropdown, share, swipeable images). This is the intended use: a tap-through from
  the mobile/tablet Swiper.
- **Desktop direct load:** only the header + title render; the gallery area is **blank** (source defect, since the page is
  mobile-only by design).

Template handling: a lightbox or full-screen gallery for small screens. A separate route is optional; it is not required
for parity of the content model.

## 4. Data contract used by the detail page (OBSERVED, subset of the 45-key record; full census `10` §3)

Rendered:
- `title`, `description`, `content`
- `aptName`, `displayAddress | roadAddress`
- `spaceSize`, `serviceTypes[]`, `constructionEndYear`, `constructionPart`
- `constructionStartDate` / `constructionEndDate` / `constructionStartMonth`
- `styleTypes[]`, `pricePerSize`
- `customerName`, `customerReview`
- `imageSets[]`: `{uuid, name (room), beforeImageUrl?, afterImageUrl, …}`
- `pcThumbnailImageUrl` (OG), `uuid`

Not rendered on detail:
- `price` / `finalConstructionPrice`
- `storeType`, including values outside the current branch list (`MAPO`, `DALMAGI`, `NONE`)
- all placement flags / orders (`isListDisplay`, `isMainBannerDisplay`, `isBottomArea{1,2}Display`, `*DisplayOrder`, main-banner fields)
- `zipCode`, `addressDetail`

## 5. Template implications

- **One `portfolio-detail` view** with optional sections driven by data (before/after, review, keywords, duration). This matches
  architecture boundary 3/5: no per-record layout variants, and no family selection in content.
- Content model (`projects` in the interior vertical) needs:
  - rooms/image groups with optional before/after pairs
  - facts: size, service type, build year, scope, dates, price bucket or price, keywords
  - optional customer quote
  - The **customer name/review is personal data**: operator input only, never generated (invariant 5).
- Placement flags on source records (`isBottomArea1Display`, …) are **not** content. They map to template settings or
  collection queries (boundary 3/4/6).
- Price display as a bucket label is a presentation choice. The raw value exists.
- Room/filter and before/after state in the URL (`FILTER`, `TOGGLED_UUIDS`) is a source behaviour. It is not required by the
  template, and query-string state for toggles is not recommended (canonical/SEO noise).
- Source defects not to copy:
  - `<title>` = `aptName`
  - no meta description
  - empty 키워드 row
  - `/images` blank on desktop
  - `serviceTypes` label lookup that would throw on `PET`/`GARDEN` (code fragility, not observed live)
  - invalid uuid → 307 to `/` instead of 404

## 6. Faithful reference (preservation clones) — QA

Method (`tmp/aco/clone-qa.mjs`, output `clone-qa/clone-qa.json`, `*-clone.png`, `*-diff.png`):
- Each clone is served statically with CSP `script-src 'none'` (no JS) and every non-localhost request is aborted.
- It is rendered with the same desktop (1440, DPR 1) and mobile (390, DPR 3) profiles as the capture.
- The result is compared with **the capture-time screenshot of the same run**: per 100-CSS-px band, a pixel counts as a
  mismatch when its max channel difference is > 40.

| Clone | Viewport | doc height clone / source | Δh | overall mismatch | bands > 5% | broken img | local 404 | external attempts | console errors | live scripts | overflow |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `2026-09-18T08-39-58-786Z` (detail-A-jqodqijldp) | desktop | 5806 / 5806 | 0 | 0.00% | 0/59 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-39-58-786Z` (detail-A-jqodqijldp) | mobile | 5081 / 5081 | 0 | 0.08% | 0/51 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-40-04-730Z` (detail-B-ibrdwqlfdq) | desktop | 5460 / 5460 | 0 | 0.00% | 0/55 | 0 | 0 | 0 | 0 | 0 | 0 |
| `2026-09-18T08-40-04-730Z` (detail-B-ibrdwqlfdq) | mobile | 5059 / 5059 | 0 | 0.08% | 0/51 | 0 | 0 | 0 | 0 | 0 | 0 |

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

**Family coverage:**
- The f000011 representative (A, `jqodqijldp`: before/after + customer quote + empty keyword row) and the f000012 representative
  (B, `ibrdwqlfdq`: no before-images) each have a Level C clone.
- The second samples per family (`bjqdfjoidl`, `woqdjqrldj`) have Level C Source Packages. They were not cloned, because the
  family difference is data-driven and already represented by A/B.
