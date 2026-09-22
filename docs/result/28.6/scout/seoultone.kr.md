# seoultone.kr scout report

- URL scouted: `http://www.seoultone.kr/`
- Category: medical (강남 피부과 / dermatology clinic, single-branch clinic site)
- Measurement record: `/Users/woops/projects/web-recon/tmp/wr286/scout/seoultone.kr.json` (scouted 2026-09-01T20:25:47Z)
- Screenshots: `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/seoultone.kr-1440.png` (1440x4892), `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/seoultone.kr-390.png` (780x11264 @dpr2 = 390x5632 CSS px). Both present, non-blank, full-page.

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

- **Reachable: yes.** HTTP 200 at both viewports, `networkIdle` reached, no errors array entries, first attempt (attempt 1, no `ignoreHTTPSErrors` needed).
- **Redirect chain: none.** `http://www.seoultone.kr/` → 200 directly; a single main-frame navigation, final URL identical to requested URL.
- **TLS: http-only.** The https probe fails at handshake: `SSL routines:ssl3_read_bytes:tlsv1 alert internal error` (alert 80), classed `tls-handshake-error`. Verdict recorded as `http-only (https probe: tls-handshake-error)`. The origin serves plaintext HTTP only; `openresty` is the server header. **This is the only http-only candidate in the 12-site scout set.**
- **Mixed content: 0** as measured (the page is http, so its https CDN subresources are not "mixed"); this inverts on rebake — see Risks.
- **Challenge / anti-bot: none detected.** `challenge.detected = false`, no signals, no WAF, CDN reported as `openresty`. No popups, no dialogs, no bot interstitial at either viewport.
- **robots.txt: present**, 200, `text/plain`, 22 bytes, literally `User-agent: *\nAllow: /`. Homepage allowed for `*`, zero disallow rules, zero other agent groups, no sitemap declared.
- **Auth dependency: none** (`passwordInputs 0`, `loginForms 0`, `loginLinks 0`, no age/adult gate, no login redirect).
- Network health: 120 requests desktop / 112 mobile, 3 failed in each — two aborted Font Awesome kit scripts (`kit.fontawesome.com/5ba8ad181e.js`, `.../fc25e5edf8.js`, `net::ERR_ABORTED`) and one Kakao log collector DNS failure (`stlog1-local.kakao.com`, `ERR_NAME_NOT_RESOLVED`). Status mix 113×200, 3×302, 2×403, 1×404. 4 console errors and 2 uncaught page errors were recorded (scout note: "2 uncaught page error(s)").

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software)

- **gnuboard 5 (g5), server-rendered PHP.** Detection evidence: `g5 globals / gnuboard`; theme path `/theme/basic/css/default.css?ver=03015-11` is the canonical gnuboard theme layout, and every content link is a flat `.php` file under `/page/` (`/page/intro01.php`, `/page/signature01.php`, `/page/lifting01.php`, …, 40 unique same-host paths). No `generator` meta.
- **Not an SPA.** 0 shadow roots, 0 custom elements, 0 iframes, no client router, one main-frame navigation, all content present in the 65 KB server HTML (desktop `htmlBytes` 65,352; mobile 62,237 — the server emits a slightly different document per UA, i.e. some server-side mobile branching on top of CSS media queries).
- Front-end stack: **jQuery 1.8.2** (very old, loaded from `ajax.googleapis.com`), **Swiper** (both unpkg and jsDelivr bundles are loaded — the same library twice), **AOS** (`assets/css/aos.css` is linked; scroll-reveal), Font Awesome (kit scripts aborted, plus a self-hosted `font-awesome.min.css`), and the **Kakao "roughmap"** static map widget (`t1.kakaocdn.net/kakaomapweb/roughmap/...`) plus Daum/Kakao tracking (`stat.tiara.daum.net`, `webid.ad.daum.net`) and one `linchdb.com` script.
- Hand-built theme on top of the CMS: `assets/css/common.css?ver=11`, `layout.css?ver=13`, `main.css?ver=15` — bespoke CSS with `?ver=` cache-busting query strings, not a page-builder (no Wix/Cafe24/imweb/Elementor signature).
- Layout primitives: **24 flex containers, 0 CSS grid containers, 0 tables, 0 forms, 0 inputs**, 4 fixed-position elements. Documented `min-width: 320px` on both `html` and `body`.

## DOM/CSS/runtime complexity (the actual numbers)

| Metric | Desktop 1440 | Mobile 390 |
|---|---|---|
| DOM elements | 592 | 585 |
| Scroll height | 4,892 px | 5,632 px |
| HTML bytes | 65,352 | 62,237 |
| Requests / failed | 120 / 3 | 112 / 3 |
| Transferred (content-length sum) | 18,855,058 B (~18.0 MB) | 19,004,335 B (~18.1 MB) |

- **Stylesheets: 13** (12 `<link>` + 1 `<style>`); 1,610 readable CSS rules across the 8 CORS-readable sheets.
- **Scripts: 33** total — 17 external, 16 inline; 18 script resources; known script bytes 139,328 across the 8 measurable ones; 11,864 bytes of inline JS. Script hosts: `www.seoultone.kr` (5), `t1.kakaocdn.net` (3), `kit.fontawesome.com` (2), `unpkg.com` (2), `ssl.daumcdn.net` (2), `ajax.googleapis.com` (1), `cdn.jsdelivr.net` (1), `www.linchdb.com` (1).
- **Images: 66 `<img>`** (17 without alt), plus **12 CSS-background elements / 9 unique background URLs**, 1 inline SVG, 0 `<picture>`, **0 lazy-loaded**. Image hosts: `www.seoultone.kr` 47, `mts.kakaocdn.net` 16 (map tiles), `t1.kakaocdn.net` 2, `t1.daumcdn.net` 1. Total resource count 106 (link 12, script 18, img 66, css 10) summing 18,592,951 bytes — **the page is ~18 MB of mostly un-optimised JPG/PNG**.
- **Iframes: 0. Video: 0. Audio: 0. Embed: 0. Canvas: 0. WebGL: false. Shadow roots: 0. Custom elements: 0.** (No hard-capture surface at all in this class.)
- Animation: 5 animated elements, 2 keyframe names in use (`bg_ani`, `blur_ani`), 6 keyframe blocks total, **48 elements with transitions**, 0 marquee, 0 `will-change`.
- Fonts: 6 distinct computed stacks; dominant stack is `"Pretendard Variable", Pretendard, -apple-system, …` on **523 elements**, then `AppleSDGothicNeo-Regular, dotum, sans-serif` on 58, `"Nanum Myeongjo", serif` on 5, `MalgunGothic` on 4. Document `@font-face` count **946** (2 in readable sheets + 944 in the two fetched Google Fonts sheets). Families in play: Pretendard Variable, Nanum Myeongjo, IBM Plex Sans KR, Montserrat, FontAwesome. Web font hosts: `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com` (7 gstatic requests).
- Text: 2,033 chars, **1,174 hangul** vs 207 latin, `lang="ko"`, primary language ko. Title and description are long Korean SEO strings with `·` separators; `keywords` duplicates the description; **no canonical, no og:site_name, no robots meta**.
- Links: 74 anchors, **40 unique same-host paths**, 7 external hosts (`map.kakao.com` 4, `pf.kakao.com` 4, `blog.naver.com` 3, `www.instagram.com` 3, `www.youtube.com` 3, `naver.me` 2, apex `seoultone.kr` 1), 2 mail/tel links, **0 `javascript:` hrefs**, 3 hash-only.

## Responsive complexity (media rule counts, breakpoints, 390-vs-1440 behaviour)

- **CSS sheets: 13 total — 8 CORS-readable, 5 blocked, 5 of 5 blocked sheets successfully re-fetched (0 fetch failures).** The blocked set is Google Fonts ×2, Swiper (unpkg) ×1, Swiper (jsDelivr) ×1, Kakao roughmapLander ×1.
- **Media rules: 12 readable (all min/max form) across 8 readable sheets, + 1 more recovered by fetching** (`roughmapLander.css`), for the summary total of 13. The two fetched Swiper bundles each carry 2 further min/max rules; the two fetched Google Fonts sheets carry 0 media and 668 + 276 `@font-face` rules (425 KB + 175 KB of font CSS).
- **7 unique breakpoints:** `max:500px`, `max:768px`, `max:1024px`, `max:1200px`, `max:1280px`, `max:1600px`, `min:1921px`. Zero `@supports`, zero container queries.
- Viewport meta: `width=device-width,initial-scale=1.0,minimum-scale=0,maximum-scale=10`. `horizontalOverflow: false` at both widths; `docWidth == innerWidth == 390` on mobile; `bodyWidth == docWidth == 1440` on desktop.
- **The 390 view is a REAL reflowed mobile layout, not a shrunk desktop.** Evidence from the two screenshots: (a) the desktop header is a centered logo above a full-width horizontal 7-item menu bar (병원소개 / 서울톤 시그니처 / … / 흉터·모공 / 탈모·제모 / 피부질환) while the mobile header is a left logo + right hamburger with no menu bar at all; (b) desktop two-column bands become single-column stacks on mobile — the gray social-ID panel and the interior photo sit side-by-side at 1440 but stack vertically at 390, and the Kakao map + 병원소식 pair likewise; (c) the mobile 병원소식 icons rewrap from a 1×4 row into a 2×2 grid; (d) the mobile footer CTA buttons (대표번호 / 네이버예약 / 카카오채널) become full-width stacked bars where desktop keeps them inline; (e) the document gets *taller* (5,632 vs 4,892 px), the opposite of a scaled-down fixed-width page. Font sizes are re-specified rather than optically scaled.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with screenshot evidence)

- **Hero:** a static full-bleed photograph of the clinic interior (beige treatment corridor) — not a slider, no video, no canvas. It occupies roughly the top 400 px below the header and is *covered* by a gnuboard **팝업레이어 modal**: a tall autumn-themed event poster (`가을이벤트`, 이벤트 기간 26.09.01.–26.10.31.) with a black `24시간 동안 다시 열람하지 않습니다 / 닫기` bar and a **4-tab strip beneath it (가을이벤트 / 자세히보기 / 압토스 / 리프팅센터)** — four popups grouped into one tabbed widget. Both the 1440 and 390 captures are dominated by this modal; at 390 the poster is full-viewport-width.
- **Floating widget:** a persistent right-edge card "서울톤 바로가기" with a cut-out photo of three doctors, present in both captures (part of the 4 fixed elements, alongside the sticky header).
- **Carousel:** a **Swiper certificate slider** — a horizontal row of framed diploma/certificate scans (졸업증서, Seoul National University PhD, 학위기, Yale School of Medicine certificate of training, a letter) with slides visibly clipped at both viewport edges, i.e. loop/peek mode captured mid-track. At 390 the same slider shows one-and-two-halves slides. Every certificate carries a diagonal `피부과김진용` watermark.
- **Scroll-reveal blanks:** both full-page screenshots contain large empty white bands where content should be — desktop y≈2,150–2,900 has a gray half-panel of social IDs on the left and a completely blank right half; the mobile capture has an ~700 px white band before the social icons and another before the map. This is the signature of AOS (`aos.css` is linked, 48 transition elements) leaving off-screen elements at opacity 0 in a full-page screenshot. **Some real content did not paint in the observation.**
- **Map:** a Kakao "roughmap" — a DOM widget of 16 raster map tiles from `mts.kakaocdn.net` plus zoom/refresh controls and a `서울 강남구 선릉로 48` pin label. Not an iframe, not a canvas — it reconstructs as a static picture of a map.
- **Typography:** heavy Korean webfont dependence — Pretendard Variable (a *variable* font served from jsDelivr) on 523 of 592 elements, Nanum Myeongjo serif for a few display lines, plus IBM Plex Sans KR and Montserrat from Google Fonts, and letter-spaced latin sub-headings (`S E O U L T O N E   D E R M A T O L O G Y`) whose tracking is visually load-bearing.
- Image-vs-text ratio: overwhelmingly image. 2,033 characters of text against 66 images / ~18 MB; whole sections (the doctor portrait band, the certificate slider, the interior shots, the social ID rows) are pictures with a few Korean headline lines over them. Section count on the homepage is roughly 8: header/nav, hero + popup, brand statement (서울톤피부과 / SEOULTONE DERMATOLOGY), certificate slider, doctor portrait band, social-ID + interior split, map + 병원소식 split, CTA band, dark footer.
- **Footer shape:** a dark slate band — a row of 7 round social/messenger icons, a 4-cell policy link strip (비급여항목 / 개인정보처리방침 / 환자권리와 의무 / 이용약관), the clinic wordmark, then business details (대표 김진용, Tel 02-576-5502·010-2873-5502, 주소 서울시 강남구 선릉로 48 2,3,4층, E-mail, 사업자번호 626-05-02862) and a `© 2024` line.

## Estimated reconstruction difficulty (1 very easy … 5 very hard)

**3 / 5 — moderate.**

Downward pressure (this is genuinely the easy kind of site for web-recon): server-rendered PHP with the whole document in a 65 KB HTML response; only 592 DOM elements (the second-smallest in the scout set); **0 iframes, 0 canvases, 0 WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 forms**; flex-only layout (24 flex containers, 0 grid, 0 tables) with no JS-driven measurement; a plain background-image hero; no client-side routing; only 1,610 CSS rules and 7 breakpoints; no auth wall, no challenge, robots fully permissive.

Upward pressure: (1) **two Swiper instances** — the certificate slider and the 4-tab popup group — and web-recon takes a single observation per viewport, so both freeze at one slide/tab; the certificate track is captured mid-loop with slides clipped at both edges, so a naive rebuild reproduces a lopsided partial row. (2) **AOS scroll-reveal leaves real content unpainted** — both captures show multi-hundred-pixel blank bands, so the observation is *missing* content rather than merely mis-styled; this is the single biggest fidelity risk here. (3) The **gnuboard popup layer** covers the hero in the capture, so content injection has to treat a modal overlay as first-class page furniture (and it carries a 24-hour cookie behaviour). (4) **4 fixed/sticky elements** including a floating right-edge widget. (5) **5 CORS-blocked stylesheets** (the 28.5C capture trap) — all 5 re-fetched cleanly here, so the trap is exercised but survivable. (6) **946 `@font-face` rules and a variable Korean webfont** — hangul metric matching is untested territory. (7) ~18 MB of images across 4 hosts to make independent. None of these is a class web-recon is known to fail outright; together they put it above the trivial static tier but well below the React/Next.js candidates in this batch (mystarskin.co.kr: react + slick + swiper + a shadow root + channel.io; interiorteacher.com: Next.js + 3 iframes + 93 media rules).

## Potential unique test value

Things linear.app and stripe.com never exercised, all present here:

- **http-only origin.** The only such candidate in the batch, and the https probe fails at the TLS layer, so it cannot be silently upgraded. This exercises: absolute `http://` asset URLs inside the theme CSS, the asset resolver's scheme handling, and — critically — the *rebake* direction, where a production preview served over https would turn today's clean `mixedContent: 0` into blocked subresources.
- **gnuboard (g5) CMS-generated markup** — Korean board-software conventions: `/page/*.php` flat routing, `/theme/basic/` paths, `?ver=NN` cache-busting query strings on every local CSS file, and the 팝업레이어 modal pattern. Neither pilot site had CMS-shaped markup. (yugiyu4.com is the only other gnuboard candidate and it carries five content flags.)
- **Korean webfonts and hangul text metrics** — 1,174 hangul characters, Pretendard **Variable** from jsDelivr on 523 elements, plus Nanum Myeongjo / IBM Plex Sans KR from Google Fonts and 946 `@font-face` rules. Hangul line-breaking, letter-spaced latin sub-headings and the metric cost of a fallback stack are all untested against a Korean face.
- **jQuery 1.8.2-era DOM code** (2012 vintage) rather than a modern bundler — different failure surface from a React/Next tree.
- **A third-party tiled map widget** (Kakao roughmap: 16 cross-origin raster tiles + its own CORS-blocked stylesheet + a DNS-failing log collector) rendered without an iframe.
- **Image-dominant marketing layout** — 66 images / ~18 MB against 2 KB of text, the inverse of the text-dense SaaS pages already piloted; a real stress test for asset independence and for content injection when there is barely any text to inject.
- **A CSS-only responsive site with a genuine mobile branch** (7 breakpoints, hamburger, server HTML that differs per UA) instead of a component-library breakpoint system.
- **A modal-over-hero first paint** and **scroll-reveal content that is invisible at capture time** — both are honest, reproducible probes of the single-observation limitation.
- Small enough (592 DOM, 40 routes) that a full pilot is cheap relative to what it proves.

## Risks

Technical:

- **AOS scroll-reveal blanks.** Large regions of both captures are white where content belongs. If the pipeline observes the same way, the reconstruction will be missing content, and QA screenshot diff may score it *green* because source and clone are both blank. Needs an explicit pre-capture reveal (scroll-through or forcing `aos-animate`), or the pilot must be scored knowing the source capture itself is incomplete.
- **Two Swiper carousels frozen at one frame**, one of them (certificates) captured mid-loop with edge-clipped slides — expect a visually lopsided static row.
- **The gnuboard popup layer dominates the first viewport** and has cookie-gated dismissal; the clone will bake the modal open unless it is handled deliberately. Its 4-tab group is itself a Swiper.
- **5 CORS-blocked stylesheets** (Google Fonts ×2, Swiper ×2, Kakao roughmap ×1). All re-fetched at 200 in this scout, but two of them are 175 KB / 425 KB of pure `@font-face` and one is served over **plain http** (`t1.kakaocdn.net/...roughmapLander.css`) — an http subresource that becomes mixed content the moment the rebake is served over https.
- **~18 MB of assets across 4 hosts** (`www.seoultone.kr`, `mts.kakaocdn.net`, `t1.kakaocdn.net`, `t1.daumcdn.net`) with 0 lazy loading — asset independence will be slow and the Kakao tiles are third-party imagery whose reuse in a derived site is not obviously licensed.
- **Font licensing:** Pretendard and the Google Fonts families are OFL, but the pipeline's existing "license-needs-review" posture (task 22) applies, and the variable-font axis adds a fallback-metric cost that has never been measured on hangul.
- **Runtime noise:** 2 uncaught page errors, 4 console errors, 2×403 and 1×404 responses, both Font Awesome kit scripts aborted (icon glyphs may be absent from the observation), and a DNS-failing Kakao log endpoint. jQuery 1.8.2 is old enough that some of this may be genuine breakage on the live site rather than capture artefacts.
- **Server-side UA branching** (65,352 vs 62,237 HTML bytes) means the desktop and mobile observations are of two slightly different documents, not one document at two widths — a template built from one may not cover the other.
- **No canonical URL, no sitemap**, and `www.` vs apex both appear in links — the SEO phase has to pick a canonical host itself.

Content flags (stated factually, as recorded): **the scout recorded zero content flags** (`contentFlags: []`, empty title/meta and body-text matches) — one of only four flag-free candidates in the batch. Separately, and not flagged by the scout: this is a real operating medical clinic, and the homepage carries a named physician (김진용 / "Jin Yong Kim"), photographed diplomas and certificates bearing that name and issuing institutions, real staff photographs, a business registration number (626-05-02862), two phone numbers, a street address and an e-mail address. Korean medical-advertising rules apply to clinic marketing copy. Any pilot output must replace all of it — this is exactly the "real people / real credentials" carry-forward from task 26, and here it is the majority of the page's visual content.

## Suggested secondary route

**`http://www.seoultone.kr/page/intro04.php`** — inferred from the nav ordering (병원소개 / 의료진소개 / 장비소개 / 진료시간·오시는길 mapping onto intro01–intro04) to be the hours-and-directions page. It adds the structure the homepage lacks: a sub-page template (shared header/footer + inner page chrome, which the homepage-only capture never exposes), a clinic-hours block that on gnuboard clinic themes is typically the site's only `<table>` (the homepage has `tables: 0`), and a second, larger instance of the Kakao map widget. It is on the same host, plain http, and reachable from the recorded `samplePaths`.

Alternative if a long image-stack page is preferred over table structure: `http://www.seoultone.kr/page/signature01.php`, a treatment detail page — near-pure vertical image stacking, useful for asset independence but structurally weaker than intro04.

## Recommendation

**SELECT — DIFFICULTY 3 — PILOT_VALUE 5.**

seoultone.kr is reachable with no redirect, no challenge, no WAF, no auth wall and a fully permissive robots.txt, and it is the only http-only origin in the 12-site set — a scheme edge case the pipeline has never piloted and one that will surface real work in the asset resolver and the https rebake path. Structurally it is the kind of site web-recon handles well (server-rendered gnuboard PHP, 592 DOM elements, flex-only layout, zero iframes/canvases/shadow roots/video/SPA routing, 1,610 CSS rules, 7 breakpoints, a genuinely reflowed 390 layout), so a pilot should reach a high-fidelity result rather than stalling — while still contributing four things the linear.app and stripe.com pilots could not: Korean hangul text with a variable Korean webfont and 946 `@font-face` rules, CMS-generated markup with `?ver=` asset URLs and a 팝업레이어 modal, an 18 MB image-dominant layout with almost no text to inject, and a third-party tiled map widget. The two real hazards are honest and worth measuring rather than avoiding: AOS scroll-reveal leaves visible bands of content unpainted in the single-observation capture, and the two Swiper carousels freeze at one frame. The content is flag-free, but the page is almost entirely real physician credentials, certificates, photographs and business-registration details, so the pilot must be run as a fresh-site build with every identity surface replaced.
