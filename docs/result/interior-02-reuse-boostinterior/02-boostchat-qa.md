# 02 — BoostChat 연결과 기능 QA

## 1. 기존 integration (먼저 확인한 것)

기존 `boost-interior-demo`(interior-01)는 BoostChat을 **site data 두 파일**로 연결합니다.

| 파일 | 값 | 역할 |
|---|---|---|
| `scripts.json` | `https://boostchat.co.kr/widget.js` + `data-boost-chat-key="wgt_99kY…qDI3"` | 채팅 widget loader (모든 페이지 `<head>`) |
| `inquiry.json` | `https://boostchat.co.kr/api/widget/wgt_99kY…qDI3/lead` | 견적 문의 폼의 접수 endpoint |

둘 다 platform의 기존 seam(head scripts, inquiry endpoint)이고 template은 key를 모릅니다.

## 2. Demo 02에서 한 일

**위 두 파일을 그대로 복사했습니다.** 새 chat API, 새 widget 구조, 새 도구, CRM·포트폴리오 기능은 만들지
않았고 BoostChat 쪽 코드·설정·DB는 쓰지 않았습니다.

- tenant / key: 같은 브랜드("부스트 인테리어")이므로 기존 tenant `boost-interior-demo`와 같은 key를 씁니다.
- key 위치: `data/sites/boost-interior-demo-02/{scripts,inquiry}.json`뿐. template tree 83개 파일과 release
  102개 파일에는 host도 key도 없습니다(`interior-02.test.ts` 검사 O). Ongyeol package에도 없습니다.
- interior-02의 문의 폼은 `inquiry.json`이 있으면 스스로 online mode가 됩니다(Ongyeol은 mail mode). template 변경 없이
  mode가 바뀐 것도 재사용 증거입니다.

## 3. 알아야 할 제약 — localhost에서는 widget이 보이지 않습니다

BoostChat은 tenant별 허용 origin 목록으로 widget을 보호합니다. 운영 DB를 읽기 전용으로 확인한 현재 값:

```
allowed_origins = ["https://interior-demo.boostweb.co.kr"]      (proof/prod-usage-check.txt)
```

그래서 `http://127.0.0.1:4322`에서는 loader(`widget.js`)는 200으로 받지만 iframe이 스스로 내려가고 launcher가
나타나지 않습니다(negative control로 확인: iframe 0개). 견적 문의 폼도 이 origin에서는 접수되지 않습니다: lead
endpoint의 preflight가 `Origin: http://127.0.0.1:4322`에는 CORS header 없는 `403`, 허용 origin에는 `204`를
돌려줍니다(`OPTIONS`만 보내 확인, 저장되는 것 없음). 브라우저가 POST를 막으므로 폼은 실패 안내를 보여 줍니다. **owner가 localhost에서 볼 때 채팅 버튼이 없는 것은 고장이 아니라 이 보호 때문입니다.**

localhost에서도 보이게 하려면 BoostChat 운영 설정의 허용 origin에 `http://127.0.0.1:4322`를 추가해야 합니다.
운영 데이터 쓰기이고 BoostChat은 다른 세션 소유라 이번 작업에서는 하지 않았습니다(owner 결정 사항, `00-summary.md` §6).

## 4. 실제 widget으로 한 기능 QA

방법: Playwright가 `https://interior-demo.boostweb.co.kr/**` 요청을 가로채 **Demo 02 package의 바이트**
(`http://127.0.0.1:4322`)로 응답합니다. 브라우저가 보는 origin은 허용 목록의 값이고 `boostchat.co.kr`은 실제 운영
서비스입니다. 실제 host에는 요청이 가지 않고 BoostChat 설정도 바꾸지 않습니다. 견적 문의 endpoint
(`/api/widget/*/lead`)는 스크립트가 직접 응답하는 stub입니다(응답에 `x-qa-stub: 1`, 표시 없는 lead 응답이 보이면 즉시 중단).

결과: 41개 검사 중 40개 PASS (`proof/widget-qa-local+desktop.json`, `proof/widget-qa-contact+mobile+tablet+cards.json`,
스크립트 `proof/scripts/widget-qa.mjs.txt`). 남은 1개는 아래 "network" 줄의 판정 규칙 문제이고 실제 실패가 아닙니다.

이 실행 뒤에 site data 문구를 몇 군데 고쳤습니다(`03` §2-1). **최종 package**(`9812ac08…`)에서 채팅을 보내지 않는
phase(local · contact · mobile · tablet)를 다시 돌려 21/21 PASS였습니다(`proof/widget-qa-final-local+contact+mobile+tablet.json`).
채팅 3건(desktop · cards)은 다시 보내지 않았습니다 — 바뀐 것은 site 문구뿐이고 widget 쪽 입력은 같습니다.

| 항목 | 결과 | 근거 |
|---|---|---|
| widget loader | PASS | `GET /widget.js 200`, 362 ms |
| launcher visible | PASS | 닫힌 iframe 64×64, 오른쪽·아래 18px (desktop 1440, tablet 768) / 60×60, 12px (WebKit iPhone 13) |
| open / close | PASS | desktop·tablet 372×560 패널, mobile 전체 화면(390×664) → 닫으면 launcher로 복귀 |
| chat starts | PASS | `POST …/bootstrap 200`, 인사말 표시 |
| basic message / response | PASS | 3개 메시지 모두 답변 도착, `POST …/chat 200` ×3 |
| tenant / site context | PASS | 패널 제목 "부스트 인테리어 · AI 상담원 상담 도우미", 인사말 "안녕하세요, 부스트 인테리어입니다…" |
| portfolio 추천 (기존 기능) | PASS | "34평 아파트 전체 리모델링 시공사례를 보여 주세요" → 수성 화이트 34평(bi-01) 등 카드 3장 |
| 카드 → 상세 페이지 | PASS | 카드 → viewer → "전체 포트폴리오 보기" → `/portfolio/buk-32py-kitchen-bathroom-renewal`이 **이 package의 페이지**로 열림(200, 제목 "32평 주방·욕실 중심 리뉴얼 \| 부스트 인테리어") |
| 견적 문의 폼 (online mode) | PASS | 빈 제출은 요청 없음 → stub 500: 실패 안내 + 입력 유지 + 이메일 대안 → stub 200: 접수 완료 화면. body는 정확히 `consent, hp, message, name, phone, submission_id`, 재시도는 같은 `submission_id` |
| console error | PASS | 0건 (문의 폼의 stub 500이 남긴 브라우저 기본 로그 1건 제외) |
| network | 아래 설명 | HTTP ≥ 400 응답 0건(stub 500 제외) |
| cross-tenant | PASS | BoostChat API 경로는 모두 이 key. 대화·카드에 다른 브랜드 문자열 없음. 추천 카드는 bi-01/02/04/07 — 이 사이트의 기록 |
| responsive | PASS | 1440 / 1280 / 768 / iPhone 13(WebKit). widget이 있어도 가로 overflow 0 |

**network 줄 설명.** Playwright가 `requestfailed … net::ERR_ABORTED`를 기록한 요청이 두 종류 있습니다.
(1) Next `<Link>`의 `HEAD` prefetch — widget과 무관하고 localhost 직접 접속에서도 똑같이 나옵니다.
(2) 스트리밍으로 오는 `POST …/chat` — `response 200` 0.7초 뒤에 기록되지만 답변은 그 뒤 2.8초 동안 끝까지
그려졌고, 클라이언트가 실패 시 남기는 console error도 없습니다(`cards` phase의 `chatEvents`). 처음 실행한
desktop 기록(`widget-qa-local+desktop.json`)에는 이 행들을 실패로 세는 규칙이 그대로 남아 FAIL 1건으로 적혀 있고,
이후 phase는 `ERR_ABORTED`를 따로 기록하고 HTTP ≥ 400만 실패로 봅니다. 기록은 고치지 않았습니다.

## 5. 발견한 충돌 — launcher 자리 (template 변경 없이는 해결 불가)

BoostChat launcher는 화면 오른쪽 아래에 고정이고 위치 옵션이 없습니다(`widget.js`). interior-02도 같은 자리를 씁니다.

| 화면 | 무엇이 가려지나 | 측정 |
|---|---|---|
| ≤ 640px | **하단 탭바의 5번째 탭 "견적 문의"** | launcher 60×60이 탭(78×69)의 64%를 덮음. 라벨과 아이콘이 보이지 않고, 누르면 채팅이 열림 |
| desktop | "맨 위로" 버튼 | 56×56 버튼이 launcher 64×64 아래에 100% 가려짐 |
| desktop 1280–1440px, 홈 | hero의 "다음 슬라이드" · "일시정지" 버튼 | launcher (1358–1422, 818–882)가 두 버튼 (1352–1380, 1392–1420 × 820–848) 위에 놓임. widget이 없어도 template의 floating 버튼이 같은 자리를 덮습니다(`03` §2-2 #1) |

mobile의 "맨 위로" 버튼은 탭바 위(322, 524)에 있어 겹치지 않습니다. 견적 문의 페이지는 header의 말풍선 버튼,
메뉴 drawer, 홈 CTA, footer로 여전히 갈 수 있습니다.

site data로는 피할 수 없습니다: 탭바는 끌 수 없고(라벨을 비우면 영문 기본값), 탭 순서와 "맨 위로" 버튼 위치에는
설정이 없습니다. widget이 없는 Ongyeol에는 영향이 없습니다. 분류와 권고는 `00-summary.md` §3.

## 6. Runtime AI 사용량 (제품 runtime — Claude Code 사용량과 별개)

QA가 보낸 채팅 3건이 만든 운영 기록(읽기 전용 조회, `proof/prod-usage-check.txt`):

```
MODEL_CALLS   = 3 chat (openai gpt-5.6-luna) + 3 query_embedding (text-embedding-3-small)
TOKEN_INPUT   = 16,207 (chat) + 77 (embedding)
TOKEN_OUTPUT  = 248
ESTIMATED_COST ≈ USD 0.0035
lead_request rows in the QA window = 0   (stub이 지켜졌음)
```

비용은 boost-chat 문서에 적힌 단가(input $0.20 / output $1.20 / 1M token, embedding $0.02 / 1M)로 계산한
추정이고, `ai_usage_event`에는 금액 열이 없습니다. 그 문서도 실제 단가는 확인하지 못했다고 적고 있습니다.

## 7. 하지 않은 것

- 실제 lead 제출 0건 (운영 tenant 소유자에게 메일이 가는 동작이라 stub만 사용).
- BoostChat 설정·코드·DB 쓰기 0건. 운영 DB는 읽기 전용 transaction 1회(집계 값만 출력).
- 채팅 안의 "상담 요청 남기기"(lead form)는 열지 않았습니다.
- 채팅 카드의 링크는 tenant에 등록된 `https://interior-demo.boostweb.co.kr/portfolio/<slug>`입니다. Demo 02가
  별도 domain으로 publish되면 카드는 첫 번째 demo 사이트로 이동합니다(slug는 같아 페이지는 존재). tenant당
  first-party origin이 하나인 현재 BoostChat 구조의 한계입니다.
