# interior-03 — 02. Template authoring

작성일 2026-10-09. design reference: `https://www.dagamhome.com/interior/` (관찰 결과는 `01-discovery-and-observation.md`).

## 요약

```
TEMPLATE_ID       = interior-03
TEMPLATE_VERSION  = 1.0.0
TEMPLATE_PATH     = templates/interior-03/v1/
RELEASE_ID        = interior-03-1.0.0-2a949e9f0247
RELEASE_HASH      = 2a949e9f0247e567bfc48629bc14b653199c2c6c139240b5a980a824acbc510a
TEMPLATE_SOURCE_HASH = 29ac8ffd8de854542bc556bd03c04c3868ca94fbad1dba886f5d45d054292add
FILES             = 70 (app 13 · sections 14 · components 22 · manifest 5 · lib 5 · styles 6 · root 5), release 89 files
ROUTES            = 8
SECTIONS          = 15 (slot 237개: text · richText · link · media)
THEME_TOKENS      = 21 (theme-contract-v1)
LIKELY_GENERIC_PLATFORM_CHANGE = NONE
```

기존 authored-template contract(interior-01 / interior-02)를 그대로 따랐다. platform runtime · build · release · publish 코드는 한 줄도 바꾸지 않았다.
바뀐 공유 파일은 테스트 쪽뿐이다(§8).

## 1. Routes

| key | path | 원본에서 가져온 문법 |
|---|---|---|
| `home` | `/` | HOME: hero cross-fade · 2열 gallery tile · 원형 버튼 band · 3열 portfolio grid |
| `portfolio.index` | `/portfolio` | 갤러리 목록: sub visual · 제목 블록 · 건수 줄 · 3열 카드 · 30×30 pager · 검색 줄 |
| `portfolio.page` | `/portfolio/page/[n]` | 같은 목록의 2쪽 이후 (18건/쪽) |
| `portfolio.detail` | `/portfolio/[slug]` | 상세: 제목 상자 · 가운데 본문 · 원본 크기 사진 stack · 목록 버튼 |
| `about` | `/about` | 회사소개: 인사말 2단 · 넓은 사진 · 본문 · 서명 |
| `service` | `/service` | 원본 "블로그" 안내 페이지의 테두리 카드 3열 + 회사소개의 3열 · 좌우 분할 블록 |
| `faq` | `/faq` | 게시판 목록 표 문법(번호 / 제목 / 분류)을 FAQ accordion으로 사용 |
| `contact` | `/contact` | 글쓰기 폼 표 문법(왼쪽 label 칸 · 35px input · hint · 필수 표시)을 문의 폼으로 사용 |

## 2. Sections (manifest)

| section | settings (default) | slots |
|---|---|---|
| `site.seo` | `indexing: "index"` | 0 |
| `site.header` | – | 13 (tagline, top link 2, nav label, menu label) |
| `site.floater` | `toTop: false`, `externalWidget?: {width,height,right,bottom}` | 1 |
| `site.footer` | – | 19 (전화 block, 정보 6행, e-mail, 안내 2, copyright) |
| `site.not-found` | – | 3 |
| `home.hero` | `autoplay: true` | 7 (emblem, 2줄 slogan, 접근성 label 4) |
| `home.gallery` | `enabled: true` | 9 (제목, tile 4개의 사진/설명) |
| `home.band` | `enabled`, `icons[≤4]` | 9 (eyebrow, 제목 + 강조 2, 사진, link 4) |
| `home.portfolio` | `enabled`, `selection`, `limit 3–24 (12)` | 3 |
| `portfolio.index` | `search: true` | 15 |
| `portfolio.detail` | `facts: false`, `groupLabels: false` | 13 |
| `about.page` | – | 12 |
| `service.page` | – | 31 |
| `faq.page` | – | 46 (질문 12개 × 질문/답/분류 + label) |
| `contact.page` | – | 56 (field label · hint · 오류 · 상태 문구 · 정책) |

Slot의 neutral default는 영어 일반어뿐이다("Portfolio", "Search", "Pause slides" …). 사이트 문구는 template에 없다.

## 3. TEMPLATE OWNS / SITE DATA OWNS

| 소유 | 내용 | 위치 |
|---|---|---|
| template | layout · visual grammar · responsive · interaction · section 구조 | `templates/interior-03/v1/**` |
| site | brand · logo · origin | `data/sites/<site>/site.json` |
| site | copy · CTA · FAQ · 문의 폼 문구 | `slots.json` |
| site | 표시 여부 · 개수 · 선택 · widget 자리 | `settings.json` |
| site | projects · categories · banners · business | `content/*.json` |
| site | media | `assets/` + `assets/registry.json` |
| site | theme | `theme.json` (token 값만) |
| site | BoostChat script / key | `scripts.json` |
| site | 문의 endpoint | `inquiry.json` |
| site | first-party feed opt-in | `integration.json` |

template에는 widget key · chat host · tenant id · site id · 원본 식별 정보가 없다. `platform/test/interior-03.test.ts`의 B · D · O · R · U · V가 이를 고정한다.

## 4. 반응형과 theme

- breakpoint는 원본과 같다: `≤768`(모바일 header + drawer), `≤480`(폰 layout). 데스크톱 미세 조정 1140 / 1040 / 980. container 1100px.
- 색: template CSS · TSX에 색 literal이 없다(hex · `rgb()` · named colour 0건, 테스트 S). 모든 색은 theme token에서 오고 `color-mix`로만 섞는다.
- `theme.default.json`이 원본 palette를 담는다(본문 `#333`, 보조 `#555` / `#888`, gold `#b9a25f`, warm `#ab8373`, 면 `#f5f5f5`, 선 `#e5e5e5`). 사이트는 token 값만 바꿔 다른 모습이 된다(Demo 03).
- 서체: 원본은 선언한 web font가 로드되지 않아 OS의 local 서체로 보인다(macOS NanumGothic, Windows Malgun Gothic). 기본 theme의 `typography.body`는 같은 local 서체가 잡히는 순서로 두었다. web font는 로드하지 않는다(platform에 web font 경로가 없고 release는 static 파일을 싣지 않는다). 제목용 Poppins는 설치돼 있으면 쓰이고 아니면 `"Avenir Next"` / `"Segoe UI"`로 대체된다.

## 5. Interaction

| 대상 | 구현 | 원본과 같은 점 / 다른 점 |
|---|---|---|
| hero | cross-fade 1500ms `cubic-bezier(.23,1,.32,1)`, 4000ms 간격, dot 10×10 / 현재 20×10, 화살표 · swipe 없음 | 같음. dot bar에 pointer가 있을 때만 정지하는 것도 같음 |
| hero 정지 버튼 | dot 옆 20×20 버튼, label이 "멈춤/재생"으로 바뀜 | 추가(WCAG 2.2.2). 원본에는 없음 |
| mobile drawer | 왼쪽 250px, 300ms, backdrop · scroll lock 없음 | 같음. Escape · focus trap · `inert` 추가 |
| hover | 전부 즉시 변화(transition 없음). 목록 카드는 thumbnail만 opacity .6, 홈 카드/tile은 .8 | 같음 |
| portfolio 목록 | category tab · 제목 검색 · pager를 한 페이지 안에서 처리, 주소(`?category` `?q` `?page`)와 Back/Forward 동기화 | 원본은 category별 별도 페이지 + 서버 검색. 정적 site라 client에서 처리 |
| 상세 사진 | 원본 크기(`max-width:100%`), 15px 간격, lightbox 없음 | 같음 |
| FAQ | 표 행이 button, 답은 바로 아래 행, 여러 개 동시 열림, script 없으면 전부 펼침 | 원본 게시판은 accordion이 아님 |
| 문의 폼 | platform inquiry door 사용. site에 endpoint가 있으면 online, 없고 e-mail이 있으면 mail hand-off | 원본의 비밀번호 · 첨부 · 비밀글은 만들지 않음 |
| to-top · widget 자리 | `site.floater.toTop`, `externalWidget` → `html[data-ext-widget]` + `--i3-ext-*` | 원본에 없음. interior-02 1.0.1과 같은 seam |

sticky header · scroll reveal · parallax · dropdown은 원본에 없어서 만들지 않았다.

## 6. 일부러 재현하지 않은 것

- HOME의 `min-width:1160px` 때문에 769–1159px에서 생기는 가로 스크롤.
- hero가 처음 열릴 때 마지막 slide가 첫 slide로 녹아드는 현상.
- 견적문의 게시판(고객 글 목록 · 비밀글 · 글쓰기/수정/삭제 · 파일 첨부).
- pager 현재 쪽의 주황색: theme contract의 강조색은 2개라 `accent.secondary`를 쓴다.
- 원본의 실제 문구 · 회사 정보 · 사진 · 지도 · 블로그 링크.

## 7. 작업 방식

1. MASTER가 shell(layout · header · footer · drawer · 공용 CSS · manifest 틀 · lib)을 작성.
2. HOME · PORTFOLIO · PAGES(about/service) · SUPPORT(faq/contact) 네 영역을 하위 에이전트가 각자의 git-ignored staging root(`tmp/i03-*`)에서 병렬 작성. 다른 세션이 같은 working tree에서 interior-02를 마무리하던 중이라 정식 트리는 건드리지 않았다.
3. MASTER가 병합하고 원본 screenshot과 나란히 비교해 서체 순서 · 필수 표시 · 모바일 band 가독성을 고쳤다.
4. release 전에 fresh-context reviewer(read-only)가 template을 검토했다. 결과와 처리:

| 등급 | 지적 | 처리 |
|---|---|---|
| MAJOR | `/portfolio?category=…`에서 header의 같은 메뉴를 누르면 주소만 바뀌고 filter와 `noindex`가 남음 | 수정: 현재 메뉴 항목은 일반 `<a>`로 렌더(전체 로드). 브라우저에서 확인 |
| MAJOR | hero 자동 회전에 정지 수단 없음(WCAG 2.2.2) | 수정: 정지/재생 버튼 추가. 수정 중 "재생 후 pointer를 떼도 멈춰 있는" 결함을 찾아 고침(glyph `pointer-events:none`) |
| MAJOR | mail 모드에서 hydration 전에 제출 버튼이 살아 있어 native GET으로 입력값이 주소에 실릴 수 있음 | 수정: 두 모드 모두 mount 전 `disabled`. raw HTML과 no-JS에서 확인. interior-02의 mail 모드에도 같은 코드가 있다(이 작업 범위 밖, §9) |
| MAJOR | 기본 theme의 강조색 대비(흰 글자/gold 2.5:1 등)가 AA 미달 | 유지: 기본 theme는 원본 palette 그대로다. 사이트가 token으로 덮어쓴다(Demo 03은 4.5:1 이상). 오류 문구만 본문색으로 바꿈 |
| MINOR | drawer 위에 to-top이 겹침 · FAQ 답이 landmark 12개 · about 인용문 `aria-hidden` · 긴 단어 넘침 · gallery tile 3–4개일 때 행 간격 · category link encoding | 수정 |
| MINOR | 최대 길이 nav label / hero 문구가 좁은 폭에서 넘침 · 기본 muted 색 대비 · favicon 없음 | 유지(기록) |

5. 수정 뒤 release 1.0.0을 만들었다(당시 id `interior-03-1.0.0-f353e5954217`). 그 전의 staging release는 git-ignored 폴더에만 있다.
6. 최종 독립 리뷰가 `provenance.json`의 금지어 목록에 source의 사람 이름 · 사업자 등록 번호 · 전화 조각 · 길 이름이 그대로 들어 있다고 지적했다(MAJOR, `08`).
   그 목록은 release 기록(`release.json`)에도 복사되고 release hash의 입력이라, commit 전에 목록을 brand 수준 5개로 줄이고 release를 다시 만들었다: `interior-03-1.0.0-2a949e9f0247`.
   template file은 한 글자도 바뀌지 않았다(`TEMPLATE_SOURCE_HASH` 동일). 앞의 release는 commit한 적이 없고 정식 트리에는 새 release 하나뿐이다.
   개인 정보에 해당하는 낱말은 repo 밖의 목록으로만 검사한다(`03` §2).

## 8. Platform 변경

```
LIKELY_GENERIC_PLATFORM_CHANGE = NONE
PLATFORM_RUNTIME_FILES_CHANGED = 0
```

테스트 쪽 변경(공유 파일은 추가만):

| 파일 | 변경 | 이유 |
|---|---|---|
| `platform/test/interior-03.test.ts` | 신규 (24 검사) | interior-03 전용 |
| `platform/test/slice1.test.ts` | template 목록에 `interior-03` | 목록을 정확히 세는 검사 |
| `platform/test/step6.test.ts` | `data/sites` 목록 · origin · pin 검사에 새 site 2개 | 같음 |
| `platform/test/interior-02.test.ts` | 검사 K: "다른 site는 interior-01" → "interior-01 또는 interior-03" | 세 번째 template이 생김. interior-02 site 집합 검사는 그대로 |
| `package.json` | `test:platform` 끝에 `interior-03.test.ts` | chain 등록 |

## 9. 범위 밖에서 본 것

- interior-02의 `InquiryForm`도 mail 모드에서 mount 전 제출 버튼이 활성이다(`templates/interior-02/v1/components/support/InquiryForm.tsx:473`의 `disabled={isMail ? undefined : …}`). 공개된 Demo 02는 online 모드라 해당하지 않는다. interior-02는 이미 release된 다른 작업의 template이라 고치지 않았다.
