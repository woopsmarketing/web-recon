# hobbang.net scout report

- **URL**: https://hobbang.net/
- **safeHost**: `hobbang.net`
- **Category**: directory
- **Scouted at**: 2026-09-01T20:26:26.435Z (attempt 1, no retries, no `ignoreHTTPSErrors`)
- **Source record**: `/Users/woops/projects/web-recon/tmp/wr286/scout/hobbang.net.json`
- **Screenshots**: `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/hobbang.net-1440.png` (1440x10863), `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/hobbang.net-390.png` (780x24000, dpr 2, **capped/truncated**)

---

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, no obstacles of any kind.

| Item | Value |
| --- | --- |
| Reachable | yes, both viewports, `errors: []` |
| HTTP status | 200 at 1440 and at 390 |
| Redirect chain | single hop: `200 https://hobbang.net/` — no redirects, final URL == requested URL |
| Main-frame navigations | 1 (`https://hobbang.net/`) — no client-side re-navigation |
| HTTP probe | `http://` → **301 → `https://hobbang.net/`** (162 bytes), so http-only is not an option here |
| HTTPS probe | 200, `text/html`, 70,709 bytes |
| TLS | TLS 1.3, subject `hobbang.net`, issuer `YE1` (Let's Encrypt ECDSA intermediate), valid through 1793696461 (~2026-11) |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| Server / CDN | `nginx`, no CDN layer, no WAF detected |
| Challenge / anti-bot | **none** — `challenge.detected: false`, `signals: []` |
| Auth dependency | **none** — 0 password inputs, 0 login forms, 0 login links, 0 age/adult gates, no login redirect |
| robots.txt | present, 200, 65 bytes: `User-agent: *` / `Allow: /` — homepage explicitly allowed, zero disallow rules, zero other agent groups |
| Sitemap | declared: `https://hobbang.net/sitemap.xml` |
| Network | 37 requests desktop / 35 mobile, statuses 36x200 + 1x204, **0 mixed content**, 0 popups, 0 dialogs, 0 console errors, 0 page errors |
| Failed requests | 1 on each viewport, and it is only the GA beacon `www.google-analytics.com/g/collect?...` → `net::ERR_ABORTED` (headless ad/telemetry abort, not a site failure) |
| Load time | 9.06 s desktop, 5.97 s mobile, `networkIdle: true` both |

There is nothing here that blocks capture: no bot wall, no cookie/consent interstitial, no login, no rate-limiting signal.

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

**Static server-rendered Astro build behind plain nginx. No CMS, no board software, no SPA.**

- The scout's `framework.detected` is only `["gtm/ga"]` (evidence: `dataLayer/googletagmanager`), `generator: null`. That is the analytics tag, not the site framework.
- The real fingerprint is in the stylesheet list: `https://hobbang.net/_astro/index.DHadyNxt.css` — the `/_astro/<name>.<hash>.css` path is Astro's build output convention. Combined with `nginx` + `last-modified: Mon, 24 Aug 2026 22:54:12 GMT` + a weak `etag` on a plain `text/html` document, this is a pre-built static file being served off disk.
- The breakpoint set (`min:40rem`, `min:48rem`, `min:64rem` = 640/768/1024) plus 28 grid containers / 71 flex containers is the Tailwind default scale, i.e. Astro + Tailwind.
- **No gnuboard, no Wix, no Cafe24, no imweb, no WordPress, no jQuery, no React, no Next.js.** Compare against the other 11 candidates in `summary.json`: `seoultone.kr` and `yugiyu4.com` are gnuboard+jQuery, `xn--ok0b408a79cba430b.net` is React+Wix+Bootstrap, `interiorteacher.com` is Next.js. hobbang.net is the only one in the set with an essentially framework-free runtime.
- Amusingly, the site self-describes in its own comparison table (visible in the 1440 screenshot): row `운영 방식` → hobbang.net = `정적 HTML` ("static HTML"), competitors = `Wix 기반` / `워드프레스`. The scout's measurements agree with that claim.
- Only 4 scripts total: 1 external (`www.googletagmanager.com`) and 3 inline (2,710 bytes of inline JS combined). `scriptBytesKnownCount: 0` / `scriptBytesSum: 0` means no measurable first-party JS bundle at all — there is no application JS. The 3 inline blocks are almost certainly the GTM snippet plus a small nav/accordion toggle.
- Routing is server-side: 13 unique same-host paths, all real directory URLs, `jsHref: 0` (no `javascript:` links).

## DOM/CSS/runtime complexity (the actual numbers: DOM elements, stylesheets, scripts, images, iframes, canvases, shadow roots, script bytes)

| Metric | Value | Note |
| --- | --- | --- |
| DOM elements | **884** (identical at 1440 and 390) | same DOM served to both viewports — pure CSS responsiveness, no JS-driven markup swap |
| Document `lang` | `ko` | |
| Stylesheets | **4** (3 `<link>` + 1 `<style>`) | 3 CORS-readable, 1 blocked |
| CSS rules readable | 432 | very small for a 10,863px page |
| `@media` rules | 9 (5 min/max) | |
| `@supports` | 6 | |
| `@keyframes` | **0** | |
| CSS container queries | **0** | |
| `@font-face` | 92 readable + 276 in the fetched blocked sheet = **368 total** | this is the whole story of the page's weight |
| Scripts | **4** (1 external, 3 inline) | inline 2,710 bytes; **first-party script bytes: 0** |
| Script hosts | `www.googletagmanager.com` only | |
| Images | **6** `<img>` (all on `hobbang.net`, 0 without alt, 5 lazy) + 3 inline SVG | 0 `<picture>`, **0 CSS background images**, 0 unique CSS bg URLs |
| Video / audio / embed | **0 / 0 / 0** | |
| **iframes** | **0** | |
| **canvases** | **0** (webgl false, 0 webgl globals) | |
| **shadow roots** | **0** | |
| Custom elements | **0** | |
| Forms / inputs | **0 / 0** | nothing to submit, nothing stateful |
| Tables | **5** real `<table>` elements | |
| Grid / flex containers | 28 / 71 | |
| Fixed-position elements | 1 | the sticky header |
| Animated elements | **0**; transition elements 40; `willChange` 0; marquee 0 | |
| Anchors | 102 (13 unique same-host paths, 17 hash-only, 2 mailto, 1 external host) | |
| External hosts linked | 1 — `hobbang01.com` (1 link) | |
| Total resources | 24 (`script 1, link 3, img 3, css 16, fetch 1`), 588,138 bytes; full network content-length 1,297,453 bytes | ~1.0 MB of that is fonts |
| HTML bytes | 56,498 | |
| Scroll height | 10,863 px @1440, 17,230 px @390 | |

The runtime is about as simple as a real production site gets: no iframes, no canvas, no shadow DOM, no video, no CSS backgrounds, no keyframe animation, no forms, and effectively zero application JavaScript. Every pixel is HTML + CSS + 6 raster images + 3 inline SVGs + webfonts. The only large number on the page is `@font-face`.

## Responsive complexity (media rule counts incl. CORS-readable vs blocked vs fetched, breakpoints observed, and the 390-vs-1440 behaviour you saw in the screenshots)

**Media rule accounting (complete, nothing unaccounted for):**

| Sheet | State | Media rules |
| --- | --- | --- |
| `https://hobbang.net/_astro/index.DHadyNxt.css` (+ 1 inline `<style>` + 1 more readable link) | readable | 9 (5 min/max) |
| `https://fonts.googleapis.com/css2?family=Hahmlet:wght@500;600;700&display=swap` | **CORS-blocked** | — |
| ↳ same sheet, re-fetched by the scout | fetched, 200, 168,411 bytes | **0 media**, 0 min/max, 0 keyframes, **276 `@font-face`**, 0 imports |
| `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/.../pretendardvariable-dynamic-subset.min.css` | readable | contributes to the 92 readable `@font-face` |

So: `sheets 4 / readable 3 / blocked 1 / fetched 1 / fetchFailed 0`, `mediaReadable 9`, `mediaFetched 0`. This is a **clean control case for the CORS capture trap** that Task 28.5C named as top leverage: there IS a CORS-blocked stylesheet, but re-fetching it proves it carries **zero** responsive rules — it is font declarations only. Every responsive rule on this site is readable in-page. No hidden breakpoints.

**Breakpoints observed:** `min:40rem` (640px), `min:48rem` (768px), `min:64rem` (1024px) — 5 unique media queries total. Tailwind's `sm/md/lg`. 390 sits below all three; 1440 sits above all three. A pilot at intermediate widths (700, 900, 1200) would cross each of them cleanly.

**390 vs 1440 from the screenshots — this is a REAL mobile layout, fully reflowed, not a scaled-down desktop.** Evidence:

1. `scrollHeight` grows from 10,863 px @1440 to **17,230 px @390** (1.59x taller). A shrunk fixed-width desktop would keep roughly the same height, not gain 6,400 px.
2. `docWidth == innerWidth == 390`, `horizontalOverflow: false`, `html`/`body` `min-width: 0px`, `viewport: width=device-width, initial-scale=1`. No fixed-width page container.
3. Visually: the desktop header shows the full inline nav (`주소모음 / 링크모음 ▾ / 최신주소 / 검증현황 / 변경이력 / 이용가이드 / FAQ`) plus a hamburger; at 390 the nav links are gone and only the logo + hamburger remain.
4. The hero is a **two-column split at 1440** (headline + CTA + pill row on the left, a 3-card info stack on the right). At 390 those two columns become a **single stacked column** — headline, paragraph, CTA button, 2x2 pill wrap, then the 3 cards full-width below.
5. The category directory is a **4-column card grid at 1440** (11 cards over 3 rows); at 390 it is a **1-column stack** of the same 11 cards.
6. The `주소모음이란?` 2-up card pair, the 4-up `최신 주소를 확인하는 방법` step cards, the 4-up stat tiles (`11개 / 80개 / 79개 / 11/11`), and the 2-up `링크모음을 효율적으로 이용하는 방법` blocks all collapse from multi-column to single column.
7. Font sizes and line lengths change (the mobile body copy re-wraps at ~30 hangul characters per line vs ~50 at desktop), so text metrics are genuinely re-laid-out, not scaled.
8. **One overflow behaviour to note:** the verification `<table>` at 390 is clipped at the right edge mid-column (`분야 / 확인 사이트 / 등록 주소 / 최종 연…`), i.e. it lives inside a horizontally scrollable container rather than reflowing. That is the one place the mobile layout defers instead of reflowing.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with the screenshot evidence)

**Both screenshots exist and are non-blank.** Desktop is a full-page 1440x10863 capture. The mobile capture is 780x24000 device px at dpr 2 = **12,000 CSS px of a 17,230 CSS px page — the scout capped it (`screenshotCapped: true`), so roughly the bottom 30% of the mobile page (FAQ, category detail tail, the 2026 comparison table, use cases, common-mistakes list, and the entire footer) is NOT in the 390 image.** The desktop image covers the full page.

What the desktop page actually contains, top to bottom (14 distinct sections):

1. Sticky white header: circular illustrated 호빵 (steamed-bun) mascot logo + wordmark `호빵넷` + subtitle `링크모음 · 주소모음`, 7 inline nav items, hamburger at right.
2. **Hero — static text hero, no slider, no video, no background image.** Orange eyebrow `LINK DIRECTORY · ADDRESS COLLECTION`, a large 2-line Korean serif headline, a body paragraph, one navy CTA button, a row of 4 grey pills; right column is 3 bordered info cards.
3. A **2-up banner image band** — two flat promotional raster graphics (navy/white on the left showing phone + browser mockups, red/dark on the right). These are ordinary `<img>` elements, not a carousel: `animation.animatedElements: 0`, `keyframes: 0`, no swiper/slick anywhere in the framework list.
4. `주소모음이란?` — 3 paragraphs + a 2-up card pair.
5. `분야별 링크모음` — an **11-card 4-column grid**, each card a small dark rounded glyph tile + title + one-line description + a `→` link.
6. `최신 주소를 확인하는 방법` — 4 numbered step cards in a row.
7. `호빵넷 주소 검증 데이터` — 4 stat tiles (`11개 / 80개 / 79개 / 11/11`) + a **10-row 5-column data table** with green/red status chips.
8. `최근 연결 경로 확인 기록` — a **4-row 6-column table**.
9. A second **2-up banner image band** (red neon-style graphics).
10. `링크모음을 효율적으로 이용하는 방법` — 4 numbered blocks in a 2x2.
11. `주소 확인 항목 한눈에 보기` — a **4-row 3-column table**.
12. FAQ — an 8-item accordion, all rows collapsed with a `+` affordance. **Note: the right half of this section renders as an entirely EMPTY white rounded panel at 1440** — an answer/detail pane that is blank until an item is expanded. web-recon captures one observation per viewport, so it would reproduce that panel empty, which is the correct frozen state but looks like a bug.
13. `카테고리별 주소모음 안내` — 11 heading + paragraph + link blocks in 2 columns.
14. `링크모음 사이트 완전 가이드 — 2026년` (2-column prose + a comparison table), `2026년 링크모음 사이트 비교` (a **9-row 5-column table with ✓/✗/△ glyphs**), `상황별 ... 활용 사례` (2x2), `링크모음 이용 시 자주 하는 실수 5가지` (5 stacked rows), then a dark navy footer with a 4-block layout: brand blurb, a 15-link inline link list, contact/domain column, and a bottom bar with disclaimer + copyright.

**Image-vs-text ratio: text-dominant.** 8,047 characters of body text (4,736 hangul + 816 latin, `primary: ko`) against only 6 raster images and 3 inline SVGs. Four of the six images are the two 2-up banner bands; the others are the logo/mascot and card glyphs. There are **no photographs, no hero background image, no CSS background images, no icon font**. Korean text density is very high — essentially every visible string except the section eyebrows (`WHAT IS AN ADDRESS COLLECTION?`, `ORIGINAL VERIFICATION DATA`, `COMPLETE GUIDE`, …) and the domain names in the tables is hangul.

**Fonts — the one genuinely heavy thing on this page:**

- 2 distinct computed font stacks: `"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` on **797 of 884 elements**, and `Hahmlet, "Pretendard Variable", serif` on **87 elements** (the display headlines — visibly a Korean serif in the screenshots).
- `document.fonts` reports **368 face entries** across 2 families; **17 font resources actually fetched** from `cdn.jsdelivr.net` (16) and `fonts.gstatic.com` (10 responses).
- Pretendard is loaded via the **dynamic-subset** build: `pretendardvariable-dynamic-subset.min.css` splits the variable font into ~90 `unicode-range` slices, so *which* woff2 files download is a function of *which hangul syllables the page actually contains*. Change the Korean copy and the font requests change.
- Hahmlet comes from `fonts.googleapis.com` (CORS-blocked sheet, 168 KB, 276 `@font-face`) with glyph files from `fonts.gstatic.com`.
- Fonts are essentially the entire 1.3 MB of network content-length.

**Animation / motion: none.** 0 `@keyframes`, 0 animated elements, 0 `will-change`, 0 marquee, 40 transition-bearing elements (hover states only). Nothing about this page is time-dependent, so the single-observation capture model loses nothing except the collapsed-accordion state.

## Estimated reconstruction difficulty (1 very easy ... 5 very hard, with explicit reasoning)

**Difficulty: 2 / 5 (easy-to-moderate).**

Why it is easy for web-recon specifically:

- Everything web-recon is known to do *well* and nothing it is known to do *badly*, on the hard-blocker list: **0 iframes, 0 canvas/WebGL, 0 shadow roots, 0 custom elements, 0 video/audio, 0 carousels (no swiper/slick/aos anywhere), 0 keyframe animations, 0 client-side routing, 0 forms/inputs, 0 CSS background images.**
- Layout is pure CSS grid/flex (28 grid + 71 flex containers) with a 3-breakpoint Tailwind scale. No JS-driven layout: the DOM element count is byte-identical (884) at 390 and 1440, which means the responsive behaviour is entirely in the 9 media rules web-recon can already read.
- Only 432 readable CSS rules and 884 DOM elements — small, and *every* responsive rule is CORS-readable (the one blocked sheet was fetched and proven to contain 0 media rules).
- Static server-rendered HTML at a stable URL with no redirect, no challenge, no auth, and `Allow: /` in robots.txt. Re-capture is trivially repeatable.
- Only 6 images, all first-party on `hobbang.net`, none lazily background-injected — asset independence (Task 22's pipeline) should be near-trivial here.

Why it is not a 1:

- **Webfont metrics are the real work.** 368 `@font-face` entries, a `unicode-range` dynamic-subset variable font from a third-party CDN, plus a Google-hosted Korean serif behind a CORS-blocked stylesheet. Hangul line-breaking and the 797-element Pretendard stack mean any fallback substitution shifts vertical rhythm across a 10,863px page. This is exactly the "webfont-dependent metrics" hard category, and it is the dominant risk.
- **Page length.** 10,863 px desktop / 17,230 px mobile. Screenshot-diff QA cost scales with that, and the scout's own mobile capture already hit its cap — the pilot's capture path needs to handle a 17k-px viewport without truncating.
- **5 real `<table>` elements**, one of which relies on a horizontal-overflow container at 390. web-recon's prior pilots (linear.app, stripe.com) contained no table markup at all, so this exercises an untested path.
- **Percent-encoded hangul routes.** 12 of the 13 same-host paths are URL-encoded Korean (`/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`). Route naming, output-file naming, and asset-path generation all need to survive that.
- **One interactive component**: an 8-item FAQ accordion (17 hash-only anchors) with a right-hand panel that is blank in the captured state. Single-observation capture will freeze it collapsed and reproduce the empty panel.

Nothing here needs a new capability; it needs the existing font/asset and responsive paths to hold up under Korean text.

## Potential unique test value (what this site would prove that linear.app and stripe.com did not)

Ranked by how much new coverage each item buys:

1. **Korean webfonts and hangul text metrics — the headline value.** linear.app and stripe.com are latin-only sites with self-hosted or simple Google faces. hobbang.net puts 4,736 hangul characters through a `unicode-range` **dynamic-subset variable font** (Pretendard v1.3.9 from jsdelivr) *plus* a Google-hosted Korean **serif display face** (Hahmlet). That is: variable-font axes, per-syllable subset selection, a third-party CDN font host, and hangul line-breaking, none of which the two prior pilots touched. Task 22 closed with fonts marked "license-needs-review with measured fallback cost" — this is the site that tests whether that measurement survives a non-latin script.
2. **Real `<table>` markup, 5 of them.** Neither prior pilot had a single table. Includes a 10x5 data table with status chips, a ✓/✗/△ comparison matrix, and one table that switches to horizontal-scroll rather than reflowing at 390. Table layout algorithms are a distinct CSS box-model path from grid/flex.
3. **Astro static output.** Both prior pilots were React/Next-shaped. `/_astro/<hash>.css` with zero first-party JS bytes is the opposite end of the spectrum and proves the pipeline is not implicitly relying on framework hydration markers.
4. **Percent-encoded IDN-adjacent routing.** 12 of 13 same-host paths are URL-encoded hangul segments. Route/file/asset naming has never been exercised against non-ASCII paths.
5. **A CORS-blocked-stylesheet control case.** The Google Fonts sheet is blocked but, when fetched, contains **0 media rules and 276 `@font-face`**. Task 28.5C flagged the CORS capture trap as top leverage; this site gives a case where the blocked sheet is provably *not* hiding responsive rules — useful as a negative control alongside a site where it is.
6. **A 10,863px / 17,230px page.** Longest-scrolling candidate at 390 in the whole set of 12 (`summary.json`), and second-longest at 1440. Stresses full-page capture, screenshot-diff windowing, and the responsive band work from 28.5C at real scale.
7. **A directory/link-list information architecture**: 102 anchors, 11 repeated category cards, 15-link footer link list, stat tiles, numbered step lists. Dense repeated small-component structure rather than the marketing-hero-and-whitespace shape of Stripe and Linear.
8. **A plain-nginx origin with no CDN and no edge rewriting** — a different serving environment from both prior pilots.

What it does *not* add: it has no http-only origin (http 301s to https), no punycode host (that is `xn--9l4b19k46k.com` / `xn--ok0b408a79cba430b.net` in the same batch), no board/CMS-generated markup (that is `seoultone.kr` / `yugiyu4.com`, both gnuboard), and no carousel/slider coverage (that is `9skin1.co.kr` / `interiorbay.co.kr`).

## Risks

**Content flags recorded by the scout (stated factually, as recorded):**

- `contentFlags: ["link-aggregator", "piracy"]`.
- `link-aggregator` matched in title/meta (`주소모음` x2, `링크모음` x2, `최신 주소` x2) and heavily in body text (`링크모음` x42, `주소모음` x22, `최신주소` x3, `최신 주소` x3, `address collection` x2). This is the site's stated purpose — it is a link/address directory, and the flag is a description of the category, not of an anomaly.
- `piracy` matched on **exactly one** body-text token: `다시보기` x1. That is a single occurrence in 8,047 characters. Reviewing the desktop screenshot end to end, the visible homepage content is a self-referential explainer about domain verification, HTTPS checking, redirect-path logging and phishing avoidance, and the sites named in its own verification tables are mainstream (naver.com, yna.co.kr, youtube.com, dcinside.com, coupang.com, finance.naver.com, ebs.co.kr, chatgpt.com, sports.naver.com, gov.kr, upbit.com). The 11 category names are 검색·포털 / 뉴스·미디어 / 영상·OTT / 커뮤니티 / 쇼핑·직구 / 금융·투자 / 교육·학습 / AI 도구 / 스포츠중계 / 정부·공공 / 코인.
- **The single outbound external link goes to `hobbang01.com`**, which is another candidate in this same scout batch and which the scout flagged far more heavily: `["adult", "piracy", "link-aggregator", "webtoon", "gambling"]`. The homepage under review does not itself carry those flags, but it links to a host that does. Anyone pursuing category subpages should re-scout them rather than assume the homepage's flag profile carries over — the homepage is the site's explainer page, not its link inventory.
- No adult, gambling, or webtoon flags on this host. No age gate (`ageOrAdultGateElements: 0`).

**Technical risks:**

- **Font fidelity is the top risk.** 368 `@font-face` entries, a dynamic-subset variable font served from `cdn.jsdelivr.net` (a third-party CDN outside the origin), and a Korean serif from `fonts.googleapis.com`/`fonts.gstatic.com`. Any fallback substitution changes hangul advance widths and line counts across a 10,863px page, and the subset slices that download are content-dependent — inject different Korean copy and the required font files change. Licensing needs the same review path Task 22 established (both families are open-source-licensed Korean faces, but the pilot must record and verify that rather than assume it).
- **Mobile screenshot is truncated.** `screenshotCapped: true` — 24,000 device px captured of a 34,460 device px page. The bottom ~30% of the 390 view (including the entire footer) has no scout evidence. Any 390-side QA baseline must be re-captured, not read off this file.
- **Third-party runtime in the capture.** GTM/GA is present and its beacon aborted (`net::ERR_ABORTED`) under headless. A production build should strip GTM entirely; if it is left in, the reconstructed page inherits an analytics tag and a guaranteed failing request.
- **Frozen accordion + empty panel.** The FAQ's right-hand panel is blank in the captured state. Reconstruction will faithfully reproduce an empty white box, which will read as a defect in review unless it is called out up front.
- **Table + horizontal-overflow container at 390.** Untested path; the clipped-table edge visible in the mobile capture is the one place the layout does not reflow, and the overflow wrapper's computed width must be preserved or the table will either overflow the body or be crushed.
- **Content drift.** `last-modified: 2026-08-24`, and the on-page verification tables are dated `2026-08-25` with a stated re-check cadence. Numbers (`11개 / 80개 / 79개 / 11/11`) and the 변경이력 rows will change between captures, so any parity QA must diff structure, not those strings.
- **Percent-encoded hangul paths** may break naive path→filename mapping in the reconstruction/asset writer.
- **Third-party CDN dependency for the critical render path**: 17 of 37 desktop requests go to `cdn.jsdelivr.net`. Asset independence must localise those or the "independent production build" is not independent.
- Minor: TLS certificate expires around 2026-11, so a pilot running past then will need the cert to have rotated (it is Let's Encrypt, so it will).

## Suggested secondary route

**`https://hobbang.net/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`** (decoded: `/링크모음/검색/` — the 검색·포털 category page).

Rationale: the homepage is an explainer/marketing page — hero, prose, stat tiles, tables, FAQ. The category page is the site's actual repeated template: the directory listing that holds the per-site link rows the homepage only summarises (the homepage states 80 registered entries across 11 categories, so a category page is ~7 entries of dense repeated list/card markup). That adds (a) a second, structurally different page type, (b) a **percent-encoded two-segment hangul route**, which is the routing edge case worth proving, and (c) many outbound link rows, which exercises link rewriting/anchor handling at volume. All 11 category pages share the template, so if one reconstructs the other 10 are free.

Runner-up if a *non*-listing page is preferred for contrast: `https://hobbang.net/%EC%9D%B4%EC%9A%A9%EA%B0%80%EC%9D%B4%EB%93%9C/` (`/이용가이드/`, the usage guide) — a single-segment encoded route and likely long-form prose, but structurally closer to the homepage and therefore less additive.

Note: whichever is chosen, scout it before pilot use — the homepage's mild flag profile (`link-aggregator`, one `piracy` token) is not evidence about what the category pages list.

## Recommendation

**SELECT — DIFFICULTY 2/5 — PILOT_VALUE 4/5.**

hobbang.net is the cleanest technical target in the batch of 12 and simultaneously one of the most *informative*. It is 200 on both viewports with no redirect, no challenge, no WAF, no auth, no age gate, TLS 1.3, and a robots.txt that reads `Allow: /` — accessibility is a non-issue. Its runtime is the inverse of every failure mode in web-recon's history: zero iframes, zero canvas/WebGL, zero shadow roots, zero carousels, zero keyframes, zero forms, zero CSS background images, zero first-party JS bytes, and a DOM that is byte-identically 884 elements at 390 and 1440, meaning all responsive behaviour lives in 9 readable media rules against a 3-breakpoint Tailwind scale. The mobile view is a genuine reflow (10,863 → 17,230 px, 4-col grid → 1-col stack, inline nav → hamburger), not a shrunk desktop, so it is a real responsive test rather than a trivial one. What it buys that linear.app and stripe.com could not: hangul text metrics through a `unicode-range` dynamic-subset variable font plus a Google-hosted Korean serif (368 `@font-face`, ~1 MB of the page's 1.3 MB), five real `<table>` elements including a horizontal-overflow case at 390, an Astro static build instead of a React/Next one, percent-encoded hangul routes, and a CORS-blocked stylesheet that is provably *not* hiding responsive rules — a useful negative control for the 28.5C capture trap. The costs are honest and bounded: the page is very tall (the scout's own 390 capture was capped at 70% and lost the footer), GTM must be stripped, the FAQ's blank right panel will reproduce as an empty box under single-observation capture, and the recorded content flags (`link-aggregator` throughout, `piracy` on a single `다시보기` token, plus one outbound link to the more heavily flagged `hobbang01.com`) should be visible to whoever reviews the pilot output. None of those are blockers. Select it as the low-difficulty / high-signal font-and-table pilot, and pair it with a harder candidate from the same batch for carousel and CMS-markup coverage.
