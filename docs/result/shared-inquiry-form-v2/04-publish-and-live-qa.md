# 04 — publish 와 live QA

대상: `https://interior-demo.boostweb.co.kr` (site `boost-interior-demo`). 2026-10-04 (KST), 시각은 UTC.

```
PACKAGE        = 3d2501990056f8da6d5e2d9cbed8491a518ca7934bb55309956cd721ad04733b
BUILD          = 8a0c21182f47bd45bc26f087da4538fe101d8411445de2fe2e7a71ad41effd60
RELEASE        = interior-01-1.6.3-93977937c0b4
PREVIOUS       = eeb82881… (build 38400831…, interior-01-1.6.2-d5d4b4557a20) — pointer 의 previous, 그대로 store 에 있음
PUBLISH        = PASS (144 files uploaded · sealed · 144/144 reverified · pointer written)
LIVE_PARITY    = PASS (142/142 byte-identical)
LIVE_BROWSER   = PASS (109 rows / 799 assertions, 6 profiles, endpoint stub)
LIVE_E2E       = PASS (실제 제출 1건 + replay 1회 → production lead 1건)
PRODUCTION_LEADS_CREATED = 1  ([TEST] Shared Inquiry V2)
```

## 1. publish — 공통 pipeline 그대로

interior-demo 의 generated 파일을 직접 고친 것은 없다. source → release → `site:build` → `site:publish`.

| 단계 | 명령 (요약) | 결과 | log |
|---|---|---|---|
| 0 | production 계약 probe (write-free) | preflight 204; 6-key body + `consent:false` → `400 consent_required` (allow-list 통과) — 저장 0 | [`proof/15-prod-contract-probe.txt`](proof/15-prod-contract-probe.txt) |
| 1 | `site-publish --remote --dry-run --check-store` | seal absent → 144 upload 예정, live = `eeb82881…`, warnings 0 | [`proof/10-publish-dry-run.log`](proof/10-publish-dry-run.log) |
| 2 | `site-publish --remote --no-activate` | uploaded 144/144, verified 144/144, sealed. pointer 는 읽지도 쓰지도 않음 | [`proof/11-publish-upload-no-activate.log`](proof/11-publish-upload-no-activate.log) |
| 3 | `site-publish --remote --no-activate --reverify` | seal identical → 0 upload, **reverified 144/144** (sha256 + size) | [`proof/12-publish-reverify-sealed.log`](proof/12-publish-reverify-sealed.log) |
| 4 | `site-publish --remote --expect-live eeb82881… --expect-package 3d250199…` | `routing/interior-demo.boostweb.co.kr.json` → `3d250199…` (previous `eeb82881…`) | [`proof/13-publish-activate.log`](proof/13-publish-activate.log) |

publish 는 commit `6ef93d7` 의 build 결과를 올렸다 (`24c8bcb` source + release, `6ef93d7` build output). pointer write 2026-10-03T20:07:44Z.

1.6.2 package (`38400831…`) 와 비교한 새 package: 파일 144 → 144, JS chunk 1개와 CSS chunk 1개가 교체 (`357lobkhknrl3.js` → `0hyfkvg55a3sz.js`,
`35196xyr996k4.css` → `0jhoke8k60_va.css`), **HTML 15개의 렌더 결과는 `<script>` 를 빼면 전부 동일**, 그 밖에 byte 가 다른 것은 chunk 이름을
참조하는 `.txt` flight 파일 56개뿐이고 68개는 byte 동일.

rollback 이 필요하면: `RECON_PUBLISH_ALLOW_REMOTE=1 … site-publish.ts --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --rollback --expect-live 3d2501990056f8da…`
(1.6.2 package 는 5-key body 를 보내고, 서버는 그것도 받는다 — 하위 호환).

## 2. live HTTP parity — [`proof/30-live-http-parity.json`](proof/30-live-http-parity.json)

- package 의 addressable 파일 142개가 전부 live 에서 byte 동일 (status 200, size, sha256), mismatch 0.
- 없는 path → 404 + package 의 `404.html`.
- 서빙되는 `/contact` = package 의 `/contact`; inquiry chunk `0hyfkvg55a3sz.js` 에 `submission_id` 있음.
- publish 전에는 같은 스크립트가 기대대로 FAIL 했다 (1.6.2 가 서빙되던 상태: door chunk `357lobkhknrl3.js`, `submission_id` 없음). 그 기록은 release 재생성 전의 후보 package 를 기준으로 한 것이라 남기지 않았다.

## 3. live 브라우저 QA (endpoint stub) — [`proof/31-live-browser-qa.json`](proof/31-live-browser-qa.json)

실제 live 페이지 + 실제 chat widget, lead endpoint 만 stub (실제 요청 0건 — 스크립트가 강제). 6 profile:
Chromium 1440×900 · 1024×768 · 768×1024 · 390×844 · 375×667, WebKit iPhone 13.

**109 rows / 799 assertions PASS, FAIL 0, skip 0, note 0.**

| 항목 | 결과 |
|---|---|
| form / validation (빈 이름, 잘못된 전화 — 요청 0) | PASS (전 profile) |
| loading (버튼 disabled, "접수 중…", 두 번째 누름 요청 0) | PASS |
| error + 대체 연락처 (network 실패: 입력 유지, 자동 재전송 0) | PASS |
| rate-limited (429 + Retry-After: 버튼 disabled, 누름 요청 0, 대체 연락처 표시, 끝나면 해제; 재시도는 **같은 id**) | PASS |
| conflict (409: conflictText, 기술 용어 없음, 대체 연락처 없음) → 다음 누름 **새 id** | PASS |
| success (200: 확인 문구, 필드 제거) | PASS |
| long message (500자 + 100자 이름), keyboard Tab 순서, Enter 1회 = 요청 1건 | PASS |
| 가로 overflow 0, form·버튼·alert 가 viewport 안, phone 에서 버튼·링크 ≥ 44px | PASS |
| **widget launcher 가 폼을 가리지 않음** — submit 버튼 · alert · 동의 checkbox · 확인 문구와 겹치지 않음, 버튼 중심의 `elementFromPoint` = 버튼 (1440 · 768 · 390 · 375 · WebKit 390 assert, 1024 기록) | PASS |
| 모든 body = 정확히 `consent,name,phone,message,hp,submission_id` (no `source`, no `turnstile_token`), v4 UUID, cookie 없음, turnstile host 요청 0, console/page error 0 | PASS |

스크린샷: `screenshots/live/qa-*.jpg` (gitignore — 디스크에만).

## 4. 실제 제출 1건 — [`proof/40-live-real-submission.json`](proof/40-live-real-submission.json)

리허설 (stub, 같은 flow): [`proof/32-live-stubbed-rehearsal.json`](proof/32-live-stubbed-rehearsal.json) PASS → 그 뒤에만 실행.
스크립트는 한 번만 실행됐고 다시 실행되지 않는다 (`proof/scripts/real-submit.sentinel.json`).

Chromium 1440×900, `/contact`, 이름 `[TEST] Shared Inquiry V2`, 전화 `010-0000-0000`, 동의 체크.

| 시각 (UTC) | 일 | 결과 |
|---|---|---|
| 20:12:46.045 | 버튼 **fast double click** | endpoint 로 나간 form POST **1건** |
| 20:12:46.654 | 응답 | **HTTP 200 `{"received":true}`**, `access-control-allow-origin` = 사이트 origin |
| | 요청 | cookie 없음, key 정확히 6개, `submission_id` v4 (`0ba99ff2…`), `source`·`turnstile_token` 없음 |
| | 화면 | "견적 문의가 접수되었습니다." — 필드 제거, navigation 없음, console error 0 |
| 20:12:49.982 | **replay** — 같은 body 를 한 번 더 | **HTTP 200 `{"received":true}`** |
| | 합계 | endpoint POST 정확히 2건 (form 1 + replay 1), preflight 1 |

11 rows / 47 assertions PASS.

### production DB (read-only) — [`proof/41-prod-db-baseline.txt`](proof/41-prod-db-baseline.txt) → [`proof/42-prod-db-after-submit-and-replay.txt`](proof/42-prod-db-after-submit-and-replay.txt)

`proof/scripts/prod-db-check.sh`: READ ONLY transaction 1개, system identifier guard, 출력은 count·boolean·timestamp·id 앞 8자뿐.

| | 제출 전 (20:12:19) | 제출 + replay 후 (20:13:01) |
|---|---|---|
| 이름이 `[TEST] Shared Inquiry V2` 인 row | 0 | **1** |
| 그중 `source = 'website_form'` | 0 | **1** |
| 그중 `submission_id IS NOT NULL` | 0 | **1** (`0ba99ff2…` — 화면이 보낸 id 와 같은 prefix) |
| 그중 `notified_at IS NOT NULL` | 0 | **1** |
| `lead_request` 전체 중 `website_form` | 1 | 2 (+1) |
| 다른 source 의 row 수 | 10 | 10 (변화 없음) |

- row `created_at` 20:12:46.527, `notified_at` 20:12:46.534 — **replay (20:12:49.982) 보다 먼저** 한 번 찍혔고 그대로다.
  BoostChat 의 알림은 `notified_at IS NULL` 인 row 만 한 번 가져가는 claim 이므로 replay 는 알림을 다시 보낼 수 없다.
- 즉 double click + replay = 요청 3번의 시도(누름 2, replay 1) → HTTP POST 2건 → **lead 1건, 알림 claim 1회**.
- 확인하지 못한 것: owner 메일함 자체 (메일이 실제로 1통 도착했는지는 DB 로 볼 수 없다).

### 남긴 것

- production lead **1건** (`[TEST] Shared Inquiry V2`, tenant 의 lead 목록에 보인다). **삭제하지 않았다** — 지시대로.
- write-free probe 1건 (lead 없음), BoostChat 로그의 요청 기록.
- 방문자 rate-limit budget: probe 1 (19:38) + 제출 2 (20:12) — 서로 다른 10분 window.
