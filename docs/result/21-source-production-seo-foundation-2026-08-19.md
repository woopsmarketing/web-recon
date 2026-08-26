Task: 21
Title: Source SEO Observation & Production SEO Foundation
Previous: 20-theme-extraction-adapter-foundation-2026-08-18.md
Status: Complete

# Task 21 — Source SEO Observation & Production SEO Foundation

Task 20에서 SEO 단계로 넘겨진 것을 구현했다: **원본 사이트가 SEO를 어떻게
하는가(Source SEO)의 불변 감사 증거**와 **새 콘텐츠·브랜드·도메인을 위한
독립 Production SEO 산출물**을 구조적으로 분리하고, production plan이 실제
브라우저 head에 도달하게 했다 — Task 18 이래 열려 있던
`document-title-not-slotted` 갭 포함. Git add/commit/push 0. 과거 run
artifact 수정 0 (frozen template/content/observation run 전부 오늘 작업
시각 이전 mtime 그대로임을 find로 확인). AI 호출 0. Stripe 전용 하드코딩
0 — brand 금지어 목록조차 source 증거에서 유도된다.

```
Stored site-observation run (immutable) + verification.json
  ↓ pnpm seo:observe     Source SEO Snapshot (observed; 유일한 네트워크는
  |                      opt-in robots/sitemap fetch — 저장 artifact에 없음)
  ↓ pnpm seo:plan        Production SEO Plan (derived; content run에서 유도,
  |                      원본 복사는 검사되는 실패; forbidden-copy + brand gate)
  ↓ pnpm seo:preview     serve-boundary SEO Head Overlay (title/meta/JSON-LD/
  |                      robots.txt/sitemap.xml — 불변 app은 무수정)
  ↓ pnpm seo:qa          browser QA (hydration 후 document.title · noindex ·
                         JSON-LD parse · brand isolation · link audit)
```

**신규:** `src/seo/` (14 files) + 4 CLI (`seo:observe` / `seo:plan` /
`seo:preview` / `seo:qa`) + `pnpm smoke:seo` (72 checks) + stripe artifact:
`source-seo-snapshots/2026-08-18T19-25-49-810Z` ·
`production-seo-plans/2026-08-18T19-26-12-572Z` (report/qa.json,
report/link-qa.json 포함).

## Executive Summary

> 두 데이터 모델은 **아무것도 공유하지 않는다**: `source-seo-snapshot-v1`은
> 저장된 rendered.html 18페이지에서 원본 head 증거를 그대로 읽은 감사
> (provenance `observed`), `production-seo-plan-v1`은 주입된 한국어 콘텐츠
> (플로우데스크)에서 유도된 독립 계획(provenance `derived`)이다. **원본
> SEO 값 복사는 검사되는 실패다**: forbidden-copy 83 비교 0 위반, source
> 증거에서 유도된 20개 brand 금지어(호스트·JSON-LD Organization
> identity·og:site_name·sameAs 소셜 링크)로 모든 production 렌더 표면 265
> 문자열 스캔 0 위반. 도메인이 없으므로 **preview mode**: 전 route robots
> `noindex,nofollow`, robots.txt `Disallow: /`, canonical 미확정(발명 0),
> `/sitemap.xml` 404. 사업 사실 7종(주소·전화·가격·리뷰·평점·설립일·
> sameAs)은 전부 needs-input — 발명 0, 총 182개 needs-input 값이 하나의
> report로 집계된다. **serve boundary에서 plan이 실제 브라우저에
> 도달한다**: hydration settle 후 `document.title`이 플로우데스크 title로
> 렌더됨을 Chromium이 확인했고(주입 route + fallback route 모두), 브라우저
> QA **29/29 PASS**, 20/20 route 200, runtime error 0. **READY FOR ASSET
> INDEPENDENCE.**

## Two Models, Zero Sharing

```
Source SEO Snapshot     원본이 SEO를 어떻게 하는가.  provenance observed.
                        data/<host>/source-seo-snapshots/<run-id>/
                        읽기 전용 증거 — Production이 감사(비교)할 수는 있어도
                        복사할 수는 없다 (복사가 곧 검사 실패).
Production SEO Plan     새 사이트는 SEO를 어떻게 할 것인가.  provenance derived.
                        data/<host>/production-seo-plans/<run-id>/
                        모든 값이 {value, status: known|needs-input, basis}.
```

zod 스키마 레벨에서도 두 모델은 별개 계열이다(공유 object schema 0) —
"원본을 그대로 복사"가 최소 저항 경로가 되는 것을 구조로 막는다
(PRODUCT_VISION §9: 원본 SEO를 그대로 복사하지 않는다 / 원본 canonical
복사 금지 / 없는 rating·review·business data 발명 금지).

## Source SEO Snapshot

입력은 accepted lineage의 저장 artifact뿐이다: augmented site-observation
run `2026-08-17T21-23-54-037Z-augmented` (18 pages)의 desktop
`rendered.html`(head 증거 + heading outline + image alt) + `links.json`
(내부 링크 그래프) + lineage `verification.json`(httpStatus). 유일한
네트워크 접근은 opt-in `--live-site-files`(robots.txt/sitemap) — 이 두
파일은 어떤 저장 artifact에도 없음을 확인하고서만 허용했고, 결과는
`live-fetched` + timestamp로 표시되며 실패는 `unavailable`로 기록된다
(발명 없음).

Page-level (18/18 관측):

| 항목 | 측정값 |
| --- | --- |
| title | 18/18 존재, 중복 0 |
| meta description | 18/18 태그 존재 — 단 **p000004(cookie-settings)·p000010(legal/becs)는 빈 문자열** (원본의 실제 SEO 결함, 그대로 기록) |
| canonical | 18/18 존재, **전부 self-referential** (cluster 18개, 교차 canonical 0) |
| robots meta | **0/18 — 관측된 robots meta 없음** (indexable 주장 아님: "not observed"는 not observed) |
| hreflang | 16 pages × 89 alternates (careers 2 pages는 0) |
| Open Graph / Twitter | og 60 entries (home 5, 나머지 3) / twitter 90 entries (5×18) |
| JSON-LD | 12 pages 존재 (home: WebSite+Organization @graph; 6 pages 부재로 기록), 전부 parseable |
| heading outline | 637 headings, h1 누락 page 0 |
| image alt | 789 imgs — alt 있음 710 (빈 alt 78 별도 집계), **missing 1** |

Site-level:

| 항목 | 측정값 |
| --- | --- |
| link graph | 18 nodes · 40 dedup edges · 5,058 internal link occurrences |
| route depth | 0–4 |
| orphan candidates | 15 (**관측 subgraph 내 한정**으로 명명 — 사이트 전체 주장 아님; careers·locale·resources 대부분이 홈에서 직접 링크되지 않음) |
| duplicate title / description | 0 / 0 |
| broken internal links | **0** — verified 대상 중 non-2xx 증명이 있는 것만 broken (RSS 등 non-html 후보 포함 검사) |
| unverified internal link targets | 1,692 — 관측/검증 범위 밖 = **unobserved이지 broken이 아니다** |
| indexability | 18/18 `no-observed-blocker` (robots meta 0 + self canonical + 2xx) |
| robots.txt (live) | 200, 17 disallow rules, Sitemap → `stripe.com/sitemap/sitemap.xml` |
| sitemap (live) | sitemap-index, 9 partitions (bounded fetch: 최대 3 파일, 샘플 10 URL) |

## Production SEO Plan

입력: Recon Template(불변, route 목록 + app이 지금 serve하는 원본 title),
Content Run(**production 카피의 유일한 원천** — sitePlan.siteIdentity
플로우데스크/기업용 AI 업무자동화 솔루션/positioning, pagePlans, intent
언어), Source Snapshot(비교 감사용), Domain State(미제공). 결정론:
네트워크 0, 브라우저 0, AI 0.

| route 분류 | 값 |
| --- | --- |
| routes | 20 (route-map 1:1) |
| content-injected (`/`) | title **known** `플로우데스크 \| 기업용 AI 업무자동화 솔루션` (basis: siteIdentity), description known (pagePlan.primaryMessage + positioning 유도 — 원본 description과 무관) |
| not-yet-injected 19 routes | title **needs-input** + previewFallback `플로우데스크` (이미 아는 데이터만 — 원본 title은 어떤 경우에도 serve되지 않음), description needs-input·미렌더 |
| og / twitter | title·description mirror; og:type website·og:locale ko_KR·og:site_name 플로우데스크 known; **og:url·og:image·twitter:site needs-input** (도메인·자산·계정 발명 금지) |
| JSON-LD | WebSite + Organization(name·description만) 방출; url/sameAs/address/telephone/foundingDate/logo/aggregateRating은 `omittedNeedsInput`에 명시 |
| canonical | intent `self-on-production-domain` 기록, **finalized false·value null** (preview) |
| 사업 사실 7종 | 전부 needs-input (intent.providedFacts = []) |
| needs-input 집계 | **182개** → `report/needs-input.json` |

title/설명은 head splice 경계를 지나므로 `" \ < > &`와 제어문자를 금지하는
`assertHeadSafeText` guard가 plan 생성 시 throw한다.

## Domain State — Preview

도메인 미제공 → `mode: "preview"`가 구조적으로 강제하는 것: 전 route
robots meta `noindex,nofollow` / robots.txt 전체 Disallow + **Sitemap 라인
없음**(절대 URL이 필요한데 도메인 발명 금지) / canonical·og:url 미방출 /
`/sitemap.xml` 404. sitemap은 path-only `sitemap.preview.xml`로만 생성되며
파일 머리에 "표준 sitemap이 아니고 serve되지 않는 계획 artifact"임이
명시된다. 도메인이 제공되면(smoke 5절이 증명) 같은 코드 경로가
`index,follow` + 확정 canonical + 절대 URL sitemap + Sitemap 라인을 낸다.

## Forbidden Copy & Brand Isolation

- **forbidden-copy**: plan의 모든 title/description/og/twitter 문자열
  (previewFallback 포함)을 source snapshot의 전 페이지 title/description/
  og/twitter 값과 byte 비교 — 83 comparisons, **0 위반**. smoke는 원본
  title을 복사한 오염 plan이 실제로 FAIL함을 증명한다.
- **brand isolation**: 금지어를 source 증거에서 유도한다 — stripe.com ·
  stripe(호스트 라벨) · Stripe·Stripe, LLC(JSON-LD Organization) ·
  @stripe(twitter:site) · sameAs 소셜 링크 13종(twitter/facebook/linkedin/
  github/instagram/youtube/wikipedia/crunchbase/…) · images.stripeassets.com
  — 총 20 terms. 스캔 대상은 **렌더되는 production 표면만**(plan 값,
  rendered head, robots.txt, sitemap): 265 strings, **0 위반**. plan 자체
  검사 실패는 run 생성이 throw한다(권위적으로 보이는 artifact를 남기지
  않음).

## Metadata Rendering — Serve Boundary

불변 template app은 `route-map.json`의 **원본 Stripe title**을
`generateMetadata`로 serve한다(18 이래 `document-title-not-slotted`,
manifest limitations에 기록되어 있던 그대로). Task 20 전례를 따라 적용은
serve boundary에서 일어난다:

```
Template → Content Overlay(WR_SLOT_VALUES_FILE env)
        → Theme Overlay(stylesheet append, 선택)
        → SEO Head Overlay(HTML head splice) → Render
```

proxy는 HTML 200 응답에 대해 (1) head `<title>` 요소 교체, (2) **RSC
flight payload 안의 원본 title 문자열까지 literal 치환** — head만 바꾸면
React가 hydration에서 탭 title을 원본으로 되돌린다, (3) rendered head
block을 `</head>` 앞에 삽입, (4) `/robots.txt`·`/sitemap.xml`을 domain
state대로 응답한다. 비-HTML은 byte passthrough(smoke가 CSS
byte-identical을 증명). browser QA가 이 설계의 정당성을 실측으로 닫는다:
**hydration settle 1.5s 후의 `document.title`을 검사**하므로 revert가
일어났다면 FAIL이었다.

## Browser QA — 29/29 PASS

QA routes: `/`(주입) + careers 2종(fallback 표본). run:
`production-seo-plans/2026-08-18T19-26-12-572Z/report/qa.json`.

| 검사 | 결과 |
| --- | --- |
| hydration 후 document.title = plan title | 3/3 route PASS (주입: 플로우데스크 \| 기업용 AI 업무자동화 솔루션, fallback: 플로우데스크) |
| head `<title>` 요소 | 3/3 |
| robots meta noindex,nofollow | 3/3 |
| meta description (known=일치 / needs-input=**정직한 부재**) | 3/3 |
| canonical 부재 (preview) | 3/3 |
| og:title + og:site_name | 3/3 |
| JSON-LD parse + production identity | 3/3 |
| served head에 source-brand term 0 | 3/3 |
| GET /robots.txt 200 + Disallow all + Sitemap 라인 없음 | PASS |
| GET /sitemap.xml 404 (preview) | PASS |
| 20/20 route가 proxy 경유 200 | PASS |
| runtime/console error | **0** |

## Internal Link QA

proxy 경유 전 20 route fetch, 13,570 anchors 분류
(`report/link-qa.json`):

| 분류 | 수 |
| --- | ---: |
| route-resolves (20-route table 내) | 244 |
| broken-internal (table 밖 원본 route → clone은 설계상 404) | 10,420 |
| source-host-absolute (stripe.com 절대 URL anchor) | 4 (newsroom page) |
| external | 2,138 |
| non-navigational (#/mailto/tel/javascript) | 764 |

이것은 측정이지 성적표가 아니다: body 링크는 관측된 원본 콘텐츠의
일부로서 template 소관이며(20 route는 112-route 원본의 표본), SEO 계층이
body를 다시 쓰는 것은 이 Task의 범위가 아니다. 4건의 source-host 절대
링크와 함께 asset/content independence 단계로 명시 인계한다.

## Smoke Tests

신규 `pnpm smoke:seo` — **72/72 PASS**. 합성 fixture를 **진짜 public
API**로 통과시킨다(주입 없음): head 파싱(존재/부재/깨진 JSON-LD) · 진짜
observer로 만든 snapshot(중복 title/description, canonical cluster,
subgraph orphan, verified-404 broken vs unverified 구분, robots-noindex
우선 verdict, missing h1, not-fetched 기본값, byte-determinism, zod
round-trip) · robots/sitemap 헬퍼 · 진짜 plan run creator preview mode
(needs-input fallback, fact safety 7종, 발명 URL 0, forbidden-copy·brand
gate 통과, path-only preview sitemap, needs-input report) · domain 제공
mode(index,follow·확정 canonical·절대 sitemap) · 오염 plan의
forbidden-copy FAIL · source host/org name 위반 검출 + 경계 단어
false-positive 0 · 진짜 proxy의 title+flight 치환·head 삽입·robots
200·sitemap 404·CSS passthrough · **Chromium document.title 실측** · link
audit 5분류.

기존 스위트 회귀 (전부 재실행):

| suite | 결과 |
| --- | --- |
| smoke:verifier | 81/81 |
| smoke:selector | 81/81 |
| smoke:multi-observer | 58/58 |
| smoke:interaction-detector | 92/92 |
| smoke:interaction-explorer | 108/108 |
| smoke:interaction-patterns | 88/88 |
| smoke:sitespec | 252/252 |
| smoke:reconstruction | 205/205 |
| smoke:reconstruction-qa | 134/134 |
| smoke:e2e | 130/130 |
| smoke:recon-template | 58/58 |
| smoke:content-injection | 68/68 |
| smoke:theme | 47/47 |
| **smoke:seo (신규)** | **72/72** |
| **합계** | **1,474/1,474 PASS** (81+81+58+92+108+88+252+205+134+130+58+68+47+72) |

(Task 20 baseline 13 suites/1,402 + 신규 72 = 14 suites/1,474.
`smoke:playwright`는 종전과 동일하게 Phase-1 환경 검사로 집계 제외.)

## Historical Integrity

- frozen template run(`recon-templates/2026-08-18T10-45-40-007Z`) 수정 0 —
  QA의 `next start`는 기존 BUILD_ID 재사용, 오늘 작업 시각 이후 mtime 파일
  0 (find로 확인; content run·augmented observation run·discovery run 동일).
- SEO 산출물은 자기 네임스페이스(`source-seo-snapshots/` ·
  `production-seo-plans/`)에만 썼다. qa.json/link-qa.json은 이 Task가 만든
  plan run 내부 `report/`에만 기록.
- Git add 0 / commit 0 / push 0.

## Known Limitations

- **serve-boundary overlay는 MVP 전달 방식** (Task 20과 동일) — production
  배포형(빌드 시 head 굽기)은 배포 Task 몫. rendered-head.json은 그대로
  재사용 가능하다.
- **flight-payload title 치환은 literal 문자열 일치에 의존** — 원본 title이
  스트림 chunk 경계에서 쪼개지면 놓칠 수 있으나 proxy가 응답을 전량
  버퍼링하므로 관측 범위에선 발생 불가; QA의 hydration-후 검사가 안전망.
- **19/20 route는 title이 needs-input** — 콘텐츠 주입이 `/`뿐이므로 brand
  fallback만 serve된다. 콘텐츠 scope 확장이 공식 경로.
- **body 내 원본 텍스트/링크는 SEO 계층 밖** — head는 brand-clean이지만
  미주입 route의 body에는 원본 콘텐츠가 남아 있다(Task 19 계층 소관).
  내부 링크 10,420건의 table-밖 원본 경로와 stripe 절대 링크 4건 포함.
- **redirect/pagination/CWV/performance 미관측** — source snapshot은 저장
  증거 범위만 주장한다(redirect chain은 verification이 count만 저장).
- **sitemap live fetch는 bounded** — index 1 + partition 미추적(9개 URL만
  기록). 원본 sitemap 전수 조사는 비목표.
- **duplicate-content 판정은 exact 기준** — Task 06 fingerprints가 이미
  담당하는 영역이라 snapshot은 title/description/canonical 중복만 다룬다.
- **SEO Delta Report 없음** — 비교할 production 도메인이 없다. domain
  제공 후의 후속 작업(PRODUCT_VISION §9 5단계 중 4단계까지 구현).

## Next Phase Readiness

Asset Independence(Task 22)가 소비할 것: needs-input 목록에 이미
`og:image`·`logo`가 자산 gap으로 명시되어 있고, link-qa가 asset/원본
호스트 잔존 지점을 세어 놓았으며, serve-boundary proxy는 이미 3계층
(content/theme/SEO) 합성을 지원한다. 도메인이 제공되는 순간 plan 재생성
한 번으로 canonical/og:url/sitemap/robots가 production 값으로 바뀐다는
것을 smoke 5절이 보증한다.

## Final Verdict

**READY FOR ASSET INDEPENDENCE**

— Source SEO와 Production SEO가 스키마 레벨에서 분리된 채, 원본 복사 0
(83 비교·265 스캔이 증명), 발명 0(도메인·canonical·사업 사실·이미지 전부
needs-input 182건), preview 안전(noindex/Disallow/404)이 지켜졌고,
production plan의 title/meta/JSON-LD가 **실제 브라우저 head에서 hydration
후에도 렌더됨**을 29/29 QA가 증명했기 때문이다.
