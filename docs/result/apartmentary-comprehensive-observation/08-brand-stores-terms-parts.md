# 08 — Brand (About), Stores, Terms, Parts / sub-brands

Evidence:
- Captures (desktop 1440 + mobile 390, `--source-package`):
  - `/brand` `2026-09-18T08-34-05-117Z`
  - `/stores` `…08-34-44-010Z`
  - `/terms` `…08-35-32-494Z`
  - `/terms?termsType=PERSONAL_INFO` `…08-36-08-435Z`
- Level A: `level-a/ssr-fingerprints.json` (all pages, incl. `/parts`, `/arckit`, `/pb-brand`, `/inquiry`)
- Code: `static-analysis/journal-and-other-pages.md` §6–§13
- Live: `interactions/interactions.json` (terms, stores, brand scenarios; see `09`)

Where the static notes and the live DOM disagree, **the live DOM wins**; the corrections are listed in §6.

## 1. `/brand` — company About page (Level B)

**Render order (desktop runtime DOM):**

1. **Hero**: background video (`react-player`; `/brand-banner.mp4` desktop, `<video>` + `/brand-banner-mobile.mp4` mobile) + headline + sub-copy.
2. **Stats row**: 4 counters, each label + number + unit (누적 리모델링 의뢰금 / 누적 시공 수 / 누적 투자 금액 / 전체 팀원 수).
3. **Mission statement**.
4. **3 values**: title + body each.
5. **Timeline** "가치 있는 삶을 위한 시간": 2025 → 2015, one block per year with 1–6 milestone lines. **Hard-coded in the page chunk.**
6. **3 strategic pillars**: kicker + title + body (디지털 전환 / 라이프스타일 선도 / 브랜드 유니버스).
7. **"최근 뉴스"**: year tabs (2025…2021) + press cards (press name, `YYYY.MM`, headline, → external article).
8. Footer.

**Data:**
- One client GET `GET /api/v1/newses/action/get-displays` (29,726 B). `data` = **map year → array**, keys `2021…2025`, 12/12/9/14/13 items.
- Item fields: `id` (number), `idHash`, `pressName`, `publishDate` (`YYYY-MM-DD`), `title`, `url` (external press site), `displayOrder`, `isDisplay`, `isActive`, audit.
- Default tab = **last key** of the map (= 2025 with ascending keys). The year grouping is done **server-side**; the page does no date math.
- Everything else (stats, values, timeline, pillars) is static JSX.

Interactions (live, follow-up `brand-news-year`):
- Clicking "2023" swaps the press list to the 2023 items (e.g. `2023.12` cards replace `2025.xx`).
- **No URL change and no request**: all years arrived in the one news response. Hover reveals use
`@media (hover:hover)`. There is no pagination; each year is capped server-side (INFERRED from the ≤14 counts, not proven).

**Generic About content vs brand-specific presentation:**

| Part | Classification | Template handling |
|---|---|---|
| Hero (media + headline + sub-copy) | generic About pattern | section slot: media + copy (site input) |
| Stats counters | generic pattern, **facts** | typed `stats[]` (label, value, unit) as operator input. **Never generated** (invariant 5). Empty → hide section |
| Mission + values | generic | slots / small list |
| Timeline (year → milestones) | generic pattern, company facts | optional typed `milestones[]` (year, text), operator input. Hide if empty |
| Pillars (디지털 전환 / 라이프스타일 / 브랜드 유니버스) | **brand-specific narrative** | presentation copy. Only as optional slot copy, never defaulted to source text |
| Press/news list (year tabs) | generic pattern ("press mentions") | optional `press[]` collection (outlet, date, title, url). Grouping by year = view logic, not stored buckets (boundary 4) |
| Background video hero | brand presentation choice | theme/presentation option. The source media is never reused |
| Sub-brand mentions (파츠, 아킷, 오피스멘터리, 콜렉션…) inside the timeline | brand-specific | content, not structure |

## 2. `/stores` — locations (Level B)

**Map provider: NONE.**
- No Kakao/Naver/Google Maps SDK, map script, map iframe or coordinates anywhere.
- The only Kakao code is the share SDK (portfolio share dialog) and the Daum Postcode widget (`/inquiry`).
- `/stores` is a **static card list**. The template does not need a map for parity. A map would be an optional feature needing
  an operator key and coordinates, both absent in the source.

**Render (live DOM):**
1. Heading "가까운 아파트멘터리에서 상담 받으세요."
2. **17 domestic branch cards**, then a **"GLOBAL"** group with 1 card (Hong Kong).
3. **No footer** (`getLayout footer:false`, confirmed live).

Each domestic card has:
- image (pc/mobile variants, aspect 400/260 desktop, 335/198 mobile)
- branch name
- **"포트폴리오 보기"** button. On 해운대 it reads **"자세히 보기"** (label hard-coded by branch-name string match).
- **"상담 신청"** button
- **address** line(s)
- **hours** line: most "평일 10:00 - 19:00 / 토 10:00 - 18:00"; 도산 weekdays only; 판교 "매일 11:00-20:00"; 해운대 different Saturday hours.

The Hong Kong card has "더 알아보기" → `window.open("https://www.apartmentary.com.hk")`, a *By Appointment Only* note, an English address and daily
hours.

**Data source:** the branch list is **hard-coded JSX** in the shared store component (`Dz`/`TA`, module `7586`). The same
component renders the global `#store` modal on every page. There is no API call (the capture shows 0 first-party API calls).

**Handlers (code, confirmed on the 3 branches read):**

| Control | Action |
|---|---|
| 상담 신청 (card) | `fbq Lead`, then `router.push("/inquiry?storeName=<slug>")`. Slugs: `dosan`, `gongdeok`, … `haeundae`. **Code only**: the live follow-up click matched the page's floating 상담 신청 button (56×56, bottom-right), which goes to plain `/inquiry` |
| 포트폴리오 보기 / 자세히 보기 | `router.push(pathname + "?storeName=<slug>&detail=OPEN", {shallow})`, which opens the **store-detail dialog** (`storeInfo` lookup, module `7140`). Despite its label it does **not** navigate to a filtered portfolio list |

**Live (follow-up `stores-detail-dialog`, `stores-hk-link`):**
- 포트폴리오 보기 on the first card (도산):
  - URL → `/stores?storeName=DOSAN&detail=OPEN` (upper-case slug in the URL). A dialog mounts (0 → 2 dialog nodes).
  - **No first-party request**: the dialog content is static.
  - Dialog text: a "근처 아파트의 시공 사례 만나보세요." section with representative apartment names, a branch introduction
    ("… 본점을 소개합니다." + a paragraph), and a "<branch> 에서 상담받고 싶으신가요? · 간편 상담 신청하기" CTA.
- HK "더 알아보기" → `window.open("https://www.apartmentary.com.hk", "_blank", "noopener,noreferrer")` (recorded, not executed).
- The store-detail state is **deep-linkable** (query), like the terms tabs. For a template, a per-location detail is an
  optional sub-view of `locations[]` (intro text, representative projects, CTA), all operator input.

Template handling:
- `locations[]` is a typed collection: name, address, hours text, image, optional phone, region group such as "GLOBAL",
  optional external URL.
- The 상담 신청 per-location deep link becomes an optional `contactDestination` parameter.
- The hard-coded branch-name exceptions (해운대 label, Hong Kong note) are source quirks. Use data flags if needed.
- All branch data is operator input and never reused.

## 3. `/terms` — legal documents (Level B, structure only)

- **Tabs:** `SERVICE_USE` "이용약관" (default), `PERSONAL_INFO` "개인정보처리방침", `MARKETING` "마케팅 정보 활용/수신 동의".
  - Switching = `router.replace("/terms?termsType=<T>", {shallow, scroll:false})` plus a store update and refetch.
  - Deep links work (`?termsType=PERSONAL_INFO` SSR 200, correct tab).
  - The client enum has 5 members (`FOR_OTHERS_USE`, `SENSITIVE_INFO` too), but only 3 tabs are rendered.
- **Data:** `GET /api/v1/terms/action/get-displays?termsType=<T>` → `data` = one record `{uuid, audit…, termsType, html, design}`.
  - `html`: full XHTML email-style document (Unlayer export, 27,603 chars for SERVICE_USE).
  - `design`: Unlayer JSON string.
    - SERVICE_USE and PERSONAL_INFO: heading + divider + **one** text block, so almost all text sits in that one block. The
      "2" in Unlayer's `counters` is an ID counter, not a block count.
    - MARKETING: heading, dividers and 4 paragraph blocks.
  - Rendered via `dangerouslySetInnerHTML` (no iframe).
  - `PERSONAL_INFO` is requested **twice** with an identical body (sha `ab439a9c…`), a redundant fetch.
- **Page chrome:** banner "이용약관 및 개인정보처리방침" + one-line description + tab row + body.
- **SEO:** `<title>` is the generic "아파트멘터리" for every tab, with no per-tab title.
- Invalid `termsType=SERVICE` → 200 (no validation observed).
- **Live tab switching** (pass 1 `terms-desktop`, follow-up `terms-marketing`):

  | Tab | URL | Requests |
  |---|---|---|
  | 개인정보처리방침 | `?termsType=PERSONAL_INFO` | 1 `GET …?termsType=PERSONAL_INFO` |
  | 마케팅 정보 활용/수신 동의 | `?termsType=MARKETING` | 1 `GET …?termsType=MARKETING` |
  | back to 이용약관 | `?termsType=SERVICE_USE` | 1 `GET …?termsType=SERVICE_USE` |

  - Every switch is 1 GET with the whole body replaced, and there is no cache.
  - There is no version selector (the pass-1 "version-select" target does not exist).

Template handling:
- Legal documents are **operator input** (`legal[]`: type, title, body). The source text is **never** reused (task rule).
- Structure to keep: a tab or index per legal document plus a deep-linkable URL. A path per document (`/legal/privacy`) is
  better than a query for SEO, but that is a template decision.
- Body representation: the source uses editor HTML. The template's legal body only needs rich text; the Unlayer
  XHTML/`design` pair should not become the model.
- If a site has no marketing-consent document, the tab is absent (declared empty behaviour).

## 4. Sub-brand pages — `/parts`, `/arckit`, `/pb-brand` (Level A → B where informative)

| Route | What it is | Data | Outbound | Classification |
|---|---|---|---|---|
| `/parts` | PARTS, the company's own interior-materials brand: hero, tagline, 3 features (mobile Swiper), 6 category cards (FLOORING, TILE, WALLPAPER, FILM, LIGHTING, INNER GATE), Instagram CTA, B2B CTA | static | each category → **Naver Smart Store** category (`window.open`); Instagram; `mailto:b2b@…` (a real `<a href>`, unlike the site chrome) | **brand-specific sub-brand landing, not template-generic** |
| `/arckit` | ARCKIT, a premium kitchen sub-brand, limited to existing customers ("현재 아파트멘터리 고객 대상으로 한정 제공"): door-finish LINE UP (solid/wood/color wood/stone + swatches), countertop, hardware, handle & knob (mobile Swiper + tab indicator) | static | Instagram only | **brand-specific, not template-generic** |
| `/pb-brand` | "아파트멘터리가 만든 브랜드": index of private brands | `GET brandService.getDisplayBrandsUsingGET` → `brands[]` (name, description, pc/mobile image, logo pc/mobile, `instagramUrl`) | per-brand Instagram (desktop `window.open`, mobile **`router.push(externalUrl)`**, a defect); partner shop (stoly.kr) CTA | brand-specific; the *pattern* (a "brands/partners we carry" collection) could be a generic optional section later |

Reachability: all 3 are linked from the **footer "정보" column** (live nav, `01`). `/pb-brand` is also in the mobile drawer.
The static note "no cross-reference found" is superseded.

**Parts raised to Level B?** Only partially. The page's *template value* is low: product-category cards that link out to a
marketplace. For a future interior Template this maps at most to an optional "shop/partner links" section. It does not justify
a canonical model, so it stays at A plus the code reading above. No sub-brand page is a required Template page.

## 5. `/inquiry` (lead form) — page facts only (nothing typed, nothing submitted)

Summarised here for completeness (destination analysis and credential note in `01` §3):
- Two-column layout: hero copy/illustration + form "신청서 작성".
- Fields:
  - name *
  - phone * (auto-format, validation)
  - address * (read-only + "검색" → Daum Postcode)
  - max budget * (select: 12 buckets from "3000만원 미만" to "3억 초과")
  - preferred branch (17)
  - expected timing (month list)
  - one "agree all" checkbox that sets **both** privacy and marketing consent
- Breakpoints are ad-hoc `(min-width:767px)` / `(min-width:1280px)`, not the theme's.
- `footer:false`, `isInquiry:true` (CTA chrome hidden).

Template handling: the lead form is a **contact-destination option**, not a copied form. The consent wiring (one checkbox
setting both consents) is a source legal-UX defect. A template form must keep consents separate and use the site's own
legal texts.

## 6. Corrections to earlier static notes (live evidence wins)

| Static claim | Live evidence |
|---|---|
| Store cards show no address/hours | Cards show address and hours (runtime DOM, all 18 cards) |
| `/parts`, `/arckit`, `/pb-brand` likely unreachable from nav | Linked from the footer (and `/pb-brand` from the drawer) |
| 상담 신청 = modal | Navigates to `/inquiry` (every entry point) |
| `/service` structure "itinerary animation → 2 panels → carousel" | Live DOM: hero → intro → 3 pillars (2 with 자세히 보기) → 전체/주방 리모델링 cards → 5 A-* services (see `06`) |
