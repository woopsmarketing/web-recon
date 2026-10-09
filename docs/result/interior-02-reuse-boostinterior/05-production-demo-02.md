# INTERIOR-02 — BoostInterior Demo 02 production demo (1.0.1 · domain · 전용 BoostChat)

작성: MASTER (Claude Opus 5.5) · 2026-10-09 · 작업 폴더 `/Users/woops/projects/web-recon-track-b`
branch `track-b/static-deployment-foundation` · subagent는 모두 Fable 5.1 xhigh (정찰 4, 구현 1, provisioning 준비 1, E2E 스크립트 1, 독립 리뷰 1)
사용량 수치의 마지막 조회 시각: 2026-10-09 10:02Z (19:02 KST). 이 문서의 시각은 따로 적지 않으면 UTC입니다.

```
INTERIOR_02_DEMO02 = PARTIAL
```

사이트, 전용 BoostChat tenant, 채팅, 시공사례 카드, floating UI는 실제 domain에서 모두 동작합니다.
PARTIAL인 이유는 하나입니다 — **견적 문의 폼 제출이 BoostChat 서버에서 거절됩니다** (§0-1).

## 0. 먼저 알아야 할 것

1. **문의 폼은 아직 동작하지 않습니다.** Demo 02의 폼은 새 전용 key로 `POST /api/widget/<key>/lead`를 보내는데,
   BoostChat은 Railway 변수 `WIDGET_SITE_LEAD_KEYS`에 있는 key만 받습니다. 새 key는 거기에 없어 403으로 거절됩니다
   (preflight 403, CORS header 없음). 이 변수를 바꾸려면 BoostChat 운영 `app`을 재시작해야 하고, 기존 기록은 BoostChat
   배포를 release-owner 세션의 일로 정해 두었습니다. 작업 중 owner에게 물었지만 답이 없었고, 이번 prompt에도 이 변경이
   없어 하지 않았습니다. 방문자가 폼을 제출하면 실패 안내와 대체 연락처가 보입니다. 필요한 변경은 §8에 적었습니다.
2. **이 작업은 한동안 두 프로세스가 동시에 진행했습니다** (09:34–09:50Z). 집에서 SSH로 시작한 세션을 사무실에서
   `claude --resume`으로 다시 열었을 때, 처음 프로세스(PID 69708)가 살아서 계속 일했고 새 창(PID 18533)도 같은 세션을
   이어받았습니다. owner 지시에 따라 session id를 확인한 뒤 PID 69708 하나만 종료했고(09:49:46Z), 그 뒤로는 이 창 하나가
   마무리했습니다. 결과:
   - 운영 쓰기(tenant 설정 · deploy · R2 · Worker · lead)가 두 번 실행된 것은 **없습니다.**
   - 다른 프로세스가 E2E가 끝난 뒤 시공사례 카드 주소를 확인하면서 **채팅 2건**을 더 보냈습니다. 이 사용량은 원래
     E2E와 나누어 §10에 적었습니다.
   - commit 7개와 push는 다른 프로세스가 했습니다. 내용을 검토했고 그대로 둡니다(§13).
3. **같은 폴더와 같은 BoostChat 운영 환경에서 다른 세션이 동시에 작업 중입니다** (`prompt2`: interior-03 / Demo 03).
   09:35:50Z에 tenant `boost-interior-demo-03`이 만들어졌습니다. 이 작업이 만든 것이 아니고 건드리지 않았습니다.
   두 가지가 서로 덮어써질 수 있습니다.
   - `workers/recon-runtime/wrangler.jsonc`의 route 목록: `wrangler deploy`는 목록 전체를 PUT합니다. 옛 파일로 배포하면
     `interior-demo-2` route가 사라집니다. 이 변경은 push해 두었습니다(`d7920ce`).
   - `WIDGET_SITE_LEAD_KEYS`: 값 전체를 바꾸는 변수입니다. 설정할 때 살아 있는 key를 모두 넣어야 합니다.
4. **DNS record는 만들지 않았습니다.** `boostweb.co.kr`의 기존 proxied wildcard(`*.boostweb.co.kr`)가 새 이름을 이미 받고,
   인증서도 wildcard입니다. 기존 demo와 같은 방식으로 Worker에 정확한 route 하나를 추가했습니다.
5. **launcher 모양은 BoostChat 기본값입니다** (파란 원, "상담"). 첫 demo는 노란 "24시간문의"입니다. 크기와 위치는 같습니다.
   바꾸려면 BoostChat 관리자 화면(`/admin/boost-interior-demo-02/install`)에서 바꿉니다.

## 1. 필수 필드

```
INTERIOR_02_DEMO02 = PARTIAL

PATCH
  OLD_RELEASE   = interior-02-1.0.0-dbfa5d41678d
  NEW_RELEASE   = interior-02-1.0.1-61116e77e274
                  (hash 61116e77e274141575fd8ebc62968ff6c52552ef9382a8ed5e1170f2f6503627, 102 files)
  PATCH_SCOPE   = floating UI collision · external widget safe zone · theme literal cleanup
                  (templates/interior-02/v1 안의 8개 파일, platform/ 변경 0)
  ONGYEOL_REPIN = interior-02-1.0.1-61116e77e274 · build aa5817959c12 · package bcda7d95b178
  BOOST02_REPIN = interior-02-1.0.1-61116e77e274 · build 9314d888bf9b · package 5868df38f4bd

DOMAIN
  PUBLIC_URL = https://interior-demo-2.boostweb.co.kr
  DNS        = 변경 없음 (기존 proxied wildcard *.boostweb.co.kr, Cloudflare NS)
  TLS        = 정상 (CN=boostweb.co.kr, SAN *.boostweb.co.kr, Google Trust Services WE1, ~2026-12-10)
  HTTP       = 7개 페이지 200 · 없는 경로 404(사이트 자체 404 페이지) · robots / sitemap / _integration 200
  PUBLISH    = PASS (R2 167 files + seal + pointer, Worker route 추가 배포 1회)

  DNS_PROVIDER      = Cloudflare (zone boostweb.co.kr, Free plan)
  DNS_RECORD_TYPE   = 기존 wildcard (proxied) — 새 record 없음
  DNS_TARGET        = Worker route interior-demo-2.boostweb.co.kr/* → recon-runtime-pilot
  DNS_CHANGED       = NO
  PROPAGATION_CHECK = route 배포 3초 안에 새 host가 recon-runtime 응답으로 바뀜

BOOSTCHAT
  DEDICATED_TENANT         = boost-interior-demo-02 (id 81560206…, owner = 기존 demo와 같은 계정)
  DEDICATED_WIDGET         = wgt_xVMphzTAQKf3AD7xpPOB7KuSUFsJsexR
  ALLOWED_ORIGIN           = https://interior-demo-2.boostweb.co.kr (하나뿐)
  FIRST_PARTY_ORIGIN       = https://interior-demo-2.boostweb.co.kr (snapshot ON, 8 records)
  WIDGET                   = PASS (desktop 1440/1280 · tablet 768 · mobile WebKit iPhone 13: 표시 · 열기 · 닫기)
  CHAT                     = PASS (bootstrap 200, 기본 질문에 답변, 4xx/5xx 0, console error 0)
  PORTFOLIO_RECOMMENDATION = PASS (카드 3장 + 더 보기 2장)
  PORTFOLIO_CARD_DOMAIN    = PASS (5장 모두 https://interior-demo-2.boostweb.co.kr/portfolio/<slug>, 옛 domain 0)
  INQUIRY                  = PARTIAL (입력 검증 PASS · stub 제출 PASS · 실제 제출은 서버 403 — §0-1)
  CROSS_TENANT_LEAK        = 0 (기존 tenant의 설정 행 변경 0, 이 작업의 감사 기록은 모두 새 tenant 범위)

FLOATING UI
  DESKTOP_COLLISION = 0
  MOBILE_COLLISION  = 0
  HERO_CONTROLS     = PASS (1025–1528px에서 launcher · floater와 12px 이상 떨어짐)
  BACK_TO_TOP       = PASS (launcher 위 14px, ≤480px에서는 24px)
  BOTTOM_TAB        = PASS (탭 5개가 launcher 왼쪽에, "견적 문의" 탭과 launcher 사이 8–18px, 라벨 잘림 0)

QA
  TYPECHECK              = PASS (platform · root · runtime)
  PLATFORM_TESTS         = PASS (20 suite · 616 검사 · 실패 0 · skip 1)
  ALL_SITE_TESTS         = PASS (위 20개 안의 사이트 suite: portfolio-sync 40 · portfolio-production-truth 12 ·
                           step6 34 · publish 67 · publish-e2e 47 · interior-02 18)
  PACKAGE_QA             = PASS (두 사이트, warnings 0)
  REAL_DOMAIN_E2E        = PARTIAL (138개 검사: 통과 135 · 실패 1(스크립트 판정 문제, 따로 확인해 PASS) · blocked 2(문의 폼))
  ONGYEOL_REGRESSION     = PASS
  INTERIOR_01_REGRESSION = PASS
  INDEPENDENT_REVIEW     = BLOCKER 0 / MAJOR 2 (문의 폼 = 미해결 · 내리는 절차 문서 = 이 문서 §7로 해결)

INFRA / COST
  TRACK_B_BUILD_COUNT = 2 (Ongyeol 1 · Demo 02 1) + patch 검증용 임시 build 2
  TRACK_B_BUILD_TIME  = 합계 17.0 s (8.2 + 8.7) · 최종 build 8.7 s

  WORKER_USED         = YES (recon-runtime-pilot)
  WORKER_DEPLOY_COUNT = 1 (version c8796aae)
  WORKER_REQUESTS     = 2,618 (09:20–10:02Z, script 전체, error 0) = 원래 작업 구간 2,338 + E2E 이후 280 (§10)
  WORKER_CPU          = P50 1.29 ms · P99 3.15 ms
  WORKER_COST         = UNKNOWN (repo에 단가 근거 없음)

  R2_USED          = YES (boost-sites-artifacts)
  R2_OBJECTS       = 169 생성 · 0 교체
  R2_BYTES         = 9,263,391 업로드
  R2_OPS           = Class A 169 · Class B 5,304
  R2_STORAGE_DELTA = +169 objects / +9,263,391 B (provider 저장량 지표: 2,216 → 2,385 objects, 122,258,678 → 131,522,069 B)
  R2_COST          = UNKNOWN

  RAILWAY_USED             = YES (BoostChat app, 재배포 · 변수 변경 0)
  RAILWAY_MEMORY           = 전 0.418 GB · 최고 0.429 GB · 후 0.428 GB (한도 8 GB)
  RAILWAY_CPU              = 최고 0.018 vCPU
  RAILWAY_RESTARTS         = 0
  RAILWAY_5XX              = 0
  RAILWAY_INCREMENTAL_COST = UNKNOWN

  CHAT_MODEL_CALLS = 5 (gpt-5.6-luna) = 원래 E2E 채팅 2 + 그 대화의 자동 요약 1 + 다른 프로세스의 채팅 2
  EMBEDDING_CALLS  = 11 (text-embedding-3-small) = FAQ 등록 7 + 원래 E2E 질문 2 + 다른 프로세스 질문 2
  INPUT_TOKENS     = 22,325 (gpt-5.6-luna) + 1,242 (embedding)
  OUTPUT_TOKENS    = 695
  AI_COST          = UNKNOWN (검증된 단가 없음 — §9, §10)

  TEST_LEADS = 0
  EMAILS     = 0
  EMAIL_COST = 0

  DOMAIN_COST = 0 (기존 zone의 subdomain, 구매 없음)
  DNS_COST    = 0 (record 변경 없음)

  KNOWN_INCREMENTAL_COST  = 0 (금액이 확정된 항목: domain · DNS · email)
  UNKNOWN_COST_COMPONENTS = Worker 요청 · R2 작업/저장 · Railway runtime · OpenAI token

PERFORMANCE
  DEPLOY_TIME          = 215 s (업로드 시작 09:21:05 → host pointer 기록 09:24:40)
  FIRST_PAGE_LOAD      = 3.85 s (desktop 1440, 첫 방문)
  WIDGET_READY         = 2.99 s (이동 → launcher 표시 · widget.js 응답 끝 1.70 s)
  FIRST_CHAT_RESPONSE  = 4.60 s (첫 글자) · 5.20 s (완료)
  PORTFOLIO_CARD_READY = 1.85 s
  LEAD_RESPONSE        = 실제 제출 없음 (거절 응답 0.27 s)
  TOTAL_E2E_TIME       = 657 s (09:26:56 → 09:37:53 · floating 239 s + E2E 418 s). 다른 프로세스의 카드 확인 2회는 별도(§10)

FINAL
  BLOCKER = 0
  MAJOR   = 1 (문의 폼 서버 설정)
  MINOR   = 3 (§11)
  PROCESS_INCIDENT = 1 (세션 중복 실행 — §10. 제품 결함 아님)

  READY_FOR_DEMO_USE = NO — 문의 폼만 남음. 사이트 · 채팅 · 시공사례 카드는 바로 시연 가능
```

## 2. 1.0.1 patch

template 소스 8개 파일만 바꿨습니다. `platform/` 아래는 건드리지 않았습니다. 그 코드는 interior-01의 release 입력이기도 해서,
한 줄이라도 바꾸면 interior-01을 다시 release해야 합니다.

| 항목 | 내용 |
|---|---|
| site 선언 | `settings["site.floater"].externalWidget = { width, height, right, bottom }` (선택). "외부 widget의 닫힌 launcher가 차지하는 가장 큰 상자"를 site가 적습니다. Demo 02는 `64 / 64 / 18 / 18`. Ongyeol은 선언 없음 |
| CSS 전달 | 선언이 있으면 `<html data-ext-widget style="--i2-ext-w:…">`. 없으면 아무것도 내보내지 않음 |
| hero 버튼 (generic) | 화면 높이를 다 쓰는 hero(≥1025px)에서 조작 버튼 줄의 오른쪽 끝이 화면 오른쪽에서 최소 92px(선언이 있으면 widget 상자 + 12px) 떨어짐. 넓은 화면에서는 원래 여백으로 연속해서 돌아감 |
| 맨 위로 | widget 상자 위 14px. 640px 초과에서는 widget 가운데에 맞춤. 탭바가 숨어도 widget 아래로 내려가지 않음 |
| 하단 탭바 (≤640px) | 탭 목록이 오른쪽에 widget 상자 + 8px를 비움. 배경은 전체 폭 |
| theme literal | footer 사진 veil과 혼색 기준색 3개(`#5a3d00`, `#003a3a`, `#d7dde6`)를 theme token에서 계산 |
| vendor 정보 | template에 vendor 이름, key, site id, site 좌표 없음 (`interior-02.test.ts` 검사 R) |

Ongyeol에서 바뀐 것은 두 가지뿐입니다: hero 버튼 줄이 1025–1528px에서 왼쪽으로 최대 72px 이동(1.0.0에서는 floating 버튼에
가려 눌리지 않던 자리), 그리고 아래 색 차이. HTML은 build id 외에 바이트가 같습니다.

| 색 (기본 theme) | 1.0.0 | 1.0.1 | 대비 |
|---|---|---|---|
| on-yellow | rgb(159,124,47) | rgb(151,125,65) | 2.48 → 2.52 |
| on-mint | rgb(0,135,135) | rgb(0,135,135) | 2.05 → 2.06 |
| on-navy | rgb(144,153,165) | rgb(149,155,163) | 6.02 → 6.16 |
| footer veil | rgb(12,22,36) | rgb(10.4,21.6,36) | 같은 alpha |

release 명령: `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/template-release.ts interior-02@1` → `created`.
1.0.0 폴더는 변경 0입니다. 새 검사 P · Q · R을 `platform/test/interior-02.test.ts`에 추가했습니다(18/18).

## 3. Floating UI 검증

스크립트 `proof/scripts/floating-qa.mjs.txt`. 폭 13개(1920 · 1560 · 1440 · 1280 · 1025 · 1024 · 768 · 640 · 600 · 481 · 480 · 390 · 320)
× 4개 페이지 × 스크롤 3단계(+ ≤640px에서 탭바 숨김 상태). 로드 직후 스크롤 전에 `innerWidth`와 가로 넘침도 잽니다.

| 실행 | 검사 | 실패 |
|---|---|---|
| Ongyeol 1.0.0 (patch 전) | 1,896 | **12** — 1025 · 1280 · 1440px에서 hero "다음" · "일시정지"가 floating 버튼과 겹침 |
| Ongyeol 1.0.1 실제 package | 1,896 | 0 |
| Demo 02 1.0.1 실제 package + 가짜 launcher 상자 | 3,244 | 0 |
| **Demo 02 실제 domain + 실제 widget** | 3,192 | 0 |

실제 domain에서 잰 값(실제 launcher iframe):

| 폭 | launcher | 맨 위로 | 간격 | 탭 5개 | 탭과 launcher 사이 |
|---|---|---|---|---|---|
| 1440 | 64×64, 오른쪽 · 아래 18 | y 748–804 | 14 | — | hero "일시정지"와 12 |
| 768 | 64×64 | launcher 위 | 14 | — | — |
| 640 | 64×64 | y 692–748 | 14 | 110px씩 | 8 |
| 481 | 64×64 | | 14 | 78px씩 | 8 |
| 480 | 60×60, 12 | | 24 | 78px씩 | 18 |
| 390 | 60×60 | | 24 | 60px씩 | 18 |
| 320 | 60×60 | | 24 | 46px씩 | 18 |

스크린샷(gitignore 대상, 로컬에만 있음): `proof/demo02-live/shots/` — `home-1440-closed` · `home-1440-open` ·
`home-iphone13-closed` · `home-iphone13-open` · `home-*-mid-closed` · `contact-1440` · `contact-iphone13`.

## 4. Publish

기존 방식 그대로입니다: `site:publish`가 R2에 package를 올리고 host pointer를 쓰며, Worker `recon-runtime-pilot`이 host로 pointer를 찾아 응답합니다.

| 시각 (UTC) | 단계 | 결과 |
|---|---|---|
| 09:21:05 → 09:23:06 | 업로드 + 검증 + seal (`--no-activate`) | 167/167 업로드, sha256 · 크기 검증, 121 s |
| ~09:24 | 재검증 (`--reverify`) | 167/167, 업로드 0 |
| 09:24:12 → 09:24:19 | `wrangler deploy --env pilot` (route 2개) | version `c8796aae` · 새 host가 `404 unknown host`(recon-runtime)로 바뀜 · 기존 host 200 |
| 09:24:32 → 09:24:40 | pointer 쓰기 (`--expect-live none`) | `routing/interior-demo-2.boostweb.co.kr.json` → package `5868df38…` |
| 09:24:57 | 확인 | 7개 페이지 200 · 404 · TLS · 기존 host 200 |
| 10:01:07 | 마지막 확인 (요청 6개: Demo 02 5 · 기존 demo 1) | 홈 · 상세 · contact 200 · 없는 경로 404 · 기존 host 200 · live HTML에 새 key와 widget 상자 선언 |

publish 전 조건: typecheck 3종, 테스트 20 suite(616 검사, 실패 0), release, 두 사이트 build, package QA 모두 통과.
offline dry-run과 store 확인(seal 없음, pointer 없음)을 먼저 했습니다. 로그: `proof/demo02-publish/`.

## 5. 전용 BoostChat tenant

BoostChat 운영 DB에 쓴 것(모두 BoostChat 자체 함수와 CLI, 기존 demo를 만든 방식과 같음):

| 단계 | 방법 | 결과 |
|---|---|---|
| tenant + owner | `scripts/tenant-bootstrap.ts` (`prod-run.mjs`) | `boost-interior-demo-02`, owner = 기존 demo의 owner 계정(새 사용자 없음) |
| plan · pilot · capability | `setTenantPlanByOperator` 등 운영자 함수 | `master`(operator, 결제 호출 없음) · action pilot on · `portfolio.search` on |
| 사업 정보 · AI 설정 · 공개 프로필 | 기존 demo 값을 복사 (`runTenantMutation`으로 감사 기록) | 프로필 handle `boost-interior-2`, website는 새 domain |
| FAQ 7건 | `createFaq` (embedding 7회) | 등록 · 게시 |
| widget | `ensureWidgetChannel` + 관리자 route와 같은 mutation | key 발급, 허용 origin 1개, enabled |
| first-party origin | `registerFirstPartyBinding` → `setFirstPartyBindingEnabled` | `https://interior-demo-2.boostweb.co.kr` |
| feed 갱신 | `scripts/ops-first-party-refresh.ts --apply` | snapshot ON, 8 records, media 8 |

안전장치: DB system identifier 확인, 대상 slug 고정, 쓰기마다 대상 tenant 확인, 적용 전후 기존 tenant 상태 비교(변경 0),
대상 밖 감사 기록 0. 각 단계는 dry-run을 먼저 했습니다. 스크립트 · 로그 · 되돌리는 방법: `proof/demo02-boostchat/`.

마지막 조회(10:01Z, `proof/demo02-boostchat/verify-final.txt`)에서 새 tenant의 운영자 감사 기록은 6건, 관리자 감사 기록은
13건이고 모두 09:06–09:26Z의 provisioning입니다. 그 뒤에 추가된 쓰기는 없습니다. 기존 tenant `boost-interior-demo`에는
09:44:03Z에 감사 기록 1건이 생겼는데, BoostChat이 스스로 돌리는 24시간 주기 feed 확인(`operator sys***`,
`reason scheduled:24h`, `version_unchanged`)이고 이 작업과 무관합니다. 기존 tenant의 widget · 연동 · plan · capability ·
launcher 행은 그대로입니다.

site 쪽은 site data만 바꿨습니다: `scripts.json`과 `inquiry.json`의 key, `integration.json`(feed opt-in), `site.json`의 origin.
새 key는 이 두 파일과 Demo 02 package에만 있습니다. package에 옛 key · 옛 origin · 자리표시 origin은 0건입니다.

## 6. 실제 domain E2E

`proof/scripts/live-e2e.mjs.txt` → `proof/demo02-live/live-e2e.json` (09:30:55 → 09:37:53Z, 418 s, 페이지 로드 19).

| 묶음 | 통과 | 실패 | blocked |
|---|---|---|---|
| site (7개 페이지, 클릭 이동, 404, canonical · og · robots · sitemap · feed origin, key) | 78 | 0 | 0 |
| widget (4개 화면: 표시 · 위치 · 열기 · 닫기) | 32 | 0 | 0 |
| chat | 10 | 1 | 0 |
| inquiry | 9 | 0 | 2 |
| screenshot | 6 | 0 | 0 |
| 합계 138 | 135 | 1 | 2 |

- 채팅: "30평대 아파트 리모델링 상담 가능한가요?" → 답변. "화이트 톤 30평대 아파트 시공 사례를 보여주세요" → 카드 3장.
  첫 카드를 눌러 `…/portfolio/suseong-white-34py-apartment-remodeling`(200, Demo 02)로 이동.
- 실패 1건(`chat:card-hrefs-on-origin`)은 스크립트가 카드 안의 링크 주소를 찾는 방식 때문입니다. 카드는 링크가 아니라
  버튼이고 뷰어를 거쳐 이동합니다. 그래서 다른 프로세스가 따로 확인했습니다(`proof/scripts/cards-probe.mjs.txt` →
  `proof/demo02-live/cards-probe.json`): 카드 5장 각각에 대해 widget API가 준 주소가 모두
  `https://interior-demo-2.boostweb.co.kr/portfolio/<slug>`이고, 마지막 카드의 실제 이동도 같은 domain입니다. 옛 domain은 0건입니다.
  이 확인이 §10의 추가 채팅 2건입니다.
- blocked 2건은 문의 폼 서버 설정입니다(§0-1). 폼의 입력 검증과 stub 제출(body의 key 6개, 성공 화면)은 통과했습니다.
  상태 확인용 요청 2개(preflight `OPTIONS` 1, 동의 `false`라 문의를 만들 수 없는 `POST` 1)가 나갔고 둘 다 403으로 거절됐습니다.
  실제 문의 제출은 0건이고 운영 DB의 문의 행도 0건입니다.
- console error 0, boostchat.co.kr 4xx/5xx 0(문의 probe 제외), 다른 origin 요청은 Cloudflare가 넣는 analytics beacon뿐입니다.

## 7. 내리거나 되돌리는 방법

이 host는 첫 publish라 pointer에 `previous`가 없습니다. `site:publish --rollback`은 거절됩니다.

```sh
# host만 내리기: Worker가 "404 unknown host"로 응답. package는 R2에 남음
./node_modules/.bin/wrangler r2 object delete boost-sites-artifacts/routing/interior-demo-2.boostweb.co.kr.json --remote

# route까지 떼기: wrangler.jsonc의 env.pilot.routes에서 interior-demo-2 항목만 지우고 (나머지는 유지) 배포
./node_modules/.bin/wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot
```

- 다시 올릴 때는 같은 package로 `site:publish … --expect-package 5868df38…`를 실행하면 업로드 없이 pointer만 다시 씁니다.
- Demo 02를 1.0.0으로 되돌려 build하려면 `settings.json`의 `externalWidget`을 먼저 지워야 합니다(1.0.0의 설정 schema가 모르는 key를 거절).
- BoostChat 쪽(widget 끄기, origin 비우기, 연동 끄기, plan 되돌리기): `proof/demo02-boostchat/rollback.md`. 삭제 없이 끄는 방법만 적혀 있습니다.
- 기존 demo(`interior-demo.boostweb.co.kr`)는 위 어느 단계에서도 건드리지 않습니다. pointer `3d250199…`(2026-10-06)와 live HTML은 그대로입니다.

## 8. 남은 일: 문의 폼

BoostChat 운영 `app`에서 변수 하나를 바꾸고 재시작하면 됩니다. 값은 목록 전체를 바꾸므로 살아 있는 key를 모두 넣습니다.

```sh
# BoostChat release-owner 쪽에서 (Demo 03 key를 쓰는 세션이 있으면 그 key도 함께)
railway variable set 'WIDGET_SITE_LEAD_KEYS=wgt_99kYYFOm7ABvdQbVh_8SdrnOlLrPqDI3,wgt_xVMphzTAQKf3AD7xpPOB7KuSUFsJsexR' -e production -s app
# 값에 따옴표가 들어가면 key가 조용히 빠집니다 (boost-chat release 문서의 주의 사항)
```

반영 뒤 확인 순서:

```sh
S=<scratch>; node $S/live-e2e.mjs --origin https://interior-demo-2.boostweb.co.kr --key wgt_xVMphzTAQKf3AD7xpPOB7KuSUFsJsexR --phases inquiry          # probe: 400 consent_required 가 나오면 열린 것
node $S/live-e2e.mjs --origin https://interior-demo-2.boostweb.co.kr --key wgt_xVMphzTAQKf3AD7xpPOB7KuSUFsJsexR --phases inquiry --real-lead    # [TEST] 문의 1건
```

`[TEST]` 문의의 알림 메일은 새 tenant의 owner 주소 하나로만 갑니다(기존 demo의 owner와 같은 계정, BCC 없음).
새 tenant에는 `lead_form_config` 행이 없어 기본값(전화 필수, 이메일 불필요)이 적용되고, 이 폼의 body와 맞습니다.

## 9. 사용량과 비용 (전체)

숫자는 모두 provider에서 읽은 값입니다. 단가 근거가 repo에 없는 항목은 금액을 적지 않았습니다.
이 절은 전체 합계이고, 원래 작업과 중복 프로세스 구간을 나눈 표는 §10에 있습니다.

```
A. TRACK B BUILD
  SITE_BUILD_COUNT       = 2 (작업 폴더) + 2 (patch 검증용 임시 폴더). 테스트 suite 안의 tmp build는 세지 않음
  TOTAL_BUILD_WALL_CLOCK = 17.0 s (builder 보고: Ongyeol 8,244 ms + Demo 02 8,721 ms)
  FINAL_BUILD_TIME       = 8.7 s (install 1.7 · preflight 0.2 · next build 6.2 · QA 0.04)
  PACKAGE_SIZE           = 9,215,933 bytes
  FILE_COUNT             = 167 (HTML 16, _integration 2)
  BUILD_AI_CALLS         = 0
  BUILD_AI_COST          = NONE

B. CLOUDFLARE WORKER   (GraphQL Analytics workersInvocationsAdaptive, scriptName recon-runtime-pilot, 09:20:00–10:01:55Z)
  WORKER_USED              = YES
  WORKER_NAME              = recon-runtime-pilot
  DEPLOY_COUNT             = 1
  REQUEST_COUNT            = 2,618 (success 2,410 · clientDisconnected 208 · error 0) — script 단위라 이 Worker의 모든 host 합계
  CPU_TIME                 = P50 1.29 ms · P99 3.15 ms
  WALL_TIME                = P50 428 ms · P99 818 ms
  작업 전 기준              = 같은 날 00:00–08:51:09Z에 60 요청 · error 0
  publish 전 (08:51–09:20Z) = 140 요청 · error 0. 이 구간의 edge 요청은 거의 모두 기존 demo host(214건)이고,
                             이 작업이 보낸 것은 E2E 스크립트 시험의 페이지 로드 4회(launcher 열기 · 닫기만, 채팅 0)입니다.
                             나머지가 누구 것인지는 이 지표로 나눌 수 없습니다

  host별 edge 요청 (zone httpRequestsAdaptiveGroups, 09:20:00–10:01:55Z. Worker에 닿지 않는 Cloudflare beacon 응답 204 포함)
    interior-demo-2.boostweb.co.kr = 2,708 (200: 2,304 · 204: 157 · 304: 21 · 404: 4 · 499: 222)
    interior-demo.boostweb.co.kr   = 12 (200: 11 · 404: 1) — 전체 구간을 한 번에 조회한 값. 구간별로 나눠 조회한 합은 11
    interior-demo-3.boostweb.co.kr = 3 (404: 3 — 다른 세션의 host, 이 작업과 무관)
  TRANSFER                 = Demo 02 host의 edge 응답 73,959,403 bytes

C. R2   (같은 API r2OperationsAdaptiveGroups, bucket boost-sites-artifacts, 09:20:00–10:01:55Z)
  R2_USED           = YES
  BUCKET            = boost-sites-artifacts
  BYTES_UPLOADED    = 9,263,391 (package 9,215,933 + seal 47,082 + 나머지 376 = pointer. pointer 크기는 합계에서 뺀 값)
  OBJECTS_CREATED   = 169
  OBJECTS_REPLACED  = 0
  CLASS_A_OPS       = 169 (PutObject)
  CLASS_B_OPS       = 5,304 (GetObject 4,731 · HeadObject 570 · HeadBucket 3 — publish의 검증 읽기 포함)
  EGRESS            = GetObject 응답 99,448,777 B (R2 → Worker · CLI)
  STORAGE_DELTA     = +169 objects / +9,263,391 B. 저장량 지표가 2,216 objects / 122,258,678 B → 2,385 objects / 131,522,069 B 로 바뀌어 PUT 합계와 같음
  R2_ESTIMATED_COST = UNKNOWN

D. DNS / DOMAIN
  DOMAIN_PURCHASE_COST = 0 (boostweb.co.kr의 subdomain, 구매 없음)
  DNS_CHANGE_COST      = 0 (record 변경 없음)

E. BOOSTCHAT / RAILWAY   (railway metrics API · HTTP log, app service, 09:00:01–10:02:18Z)
  RAILWAY_USED     = YES
  REQUESTS         = 1,887 (전체 tenant) · 새 key 관련 253 (200: 247 · 403: 3 · 499: 3) · 09:41:25Z 뒤로 새 key 요청 0
                     기존 key 관련 72 (E2E 스크립트 시험과 기존 demo 확인이 섞여 있고 실제 방문과 나눌 수 없음).
                     기존 tenant의 AI 사용량 행은 이 구간에 0
  MEMORY_BEFORE    = 0.418 GB
  MEMORY_PEAK      = 0.429 GB
  MEMORY_AFTER     = 0.428 GB
  CPU_IF_AVAILABLE = 최고 0.018 vCPU (한도 8)
  RESTARTS         = 0 (HTTP log의 app instance id가 하나뿐, deployment 5b4afeee 그대로 — 2026-10-08 19:39Z 배포)
  5XX              = 0
  INCREMENTAL_COST = UNKNOWN (같은 시간에 다른 세션의 사용량이 섞여 있어 나눌 수 없음)

F. OPENAI / EMBEDDING   (ai_usage_event, tenant boost-interior-demo-02, 16행. 10:01Z 조회)
  CHAT_MODEL_CALLS  = 5 (gpt-5.6-luna: chat 4 · conversation_summary 1)
  EMBEDDING_CALLS   = 11 (query_embedding 4 + knowledge_embedding 7, text-embedding-3-small)
  INPUT_TOKENS      = 22,325 (chat 21,802 + 요약 523)
  OUTPUT_TOKENS     = 695 (chat 607 + 요약 88)
  EMBEDDING_TOKENS  = 1,242 (99 + 1,143)
  AI_ESTIMATED_COST = UNKNOWN

G. EMAIL / LEAD
  TEST_LEAD_COUNT     = 0
  EMAIL_SENT_COUNT    = 0
  EMAIL_PROVIDER_COST = 0

H. TOTAL
  KNOWN_INCREMENTAL_COST  = 0
  UNKNOWN_COST_COMPONENTS = Worker 요청, R2 작업 · 저장, Railway runtime, OpenAI token
```

AI 비용이 UNKNOWN인 이유: boost-chat 문서(`docs/reports/content-engine/rollout/06-production-generation-e2e.md:275`)에
gpt-5.6-luna 단가(입력 $0.20, cached 입력 $0.02, 출력 $1.20 / 1M)가 있지만 "지시서 값"이라고만 적혀 있고 provider에서
확인한 값이 아닙니다. embedding 단가는 어디에도 없습니다. `ai_usage_event`는 cached 입력을 따로 기록하지 않습니다.
그 미확인 단가를 cached 할인 없이 그대로 곱하면 gpt-5.6-luna 5회는 약 $0.0053입니다. 확정 금액이 아니라 참고용 상한입니다.

Claude Code 사용량은 위 어디에도 넣지 않았습니다(중복 구간의 Claude 사용량은 §10 끝에 따로 적었습니다).

읽는 방법: `proof/scripts/cf-usage.mjs.txt` · `cf-zone-hosts.mjs.txt` · `rw-usage.sh.txt` · `rw-http-split.mjs.txt` ·
`prod-recheck.sh.txt` · `prod-recheck-conversations.sh.txt`, `proof/demo02-boostchat/verify.sh.txt`. 결과: `proof/demo02-accounting/`.
Cloudflare 수치는 adaptive dataset이라 몇 분 늦게 반영되고 구간 경계에서 1–2건 차이가 날 수 있습니다.

이 절의 숫자가 나온 파일:

| 항목 | 파일 (`proof/` 아래) |
|---|---|
| Worker · R2 (구간별) | `demo02-accounting/cloudflare-baseline-0000Z-0851Z.json` · `cloudflare-0851Z-0920Z.json` · `cloudflare-0920Z-0938Z.json` · `cloudflare-0938Z-1001Z.json` · `cloudflare-0920Z-1001Z.json` · `cloudflare-day-1001Z.json` |
| host별 edge 요청 | `demo02-accounting/cloudflare-zone-hosts-by-window.txt` · `cloudflare-zone-hosts-pre-publish.txt` |
| BoostChat 요청 · instance · 분 단위 분포 | `demo02-accounting/railway-http-new-key-by-window.json` · `railway-deployments.txt` · `railway-metrics.txt` |
| AI 사용량 16행 · 감사 기록 · 대화 3개 | `demo02-accounting/usage-and-audit-final.txt` · `conversations-final.txt` · `demo02-boostchat/verify-final.txt` |
| 테스트 20 suite · 임시 build 2 | `demo02-accounting/test-chain-final.txt` |
| 배포 직후 확인 · TLS · seal 크기 · 마지막 확인 | `demo02-publish/05-deploy-and-smoke-output.txt` |
| tenant id 앞자리 | `demo02-accounting/usage-new-key-0940Z.txt` |
| 두 프로세스의 타임라인 · Claude 사용량 | `demo02-accounting/session-timeline.txt` |

`cloudflare-0920Z-0945Z.json`과 `cloudflare-day.json`은 처음 프로세스가 09:45Z에 읽은 이전 값이고, 위 파일이 대신합니다.

## 10. 세션 중복 실행 기록과 분리한 사용량

### 10-1. 무슨 일이 있었나

| 시각 (UTC) | 누가 | 한 일 |
|---|---|---|
| 09:26:56 | 처음 프로세스 (PID 69708) | 실제 domain 검증 실행 시작 (detached). 09:37:53에 끝남 |
| 09:27:38 | 처음 프로세스 | 독립 리뷰 agent 시작 (1회) |
| 09:34:19 | owner | 같은 세션을 다른 터미널에서 `claude --resume` → 이 창 (PID 18533) 시작. session id가 같음 |
| 09:38:46 | 리뷰 agent | 자체 측정용 페이지 로드 3회 (채팅 0) |
| 09:39:38 · 09:41:09 | 처음 프로세스 | 카드 주소 확인 스크립트 2회 → **채팅 2건**. 첫 실행이 중간에 멈춰 한 번 더 실행 |
| 09:40:09 | 이 창 | 멈춘 줄 알고 리뷰 agent에 "이어서 하라"는 메시지를 보냄 → 리뷰 agent 사본이 하나 더 생김. 사본은 로컬 파일만 읽음 |
| 09:40:20 – 09:41:46 | 이 창 | 운영 DB 읽기 전용 조회 4회 |
| 09:41:48 – 09:45:25 | 처음 프로세스 | Cloudflare · Railway · 운영 DB 읽기 전용 조회 (같은 내용을 이 창도 조회) |
| 09:44:33 – 09:44:37 | 처음 프로세스 | commit 7개 · push · commit된 tree에서 interior-02 suite 18/18 |
| 09:48:31 | 처음 프로세스 | 이 문서의 초안 작성 |
| 09:49:46 | 이 창 | owner 지시에 따라 session id(`599518d0…`)가 같은지 확인하고 PID 69708만 종료. git lock · stash 없음 |
| 09:51:04 | BoostChat (자동) | 원래 E2E 대화가 15분 무활동으로 끝나 요약 1회 생성 |
| 09:53 – 10:02 | 이 창 | 디스크 · git · 증거 · 운영 기록 재확인(읽기 전용), 마지막 확인 요청 6개, 이 문서 완성 |

종료한 프로세스는 PID 69708 하나입니다. 같이 지목됐던 PID 20966은 session id가 다른 interior-03 세션(`4aa129e6…`)이라
건드리지 않았습니다. 표의 시각은 세션 기록에 남은 명령 시작 시각이고(`proof/demo02-accounting/session-timeline.txt`),
서버에 닿은 첫 요청은 그보다 2초쯤 뒤입니다(09:38:48 · 09:39:40 · 09:41:11).

### 10-2. 두 번 실행된 것과 아닌 것

| 종류 | 두 번 실행됐나 | 근거 |
|---|---|---|
| tenant 생성 · 설정 · FAQ · widget · origin · feed 갱신 | 아니오 | 감사 기록 19건이 모두 09:06–09:26Z, 그 뒤 0건 |
| R2 업로드 · pointer 쓰기 | 아니오 | PutObject 169건이 모두 09:20–09:38Z 구간, 그 뒤 0건 |
| Worker deploy | 아니오 | 1회 (version `c8796aae`) |
| 실제 domain E2E 전체 실행 | 아니오 | 1회 (09:26:56 → 09:37:53) |
| 문의(lead) 제출 · 메일 | 아니오 | 문의 행 0 · 메일 0 |
| Railway 변수 · 배포 | 아니오 | deployment `5b4afeee` 그대로, 재시작 0 |
| 채팅 | E2E 2건 외에 **2건 추가** | 아래 10-3 |
| 리뷰 agent | 사본 1개 추가 (운영 요청 0) | 사본의 명령은 boost-chat 소스 읽기뿐 |
| 읽기 전용 조회 (운영 DB · Cloudflare · Railway) | 예, 양쪽이 각자 조회 | 쓰기 없음. 과금 항목 아님 |
| commit · push | 아니오 | 처음 프로세스가 1회. 이 창은 문서 commit만 추가 |

추가 채팅 2건은 E2E를 다시 돌린 것이 아니라, E2E의 판정 실패 1건(§6)을 확인하려는 별도 스크립트였습니다. 이 창은 채팅을
한 건도 보내지 않았습니다.

### 10-3. 사용량 분리표

BoostChat 운영 기록(`ai_usage_event` 16행, HTTP log)과 Cloudflare 지표를 시각으로 나눈 값입니다.

| 구분 | 시각 | 채팅 | gpt-5.6-luna 입력 / 출력 | embedding | BoostChat 요청 (새 key) | Demo 02 edge 요청 |
|---|---|---|---|---|---|---|
| ① provisioning | 09:06 – 09:26 | 0 | — | FAQ 7회 · 1,143 | 0 | — |
| ② publish 전 package 검증 | 09:10 – 09:12 | 0 | — | — | 52 (frame 로드만, bootstrap 0) | 0 (로컬) |
| ③ publish 확인 + **원래 E2E** | 09:20 – 09:37:53 | **2** | 9,972 / 251 | 질문 2회 · 49 | 161 | 2,425 |
| ③-a 그 대화의 자동 요약 | 09:51:04 | — | 523 / 88 | — | — | — |
| ④ 독립 리뷰 (1회 실행) | 09:37:47 – 09:39:20 | 0 | — | — | 7 (preflight 1 · 페이지 3회분 6) | 164 |
| **⑤ 다른 프로세스의 카드 확인 2회** | 09:39:40 – 09:41:25 | **2** | **11,830 / 356** | **질문 2회 · 50** | **33** | **117** |
| ⑥ 이 창의 마지막 확인 | 10:01:07 | 0 | — | — | 0 | 요청 5개 |
| 합계 | | 4 | 22,325 / 695 | 11회 · 1,242 | 253 | 2,708 (지표 기준) |

②와 ③을 나눈 근거는 `railway-http-new-key-by-window.json`의 분 단위 분포입니다(09:10–09:12에 frame 52건, 09:26에 6건).
③의 BoostChat 161건에는 09:26에 한 번 끊고 다시 시작한 실행의 첫 페이지 3회분(6건)이 들어 있습니다. ③의 edge 요청에는
리뷰 agent가 live HTML을 비교하려고 보낸 `curl` 몇 건이 섞여 있습니다(host별 지표로는 더 나눌 수 없음). ⑥의 요청 5개 중
지표에 잡힌 것은 조회 시점에 2건이었습니다.

⑤의 자세한 내용 (원래 E2E 비용과 분리):

```
DUPLICATE_PROCESS_EXTRA   (PID 69708, resume 뒤 · 원래 E2E 종료 뒤)
  CHAT_MESSAGES          = 2 (09:39:45Z · 09:41:15Z, 각각 새 대화, 같은 질문)
  CHAT_INPUT_TOKENS      = 11,830 (5,915 + 5,915)
  CHAT_OUTPUT_TOKENS     = 356 (175 + 181)
  CHAT_TOTAL_TOKENS      = 12,186
  QUERY_EMBEDDING        = 2회 · 50 tokens (25 + 25)
  SUMMARY_CALLS          = 0 (두 대화 모두 사용자 메시지 1개 → BoostChat이 요약을 건너뜀. 09:55:02 · 09:57:02 완료)
  BOOSTCHAT_REQUESTS     = 33 (1회차 10 · 2회차 23: frame 2 · bootstrap 2 · chat 2 · 시공사례 API · 사진 27. 200: 31 · 499: 2)
  DEMO02_EDGE_REQUESTS   = 117 (200: 114 · 204: 3) · 4,814,352 bytes
  LEADS / EMAILS         = 0 / 0
  PRODUCTION_WRITES      = 0 (대화 2개와 사용량 행 4개가 남은 것 외에 설정 변경 없음)
  COST                   = UNKNOWN (검증된 단가 없음). 미확인 단가를 그대로 곱한 참고값은 chat 약 $0.0028

ORIGINAL_E2E   (비교용)
  CHAT_MESSAGES          = 2 (09:35:43Z · 09:35:49Z, 한 대화)
  CHAT_INPUT_TOKENS      = 9,972 (3,966 + 6,006)
  CHAT_OUTPUT_TOKENS     = 251 (71 + 180)
  CHAT_TOTAL_TOKENS      = 10,223
  QUERY_EMBEDDING        = 2회 · 49 tokens (24 + 25)
  AUTO_SUMMARY           = 1회 · 523 입력 / 88 출력 (09:51:04Z)
  COST                   = UNKNOWN. 같은 참고 계산으로 chat 약 $0.0023 + 요약 약 $0.0002
```

같은 구간의 Worker · R2 지표(script · bucket 단위)는 이렇게 나뉩니다. 09:38 이후 구간에는 ④ 리뷰의 페이지 3회,
⑤ 카드 확인 2회, ⑥ 마지막 확인이 함께 들어 있고, 이 지표로는 그 셋을 더 나눌 수 없습니다(host별 edge 요청은 위 표).

| 구간 | Worker 요청 | R2 GetObject | R2 HeadObject | R2 PutObject |
|---|---|---|---|---|
| 09:20:00 – 09:38:00 (원래 작업) | 2,338 | 4,218 (88,004,723 B) | 536 | 169 |
| 09:38:00 – 10:01:55 (E2E 이후) | 280 | 512 (11,443,678 B) | 33 | 0 |
| 두 구간의 합 | 2,618 | 4,730 (99,448,401 B) | 569 | 169 |
| 전체 구간을 한 번에 조회한 값 (§9) | 2,618 | 4,731 (99,448,777 B) | 570 | 169 |

R2 읽기는 두 구간의 합이 전체 조회보다 GetObject 1건(376 B) · HeadObject 1건 적습니다. 구간 경계에 걸린 요청이고,
provider 지표가 그렇게 돌려준 값을 그대로 적었습니다.

### 10-4. 중복 구간의 Claude 사용량 (개발 비용 — 제품 비용과 별개)

세션 기록에 남은 token 수입니다(`proof/demo02-accounting/session-timeline.txt`). 금액은 계산하지 않았습니다.

| 누가 | 구간 | 모델 | 응답 | 입력 (새 · cache 쓰기 · cache 읽기) | 출력 |
|---|---|---|---|---|---|
| 이 창 (PID 18533) | 09:34:19 – 09:49:46 | Opus 5.5 | 21 | 46 · 74,048 · 6,616,514 | 31,291 |
| 처음 프로세스 (PID 69708) | 09:34:19 – 09:49:46 | Opus 5.5 | 27 | 56 · 69,855 · 8,348,177 | 50,764 |
| 리뷰 agent 사본 (이 창이 다시 깨운 것) | 09:40:09 – 09:43:06 | Fable 5.1 | 6 | 135 · 14,035 · 1,200,700 | 12,630 |

이 구간에 처음 프로세스가 한 일(E2E 분석, 카드 확인, 사용량 조회, commit · push, 문서 초안)은 그대로 썼고, 이 창이 한 일은
상황 확인과 중복 조사였습니다. 중복 때문에 더 든 Claude 사용량은 대략 이 창의 행과 리뷰 사본의 행입니다.

## 11. 관찰한 오류와 분류

| 분류 | 내용 |
|---|---|
| BLOCKER | 없음 |
| MAJOR | 문의 폼: `OPTIONS` · `POST …/lead` → 403, CORS header 없음 (§0-1, §8) |
| MINOR | launcher가 BoostChat 기본 모양(파란색)이라 사이트 색과 다름 (§0-5) |
| MINOR | ≤480px에서 "맨 위로"와 launcher 사이가 24px (선언한 상자를 폭 전체에서 하나로 쓰기 때문. 480px 초과는 14px) |
| MINOR | `live-e2e` 스크립트의 카드 주소 판정이 버튼형 카드를 못 읽음 (§6. 제품 문제 아님) |
| 운영 사건 | 세션 중복 실행 (§10). 제품 결함이 아니고 운영 쓰기의 중복은 없음 |

publish 뒤 관찰: Worker error 0, R2 없는 object 0(없는 경로는 사이트 404로 응답), bootstrap 실패 0, origin 거절 0(문의 제외),
Railway 재시작 0 · 5xx 0, chat · embedding 오류 0, browser console error 0. HTTP 499는 browser가 닫은 요청입니다.

## 12. 독립 리뷰

fresh-context reviewer(읽기 전용, 결론을 알려주지 않음). BLOCKER 0, MAJOR 2.

| 발견 | MASTER 확인 | 처리 |
|---|---|---|
| MAJOR 1 — 공개 host의 문의 폼이 동작하지 않음 | 사실. E2E probe 2건과 Railway HTTP log의 403 3건으로 확인 | 미해결. owner 결정 필요 (§8) |
| MAJOR 2 — 새 host를 내리는 절차와 1.0.0 re-pin 주의가 문서에 없음. `wrangler.jsonc`가 가리키는 이 문서가 없었고 `00-summary.md`가 origin을 자리표시라고 적음 | 사실. pointer에 `previous` 없음, 1.0.0 schema는 `.strict()` | 이 문서 §7 작성, `00-summary.md`에 최종 상태 추가 |

reviewer가 따로 확인해 문제없다고 본 것: 두 release 검증, Ongyeol package가 의도한 차이만 가짐, 두 theme의 대비,
실제 domain의 겹침 0(14개 폭), interior-01과 기존 demo의 live HTML · pointer 불변, key · origin 위치, Cloudflare route와 R2 쓰기 범위,
BoostChat DB의 쓰기 범위와 감사 기록, 카드 주소가 tenant 자신의 snapshot origin에서만 만들어지는 코드 경로.

reviewer가 운영에 보낸 요청: live HTML 비교용 `curl`, 읽기 전용 R2 · Worker 조회, 문의 endpoint preflight 2건(새 key 403,
기존 key 1건), 페이지 로드 3회. 채팅 0건, 문의 제출 0건입니다.

이 문서 자체도 별도의 fresh-context 검토를 거쳤습니다(읽기 전용, 네트워크 없음): §1 · §4 · §6 · §9 · §10의 숫자를 증거 파일과
대조하고 commit할 파일의 민감 정보를 확인했습니다. 결과는 숫자 불일치 3건(모두 구간 경계의 1건 차이와 시각 2초 차이 — §9,
§10에 그대로 적음), 증거 폴더에 근거가 없던 항목 여러 건(§9 끝의 표에 있는 파일로 채움), 민감 정보 0건입니다.

## 13. 한계

- 실제 기기에서는 확인하지 않았습니다. mobile widget은 Playwright WebKit iPhone 13 emulation입니다.
- 실제 문의 제출과 알림 메일은 확인하지 못했습니다(§0-1).
- Worker · R2 지표는 script · bucket 단위입니다. host별로는 zone의 edge 요청 수만 나눠 읽었습니다.
- 긴 browser suite `inquiry163` · `inquiry163-browser`는 다시 돌리지 않았습니다(interior-01 문의 폼, 이번 변경과 무관한 파일).
- 채팅 답변 품질은 질문 2종만 봤습니다.
- 20 suite 테스트는 commit 전 최종 tree에서 돌린 결과입니다(09:12–09:21Z). commit 뒤에는 interior-02 suite만 다시 돌렸고
  (18/18), 그 뒤 추가된 것은 문서와 증거 파일뿐입니다.

## 14. Commit

```
cf2c075 fix(template): reserve floating widget safe area in interior-02
09c8494 release(template): publish interior-02 1.0.1
c4c20ff build(site): re-pin and rebuild the ongyeol interior demo (interior-02 1.0.1)
d7920ce feat(site): publish BoostInterior demo 02 at interior-demo-2.boostweb.co.kr
87cfd78 feat(site): connect dedicated BoostChat tenant to demo 02
66bcc60 build(site): build the boost interior demo 02 package (interior-02 1.0.1)
6e1ed7a test(template): pin the interior-02 corner widget contract
(이 문서) docs(site): record Demo 02 production validation
```

앞의 7개는 처음 프로세스가 09:44:33Z에 만들고 push했습니다. 이 창이 commit별 파일 목록을 확인했습니다: template 8개,
release 103개, 두 사이트의 site data와 build, `wrangler.jsonc`, 테스트 1개뿐이고 다른 세션(interior-03)의 파일은 없습니다.
BoostChat repo에는 commit이 없습니다(코드 변경 0, 운영 DB 쓰기만).
