# 04. 반응형 일관성 지표와 첫 파손 관계 (RULE 4 / RULE 6)

도구: `tools/varmap.mjs` (소스에서 폭에 따라 4px 넘게 변하는 노드×축(w/h/x) 셀만 대상. 클론이 모든 폭에서 max(4px,2%) 이내면 TRACKED, 클론 값 범위가 2px 미만이면 FROZEN, 그 외 MISMATCH), `tools/aggregate.mjs` (부모→자식 순서로 최초 파손 관계 분류).

## 1. 기준선 (현재 클론)

| 페이지 / 트리 | 가변 셀 | TRACKED | FROZEN | MISMATCH |
|---|---|---|---|---|
| HOME desktop (900–2560, 7폭) | 1,323 | 26% | 55% | 19% |
| HOME mobile (390–899, 5폭) | 890 | 70% | 18% | 12% |
| SERVICE desktop (7폭) | 707 | 30% | 41% | 29% |
| SERVICE mobile (5폭) | 333 | 62% | 34% | 5% |

컴포넌트별 (desktop, 기준선):

| 컴포넌트 | HOME tracked/frozen/mismatch | SERVICE tracked/frozen/mismatch |
|---|---|---|
| header | 6 / 94 / 0 | 6 / 94 / 0 |
| hero | 0 / 100 / 0 | 0 / 90 / 10 |
| experience / introPaired | 100 / 0 / 0 | 15 / 50 / 35 |
| portfolioA / process | 5 / 95 / 0 | 4 / 54 / 42 |
| portfolioB / pricing | 11 / 89 / 0 | 12 / 42 / 47 |
| testimonials / discovery | 28 / 47 / 25 | 24 / 37 / 39 |
| — / remodelingCards | — | 2 / 59 / 40 |
| — / featureRow | — | 12 / 49 / 39 |
| bottomMedia | 50 / 50 / 0 | 50 / 50 / 0 |
| footer | 92 / 5 / 3 | 92 / 5 / 3 |

축별 규칙성(모든 행 공통): **h 축 TRACKED = 0**. 높이는 어느 컴포넌트에서도 반응하지 않는다(footer h 0/6/4, introPaired h 0/8/0 …). w 축은 소유된 컴포넌트에서만 추적되고, x 축은 w의 결과로 따라간다.

## 2. 첫 파손 관계 (aggregate, SERVICE desktop 900–2560)

| 컴포넌트 | 첫 파손 원인 상위 | 대표 노드 |
|---|---|---|
| header | X:frozen-inset(no-author) 10, W:frozen-width(not owned) 8 | n000008 `pos:sticky` 폭 1440 고정 (src 900/1024) |
| hero | H:frozen-height 8, X:frozen-inset[absolute][authored-%] 8, W:owned-yet-frozen 5 | n000050 폭 1439.98 / 높이 525.5 고정, n000053 오버레이 left 864 고정 |
| introPaired | W:owned-mismatch 10, H:frozen-height 8 | n000066 w148 vs 315 (@900), n000065 h504 vs 392 |
| process | X:drift 31, H:frozen 10, W 계열 23 | n000079 w349 vs 315 (@900) |
| pricing | H:frozen 8, X:drift 8, W:frozen(not owned) 6 | n000126 w285.6 vs 315 (@900 만) |
| discovery | X:drift 154, W:frozen(not owned) 24 | n000154 w1008 vs 630 (@900) |
| remodelingCards | X:frozen-inset 21, W:not-frozen(not owned) 16, W:frozen 8 | n000204 w1440 vs 900/1024/1200 |
| featureRow | W:frozen-width(not owned) 40, X:frozen-inset 20 | n000246 w288.2 vs 271 |
| bottomMedia / footer | H:frozen-height 8 / 13 | n000318 h579 vs 365(@900)…414(@1024) |

SERVICE mobile(599–899): hero `W:JS-inline` 5 (img n000026 인라인 `width:100%`가 replaced 제외로 390px 동결), process `W:JS-inline` 30 + img 동결 10 (Swiper), remodelingCards `W:JS-inline` 15 (`width:calc(100% - 40px)` 인라인), 모든 섹션 `H:frozen-height` 5 (min-height 바닥).

## 3. 해석

1. 파손의 첫 관계는 세 종류뿐이다: (a) 미소유 폭 동결(관찰 사각 또는 거부), (b) 높이/inset 동결(속성군 밖), (c) JS 인라인 값 동결. 소유된 폭이 스스로 틀린 경우(`owned-mismatch`)는 introPaired/process/pricing/footer에서만 나타나며 05 §3에서 원인이 자식 동결의 역전파임을 증명한다.
2. "split-brain"은 노드 간 분열이기 전에 **속성군 간 분열**이다. 같은 노드에서 width는 유동, height/inset/padding은 1440 px다. 컴포넌트 단위 분열은 그 위에 관찰 사각(973 노드)과 거부(488 노드)가 얹혀 생긴다.
3. 넓은 데스크톱(1600–2560)이 "허용 가능"해 보이는 이유는 동결된 1440px 상자가 뷰포트 안에 들어가기 때문이다(remodelingCards가 1920에서 중앙에 좁게 놓임). 900–1439에서는 같은 상자가 뷰포트를 넘쳐 관계가 눈에 띄게 끊긴다(n000204: x246+3×449 > 1024).
