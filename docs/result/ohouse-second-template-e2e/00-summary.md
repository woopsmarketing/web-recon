# OHOUSE SECOND TEMPLATE E2E — 종합 보고서

작성: MASTER (Claude Opus 5.5, xhigh) · 2026-10-09 · 대상 `https://www.ohouse.kr/`
작업 폴더: `/Users/woops/projects/web-recon-track-b` · COMMIT = NO · PUSH = NO · remote publish 없음

```
OHOUSE_SECOND_TEMPLATE_E2E = PASS   (단, §0과 §13의 차이를 owner가 확인해야 합니다)
```

## 0. 먼저 알아야 할 것

1. **대상 사이트는 "오늘의집"이 아닙니다.** prompt 본문은 대상을 "오늘의집"이라 부르지만 `https://www.ohouse.kr/`는
   대구의 인테리어 시공사 **동그라미하우스(STANDARD OF INTERIOR)** 사이트입니다(오늘의집은 `ohou.se`).
   URL이 TARGET으로 명시돼 있고 interior vertical에도 맞아 URL 기준으로 진행했습니다.
   `[PIPELINE_ARTIFACT_CONFIRMED]` observer의 `document-response.html` title / og:title.
2. **결과물**: 두 번째 authored template `interior-02`(8개 route)와 가상 브랜드 fixture 사이트
   `ongyeol-interior-demo`(온결 인테리어). `platform/` 런타임과 `interior-01`은 수정하지 않았습니다.
3. **가장 큰 차이는 글꼴입니다.** 원본은 웹폰트(Montserrat / S-Core Dream)를 쓰지만 플랫폼은 웹폰트를 실을 수
   없어 방문자 기기의 시스템 글꼴로 그려집니다. 레이아웃·비율·간격은 맞췄지만 글자 인상은 다릅니다(§13).
4. 기본 테마가 원본의 3색(노랑·민트·네이비)을 그대로 따릅니다. 운영 전에 owner가 정해야 할 값입니다(§12).

## 1. 필수 필드

```
MODELS
  MASTER_MODEL                    = claude-opus-5-5
  MASTER_THINKING                 = xhigh
  SUBAGENT_MODEL_REQUESTED        = Fable 5.1 xhigh
  SUBAGENT_MODEL_ACTUAL           = claude-fable-5-1 (모든 subagent가 스스로 보고한 값)
  SUBAGENT_MODEL_SELECTION_SUPPORTED = YES (Agent tool의 model: "fable", effort: "xhigh")

REPO
  START_HEAD  = dafa8760a77ec1b1b4010106d1e027b43a5d9874
  BRANCH      = track-b/static-deployment-foundation
  START_TREE  = clean (tracked 변경 없음)

DISCOVERY
  METHOD           = Playwright 공개 탐색 → 기존 buildDiscoveryResult → verify → select
                     (FIRECRAWL_AVAILABLE = NO: 이 폴더에 FIRECRAWL_API_KEY 없음)
  DISCOVERED_URLS  = 242 (same-site 고유 URL; 외부 포함 href 281)
  VERIFIED_URLS    = 99 / 99 valid-html (pipeline 상한 100에 맞춘 후보)
  PAGE_FAMILIES    = pipeline 52개 → MASTER가 레이아웃 기준 7개 family로 정리
  SELECTED_PAGES   = / · /portfolio/lists · /portfolio/view/1621 · /lineup/service ·
                     /company/about · /support/faq · /consult/ohouse

OBSERVATION
  PIPELINE_OBSERVATIONS          = 7 (observe --source-package, 대표 페이지당 1회, desktop+mobile)
  MANUAL_PLAYWRIGHT_OBSERVATIONS = 5개 관찰 에이전트 (B, C1, C2, F, G)
  RESPONSIVE_WIDTHS              = 320 360 390 640/641 768 800/801 860/861 920/921 960/961
                                   1024/1025 1080 1280/1281 1341/1382 1440 1500/1501 1800/1801 1920
  INTERACTIONS                   = §4.3 표 (27건)

REFERENCE
  SOURCE_PACKAGE          = 7개 (data/www.ohouse.kr/<run>/…/source-package, git-ignored)
  PRESERVATION_CLONE      = HOME 1개 (preserve:build → preserve:sanity = SANITY OK), 참고용
  RUNTIME_FORENSIC_USED   = NO
  RUNTIME_FORENSIC_REASON = 기본 OFF. 레이아웃·반응형·인터랙션을 관찰과 source package로 충분히 확인함

TEMPLATE
  TEMPLATE_ID         = interior-02 (version 1.0.0)
  TEMPLATE_PATH       = templates/interior-02/v1/
  PLATFORM_CHANGES    = platform/ 런타임 0건. 테스트만: slice1.test.ts, step6.test.ts(단정 확대),
                        interior-02.test.ts(신규), package.json test:platform 체인에 1개 추가
  INTERIOR_01_CHANGED = NO

SOURCE ISOLATION
  BRAND_LEAK                = NO
  SOURCE_RUNTIME_DEPENDENCY = NO
  SOURCE_API_DEPENDENCY     = NO
  SOURCE_HOST_DEPENDENCY    = NO
  REMOTE_SOURCE_ASSETS      = NO

QA
  TYPECHECK          = PASS (platform tsconfig exit 0, 루트 tsc --noEmit exit 0)
  TESTS              = PASS (platform 16 suites 실패 0 + portfolio 2 suites 실패 0)
  RELEASE_GATE       = PASS (source-isolation: 102 files × 금지어 8개 · template-code-rules)
  SITE_BUILD         = PASS (release interior-02-1.0.0-dbfa5d41678d → package 7729ea16…, HTML 23쪽)
  PACKAGE_QA         = PASS (qaStaticPackage, 213 files / 11.5 MB)
  BROWSER_QA         = PASS (77쪽 sweep 문제 0 · 모바일 폭 28조합 정상 · 인터랙션 스크립트 통과)
  VISUAL_QA          = PASS_WITH_KNOWN_GAPS (MASTER 육안 대조, 수치 없음 — 글꼴·사진이 다름)
  INDEPENDENT_REVIEW = BLOCKER 0 · MAJOR 2 → 둘 다 수정하고 재검증

LOCAL
  LOCALHOST_URL          = http://127.0.0.1:4321/
  READY_FOR_OWNER_REVIEW = YES
```

## 2. 근거 표기

`[CODE_CONFIRMED]` 코드에서 확인 · `[PIPELINE_ARTIFACT_CONFIRMED]` 기존 pipeline 산출물 ·
`[BROWSER_OBSERVED]` MASTER가 브라우저/스크린샷으로 확인 · `[SUBAGENT_REPORTED]` subagent 보고(MASTER 미확인) ·
`[MASTER_INFERENCE]` MASTER 추론 · `[IMPLEMENTED_BY_CLAUDE]` 이번에 구현. 확인하지 못한 것은 UNKNOWN으로 적었습니다.

## 3. Discovery와 대표 페이지

- Firecrawl 키가 이 폴더에 없어(`.env` 없음, 키는 사용 금지 폴더에만 존재) Playwright 공개 탐색으로 대체했습니다.
  `[CODE_CONFIRMED]` `src/discovery/firecrawl.ts:29-32`는 키가 없으면 예외를 던집니다.
- 탐색 결과를 기존 `buildDiscoveryResult` / `saveDiscovery`에 넣어 `discovery.json`을 만들고(provider
  `playwright-public-navigation`), 기존 `verify`, `select`를 그대로 실행했습니다.
  `[PIPELINE_ARTIFACT_CONFIRMED]` `data/www.ohouse.kr/2026-10-08T15-31-34-641Z/{discovery,verification,verified-urls,page-families,selected-pages,route-archetypes}.json`
- robots.txt `Allow: /`, sitemap 404, 접근 차단·CAPTCHA 없음. `[SUBAGENT_REPORTED]`
- 기존 selector는 52개를 골랐습니다(authored template에는 과다). MASTER가 레이아웃 family로 7개로 줄였습니다.
  `[MASTER_INFERENCE]` — 근거: 탐색 에이전트의 레이아웃 분류와 MASTER가 본 스크린샷.

| family | 대표 URL | 템플릿 route |
|---|---|---|
| A home | `/` | `/` |
| B 필터 목록 | `/portfolio/lists` | `/portfolio`, `/portfolio/page/[n]` |
| D 상세 | `/portfolio/view/1621` | `/portfolio/[slug]` |
| C 섹션 랜딩 | `/lineup/service` | `/service` |
| E 정보 랜딩 | `/company/about` | `/about` |
| F LNB 서브페이지 | `/support/faq` | `/faq` |
| G 폼 | `/consult/ohouse` | `/contact` |

제외: 자재 카탈로그(`/material/*`), 실시간 현장(`/workplace/*`) — 플랫폼 collection이 `projects`뿐이라 표현할 수 없음(§13).

## 4. Observation

### 4.1 Pipeline 관찰 `[PIPELINE_ARTIFACT_CONFIRMED]`

`observe <url> --source-package`를 대표 7페이지에 실행(각각 desktop + mobile source package).
run: `2026-10-08T15-26-57-596Z`(HOME) · `15-38-36-402Z`(목록) · `15-40-11-815Z`(상세) · `15-41-44-298Z`(서비스) ·
`15-43-06-778Z`(소개) · `15-45-20-353Z`(FAQ) · `15-46-28-706Z`(상담). HOME source package: desktop 90 files / 3.62 MB,
mobile 92 files / 3.92 MB.

### 4.2 반응형: WIDTH / OBSERVED_CHANGE / TEMPLATE_DECISION

WIDTH는 넓은 쪽 상태의 첫 폭입니다(원본 CSS는 `max-width: WIDTH−1`). `[SUBAGENT_REPORTED]` 측정,
641·1025·1281·1501 전환과 390/768/1024/1440 화면은 `[BROWSER_OBSERVED]`.

| WIDTH | OBSERVED_CHANGE (원본) | TEMPLATE_DECISION |
|---|---|---|
| 641 | 헤더 52→60, 하단 탭바 사라짐, 서브페이지 "← 제목" 바 → 로고, 카드 1→2열, 히어로 58vh→60vh, 섹션 간격 100→120, 목록 그리드 1→2열, 상세 모바일 커버 숨김 | `max-width: 640` breakpoint로 동일 구현 |
| 801 | 소개 통계 1열→6열, 연혁 2→3장, 서비스 팀 행 | `max-width: 800` |
| 861 | 쇼룸 슬라이더→4열 그리드, 푸터 CTA 2단, 서비스 카드 2→3열 | `max-width: 860` |
| 921 | "지금 이 순간" 카드 1→3열 | `max-width: 920` |
| 961 | 라인업 타일 세로→3열, 하단 버튼 hover 전용 | `max-width: 960` |
| 1025 | 헤더 60→70, 프로모 타일 2단, 키워드 칩이 제목 줄로, 히어로 100vh, 목록 off-canvas 필터→고정 사이드바, 상세 그리드 3→4열, FAQ 칩 스크롤→줄바꿈, 상담 필드 1→2열 | `max-width: 1024` |
| 1281 | 햄버거→전체 내비, `html` 15→16px, 카드 2→3열, 섹션 간격 120→160, 상세 2단 헤드 + 고정 견적 aside, FAQ 탭 띠→고정 사이드 메뉴, 상담 aside 좌측 배치 | `max-width: 1280` |
| 1341–1381 | media query 아님: 내비가 로고 옆에 안 들어가 헤더가 2줄(140px)로 접히는 우연 | **재현하지 않음**(레이아웃 사고로 판단) |
| 1501 | 유동 컨테이너→1440 고정, 좌우 여백 20→48 | `max-width: 1500` |
| 1801 | 푸터 정보 블록 max-width 1220→1380 | 재현하지 않음(차이 미미) |

원본은 360–1920 어느 폭에서도 가로 overflow가 없었고, 템플릿도 320–1920에서 0입니다(§9).

### 4.3 인터랙션

형식: SOURCE_PAGE / ACTION / EXPECTED / OBSERVED / EVIDENCE_SCREENSHOT / RELEVANCE_TO_TEMPLATE.
증거 파일은 `data/www.ohouse.kr/manual-observation/<에이전트>/` 아래에 있습니다(§5).

| # | SOURCE_PAGE | ACTION | EXPECTED | OBSERVED | EVIDENCE_SCREENSHOT | RELEVANCE_TO_TEMPLATE |
|---|---|---|---|---|---|---|
| 1 | / | 대기 | 히어로 자동 전환 | 4000ms 체류 + 500ms 이동, 진행 바 4s linear | C2/02-hero-t0, 02-hero-t20 | `Carousel` autoplay(타이머 없이 CSS animationend) |
| 2 | / | 다음/정지 클릭 | 1장 이동 / 정지 | 정확히 1장 ~510ms, 정지 시 바 멈춤, hover로는 안 멈춤 | C2/02-hero-after-next, 02-hero-after-stop | 동일 동작 구현 |
| 3 | / | 스크롤 | 헤더 변화 | 떠 있는 카드형 → 고정 바 | C2/03-header-scrolled-2000 | `HeaderFrame` sentinel |
| 4 | / | 카드 hover | 강조 | 이미지 1.05(.2s), 배지가 한 글자→전체 이름 | C2/04-project-card-after-hover | `ProjectCard` |
| 5 | / | 키워드 칩 클릭 | 목록 교체 | 제자리 교체, 스크롤 불변, "더 보기" 링크 대상 변경 | C2/04-keyword-chip-after | 칩 = 사이트가 정한 필터, 빌드 시 평가 |
| 6 | / | 키워드 슬라이더 다음 | 이동 | 3장 보기(≤1024 1장), 3000ms 자동, 단계형 진행 바 | C2/04-keyword-after-next | `Carousel progress="steps"` |
| 7 | / | 서비스 섹션 진입 | reveal | 기기 이미지 2장이 세로로 들어옴(1회, .35s) | C2/04-mup-after | `Reveal`(IntersectionObserver) |
| 8 | / (390) | 햄버거 | 드로어 | 오른쪽에서 전체 화면 패널(.25s), 스크롤 잠금, 햄버거가 X로 | C2/05-m-drawer-open | `MenuDrawer` |
| 9 | / (390) | 위로 스크롤 | 탭바 변화 | scrollTop>300에서 위로 스크롤하면 탭바가 내려가 숨음, 아래로 가면 복귀 | C2/05-m-scrolling-up-1000 | `TabBar` |
| 10 | / (390) | 히어로 swipe | 1장 이동 | 1장 이동 | C2/05-m-hero-after-swipe | `Carousel` swipe |
| 11 | 목록 | 체크박스 클릭 | 필터 | 즉시 제자리 적용(XHR), 이동 없음 | F/list-1440-inter-checkbox-after | 클라이언트 필터(네트워크 없음) |
| 12 | 목록 | 정렬 탭 | 재정렬 | 제자리 재정렬, 활성 표시 이동 | F/list-1440-inter-sort-after | 플랫폼 정렬 어휘 6종 |
| 13 | 목록 | 끝까지 스크롤 | 추가 로드 | 31장씩 자동 추가(무한 스크롤) | F/list-1440-inter-infinite-after | 내장 데이터에서 batch 노출 + 정적 pagination 대체 경로 |
| 14 | 목록 | 스크롤 | 사이드바 | viewport y=150에 고정 | F/list-1440-inter-sticky-2500 | sticky 사이드바 |
| 15 | 목록 (390) | 필터 버튼 | 패널 | 왼쪽에서 전체 화면 패널(.25s), 스크롤 잠금 | F/list-390-inter-filter-* | off-canvas dialog |
| 16 | 상세 | 칩 클릭 | 사진 필터 | 제자리 13→2장 | F/detail-1440-inter-chip-after | `ProjectGallery` |
| 17 | 상세 | 보기 전환 | 그리드↔1열 | 1열, 원본 비율, 간격 18 | F/detail-1440-inter-viewby-list | 동일 |
| 18 | 상세 | 타일 클릭 | 뷰어 | 전체 화면, "1/13", 이전/다음, 썸네일, Esc 닫기 | F/detail-1440-inter-tile-click-open | 자체 `<dialog>` 뷰어 |
| 19 | 상세 | 스크롤 | aside | 견적 aside가 y=150에 고정, 본문 끝에서 해제 | F/detail-1440-inter-sticky-1500 | sticky aside |
| 20 | 상세 (390) | 견적 토글 | 접기 | 행 접힘, chevron 뒤집힘(.2s) | F/detail-390-inter-estim-after | `TotalBlock` |
| 21 | 서비스 | 타일 hover | 버튼 | 하단 버튼 fade(.15s), 좌우 테두리 색 | G/service-1440-tile-hover-after | hover/focus-within |
| 22 | 소개 | 통계 진입 | count-up | 0→값 ≈0.8s | G/about-1440-stat-after-count | `CountUp`(rAF) |
| 23 | 소개 | 연혁 다음 | 이동 | 1장 이동, 끝에서 정지(무한 아님) | G/about-1440-slider-after-next | `Carousel loop={false}`(끝에서 정지) |
| 24 | FAQ | 질문 클릭 | 펼침 | 한 번에 하나만, 높이 ≈170–200ms, chevron 회전 | G/faq-1440-acc-after-open | `<details>` 기반 accordion |
| 25 | FAQ | 칩 클릭 | 필터 | 원본은 `?cate=` 페이지 이동 | G/faq-1440-chip-after | 제자리 필터로 변경(정적 export) |
| 26 | 상담 | 범위 박스 클릭 | 다중 선택 | 선택 시 #111 채움 | G/consult-1440-grid-after | 체크박스 그리드 |
| 27 | 상담 | 정책 보기 | 레이어 | 중앙 dialog .25s, 흐린 backdrop | G/consult-1440-privacy-open | 자체 `<dialog>` |

관찰 중 누르지 않은 것: 로그인, 폼 제출, 검색 제출, 우편번호 검색, 상담 신청, 필터 확인/초기화 버튼.

**관찰 예절 기록(숨기지 않습니다)** `[SUBAGENT_REPORTED]`
- 목록 첫 로드에서 원본의 무한 스크롤이 32페이지(976장)를 전부 불러왔습니다.
- 필터 체크박스 클릭은 원본이 자동으로 `POST /api/ohouse/setFilterCount`와 필터 GET을 보냅니다(허용된 클릭의 부수 효과).
- FAQ 칩 클릭은 실제 페이지 이동이라 예정에 없던 로드가 2회 있었습니다.

## 5. Reference

- **Source package** 7개: 위 run 폴더(각 `viewports/{desktop,mobile}/source-package`). 참고 전용.
- **Preservation clone**: `data/www.ohouse.kr/preservation-clones/2026-10-08T15-27-09-098Z/` (HOME, 67 MB).
  `preserve:build` → localized 281 / failed 59(59건은 여전히 원본 host에서 받음) / script 69개 무력화,
  `preserve:sanity` = SANITY OK. **템플릿의 base가 아니라 비교용**입니다.
- **수동 관찰 증거**(스크린샷·측정 JSON·MASTER 정리 노트): `data/www.ohouse.kr/manual-observation/` (git-ignored).
- **Runtime forensic**: 사용하지 않음.
- legacy `src/` 도구는 `observe`, `verify`, `select`, `preserve:build`, `preserve:sanity`만 **증거 수집용**으로 썼습니다.
  템플릿은 legacy `src/`에 의존하지 않습니다(§8).

## 6. Template

`CAN_EXISTING_PLATFORM_SUPPORT_THIS = YES` — 기존 manifest / slot / theme / content / release / build 계약만으로
표현했습니다. `platform/` 런타임 변경 0건.

- **Routes**: `home /` · `portfolio.index /portfolio` · `portfolio.page /portfolio/page/[n]` ·
  `portfolio.detail /portfolio/[slug]` · `service /service` · `about /about` · `faq /faq` · `contact /contact`
- **Sections (21)**: shell 7(`site.seo|header|menu|tabbar|floater|footer|not-found`) · home 8
  (`home.hero|projects|promos|keywords|service|recent|brands|showrooms`) · portfolio 2 · `service.page` · `about.page` ·
  `faq.page` · `contact.page`. manifest는 5개 조각(`manifest/{shell,home,portfolio,pages,support}.ts`).
- **Template이 소유**: 디자인·레이아웃·반응형·인터랙션(`sections/`, `components/`, `styles/*.css`, `i2-` 접두사).
- **Site가 소유**: 콘텐츠(projects, banners, reviews, categories), 정체성, 테마 값, 모든 문구(slot), 이미지(asset).
- **Fixture**: `data/sites/ongyeol-interior-demo/` — 가상 브랜드 "온결 인테리어", 프로젝트 14건(가격 없음 4건,
  가격 범위 2건 포함), 배너 5, 후기 5. 문의 endpoint 없음(실제 lead 전송 불가, 메일 전달 방식만 동작).
  문구는 독립 리뷰 뒤 원본 문장과 닮은 부분을 다시 썼습니다(§9.3).
- **개념 대응**: 원본의 등급 배지 = project `category`(순서대로 노랑/민트/네이비), 히어로 = `banners`,
  "지금 이 순간" = 두 번째 projects selection, 타일·쇼룸·FAQ·연혁·통계 = 번호 붙은 slot.

## 7. Authoring trace (주요 결정)

형식: DECISION / SOURCE EVIDENCE / EXISTING RULE / CLAUDE_DISCRETION / IMPLEMENTATION / CONFIDENCE.

| DECISION | SOURCE EVIDENCE | EXISTING RULE | CLAUDE_DISCRETION | IMPLEMENTATION | CONF. |
|---|---|---|---|---|---|
| 슬라이더 autoplay를 타이머 없이 | C2 히어로 4000+500ms | release gate가 `setTimeout/setInterval` 금지; interior-01 `HeroCarousel` 방식 | 공용 `Carousel` 하나로 히어로·키워드·쇼룸·연관·연혁 처리 | `components/ui/Carousel.tsx` | high |
| 목록 무한 스크롤 → batch 노출 + 정적 pagination | F 목록(31장씩 XHR) | 정적 export, list route `page/[n]` | script 없으면 pagination, 있으면 IntersectionObserver batch | `components/portfolio/PortfolioBrowser.tsx`, `Pager.tsx` | high |
| 필터 그룹 = 플랫폼 필터 어휘 | F 사이드바 6개 그룹 | `@platform/content/project-filter`, URL은 `@platform/site/browser` | 준공연도 그룹 등 어휘에 없는 것은 제외 | `components/portfolio/filterQuery.ts` | high |
| 상세 견적 aside = 총액 + 존재하는 사실만 | F 상세(공종별 14행) | content schema에 공종별 금액 없음; "없는 값은 만들지 않는다" | 평당 단가·면적·기간·범위만 행으로 | `components/portfolio/TotalBlock.tsx` | high |
| 사진 뷰어 자체 구현 | F 뷰어 | 외부 npm 금지 | native `<dialog>` | `components/portfolio/ProjectGallery.tsx` | high |
| 등급 타일·통계·연혁·FAQ = 번호 slot | G 각 섹션 | list slot 없음(interior-01 `point1…6` 방식) | 제목 slot이 비면 항목·블록 미출력 | `manifest/pages.ts`, `manifest/support.ts` | high |
| FAQ 칩 = 제자리 필터 | G FAQ(원본은 페이지 이동) | 정적 export | `<details>` 기반, script 없이도 동작 | `components/support/FaqBrowser.tsx` | high |
| 상담 폼 = 플랫폼 문의 door | G 상담 폼 | `@platform/site/inquiry-client` body 키 고정 | 원본 필드를 door 키에 대응, 우편번호·캡차 제외, "공간유형" select → "희망 시기" | `components/support/InquiryForm.tsx` | medium |
| 4번째 가치 카드·전화번호 색 | G(coral, red) | theme token 24개 고정 | `color.text.primary` 사용 | `styles/pages.css`, `styles/support.css` | medium |
| 밝은 사진 위 흰 글자에 scrim 추가 | 원본은 어두운 사진 | 재사용 템플릿은 사진 밝기에 의존 불가 | 하단 gradient | `styles/home.css`, `shell.css`, `pages.css` | high |
| 2줄 헤더(1281–1381) 미재현 | C1 breakpoints | — | 레이아웃 사고로 판단 | `styles/shell.css` | high |
| 제목 굵기 한 단계 올림 | 원본 display 글꼴이 같은 weight에서 더 굵음 | 웹폰트 불가 | 18px 이상 제목 600→700 | `styles/base.css` `--i2-w-display: 700` | medium |

## 8. Source isolation

- 템플릿 파일 중 원본을 언급하는 것은 `provenance.json` 하나뿐이며 release snapshot에서 제외됩니다. `[CODE_CONFIRMED]`
- 금지어(`ohouse, 동그라미하우스, dongrami, 오스페이스, sketchin, 스케치인, gngnet, 1670-2267`)가 템플릿 파일, 플랫폼
  런타임, lockfile, fixture 데이터, 빌드된 package 어디에도 없습니다. `[CODE_CONFIRMED]` `platform/test/interior-02.test.ts` D·F·J 검사 + `[BROWSER_OBSERVED]` 77페이지 sweep에서 0건.
- 빌드된 package는 원격 스크립트·스타일·이미지·API를 참조하지 않습니다(package QA + 브라우저 off-origin 요청 0건).
- legacy `src/` import 없음, interior-01과 서로 import 없음. 템플릿 전용 정적 파일 없음(이미지는 전부 site asset).
- fixture 사진 51장은 기존 demo 사이트(`boost-interior-demo`)의 AI 생성 사진을 새 id로 복사한 것입니다
  (원본 사이트 사진 아님). 로고·일러스트 SVG는 새로 그렸습니다.
- 금지어 gate는 **문자열**만 봅니다. 숫자로 된 원본 데이터(금액 등)는 gate가 잡지 못하므로 따로 대조했습니다(§9.3-2).

## 9. QA

모든 수치는 **최종 빌드**(release `interior-02-1.0.0-dbfa5d41678d`, package `7729ea16…`)에서 다시 잰 값입니다. 중간 산출물은
지우고 release 1개 · package 1개 상태에서 한 번 더 빌드했습니다(같은 소스에서 같은 releaseHash가 다시 나왔습니다).

| 항목 | 결과 | 근거 |
|---|---|---|
| TYPECHECK | PASS | `tsc -p platform/tsconfig.json` exit 0 · 루트 `tsc --noEmit` exit 0 |
| TESTS | PASS | platform 16 suites 전부 통과(실패 0) — slice1 86 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 34 · predemo 10 · predemo2 9 · ia150 15 · ia151 10 · ia152 14 · integration 85 · detail-facts 26 · preview-parity 13 · **interior-02 11**(신규) |
| | | 추가 실행: portfolio-sync 40 · portfolio-production-truth 12 (실패 0; portfolio-sync의 opt-in e2e 블록은 실행하지 않음) |
| RELEASE_GATE | PASS | `release.json`의 gates — source-isolation(102 files, 금지어 8개) · template-code-rules(허용 import만, Date/random/network/eval 없음, siteId literal 없음) |
| SITE_BUILD | PASS | `site:build ongyeol-interior-demo --mode public` — HTML 23쪽(home 1 · 목록 2 · 상세 14 · service/about/faq/contact 4 · 404 등) |
| PACKAGE_QA | PASS | site:build에 내장된 `qaStaticPackage` — 213 files / 11,484,468 bytes |
| BROWSER_QA | PASS | 아래 9.1 |
| VISUAL_QA | PASS_WITH_KNOWN_GAPS | 아래 9.2 |
| INDEPENDENT_REVIEW | BLOCKER 0 · MAJOR 2(수정 완료) | 아래 9.3 |

### 9.1 Browser QA `[BROWSER_OBSERVED]`

- **Sweep**: 11 route × 7 폭(320 · 390 · 768 · 1024 · 1280 · 1440 · 1920) = 77쪽. 문제 0건.
  확인 항목: 응답 코드(없는 주소는 404), console/page error, 실패한 요청, 깨진 이미지, 다른 origin으로 나간 요청,
  가로 overflow(페이지 끝까지 스크롤한 뒤), **로드 직후 layout viewport 폭**, h1 개수(정확히 1), 금지어, 내부 링크 21개.
- **모바일 폭**: 7 route × 320 · 360 · 390 · 414 = 28조합 모두 `innerWidth = scrollWidth = 기기 폭`.
- **인터랙션 스크립트**(구현 에이전트가 만든 것을 MASTER가 최종 빌드에서 재실행): 목록·상세 smoke 42/42,
  목록·상세 인터랙션 154/154, FAQ 58, 상담 폼 60, 서비스·소개 49 — 실패 0. 홈은 측정 로그(히어로 자동 전환 간격 약 4.5–4.6초,
  키워드 약 3.5초, swipe 1장 이동, 정지/재생, hover 변화)로 확인.
- mobile / intermediate / desktop: 390 · 768 · 1024 · 1440 화면을 MASTER가 직접 봤습니다.

### 9.2 Visual QA `[BROWSER_OBSERVED]`

- 방법: 대표 7쪽을 1440과 390에서 원본 스크린샷과 나란히 놓고 MASTER가 직접 대조(768 · 1024는 contact sheet).
  증빙 시트 15장: `docs/result/ohouse-second-template-e2e/proof/`(왼쪽·위 = 원본, 오른쪽·아래 = 템플릿; `.gitignore`가
  `docs/result/**/*.jpg`를 제외하므로 로컬에만 있습니다).
- 판정: 섹션 순서·그리드·비율·간격·색·헤더/탭바/푸터 구조·인터랙션은 원본과 같은 인상입니다. **글꼴과 사진은 다릅니다.**
- **유사도 수치는 만들지 않았습니다.** "약 90%"는 MASTER의 주관 판정이며, 글꼴이 다른 만큼 owner가 직접 보고 판단해야 합니다.
- 구현 중 고친 큰 차이: 푸터 쇼케이스 사진 위 veil 순서, 밝은 사진 위 흰 글자 가독성(scrim), 가치 카드 비율(329×498),
  서비스 띠 높이(350), 목록 사이드바 위치·폭, 상담 폼 첫 줄 위치, 연혁 슬라이더가 끝에서 멈추지 않던 문제.

### 9.3 독립 리뷰

fresh context의 Fable 5.1(xhigh) reviewer 1명에게 "production rollout을 막아야 할 BLOCKER / MAJOR만 찾으세요"만 전달했습니다
(원하는 결론은 알리지 않음, 수정 권한 없음). 결과는 MASTER가 직접 재현한 뒤 고쳤습니다.

| # | 등급 | 지적 | MASTER 검증 | 조치 |
|---|---|---|---|---|
| 1 | MAJOR | `/about`이 휴대폰에서 화면보다 넓게 그려짐(390 → 413px). 등장 전 대기 상태의 가치 카드 아이콘이 옆으로 밀려 있어 layout viewport를 넓힘 | 재현됨: 320→338, 360→380, 390→413, 414→437 | `styles/pages.css` `.i2-ab-value`에 `overflow: clip`. 수정 전 package에서는 재현, 최종 빌드에서는 정상임을 같은 측정으로 확인 |
| 2 | MAJOR | 템플릿 주석 2곳에 원본 프로젝트의 실제 금액·준공연도·평당가가 예시로 남아 있었음(release gate는 문자열 금지어만 검사) | grep으로 확인 | 지어낸 예시로 교체. 이후 템플릿의 금액·연도 꼴 숫자 18개를 원본 텍스트와 대조 — 남은 일치는 `2,000`·`10,000` 같은 일반 숫자뿐 |

BLOCKER는 없었습니다. reviewer가 문제없다고 본 것: legacy `src/` 의존 없음, 템플릿 격리, release/pin/package 무결성,
빌드 결과의 원본 흔적 없음, 다른 origin 요청 없음, fixture 사진이 원본 것이 아님, platform 테스트 통과,
`/about` 외 반응형 정상, 큰 시각 불일치 없음.

막지는 않지만 적어 준 것과 MASTER의 조치:
- **fixture 문구가 원본 문장을 바꿔 쓴 수준** → 다시 썼습니다. slot 문자열 588개 중 158개(145 slot) + banner 1 · business 1.
  등급 이름 Essential / Signature / Premier는 유지했습니다("Signature"는 원본의 배지 단어와 겹치는 일반 단어입니다).
- **서브페이지가 홈 이미지를 미리 받음** → 홈 카드 3장과 상담 사진을 lazy로 바꿔 줄였습니다(§13-7).
- **기본 테마 색·글꼴 이름이 원본과 같음** → §12-1의 discretion hotspot으로 남겼습니다.

**MASTER의 놓침**: 처음 sweep은 페이지를 끝까지 스크롤한 뒤에만 폭을 재서 1번을 잡지 못했습니다. 로드 직후 폭 검사를 추가했습니다.
**한계**: 리뷰 이후의 변경(CSS 1줄, 주석 2곳, lazy 2곳, 문구 재작성)은 독립 리뷰를 다시 받지 않았고 테스트와 sweep으로만 확인했습니다.

## 10. Localhost

```
LOCALHOST_URL = http://127.0.0.1:4321/
PROCESS       = node docs/result/ohouse-second-template-e2e/tools/serve.mjs <repo> ongyeol-interior-demo 4321
                (current.json이 가리키는 package를 요청마다 읽는 정적 서버, 127.0.0.1 전용)
SESSION       = tmux ohouse-preview
```
- 확인할 주소: `/` · `/portfolio` · `/portfolio/page/2` · `/portfolio/gureummaru-apt-34`(가격 있음) ·
  `/portfolio/morongi-house-48`(가격 비공개) · `/service` · `/about` · `/faq` · `/contact` · 없는 주소(404 화면).
- 서버는 `data/site-builds/ongyeol-interior-demo/current.json`이 가리키는 package를 요청마다 읽습니다. 다시 빌드하면 재시작 없이 반영됩니다.
- 세션이 사라졌을 때 다시 띄우는 법(서버 스크립트 사본을 이 폴더에 두었습니다):
  `tmux new -d -s ohouse-preview "node docs/result/ohouse-second-template-e2e/tools/serve.mjs $PWD ongyeol-interior-demo 4321"`
- 상담 폼의 "보내기"는 fixture에 문의 endpoint가 없어 **메일 앱을 여는 방식**으로만 동작합니다(실제 lead 전송 없음).
- 원본 HOME의 보존 사본을 나란히 보려면(이번에는 상시 띄워 두지 않았습니다):
  `./node_modules/.bin/tsx src/cli-preserve-preview.ts data/www.ohouse.kr/preservation-clones/2026-10-08T15-27-09-098Z --port 4322`

## 11. Traceability

A PIPELINE_AUTOMATED · B PIPELINE_ORCHESTRATED · C CLAUDE_MANUAL_OBSERVATION · D CLAUDE_MANUAL_AUTHORING ·
E NEW_GENERIC_PLATFORM_CHANGE

| 단계 | 분류 | 메모 |
|---|---|---|
| URL discovery | C → B | Firecrawl 불가로 수동 Playwright 탐색, 결과는 기존 `buildDiscoveryResult`에 투입 |
| verify / select | A | 기존 CLI 그대로 |
| 대표 페이지 7개 확정 | C | 52 → 7은 MASTER 판단 |
| observe + source package | A | 기존 CLI 그대로(7회) |
| preservation clone + sanity | A | 기존 CLI 그대로(HOME) |
| 반응형·인터랙션 측정 | C | 관찰 에이전트의 Playwright 스크립트 |
| 템플릿 설계·구현 | D | 이번 작업의 대부분 |
| fixture 사이트 | D | 가상 데이터 |
| template:release / pin / site:build / package QA | A | 기존 CLI. 순서만 scratch 스크립트로 묶음(B) |
| localhost preview | B | 빌드된 package를 보고서 폴더의 정적 서버 스크립트로 서빙 |
| 브라우저 smoke / 시각 대조 | C | scratch 도구 |
| platform 테스트 확대·신규 테스트 | E(테스트 한정) | 런타임 변경 없음 |

```
PIPELINE_AUTOMATED          = verify · select · observe(+source package) · preserve:build · preserve:sanity ·
                              template:release · site:build · package QA
PIPELINE_ORCHESTRATED       = discovery 결과를 기존 buildDiscoveryResult에 투입 · release→pin→build 순서 묶음 · localhost 서빙
CLAUDE_MANUAL_OBSERVATION   = URL 탐색 · 대표 페이지 52→7 확정 · 반응형/인터랙션 측정 · 브라우저 smoke · 시각 대조
CLAUDE_MANUAL_AUTHORING     = interior-02 템플릿 전체 · fixture 사이트 전체
NEW_GENERIC_PLATFORM_CHANGE = 없음(런타임). 테스트 3개 수정 + 1개 신규
```

**다음 단계 pipeline에 주는 시사점**: 자동화된 것은 discovery 이후의 검증·선정·관찰·release·build이고, "관찰 결과를
template 결정으로 옮기는 일"과 "측정"은 전부 Claude 수작업이었습니다.

## 12. Discretion hotspots

1. **기본 테마가 원본 3색을 따름** — 노랑 `#f3c969` / 민트 `#00c6c6` / 네이비 `#0d1b2d`. 디자인 유사도를 위해
   그대로 두었지만, 운영 사이트는 site theme로 바꿔야 합니다.
2. **대표 페이지 52 → 7 축소와 제외 범위** — 자재·실시간 현장·공지·환불·개인정보 페이지는 만들지 않았습니다.
3. **원본에 없거나 플랫폼이 표현 못 해 바꾼 것** — 견적 aside 내용, 정렬 6종(원본 4종), 상담 폼 필드 대응,
   FAQ 칩 동작, scrim, 제목 굵기 보정, 4번째 가치 카드 색.

## 13. Known major gaps

아래는 숨기지 않고 남겨 둔 차이입니다. 1–3이 owner 판단이 필요한 큰 항목입니다.

1. **글꼴** — 원본은 웹폰트(Montserrat / S-Core Dream), 템플릿은 시스템 글꼴. 플랫폼이 웹폰트를 실을 수 없어서이며
   가장 큰 시각 차이입니다. 제목 굵기를 한 단계 올려 보정했지만 글자 폭·자간·숫자 모양이 다릅니다.
2. **만들지 않은 영역** — 자재 카탈로그, 실시간 현장, 공지/환불/개인정보 페이지, 검색 오버레이, 자매 브랜드 전환,
   SNS·채팅·Instagram 피드·우편번호 검색·캡차. 플랫폼 collection이 `projects` 하나이고 외부 호출이 금지돼 있습니다.
3. **상세 견적 표** — 원본의 공종별 14행 금액표는 content schema로 표현할 수 없어 총액 + 이미 있는 사실 행만 보여 줍니다.
4. 목록 정렬은 플랫폼 어휘 6종(원본 4종), 상세의 연관 프로젝트는 1줄(원본 2줄), FAQ 칩은 페이지 이동 대신 제자리 필터.
5. 상담 폼의 **온라인 접수 모드는 코드로만 옮겼고 실행해 보지 않았습니다**(fixture에 endpoint가 없음 — 실제 lead가
   나가지 않게 하기 위함). 메일 전달 모드만 브라우저로 확인했습니다.
6. fixture 사진은 기존 demo의 AI 생성 사진을 빌려 썼습니다. 원본과 피사체·밝기가 달라 사진이 큰 섹션(히어로,
   프로모 타일, 쇼룸)은 구도는 같아도 인상이 다릅니다. 가치 카드·팀 아이콘·일러스트는 새로 그린 그림입니다.
7. 서브페이지가 자기 화면에 없는 이미지를 1–2장(약 110–240 KB) 미리 받습니다. Next가 링크된 route를 prefetch하면서
   그 route의 첫 화면 이미지를 preload하기 때문이며 interior-01도 같은 동작입니다(약 80–190 KB). 독립 리뷰 지적 후
   홈 카드 3장과 상담 사진을 lazy로 바꿔 약 600–740 KB에서 줄였습니다. `[BROWSER_OBSERVED]`
8. 1341–1381px의 2줄 헤더, 1801px 이상의 푸터 폭 변화는 일부러 재현하지 않았습니다.
9. 시각 유사도는 숫자로 재지 않았습니다(§9). 픽셀 비교 수치는 글꼴·사진이 달라 의미가 없어 만들지 않았습니다.

## 14. 문서와 코드가 다른 곳

- `AUTHORITATIVE_WORKTREE.md`는 observer가 다른 폴더의 data가 필요하다고 적었지만, 이 폴더에서 그대로 실행됐습니다.

## 15. 다시 실행하는 법

```
./node_modules/.bin/tsc -p platform/tsconfig.json
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/template-release.ts interior-02@1
# site.json의 pin을 새 release로 갱신한 뒤
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts ongyeol-interior-demo --mode public
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/interior-02.test.ts
```
