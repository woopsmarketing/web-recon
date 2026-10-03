# 02 — 테스트 결과

실행은 전부 `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/<name>.test.ts` (pnpm 미사용).
최종 상태 = release `interior-01-1.6.3-93977937c0b4`, demo build `8a0c2118…` (package `3d250199…`), fixture build `1335551b…` (package `b92ed857…`).
독립 release 리뷰([05](05-independent-review.md)) 반영 후 release 를 다시 끊고 **전부 다시 실행한 결과**다. 로그: scratchpad `suite3/`.

## 1. 요약

| 구분 | suite | 결과 |
|---|---|---|
| typecheck | `tsc --noEmit` (root) · `-p platform/tsconfig.json` (platform + templates) · `-p workers/recon-runtime/tsconfig.json` | exit 0 · 0 · 0 |
| build | `template-release interior-01@1` → `site-build boost-interior-demo --mode public` · `site-build fixture-online-inquiry --mode public` | release gate pass · package QA pass (144 files / 145 files) |
| inquiry 계약 (신규) | `inquiry163.test.ts` | 29 passed, 0 failed |
| inquiry 계약 (1.6.2, 갱신) | `inquiry162.test.ts` | 28 passed, 0 failed |
| 재사용 증명 (신규) | `inquiry163-reuse.test.ts` | 8 passed, 0 failed |
| 브라우저 (신규) | `inquiry163-browser.test.ts` — Chromium + WebKit(iPhone 13), demo + fixture | 62 passed, 0 failed, 0 skipped |
| generator / platform | slice1 86 · step4 47 · step41 35 · step5 32 · step52 12 · step6 34 · polish 4 · detail-facts 25 | 0 failed |
| shared template | ia150 15 · ia151 10 · ia152 14 · predemo 10 · predemo2 9 | 0 failed |
| lineage | integration 85 (point-in-time 1, 기존과 같음) · portfolio-production-truth 10 | 0 failed |
| publish | publish 66 · publish-e2e LOCAL 47 (live 전용 1건 skip) | 0 failed |
| 로컬 BoostChat E2E | `docs/work/track-b-shared-inquiry-v2/e2e` B 28 · C 19 | 0 failed — [03](03-local-boostchat-e2e.md) |
| live QA 스크립트의 로컬 rehearsal (`QA_BASE=local`) | parity 142/142 · browser QA 94 rows / 699 assertions · submit rehearsal 13 rows / 55 assertions | PASS ×3 |

정상 assertion 을 지우거나 약화하지 않았다. 바뀐 기대값은 전부 "새 상태를 literal 로 다시 적은 것"이다 (§4).

## 2. 신규 계약 테스트 FORM-ID-1 … 14

| ID | 내용 | 단위 (door, fetch stub) | 브라우저 (빌드된 package, endpoint stub) | 실제 서버 (로컬 BoostChat) |
|---|---|---|---|---|
| FORM-ID-1 | 새 logical form → UUID 1개 | `inquiry163` FORM-ID-1 (`randomUUID` 호출 정확히 1회) | demo · fixture, Chromium · WebKit | B1 |
| FORM-ID-2 | double click → same UUID | FORM-ID-2 (같은 tick 2회 호출 → fetch 1건) · 2b | 응답 hold 중 double click → 요청 1건 | C: 5 click → POST 1건 |
| FORM-ID-3 | 5 click → same UUID | FORM-ID-3 (5회 호출 → fetch 1건; 503 ×5 → id 1종) | script 5회 + 실제 click 5회 → 요청 1건, id 1개 | C: submit event 5, POST 1 |
| FORM-ID-4 | network retry → same UUID | FORM-ID-4 | 실패 안내 + 대체 연락처, 입력 유지, 재전송 같은 id | C: 응답 유실 → 다시 누름 → 같은 id, row 그대로 |
| FORM-ID-5 | 408 → same UUID | FORM-ID-5 (408 + 15초 abort) | FORM-ID-5 | — |
| FORM-ID-6 | 503 → same UUID | FORM-ID-6 | FORM-ID-6 | — |
| FORM-ID-7 | 429 → Retry-After + same UUID | FORM-ID-7 (대기 중 fetch 0, wall clock, header 파싱 9종) · 7b capacity | 버튼 disabled → 2초 뒤 해제, 같은 id · 7b | B5: 실제 `Retry-After=458` 읽음 |
| FORM-ID-8 | 200 → 다음 문의는 new UUID | FORM-ID-8 | client-side navigation 으로 나갔다 돌아와 (document load 0) 같은 값 → 다른 id | B3 |
| FORM-ID-9 | ambiguous 실패 뒤 payload 변경 → new UUID | FORM-ID-9 (name/phone/message/hp 각각; 되돌리면 원래 id) | 9a 변경 → 새 id · 9b 되돌림 → 원래 id · 9c 페이지 이동 후 복귀 → 같은 id | B3 |
| FORM-ID-10 | 409 → automatic retry 없음 | FORM-ID-10 (추가 timer 0, fetch 1) · 10b 400 | alert = conflictText 그대로 (대체 연락처 없음), 2.5초간 요청 0, 다음 누름 새 id | B2 · B3 (실제 409) |
| FORM-ID-11 | `source` body 에 없음 | FORM-ID-11 (모든 시나리오의 body key 집합) | 전체 run 의 모든 요청 | B4: `source` 넣으면 실제 400 |
| FORM-ID-12 | `turnstile_token` body 에 없음 | FORM-ID-12 (+ 소스에 turnstile/captcha 문자열 없음) | + turnstile host 로드 0 | — |
| FORM-ID-13 | future customer fixture 에도 동일 기능 | `inquiry163-reuse` REUSE-1…8 | 위 전 항목을 fixture 에서도 통과 (31 checks × 2 sites) | — |
| FORM-ID-14 | same submission concurrent 10 → lead exactly 1 | — | — | B1: 10 방문자 10×200 → row 1 / 1 방문자 5×200+5×429 → row 1 |

그 밖의 단위 검사: PRIV-1 (door 에 console/storage/cookie/beacon 없음), NOID-1 (`crypto` 없음 → id 없이 전송; `getRandomValues` 만 있어도 v4),
RES-1 (절대 throw/reject 안 함), SND-1 (endpoint 당 sender 하나), TPL-1…6 (slot·props·gate·초기 렌더 불변·대체 연락처 규칙), PKG-1…3 (빌드된 package).

브라우저 UX-5 (대체 연락처 규칙 전체, Chromium + WebKit, 두 사이트): 400 · 408 · 503 · 429 rate_limited(대기 중) · 429 capacity · network · 403 · 500 · 비 JSON 200
→ 안내 + 대체 연락처 / 409 · 초기 · 전송 중 · 성공 → 연락처 없음. alert 의 전체 텍스트를 비교한다.
mutation 확인: 기대값 3개를 뒤집은 사본에서 FORM-ID-10 · 10b · UX-5 가 실패하는 것을 봤다 (사본은 삭제).

## 3. "demo 전용인가?" — 코드로 본 답 (REUSE)

`inquiry163-reuse.test.ts` 가 두 사이트의 **현재 빌드**를 읽어 확인한다.

- REUSE-1 두 사이트가 같은 Template Release 를 pin.
- REUSE-2 문의 로직이 든 JS chunk (`submission_id` 포함) 가 두 package 에서 **byte 단위로 동일** (`0hyfkvg55a3sz.js`, sha256 `ec7556ad…`).
- REUSE-3 각 package 의 /contact payload 는 자기 endpoint 만 가진다.
- REUSE-4 fixture package 어디에도 demo host·demo widget key·`boostchat`·`BoostInterior`·demo 상호가 없다.
- REUSE-5 공통 소스(door + Template 전 파일)에 site id·endpoint·host·`wgt_`·`boostchat` 이 없다.
- REUSE-6 fixture 는 `scripts.json`(위젯)·`integration.json` 없이도 같은 폼 구조를 가진다.
- REUSE-7 fixture 가 설정한 slot 은 자기 문구, 비워 둔 slot (`conflictText`, `capacityText`) 은 Template neutral default.
- REUSE-8 어느 package 에도 `turnstile` 없음, body literal 에 `source` 없음.

fixture 를 만들 때 고친 코드: 0줄. 만든 것은 `data/sites/fixture-online-inquiry/*.json` 과 asset 뿐이다.

## 4. 기존 테스트 restate (lineage)

release 를 새로 끊고 demo 를 re-pin 했기 때문에, 계보를 literal 로 추적하는 테스트를 1.6.2 때와 같은 방식으로 다시 적었다.

| 파일 | 내용 |
|---|---|
| `portfolio-qa-corpus.ts` | `DEMO_PIN_162`, 아홉 번째 data delta `DEMO_INQUIRY_DELIVERY_SLOTS` (contact.page leaf 5개), `revertInquiryDelivery` (순서 강제) |
| `portfolio-production-truth.test.ts` Q1(ii) | delta 를 최신부터 되돌려 기존 anchor `5edadd72…` 에 도달 — anchor 불변 |
| `integration.test.ts` B2 / B2b | head anchor `c119e5e8…`; current = 1.6.3 build, rollback = `38400831…` (1.6.2, publish 전 live), `01f7ac78…` 은 git `be065c5` 에서 읽음 |
| `ia151.test.ts` C1 | stylesheet = 1.5.0 + fallback 4 + 1.6.2 14 + **1.6.3 3** (각 정확히 1회, 위치 고정) |
| `ia152.test.ts` P5 | demo 폼 props 의 다른 연락 채널 = business email 정확히 1개, 서버 HTML 에는 없음 |
| `step6.test.ts` A / F | `data/sites` 목록에 fixture 를 별도 이름으로 추가; demo package 에 fixture 의 id·endpoint 가 없어야 함 |
| `inquiry162.test.ts` | door API 이름·결과 형태·body 6 key·source shape 문자열 갱신. "online props 에 email 없음"은 설계가 바뀌어 "email 은 `onlineFallback` 으로만 들어온다"로 대체 |
| `publish-e2e.test.ts` D | body 6 key + v4 UUID + 재시도 요청이 첫 요청과 같은 submission_id; 실패 alert = failureText + 대체 연락처 (값은 실제 resolver `contactPage` 에서); proof 에는 id 앞 8자만 기록 |

platform 파일 중 1.6.3 이 바꾼 것은 `site/inquiry-client.ts` 하나이고, 이 파일은 1.6.2 surface 에서 이미 "added"로 제외되어 있어 새 surface 파일은 필요 없었다.

## 5. Responsive QA (로컬, endpoint stub)

viewport 1440×900 · 1024×768 · 768×1024 · 390×844 · 375×667, 상태 initial / validation / loading / error+대체 연락처 / rate-limited / success / long message
(500자 무공백 + 100자 이름) — demo·fixture 모두:

- 가로 overflow 0, form·alert·버튼이 viewport 폭 안, alert 잘림 없음
- phone viewport 에서 버튼·대체 연락처 링크 ≥ 44px
- 버튼이 다른 요소에 가려지지 않음 (`elementFromPoint`)
- keyboard: Tab 순서 name → … → consent → submit (honeypot 제외), Enter 1회 = 요청 1건, 실패 후 focus 이동 없음
- console error / page error 0

스크린샷 70장: `screenshots/<site>-<viewport>-<state>.jpg` (gitignore 대상 — 디스크에만 있음).
live 사이트의 widget launcher 겹침 검사는 [04](04-publish-and-live-qa.md).
