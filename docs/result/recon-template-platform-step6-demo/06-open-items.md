# 06 — Open Items

Step 6에서 **고치지 않고 기록만 한 것**들이다. Template·Platform은 한 줄도 수정하지 않았다.

> 2026-09-20 마감 실행 갱신: §A 전면 갱신, §C에 O16–O18 추가. §B(L1–L3) · §D · §E는 변동 없음 — L1 `KRW 2,900,000 / 평` 표기는 그대로 렌더되고 있다.

## A. Blocking for `STEP6_STATUS = PASS` (2026-09-20 마감 실행 기준)

| # | 항목 | 상태 | 닫는 방법 |
|---|---|---|---|
| A1 | **승인 이미지 0 / 51.** 2026-09-20 실사: `references/boost-interior/generated-approved/`에 `manifest.json`만 있고 이미지 0, `generated-candidates/`는 README만 있는 빈 staging 폴더, 저장소 어디에도 shotId 이름의 이미지 없음 | `AI_PORTFOLIO_ASSETS = 0 / 51 (WAITING)` — **유일한 실질 blocker** | 이미지를 생성·검수해 `generated-approved/<shotId>.jpg\|png\|webp`로 저장 (정확한 파일명, `.jpeg` 불가, 4:3 seat는 1600×1200 이상) → `03` §5의 명령. 최소 경로: **flagship 13장 + site-level 7장 = 20장**이면 home·flagship detail이 전부 실사진이 된다 |
| A2 | **Flagship same-home consistency** — 판정할 이미지가 없다 | `NOT_READY` | A1 이후 `human-review/index.html`의 same-home 체크리스트로 사람 검수 → PASS / PARTIAL / FAIL 기록 |
| A3 | raster ingestion 분기(sharp centre-crop/resize) | `REAL_APPROVED_RASTER_INGESTION = NOT_YET_RUN` — 실제 승인 이미지로는 아직 미실행. `RASTER_INGESTION_REHEARSAL = PASS` — 격리 scratch devroot에서 합성 테스트 패턴으로 ingest → crop/resize → JPEG → registry → build → package 참조 → 브라우저 렌더 → smoke 237/237 (`03` §0.4, `proof/raster-ingestion-rehearsal.json`). 합성 이미지는 저장소·Site·package에 남아 있지 않다 | 첫 승인 이미지 **1장**(`bi01-living-01`)으로 실제 repo에서 실행해 같은 결과가 나오는지 확인한 뒤 확장 |

→ Step 6 verdict는 **PARTIAL** 그대로다. 남은 것은 코드가 아니라 **입력(이미지)** 이다.

### A-보조. 이미지가 들어올 때 같이 확인할 것 (리허설에서 발견)

| # | 항목 | 비고 |
|---|---|---|
| A4 | Detail gallery 타일은 전부 **1:1 crop** (1440 첫 타일 678×678 · 나머지 337×337, 390에서 390×390) — 4:3 원본의 좌우 12.5%씩이 잘린다. **모바일 hero는 세로 2:3(390×585)** 이라 16:9 원본의 가운데 약 38%만 보인다 | Template 소유 레이아웃. prompt pack은 이미 "피사체와 continuity landmark를 가운데 75% 폭 안에"로 작성됨. 승인 검수 때 **중앙 정사각 기준으로** 볼 것 |
| A5 | Home 대표 프로젝트 카드는 ≈1.53:1 crop — 위아래 약 13%가 잘린다 | 천장 간접조명 라인/바닥이 잘려도 어색하지 않은지 확인 |
| A6 | ingestion은 승인 파일을 **거부하지 않는다** — 작은 이미지는 확대, 세로 이미지는 크게 crop된다 | 이번 실행에서 `WARNING upscaled / heavy-crop / unmatched approved file` 출력을 추가했다 (Step 6 스크립트). 경고가 있으면 build 전에 해결 |
| A7 | 실제 이미지로 build하면 새 package가 생기고 가장 오래된 package(`eca5cb39…`)가 prune된다 | 정상 동작 (current + previous 유지). rollback 대상은 stand-in package `4d3d08f4…`가 된다 |

## B. Template limitations discovered (수정하지 않음)

data-only로 **막힌 요구는 없다.** 아래는 Site 입력으로는 바꿀 수 없어 우회했거나 받아들인 표현이다.

### L1 — 평당 공사비 표기가 Template 소유
1. 하려던 것: `평당 290만 원`
2. 실제: `KRW 2,900,000 / 평` (`templates/interior-01/v1/lib/format.ts` `formatPricePerArea`)
3. 왜 data-only로 안 되는가: 포맷 문자열이 slot이 아니라 코드다. 통화 표기·단위 축약을 Site가 줄 방법이 없다.
4. 우회: 없음. 그대로 둠 (의미는 정확하고 필터·정렬은 정상).
5. Demo 영향: 한국 고객에게 어색하다. **Pre-Demo Gate에서 사람이 판단할 1순위 표현 이슈.**
6. 제안: "BEFORE TEMPLATE 2: slot vs localization review"에 포함 — price/area format을 locale-aware formatter 또는 format slot으로.

### L2 — `area.basis`가 렌더되지 않는다 (독립 아키텍처 리뷰 MAJOR 1)
1. 하려던 것: 면적 fact 옆에 "공급면적" 표시를 **data에서** 파생.
2. 실제: `formatArea({value, unit})`는 `basis`를 읽지 않는다. 라벨은 site-wide slot(`portfolio.detail.areaLabel`) 하나.
3. 왜: 1.4.0에서 basis는 data 계약으로만 추가됐다(Step 5.2). 표시는 미구현.
4. 우회: slot을 `공급면적`으로 두고, **전 프로젝트가 supply임을 Step 6 테스트 H가 강제**한다.
5. 위험: basis가 섞인 사이트는 전용면적을 "공급면적"이라고 **조용히 오표기**한다. invariant가 platform이 아니라 사이트별 테스트에 있다.
6. 제안: 라벨을 basis에서 파생하거나, mixed-basis 사이트를 preflight에서 거부. Template 2 이전에 결정.

### L3 — banners@1 CTA target에 "포트폴리오 목록"이 없다
closed target = `project | contact`. hero에서 목록으로 보내는 CTA 불가 → "대표 프로젝트 보기 → bi-01" + intro link(`/portfolio`) + nav로 대체.
Demo에는 지장 없음. banners@1은 PROVISIONAL이므로 확정 전에 `portfolio` target 추가를 검토할 만하다.

## C. Observations

| # | 관찰 | 비고 |
|---|---|---|
| O4 | Home에 canonical 없음, 전 페이지 OG/Twitter tag 없음 | Template 1.4.0 성질. carry-forward "full SEO QA" |
| O5 | `logo.svg`의 글자는 `<text>` — 뷰어 시스템 폰트로 렌더된다 | 실제 고객 로고는 outline된 SVG/PNG를 받아야 한다 |
| O6 | 웹폰트 미사용 (Pretendard는 설치된 기기에서만) | non-local request 0을 지키기 위한 선택. self-host 폰트 asset 종류는 platform에 아직 없다 (`assets@1` = svg/png/jpeg/webp) |
| O7 | **공개 배포 전 필수:** 가상 후기·가상 프로젝트가 고지 없이 실제 업체처럼 보인다 | 지금은 로컬 package + `.example` 도메인이라 문제없음. 배포한다면 실제 content로 교체하거나 고지 복원 (`02` §10) |
| O8 | K2(reference byte-identity)는 asset이 전부 SVG인 동안은 구조상 통과한다 | SVG 내 embed 금지 assertion을 추가했다. 재인코딩된 복사본은 hash로 못 잡는다 → A1 검수 체크리스트의 "reference와 동일 구도/소품 아님" 항목이 담당 |
| O9 | 증명의 self-reference: `platform/util/hash.ts`, `release/release.ts` 등 11개 파일은 release가 아니라 baseline으로만 anchor된다 | baseline sha256 pin(C0) + mtime(D2) 추가. 근본 해결은 commit |
| O10 | root `package.json`은 증명 범위 밖이고, 세션 시작 때 이미 dirty여서 git diff로 분리 불가 | 이번 변경은 `test:platform` 끝에 step6 테스트 1개 append뿐 |
| O11 | root `tsc --noEmit`에 기존 오류 2건: `scripts/template-platform-polish-visual-smoke.ts:1088,1090` | Step 6 이전(19:30) 파일, 미수정. `typecheck:platform`은 PASS |
| O12 | before/after 쌍은 text-to-image 두 번으로는 시점이 유지되지 않는다 | manifest에 `generationMethod: image-to-image-from-approved-pair` + `pairedWith` 명시 (독립 prompt 리뷰 MAJOR) |
| O14 | 모바일 home carousel(대표 프로젝트 · 다른 시공 사례 · 후기)에서 다음 카드가 16% 폭으로 **잘려 보인다** — 독립 visual 리뷰어가 "overflow 버그처럼 읽힌다"고 BLOCKER로 분류 | Template 의도(`grid-auto-columns: 84%` peek + scroll-snap + progress bar), 모든 site 공통, Step 6에서 수정 불가. 한글 본문은 영문보다 잘린 글자가 더 눈에 띈다 → **Pre-Demo Gate에서 fade/mask affordance 여부 판단** |
| O15 | 모바일 detail의 공간 tab bar는 가로 스크롤인데 cue가 없어 뒤쪽 tab(침실·욕실)을 못 찾을 수 있다 | Template 소유 (`.i1-gallery__tabs { overflow-x: auto }`). 그룹 6개 + 한글 라벨인 flagship에서 두드러진다 (fixture 최대 5 / 4 그룹) |
| O16 | **Floating CTA 간섭 (2026-09-20 재확인):** 390px detail 첫 화면에서 floating "상담 문의"가 facts grid 오른쪽 열(준공 연도 값 근처) 위에 떠 있다. 스크롤하면 가려진 내용은 전부 드러나고, smoke의 `floating-cta-covers-no-footer-text` · `one-fixed-seat`는 17/17 통과 | 버그는 아님 — Template의 site-wide CTA 동작. header에도 "상담 문의" 버튼이 있어 모바일 첫 화면에 **같은 CTA가 2개** 보인다. Pre-Demo Gate에서 사람이 판단 |
| O17 | **모바일 affordance (재확인):** O14(carousel 다음 카드 잘림) · O15(detail 공간 tab bar — 390px에서 5번째 tab이 화면 끝에서 잘린 채 시작, 스크롤 cue 없음)는 재생성된 스크린샷에서도 그대로다 | Template 소유, 미수정. 실사진이 들어오면 O14는 잘린 카드가 사진이라 더 자연스러워질 가능성이 있다 — 이미지 반영 후 다시 볼 것 |
| O18 | human-review 검수 결과(PASS/REVIEW/FAIL, 메모)는 브라우저 `localStorage`에 저장된다 — 파일로 남기려면 페이지의 "JSON 내보내기"를 눌러야 한다 | 정적 HTML이라 서버 저장 없음 |
| O13 | prompt가 길다(500~600 words, 수치 anchor 다수) — 현행 T2I 모델이 전부 지키지는 못한다 | 검수에서 떨어지는 항목은 home bible 문단은 그대로 두고 THIS SHOT 문장만 줄여 재시도 |

## D. Carry forward (프롬프트 §38 — Step 6에서 손대지 않음)

**Pre-Demo Gate:** filtered URL hydration flash · builder pinning/hardening · rollback command/runbook · full SEO QA (O4 포함) ·
cross-browser/real-device QA · source leakage final QA · **L1 가격 표기 판단** · **O14/O15 모바일 carousel·tab affordance** · **A1–A3 이미지**.

**Before Template 2:** slot vs localization review (L1, L2 포함) · banners@1 확정 (L3).

**Navigation:** 실제 메뉴 route가 늘어난 뒤 mobile drawer/hamburger.

## E. 하지 않은 것 (의도적)

BoostChat · Supabase · SEO architecture · 새 schema/필드 · 새 Template release · Template CSS 수정 · legacy `src/**` 수정 · commit/push — 전부 0.
