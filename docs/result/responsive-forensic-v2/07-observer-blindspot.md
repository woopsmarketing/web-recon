# 07. 관찰 사각: 973 노드의 probe 0 원인 (HIGH)

하위 에이전트(read-only) 조사 결과를 검증·요약. 도구: `tools/agent-analyze-probe.mjs`.

## 1. 사실

- p000001 desktop: 가시 583 노드 중 146(25%)의 probe가 **1440 포함 모든 폭에서** `x=0,w=0,v=0,s=-1`. p000006: 177/354(50%). 8페이지 합 973 = manifest `notOfferedByReason.no-interval-evidence` 973.
- 원본 관찰 아티팩트(`site-observations/2026-09-15T05-10-38-532Z/pages/p000001/layout-probe.json`)에 이미 존재: `disconnected`가 15개 폭 모두 **195**로 동일, 0-행 인덱스 집합이 폭 간 바이트 동일(8페이지 전부 `zeroSetIdenticalAcrossAllWidths=true`).
- SiteSpec 컴파일은 passthrough(`src/sitespec/compile-page.ts:487-491`), 새로 0을 만들지 않음. `aligned:true, alignmentRatio 1`은 태그/부모 구조 정렬만 증명(`compile-page.ts:520`), 기하의 유효성은 말하지 않는다.
- 모바일 probe(`layout-probe-mobile.json`)는 거울상: 390–899에서 disconnected 0, **900에서 136으로 점프**. 모바일 truth(390)는 첫 폭이라 영향이 없고, 데스크톱 truth(1440)는 12번째 폭이라 영향을 받는다.

## 2. 코드 경로

- `src/observer/layout-probe.ts:1206` — DOM을 **한 번** walk(`page.evaluate(walkInBrowser…)`), 요소 핸들을 보관.
- `:1215-1218` — `for (const width of widths)` 리사이즈 후 **같은 핸들**을 재측정. 재walk 없음. `LAYOUT_PROBE_WIDTHS`는 390부터 시작(데스크톱 프로필 1440에서 walk → 390으로 리사이즈).
- `:817-819` — `if (!el.isConnected) { disconnected++; x.push(0); w.push(0); v.push(0); s.push(-1); }` 무조건 0.
- 사이트는 899/900에서 `useMediaQuery`로 서브트리를 리마운트(probe 자체의 `familySwitchBisections[0]` = 899/900, elements 611→670). 1440에서 walk된 데스크톱 전용 요소는 390으로 리사이즈되는 순간 detach되고, 1440으로 돌아와도 **새 DOM 노드**가 만들어지므로 옛 핸들은 영원히 disconnected.

## 3. 공통 서명

- header inner n000008(sticky, `.css-1xoxi4k`; 부모 n000007은 전 폭 유효), Swiper 슬라이드 내부(`.swiper-slide` 하위), service 섹션 루트 n000062/70/77/97/99/122, remodelingCards n000204 서브트리, featureRow 아이템, testimonials 버튼. 태그는 div/button/img/span/p/video 혼재 → "특정 CSS 규칙"이 아니라 "리마운트되는 컴포넌트"가 서명.
- AOS/opacity/visibility 휴리스틱은 원인이 아님(서명 없음).

## 4. 영향

- 973 노드는 제안조차 되지 않아 1440(또는 390) 값으로 동결된다. header 900–1199 파손, remodelingCards 900–1439 오버플로, hero 슬라이드 내부, featureRow 아이템이 여기서 나온다.
- 일반성: breakpoint에서 DOM을 교체하는 모든 React/Vue 반응형 사이트에서 재현된다(useMediaQuery, CSS-in-JS 조건 렌더). web-recon이 대상으로 삼는 사이트군의 대다수.

## 5. 판정

- 분류: NOT_CAPTURED (관찰 단계 손실). 소스 진실은 존재하며 재관찰만으로 A등급 복구 가능.
- 신뢰도: HIGH (코드 + 원본 아티팩트 + probe 자체의 bisector + 모바일 거울상, 4개 독립 증거). 미확인: 라이브 재관찰로 재현하지는 않았음(아티팩트 기반). 하위 에이전트 재집계 971 vs manifest 973(2건 차이, 판정에 무관).
