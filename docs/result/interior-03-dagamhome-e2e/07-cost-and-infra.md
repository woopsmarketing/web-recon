# interior-03 — 07. 비용과 인프라

작성일 2026-10-09. 시각은 UTC. 측정하지 못한 값은 UNKNOWN으로 적었고 추정으로 채우지 않았다.
증거는 `proof/accounting/`, 조회 script는 `proof/scripts/*.txt`(전부 읽기 전용).
조회 구간은 첫 publish부터 마지막 실도메인 요청 뒤까지(10:46:00 → 11:56:00)이고, 그 안에 publish 2회와 실도메인 E2E 2회가 들어 있다(`05` §1 · §3).

## 요약

```
KNOWN_INCREMENTAL_COST  = 0 (청구가 확인된 항목 없음)
UNKNOWN_COST_COMPONENTS = Worker 요청 · R2 작업과 저장 · Railway runtime · OpenAI token
                          (전부 사용량은 측정함. 금액은 계정의 요금제 · 무료 한도 · 단가를 확인하지 못해 UNKNOWN)
```

Claude Code 사용량은 제품 runtime 비용이 아니라서 이 표의 어디에도 넣지 않았다(§I에 따로).

## A. Track B build

```
TOTAL_WALL_CLOCK       = 00-summary.md의 TOTAL_E2E_TIME 참조 (시작 09:04:02Z)
DISCOVERY_TIME         = 13 min 13 s (09:04:02 → 09:17:15, 대표 page 선정 file 기록까지. repo 정찰 포함)
OBSERVATION_TIME       = 21 min 46 s (09:16:39 → 09:38:25, discovery 끝과 겹침. pipeline observe 7회 + 수동 관찰)
AUTHORING_TIME         = 54 min 59 s (09:32:17 → 10:27:16, 영역별 staging 시작 → 첫 release 생성.
                         병렬 작성 · 병합 · fidelity 수정 · release 전 독립 리뷰와 수정 포함. observation 끝과 겹침)
BUILD_COUNT            = release 22회 · site build 24회
                         정식 트리: release 2 · site build 4 (첫 release와 그 build 2, 최종 리뷰 뒤 다시 만든 release와 그 build 2)
                         git-ignore된 staging(`tmp/i03-*`): release 20 · site build 20 (기록된 성공 build 기준)
SITE_BUILD_TIME        = 최종 fixture 8.2 s · Demo 03 8.1 s (첫 build는 7.9 s · 7.6 s. staging build의 시간은 기록에 없음 → UNKNOWN)
PACKAGE_SIZE           = fixture 8,838,388 B · Demo 03 7,846,504 B
FILE_COUNT             = fixture 242 · Demo 03 168
BUILD_AI_RUNTIME_CALLS = 0 (release · build · package QA · publish에 model 호출 없음)
BUILD_AI_RUNTIME_COST  = 0
```

test suite도 Next build를 여러 번 돌리지만 site build 수에는 넣지 않았다.

## B. Cloudflare Worker

```
WORKER_USED        = YES
WORKER_NAME        = recon-runtime-pilot (기존 Worker. 새로 만들지 않음)
DEPLOY_COUNT       = 1 (10:49:43 → 10:49:49, route 한 줄 추가. 다시 publish할 때는 배포하지 않음)
REQUESTS_DURING_QA = interior-demo-3 host 1,833 (zone 기준, 10:46:00 → 11:56:00)
                       10:46–10:52 첫 publish 확인        24  (200: 20 · 404: 4)
                       10:52–11:04 실도메인 E2E (a–c)    865  (200: 764 · 204: 67 · 304: 17 · 404: 1 · 499: 16)
                       11:04–11:37 회귀 확인 · 최종 리뷰   83  (200: 73 · 404: 10)
                       11:37–11:41 다시 publish 확인       17  (200: 10 · 404: 7)
                       11:41–11:51 실도메인 E2E (d–e)    844  (200: 751 · 204: 32 · 304: 8 · 404: 7 · 499: 46)
                       11:51–11:56                          0
                     publish 전(09:00–10:46) 이 host의 요청 6건은 모두 다른 Worker의 404
                     204는 zone이 넣는 beacon의 응답이라 이 Worker를 거치지 않는다
                     Worker 전체(세 host 합계, 같은 70분): success 2,035 · clientDisconnected 51 · error 0
CPU_TIME           = success 요청 P50 1.17 ms · P99 2.91 ms (Worker 전체. host별로 나눌 수 없음)
TRANSFER           = interior-demo-3 host의 edge 응답 49,704,868 B (zone 기준, 같은 70분)
WORKER_COST        = UNKNOWN (zone은 Free plan으로 표시됨. Workers 요금제와 일일 한도 대비 계정 전체 사용량은 조회하지 못함)
```

같은 70분 동안 `interior-demo-2`에 332건, `interior-demo`에 29건이 있었다. 이 작업이 보낸 것은 확인용 `curl`(MASTER의 회귀 · publish 확인과 독립 리뷰어의 것)이고 나머지는 이 작업이 아니다.

## C. Cloudflare R2

```
R2_USED          = YES
BUCKET           = boost-sites-artifacts (기존 bucket)
OBJECTS_CREATED  = 339 (첫 publish 170: package file 168 + seal 1 + host pointer 1. 다시 publish 169: package file 168 + seal 1)
OBJECTS_REPLACED = 1 (다시 publish할 때 host pointer)
BYTES_UPLOADED   = 15,788,647 B (PutObject 340건의 합. 첫 publish 170건 7,894,157 B · 다시 publish 170건 7,894,490 B)
STORAGE_DELTA    = +339 objects · +15.79 MB (올린 양 기준. pointer 교체분은 object 수에서 뺌).
                   Cloudflare의 저장량 지표로는 첫 publish만 확인됨: 10:10Z 2,385 objects · 131,522,069 B → 10:50Z 2,555 objects · 139,416,226 B
                   (+170 · +7,894,157 B, 올린 양과 일치). 다시 publish한 뒤의 표본은 12:01Z 조회 때 아직 없었다
                   첫 package(169 objects · 7.89 MB)는 지금 서비스되지 않지만 R2에 남아 있다. publish 도구는 package를 지우지 않는다
CLASS_A_OPS      = 340 (PutObject. 10:46:00 → 11:56:00)
CLASS_B_OPS      = 4,630 (GetObject 4,323 · HeadObject 305 · HeadBucket 2. bucket 전체 — 세 host의 서비스와 publish 검증이 섞여 있고 나눌 수 없음)
                   publish 전 store 확인 dry-run(10:33) 구간(10:12 → 10:46)의 bucket 전체: GetObject 10
EGRESS           = R2 → Worker 응답 object 합 110,266,138 B (GetObject, bucket 전체). R2는 egress를 따로 과금하지 않는다고 알려져 있으나 이 계정의 청구로 확인하지는 않음
R2_COST          = UNKNOWN (무료 한도 대비 계정의 월 누적 사용량을 조회하지 못함)
```

## D. Domain / DNS

```
DOMAIN_PURCHASE_COST = 0 (boostweb.co.kr의 subdomain. 구매 없음)
DNS_CHANGE_COST      = 0 (record를 만들거나 바꾸지 않음)
```

## E. BoostChat / Railway

`app` service, railway metrics API(1분 표본)와 HTTP log(10:40:27 → 11:55:14).

```
RAILWAY_USED     = YES (실도메인 E2E의 widget · chat 요청. tenant 준비 작업은 laptop에서 DB에 직접 실행했고 app을 거치지 않음)
REQUESTS         = 966 (그 구간의 전체 tenant). 그중 Demo 03 key가 주소에 있는 것 175:
                     widget page 45 · bootstrap 45 · chat 7 · portfolio 상세 17 · portfolio media 55(499 2건 포함) · conversation 2 · lead 4(전부 403)
                     구간별: E2E (a–c) 99 · (d) 53 · (e) 23 · 그 밖의 시간 0
                   browser에서 센 값: 전체 실행 (a) · (d) 각각 BoostChat host로 327건(완료 324). key가 주소에 없는 script · 정적 file 포함
                   Demo 02 key 50건(이 작업 아님 — 이 작업의 script는 Demo 03 key만 쓴다) · Demo 01 key 0건
MEMORY_BEFORE    = 0.4247 GB (10:52)
MEMORY_PEAK      = 0.4581 GB (11:41–11:51, E2E (d–e) 중)
MEMORY_AFTER     = 0.4574 GB (11:55)
                   Demo 03 요청이 있던 구간의 변화: (a–c) 0.4247 → 0.4285 · (d–e) 0.4569 → 0.4581
                   나머지 증가(0.4286 → 0.4562)는 11:15 → 11:18의 3분 사이에 생겼고, 그때(11:04 → 11:41) Demo 03 key의 요청은 0건이다.
                   다른 tenant의 요청 218건이 있던 구간이고 원인은 확인하지 못했다
CPU_IF_AVAILABLE = 최고 0.0119 vCPU (a–c) · 0.0095 vCPU (d–e). 구간 전체의 최고는 11:16의 0.0167 vCPU(Demo 03 요청 없음). 한도 8
RESTARTS         = 0 (HTTP log의 deployment가 5b4afeee 하나, instance 하나. 배포 목록도 2026-10-08 19:39Z의 것이 그대로)
5XX              = 0 (403 7건 중 4건이 이 작업의 lead probe)
RAILWAY_INCREMENTAL_COST = UNKNOWN (사용량 과금이고 다른 사용과 섞여 있어 나눌 수 없음)
```

## F. OpenAI / embedding

`ai_usage_event`, tenant `boost-interior-demo-03`, 09:00 → 12:01 조회.

```
CHAT_MODEL_CALLS  = 7 (gpt-5.6-luna, widget chat) — E2E (a) 2 · (b) 1 · (c) 1 · (d) 2 · (e) 1
                    + 대화 요약 1회(11:13:04) (gpt-5.6-luna, `conversation_summary`). 끝난 대화를 제품이 스스로 요약하는 호출이다
EMBEDDING_CALLS   = 14 (text-embedding-3-small) — FAQ 7건 복사 때 7 · 질문 embedding 7
INPUT_TOKENS      = 38,144 (chat 37,697 + 대화 요약 447)
OUTPUT_TOKENS     = 1,031 (chat 961 + 대화 요약 70)
EMBEDDING_TOKENS  = 1,316 (FAQ 1,143 + 질문 173)
AI_ESTIMATED_COST = UNKNOWN
```

UNKNOWN인 이유는 Demo 02 보고서와 같다: gpt-5.6-luna의 단가는 boost-chat 문서에 "지시서 값"으로만 있고(입력 $0.20 · 출력 $1.20 / 1M) provider에서 확인한 값이 아니다.
`ai_usage_event`는 cached 입력을 따로 기록하지 않는다. 그 미확인 단가를 그대로 곱하면 위 호출 전체가 약 $0.009이고, 확정 금액이 아니다.
대화 요약은 대화가 끝나고 몇 분 뒤에 생기므로, 조회 뒤에 (d) · (e)의 대화에 대한 요약 호출이 더 생길 수 있다.

기존 tenant `boost-interior-demo`의 AI 사용량 행은 이 구간에 0이다.

## G. E-mail / lead

```
TEST_LEAD_COUNT     = 0 (문의 POST는 browser 안에서 가로챔. Demo 03 tenant의 lead_request 행 0)
EMAIL_SENT_COUNT    = 0 (접수된 lead가 없어 알림 mail이 나갈 일이 없음. mail provider의 log를 직접 보지는 않음)
EMAIL_PROVIDER_COST = 0
```

같은 구간에 `boost-interior-demo-02` tenant에는 lead_request 행이 1건 생겼다. 이 작업의 것이 아니다:
이 작업이 server에 보낸 lead 요청 4건은 모두 Demo 03 key였고 전부 403으로 거절됐다(§E).

## H. 합계

```
KNOWN_INCREMENTAL_COST  = 0
UNKNOWN_COST_COMPONENTS = Worker 요청 · R2 작업과 저장 · Railway runtime · OpenAI token
```

## I. 제품 비용이 아닌 것

**Claude Code 사용량** — 금액과 전체 token은 UNKNOWN(세션에서 조회할 수 없음). 알려진 것만:

- MASTER는 Claude Opus 5.5.
- subagent는 지시대로 Fable 5.1로 시작했다. **10:30Z쯤 Fable 사용 한도에 걸려** 그 뒤의 subagent는 다른 model로 돌렸다:
  7폭 sweep · proof(Sonnet 5.5, 145,058 token), live E2E script 적응(Sonnet 5.5, 116,730 token), 최종 독립 리뷰(Opus 5.5 xhigh, 63,294 token).
  한도에 걸려 끊긴 Fable agent 4개(회귀 · sweep · live script · 10:58Z의 최종 리뷰 재시도)는 결과 없이 끝났고, 회귀는 shell script로 다시 돌렸다.
- 세션이 한 번 다른 machine에서 이어졌고 그동안 원래 process도 잠시 같이 돌았다. 그 겹친 구간의 작업(tenant 생성 · FAQ 복사)은 한 번만 실행됐다(audit 기록으로 확인).

**BoostChat widget script의 local 요청** — release 전 screenshot helper가 BoostChat host를 막지 않아, local에서 Demo 03 package를 14번 여는 동안 production의 `widget.js`가 요청됐다.
local origin은 허용 origin이 아니라 widget은 뜨지 않았고 chat · lead 요청은 없었다. 그 뒤의 local 검사는 모두 host를 막았다.

## 조회 방법

| 값 | 출처 |
|---|---|
| Worker 요청 · CPU, R2 작업 · 저장 | Cloudflare GraphQL Analytics (`cf-usage.mjs`) — adaptive 표본이라 작은 수는 ±가 있을 수 있음 |
| host별 요청 · byte | Cloudflare zone `httpRequestsAdaptiveGroups` (`cf-zone-hosts.mjs`) |
| Railway memory · CPU | railway metrics API (`rw-usage.sh`), 1분 표본 |
| Railway 요청 · 5xx · instance | `railway logs --http --json` → key · 상태별 집계만 저장(`rw-http-summary.mjs` → `railway-http-summary.json`). IP · request id가 든 원본은 저장하지 않음 |
| model 호출 · token · lead 행 | production DB의 읽기 전용 transaction (`prod-usage-check.sh`, `prod-recheck.sh`), system identifier 확인 후 |
