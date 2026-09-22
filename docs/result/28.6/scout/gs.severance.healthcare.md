# gs.severance.healthcare scout report

- **URL**: https://gs.severance.healthcare/gs/index.do
- **Category**: medical (강남세브란스병원 / Gangnam Severance Hospital, Yonsei University College of Medicine)
- **Scouted**: 2026-09-01T20:25:47.730Z (attempt 1, no retry, `ignoreHTTPSErrors: false`)
- **Source record**: `/Users/woops/projects/web-recon/tmp/wr286/scout/gs.severance.healthcare.json`
- **Screenshots**: `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/gs.severance.healthcare-1440.png` (1440×2700, 2.13 MB), `/Users/woops/projects/web-recon/tmp/wr286/scout/shots/gs.severance.healthcare-390.png` (780×7850 @dpr2 = 390×3925 CSS px, 2.12 MB) — both present, both fully rendered, neither blank

---

## Accessibility (reachability, HTTP status, TLS, redirect chain, challenge/anti-bot, robots.txt)

Fully reachable, cleanly and on the first attempt, at both viewports.

| Signal | Value |
| --- | --- |
| HTTP status | 200 (desktop and mobile) |
| Redirect chain | none — single hop `200 https://gs.severance.healthcare/gs/index.do` |
| Final URL | identical to requested URL |
| Main-frame navigations | 1 |
| `networkIdle` reached | yes, both viewports |
| Elapsed | 10,362 ms desktop / 5,858 ms mobile |
| Challenge / anti-bot | `detected: false`, zero signals, `cdn: null`, `waf: null` |
| Popups / dialogs | 0 / 0 |
| Console errors | 0 (but **1 uncaught page error** on each viewport) |
| Failed requests | 3 desktop / 2 mobile — all `www.google-analytics.com/g/collect` with `net::ERR_ABORTED` (benign beacon aborts) |
| Mixed content | 0 |

**TLS**: TLS **1.2** (not 1.3), wildcard cert `*.severance.healthcare`, issuer `GeoTrust TLS RSA CA G1`, valid 2026-07-22 → 2027-02-05. Comfortably inside its window.

**Scheme caveat**: the `http://` probe also returns **200 text/html with `Location: null`** (123,258 bytes vs 123,262 over https) — the origin serves the same page over plain HTTP and does **not** redirect to HTTPS. The scout's verdict is `https` and mixed content measured 0, but any capture must pin the scheme explicitly or asset URLs can drift to `http://`.

**robots.txt**: present, 200, 1,444 bytes, `text/plain`. Homepage is **allowed** for `*`. Two things matter:

1. The `*` group carries 36 `Disallow` rules. Blocked prefixes include `/online/`, `/checkup/`, `/member/`, `/myseverance/`, `/mypage/`, `/search/`, `/api/`, `/cms/`, `/_custom/`, `/_fox/`, `/_attach/`, **`/_res/`**, **`/_share/`**, plus ~22 `/professor-*` and `/community-*` prefixes.
2. **`/_res/` is the entire static asset tree.** All 5 stylesheets, the 15 same-host scripts, and effectively all fonts/images are served from `/_res/...`. A robots-respecting asset fetcher would refuse to download the site's own CSS, JS and webfonts. This is a compliance decision the operator has to make before an asset-independence run, not a technical blocker.

A second robots group sets `Disallow: /` for 14 named agents (PetalBot, uptimerobot, viberbot, YaK, Yandex, velenpublicwebcrawler, Bytespider/bytespider, AhrefsBot, SemrushBot, UT-Dorkbot, Baiduspider ×3). No headless-Chrome or generic-crawler UA is in that list, and no sitemap is declared.

**Auth**: `login-ui-present` — 0 password inputs, 0 login forms, 4 login links, no redirect to login, no age/adult gate. The homepage is fully public; the site pushes session/SSO traffic to `member.severance.healthcare` (37 requests) and `sso.severance.healthcare` (6 requests), including 2× 302.

---

## Architecture impression (framework/builder detected, SPA vs static server-rendered, CMS/board software)

**Server-rendered, multi-page, jQuery-era enterprise Java CMS. Not an SPA.**

- Every route ends in `.do` (`/gs/index.do`, `/gs/doctor/doctor.do`, …) — a Struts/Spring-style Java front controller.
- The asset and admin path conventions (`/_res/`, `/_share/`, `/_attach/`, `/_custom/`, `/_fox/`, `/cms/`) plus stylesheets literally named `cms.css` / `cms-common.css` indicate a **commercial Korean enterprise CMS**, not a consumer builder. It is **not** gnuboard, **not** Wix, **not** Cafe24, **not** imweb — no `generator` meta at all (`generator: null`).
- Compare within the candidate set: `seoultone.kr` and `yugiyu4.com` were detected as gnuboard, `xn--ok0b408a79cba430b.net` as `Wix.com Website Builder`. This one is in a different class — a hand-built institutional portal on a licensed CMS.
- Frameworks detected: **jQuery 2.2.4**, **slick** (carousel), **GTM/GA** (`dataLayer` + googletagmanager). No React, no Next.js, no Vue, no bundler runtime.
- 1 external CDN dependency (`cdnjs.cloudflare.com`, 1 script / 2 requests); everything else is first-party. Stylesheet hosts: 100% self.
- Navigation is real hyperlinks, not client-side routing: 475 anchors, 123 unique same-host URLs across 98 unique paths, `jsHref: 0`, 16 hash-only anchors. Exactly one main-frame navigation was recorded — nothing rewrites history.
- Multilingual site family present as separate server routes: `/gs-en/`, `/gs-jp/`, `/gs-cn/`, `/gs-ru/`, `/gs-ar/`.
- 44 external hosts referenced, dominated by a ~20-subdomain `*.severance.healthcare` family (news, cancer, sev-heart, sev-children, dental, gs-spine, fund, recruit, research…) plus Yonsei university domains, 5 press outlets, and certification bodies (`irb.or.kr`, `koiha.or.kr`, `isms.kisa.or.kr`, `emrcert.mohw.go.kr`).

---

## DOM/CSS/runtime complexity (the actual numbers)

| Metric | Desktop (1440) | Mobile (390) |
| --- | --- | --- |
| DOM elements | **1,731** | 1,715 |
| Document height | 2,700 px | 3,925 px |
| HTML bytes | 133,500 | 132,225 |
| Network requests | 148 | 132 |
| `content-length` sum | 10.97 MB | 7.98 MB |
| Page errors | 1 | 1 |

Runtime surface:

| Metric | Value |
| --- | --- |
| Stylesheets | **5** link, 0 `<style>`, 5 in `document.styleSheets` — **0 CORS-blocked** |
| CSS rules walked | 316 (see caveat below) |
| Scripts | **22** total = 17 external + 5 inline |
| Script bytes | **602,897** known (16 of 17 measured) + 3,027 inline |
| Script hosts | `gs.severance.healthcare` ×15, `cdnjs.cloudflare.com` ×1, `googletagmanager.com` ×1 |
| `<img>` | **37** (19 without `alt`), 0 lazy, 0 `<picture>`, **0 inline SVG**, all same-host |
| CSS background images | 44 elements / **33 unique URLs** |
| Resource entries | 91 (script 17, link 5, img 23, **css 42**, fetch 2, iframe 1, xhr 1), 9.32 MB |
| `<iframe>` | **1** — `https://gs.severance.healthcare/sessionCheck.jsp` (same-host session keepalive) |
| `<video>` / `<audio>` / `<embed>` | **0 / 0 / 0** |
| `<canvas>` / WebGL | **0 / false** |
| Shadow roots / custom elements | **0 / 0** |
| `@keyframes` | 0 |
| Elements with CSS animation | 0 |
| Elements with transitions | 60 |
| `will-change` | 1 |
| Fixed-position elements | **6** |
| Flex containers | **134** |
| Grid containers | **0** |
| `<table>` | **0** |
| `<form>` / `<input>` | 0 / 5 |
| Horizontal overflow | false (both viewports) |
| `min-width` | `html: 0px`, `body: 360px` |
| Fonts | 5 distinct computed stacks, `document.fonts` = 5, families **NanumGothic + NanumSquare**, **4 self-hosted font files**, 0 third-party font hosts |
| `@font-face` rules counted | **0** ← contradicts the 4 loaded font files |

**Measurement caveat — the CSS numbers are a floor, not the truth.** 316 rules, 1 media rule and 0 `@font-face` across a 1,731-element institutional portal is implausible on its face, and the record contains its own disproof: 4 font files load from `gs.severance.healthcare` and `document.fonts` reports NanumGothic/NanumSquare, yet the walker found **zero** `@font-face` rules. The cause is visible in the scout itself — `tmp/wr286/scout/scout.mjs:258` recurses only when `r.cssRules` exists:

```js
else if (r.cssRules && t !== "CSSStyleRule") { try { walk(r.cssRules); } catch {} }
```

`CSSImportRule` exposes `.styleSheet`, not `.cssRules`, and `@import`-ed sheets never appear in `document.styleSheets`. So every rule behind an `@import` chain from `cms.css` / `cms-common.css` / `style.css` is invisible to this count. Supporting evidence: 42 CSS-initiated subresources were fetched while only 33 unique CSS background URLs and 4 fonts are accounted for, leaving roughly five unexplained CSS-initiated fetches — the shape you get from `@import`. **Nothing here is CORS-blocked** (`blocked: 0`, `fetched: 0`), so this is an enumeration-depth problem, not the CORS trap from 28.5C; fetching the 5 hrefs directly and following `@import` would recover the real rule set.

---

## Responsive complexity

| Metric | Value |
| --- | --- |
| Media rules (readable) | **1** |
| Media rules (CORS-blocked → fetched) | 0 blocked, 0 fetched, 0 fetch-failed |
| Unique media queries | 1 |
| Breakpoints observed | **`max:1024.98px`** (single) |
| `@supports` / container queries | 0 / 0 |
| Viewport meta | `width=device-width, initial-scale=1.0` (no `user-scalable=no`, no max-scale) |
| Mobile horizontal overflow | false |
| Doc width @390 | 390 px (`innerWidth` 390, `docWidth` 390) |
| Height 1440 → 390 | 2,700 px → 3,925 px (**1.45× taller**) |

The single `.98` breakpoint is a Bootstrap-convention value, which suggests at least one sheet in the chain derives from a Bootstrap-style breakpoint ladder — and a full ladder cannot be represented by one rule. Given the `@import` enumeration gap above, treat **"1 media rule / 1 breakpoint" as a lower bound**: the observed reflow is far richer than one query can produce.

**What the 390 screenshot actually does: it is a REAL mobile layout, fully reflowed — not a shrunken desktop.** Concrete evidence from the image itself:

- **Header restructures**, it does not scale. Desktop: logo + four inline nav labels (진료과/의료진, 예약/결과/발급, 병원안내, 건강정보) + hamburger + search + `KO` language dropdown + two account icons. Mobile: hamburger moves to the far left, logo centres, search stays right, and the entire inline nav and language control are **removed from the bar**.
- **The utility bar re-wraps**: the two phone blocks (진료예약 1599-6114 / 건강검진예약 1899-7588) sit side-by-side on one line at 1440 and stack into a two-column, three-line block at 390, with the `오늘하루 열지않기` checkbox dropping to its own row.
- **The 4-up hospital link bar** (심뇌혈관병원 / 암병원 / 척추병원 / 치과병원) becomes a horizontally scrollable strip — the 4th item is cut off at the right edge at 390.
- **The 2-up CTA row** (첫방문 간편예약 / 온라인 진료 예약) stacks into two full-width buttons.
- **The 5-across icon row** becomes a **2-column, 3-row grid** — and it gains a sixth tile (편의 시설) that is **not present in the desktop capture**. That is a genuine per-viewport content difference, not just a reflow.
- **The 4-up feature card grid** (Webzine / 건강정보 / 진료 시간표 / 후원하기) becomes four full-width stacked cards, each roughly a screen tall, with internal type and artwork re-laid out rather than scaled.
- **The NEWS band** keeps its horizontal carousel but moves its prev/next arrows from under the "NEWS" heading (desktop) to the top-right of the band (mobile).
- Font sizes are re-specified, not scaled: hangul body text remains legible at ~14–16 px equivalent rather than shrinking proportionally with the viewport.

There is no horizontal overflow at either width and `body { min-width: 360px }` sets a sane floor. So responsiveness is honest and well-built — the risk is that **most of the CSS driving it was not readable to the scout's walker**, so the reconstruction's breakpoint inference will be working half-blind unless the sheets are fetched and `@import`-followed.

---

## Visual complexity (screenshot evidence)

**Overall shape**: a single-column, full-width, band-stacked institutional homepage — no sidebar, no table layout, no masonry. 134 flex containers and **0 CSS grid containers**: everything is flexbox rows. Nine visually distinct bands top to bottom.

**Band inventory (desktop, 1440×2700)**:

1. Blue utility bar — two phone CTAs with icons + a "오늘하루 열지않기" (don't show today) checkbox. Part of the 6 fixed elements.
2. White header — logo mark + wordmark, 4 nav labels, hamburger, search, `KO` dropdown, 2 account glyphs.
3. **Hero**: a full-bleed **photograph** of the hospital building at dusk with a Korean headline overlaid in large white type ("어려운 병 잘 치료하는 / 이웃병원") and a sub-line. **No video, no canvas.** Two stacked pill tabs float on the left edge (환자·보호자 / 의료 전문가) — an audience switcher, corroborated by the text sample. Notably the headline's first glyphs are **occluded by the left tab** in the capture ("려운 병 잘 치료하는"), so the hero involves overlapping absolutely-positioned layers over an image — the paint-twin / overlay situation from Task 19.1.
4. Four-segment blue link bar with external-link glyphs.
5. Two large outlined CTA buttons.
6. Five icon + label quick links, separated by hairline rules (six at 390).
7. **Four-card feature grid**, each card a different treatment: solid-blue Webzine card with a magazine cover photo; a photo-background 건강정보 card containing an **inner slider** (a white panel with `< > +` controls cycling disease entries); a solid-blue 진료 시간표 card with flat illustration; a green 후원하기 card with a photo of hands holding a seedling.
8. **NEWS band** — dark navy, heading block on the left, then a horizontal **slick track** of white news cards with category chips (메디컬 리포트 / 언론 보도) and dates, circular prev/next arrows. The track is clipped mid-card at the right edge, i.e. captured mid-track with an inline transform.
9. **Bottom promo carousel** — full-bleed photographic background (hospital signage/reception) with four tall pill/capsule-shaped cards, alternating blue and white, each with an arrow glyph, a Korean label and an inset image (SRT 고객건강라운지, 비급여 진료비용 검색, 기관생명윤리위원회 인증, 온라인 의무기록사본 발급). Below them a **10-dot pagination** with one elongated active dot.
10. Footer — a light bar of four family-hospital selectors with caret/external glyphs, Facebook + YouTube icons, a "연세의료원 네트워크" select box, policy links (이용약관 / 개인정보처리방침 / 고객의 소리 / 병원소개, the privacy link bolded), a Korean postal address and an English all-caps copyright line.

**Sliders — this is the dominant visual risk.** At least **four independent slick instances**: the hero audience switcher, the 건강정보 disease slider, the NEWS card track, and the bottom promo carousel. Two of them are **provably captured at different slides across the two viewports**:

- 건강정보 card shows **부정교합 [Malocclusion]** at 1440 but **말단비대증 [Acromegaly]** at 390. The desktop text sample enumerates at least 7 rotating entries (회전근개 파열, 자궁내막암, 말단비대증, 부정교합, 요로결석, 후종인대골화증, 담관암…).
- The bottom promo carousel's active dot is the **3rd** at 1440 and the **2nd** at 390, and the leading card differs (SRT 고객건강라운지 vs 미래형 스마트 컨택센터 AICC 도입).

Since web-recon takes one observation per viewport and freezes animation, the desktop and mobile reconstructions of the *same* page will legitimately disagree on carousel content. Parity/screenshot QA will read that as a mismatch that no reconstruction fix can remove.

**Typography**: heavy Korean. 2,781 text chars, **1,327 hangul** vs 481 latin, 0 kana, 0 han; `html lang="ko"`. Two self-hosted Korean webfonts do the work — **NanumSquare** (435 elements, the display face for headings and card titles) and **NanumGothic** (168 elements), with a system stack (`-apple-system, system-ui, NanumGothic, malgungothic, …`) on the remaining 1,071 elements. `Times` appears on 54 elements, almost certainly unstyled default leakage.

**Animation**: benign. 0 `@keyframes`, 0 animated elements, 60 transition elements (hover states), 1 `will-change`, 0 marquee. Nothing continuously moving except the slick autorotation.

---

## Estimated reconstruction difficulty

**3 / 5 — moderate.**

Arguments for *easier*:

- Zero of web-recon's hardest primitives: **0 canvas, 0 WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 CSS grid, 0 tables, 0 `@keyframes`, 0 animated elements**. The single iframe is a same-host `sessionCheck.jsp` keepalive with no visual output — trivially stubbed.
- Server-rendered multi-page, no SPA routing, no hydration, one navigation, no history rewriting. The DOM the scout saw is the DOM the server sent.
- Layout is 134 flexbox containers and plain block bands — exactly the static flex/CSS shape the repo handles well.
- Assets are self-hosted and boring: 37 same-host images, no lazy loading, no `<picture>`, no responsive `srcset` complexity to resolve, 33 CSS background URLs.
- 1,731 DOM elements is mid-pack among the 12 candidates (range 382–2,672) and well under what Task 18's 9,529-slot template run handled.
- All 5 stylesheets are same-origin and CORS-readable — the 28.5C CORS capture trap does not bite here.
- No challenge, no WAF, no CDN interception, no auth wall, clean 200s.

Arguments for *harder*:

- **Four slick carousels**, two of them demonstrably captured at different slides per viewport. Single-observation capture cannot represent them, and the mid-track inline transforms plus edge-clipped overflow have to be preserved verbatim to look right.
- **The real CSS is not in the record.** 1 media rule and 0 `@font-face` are provably undercounts. Every responsive decision would rest on an incomplete rule set unless the sheets are fetched and `@import`-followed first — and 28.5C already established responsive fidelity as the weakest area.
- **Korean webfont metrics.** Two self-hosted faces carry the entire visual identity; hangul advance widths differ materially between NanumSquare and malgungothic/system fallbacks, so a substituted font reflows headings and card titles rather than merely recolouring them. Task 22's measured-fallback-cost path applies directly.
- **6 fixed elements** (utility bar, floating audience tabs, chatbot bubble) against `fullPage` screenshots — the known screenshot-diff artifact class.
- **Per-viewport DOM divergence**: the 편의 시설 tile exists at 390 and not at 1440, so a single unified template must carry viewport-conditional content.
- 602 KB of script and cross-subdomain SSO chatter (37 + 6 requests, 2× 302) plus 1 uncaught page error mean the runtime is noisier than it looks.

Not 2, because carousels + unreadable CSS depth + Korean font metrics are three of the repo's named weak spots at once. Not 4, because there is no SPA, no canvas, no shadow DOM, no video, and nothing is CORS-blocked — the structural work is conventional flexbox over server-rendered HTML.

---

## Potential unique test value

Things this site proves that **linear.app** and **stripe.com** could not:

1. **Native Korean source content.** Tasks 19/19.1 injected Korean *into* an English site (the Stripe hero canary). This is the inverse: 1,327 hangul chars of source text, `lang="ko"`, Korean `<title>`, `og:*`, description and keywords. Content injection, truth-mode accounting and the brand-leak scanner all run against Korean source strings for the first time.
2. **Real Korean webfont metrics.** Self-hosted NanumSquare + NanumGothic (4 font files, unknown licence) instead of Inter/Söhne. This is the first honest test of Task 22's font licence-review path and measured fallback cost against hangul, where the fallback penalty is much larger than in Latin text.
3. **Enterprise Java CMS markup dialect.** `.do` front-controller routes, `/_res/` `/_share/` `/_attach/` `/cms/` `/_fox/` asset conventions, `cms.css`/`cms-common.css` cascade, jQuery 2.2.4 + slick. Completely disjoint from Next.js/React (linear) and Stripe's bespoke stack — and disjoint from the gnuboard and Wix sites elsewhere in this candidate set.
4. **A large real navigation graph.** 475 anchors, 123 unique same-host URLs across 98 paths, plus five sibling language sites (`/gs-en/`, `-jp`, `-cn`, `-ru`, `-ar`). `src/release/graph.ts` and multi-route release planning get a genuinely large, hand-curated IA instead of a marketing site's dozen routes.
5. **Messy external-brand surface**: 44 external hosts, ~20 sibling `*.severance.healthcare` subdomains, 5 press outlets, and government/accreditation marks (보건복지부 인증, 기관생명윤리위원회 / IRB, KOIHA, ISMS, `emrcert.mohw.go.kr`). Brand-scan and the "content-review kind" carry-forward from Task 26 get a hard, realistic input where some imagery legally cannot be rebranded.
6. **A robots.txt that disallows the asset tree.** `Disallow: /_res/` covers all CSS, JS and fonts. No prior pilot has had to reconcile robots compliance with asset independence; this forces the policy question into the open.
7. **`@import`-hidden CSS.** A site whose responsive behaviour is real and rich but whose media rules are invisible to `document.styleSheets` enumeration is a direct regression test for the 28.5C responsive work — and a clean, non-CORS reproduction of "the capture cannot see the rules it needs".
8. **Multi-carousel frozen-state parity.** Four slick instances with demonstrable cross-viewport slide desync gives the parity/QA layer a real, reproducible case of legitimate content divergence, which neither linear nor stripe surfaced at this severity.
9. **A clean-content institutional pilot.** This is one of the very few candidates in this batch with **zero** content flags — usable as a public demonstration in a way most of the alternatives are not.
10. TLS 1.2-only origin that also answers plain `http://` with 200 and no redirect — a scheme-pinning edge case.

---

## Risks

Technical:

1. **Carousels captured frozen and desynced.** Four slick instances; 건강정보 shows 부정교합 at 1440 and 말단비대증 at 390, and the bottom promo carousel's active dot is 3rd vs 2nd. Parity QA will flag content mismatch that is not a reconstruction defect. Needs either slide pinning at capture time or an explicit known-divergence allowance.
2. **CSS rule counts are unreliable.** `rulesReadable: 316`, `mediaRules: 1`, `fontFace: 0` — the last is disproved by 4 loaded font files and `document.fonts` reporting NanumGothic/NanumSquare. Root cause is in the scout (`tmp/wr286/scout/scout.mjs:258`): `CSSImportRule` exposes `.styleSheet`, not `.cssRules`, so `@import`-ed sheets are never walked and never appear in `document.styleSheets`. Real breakpoint count is unknown. Mitigation: fetch the 5 hrefs and follow `@import` before any responsive inference. Note this is **not** a CORS problem — `blocked: 0`.
3. **robots.txt `Disallow: /_res/` and `/_share/`** covers the entire CSS/JS/font/image tree. A robots-respecting asset fetcher cannot achieve asset independence here without an explicit operator decision.
4. **Korean webfont licence and metrics.** 4 self-hosted font files, licence unknown, `@font-face` not captured. Substituting a fallback changes hangul advance widths enough to reflow headings and card titles, not merely restyle them.
5. **6 fixed-position elements** (utility bar, left audience tabs, chatbot bubble) combined with `fullPage` screenshots — the known duplicate/floating artifact class in screenshot diffing.
6. **Per-viewport DOM divergence**: the 편의 시설 quick-link tile appears at 390 but not at 1440 (DOM 1,731 vs 1,715). A unified template must tolerate viewport-conditional content rather than treating it as a diff.
7. **Cross-subdomain session/SSO traffic**: 37 requests to `member.severance.healthcare`, 6 to `sso.severance.healthcare`, 2× 302, plus the `/sessionCheck.jsp` iframe. All need stubbing for a static bake. **1 uncaught page error** on both viewports, cause unidentified by the scout.
8. **Scheme ambiguity**: `http://` returns 200 with no redirect; capture scheme must be pinned to https.
9. **Accessibility/SEO carry-forward**: 19 of 37 images have no `alt`, and there are **0 `<h1>` elements** on the page. The SEO snapshot will faithfully reproduce both gaps.
10. **Third-party CDN dependency**: 1 script from `cdnjs.cloudflare.com` must be vendored for independence.

Content flags recorded by the scout — stated factually:

- `contentFlags: []` — **none**. No adult, gambling, piracy, webtoon or link-aggregator signal in title, meta or body text. This is one of only 4 candidates of 12 with a clean flag list; 7 of the other 11 carry `adult`, `gambling`, `piracy`, `webtoon` and/or `link-aggregator`.
- Separate from flags, the page carries a **real institution's identity**: hospital name and logo, two live call-centre numbers (1599-6114, 1899-7588, +82-2-2019-4900), a postal address (06273 서울특별시 강남구 언주로 211), press-coverage links to KBS / 한국일보 / 경향신문, and third-party accreditation marks (보건복지부 인증, 기관생명윤리위원회, KOIHA, ISMS). Any rebranding run must route these through the operator-input path; certification marks and press logos belong to their issuers and cannot transfer to a different entity.
- `authDependency: login-ui-present` — 4 login links, 0 password fields, no gate on the homepage.

---

## Suggested secondary route

**`https://gs.severance.healthcare/gs/news/news/notice.do`** (공지사항 / notice board).

Why this one, from the paths the scout recorded:

- It is **robots-allowed** — the `*` disallow list blocks `/search/`, `/member/`, `/myseverance/`, `/online/`, `/checkup/`, `/mypage/`, but not `/gs/news/`.
- It is **structurally disjoint from the homepage**, which has **0 tables, 0 forms and 0 grid containers**. A Korean CMS notice board reliably contributes list/table markup, pagination controls, a search/filter form with real `<input>`s and `<select>`s, and per-row metadata — none of which the homepage exercises, and none of which linear.app or stripe.com contributed either.
- It is **carousel-free**, so it isolates the CMS markup and typography variables from the frozen-slider problem, giving a clean second data point on the same font stack and cascade.

Alternate if a link-dense page is preferred over a board: **`/gs/department/department-center-clinic-all.do`** (all departments/centres/clinics index) — a large tabbed directory of same-host links that would stress the navigation graph and the multi-column link-list layout instead. Avoid `/gs/doctor/doctor.do` as the primary secondary pick: doctor directories on this platform typically depend on `/search/` and `/api/` endpoints, both robots-disallowed.

---

## Recommendation

**SELECT — DIFFICULTY 3/5 — PILOT_VALUE 5/5.**

This is the strongest candidate in the batch and the right next pilot after linear.app and stripe.com. It is unambiguously accessible: a single 200 with no redirect, no challenge, no WAF, no CDN interception, no auth wall, valid TLS, `networkIdle` reached at both viewports, and a robots.txt that explicitly permits the homepage. It carries **zero content flags** in a batch where 7 of 12 candidates carry adult, gambling or piracy signals, so it is usable as a public demonstration. Structurally it avoids every one of web-recon's hard primitives — no canvas, no WebGL, no shadow DOM, no video, no SPA routing, no CSS grid, no tables, no keyframe animation — and delivers a conventional 134-container flexbox layout over server-rendered markup at a manageable 1,731 elements, with a genuine reflowed mobile layout rather than a shrunken desktop. What makes it a 3 rather than a 2 is a specific, named trio: four slick carousels that a single observation freezes and that already disagree across the two captures; two self-hosted Korean webfonts whose hangul metrics no fallback reproduces; and a CSS rule set that the scout's walker could not see past its `@import` boundary, which leaves the true breakpoint ladder unknown right where 28.5C proved the engine is weakest. Those are exactly the failures worth buying: this run would be the first to prove the pipeline on native Korean text, on real Korean webfont licensing, on enterprise Java CMS markup, on a 98-path navigation graph, and on a robots.txt that forbids crawling the site's own asset tree — five distinct capabilities that neither prior pilot touched. Before the run, two things should be settled up front: fetch the 5 stylesheets directly and follow `@import` so the responsive inference is not working from a 1-media-rule fiction, and get an operator decision on `/_res/` versus robots compliance. Expect the honest outcome to be a PASS with declared limitations on carousel slide state and font substitution, not a clean zero-blocker run.
