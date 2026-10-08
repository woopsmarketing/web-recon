# INTERIOR-02 REUSE — BoostInterior Demo 02 종합 보고서

작성: MASTER (Claude Opus 5.5, xhigh) · 2026-10-09 · 작업 폴더 `/Users/woops/projects/web-recon-track-b`
branch `track-b/static-deployment-foundation` · remote publish 없음

```
INTERIOR_02_REUSE = PARTIAL
```

template 재사용 자체는 성립했습니다(같은 release, template 변경 0). PARTIAL인 이유는 BoostChat을 붙였을 때 남는
두 가지입니다 — §0의 2번과 3번.

## 0. 먼저 알아야 할 것

1. **interior-02는 수정 없이 재사용됐습니다.** `boost-interior-demo-02`는 Ongyeol과 같은 immutable release
   `interior-02-1.0.0-dbfa5d41678d`를 pin하고, `templates/interior-02/v1/`과 `data/template-releases/`의 변경 파일은 0입니다.
   브랜드·문구·사진·theme·BoostChat 연결은 모두 `data/sites/boost-interior-demo-02/` 안의 site data입니다.
2. **localhost에서는 BoostChat 버튼이 보이지 않습니다.** 고장이 아니라 BoostChat의 허용 origin 목록
   (`https://interior-demo.boostweb.co.kr` 하나) 때문입니다. 실제 widget 기능은 그 origin으로 Demo 02 package를
   띄우는 방식으로 확인했습니다(41개 검사 중 40개 PASS, 나머지 1개는 판정 규칙 문제 — `02` §4).
   localhost에서 보려면 BoostChat 쪽 설정 변경이 필요하고, 이번 작업에서는 하지 않았습니다(§4 결정 1).
3. **BoostChat launcher와 interior-02가 같은 자리를 씁니다.** mobile에서 launcher가 하단 탭바의 "견적 문의" 탭을
   64% 덮고, desktop에서는 "맨 위로" 버튼과 홈 hero의 "다음 슬라이드"·"일시정지" 버튼을 덮습니다.
   site data로는 피할 수 없어 template patch가 필요합니다(§3, §4 결정 2).
4. **작업 중 기존 template 버그 하나를 찾았습니다.** widget과 무관하게, 1280–1440px 폭의 홈에서 오른쪽 아래
   floating 버튼이 hero의 "다음 슬라이드"·"일시정지" 버튼을 가려 눌리지 않습니다. **Ongyeol 사이트에도 똑같이
   있습니다.** 이번 작업에서는 고치지 않았습니다(§3).
5. 운영 BoostChat에 채팅 3건을 보냈습니다(QA, 약 USD 0.0035). 실제 lead 제출은 0건이고 BoostChat 설정·코드는
   바꾸지 않았습니다.

## 1. 필수 필드

```
INTERIOR_02_REUSE = PARTIAL

BASELINE
  BASELINE_HEAD   = a949a050fdfa0841389a2ef5e9dfd525937866df
  BASELINE_COMMIT = 881cd1c feat(template): add interior-02 second authored template
                    c0c1a53 build(site): build the ongyeol interior demo package (interior-02 1.0.0)
                    a949a05 docs(template): record interior-02 e2e validation
  BASELINE_PUSH   = YES (origin/track-b/static-deployment-foundation, ahead 0 / behind 0, working tree clean)

TEMPLATE
  TEMPLATE_ID            = interior-02
  TEMPLATE_PATH          = templates/interior-02/v1
  TEMPLATE_RELEASE       = interior-02-1.0.0-dbfa5d41678d
                           (hash dbfa5d41678dac83af22593a1d66060d14f96b6ba8247e518f44dee9e97d591f)
  TEMPLATE_FILES_CHANGED = 0
  PATCH_RELEASE_CREATED  = NO  (release gate: exists-verified, 쓴 것 없음)

SITE_A
  SITE_ID = ongyeol-interior-demo
  BRAND   = 온결 인테리어 (가상)
  THEME   = template 기본값 (theme.json 없음: 흰 바탕 · 네이비 #0d1b2d · 민트 #00c6c6 · 노랑 #f3c969)
  BUILD   = 7729ea16a85e2a88873d1f3f8c4c7b0be09d14deafe97218446d4932708f9e94 (이 작업 전 build 그대로)

SITE_B
  SITE_ID = boost-interior-demo-02
  BRAND   = 부스트 인테리어 / BoostInterior (가상, 기존 demo와 같은 브랜드)
  THEME   = site theme token 19개 (아이보리 rgb(250,248,244) · 차콜 rgb(35,34,32) · 오렌지 rgb(217,105,31) · 샌드 rgb(230,211,184))
  BUILD   = 9812ac08eab77b00945067742dadf0982af682171f8fd0a86559a4389947a2e3 (package QA pass, warnings 0)

REUSE
  SAME_TEMPLATE                    = YES
  SAME_TEMPLATE_RELEASE            = YES (id + hash 동일)
  SITE_DATA_DIFFERENT              = YES (siteId, 브랜드, origin, 프로젝트 8건 vs 14건, slug 겹침 0)
  SITE_DATA_SEPARATED              = PASS
  THEME_DIFFERENT                  = YES
  THEME_SEPARATED                  = PASS (TEMPLATE_FILES_CHANGED_FOR_THEME = 0) · 예외 2곳 기록 (01 §4)
  SECTION_LEVEL_CONTENT_SEPARATION = PASS
  SOURCE_BRAND_LEAK                = 0

BOOSTCHAT
  EXISTING_INTEGRATION_REUSED    = YES (scripts.json + inquiry.json, 기존 demo와 바이트 동일)
  BOOSTCHAT_PRODUCT_CODE_CHANGED = NO (코드·설정·DB 쓰기 0)
  SITE_LEVEL_CONFIG              = YES (key는 site data 2개 파일에만, template·release에 0)
  WIDGET_LOAD                    = PASS (허용 origin) / localhost에서는 launcher 없음
  WIDGET_OPEN                    = PASS (desktop 372×560, tablet, mobile 전체 화면, 닫기)
  CHAT_RESPONSE                  = PASS (3건 모두 답변, 시공사례 카드 → 이 package의 상세 페이지)
  TENANT_CONTEXT                 = PASS (부스트 인테리어 · 상담 도우미, 다른 브랜드 문자열 0)
  MOBILE                         = PARTIAL (widget 동작 PASS · launcher가 "견적 문의" 탭을 64% 덮음)
  CONSOLE_ERRORS                 = 0 (문의 폼 stub 500의 브라우저 기본 로그 제외)

QA
  TYPECHECK              = PASS (platform, root 둘 다 exit 0)
  PLATFORM_TESTS         = PASS (16개 suite, 실패 0)
  ALL_TEMPLATE_TESTS     = PASS (interior-02 15/15, interior-01 관련 suite 전부)
  ALL_SITE_TESTS         = PASS (portfolio-sync 40, portfolio-production-truth 12, step6 34)
  PACKAGE_QA             = PASS
  BOOST_BROWSER_QA       = PASS (63쪽 sweep problem 0 · 시각 QA 19건 중 site data로 5묶음 수정, 나머지는 template 특성으로 기록)
  ONGYEOL_REGRESSION     = PASS
  INTERIOR_01_REGRESSION = PASS
  INDEPENDENT_REVIEW     = BLOCKER 0 / MAJOR 1 (BoostChat origin · tenant 공유 — owner 결정, 04)

METRICS
  TOTAL_WALL_CLOCK            = 약 77분
  SITE_BUILD_TIME             = 7.6 s (install 1.4 · preflight 0.2 · next build 5.6 · QA 0.04)
  PACKAGE_SIZE                = 9,193,255 bytes (8.8 MiB)
  FILE_COUNT                  = 165 (HTML 16)
  BOOSTCHAT_WIDGET_READY_TIME = 1.10 s (이동 → launcher 표시; widget.js 0.37 s, script → launcher 0.72 s · desktop 1회 측정)
  RUNTIME_MODEL_CALLS         = chat 3 + query embedding 3
  RUNTIME_AI_COST             ≈ USD 0.0035 (추정)

LOCAL
  BOOST_DEMO_LOCALHOST_URL = http://127.0.0.1:4322/
  READY_FOR_OWNER_REVIEW   = YES (사이트) · 채팅 버튼은 localhost에 나타나지 않음 (§0-2)
```

## 2. Reuse proof

```
SITE A                                          SITE B
  SITE_ID          = ongyeol-interior-demo        SITE_ID          = boost-interior-demo-02
  TEMPLATE         = interior-02                  TEMPLATE         = interior-02
  TEMPLATE_RELEASE = interior-02-1.0.0-dbfa5d41678d   TEMPLATE_RELEASE = interior-02-1.0.0-dbfa5d41678d
  THEME            = template 기본값               THEME            = site theme token 19개

SAME_TEMPLATE          = true
SAME_TEMPLATE_RELEASE  = true
SITE_DATA_DIFFERENT    = true
THEME_DIFFERENT        = true
TEMPLATE_FILES_CHANGED = 0
```

같은 release가 두 사이트에서 다르게 동작한 것(모두 site data 차이):

| | Ongyeol | Demo 02 |
|---|---|---|
| 페이지 | 23 (목록 2쪽, 상세 14) | 16 (목록 1쪽, 상세 8) |
| 문의 폼 | mail mode | online mode (`inquiry.json`) |
| 쇼룸 section, 전화, 지점·시간 | 있음 | 없음 (자료가 없어 비움) |
| head script | 없음 | BoostChat widget |
| floating 상담 버튼 | 있음 | 끔 |

이것은 `platform/test/interior-02.test.ts`의 검사 K–O로 고정했습니다(`03` §4).

## 3. Template 변경 판단 (prompt §7)

template을 고치고 싶어진 지점마다 먼저 분류했습니다. **결과적으로 template은 한 줄도 고치지 않았습니다.**

| 발견 | 분류 | 판단 |
|---|---|---|
| 320px에서 header가 12px 넘침 (가로로 긴 로고) | site data로 해결 가능 | 로고를 template의 로고 상자에 맞춰 site asset으로 다시 배치. template 수정 없음 |
| 탭바 라벨을 비우면 영문 기본값이 나옴 | site data로 해결 가능 | 한글 라벨을 채움 |
| accent 면 위 작은 글자의 대비 1.9–2.6:1 | B (generic: Ongyeol도 2.05–2.48:1) | 수정하지 않음. Demo 02는 그 선택 slot을 비움 |
| footer 쇼케이스 veil과 혼색 기준색이 CSS에 literal | B (generic: 기본 theme 색이 template에 남음) | 수정하지 않음. 사진 선택으로 완화하고 기록 |
| **홈 hero 버튼이 floating 버튼에 가려짐** (1280–1440px) | **B (generic bug, 두 사이트 모두)** | 수정하지 않음. 아래 설명 |
| **BoostChat launcher가 탭바 5번째 탭 · "맨 위로" · hero 버튼을 덮음** | B에 가까움 (floating widget을 쓰는 모든 사이트) — BoostInterior 전용 요구(C)로 보면 수정 금지 | 수정하지 않음. 아래 설명 |
| 탭바를 끌 수 없음, "맨 위로" 위치 설정 없음 | C (이 사이트의 필요) | 수정 금지 |

**B인데도 고치지 않은 이유.** §7은 B에 generic fix를 허용하지만 그러려면 새 patch release가 필요하고, 그 순간
두 사이트가 같은 release를 쓴다는 이번 검증의 핵심 증거가 사라집니다. 또 두 건 모두 "오른쪽 아래 자리를 누가
쓰는가"라는 하나의 설계 결정이고(hero 버튼 위치, floater 위치, 외부 widget 자리 예약), 이미 검증·commit된 Ongyeol의
출력을 바꿉니다. 재사용 검증에 섞지 않고 다음 작업으로 분리하는 것이 맞다고 판단했습니다.

**권고: interior-02 1.0.1 patch release** — (a) hero 조작 버튼과 floating 버튼이 겹치지 않게, (b) floating widget
자리를 예약하는 site 설정(탭바 오른쪽 여백 / "맨 위로" 위치), (c) veil·혼색 기준색을 token에서 파생.
두 사이트를 함께 re-pin하고 rebuild해야 합니다.

## 4. Owner 결정 사항

1. **localhost에서 BoostChat을 볼 것인가.** 보려면 BoostChat 관리자 설정의 허용 origin에 `http://127.0.0.1:4322`를
   추가합니다(운영 데이터 쓰기, BoostChat 세션 소유). 추가하면 localhost의 채팅과 견적 문의 폼이 **실제로 동작**하고
   문의는 운영 tenant에 저장되어 소유자에게 메일이 갑니다.
2. **interior-02 1.0.1 patch를 진행할 것인가** (§3 권고).
3. **Demo 02를 별도 domain으로 publish할 것인가.** 한다면 전용 BoostChat tenant / key를 권합니다. 같은 tenant에 origin만
   추가하면 두 사이트의 문의가 구분되지 않고, 채팅의 시공사례 카드가 첫 번째 demo로 이동합니다(`04` MAJOR 1).
   `site.json`의 origin은 지금 `https://boost-interior-demo-02.example` 자리표시 값입니다.

## 5. 작업 내용

| 단계 | 내용 |
|---|---|
| baseline | 기존 interior-02 결과를 3개 commit으로 나눠 push (BASELINE_HEAD `a949a05`). gitignore 대상 proof 이미지는 commit하지 않음 |
| 정찰 | 읽기 전용 subagent 3개로 기존 BoostInterior 자료, interior-02의 site data · theme 계약, BoostChat integration을 조사 |
| site data | `data/sites/boost-interior-demo-02/` 작성 (`01`) |
| build | `site:build` — 첫 build부터 template 변경 없이 통과. 문구 조정으로 여러 번 다시 build했고, commit한 것은 중간 build를 지운 뒤의 최종 build 하나 |
| QA | 자동 sweep, 실제 widget QA, subagent 시각 QA → site data 수정 → 최종 package에서 재검증 (`02`, `03`) |
| 테스트 | `step6` 검사 A, `interior-02` 검사 K 수정 + L–O 추가 |
| 독립 리뷰 | fresh-context subagent (`04`). 리뷰 뒤의 변경은 시각 QA에 따른 slot 문구 정리와 최종 build뿐이고, 그 뒤 18개 suite 전체 · typecheck · release gate · browser sweep · widget QA(채팅 제외)를 다시 실행 |

subagent는 모두 Agent tool에 `model: "fable"`, `effort: "xhigh"`로 요청했습니다(총 5회). 중요한 결론은 MASTER가
코드와 browser에서 다시 확인했습니다.

commit:

```
270e875 feat(site): add BoostInterior interior-02 demo
6daf590 build(site): build the boost interior demo 02 package (interior-02 1.0.0)
896d673 test(template): verify interior-02 multi-site reuse
(이 문서) docs(template): record interior-02 reuse validation
```

## 6. Metrics

```
TOTAL_WALL_CLOCK   = 약 77분 (2026-10-09 07:16 → 08:33 KST, baseline commit/push 포함)
SITE_BUILD_TIME    = 7.6 s (wall 9 s)
PACKAGE_SIZE       = 9,193,255 bytes · FILE_COUNT = 165 (HTML 16, 사진 51)
BROWSER_QA_TIME    = 자동 sweep 64 s (63쪽) · widget QA 약 6분 (bootstrap 한도에 맞춘 대기 포함)
                     · subagent 시각 QA 31분 · Ongyeol sweep 약 75 s
WIDGET_SCRIPT_LOAD_TIME = 0.36 s
LAUNCHER_TO_READY_TIME  = 0.72 s (script 로드 → launcher 표시), 이동부터 1.10 s
RUNTIME (제품, BoostChat 운영)
  MODEL_CALLS    = 3 chat (openai gpt-5.6-luna) + 3 query_embedding (text-embedding-3-small)
  TOKEN_INPUT    = 16,207 + 77
  TOKEN_OUTPUT   = 248
  ESTIMATED_COST ≈ USD 0.0035  (boost-chat 문서의 단가 기준 추정 — 02 §6)
```

Claude Code(이 작업을 수행한 agent) 사용량은 위 runtime 비용과 별개이고 여기에 포함하지 않았습니다.
site build와 package 자체는 AI를 호출하지 않습니다(`RUNTIME_AI_COST = NONE`은 build 기준으로는 참이고, 위 금액은
QA가 운영 채팅에 보낸 3건입니다).

## 7. Localhost

```
BOOST_DEMO_LOCALHOST_URL = http://127.0.0.1:4322/     (tmux session: boost02-preview)
ONGYEOL (비교용)          = http://127.0.0.1:4321/     (tmux session: ohouse-preview)
```

기존과 같은 방식입니다: `node docs/result/ohouse-second-template-e2e/tools/serve.mjs <repo> <siteId> <port>`를 tmux에서
실행, `127.0.0.1`에만 bind, 요청마다 `current.json`을 다시 읽어 rebuild가 바로 반영됩니다. 새 서버 구조는 만들지 않았습니다.
Windows browser에서는 4321을 보던 방식 그대로 4322를 열면 됩니다.

볼 수 있는 것: `/`, `/portfolio`, `/portfolio/suseong-white-34py-apartment-remodeling`, `/service`, `/about`, `/faq`, `/contact`.
볼 수 없는 것: 채팅 버튼(§0-2). 견적 문의 폼은 보이지만 제출하면 실패 안내가 나옵니다(같은 이유).

## 8. 한계와 확인하지 못한 것

- 채팅 3건을 보낸 QA는 최종 build 직전의 package에서 실행했습니다. 그 뒤 바뀐 것은 site 문구뿐이고, 최종 package에서는
  채팅을 보내지 않는 phase만 다시 돌렸습니다(21/21).
- 실제 lead 제출과 BoostChat의 lead form은 확인하지 않았습니다(stub만).
- 실제 기기, touch hover, `prefers-reduced-motion`, hero 2–3번째 slide의 글자 대비는 확인하지 않았습니다.
- `portfolio-sync`의 opt-in `[e2e]` block은 실행하지 않았습니다.
- 채팅 비용은 추정입니다(운영 기록에 token만 있고 금액 열이 없음).
- 기존 demo의 `reviews.json`(후기 6건)과 배너 `text`는 interior-02에 표시 자리가 없어 그려지지 않습니다(프로젝트의
  `customerQuote` 5건은 상세 페이지에 표시).

## 9. 문서

| 파일 | 내용 |
|---|---|
| `01-site-data-and-theme.md` | 파일과 출처, 지어내지 않은 것, 로고, theme 매핑과 예외 |
| `02-boostchat-qa.md` | 기존 integration, origin 제약, 실제 widget QA, launcher 충돌, runtime 사용량 |
| `03-browser-qa-and-regression.md` | sweep, 시각 QA 19건의 처리, regression, 테스트 |
| `04-independent-review.md` | 독립 리뷰와 MASTER 확인 |
| `proof/` | sweep · widget QA JSON, 운영 읽기 전용 조회 결과, 스크립트 사본(`*.txt`). 스크린샷은 gitignore 대상이라 로컬에만 있음 |
