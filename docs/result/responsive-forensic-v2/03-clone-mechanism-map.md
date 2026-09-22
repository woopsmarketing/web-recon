# 03. 클론(재구성) 메커니즘 맵 (Phase B)

대상: `.../2026-09-15T07-43-23-840Z/app` (`public/wr/generated-styles.css` 5,025,821 bytes; @media 44개 전부 900/899.98; `globals.css` variant 스위치).

## 1. 3계층 구조

| 계층 | 내용 | 수치 |
|---|---|---|
| exact tier | `.wr-stNNN` 토큰 = 1440(데스크톱)/390(모바일) computed px 동결 | 토큰 2,541 rules |
| owned tier (P0) | width-family 6속성(width/min-width/max-width/margin-left/margin-right/flex-basis)만 노드 스코프 규칙 `[data-wr-page][data-wr-viewport] [data-wr-node]`, 토큰은 `:where(:not(.wr-ow-x))`로 분리 | tokensSplit 813, rulesShipped 4,446, owned nodes 4,428/6,225 |
| relief | `wr-tx` = `height:auto; min-height:<frozen>` 바닥, `wr-sf` = `width:auto` | minHeightNodes 3,819 |

소유율(런타임 트리): 홈 데스크톱 373/670, 모바일 428/611; service 데스크톱 141/398, 모바일 248/351.

## 2. 미소유 사유 (manifest `layout.ownership`)

| 사유 | 수 | 의미 |
|---|---|---|
| no-interval-evidence | 973 | probe 배열이 전부 0 → 제안조차 안 됨. **관찰기 stale handle 버그**(07) |
| ambiguous | 336 | replaced-element-no-author-declaration 134, inline-runtime-responsive 112, css-wide-keyword 45, inline-unknown-varying 45, max-width unknown-varying 42, margin-right 13 |
| rejected: truth | 397 | 1440 truth 렌더에서 자기 박스 x/w 오차 > 4px (`OWNED_TRUTH_TOLERANCE_PX = 4`) |
| rejected: interval-sample | 61 | 샘플 폭에서 baseline보다 나빠짐 |
| rejected: co-damage | 30 | 자식/증인 손상 |
| node-not-in-layout | 960 | 레이아웃 외 노드 |

## 3. 컴포넌트별 클론 메커니즘 (RULE 3, 실측)

`tools/mechmap.mjs`/`mechtotals.mjs`: 노드×기하속성 셀을 OWNED-AUTH / OWNED-INIT / RECOVERED / FROZEN-wf-nonowned(폭계열인데 미소유) / FROZEN-authorAvail(authored 선언 있는데 동결) / FROZEN-noAuthor / FROZEN-JS 로 분류.

| 페이지/컴포넌트 | owned/nodes | OWNED 합 | FROZEN-wf-nonowned | FROZEN-authorAvail | FROZEN-noAuthor |
|---|---|---|---|---|---|
| home/desktop/header | 2/28 | 1.6% | 21.2% | 10.7% | 66.2% |
| home/desktop/hero | 19/116 | 3.8% | 18.9% | 5.6% | 71.3% |
| home/desktop/experience | 7/17 | 9.5% | 12.9% | 5.7% | 71.3% |
| home/desktop/portfolioA | 164/194 | 19.5% | 3.3% | 3.7% | 72.9% |
| home/desktop/testimonials | 14/72 | 4.5% | 18.4% | 4.6% | 72.1% |
| home/desktop/footer | 79/116 | 15.7% | 7.3% | 7.9% | 69.0% |
| service/desktop/introPaired | 7/10 | 16.2% | 6.5% | 4.2% | 72.7% |
| service/desktop/process | 7/42 | 3.8% | 19.0% | 8.4% | 68.5% |
| service/desktop/pricing | 13/20 | 15.0% | 8.1% | 6.3% | 70.6% |
| service/desktop/remodelingCards | 0/26 | 0.0% | 21.9% | 1.9% | 75.0% |
| service/desktop/featureRow | 2/57 | 0.8% | 22.3% | 3.6% | 73.3% |

읽는 법: 어떤 컴포넌트든 셀의 **약 70%는 폭계열 밖의 기하(height/min-height/padding/inset/transform 등)이며 전부 동결**이다. OWNED 비율은 최대 ~20%(폭계열 6속성의 상한 = 6/26 ≈ 23%). 즉 P0가 완벽히 성공해도 셀 기준 상한은 23%다. 여기에 컴포넌트에 따라 폭계열조차 미소유(header/hero/process/remodelingCards/featureRow 19–22%)가 겹친다.

## 4. 클론 컴포넌트 분류

| 컴포넌트 | 클론에서 실제 동작 | 분류 |
|---|---|---|
| HOME Hero | 컨테이너 `aspect-ratio:1.76/1` 토큰 + `height:818.172px` 동결 → 폭이 높이에서 역산되어 모든 폭에서 1439.97px; 슬라이드 인라인 px 동결; wrapper transform 동결 | FROZEN(JS_GEOMETRY 상실) |
| HOME Experience | 폭 소유 + 텍스트 흐름 | CENTERED_CAPPED (정상) |
| HOME Portfolio A/B | 카드 폭 소유(%)되나 슬라이드 px/transform 동결 | JS_GEOMETRY 상실 |
| HOME Footer | 폭 소유, 높이 동결(min-height 바닥) | FLEX_FLUID (폭만) |
| SERVICE Intro/Pricing/Process | 행·컬럼 폭 소유(`width:auto; flex-basis:0%`) 정확. 그러나 미소유 자식(스페이서/텍스트 컬럼) 동결 px가 min-content로 역전파 → 50/50 붕괴; 높이 동결 | FLEX_FLUID 가 자식 동결로 파손 |
| SERVICE Remodeling cards | 루트 n000204 probe 0 → 미소유 → 1440px 동결 → 1024에서 뷰포트 초과 | FROZEN(관찰 사각) |
| SERVICE Feature row | 컨테이너 소유, 5 아이템 probe 0 → 동결 min-content 288px | FROZEN 부분 |
| SERVICE Bottom media / Footer | 폭 정상, 높이 동결 | FULL_BLEED / FLEX_FLUID (폭만) |
| 모바일 트리(600–899) | 폭 70% 추적, 이미지 px 높이·min-height 바닥 동결 → 섹션 높이 오류; hero img `width:100%` 인라인이 replaced 제외로 390px 동결 | 폭만 반응 |
