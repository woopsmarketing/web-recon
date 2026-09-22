# 02. 소스(라이브) 반응형 메커니즘 맵 (Phase A)

측정: 라이브 사이트를 390,599,600,700,768,899,900,901,1024,1100,1200,1440,1600,1920,2560에서 스냅샷(`evidence/snap/source-{home,service}-<w>.json`, 구조 경로 child-index 기준 1:1 정렬).

## 1. 사이트 전역 메커니즘

| 항목 | 사실 | 등급 |
|---|---|---|
| 스택 | Next.js pages router + MUI/emotion(CSS-in-JS, `.css-xxxx` 클래스) + Swiper + AOS | A |
| 뷰포트 분기 | `useMediaQuery` 기반 **이중 DOM**: 899 이하 모바일 트리, 900 이상 데스크톱 트리(단일 스위치) | A (probe `familySwitchBisections` 899/900 수렴) |
| authored @media | 600/900/1200/1536 (MUI Grid item) — 가시 효과 사실상 없음(스윕에서 b−1/b/b+1 기하 연속) | A/측정 |
| 폭 단위 | %, vw, flex `1 1 0%`, `max-width` 캡(1500/1920px), `calc(100% - 40px)` | A |
| 높이 단위 | `aspect-ratio`(인라인, JS 설정: 홈 hero 1.76/1, service hero 2.74/1), 이미지 intrinsic, 텍스트 흐름, 고정 px 스페이서(50/80px) | A/C |
| 위치 | hero 오버레이 `top:15.5vw; left:60%`, 상대 inset `top:max(122px - 4.5vw, 0px)`(pricing) | A |
| JS 기하 | Swiper: 슬라이드 인라인 `width:<px>; margin-right:<px>`, wrapper `transform: translate3d(...)`(시간 가변) | C/D |

핵심: 소스의 "일관성"은 **컴포넌트 단위 관계**에서 온다 — 컨테이너 폭(%/max-width) → flex 균등 분배(`flex:1 1 0%`) → 콘텐츠 흐름 높이 → 자식 이미지 `width:100%`+`aspect-ratio`/`object-fit`. 어떤 노드도 px 폭을 "가지고" 있지 않다(스페이서와 버튼 제외).

## 2. 컴포넌트별 분류 (RULE 3)

### HOME
| 컴포넌트 | 소스 메커니즘 | 분류 |
|---|---|---|
| Hero (n000050) | 컨테이너 `width:100%` + 인라인 `aspect-ratio:1.76/1`(JS) → 높이 유도; Swiper 슬라이드 폭 = 뷰포트 px(JS); 오버레이 absolute `top:15.5vw; left:60%` | JS_GEOMETRY + ABSOLUTE_WITH_RESPONSIVE_CONTAINER (MIXED) |
| Experience (n000168) | 중앙 정렬 캡 컨테이너, 텍스트 흐름 | CENTERED_CAPPED |
| Portfolio A (n000189) | Swiper 4-up: 슬라이드 `width:233.333px; margin-right:50px`(JS), 카드 이미지 `width:100%` | JS_GEOMETRY |
| Portfolio B (n000415) | Swiper 동일 | JS_GEOMETRY |
| Testimonials (n000527) | Swiper + 버튼 `width:35px`, 인라인 `width:374.667px`(JS) | JS_GEOMETRY (MIXED) |
| Bottom media (n000620) | full-bleed, 높이 콘텐츠 흐름 | FULL_BLEED |
| Footer (n000622) | flex 행 + 고정 폭 컬럼(270/100px) + 유동 컬럼 | FLEX_FLUID |

### SERVICE
| 컴포넌트 | 소스 메커니즘 | 분류 |
|---|---|---|
| Hero (n000050) | `aspect-ratio:2.74/1` 인라인, 오버레이 absolute `left:60%` 계열 | ABSOLUTE_WITH_RESPONSIVE_CONTAINER |
| Intro paired (n000065) | 2컬럼 flex, 양쪽 `flex:1 1 0%` → 항상 50/50; 왼쪽 video `width:100%`, 오른쪽 80px 스페이서 + column flex 텍스트 | FLEX_FLUID |
| Process (n000078) | 2컬럼 flex 50/50 + 우측 Swiper(모바일) / 이미지 | FLEX_FLUID + JS(모바일) |
| Pricing (n000125) | 2컬럼 flex 50/50, 좌측 `position:relative; top:max(122px-4.5vw,0)` | FLEX_FLUID |
| Discovery/gallery (n000151) | 중앙 캡 컨테이너, 텍스트 + 갤러리 | CENTERED_CAPPED |
| Remodeling cards (n000204) | `display:flex; padding:0 40px`, 카드 `max-width:33%`, 50px 스페이서 → 3카드 균등 | FLEX_FLUID |
| Feature/icon row (n000244) | `max-width:1500px` 캡 + 5개 `flex:1 1 0%` 아이템(각 min-content 271px) | CENTERED_CAPPED + FLEX_FLUID |
| Bottom media (n000318) | full-bleed | FULL_BLEED |
| Footer (n000320) | 홈과 동일 | FLEX_FLUID |

주의: Feature row는 소스 자체가 900–1355px에서 가로 오버플로(5×271 > 뷰포트). 클론이 이보다 잘 보일 필요는 없고, 재현 상한은 소스 결함을 포함한다.

## 3. STACK_AT_BREAKPOINT 부재

소스에는 "중간 폭에서 2컬럼→1컬럼" 같은 CSS 스택 규칙이 없다. 유일한 분기는 899/900의 DOM 교체다. 따라서 900–1439 구간에서 소스는 순수 비율 축소(flex/%/vw)로만 동작한다. 클론의 중간 폭 파손은 이 축소 관계가 끊긴 결과이지 누락된 breakpoint 때문이 아니다.
