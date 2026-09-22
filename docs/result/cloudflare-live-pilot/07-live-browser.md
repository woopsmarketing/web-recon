# 07 — Live browser (Playwright chromium, 2026-09-22)

두 가지를 실행했다.

1. **기존 e2e 의 live mode**: `E2E_BASE=https://interior-demo.boostweb.co.kr tsx … platform/test/publish-e2e.test.ts`. read-only 이고 publish 도 wrangler dev 도 없다. 결과는 **25 passed, 16 failed, 5 skipped**, EXIT 1. [`proof/live-e2e-152.log`](proof/live-e2e-152.log), [`proof/live-e2e-152.json`](proof/live-e2e-152.json). test 가 정한 원래 출력 위치 `docs/result/static-deployment-foundation/proof/live-e2e.json` 에도 남아 있다.
2. **보조 스크립트**: scratchpad 의 Playwright 스크립트로, e2e 가 다루지 않은 두 번째 portfolio detail 과 mailto 수신자를 확인했다. [`proof/live-browser-152.json`](proof/live-browser-152.json). 스크린샷 `proof/live-152-*.png` 는 `.gitignore` (`docs/result/**/*.png`) 대상이라 local 에만 있다.

## 페이지 (1440 desktop / 390 mobile, 보조 스크립트)

| route | 1440 | 390 | 이미지 (깨진 것/전체) |
|---|---|---|---|
| `/` | 200 | 200 | 0/15 |
| `/portfolio` | 200 | 200 | 0/10 |
| `/portfolio/dalseo-24py-white-natural-newlywed-home` | 200 | 200 | 0/9 |
| `/portfolio/suseong-white-34py-apartment-remodeling` | 200 | 200 | 0/27 |
| `/3d-portfolio` | 200 | 200 | 0/1 |
| `/about` | 200 | 200 | 0/2 |
| `/contact` | 200 | 200 | 0/1 |

두 폭, 모든 route 에서: **overflow 0 px, console error 0, 응답 ≥400 또는 실패 요청 0, broken image 0**. 모든 페이지의 mailto 는 `mailto:vnfm0580@gmail.com` 하나다. 외부 요청은 `static.cloudflareinsights.com` (zone 의 beacon) 하나뿐이다.

e2e live mode (390 / 1440 × `/`, `/portfolio`, buk detail, `/3d-portfolio`, `/about`, `/contact`, `/no-such-page`) 에서도 모든 행이 status 기대값, broken 0, console 0, overflow 0, broken image 0 이다. 모든 행이 FAIL 로 표시된 이유는 하나다: `0 external` 조건이 beacon 1건 때문에 깨졌다 ([06](06-live-http.md)).

## Interaction (e2e live mode, 모두 ok)

| 검사 | 결과 |
|---|---|
| A 390 **mobile menu**: hamburger 로 dialog 열림 → Esc 로 닫히고 focus 복귀 → portfolio link 로 이동하며 닫힘 | ok (console 0, ≥400 0) |
| B 1440 header nav: `/portfolio`, `/3d-portfolio`, `/about`, `/contact` client-side 이동 (document load 1회) | ok |
| C 390 / 1440 **portfolio** gallery photo viewer: 열기, next 로 counter 변경, Escape 로 닫기, same-origin 이미지 200 | ok ×2 |
| D 390 / 1440 **contact**: 짧은 문의 → `mailto:vnfm0580@gmail.com?subject=[견적 문의] 홍길동님&body=…` 로 넘김. 전송 성공 문구 없음, network 요청 없음 | ok ×2 |
| D 390 / 1440 **긴 한국어 문의** (~300자, mailto 2,000자 한도 초과): 넘기지 않고 copy fallback 표시 | ok ×2 |
| 상태 문구 | `메일 앱에서 내용을 확인한 뒤 보내 주세요. 아직 전송된 것은 아닙니다. 메일 앱이 열리지 않으면 vnfm0580@gmail.com 주소로 보내 주세요.` |
| client navigation `/` → `/portfolio` → detail → `/about` → back | document reload 없음, RSC `.txt` 전부 200, title 적용 |
| JS 비활성: `/`, `/portfolio`, detail, `/about`, `/contact` | h1, 본문, nav, 이미지 ok ×5 |
| Next prefetch 가 취소한 요청 8개 | 모두 same-origin, runtime 이 200 을 준다 |

## Live 전용 검사 (local 에서 skip 됐던 것)

| 검사 | 결과 |
|---|---|
| canonical origin == BASE | ok (13/13) |
| sitemap origin == BASE | ok (13/13) |
| unknown Host → 404, 127.0.0.1 → 404 | skip (실제 host 에서는 의미가 없다. recon-runtime 의 unknown host 404 는 route 를 붙인 직후 pointer 가 없던 상태에서 실제로 확인했다: [04](04-exact-route.md)) |

## e2e FAIL 16건 분류

| 건수 | 검사 | 원인 |
|---|---|---|
| 1 | package 파일 바이트 / ETag 동일성 | HTML 13개: edge beacon 삽입과 ETag 제거. 비 HTML 141개는 동일 |
| 1 | HEAD Content-Length | HTML: edge 가 본문을 바꾸면서 Content-Length 를 지운다 |
| 14 | 390 / 1440 × 7 route, `0 external` | 외부 요청 = `static.cloudflareinsights.com/beacon.min.js` |

세 가지 모두 zone 수준 Cloudflare Web Analytics 자동 삽입 때문이다. web-recon package 와 Worker 의 결함이 아니고, assertion 은 약하게 고치지 않았다.

```
LIVE_DESKTOP        = PASS (1440: 200, overflow 0, broken 0, nav/gallery/contact ok)
LIVE_MOBILE         = PASS (390: 200, overflow 0, broken 0, mobile menu/gallery/contact ok)
LIVE_CONSOLE_ERRORS = 0
LIVE_BROKEN_IMAGES  = 0
EXTERNAL_REQUESTS   = 1 (static.cloudflareinsights.com, zone-level Web Analytics. e2e strict check FAIL)
E2E_LIVE            = 25 passed / 16 failed / 5 skipped (16 failed 모두 같은 edge 원인)
```
