# 05. 출처 추적 (Phase C / RULE 5)

체인: SOURCE → Observer(probe/authoredLayout/inline provenance) → SiteSpec → ResponsiveDecl(plan) → ownership offer → verification → accept/reject → tier → CSS → browser.

## 1. HOME — 정상 섹션: Experience (n000168, CENTERED_CAPPED)

- SOURCE: 중앙 캡 컨테이너 + 텍스트 흐름, 폭 = min(100%, cap).
- Observer: probe 유효(15폭 전부 v=1), authored `max-width`/margin 선언 존재.
- plan: width-family 제안(provenance `initial`/`authored-sheet`).
- verification: 1440 truth 통과, 샘플 통과 → 7/17 노드 소유(나머지는 텍스트 leaf).
- CSS: `[data-wr-node=…]{width:auto; max-width:…; margin-left:auto; margin-right:auto}` + 토큰 분리.
- browser: 7폭 전부 TRACKED 100%(w 2/2, x 14/14). 높이는 텍스트 흐름이라 동결이 드러나지 않음.
- 결론: 폭계열만으로 충분한 컴포넌트 유형(콘텐츠 높이가 텍스트 흐름) — P0가 설계대로 동작.

## 2. HOME — 파손 섹션: Portfolio A (n000189, Swiper 4-up)

- SOURCE: 슬라이드 인라인 `width:233.333px; margin-right:50px`(JS, 컨테이너 폭의 함수), wrapper `transform: translate3d(…)`(시간 가변).
- Observer: inline provenance `inline-runtime-responsive`(112) / `inline-unknown-varying`(45)로 분류 → **ambiguous → 제안 안 됨**(plan.ts `noAuthorPiece`, 인라인 런타임 값은 author 선언이 아님).
- SiteSpec: 값은 캡처됨(CAPTURED_BUT_AMBIGUOUS). 관계(폭 = f(컨테이너))는 어디에도 없음.
- CSS: 토큰에 1440 시점 px 동결(`width:233.333px`), transform 동결.
- browser: w 14/162/0, x 7/149/0 → 95% FROZEN. cloneA(authored revert) 실험에서는 인라인 값이 되돌려져 MISMATCH 69%로 바뀔 뿐 추적되지 않음 → 정적 CSS로는 복구 불가, 관계 채널 필요.
- 손실 단계: Observer(관계 미기록) + plan(ambiguous). 정보는 "값"만 있고 "함수"가 없다.

## 3. SERVICE — 파손 1: Intro paired (n000065) 와 Pricing (n000125): 소유가 옳은데 자식 동결로 붕괴

체인(1024 기준, `evidence/snap/*-service-1024.json`):

| 노드 | 역할 | 소유 | src w | clone w | 규칙 |
|---|---|---|---|---|---|
| n000065 | 행(flex) | OWNED | 716.8 | 716.8 | width:auto |
| n000066 | 좌 video 컬럼 `flex:1 1 0%` | OWNED | 358.4 | **235.0** | width:auto; flex-basis:0% (정확) |
| n000069 | 우 텍스트 컬럼 `flex:1 1 0%` | OWNED | 358.4 | **481.8** | width:auto; flex-basis:0% (정확) |
| n000070 | 80px 스페이서 (authored `width:80px`) | 미소유 (probe 전부 0) | 59.5 | 80 | 토큰 80px |
| n000071 | 텍스트 column flex | 미소유 (probe 유효, 규칙 `max-width:100%`만, `wr-ow-w` 없음) | 298.9 | **401.8** | 토큰 401.766px 동결 |

메커니즘: n000069는 `min-width:auto`(flex item 자동 최소 = 콘텐츠 min-content). 자식 n000070(80) + n000071(401.77 동결) = 481.77 = 클론 n000069 폭. 즉 **동결된 자식 하나의 px가 min-content로 부모에 역전파되어, 정확히 소유된 부모의 50/50 분배를 모든 폭(900/1024/1200)에서 파괴**한다. 1920에서는 672 ≥ 481.8이라 우연히 맞는다.

증명 실험(`evidence/override/paired-unfreeze-p000006.css`, n000071/n000140에 `width:auto`만 주입):

| 폭 | n000066 src / clone / 실험 | n000069 src / clone / 실험 | pricing n000126 src / clone / 실험 |
|---|---|---|---|
| 900 | 315 / 148.2 / **315** | 315 / 481.8 / **315** | 315 / 285.6 / **315** |
| 1024 | 358.4 / 235.0 / **358.4** | 358.4 / 481.8 / **358.4** | 358.4 / 358.4 / 358.4 |
| 1200 | 420 / 358.2 / **420** | 420 / 481.8 / **420** | 420 / 420 / 420 |

두 노드를 풀자 두 섹션의 폭 관계가 세 폭 모두 소스와 일치했다(높이는 여전히 504 동결).

### 3-1. n000071은 왜 미소유인가 (B등급 추론, MEDIUM-HIGH)

- probe 유효(w 257→401 가변), authored는 `display:flex; flex-direction:column`뿐 → plan은 `width:auto`(initial) 제안 → 제안됨(nodePlansOffered).
- verifier `judgeOwnedGroupAtWidth` (`layout-truth-check.ts:3145-3160`): truth 폭 1440에서 자기 x/w 오차 > 4px(`OWNED_TRUTH_TOLERANCE_PX = 4`)이면 `reason:"truth"` 거부. 거부는 반드시 "B(수락 집합) 위에 단독 렌더"에서만 나온다(`:3395-3510`, `Judged ALONE against B`).
- 재현: 클론 1440에서 n000071에 `width:auto`를 단독 적용하면 폭 **383.7** (truth 401.8, 오차 **18.1px**). n000140도 251.5 vs 264.4(**12.9px**). 둘 다 4px gate 초과.
- 원인: n000071의 소스 폭은 자기 CSS가 아니라 **텍스트의 fit-content 폭**(폰트 메트릭)이다. 클론 텍스트 폭은 1440에서 −4~−18px(폰트 confound, 앞서 확인). 즉 페인트 수준 차이(폰트)가 4px 구조 gate를 통해 **구조 거부**로 변환되고, 그 한 노드의 동결이 컴포넌트 전체 비율을 무너뜨린다.
- manifest에서 가장 큰 거부 바구니가 `truth 397`이며, 미소유·probe 유효 노드 census(`tools/nonowned-census.mjs`)는 p000001 64개 중 텍스트 `p` 15 + 무선언 div 12 + JS 인라인 div 29, p000006 36개 중 `p` 13 + 무선언 div 14로, 콘텐츠 크기 노드가 주류다.

## 4. SERVICE — 파손 2: Remodeling cards (n000204) — 관찰 사각 서브트리

- SOURCE: `display:flex; padding:0 40px`, 카드 `max-width:33%`, 스페이서 50px → 폭 900/1024/1200/1920에서 카드 270/311/369/607.
- Observer: n000204, n000205, 카드 내부 전부 probe `[0,…]`(v 전부 0) — 07의 stale handle 사각.
- plan: `no-interval-evidence` → 제안 없음. n000205는 authored-intent fallback으로 `max-width:33%; width:auto`가 나왔지만 부모가 1440 동결이라 33%×1440.
- CSS/browser: n000204 `width:1440px` 동결 → 1024에서 x246+3×449 → 뷰포트 초과(가로 스크롤/잘림), 1920에서는 1440 상자가 중앙에 좁게 놓임(사람 눈에 "허용").
- 손실 단계: Observer. 소스 진실은 존재(NOT_CAPTURED이지만 재관찰로 A등급 복구 가능).

같은 사각에 든 것: header inner n000008(sticky, 900–1199에서 1440 폭), hero 슬라이드 서브트리 n000055/64/73, service n000062/70/77/97/99/122, featureRow 5개 아이템(n000246…), testimonials 버튼 n000536.

## 5. HOME — Hero (n000050): 06 참조.

## 6. 모바일 트리(600–899) 높이 체인

- SOURCE: 이미지 `width:100%` + intrinsic 비율 → 높이 = 폭 × 비율; 섹션 높이 = 콘텐츠 흐름.
- Observer/plan: img는 `REPLACED_OR_INTRINSIC_TAGS`로 제외(plan.ts:74, 788 `replaced-element-no-author-declaration` 134건) → 인라인 `width:100%`가 있어도 제안 없음(AVAILABLE_BUT_NOT_CONSUMED). 높이는 속성군 밖.
- CSS: img `width:390px; height:<px>` 동결, 부모 `wr-tx` `min-height:<390 높이>`.
- browser: service mobile hero img n000026 w390 vs src 599–899; 모든 섹션 `H:frozen-height`(bottomMedia 508 vs 769@599, footer 1018 vs 996). 폭은 70% 추적되지만 높이가 390 시점에 고정되어 섹션 간 간격·이미지 비율이 어긋난다.
- 손실 단계: plan(replaced 제외) + 속성군 범위.
