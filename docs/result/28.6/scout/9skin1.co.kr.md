# 9skin1.co.kr scout report

**Candidate:** https://www.9skin1.co.kr/ — 나인피부과 강남점ㅣ강남역점(신논현역)
**Category:** medical (dermatology clinic, Gangnam)
**Scouted:** 2026-09-01T20:25:47.729Z (attempt 1, no errors)
**Record:** `/Users/woops/projects/web-recon/tmp/wr286/scout/9skin1.co.kr.json`
**Shots:** `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/9skin1.co.kr-1440.png` (1440×12000, capped), `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/9skin1.co.kr-390.png` (780×18746 @dpr2 = 390×9373 CSS)

---

## Accessibility

Fully reachable, clean, no anti-bot friction.

| Probe | Result |
|---|---|
| HTTPS probe | `200`, `text/html;charset=UTF-8`, 62,393 bytes |
| HTTP probe | `301` → `https://www.9skin1.co.kr/` (clean canonical upgrade) |
| TLS verdict | `https`, TLS 1.3, Sectigo Public Server Authentication CA DV R36, subject `*.9skin1.co.kr`, valid to 1804204799 (≈ 2027-03) |
| `ignoreHTTPSErrors` needed | **no** — scouted with cert validation on |
| Redirect chain (desktop + mobile) | single hop: `200 https://www.9skin1.co.kr/` — no interstitial, no geo/lang redirect |
| Main-frame navigations | 1 (`https://www.9skin1.co.kr/`) — no client-side re-navigation |
| Challenge detection | `detected: false`, signals `[]`, waf `null` |
| Server / CDN | `nginx/1.18.0 (Ubuntu)` — origin-served, **no Cloudflare/Akamai in front** |
| Response headers | `x-frame-options: SAMEORIGIN`, `cache-control: no-store, no-cache, must-revalidate`, gzip |
| Network | desktop 108 requests / 108 responses, statuses `{200: 105, 206: 3}`, **0 console errors, 0 page errors, 0 popups, 0 dialogs, 0 mixed content** |
| Failed requests | 2, both the same hero `.mp4` (`net::ERR_ABORTED`) — see Visual complexity |

`robots.txt`: present, `200`, 110 bytes, one `*` group — `Allow: /` with `Disallow: /manager/*`, `/conf/*`, `/migration/*`, `/log/*`. Homepage **allowed**. No other agent groups, no `disallow: /` agents, **no sitemap declared**. Every route we would pilot (`/web/product`, `/web/review`, `/web/sub/*`) is outside the disallow set.

Auth: `login-ui-present` — 0 password inputs, 0 login forms on the homepage, 4 login/join links (`/web/member/loginForm`, `/web/member/joinForm`). No members-only gate, no age gate, no redirect-to-login. **The homepage content is fully public.**

Verdict: **green**. This is the cleanest accessibility profile of the 12 candidates — real HTTPS, no challenge, no WAF, no cert override, permissive robots.

## Architecture impression

**Static server-rendered, custom Korean-agency CMS. Not an SPA.**

- `generator` meta: `null`. No Next.js, no Nuxt, no React, no Vue, no Wix/Cafe24/imweb/gnuboard signature.
- Detected frameworks: **jQuery 2.1.4** and **Swiper** only. Everything else is a self-hosted jQuery plugin.
- Asset path shape is the tell: `/app/lib/{jquery-ui,xeicon,swiper,iziToast,timepicker,dropzone,redactor,multiPopup,air-datepicker}/`, `/app/public/css/style.css`, `/app/layout/web/css/{font,base,board,common,layout,layout2}.css`, all cache-busted with a single shared `?v=20250805`. Route shape is `/web/sub/<name>`, `/web/<section>`, `/web/member/<action>`. Uploads live at `/upload/files/files<epoch-ms>/<epoch-ms><n>.mp4`.
- `robots.txt` disallowing `/manager/*`, `/conf/*`, `/migration/*`, `/log/*` points at a bespoke server-side admin (`/manager`) with a config and migration tree — a built-to-order CMS, not off-the-shelf board software.
- `redactor` (WYSIWYG), `dropzone` (uploader) and `board.css` shipped on the homepage indicate a shared global bundle across public + admin/board templates — every page loads the same 18 stylesheets and 28 same-host scripts whether it needs them or not.
- Likely vendor: `webzine.smiletoc.co.kr` appears 4× in outbound links (Smile TOC, a Korean medical-marketing agency).
- Only 3 XHRs and no route-level JS navigation (`jsHref: 0`, 1 hash-only anchor) → **HTML arrives complete from the server**. `cache-control: no-store` means it is rendered per-request, not a static export.
- Internationalisation is by **subdomain, not by client routing**: `en.`, `cn.`, `jp.`, `th.`, `vn.`, `mn.9skin1.co.kr` (2 links each) plus a sibling brand `9skin2.co.kr`.

For web-recon this is the friendly end of the spectrum: server-rendered HTML, no hydration, no client router, no framework runtime to emulate.

## DOM/CSS/runtime complexity

| Metric | Desktop 1440 | Mobile 390 |
|---|---|---|
| DOM elements | **621** | 616 |
| `scrollHeight` | **18,981 px** | 9,373 px |
| HTML bytes | 68,025 | 65,772 |
| Requests / bytes | 108 / 22,798,476 | 101 / 13,776,062 |

| Runtime surface | Count |
|---|---|
| Stylesheets | **19** (18 `<link>` + 1 `<style>`) |
| CSS rules readable | **4,872** |
| CSS sheets blocked by CORS | **0** — all 19 readable, 0 needed fetching |
| Scripts | **34** (30 external, 4 inline) |
| Script bytes | **339,481** external (29 of 30 measured) + 8,172 inline |
| Script hosts | `www.9skin1.co.kr` ×28, `cdn.jsdelivr.net` ×1, `t1.daumcdn.net` ×1 (Kakao) |
| `<img>` | **75** (61 without alt, 25 lazy, 0 `<picture>`, 0 inline SVG) |
| CSS background images | 3 elements / 3 unique URLs |
| `<video>` | **1** | `<audio>` 0 |
| **`<iframe>`** | **0** | `<embed>` 0 |
| **`<canvas>`** | **0** | WebGL `false` |
| **Shadow roots** | **0** | custom elements 0 |
| Total resources | 96 (script 30, link 16, img 35, css 9, video 3, xhr 3), 11,045,271 bytes |
| `@keyframes` | 67 defined | animated elements at capture **0**, transition elements 2 |
| `@font-face` | **13** | 5 font files, all self-hosted on `www.9skin1.co.kr` |
| Layout primitives | 65 flex containers, **1** grid container, **0 tables**, 0 forms, 1 input, 5 fixed elements |
| Overflow | `horizontalOverflow: false` at both 1440 and 390; `bodyWidth == docWidth == 1440`; no `min-width` on html/body |
| Links | 120 anchors, 35 same-host unique URLs across 15 unique paths, 13 external hosts (YouTube ×20 dominant) |
| Text | **1,158 chars total** — hangul 639, latin 128, han 5. `lang="ko"`. |

Two numbers define this site: **621 DOM elements for an 18,981 px page**, and **1,158 characters of text**. Nearly the entire page body is a vertical stack of pre-rendered marketing JPEGs with the copy, prices and typography baked into the pixels. The DOM is trivially small; the *bytes* are large (11 MB of resources, 22.8 MB transferred desktop).

The 19 stylesheets / 4,872 rules are the real complexity, and they are almost entirely dead weight from the shared bundle (jquery-ui redmond theme, redactor, dropzone, timepicker, air-datepicker, iziToast, board.css) — the homepage exercises a fraction of them. Note `layout.css` and `layout2.css` are each linked **twice** (duplicate `<link>` entries), which is a cascade-order detail a reconstruction must preserve verbatim.

**Zero iframes, zero canvases, zero shadow roots, zero WebGL, zero console errors** — none of web-recon's known-hard runtime traps are present.

## Responsive complexity

- **40 media rules** across the 19 sheets, **39 of them min/max width**, **11 unique media queries**.
- **All 19 sheets are CORS-readable. 0 blocked, 0 fetched, 0 fetch failures.** This is the single most important line in the record: the 28.5C finding named the CORS capture trap as the top leverage point for responsive fidelity, and this candidate has **no CORS trap at all** — every media rule is directly observable from the CSSOM.
- Observed breakpoints: `max:400`, `max:425`, `max:760`, `max:767`, `max:768`, `max:1024`, `max:1350`, `max:1400`, `min:568`, `min:1200`.
- That breakpoint set is **messy in exactly the way 28.5C cares about**: three near-duplicate mobile edges (`760` / `767` / `768`), a `min:568` that overlaps the `max:760` band, and a `min:1200` colliding with `max:1350`/`max:1400`. The 1350–1400–1440 cluster means the desktop capture at 1440 sits just *above* two thresholds and will miss both. This is a genuine hiddenRanges/midpoint-band exercise, not a clean two-breakpoint site.
- `viewport` meta: `user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1, width=device-width` — zoom locked, standard Korean-clinic setting.
- No horizontal overflow at either width (`mobileOverflow: false`), no `min-width` floor on html/body.

**390 vs 1440 in the screenshots — this is a REAL mobile reflow, not a shrunk desktop.** Concrete evidence I can see:

1. **Header changes composition.** At 1440 the header is a full horizontal nav bar — logo + 8 Korean items (소개 / 시술소개 / 이벤트 / 시술후기 / 전후사진 / 상담·예약 / 지점안내) + `로그인 | 회원가입`, sitting under a black language strip (KOR ENGLISH 中文 日本語 ภาษาไทย TIếNG VIệT MONGOLIA) with a hamburger at the far right. At 390 the entire nav and the language strip are **gone**, replaced by logo + globe `지점안내` + hamburger only. Items were removed, not scaled.
2. **The quick-action bar moves.** At 1440 the five actions (카카오톡 상담 / 빠른예약 / 이달의 이벤트 / 유튜브 / 인스타그램) sit as a wide horizontal strip beneath the hero. At 390 the same five are a **fixed bottom bar** pinned to the viewport, with icons stacked over labels. Different positioning model, same content.
3. **The event image column re-fits.** At 1440 the giant marketing stack renders as a **~420 px centred column inside 1440**, with wide empty margins either side. At 390 the identical images run **edge to edge, full-bleed**. The column is width-capped on desktop and 100 %-width on mobile — a real CSS decision.
4. **Page height maths confirm it.** 18,981 px desktop vs 9,373 px mobile. A shrunk-to-fit desktop at 390 would be *taller* (≈3.7× taller), not **half the height**. Content is being reflowed and re-fitted, and the desktop 3-across bestseller grid becomes a swiped single card.
5. **The bestseller grid reflows.** At 1440 it is 3 cards across (리팟레이저 / The미희 콜라겐주사 / 울쎄라 프라임) with prev/next arrows. At 390 it is one card wide with neighbours cropped off-screen.

Both screenshots are present and fully rendered — neither is blank. **The 1440 shot is truncated**: `screenshotCapped: true`, captured at 12,000 px of an 18,981 px page, so the desktop footer, the 나인 미디어 carousel and the location/map block are **not visible in the desktop image**. They are visible in the 390 shot, which was captured whole (9,373 CSS px). Any desktop full-page screenshot diff in QA will be blind below 12,000 px.

## Visual complexity

**Layout type:** single centred column throughout, no sidebar, no table, no masonry. One `display:grid` container in the whole document; 65 flex containers do the rest.

**Hero:** a dark full-bleed section with a **`<video>`** background (clinic footage — a masked practitioner) and large hangul display text `좋은 결과와 정직한 가격 추구` over it, plus a pink `SCROLL DOWN` tab riveted to the right edge and a bouncing chevron. **The video did not load in either capture** — `https://www.9skin1.co.kr/upload/files/files1750647393655/175065545375010.mp4` failed twice with `net::ERR_ABORTED` on desktop and its mobile twin `...175065549945108.mp4` failed twice at 390 (the 3 × `206` partial responses are the aborted range requests). So both screenshots show the hero's **poster/first frame**, not motion. No autoplay animation was captured.

**Modal popup at capture — the most important visual finding.** The `multiPopup` library fires a layered event modal on load and **it is open in both screenshots**, covering the hero. Desktop: a ~400 px black-chrome dialog titled `이벤트` containing a hair-removal promo creative, a right-hand list of 10 other campaigns (`NAIN SALE`, `젠틀맥스+1년무제한제모`, `The미희주사`, …), a circled `✕`, a `제모센터 예약 및 문의하기 ▶` CTA and a `☐ 오늘은 더 보지 않기` checkbox. Mobile: the same modal, narrower, with the campaign list dropped. web-recon takes **one observation per viewport**, so a reconstruction will bake this dialog permanently open on top of the hero unless the pilot dismisses it (or sets the `오늘은 더 보지 않기` cookie) before observation.

**Sliders:** Swiper is confirmed both by the global and by `.swiper` in the DOM, and I can see at least two carousels: the **나인 베스트셀러** product rail (3-up desktop with ‹ › arrows, 1-up on mobile) and the **나인 미디어** YouTube-thumbnail rail — the 390 shot shows partial slides bleeding off both edges, the classic `centeredSlides` peek. Each will be frozen at slide 1 by a single observation; the off-screen slides exist in the DOM but their transform state does not.

**Section count (desktop, above the 12,000 px cap):** hero (video + copy) → quick-action strip → a thin decorative band → **나인 베스트셀러** (6 products, cards with rank badges 1–6, name, spec line, price) → **이달의 이벤트**, which is the bulk of the page: an uninterrupted vertical run of at least 10 full-width marketing images (나인에서 피부 리셋 9.1–9.30, clinic interiors + address bar, ECM 스킨부스터, NAIN EVENT price table, 보톡스는 필수, 스킨부스터, The 미희, 날렵한 V라인핏, 젠틀맥스 프로플러스, 포텐자, 여드름 흉터 솔루션, 프리미엄 리프팅/울쎄라, XERF, 색소레이저 …). Below the desktop cap but visible at 390: **GRAND OPEN 오시는길** (a hand-drawn map image with 신논현역 7번출구, 도보 1분) → **나인 미디어** carousel → dark footer.

**Footer:** dark charcoal, single stacked column, `개인정보취급방침 | 이용약관`, then business-registration lines (대표자 권혁만 / 사업자번호 565-10-01602 / 대표번호 02-599-9990 / 서울 서초구 강남대로 447), `Copyright © 2026 NAIN CLINIC`, then `NAIN CLINIC SNS` as a 2×2 pill grid (카카오 채널, 인스타그램, 유튜브, WhatsApp). Standard Korean statutory footer — no link farm, no sitemap column.

**Korean text density and image-vs-text ratio:** hangul dominates everything you *see*, but almost none of it is text you can *select*. 639 hangul characters in the DOM against 75 images totalling ~11 MB. Every price, every headline, every before/after label in the event stack is rasterised inside a JPEG. Visually the page is ≈95 % image; structurally it is ≈95 % `<img>` + wrapper. Real DOM hangul survives only in the nav, the section headings (나인 베스트셀러 / 이달의 이벤트 / 나인 미디어), the 6 bestseller card captions, the video titles and the footer.

**Fonts:** 13 `@font-face`, 5 self-hosted files, families `PretendardT/L/R/M/B/EB` (6 weights) + `OmniGothicR/M/B/EB` (4 weights) + `xeicon` (icon font) + `swiper-icons` + `Redactor`. Computed stacks show `PretendardR` on 88 elements, `PretendardM` 62, `PretendardB` 33, `PretendardEB` 14 — and **`Times` on 419 elements**, i.e. two-thirds of the DOM inherits an unstyled serif default. Reconstructing hangul line-breaking and metrics across a 6-weight Pretendard family, with a `Times` fallback populating most nodes, is a font test web-recon has never run.

**Animation:** 67 `@keyframes` declared, but at capture **0 elements animating** and only 2 with transitions. The motion budget is small and mostly idle (the scroll chevron, hovers). No marquee, no `will-change`.

## Estimated reconstruction difficulty

**3 / 5 — moderate.** Structurally easy, capture-state-hazardous.

Arguing **down** toward 2:
- Server-rendered HTML with no SPA router, no hydration, no framework runtime (`jsHref: 0`, 1 main-frame navigation, 3 XHRs).
- **0 iframes, 0 canvases, 0 shadow roots, 0 WebGL, 0 custom elements, 0 console errors, 0 page errors** — every runtime category web-recon is known to handle badly is absent.
- **0 CORS-blocked stylesheets.** All 4,872 rules and all 40 media rules are directly readable from the CSSOM; no fetch fallback, no blind spot. Compare `mystarskin.co.kr` (react + slick + a shadow root) or `xn--ok0b408a79cba430b.net` (wix + 29 sheets).
- Only 621 DOM elements — the smallest DOM-per-pixel ratio in the whole candidate set. The dominant node type is `<img>`, which the reconstruction pipeline handles losslessly.
- No tables, no forms (1 stray input), 1 grid container. Layout is flex + centred column.
- No horizontal overflow at either viewport; no `min-width` floor to fight.
- Genuinely reflowed mobile layout with observable rules — not a fixed-width desktop needing invented breakpoints.

Arguing **up** toward 4:
- **Three capture-state traps in one page.** (a) The `multiPopup` event modal is open in both shots and will be baked open over the hero. (b) Two Swiper rails freeze at slide 1, so the reconstruction shows one bestseller card and one video thumbnail where the source rotates. (c) The hero `<video>` **aborted in both captures**, so the observation holds a poster frame and the mp4 is a missing asset the asset-independence phase must chase into `/upload/files/files<epoch>/`.
- **Breakpoint mess.** Ten breakpoints with a `760/767/768` triple and a `1200/1350/1400` cluster straddling the 1440 capture width. This is precisely the midpoint-band problem 28.5C left open; expect the frozen-px strategy to need the hiddenRanges treatment here.
- **13 `@font-face` across two Korean families in 10 weights**, self-hosted, with a `Times` fallback on 419 elements. Font substitution changes hangul advance widths and will move every text block that is not baked into a JPEG.
- **5 fixed elements** including a mobile bottom bar, a right-edge scroll tab, and the modal — fixed positioning has historically been the fiddly part of the layout inference pass.
- **Asset weight**: 11 MB of page resources / 22.8 MB transferred desktop, 96 resources, 75 images with 61 missing alt. The mirroring step is heavier than Linear's, though smaller than Stripe's 278-asset run.
- **18,981 px desktop page exceeds the 12,000 px screenshot cap**, so screenshot-diff QA is structurally blind below the cap on desktop unless the QA path tiles or scrolls.
- 19 stylesheets with two duplicated `<link>`s whose cascade order must be preserved verbatim.

Not a 4, because none of the *hard* categories (SPA routing, canvas, shadow DOM, JS-driven layout, blocked CSS) are present, and the popup/carousel issues are one-time observation setup rather than architectural. Not a 2, because the fonts, breakpoint cluster, video and modal each independently produce visible diffs if handled naively.

## Potential unique test value

Things this site proves that **linear.app** and **stripe.com** did not:

1. **Korean webfont + hangul text metrics at scale.** Ten self-hosted Korean weights (Pretendard ×6, OmniGothic ×4) with `lang="ko"` and 639 hangul characters. Neither prior pilot exercised CJK line-breaking, hangul advance widths, or a multi-weight self-hosted Korean family. The `Times` fallback on 419 elements is a ready-made control for measuring fallback cost — the exact metric Task 22 recorded for Latin fonts.
2. **Image-baked text — the honest ceiling of content injection.** 1,158 DOM characters for an 18,981 px page. Task 19/19.1 shipped natural-language content injection against Stripe's 357 bindable values; here the pipeline will find almost nothing to bind, because the copy lives inside JPEGs. That is a *finding worth having on record*: it tells the operator what fraction of a Korean clinic site is injectable at all, and forces the `needs-input` accounting to be honest about rasterised copy. Linear and Stripe are both text-first Western SaaS; this is the opposite pole.
3. **Custom Korean-agency CMS markup.** `/app/lib/*` + `/app/layout/web/css/*` + `/web/sub/*` routing + `/manager`, `/conf`, `/migration` in robots — a bespoke PHP-era CMS shipping one global bundle (jquery-ui, redactor, dropzone, board.css) to every page, including code the page never uses. Neither prior pilot had dead-CSS ballast or `?v=20250805`-style global cache-busting.
4. **jQuery 2.1.4 + Swiper, no framework.** Both prior pilots were modern JS-framework sites. This exercises the reconstruction path for genuinely legacy, server-rendered, jQuery-plugin-driven pages — the majority of the real Korean SMB web.
5. **A `<video>` hero that fails to load.** The only candidate of the 12 with a `<video>` element, and its mp4 aborted in both captures. Good adversarial input for the asset-independence phase: a required media asset that the observer never successfully fetched.
6. **A modal-open-at-capture site.** `multiPopup` with a `오늘은 더 보지 않기` cookie. Nothing in the Linear or Stripe pilots forced the operator to decide "dismiss before observing, or reconstruct as observed" — this does, and the answer becomes a reusable pilot pre-step.
7. **A page that exceeds the screenshot cap.** 18,981 px desktop vs a 12,000 px cap. Forces the QA screenshot-diff path to confront truncation instead of pretending full-page coverage.
8. **Overlapping/ambiguous breakpoints.** `760/767/768` and `1200/1350/1400` are a much harsher responsive test than either prior pilot's tidy design-system breakpoints, and they land exactly on 28.5C's open question.
9. **Multi-language subdomain topology** (`en/cn/jp/th/vn/mn.9skin1.co.kr`) — an SEO/canonical shape neither prior pilot had.
10. **Clean-content real business.** Of the 12 candidates it is one of only four with **zero content flags** and the only one of those combining video + swiper + 40 media rules + full CSS readability.

## Risks

**Technical**

- **Modal baked open.** The `multiPopup` event dialog is present in both screenshots and will be captured as a permanent overlay covering the hero unless dismissed pre-observation. Highest-probability visual defect.
- **Carousels frozen at slide 1.** Two Swiper rails (bestseller, 나인 미디어). Single observation per viewport means rotation is lost and off-screen slides carry stale transforms. The 390 shot's peeking neighbours make the freeze visually obvious in any diff.
- **Hero video missing.** `175065545375010.mp4` (desktop) and `175065549945108.mp4` (mobile) both `net::ERR_ABORTED`, 2 failures each. The reconstruction inherits a poster-only hero; asset independence must re-fetch these deliberately.
- **Font substitution risk.** 13 `@font-face`, 10 Korean weights, `Times` computed on 419 elements. Any fallback shifts hangul metrics and moves every non-rasterised text block. Licensing: Pretendard is OFL, but OmniGothic is a commercial Korean foundry face — expect the same `license-needs-review` verdict Task 22 produced.
- **Breakpoint ambiguity.** 10 breakpoints including a `760/767/768` triple; the 1440 capture sits above both `max:1350` and `max:1400`, so two desktop bands are never observed at capture width.
- **Screenshot truncation.** Desktop capped at 12,000 of 18,981 px — QA diff cannot see the map, media carousel or footer on desktop. Mobile is complete.
- **Asset weight.** 96 resources / 11 MB on the page, 22.8 MB transferred desktop, 75 images. Larger mirroring job than Linear's.
- **Stale-content decay.** `cache-control: no-store`, an event window stamped `9.1 – 9.30`, and a `?v=20250805` bundle version. The whole 이달의 이벤트 stack is dated promotional inventory and will be replaced; re-runs weeks apart will not be comparable. Freeze the capture and record the run id.
- **Duplicate stylesheet links.** `layout.css` and `layout2.css` are each linked twice; cascade order must be reproduced exactly, and any dedupe optimisation is a behaviour change.
- **Accessibility metadata gap.** 61 of 75 images have no `alt`, and 0 inline SVG — the SEO/content phases will see a page whose meaning is unavailable to text extraction.

**Content flags (recorded factually)**

- The scout recorded **`contentFlags: []`** — no adult, gambling, piracy, link-aggregator or webhard classification. This is one of only four clean-flag candidates in the set of 12 (the other eight all carry at least one flag).
- Independently of the flag scan, the page carries content categories worth naming before any derivative build: **before/after clinical photographs of identifiable patients** (face and skin close-ups, including under-eye and nasolabial pairs, some with partial pixelation and some without), **advertised prices for medical procedures** (botulinum toxin, ultrasound/RF lifting, laser, injectable skin boosters), a **body-hair-removal promotional creative** featuring a stylised doll character, and **statutory Korean medical-business identifiers** in the footer (대표자, 사업자번호 565-10-01602, 대표번호). Korean medical advertising is a regulated category (의료법 §56). Any reconstruction that is published rather than kept as an internal pilot artefact should have the patient photography and the price claims replaced, and the business-registration identifiers scrubbed, before it leaves the lab.
- `auth: login-ui-present` with 4 login links and a `/web/member/joinForm`. No content is gated, but a reconstruction will surface non-functional membership entry points.

## Suggested secondary route

**`https://www.9skin1.co.kr/web/review`** (시술후기 — treatment reviews).

Rationale: the homepage is one long image column and proves almost nothing about the site's *markup*. `/web/review` is the page `board.css` exists for. A CMS board list gives web-recon everything the homepage withholds — a **repeating list/grid of records** with real, selectable hangul text, per-item metadata (author, date, view count, rating), thumbnails, a search/filter row, and **pagination controls** — all server-rendered from a template. That is a completely different structural family from the homepage, and it exercises the parts of Tasks 18/19 (slot binding, content injection, `needs-input` accounting) that the image stack starves. It is on the same host, inside the robots `Allow: /`, requires no login, and was recorded by the scout in `samplePaths`.

Runners-up and why they lose: `/web/product` (시술소개) is a strong second — a category grid, likely the site's densest real-text page — and is the pick if `/web/review` turns out to be image-only reviews. `/web/bna` (전후사진) is structurally similar to the homepage (image grid) and would add little. `/web/sub/location` and `/web/sub/doctor` are short static pages. `/web/reservation` is form-bearing but the homepage already showed only 1 input, and a booking form risks touching a live business system — avoid.

## Recommendation

**SELECT** — **DIFFICULTY 3 / 5**, **PILOT_VALUE 4 / 5**.

This is the strongest medical candidate and among the strongest overall. It is unconditionally reachable (real TLS 1.3, clean `301` http→https, no challenge, no WAF, no cert override, permissive robots, 0 console/page errors), it carries **zero content flags** in a candidate pool where eight of twelve are flagged adult/piracy/gambling/link-aggregator, and it is a real operating business rather than a link farm. Technically it sits in a sweet spot web-recon has not yet occupied: none of the known-hard traps are present (0 iframes, 0 canvases, 0 shadow roots, no WebGL, no SPA router, and — critically — **0 CORS-blocked stylesheets**, so all 4,872 rules and all 40 media rules are readable, which sidesteps the capture trap that 28.5C named as the top open leverage point), while the genuinely instructive difficulty comes from things neither Linear nor Stripe could teach us: ten self-hosted Korean font weights against a `Times` fallback on two-thirds of the DOM, a `760/767/768` + `1200/1350/1400` breakpoint tangle that lands squarely on the unresolved responsive work, a real 390 reflow (header items dropped, quick-bar re-pinned to the bottom, a 420 px centred column going full-bleed, and a page that gets *shorter* on mobile — 18,981 → 9,373 px — which no scaled-down desktop ever does), and a page whose copy is 95 % rasterised inside JPEGs, which will honestly stress-test the ceiling of content injection instead of flattering it. I withhold the fifth pilot point for exactly that last reason plus two frictions: with only 1,158 DOM characters the content-injection pillar gets a thin surface, and the 18,981 px desktop page exceeds the 12,000 px screenshot cap so desktop diff QA is blind below the fold. Both are acceptable — arguably both are findings rather than costs — but they cap the ceiling. **One mandatory pre-step before observation: dismiss the `multiPopup` event modal (click ✕ or set the `오늘은 더 보지 않기` cookie), or the pilot will bake a promo dialog permanently over the hero in both viewports.** Also expect to chase the hero `.mp4` by hand — it aborted in both captures.
