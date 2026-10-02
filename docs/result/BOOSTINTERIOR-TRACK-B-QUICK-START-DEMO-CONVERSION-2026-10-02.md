# BoostInterior Track B — Quick Start Demo Conversion Fix (2026-10-02 ~ 10-03)

견적 문의 폼이 실제로 접수되고, "아직 연결되어 있지 않습니다" 문구가 사라졌으며, 고객 노출 용어가
"시공사례"로 통일된 package 가 `https://interior-demo.boostweb.co.kr` 에 올라가 있다. 실제 production
endpoint 로 `[TEST]` 제출 1건을 보내 저장과 알림 표시까지 확인했다. BoostChat 의 문의 채널 기능은
배포됐지만 demo tenant 에는 owner 가 승인한 채널 값이 없어 아무 채널도 켜지 않았다.

```
TASK                       = QUICK START DEMO CONVERSION FIX
DEMO                       = https://interior-demo.boostweb.co.kr
CONTACT_FORM               = ONLINE SUBMIT (interior-01 1.6.2, /contact)
FORM_SUBMISSION_TARGET     = BOOSTCHAT_SITE_LEAD_ROUTE  (POST https://boostchat.co.kr/api/widget/<demo widget key>/lead)
                             tenant boost-interior-demo · table lead_request · conversation_id NULL
                             · message 첫 줄 "[홈페이지 견적 문의]"
FORM_E2E                   = PASS (실제 제출 1건 → 200 {"received":true} → DB 행 1건 → notified_at 기록)
OLD_MAIL_FALLBACK          = REMOVED (demo 에서는 mailto hand-off 없음. 이메일 주소 표기만 보조 연락처로 유지)
BOOSTCHAT_CONTACT_CHANNELS = DEPLOYED (2026-10-03 00:13 KST, Railway 068179d0…) / demo tenant 설정 0건
CONTACT_CHANNELS_ENABLED   = NONE (kakao / naver / instagram / phone 모두 disabled — owner 승인 값 없음)
MAP_DEMO_STATUS            = NOT SHOWN (승인된 가상 주소 없음. 가짜 주소를 만들지 않았다)
CASE_TERM                  = 시공사례
PORTFOLIO_COUNT            = 8
SYNTHETIC_PRODUCTION       = 0
RESPONSIVE                 = PASS (1440 / 1024 / 768 / 390 / 375, + WebKit iPhone 13)
CONSOLE                    = console error 0 · page error 0 · 4xx/5xx 0 · broken image 0 · dead link 0 · overflow 0
BUILD                      = build 38400831… · packageHash eeb82881… · release interior-01-1.6.2-d5d4b4557a20 · QA pass
PUBLISH                    = PUBLISHED 2026-10-02T15:57Z (--expect-live e562dedd… --expect-package eeb82881…)
LIVE_QA                    = PASS (live 142/142 byte-identical, 폼 19/19 × 6 profile)
GIT                        = 6e78624 feat(site) · be065c5 build(site) · docs(site) commit (이 보고서) — push 없음
KNOWN ISSUES               = §9
```

## 1. 무엇이 바뀌었나

| 항목 | 이전 (package `e562dedd…`) | 이후 (package `eeb82881…`) |
|---|---|---|
| 폼 제출 | `mailto:` hand-off, backend 없음 | BoostChat site lead route 로 JSON POST |
| 폼 안내 | "온라인 접수는 아직 연결되어 있지 않습니다. … 메일 앱에서 열립니다." | "이 페이지는 BoostInterior 기능 시연용입니다." |
| 제출 버튼 | 메일로 문의 보내기 | 견적 문의 보내기 |
| 동의 | 없음 | 개인정보 수집·이용 동의 체크박스 (필수) |
| 성공 | "아직 전송된 것은 아닙니다" 안내 | "견적 문의가 접수되었습니다." / "입력해주신 내용을 확인한 뒤 상담을 이어갈 수 있습니다." |
| 실패 | — | "문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요." (입력 유지, 버튼 위에 표시) |
| nav | 포트폴리오 / 3D 포트폴리오 | 시공사례 / 3D 시공사례 |
| footer 고지 | …포트폴리오·후기는 데모용 예시… | …시공사례·후기는 데모용 예시… (가상 브랜드·AI 이미지 고지는 그대로) |

Before/After 스크린샷: `quick-start-demo-conversion/screenshots/{before,after}/` (before 11장, after 19장).
`.gitignore` 의 `docs/result/**/*.jpg` 규칙 때문에 이미지는 commit 되지 않고 이 worktree 디스크에만 있다.

## 2. 폼이 어디로 저장되는가 (FORM_SUBMISSION_TARGET)

**기존 endpoint 를 그대로 재사용할 수 없었다.** BoostChat 의 유일한 lead 저장 경로
`POST /api/public/lead` 는 채팅 conversation id 와 IP 에 묶인 proof 를 요구하고, 앱 전체에 CORS 가 없었으며,
외부 웹사이트 폼용 intake 도 없었다. 그래서 새 CRM 을 만드는 대신 BoostChat 에 얇은 public route 하나를
추가했다 — 이것이 이번 작업의 "최소 신규 backend" 이고, 필요한 이유는 이 한 문단이다.

- Route: `POST|OPTIONS /api/widget/[publicKey]/lead` (BoostChat 브랜치 `feat/widget-site-lead`:
  `e88875a`, `ce6bb36`, `ae0e583`, `f8b8822`). 기존 `submitLead` · `readLeadForm` · `resolveIntent` ·
  `notifyLeadCreated` 와 widget key / allowed-origin 검사를 재사용한다. migration 없음.
- 저장: tenant `boost-interior-demo` 의 `lead_request` 행, `conversation_id` NULL. 기존 관리자 inbox
  (`/admin/boost-interior-demo/leads`) 에 그대로 나타나고, 기존 owner 알림 메일 경로를 탄다.
- 폼의 지역 / 평형 / 공사 유형 / 예상 일정은 별도 컬럼이 없어 `message` 에 라벨 줄로 접어 넣는다.
- frontend 에 service role key 나 secret 은 없다. 페이지에 실리는 것은 공개 widget key 가 든 endpoint URL 하나다.
- 남용 방지: Origin allow-list(브라우저 한정), honeypot(`hp`), 클라이언트당 10분 5회 시도 · 하루 20건 저장,
  채널당 하루 100건 저장, 알림 하루 50건(기존 상한, 채팅 lead 와 공유). CAPTCHA 는 넣지 않았다.
- opt-in: env `WIDGET_SITE_LEAD_KEYS` 에 적힌 widget key 만 허용된다. production 에는 demo key 하나만 있다.
- 배포는 이 세션이 하지 않았다. owner 결정에 따라 BoostChat release-owner 세션이 migration 0054 ·
  Contact Channels / Launcher V2 와 묶어 하나의 release 로 배포했다(Railway `068179d0…`).

상세 계약 · 보안 모델 · 독립 리뷰 결과는 BoostChat 저장소의
`docs/result/BOOSTCHAT-WIDGET-SITE-LEAD-V1-2026-10-02.md` 와
`…-INTEGRATED-RELEASE-HANDOFF-2026-10-03.md` 에 있다.

## 3. Track B 쪽 구현

- **사이트 선언** `data/sites/<site>/inquiry.json` (`platform/site/inquiry.ts`): strict, https, 정확한 URL 하나.
  없으면 예전 mail hand-off 가 1.6.1 과 byte 단위로 같게 유지된다.
- **Package QA** (`platform/build/qa.ts`): 선언한 endpoint 는 `.html` 의 `<script>` 본문과 `.txt` flight
  파일에서만 통과한다. 속성 값(`action`, `formaction`, `src`, `href` …)이나 `.js`/`.css`/`.json` 등에서는 여전히 실패한다.
- **네트워크 문** `@platform/site/inquiry-client`: 템플릿은 여전히 `fetch`/`window` 를 쓸 수 없고, 이 모듈만
  JSON POST 한 번을 보낸다(credentials 없음, 15초 abort, 200 + `received:true` 만 성공). 텍스트 정규화와
  전화번호 규칙도 여기에 있다.
- **템플릿 1.6.2** (`InquiryForm.tsx` 외): 동의 체크박스, honeypot, 제출 중 / 성공 / 실패 상태,
  hydration 전 버튼 비활성화 + `<noscript>` 안내, 붙여넣은 탭 · 보이지 않는 문자 정리,
  전화번호 = 숫자 · 공백 · `+` · `-` · 괄호에 숫자 8자리 이상(서버와 같은 규칙).
- **demo 데이터**: endpoint 선언, 문구 교체, 용어 정리 12곳(모두 `slots.json`). route slug · slot key · id 는 그대로다.
- Worker(`recon-runtime`)와 배포 경로는 바꾸지 않았다. 여전히 GET/HEAD 전용 static 서빙이다.

## 4. 독립 리뷰

| 대상 | 결과 | 반영 |
|---|---|---|
| BoostChat route 1차 | blocker 없음 · HIGH 1 · MEDIUM 2 | opt-in env, 클라이언트 일일 상한, `channel_capacity` 코드, 보이지 않는 문자 제거, 연락처 형식 검증, `Retry-After` 노출, 로그 분류 |
| BoostChat route 재검토 | blocker · HIGH 없음, regression 없음 | 잔여 위험은 §9 |
| Track B 1차 | blocker = "backend 미배포 상태로 publish 금지"(순서 문제) · MEDIUM 5 | 375px 성공 문구 가림, 실패 안내 위치, 문자 정리, hydration 전 제출 차단, 전화번호 규칙 일치, QA 허용 범위 축소, 동의 문구 — 전부 반영 후 1.6.2 재cut |
| Track B 재검토 | blocker · HIGH · MEDIUM 없음, publish 를 막을 사항 없음 | LOW 는 §9 |

## 5. 테스트

`tsc -p platform/tsconfig.json --noEmit` exit 0. Suite (pass / fail):
publish 66/0 · portfolio-production-truth 10/0 · integration 85/0 · predemo 10/0 · predemo2 9/0 ·
ia150 15/0 · ia151 10/0 · ia152 14/0 · step6 34/0 · detail-facts 25/0 · slice1 86/0 ·
inquiry162(신규) 28/0 · polish 4/0 · step4 47/0 · step41 35/0 · step5 32/0 · step52 12/0 ·
publish-e2e LOCAL 47/0 (live 전용 1건 skip).
로컬 브라우저 체크(endpoint stub, Chromium + WebKit, 1440 / 390 / 375×667): 137/0.

BoostChat 쪽(격리 로컬 DB): test:widget-site-lead 83/83 · test:leads 90/90 · test:lead-notify 31/31 ·
test:widget-origin 86/86 · test:widget 64/64(10 skip). 통합 release 병합 트리에서 release-owner 세션이
83/83 · 90/90 · 31/31 을 다시 확인했다고 전달받았다(이 세션에서 재실행하지 않음).

정상 assertion 을 지우거나 약화하지 않았다. "초기 렌더 HTML 에 성공 문구 없음" 검사는 유지된다.
온라인 문의는 여덟 번째 data delta 로 lineage 에 연결했고(head anchor `7311903d…`),
keep-2 로 트리에서 빠진 `ddbc72ad…` 는 git `1da1658` 에서 읽는다.

## 6. Publish

| 단계 | 결과 | 증거 |
|---|---|---|
| dry-run + store check | host 가 `e562dedd…`(1.6.1) 서빙, 144개 업로드 예정, 경고 0 | `proof/10-publish-dry-run.log` |
| upload (no-activate) 1차 | 실패 — `wrangler put` 1건이 Cloudflare 오류 페이지를 받음. 포인터 미변경 | `proof/11-…` |
| upload 재실행 | 144/144 업로드 · 봉인 | `proof/12-publish-reverify.log` |
| reverify | 봉인된 144/144 sha256 + size 일치 | `proof/13-…` |
| activate | `pointerWrite: written`, previous = `e562dedd…` | `proof/14-publish-activate.log` |

rollback 대상은 `e562dedd…`(build `01f7ac78…`, 8건 시공사례)이다. 그 package 로 되돌리면 폼은 다시
mailto hand-off 와 옛 문구가 된다.

## 7. 실제 제출 1건 (FORM_E2E)

- 클릭 `2026-10-02T16:04:25.338Z`, Chromium 1440×900, live `/contact`.
- preflight `OPTIONS` → 204, `access-control-allow-origin: https://interior-demo.boostweb.co.kr`.
- `POST` 본문: `consent:true`, `name:"[TEST] Track B E2E"`, `phone:"010-0000-0000"`,
  `message:"[홈페이지 견적 문의]\n지역: 테스트\n평형: 0평\n예상 일정: 테스트\n\n[TEST] Quick Start demo conversion E2E 2026-10-03 — …"`, `hp:""`.
  cookie 헤더 없음.
- 응답 `200 {"received":true}`. 페이지 이동 없음, console error 0. 성공 영역에 기대한 두 문장이 표시됐다.
- production DB (read-only transaction, system identifier guard 일치):
  `lead_request` id `ab494ebb-e85a-4994-b13e-fb1d63f17878`, intent `GENERAL`, status `new`,
  `created_at 2026-10-02 16:04:25.868Z`, `conversation_id` NULL,
  `notified_at 2026-10-02 16:04:25.906Z`. 배포 이후 이 tenant 의 lead 는 이 1건뿐이다.
- 알림: `notified_at` 은 발송 전에 선점되고 발송이 확정 실패하면 NULL 로 되돌려지는 값이다. 약 50분 뒤에도
  남아 있었고 실패 로그는 없었다. **owner 메일함 도착 자체는 이 세션에서 확인하지 못했다.**
- 이 세션 전체에서 stub 되지 않은 lead POST 는 이 1건이다. 나머지 폼 검사는 모두 Playwright route 로 막았다.
- 이 행은 삭제하지 않았다. 관리자 inbox 에 `[TEST] Track B E2E` 로 보인다(90일 뒤 자동 삭제 대상).

증거: `proof/21-live-real-submission.json`, `screenshots/after/submit-success-real-1440.jpg`.

## 8. Live QA

- **live = package**: 주소로 접근 가능한 142/142 파일이 byte 단위로 같다. 없는 경로는 404 + `404.html` 과 같은 본문.
- **viewport** (13개 페이지 전부): 1440 / 1024 / 768 / 390 / 375 에서 가로 overflow 0, 깨진 이미지 0,
  console error 0, page error 0, 4xx/5xx 0. 실패로 잡힌 요청은 전부 자기 페이지 prefetch 취소(`ERR_ABORTED`)다.
- **폼**: 초기 상태 · 빈 제출 / 미동의 / 7자리 전화번호 차단(요청 0건) · 실패(500, abort) 시 안내가 화면 안에
  보이고 입력 유지 · 성공 제목이 sticky header 아래 — 6개 profile 모두 19/19.
- **widget**: launcher 가 `/` 와 `/contact` 에서 보인다(768 이상 60×60, 390 / 375 에서 56×56). 제출 버튼 ·
  성공 / 실패 안내를 가리지 않는다. 열고 닫기 정상, "Powered by boostchat" 표기 유지.
- **문의 채널**: `[data-contact-entry]` · `[data-contact-row]` · `[data-contact-sheet]` 0개,
  "다른 방법으로 문의" 문구 없음 — 채널이 0개라 기대한 상태다. **채널 클릭 테스트는 대상이 없어 하지 못했다.**
- **용어**: 모든 페이지 · viewport(모바일 메뉴 포함)에서 "포트폴리오" 0, "시공 사례" 0.
- **dead link**: 내부 링크 13개 대상 중 0. 외부 링크는 `mailto:` 하나.
- **시공사례 회귀**: 문서에 bi-01…bi-08 8건, 상세 8개 200, 제거된 synthetic slug 3개 404,
  참조 이미지 41개 200, `/portfolio` 카드 8개의 cover 가 URL · sha256 모두 서로 다르다.

증거: `proof/20-live-http-parity.log`, `proof/22-live-browser-qa.{json,log}`, `proof/scripts/`.

## 9. Known issues

**Contact Channels — owner 결정 대기**
- 저장소에서 확인된 실제 destination 은 Sales 사이트의 BoostWorks 카카오 오픈채팅 URL
  (`boost-interior-sales/lib/site.ts` `KAKAO_OPEN_CHAT_URL`) 하나다. demo tenant 에 써도 된다는 승인 기록이
  없어 설정하지 않았다. Naver / Instagram / Phone 은 값 자체가 없다.
- 설정은 owner 로그인이 필요한 관리자 화면(`/admin/boost-interior-demo/install` 의 "문의 방법")에서만 된다.
  채널을 하나라도 켜면 launcher / "다른 방법으로 문의" / 각 채널 링크를 live 에서 테스트해야 한다.
- 그때까지 demo 는 Sales 페이지가 설명하는 "카카오톡 · 전화 · SNS 문의" 를 시각적으로 증명하지 못한다.

**지도**
- 템플릿과 demo 데이터에 사업장 주소 · 지도 섹션이 없다. 승인된 가상 위치가 생기면 schema 변경과 새 release 가 필요하다.

**폼**
- 실패 후 Chromium 에서 포커스가 버튼을 벗어난다(전송 중 `disabled` 때문). 키보드 사용자는 Tab 으로 돌아가야 한다.
- 전화번호 안내 "숫자 8자리 이상으로 입력해 주세요" 는 점 구분 번호(`010.1234.5678`)나 전각 숫자가 거부될 때도 뜬다.
- 동의 문구에 처리 주체, 개인정보 처리방침 링크, 삭제 문의처가 없다.
- 429(시도 제한)와 그 밖의 실패가 같은 문구로 표시된다. 15초 timeout 뒤 재시도하면 lead 가 중복될 수 있다.
- JS chunk 로드에 실패하면 버튼이 설명 없이 비활성 상태로 남는다(이메일 주소는 페이지에 있다).

**BoostChat route (V1 에서 수용)**
- Origin 은 브라우저 밖에서 위조할 수 있다. 서로 다른 클라이언트 5개가 opt-in 된 채널의 일일 상한 100건을
  채우면 UTC 자정(09:00 KST)까지 폼이 닫히고 운영자 알림이 없다. demo tenant 만 opt-in 했으므로 수용했다.
  실제 tenant 에 열기 전에 운영자 알림과 브라우저 증명(Turnstile) 또는 서버 간 서명이 필요하다.
- honeypot key `hp` 는 "휴대폰" 관례와 겹칠 수 있다. 외부 tenant 에 계약을 공개하기 전에 바꿔야 한다.
- `lead_request` 에 source 컬럼이 없어, 사이트 폼 lead 는 "`conversation_id` NULL + 메시지 접두어"로만 구분된다.
- widget bootstrap 은 채팅과 같은 방문자 예산(60초 10회)을 쓴다. 한 방문자가 1분에 5페이지쯤 넘기면 widget 이
  제한될 수 있다(Track B 범위 밖, QA 중 발견).

**용어**
- "프로젝트" 표현(대표 프로젝트, 전체 프로젝트 보기, 프로젝트 검색, 프로젝트 {n}건, 프로젝트 이야기,
  배너 "대표 프로젝트 보기")은 audit 대상 세 표현에 없어 그대로 두었다. 바꾸려면 데이터만 고치면 된다.
- 한 페이지 안에서 보조용언 띄어쓰기가 섞여 있다("입력해 주세요" / "입력해주신").

**기타**
- 모바일에서 launcher 상자가 footer 고지 요소의 빈 오른쪽 끝과 겹친다(48×20, 글자는 가리지 않음).
  끝에서 두 번째 줄과의 여유는 1–2px 다. 해결에는 템플릿 seam 이 필요하다(기존 `PORTFOLIO-MOBILE-FOOTER-OVERLAP`).
- `inquiry162` 와 `portfolio-production-truth` 는 `test:platform` 스크립트에 들어 있지 않다.
- 2026-09-22 이후 방치된 smoke script 는 손대지 않았다. `scripts/template-platform-ia-smoke.ts` 는 지워진
  `afterSubmit` slot 을 읽어 demo 에서 시작 시 오류가 난다.
- tracked `docs/result/static-deployment-foundation/proof/local-e2e.json` 은 옛 mail smoke 기록 그대로다.
  untracked `…/proof/live-e2e.json` 은 이번에도 건드리지 않았다.
- Firefox, 실제 iOS / Android 기기, 실제 한글 IME 는 확인하지 못했다.

## 10. Git

| commit | 내용 |
|---|---|
| `6e78624` | feat(site): platform seam, 템플릿 1.6.2, demo 데이터, 테스트, release `interior-01-1.6.2-d5d4b4557a20` |
| `be065c5` | build(site): publish 된 package `38400831…` / `eeb82881…`, `ddbc72ad…` 퇴역 |
| docs(site) commit | 이 보고서, proof 로그 · 스크립트, status / architecture 메모 (스크린샷은 gitignore 대상) |

브랜치 `track-b/static-deployment-foundation`, push 없음. Track A 와 다른 worktree 는 건드리지 않았다.
BoostChat 쪽 commit 은 별도 worktree `/Users/woops/projects/boost-chat-site-lead` 의 `feat/widget-site-lead` 에 있다.
