# interior-03 (DAGAMHOME reference) — full E2E 종합

작성일 2026-10-09. branch `track-b/static-deployment-foundation`. 시각은 UTC.
MASTER는 Claude Opus 5.5. subagent는 Fable 5.1로 시작했고 10:30Z쯤 Fable 사용 한도에 걸린 뒤로는 Sonnet 5.5(sweep · live script)와 Opus 5.5(최종 독립 리뷰)로 돌렸다.

## 판정

```
INTERIOR_03_E2E = PARTIAL
```

template · release · fixture · 재사용 site · 전용 BoostChat tenant · 공개 domain · 실도메인 chat과 시공사례 카드까지 모두 동작한다.
PARTIAL인 이유: **공개 site의 문의 form을 실제로 제출하면 BoostChat server가 403으로 거절한다.**
server의 환경 변수 `WIDGET_SITE_LEAD_KEYS`에 Demo 03의 key가 없어서이고, 그 값은 BoostChat production의 설정이라 이 작업에서 바꾸지 않았다(`05` §5).
그 밖에 열린 MAJOR가 하나 더 있다: 이 zone은 http 접속을 https로 넘기지 않는다(기존 demo host들도 같은 기존 상태, `08` MAJOR 2).

## 남은 결정 (owner)

1. Railway `app` service의 `WIDGET_SITE_LEAD_KEYS`에 `wgt_2B09bTToSXnSi8tl2o9yuUCFlyOnoKXP`를 추가할지. 추가하면 app이 재시작된다. Demo 02도 같은 상태다.
2. 추가한 뒤 `[TEST]` lead 1건을 실제로 보내 볼지. 접수되면 tenant owner에게 알림 mail이 간다.
3. `boostweb.co.kr` zone에서 "Always Use HTTPS"와 HSTS를 켤지. zone의 모든 host에 적용되는 설정이라 이 작업에서 바꾸지 않았다.

## 결과

```
TARGET
  INPUT_URL     = https://www.dagamhome.com/interior/
  CANONICAL_URL = https://www.dagamhome.com/interior/ (redirect 0. page의 <link rel=canonical>은 site root http://www.dagamhome.com/ 를 가리킴)

DISCOVERY
  DISCOVERED_URLS      = 97 (97/97 검증)
  PAGE_FAMILIES        = 14
  REPRESENTATIVE_PAGES = 14

TEMPLATE
  TEMPLATE_ID      = interior-03
  TEMPLATE_VERSION = 1.0.0
  RELEASE_ID       = interior-03-1.0.0-2a949e9f0247
  RELEASE_HASH     = 2a949e9f0247e567bfc48629bc14b653199c2c6c139240b5a980a824acbc510a
  TEMPLATE_PATH    = templates/interior-03/v1 (route 8 · section 15 · slot 237 · theme token 21)

FIDELITY
  VISUAL_QA      = PASS (source와 나란히 16쌍. 숫자 점수는 만들지 않음)
  RESPONSIVE_QA  = PASS (7폭 × 10 route, 가로 넘침 0 px)
  INTERACTION_QA = PASS (128 check: 124 pass · 4 해당 없음 · 0 fail)

REUSE
  REFERENCE_SITE                   = nuridam-interior-demo (가상 브랜드 "누리담 인테리어")
  BOOST_SITE                       = boost-interior-demo-03
  SAME_TEMPLATE_RELEASE            = YES
  TEMPLATE_FILES_CHANGED_FOR_REUSE = 0
  SITE_DATA_SEPARATED              = YES
  THEME_SEPARATED                  = YES
  THEME_DIFFERENT_FROM_DEMO02      = YES
  TEMPLATE_FILES_CHANGED_FOR_THEME = 0
  SOURCE_BRAND_LEAK                = 0

BOOSTCHAT
  DEDICATED_TENANT         = YES (boost-interior-demo-03)
  DEDICATED_WIDGET         = YES (wgt_2B09bTToSXnSi8tl2o9yuUCFlyOnoKXP)
  ALLOWED_ORIGIN           = https://interior-demo-3.boostweb.co.kr
  FIRST_PARTY_ORIGIN       = https://interior-demo-3.boostweb.co.kr
  CHAT                     = PASS
  PORTFOLIO_RECOMMENDATION = PASS
  PORTFOLIO_CARD_DOMAIN    = https://interior-demo-3.boostweb.co.kr (카드 15/15)
  INQUIRY                  = PARTIAL (검증 PASS · 전송 형식 PASS · 실제 접수는 server 403)
  CROSS_TENANT_LEAK        = 0

DOMAIN
  PUBLIC_URL = https://interior-demo-3.boostweb.co.kr
  DNS        = 변경 없음 (기존 proxied wildcard)
  TLS        = PASS
  HTTP       = PASS (http → https redirect 없음은 zone의 기존 설정)
  PUBLISH    = PASS (package d5a7904fe368… · publish 2회, 두 번째가 최종)

QA
  TYPECHECK             = PASS
  PLATFORM_TESTS        = PASS (17 suite + chain 밖 8 suite, 실패 0)
  INTERIOR03_TESTS      = PASS (24)
  PACKAGE_QA            = PASS
  BROWSER_SWEEP         = PASS (140 load, 문제 0)
  REAL_DOMAIN_E2E       = PASS — 예외 2종 (검사 한계 1건 · 문의 접수 403). 최종 package에서 pass 148 · fail 1 · blocked 2
  INTERIOR01_REGRESSION = PASS
  INTERIOR02_REGRESSION = PASS (ONGYEOL · BOOSTINTERIOR_DEMO02 포함)
  INDEPENDENT_REVIEW    = 2회. 최종: BLOCKER 0 · MAJOR 2 (1건 수정 · 1건은 zone 설정이라 owner 결정) · MINOR 8

COST
  TRACK_B_BUILD_COUNT = release 22 · site build 24 (정식 트리: release 2 · build 4. 나머지는 git-ignore된 staging)
  TRACK_B_BUILD_TIME  = 최종 build 8.2 s + 8.1 s
  WORKER_USED     = YES (recon-runtime-pilot)
  WORKER_DEPLOYS  = 1
  WORKER_REQUESTS = 1,833 (interior-demo-3 host, 첫 publish → 11:56Z)
  WORKER_COST     = UNKNOWN
  R2_USED    = YES (boost-sites-artifacts)
  R2_OBJECTS = +339 (publish 2회. pointer 1개는 교체)
  R2_BYTES   = +15,788,647 B (올린 양)
  R2_COST    = UNKNOWN
  RAILWAY_USED     = YES
  RAILWAY_MEMORY   = 0.4247 → 최고 0.4581 → 0.4574 GB (증가의 대부분은 Demo 03 요청이 없던 3분 사이에 생김. `07` §E)
  RAILWAY_RESTARTS = 0
  RAILWAY_5XX      = 0
  RAILWAY_COST     = UNKNOWN
  CHAT_MODEL_CALLS = 7 (+ 제품이 스스로 하는 대화 요약 1회)
  EMBEDDING_CALLS  = 14
  INPUT_TOKENS     = 38,144 (chat 37,697 + 대화 요약 447)
  OUTPUT_TOKENS    = 1,031 (chat 961 + 대화 요약 70)
  AI_COST          = UNKNOWN (embedding token 1,316)
  TEST_LEADS = 0
  EMAILS     = 0
  EMAIL_COST = 0
  DOMAIN_COST = 0
  DNS_COST    = 0
  KNOWN_INCREMENTAL_COST  = 0
  UNKNOWN_COST_COMPONENTS = Worker 요청 · R2 작업과 저장 · Railway runtime · OpenAI token

PERFORMANCE (각 1회씩 잰 값. 전체 실행을 두 번 해서 "첫 publish 직후 · 최종" 순서로 둘을 적음)
  DEPLOY_TIME          = 211 s · 209 s (upload 시작 → live 확인)
  FIRST_PAGE_LOAD      = 8.16 s · 2.46 s
  WIDGET_READY         = 2.70 s · 2.05 s (1440에서 이동 → launcher 보임. 다른 viewport는 2.5–11.1 s)
  FIRST_CHAT_RESPONSE  = 3.66 s · 3.96 s (첫 글자) · 4.27 s · 4.57 s (완료)
  PORTFOLIO_CARD_READY = 1.86 s · 2.46 s
  TOTAL_E2E_TIME       = 3 h 2 min (09:04:02Z → 12:06Z, commit · push 포함)

FINAL
  BLOCKER = 0
  MAJOR   = 2 (열림. 문의 접수 403 · http → https redirect 없음 — 둘 다 이 repo 밖의 설정이고 owner 결정)
  MINOR   = 11 (기록. 최종 리뷰 8 + release 전 리뷰 3)
  READY_FOR_DEMO_USE = NO — 문의 form이 실제로는 접수되지 않는다. site · chat · 시공사례 카드는 지금 시연할 수 있다
```

## 과정

1. **source → template** (`01`, `02`) — 97개 URL을 찾아 14개 family로 묶고 대표 page를 desktop · mobile · 중간 폭에서 관찰했다.
   source의 구조와 치수만 가져와 `templates/interior-03/v1`을 새로 썼다(기존 Track B 방식: manifest · slot · theme token · content · release).
   platform code는 바꾸지 않았다. release 전 독립 리뷰의 MAJOR 4건 중 3건을 고치고 1건(기본 palette의 대비)은 이유를 적고 두었다.
2. **fixture와 fidelity** (`03`) — 가상 브랜드 "누리담 인테리어"로 source와 같은 모양의 data를 만들어 나란히 비교했다. source의 이름 · 전화 · 주소 · 문구 · script는 template · release · package 어디에도 없다.
3. **같은 release로 BoostInterior Demo 03** (`04`) — site data와 theme만 다르다. release를 만든 뒤 바뀐 template file은 0개다.
   release 전 시험 build에서 드러난 일반 결함 2건(gallery 행 간격, 어두운 강조색에서 drawer 대비)은 release 전에 template에서 고쳤다.
4. **BoostChat과 domain** (`05`) — 전용 tenant와 widget을 제품의 기존 기능으로 만들고, 기존 Worker · R2 방식으로 `interior-demo-3.boostweb.co.kr`에 올렸다.
   실제 domain에서 chat 응답, 시공사례 카드, 카드 → 자기 domain의 상세 page, mobile 전체 화면 chat을 확인했다.
5. **검증** (`06`, `08`) — 전체 test, 7폭 sweep, interaction, 실도메인 E2E, 기존 template · site 회귀, 독립 리뷰.
   최종 리뷰가 release의 금지어 목록에 reference 회사의 개인 값(이름 · 번호 · 주소 조각)이 들어 있음을 찾았다. commit 전에 목록을 brand 수준으로 줄이고
   release를 다시 만들어(`…-f353e5954217` → `…-2a949e9f0247`, template file 변경 0) 다시 build · test · publish · 실도메인 E2E를 했다.
6. **비용** (`07`) — 사용량은 측정했고, 청구가 확인된 금액은 없다.

## 지시와 다르게 한 것

| 항목 | 지시 | 실제 | 이유 |
|---|---|---|---|
| subagent model | Fable 5.1 | 10:30Z 뒤 Sonnet 5.5 · Opus 5.5 | Fable 사용 한도 |
| 최종 독립 리뷰 | Fable 5.1 xhigh | Opus 5.5 xhigh | 같음(10:58Z 재시도도 한도로 실패) |
| 실제 test lead 1건 | 가능하면 | 하지 않음 | server가 이 key의 lead를 받지 않음. 받게 하려면 BoostChat production 설정을 바꿔야 함 |
| `docs/result/README.md` index | – | 고치지 않음 | 여러 세션이 같이 쓰는 file. 최근 작업들도 거기에 없다 |

## 알려 둘 것

- 공개 HTML에 zone이 Cloudflare beacon을 넣는다(기존 host들과 같음). package에는 없다.
- 414 px 이하에서 page 맨 아래로 가면 to-top 버튼이 footer 저작권 줄의 끝을 조금 가린다(`08` MINOR 1). 고치려면 release를 새로 내야 해서 기록만 했다.
- 첫 publish의 package(169 objects · 7.89 MB)가 R2에 남아 있다. 서비스되지 않고, 내용은 최종 package와 같다(build 기록 file만 다름).
- widget launcher는 제품 기본 모양(파란 원)이다. site의 green theme와 맞추려면 BoostChat tenant의 launcher 설정을 바꾸면 된다.
- 기본 theme(fixture)의 gold 글자 대비는 AA에 못 미친다. reference palette 그대로이고, site가 `theme.json`으로 바꾼다.
- interior-02의 mail mode 문의 form에 hydrate 전 제출 가능 문제가 있다(이 작업 범위 밖, `06` §6).
- 사진 · screenshot(`.jpg` · `.png`)은 git-ignore라 이 machine에만 있다.

## 볼 곳

| | |
|---|---|
| 공개 site | https://interior-demo-3.boostweb.co.kr |
| template | `templates/interior-03/v1/` |
| release | `data/template-releases/interior-03/interior-03-1.0.0-2a949e9f0247/` |
| site data | `data/sites/nuridam-interior-demo/`, `data/sites/boost-interior-demo-03/` |
| source와 비교 | `proof/source-vs-template/` (16쌍) |
| fixture · Demo 03 화면 | `proof/fixture/`, `proof/demo03-local/` |
| 실도메인 화면 | `proof/demo03-live/final/` (`shots/home-1440-closed.jpg`, `shots/home-1440-open.jpg`, `shots/home-iphone13-open.jpg`, `chat-portfolio-cards-1440.jpg`, `chat-portfolio-viewer-1440.jpg`) |
| publish · BoostChat log | `proof/demo03-publish/`, `proof/boostchat/` |
| 비용 증거 | `proof/accounting/` |

## 보고서

| file | 내용 |
|---|---|
| `01-discovery-and-observation.md` | discovery, 관찰, interaction, 보존 clone |
| `02-template-authoring.md` | template 구성, 재현하지 않은 것, release 전 리뷰, platform 변경 없음 |
| `03-reference-fixture-and-fidelity.md` | fixture, source isolation 감사, 비교, sweep, interaction |
| `04-boostinterior-demo03-reuse.md` | 같은 release 재사용, theme, floating UI 자리 |
| `05-boostchat-and-domain.md` | publish, tenant, 실도메인 E2E, 문의 접수, 성능 |
| `06-browser-regression.md` | test 전체, Demo 03 sweep · interaction, 회귀 |
| `07-cost-and-infra.md` | 비용 · 인프라 A–H |
| `08-independent-review.md` | 독립 리뷰 2회와 처리 |
