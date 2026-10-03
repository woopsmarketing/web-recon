# WEB-RECON TRACK B — Shared Inquiry Form V2: submission idempotency + reusable customer template (2026-10-04)

```
STATUS                     = DONE — 공통 source 수정 → release → build → publish → live 검증까지 PASS
CANONICAL_SHARED_SOURCE    = platform/site/inquiry-client.ts  (platform 의 inquiry door — submission_id lifecycle · 중복 요청 합류 ·
                             Retry-After · 오류 분류 · 요청 body 가 전부 여기 한 곳)
SHARED_FORM_COMPONENT      = templates/interior-01/v1/components/InquiryForm.tsx  (+ sections/ContactPage.tsx 가 props 조립,
                             template.ts 가 slot schema, styles/template.css) — Template Release interior-01-1.6.3-93977937c0b4 로 동결
CUSTOMER_CONFIG_LAYER      = data/sites/<siteId>/{site.json (release pin), inquiry.json (endpoint), slots.json (문구·대체 연락처 링크),
                             content/business.json (email)} — 값만 있고 코드 없음
INTERIOR_DEMO_DIRECT_PATCH = NO — demo 에서 바뀐 것은 site.json 의 pin 과 slots.json 의 문구 5개뿐. generated output 은 site:build 결과 그대로
                             (1.6.2 package 대비: JS chunk 1 + CSS chunk 1 교체, HTML 15개의 렌더 결과는 script 를 빼면 전부 동일,
                             나머지 차이는 그 chunk 이름 참조와 /contact 의 폼 props 뿐. live 는 package 와 142/142 byte 동일)
SUBMISSION_ID              = PASS — logical inquiry 당 UUID v4 1개 (crypto.randomUUID). 같은 값 = 같은 id (double click · timeout · network ·
                             400 · 408 · 429 · 503 재시도), 200 / 409 뒤 폐기, 내용 변경 = 새 id. 메모리에만 있고 저장·로그·분석에 쓰지 않음
DOUBLE_CLICK               = PASS — double click · 5 click → HTTP 요청 1건, id 1개 (unit · Chromium · WebKit · 로컬 BoostChat · production)
CONCURRENT_10              = PASS — LEAD_ROWS = 1  (로컬 BoostChat 실제 route + TEST DB: door 10회 동시 → 요청 1건 / raw POST 10 방문자 10×200 → row 1 /
                             1 방문자 5×200 + 5×429 → row 1)
IDEMPOTENCY_CONFLICT       = PASS — A+P → 200, A+P → 200 (row 그대로), A+바뀐 P → 409 (row 그대로); client 는 자동 재전송 0, 다음 누름은 새 id
SOURCE_SENT_BY_CLIENT      = NO — body 는 정확히 consent, name, phone, message, hp, submission_id. source 를 넣으면 실제 route 가 400
TURNSTILE                  = DEFERRED_MVP — 켜지 않음. widget · token · CAPTCHA UI · secret · required-keys 설정 어느 것도 건드리지 않음
FUTURE_SITE_REUSABLE       = YES — release 를 pin 하고 inquiry.json 을 선언한 사이트는 코드 수정 없이 같은 동작
FUTURE_SITE_FIXTURE        = PASS — data/sites/fixture-online-inquiry (가상 고객 "소담 스튜디오 (가상)"): 설정 파일만으로 빌드,
                             inquiry chunk 가 demo 와 byte 동일 (0hyfkvg55a3sz.js, sha256 ec7556ad…), demo 값 0건 (REUSE-1…8)
PACKAGE                    = boost-interior-demo build 8a0c2118… · packageHash 3d250199… · 144 files · QA pass
                             fixture-online-inquiry build 1335551b… · packageHash b92ed857… · 145 files (publish 하지 않음)
PUBLISH                    = PASS — 2026-10-03T20:07Z, common pipeline (dry-run → upload+seal → reverify 144/144 → --expect-live eeb82881… --expect-package 3d250199…)
LIVE_E2E                   = PASS — https://interior-demo.boostweb.co.kr/contact 에서 [TEST] Shared Inquiry V2 1건: double click → POST 1건 →
                             200 {"received":true} → DB row 1 (source=website_form, submission_id NOT NULL, notified_at 1회) →
                             같은 id+payload replay → 200, row 여전히 1, notified_at 불변
TYPECHECK                  = PASS — tsc --noEmit ×3 (root · platform+templates · workers/recon-runtime) exit 0
BUILD                      = PASS — template-release gate · site:build ×2 (package QA) · integration suite 의 실제 Next build
TEST                       = PASS — 21 suite 0 failed (inquiry163 29 · inquiry163-browser 62 · inquiry163-reuse 8 · inquiry162 28 · integration 85 ·
                             publish 66 · publish-e2e LOCAL 47 · 그 외 14 suite) + 로컬 BoostChat E2E B 28 / C 19 + live QA 109 rows / 799 assertions
PRODUCTION                 = live package 3d250199… (previous eeb82881… 보존, rollback 가능). production lead 정확히 1건 생성, 삭제하지 않음.
                             BoostChat 은 배포·설정 변경 없음 (읽기 + 계약 probe 1건 + 실제 제출 1건/replay 1회)
KNOWN_ISSUES               = §8 (11건 — blocker 없음. 운영상 중요한 것: 고객의 BoostChat 문의 폼 설정이 사이트 폼과 맞아야 함, Turnstile 은 이 폼의 key 에 켜면 안 됨)
GIT                        = origin/main (1cc6022) 에서 시작 · 24c8bcb feat(site) · 6ef93d7 build(site) · docs(site) commit (이 보고서) — push 없음
```

세부 보고서: [`shared-inquiry-form-v2/`](shared-inquiry-form-v2/) —
[01 설계와 lifecycle](shared-inquiry-form-v2/01-design-and-lifecycle.md) ·
[02 테스트](shared-inquiry-form-v2/02-tests.md) ·
[03 로컬 BoostChat E2E](shared-inquiry-form-v2/03-local-boostchat-e2e.md) ·
[04 publish 와 live QA](shared-inquiry-form-v2/04-publish-and-live-qa.md) ·
[05 독립 리뷰와 처리](shared-inquiry-form-v2/05-independent-review.md) ·
Phase 0 정찰 [`../work/track-b-shared-inquiry-v2/00-current-architecture.md`](../work/track-b-shared-inquiry-v2/00-current-architecture.md)

## 1. 무엇을 했나

홈페이지 문의 폼이 **같은 문의를 몇 번 보내도 lead 가 1건**만 생기게 했다. 방법은 폼이 문의마다 `submission_id` 를 붙이고
BoostChat 이 그 id 로 한 번만 저장하는 것이다 (서버 쪽은 이미 배포되어 있었고, 이 작업은 건드리지 않았다).

중요한 것은 **어디에** 넣었느냐다. interior-demo 를 고친 것이 아니라 Track B 의 공통 계층에 넣었다.

```
platform/site/inquiry-client.ts            ← lifecycle 전부 (공통 runtime, 사이트를 모른다)
templates/interior-01/v1/…                 ← 상태 표시와 문구 선택 (공통 component)
        │  template-release (동결, content-addressed)
        ▼
data/template-releases/interior-01/interior-01-1.6.3-93977937c0b4/
        │  site.json 의 pin
        ├──────────────────────────┬──────────────────────────────┐
        ▼                          ▼                              ▼
data/sites/boost-interior-demo   data/sites/fixture-online-inquiry   (앞으로 만드는 고객 사이트)
        │  site:build                │  site:build
        ▼                          ▼
package 3d250199… → publish      package b92ed857… (증명용, publish 안 함)
```

공통 source 에는 hostname · widget key · site id · 업종 분기가 없다 (test REUSE-5 가 grep 으로 강제한다).

## 2. submission_id lifecycle

규칙은 하나다: **id 는 "값"에 묶인다** (정규화된 name · phone · message · hp). 같은 값은 같은 id, 다른 값은 자기 id.
서버가 확정(200)하거나 영구 거절(409)하면 그 값의 id 를 잊는다. state machine 이 아니라 `Map<값, id>` 하나다.

| 요구 | 상황 | 결과 |
|---|---|---|
| A | 새 문의 | 새 UUID |
| B | client validation 오류 | 요청 없음 — id 불변 |
| C · D · E · F | 400 · network · timeout/408 · 503 뒤 같은 내용 재전송 | **같은 id** |
| G | 429 rate_limited | Retry-After 동안 요청 0건 (버튼 disabled), 이후 **같은 id** |
| H | 200 | id 폐기 → 다음 문의는 새 UUID |
| I | 결과 불확실 + 내용 변경 | 새 UUID (되돌리면 원래 id) |
| J | 409 | 자동 재전송 없음, 다시 누르면 새 UUID |

자동 재전송은 어떤 경우에도 없다. correctness 는 버튼 disabled 가 아니라 **door 의 요청 합류 + 서버 idempotency** 가 보장한다.

## 3. 오류 안내 (TASK 5)

| 응답 | 안내 | 대체 연락처 |
|---|---|---|
| 200 | 접수 완료 (필드 제거) | — |
| 400 | 입력 확인 안내, 입력 유지 | 표시 |
| 408 / timeout · 503 · 알 수 없는 응답 | 기존 실패 문구, 입력 유지, crash 없음 | 표시 |
| 409 | "문의 내용이 변경되었습니다. 다시 보내 주세요." — 기술 용어 없음 | 없음 (다시 누르면 접수됨) |
| 429 rate_limited | "약 N분 후 다시" — Retry-After 를 실제로 읽음 | 표시 |
| 429 channel_capacity | 일시적으로 어렵다는 안내 (방문자 잘못이 아님) | 표시 |
| network / CORS | 실패 안내, 반복 재전송 없음 | 표시 |

대체 연락처는 사이트가 가진 것만 (`fallbackLinkA/B` slot + business email), 링크로만 보여 준다. 메일 앱을 자동으로 열지 않는다.
기존 문구는 바꾸지 않았다 (새 slot 5개 + 링크 slot 2개만 추가, 전부 optional).

## 4. 기존 UX (TASK 6)

개인정보 동의 · honeypot · 전화번호 validation · invisible/control 문자 처리 · hydration 전 submit 방지 · loading/success/error ·
실패 후 입력 보존 · 자동 mailto fallback 없음 · responsive — 전부 유지. `inquiry162.test.ts` (1.6.2 의 계약 28건) 가 그대로 통과한다.
서버 렌더 HTML 은 1.6.2 와 같다. `inquiry.json` 이 없는 사이트의 mailto 폼은 변하지 않는다.

## 5. 검증 요약

| 단계 | 무엇으로 | 결과 |
|---|---|---|
| 계약 FORM-ID-1 … 12 | door unit (fetch stub) + 빌드된 package 를 Chromium · WebKit 으로 | PASS |
| FORM-ID-13 (future fixture) | 두 번째 사이트를 설정만으로 빌드, 같은 테스트를 두 사이트에 | PASS |
| FORM-ID-14 (concurrent 10) | 로컬에서 띄운 **진짜 BoostChat route** + TEST DB, row 수를 SQL 로 | LEAD_ROWS = 1 |
| 기존 회귀 | 21 suite, typecheck ×3 | 0 failed |
| responsive | 1440 / 1024 / 768 / 390 / 375 + WebKit iPhone 13, 7 상태 | overflow 0, 버튼 ≥ 44px, launcher 가 폼을 가리지 않음 |
| 독립 리뷰 ×2 | fresh-context reviewer (결론을 알려 주지 않음) | blocker 0; MAJOR 2건 처리 후 전부 재검증 |
| production | 실제 제출 1건 + replay | lead 1건 |

로컬 E2E 에서 확인된 실제 중복 경로 하나: **Chromium 은 keep-alive 연결이 응답 전에 끊기면 POST 를 스스로 다시 보낸다.**
페이지는 요청 1건으로 봤고 서버는 2번 받았다 — `submission_id` 덕분에 row 1건. 이전 body 였다면 2건이었다.

## 6. 독립 리뷰가 바꾼 것

- 1차: wall-clock 대기, 값별 id 기억(되돌리면 원래 id), 성공 직후 gap, never-reject, 같은 값만 합류, 페이지당 sender 하나 등 11건 수정.
- 2차 (release 리뷰): **M1** production 이 6-key body 를 받는지 증명된 적 없음 → publish 전에 write-free probe 로 확인.
  **M2** 400 / unknown 에 대체 연락처가 없어, 고객의 BoostChat 설정이 폼과 어긋나면 방문자가 막다른 길에 선다 →
  공통 폼에서 conflict 를 뺀 모든 실패에 대체 연락처 표시. release 를 다시 끊고 전부 재검증했다.

## 7. production 에 남긴 것

- live package `3d250199…` (1.6.3). previous `eeb82881…` (1.6.2) 는 store 에 그대로 — `site-publish --rollback` 가능.
- lead 1건: 이름 `[TEST] Shared Inquiry V2`, `source=website_form`. **삭제하지 않았다.** 필요하면 BoostChat 관리 화면에서 정리.
- owner 알림: DB 의 `notified_at` 이 첫 POST 때 한 번 찍혔고 replay 뒤에도 그대로다. 메일함 자체는 확인하지 못했다 (1통이어야 한다).

## 8. KNOWN_ISSUES

| # | 내용 | 영향 / 대응 |
|---|---|---|
| 1 | **BoostChat 은 tenant 의 문의 폼 설정(`lead_form_config`)으로 검증한다.** 고객이 email 을 필수로 켜면 이 폼(email 필드 없음)의 모든 제출이 400. message 필드를 끄면 200 이지만 본문이 저장되지 않는다 | 새 고객 onboarding 때 설정을 맞추고 실제 제출 1건으로 확인. 방문자에게는 400 에서도 대체 연락처가 보인다 |
| 2 | **Turnstile 은 이 폼이 쓰는 key 에 켜면 안 된다** (DEFERRED_MVP). 켜면 모든 제출이 403 → 일반 실패 안내 | Turnstile 을 지원하는 Template release 가 나올 때까지 OFF 유지 |
| 3 | Retry-After 를 최대 60분으로 자른다. 방문자 일일 상한(최대 24시간)에서는 "약 60분" 뒤에도 거절된다 | 대체 연락처가 함께 보인다. 문구 분리는 후속 |
| 4 | idempotent 재전송도 방문자 budget (5회/10분) 을 쓴다. 응답이 유실된 문의를 계속 누르면 6번째에 429 (lead 는 여전히 1건) | 서버 정책. 안내 문구로 처리됨 |
| 5 | id 는 메모리에만 있다. 결과가 불확실한 채로 reload · 탭 닫기 후 다시 쓰면 새 id → 중복 가능 | 설계 — id 를 storage 에 두지 않는다 (추적 식별자로 쓰이지 않게) |
| 6 | 대기(429) 중 버튼이 `disabled` 라 keyboard focus 를 받지 못하고, 대기 종료를 따로 알리지 않는다 | 기존 loading 상태와 같은 방식. a11y 개선은 후속 |
| 7 | content model 에 사업자 연락처는 email 뿐이다. 전화 · Kakao · Naver · Instagram 필드가 없다 | 대체 연락처는 link slot 2개 (`tel:` / `mailto:` / 사이트 내 경로) + email. 외부 https 채널은 platform QA 결정 필요 |
| 8 | 새 문구 slot 의 neutral default 는 영어다. 한국어 사이트가 비워 두면 영어 안내가 경고 없이 나간다 (fixture 가 일부러 2개를 비워 확인) | onboarding 확인 항목. builder 경고는 후속 |
| 9 | 등록되지 않은 origin 은 CORS header 없는 403 → 브라우저에서는 network 실패로 보인다 | 새 사이트는 BoostChat 에 origin 등록 + key opt-in 이 먼저 |
| 10 | wall clock 이 두 문장 사이에 1초 이상 앞으로 뛰면 대기가 풀리지 않는다 (reload 로 해소) | 사실상 도달 불가 |
| 11 | 확인하지 않은 것: owner 메일함, WebKit/Firefox 로의 실제 서버 E2E (WebKit 은 stub 으로만), Turnstile ON 경로. `scripts/template-platform-ia-smoke.ts:470` 의 오래된 기대값은 이 작업 이전부터 있던 것으로 손대지 않았다 | — |

git 에 넣지 않은 것: `docs/result/static-deployment-foundation/proof/live-e2e.json` (이 작업 이전부터 untracked, 무관),
스크린샷 (`docs/result/**/*.jpg` 는 gitignore).

## 9. 답

**1. 이번 수정은 interior-demo 전용인가?**
아니다. 동작은 전부 공통 source (`platform/site/inquiry-client.ts` + Template `interior-01`) 에 있고, interior-demo 에서 바뀐 것은
release pin 과 문구 5개다. demo 의 generated 파일을 직접 고친 것은 없다.

**2. 앞으로 Track B로 생성되는 고객 사이트도 같은 기능을 받는가?**
받는다. `interior-01` 1.6.3 이상을 pin 하고 `inquiry.json` 에 endpoint 를 선언한 사이트는 같은 JS 를 받는다 — demo 와 fixture 의
inquiry chunk 가 byte 단위로 같다. (이미 만들어진 사이트는 release 가 불변이므로 re-pin 해서 다시 빌드해야 받는다. 다른 Template 을
새로 만들면 door 는 그대로 쓰고 폼 component 만 그 Template 이 가진다.)

**3. 사용자가 같은 문의를 여러 번 눌러도 lead는 몇 건 생기는가?**
1건. 진행 중의 누름은 같은 요청에 합류하고 (요청 자체가 1건), 요청이 여러 번 가더라도 같은 `submission_id` 라 서버가 1건만 저장한다.
production 에서 double click + replay 로 확인했다 (row 1).

**4. network timeout 후 다시 눌렀을 때 submission_id는 바뀌는가?**
바뀌지 않는다 — 내용이 같으면 같은 id 다. 내용을 고치면 새 id 가 되고, 원래 내용으로 되돌리면 원래 id 로 돌아간다.

**5. 홈페이지 문의의 source는 누가 결정하는가?**
BoostChat 서버다 (`website_form`). client 는 `source` 를 보내지 않으며, 보내면 서버가 400 으로 거절한다.

**6. Turnstile을 이번 작업에서 켰는가?**
아니다. DEFERRED_MVP 그대로다 — widget · token · CAPTCHA UI 를 넣지 않았고 BoostChat 의 Turnstile 설정도 건드리지 않았다.

**7. 새 고객 사이트를 하나 생성하면 별도 개발 없이 같은 문의 안정화 기능을 가지는가?**
그렇다. `fixture-online-inquiry` 를 코드 0줄 · 설정 파일만으로 만들어 같은 테스트를 통과시켰다. 개발이 아닌 준비는 필요하다:
BoostChat 에 그 사이트의 origin 등록과 key opt-in, 그리고 문의 폼 설정이 사이트 폼과 맞는지 확인 (KNOWN_ISSUES 1 · 9).
