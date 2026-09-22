# IA 마무리 (1.5.0) — validation (2026-09-21)

## 작업 흐름

1. pre-change capture (`proof/before.json`)
   - 1.4.0 / 1.4.1 / 1.4.2 release 파일 hash
   - demo site 62개 파일
   - site.json / slots.json
   - current / previous pointer
   - `platform/` (test 제외) hash
2. scratch devroot에서 첫 후보 `6182a7c4cc68`를 만들었습니다. 이 후보로 test와 smoke를 돌린 결과를 보고 test를 일반화했고, about 사진 비율을 조정했습니다. 첫 후보는 devroot와 함께 폐기했고 repo에는 존재한 적이 없습니다.
3. fresh devroot2에서 두 번째 후보 `75f173939e77`로 전체 cycle을 돌렸습니다: cut, fixtures, 4개 site build, test 10종, smoke 5종. 모두 green입니다.
4. **repo root에서 한 번만 cut**했습니다. release id, 네 buildInputId, 네 packageHash가 devroot2와 동일합니다. demo는 root에서 한 번만 build했습니다.

아래 수치는 모두 **repo root** 기준입니다. 로그는 `proof/logs/`에 있습니다.

| 단계 | 결과 |
| --- | --- |
| `template:release interior-01@1` | `interior-01-1.5.0-75f173939e77` created, 62 files, release gate 통과 |
| `fixtures:generate --release …` + 3 × `site:build` | large `571f0f32`, small `e2052ae2`, empty `b3da982d`: 모두 built, QA pass, 경고 0 |
| demo re-pin + `site:build` 1회 | `6c74d34c…`, packageHash `c28ad013…`, 15 HTML, 경고 0, previous = 1.4.2 package `fb723e09…` |
| `tsc -p platform/tsconfig.json` | 오류 0 |
| root `tsc --noEmit` | 오류 0 |
| `test:platform` | **265 / 0** (ia150 15 신규) |
| `template-platform-ia-smoke.ts` (신규) | **114 / 114** |
| `template-platform-predemo2-smoke.ts` | 177 / 177 |
| `template-platform-predemo-gallery-smoke.ts` | 35 / 35 |
| `template-platform-step6-visual-smoke.ts` | 237 / 237 |
| `template-platform-polish-visual-smoke.ts` (fixture 3개, 30 visit) | 962 / 962 |

devroot2에서 predemo2 smoke가 한 번 도중에 끊겼습니다. 오류는 "Target page, context or browser has been closed"이고, 뷰어가 열린 상태에서 wheel을 굴리는 단계에서 났습니다. 같은 코드로 바로 재실행하자 177 / 177이 나왔고 root에서도 177 / 177입니다. Chromium 프로세스 flake로 판단하며 기록만 남깁니다.

## 신규 smoke 114 checks의 내용

- **A. route × 폭**
  - 대상: `/`, `/portfolio`, 상세, `/3d-portfolio`, `/about`, `/contact`를 1440과 390(모바일 context)에서 확인합니다.
  - 공통 확인: 200, broken image 0, horizontal overflow 0, console error 0, 외부 요청 0.
  - header nav: 4개 항목의 순서, href, 라벨, 그리고 `aria-current`가 자기 페이지에만 붙는지 봅니다.
  - 1440: inline nav가 한 줄로 header 안에 있고 hamburger는 숨겨져 있습니다.
  - 390: logo와 hamburger(44×44)만 보입니다.
  - floating CTA: 모든 페이지에서 `/contact`를 가리키고 header와 겹치지 않습니다. `/contact`에서만 숨겨집니다.
- **B. 경계 폭**: 900에서는 inline nav가 한 줄로 viewport 안에 들어갑니다. 899에서는 hamburger로 바뀝니다.
- **C. hamburger (390)**
  - 서버 HTML에 menu markup이 없습니다. load 시 닫혀 있습니다 (`aria-expanded=false`, `aria-controls` 없음).
  - 열기: modal이 열리고, `aria-expanded=true`, `aria-controls`가 dialog id와 일치하며, label은 "메뉴"입니다. focus는 닫기 버튼으로 갑니다. 항목 4개가 순서대로 있고 버튼 이름("메뉴 열기", "메뉴 닫기")도 맞습니다.
  - scroll lock: `html` overflow가 hidden이고 scrollY가 유지되며, wheel을 굴려도 움직이지 않습니다.
  - floating CTA: 메뉴가 열려 있는 동안 숨겨집니다. 메뉴의 견적 문의 항목은 hit-test에서 최상단입니다. sheet는 viewport 오른쪽 끝에 전체 높이로 붙습니다.
  - Tab을 8번 눌러도 focus가 페이지 뒤쪽으로 나가지 않습니다.
  - 닫기
    - **ESC**: dialog가 제거되고 focus가 hamburger로 돌아옵니다. lock이 풀리고 scroll이 유지되며 seat가 다시 보입니다.
    - **닫기 버튼**: 같은 결과입니다.
    - **backdrop 탭**: 닫힙니다. sheet 안의 빈 곳을 탭하면 닫히지 않습니다.
    - **키보드**: Enter로 열고 Esc로 닫힙니다.
  - 메뉴 링크: 소개, 3D, 견적 문의, 포트폴리오 4개를 차례로 누르면 매번 client navigation이 일어납니다. 새 페이지의 h1이 맞고, 메뉴는 닫혀 있고, lock은 풀려 있고, 새 페이지에 `aria-current`가 붙습니다.
  - 메뉴를 연 채 1000 px로 resize하면 자동으로 닫히고 inline nav를 클릭할 수 있습니다.
- **D. /contact (390, 1440)**
  - 필드 7개가 label과 연결돼 있고 required는 name, phone, message입니다. 공사 유형 option 6개가 있습니다. 안내문과 직접 이메일이 표시되고 성공 문구는 없습니다.
  - 빈 submit은 차단됩니다: `:invalid`는 name, phone, message이고 hand-off 0건, status는 비어 있습니다.
  - 입력 후 submit하면 mailto hand-off가 정확히 1건 생깁니다. 주소가 맞고, 제목은 "[견적 문의] 홍길동님"이며, 본문은 CRLF로 구분된 라벨 줄이 순서대로 들어갑니다.
  - submit 후 status 문구가 정확히 일치하고 성공 claim은 없습니다. submit 중 네트워크 요청 0건, console error 0건이고 여전히 `/contact`에 머뭅니다. submit 버튼은 다른 요소에 가려지지 않습니다.
  - negative control (fixture-empty, email 없음): form이 없고 중립 문구만 나옵니다. mailto, `/contact` 링크, seat 모두 0입니다.
- **E. CTA 연결**
  - 상세 CTA가 `/contact`를 가리킵니다.
  - header pill을 누르면 `/contact`로 이동합니다.
  - 390에서 floating seat를 누르면 client navigation으로 `/contact`에 가고, seat는 그 페이지에서 숨겨집니다. 뒤로가기로 `/about`에 돌아오면 seat가 다시 보입니다.

스크린샷은 `screens/`에 있습니다: route × 폭별 fold 화면, 새 페이지 full, `menu-open-390.png`, `header-900.png`, `contact-submitted-{390,1440}.png`.

## ia150.test.ts (15)

S1 route 계약 · S2 모든 1.4.2 slots 문서가 여전히 resolve · R1 1.4.x release 불변 + 버전별 dir 1개 · R2 pin/build record/rollback = 1.4.2 package · R3 `platform/` (test 제외) byte 동일 · D1 demo 파일 중 site.json(pin)과 slots.json(선언된 copy)만 변경 · D2 51 raster · P1 page set = 1.4.2 + 3, route plan, sitemap, canonical · P2 15개 페이지 header 전부 · P3 CTA → /contact 전부, mailto는 footer와 /contact 직접 주소만 · P4 /about · P5 /3d-portfolio · P6 /contact form · F1 fixture(중립 문구, no-email 사이트) · C1 stylesheet 규칙

## 일반화 (assertion은 약화하지 않았습니다)

원칙은 다음과 같습니다.
- 1.5.0이 선언한 변경만 `canonical-150.ts`로 **양쪽에서 똑같이** 제거합니다: 새 page 3개(HTML, sitemap entry, route count)와 상세 CTA href. 나머지는 여전히 byte 비교합니다.
- 제거한 부분은 ia150이 정확한 모양으로 따로 assert합니다.
- 버전별로 기대값이 달라지는 부분은 build record의 templateVersion ≥ 1.5.0 여부로 gate합니다.

| 파일 | 변경 |
| --- | --- |
| `slice1` 링크 검사 | 허용 route에 `/3d-portfolio`, `/about`, `/contact` 추가. 실제 page 존재 검사는 그대로 유지. |
| `step4` zero-items | "home만 남는다" → "정적 route(home + 1.5.0 page)만 남는다". prune 목록은 그대로 exact. |
| `step4` G/H, T | 새 page 3개를 빼고 180+2 유지. sitemap 기대값에 ≥1.5.0이면 새 3개 path 추가(독립 계산). |
| `step41` A / V / W, `step5` AD / AE | `withoutIaPages`, `canonical150Main`(CTA `/contact` ↔ 원래 mailto), `canonical150Sitemap`, `canonical150Routes` 적용. |
| `step5` E / R | ≥1.5.0이면 seat href = `/contact` (next/link 속성 순서 반영). |
| `step6` Z / O / S / X | `ia` gate. Z: header href가 정확히 5개이고 각각 실제 page가 있어야 함. O: 15 pages, seat → `/contact`. S: contact 슬라이드 → `/contact`. X: sitemap +3. CTA regex는 두 속성 순서를 모두 허용. |
| `predemo` D1 | 1.4.2 pin까지의 point-in-time 증명입니다. 1.5.0부터는 demo copy를 바꿨으므로 return하고, 동등한 증명은 ia150 D1이 이번 pre-cut capture와 비교해 수행합니다. (predemo2 D1도 이미 pin == 1.4.2일 때만 gate돼 있습니다.) |
| `step6-visual-smoke` | seat 목적지: ≥1.5.0이면 `/contact`, 이전이면 `mailto:`. |
| `polish-visual-smoke` | 위와 같은 seat 목적지 규칙. control reachability의 "실제로 검사했다" 하한은 < 900이고 ≥1.5.0일 때만 6 → 5로 낮췄습니다. 이유: 404 m390에서 header nav 링크 2개가 menu 버튼 1개로 합쳐졌고, 메뉴 항목은 열렸을 때만 존재합니다. blocked == 0 조건은 그대로입니다. |

## 변하지 않은 것

- `interior-01-1.4.0/1.4.1/1.4.2` release: verify 통과, pre-cut capture와 byte 동일.
- `platform/` (test 제외): byte 동일.
- demo site: 62개 파일 중 site.json과 slots.json만 변경. raster 51 / 51을 byte 그대로 제공.
- fixture 3개의 기존 non-home 페이지 `<main>`: 1.4.2 package와 byte 동일. 단 선언된 CTA href 차이는 canonical로 되돌린 뒤 비교했습니다.
- demo의 `<main>`은 선언된 copy 변경 때문에 byte 비교 대상이 아닙니다. 해당 변경은 목록 제목 "포트폴리오", 뒤로가기 "포트폴리오 목록으로", intro 링크 "포트폴리오 둘러보기"입니다. 대신 ia150 D1이 data diff를 exact하게 검사하고, step6/predemo2 smoke가 동작을 확인합니다.
