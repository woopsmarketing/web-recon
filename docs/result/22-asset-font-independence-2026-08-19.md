Task: 22
Title: Asset & Font Independence Foundation
Previous: 21-source-production-seo-foundation-2026-08-19.md
Status: Complete

# Task 22 — Asset & Font Independence Foundation

Task 17 이래 모든 태스크가 명시적 비목표로 미뤄 온 것을 구현했다:
production 후보의 **원본(source-site) 자산·CDN·폰트 호스트 런타임 의존
제거의 기반**. accepted run에 기록돼 있던 `asset-load-failure ×47`의
소관 계층이 이제 존재한다. Git add/commit/push 0. 과거 run artifact 수정
0 (frozen site-spec/reconstruction/template/content/theme/SEO run 전부
작업 시작 시각 이후 mtime 파일 0임을 find로 확인). AI 호출 0. Stripe 전용
하드코딩 0 — brand 금지어는 source host 라벨에서 유도되고, 사람/고객사
증거는 Task 19 imageBrief에서 조인된다.

```
Stored lineage artifacts (불변): asset-catalog.json · generated-styles.css url()
· template slots.json(image slots) · content-run imageBriefs
· observation rendered.html head (favicon / og:image / font preload)
  ↓ pnpm assets:inventory    Asset + Font Inventory (분류 포함; 유일한 네트워크는
  |                          opt-in @font-face CSS fetch — 저장 artifact에 없음)
  ↓ pnpm assets:materialize  SSRF-hardened fetch → /media/<sha256>.<ext>
  |                          (safe + recommended만; required/license는 fetch 0)
  ↓ pnpm assets:preview      serve-boundary Asset Proxy (/media serve + URL rewrite)
  ↓ pnpm assets:qa           browser QA (runtime 요청 census + fallback font reflow)
```

**신규:** `src/assets/` (13 files) + 4 CLI + `pnpm smoke:assets` (111
checks) + stripe artifact: `asset-inventories/2026-08-19T05-54-47-361Z` ·
`asset-materializations/2026-08-19T05-54-55-204Z` (media 230 files,
report/network-qa.json, report/font-qa.json 포함).

## Executive Summary

> 저장된 lineage artifact에서 **721개 자산 참조**(URL 347 + inline-SVG
> 374)와 **3개 폰트 URL + 3개 @font-face 규칙**을 인벤토리했다. 분류는
> 구조적으로 보수적이다: 긍정 증거(keep-default brief)가 있어야
> safe(4), 증명 안 되면 recommended(289, fetch하되 교체 플래그), 브랜드
> 마크·실존 인물·고객사 자산은 required(51, **fetch 자체를 안 함** —
> webp 파생본까지 sibling escalation으로 승격), 폰트는 전부
> license-needs-review(3, **자가호스팅 0, 라이선스 추측 0**).
> SSRF-hardened fetcher(연결 전 DNS 검증 + 검증된 주소로 연결 고정 +
> redirect hop마다 전체 재검증 + streaming byte cap + MIME gate)가
> **278/278 fetch, 실패 0** — 230개 고유 파일 57.5 MB가
> `/media/<sha256>.<ext>`로 저장됐다. serve boundary asset proxy를 통한
> 실브라우저 측정: 3개 route에서 원본 호스트 런타임 요청 **baseline 31 →
> independent 4** — 잔존 4건은 전부 `/`의 replacement-required 표면
> (고객사 로고·인물 사진·브랜드 제품 스크린샷)으로, 운영자 교체 입력을
> 기다리는 것이 정직한 상태다. fallback 폰트의 실측 비용: 진짜 webfont를
> 얹으면 264개 텍스트 요소 중 93개가 움직이고 width Δ p95 12.2px,
> docHeight Δ **0px**. **READY FOR PRODUCTION BUILD WITH INPUT
> REQUIREMENTS.**

## Asset Inventory (A) — 저장 증거만 읽는다

입력은 accepted lineage의 저장 artifact뿐이다. 각 참조가 어디서 왔는지
(origin)가 항목마다 기록된다:

| origin | 내용 | 수 |
| --- | --- | ---: |
| asset-catalog | SiteSpec asset-catalog.json (img/srcset/picture-source/inline-svg/icon/video source/background-image) | 710 |
| generated-css-url | 생성된 stylesheet의 `url()` (catalog에 이미 있으면 중복 생성 안 함) | 1 (+1 dedup) |
| head-favicon | rendered.html `<link rel*=icon>` — **SiteSpec은 head를 모델링하지 않아 여기서만 복원 가능** | 3 (+1 catalog icon과 dedup) |
| head-og-image | rendered.html og:image/twitter:image | 8 |
| head-font-preload | rendered.html `<link as="font">` | 3 |
| **합계** | 721 entries (URL 347 · inline-SVG 374) | |

- 호스트: images.stripeassets.com 339 · b.stripecdn.com 3 ·
  assets.stripeassets.com 1 · videos.stripeassets.com 1 (+ 잘린 host 3).
  same-origin 자산 **0** — 전부 원본 CDN 의존이었다.
- **truncated 15**: Observer의 500자 attribute cap이 srcset을 자르며 남긴
  조각(`https://images.st/`, `…/fzn2n1nzq`). 판정은 증거 기반 —
  다른 인벤토리 URL의 strict prefix이면서 연속 문자가 `?`/`&`/`#`(쿼리
  파생본 경계)가 아닌 것 + 정규화가 숨긴 host-level 절단(`images.st`가
  다른 host의 mid-token prefix). fetch 불가로 기록되고 시도되지 않는다.
- 템플릿 image slot 조인 128, Task 19 imageBrief 조인 28.

## Source Brand Asset Classification (E) — 보수가 기본값

결정론적 rule list, first-match-wins, 결정마다 ruleId + evidence 기록.
`classification.json`:

| class | 수 | 주요 rule |
| --- | ---: | --- |
| safe-to-materialize | **4** | image-brief-keep-default 4 (장식적 wave 배경 — 긍정 증거가 있을 때만) |
| replacement-recommended | **289** | default-conservative 269 · image-brief-replace-recommended 4 · video 1 · truncated 15 |
| replacement-required | **51** | image-brief-warning 20 (실존 인물 KurtisMoyer·고객사 Hertz·브랜드 제품 스크린샷) · **sibling-variant-escalation 19** · brand-social-card 8 · brand-favicon 4 |
| license-needs-review | **3** | font-license-unknown 3 |

- **required는 auto-approve되지 않는다**: fetch 자체를 하지 않는다.
  favicon(브랜드 마크) 4종, og/소셜 카드 8종(`Stripe.jpg` 포함), logo
  파일명 패턴, brief warning이 있는 자산 전부.
- **sibling-variant escalation** (이번 QA가 잡아낸 실제 갭): 같은
  host+pathname의 webp 파생본(`KurtisMoyer.png?w=48&fm=webp`)이 brief
  조인을 벗어나 default-conservative로 빠지는 것을 관측했고, "인물 사진의
  webp 렌디션도 인물 사진"이라는 상향 전용 에스컬레이션을 추가했다(완화
  방향 전파는 없음). 첫 QA의 residual 0은 이 갭의 산물이었고, 수정 후
  residual 4가 정직한 수치다.
- inline-SVG 374건은 분류 대상이 아니다: 마크업이 이미 로컬이고(fetch할
  것이 없음) SVG 브랜드 페인트는 17.1 이래 template 계층의 명명된
  한계다. counts에 별도 집계된다.

## Safe Asset Fetcher (B) — SSRF는 구조로 막는다

`src/assets/safe-fetch.ts`. 전부 smoke로 증명(45 checks):

- http/https만; URL 내 credential 거부; 표준 포트만(테스트 전용 명시
  escape hatch 제외).
- **연결 전 DNS resolve, 모든 resolved 주소가 public이어야 한다**:
  10/8 · 172.16/12 · 192.168/16 · 127/8 · 0/8 · **169.254/16 (metadata
  endpoint 169.254.169.254 포함)** · 100.64/10 CGNAT · multicast/reserved
  · IPv6 `::1`/link-local/ULA/multicast · IPv4-mapped(`::ffff:10.0.0.1`)
  전부 거부. dual-resolution(공인+사설 혼합)은 **하나라도 사설이면
  거부**.
- **연결은 검증된 resolution 결과에 고정된다**(custom lookup): 검증 후
  재-resolve로 바꿔치기하는 TOCTOU가 구조적으로 불가능.
- **redirect는 수동으로 따라가며 hop마다 전체 검증 재실행** — smoke가
  metadata endpoint로의 redirect, 사설 IP로 resolve되는 host로의
  redirect, allowlist 밖으로의 redirect가 각각 거부됨을 증명.
- streaming byte counter — cap 초과 1바이트에 socket destroy(사후 truncate
  아님); Content-Type이 기대 자산 종류와 불일치하면 `mime-rejected`;
  redirect 상한; 전체 deadline; **host allowlist = 인벤토리가 관측한
  호스트 집합 그대로**(다른 곳을 가리킬 수 없음); concurrency 2 + 요청
  간 spacing 100ms.

## Content Hash Storage (C) + Rewrite (D)

Materialization run `asset-materializations/2026-08-19T05-54-55-204Z`:

| 항목 | 값 |
| --- | ---: |
| 후보 (safe + recommended, truncated 제외) | 278 |
| **fetched** | **278/278 (실패 0)** |
| skipped-by-classification (required 51 + license 3) | 54 |
| skipped-truncated | 15 |
| 고유 media 파일 (`/media/<sha256>.<ext>`) | 230 (57.5 MB) |
| rewrite entries | 278 |
| replacement-seam entries | 340 (recommended 289 + required 51) |

- 확장자는 URL이 아니라 **응답 MIME**에서 온다(`.png` URL이 JPEG를
  serve하면 `.jpg`로 저장 — 실측 사례 존재). 동일 바이트는 URL이 달라도
  한 파일로 collapse (278 fetch → 230 files).
- **Rewrite는 serve boundary에서** (Task 20/21 전례, 불변 app 무수정):
  proxy가 `/media/*`를 immutable cache header로 serve하고, HTML·RSC
  flight(`text/x-component` 포함)·generated stylesheet 응답에서
  materialized URL을 **raw / `&amp;` / `&` 세 인코딩 전부** 치환한다.
  긴 URL 우선 정렬로 쿼리 렌디션의 prefix-clobber를 방지(smoke 증명).
  theme overlay CSS append와 같은 proxy에서 합성 가능: Template →
  Content(env) → **Asset(rewrite+/media)** → Theme(css append) → SEO(head
  splice) → Render.
- favicon·og:image rewrite: 이 delivery 경로에서 두 표면은 **원본이 아예
  방출되지 않는다** — clone head에는 favicon link가 없고(SiteSpec이 head
  비모델링) og:image는 Task 21 plan에서 needs-input(미방출). 치환할
  occurrence 0을 확인했고, 해당 자산들은 required로 분류되어 운영자
  입력 대기 상태로 기록된다.

## Image Replacement Seam (J)

`replacement-manifest.json` 340 entries — 각 항목: inventoryId ·
sourceUrl · classification · **template slot keys** · **조인된 Task 19
imageBrief**(subject/mood/purpose/warning) · `replacement: {status:
"awaiting-input", providedFile: null, providedBy: null}`. 운영자가 교체
이미지를 공급하면 이 seam을 채워 재-materialize하는 것이 공식 경로다.
이 repo는 이미지를 생성하지 않는다(19의 원칙 유지).

## Font Inventory (F) + License Safety (G)

**저장 artifact 어디에도 @font-face가 없다** — Observer는 computed
style을 기록하고, 규칙은 원본 외부 CSS에 산다. clone의 stylesheet에는
`font-family: sohne-var, "Helvetica Neue", …` 선언 7,473개가 있지만
`sohne-var`를 정의하는 곳이 없어 **clone은 처음부터 fallback으로 렌더해
왔다**(17.1의 mobile font-fallback reflow 한계의 원인). 즉 폰트 호스트
런타임 의존은 이미 구조적으로 0이었고, 남은 문제는 충실도다.

- font URL 3종: rendered.html preload 증거 (`Sohne.cb178166.woff2` ·
  `SourceCodePro-Medium.f5ba3e6a.woff2` — b.stripecdn.com
  mkt-ssr-statics · `f965fdf4.woff2` — mkt-statics-srv).
- @font-face 규칙: **opt-in bounded live fetch** (`--live-font-css`,
  rendered.html이 참조하는 stylesheet 상위 5개, safe fetcher 경유)로
  3개 복원, provenance `live-fetched` 명시: `sohne-var` weight 1–1000
  woff2-variations (display block/swap 2종) + `SourceCodePro` w500.
  `f965fdf4.woff2`는 fetch한 5개 CSS에 규칙이 없어 **미복원으로 기록**
  (발명 없음).
- **license**: `sohne-var`(Söhne)·`sourcecodepro` 모두
  `license-needs-review`, `selfHostApproved: false`. 검증 메커니즘이
  없으므로 추측하지 않는다 — **이 태스크는 폰트를 자가호스팅하지
  않는다** (font-qa의 측정용 in-memory 사용이 유일한 접촉, 저장 0).
- fallback plan (관측 stack에서 유도): `sohne-var` → `"Helvetica Neue",
  Arial, sans-serif` (7,473 declarations) · `sourcecodepro` →
  `sans-serif` (1).

## Fallback Font QA (H) — 숫자로

원본 폰트 CDN이 CORS header를 안 보내므로(실측: ACAO 없음) 브라우저
@font-face 직접 로드는 불가 — safe fetcher로 바이트를 받아 **data: URL로
주입**(측정 전용, 저장 안 함). `report/font-qa.json`:

| 측정 | 값 |
| --- | --- |
| webfont 로드 | sohne-var LOADED · SourceCodePro LOADED |
| app reflow (`/`, fallback 상태 → 진짜 webfont 적용 후 동일 264 요소 재측정) | **93/264 요소 변화** |
| width Δ | p50 0 / p95 **12.2px** / max **79.4px** |
| height Δ | p50 0 / p95 3.8px / max 23.2px |
| docHeight Δ | **0px** (14,644 → 14,644) |
| 격리 샘플 (동일 문자열, 16/32/48px) | sohne-var vs fallback stack **+0.05%** width · SourceCodePro vs sans-serif **−20.9%** |

해석은 기록만 한다: 본문 폰트의 fallback은 폭 기준 p95 12px 수준의 국소
reflow이고 문서 높이는 불변; 코드 폰트의 sans-serif fallback은 −20.9%로
크지만 해당 스택은 선언 1개뿐이다.

## Runtime Network QA (I) — 정직한 잔존 수

asset-independent serve(proxy + content overlay) vs baseline(무개입
upstream), 실제 Chromium, route별 요청 census, lazy-load 유발 스크롤
포함. `report/network-qa.json`:

| route | baseline source-host | independent source-host | independent local | other-external |
| --- | ---: | ---: | ---: | ---: |
| `/` | 19 | **4** | 23 | 0 |
| `/industries/media-entertainment` | 8 | **0** | 16 | 0 |
| `/customers/hargreaves-lansdown` | 4 | **0** | 12 | 0 |
| **합계** | **31** | **4** | | |

잔존 4건 전원 명단 (전부 images.stripeassets.com, 전부
replacement-required, 전부 `/`): `ConnectBentoBackground.jpg` ·
`enterprise-accordion-hertz.png` · `KurtisMoyer.png` ·
`payment-bento-background.jpg` — 고객사/인물/브랜드 제품 표면이라 fetch가
금지된 것들이다. **잔존 0을 만드는 유일한 정당한 경로는 운영자 교체
입력이다.** independent serve가 baseline보다 잔존이 많아지면 exit 2로
FAIL하는 gate가 CLI에 있다(이번 run은 31→4로 PASS).

## Smoke Tests

신규 `pnpm smoke:assets` — **111/111 PASS**. 전부 public barrel
(`src/assets/index.js`) 경유, 합성 fixture를 진짜 API로 통과:

- **fetcher 안전 45 checks**: private range 판정 20종(경계값
  172.31.255.255/172.32.0.1, metadata 169.254.169.254, CGNAT,
  IPv4-mapped IPv6 포함) · scheme/credential/port/allowlist 거부 ·
  주입 lookup으로 사설 resolve/dual-resolution 거부(네트워크 0) ·
  loopback은 테스트 escape hatch 없이는 거부 · 로컬 fixture로 fetch
  성공/redirect chain 기록/**metadata redirect hop 거부**/**사설 resolve
  redirect hop 거부**/allowlist 이탈 redirect 거부/redirect loop/
  **streaming size cap**/**MIME 거부**/404/timeout.
- 인벤토리+분류 22: truncated prefix·host-level·쿼리 파생본 비오탐,
  slot/brief 조인, R1–R10 + sibling escalation, byte-determinism(동일
  runId 2회 실행 파일 바이트 동일), zod round-trip.
- 폰트 10: familyUsage/webfontUndefinedInClone/fallback plan/license
  전원 needs-review/live @font-face fetch(상대 URL resolve 포함).
- materialization 15: sha256 저장·바이트 dedup·MIME 확장자·**required와
  font의 fixture hit 0 증명**(fetch 안 했음을 서버 카운터로)·rewrite
  map·replacement seam·http-error 정직 기록.
- rewrite+proxy+브라우저 17: 3-인코딩 치환, prefix-clobber 방지,
  /media serve(content-type·바이트), theme overlay 공존, 비-HTML byte
  passthrough, **Chromium이 /media에서 이미지를 로드하고 원본 자산
  URL로의 요청 0 + naturalWidth>0**.

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
| smoke:seo | 72/72 |
| **smoke:assets (신규)** | **111/111** |
| **합계** | **1,585/1,585 PASS** (81+81+58+92+108+88+252+205+134+130+58+68+47+72+111) |

(Task 21 baseline 14 suites/1,474 + 신규 111 = 15 suites/1,585.
`smoke:playwright`는 종전과 동일하게 Phase-1 환경 검사로 집계 제외.)

## Historical Integrity

- frozen lineage 8개 디렉토리(site-spec · reconstruction · template ·
  content run · theme extraction · augmented observation · SEO snapshot ·
  SEO plan) 전부 **작업 시작 이후 mtime 파일 0** (find로 확인). QA의
  `next start`는 기존 BUILD_ID 재사용.
- 신규 산출물은 새 네임스페이스(`asset-inventories/` ·
  `asset-materializations/`)에만 썼다. 이번 태스크 내부에서 rule 개선으로
  superseded된 중간 run 2쌍은 삭제했다(과거 태스크 artifact 아님).
- Git add 0 / commit 0 / push 0 (repo는 여전히 2777b41 단일 커밋).

## Known Limitations

- **serve-boundary proxy는 MVP 전달 방식** (Task 20/21과 동일) — media
  디렉토리를 app `public/`으로 굽고 빌드 산출물에 rewrite를 정적으로
  적용하는 것은 Task 23 몫. rewrite-map.json과 media/는 그대로 재사용
  가능하다.
- **잔존 4건은 남는다(의도)** — replacement-required 표면은 운영자
  입력 없이는 로컬화되지 않는다. 20 route 중 QA는 3 route 표본(자산
  밀도 상위)이고 나머지 17 route의 잔존 수는 미측정 — 단 required 51건
  중 render되는 것만 잔존이 될 수 있다.
- **inline-SVG 374건(원본 로고 포함)은 이 계층 밖** — 마크업은 이미
  로컬이라 네트워크 의존은 없지만 브랜드 콘텐츠 검토는 template 계층의
  명명된 한계(svg-internal-paint, 17.1)와 함께 남는다.
- **truncated 15건은 영구 fetch 불가** (Observer 500자 cap) — 전부
  srcset 파생본이며 compile 시 drop되어 런타임 요청은 관측되지 않았다.
- **분류는 rule 기반 보수** — 인물/고객사 판정은 Task 19 brief(homepage
  scope)에 의존한다. brief가 없는 route의 사진은 recommended로
  materialize + 플래그되며, 사람이 검토하지 않았다. 이것이 recommended가
  289인 이유다(전수 인간 검토는 비목표).
- **폰트 자가호스팅 0** — 라이선스 미검증(sohne-var는 상용 폰트로
  추정되나 추측을 기록하지 않는다). clone은 종전대로 fallback 렌더;
  실측 비용은 font-qa.json에 있다. `f965fdf4.woff2`의 @font-face는
  미복원(fetch한 5개 CSS에 없음).
- **font/network QA는 표본** — font reflow는 `/` 1 route(264 요소),
  network census는 3 route × desktop 1440 viewport(스크롤 lazy-load
  유발 포함). 모바일 viewport 미측정.
- **video poster 0건, `<source media>` 미저장** — 관측 artifact에 poster
  attribute가 없고 source의 media attribute는 Observer whitelist 밖.

## Input Requirements (운영자 입력 대기)

1. **replacement-required 51건의 교체 이미지** — 특히 지금 render되는
   잔존 4 표면(고객사 로고·인물 사진·제품 스크린샷)과 favicon 4종 +
   og/소셜 카드 8종. `replacement-manifest.json` + Task 19 imageBrief가
   spec을 이미 담고 있다.
2. **폰트 결정** — sohne-var/SourceCodePro 라이선스 확인 후 자가호스팅
   승인, 또는 fallback 확정(측정치 있음), 또는 open-license 대체 폰트
   선택.
3. (Task 21에서 인계된 것 그대로) production 도메인·og:image·조직 로고.

## Next Phase Readiness

Task 23 Production Build가 소비할 것: `media/` 디렉토리(content-hashed,
immutable-cacheable) + `rewrite-map.json`(정적 baking의 입력) +
replacement seam. proxy 합성 순서(Content → Asset → Theme → SEO)는
serve.ts 주석에 명세되어 있고, 정적 baking은 같은 rewrite 함수
(`applyRewrite`)를 빌드 산출물에 적용하면 된다. 잔존 4건과 폰트
fallback은 입력이 제공될 때까지 Task 24 acceptance에서 named limitation으로
다뤄야 한다.

## Final Verdict

**READY FOR PRODUCTION BUILD WITH INPUT REQUIREMENTS**

— 자산 인벤토리·보수 분류·SSRF-hardened fetch·content-hash 저장·serve
boundary rewrite가 전부 작동하고(278/278 fetch, 브라우저 실측 31→4),
폰트는 라이선스를 추측하지 않은 채 fallback 비용이 수치로 기록됐으며,
남은 원본 의존 4건은 전부 운영자 교체 입력이 필요한 브랜드/인물 표면으로
구조적으로 식별·기록되어 있기 때문이다.
