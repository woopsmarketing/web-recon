# interiorbay.co.kr scout report

- **URL scouted:** https://www.interiorbay.co.kr/
- **Category:** interior
- **Scouted at:** 2026-09-01T20:26:07.685Z (attempt 1, `ignoreHTTPSErrors: false`, 0 scout errors)
- **Record:** `/Users/woops/projects/web-recon/tmp/wr286/scout/interiorbay.co.kr.json`
- **Screenshots:** `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/interiorbay.co.kr-1440.png` (1620x5402, 3.33 MB) and `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/interiorbay.co.kr-390.png` (780x9542, 3.23 MB). Both present, both non-blank, both full-page.
- **Title:** 인테리어견적 인테리어베이 - 중개플랫폼 (`<html lang="ko">`)

---

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, no gate of any kind.

| Probe | Result |
|---|---|
| HTTPS probe | `200`, `text/html; charset=utf-8`, 114,461 bytes, no `Location` |
| HTTP probe | `302` → `https://interiorbay.co.kr:54306/kwa-home` (odd port in the redirect target, see Risks) |
| TLS verdict | `https` — no `ignoreHTTPSErrors` needed, no handshake error |
| Certificate | TLS 1.2, Sectigo Public Server Authentication CA DV R36, CN `interiorbay.co.kr`, valid 2026-05-19 → 2027-03-10 (`validTo` 1804463999) |
| Desktop nav | `200 OK`, redirect chain length 1 (`200 https://www.interiorbay.co.kr/`), final URL identical to requested, `networkIdle: true` |
| Mobile nav | `200 OK`, same single-hop chain, `networkIdle: true` |
| Challenge / anti-bot | `detected: false`, zero signals, `cdn: nginx`, `waf: null` — at both viewports |
| Popups / dialogs | 0 / 0 at both viewports |
| Server | `nginx`, `content-encoding: gzip`, `cache-control: pre-check=0, post-check=1, max-age=0` |

`robots.txt`: `200 text/plain`, 151 bytes, present, final URL `https://www.interiorbay.co.kr/robots.txt`. One `User-agent: *` group with 7 `Disallow` rules — `/_session/`, `/board/`, `/cooker/`, `/member/`, `/tools/`, `/user_dir/`, `/visit_log/`. No other agent groups, no root disallow, **homepage is allowed** (`homepageDisallowedForStar: false`). No `Sitemap:` directive. Note for route planning: `/board/` is disallowed, so any board-software listing under that prefix is off-limits; the `kwa-*` paths the site actually links to are not covered by any rule.

Failed requests are cosmetic, not access failures: desktop 2 (`/slick/pc/fonts/slick.woff`, `.ttf` → `net::ERR_ABORTED`), mobile 3 (the same two under `/slick/mobile/fonts/`, plus `http://wcs.naver.net/wcslog.js` blocked as mixed content). Status counts: desktop `200`x137, `204`x1, `404`x3; mobile `200`x149, `404`x5. Console errors 3 desktop / 6 mobile, page errors 0 desktop / 1 mobile.

**Verdict: fully accessible, no challenge, no auth wall, robots-clean.**

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

**Static server-rendered, no SPA.** One main-frame navigation (`https://www.interiorbay.co.kr/`), no client-side router, no history rewriting, `jsHref: 0` anchors. All 291 anchors are real hrefs; navigation is plain document loads to `/kwa-*` paths.

Detected stack: `jquery` (**jQuery 1.8.3** — a 2012-era build), `swiper` (Swiper global + `.swiper`), `slick`, `naver-analytics` (`wcs`). No React, no Next.js, no Vue, no bundler signature, `generator: null`, 0 custom elements, 0 shadow roots.

The CMS is a **Korean hosted site-builder, not a hand-authored codebase, and not gnuboard/Wix/imweb**. Evidence from the stylesheet hrefs:

- `/template/DESIGN_content/program/rcc-p.css`, `/template/DESIGN_content/program/theme/01/layout.css`, `.../theme/01/design.css`
- `/template/DESIGN_gnb/program/gnb.css`, `/template/DESIGN_gnb/program/theme/shop/style.css`
- `/template/DESIGN_button/program/images/button.css`
- `/template/PLUGIN_shop_core/program/css/shop.css`
- `/include/jquery/css/sitecook/jquery-ui.css` ← the `sitecook` path segment

The `template/DESIGN_*/program/` + `PLUGIN_*_core` + `sitecook` naming is the **Sitecook / "쿠커" builder** family — corroborated by `robots.txt` disallowing `/cooker/`, `/_session/`, `/user_dir/`, `/visit_log/`, which are that platform's runtime directories. On top of the builder template sits a hand-added site skin: `/works/css/main_css.css`, `/works/css/interior_sub_koramz.css`, `/works/css/php_css.css`, `/works/css/pc_main_header.css`, plus `/works/swiper/`. So the markup is machine-generated builder chrome wrapped around bespoke `/works/` overrides.

URL scheme is builder-generated too: `/kwa-home`, `/kwa-login`, `/kwa-agreement`, `/kwa-38940`, `/kwa-39007`, and a two-level detail family `/kwa-38941-515`, `/kwa-38941-606`, … (16 of the 40 sampled paths share the `/kwa-38941-` prefix). `/index.html` also appears.

**Critically: the mobile view is a separate server-rendered template, not a CSS-responsive variant.** Desktop HTML is 135,177 bytes / 2,672 DOM elements; mobile HTML is 115,944 bytes / 2,265 DOM elements. Desktop loads `/slick/pc/…`, mobile loads `/slick/mobile/…`. The server UA-sniffs and emits a different document. See Responsive complexity.

Third parties are minimal and analytics-only: `cr.acecounter.com`, `gtp4.acecounter.com`, `wcs.naver.net` / `wcs.naver.com` / `nam.veta.naver.com`, `ssl.pstatic.net`, `fonts.googleapis.com` / `fonts.gstatic.com`. 5 external link hosts (blog.naver.com, cafe.naver.com, post.naver.com, instagram.com, facebook.com), 1 each.

## DOM/CSS/runtime complexity (the actual numbers: DOM elements, stylesheets, scripts, images, iframes, canvases, shadow roots, script bytes)

| Metric | Desktop 1440 | Mobile 390 |
|---|---|---|
| DOM elements | **2,672** | **2,265** |
| HTML bytes | 135,177 | 115,944 |
| scrollHeight | 5,402 | 4,771 |
| Requests / failed | 141 / 2 | 155 / 3 |
| `contentLength` sum | **56,754,869 B (~54 MB)** | **67,522,943 B (~64 MB)** |
| Console errors / page errors | 3 / 0 | 6 / 1 |
| Mixed content | 0 | 1 (`http://wcs.naver.net/wcslog.js`) |
| Elapsed | 11,995 ms | 15,948 ms |

Desktop detail:

- **Stylesheets: 17** (16 `<link>` + 1 `<style>`). **`readable: 17`, `blocked: 0`, `fetched: 0`** — every sheet is CORS-readable, 2,924 rules read directly. `supports: 0`, `container: 0`.
- **Scripts: 15** (13 external + 2 inline). `scriptBytesSum: 227,379` across 10 measured resources; inline 11,495 bytes. Hosts: own host 10, `cr.acecounter.com` 1, `wcs.naver.net` 1, `ssl.pstatic.net` 1.
- **Images: 153 `<img>`** (45 without `alt`), **0 inline SVG**, 0 `<picture>`, **0 lazy**, 16 CSS-background elements over 9 unique background URLs. **All 153 images are same-host** (`www.interiorbay.co.kr`).
- **Resources: 137** — link 16, script 13, **img 83**, css 23, xhr 1, beacon 1. `bytesSum: 58,859,521` over 131 measured. This is the payload headline: **~57 MB of assets on a single homepage**.
- **iframes: 0. video: 0. audio: 0. embed: 0. canvas: 0. WebGL: false. shadowRoots: 0. customElements: 0.**
- Animation: 2,672 elements sampled → **0 animated elements**, 2 transition elements, 0 animation names, 0 `<marquee>`, 0 `will-change`; 4 `@keyframes` defined.
- Layout hints: **`tables: 155`**, **`gridContainers: 0`**, **`flexContainers: 1`**, `fixedElements: 0`, `forms: 2`, `inputs: 28`, `bodyWidth: 1440`, **`docWidth: 1620`, `horizontalOverflow: true`**, `html { min-width: 0px }`, **`body { min-width: 970px }`**.
- Text: 6,464 chars, **3,404 hangul** / 338 latin / 3 han / 0 kana, `primary: ko`. `h1: []` (zero `<h1>` on the page).
- Auth: 0 password inputs, 0 login forms, 2 login links, `redirectedToLogin: false`, no age gate → `login-ui-present` (a login link, not a wall).

Runtime is heavy in **DOM and bytes**, not in JS: 227 KB of script is trivial next to 57 MB of imagery, and there is literally zero animation, zero canvas, zero iframe, zero shadow DOM. This is a **big, dense, image-saturated legacy document**, not a complex application.

## Responsive complexity (media rule counts incl. CORS-readable vs blocked vs fetched, breakpoints observed, and the 390-vs-1440 behaviour you saw in the screenshots)

The CSS numbers are the surprise here:

```
sheets: 17   readable: 17   blocked: 0   fetched: 0   fetchFailed: 0
rulesReadable: 2924
mediaRules: 12   mediaReadable: 12   mediaFetched: 0
mediaMinMax: 0   uniqueMediaQueries: 1   breakpoints: []
```

**Zero CORS-blocked sheets** — the "CORS capture trap" flagged in 28.5C as the top responsive-fidelity leverage point simply does not apply here; everything is directly readable. But **`mediaMinMax: 0` and `breakpoints: []`**: across 2,924 rules there are 12 media rules resolving to **1 unique media query with no `min-width`/`max-width` component at all** (almost certainly `print` or `screen`). **This site has no responsive breakpoints.**

The mobile layout is therefore produced **server-side by UA sniffing**, and the evidence is unambiguous:

- Different HTML byte counts (135,177 vs 115,944) and different DOM counts (2,672 vs 2,265) for the same URL.
- Different asset trees: desktop requests `/slick/pc/slick.css` + `/slick/pc/fonts/slick.woff`; mobile requests `/slick/mobile/fonts/slick.woff`.
- Mobile carries `viewportMeta: width=device-width,initial-scale=1,maximum-scale=1.0,user-scalable=no` and reports `docWidth: 390`, `innerWidth: 390`, `horizontalOverflow: false` — a clean fit.
- Desktop carries **no viewport meta at all** (`viewport: null`) and `body { min-width: 970px }`.

**Screenshot behaviour — the 390 view is a REAL, genuinely reflowed mobile layout, not a shrunken desktop page.** It is not merely a narrower column; it is different markup:

- **Header:** desktop is a single 1440-wide bar — logo + 6 text nav items + 로그인/회원가입/나의견적조회 + a search pill + 무료견적신청 button + 1566-2523 pill. Mobile is a hamburger + logo + phone icon + magnifier icon, with the 6 nav items demoted to a **horizontally scrollable strip** on a second row.
- **Grids:** portfolio card grids are **3-up on desktop and 2-up on mobile**, and the mobile grids gain **carousel dot pagination (3 dots)** under each section that the desktop grid does not have.
- **Tables:** the 공사계약현황 table has **7 columns on desktop** (등록날짜 / 분류 / 제목 / 파트너스 / 계약날짜 / 공사금액 / 공사지역) and **3 columns on mobile** (분류 / 제목 / 공사지역). Columns are *dropped from the markup*, not hidden by CSS.
- **Process section:** desktop lays STEP 01–06 in a single horizontal row with chevrons; mobile lays them 3-over-3 with the second row running **right-to-left** (STEP 06 ← 05 ← 04) joined by a U-turn connector.
- **Mobile-only chrome:** a **sticky bottom action bar** (`견적 신청하기` / `전화 상담`) that has no desktop equivalent; desktop instead has a right-edge floating quick-menu (무료견적신청 / 1566-2523 / ▲TOP) that has no mobile equivalent.
- **Tab strips:** desktop shows all 9 gallery filter chips inline; mobile shows ~5 with a `›` overflow arrow indicating horizontal scroll.
- **Footer:** desktop is a 3-column band (고객센터 + 3 buttons | 공사사항 list | 자주 묻는 질문 list) over a dark legal bar; mobile stacks 고객센터 → 3 buttons → policy links → 5 social circles → business registration block, and **drops the 공사사항 / FAQ list columns entirely**.
- Desktop full-page height 5,402 px at 1620 px wide; mobile 9,542 device px (4,771 CSS px at dpr 2) at 780 device px wide.

For web-recon this is the single most architecturally interesting property of the candidate: the pipeline's responsive model (28.5C `hiddenRanges` midpoint bands + frozen px) assumes **one document that reflows across widths**. Here there is no reflow to model — there are **two documents**. Any width sampled between 390 and 1440 will return whichever template the server's UA/width heuristic picks, and interpolating band styles between them is meaningless. This must be scoped as two independent single-viewport reconstructions, or it will produce a structurally wrong intermediate.

Separately, **desktop has real horizontal overflow**: `bodyWidth 1440` but `docWidth 1620` (the screenshot is 1620 px wide with a ~180 px dead margin on the right of every section). Something — most plausibly a slick/swiper track with inline pixel widths — overhangs the viewport.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with the screenshot evidence)

**No video (0), no canvas (0), no WebGL, no iframe (0), no inline SVG (0), 0 animated elements, 2 transition elements.** Visually this is a photograph-driven brochure page. Its complexity is entirely (a) carousels and (b) Korean webfont text.

**Desktop, 12 sections top to bottom:** (1) white header bar; (2) **full-bleed hero photo slider** — an office/cafe interior shot behind the headline 「인테리어베이는 "이런 회사" 입니다.」 with three numbered value props 01/02/03, and beneath it an explicit **slide counter `01 02 03 04` with ← → arrows** (slide 02 active) sitting on an orange/blue split bar; (3) STEP 01–06 process row with grey line-art icons; (4) two side-by-side bordered panels, 실시간견적리스트 and 견적대기리스트, both **`<table>`-rendered** with per-row 견적진행/견적마감/견적대기 status buttons; (5) 인테리어베이 시공갤러리 — 9 rounded filter chips (카페/식당, 사무/오피스, 학원/교육, 매장/상업, 여성/미용, 체육/건강, 병원/의료, 아파트/주택, 기타) on a white card floating over a dark plant-photo band, then a 3-up photo card grid; (6)(7)(8) three more 3-up photo card grids — 매장/상업, 사무/오피스, 병원/의료 — each with a `더보기 →` link and each card carrying a bracketed Korean title plus a `분류 | 평수 | 업체명` meta line; (9) 인테리어 트렌드 on a dotted-pattern grey band — 7 style chips (모던/내츄럴/빈티지/로맨틱/클래식/북유럽/럭셔리/미니멀) above two large photo tiles (상업공간 / 주거공간, each with a script-face "Business"/"Living" overline and a 더보기 button) with 2 thumbnails under each; (10) 언론보도 press block beside a **혜택&이벤트 swiper banner with 4 pagination dots**; (11) 공사계약현황 — a 7-column `<table>`; (12) footer as described above, ending in a dark bar with 5 circular social icons and a full business-registration legal block.

**Carousel evidence is explicit and damaging.** Both slick and swiper are loaded (`/slick/pc/slick.css`, `/slick/pc/slick-theme.css`, `/works/swiper/swiper.min.css`) and both are in use. Three independent proofs from this capture:

1. **Different slide captured per viewport.** Desktop froze the hero on slide 02 (「이런 회사」 headline over an office shot). Mobile froze it on a *different* slide (「인테리어베이 100% 맞춤인테리어」 over a living-room shot, dot 4 of 4 active).
2. **Mobile froze mid-transition.** In the 390 screenshot the hero shows **three partial slides at once** — a bleeding left neighbour, the centre slide, and a right edge — i.e. the capture landed between animation frames. A reconstruction built from that observation would bake a half-scrolled track into the static output.
3. **slick clone nodes duplicate content into the text.** The recorded text sample contains the same five estimate rows **repeated three times verbatim** (`31952260901 83㎡ 고기집 리모델링 서울 동작구 견적마감 …` ×3). Those are slick's `slick-cloned` DOM nodes. They are a meaningful share of the 2,672 DOM elements and, unless the pipeline strips clone markers, they will appear as **visibly triplicated rows** in the reconstruction.

**Fonts.** 5 distinct computed stacks, but one dominates completely: `NotoSansKR, "Noto Sans JP"` on **2,602 of 2,672 elements**. Remainder: `Times` (47), `"Roboto Condensed", sans-serif` (13), `Arial` (6), `"Roboto Condensed", NotoSansKR, sans-serif` (4). 8 `@font-face` rules, 12 font resources — **10 self-hosted** (`/fonts/NotoSansKR/NotoSanskr.css`) and 2 from `fonts.googleapis.com` with 3 files pulled from `fonts.gstatic.com`. `documentFonts: 766` loaded font entries; families `slick`, `NotoSansKR`, `Noto Sans JP`, `Roboto Condensed`. Essentially **every glyph on the page is a self-hosted Korean webfont** — hangul metrics are 100 % webfont-dependent, and any fallback substitution will re-flow the whole page rather than a few headings.

The `slick` icon font 404s at both viewports (`slick.woff` and `slick.ttf`, `net::ERR_ABORTED`) — the carousel arrow glyphs are already broken on the live site, so the observed `← →` marks are whatever fallback the browser chose. That state must be reproduced as-is rather than "fixed".

Image-to-text ratio is extreme: 153 images / ~57 MB against 6,464 characters of text. Korean text density is high per-element but low in absolute volume — short bracketed titles and pipe-delimited meta lines, not prose.

## Estimated reconstruction difficulty (1 very easy ... 5 very hard, with explicit reasoning)

**Difficulty: 3 / 5 (moderate).**

Arguments for lower (what web-recon does well is nearly all present):

- Static server-rendered HTML over nginx. No SPA, no client routing, no history API, `jsHref: 0`.
- **`blocked: 0` stylesheets** — all 17 sheets and all 2,924 rules CORS-readable. No fetch fallback, no blind spots. This removes the single biggest known fidelity risk from the 28.5C work.
- **0 iframes, 0 canvas, no WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 audio, 0 `<picture>`, 0 inline SVG.** Every one of the repo's documented hard cases is absent.
- **0 animated elements**, 2 transition elements, 4 keyframes — nothing to freeze at the wrong moment except the carousels.
- All 153 images same-host, 0 lazy-loading — asset independence has a clean, complete, single-origin fetch list with no intersection-observer gymnastics.
- Only 227 KB of script, and it is jQuery 1.8.3 + two carousel plugins + analytics. Nothing rewrites layout beyond the carousel tracks.
- No auth wall, no challenge, no dialogs, no popups.

Arguments for higher:

- **slick + swiper on at least five surfaces simultaneously** (hero, 실시간견적리스트, three portfolio grids, the 혜택&이벤트 banner). Single-observation capture freezes each at one slide, and the mobile capture demonstrably froze **mid-transition**. Additionally the **slick clone nodes triplicate the estimate list into the captured text**, which is a *visible content defect*, not just a missing interaction.
- **155 `<table>` elements with 0 grid containers and 1 flex container.** Layout inference has only ever been exercised against Stripe/Linear, which are pure flex/grid; Task 26 already had to land 16 generic Stripe-bias fixes. Table-based layout is untested territory.
- **Server-side dual template** breaks the one-document-N-viewports assumption outright (see Responsive complexity). Not hard to *reconstruct* — each document is individually clean — but the current responsive model cannot represent it.
- **~57 MB of assets across 137 resources** on one page. Asset independence has been validated at 278 assets; the byte volume here is an order of magnitude beyond anything piloted, and desktop capture already took 12 s / mobile 16 s.
- Desktop **horizontal overflow** (`docWidth 1620` vs `bodyWidth 1440`, `body { min-width: 970px }`) plus a right-edge floating quick-menu — both easy to mis-place.
- **Non-deterministic content**: `last-modified` equals request time, `max-age=0`, and the 실시간견적리스트 / 견적대기리스트 / 공사계약현황 tables are live and regenerate per request. Screenshot-diff QA will be noisy across reruns unless those regions are masked.
- 2,672 DOM elements is the **largest of all 12 scouted candidates**.
- Zero `<h1>` and 45 images without `alt` — the SEO snapshot phase will have thin structured signal to work with.

Net: nothing here is *architecturally* beyond the pipeline, and the transport/CSS side is the cleanest of the twelve. The work is in volume (DOM, bytes, tables) and in two known-weak areas (frozen carousels, dual-template responsive). That is a solid 3, not a 4 — the failure modes are bounded, documented, and diagnosable rather than opaque.

## Potential unique test value (what this site would prove that linear.app and stripe.com did not)

Substantial, and largely non-overlapping with both prior pilots:

1. **Hangul text metrics under a self-hosted CJK webfont.** 2,602 of 2,672 elements render in self-hosted `NotoSansKR`; 3,404 hangul chars vs 338 latin. Task 22 measured fallback cost for Latin faces; a CJK face has a vastly larger glyph set, different line-box metrics, and a much more expensive fallback. This is the first real test of the font pipeline's `license-needs-review` + measured-fallback-cost machinery on non-Latin text.
2. **Table-based legacy layout.** 155 tables, **0 grid containers, 1 flex container**. linear.app and stripe.com are 100 % flex/grid. This is the cleanest available probe for residual Stripe/Linear bias in layout inference and slot binding.
3. **Korean hosted site-builder markup.** Sitecook-family `/template/DESIGN_*/program/` + `PLUGIN_shop_core` + `sitecook` chrome, machine-generated, wrapped in `/works/` overrides. Neither prior pilot exercised builder-emitted markup — class naming, wrapper depth, and inline-style habits are entirely different from hand-authored Next.js.
4. **Server-side UA-branched mobile template with literally zero breakpoints** (`mediaMinMax: 0`, `breakpoints: []`, different HTML per viewport, `/slick/pc/` vs `/slick/mobile/`). This is a **new class of responsive behaviour** for the 28.5C model, which assumes breakpoint-driven reflow of one document. Extremely high diagnostic value.
5. **Multi-carousel freeze plus clone-node duplication.** slick *and* swiper on the same page, with a captured mid-transition hero and demonstrably triplicated list content. Neither prior pilot produced a case where the carousel plugin visibly duplicates *text content* into the observation.
6. **jQuery 1.8.3 / 2012-era runtime.** Both prior pilots were modern React/Next builds. Ancient jQuery means inline `onclick`, `document.write`-era patterns, and non-idempotent DOM mutation the pipeline has never seen.
7. **Asset independence at ~57 MB / 153 same-host images / 0 lazy.** An order-of-magnitude scale test on a pipeline validated at 278 assets, with the useful simplification that every image is single-origin.
8. **Non-deterministic live content regions** (real-time estimate and contract tables regenerated per request, `max-age=0`). Directly exercises the "content-review kind" carry-forward from Task 26 and forces the QA layer to distinguish genuine reconstruction drift from source churn.
9. **`login-ui-present` without a wall** — 2 login links, 0 password inputs, `redirectedToLogin: false`. Tests the auth-boundary classifier's ability to proceed rather than bail.
10. **Pre-broken source state**: the `slick` icon webfont 404s on the live site. A useful honesty test — the reconstruction should reproduce the broken glyphs, not silently repair them.
11. **Korean SEO surface**: `lang="ko"`, hangul `<title>`/`description`/`keywords`, **zero `<h1>`**, and a `canonical` that points to **`http://`** while the page is served over `https://` (see Risks). Good stress input for the SEO snapshot/plan phases.

## Risks (technical risks AND any content flags recorded by the scout; state flags factually without moralising)

Technical:

- **Carousel freeze + clone duplication.** slick and swiper across ~5 surfaces; mobile hero captured mid-transition; five estimate rows appear **three times** in the captured text via slick clone nodes. Highest-probability visible defect. Mitigation: strip `slick-cloned`/`swiper-slide-duplicate` before templating, and accept a single-slide hero.
- **Two documents, one URL.** Desktop and mobile HTML differ (135,177 vs 115,944 bytes; 2,672 vs 2,265 elements; 7-column vs 3-column contract table). Any attempt to merge them into one responsive template is invalid. Must be scoped as two per-viewport reconstructions.
- **Desktop horizontal overflow**: `docWidth 1620` vs `bodyWidth 1440`, `body { min-width: 970px }`, `html { min-width: 0px }`, `fixedElements: 0` but a right-edge floating quick-menu. Easy to reproduce at the wrong offset. Recorded in the scout's own notes as *"desktop horizontal overflow at 1440"*.
- **~57 MB / 137 resources.** Capture already cost 12 s desktop, 16 s mobile. Asset-independence runtime, disk, and any per-asset processing scale accordingly.
- **Non-deterministic content.** `last-modified` == request time, `max-age=0`; 실시간견적리스트, 견적대기리스트 and 공사계약현황 change per request. Screenshot-diff QA will report false drift unless those regions are masked.
- **Known-broken upstream assets**: `/slick/{pc,mobile}/fonts/slick.woff` and `.ttf` → `net::ERR_ABORTED`; 3 `404`s desktop, 5 mobile.
- **Mixed content on mobile only**: `http://wcs.naver.net/wcslog.js` blocked, and 1 page error at 390. Desktop has 0 mixed content.
- **`canonical` protocol mismatch**: `<link rel=canonical href="http://www.interiorbay.co.kr/">` on a page served over HTTPS. Will propagate into the SEO snapshot unless corrected.
- **Odd HTTP→HTTPS redirect target**: the plain-HTTP probe returns `302 → https://interiorbay.co.kr:54306/kwa-home` — a non-standard port **and** a different path (apex host, no `www`, `/kwa-home` not `/`). Any crawl that follows the HTTP entry point lands somewhere other than the scouted page. Always enter on `https://www.interiorbay.co.kr/`.
- **No viewport meta on desktop**, `user-scalable=no` on mobile — the desktop document has no width declaration at all.
- **Zero `<h1>`**, 45 of 153 images without `alt` — thin heading/alt signal for SEO and for content-injection slot naming.
- **Ancient jQuery 1.8.3** with 2 inline scripts (11,495 bytes) — inline handlers and legacy DOM patterns likely.
- **`login-ui-present`** (2 login links, 0 password inputs, no redirect to login). No wall on the homepage, but `/kwa-login` and `/kwa-agreement` exist and `robots.txt` disallows `/member/`.

Content flags recorded by the scout:

- **`contentFlags: ["adult"]`**, sourced entirely from `bodyText`: the token **`오피` matched 14 times**. No title or meta matches (`titleMeta: {}`).
- Factual assessment from the screenshots and the captured text: the page repeatedly renders the category label **`사무/오피스`** ("office"), and `오피` is a substring of `오피스`. The 14 hits are consistent with that count across the nav, the 9 filter chips, and the office-portfolio card meta lines (`사무/오피스 | 80평대 | 마루모…`). Both full-page screenshots show a B2B interior-contracting quote marketplace — portfolio photography of cafes, offices, clinics and apartments, an estimate-request funnel, contract tables, press clippings, and a business-registration footer (인테리어베이 주식회사, 사업자등록번호 570-88-01753, 통신판매번호 제 2021-서울서초-2114호). No adult content is visible at either viewport.
- **This flag should be recorded as a substring artifact of the scout's tokenizer, not as a content property of the site.** It is worth fixing in the scout's matcher (require a word boundary or exclude `오피스`) before the flag is trusted on any other Korean candidate.
- No other flags: no gambling, piracy, webtoon, or link-aggregator matches — unlike 8 of the other 11 candidates in this batch.

## Suggested secondary route

**`https://www.interiorbay.co.kr/kwa-38941-515`**

Chosen from the scout's recorded `samplePaths`. Reasoning: `/kwa-38941-*` is by far the **dominant repeatable template** in the recorded link set — 16 of the 40 sampled paths carry that prefix (`-515`, `-606`, `-433`, `-327`, `-104`, `-524`, `-319`, `-1010`, `-1189`, `-166`, `-927`, `-940`, `-951`, `-316`, `-836`, …), i.e. a parent listing `38941` with per-record children. It is a **sub-page**, which exercises the `/works/css/interior_sub_koramz.css` sub-template that is loaded on the homepage but never actually used there, and it should surface a detail/record layout — breadcrumb, sub-header, long-form content — that the homepage does not contain. It is also outside every `robots.txt` disallow prefix.

Second choice if a detail record proves too thin: **`/kwa-38940`** (the plain single-segment family, `/kwa-38940`, `/kwa-39007`, `/kwa-39072`, … — 20 of the sampled paths), most likely the portfolio-item pages linked from the gallery cards, which would add a large-image detail template.

Explicitly **not** recommended: `/kwa-login` and `/kwa-agreement` (form and legal-text pages, low structural novelty, and `/member/` is robots-disallowed), and anything under `/board/`, `/cooker/`, `/member/`, `/tools/`, `/user_dir/`, `/visit_log/` (all robots-disallowed).

## Recommendation

**SELECT — DIFFICULTY 3 / 5 — PILOT_VALUE 5 / 5**

interiorbay.co.kr is the strongest of the two interior candidates and among the strongest of the twelve overall. It is unconditionally accessible: `200` at both viewports, single-hop redirect chain, valid Sectigo TLS 1.2 without `ignoreHTTPSErrors`, `challenge: none` with zero anti-bot signals, plain nginx with no WAF, and a `robots.txt` that explicitly allows the homepage. The transport and CSS surface is the cleanest in the batch — **all 17 stylesheets CORS-readable, 0 blocked, 0 needing fetch fallback** — which removes the one failure mode 28.5C identified as the top responsive-fidelity risk. It has none of web-recon's documented hard cases: no SPA or client routing, no iframes, no canvas or WebGL, no shadow DOM, no video, no inline SVG, and literally zero animated elements. What it *does* have is exactly the set of untested pressure points the pipeline most needs: 155 `<table>` elements against 0 grid containers (the cleanest possible probe for residual Stripe/Linear layout bias), 2,602 elements rendering in a self-hosted Korean webfont (the first real CJK metrics and fallback-cost test), Sitecook-family builder-generated markup, jQuery 1.8.3, ~57 MB of same-host imagery at an order of magnitude beyond any prior asset-independence run, live per-request content that will stress screenshot-diff QA, and — most valuable of all — a **server-side UA-branched mobile template with zero media-query breakpoints**, which is a genuinely new class of responsive behaviour that the current one-document-N-viewports model cannot represent and should be forced to confront. The real risks are bounded and diagnosable: slick/swiper freeze the hero at one slide (mobile visibly froze *mid-transition*) and slick clone nodes triplicate the estimate list into the captured text, so clone-stripping is a prerequisite; desktop overflows to `docWidth 1620`; and the reconstruction must be scoped as two independent per-viewport builds rather than one merged template. The `adult` content flag is a tokenizer artifact — 14 hits on `오피`, a substring of the office category label `사무/오피스` that the page renders throughout — and both screenshots show an ordinary B2B interior-contracting marketplace with a full corporate footer; the flag warrants a fix to the scout's matcher, not a rejection of the candidate.
