# 01. 조사 한계 분류 (RULE 1 / Phase E)

조사 대상: `data/apartmentary.com/reconstructions/2026-09-15T07-43-23-840Z` (clone), `site-specs/2026-09-15T05-19-26-498Z` (spec), 라이브 `https://apartmentary.com/`, `/service`.
모드: FORENSIC ONLY. 생산 코드/데이터 무변경. 도구는 `tmp/wr-responsive-forensic-v2/tools/`, 증거는 `tmp/wr-responsive-forensic-v2/evidence/`.

## 1. 정보 접근 등급 (RULE 1, 깊은 추적 전에 확정)

| 등급 | 정의 | 이번 조사에서 해당하는 것 | 획득 방법 |
|---|---|---|---|
| A. 직접 복구 가능 | 아티팩트/코드에 그대로 있음 | authoredLayout 선언(3,152개, 83%가 width-family 외), probe 배열, 토큰 computed 값, 생성 CSS, manifest 카운터, verifier 코드(`layout-truth-check.ts`), plan 코드(`responsive-decl/plan.ts`) | 파일 읽기, nodeinfo.mjs |
| B. 간접 추론 가능 | 아티팩트를 조합하면 결정됨 | 노드별 "왜 미소유인가"(offer/reject 사유는 노드 단위로 저장되지 않음 → manifest 집계 + probe 상태 + 코드 조건으로 재구성), 소스 컴포넌트 메커니즘(computed style + 폭 스윕으로 역추론) | probe 0 여부 × authored 유무 × verifier 조건 |
| C. 런타임 의존 | 브라우저 실행 시에만 결정 | Swiper 슬라이드 폭·margin·wrapper transform(홈 콘텐츠 노드의 60–64%), hero `aspect-ratio` 인라인 값(JS가 씀), `width:fit-content` 텍스트 폭(폰트 메트릭 의존) | 라이브 스윕 + computed style 비교 |
| D. 상태 의존 | 시간/스크롤/상호작용 상태 | 캐러셀 autoplay 위치(transform −4320 vs −7200), AOS 애니메이션 transform, sticky 헤더 오프셋 | 캡처 시점 confound로 격리 |
| E. 외부 의존 | 사이트 밖 자원 | 웹폰트 메트릭(clone 텍스트 폭 1440에서 −4~−18px), 이미지 intrinsic 비율 | 폰트 차이는 tolerance로 흡수 |

## 2. 복구 가능성 레벨 (Phase E)

| Level | 내용 | 판정 | 근거 |
|---|---|---|---|
| 1 | width-family 외 기하(height, min-height, padding, inset, aspect-ratio)의 authored 선언 | AUTO RECOVERABLE | spec에 이미 있음(`authoredLayout`), 전혀 소비되지 않음. 실험 cloneA(authored 번역 + revert)로 service 데스크톱 TRACKED 35%→81% 실측 |
| 2 | 899/900 리마운트로 probe가 0이 된 973 노드의 폭 증거 | AUTO RECOVERABLE (관찰기 수정 필요) | 원인은 관찰기 stale handle(07 참조). 재관찰만 하면 소스 진실은 존재 |
| 3 | 텍스트/콘텐츠 크기(fit-content) 노드의 1440 truth 판정 | INFERABLE | 폰트 편차 12.9~18.1px가 4px gate를 넘어 "truth" 거부 유발(05 §4). 콘텐츠 크기 노드는 폭 대신 "폭 결정 방식(auto/fit-content)"으로 판정해야 함 |
| 4 | Swiper 슬라이드 폭/margin (`width:<viewport>px`, `233.333px; margin-right:50px`) | PARTIALLY RECOVERABLE (관계 모델 필요) | 값은 컨테이너 폭의 함수(slidesPerView, spaceBetween). 폭 스윕에서 관계 회귀는 가능하나 현재 파이프라인에는 "관계" 채널이 없음 |
| 5 | 캐러셀 transform/autoplay, AOS 진입 애니메이션 | REQUIRES RUNTIME PRESERVATION / NOT GENERICALLY RECOVERABLE | 시간 상태. 정적 CSS로는 한 순간만 재현. 동등한 런타임을 "구현"해야 하며 이는 복구가 아님(과업 범위 밖) |

## 3. 기술 한계 vs 구현 한계 vs 비용 한계

- 기술 한계(원리적으로 불가): Level 5. 캡처 순간의 transform은 소스도 매 순간 다르므로 "일치"라는 개념 자체가 없음.
- 구현 한계(현재 파이프라인에 채널이 없음): Level 2(관찰기 stale handle), Level 3(콘텐츠 크기 노드 판정), Level 4(관계 채널 부재), 그리고 노드별 offer/reject 사유 미저장(B등급 추론을 강제함).
- 비용 한계: 없음. 검증 렌더 10,939회/127폭에서 render-budget 거부 0, 수렴 true(manifest). 즉 실패는 예산 부족이 아니라 모델 부족.

## 4. 이번 조사가 열지 못한 증거

- 노드 단위 offer/reject 로그: `reconstruction-manifest.json`은 집계만 저장(`rejectedBy: {truth 397, interval-sample 61, co-damage 30}`). 개별 노드(n000050, n000071 등)의 거부 사유는 verifier 조건(`judgeOwnedGroupAtWidth`, `layout-truth-check.ts:3145-3189`)과 재현 렌더로 추정했다(MEDIUM-HIGH).
- Swiper 옵션(slidesPerView/spaceBetween/breakpoints): 소스 JS 번들 미분석. 폭 스윕에서 관측된 값으로만 관계를 기술.
