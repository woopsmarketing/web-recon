# 03 — 로컬 BoostChat idempotency E2E (FORM-ID-14)

runbook·harness·증거: [`../../work/track-b-shared-inquiry-v2/e2e/`](../../work/track-b-shared-inquiry-v2/e2e/README.md)

```
RESULT            = B (API level) 28 passed, 0 failed · C (browser level) 19 passed, 0 failed
SERVER            = 진짜 BoostChat route (POST /api/widget/[publicKey]/lead), commit 3ff3a23 의 격리 복사본, next start
DATABASE          = boost_chat_test @ 127.0.0.1 (migration 0055 이미 적용, 이 작업이 migrate 한 것 없음)
CLIENT            = Track B 의 실제 door (createInquirySender) + 실제 빌드된 contact.html (build 8a0c2118…, release interior-01-1.6.3-93977937c0b4)
PRODUCTION_CONTACT = 0 (boostchat.co.kr / interior-demo 로 나간 요청 없음, 코드로 차단)
LEFTOVERS         = TEST DB 0 tenants / 0 users / 0 leads, 서버 전부 종료
```

mock 서버가 아니다. `lead_request` row 수를 SQL 로 직접 센다. BoostChat repo 는 읽기만 했다 (빌드·수정·git 변경 없음).

## 1. 결과

| 항목 | 관찰 |
|---|---|
| **같은 submission 10회 동시 (FORM-ID-14)** | door sender 10회 동시 호출 → HTTP 요청 **1건**, row 0→1 |
| 〃 raw POST, 방문자 10명 | 10×200 `{"received":true}`, 그 id 의 row **1** |
| 〃 raw POST, 방문자 1명 | 5×200 + 5×429 `rate_limited` (10분 budget 5회), 그 id 의 row **1** |
| A+P → A+P → A+changed P | 200 (row +1) → 200 (row 그대로) → **409** `idempotency_conflict` (row 그대로, 저장된 row 불변) |
| 200 뒤 같은 값 다시 | 새 id → row +1 (새 logical inquiry — 중복이 아니라 요구사항 H) |
| 응답 유실 → 다시 누름 | **같은 id** → 200, row 추가 없음 |
| 응답 유실 → 내용 수정 | 새 id → 새 row |
| 수정했다가 원래 내용으로 | 원래 id 재사용 → row 추가 없음 |
| 실제 409 를 door 에 | `conflict`, 자동 재전송 0, 다음 누름은 새 id |
| body | key 는 정확히 `consent,hp,message,name,phone,submission_id`; 저장된 row 전부 `source='website_form'`, `submission_id` NOT NULL |
| `source` 를 body 에 넣으면 | 실제 route 가 400 `invalid_request` |
| id 없는 옛 body (5 key) | 200, `submission_id` NULL (하위 호환) |
| 429 | 6번째 POST → 429, `Retry-After=458` 이 CORS 로 노출되어 door 가 그대로 읽음 (`wait.seconds=458`), 대기 중 요청 0 |
| 알림 | 10회 동시 건의 owner 메일 **1통**; 전체 13 row / 13 mail |
| 브라우저: 5 fast click | submit event 5, 서버 도착 POST 1, 성공 화면, row +1 |
| 브라우저: 첫 응답 유실 | 서버는 저장(200), 화면은 실패 안내 + 대체 연락처, 입력·동의 유지 → 다시 누름 → 같은 id, 성공, 그 id 의 row 1 |

## 2. 실제 서버와 맞춰 보며 확인된 사실

실행해서 확인:

1. **preflight**: Playwright route 를 쓰는 QA 는 실제 preflight 를 거치지 않는다. 가로채지 않는 경로(mode G)로 따로 확인 — `content-type` 만 요청하는 OPTIONS → 204 → POST. door 가 request header 를 하나라도 더 붙이면 모든 브라우저에서 깨진다 (현재 `Content-Type` 하나뿐).
2. **`Retry-After` 는 cross-origin 에서 읽힌다** — 안내 문구가 60초 기본값이 아니라 실제 분 수를 보여 준다.
3. **Chromium 은 keep-alive 연결이 응답 전에 끊기면 POST 를 스스로 다시 보낸다.** 페이지는 요청 1건·성공으로 봤고 서버는 같은 POST 를 2번 받았다 → `submission_id` 덕분에 row 1. id 없는 옛 body 였다면 2건이다. **이 작업이 막는 실제 중복 경로다.**
4. 모든 POST 가 방문자 10분 budget(5회)을 쓴다 — idempotent 재전송도 포함. 유실된 응답을 계속 다시 누르면 6번째에 429 (row 는 여전히 1).
5. 등록되지 않은 Origin 은 CORS header 없는 403 → 브라우저에서는 `network` 로 보인다 (다시 시도 안내 + 대체 연락처).
6. `channel_capacity` 429 도 `Retry-After` (UTC 자정까지) 를 싣는다. door 는 capacity 에서는 버튼을 막지 않는다 (설계).
7. **route 는 tenant 의 `lead_form_config` 로 검증한다.** tenant 가 email 을 필수로 켜면 이 폼의 모든 제출이 400 `field_required` 가 된다 (폼에 email 필드가 없음). message 필드를 끄면 200 이지만 본문이 저장되지 않는다. → 고객 onboarding 때 BoostChat 문의 폼 설정을 사이트 폼과 맞춰야 한다 ([종합보고서 KNOWN_ISSUES](../WEB-RECON-TRACK-B-SHARED-INQUIRY-FORM-V2-2026-10-04.md)).

코드 읽기로만 확인 (실행 안 함):

- 방문자 일일 cap 도 `rate_limited` 로 답하고 `Retry-After` 가 최대 86,400초다. door 는 3,600초로 자르므로 안내는 "약 60분"이고, 다시 누르면 또 429 다.
- Turnstile 을 그 key 에 켜면 403 `challenge_required` → `unknown`. door 는 token 을 보내지 않는다 (이번 범위 밖 — DEFERRED_MVP).
- fingerprint 는 서버 secret (`RATE_LIMIT_CLIENT_HASH_SECRET`) 으로 keyed 되어 있어, 첫 전송과 재전송 사이에 secret 을 바꾸면 정당한 재전송이 409 가 된다.

## 3. 하지 않은 것

Turnstile ON 경로, production 설정 확인(이건 [04](04-publish-and-live-qa.md) 의 live 검증), WebKit/Firefox 로의 실제 서버 E2E.
