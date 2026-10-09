# interior-03 — 05. BoostChat과 도메인

작성일 2026-10-09. 시각은 모두 UTC.

## 요약

```
PUBLIC_URL        = https://interior-demo-3.boostweb.co.kr
DNS               = 변경 없음 (zone의 기존 proxied wildcard "*.boostweb.co.kr"가 이 host를 받음)
TLS               = PASS (TLS 1.3 · CN=boostweb.co.kr · Google Trust Services WE1 · 2026-12-10까지)
HTTP              = PASS (7 page 200 · 없는 주소 404 · 기존 두 host 200 유지. http → https redirect 없음은 zone의 기존 설정 — `08` MAJOR 2)
PUBLISH           = PASS (package d5a7904fe368… · 168 files · Worker recon-runtime-pilot · bucket boost-sites-artifacts)
                    publish 2회: 첫 package 9394a9da717e…(10:50) → release를 다시 만든 뒤 d5a7904fe368…(11:40)로 교체

DEDICATED_TENANT  = YES (boost-interior-demo-03)
DEDICATED_WIDGET  = YES (wgt_2B09bTToSXnSi8tl2o9yuUCFlyOnoKXP)
ALLOWED_ORIGIN    = https://interior-demo-3.boostweb.co.kr
FIRST_PARTY_ORIGIN = https://interior-demo-3.boostweb.co.kr
CHAT              = PASS
PORTFOLIO_RECOMMENDATION = PASS
PORTFOLIO_CARD_DOMAIN    = https://interior-demo-3.boostweb.co.kr (카드 15장 중 15장)
INQUIRY           = PARTIAL — 검증과 전송 형식은 PASS, 실제 접수는 server가 403으로 거절 (§5, owner 조치 1건)
CROSS_TENANT_LEAK = 0
```

## 1. Publish

기존 방식 그대로다(Cloudflare Worker `recon-runtime-pilot` + R2 `boost-sites-artifacts` + host pointer). 새 배포 구조는 만들지 않았다.
publish 전 조건: 전체 test PASS(`06-browser-regression.md`), release 검증 PASS, package QA PASS.

| 시각 | 단계 | 결과 |
|---|---|---|
| 10:29 · 10:33 | dry-run (offline, 그리고 store를 읽기만 하는 것) | seal 없음 → 168개 올릴 예정, host는 아무것도 서비스하지 않음 |
| 10:46:40 → 10:48:43 | upload + 검증 + seal (`--remote --no-activate`) | 168/168 upload, sha256 · 크기 검증 168/168, 123 s |
| 10:48:48 → 10:49:37 | 재검증 (`--reverify`) | seal 동일, upload 0, 168/168 재검증 |
| 10:49:43 → 10:49:49 | `wrangler deploy --env pilot` | route 3개(기존 2 + 신규 1), version `c79394be-…`, 6 s |
| 10:49:56 | 활성화 전 확인 | interior-demo 200 · interior-demo-2 200 · interior-demo-3 404 |
| 10:50:00 → 10:50:11 | pointer 기록 (`--expect-package 9394a9da… --expect-live none`) | `routing/interior-demo-3.boostweb.co.kr.json` 기록 |
| 10:50:11 | 첫 200 | `/` 200 |
| | **다시 publish** — 최종 리뷰의 MAJOR 1 때문에 release를 다시 만들었고(`08`), package hash가 바뀌어 다시 올렸다 | |
| 11:37 직전 | dry-run (store 읽기만) | 새 package의 seal 없음 → 168개 올릴 예정, host는 `9394a9da…`를 서비스 중 |
| 11:37:07 → 11:39:15 | upload + 검증 + seal (`--no-activate`) | 168/168 upload, sha256 · 크기 검증 168/168, 128 s |
| 11:39–11:40 | 재검증 (`--reverify`) | seal 동일, upload 0, 168/168 재검증 |
| 11:40:24 → 11:40:35 | pointer 교체 (`--expect-package d5a7904f… --expect-live 9394a9da…`) | pointer가 `d5a7904f…`를 가리킴, previous = `9394a9da…` |
| 11:40:36 | 확인 | live의 8개 주소가 새 package와 sha256 일치 · 7 page 200 · 없는 주소 404 · 기존 두 host 200 |

다시 publish할 때 Worker는 다시 배포하지 않았다(route가 그대로). BoostChat feed의 version(`968afbcc…`)도 같아서 tenant 쪽은 다시 갱신할 필요가 없었다.
두 package는 build id · release id를 빼면 `build-record.json`만 다르다(`proof/recut-package-equivalence.txt`). 첫 package의 object는 R2에 남아 있고 지금은 서비스되지 않는다.

`workers/recon-runtime/wrangler.jsonc`에는 route 한 줄만 더했다. `wrangler deploy`는 route 목록 전체를 바꾸므로 기존 두 host를 그대로 두고 세 번째를 추가했다.

**DNS**: record를 만들지 않았다. wrangler의 token으로는 DNS record 목록을 읽을 수 없어(권한 오류 10000) 충돌 여부는 다음으로 확인했다:
publish 전 `interior-demo-3`은 이미 Cloudflare 주소로 풀렸고(wildcard), 그 host의 요청은 zone의 `*.boostweb.co.kr/*` route를 타고 다른 Worker의 404를 받고 있었다.
exact route가 wildcard보다 우선하므로 배포 뒤에는 이 Worker가 받는다. 기존 route 5개는 그대로다(`proof/demo03-publish/00c-routes-before.txt`, `07-routes-after.txt`).

**HTTP 확인** (`proof/demo03-publish/06-http-checks.txt`, 다시 publish한 뒤 `14-recut-http-checks.txt`)

| 주소 | 결과 |
|---|---|
| `/` · `/portfolio` · `/portfolio/<slug>` · `/service` · `/about` · `/faq` · `/contact` | 200 `text/html` |
| `/robots.txt` · `/sitemap.xml` · `/_integration/manifest.json` | 200, 주소는 모두 `interior-demo-3` |
| `/portfolio/page/2` · `/no-such-page` | 404 (project 8건이라 2쪽이 없음) |
| HTML `cache-control` | `public, max-age=0, must-revalidate` · `x-content-type-options: nosniff` |
| `/_next/static/*` · `/assets/*` | `public, max-age=31536000, immutable` |
| `http://` | redirect 없이 200 (`interior-demo-2`도 같음. zone 설정) |
| `interior-demo` · `interior-demo-2` | 200 |

zone이 browser에 내려보내는 HTML에 Cloudflare Web Analytics beacon(`static.cloudflareinsights.com`)을 자동으로 넣는다. package에는 없고
기존 host들도 같다(`docs/result/cloudflare-live-pilot/00-summary.md`). 첫 E2E에서는 "외부 origin 없음" 검사 11건이 이 때문에 FAIL로 찍혔고, 최종 실행에서는 이 origin 하나를 허용 목록에 넣었다(§4).

**Rollback**: `wrangler r2 object delete boost-sites-artifacts/routing/interior-demo-3.boostweb.co.kr.json --remote`(host가 다시 404),
또는 `wrangler.jsonc`에서 route 한 줄을 빼고 다시 deploy. package object는 지우지 않는다.
앞 package로 되돌리는 것은 내용이 같아서 의미가 없다.

## 2. BoostChat tenant

BoostChat에는 code · migration · 배포 변경이 없다. 제품의 기존 service 함수와 운영 script만 썼다
(`scripts/tenant-bootstrap.ts`, `scripts/prod-run.mjs`, `scripts/ops-first-party-refresh.ts`). boost-chat repo의 `git status`는 깨끗하다.
모든 쓰기는 dry-run을 먼저 했고, database의 system identifier를 확인한 뒤 target tenant로 범위를 묶어 실행했다. log: `proof/boostchat/`(e-mail은 가림).

| 시각 | 단계 | 결과 |
|---|---|---|
| 09:35:50 | tenant 생성 | `boost-interior-demo-03`, owner = 운영자 계정(기존 demo tenant의 owner와 같음) |
| 09:36 | tenant 설정 | plan master · action pilot on · `portfolio.search` on · business facts · AI 설정 · 공개 profile(handle `boost-interior-3`) · widget channel(key 발급, 허용 origin 1개, enabled) |
| 09:37–09:38 | FAQ 7건 복사 | embedding 7회(1,143 token) |
| 10:51:13 | binding | `portfolio.search` first-party binding 생성 → enabled, origin = `https://interior-demo-3.boostweb.co.kr` |
| 10:51:45 → 10:51:58 | feed 갱신 | manifest 200 · document 200 → 8건 수락, 0건 탈락, media 8건, snapshot state ON, version `968afbcc…` |

적용 뒤 읽기 전용 확인(`proof/boostchat/10-verify-after-binding.txt`):

- widget: key `wgt_2B09bTToSXnSi8tl2o9yuUCFlyOnoKXP`, enabled, 허용 origin `{https://interior-demo-3.boostweb.co.kr}` 하나뿐
- integration: `first_party_static`, enabled, base URL `https://interior-demo-3.boostweb.co.kr`
- snapshot: state ON, public origin `https://interior-demo-3.boostweb.co.kr`, site id `boost-interior-demo-03`
- 기존 tenant `boost-interior-demo`: tenant · widget · integration · snapshot · plan · capability · version · launcher 행이 적용 전 dump와 한 글자도 다르지 않음.
  각 적용 단계의 자체 검사도 "template tenant 변경 없음", "target 밖 audit 행 0"이었다
- Demo 01 key `wgt_99kY…`와 Demo 02 key `wgt_xVMp…`는 Demo 03의 site data · package · 실제 HTML 어디에도 없다(test U, E2E의 `html-no-old-key`)

site 쪽 연결은 site data에만 있다: `data/sites/boost-interior-demo-03/scripts.json`(widget script와 key), `inquiry.json`(문의 endpoint), `integration.json`(feed 공개).
template과 release에는 key · BoostChat host · tenant id가 없다(test U).

launcher 모양은 제품 기본값(파란 원 + "상담")이다. tenant의 launcher 설정은 만들지 않았다.

## 3. 실제 도메인 E2E

`proof/demo03-live/final/`이 최종 package(`d5a7904f…`)에서의 결과이고, `proof/demo03-live/` 바로 아래는 첫 package에서의 결과다(기록으로 둠).
script: `proof/scripts/live-e2e-i03.mjs.txt`, `cards-probe-i03.mjs.txt`. interior-02의 live script를 selector만 바꿔 썼다.
문의 POST는 browser 안에서 가로채 가짜 응답을 줬다(server에 도달한 실제 lead 0건). 속도는 65초에 page 3개 이하로 지켰다.

| 구간 | package | 시각 | page load | chat | 결과 |
|---|---|---|---|---|---|
| (a) site · widget · chat · inquiry · mobile | 첫 | 10:52:57 → 11:00:04 | 20 | 2 | pass 137 · fail 12 · blocked 2 · skip 1 |
| (b) card probe | 첫 | 11:00:48 → 11:01:06 | 1 | 1 | 카드 5장 모두 통과 |
| (c) card probe + screenshot | 첫 | 11:02:38 → 11:03:00 | 1 | 1 | 카드 5장 모두 통과 |
| **(d) (a)와 같은 전체 실행** | **최종** | 11:41:28 → 11:48:34 | 20 | 2 | **pass 148 · fail 1 · blocked 2 · skip 1** |
| **(e) card probe + screenshot** | **최종** | 11:49:42 → 11:50:03 | 1 | 1 | 카드 5장 모두 통과 |

합계: page load 43 · chat message 7 · 실제 lead 0. 아래 값은 (d) · (e)의 것이고, (a)의 값이 다르면 같이 적었다.

**SITE** — home, portfolio, detail, service, about, faq, contact: 200, TLS, 이미지 깨짐 0, console error 0, 실패 요청 0, canonical · og · sitemap · manifest가 모두 자기 origin,
HTML에 Demo 03 key 있음 · 옛 key 2개와 옛 origin 2개 없음. nav click으로 이동, 없는 주소는 404 markup. site와 BoostChat 말고 요청된 origin은 zone의 beacon 하나다.

**BOOSTCHAT**

| 항목 | 결과 |
|---|---|
| launcher 보임 | 1440 · 1280 · 768 · iPhone 13(WebKit) 모두 |
| 위치 | desktop · tablet: 64×64, 오른쪽 18 · 아래 18. mobile: 60×60, 오른쪽 12 · 아래 12 |
| 열림 | desktop · tablet: 372×560 panel이 viewport 안. mobile: 전체 화면 390×664 |
| 닫힘 | 네 viewport 모두 launcher 크기로 돌아옴 |
| bootstrap | `POST /api/widget/<key>/bootstrap` 200, 환영 message 1개, header에 "부스트 인테리어" |
| 기본 chat | "30평대 아파트 리모델링 상담 가능한가요?" → 첫 글자 4.0 s, 완료 4.6 s((a) 3.7 · 4.3 s). 답이 brand와 공사 범위를 말함 |
| portfolio 추천 | "화이트 톤 30평대 아파트 시공 사례를 보여주세요" → 카드 (d) 3장, (e) 5장((a) 3장, (b) · (c) 5장씩). 첫 카드까지 2.5 s((a) 1.9 s) |
| 카드의 주소 | (b) · (c) · (e)에서 카드 15장의 viewer가 받은 project URL이 모두 `https://interior-demo-3.boostweb.co.kr/portfolio/<slug>`. 옛 origin 0 |
| 카드 → page | 카드 → viewer → 같은 tab에서 `…/portfolio/suseong-white-34py-apartment-remodeling` 200, 제목 일치 |
| BoostChat 4xx · 5xx · CORS 거절 | chat 중 0 |

**MOBILE** (iPhone 13, WebKit) — load 직후 가로 넘침 0(390 = 390), launcher 보임, 하단 고정 bar 없음(이 template에 없음),
to-top은 맨 위에서 숨고 중간에서 보이며 launcher와 겹치지 않음(to-top y 526–570, launcher y 592–652), hamburger → drawer 열림 · 닫힘 · link 이동, chat은 전체 화면.
desktop 1440에서도 to-top(y 762–806)과 launcher(y 818–882)는 겹치지 않는다.
page 맨 아래에서는 414 px 이하에서 to-top이 footer 저작권 줄의 끝을 조금 가린다(local에서 재현, `08` MINOR 1).

**CONTACT** — 빈 제출은 4개 오류로 막힘, 잘못된 전화는 전화 오류만, 올바른 입력은 POST 정확히 1회,
주소 `https://boostchat.co.kr/api/widget/wgt_2B09…/lead`, body는 `consent, hp, message, name, phone, submission_id` 6개, 가짜 응답에 성공 화면.

## 4. FAIL과 BLOCK

| 실행 | 건수 | 검사 | 원인 | 판단 |
|---|---|---|---|---|
| (a) | 11 | `only-site-and-chat-origins` 7 · `no-foreign-origins` 4 | zone이 넣는 Cloudflare beacon 한 origin | 이 작업 밖. Demo 01 · 02의 live 결과에도 같은 FAIL이 있다. (d)에서는 이 origin 하나만 허용했고 11건 모두 통과, 다른 외부 origin 0 |
| (a) · (d) | 1 | `chat:card-hrefs-on-origin` (`hrefs: []`) | 카드는 `<a href>`가 아니라 viewer를 여는 button이라 읽을 href가 없다 | 검사 방식의 한계. 같은 것을 card probe가 viewer의 URL로 확인했고 통과(15/15). Demo 02의 결과에도 같은 FAIL |
| (a) · (d) | 2 (BLOCK) | lead endpoint의 preflight · `consent:false` probe | server가 이 key의 site lead를 허용하지 않음(403, CORS header 없음) | §5 |

script의 종료 판정은 FAIL이 하나라도 있으면 FAIL이라 (d)도 `RESULT: FAIL`로 끝난다. 남은 FAIL 1건은 위의 검사 한계이고, 이 세 종류 말고 실패는 없다.

## 5. 문의 접수 — owner 조치가 필요한 1건

BoostChat의 site lead 경로는 Railway 환경 변수 `WIDGET_SITE_LEAD_KEYS`에 있는 key만 받는다. 지금 그 목록에는 Demo 01의 key만 있다.
그래서 **지금 공개 site의 문의 form을 실제로 제출하면 접수되지 않는다.** 방문자는 "문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."와
함께 FAQ link · e-mail 주소를 보고, 입력한 내용은 그대로 남는다(local에서 403을 흉내 내 확인: `proof/demo03-live/contact-refused-1440.jpg`, `-390.jpg`). Demo 02도 같은 상태다.

이 값을 바꾸면 BoostChat production app이 재시작되고, 그 배포는 이 작업의 범위가 아니라서 건드리지 않았다.

- 필요한 조치: Railway `app` service의 `WIDGET_SITE_LEAD_KEYS`에 `wgt_2B09bTToSXnSi8tl2o9yuUCFlyOnoKXP` 추가
- 그 뒤 확인: `proof/scripts/live-e2e-i03.mjs.txt`의 `--phases inquiry --probes all`(쓰기 없음)이 BLOCK 없이 통과하는지
- server log로도 확인했다: Demo 03 key의 lead 요청 4건(preflight 2 · POST 2)이 모두 403이고, tenant의 `lead_request` 행은 0이다(`proof/accounting/`)
- 실제 lead 1건 시험은 하지 않았다(`TEST_LEAD_COUNT = 0`). 접수되면 tenant owner에게 실제 mail이 가므로 owner가 정할 일이다

chat 안의 "상담 요청 남기기" form은 다른 경로이고 이번에 제출하지 않았다.

## 6. 성능

각 값은 한 번씩 잰 것이고, 전체 실행을 두 번 했으므로 (a) · (d) 두 값을 같이 적는다. 평균이나 분포가 아니다.

| 항목 | (a) 첫 publish 직후 | (d) 다시 publish한 뒤 | 측정 |
|---|---|---|---|
| DNS_TO_READY | 해당 없음 | 해당 없음 | DNS를 바꾸지 않음. Worker 배포 끝(10:49:49) → 첫 200(10:50:11) 22 s, 그중 pointer 기록이 11 s |
| DEPLOY_TIME | 211 s | 209 s | upload 시작 → live 확인. (a) 10:46:40 → 10:50:11: upload · 검증 123 s, 재검증 49 s, Worker 6 s, pointer 11 s. (d) 11:37:07 → 11:40:36: upload · 검증 128 s, 재검증, pointer 11 s |
| FIRST_PAGE_LOAD | 8.16 s | 2.46 s | 첫 browser 방문의 load event(desktop 1440, cache 없음). network가 조용해질 때까지는 12.7 s · 8.2 s |
| WIDGET_SCRIPT_LOAD | 1.99 s | 1.21 s | 이동 → `widget.js` 응답 끝(1440). 다른 viewport: (a) 1.26–1.51 s, (d) 2.17–7.58 s |
| LAUNCHER_READY | 2.70 s | 2.05 s | 이동 → launcher 보임(1440). (a) 1280: 2.46 · 768: 4.86 · iPhone 13: 2.57 s. (d) 1280: 11.09 · 768: 7.20 · iPhone 13: 4.29 s |
| CHAT_FIRST_RESPONSE | 3.66 s | 3.96 s | 전송 → 첫 글자. 완료 4.27 s · 4.57 s |
| PORTFOLIO_CARD_READY | 1.86 s | 2.46 s | 전송 → 첫 카드 |
| LEAD_RESPONSE | 해당 없음 | 해당 없음 | 실제 접수 없음. 가짜 응답까지 0.86 s, server의 403까지 0.26–0.27 s |
| HTML 응답 | 0.87 s | – | `curl` 3회, 그중 TLS 연결까지 0.27 s |

측정값의 흔들림이 크다. (d)의 1280 · 768 방문은 page의 load event 자체가 11.1 s · 7.2 s 걸렸고 launcher는 그 직후에 떴다(widget이 느린 것이 아니라 page load가 느렸다).
(a)의 첫 방문 8.16 s도 같은 종류로 보이지만 원인을 나눠 측정하지는 않았다. 이 home은 2400 px hero 사진 3장을 포함해 이미지 16장을 받는다.
