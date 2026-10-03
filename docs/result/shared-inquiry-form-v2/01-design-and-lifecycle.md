# 01 — 설계와 submission_id lifecycle

Phase 0 정찰: [`../../work/track-b-shared-inquiry-v2/00-current-architecture.md`](../../work/track-b-shared-inquiry-v2/00-current-architecture.md)

## 1. 무엇을 어디에 구현했나

| 계층 | 파일 | 이번에 들어간 것 |
|---|---|---|
| 공통 runtime (platform) | `platform/site/inquiry-client.ts` | submission_id 생성·보관·폐기, 중복 요청 합류, Retry-After 대기, 오류 분류, 요청 body 고정 |
| 공통 component (Template) | `templates/interior-01/v1/components/InquiryForm.tsx` | 상태 표시(loading / paused / failed / done), 오류 종류별 문구 선택, 대체 연락처 표시 |
| 공통 props 조립 | `templates/interior-01/v1/sections/ContactPage.tsx` | slot → 문구, 사이트 데이터 → 대체 연락처(`onlineFallback`) |
| 공통 schema | `templates/interior-01/v1/template.ts` `contact.page` | text slot 5개 + link slot 2개 (전부 optional, neutral default) |
| 공통 style | `templates/interior-01/v1/styles/template.css` | `.i1-form__contacts*` 규칙 3개 |
| 고객 config | `data/sites/<siteId>/slots.json`, `inquiry.json`, `content/business.json` | 문구·endpoint·연락처 값만 |

Template 코드는 release gate 때문에 `crypto` / `fetch` / `setTimeout` / `Date` 를 쓸 수 없다. 그래서 id 와 timer 는
**platform door 한 곳**에만 있고, Template 은 door 가 돌려준 결과만 읽는다. 고객별 코드는 없다.

Template 버전 `1.6.2 → 1.6.3` (patch: optional slot 추가뿐. route / section / settings / content model 변경 없음.
1.6.2 site 문서는 그대로 유효하고, `inquiry.json` 이 없는 사이트의 mailto 폼은 변하지 않는다).

## 2. door API

```ts
createInquirySender(endpoint): InquirySender        // 독립된 기억을 가진 sender (테스트용 격리)
inquirySender(endpoint): InquirySender              // 페이지당·endpoint 당 하나 (폼이 쓰는 것)
type InquirySender = (submission) => Promise<InquiryResult>   // throw / reject 하지 않는다
type InquiryResult = { status: "ok" }
                   | { status: "failed"; reason: InquiryFailure; wait?: { seconds: number; over: Promise<void> } }
type InquiryFailure = "invalid" | "conflict" | "rate_limited" | "capacity"
                    | "timeout" | "unavailable" | "network" | "unknown"
```

요청 body 는 정확히 `consent, name, phone, message, hp, submission_id` — `source` 도 `turnstile_token` 도 없다.
Template 에는 status code·응답 본문·오류 detail 이 넘어가지 않는다 (닫힌 어휘 한 단어 + 대기 시간뿐).

## 3. lifecycle — 규칙 하나

> **id 는 "값(정규화된 name·phone·message·hp)"에 묶인다. 같은 값은 같은 id, 다른 값은 자기 id.
> 서버가 확정(200)하거나 영구 거절(409)하면 그 값의 id 를 잊는다.**

state machine 이 아니라 `Map<값, id>` 하나다. 요구사항 A–J 가 전부 이 규칙에서 나온다.

| 요구 | 상황 | 동작 | 근거 |
|---|---|---|---|
| A | 새 문의 | 처음 보내는 값 → 새 UUID (`crypto.randomUUID()`) | Map 에 없음 |
| B | client validation 오류 | 요청 자체가 없음 → id 불변 | door 호출 전에 return |
| C | 서버 400 | id 유지. 같은 값 재전송 → 같은 id | Map 유지 |
| D | network failure | 입력 유지, 같은 값 → 같은 id | Map 유지 |
| E | timeout / 408 | 같은 id | Map 유지 |
| F | 503 | 같은 id | Map 유지 |
| G | 429 rate_limited | Retry-After 동안 요청 0건, 이후 같은 값 → 같은 id | Map 유지 + 대기 |
| H | 200 received | 그 값의 id 폐기 → 다음 문의는 새 UUID | Map 에서 삭제 |
| I | 결과 불확실 + 내용 변경 | 새 값 → 새 UUID | 다른 key |
| J | 409 conflict | 자동 재전송 없음, id 폐기 → 재제출은 새 UUID | Map 에서 삭제 |

독립 리뷰가 지적해 넣은 보강:

- **값을 되돌리면 원래 id 로 돌아간다.** A(timeout, 실제로는 저장됨) → B 로 수정 → 다시 A: A 의 원래 id 가 나가므로 A 가 두 번 저장되지 않는다.
- **페이지당 sender 하나.** 헤더 링크로 다른 페이지에 갔다 돌아와(client-side navigation) 같은 내용을 다시 써도 같은 id. 저장은 메모리뿐 — reload 하면 처음부터.
- **대기는 wall clock 기준.** 휴대폰이 잠겨 timer 가 멈춰도 Retry-After 가 늘어나지 않는다 (`INQUIRY_PAUSE_TICK_MS` 마다 시계를 다시 본다).
- **절대 reject 하지 않는다.** `crypto` 가 throw 하면 id 없이 보낸다 (서버는 optional). `AbortController` 가 없으면 `unknown`.
- **성공 직후 gap.** 200 뒤에는 `inFlight` 를 풀지 않는다 — 필드가 사라지기 전에 두 번째 submit 이 새 id 로 나갈 수 없다.

## 4. 중복 클릭

correctness 는 UI 가 아니라 두 겹이 보장한다.

1. door: 요청이 진행 중일 때 같은 값의 호출은 그 요청에 **합류**한다 (요청 1건, 결과 공유). 다른 값은 거절(`unknown`).
2. 서버: 같은 id + 같은 값은 row 1건 (unique index).

버튼 disabled / "접수 중…" 은 사용자가 헛누름을 안 하게 하는 표시일 뿐이다.

## 5. 오류 → 사용자 안내

| 서버 응답 | door reason | 문구 slot | 추가 동작 | 대체 연락처 |
|---|---|---|---|---|
| 200 `{"received":true}` | ok | successTitle / successBody | 필드 제거, 확인 영역에 focus | — |
| 400 (6종) | invalid | invalidText | 입력 유지 | 표시 |
| 408 / 15초 timeout | timeout | failureText (기존 문구) | 입력 유지, 재시도 가능 | 표시 |
| 409 idempotency_conflict | conflict | conflictText | 자동 재전송 없음. 기술 용어 없음 | **없음** (다시 누르면 새 문의로 바로 접수된다) |
| 429 rate_limited | rate_limited | rateLimitedText (`{minutes}`) | 버튼 disabled → 대기 끝나면 해제 + 안내 지움 | 표시 |
| 429 channel_capacity | capacity | capacityText | 자동 재전송 없음 | 표시 |
| 503 | unavailable | failureText | 입력 유지 | 표시 |
| network / CORS / redirect | network | failureText | 자동 재전송 없음 | 표시 |
| 그 밖 (403·404·5xx·비 JSON 200) | unknown | failureText | crash 없음, 입력 유지 | 표시 |

자동 재전송은 어떤 경우에도 없다. 재시도는 항상 사용자의 누름이다 (503 의 "bounded retry 또는 사용자 재시도" 중 후자).

대체 연락처 = 사이트가 가진 것만: `fallbackLinkA/B` slot (`tel:` / `mailto:` / 사이트 내 경로) + business email.
링크로만 보여 주고, 메일 앱을 자동으로 열지 않는다. 없는 사이트는 아무것도 나오지 않는다.

**conflict 를 뺀 모든 실패에서 보여 준다** (독립 release 리뷰 M2 로 넓혔다 — 처음에는 capacity·network 뿐이었다).
이유: 400 은 방문자의 입력이 아니라 고객의 BoostChat 문의 폼 설정 때문일 수 있고(예: email 필수), 장애나 대기가
안내보다 길어질 수 있다. 어떤 경우에도 방문자가 "보낼 수 없는 폼"만 보고 떠나게 두지 않는다.

## 6. 개인정보

- submission_id 는 요청 body 에만 쓴다. storage·cookie·log·analytics 에 쓰지 않고, 폼 한 건의 idempotency 외 용도가 없다.
- door 에 `console.*` 없음. 이름·전화·본문을 새로 기록하는 곳 없음.
- 증거 파일에는 id 의 앞 8자만 남긴다.

## 7. 기존 UX

유지: 개인정보 동의, honeypot, 전화번호 규칙, invisible/control 문자 정규화, hydration 전 disabled, loading,
success, error, 실패 후 입력 보존, mailto 자동 fallback 없음, responsive. 기존 문구(`failureText` 등)는 바꾸지 않았다.
서버 렌더 HTML 은 1.6.2 와 같다 (alert 비어 있음, 버튼 disabled).
