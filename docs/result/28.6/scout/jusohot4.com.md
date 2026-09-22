# jusohot4.com scout report

- Candidate: `https://jusohot4.com/` — category `directory`
- Measurement record: `tmp/wr286/scout/jusohot4.com.json` (scouted 2026-09-01T20:26:09Z, attempt 1, 0 errors)
- Screenshots: `tmp/wr286/scout/shots/jusohot4.com-1440.png` (573 KB), `tmp/wr286/scout/shots/jusohot4.com-390.png` (805 KB) — both present, both fully rendered, neither blank
- Title: `주소핫 - 주소모음 링크모음 | 최신주소 사이트모음`, `<html lang="ko">`

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, no anti-bot friction at either viewport.

- HTTP status 200 at both 1440 and 390; `networkIdle` reached both times; elapsed 7.9 s desktop / 6.2 s mobile.
- Redirect chain is a single hop: `200 https://jusohot4.com/`. Final URL equals requested URL — no country gate, no age interstitial navigation, no login redirect (`redirectedToLogin: false`).
- TLS: proper HTTPS, TLS 1.3, issuer `WE1` (Google Trust Services), subject `jusohot4.com`, valid through the scout date. Plain-HTTP probe returns `301 → https://jusohot4.com/`, so the origin is https-canonical. `ignoreHTTPSErrors` was **false** and it still succeeded, so no certificate workaround is needed. Mixed content: 0.
- Challenge/anti-bot: `challenge.detected: false`, `signals: []`. CDN is Cloudflare (`server: cloudflare`, `cf-ray` present, `cf-cache-status: DYNAMIC`), no WAF interstitial. Response is `cache-control: no-store, max-age=0` — the page is served dynamic-uncached, so re-captures are cheap but never identical (see the live clock under Visual complexity).
- Network: 70 requests, **0 failed**, 580,041 bytes total, across 4 hosts (`jusohot4.com` 49, `fonts.gstatic.com` 19, `fonts.googleapis.com` 1, `static.cloudflareinsights.com` 1). One 404 on desktop, two on mobile; 1–2 console errors, 0 page errors, 0 popups, 0 dialogs.
- robots.txt: present (200, 1,902 bytes). The `*` group is `Allow: /` with `Content-Signal: search=yes,ai-train=no,use=reference`, so the homepage is **not** disallowed for a generic agent. A Cloudflare-managed block list then sets `Disallow: /` for nine named agents: Amazonbot, Applebot-Extended, Bytespider, CCBot, **ClaudeBot**, CloudflareBrowserRenderingCrawler, Google-Extended, GPTBot, meta-externalagent. The declared sitemap points at a *different* host (`https://jusohot1.com/sitemap.xml`), and `<link rel=canonical>` also points off-host to `https://jusohot1.com/` — this host is one numbered mirror of a rotating mirror family.

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software such as gnuboard, Wix, Cafe24, imweb)

- Framework detection: **react** only (evidence: `React global / reactroot / __reactFiber`). No jQuery, no swiper/slick, no gnuboard, no Wix/Cafe24/imweb, no Next.js, no `<meta name=generator>`.
- The asset naming (`/assets/index-54765b69.css` plus 4 first-party scripts, 0 inline scripts) is a Vite-style hashed production bundle. Two additional hand-maintained CSS files are layered on top with timestamp cache-busters: `jusohot4-layout.css?v=20260819T125918Z` and `jusohot4-mobile-portal-hide-20260831T073438Z.css`. That second filename says the operator patches a **mobile portal (dropdown/off-canvas) with a CSS override** — directly relevant to web-recon's known portal blind spot.
- It behaves as a **single-page, server-delivered document**, not a client-routed SPA: 117,540 bytes of HTML arrive on the first response, only one main-frame navigation is recorded, and the DOM element count is identical (1,106) at both viewports. React is present for interaction (mobile menu, clock) rather than for routing.
- No CMS/board markup anywhere: `forms: 0`, `inputs: 0`, `tables: 0`, `passwordInputs: 0`, `loginForms: 0`, `authDependency: none`. There are 6 elements matching the age/adult-gate heuristic, but they are the inline `19` badges in the category headers, not a blocking gate — the page renders fully without any click.
- Content is a hand-curated link directory: 129 anchors, **0 same-host links**, 113 distinct external hosts. There is no internal site graph at all.

## DOM/CSS/runtime complexity (the actual numbers: DOM elements, stylesheets, scripts, images, iframes, canvases, shadow roots, script bytes)

| Metric | Value |
| --- | --- |
| DOM elements | 1,106 (identical at 1440 and 390) |
| HTML bytes | 117,540 |
| Stylesheets | 7 total — 4 `<link>` + 3 `<style>`; 6 readable, 1 CORS-blocked |
| CSS rules readable | 1,488 |
| Scripts | 5, all external, **0 inline**, 174,320 bytes known across 4 of 5 |
| Images | 174 `<img>` elements (all first-party host), 121 inline `<svg>`, 0 `<picture>`, 0 CSS background images, 0 lazy, 54 `<img>` missing alt |
| Image network resources | 35 img requests of 49 total resources |
| iframes / embeds | **0 / 0** |
| video / audio | **0 / 0** |
| canvas / WebGL | **0 / false** |
| Shadow roots / custom elements | **0 / 0** |
| Layout primitives | 23 grid containers, 184 flex containers, 0 tables, 0 fixed-position elements |
| Overflow | `horizontalOverflow: false` at both widths; `body { min-width: 320px }` |
| Text | 1,208 chars — 617 hangul, 286 latin, 3 han, 0 kana; primary `ko` |
| Total transfer | 580 KB / 70 requests |

This is the **lightest runtime in the whole 12-candidate set**: 5 scripts and 174 KB of JS versus 34 scripts (9skin1), 49 (mystarskin), 58 (interiorteacher), 83 (xn--ok0b408a79cba430b). Every one of the four structures web-recon handles badly — iframe, canvas, shadow root, video — is at exactly zero. The DOM is mid-sized (1,106, comparable to interiorteacher's 1,107, far under interiorbay's 2,672).

The one non-trivial number is **121 inline SVGs**: every category header icon, every external-link glyph, the medal/rank badges, and the social row are inline vector markup rather than raster assets. Task 19.1 already shipped SVG text injection, so this is exercised territory, but 121 of them in one page is a heavier dose than the previous pilots.

## Responsive complexity (media rule counts incl. CORS-readable vs blocked vs fetched, breakpoints observed, and the 390-vs-1440 behaviour)

- **31 media rules readable** (16 with explicit min/max), 15 unique media queries, across 6 readable sheets. `mediaRules` for the fetched sheet: 0.
- **1 blocked sheet**, and it is only the Google Fonts CSS (`fonts.googleapis.com/css2?family=DM+Mono…&family=Noto+Sans+KR…`). The scout re-fetched it successfully (200, 572,578 bytes) and it contains **0 media rules, 0 keyframes, 748 `@font-face` rules, 0 imports**. So the CORS-blocked-CSS trap flagged in Task 28.5C as "top leverage" **does not bite here**: nothing responsive is hidden behind the block, and `mediaFetched: 0` confirms the fetch added no media rules. All 31 responsive rules are directly readable.
- Breakpoints observed: `max:430px`, `max:480px`, `max:600px`, `max:820px`, `max:860px`, `max:900px`, `min:40rem`, `min:48rem`, `min:64rem`, `min:80rem`, `min:96rem`. The `rem`-based `min:` set is a Tailwind-style scale from the bundle; the `max:px` set is the hand-written `jusohot4-layout.css` / `mobile-portal-hide.css` overrides. Two idioms coexist, plus 4 `@container` rules and 47 `@supports` blocks.
- `viewport` meta: `width=device-width, initial-scale=1.0, maximum-scale=1`.
- **390 vs 1440 is a genuine reflow, not a shrunk desktop.** Evidence I can see in the two images: at 1440 the category cards form a **4-column grid** (성인 / 웹툰사이트 / 토토·카지노 / 먹튀검증 on row 1, and so on for 15 cards); at 390 the same 15 cards are a **2-column grid** with a different pairing order (성인 + 웹툰사이트, then 토토·카지노 + 먹튀검증). The desktop's two-row horizontal category nav bar (15 labelled chips) is **replaced by a hamburger button** on mobile. The four banner ads sit 2-across in two rows at 1440 and 2-across-but-tiny in one row at 390. The social row (Google / Youtube / Naver / Band / Daum / Kakao / Instagram / Facebook) is 8-across at 1440 and is dropped entirely at 390. Supporting numbers: `docWidth: 390`, `innerWidth: 390`, `horizontalOverflow: false`, and `scrollHeight` grows 2,274 → 3,196 (+40 %), which is the signature of reflow rather than scaling.
- Note the asymmetry that matters for QA: the mobile document is **taller** than the desktop one, so a 5-width sweep will not be monotonic in height.

## Visual complexity (hero/slider/video/animation/font/canvas findings, with the screenshot evidence)

What I actually see at 1440: a thin top utility strip (telegram handle chip, 즐겨찾기, two yellow/green promo pills, and right-aligned 링크등록문의 / 배너문의 / 공지사항); a centered wordmark logo (주소핫 / JUSO HOT) beside a **live-updating clock** reading `2026년 9월 2일 수요일 05:26:20`; the 15-chip category nav on two rows; a telegram channel CTA bar and a 평생주소 bar side by side; the 8-tile social row; **four static raster banner ads** (kcasino, 유로스타, Bet38, and a self-promo 배너문의하기 banner); a section heading `주소핫 카테고리 / 최신 주소 · 링크모음` with the counter `15개 카테고리 · 503개 링크`; then the 4-column card grid of 15 category cards, each card a header row (inline SVG icon + Korean label + a hand glyph) over a **vertical list of ranked link rows** (gold/silver/bronze medal SVGs for 1–3, numbered circles for 4–10, an external-link arrow at the right of every row); and a light footer with the logo, `주소모음 · 링크모음 · 사이트모음`, and 문의하기 / 맨 위로 / 주소핫 2026.

- **No hero image, no slider, no carousel, no video, no canvas.** `video: 0`, `audio: 0`, `iframe: 0`, `canvas: 0`, `webgl: false`, `marquee: 0`, `willChange: 0`. This sidesteps web-recon's single-observation-per-viewport limitation entirely — there is no carousel to freeze at one slide.
- Animation: 14 `@keyframes` defined but **`animatedElements: 0`** at sample time and only 15 elements carrying transitions (hover affordances on the link rows / nav chips). Nothing is moving in the captured frame except the clock.
- Fonts: 2 distinct computed stacks — `"Noto Sans KR", "Malgun Gothic", sans-serif` on **1,078 of 1,106 elements**, and a Tailwind `ui-sans-serif, system-ui…` stack on the remaining 28. Document font families: `Noto Sans KR`, `DM Mono`. One webfont CSS resource pulling from `fonts.gstatic.com` (19 font-file requests), 748 `@font-face` declarations. Local `@font-face` count in first-party CSS: 0. **Hangul metrics are therefore entirely webfont-dependent**, which is the classic web-recon hard case — with the mitigating detail that the fallback (`Malgun Gothic`) is declared, so fallback cost is measurable rather than catastrophic.
- Image-vs-text ratio is unusual: only **1,208 characters of text** but 174 `<img>` + 121 inline SVG. The page is visually dense yet textually thin — most pixels are icons, medals, badges and four ad rasters. All 174 images are same-host (`hosts: {jusohot4.com: 174}`), so asset independence is a straight first-party copy with no third-party CDN fetching.
- The **live clock is the single biggest determinism hazard**: it renders a to-the-second Korean timestamp in the header, so any screenshot diff between capture and reconstruction will always show a delta in that region unless it is masked or content-injected.

## Estimated reconstruction difficulty

**2 / 5 (easy).**

Reasoning, tied to what the repo already knows it does well or badly:

- Every known hard structure is absent: 0 iframes, 0 canvas/WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 carousels/swiper/slick, 0 animated elements, no client-side routing, no auth. The Task 17 blind-spot list is essentially unhit.
- The layout is exactly the shape web-recon reconstructs well: 23 CSS grid containers + 184 flex containers of static cards, plain text and plain images, no JS-driven positioning, no fixed-position overlays (`fixedElements: 0`).
- CSS is small and fully legible: 1,488 readable rules, 31 media rules all readable, and the one CORS-blocked sheet is fonts-only with zero media rules — so the 28.5C responsive root cause (unreadable media rules forcing frozen px) is not triggered.
- All 174 images and both extra stylesheets are first-party; the only cross-origin dependency is Google Fonts, which the Task 22 asset/font pipeline already handles (with the license-needs-review caveat it always raises).
- What pushes it above a 1: (a) Korean webfont metrics — 1,078 elements depend on remote Noto Sans KR, and hangul line-breaking/advance widths are untested territory for this pipeline; (b) 121 inline SVGs to bind and, where they carry text, inject; (c) the mobile hamburger is a React **portal** whose closed state is all a single observation captures, and the operator's own `mobile-portal-hide` CSS override hints it is fiddly; (d) the live clock guarantees a permanent screenshot-diff delta; (e) two coexisting breakpoint idioms (rem-based bundle scale + px-based hand overrides) plus 4 `@container` rules mean the responsive merge has to reconcile mixed units.
- Nothing here suggests a multi-day fight. Compared with the rest of the set (interiorteacher 58 scripts/93 media rules/3 iframes, mystarskin swiper+slick+AOS+shadow root, xn--ok0b408a79cba430b Wix with 29 sheets/83 scripts), this is the cleanest technical target in the batch.

## Potential unique test value

Things this proves that linear.app and stripe.com could not:

1. **Hangul text metrics under a remote Korean webfont.** 617 hangul chars, 1,078 elements on `Noto Sans KR`, 748 `@font-face` rules, 19 gstatic font files, and a declared `Malgun Gothic` fallback. Both prior pilots were Latin-only; every content-injection and screenshot-diff threshold in the repo was tuned on Latin advance widths.
2. **A `lang="ko"` document end to end** — SEO snapshot, content injection, and brand-scan paths have never run against a Korean-primary page with a Korean title/description.
3. **Directory / link-list morphology**: 15 repeated card modules, each a ranked `<a>` list with medal-SVG + numbered-circle rank badges — a repetition pattern (503 links claimed, 129 anchors in the homepage DOM) unlike Linear's or Stripe's marketing sections.
4. **A zero-internal-link site.** `sameHostUniqueUrls: 0` — the release/route-graph machinery has only ever been exercised on 8-route (Linear) and multi-route (Stripe) sites. A legitimately single-route instance is an untested degenerate case for `src/release/graph.ts` and the plan/resolve flow.
5. **Inline-SVG-dominant iconography** at 121 instances with only 1,208 characters of text — an image/SVG-to-text ratio inverted from the prior pilots, which stresses slot binding on vector rather than text nodes.
6. **A React portal hamburger with an operator CSS kill-switch**, i.e. a real-world instance of the portal blind spot Task 17/18 fixed synthetically.
7. **Runtime non-determinism in a visible header** (the live Korean date/time string) — a clean, small test case for whether QA screenshot diff can be told to ignore a live region.
8. **A 4-col → 2-col reflow driven by mixed rem/px breakpoints plus `@container`**, at a document that gets *taller* on mobile — a useful counterexample to the responsive assumptions from 28.5C.

What it does **not** add: no table-based layout, no gnuboard/board-generated markup (yugiyu4.com and seoultone.kr cover that), no http-only origin (this is https-canonical), no IDN punycode host (the two `xn--` candidates cover that), and no multi-route crawl.

## Risks

Technical:

- **Live clock in the header** → guaranteed non-zero screenshot diff on every QA run unless masked. Also `cache-control: no-store`, so no two captures are byte-identical.
- **Remote-only Korean webfont.** No local `@font-face`; if Noto Sans KR is not vendored, hangul metrics shift and the whole 1,078-element body reflows. Expect the Task 22 "license-needs-review" flag on Google Fonts again.
- **Mobile menu is a portal** captured only in its closed state; the operator ships a `mobile-portal-hide` override, so the open state is likely to differ from what any static reconstruction infers.
- **54 `<img>` without alt** → accessibility/SEO deltas and weaker text anchors for content injection.
- **Off-host canonical and sitemap** (`jusohot1.com`) — SEO snapshot will record a canonical pointing at a different host, and the sitemap is unreachable from this host's own tree. Any production bake must decide what canonical to emit rather than copying this one.
- **Mirror-host volatility.** The `jusohot1/4` numbering plus a "평생주소" (permanent address) banner indicate a rotating-mirror operation; this exact host may not resolve on a later re-run, so a pilot depending on re-capture is fragile.
- **113 external hosts / 129 outbound links.** `src/release/brand-scan.ts` will surface a very large external-brand surface, and content injection would have to replace essentially all anchor targets and 4 banner rasters.
- Minor: 1 desktop / 2 mobile 404s and 1–2 console errors in the recorded run; 8 same-page anchors are hash-only (4 recorded), so no internal navigation to verify.

Content flags recorded by the scout (stated as measured, from `contentFlags`):

- `link-aggregator` — title/meta hits: 주소모음 ×2, 링크모음 ×2, 최신주소 ×1.
- `adult` — body hits: 성인 ×13, 오피 ×5, 성인용품 ×3, 성인방송 ×2, 유흥 ×2, 야동 ×1, 키스방 ×1, av ×1.
- `gambling` — 카지노 ×3, 토토 ×2, 먹튀 ×2, 먹튀검증 ×2.
- `piracy` — 토렌트 ×11, 다시보기 ×2, plus named services 누누티비 / 뉴토끼 / 블랙툰 / 티비착.
- `webtoon` — 웹툰 ×2.

This is the **broadest flag set in the batch (5 of 5 categories)**; the four visible banner ads are gambling-operator creatives, and several category cards are adult. Anything shipped downstream — the review pack images, the QA diff pack, the content-injection canary — will contain that material. Separately, the site's robots.txt explicitly sets `Disallow: /` for ClaudeBot/GPTBot/CCBot and declares `ai-train=no`; the `*` group still allows the homepage, but the operator's stated preference against AI ingestion is on record and should be weighed before selecting this host as a pilot subject.

## Suggested secondary route

**None available from the recorded data.** The scout recorded `sameHostUniqueUrls: 0`, `sameHostUniquePaths: 0`, and an empty `samplePaths` array: of 129 anchors, 4 are hash-only and the rest point at 113 external hosts (t.me, mimitv2.com, kcasino1.com, and so on). The header items that look internal (링크등록문의 / 배너문의 / 공지사항) did not resolve to same-host URLs in the capture, and the only structural pointers the page offers — `canonical` and the robots `Sitemap` — both target `jusohot1.com`, a different host and therefore out of scope for a same-host secondary route. If a second route is required for this candidate, it would have to be discovered by a fresh crawl rather than picked from this record; on the present evidence this is a genuine single-page site and should be piloted as a one-route instance.

## Recommendation

**BACKUP — DIFFICULTY 2 / 5 — PILOT_VALUE 3 / 5.**

Technically this is the most cooperative target in the twelve: 200 at both viewports with no challenge and no TLS workaround, one-hop redirect, 0 failed requests, and a runtime that is zero on every structure web-recon is known to lose (iframe, canvas, shadow DOM, video, carousel, client routing). Its CSS is fully readable, its single CORS-blocked sheet is fonts-only with no hidden media rules — so the 28.5C responsive trap does not fire — and the 390 view is a real reflow (4-column card grid → 2-column, nav bar → hamburger, social row dropped, scrollHeight 2,274 → 3,196) rather than a shrunk desktop, which makes it a clean responsive test. Its genuinely new contribution is Korean: 617 hangul characters, `lang="ko"`, and 1,078 elements bound to remote Noto Sans KR with a declared Malgun Gothic fallback — hangul advance widths and line breaking are untested in this pipeline, and that alone is worth a run. It is held back from SELECT by three concrete facts, not by taste: the site exposes zero same-host links, so it cannot exercise the route graph or the release plan/resolve flow beyond a single page; it is one numbered host in a rotating mirror family with an off-host canonical and sitemap, so re-capture stability is not guaranteed; and it carries all five scout content flags with gambling-operator banner creatives that will propagate into every review and QA image pack, while its robots.txt sets `Disallow: /` for ClaudeBot/GPTBot/CCBot and declares `ai-train=no` even though the `*` group allows the homepage. Keep it as the designated backup and as the dedicated hangul-metrics probe; prefer a multi-route, unflagged candidate for the headline pilot.
