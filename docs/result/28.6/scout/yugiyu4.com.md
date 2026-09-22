# yugiyu4.com scout report

**Candidate:** `https://www.yugiyu4.com/` · category `directory` · scouted `2026-09-01T20:26:42.980Z` · record `tmp/wr286/scout/yugiyu4.com.json`
**Title:** 여기여 - 링크모음, 모든링크, 모든주소, 사이트순위, 링크사이트
**One-line:** A Korean gnuboard link-directory ("여기여") — static server-rendered, zero canvas/WebGL/Shadow DOM, 295 images in a two-column banner wall plus a 20-card Top10 link grid, fully CORS-readable CSS, real 390 reflow, and two active anti-automation traps.

---

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Reachable and clean.

| Probe | Result |
|---|---|
| HTTPS probe | `200`, `text/html; charset=utf-8`, 129,469 B |
| HTTP probe | `301` → `https://www.yugiyu4.com/` (canonical upgrade) |
| TLS verdict | `https` — TLS 1.3, issuer `WE1`, subject `yugiyu4.com`, valid to 2026-11-14 |
| Redirect chain (both viewports) | single hop: `200 https://www.yugiyu4.com/` — no intermediate redirect, no login bounce |
| Main-frame navigations | 1 (`https://www.yugiyu4.com/`) — no client-side re-navigation |
| Challenge / WAF | `detected: false`, signals `[]`, CDN `cloudflare`, WAF `null` |
| Network | desktop 152 requests / **0 failed**, mobile 156 / 1 failed (`spl.zeotap.com` ERR_BLOCKED_BY_ORB — a third-party tracker, not site content) |
| Console / page errors | 0 / 0 on both viewports |
| Mixed content | 0 |
| Auth | `login-ui-present` — 0 password inputs, 0 login forms, 2 login links (`/bbs/login.php`, `/bbs/register.php`). Homepage content is **not** gated; `redirectedToLogin: false`, `ageOrAdultGateElements: 0` |

**robots.txt** — present, `200`, 1,836 B, Cloudflare-managed block. The `*` group is `Allow: /` with `Content-Signal: search=yes,ai-train=no,use=reference`; **`homepageDisallowedForStar: false`**. However nine agent groups carry `Disallow: /`, and they are specifically the AI/LLM crawlers: **Amazonbot, Applebot-Extended, Bytespider, CCBot, ClaudeBot, CloudflareBrowserRenderingCrawler, Google-Extended, GPTBot, meta-externalagent**. No `Sitemap:` directive. Factually: a generic browser UA is allowed; named AI-agent UAs are not, and the operator has signalled `ai-train=no`.

**Two anti-automation behaviours are already on record** (these are the reason the scout run needed a special mode):
1. **devtools-blocker self-blanking.** `scout.mjs:27` documents that this host blanks itself when `outerHeight − innerHeight > 160px`; Playwright's `fullPage` capture trips it. The scout had to run `screenshotMode: "tall-viewport"` (resize the emulated viewport to the full page height, `fullPage:false`) to get a picture at all. Any web-recon observation run must reproduce that, or it will capture a blank page and silently "succeed".
2. **A blocking modal on first paint** (see Visual complexity) — captured in both screenshots.

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

**gnuboard (g5) + jQuery 1.12.4** — `framework.detected: ["jquery","gnuboard"]`, evidence `"g5 globals / gnuboard"` and `"jQuery 1.12.4"`. No `generator` meta.

This is the classic Korean PHP board CMS, and every artefact agrees:
- Stylesheet paths are the gnuboard skin convention — `/theme/basic/css/default.css?ver=2303229`, `/theme/basic/skin/latest/link/style.css`, `/theme/basic/skin/latest/link1/style.css`. The `skin/latest/link` and `skin/latest/link1` pair means the Top10 cards are **two different "latest posts" skins driven by board tables**, i.e. the grid is CMS-generated markup, not hand-authored.
- Auth routes are `/bbs/login.php`, `/bbs/register.php`, `/bbs/myscrap.php`.
- Category routes are rewritten short paths: `/notice /adult /op /casino /check /webtoon /drama /mall /photo /av /sports /community /avbj /ai19 /replica /jetec /overseas /job /torrent /korean` (24 same-host unique paths total).
- `?ver=2303229` cache-busting query on all four link stylesheets.

**Fully static, server-rendered.** No SPA: 1 main-frame navigation, no React/Vue/Next, `customElements: 0`, `shadowRoots: 0`, 6 inline scripts totalling 2,104 B, and only 50,452 B of known external script bytes across 7 measured resources. Of 20 script tags, 14 are external and **7 of the 8 external hosts are advertising/analytics** (`t.dtscout.com`, `whos.amung.us`, `waust.at`, `p.mrktmtrcs.net`, `tags.crwdcntrl.net`, `t.dtscdn.com`, `static.cloudflareinsights.com`; mobile adds `clarity.ms`). Strip the ad-tech and the site's own JS is close to trivial.

**One architectural wrinkle that matters:** the server returns **different markup per UA**. Desktop `htmlBytes: 131,043` / `domElements: 1,649`; mobile `htmlBytes: 139,019` / `domElements: 1,746`. Same URL, no redirect. Part of the delta is tracker variance (mobile pulls Clarity), but +97 elements and +8 KB is more than a script tag or two — the mobile view is at least partly a **server-side mobile skin**, not purely a CSS re-layout of the desktop DOM.

## DOM/CSS/runtime complexity (the actual numbers: DOM elements, stylesheets, scripts, images, iframes, canvases, shadow roots, script bytes)

| Metric | 1440 | 390 |
|---|---|---|
| DOM elements | **1,649** | **1,746** |
| HTML bytes | 131,043 | 139,019 |
| scrollHeight | 6,652 | 5,791 |
| Stylesheets (`document.styleSheets`) | **33** — 4 `<link>` + 29 `<style>` | — |
| CSS rules readable | **1,353** | — |
| Scripts | **20** (14 external, 6 inline) · external known bytes **50,452** across 7 · inline **2,104 B** | — |
| `<img>` elements | **295** (221 without `alt`) · 117 distinct image resources · 0 `<picture>`, 0 inline SVG, **0 lazy** | — |
| CSS background images | 6 elements / 2 unique URLs | — |
| iframes | **2** — both third-party trackers (`t.dtscout.com/idg/`, `tags.crwdcntrl.net/lt/shared/2/lt.iframe.html`) | — |
| video / audio / embed | **0 / 0 / 0** | — |
| canvas | **0** (`webgl: false`, `webglGlobals: []`) | — |
| shadow roots / custom elements | **0 / 0** | — |
| tables | **0** | — |
| grid containers / flex containers | **0 / 3** | — |
| fixed-position elements | 2 | — |
| forms / inputs | 1 / 2 (the search box + its select) | — |
| anchors | **321**, 24 same-host unique paths, **252 external host references** | — |
| Total resources | 145 (`img` 117, `script` 15, `css` 4, `link` 4, `iframe` 2, `xhr` 3) | — |
| Bytes | `resources.bytesSum` 7,245,877 over 129 known · network `contentLengthSum` 473,043 over 152 responses | 473,060 |
| horizontalOverflow | false | false |

Read that shape against the repo's known failure modes and it is almost entirely on the "easy" side: **no canvas, no WebGL, no Shadow DOM, no video, no swiper/slick, no client-side router, no `<table>` layout, no `@supports`, no container queries, no lazy-loading.** `gridContainers: 0` / `flexContainers: 3` means the multi-column layout is float or inline-block, which is the oldest and most deterministic thing web-recon can copy.

The two genuine weight centres are **295 `<img>` tags** and **1,353 CSS rules over 33 sheets** (29 of which are inline `<style>` blocks — gnuboard skins scatter per-widget CSS through the body; the recon pipeline must keep source order across all 33 or cascade breaks).

## Responsive complexity (media rule counts incl. CORS-readable vs blocked vs fetched, breakpoints observed, and the 390-vs-1440 behaviour you saw in the screenshots)

**The CORS trap from 28.5C does not apply here — this is the best-case input.**

| CSS capture | Value |
|---|---|
| Sheets total | 33 |
| **CORS-readable** | **33** |
| **Blocked** | **0** (`blockedHrefs: []`) |
| Fetched (fallback needed) | **0** · fetch failures 0 |
| Media rules readable | **7** (all 7 min/max form) |
| Unique media queries | **5** |
| Breakpoints | `max:640px`, `max:767px`, `max:900px`, `max:991px`, `min:992px` |
| `@supports` / container queries | 0 / 0 |
| `@keyframes` | 4 |
| `@font-face` | 5 |

Every byte of CSS is readable in-page; nothing has to be re-fetched and re-parsed, so the hiddenRanges / frozen-px machinery from 28.5C gets clean, complete input for once. Five breakpoints, all classic Bootstrap-ish values, all `min`/`max` width — no `orientation`, no `hover`, no ratio queries.

**The 390 view is a REAL mobile layout, fully reflowed — not a shrunk desktop.** Evidence from the screenshots, not just the numbers:
- **Header is restructured, not resized.** At 1440 the header is a utility bar (즐겨찾기 추가 / 텔레 공식채널 on the left; 회원가입 · 로그인 · 찜목록 · 공지사항 · 광고/제휴문의 on the right) above a logo-left / search-centre / widget-right row. At 390 that entire structure is replaced by a **hamburger ☰ (left) + centred logo + user icon (right)** dark bar, with the search field dropped to its own full-width row below. That is different markup, not the same markup narrower.
- **The Top10 card grid reflows 4 columns → 2 columns.** Twenty category cards sit 4-across at 1440 and 2-across at 390, each card keeping its 10-row ranked list intact.
- **The banner wall stays 2-up but re-proportions**, with each banner scaling to half the 390 width rather than being clipped.
- **The realtime-keyword strip collapses.** At 1440 it renders inline as `1. crimson desert 2. 춘분 3. 김기태 …` through 10 entries; at 390 it becomes a single row (`1. 여기여`) with a **▼ disclosure chevron** — a JS-toggled accordion that only exists in the mobile presentation.
- **Card headers change affordance**: `›` chevrons at 1440 become `▼` chevrons on several mobile cards, i.e. mobile-only collapse behaviour.
- **The footer restacks** from a single centred line to a wrapped two-line disclaimer over the copyright and badge.
- `mobileMetrics`: `docWidth: 390`, `innerWidth: 390`, `horizontalOverflow: false`, viewport meta `width=device-width,initial-scale=1.0,minimum-scale=0,maximum-scale=10`. No `min-width` on `html`/`body` (both `0px`). Nothing is fixed-width.

Caveat already flagged above: some of that reflow is **server-side**, not CSS. 1,746 vs 1,649 elements at the same URL means the 390 DOM contains nodes the 1440 DOM does not (the hamburger drawer being the obvious candidate). web-recon's per-viewport observation model handles this correctly by construction — but a naive "one DOM + media queries" reconstruction would silently lose the mobile header.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with the screenshot evidence)

Both screenshots exist and are legible. `yugiyu4.com-1440.png` is **1440 × 6,652** (4.6 MB); `yugiyu4.com-390.png` is **780 × 11,582** at DPR 2 (2.6 MB, = 390 × 5,791 CSS px). Neither is blank or truncated. Both were captured in `tall-viewport` mode.

**What the desktop screenshot actually shows, top to bottom (~9 sections):**
1. Thin utility bar on white.
2. Logo (a red/yellow/red three-circle "여 기 여" wordmark, an image) + a `[구글 ▾]` select + search input + red 검색 button, with a small view-count widget at the right.
3. **Portal shortcut strip** — a horizontal row of nine external logo images: Google, NAVER, Daum, NATE, ZUM, YouTube, Instagram, facebook, X. Pure `<img>`, no sprite.
4. `⭐ 여기여 공식보증업체 ⭐` heading, then one full-width hero-ish banner (WOW 토토와우).
5. **The dominant feature: a two-column banner wall.** Roughly 60+ rows of ~700 × 90 promotional banner images running about 4,000 px of the 6,652 px page — saturated multi-colour gambling/casino creatives, heavy Hangul display type baked into the bitmaps. This is where the 295 `<img>` tags and the 7.2 MB decoded-bytes figure come from. Many of these are near-certainly animated GIFs; web-recon captures a single observation, so **each will be frozen at whatever frame was showing** — a real but low-severity fidelity gap, since the banners are decorative and byte-identical assets can simply be re-fetched.
6. A `여기여 텔레 공식 채널` strip.
7. **A 4 × 5 grid of twenty "Top10" cards** — 성인 / 오피 / 토토·카지노 / 검증 / 웹툰 / 드라마 / 성인용품 / 성인화보 / 해외성인 / 스포츠 / 커뮤니티 / 성인방송 / AI성인 / 레플리카 / 제테크 / 해외직구 / 구인구직 / 토렌트 / 한인교민. Each card is an icon + title + `›`, then exactly ten rows of rank badge (gold/silver/bronze medal icons for 1–3, numbered chips for 4–10) + a coloured Hangul link label. **This is the structurally interesting part of the page** — 200 dense, small-type Hangul list rows where line-height, badge-to-text baseline alignment, and per-row colour all have to land.
8. A `링크주소안내` line and a dark footer with a two-line Korean disclaimer, `Copyright © 2024 여기여주소안내.com All rights reserved.`, and one small badge image.
9. A fixed scroll-to-top button (bottom right).

**No hero image, no slider, no carousel, no video, no canvas.** `media.video: 0`, `canvas.count: 0`, `webgl: false`. The only carousel-ish element on the whole page is the realtime keyword strip, and it is text-only.

**Animation is essentially nil:** across 1,649 sampled elements, `animatedElements: 1`, `transitionElements: 1`, `animationNames: ["popupIn"]`, `marquee: 0`, `willChange: 0`. Four `@keyframes` are defined but only one is live.

**That one animation is a blocking modal, and it is in both captures.** A rounded card reading `현재접속가능주소 yugiyu4.com / 다음주소 yugiyu5.com / 평생주소 여기여주소안내.com`, footed by `오늘 그만보기` and `닫기 ×`, sits centred over the page — and it dims the **entire** document behind it. Every desktop slice from the header to the footer is visibly greyed. This is the `popupIn` keyframe and one of the two `fixedElements`. **Consequence for reconstruction:** web-recon's single observation captures the page *with the modal open and the backdrop applied*, so a naive bake reproduces a permanently dimmed site behind an undismissable dialog. The modal must be either dismissed pre-observation or explicitly modelled as dismissible state. Same on mobile, where the modal covers ~40% of the 390 viewport.

**Fonts are the other real fidelity axis.** `documentFontFamilies: ["Noto Sans KR","FontAwesome"]`, 5 `@font-face` rules, **3 font resources all self-hosted on `www.yugiyu4.com`** (`webfontLinkHosts: []` — nothing from Google Fonts). Computed stacks: `"Noto Sans KR", sans-serif` on **1,581 of 1,649 elements**, `Times` on 48, `FontAwesome` on 20. So ~96% of the DOM is Hangul rendered in a self-hosted CJK webfont, and 20 elements are icon-font glyphs. Self-hosted is good news for asset independence (Task 22 machinery fetches them directly, no license-unknown Google CDN hop), but Hangul metrics in dense 10-row lists are exactly where a fallback substitution shows up as visible reflow.

**Text/image balance:** only **1,888 characters** of extracted text (822 Hangul, 419 Latin, 3 Han, `primary: ko`, `html lang="ko"`) against 295 images. Text-per-pixel is very low — this is an image-dominated page whose *text* content lives almost entirely in the 200 Top10 list rows and the nav.

## Estimated reconstruction difficulty (1 very easy … 5 very hard, with explicit reasoning)

**DIFFICULTY: 2 (easy–moderate).**

Arguing for low difficulty — nearly every known web-recon failure mode is absent:
- **0 canvas, 0 WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 `<table>` layout.**
- **No carousel library.** Of the 12 scouted candidates, five detected `swiper` and/or `slick`; this one detects neither. The single-observation frozen-slide problem barely applies.
- **No SPA.** One main-frame navigation, no React/Next/Vue, no client-side routing to defeat the observer.
- **JS-driven layout is negligible** — 50 KB of known external script and 2 KB inline, and most of the external load is ad-tech that will be dropped anyway. Layout comes from CSS, not from JS measuring and positioning.
- **Zero CORS-blocked stylesheets.** All 33 sheets and all 7 media rules are directly readable. Compared with the 28.5C finding that CORS-blocked CSS is the top responsive-fidelity leverage point, this candidate hands the pipeline complete input.
- **Only 5 breakpoints**, all plain min/max width.
- **Static, cacheable, single-origin assets** — all 295 images and all 3 fonts are on `www.yugiyu4.com`, so Task 22 asset independence is a straight fetch with no third-party licensing question.
- **0 failed requests, 0 console errors, 0 page errors, networkIdle true** on both viewports.

Arguing against a 1:
- **The modal-overlay capture problem** (dimmed backdrop baked into the observation) needs explicit handling or the whole reconstruction is visibly grey.
- **The devtools-blocker** means the observation run must use the same tall-viewport workaround the scout used, or it captures a blank page and reports success.
- **295 images / 117 unique / ~7.2 MB decoded**, many animated GIFs, frozen at one frame.
- **29 inline `<style>` blocks** interleaved with 4 linked sheets — source-order fidelity across 33 sheets and 1,353 rules is fiddly.
- **1,581 elements on a self-hosted Hangul webfont**, with the densest text in small-type ranked lists where metric drift is most visible.
- **Server-side UA branching** (+97 elements at 390) — correct only because web-recon observes per viewport; it invalidates any single-DOM assumption downstream.
- **221 of 295 images carry no `alt`**, so content injection and SEO phases will produce a large needs-input queue for image copy.

None of those threaten fidelity; they cost setup time. Hence 2, not 1 and not 3.

## Potential unique test value (what this site would prove that linear.app and stripe.com did not)

Substantial, and largely disjoint from the two pilots already burned in:

1. **gnuboard / Korean board-CMS markup.** linear.app (Next.js/React) and stripe.com (bespoke modern stack) are both hand-built modern frontends. This is machine-generated PHP-skin markup: `theme/basic/skin/latest/link/`, `?ver=` cache-busting, `/bbs/*.php` routes, 29 scattered inline `<style>` blocks. An entirely untested markup dialect — and the dominant one in the Korean SMB web the repo is aiming at.
2. **Hangul text metrics under a self-hosted CJK webfont.** 1,581 elements on `Noto Sans KR`, `html lang="ko"`, 822 Hangul chars, 3 self-hosted font files, zero Google Fonts. Neither pilot exercised CJK line-breaking, Hangul baseline alignment, or a self-hosted CJK `@font-face` — and Task 22 recorded fonts as `license-needs-review` on the Stripe run specifically because they came from a third-party CDN. Here they do not.
3. **Directory / dense-link-list structure at scale.** 321 anchors, 24 same-host paths, 252 external host references, 200 ranked list rows in 20 uniform cards. Stripe and Linear are marketing sites with a handful of CTAs; neither tested a page whose entire payload is a link table.
4. **Image-heavy grid where images ARE the content.** 295 `<img>`, 0 inline SVG, 0 lazy-load, ~4,000 px of two-column banner wall. Linear and Stripe are SVG/CSS-illustration sites; this is the opposite polarity and stresses asset fetch, dedup (295 tags → 117 resources), and grid fidelity instead of vector fidelity.
5. **A blocking modal + full-page dim overlay in the captured observation.** The repo already has a paint-twin/co-binding finding from Task 19.1; this adds a *state* problem rather than a layering problem — the observation records a transient UI state that must be undone. Genuinely new coverage.
6. **An actively anti-automation host.** The devtools-blocker self-blanking is a documented, reproducible trap that already forced a scout-side workaround. Proving the full recon → template → content → production pipeline survives it is worth more than another cooperative site.
7. **Server-side UA branching.** A same-URL, different-DOM site directly validates the per-viewport observation architecture. Neither prior pilot did.
8. **Ad-tech-dominated third-party graph** — 8 external script hosts, 2 tracker iframes, 14 network hosts, one ORB-blocked request — a realistic test of the release phase's ability to strip third-party surface without collateral damage.
9. **`float`/`inline-block` layout with `gridContainers: 0`.** Both prior pilots were modern flex/grid. Legacy layout is a different inference path in `layout-inference.ts`.

## Risks (technical risks AND any content flags recorded by the scout)

**Technical**
- **Devtools-blocker self-blanking** (`scout.mjs:27`): the page blanks itself when outer/inner viewport height differ by >160 px. A default `fullPage` observation returns a blank capture. Must run tall-viewport. *Highest-priority risk — it fails silently.*
- **Modal + dim backdrop captured in the observation.** `popupIn`, one of 2 fixed elements; dims the whole document. Reconstruction is grey and gated unless the modal is dismissed pre-capture or modelled as state.
- **Animated GIF banners frozen at one frame** by single-observation capture. Cosmetic; assets are byte-identical on re-fetch.
- **Mobile DOM ≠ desktop DOM** (1,746 vs 1,649; 139,019 vs 131,043 bytes). Any downstream stage assuming one DOM plus media queries loses the mobile header.
- **33 stylesheets, 29 of them inline**, 1,353 rules — cascade order fidelity is the fiddly part.
- **295 `<img>`, 221 without `alt`** — a large needs-input queue for content injection and SEO.
- **252 external host references across 321 anchors** — outbound links must be neutralised or re-pointed for any production bake.
- **2 tracker iframes + 8 ad-tech script hosts + 1 ORB-blocked request**; mobile pulls Clarity that desktop does not, so the third-party set is not stable between viewports.
- **`?ver=2303229` on every stylesheet** — asset resolution must preserve or rewrite the query consistently.
- **Cloudflare `cf-cache-status: DYNAMIC`, `cache-control: max-age=0`, `last-modified` = request time.** The homepage is dynamic; the banner wall and Top10 ordering may differ between two runs, so screenshot-diff QA will need tolerance for content churn independent of layout fidelity.
- **`login-ui-present`** — `/bbs/login.php`, `/bbs/register.php`, `/bbs/myscrap.php` exist. Homepage is open, but any crawl expansion should avoid auth surfaces.

**Content flags recorded by the scout** — stated factually, as measured:
- `contentFlags: ["adult","piracy","link-aggregator","webtoon","gambling"]`.
- Title/meta hits: `오피` ×1 (adult); `다시보기` ×1, `웹툰 무료` ×1 (piracy); `링크모음` ×2, `링크사이트` ×2, `주소모음` ×1, `주소찾기` ×1 (link-aggregator); `웹툰` ×2.
- Body-text hits: adult — `성인` ×8, `오피` ×5, `야동` ×3, `성인용품` ×2, `유흥`/`성인방송`/`키스방`/`av` ×1 each; gambling — `카지노` ×4, `토토` ×4, `슬롯` ×2, `먹튀`/`보증업체` ×1; piracy — `토렌트` ×11, `누누티비`/`뉴토끼`/`마나토끼`/`블랙툰` ×1 each.
- The site self-describes in its footer as a link index that does not host content (`여기여는 게재된 사이트들과 직접적인 연관이 없는 링크(주소)사이트입니다`), and the outbound hosts include gambling operators, adult sites, and streaming/webtoon mirrors, several on IDN punycode domains (`xn--h10bt26abuh3me.net`, `xn--hz2b29k79dink.net`, `xn--2f5bonp4a.com`, and others).
- `robots.txt` explicitly `Disallow: /` for ClaudeBot, GPTBot, CCBot, Google-Extended, Applebot-Extended, Bytespider, Amazonbot, meta-externalagent and CloudflareBrowserRenderingCrawler, with `Content-Signal: ai-train=no`. The `*` group allows the homepage; the operator's stated position toward AI agents specifically is refusal.
- `ageOrAdultGateElements: 0` — no age gate is enforced.

These flags carry no technical weight, but they are the reason this is not a clean demonstrator: a pilot artefact of this site is a reproduction of an adult/gambling/piracy link index, and the operator has explicitly disallowed AI agents in robots.txt.

## Suggested secondary route

**`https://www.yugiyu4.com/notice`**

Of the 24 same-host paths the scout recorded, the category routes (`/adult`, `/op`, `/casino`, `/webtoon`, `/drama`, `/torrent`, `/av`, `/sports`, …) are all structural repeats of the homepage's card-and-banner pattern — high volume, near-zero new information. `/notice` is the one that is architecturally *different*: in gnuboard it is a `bbs/board.php` list view, which means a paginated post list with title/author/date columns, a board header, and pagination controls — the list-and-pagination markup family the homepage contains none of (`tables: 0`, `forms: 1`). Pairing homepage + `/notice` covers both of the CMS's output modes (skin-rendered widget grid, and board list) at the cost of one extra route.

If `/notice` turns out to be sparse or empty, the next-best structural addition is `/webtoon` (a full category page, to verify the card grid holds at a different item count) — but it adds far less than the board view does.

## Recommendation

**BACKUP** · **DIFFICULTY 2** · **PILOT_VALUE 4**

Technically this is one of the strongest targets in the batch of twelve. It is fully reachable (200, TLS 1.3, single-hop redirect, no challenge, no WAF, 0 failed requests, 0 console errors), it is static server-rendered gnuboard with jQuery and nothing else, and it avoids essentially every documented web-recon failure mode: no canvas, no WebGL, no Shadow DOM, no video, no swiper/slick carousel, no SPA routing, no JS-driven layout, no `<table>` layout, and — decisively, given the 28.5C finding that CORS-blocked CSS is the top responsive-fidelity leverage point — **33 of 33 stylesheets and 7 of 7 media rules are directly readable, with zero blocked and zero needing re-fetch.** The 390 view is a genuine reflow (hamburger header, 4→2 column card grid, restacked footer, no horizontal overflow), so it exercises responsive reconstruction honestly rather than shrinking a fixed-width page. And its unique-value surface is large and disjoint from linear.app and stripe.com: Korean board-CMS generated markup, 1,581 elements of Hangul on a **self-hosted** Noto Sans KR (sidestepping the license-needs-review problem Task 22 hit on CDN fonts), a 295-image grid where images are the content, 200 dense ranked link rows, legacy float layout with `gridContainers: 0`, and same-URL server-side UA branching that directly validates the per-viewport observation model. Against that: two setup traps that must be handled explicitly — the devtools-blocker that blanks the page under a default `fullPage` capture (silent failure, already worked around in `scout.mjs`), and a `popupIn` modal whose full-page dim backdrop is baked into both captures and would otherwise leave the entire reconstruction grey. Both cost time, not fidelity. The reason this lands on BACKUP rather than SELECT is not technical: the scout recorded `adult`, `piracy`, `link-aggregator`, `webtoon` and `gambling` flags with dozens of body-text hits, the outbound graph is 252 hosts of gambling and streaming-mirror destinations, and `robots.txt` names ClaudeBot, GPTBot and seven other AI agents under `Disallow: /` with `Content-Signal: ai-train=no` even while allowing the homepage to `*`. As a structural stress-test it is excellent and I would keep it in the pool; as the artefact a first real production pilot is judged on, a cleaner-content candidate of comparable difficulty should be preferred if one exists in the batch.
