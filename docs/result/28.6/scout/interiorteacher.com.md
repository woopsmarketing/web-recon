# interiorteacher.com scout report

- URL: https://interiorteacher.com/
- Category: interior
- Scouted: 2026-09-01T20:26:04.671Z (attempt 1, no retry needed)
- Source record: `tmp/wr286/scout/interiorteacher.com.json`
- Screenshots: `tmp/wr286/scout/shots/interiorteacher.com-1440.png` (1440x12000), `tmp/wr286/scout/shots/interiorteacher.com-390.png` (780x24000 @dpr2 = 390x12000 CSS)
- Title: 미리보는 프리미엄 인테리어 서비스 | 인테리어티쳐

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, no gate of any kind.

- **HTTP status**: 200 on both viewports. `finalUrl` = requested URL. Redirect chain is a single hop: `200 https://interiorteacher.com/`. Main-frame navigations: one entry, no client-side bounce.
- **TLS**: verdict `https`, valid without `ignoreHTTPSErrors`. TLS 1.2, issuer `Amazon RSA 2048 M04`, subject `interiorteacher.com`, valid to 1797292799 (2026-12). The plain-http probe returns `301 -> https://interiorteacher.com:443/`, so the origin is https-canonical. `mixedContent: 0` on both viewports.
- **Challenge / anti-bot**: `challenge.detected = false`, zero signals, `waf: null`. Server header is `nginx/1.18.0 (Ubuntu)` — origin nginx, no Cloudflare/Akamai interstitial layer. `popups: 0`, `dialogs: 0`, `pageErrors: 0`, `consoleErrors: 1`.
- **Auth**: `auth.classification = "none"` — 0 password inputs, 0 login forms, 0 login links, no members-only match, no age gate, no redirect-to-login. There *is* a `/auth` area (robots-disallowed) and a `/mypage`, but the homepage does not depend on it.
- **robots.txt**: present, 200, `text/plain`, 505 bytes. One `*` group: `Allow: /` with 11 `Disallow` paths (`/ai/styling/result`, `/ai/styling/complete`, `/api`, `/auth`, `/force-error`, `/landing/worldcup/result`, `/mypage`, `/prior-info`, `/space`, `/survey/image-upload/success`, `/old`). **Homepage is explicitly allowed for `*`**, and every path we would want as a secondary route (`/styling-service`, `/content/list`, `/furniture/list`, `/service-info`) is outside the disallow set. No other agent groups, no root-level disallow. Three sitemaps declared: `/sitemap.xml`, `/sitemap-product.xml`, `/sitemap-contents.xml`.

Only reachability wobble worth recording: **`networkIdle` was never reached within 20s on desktop** (mobile likewise `networkIdle: false`), because analytics/session-replay beacons keep the connection pool warm indefinitely. 314 requests / 34 failed on desktop, 285 / 30 on mobile; the failures are all third-party (YouTube QoE pings, `fonts.gstatic.com` Roboto abort, `js-na2.hs-scripts.com` `ERR_BLOCKED_BY_ORB`, doubleclick/daum ad beacons) — none are first-party assets.

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

A **bespoke Next.js/React product site**, not a Korean CMS/builder site. This is the single most "engineered" candidate in the batch.

- `framework.detected`: `next.js` (evidence `__NEXT_DATA__`), `react` (`__reactFiber`), plus `naver-analytics` (wcs), `gtm/ga`, `kakao-sdk`. Response header `x-powered-by: Next.js`. Stylesheet `https://interiorteacher.com/_next/static/css/f24116875e829d30.css` confirms the App/Pages-router build output. `generator` meta is null (no builder fingerprint).
- **No gnuboard / Wix / Cafe24 / imweb**. For contrast, in the same batch `seoultone.kr` and `yugiyu4.com` are gnuboard, `xn--ok0b408a79cba430b.net` is Wix. This one is a hand-built app.
- **Server-rendered, then hydrated.** `htmlBytes` = 261,887 desktop / 261,962 mobile and the https probe already returns 234,148 bytes of `text/html` — the marketing copy, the 20 case cards and the image markup are in the initial HTML, not fetched by the client. That matters a lot for web-recon: a single observation captures real content, not an empty SPA shell. `redirectChain` and `navigations` show no client-side route change on load.
- It is nonetheless a **full app**, not a brochure: robots reveals `/ai/styling/*`, `/survey/image-upload/*`, `/landing/worldcup/*`, `/mypage`, and there are 4 XHR calls to `api.interiorteacher.com`. The homepage is the marketing surface of that app.
- Heavy Korean martech stack layered on top: GTM/GA4, Meta Pixel (`connect.facebook.net`), Kakao SDK, Naver wcs, Microsoft Clarity (session replay), Amplitude (+ session replay), Jennifer APM (`d-collect.jennifersoft.com`, 11 collector calls), HubSpot, Toss (`static.toss.im`), Daum/Doubleclick ads. 13 distinct script hosts.
- `customElements: 1`, `shadowRoots: 0` — the one custom element does not carry a shadow root, so nothing is hidden from DOM capture.

## DOM/CSS/runtime complexity (the actual numbers)

| Metric | Desktop 1440 | Mobile 390 |
|---|---|---|
| DOM elements | 1,107 | 1,112 |
| scrollHeight | 20,563 px | 15,441 px |
| htmlBytes | 261,887 | 261,962 |
| requests / failed | 314 / 34 | 285 / 30 |
| contentLength sum | 14,997,549 | 11,004,229 |

- **Stylesheets**: 6 total — 3 `<link>` + 3 `<style>`. Links are Pretendard variable dynamic-subset (jsdelivr v1.3.6), Pretendard JP variable dynamic-subset (jsdelivr v1.3.9), and the `_next/static/css` bundle. **`css.readable = 6`, `css.blocked = 0`, `fetchedBlockedSheets = []`** — every rule is CORS-readable in-page. 3,577 readable rules.
- **Scripts**: 58 tags (52 external + 6 inline), 60 script resources, `scriptBytesSum` 910,323 bytes across 47 measured resources, 3,318 bytes inline. 30 of the 52 external scripts are first-party `_next` chunks; the remaining 22 are third-party tags.
- **Images**: 102 `<img>` (100 first-party, 2 `static.interiorteacher.com`), **101 of them `loading="lazy"`**, 0 without alt, 21 inline SVG, 0 `<picture>`, **0 CSS background-image elements**. Everything visual is a real `<img>` — good for the asset-independence pipeline, bad for capture timing (see Risks).
- **Media**: 0 `<video>`, 0 `<audio>`, **3 `<iframe>`** (`media.iframe: 3`, resource-level count 4), all YouTube:
  - `https://www.youtube-nocookie.com/embed/AqSKM6FOVns`
  - `https://www.youtube.com/embed/rSN9Bk8uQ-o`
  - `https://www.youtube-nocookie.com/embed/Nnl7HNGYVAs?autoplay=1&mute=1&loop=1&playlist=...&controls=0&showinfo=0` — an **autoplaying muted looping background video**.
  41 requests to `www.youtube-nocookie.com` + 17 to `www.youtube.com` + 4 to `googlevideo.com` on desktop; the player actually started streaming.
- **Canvas/WebGL**: `canvas.count = 0`, `webglCanvasesHeuristic = 0`, `webgl: false`, `webglGlobals: []`. **Shadow roots: 0.**
- **Layout primitives**: 259 flex containers, 23 grid containers, 3 fixed elements, **0 tables, 0 forms, 0 inputs**. `bodyWidth = docWidth = 1440`, `horizontalOverflow: false`, no `min-width` pin on html/body. This is a clean modern flex/grid document — exactly the shape web-recon reconstructs well.
- **Animation**: 5 `@keyframes`, `animatedElements: 0` at sample time, 16 transition elements, 0 marquee, 0 `will-change`. Low motion budget.
- **Fonts**: **227 `@font-face` rules**, 347 document fonts, 22 font resources over 3 hosts (`cdn.jsdelivr.net` 15, `fonts.googleapis.com` 4, first-party 3). 15 declared families: `Pretendard Variable`, `Pretendard JP Variable`, `Arsenal`, `NanumGothic`, `NanumGothicExtraBold`, `ABeeZee`, `Syne`, `Aboreto`, `Prata`, `intea`, **`swiper-icons`**, `__Libre_Baskerville_*`, `__Poppins_*` (next/font locals). Only 4 stacks are actually computed on elements, dominated by `"Pretendard Variable", -apple-system, ...` on 1,067 of 1,107 elements; `Aboreto` (11) and `Prata` (9) carry the serif display headings.
- The `swiper-icons` face is the tell that **Swiper is bundled**, even though the framework detector did not name it (it fingerprints globals, and the Next build has no `window.Swiper`).

## Responsive complexity (media rule counts, breakpoints, 390-vs-1440 behaviour)

- **93 media rules, 89 of them min/max width; 14 unique media queries; all 93 CORS-readable, 0 blocked, 0 needed fetching.** This is the second-densest media-rule set in the batch (only `9skin1.co.kr` at 40 and `xn--ok0b408a79cba430b.net` at 88 come near; `gs.severance.healthcare` and `mystarskin.co.kr` have exactly 1).
- **12 observed breakpoints**: `max:450`, `max:640`, `max:1280`; `min:450`, `min:768`, `min:1024`, `min:1200`, `min:1280`, `min:1440`, `min:1470`, `min:1680`, `min:1760`. Note the four large mins (1440/1470/1680/1760) — this site keeps scaling *above* our 1440 probe, so a 1440-only reconstruction leaves three upper bands unverified. 0 `@supports`, 0 container queries.
- Viewport meta: `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0, viewport-fit=cover, interactive-widget=resizes-content`. `mobileOverflow: false`, `docWidth = innerWidth = 390`.
- **390 is a genuine, reflowed mobile layout — not a shrunk desktop.** Screenshot evidence:
  - The desktop header is a wide bar with a wordmark centred and a 5-icon utility cluster at the right; at 390 the wordmark sits alone on the top line and the icon cluster (search / cart / heart / account / hamburger) drops to a second row with a pill-shaped `AI 디자이너` button beside it. Different element order, not a scale.
  - Hero text `공간은 생각과 행동 / 삶을 변화시킵니다` is right-aligned over the 3D render at 1440 and **left-aligned, larger relative to viewport** at 390; the two CTA buttons sit inline at the right on desktop and become a bordered two-up row spanning the column on mobile.
  - The decisive one: the **"High-end Space" case set**. At 1440 it renders as horizontally-paged rows of five cards each that are *clipped at the right viewport edge* (cards 1–5, then 6–10, then a partial 13/14 row) — a carousel/scroller showing one page. At 390 the **same set becomes a complete 2-column vertical grid running 1 through 20** (AIMED, 신한은행, POSCO, FOUNDERS, BAUER LAB, ALTOS VENTURES, DELTA FLEX, ISLT, GRAVITY LABS, KRAFTON, RIVER HILL SPA, 안국빌딩, CALORIE BAR, EPISODE, PUBLISHER, DINGO, SSIMEEZ, MOVEMENT LAB, IDEA COFFEE, RENAULT). Same content, structurally different container per breakpoint.
  - The "High-end Home" section is a full-bleed room photo with an overlaid floating white card of thumbnail rows at 390; at 1440 that section reads as an edge-to-edge photo band. Different composition, not a scale.
  - The "High-end Partnership" 4-card row is 4-across at 1440 and a 2x2 grid at 390 with the logo wall reflowed from a wide strip into a stacked `Company` / `Brand` block.
  - Scroll height ratio confirms it: 20,563 px at 1440 vs 15,441 px at 390. A shrunk fixed-width page would get *taller* on mobile, not 25% shorter — the mobile layout genuinely repacks into denser grids.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with screenshot evidence)

Both screenshots rendered fine and are legible; **both are capped** (`screenshotCapped: true`), desktop at 12,000 of 20,563 px and mobile at 12,000 CSS px of 15,441 px, so roughly the last 8.5k px of desktop and 3.4k px of mobile are unseen by me.

What I can see, top to bottom:

- **Hero**: a static full-bleed 3D interior render (dark room, sculptural furniture, city view) with overlaid Korean headline and two ghost-button CTAs. No slider dots, no video controls, no carousel chrome — it reads as a single image, which is the easy case.
- **Chat/overlay furniture**: a fixed `AI 디자이너` pill top-left, a floating dark chat bubble bottom-right, and **two dismissable toast cards** (`공간 고민 있으신가요?`, `가구 추천 해드릴까요?` each with an X) that are baked into both captures. These are runtime widgets, and they are *in* the observation.
- **Section count**: numbered marketing chapters `01 High-end Brand` → `09 High-end Value`, plus About, INTRODUCTION VIDEO, MAGAZINE, HIGH-END & INFLUENCER CUSTOMER, world-map, a 5-step problem/solution ladder (01–05 gold/grey stacked cards), and a footer beyond the cap. Call it ~15 major bands over 20.5k px.
- **Card grids**: two large numbered image-card sets (5 brand cases; 20 space cases) plus a 4-card service row, a magazine spread grid (VOGUE / Noblesse / Maison / brique), a 2-row furniture-image strip, and two logo walls (client logos as greyscale wordmarks; then a dense `Company`/`Brand` text-logo table with ~30+ entries). **Image-vs-text ratio is heavily image-weighted** — 102 images against 3,886 characters of text.
- **Carousels/sliders**: the desktop case rows are visibly clipped at the right edge, which together with the bundled `swiper-icons` face means **Swiper is driving at least the brand/space case rails**. web-recon takes one observation per viewport, so we capture slide page 1 and the arrows/dots frozen.
- **Before/after comparison slider**: the About section shows a room image split by a vertical divider with a round drag handle and the instruction `아이콘을 왼쪽으로 움직여보세요` ("drag the icon to the left"). At 390 the `High-end 3D Quality` band shows the BEFORE / 3D IMAGE / AFTER triptych. This is a **JS-driven clip-width drag widget** — it will reconstruct as a static image at whatever clip position the observation caught, and the drag will be dead.
- **Video**: the `INTRODUCTION VIDEO` band and the `High-end 3D Quality` band render as **large flat-black rectangles on desktop** — those are the YouTube iframes, unpainted at capture time. Mobile caught the 3D Quality band showing three still frames instead. One of the three embeds is `autoplay=1&mute=1&loop=1&controls=0`, i.e. a background-video treatment. Expect black boxes in any reconstruction.
- **Typography**: Korean body/UI in Pretendard Variable throughout; display lines in the Latin serif/display faces (`INTRODUCTION VIDEO`, `MAGAZINE`, `HIGH-END & INFLUENCER CUSTOMER`, `OTHERS` / `INTERIOR TEACHER` set in Aboreto/Prata letterspaced caps). Section numerals `01`–`05` in an oldstyle serif. Mixed hangul + letterspaced Latin caps in the same layout is exactly the metrics case linear/stripe never exercised.
- **Canvas / WebGL / 3D**: none. The "3D" in the marketing copy is pre-rendered imagery, not a live renderer. Confirmed by `canvas.count: 0`, `webgl: false`.
- **Animation**: nothing was mid-animation at sample time (`animatedElements: 0`), 16 transition-bearing elements. Motion is not the risk here.

## Estimated reconstruction difficulty

**4 / 5 (hard, but not pathological).**

What pushes it up:

1. **20,563 px desktop page with 101 of 102 images lazy-loaded.** Every image below the first screen is `loading="lazy"`; unless the observer scrolls the entire 20.5k px and waits, a large fraction of the card grids reconstruct as empty boxes. This is the single largest execution risk and it compounds with #2.
2. **`networkIdle` never reached in 20s at either viewport.** Session-replay and ad beacons keep the network hot forever, so any capture gated on network-idle either times out or fires at a nondeterministic moment. Two runs will not necessarily agree on which lazy images have landed.
3. **Swiper rails whose structure changes across breakpoints.** Desktop shows a clipped 5-across page; 390 shows a full 20-item 2-column grid. Single-observation capture means the desktop reconstruction is frozen on page 1 with no way to reach items 6–20, while the mobile reconstruction has all of them — the two viewports will legitimately disagree about how many cards exist.
4. **3 YouTube iframes, one autoplaying background loop.** Cross-origin iframes are not reconstructible; two of them occupy full-width hero-sized bands that will bake as black.
5. **Before/after drag slider** — a clip-path/width widget frozen mid-state.
6. **227 `@font-face` rules across 15 families with Pretendard *dynamic-subset*.** Dynamic subsetting means the CSS enumerates hundreds of unicode-range slices and the browser pulls only the slices the page needs. Asset-independence has to either mirror the right slices or accept a fallback; hangul fallback metrics differ enough from Pretendard to shift every line box. `next/font` local aliases (`__Poppins_6f32cb`) add build-hashed families that will not resolve outside the original build.
7. **12 breakpoints including four above 1440** (1470/1680/1760) that our two probes never exercise.

What pulls it back down (and keeps it off 5):

- **All 6 stylesheets are CORS-readable, 0 blocked, 0 needing a fetch fallback.** After 28.5C, the CORS capture trap was named as the top responsive-fidelity leverage point; this site sidesteps it entirely, so the 93 media rules and 3,577 rules are fully available to the responsive engine. That is a genuinely favourable property for a responsive pilot.
- **0 canvas, 0 WebGL, 0 shadow roots, 0 tables, 0 forms/inputs.** Nothing is hidden from DOM capture, and there is no interactive form surface to reproduce.
- **Server-rendered HTML (262 KB) contains the content.** No SPA-shell trap, no client-side route to wait on, one main-frame navigation.
- **259 flex / 23 grid containers, `horizontalOverflow: false` at both widths, no min-width pin.** The layout primitives are precisely the ones web-recon reconstructs well.
- **0 CSS background images** — every visual is an `<img>` with an alt, which the asset resolver handles more reliably than background-url extraction.
- **No auth, no challenge, no WAF, robots-clean.**

Net: the CSS/layout half of this job is easy-to-medium; the difficulty is concentrated in capture-time behaviour (lazy images, network never idling, carousels, iframes) rather than in anything web-recon structurally cannot express.

## Potential unique test value

Things linear.app and stripe.com did **not** prove:

- **Hangul text metrics at scale.** 2,018 hangul chars vs 630 latin, `html lang="ko"`, and 1,067 of 1,107 elements on a Pretendard stack. Korean line-breaking, glyph advance widths, and the fact that hangul does not wrap on spaces are all untested by the two Latin pilots. Every slot-binding and content-injection width assumption inherited from Stripe/Linear gets re-checked here.
- **Pretendard Variable *dynamic-subset* webfonts from jsdelivr** — 227 `@font-face` rules, unicode-range sliced, cross-origin. This is the canonical Korean webfont delivery pattern and a completely different asset-independence problem from Stripe's self-hosted faces. It also mixes a variable Korean face with `next/font` build-hashed locals and Google Fonts Latin display faces in one document.
- **Mixed hangul + letterspaced Latin display type in the same composition** (`MAGAZINE`, `HIGH-END & INFLUENCER CUSTOMER`, Aboreto/Prata caps over Korean body) — a fallback-metric mismatch shows up immediately and visibly.
- **A responsive *structural* swap, not just a reflow**: desktop Swiper rail (5 visible, clipped) vs mobile 2-column grid of 20. This is the sharpest possible test of the 28.5C hiddenRanges / midpoint-band work, because the two viewports do not merely restyle the same boxes — they present different item counts.
- **93 CORS-readable media rules across 12 breakpoints, four of them above 1440.** A clean, unobstructed responsive corpus, which is exactly what the responsive engine needs after 28.5C flagged CORS-blocked sheets as its top blind spot.
- **Extreme long-form marketing page (20,563 px) with 101 lazy images.** Neither pilot stressed lazy-load capture at this length. Whatever we learn here generalises to most Korean landing pages.
- **Cross-origin YouTube iframes including an autoplay background loop** — an embed class neither pilot contained.
- **A before/after drag-comparison widget** — a new "frozen interactive" archetype beyond the menus/portals already covered.
- **The Korean martech stack** (Naver wcs, Kakao SDK, Daum ads, Toss, Jennifer APM, Clarity, Amplitude) as a script-stripping exercise: 22 third-party tags to remove without touching the 30 `_next` chunks.
- It is also the batch's only **Next.js/React app-backed marketing site**, which contrasts usefully with the gnuboard/Wix/jQuery candidates alongside it.

## Risks

**Technical**

1. **Lazy-image capture (highest).** 101/102 images are `loading="lazy"` across a 20,563 px page. Without a full scroll-and-settle pass the reconstruction will be full of empty card grids. Verify the observer's scroll strategy before committing this as a pilot.
2. **`networkIdle: false` at both viewports** — capture timing is nondeterministic; run-to-run diffs may be noise, not regressions. Any screenshot-diff QA threshold tuned on Linear/Stripe will need re-baselining here.
3. **Screenshot cap already bit at scout time**: desktop capped at 12,000 of 20,563 px. QA screenshot-diff on a 20.5k px page is expensive and may need banding.
4. **Swiper rails frozen at page 1** on desktop; items 6–20 unreachable in the desktop reconstruction while present in the mobile one. Expect a legitimate, non-bug parity mismatch between viewports.
5. **3 cross-origin YouTube iframes**, one `autoplay&loop`, occupying full-width bands → guaranteed black rectangles in output. Needs an operator-input placeholder decision, same class as the Task 26 "real-people testimonial" carry-forward.
6. **227 `@font-face` / dynamic unicode-range subsetting** from `cdn.jsdelivr.net`, plus `next/font` hashed families (`__Poppins_6f32cb`) that cannot be resolved outside the original build. Font independence here is materially harder than Stripe's.
7. **Four breakpoints above our 1440 probe** (1470/1680/1760 mins) are unverified by the current two-width capture.
8. **34 failed requests / 314 total on desktop** (ORB-blocked HubSpot, aborted YouTube QoE and ad beacons). All third-party — harmless for fidelity, but they will pollute any "failed request" health gate.
9. **Runtime overlay widgets baked into the observation**: the `AI 디자이너` pill, the chat bubble, and two dismissable toast cards. They are in the capture; they may or may not be wanted in the product.
10. **4 XHRs to `api.interiorteacher.com`** — some part of the page is live-data-backed; whatever those feed may be stale or empty in a reconstruction.
11. **Live brand marks throughout**: Baccarat, THE HYUNDAI, gallery D&D, VOGUE, RENAULT, POSCO, 신한은행, KRAFTON, Noblesse, Maison, plus ~30 furniture-brand wordmarks. The brand-leak/brand-scan pass will light up heavily, and these are third-party trademarks, not the site's own.

**Content flags recorded by the scout** — stated factually:

- `adult`: one body-text hit on `오피` (count 1).
- `gambling`: `바카라` (2) and `baccarat` (1).
- `webtoon`: `웹툰` (1).
- `titleMeta` flags: none — every hit is body text.

Reading the surrounding text these are all substring/homonym artifacts of the client list, not topical signals: **Baccarat / 바카라 is the French crystal house, listed as brand case 01** ("바카라 VIP 행사 주관사"), `웹툰 작가` appears in the influencer-customer roster (`유명 배우 | 가수 | 아이돌 | 웹툰 작가 | 댄서 | 모델`), and `오피` is almost certainly the `오피스`/office prefix from the `700평 오피스 공간` copy. The site itself is a premium interior-design service. Recording this because the classifier fired, not because the classification holds.

## Suggested secondary route

**`https://interiorteacher.com/furniture/list`** — from the scout's recorded `links.samplePaths` (`/`, `/styling-service`, `/content/list`, `/content`, `/furniture/list`, `/service-info`, `/terms/service`, `/terms/privacy`; 23 anchors, 10 same-host unique URLs, 8 unique paths).

Why it adds structural value the homepage cannot: the homepage is one very long single-column marketing narrative with zero forms, zero inputs and zero tables. A product-list route is the opposite shape — a repeating catalogue grid with filter/sort controls, pagination or infinite scroll, price and spec text, and (per `sitemap-product.xml`) a real backing dataset. That exercises repeated-node slot binding, list/grid templating, and interactive filter chrome, none of which the homepage touches. It is explicitly allowed by robots (only `/api`, `/mypage`, `/space`, `/old` and the AI-styling result pages are disallowed).

Risk to note before committing: on a Next.js app a `/list` route is the most likely place for client-side data fetching or infinite scroll, which would mean a thin first paint and a single-observation capture that misses most rows. If a smoke check shows the listing is not in the server HTML, fall back to **`/content/list`** (magazine/editorial index — same grid benefit, more likely SSR) or **`/service-info`** (a static informational page, structurally safe but adds less).

## Recommendation

**SELECT — DIFFICULTY 4 / 5 — PILOT_VALUE 4 / 5.**

This is the strongest *interior* candidate and one of the strongest in the whole 12-site batch. It clears every disqualifier cleanly: 200 on both viewports, valid TLS with an http→https 301, a one-hop redirect chain, no challenge and no WAF, no auth dependency, robots explicitly allowing the homepage and every route we would want next. Architecturally it is server-rendered Next.js with 262 KB of real HTML, so a single observation captures actual content rather than an SPA shell, and it has none of the structural blockers that have historically hurt us — 0 canvas, 0 WebGL, 0 shadow roots, 0 tables, 259 flex / 23 grid containers, no horizontal overflow at either width. Most importantly for the 28.5C follow-through, **all 6 stylesheets and all 93 media rules are CORS-readable with nothing blocked**, so the 12-breakpoint responsive corpus is fully available to the engine, and the 390 view is a genuinely reflowed mobile layout (verified in the screenshots: reordered header, 4-across → 2x2 partnership grid, and a desktop Swiper rail that becomes a complete 20-item 2-column grid) rather than a shrunk desktop. The unique value over linear.app and stripe.com is real and not merely cosmetic: hangul text metrics on 1,067 elements, Pretendard Variable dynamic-subset webfonts with 227 `@font-face` rules, mixed hangul/letterspaced-Latin display typography, and a responsive structural swap where the two viewports present different item counts. Against that, the difficulty is honestly a 4: the top risk is capture-time, not layout — a 20,563 px page with 101 of 102 images lazy-loaded, `networkIdle` never reached in 20 s, three cross-origin YouTube iframes (one autoplaying background loop) that will bake as black bands, a before/after drag slider frozen mid-state, and font independence made awkward by unicode-range subsetting plus `next/font` build-hashed families. I would select it and front-load a lazy-image scroll-and-settle check before the full pipeline runs; if the schedule demands a low-risk interior instead, `interiorbay.co.kr` (2,672 DOM, 12 media rules, 0 iframes, 5,402 px) is the safer but far less instructive alternative.
