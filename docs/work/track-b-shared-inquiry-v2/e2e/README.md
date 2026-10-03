# Shared Inquiry Form V2 — LOCAL end-to-end 멱등성 증명 (Track B door ↔ BoostChat site-lead route)

Track B 의 공용 문의 door (`platform/site/inquiry-client.ts`) 와 실제로 빌드된 문의 페이지를, **로컬에서 띄운 진짜 BoostChat route**
(`POST /api/widget/[publicKey]/lead`) 와 **로컬 TEST DB** 에 붙여서 `lead_request` 행 수를 SQL 로 세는 증명이다.
mock 서버는 없다. 서버 코드는 한 줄도 고치거나 약화하지 않았다.

```
RESULT (최종 실행 2026-10-03T20:02:16Z ~ 20:02:37Z, evidence/*.txt)
  B  API level      28 passed, 0 failed   (b-api-proof.mts)
  C  browser level  19 passed, 0 failed   (c-browser-proof.mts — mode R + mode G)
BOOSTCHAT_COMMIT   = 3ff3a2335d086a200c9a18a415c85d3efc11c768   (git archive HEAD 의 격리 복사본)
DATABASE           = boost_chat_test @ loopback                  (TEST_DATABASE_URL)
MIGRATION_0055     = 이미 적용되어 있었음 (_migration: 2026-10-03 19:19:37+09) — 이 작업이 migrate 한 것 없음
TRACK_B_DOOR       = platform/site/inquiry-client.ts sha256 b2400be338eef4f6…
TRACK_B_PACKAGE    = boost-interior-demo 8a0c21182f47bd45… (current.json 을 실행 시점에 읽음), interior-01-1.6.3-93977937c0b4
PRODUCTION_CONTACT = 없음 (boostchat.co.kr / interior-demo.boostweb.co.kr 로 나간 요청 0)
LEFTOVERS          = TEST DB 에 0 tenants / 0 users / 0 leads, 서버 전부 종료
```

## 1. 파일

| 파일 | 역할 |
|---|---|
| `lib.mts` | 공용 배관: 안전 guard, TEST DB 연결, fixture seed/cleanup, BoostChat 기동/종료, SMTP sink, 출력 형식 |
| `b-api-proof.mts` | B. Node 에서 **실제 door** (`createInquirySender`) 를 직접 호출. `globalThis.fetch` wrapper 가 선언된 https endpoint 를 로컬 route 로 바꾸고 `Origin` / `X-Real-IP` 를 붙인다 |
| `c-browser-proof.mts` | C. **실제 빌드된 페이지** (`contact.html`) 를 Playwright Chromium 으로 조작. 두 가지 운반 방식 (mode R, mode G) |
| `cleanup.mts` | 강제 종료된 실행이 남긴 fixture 를 지우는 마지막 수단 (정상 종료한 실행에는 필요 없다) |
| `evidence/b-api-proof.txt`, `evidence/c-browser-proof.txt`, `evidence/cleanup.txt` | 최종 실행의 stdout (단계별 expected / observed, HTTP status, 행 수, id 는 앞 8자만) |

## 2. 안전 guard (관례가 아니라 코드로 강제)

- **DB**: BoostChat env 파일에서 `TEST_DATABASE_URL` **한 줄만** 프로세스 안에서 읽는다 (`DATABASE_URL` 은 읽지 않는다, 값은 출력하지 않는다).
  host 가 loopback 이 아니거나 DB 이름에 `test` 가 없으면 연결 전에 거부하고, 연결 후에도 `current_database()` / `inet_server_addr()` 로 다시 확인한다.
- **BoostChat**: `BOOSTCHAT_E2E_COPY` 가 가리키는 **격리 복사본**에서만 띄운다. 그 디렉터리에 `.git` 이 있거나 `.env` / `.env.local` 이 있거나 빌드 (`.next/BUILD_ID`) 가 없으면 거부한다.
  `127.0.0.1` 의 임의 port 에 bind 하고, 환경변수는 **새로 만든 목록만** 준다 (부모 환경 상속 없음): `DATABASE_URL` = TEST DB, 매 실행 새로 만든 `BETTER_AUTH_SECRET` / `RATE_LIMIT_CLIENT_HASH_SECRET`,
  `PUBLIC_WIDGET_ENABLED=true`, `WIDGET_SITE_LEAD_KEYS` = 이 실행의 test key 하나, `TURNSTILE_*` 없음 (Turnstile OFF), 메일은 `EMAIL_TRANSPORT=smtp` → loopback SMTP sink (BoostChat 자신의 `scripts/smtp-sink.ts`).
- **네트워크**: harness 의 모든 fetch 는 `http://127.0.0.1:<port>` 가 아니면 거부한다 (`loopbackFetch`, `redirect: "error"`).
  B 의 fetch wrapper 는 선언된 endpoint 외의 URL 을 거부한다. C 의 브라우저는
  (1) `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` 로 **어떤 이름도 resolve 하지 못하고**,
  (2) mode R 은 static origin 과 선언된 endpoint 외의 모든 요청을 route 에서 abort,
  (3) mode G 는 loopback proxy 가 `boostchat.co.kr:443` 으로의 CONNECT 만 받아 **loopback TLS relay** 로 넘긴다 (다른 host 는 403, lead route 외의 path 는 404).
  두 mode 모두 실행 초반에 "밖으로 못 나간다" 는 것을 probe 로 확인한다 (`C.R.0`, `C.G.0` — `localhost` / `probe.invalid`, 실제 host 는 쓰지 않는다).
- **데이터**: 만드는 행은 전부 slug / id / e-mail 이 `trackb-inquiry-v2-e2e-` 로 시작하는 tenant · user 에 매달린다. 지우는 것도 그 행들 (cascade) 과
  이 실행의 channel id 가 key 에 들어간 rate-limit bucket 뿐이다. truncate 없음.
- **watchdog**: 실행이 멈추면 B 300초 / C 420초 뒤에 BoostChat process group 을 죽이고 exit 3 (이때 fixture 는 `cleanup.mts` 로 지운다).
- 출력에는 이름·전화·문의 본문이 없다 (합성 문자열 `E2E Tester`, `010-0000-0000`, `[trackb-inquiry-v2-e2e] synthetic …` 만 보낸다). 서버 로그에 그 문자열이 없는 것도 검사한다 (`B.log`, `C.log`).

## 3. 재현 방법

```bash
TRACKB=/Users/woops/projects/web-recon-track-b
BOOSTCHAT=/Users/woops/projects/boost-chat        # READ-ONLY: 여기서는 빌드·수정·서버 기동·git 상태 변경을 하지 않는다
S=<두 repo 밖의 scratch 디렉터리>/inquiry-e2e
COPY=$S/boost-chat-e2e

# (1) 격리 복사본 — commit 된 HEAD 만 (.git 없음, .env* 없음, 작업 중인 변경 없음)
mkdir -p "$COPY"
git -C "$BOOSTCHAT" archive HEAD | tar -x -C "$COPY"
git -C "$BOOSTCHAT" rev-parse HEAD > "$COPY/.e2e-source-commit"
cp -Rc "$BOOSTCHAT/node_modules" "$COPY/node_modules"     # APFS copy-on-write clone (원본은 읽기만 한다) — 아래 주의 참고

# (2) 복사본에서 빌드 — 환경변수 없이
( cd "$COPY" && env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build ) > "$S/build.log" 2>&1

# (3) B — seed → 서버 기동 → 증명 → 서버 종료 → cleanup 까지 스크립트가 한 번에 한다 (약 10~60초)
cd "$TRACKB"
BOOSTCHAT_E2E_COPY="$COPY" ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
  docs/work/track-b-shared-inquiry-v2/e2e/b-api-proof.mts > docs/work/track-b-shared-inquiry-v2/e2e/evidence/b-api-proof.txt

# (4) C — static server + seed + 서버 + gateway + Chromium → 증명 → 전부 종료 → cleanup (약 10~170초)
BOOSTCHAT_E2E_COPY="$COPY" ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
  docs/work/track-b-shared-inquiry-v2/e2e/c-browser-proof.mts > docs/work/track-b-shared-inquiry-v2/e2e/evidence/c-browser-proof.txt

# (5) teardown 확인 — 0 tenants / 0 users / 0 leads 가 나와야 한다 (실행이 강제 종료됐다면 여기서 지워진다)
BOOSTCHAT_E2E_COPY="$COPY" ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
  docs/work/track-b-shared-inquiry-v2/e2e/cleanup.mts
rm -rf "$COPY"        # 복사본이 더 필요 없을 때
```

주의:

- **`pnpm` 을 쓰지 않는다** (Track B worktree 규칙). exit code 는 실패한 check 가 있으면 1, watchdog 은 3.
- **`node_modules` 는 symlink 가 아니라 clone 이다.** Next 16.3.0 Turbopack 은 project root 밖을 가리키는 `node_modules` symlink 를 거부한다
  (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`). APFS 의 `cp -Rc` 는 디스크를 거의 쓰지 않고 원본을 건드리지 않는다.
- env 파일 위치가 다르면 `BOOSTCHAT_ENV_FILE=<path>` (읽는 것은 `TEST_DATABASE_URL` 한 줄).
- **migration 0055 가 없으면 harness 는 거부한다 (migrate 하지 않는다).** BoostChat 의 문서화된 경로는 `npm run db:migrate` (`scripts/db-migrate.ts`, `-- --dry-run` 으로 계획만 출력)
  인데, 이것은 `DATABASE_URL` 이 가리키는 DB 에 **밀린 migration 전부**를 적용한다. 공유 TEST DB 의 schema 를 바꾸는 일이므로 BoostChat 소유 세션이 할 일이다. 이번에는 필요 없었다.
- 방문자 예산은 600초 고정 window 다. window 가 곧 끝날 때 실행하면 스크립트가 다음 window 까지 기다린다 (B 최대 ~50초, C 최대 ~150초).
- 서버 로그는 `$S/logs/boostchat-<b|c>-<pid>.log` (repo 밖). mode G 의 일회용 self-signed key/cert 도 거기에 만들고 끝날 때 지운다.

## 4. 각 단계가 증명하는 것

`LEAD_ROWS` = `select count(*) from lead_request where tenant_id = <test tenant>`. 숫자는 최종 실행의 관측값.

### B — API level (door 를 Node 에서)

| 단계 | 증명 | 관측 |
|---|---|---|
| B0.1 / B0.2 | route 의 gate 와 CORS 답이 그대로다: 등록 origin preflight 204, 미등록 origin / Origin 없음 / opt-in 안 된 key 는 CORS header 없는 403 | 204 (`Allow-Methods=POST`, `Allow-Headers=content-type`, `Max-Age=600`), 403+403+403, 0 → 0 |
| **B1.1** | door: 같은 값의 동시 호출 10개가 **HTTP 요청 1개**로 합쳐진다 | requests = 1, 10× ok, 0 → 1 |
| **B1.2 (a)** | FORM-ID-14: door 가 만든 body 그대로 (id A) 를 방문자 10명이 동시에 POST | 10×200 `{"received":true}`, 1 → 2, id A 의 행 = **1** |
| **B1.4 (b)** | 새 id B 를 **한 방문자**가 동시에 10번 POST (방문자 예산 5회/10분) | 5×200 + 5×429 `rate_limited`, 2 → 3, id B 의 행 = **1** |
| B1.3 | door 의 재시도 (같은 값) 는 byte 단위로 같은 body | identical, 200, 2 → 2 |
| **B2.1~3** | A+P → 200 / A+P 다시 → 200, 행 없음 / A + 바뀐 P → 409 `idempotency_conflict` (CORS header 있음, 저장된 행 불변) | 3 → 4 → 4 → 4 |
| **B3.1** | 200 확인 뒤 같은 값을 다시 보내면 **새 id**, 행 +1 — 중복이 아니라 **두 번째 논리적 문의** (첫 번째는 확인됐으므로) | id 달라짐, 4 → 5 |
| **B3.2** | 답을 잃음 (서버는 200 으로 저장, door 는 `failed/network`) → 다시 누름 → **같은 id** → 200, 행 추가 없음 | 5 → 6 → 6 |
| **B3.3** | 답을 잃은 뒤 문의 내용을 고침 → **새 id** → 새 행 (서로 다른 문의 2건) | 6 → 7 → 8 |
| **B3.4** | … 그리고 **이전 내용으로 되돌아감** → **이전 id 재사용** (byte 동일 body) → 200, 행 추가 없음 | id 동일, 8 → 8, 그 id 의 행 = 1 |
| B3.5 | 요청이 가는 중에 **다른 값**으로 호출 → 요청 없이 `failed/unknown`; 가는 중인 요청은 영향 없음 | requests = 1, 8 → 9 |
| **B3.6** | 진짜 409 → door `failed/conflict`, **자동 재전송 0**, 다음 누름은 새 id → 200 | 9 → 10 (그 id 로 먼저 저장해 둔 다른 문의) → 11 |
| **B4.1** | door body 의 key 는 정확히 `consent,hp,message,name,phone,submission_id` (`source` 없음). 그런데 저장된 행은 전부 `source='website_form'`, `submission_id NOT NULL` | 11행 중 11 / 11 |
| **B4.2** | body 에 `source` 를 넣으면 진짜 route 가 400 | 400 `invalid_request`, 11 → 11 |
| **B4.3** | legacy 5개 key 만 (id 없음) 도 여전히 200 | 11 → 12, `submission_id` NULL |
| **B5.1** | 방문자의 6번째 POST: 429 `rate_limited` + `Retry-After` (`Access-Control-Expose-Headers: Retry-After`) → door `rate_limited`, `wait.seconds` = header 값 | Retry-After=458 = wait 458s |
| **B5.2 / B5.3** | 기다리는 동안의 호출은 **요청 0개**, 남은 초를 돌려준다 (wall clock) | 0 requests; 2.5초 뒤 424s |
| **B6.1 / B6.2** | 10-동시 경우의 owner 알림 **정확히 1통**; 전체로는 저장된 행 1개당 1통 (replay / 409 / 429 / 400 에는 0통) | +1; mails 13 = rows 13 |
| B7.1 (추가) | 다른 429: `channel_capacity` (채널 하루 상한) → door `failed/capacity`, **pause 없음** — 다시 누르면 또 요청이 간다 (같은 id) | Retry-After=14256 는 무시됨, requests = 2, 12 → 12 |
| B7.2 (추가) | tenant 의 `lead_form_config` 가 e-mail 필수 → 400 `field_required` (email) → door `invalid` | 12 → 12 |
| B7.3 (추가) | tenant 가 message 필드를 끔 → 200 / door ok 이지만 **저장된 행에 message 가 없다** | 12 → 13, message present = false |
| B.log / B.cleanup | 서버 로그에 `schema_behind` / `failed` / `store_rejected` / `limit_skipped` 없음, 폼 내용 없음; fixture 0 | 0 / 0 / 0 |

### C — browser level (실제 빌드된 `contact.html`)

두 가지 운반 방식으로 같은 시나리오를 돈다.

- **mode R** (brief 가 지정한 방식): `context.route` → 선언된 endpoint 는 `route.fetch({ url: <local> })` → `route.fulfill({ response })`, 그 외는 abort.
- **mode G** (추가): route interception **없음**. Chromium → loopback proxy → loopback TLS relay → 로컬 BoostChat. 브라우저가 자기 CORS 로직 (preflight 포함) 을 **직접** 수행한다. mode R 로는 볼 수 없는 것을 보기 위해 만들었다 (§5-1).

| 단계 | 증명 | 관측 (R / G) |
|---|---|---|
| **1a** | submit 을 trusted mouse click 5번 연속 → BoostChat 에 도달한 POST **1개**, 성공 화면 | POSTs = 1 (200), 0 → 1 / 3 → 4 |
| **1b** | 한 script task 안에서 `click()` 5번 (버튼이 disabled 되기 전) → submit event 5개, POST **1개** | 1 → 2 / 4 → 5 |
| **2a** | 첫 답을 잃음: 서버는 200 으로 저장, 페이지는 실패 alert + 다른 연락 수단, **입력값·동의 전부 보존**, 버튼 다시 활성 | 2 → 3 / 6 → 7 |
| **2b** | 다시 누름 → wire 에 **같은 `submission_id`** (body 동일) → 200, 성공 화면, 행 추가 없음: 이 문의의 행 = **1** | 3 → 3 / 7 → 7 |
| 3 | 방문자 예산 소진 뒤 페이지에서 제출 → 진짜 429; alert 의 분 = `ceil(Retry-After/60)` (door 가 header 를 못 읽을 때의 1분이 아님), 버튼 disabled, 더 눌러도 요청 없음 | Retry-After=450 → 8분 / 446 → 8분 |
| C.R.4 / C.G.5 | 브라우저가 `Origin` 을 직접 넣고, cookie 는 보내지 않는다; 답에는 그 origin 의 `Access-Control-Allow-Origin`, credentials 없음 | G: `sec-fetch-mode=cors`, `sec-fetch-site=cross-site` |
| **C.G.2r** (G 전용) | **이미 쓴 keep-alive 연결**이 답 전에 끊김 → 페이지의 요청은 1개인데 BoostChat 에는 **동일 body 의 POST 2개** (브라우저의 자동 재전송), 둘 다 200, 성공 화면, 그 id 의 행 = **1** | 5 → 6 |
| **C.G.4** (G 전용) | 브라우저 **자신의 preflight** 를 진짜 route 가 답한다: `OPTIONS` (`Access-Control-Request-Headers: content-type` 만) → 204 → POST 진행. 세션 전체에서 preflight 1번 (`Max-Age=600`) | 1× 204 |
| **C.G.8** (G 전용) | negative control: 같은 페이지를 **등록 안 된 origin** 에서 → preflight 가 CORS header 없는 403 → 브라우저가 POST 를 보내지 않음 → 실패 alert + 다른 연락 수단, 행 변화 없음 | OPTIONS 403, 7 → 7 |
| C.N | 저장된 행 1개당 owner 알림 1통 | mails 7 = rows 7 |

## 5. 발견 — 진짜 server contract 와 door 가정 사이

실행으로 확인한 것은 **[검증]**, 코드만 읽은 것은 **[코드]**.

1. **[검증] Playwright 의 route interception 은 CORS preflight 를 Playwright 가 스스로 답한다.** mode R 에서 route handler 에 올라온 preflight 는 0개 (`C.R.5`).
   따라서 `context.route` / `page.route` 기반 QA 는 BoostChat 의 `OPTIONS` handler, origin 등록, `Access-Control-Allow-Headers` 를 **전혀 검증하지 못한다.**
   진짜 preflight 는 mode G 에서 통과를 확인했다 (`C.G.4`). route 가 허용하는 request header 는 `content-type` 하나뿐이므로, door 가 header 를 하나라도 더 붙이면 (예: `X-Requested-With`, `Idempotency-Key`) 모든 브라우저에서 preflight 가 실패한다.
2. **[검증] `Retry-After` 는 cross-origin 페이지에서 읽힌다** (`Access-Control-Expose-Headers: Retry-After`). 진짜 브라우저의 alert 가 기본값 1분이 아니라 실제 분 (7분) 을 말한다 (`C.R.3`, `C.G.3`).
3. **[검증] Chromium 은 재사용한 keep-alive 연결이 답 전에 죽으면 POST 를 스스로 다시 보낸다** (`C.G.2r`). 페이지 (door) 는 요청 1개에 200 하나만 본다. 서버는 POST 2개를 받는다.
   `submission_id` 덕분에 행은 1개다 — id 없는 legacy body 였다면 2행이 된다. 부작용: 방문자 예산 (5회/10분) 을 2 소모한다.
4. **[검증] 방문자 예산은 POST 마다 센다 — 멱등 replay 도 1회다** (`B1.4`: 같은 id 10번 → 5×200 + 5×429). **[코드]** body 를 읽기 전에 세므로 400 으로 끝나는 요청도 1회다.
   답을 못 받은 방문자가 다시 누르는 것만으로 예산이 닳고, 6번째부터는 429 가 된다 (그래도 행은 1개). **[코드]** 방문자 식별은 신뢰하는 proxy header (`X-Real-IP`) 에 달려 있다 — 없으면 채널의 모든 방문자가 한 bucket 을 나눠 쓴다. production proxy 구성은 여기서 확인할 수 없다.
5. **[검증] origin 이 등록되지 않은 경우** (정확히 일치해야 한다 — `www` 와 apex, `http` 와 `https` 는 다른 origin): CORS header 없는 403 → 브라우저는 preflight 에서 막고 door 는 `network` 로 본다 → 일반 실패 alert + 다른 연락 수단 (`C.G.8`).
   즉 **설정 실수 (origin 미등록, key 미 opt-in — 둘 다 `B0.2` 에서 같은 403; `PUBLIC_WIDGET_ENABLED` off 는 [코드]) 는 방문자에게 "잠시 후 다시 시도" 로 보이고, 다시 시도해도 영원히 실패한다.** Node (CORS 없음) 에서는 같은 403 이 `unknown` 이다.
6. **[검증] `channel_capacity` 429 에도 `Retry-After` 가 온다** (UTC 자정까지의 초, 14256). door 는 설계대로 무시하고 pause 를 걸지 않는다 → 방문자가 누를 때마다 요청이 가고 방문자 예산이 닳는다 (`B7.1`).
7. **[검증] route 는 tenant 의 `lead_form_config` 로 검증한다 — Track B 폼은 그 설정을 모른다.**
   e-mail 을 필수로 둔 tenant 는 모든 제출이 400 `field_required` → door `invalid`, 방문자가 고칠 방법이 없다 (`B7.2`).
   message 필드를 끈 tenant 는 200 / 성공 화면이지만 **message 가 저장되지 않는다** — 폼이 message 에 접어 넣는 공사 유형·주소 등도 함께 사라진다 (`B7.3`).
   사이트를 BoostChat channel 에 연결할 때 그 tenant 의 폼 설정 (이름·전화·message 켜짐, e-mail 필수 아님) 을 확인해야 한다.
8. **[코드] `INQUIRY_RETRY_MAX_S = 3600` vs 방문자 하루 상한** (하루 20건 저장): 그 429 도 `rate_limited` 이고 `Retry-After` 는 최대 86,400초다. door 는 3600 으로 자르므로 alert 는 "약 60분" 이라 말하고, 60분 뒤의 재시도는 다시 429 다.
9. **[코드] door 에 대응이 없는 답**: 403 `challenge_required` / `challenge_failed` (CORS header 있음), 413, 415 → 전부 `unknown`. 503 `verification_unavailable` → `unavailable`.
   Turnstile 은 key 단위로 켠다 (`isTurnstileRequiredForKey`). door 는 `turnstile_token` 을 보내지 않으므로, **이 사이트의 key 에 Turnstile 을 켜는 순간 새 문의는 전부 403 `challenge_required` → `unknown`** 이 된다 (이미 저장된 제출의 replay 만 200). 이번 증명에서는 OFF 였다.
10. **[코드] fingerprint 는 `RATE_LIMIT_CLIENT_HASH_SECRET` 으로 HMAC 한다.** 첫 전송과 재시도 사이에 그 secret 이 바뀌면 정당한 replay 가 409 가 되고, door 는 id 를 버리며, 다음 누름은 새 id → **두 번째 행**이 될 수 있다.
11. **[코드] honeypot (`hp`) 이 채워진 요청은 200 `{"received":true}` 를 받고 아무것도 저장되지 않는다** (서버의 의도된 동작). door 의 `ok` 는 "서버가 200 으로 받았다" 이지 "행이 있다" 가 아니다.
12. **[코드] owner 알림에는 tenant 하루 상한이 있다** (`LEAD_NOTIFY_DAILY_MAX`, 기본 50, 채팅 상담 요청과 공유). "행 1개당 알림 1통" 은 그 상한 안에서만 성립한다 (이번 실행은 13행 / 7행).
13. **[검증] 200 확인 뒤 같은 값을 다시 보내면 새 문의다** (새 id, 새 행 — `B3.1`). door 의 설계이고 서버가 막지 않는다. 성공 화면이 폼을 치우므로 실제 페이지에서는 새로 열어 다시 입력해야 가능하다.

door 와 일치하는 것 (불일치 없음): 200 `{"received":true}` 만 ok, 400 → invalid, 409 → conflict (자동 재전송 없음), 429 의 두 종류를 body 의 `error` 로 구분, `credentials: "omit"` (서버도 credentials 를 허용하지 않음),
body key 는 서버 allow-list 의 부분집합, 길이 상한 (name 100 / phone 20 ≤ 40 / message 2000) 과 전화 규칙 (숫자 8개 이상, `0-9 + - ( )` 와 공백) 은 서버와 같다.

## 6. 하지 않은 것 / 한계

- **Turnstile ON** 경로는 검증하지 않았다 (brief: OFF). §5-9 는 코드 읽기다.
- **production 은 건드리지 않았다.** production 의 origin 등록, `WIDGET_SITE_LEAD_KEYS` opt-in, proxy 의 `X-Real-IP`, 배포된 commit 이 `3ff3a23` 인지, production DB 에 0055 가 적용됐는지는 이 증명이 말해 주지 않는다.
- BoostChat 은 **commit 된 HEAD** (`3ff3a23`) 다. 원본 repo 의 작업 중인 변경 (uncommitted) 은 복사본에 없다.
- 브라우저는 Playwright 의 Chromium (headless shell) 하나다. WebKit / Firefox 의 재전송·preflight cache 동작은 보지 않았다.
- §5-8, 9, 10, 11, 12 는 실행하지 않았다 (하루 상한을 실제로 채우거나 secret 을 바꾸는 시나리오).
- mode G 의 TLS 는 일회용 self-signed 인증서 + `ignoreHTTPSErrors` 다. 인증서 검증은 증명 대상이 아니다.
