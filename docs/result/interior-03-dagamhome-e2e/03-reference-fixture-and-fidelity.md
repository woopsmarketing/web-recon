# interior-03 — 03. Reference fixture와 fidelity

작성일 2026-10-09.

## 요약

```
REFERENCE_SITE   = nuridam-interior-demo (가상 브랜드 "누리담 인테리어")
RELEASE          = interior-03-1.0.0-2a949e9f0247
PACKAGE          = 98a322344b7b… · 242 files · 8,838,388 B · HTML 29 · package QA pass
VISUAL_QA        = PASS (source와 나란히 16쌍 비교, 남은 차이는 §3)
RESPONSIVE_QA    = PASS (7폭 × 10 route, 가로 넘침 0 px)
INTERACTION_QA   = PASS (128 check 중 124 pass · 4 해당 없음 · 0 fail, 두 site 합계)
SOURCE_BRAND_LEAK = 0
```

숫자로 된 fidelity 점수는 만들지 않았다. 측정한 것은 넘침 px, 깨진 이미지 수, 요청 실패 수, 금지어 hit 수뿐이고,
"얼마나 닮았는가"는 나란히 놓은 screenshot을 사람이 본 판단이다.

## 1. fixture는 무엇인가

template이 source의 구조를 제대로 옮겼는지 보려면 source와 같은 모양의 data가 필요하다. 그 data를 source에서 가져오지 않고 새로 만들었다.

| | 값 | 근거 |
|---|---|---|
| brand | 누리담 인테리어 (가상) | `content/business.json`의 summary가 "템플릿 검증을 위해 만든 가상의 스튜디오"라고 밝힘 |
| projects | 20건 | source의 목록 한 쪽(18건)을 넘겨 pager가 나오게 함 |
| categories | 2개 (아파트 13 · 주택·빌라 7) | source 홈의 2-tile gallery와 같은 수 |
| 사진 | 52장 | 전부 Demo 02의 AI 생성 demo 사진을 `nd-` id로 복사. 2장은 1600×600으로 자름 |
| logo · mark | SVG 2개 | 이 fixture용으로 새로 그림 |
| 전화 | `000-0000-0000`, `000-0000-0001` | 실제 번호 아님 |
| e-mail | `hello@nuridam-interior.example` | 예약된 `.example` domain |
| 주소 · 사업자 정보 | 가상 문구 | source의 값과 무관 |
| theme | template 기본값 (`theme.json` 없음) | 기본 palette가 reference의 색 |
| 문의 | mail hand-off | BoostChat 연결 없음(`scripts.json` · `inquiry.json` · `integration.json` 없음) |

source에서 가져온 것은 **구조와 치수**뿐이다(구역 순서, 격자, 글자 크기, 여백, breakpoint). 문구 · 사진 · 회사 사실 · script는 가져오지 않았다.

## 2. Source isolation 감사

`proof/source-isolation-audit.json` (script: `proof/scripts/source-isolation.py.txt`).
찾는 낱말은 두 곳에 있다. template의 `provenance.json`에는 brand 수준의 낱말 5개만 둔다(release gate와 test가 읽는다).
사람 이름 · 길 이름 · 사업자 등록 번호 · 전화 · e-mail · 계정 handle처럼 개인을 가리킬 수 있는 값은 repo에 두지 않고 scratch의 목록으로만 검사한다.
보고서에는 종류와 개수만 적는다.

처음에는 그 개인 값 11개도 `provenance.json`에 있었다. 최종 독립 리뷰의 지적으로 commit 전에 뺐고 release를 다시 만들었다(`08`).
지금의 감사는 `provenance.json`과 `release.json` 자체도 개인 값 종류로 검사한다.

| 종류 | 낱말 수 |
|---|---|
| template의 `provenance.json` 금지어 (brand 수준) | 5 |
| `provenance.json`에서 뺀 개인 값 (repo 밖) | 11 |
| source brand 표기 | 7 |
| 전화 | 4 |
| host | 3 |
| SNS handle | 3 |
| analytics id | 2 |
| e-mail | 1 |
| 사업자 등록 번호 | 1 |
| source runtime 파일 이름 | 5 |

| 검사 대상 | text 파일 | hit |
|---|---|---|
| `templates/interior-03/v1` | 69 | 0 |
| release `interior-03-1.0.0-2a949e9f0247` | 88 | 0 |
| `provenance.json` + `release.json` (개인 값 종류만) | 2 | 0 |
| fixture site data | 10 | 0 |
| Demo 03 site data | 15 | 0 |
| fixture package | 191 | 0 |
| Demo 03 package | 115 | 0 |

반대 방향도 0이다: Demo 03의 site data · package에 fixture brand 0, fixture package에 Demo 03 정체(이름 · origin · widget key) 0.
7폭 sweep도 렌더된 본문에서 interior-01 · 02 · 03의 금지어와 상대 site의 brand를 찾았고 hit는 0이었다(§4).

## 3. Source와 나란히 본 결과

`proof/source-vs-template/` 16쌍. 왼쪽이 source(관찰 단계의 screenshot), 오른쪽이 fixture.

| 화면 | 폭 |
|---|---|
| home | 1440 · 1024 · 768 · 390 |
| portfolio list | 1440 · 1024 · 768 · 390 |
| portfolio detail | 1440 · 390 |
| about | 1440 · 390 |
| contact form | 1440 · 390 |
| service (source의 blog 목록과 짝) | 1440 · 390 |

MASTER가 직접 연 쌍: home 1440 · 390, portfolio list 1440, detail 1440, about 1440, contact 1440. 나머지 10쌍은 만들어 두었고 사람이 보지는 않았다(그 폭들은 §4의 수치 검사만 통과).

**같은 것**: 2단 header(얇은 top bar + logo와 nav), 전폭 hero와 가운데 mark · 두 줄 문구 · 하단 dot, 2-tile gallery, 어두운 icon band,
3열 최근 작업 격자, sub-page의 banner + 제목(짧은 gold 줄), 3열 목록과 pager · 검색 줄, 제목 상자 아래 가운데 정렬 본문과 사진이 이어지는 detail,
표 형태의 문의 form과 검은 버튼 두 개, 밝은 회색 footer(왼쪽 사업자 정보, 오른쪽 전화). mobile에서는 hamburger, 2열 card, 2×2 icon, 가운데 정렬 footer.

**다른 것과 이유**

| 차이 | 종류 | 설명 |
|---|---|---|
| 글꼴 | platform 한계 | 한글 본문은 source도 web font가 load되지 않아 OS 고딕으로 그려지고(`01` 요약), template은 같은 stack을 쓴다. 영문 제목 · 인용구의 web font는 source만 받는다. template은 web font를 싣지 못해(release가 `public/`을 제외, platform에 font pipeline 없음) OS의 비슷한 글꼴로 대신한다 |
| nav 항목 수 | data | source 6개, fixture 5개. template은 항목 수를 정하지 않는다 |
| hero dot 옆의 정지 버튼 | 의도 | 자동 회전을 멈출 수단이 있어야 해서 추가(독립 리뷰 지적) |
| hero dot이 밝은 사진 위에서 흐림 | data | dot은 흰색이다. source 사진은 아래쪽이 어둡고 fixture 사진은 밝다 |
| detail 사진이 가로로 넓음 | data | source는 세로 사진, fixture는 4:3 가로 사진. template은 사진을 원래 비율로 놓는다 |
| contact의 칸 구성 | 의도 | source는 게시판 글쓰기라 e-mail · 제목 · 비밀번호 · 사진 첨부가 있다. template은 문의 한 건을 보내는 form이라 그 칸이 없고, 개인정보 안내 상자와 동의 줄이 있다 |
| 목록 위의 category 탭 줄 | 의도 | source는 category를 nav 항목 두 개로 나눈다. template은 category가 data라서 목록 한 곳에 탭으로 둔다 |
| service page | 구조가 다름 | source에는 service 소개 page가 없다. template의 service는 source의 blog card 문법과 about의 아래 두 구역으로 구성했다. card는 더 작다 |
| about의 구역 수 | 구조가 다름 | source의 about은 인사말 아래에 3-card 구역과 사진 + 글 구역이 더 있다. template은 그 두 구역을 service page에 두었고 about은 서명에서 끝난다 |
| 기본 theme의 gold 글자 대비 | 알고 둠 | reference palette를 그대로 둔 결과. 색은 site의 `theme.json`으로 바꾼다(Demo 03은 4.99:1 이상) |

template 결함으로 본 것은 없다.

## 4. Responsive — 7폭 sweep

interior-02의 sweep script를 그대로 썼다(404 기대 route를 환경 변수로 받게 한 것과 집계 4줄만 추가). `proof/sweep-fixture.json`.

| 항목 | 결과 |
|---|---|
| 폭 | 320 · 390 · 768 · 1024 · 1280 · 1440 · 1920 |
| route | 10 (home, portfolio, page/2, detail 2건, service, about, faq, contact, 없는 주소) |
| page load | 70 (200 = 63, 404 = 7 — 없는 주소는 404가 맞음) |
| 가로 넘침 | 0 px (load 직후 측정, 70/70) |
| 깨진 이미지 | 0 / 595 |
| page error | 0 |
| console error | 404 page의 "404 (Not Found)" 7건뿐 |
| 실패한 요청 | 0 |
| site 밖으로 나간 요청 | 0 |
| 내부 link | 29개 모두 200 |
| `<h1>` | 모든 page에 1개 |
| 금지어 · 상대 brand | 0 hit |

## 5. Interaction

`proof/interaction-i03.json` — 두 site, 1440과 390, 128 check. fixture에 해당하는 것만 적는다(Demo 03은 `06-browser-regression.md`).

| 대상 | 확인한 것 |
|---|---|
| header · nav | 모든 page로 이동, logo는 home으로. 필터가 걸린 목록에서 "시공사례"를 누르면 필터가 풀린 전체 목록 |
| drawer (390) | 열면 focus가 닫기 버튼으로, Tab이 밖으로 나가지 않음, 닫기 버튼 · Escape · link로 닫힘, 닫으면 focus가 메뉴 버튼으로 |
| hero | 약 3 s마다 자동 전환, dot으로 이동, 정지 버튼으로 멈춤(6 s 동안 변화 없음)과 재개, `prefers-reduced-motion`에서는 회전 없음 |
| gallery tile | 각 tile이 그 category의 목록(13건 / 7건)을 엶 |
| 목록 | category 탭, 제목 검색(결과 있음 / 없음), 뒤로 · 앞으로, pager로 2쪽(2건) |
| detail | `<h1>` 1개, 사진 13–14장 모두 load, "목록"이 그 project의 category 목록으로 |
| FAQ | click · Enter · Space로 열고 닫힘, 여러 줄 동시 열림, 주제 탭 |
| contact (mail) | hydrate 전에는 제출 버튼 비활성. 빈 제출 → 4개 오류와 이름 칸 focus. 잘못된 전화 → 전화 오류만. 초기화. 제출하면 `mailto:` link가 만들어지고 page는 그대로 |

해당 없음 4건: 필터가 걸린 목록의 2쪽(가장 큰 category가 13건이라 쪽이 나뉘지 않음) × 2폭, 필터 없는 `/portfolio?page=2` × 2폭
(정적 2쪽의 주소는 `/portfolio/page/2`이고 `?page=`를 만드는 link는 없다).

hero dot 검사 하나는 약했다: 두 칸 앞의 dot을 눌렀는데 그게 시작 slide였다. 전환 자체는 자동 전환과 정지 · 재개 검사로 확인됐다.

## 6. 산출물

- `proof/fixture/` — 전체 page screenshot 33장(1440 · 390 전 route, 768 · 1024는 home · portfolio · contact, 상태 7장)
- `proof/source-vs-template/` — 16쌍
- `proof/sweep-fixture.json`, `proof/interaction-i03.json`, `proof/source-isolation-audit.json`
- `proof/scripts/*.txt` — 실행한 script 사본

`.jpg` · `.png`는 git-ignore라 이 machine에만 있다.
