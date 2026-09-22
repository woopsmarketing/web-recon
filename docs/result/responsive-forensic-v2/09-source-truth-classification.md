# 09. 소스 진실 분류 (RULE 9, 필수)

| 정보 | 분류 | 근거 / 위치 |
|---|---|---|
| 데스크톱/모바일 DOM 스위치 900 | AVAILABLE_AND_USED | probe bisector 899/900 → `responsive.byPageId` → `globals.css` @media 900 (44개 전부) |
| 폭계열 authored 선언 (width/min/max-width/margin/flex-basis) | AVAILABLE_AND_USED (소유 4,428 노드) | plan.ts → owned tier |
| 폭계열 밖 authored 선언 (height, min-height, padding, top/left/right, aspect-ratio, transform) — 3,152 선언의 83% | **AVAILABLE_BUT_NOT_CONSUMED** | spec `authoredLayout`에 존재, recovered tier는 폭계열 + display 8건만 방출. 실험 cloneA로 소비 시 service 81% 추적 |
| 텍스트/콘텐츠 크기 노드의 `width:auto` 제안 (예: n000071, n000140) | **AVAILABLE_BUT_REJECTED** | 4px truth gate + 폰트 편차(12.9–18.1px)로 `truth` 거부(397건 바구니). 거부가 컴포넌트 전체를 무너뜨림(05 §3) |
| hero 컨테이너 `width:100%` + `aspect-ratio` | AVAILABLE_BUT_REJECTED / 무력화 | manifest residualFrozenNodes n000050/51/52 "emitted-full-width"; 토큰의 동결 `height`가 폭을 역산 |
| 899/900 리마운트 서브트리의 폭 증거 (973 노드) | **NOT_CAPTURED** | 관찰기 stale handle (07). 소스에는 존재 |
| img/video 인라인 `width:100%` (replaced) | AVAILABLE_BUT_NOT_CONSUMED | `REPLACED_OR_INTRINSIC_TAGS` 제외, ambiguous 134건 |
| Swiper 슬라이드 인라인 폭/margin 값 | CAPTURED_BUT_AMBIGUOUS | inline provenance `inline-runtime-responsive` 112 / `inline-unknown-varying` 45 → 제안 없음. 값은 있으나 관계(=컨테이너 폭 함수)는 미기록 |
| Swiper wrapper transform, autoplay 위치 | NOT_STATICALLY_EXISTENT | 시간 상태 |
| AOS 진입 transform (`translate3d(0,100px,0)` → none) | CAPTURED_BUT_AMBIGUOUS | authored 두 규칙 모두 spec에 있음(`[data-aos]` 계열), 상태 전이는 미기록 |
| 웹폰트 메트릭 | EXTERNAL_DEPENDENCY | 클론 텍스트 폭 −4~−18px @1440; truth gate 거부의 직접 원인 |
| 노드별 offer/reject 사유 | NOT_CAPTURED (파이프라인 자체 정보) | manifest 집계만 저장. 재구성 분석 자체를 B등급으로 떨어뜨림 |
