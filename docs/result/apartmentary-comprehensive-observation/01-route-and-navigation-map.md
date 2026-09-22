# 01 — Route inventory and navigation map

Evidence:
- `data/apartmentary.com/comprehensive-observation-2026-09-18/`
  - `bundles/_buildManifest.js` (route list)
  - `level-a/ssr-fingerprints.json` (84 sequential anonymous GETs)
  - `nav/nav-map.json` + `nav/shots/` (a live click on every visible nav control, desktop 1440 and mobile 390; `window.open`
    hooked and recorded, not executed; first-party non-GET aborted)
  - `static-analysis/app-shell-nav-api.md` (handler code)

The build is `yMHNQjHujDVTgIp539WqR`, the same as the frozen 09-16 capture.

## 1. Route inventory (build manifest, 33 entries)

| Route | HTTP (anon GET) | Data | Title | Family | Obs. level (this pass) | Template handling |
|---|---|---|---|---|---|---|
| `/` | 200 | gSSP (shell props only) + 4 client GETs | 아파트멘터리 | home | reuse + JSON refresh (`03`) | core page |
| `/portfolio` | 200 | gSSP shell + client GET list | 아파트멘터리 - 포트폴리오 | portfolio.list | **C** | core page (collection view) |
| `/portfolio/[uuid]` | 200; invalid id → **307 `/`** | gSSP `portfolio`, `imageDetailUuid` | = `portfolio.aptName` (≠ `title` when they differ, e.g. `ibrdwqlfdq`) | portfolio.detail | **C** | core page (collection item) |
| `/portfolio/[uuid]/images` | 200 | gSSP `portfolio`, `imageDetailUuid` | = `portfolio.aptName` | portfolio.images (mobile gallery) | B | optional sub-view (see `05` §5) |
| `/journal` | 200 | gSSP shell + client GETs | 아파트멘터리 - 읽을거리 | journal.list | B | core page (collection view) |
| `/journal/[uuid]` | 200; invalid id → **500** | gSSP `journal` + client GET + view-count POST | **always** 아파트멘터리 - 읽을거리 | journal.detail | B | core page (collection item) |
| `/service` | 200 | gSSP shell only; 0 content API | 아파트멘터리 - 서비스 소개 | static.service | B | authored page, slot-level copy |
| `/faq` | 200 | gSSP shell only; FAQ data is in the JS chunk | 아파트멘터리 - 자주 묻는 질문 | static.faq | B | authored page + FAQ collection |
| `/brand` | 200 | gSSP shell + client GET news | 아파트멘터리 소개 | static.about | B | about page (generic parts vs brand parts, `08`) |
| `/stores` | 200 | gSSP shell; branch list is in the JS | 아파트멘터리 - 직영점 안내 | static.locations | B | locations collection |
| `/terms` | 200 (all `termsType`) | gSSP shell + client GET terms | 아파트멘터리 (generic) | legal | B (structure only) | legal documents (operator input, never reused) |
| `/parts` | 200 | gSSP shell | 아파트멘터리 - 파츠 | sub-brand landing | A + code reading (**not** raised to B, `08` §4) | **not template-generic**: brand-specific sub-brand |
| `/arckit` | 200 | gSSP shell | 아파트멘터리 - 아킷 | sub-brand landing | A | **not template-generic** |
| `/pb-brand` | 200 | gSSP shell + client GET brands | 아파트멘터리 - 브랜드 | sub-brand index | A | **not template-generic** |
| `/inquiry` | 200 | gSSP shell | 아파트멘터리 - 상담신청 | lead form | A (page view + code only; **never filled/submitted**) | contact/lead surface = operator-configured destination |
| `/inquiry/complete` | 200 | **no gSSP**, reads `router.query` | 아파트멘터리 | lead confirmation | A (code only) | part of the lead surface |
| `/404` | 404 | — | 아파트멘터리 | error | A | platform default |
| `/_app`, `/_error` | — | — | — | framework | — | — |
| `/store`, `/GlobalStore`, `/{brand,faq,inquiry,journal,parts,pb-brand,portfolio,service,terms}/store`, `/journal/[uuid]/store`, `/portfolio/[uuid]/store`, `/portfolio/[uuid]/useStore` | **500** (`/_error`) | — | — | **pseudo-routes**: MobX store modules exposed as pages because they sit under `pages/` | A | ignore (source defect, never reproduce) |

Other Level-A facts:
- `?page=99` returns 200 with an empty grid. `?termsType=SERVICE` (an invalid value) returns 200.
- Every real page is `lang="kr"`, which is invalid BCP 47 (should be `ko`).
- No page has `<link rel=canonical>` or `<meta name=robots>`.
- SSR HTML has 0 `h1`/`h2`/`h3` on every page (all headings are styled `<p>`/`<div>`).
- Portfolio detail and `/images` have **no** `<meta name=description>`. `og:description` is the static "시공 자세히 보기"; `og:image` = the record thumbnail.
- Journal detail `<title>`/description are the static list values. Only `og:image` is per post.

These are recorded source defects, **not** template requirements (`11`).

**Zero `<a>` elements.** The home, portfolio-list and portfolio-detail runtime DOM and SSR HTML contain **0 `<a>`**.
Every navigation control is a `<button>`/`<div>` with a JS handler (`router.push`/`replace` or `window.open`).
- Consequence (source defect): no crawlable internal links, and no middle-click or open-in-new-tab.
- The template should use real links. Next.js `Link` gives a crawlable `<a href>` with the same client transition.
- Internal transitions fetch `/_next/data/<buildId>/<page>.json` (gSSP), observed on every internal nav click.

## 2. Navigation map

Mechanism key:
- `push`/`replace` = Next router (client transition).
- `open` = `window.open(url, "_blank", "noopener,noreferrer")` plus `opener=null`.
- `none` = no handler.

No control has an `href`.

Spec §6 fields that apply to every row below, so they are stated once rather than as columns:
- **Requires interaction:** yes. Every destination was obtained by clicking; there are no `href`s to read.
- **Safe to observe:** yes. Clicks produce GET navigations or a `window.open` that is recorded and not executed. First-party
  non-GET is aborted.
- **Redirect:** none observed on any nav destination. The only redirects on the site are the invalid-portfolio-id 307 → `/`
  (§1) and the detail pages' shallow query additions (`FILTER`, `TOGGLED_UUIDS`).

### 2a. Desktop (1440) — header, floating, footer

| Label | Region | Destination (observed after click) | Int/Ext | Tab | Mechanism | Party | Template handling |
|---|---|---|---|---|---|---|---|
| (logo wordmark) | header | `/` | int | same | push | 1st | site identity logo → home |
| 포트폴리오 | header GNB | `/portfolio?page=0` | int | same | push | 1st | core nav item |
| 서비스 소개 | header GNB | `/service` | int | same | push | 1st | core nav item |
| 읽을거리 | header GNB | `/journal` | int | same | push | 1st | core nav item |
| 상담 신청 (+ "EASY" badge) | header, right | **`/inquiry`** | **int** | same | push (+ `fbq Lead` event) | 1st | **primary CTA → operator-configured contact destination** |
| 상담 신청 | floating button (bottom-right) | `/inquiry` | int | same | push | 1st | same CTA, floating variant |
| (top button, icon) | floating, appears after scroll | scroll to top, no URL change | — | — | scroll handler | — | presentation widget |
| (Channel Talk launcher) | floating | third-party chat widget (not clicked: loads a 3rd-party iframe) | ext widget | — | Channel.io SDK | **3rd** | operator integration (optional), never copied |
| 회사 소개 | footer 정보 | `/brand` | int | same | push | 1st | about page |
| 아파트멘터리 브랜드 | footer 정보 | `/pb-brand` | int | same | push | 1st | brand-specific (sub-brands) |
| 파츠 PARTS | footer 정보 | `/parts` | int | same | push | 1st | brand-specific |
| 아킷 ARCKIT | footer 정보 | `/arckit` | int | same | push | 1st | brand-specific |
| 오피스멘터리 | footer 정보 | `https://officementary.com/` | **ext** | new (`_blank`, `noopener,noreferrer`) | open (URL **hard-coded**) | 1st-party sister brand, different domain | brand-specific external link → optional operator link |
| 채용 정보 | footer 정보 | `https://apartmentary.career.greetinghr.com/` | **ext** | new | open (URL from SSR `footerData.recruitUrl`) | 3rd (Greeting HR) | optional operator link |
| 가까운 직영점 | footer 안내 | `/stores` | int | same | push | 1st | locations page |
| 자주 묻는 질문 | footer 안내 | `/faq` | int | same | push | 1st | FAQ page |
| (Naver blog icon) | footer 안내 | `https://blog.naver.com/apartmentary` | ext | new | open (`footerData.naverBlogUrl`, rendered only if set) | 3rd | optional social link |
| (Instagram icon) | footer 안내 | `https://www.instagram.com/apartmentary/` | ext | new | open (`footerData.instagramUrl`, only if set) | 3rd | optional social link |
| SUPPORT@APARTMENTARY.COM | footer 고객센터 | **nothing** (styled as a link; no handler, not `mailto:`) | — | — | none | — | contact data (operator input); the template should use a real `mailto:` |
| 서비스 후기 작성 | footer 고객센터 | `https://izksocdghyl.typeform.com/to/PzelgTUu?typeform-source=qrcode-button` | ext | new | open (URL **hard-coded**) | 3rd (Typeform) | optional operator link; never reuse the form |
| 이용약관 | footer legal row | `/terms?termsType=SERVICE_USE` | int | same | push | 1st | legal page (operator input) |
| 개인정보처리방침 | footer legal row | `/terms?termsType=PERSONAL_INFO` | int | same | push | 1st | legal page (operator input) |
| (phone, business hours) | footer 고객센터 | plain text (phone is **not** `tel:`) | — | — | — | — | contact data (operator input) |

The desktop header has **exactly 4 GNB destinations plus the CTA**. `/faq`, `/stores`, `/brand`, `/terms` and the sub-brands are
reachable only from the footer on desktop. The line banner (`bannerData`) and promo popup (`popupData`) are SSR shell data. At
capture time the popup existed and was closed by the observer's normalization. The line banner's `url` target was not
exercised (the harness only clicks visible nav controls).

### 2b. Mobile (390, DPR 3, touch) — header, drawer, floating, footer

| Label | Region | Destination (observed) | Int/Ext | Tab | Mechanism | Template handling |
|---|---|---|---|---|---|---|
| (logo monogram) | header left | `/` | int | same | push | identity logo |
| (hamburger) | header right | opens drawer, URL → `/#gnb` | — | — | hash-modal primitive (the same one as `#popup`, `#store`) | drawer = nav container |
| 서비스 소개 | drawer group 1 | `/service` | int | same | replace | nav item |
| 포트폴리오 | drawer group 1 | `/portfolio?page=0` | int | same | replace (reload if already on `/portfolio`) | nav item |
| 읽을거리 | drawer group 1 | `/journal` | int | same | replace | nav item |
| 자주 묻는 질문 | drawer group 1 | `/faq` | int | same | replace | nav item (**in the mobile drawer, not the desktop header**) |
| 직영점 안내 | drawer group 1 | `/stores` | int | same | replace | nav item (**mobile drawer only**) |
| 회사 소개 | drawer group 2 | `/brand` | int | same | replace | nav item |
| 채용정보 | drawer group 2 | `https://apartmentary.career.greetinghr.com/ko/home` | ext | new | open (URL **hard-coded**, not `footerData.recruitUrl`) | optional operator link |
| 아파트멘터리 브랜드 | drawer group 2 | `/pb-brand` | int | same | replace | brand-specific |
| 상담 신청 | drawer bottom fixed CTA | `/inquiry` | int | same | push (+ `fbq Lead`) | primary CTA |
| (close ×) | drawer header | closes drawer | — | — | — | — |
| 상담 신청 | floating (bottom) | `/inquiry` | int | same | push | CTA |
| footer items | footer | **identical set and destinations to desktop** (the 14 footer items + 3 floating controls were re-clicked on mobile, with the same results) | | | | |

Mobile drawer = **8 items in 2 groups + fixed CTA** (screenshot `nav/shots/mobile-drawer.png`). 파츠, 아킷 and 오피스멘터리 are
footer-only on both viewports.

Harness note: in the drawer phase the inventory also listed home-page body and footer buttons behind the overlay. Clicks on
them either failed (`clicked:false`, covered) or reproduced the footer results. They are **not drawer items** and are excluded above.

### 2c. Other navigation-bearing controls (from page captures and interactions, see `09`)

| Control | Page | Destination | Mechanism |
|---|---|---|---|
| 서비스 알아보기 | home | `/service` | push |
| 30평대 아파트 더 보기 / 구축 아파트 더 보기 | home (area 1 / 2) | `/portfolio?page=0&spaceSizes=40` / `/portfolio?page=0&services=OLD` (both live clicks, follow-up `home-area-more-desktop`; result totals 289 and 553 vs 659 unfiltered) | push, **hard-coded** URLs and area titles. `spaceSizes` keys are **bucket upper bounds** (30평형대 = `40`). The area *contents* come from the curated `isBottomArea{1,2}Display` flags, so the "더 보기" filter result is a different set from the curated cards |
| portfolio card | list, home | `/portfolio/<uuid>` | push |
| 간편 상담 신청하기 / "해당 포트폴리오로 상담 받아보세요." | portfolio detail | `/inquiry` | push |
| 더 보기 (cross-sell ×2) | portfolio detail | `/portfolio?page=0&spaceSizes=<bucket>` / `&prices=<bucket>` | push |
| 포트폴리오 보기 / 상담 신청 | stores cards | **store-detail dialog** `/stores?storeName=<SLUG>&detail=OPEN` (live) / `/inquiry?storeName=<slug>` (code only) | shallow push / push |
| 더 알아보기 | stores (HK card) | `https://www.apartmentary.com.hk` (ext) | open |
| 1:1 문의 | faq | `pf.kakao.com` channel (ext, 3rd) | open |
| 상담 신청 | faq | `/inquiry` | push |
| 이전/다음 읽을거리, 목록 | journal detail | `/journal/<prevUuid/nextUuid>`, `router.back()` | push / back |
| terms tabs | terms | `?termsType=…` shallow replace | replace |
| sub-brand store links | parts, pb-brand | Naver Smart Store / Instagram (ext) | open, or (pb-brand mobile) `router.push(externalUrl)` |

## 3. Consultation destination (상담 신청) — resolved

**OBSERVED:** every 상담 신청 entry point navigates to the **internal route `/inquiry`**. It is not a modal and not an external form.
- Live clicks: header CTA, floating button (also on `/stores`), drawer CTA, detail-page CTA, FAQ.
- Code only: the per-branch card button on `/stores`.
- The earlier static reading "상담 신청 is a modal trigger" came from a legacy `estimationInquriyOpen` store field and is
  superseded by the live clicks.
- The `/stores` card button adds `?storeName=<slug>` to preselect a branch (code only).

`/inquiry` is a first-party multi-field lead form. The page was loaded live, desktop and mobile (follow-up `inquiry-view-*`,
observe only). Its behaviour below is from code; nothing was typed or submitted:
- Fields: name, phone, address via the Daum Postcode widget, budget select, branch select, construction timing select, and an all-terms checkbox.
- The submit posts **directly to a different backend host** (`apeach-api.apartmentary.com/inbounds`), **not** `dev-api`.
  It uses a client-embedded HTTP Basic credential. Credential handling in this pass's evidence:
  - fully redacted in the static-analysis notes
  - replaced by `<REDACTED-BY-OBSERVATION-PASS>` in this pass's copy of the inquiry page script (`bundles/pages__inquiry-*.js`)
  - never decoded or reused
  The credential is still present in the publicly served source bundle and in the earlier frozen captures, which this pass
  does not modify.
- On success it goes to `/inquiry/complete` with the submitted name, phone and address **in the URL query**.

Template handling: the CTA destination must be an **operator-configured contact destination** (internal form route, external
form URL, phone, or messenger). The source's form backend, credential, field list and legal copy are never reused
(invariants 5/6).

## 4. Header / footer logo mechanism (live census, `nav/nav-map.json` → `logos`, `decodedSvgs`)

| Surface | Element | Asset | Rendered size | Clickable | alt / aria |
|---|---|---|---|---|---|
| Desktop header | `<img src="data:image/svg+xml;base64,…">` inside a `<button>` | wordmark SVG `66fc55e6…`, viewBox `0 0 157 20`, 12 paths, fill `#13130A` (+ clip-path white) | 157×20 at (40,49) | yes → `/` | **none** |
| Mobile header | same pattern | "A" monogram SVG `94da4e2f…`, viewBox `0 0 25 25`, 5 paths, fill `black` | 25×25 at (15,20) | yes → `/` | none |
| Mobile drawer header | same monogram `94da4e2f…` (+ close icon `aef7dc1f…`) | — | 25×25 | yes | none |
| Footer (both viewports) | `<img>` data-URI SVG, not clickable | "A" monogram SVG `ac2e681b…`, viewBox `0 0 126 145`, 2 paths, fill `white` | desktop 126×145, mobile 43×49 | **no** | none |

- The logo is an **inline data-URI SVG image**, not a network asset, font glyph, CSS background or inline `<svg>`. It is compiled
  into the JS/SSR HTML.
- There are **three different logo assets**: desktop wordmark, mobile and drawer monogram, footer monogram in white. The mobile and
  footer monograms are different files.
- **No scroll-state logo swap.** The same sha appears at top, scrolled and bottom. On scroll only the fixed header container
  (`css-w16pwn`, 1440×118 desktop / 390×65 mobile) changes its background.
- The header switches wordmark → monogram at the mobile breakpoint (`09`).
- There is no text alternative on any logo: an accessibility source defect, not to be copied.

Template handling: `identity.logo` should allow a wordmark and a compact mark (plus an optional inverse/footer variant), with
real alt text from the identity. The source SVGs are brand assets and are never reused.
