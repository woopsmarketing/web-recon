# 09 — Responsive behaviour and interactions

Evidence (`data/apartmentary.com/comprehensive-observation-2026-09-18/`):

**`responsive/responsive-probe.json` + `responsive/shots/`**
- 12 pages, each loaded once in a desktop context and resized **in place** through 23 widths:
  360 · 390 · 519 · 520 · 599 · 600 · 899 · 900 · 929 · 930 · 939 · 940 · 1199 · 1200 · 1279 · 1280 · 1281 · 1440 · 1535 · 1536 · 1919 · 1920 · 2560.
- Per width it records visible-element keys, header labels, hamburger count, repeated-group column counts, document height
  and horizontal overflow.
- Plus one fresh **mobile-context** load at 390 (touch, DPR 3, Android UA) for UA dependence.

**`interactions/interactions.json` (19 scenarios) + `interactions/interactions-followup.json`**
- Per step: URL delta, `window.open`, dialogs, text delta, first-party requests (+ JSON bodies), third-party hosts and a screenshot.
- Nothing is typed. First-party non-GET is aborted.

**Fresh-load width checks** (`interactions-followup.json`, `fresh-w900-*`, `fresh-w1280-*`)
- These separate real bands from in-place-resize artefacts.

## 1. Responsive structure

### 1a. Mechanism

- Responsiveness is **JS-driven** (`useMediaQuery(theme.breakpoints.up('md'))`, MUI default md = **900**). Different
  component trees mount per band; it is not CSS reflow of one tree.
  - Evidence: at the 899→900 transition, 57–354 visible elements disappear and 71–269 appear on every page.
- **No UA dependence.** A fresh mobile-context load at 390 matches the desktop-context resized to 390 on 11/11 pages (same
  visible count ±3, same header, same groups). The layout is width-driven, not UA-driven.
- Portfolio pages add a second JS flag, **"narrow" = md-up ∧ `max-width:1280px`**, which gives a third band (static code
  `portfolio.md` §4, confirmed live below).
- `/inquiry` uses its own ad-hoc 767 / 1280 queries (code only). The GNB has a 1920 spacing tweak (code only).

### 1b. Observed structural switch points per page

| Page | < 900 | 900 – 1280 | ≥ 1281 | Other switches |
|---|---|---|---|---|
| `/` | mobile header (65 px, monogram + hamburger) | **desktop header** (118 px, 4 GNB + CTA) | same | 520: +3 images (banner art swap); 930/939/1535/1919: one more slide visible (Swiper `slidesPerView:auto`, not a layout switch) |
| `/portfolio?page=0` | mobile header · **1-col** grid · "필터" sheet button | **mobile header kept** · **2-col** grid · "필터" sheet (not inline panel) | desktop header · **3-col** grid · inline 4-section filter panel + search field | switch at **1280→1281**, not 900, for header and filters |
| `/portfolio/[uuid]` (A and B) | **page app bar replaces the site header** (back ‹ · room dropdown "거실 (6)" · share) · gallery-first Swiper · info grid 2 cols | same app bar and gallery-first layout · info grid **4 cols** | site desktop header · title-first · room **tabs** + photo grid + "사진 더보기" · 공유하기 button | 899→900 = info-grid columns only. 1280→1281 = the whole page |
| `/journal` | mobile header · featured + 1-col list | desktop header · featured left + 2×2 grid right | same | — |
| `/journal/[uuid]` | mobile header · icon prev/next | desktop header · text prev/목록/next | same | body column 100% → 70% (code) |
| `/service` | mobile header | desktop header | same | **horizontal overflow** (see §1c) |
| `/faq` | mobile header · category pills (6, one row) · accordion | desktop header · pills and accordion groups unchanged (other content re-mounted: +82/−68 elements) | same | — |
| `/brand` | mobile header · 4-item group 1 col · timeline 11 years | desktop header · 4-item group → 2 cols · a 3-item group appears 3 across | same | **1199→1200**: another 3-item group 1 → 3 columns (MUI `lg`) |
| `/stores` | mobile header · 1-col card list | desktop header · **3-col** card grid | same | — |
| `/terms` | mobile header · tab row | desktop header · tab row | same | — |

**Checks around 900 and 930–940:**
- **Every** page switches at exactly 899→900. Nothing structural changes between 900 and 940.
- The only 929/930/939/940 deltas are one extra Swiper slide becoming visible on `/`.
- The portfolio pages' real second switch is at **1280→1281**.
- 1199→1200 matters only on `/brand`. 1535/1536 (MUI `xl`) and 1919/1920 show no structural change except a Swiper slide on `/`.

### 1c. Source defects seen in the probe

- **`/service` horizontal overflow**:
  - `scrollWidth` is 3 px wider than the viewport at every width < 900.
  - `scrollWidth` = **1354 px** at every width from 900 to 1281, so the page scrolls sideways by up to 454 px.
  - There is no overflow at ≥ 1440.
  - **Confirmed on a fresh load at 900** (§1d), so it is a real source defect, not a resize artefact. The exact element was
    not isolated.
- **Hero media at 900 after an in-place resize**: `/portfolio` and `/service` showed a collapsed or blank hero image.
  **Resolved as a resize artefact:** on a fresh load at 900 both heroes render (§1d). Same caution as the 28.x "frozen px" history.

### 1d. Fresh-load confirmation at 900 / 1280

Each page is loaded fresh in a new context at the target width (DPR 1, no touch), then measured
(`interactions-followup.json`, `fresh-*`, action `metrics`):

| Page @ width | scrollWidth | Hero / top media | Layout (screenshot) | Verdict |
|---|---|---|---|---|
| `/portfolio?page=0` @ 900 | 900 | hero 900×328, loaded | mobile header (monogram + hamburger), "3D 집 구경 · 필터 · 🔍", **2-col** cards (390 px) | band confirmed; in-place blank hero = **artefact** |
| `/portfolio?page=0` @ 1280 | 1280 | hero 1280×467, loaded | same chrome, **2-col** cards (580 px) | the 900–1280 band holds on a fresh load |
| `/portfolio/jqodqijldp` @ 900 | 900 | gallery Swiper 900×900 at y = 80 | **page app bar** (‹ · "거실 (6) ▾" · share) + gallery first + before/after pill | band confirmed. Off-screen Swiper slides are clipped (no page overflow) |
| `/portfolio/jqodqijldp` @ 1280 | 1280 | gallery 1280×1280 at y = 80 | same app bar and gallery-first layout | app bar holds up to 1280 on a fresh load |
| `/service` @ 900 | **1354** | hero 900×328, loaded | desktop header; content fine; page scrolls sideways | **overflow is real**. The first 5 overflowing nodes are a row of `MuiBox` items (160–271 px wide) ending at x ≈ 1028–1084. The node that reaches 1354 is not in the 5-node sample |
| `/` @ 900 | — | — | — | **not measured**: `page.goto` timed out waiting for `load` (45 s). It was not retried: no finding depends on it, because the home's 900 switch is established by the in-place probe and the pass-1 captures. INFERRED: the remote intro video is a plausible `load` delay (`source-preservation-intro-media-forensic/`) |

**Conclusion:**
- The in-place resize probe is reliable for **structure** (which tree mounts at which width).
- It is not reliable for **media sizing** right after a switch.
- Media-dependent findings must be confirmed with fresh loads, as done here.

### 1e. Template implications (responsive)

- The template needs **explicit bands**. The source's three portfolio bands are:
  - < 900: mobile.
  - 900–1280: "tablet". It uses the mobile chrome but multi-column content.
  - ≥ 1281: desktop.
- All other pages have two bands at 900.
- Whether the template copies the 1281 header switch for portfolio pages is a **design decision**. The evidence says the
  source did it deliberately (explicit `max-width:1280px` flag), not accidentally.
- Detail gallery below 1281: the page-level app bar (back / room select / share) is a distinct mobile component, not the site header.
- JS-switched trees cause hydration-time layout shifts in the source. A template using CSS media queries on one tree avoids
  that and keeps SSR output correct for every width. This is recommended; it is not a source requirement.

## 2. Interactions

**Two passes:**
- pass 1: `interactions.json`, 19 scenarios / 55 steps
- follow-up: `interactions-followup.json`, 23 scenarios / 40 steps. It retries pass-1 misses with better matchers, adds dialogs/pagers
  and deep links, and runs the fresh-load checks of §1d

**Rules for both passes:**
- Each scenario uses a fresh anonymous context.
- Nothing is typed into any form (the keyword case uses a URL param).
- First-party non-GET is aborted; `window.open` is recorded, not executed.

Details per page are in the family reports. This is the consolidated log.

| Page | Interaction | Observed result | Requests (first-party) | Report |
|---|---|---|---|---|
| `/portfolio` D | page "2" | `?page=1`, grid replaced, scroll to top | 1 API GET | `04` §5 |
| | 30평형대 / 우드가 포인트 / 인기 순 / 초기화 (3) | URL params added (page reset to 0) / cleared | 1 API GET each | `04` §1 |
| | 3D 집 구경 | `#experience-3d` dialog | none | `04` §2 |
| | hover card | no style change on the image | none | `04` §5 |
| | `?page=99` / `?spaceSizes=30&prices=250` direct | empty grid (200) / filters honoured | 1 API GET | `04` §1 |
| | `?keyword=반포` / `?services=OLD` / `?page=1&sortType=POPULAR` direct | 28 / 553 / 659 results | 1 API GET each | `04` §5 |
| `/portfolio` M | 필터 | `#portfoilo-filter` bottom sheet | none | `04` §2 |
| | page "2" | `?page=1`, grid replaced (numbered, not infinite) | 1 API GET | `04` §5 |
| `/portfolio/[uuid]` D | room tab 주방 | `&FILTER=주방` (shallow replace), grid swapped | none | `05` |
| | before/after | `TOGGLED_UUIDS=["<imageSet uuid>"]` | none | `05` |
| | 사진 더보기 | in-page expansion (doc height +677) | none | `05` |
| | 공유하기 | share dialog mounts | none | `05`, `12` G4 |
| | cross-sell 더 보기 | `/portfolio?page=0&spaceSizes=30` | `_next/data` + 1 API GET | `05` |
| | 간편 상담 신청하기 | `/inquiry` | `_next/data` | `01` §3 |
| `/portfolio/[uuid]` M | swipe gallery | next slide (before/after pill) | none | `05` |
| | tap image | `/portfolio/<uuid>/images?FILTER=거실` | `_next/data` | `05` §3 |
| `/portfolio/[uuid]/images` M | swipe | **not exercised** (swipe target not found in the follow-up); page loads with `?FILTER=<first room>` | — | `05` §3 |
| `/journal` D | card click | `/journal/<uuid>` | `_next/data` + detail GET (+ view-count POST, aborted) | `07` §5 |
| | prev/next round buttons | **not exercised** (the click hit the disabled "prev") | — | `07` §5 |
| `/journal` M | round "next" ×2 | 4 cards appended each time; URL unchanged | 1 API GET each (`page=1`, `page=2`) | `07` §5 |
| `/journal/[uuid]` D | 다음 / 이전 / 목록 | older post / newer post / `router.back()` | `_next/data` + detail GET each | `07` §5 |
| `/journal/[uuid]` M | right icon | `nextUuid` post | same | `07` §5 |
| `/service` D | 자세히 보기 (pillar 1) | `#transparent` dialog | none | `06` §3 |
| | 전체 / 주방 리모델링 cards | nothing (not links) | none | `06` §3 |
| `/faq` D/M | Q toggle | answer expands (collapsed by default) | none | `06` §3 |
| | category pills | list swaps, URL unchanged | none | `06` §3 |
| | 1:1 문의 | `window.open` KakaoTalk channel (http) | none | `06` §3 |
| | 상담 신청 | `/inquiry` | `_next/data` | `06` §3 |
| `/terms` D | tab 개인정보처리방침 / 마케팅 / 이용약관 | `?termsType=…` shallow replace | 1 API GET each | `08` §3 |
| `/stores` D | 포트폴리오 보기 (도산) | `?storeName=DOSAN&detail=OPEN` dialog | none | `08` §2 |
| | HK 더 알아보기 | `window.open` `www.apartmentary.com.hk` | none | `08` §2 |
| | floating 상담 신청 | `/inquiry` | `_next/data` | `01` §3 |
| `/brand` D | year "2023" | press list swaps, URL unchanged | none | `08` §1 |
| `/` D | 30평대 / 구축 아파트 더 보기 | `/portfolio?page=0&spaceSizes=40` / `&services=OLD` | `_next/data` + 1 API GET | `01` §2c |
| `/` M | floating CTA | pass-1 matcher missed it. The nav map covers it (`/inquiry`) | — | `01` §2b |
| `/inquiry` D/M | view only | page loads; nothing typed | none | `08` §5 |

**Not exercised live (recorded, non-blocking):**
- `/journal` desktop prev/next.
- The `/images` swipe.
- The `/stores` per-card 상담 신청 (its handler is read from code).
- Pass 1's journal "next-post" on `bjqdfkodlo`: the matcher hit a body paragraph, so the step is discarded.

**Third-party beacons fire on every interaction that changes the route:**
- GA4 `/g/collect`, Google Ads conversion, Kakao pixel `/bc`, `ccm/collect`, Naver `wcs`, Facebook.
- They were allowed; only first-party mutations were aborted.
- See `10` §5.
