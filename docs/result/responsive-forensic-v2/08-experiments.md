# 08. 브라우저 내 CSS 실험 (조사용, 앱에 기록하지 않음)

방법: `tools/snap.mjs`에 `INJECT_CSS`로 `page.addStyleTag` 주입 후 동일 스냅샷. 앱 파일은 변경하지 않았다.

| 라벨 | 주입 내용 | 파일 |
|---|---|---|
| cloneH | 높이 계열만 revert(`height/min-height` → authored 또는 auto) | `evidence/override/height-p00000{1,6}.css` |
| cloneA | spec의 authored 선언 전부를 노드 스코프 규칙으로 번역 + 동결 토큰 `revert` (JS 인라인 값 포함해 되돌림) | `evidence/override/authored-p00000{1,6}.css` (`tools/gen-override.mjs`) |
| cloneP | service introPaired/pricing의 미소유 자식 2개(n000071, n000140)만 `width:auto` | `evidence/override/paired-unfreeze-p000006.css` |

## 1. 데스크톱 트리 (1024,1200,1600,1920 / service는 +700 mobile 제외 5폭 동일 집합)

| 페이지 | 기준선 T/F/M | cloneH T/F/M | cloneA T/F/M |
|---|---|---|---|
| HOME (1,175 셀) | 21 / 75 / 4 | 23 / 65 / 12 | 28 / 21 / **51** |
| SERVICE (662 셀) | 35 / 42 / 23 | 36 / 38 / 26 | **81** / 9 / 10 |

SERVICE cloneA 컴포넌트별 TRACKED: pricing 100%, featureRow 98%, discovery 96%, remodelingCards 95%, footer 95%, introPaired 84%, hero 68%, process 32%(Swiper/JS 부분 mismatch 43%), header 9%(사각 노드는 authored도 없어 그대로).
HOME cloneA: hero 41% tracked(폭·높이 31/31 추적, x는 transform 상태로 mismatch 94), portfolioA/B mismatch 69/61%(JS 인라인 값을 되돌리면 틀린 값이 됨), experience 88, footer 95, bottomMedia 100.

## 2. 모바일 트리 (599,768,899)

| 페이지 | 기준선 | cloneH | cloneA |
|---|---|---|---|
| HOME (867 셀) | 72 / 17 / 10 | **86** / 4 / 11 | 24 / 12 / 63 |
| SERVICE (327 셀) | 63 / 32 / 5 | 65 / 30 / 6 | 64 / 6 / 30 |

HOME 모바일 cloneH: portfolioA 85→100%, portfolioB 82→99%, testimonials 72→98%(높이 바닥만 풀어도 카드 그리드가 맞음). cloneA는 Swiper 인라인 값을 되돌려 portfolio mismatch 81/73%.

## 3. 결론

1. 높이만 풀기(cloneH)는 데스크톱에서 거의 무효(+2pt). 폭이 동결/오소유인 상태에서 높이 해제는 마스킹이다. 단 모바일 트리처럼 폭이 이미 맞는 곳에서는 +14pt.
2. authored 번역(cloneA)은 **CSS로 결정되는 컴포넌트를 거의 전부 복구**(service 81%). 반대로 JS가 쓰는 값(Swiper 인라인)을 되돌리면 손실이므로, "authored 우선 + 측정값 fallback"의 **하이브리드**가 필요하다. 어느 쪽 단독도 답이 아니다.
3. cloneP: 미소유 자식 2개만 풀어도 두 섹션의 폭 관계가 3개 폭에서 정확히 복원 → 수락 단위가 노드가 아니라 서브트리여야 함을 직접 증명.
