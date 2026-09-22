# mystarskin.co.kr scout report

> Source record: `tmp/wr286/scout/mystarskin.co.kr.json` (scouted 2026-09-01T20:25:47Z, attempt 1, 0 errors)
> Screenshots: `tmp/wr286/scout/shots/mystarskin.co.kr-1440.png` (1440x6157), `tmp/wr286/scout/shots/mystarskin.co.kr-390.png` (780x11222 @ dpr2 = 390x5611 CSS)
> Site: 연세스타피부과 강남본점 (Yonsei Star Dermatology, Gangnam) — category `medical`

## Accessibility

| Field | Value |
|---|---|
| Reachable | **yes**, both viewports, first attempt |
| HTTP status | 200 (desktop), 200 (mobile) |
| TLS verdict | `https` — TLS 1.2, issuer `YR1`, subject `mystarskin.co.kr`, valid to 2026-11-19 (epoch 1795534854) |
| `ignoreHTTPSErrors` needed | no (`false` and still clean) |
| Desktop redirect chain | none — `200 https://www.mystarskin.co.kr/` direct |
| http:// probe | `302 → https://www.mystarskin.co.kr` (proper upgrade) |
| Challenge / anti-bot | **none detected** — `challenge.detected=false`, `signals=[]`, `cdn=nginx`, `waf=null` |
| Popups / dialogs | 0 / 0 |
| Page errors | 0 desktop, 1 mobile; console errors 33 / 38 (mostly the dead font + blocked-ad requests below) |

**robots.txt**: present, 200, `text/plain`, 443 bytes. `User-agent: *` → `Allow: /` with four disallows (`/medis/`, `/xmldata/`, `/lib/`, `/counsel/`) — homepage and every candidate route are allowed. Six AI-agent groups are named explicitly and **all allowed with `Crawl-delay: 10`**: `GPTBot`, **`ClaudeBot`**, `Google-Extended`, `PerplexityBot`, `Applebot-Extended`, `YouBot`. Sitemap declared at `https://mystarskin.co.kr/sitemap.xml`. This is the most explicitly agent-friendly robots.txt in the 12-candidate set; nothing in it blocks a pilot.

**The one accessibility wrinkle** is the mobile lane. The 390 request does not land on the requested URL:

```
https://www.mystarskin.co.kr/            302
http://www.mystarskin.co.kr/index.php/menu_gb/MB0   302   <-- plaintext http hop
https://www.mystarskin.co.kr/index.php/menu_gb/MB0  200
```

A UA-sniffing server-side redirect sends mobile clients to a different document, and it does so via an **http:// intermediate hop** (a scheme downgrade inside the redirect chain, separate from the 11–12 mixed-content subresources). Reachable, but the two viewports are not the same page.

## Architecture impression

**Server-rendered PHP, not an SPA.** Every route is a CodeIgniter-style segmented `index.php` path:

- content pages: `/index.php/html/11`, `/html/17`, `/html/21`, `/html/26`, `/html/133`, `/html/17/140` …
- boards: `/index.php/board/list/rnd/13`, `/board/list/equipment/14`, `/board/list/media/15`, `/board/list/online/119`, and a real row at `/index.php/board/view/equipment/14/451611/cpage/1`
- membership: `/index.php/login/loginform/46`, `/index.php/member/insert_step1/48`
- mobile split: `/index.php/menu_gb/MB0`

This is **not gnuboard** (no `/bbs/board.php`), not Wix, not Cafe24, not imweb, and `meta[generator]` is null. It reads as a **bespoke Korean medical-clinic CMS from an agency vendor** — numeric page IDs, named board slugs, a `menu_gb` (메뉴 구분) mobile-version switch, and the `/medis/` + `/xmldata/` directories robots.txt hides. `Cache-Control: no-store, no-cache, must-revalidate` on HTML confirms dynamic PHP output. Server is `nginx`, no CDN in front.

**The `react` detection is a false positive for the site itself.** Evidence string is `React global / reactroot / __reactFiber`, and it arrives alongside `channel.io` (ChannelIO), `shadowRoots: 1`, and an emotion/styled-components-generated keyframe name `dIKmRx` in the animation list. That is the Channel Talk chat widget's own React bundle in its own shadow root — the clinic page is jQuery **1.10.2** (2013-era) plus jQuery UI 1.10.4. There is no client-side routing: `net.navigations` is a single entry per viewport.

Other detected libraries: **swiper** (two CDN copies, v10 *and* v11 both loaded), **slick** (+ `slick.css`, `slick-theme.css`), **AOS** (`data-aos`), plus analytics/marketing weight — GTM/GA, Naver `wcs`, AceCounter, DoubleClick, Kakao/Daum (postcode + maps), Channel.io.

## DOM/CSS/runtime complexity

| Metric | Desktop 1440 | Mobile 390 |
|---|---|---|
| DOM elements | **1,060** | **585** (different document) |
| HTML bytes | 81,888 | 49,628 |
| scrollHeight | 6,157 | 5,611 |
| Stylesheets | 7 (`link` 6 + `style` 1) | — |
| Scripts | **49** total (26 external, 23 inline) | — |
| Script bytes | 253,868 known (15 of 26 measured) + 14,792 inline | — |
| Images | **95 `<img>`** (49 without alt) + 47 CSS-background elements over 17 unique URLs; `svgInline` 0, `<picture>` 0, `loading=lazy` 0 | — |
| iframes | **1** (src `""` — an empty utility/form-target frame, not embedded content) | — |
| canvas / WebGL | **0 / false** | — |
| shadow roots | **1** (Channel.io widget) | — |
| custom elements | 0 | — |
| Network | 174 requests, 158 responses (150×200, 6×204, 2×404), 21 failed, **contentLengthSum 7,155,793 B** | 159 req / 140 resp, 24 failed, 6,078,513 B |
| Mixed content | **11** http:// subresources | 12 |

CSS detail: **7 sheets, 5 CORS-readable, 2 blocked** (`cdn.jsdelivr.net/npm/swiper@11` and `@10` bundles). Both blocked sheets were fetched successfully by the scout (200, 18,454 B and 18,451 B). Readable rules **794**. `keyframes` 4 readable + 1 each in the two fetched swiper bundles = 6. `@font-face` 12 readable + 2 fetched = 14. `@supports` 0, `@container` 0.

**Layout hints are the standout number**: `gridContainers: 0`, `flexContainers: 2`, `tables: 0`, `fixedElements: 16`, `forms: 2`, `inputs: 13`, `horizontalOverflow: false`, no `min-width` on html/body. A 1,060-element, 6,157px page built with **essentially zero flex and zero grid** — this is float/inline-block/absolute legacy CSS. linear.app and stripe.com are the opposite regime.

Failed requests are dominated by a **dead webfont origin**: every `https://fonts.gstatic.com/ea/notosanskr/v2/NotoSansKR-*.woff2|woff` returns `net::ERR_FAILED` (the Google Early Access Korean endpoint is retired). The live site is *already* rendering hangul in a fallback face. Remaining failures are ad/measurement beacons (`google.com/ccm/collect`, `ad.doubleclick.net`, `rmkt/collect`) and one hard mixed-content block: `http://dmaps.daum.net/map_js_init/postcode.v2.js`.

## Responsive complexity

**There is effectively no responsive CSS.**

| Signal | Value |
|---|---|
| `mediaRules` (readable sheets) | **1** |
| `mediaMinMax` (readable) | **0** |
| `uniqueMediaQueries` | 1 |
| `breakpoints[]` | **`[]` — empty** |
| Media rules in the 2 CORS-blocked sheets, after fetch | 0 media, 2 min/max each (swiper's own internals) |
| Fetch failures | 0 (both blocked sheets recovered) |

So the CORS trap that cost 28.5C so much (`cssRules` throwing on load-bearing sheets) **is present here but harmless**: the only blocked sheets are the two vendor swiper bundles, they fetch cleanly, and they carry no site breakpoints. The site's own five sheets are readable and contain one media rule and zero min/max breakpoints.

Responsiveness is instead achieved **server-side**: the UA sniff at `/` rewrites mobile clients to `/index.php/menu_gb/MB0`, a hand-authored mobile document with **585 elements against the desktop's 1,060** and a different HTML payload (49.6 KB vs 81.9 KB).

**What the screenshots show at 390 vs 1440**: the 390 capture is a **real mobile layout, genuinely reflowed — but it is a different document, not a reflow of the desktop one.** Concretely, at 1440 the header is a full horizontal nav bar (9 Korean menu items + 로그인/회원가입 buttons + a hamburger at far right) and the footer is a two-column split (contact/hours block on the left, 빠른비용상담 form on the right, divided by a vertical rule). At 390 the header collapses to logo + hamburger only, and the same footer content stacks into one column — form first (이름 / 연락처 / 상담분야 / 개인정보 checkbox / blue 빠른전화상담신청 button), then contact block, then the legal/business-registration lines centred. Type is re-sized, not scaled: the mobile hero headline wraps "세상의 모든 피부 / 과 함께합니다." across two lines at a font size chosen for 390, and `mobileMetrics` confirms `docWidth: 390`, `innerWidth: 390`, `horizontalOverflow: false`. Viewport meta is `width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=yes` — zoom is pinned.

The consequence for web-recon is sharp: **the 1440 and 390 observations are of two unrelated DOM trees.** Any per-viewport merge that assumes one source tree observed at two widths has no valid node correspondence here. This site cannot exercise the `hiddenRanges()` / breakpoint-inference engine at all — there are no breakpoints to infer — and it would instead stress a code path (two-document reconciliation) that the responsive engine does not currently model.

## Visual complexity

I looked at both PNGs (sliced into strips; neither is missing, neither is a zero-byte or all-blank file). What is actually on screen:

**Desktop 1440x6157 — approximately 4,000px of the 6,157px full-page capture is blank white.** Only the top ~500px and the bottom ~350px carry paint. This is not a corrupt screenshot: the scout *does* run a scroll pass (`scrollPass`, `scout.mjs:354-360`) and then returns to `window.scrollTo(0, 0)` before shooting. The page uses **AOS in re-hide mode** (`once:false`/`mirror`), so every `data-aos` element that scrolled out of view had its reveal class stripped again and shot at `opacity: 0`. Corroborating numbers: `animatedElements: 23`, `transitionElements: 41`, animation names `fadeup`, `fadeleft`, `faderight`, `downicon`, and `flow1`…`flow14`. Tiles 2, 3 and 4 of 6 are pure white; tile 1 shows only ghost-grey remnants of a "mentoring" wordmark and a mid-grey block mid-fade.

**This matters directly for the pilot**: `src/observer/layout-probe.ts:61` ends `autoScrollPrepare` with the same `window.scrollTo(0, 0)`. web-recon's own observation would capture the majority of this page's content at `opacity: 0` exactly as the scout did — and screenshot-diff QA would then compare blank against blank and score it a pass.

**Hero (desktop)**: a full-bleed **split** — left half a photograph of a seated doctor in a white coat at a desk (awards/plaques and a bust behind), right half a solid corporate-blue panel carrying the 보건복지부 지정 그린처방의원 badge line, the headline 「세상의 모든 피부 / 고민과 함께합니다.」 and a four-line Korean paragraph. Whether the hero itself rotates is not directly visible, but **both slick and swiper are loaded** and the page carries the `slick` and `swiper-icons` icon fonts, so at least one carousel exists and is frozen at one slide in any single observation.

**A modal popup layer occludes the hero in both captures.** A white card sits over the left half of the desktop hero (STARSKIN logo, a ribbon heading 「연세스타피부과 강남 여드름흉터 치료」, a numbered 6-item treatment list, a 자세히 보러가기 button), with an `X` close control at top and a 「오늘 하루 안보기」 (hide-for-today) bar beneath it, and **a row of ~7 pagination dots below that** — the popup is itself a dot-paginated multi-banner carousel. On mobile the same card is even more dominant, filling the top ~55% of the first screen and the dots overlap the 보건복지부 line behind it. Any reconstruction from this observation bakes the popup, at one banner, into the page.

**Fixed chrome**: a right-edge vertical rail of six labelled icon buttons (언론보도 / 카톡상담 / 네이버예약 / 커뮤니티 / 오시는 길 / Q&A), a left-edge rail of three social chips (Instagram / blog / YouTube), a Channel.io chat bubble bottom-right with an open speech-bubble prompt (「안녕하세요? 어떤 피부 고민이 있으신가요?」), and on mobile a round black **TOP** button. `fixedElements: 16` accounts for these.

**Body sections** (recoverable from the text sample and the surviving mobile fragments, not from the desktop paint): roughly 7–8 bands — hero, a 상담센터/진료안내 CTA band, a 피부과전문의 1:1 멘토링 band (a photo of a hand pointing at a skin cross-section model survives in the mobile capture), a **STAR SKIN** program section listing six treatment programmes (여드름흉터 / 화상흉터 / 문신제거 / 여드름 / 튼살 / 색소치료), a 「전국 의사 중 오직 2%」 credentials band, a 의료진소개 doctor section with named physicians (김영구 대표원장, 박기호 원장) each with a 상담 button, a 숫자로 stats band, and a media band. **Ten `img.youtube.com` thumbnails** are loaded over plain `http://`, so there is a YouTube video-card grid — but `media.video` is **0** and `canvas` is **0**: no `<video>`, no autoplay, no WebGL anywhere.

**Footer**: dark charcoal, two-column at 1440 (phone 02.582.0828 / KakaoTalk chip / 진료시간 table-like rows on the left; 빠른비용상담 form with 이름, 연락처, a 상담분야 `<select>`, a consent checkbox and a blue CTA on the right), stacked single-column at 390, with policy links and 대표자/사업자등록번호 lines below.

**Image-vs-text ratio is extreme.** 95 `<img>` + 47 CSS-background elements + 6.7 MB of transferred bytes against **1,349 total text characters (888 hangul, 14 latin)** on a 6,157px page. Nearly all Korean marketing copy is baked into raster images — the classic Korean clinic-site pattern — and 49 of 95 images carry no `alt`.

**Fonts**: 5 distinct computed stacks, dominated by `"Noto Sans KR", sans-serif` on **978 elements** (plus `"Noto Sans KR"` bare on 20, `Times` on 53, `Arial` on 8, `GmarketSansMedium` on 1). 14 declared families include the whole Nanum set (NanumGothic/Bold, NanumMyeongjo, NanumSquare L/B/EB, NanumSquareRound L/R/B/EB) plus the `slick` and `swiper-icons` icon fonts. 16 font resources requested from `fonts.googleapis.com`/`fonts.gstatic.com` — **and every Noto Sans KR file 404s/ERR_FAILEDs**, so hangul is already rendering in a fallback on the live site. Hangul metrics under a *broken* primary webfont is a genuinely different font problem from linear/stripe's latin-only, working-webfont case.

## Estimated reconstruction difficulty

**4 / 5 (hard).**

Arguments for *easier* than 4:
- No canvas, no WebGL, no `<video>`, no autoplay, no client-side routing, no `@container`, no custom elements. One shadow root and it belongs to a third-party widget that can be excluded.
- The only CORS-blocked sheets are vendor swiper bundles and they fetch cleanly — the 28.5C CORS trap does not bite here.
- Server-rendered HTML, one navigation per viewport, no auth wall on the homepage.
- Content is overwhelmingly raster images, and web-recon's asset-independence lane (Task 22, 278/278 fetched) handles plain `<img>` and CSS backgrounds well.

Arguments that push it to 4:
1. **AOS in re-hide mode.** Most of the page is observed at `opacity: 0` because the observer, like the scout, ends its scroll pass back at scroll-top. This is a silent failure: the reconstruction ships an apparently-complete DOM that paints blank, and screenshot-diff QA passes it because source and rebuild are blank together. Fixing this means changing observation strategy, not reconstruction.
2. **A modal popup carousel occluding the hero in every observation.** Whatever is captured, the popup is baked in at one banner; the underlying hero is never seen unoccluded.
3. **Two carousel libraries (slick + swiper, and swiper at two major versions).** Single observation per viewport → one frozen slide, dots frozen at one active index, and the popup's own dot carousel on top of that.
4. **Mobile is a different document at a different URL.** The 390 lane cannot be reconciled against the 1440 lane node-for-node. Either the pilot runs two independent single-viewport reconstructions, or the responsive merge produces nonsense.
5. **Zero grid, two flex containers, 1,060 elements.** Layout inference tuned on modern flex/grid sites has to fall back to frozen resolved px on a float/absolute legacy layout — precisely the failure mode 28.5C named ("desktop subtree frozen at 1440-resolved px").
6. **Broken primary webfont plus 14 declared families.** Hangul line-breaking and text metrics under a fallback face, with `maximum-scale=1.0`, will not match naively.
7. **11–12 mixed-content subresources and an http:// hop inside the mobile redirect chain**, so a straight fetch of every asset produces failures that must be classified as *source-side* rather than recon-side.

Not a 5: nothing here is architecturally unreachable (no canvas/WebGL/SPA/iframe-embedded content). It is hard in an accumulation-of-traps way, not an impossible-primitive way.

## Potential unique test value

Things this site would exercise that **linear.app and stripe.com never did**:

1. **Hangul text metrics with a dead primary webfont.** 888 hangul characters, 978 elements on `Noto Sans KR`, and every Noto Sans KR file failing to load. Tests fallback-metric handling in a way latin-only, working-webfont pilots cannot.
2. **A 14-family Korean font declaration set** (Nanum Gothic/Myeongjo/Square/SquareRound + two icon fonts) against 5 actually-computed stacks — a much noisier `@font-face` surface than either control site.
3. **Legacy non-flex, non-grid layout.** `gridContainers: 0`, `flexContainers: 2` over 1,060 elements. Both controls are modern flex/grid; nothing in the corpus has yet tested layout inference against float/inline-block/absolute CSS.
4. **Server-side mobile split (UA-sniffed separate document).** A structurally different responsive strategy from anything in the corpus — and a direct probe of whether the pipeline detects that the two viewports are not the same page rather than silently merging them.
5. **AOS scroll-reveal with re-hide** — a first-class observation-strategy test. This is arguably the single most valuable thing the site proves, and it proves a *bug in our capture*, not in our reconstruction.
6. **Modal popup / "hide for today" overlay layer** occluding the hero. Neither control has a page-load interstitial.
7. **Two carousel libraries loaded simultaneously**, one of them (swiper) at two major versions, plus a dot-paginated popup carousel.
8. **Korean CMS-generated `index.php/...` routing** with board list/view pages — genuinely CMS-shaped markup, board pagination, member/login routes.
9. **Image-baked marketing copy**: 95 images / 6.7 MB against 1,349 text characters. A hard limit case for the content-injection lane — there is almost nothing textual to inject, so it tests whether the pipeline reports that honestly rather than inventing bindings.
10. **Mixed content and an http:// redirect hop** — asset-independence under a source that is itself partly insecure.
11. **A third-party React-in-shadow-DOM widget (Channel.io)** embedded in an otherwise jQuery-1.10 page — tests shadow-root exclusion without needing the whole site to be shadow-DOM.

What it does **not** test: the responsive breakpoint engine. `breakpoints: []`, `mediaMinMax: 0`. For the 28.6 A-lane (`hiddenRanges()` / midpoint bands / probe-gap interpolation) this site contributes nothing.

## Risks

**Technical**
- **Silent blank-page reconstruction** from AOS re-hide, which screenshot-diff QA will not catch (blank vs blank passes). Highest risk on this site.
- **Two-document viewport mismatch** — the responsive merge has no valid node correspondence between 1440 and 390.
- Popup overlay baked into the hero at one banner; carousels frozen at one slide with a frozen active dot.
- 11–12 mixed-content subresources plus an http:// hop in the mobile redirect chain; `http://dmaps.daum.net/.../postcode.v2.js` is hard-blocked, so the address-lookup path is already broken at source.
- All `fonts.gstatic.com/ea/notosanskr/v2/*` requests fail (dead Google Early Access endpoint) — must be classified as source-side breakage, not asset-independence failure, or Task 22's residual count is corrupted.
- Two `404`s in the desktop response mix (2 of 158) and 21/24 failed requests per viewport — a noisy baseline to diff against.
- `Cache-Control: no-store, no-cache, must-revalidate` + numeric CMS IDs means content can shift between observation and QA runs.
- Heavy third-party surface (GTM, GA, DoubleClick, AceCounter, Naver wcs, Kakao/Daum, Channel.io) that must be stripped without disturbing layout — Channel.io injects a fixed bubble and a shadow root.
- `authDependency: login-ui-present` (4 login links, 0 password inputs on the homepage, `redirectedToLogin: false`) — the homepage is fully public, but `/index.php/board/list/online/119` (온라인상담) and `/counsel/` are plausibly gated and `/counsel/` is robots-disallowed.

**Content flags recorded by the scout**: `contentFlags.flags: []` — **none**. `titleMeta` and `bodyText` flag maps are both empty. No adult/age gate elements (`ageOrAdultGateElements: 0`).

Two factual content properties worth carrying forward regardless: (a) this is a **real, licensed, named medical clinic** — the footer publishes a named 대표자 (김영구), a street address, a phone number and 사업장등록번호 151-10-01951, and the page names two individual physicians; any content-injection or published-artifact step must not produce a look-alike that could be mistaken for the real clinic. (b) The subject matter is **Korean medical advertising** (before/after treatment claims, 「전국 의사 중 오직 2%」, treatment efficacy language) — regulated content in KR, and reproducing it verbatim under a different brand is a distribution question, not just a fidelity question. Neither is a reason to reject the *measurement*; both constrain what gets published from it.

## Suggested secondary route

**`https://www.mystarskin.co.kr/index.php/board/list/equipment/14`**

Chosen from the 51 same-host URLs the scout recorded. The homepage is a single long marketing scroll: 0 tables, 0 grid containers, 2 flex containers, and almost all copy baked into images. A board **list** page is the structural complement — CMS-generated repeating rows, pagination controls, a search/filter form, and actual selectable text rather than raster banners. `equipment/14` is the right pick over its siblings because the scout also captured a live row URL for it (`/index.php/board/view/equipment/14/451611/cpage/1`), proving the board is populated and that list→view is a real second level. It is outside every robots.txt disallow (`/medis/`, `/xmldata/`, `/lib/`, `/counsel/` — none match).

Second choice if a content page is preferred over a board: `/index.php/html/17` (it is the only `html` route with a recorded child, `/index.php/html/17/140`, so it exercises the nested-page template).

## Recommendation

**BACKUP — DIFFICULTY 4 — PILOT_VALUE 3**

The site is clean on every gating criterion: reachable first try, HTTP 200 both viewports, valid TLS 1.2, no redirect games on desktop, no Cloudflare/WAF/anti-bot challenge, and a robots.txt that names `ClaudeBot` and allows it at `Crawl-delay: 10`. Nothing here justifies a REJECT. But it is the wrong shape for 28.6's headline lane: with `breakpoints: []` and `mediaMinMax: 0` it cannot exercise the `hiddenRanges()`/probe-gap machinery the task exists to close, and because the 390 view is a UA-sniffed **separate document** (`/index.php/menu_gb/MB0`, 585 elements vs 1,060) rather than a media-query reflow, the responsive merge has no node correspondence to work with at all. Meanwhile two of its most interesting properties are also its biggest fidelity hazards: AOS in re-hide mode leaves roughly 4,000 of 6,157 desktop pixels observed at `opacity: 0` — and since `layout-probe.ts:61` ends our own scroll pass at `scrollTo(0, 0)` exactly as the scout does, a pilot here would likely produce a blank reconstruction that screenshot-diff QA scores as a pass — while a dot-paginated modal popup occludes the hero in every single-observation capture. As a *primary* pilot it would burn a lane on traps that mask the signal we are trying to measure. As a **backup** it is genuinely valuable and I would keep it in the pool: it is the only candidate that puts hangul metrics under a dead webfont, a zero-grid/two-flex legacy layout, a server-side mobile split, an AOS re-hide capture bug, and 95-images-against-1,349-characters content density in front of the pipeline at once — and the AOS finding alone is worth logging to the ideas lane now, independent of whether the site is ever reconstructed. If a medical-category pilot slot is being filled and only one can run, `9skin1.co.kr` (medical, 40 media rules, 19 sheets, real CSS breakpoints) is the better responsive-engine subject and mystarskin should sit behind it.
