# hobbang01.com scout report

- Candidate: `https://hobbang01.com/` — category `directory`
- Scouted: 2026-09-01T20:26:26.572Z (attempt 1, no retry needed)
- Measurement record: `tmp/wr286/scout/hobbang01.com.json`
- Screenshots: `tmp/wr286/scout/shots/hobbang01.com-1440.png` (720 KB), `tmp/wr286/scout/shots/hobbang01.com-390.png` (759 KB) — both present and fully rendered
- Title: `호빵넷 - 최신 주소 링크모음 | hobbang01.com`

---

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, clean, and fast on both viewports.

| Signal | Value |
|---|---|
| HTTP status (1440 and 390) | `200` |
| Redirect chain | none — `200 https://hobbang01.com/`, single main-frame navigation |
| http:// probe | `301` → `https://hobbang01.com/` (canonical https, HSTS `max-age=63072000; includeSubDomains; preload`) |
| TLS | TLS 1.3, issuer `WE1`, subject `hobbang01.com`, valid to 2026-11 |
| Challenge / WAF | **none detected** — zero challenge signals; CDN = Cloudflare, `waf: null` |
| Network | 42 requests, **0 failed**, 0 mixed content, 0 console errors, 0 page errors, 0 popups, 0 dialogs |
| Payload | 42 responses / 297 KB transferred; HTML 112.5 KB (zstd); `cf-cache-status: DYNAMIC` |
| Wall time | 8.0 s desktop, 5.6 s mobile, `networkIdle: true` both |
| Auth dependency | `none` — 0 password inputs, 0 login forms, 0 age/adult-gate elements, no login redirect |

`robots.txt` is present (200, 1,903 bytes) and is **Cloudflare Managed content**, not hand-authored:

- `User-agent: *` → `Allow: /` with `Content-Signal: search=yes,ai-train=no,use=reference`. Homepage is allowed for the star group; zero star-group disallows.
- Nine named agents get `Disallow: /`: `Amazonbot`, `Applebot-Extended`, `Bytespider`, `CCBot`, **`ClaudeBot`**, **`CloudflareBrowserRenderingCrawler`**, `Google-Extended`, `GPTBot`, `meta-externalagent`.
- Sitemap declared: `https://hobbang01.com/sitemap.xml`.

Reachability is a clean PASS. The named-agent block list is a governance signal recorded factually in Risks below; it did not affect this scout run.

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

**Plain server-rendered static HTML with no framework and no builder fingerprint.** Framework detection returned `detected: []` with empty evidence, `<meta name="generator">` is `null`, and there is no gnuboard / Wix / Cafe24 / imweb marker anywhere in the record. This is the only candidate in the 12-site set besides `xn--9l4b19k46k.com` with `framework: none-detected` — the four other `directory` candidates came back as React (`jusohot4.com`), React+Wix+Bootstrap (`xn--ok0b408a79cba430b.net`), jQuery+gnuboard (`yugiyu4.com`), and GTM-only (`hobbang.net`).

Definitively **not an SPA**: 3 script tags total (2 external, 1 inline), and one of the two external scripts is `static.cloudflareinsights.com` beacon — so the site ships a single first-party script of 3,749 bytes plus 227 bytes inline. There is no router, no hydration payload, no client-side data fetch driving layout. The full 463-link directory is in the delivered 112 KB HTML document. `last-modified: Tue, 01 Sep 2026 02:28:22 GMT` (≈18 h before the scout) suggests a generator/publisher writing a flat file rather than a live DB render, but that is an inference, not a measurement.

Zero forms, zero inputs, zero tables — the whole page is anchors inside CSS grid/flex containers.

## DOM/CSS/runtime complexity (the actual numbers)

| Metric | Value | Note |
|---|---|---|
| DOM elements | **2,459** | identical at 1440 and 390 — no JS-injected/removed nodes between viewports |
| Stylesheets | **1** | one `<link>`: `/css/style.css?v=12`; 0 `<style>` tags |
| CSS rules readable | **142** | tiny sheet |
| Scripts | **3** | 2 external + 1 inline; hosts: `hobbang01.com` ×1, `static.cloudflareinsights.com` ×1 |
| Script bytes | **3,749** (first-party, 1 of 2 measured) + 227 inline | effectively no JS runtime |
| `<img>` elements | **112** | 30 without alt; **111 marked `loading="lazy"`**; all from `hobbang01.com` |
| Image resources actually fetched | **34** | i.e. ~78 lazy images never loaded during the observation |
| Inline SVG / `<picture>` / CSS background images | **0 / 0 / 0** | no background-image layer at all |
| iframes / video / audio / embed | **0 / 0 / 0 / 0** | — |
| Canvas / WebGL | **0 / false** | — |
| Shadow roots / custom elements | **0 / 0** | — |
| Grid containers / flex containers | **392 / 510** | pure modern layout |
| Tables / forms / inputs | **0 / 0 / 0** | — |
| Fixed-position elements | 2 | top telegram bar + header region |
| Anchors | **442** | 12 hash-only; 412 distinct external hosts; **`sameHostUniqueUrls: 1`** (only `/`) |
| Total resources / bytes | 41 / 325 KB | |

Runtime complexity is the lowest of all 12 candidates: 1 stylesheet vs 33 (`yugiyu4.com`), 29 (`xn--ok0b408a79cba430b.net`), 19 (`9skin1.co.kr`); 3 scripts vs 83, 58, 49, 34 elsewhere. The one number that is *not* small is DOM element count (2,459 — second-highest in the set behind `interiorbay.co.kr`'s 2,672), and that matters: only ~76 category link rows are visible in the 1440 screenshot, yet 442 anchors exist. **The collapsed `+N개 더보기` entries are almost certainly present in the DOM and hidden by CSS**, which is exactly the hidden-element class Task 28.5C had to model with `hiddenRanges`.

## Responsive complexity (media rule counts incl. CORS-readable vs blocked vs fetched, breakpoints observed, and the 390-vs-1440 behaviour)

**This is the cleanest responsive-measurement target in the whole set.**

- `css.sheets: 1`, **`readable: 1`, `blocked: 0`, `fetched: 0`, `fetchFailed: 0`, `blockedHrefs: []`** — the stylesheet is same-origin and fully CORS-readable via CSSOM. There is **no CORS capture trap here at all**, which the pre-28.5D adjudication named as the top leverage confound. Every responsive rule that governs this page can be read directly, so a pilot on this site isolates the breakpoint/`hiddenRanges` algorithm from the CORS blind spot.
- `mediaRules: 4`, `mediaMinMax: 4`, `uniqueMediaQueries: 4`. Breakpoints, all `max-width`, all desktop-first: **1180px, 900px, 860px, 520px**.
- `keyframes: 0`, `fontFace: 0`, `supports: 0`, `container: 0` — no container queries, no `@supports` branching, no CSS animation.
- `horizontalOverflow: false` at both 1440 and 390; `hasHtmlMinWidthPx` is `0px` on both `html` and `body` — **no frozen min-width**, which was the 28.5C failure signature.
- Viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover`. `mobileMetrics.docWidth: 390`, `innerWidth: 390`.
- Scroll height: **2,372 px @1440 → 2,920 px @390** (+23%).

**The 390 view is a REAL reflowed mobile layout, not a scaled-down desktop.** The screenshots make this unambiguous: the desktop card grid is **4 columns × 3 rows**; at 390 the same cards become **2 columns × 6 rows** with the last card (`한인교민`) alone on a half-width final row. Independent of the card grid, the top nav reflows from a single 11-item horizontal strip into a 2-row wrapped strip; the four banner ads go from a 2×2 arrangement at ~600 px each to a 2×2 of much smaller creatives; and the eight social shortcuts (`Google / Youtube / Naver / Band / Daum / Kakao / Instagram / Facebook`) drop their text labels entirely and become an icon-only row. Body text does not shrink — the Korean glyphs stay at readable size while the container narrows. Combined with `docWidth == innerWidth == 390` and no horizontal overflow, this is a genuine multi-stage reflow across 4 breakpoints, not a shrunk fixed-width page.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with screenshot evidence)

**Hero:** there is no hero image, no slider, no carousel, no video. The masthead is a small mascot illustration plus the wordmark `호빵넷` and the tagline `따뜻하게 모아둔 최신 주소` — pure text and one small raster. Nothing in the record contradicts this: `video: 0`, `iframe: 0`, `canvas: 0`, `webgl: false`, no swiper/slick/AOS in framework detection (compare `9skin1.co.kr`, `mystarskin.co.kr`, `seoultone.kr`, `interiorbay.co.kr`, `gs.severance.healthcare`, which all ship swiper and/or slick). **The single-observation carousel-freeze problem does not apply to this candidate.**

**Animation:** `keyframes: 0`, `animationNames: []`, `animatedElements: 0`, `marquee: 0`, `willChange: 0`. There are 496 `transitionElements`, but with no keyframes and no animated elements these are hover/press transitions on the link rows and cards — irrelevant to a static single-viewport capture.

**Section count (from the 1440 screenshot, top to bottom):** (1) thin dark telegram bar with `평생주소 hobbang01.com` pill on the right; (2) centered logo/mascot masthead; (3) 11-item category nav with per-item icons and `19` badges; (4) four banner ad creatives in a 2×2 block (kcasino, 유로스타, Bet38, plus a self-promo `호빵넷 배너문의하기` panel); (5) an 8-cell portal shortcut strip; (6) `최신 주소 · 링크모음` section heading with the counter `11개 카테고리 · 463개 링크를 카테고리별로 안내합니다.`; (7) the main 4×3 card grid; (8) a dark brown footer.

**Cards/lists:** twelve category cards, each with icon + Korean title + a count pill (`101개`, `45개`, `3개`, `0개`, `76개`, `52개`, `0개`, `24개`, `46개`, `48개`, `68개`). Each card lists up to 10 link rows, every row = small numbered/medal rank badge image + Korean label + `↗` glyph, separated by dotted rules, ending in a `+N개 더보기` expander bar. Two cards (`먹튀검증`, `스포츠중계`) are empty-state cards reading `등록된 주소가 없습니다.` — a genuinely useful empty-state variant to reconstruct.

**Footer:** simple, single-column, centered — logo chip, one Korean disclaimer sentence, and `© 2026 호빵넷 · hobbang01.com`. At 390 the disclaimer wraps to two lines; otherwise identical.

**Image-vs-text ratio:** text-dominant. 112 `<img>` but the great majority are ~16 px rank badges and category icons; the only substantial rasters are the four ad banners and the mascot. Total page weight is 325 KB.

**Korean text density:** very high and effectively pure — `text.chars: 1109`, `hangul: 589`, `latin: 83`, `kana: 0`, `han: 0`, `primary: ko`, `htmlLang: ko`. Note that `text.chars` counts the *visible* sample; the 442 anchors mean far more hangul exists in the DOM.

**Fonts — the one interesting trap:** `fontFace: 0`, `fontResources: 0`, `fontHosts: {}`, `webfontLinkHosts: []`, `documentFonts: 0`. **No webfont is downloaded at all.** Yet the dominant computed stack on 2,430 of 2,459 elements is `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", -apple-system, "system-ui", "Segoe UI", Roboto, sans-serif` — Pretendard is *requested but never served*, so every hangul glyph on the page resolves to whatever Korean system face the rendering host happens to have. A second stack, bare `Times`, applies to 29 elements. This is a pure host-dependent-fallback-metrics case with zero font licensing to resolve.

## Estimated reconstruction difficulty (1 very easy … 5 very hard)

**Difficulty: 2 (easy, with two named traps).**

Everything web-recon is known to do *well* is what this page is made of: static CSS grid + flex (392 grid / 510 flex containers), plain `<img>` and text, desktop-first `max-width` media queries, one same-origin readable stylesheet of 142 rules, server-rendered HTML with no hydration. Everything web-recon is known to do *badly* is absent: **no carousel/swiper/slick, no autoplaying video, no canvas/WebGL, no Shadow DOM, no custom elements, no iframes, no client-side routing, no JS-driven layout, no downloadable webfont, no keyframe animation, no `@container`, no `@supports`, no frozen `min-width`.** There is not a single flagged-hard construct in the record.

The two things that keep this off a 1:

1. **111 lazy images, only 34 fetched during observation.** The capture must force-load below-the-fold images or the reconstruction bakes ~78 empty slots. Task 22's asset pipeline (278/278 fetched) is the relevant machinery; this exercises it on a lazy-heavy page.
2. **~366 anchors hidden behind `+N개 더보기` collapse.** 442 anchors in the DOM vs ~76 visible rows means the collapsed entries are present-but-hidden. Web-recon takes one observation per viewport, so it captures the collapsed state; whether the hidden nodes are faithfully carried (and their `hiddenRanges` classified correctly) is precisely the 28.5C surface. This is a *test*, not a blocker — but it is the piece most likely to produce a parity delta.

A third, milder factor: 2,459 DOM elements is mid-to-high for the set, but the structure is 12 near-identical cards of near-identical rows, so slot/binding extraction should compress well rather than sprawl.

## Potential unique test value

What this proves that `linear.app` and `stripe.com` could not:

1. **Hangul text metrics with a system-fallback-only stack.** 589 hangul chars, `lang="ko"`, and a Pretendard-first stack with **zero** downloaded font files. Stripe and Linear are Latin sites with real webfonts; this is the first case where hangul metrics are decided entirely by host font resolution, with no license question attached. It directly stresses the "measured fallback cost" path from Task 22 in the writing system where fallback substitution hurts most.
2. **A no-framework, no-builder, server-rendered page.** Every prior pilot (Stripe, Linear) and most of this candidate set are React/Next/jQuery/gnuboard/Wix. This is hand-rolled HTML+CSS with 4 KB of JS — a baseline that separates "web-recon reconstructs the page" from "web-recon reconstructs the framework's output."
3. **A CORS-clean responsive surface.** 1 sheet, readable, 0 blocked, 4 explicit breakpoints, 0 keyframes, 0 container queries. This is the control condition for the 28.5C/28.5D responsive work: any residual breakpoint/hiddenRanges error observed here cannot be blamed on unreadable CSS.
4. **Directory/link-list density instead of marketing prose.** 442 anchors, 12 repeated card modules, count pills, rank badges, dotted-rule list rows, and two genuine `등록된 주소가 없습니다.` empty-state cards. Stripe and Linear are hero-and-feature marketing pages; this is a high-cardinality repeated-record grid, and the empty-state variants test that content injection does not hallucinate rows into empty containers.
5. **Lazy-loading at scale.** 111 of 112 images lazy — a much harsher asset-independence test than either prior pilot.
6. **Korean-language SEO surface.** ko `description`/`keywords`/`ogTitle`/`ogSiteName`, `robots: index, follow`, canonical, and a declared sitemap — exercises the Task 21 SEO snapshot/plan path on non-Latin metadata.
7. **A real 4-col → 2-col grid reflow across 4 desktop-first breakpoints**, verified visually rather than only in CSS.

Two things it does *not* add: no IDN punycode host (that is `xn--9l4b19k46k.com` / `xn--ok0b408a79cba430b.net`), no http-only origin, no table-based layout (`tables: 0`), and no board/CMS-generated markup (that is `yugiyu4.com` / `seoultone.kr`, both gnuboard).

## Risks

**Technical**

- **Volatility.** The site's entire purpose is `최신 주소` — rotating replacement addresses. `last-modified` was ~18 h before the scout and `cf-cache-status: DYNAMIC`. Link labels, counts (`463개`), and the four ad banners will differ between capture and any later re-capture, so cross-run byte parity will drift for reasons unrelated to web-recon.
- **Single route.** `sameHostUniqueUrls: 1`, `samplePaths: ["/"]`. All 442 anchors are either the 12 in-page hash anchors or outbound to 412 external hosts. No multi-page family test is possible from what the scout recorded.
- **Lazy images.** 78 of 112 images never loaded during observation; capture must force-load or the artifact bakes blanks.
- **Hidden collapsed content.** ~366 anchors sit behind `+N개 더보기` in a collapsed state; a single observation freezes that state and the expanded layout goes untested.
- **Font fallback drift.** Pretendard is named but never delivered; hangul metrics depend entirely on the rendering host's installed Korean face. Reconstruction on a different host will shift line breaks in the dense link rows.
- **Cloudflare fronting.** No challenge on this run and `waf: null`, but a repeat high-volume capture behind Cloudflare can escalate.
- **Third-party ad creative.** Four banner images are supplied gambling-advertiser creative; a reconstruction reproduces them verbatim as baked assets.
- **Mirror-domain pattern.** `hobbang01.com` and `hobbang.net` are both in this candidate set under near-identical branding, which is characteristic of rotating mirror hosts. The specific host may not persist.

**Content and governance flags recorded by the scout (stated as recorded)**

- `contentFlags: ["adult", "piracy", "link-aggregator", "webtoon", "gambling"]` — all five categories fire, the maximum in the 12-site set (tied with `jusohot4.com` and `yugiyu4.com`).
- Title/meta hits: `성인`×1; `토렌트`×1, `다시보기`×1; `주소모음`×2, `링크모음`×2, `최신주소`×1, `주소찾기`×1, `사이트주소`×1, `최신 주소`×2; `웹툰`×1.
- Body-text hits: adult — `성인`×5, `오피`×5, `성인용품`×3, `유흥`×2, `야동`×1, `키스방`×1; gambling — `카지노`×3, `토토`×2, `먹튀`×2, `먹튀검증`×2; piracy — `토렌트`×11, `다시보기`×2, plus named services `누누티비`, `뉴토끼`, `블랙툰`, `티비착`; link-aggregator — `링크모음`×1, `최신 주소`×2; webtoon — `웹툰`×2.
- The page links out to **412 distinct external hosts**, and a reconstruction reproduces those outbound targets.
- `robots.txt` sets `Disallow: /` for `ClaudeBot` and `CloudflareBrowserRenderingCrawler` (among nine named agents) and carries `Content-Signal: ai-train=no, use=reference` on the star group, while `Allow: /` remains for `*`. The scout ran with a normal browser profile and was not blocked; whether a pilot capture proceeds under those named-agent directives is an operator decision, and it should be an explicit one.

## Suggested secondary route

**None available.** The scout recorded `links.sameHostUniqueUrls: 1` and `samplePaths: ["/"]` — every one of the 442 anchors is either an in-page hash target (12) or points at one of 412 external hosts. There is no second same-host page in the record to choose from, and the site presents as a genuine single-page directory. The only other same-host URLs observed are non-page resources (`/robots.txt`, `/css/style.css?v=12`) plus the `sitemap.xml` declared in robots.txt, which the scout did not fetch. If a second route is required for the pilot, `https://hobbang01.com/sitemap.xml` would first have to be read to discover whether any subpage exists at all — treat that as an unverified follow-up, not a recommendation.

## Recommendation

**SELECT / BACKUP / REJECT: `BACKUP`** — **DIFFICULTY: 2** — **PILOT_VALUE: 4**

On engineering merit alone this is the best-behaved target of the twelve and would be a straightforward SELECT: reachable with a clean 200, no redirect, TLS 1.3, no challenge, zero failed requests, and a construct profile that is almost a checklist of what web-recon handles well — one same-origin CORS-readable stylesheet of 142 rules, 4 desktop-first breakpoints, 392 grid and 510 flex containers, and zero of the known-hard constructs (no carousel, video, canvas, Shadow DOM, iframe, client-side routing, JS-driven layout, or downloadable webfont). Its 390 view is a verified real reflow (4-col → 2-col cards, wrapped nav, label-dropping social strip, no horizontal overflow, no frozen `min-width`), which makes it an unusually clean control for the unfinished 28.5D responsive work — any breakpoint or `hiddenRanges` error found here cannot be blamed on unreadable CSS, and that is worth a lot right now. It would also add four things the Stripe and Linear pilots never covered: dense hangul with a system-fallback-only font stack, a genuinely framework-free server-rendered document, high-cardinality repeated link-record grids with real empty-state cards, and 111 lazy images. It is held at BACKUP rather than SELECT for two recorded, non-technical reasons that an operator should decide on rather than have decided for them: all five content flags fire (adult, piracy, link-aggregator, webtoon, gambling — the maximum in the set), and the reconstruction would be a working copy of a link directory pointing at 412 external hosts; and the site's own `robots.txt` carries `Disallow: /` for `ClaudeBot` alongside `ai-train=no`, even though the star group allows the homepage and the scout itself was never blocked. Every other `directory` candidate carries the same or worse flag load, so if the pilot must cover the directory category, hobbang01.com is the right pick within it — promote to SELECT the moment the operator accepts those two flags; otherwise prefer a flag-free candidate from the medical group and keep this one as the responsive-control fallback.
