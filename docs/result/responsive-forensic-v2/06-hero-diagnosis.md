# 06. Hero 별도 진단 (RULE 8)

## 1. 구조 (HOME n000050, SERVICE n000050)

| 부분 | 소스 | 클론 | 상태 |
|---|---|---|---|
| 외부 컨테이너 | `width:100%`, 인라인 `aspect-ratio:1.76/1`(홈, JS 설정) / `2.74/1`(service) → 높이 = 폭/비율 | 토큰에 `aspect-ratio:1.76/1` **과** `height:818.172px` 동결이 동시에 존재 → 브라우저가 폭을 높이×비율로 역산 = 1439.97px, 모든 폭에서 | CSS(높이 동결) — 소유 규칙 `width:auto`(fallback)도 무력화 |
| 슬라이드 트랙(wrapper) | `transform: translate3d(-N×vw…)` 시간 가변 | 캡처 순간 값 동결(−7200 vs 라이브 −4320) | 시간 상태(D) |
| 슬라이드 | 인라인 `width:<viewport>px`(JS) | 인라인 px 동결, 슬라이드마다 다른 recovered 규칙(비일관) | JS(C), inline-runtime-responsive → ambiguous |
| 슬라이드 내부(n000055/64/73 …) | 이미지/텍스트 | probe 전부 0(사각) → 미소유, 1440 동결 | 관찰 사각 |
| 오버레이 | absolute `top:15.5vw; left:60%`(홈), service n000053 `left` % | 토큰 `left:864px; top:172.8px` 동결(authored-% 존재, 미소비) | 속성군 밖 |
| 페이저/화살표 | absolute, 컨테이너 기준 | inset px 동결 | 속성군 밖 |
| autoplay/resize 핸들러 | Swiper 런타임 | 없음 | NOT_STATICALLY_EXISTENT |

## 2. 원인 분리 (1–4)

1. **CSS 원인 — 높이/aspect-ratio 결합(HIGH)**: 토큰이 `aspect-ratio`와 동결 `height`를 함께 실어 폭이 높이로부터 결정된다. manifest `residualFrozenNodes`에 n000050/51/52가 "emitted-full-width"로 남은 이유. 소유 계획(width:100%)이 있었더라도 `height` 고정이 있는 한 폭은 1439.97이다. 실험 cloneA(authored 번역 + `height:revert`)에서 service hero w/h가 TRACKED(68%)로 바뀜 → 이 결합만 풀면 컨테이너는 반응한다.
2. **JS 원인 — 슬라이드 폭(HIGH)**: 슬라이드 폭은 Swiper가 매 resize에 쓰는 값. 정적 CSS에서는 `width:100%`(컨테이너 대비)로 번역 가능하지만 현재 파이프라인은 인라인 런타임 값을 ambiguous로 폐기한다.
3. **시간 상태 원인(HIGH, 복구 불가)**: wrapper transform은 캡처 순간의 autoplay 위치. 소스와 클론의 비교에서 −4320 vs −7200은 confound이지 결함이 아니다.
4. **관찰 사각 원인(HIGH)**: 슬라이드 내부 노드는 899/900 리마운트로 probe가 0 → 제안 불가.

## 3. 홈 hero가 "캡처 데스크톱/캐러셀 기하에 묶인" 이유의 최종 서술

폭: 컨테이너가 높이(818px)×1.76으로 역산되어 1440 고정 → 자식 `width:100%` 소유 규칙이 1440을 상속 → 슬라이드 px 동결과 우연히 일치 → 모든 폭에서 1440 폭 캐러셀이 뷰포트를 넘치거나(<1440) 남는다(>1440). 오버레이는 px inset. 즉 **한 노드(n000050)의 두 속성(height + aspect-ratio)** 이 hero 서브트리 116 노드를 1440에 고정하는 단일 지렛대다.

## 4. 모바일 hero (390–899)

- service: img n000026 인라인 `width:100%` → replaced 제외 → 390px 동결(599–899에서 뷰포트 미달). 오버레이 n000027 authored-px inset은 정확히 동결되어 소스와 일치(오버레이 자체는 px 설계).
- home: 슬라이드 transform 상태 mismatch 65%(x축), 폭 16/17 추적/동결.

## 5. 결론

Hero는 단일 원인이 아니다: (1) 컨테이너 높이·비율 결합(CSS, 복구 가능), (2) 슬라이드 폭 JS(관계 모델 필요), (3) transform 시간 상태(복구 불가, 런타임 보존 필요), (4) 슬라이드 내부 관찰 사각(관찰기 수정). (1)+(4)를 풀면 컨테이너/오버레이/페이저는 반응하고, 슬라이드는 (2)의 관계(폭 = 컨테이너 폭) 없이는 정적으로도 맞지 않는다. 캐러셀 "구현"은 이 조사의 범위 밖이며 권고하지 않는다.
