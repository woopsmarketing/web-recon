# interior-03 — 06. Browser 검증과 회귀

작성일 2026-10-09. 시각은 UTC.

## 요약

```
TYPECHECK              = PASS (root · platform · runtime)
PLATFORM_TESTS         = PASS (17 suite, 실패 0)
INTERIOR03_TESTS       = PASS (24 check, scanner self-test 실패 0)
PACKAGE_QA             = PASS (fixture · Demo 03)
BROWSER_SWEEP          = PASS (7폭 × 10 route × 2 site = 140 load, 문제 0)
REAL_DOMAIN_E2E        = PASS — 예외 2종 기록 (검사 한계 1건, 문의 접수 403. `05-boostchat-and-domain.md` §4 · §5)
INTERIOR_01            = PASS
INTERIOR_02            = PASS
ONGYEOL                = PASS
BOOSTINTERIOR_DEMO02   = PASS
LIKELY_GENERIC_PLATFORM_CHANGE = NONE
```

## 1. Test 전체 실행

정식 트리에서 순서대로 실행했다(`proof/regression-summary.tsv`, 실행 script `proof/scripts/regression-run.sh.txt`). 모든 suite가 exit 0이다.
아래 표는 첫 release(`…-f353e5954217`) 때의 전체 실행이다. 최종 리뷰 뒤 release를 다시 만들고(`…-2a949e9f0247`, `08`)
typecheck 3종 · `test:platform` chain 17개 · chain 밖 8개를 최종 트리에서 모두 다시 돌렸다. 전부 exit 0이고 통과 수가 표와 같다(`proof/regression-summary-after-recut.tsv`).

| suite | 결과 | 시간 |
|---|---|---|
| tsc root / platform / runtime | 오류 0 | 5 · 4 · 0 s |
| slice1 | 86 passed | 61 s |
| step4 | 47 passed | 29 s |
| step41 | 35 passed | 25 s |
| step5 | 32 passed | 43 s |
| polish | 4 passed | 0 s |
| step52 | 12 passed | 35 s |
| step6 | 34 passed | 26 s |
| predemo · predemo2 | 10 · 9 passed | 1 · 1 s |
| ia150 · ia151 · ia152 | 15 · 10 · 14 passed | 0 · 1 · 9 s |
| integration | 85 passed, 1 point-in-time | 60 s |
| detail-facts | 26 passed | 9 s |
| preview-parity | 13 passed | 11 s |
| interior-02 | 18 passed | 1 s |
| **interior-03** | **24 passed** | 2 s |
| inquiry162 · inquiry163 · inquiry163-reuse | 28 · 29 · 8 passed | 0 · 1 · 1 s |
| inquiry163-browser | 62 passed | 66 s |
| portfolio-production-truth | 12 passed | 9 s |
| portfolio-sync | 40 passed (선택 항목인 `--e2e` block은 실행 안 함) | 17 s |
| publish | 67 passed | 14 s |
| publish-e2e | 47 passed, 1 skipped | 213 s |

위에서 slice1부터 interior-03까지 17개가 `test:platform` chain이고, 아래 8개는 chain 밖의 local suite다.

`platform/test/interior-03.test.ts`가 고정하는 것: release가 template source와 같음, 두 site가 같은 release를 pin, template에 색 literal 없음,
Demo 03의 theme가 기본값 · Demo 02와 다름, widget key가 Demo 01 · 02와 다르고 template · release에 없음, 금지어 · 상대 brand 없음,
package의 내부 link가 모두 있는 page로 감, floating UI 자리가 site 설정에서만 옴. `I03_SELFTEST=1`로 scanner에 위반을 심어 넣으면 전부 잡힌다(실패 0).

**공유 file 수정** (다른 세션과 겹치는 file이라 최소한만):

| file | 바뀐 것 | assertion |
|---|---|---|
| `platform/test/slice1.test.ts` | authored template 목록 2개 → 3개 | 강화(목록이 정확히 일치해야 함) |
| `platform/test/step6.test.ts` | site 목록과 pin 확인에 두 site 추가 | 강화 |
| `platform/test/interior-02.test.ts` | "다른 site들의 template" 기대값에 `interior-03` 추가 | 같은 검사, 기대값만 갱신 |
| `package.json` | `test:platform` chain 끝에 interior-03 test 추가 | – |

지우거나 약하게 만든 assertion은 없다.

`publish-e2e`는 실행할 때마다 `docs/result/static-deployment-foundation/proof/local-e2e.json`을 다시 쓴다. 이 작업의 산출물이 아니라서 두 번 모두 실행 뒤 HEAD의 내용으로 되돌렸다.

## 2. Demo 03 — local package의 7폭 sweep

`proof/sweep-demo03.json` — 최종 package에서 다시 실행한 결과다(첫 package의 결과와 같음). BoostChat host는 모든 요청을 막았다(widget script 70회 차단, 실제 호출 0).

| 항목 | 결과 |
|---|---|
| 폭 × route | 320 · 390 · 768 · 1024 · 1280 · 1440 · 1920 × 10 |
| page load | 70 (200 = 56, 404 = 14 — `/portfolio/page/2`와 없는 주소는 404가 맞음) |
| 가로 넘침 | 0 px (load 직후, 70/70) |
| 깨진 이미지 | 0 / 462 |
| page error · 실패한 요청 | 0 · 0 |
| console error | 404 page의 "404 (Not Found)" 14건뿐 |
| site 밖 요청 | 차단된 widget script 하나 |
| 내부 link | 18개 모두 200 |
| `<h1>` | 모든 page에 1개 |
| 금지어 · fixture brand | 0 hit |

fixture의 sweep은 `03-reference-fixture-and-fidelity.md` §4.

## 3. Demo 03 — interaction (local, 1440 · 390)

`proof/interaction-i03.json`. 두 site 합계 128 check: 124 pass · 4 해당 없음(둘 다 fixture의 pager 관련) · 0 fail.

| 대상 | Demo 03에서 확인한 것 |
|---|---|
| nav · drawer | 모든 page 이동, drawer의 focus 가두기 · Escape · link로 닫힘 |
| hero | 자동 전환, 정지 · 재개, reduced-motion에서 멈춤 |
| gallery · 목록 | tile 4개가 각 category 목록을 엶, 탭 filter, 제목 검색 6건 / 0건, 뒤로 · 앞으로. pager 없음(8건) |
| detail | `<h1>` 1개, 사진 모두 load, "목록"이 그 category로 |
| FAQ | click · Enter · Space, 주제 탭 |
| contact (online) | hydrate 전 버튼 비활성, 빈 제출 4개 오류, 잘못된 전화, 초기화, 제출 시 POST 1회(6 key, `submission_id` 36자) → 성공 화면. POST는 가짜 응답(실제 lead 0) |
| to-top과 widget 자리 | 맨 위에서 숨고 scroll 뒤 보임. 1440: to-top 1368–1412 × 762–806, 예약 상자 1358–1422 × 818–882. 390: 318–362 × 706–750, 308–372 × 762–826. 겹침 없음 |
| `data-ext-widget` | Demo 03의 모든 page(404 포함)에 있고 fixture에는 없음 |

screenshot: `proof/demo03-local/` 33장(상태 7장 포함).

## 4. 실제 도메인 E2E

`05-boostchat-and-domain.md` §3–§5에 전체 결과가 있다. 전체 실행을 두 번 했다(첫 package, 그리고 다시 publish한 최종 package). 요약:

| | 첫 package (a–c) | 최종 package (d–e) |
|---|---|---|
| page load · chat | 22 · 4 | 21 · 3 |
| pass / fail / blocked / skip | 137 / 12 / 2 / 1 | 148 / 1 / 2 / 1 |
| card probe | 2회, 각 5장 통과 | 1회, 5장 통과 |
| FAIL | zone이 넣는 Cloudflare beacon 11, href가 없는 카드를 href로 읽으려는 검사 1 | 검사 1(같은 것). beacon origin은 허용 목록에 넣음 |
| BLOCK 2 | 문의 접수 경로 403 — owner 조치 필요 | 같음 |
| 실제 lead | 0 | 0 |

합계: page load 43 · chat message 7 · 실제 lead 0.

## 5. 기존 template · site 회귀

이 작업은 platform code를 바꾸지 않았다(`platform/src`, `platform/cli`, `runtime`, Worker source의 `git status`가 비어 있음).
그래서 기존 template · release · site · package는 HEAD와 byte 단위로 같다(`proof/regression-live-and-untouched.txt`).

| 대상 | 근거 | 결과 |
|---|---|---|
| INTERIOR_01 (template · release · `boost-interior-demo`) | file 변경 0 · slice1 – ia152 · integration · inquiry163-reuse · portfolio 두 suite · publish 통과 · live `interior-demo` 5개 주소 정상, HTML이 현재 package와 같은 hash | PASS |
| INTERIOR_02 (template · release) | file 변경 0 · `interior-02.test.ts` 18 passed(release · 두 site의 pin · widget 자리 계약) · step6 34 passed | PASS |
| ONGYEOL (`ongyeol-interior-demo`) | file 변경 0 · interior-02 test와 step6이 이 site의 pin · origin을 확인, 통과 | PASS |
| BOOSTINTERIOR_DEMO02 (`boost-interior-demo-02`) | file 변경 0 · interior-02 test와 step6이 이 site의 pin을 확인, 통과 · live `interior-demo-2` 5개 주소 정상, HTML이 현재 package와 같은 hash | PASS |

Worker를 다시 배포한 뒤(10:49:49) 두 기존 host는 계속 200이었고(10:49:56, 10:50:19, 11:07:41, 다시 publish한 뒤 11:40:44 확인), 없는 주소는 404다.

기존 site를 browser로 다시 훑지는 않았다. 바뀐 file이 없고 서비스되는 byte가 package와 같다는 것으로 판단했다.

## 6. 관찰 (범위 밖, 고치지 않음)

- `templates/interior-02/v1/components/support/InquiryForm.tsx`의 mail mode 제출 버튼은 hydrate 전에도 눌린다(interior-03에서는 독립 리뷰 지적으로 고친 것과 같은 pattern).
  이미 release된 다른 세션의 template이라 건드리지 않았다.
- `publish-e2e` suite가 tracked proof file을 매번 다시 쓴다(§1).
