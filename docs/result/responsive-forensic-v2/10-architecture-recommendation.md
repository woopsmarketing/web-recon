# 10. 근본 원인 순위와 아키텍처 권고 (Phase D / F)

## 1. 근본 원인 순위

| 순위 | 원인 | IMPACT | CONFIDENCE | GENERICITY | FIX LEVERAGE |
|---|---|---|---|---|---|
| 1 | **관찰기 stale handle**: 한 번 walk한 핸들을 폭 스윕 내내 재사용 → 리마운트 서브트리 973 노드(데스크톱 가시 노드의 16–50%)가 제안 불가 | HIGH (header, hero 슬라이드, remodelingCards, featureRow, service 섹션 루트) | HIGH | 매우 높음(useMediaQuery 류 사이트 전부) | 매우 높음, 저비용(폭마다 재walk/구조경로 재해석) |
| 2 | **속성군 분열**: width-family만 소유, height/min-height/img 높이/inset/padding/aspect-ratio/transform 동결. authored 선언은 있으나 미소비 | HIGH (모든 컴포넌트 h축 0% 추적; hero 폭까지 역산) | HIGH | 높음 | 높음(authored 번역 + revert, 실험으로 service 81% 확인) |
| 3 | **노드 독립 수락 모델**: 동결 baseline 위 단독 렌더 + 1440 4px truth gate → 콘텐츠 크기 노드가 폰트 편차로 거부 → 동결 자식 min-content 역전파로 소유된 부모 붕괴 | HIGH (service paired 3섹션, footer 일부; 거부 488건) | HIGH(역전파 실험) / MEDIUM-HIGH(거부 사유 추정) | 높음 | 높음(수락 단위를 서브트리로, 콘텐츠 크기 노드는 폭이 아니라 결정 방식으로 판정) |
| 4 | **JS 기하(Swiper)**: 값만 캡처, 관계 없음 | HIGH (홈 콘텐츠 노드 60–64%), service 6/31% | HIGH | 중간(캐러셀 사이트) | 중간(관계 채널 신설 필요; transform은 불가) |
| 5 | hero 높이·aspect-ratio 결합 | 홈 hero 116 노드 | HIGH | 중간 | 2번의 특수 사례 |
| 6 | replaced 요소 인라인 `width:100%` 미소비 | 모바일 트리 이미지 | HIGH | 높음 | 2번과 함께 |

## 2. Question A vs Question B

- A(속성 범위 부족): 참. 셀 기준 P0 상한 23%(폭계열 6/26), 실측 h축 0%.
- B(모델 입도 부족): 참, 그리고 A보다 근본적. 증거 — (i) cloneP: 소유된 부모가 정확해도 미소유 자식 하나로 붕괴(min-content 역전파는 CSS 레이아웃의 본질, 우회 불가); (ii) verifier는 "B 위 단독 렌더"로만 거부하므로, 정답 규칙이 이웃 동결 상태 때문에 거부되는 구조(false negative)를 내장; (iii) 수락 집합이 노드 혼합(소유/동결)으로 수렴하는 것이 split-brain의 정의 그 자체. 결론: **노드 단위 방출은 충분하지만, 노드 단위 독립 수락은 근본적으로 불충분**하다. 컴포넌트/서브트리 원자 계약이 필요하다.

## 3. 옵션 비교

| 옵션 | 내용 | 평가 |
|---|---|---|
| A. 노드 소유 확장(높이·inset 추가) | 속성군을 넓힘 | 2번만 해결. 3번(역전파·거부)과 1번은 그대로. 실험 cloneH가 데스크톱 +2pt에 그친 이유 |
| B. 컴포넌트 원자 계약 | 서브트리 단위로 authored 규칙 집합을 한 번에 수락/거부, 내부는 measured fallback | 3번 해결, 2번의 전제. 단독으로는 1번(입력 없음)과 4번(관계 없음) 미해결 |
| C. authored CSS 더 완전하게 보존 | 폭계열 밖 선언을 revert 기반으로 번역 | 2번 해결(service 81%). 단독이면 JS 인라인 값을 되돌려 홈 mismatch 51% |
| **D. 하이브리드 (권고)** | 1번 관찰기 수정 → C를 기본값으로 **서브트리 단위(B)** 수락 → JS 인라인 값은 measured/관계 fallback 유지 → 콘텐츠 크기 노드는 폭 대신 결정 방식으로 판정 | 실험으로 각 구성요소의 효과가 독립 확인됨. 4번 transform은 범위 밖으로 명시 |

## 4. P0 판정

**MIXED.** 방출 기반(토큰 분리 `:where(:not(.wr-ow-x))`, 노드 스코프 규칙, 900 authored-observed 스위치, 검증 렌더 인프라)은 CORRECT FOUNDATION이고 재사용해야 한다. 그러나 수락 모델(동결 baseline 위 노드 독립 판정, 폭계열 한정, 4px truth gate)은 일관성에 대해 WRONG FOUNDATION이며, 확장이 아니라 교체 대상이다. 관찰기 사각은 P0와 무관한 상류 결함으로 가장 먼저 닦아야 한다.

## 5. 충실도 상한 (예상, 실험 근거)

- CSS 결정 컴포넌트(service 전 섹션, 홈 experience/footer/bottom): 1+2+3 수정 시 ≈80–95% 셀 추적(cloneA 실측 81%, 관찰 사각 해제 시 header/cards 추가).
- JS 관계 컴포넌트(Swiper 슬라이드 폭): 관계 채널 추가 시 폭 추적 가능, transform은 영구 불일치(사람 눈에는 "다른 슬라이드가 보임" 수준).
- 소스 결함(featureRow 900–1355 오버플로)은 그대로 재현하는 것이 상한.

## 6. 비용/성능

- 현재: 검증 렌더 10,939회, 127폭, 12라운드, 예산 거부 0 → 실패는 예산이 아니라 모델. 관찰 페이지당 55–126초.
- 관찰기 재walk: 폭당 1회 walk 추가(ms 단위). 서브트리 단위 수락: 결정 단위가 노드(~600/페이지)에서 컴포넌트(~20/페이지)로 줄어 렌더 수는 감소 가능. authored 번역: CSS 바이트 증가(현재 5MB에 recovered tier 추가) — 노드 스코프 규칙 대신 authored 셀렉터 재사용으로 상쇄 가능.

## 7. 고치지 말 것 (마스킹)

- 노드별 height/min-height 패치, `wr-tx` 바닥 완화만 하기(데스크톱 +2pt).
- hero에 `height:auto` 핫픽스 또는 캐러셀 구현.
- 4px truth tolerance를 전역 상향(오답 규칙 수락).
- 사이트별 @media/override CSS, P1 착수.
- 넓은 데스크톱이 "허용"이라는 이유로 1440–2560만 검증하는 것(동결 상자가 뷰포트 안에 들어가서 숨는 구간).

## 8. 최소 다음 구현 범위 (이번에 구현하지 않음)

1. Observer: 폭마다 구조경로로 요소를 재해석(재walk) — 973 노드 사각 제거. 검증: `disconnected` 폭 불변 0, `no-interval-evidence` ≈ 0.
2. Verification: 수락 단위를 서브트리(컴포넌트 루트 = 소스에서 폭이 컨테이너 함수인 최상위 노드)로; 콘텐츠 크기 노드는 x/w 비교 대신 "폭 결정 방식 일치"로 판정; 노드별 offer/reject 사유를 아티팩트에 저장.
3. Emission: authored 선언 전 속성군을 revert 기반으로 번역, JS 인라인 값은 measured fallback 유지(하이브리드).
4. 별도 과업: Swiper 관계 모델(슬라이드 폭 = 컨테이너 폭 함수) — 채널 설계 후.
