# 05 — 독립 리뷰와 처리

구현자가 자기 코드를 PASS 시키지 않았다. fresh-context reviewer 를 두 번 썼고, 원하는 결론을 알려 주지 않았다
("문제와 release blocker 를 독립적으로 찾아라").

## 1차 — 구현 직후 (door + form)

| 지적 | 처리 |
|---|---|
| Retry-After 대기를 긴 `setTimeout` 하나로 재면, timer 가 멈추는 환경(잠긴 휴대폰)에서 대기가 늘어난다 | **수정** — wall clock 기준 `until` + `INQUIRY_PAUSE_TICK_MS` 마다 재확인 |
| 마지막 값의 id 만 기억 → A(timeout, 실제 저장) → B 로 수정 → 다시 A 이면 A 가 두 번 저장된다 | **수정** — `Map<값, id>`: 되돌리면 원래 id |
| 200 직후, 필드가 사라지기 전의 두 번째 submit 이 새 id 로 나갈 수 있다 | **수정** — 성공 뒤 `inFlight` 를 풀지 않는다 |
| "절대 reject 하지 않는다"가 사실이 아니다 (`crypto` / `AbortController` 가 throw 할 때) | **수정** — id 생성·controller 를 try 안으로, 바깥 wrapper 추가 |
| 진행 중인 요청에 payload 가 달라도 합류한다 | **수정** — 같은 값만 합류, 다른 값은 `unknown` |
| sender 를 component ref 에 두면 client-side navigation 으로 기억이 사라진다 | **수정** — endpoint 당 module-level sender (`inquirySender`) |
| 200 인데 JSON 이 아니면 `network` 로 잘못 분류 | **수정** — `unknown` |
| 대체 연락처가 중복될 수 있다 (slot 의 mailto 와 business email) | **수정** — href 로 dedupe |
| 대체 연락처 링크의 touch target < 44px | **수정** — padding 11px |
| `Date.parse` 가 숫자 문자열을 날짜로 읽는다 | **수정** — 글자가 있을 때만 HTTP-date 로 해석 |
| JSDoc 위치 오류 | **수정** |
| 대기 중 버튼이 `disabled` (focus 불가) 이고, 대기 종료를 알리지 않는다 | **유지** — 기존 loading 상태와 같은 방식. KNOWN_ISSUES 에 기록 |

## 2차 — release 리뷰 (publish 전, 전체 작업 트리)

결론: **source·release·package·site data·test 에 BLOCKER 없음.** release 는 작업 트리와 byte 동일, package 에 손으로 고친 흔적 없음,
기존 test 약화 없음, 증거에 secret 없음.

### MAJOR

| # | 지적 | 처리 |
|---|---|---|
| M1 | production 이 6-key body 를 받는다는 것이 증명된 적 없다. 읽은 것은 로컬 checkout 이고, BoostChat 자신의 결과 문서도 production 은 5-key 로만 확인했다. allow-list 에 `submission_id` 가 없으면 publish 즉시 모든 문의가 400 | **해결** — publish 전에 write-free probe: 6-key body + `consent:false` → `400 consent_required` (allow-list 를 통과해야만 도달하는 답; 통과 못 하면 `invalid_request`). 저장 0. [`proof/15-prod-contract-probe.txt`](proof/15-prod-contract-probe.txt). Phase 0 문서의 표현도 정정 |
| M2 | 400 은 "입력을 확인하라"만 말하고 대체 연락처가 없다. 고객이 BoostChat 문의 폼에서 email 을 필수로 켜면 모든 제출이 영원히 400 이고, 고객은 web lead 를 전부 잃는다. `unknown` (예: Turnstile 이 켜진 key 의 403) 도 같다 | **수정 (공통 폼)** — 대체 연락처를 `conflict` 를 뺀 **모든 실패**에서 보여 준다. release 재생성 → 두 사이트 re-pin → 재빌드 → 전체 재검증. onboarding 확인 항목은 종합보고서에 |

### MINOR / NIT

| 지적 | 처리 |
|---|---|
| `real-submit.mts` 의 1회 실행 guard 가 atomic 하지 않다 (동시 실행 2개) | **수정** — sentinel 을 `wx` 로 생성, 오류 출력도 id scrub |
| demo `capacityText` "잠시 후 다시" — 채널 일일 상한은 UTC 자정까지다 | **수정** — "일시적으로 어렵습니다. 나중에 다시 시도해 주세요." |
| demo `conflictText` "문의 내용이 변경되었습니다" 가 사실과 다를 수 있다 | **유지** — 작업 지시서가 제안한 문구 그대로다. slot 이므로 고객별로 바꿀 수 있다 |
| fixture 전화번호가 실제 배정 가능한 번호처럼 보인다 | **수정** — `02-000-0000` / `010-0000-0000` |
| 증거 JSON 에 submission id 전체가 남는다 (stub 된 로컬 실행) | **수정** — publish-e2e 의 proof 기록은 앞 8자만 |
| 한국어 사이트가 slot 을 비우면 영어 neutral default 가 경고 없이 나간다 | **기록** — onboarding 확인 항목 (KNOWN_ISSUES). builder 경고는 이번 범위 밖 |
| 브라우저 FORM-ID-8 이 reload 를 써서, 기능이 깨져도 통과한다 | **수정** — client-side navigation 으로 교체 |
| Retry-After 를 3,600초로 자른다 — 방문자 일일 상한(최대 86,400초)에서는 "약 60분" 뒤에도 거절 | **완화** — 이제 그 상태에서도 대체 연락처가 보인다. 문구 분리는 KNOWN_ISSUES |
| commit 대상 판단 (`live-e2e.json`, `page-load-times.json`, sentinel, DB baseline) | 종합보고서 GIT 항목 참고 |
| 절대 경로 (`e2e/lib.mts`, `prod-db-check.sh`), psql argv 의 접속 문자열 | **유지** — env 로 덮어쓸 수 있고, 출력은 redact. 1인 로컬 실행 |
| wall clock 이 두 문장 사이에 1초 이상 앞으로 뛰면 대기가 풀리지 않는다 | **유지** — 사실상 도달 불가, 결과는 reload 로 해소. KNOWN_ISSUES |
| reload 뒤에는 새 id (메모리 저장) | **유지** — 설계 (id 를 storage 에 두지 않는다) |
